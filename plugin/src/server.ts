/**
 * WebSocket Server for Obsidian Bridge
 */

import { App, TFile } from 'obsidian'
import { createServer, Server, IncomingMessage, ServerResponse } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import {
  McpRequest,
  McpResponse,
  McpNotification,
  VaultEvent,
  ErrorCodes,
  successResponse,
  errorResponse,
  notification,
} from './protocol'
import { handleToolCall, getToolDefinitions } from './handlers'

export interface ServerConfig {
  port: number
  autoStart: boolean
}

export const DEFAULT_CONFIG: ServerConfig = {
  port: 22360,
  autoStart: true,
}

export class BridgeServer {
  private httpServer: Server | null = null
  private wss: WebSocketServer | null = null
  private clients = new Set<WebSocket>()
  private running = false

  constructor(
    private app: App,
    private config: ServerConfig = DEFAULT_CONFIG
  ) {}

  get isRunning(): boolean {
    return this.running
  }

  get clientCount(): number {
    return this.clients.size
  }

  async start(): Promise<void> {
    if (this.running) return

    return new Promise((resolve, reject) => {
      this.httpServer = createServer(this.handleHttp.bind(this))
      this.wss = new WebSocketServer({ server: this.httpServer })

      this.wss.on('connection', (ws, req) => {
        console.log(`[Bridge] Client connected from ${req.socket.remoteAddress}`)
        this.clients.add(ws)

        ws.on('message', (data) => this.handleMessage(ws, data))
        ws.on('close', () => {
          console.log('[Bridge] Client disconnected')
          this.clients.delete(ws)
        })
        ws.on('error', (err) => {
          console.error('[Bridge] WebSocket error:', err)
          this.clients.delete(ws)
        })
      })

      this.httpServer.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${this.config.port} is already in use`))
        } else {
          reject(err)
        }
      })

      this.httpServer.listen(this.config.port, () => {
        this.running = true
        console.log(`[Bridge] Server started on port ${this.config.port}`)
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    if (!this.running) return

    // Close all client connections
    for (const client of this.clients) {
      client.close()
    }
    this.clients.clear()

    // Close WebSocket server
    if (this.wss) {
      this.wss.close()
      this.wss = null
    }

    // Close HTTP server
    if (this.httpServer) {
      return new Promise((resolve) => {
        this.httpServer!.close(() => {
          this.httpServer = null
          this.running = false
          console.log('[Bridge] Server stopped')
          resolve()
        })
      })
    }

    this.running = false
  }

  broadcast(event: VaultEvent): void {
    const msg = JSON.stringify(notification('notifications/event', event))
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg)
      }
    }
  }

  private handleHttp(req: IncomingMessage, res: ServerResponse): void {
    // Simple health check endpoint
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', clients: this.clients.size }))
      return
    }

    // Info endpoint
    if (req.url === '/info') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          name: 'obsidian-bridge',
          version: '0.1.0',
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: true,
            events: true,
          },
        })
      )
      return
    }

    res.writeHead(404)
    res.end()
  }

  private async handleMessage(ws: WebSocket, data: Buffer | ArrayBuffer | Buffer[]): Promise<void> {
    let request: McpRequest

    try {
      const str = data.toString()
      request = JSON.parse(str) as McpRequest
    } catch {
      ws.send(JSON.stringify(errorResponse(null, ErrorCodes.ParseError, 'Parse error')))
      return
    }

    try {
      const response = await this.processRequest(request)
      if (response) {
        ws.send(JSON.stringify(response))
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      ws.send(JSON.stringify(errorResponse(request.id, ErrorCodes.InternalError, message)))
    }
  }

  private async processRequest(request: McpRequest): Promise<McpResponse | null> {
    const { method, id, params } = request

    switch (method) {
      case 'initialize':
        return successResponse(id, {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'obsidian-bridge',
            version: '0.1.0',
          },
          capabilities: {
            tools: {},
          },
        })

      case 'initialized':
        // Notification, no response
        return null

      case 'tools/list':
        return successResponse(id, {
          tools: getToolDefinitions(),
        })

      case 'tools/call': {
        const toolParams = params as { name: string; arguments?: Record<string, unknown> }
        const result = await handleToolCall(this.app, toolParams.name, toolParams.arguments || {})
        return successResponse(id, result)
      }

      case 'ping':
        return successResponse(id, {})

      default:
        return errorResponse(id, ErrorCodes.MethodNotFound, `Unknown method: ${method}`)
    }
  }
}
