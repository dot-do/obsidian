/**
 * Chat WebSocket Server
 *
 * The Chat WebSocket Server bridges the Plugin Chat View (client) to the Agent Server.
 * It uses the ws library for WebSocket handling and routes messages using the chat protocol.
 *
 * Key responsibilities:
 * - Start/stop WebSocket server on specified port
 * - Accept client connections from Plugin Chat View
 * - Parse and validate incoming client messages
 * - Route messages to AgentServer
 * - Stream AgentServer responses back to clients
 * - Handle multiple concurrent clients
 * - Manage client disconnections gracefully
 * - Handle errors and edge cases
 *
 * @module agent/chat-ws-server
 */

import { WebSocketServer, WebSocket } from 'ws'
import type { AddressInfo } from 'net'
import type { IncomingMessage } from 'http'
import type { ServerMessage, ClientMessage } from './chat-protocol.js'
import { ClientMessageSchema, generateConversationId } from './chat-protocol.js'
import { AgentServer, type AgentServerOptions } from './server.js'

/**
 * Chat WebSocket Server configuration options
 */
export interface ChatWsServerOptions {
  /** Port to listen on (0 for random) */
  port?: number
  /** Host to bind to */
  host?: string
  /** Agent server options */
  agentServerOptions?: AgentServerOptions
  /** Require authentication */
  requireAuth?: boolean
  /** Authentication token */
  authToken?: string
}

/**
 * Chat WebSocket Server events
 */
export interface ChatWsServerEvents {
  /** Emitted when server starts listening */
  listening: () => void
  /** Emitted when server closes */
  close: () => void
  /** Emitted when a client connects */
  connection: (ws: WebSocket) => void
  /** Emitted when a client disconnects */
  disconnect: (ws: WebSocket) => void
  /** Emitted when an error occurs */
  error: (error: Error) => void
}

/**
 * Client state tracking
 */
interface ClientState {
  ws: WebSocket
  conversationIds: Set<string>
}

/**
 * Chat WebSocket Server
 *
 * Bridges the Plugin Chat View to the Agent Server via WebSocket.
 */
export interface ChatWsServer {
  /** Start the server */
  start(): Promise<void>
  /** Stop the server */
  stop(): Promise<void>
  /** Check if server is running */
  isRunning(): boolean
  /** Get the port the server is listening on */
  getPort(): number
  /** Get the server address */
  getAddress(): AddressInfo
  /** Get the number of connected clients */
  getConnectedClients(): number
  /** Get the AgentServer instance */
  getAgentServer(): AgentServer
  /** Event emitter methods */
  on<K extends keyof ChatWsServerEvents>(event: K, listener: ChatWsServerEvents[K]): this
  off<K extends keyof ChatWsServerEvents>(event: K, listener: ChatWsServerEvents[K]): this
  emit<K extends keyof ChatWsServerEvents>(
    event: K,
    ...args: Parameters<ChatWsServerEvents[K]>
  ): boolean
}

/**
 * Create a Chat WebSocket Server instance
 */
export function createChatWsServer(options?: ChatWsServerOptions): ChatWsServer {
  return new ChatWsServerImpl(options)
}

/**
 * Chat WebSocket Server Implementation
 */
class ChatWsServerImpl implements ChatWsServer {
  private options: ChatWsServerOptions
  private wss: WebSocketServer | null = null
  private agentServer: AgentServer
  private running = false
  private port: number
  private host: string
  private requireAuth: boolean
  private authToken: string | null

  // Client tracking
  private clients: Map<WebSocket, ClientState> = new Map()

  // Conversation to client mapping
  private conversationToClient: Map<string, WebSocket> = new Map()

  // Event listeners
  private eventListeners: Map<keyof ChatWsServerEvents, Set<(...args: unknown[]) => void>> =
    new Map()

  constructor(options?: ChatWsServerOptions) {
    this.options = options ?? {}
    this.port = options?.port ?? 3000
    this.host = options?.host ?? 'localhost'
    this.requireAuth = options?.requireAuth ?? false
    this.authToken = options?.authToken ?? null

    // Create agent server instance
    this.agentServer = new AgentServer(options?.agentServerOptions)
  }

