/**
 * MCP Stdio-WebSocket Adapter
 *
 * Bridges Claude Agent SDK's stdio-based MCP protocol with our
 * Bridge plugin's WebSocket server.
 *
 * The adapter is spawned as a subprocess by the Agent SDK. It receives MCP
 * JSON-RPC messages on stdin and forwards them to the Bridge WebSocket,
 * then sends responses back on stdout.
 */

import { EventEmitter } from 'events'
import type { Readable, Writable } from 'stream'
import WebSocket from 'ws'

// WebSocket readyState constants (use numeric values to work with mocks)
const WS_OPEN = 1

export interface McpWsAdapterOptions {
  /** Port for WebSocket connection (default: 22360) */
  port?: number
  /** Host for WebSocket connection (default: localhost) */
  host?: string
  /** Connection timeout in milliseconds */
  connectionTimeout?: number
  /** Input stream (default: process.stdin) */
  stdin?: Readable
  /** Output stream (default: process.stdout) */
  stdout?: Writable
  /** Enable automatic reconnection (default: false) */
  reconnect?: boolean
  /** Delay between reconnection attempts in ms (default: 1000) */
  reconnectDelay?: number
  /** Maximum number of reconnection attempts (default: 3) */
  maxReconnectAttempts?: number
}

export interface McpWsAdapterEvents {
  connected: () => void
  reconnected: () => void
  close: () => void
  exit: (code: number) => void
  error: (error: Error) => void
  parseError: (error: Error) => void
}

export class McpWsAdapter extends EventEmitter {
  private readonly port: number
  private readonly host: string
  private readonly connectionTimeout: number
  private readonly stdin: Readable
  private readonly stdout: Writable
  private readonly reconnectEnabled: boolean
  private readonly reconnectDelay: number
  private readonly maxReconnectAttempts: number

  private ws: WebSocket | null = null
  private connected = false
  private stopped = false
  private reconnectAttempts = 0
  private reconnecting = false
  private inputBuffer = ''
  private messageQueue: string[] = []

  constructor(options: McpWsAdapterOptions = {}) {
    super()
    this.port = options.port ?? 22360
    this.host = options.host ?? 'localhost'
    this.connectionTimeout = options.connectionTimeout ?? 30000
    this.stdin = options.stdin ?? process.stdin
    this.stdout = options.stdout ?? process.stdout
    this.reconnectEnabled = options.reconnect ?? false
    this.reconnectDelay = options.reconnectDelay ?? 1000
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 3
  }

  /**
   * Start the adapter - connect to WebSocket and setup stdin/stdout handlers
   */
  async start(): Promise<void> {
    this.stopped = false
    await this.connect()
    this.setupStdinHandler()
  }

  /**
   * Stop the adapter - close WebSocket and cleanup
   */
  stop(): void {
    this.stopped = true
    this.connected = false
    this.reconnecting = false

    if (this.ws) {
      this.ws.terminate()
      this.ws = null
    }

    this.emit('close')
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WS_OPEN
  }

  /**
   * Handle process signals for graceful shutdown
   */
  handleSignal(signal: 'SIGTERM' | 'SIGINT'): void {
    this.stop()
    this.emit('exit', 0)
  }

  /**
   * Connect to the WebSocket server
   */
  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `ws://${this.host}:${this.port}`
      this.ws = new WebSocket(url)

      // Setup connection timeout
      const timeoutId = setTimeout(() => {
        if (this.ws && this.ws.readyState !== WS_OPEN) {
          this.ws.terminate()
          reject(new Error('Connection timeout'))
        }
      }, this.connectionTimeout)

      this.ws.on('open', () => {
        clearTimeout(timeoutId)
        this.connected = true
        this.reconnectAttempts = 0

        if (this.reconnecting) {
          this.reconnecting = false
          this.emit('reconnected')
        } else {
          this.emit('connected')
        }

        // Send queued messages
        this.flushMessageQueue()
        resolve()
      })

      this.ws.on('error', (error) => {
        clearTimeout(timeoutId)
        this.connected = false

        if (this.reconnecting) {
          this.handleReconnect()
        } else if (!this.stopped) {
          reject(error)
        }
      })

      this.ws.on('close', (code, reason) => {
        clearTimeout(timeoutId)
        this.connected = false

        if (this.stopped) {
          return
        }

        if (this.reconnectEnabled && !this.reconnecting) {
          this.handleReconnect()
        } else if (!this.reconnecting) {
          const exitCode = code === 1000 ? 0 : 1
          this.emit('close')
          this.emit('exit', exitCode)
        }
      })

      this.ws.on('message', (data: Buffer | string) => {
        this.handleWebSocketMessage(data)
      })
    })
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnect(): void {
    this.reconnectAttempts++

    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      this.emit('error', new Error('Max reconnect attempts reached'))
      return
    }

    this.reconnecting = true

    setTimeout(() => {
      if (!this.stopped) {
        this.connect().catch(() => {
          // Error handled in connect's error handler
        })
      }
    }, this.reconnectDelay)
  }

  /**
   * Setup stdin handler to receive MCP messages
   */
  private setupStdinHandler(): void {
    this.stdin.on('data', (chunk: Buffer) => {
      this.handleStdinData(chunk.toString())
    })

    this.stdin.on('end', () => {
      this.stop()
      this.emit('exit', 0)
    })
  }

  /**
   * Handle incoming stdin data
   */
  private handleStdinData(data: string): void {
    this.inputBuffer += data

    // Process complete lines
    const lines = this.inputBuffer.split('\n')
    this.inputBuffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      try {
        const message = JSON.parse(trimmed)
        this.sendToWebSocket(message)
      } catch (error) {
        this.emit('parseError', error as Error)
      }
    }
  }

  /**
   * Send a message to the WebSocket
   */
  private sendToWebSocket(message: unknown): void {
    const json = JSON.stringify(message)

    if (this.isConnected()) {
      this.ws!.send(json)
    } else if (this.reconnectEnabled) {
      // Queue message for later
      this.messageQueue.push(json)
    }
  }

  /**
   * Flush queued messages after reconnection
   */
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected()) {
      const message = this.messageQueue.shift()
      if (message) {
        this.ws!.send(message)
      }
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleWebSocketMessage(data: Buffer | string): void {
    const message = typeof data === 'string' ? data : data.toString()
    this.stdout.write(message + '\n')
  }

  // Type-safe event emitter methods
  on<K extends keyof McpWsAdapterEvents>(
    event: K,
    listener: McpWsAdapterEvents[K]
  ): this {
    return super.on(event, listener)
  }

  emit<K extends keyof McpWsAdapterEvents>(
    event: K,
    ...args: Parameters<McpWsAdapterEvents[K]>
  ): boolean {
    return super.emit(event, ...args)
  }
}

/**
 * Create a new MCP WebSocket Adapter
 */
export function createMcpWsAdapter(options: McpWsAdapterOptions = {}): McpWsAdapter {
  return new McpWsAdapter(options)
}