  /**
   * Start the WebSocket server
   */
  async start(): Promise<void> {
    if (this.running) {
      return
    }

    // Initialize agent server
    await this.agentServer.initialize()

    return new Promise<void>((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({
          port: this.port,
          host: this.host,
          verifyClient: this.requireAuth
            ? (info, callback) => this.verifyClient(info, callback)
            : undefined,
        })

        this.wss.on('listening', () => {
          this.running = true
          const address = this.wss!.address() as AddressInfo
          this.port = address.port
          this.emit('listening')
          resolve()
        })

        this.wss.on('error', (error: Error) => {
          this.emit('error', error)
          if (!this.running) {
            reject(error)
          }
        })

        this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
          this.handleConnection(ws, req)
        })

        this.wss.on('close', () => {
          this.running = false
          this.emit('close')
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Verify client authentication during WebSocket upgrade
   */
  private verifyClient(
    info: { origin: string; req: IncomingMessage; secure: boolean },
    callback: (res: boolean, code?: number, message?: string) => void
  ): void {
    if (!this.requireAuth || !this.authToken) {
      callback(true)
      return
    }

    const authHeader = info.req.headers.authorization
    if (!authHeader) {
      callback(false, 401, 'Unauthorized')
      return
    }

    const token = authHeader.replace('Bearer ', '')
    if (token === this.authToken) {
      callback(true)
    } else {
      callback(false, 401, 'Unauthorized')
    }
  }

  /**
   * Stop the WebSocket server
   */
  async stop(): Promise<void> {
    if (!this.wss) {
      return
    }

    return new Promise<void>((resolve) => {
      // Close all client connections
      for (const [ws] of this.clients) {
        ws.close()
      }

      // Clear client tracking
      this.clients.clear()
      this.conversationToClient.clear()

      // Close the server
      this.wss!.close(() => {
        this.running = false
        this.wss = null
        this.emit('close')
        resolve()
      })
    })
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.running
  }

  /**
   * Get the port the server is listening on
   */
  getPort(): number {
    return this.port
  }

  /**
   * Get the server address
   */
  getAddress(): AddressInfo {
    if (!this.wss) {
      throw new Error('Server not running')
    }
    return this.wss.address() as AddressInfo
  }

  /**
   * Get the number of connected clients
   */
  getConnectedClients(): number {
    return this.clients.size
  }

  /**
   * Get the AgentServer instance
   */
  getAgentServer(): AgentServer {
    return this.agentServer
  }

  /**
   * Handle a new client connection
   */
  private handleConnection(ws: WebSocket, _req: IncomingMessage): void {
    // Initialize client state
    const clientState: ClientState = {
      ws,
      conversationIds: new Set(),
    }
    this.clients.set(ws, clientState)

    // Emit connection event
    this.emit('connection', ws)

    // Set up message handler
    ws.on('message', (data: Buffer | string) => {
      this.handleMessage(ws, data)
    })

    // Set up close handler
    ws.on('close', () => {
      this.handleDisconnect(ws)
    })

    // Set up error handler
    ws.on('error', (_error: Error) => {
      // Don't crash on client errors
    })
  }

  /**
   * Handle a client message
   */
  private handleMessage(ws: WebSocket, data: Buffer | string): void {
    const clientState = this.clients.get(ws)
    if (!clientState) {
      return
    }

    // Handle empty messages
    if (data.toString().trim() === '') {
      return
    }

    // Try to parse JSON
    let parsed: unknown
    try {
      // Handle binary data
      if (Buffer.isBuffer(data) && !this.isValidUtf8(data)) {
        this.sendError(ws, 'Invalid message format: binary data not supported')
        return
      }

      parsed = JSON.parse(data.toString())
    } catch {
      this.sendError(ws, 'Invalid JSON format')
      return
    }

    // Validate message schema
    const result = ClientMessageSchema.safeParse(parsed)
    if (!result.success) {
      this.sendError(ws, 'Invalid message schema')
      return
    }

    const message = result.data as ClientMessage

    // Route message to appropriate handler
    this.routeMessage(ws, message, clientState)
  }

  /**
   * Check if buffer is valid UTF-8
   */
  private isValidUtf8(buffer: Buffer): boolean {
    try {
      buffer.toString('utf8')
      return true
    } catch {
      return false
    }
  }

  /**
   * Route a validated message
   */
  private routeMessage(ws: WebSocket, message: ClientMessage, clientState: ClientState): void {
    switch (message.type) {
      case 'new_conversation':
        this.handleNewConversation(ws, clientState)
        break
      case 'chat':
        this.handleChat(ws, message, clientState)
        break
      case 'cancel':
        this.handleCancel(ws, message, clientState)
        break
    }
  }

  /**
   * Handle new_conversation message
   */
  private handleNewConversation(ws: WebSocket, clientState: ClientState): void {
    // Create conversation via AgentServer
    const responseHandler = (msg: ServerMessage) => {
      if (msg.type === 'connected') {
        // Track conversation for this client
        clientState.conversationIds.add(msg.conversationId)
        this.conversationToClient.set(msg.conversationId, ws)
      }
      this.sendMessage(ws, msg)
    }

    this.agentServer.handleMessage({ type: 'new_conversation' }, responseHandler)
  }

  /**
   * Handle chat message
   */
  private handleChat(
    ws: WebSocket,
    message: ClientMessage & { type: 'chat' },
    clientState: ClientState
  ): void {
    const { conversationId } = message

    // Validate conversation exists and belongs to this client
    if (!clientState.conversationIds.has(conversationId)) {
      // Check if conversation exists at all
      const conversation = this.agentServer.getConversation(conversationId)
      if (!conversation) {
        this.sendError(ws, 'Conversation not found', conversationId)
        return
      }
    }

    // Create response handler that sends to this client
    const responseHandler = (msg: ServerMessage) => {
      this.sendMessage(ws, msg)
    }

    // Route to AgentServer
    this.agentServer.handleMessage(message, responseHandler)
  }

  /**
   * Handle cancel message
   */
  private handleCancel(
    ws: WebSocket,
    message: ClientMessage & { type: 'cancel' },
    _clientState: ClientState
  ): void {
    const { conversationId } = message

    // Route to AgentServer
    this.agentServer.handleMessage(message, () => {})

    // Send complete message after cancellation
    // This ensures the client knows the request was terminated
    this.sendMessage(ws, {
      type: 'complete',
      conversationId,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
      },
    })
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnect(ws: WebSocket): void {
    const clientState = this.clients.get(ws)
    if (clientState) {
      // Clean up conversation tracking
      for (const convId of clientState.conversationIds) {
        this.conversationToClient.delete(convId)
      }
    }

    // Remove client
    this.clients.delete(ws)

    // Emit disconnect event
    this.emit('disconnect', ws)
  }

  /**
   * Send a server message to a client
   */
  private sendMessage(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  /**
   * Send an error message to a client
   */
  private sendError(ws: WebSocket, errorMessage: string, conversationId?: string): void {
    const errorMsg: ServerMessage = {
      type: 'error',
      conversationId: conversationId ?? 'unknown',
      message: errorMessage,
    }
    this.sendMessage(ws, errorMsg)
  }

  /**
   * Event emitter: on
   */
  on<K extends keyof ChatWsServerEvents>(event: K, listener: ChatWsServerEvents[K]): this {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(listener as (...args: unknown[]) => void)
    return this
  }

  /**
   * Event emitter: off
   */
  off<K extends keyof ChatWsServerEvents>(event: K, listener: ChatWsServerEvents[K]): this {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.delete(listener as (...args: unknown[]) => void)
    }
    return this
  }

  /**
   * Event emitter: emit
   */
  emit<K extends keyof ChatWsServerEvents>(
    event: K,
    ...args: Parameters<ChatWsServerEvents[K]>
  ): boolean {
    const listeners = this.eventListeners.get(event)
    if (!listeners || listeners.size === 0) {
      return false
    }
    for (const listener of listeners) {
      listener(...args)
    }
    return true
  }
}
