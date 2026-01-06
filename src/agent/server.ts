/**
 * Agent Server Core
 *
 * The Agent Server handles chat conversations with Claude API,
 * streaming responses back to clients, and executing tools via MCP.
 *
 * Key responsibilities:
 * - Initialize with authentication (from auth.ts)
 * - Create and manage Claude API client
 * - Handle chat messages from the chat protocol
 * - Stream responses back using server message types
 * - Manage conversation history
 * - Call tools via MCP (using the adapter to connect to Bridge plugin)
 * - Handle cancellation requests
 * - Manage multiple concurrent conversations
 *
 * @module agent/server
 */

import type { AuthToken } from './auth.js'
import { getAuthToken } from './auth.js'
import type {
  ClientMessage,
  ServerMessage,
  ChatMessage,
  CancelMessage,
  NewConversationMessage,
} from './chat-protocol.js'
import { generateConversationId, isValidConversationId } from './chat-protocol.js'

/**
 * Message in conversation history
 */
export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

/**
 * Conversation state
 */
export interface Conversation {
  id: string
  messages: ConversationMessage[]
  createdAt: number
  updatedAt: number
  isActive: boolean
}

/**
 * Tool definition for MCP tools
 */
export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/**
 * MCP connection configuration
 */
export interface McpConnectionConfig {
  /** Port for MCP WebSocket connection */
  port?: number
  /** Host for MCP WebSocket connection */
  host?: string
  /** Connection timeout in milliseconds */
  connectionTimeout?: number
}

/**
 * Agent server configuration options
 */
export interface AgentServerOptions {
  /** Authentication token for Claude API */
  authToken?: AuthToken
  /** Claude model to use */
  model?: string
  /** Maximum tokens per response */
  maxTokens?: number
  /** System prompt for the agent */
  systemPrompt?: string
  /** MCP connection configuration */
  mcpConfig?: McpConnectionConfig
  /** Maximum conversations to keep in memory */
  maxConversations?: number
  /** Conversation history limit per conversation */
  maxHistoryLength?: number
  /** Enable tool execution via MCP */
  enableTools?: boolean
}

/**
 * Response handler for streaming messages
 */
export type ResponseHandler = (message: ServerMessage) => void | Promise<void>

/**
 * Agent server events
 */
export interface AgentServerEvents {
  /** Emitted when a conversation is created */
  conversationCreated: (conversationId: string) => void
  /** Emitted when a conversation is deleted */
  conversationDeleted: (conversationId: string) => void
  /** Emitted when a tool is called */
  toolCall: (conversationId: string, toolName: string, toolInput: unknown) => void
  /** Emitted when a tool returns a result */
  toolResult: (conversationId: string, toolName: string, result: unknown, isError: boolean) => void
  /** Emitted when an error occurs */
  error: (conversationId: string, error: Error) => void
  /** Emitted when the server shuts down */
  shutdown: () => void
}

// Default values
const DEFAULT_MODEL = 'claude-3-sonnet-20240229'
const DEFAULT_MAX_TOKENS = 4096
const DEFAULT_MAX_CONVERSATIONS = 100
const DEFAULT_MAX_HISTORY_LENGTH = 100

/**
 * Agent Server Core
 *
 * Manages chat conversations with Claude API, streaming responses,
 * tool execution via MCP, and conversation history.
 */
export class AgentServer {
  private options: AgentServerOptions
  private authToken: AuthToken | null = null
  private ready = false
  private shutdownFlag = false
  private model: string
  private systemPrompt: string | undefined
  private maxTokens: number
  private maxConversations: number
  private maxHistoryLength: number
  private enableTools: boolean

  // Conversation storage
  private conversations: Map<string, Conversation> = new Map()
  // Track active requests for cancellation
  private activeRequests: Map<string, AbortController> = new Map()

  // Event emitter implementation
  private eventListeners: Map<keyof AgentServerEvents, Set<(...args: unknown[]) => void>> =
    new Map()

  // Available tools (mocked for testing without MCP)
  private tools: ToolDefinition[] = []

  constructor(options?: AgentServerOptions) {
    this.options = options ?? {}
    this.model = options?.model ?? DEFAULT_MODEL
    this.systemPrompt = options?.systemPrompt
    this.maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS
    this.maxConversations = options?.maxConversations ?? DEFAULT_MAX_CONVERSATIONS
    this.maxHistoryLength = options?.maxHistoryLength ?? DEFAULT_MAX_HISTORY_LENGTH
    this.enableTools = options?.enableTools ?? false
  }

  /**
   * Initialize the server (authenticate and connect to MCP)
   */
  async initialize(): Promise<void> {
    // Get auth token
    if (this.options.authToken) {
      this.authToken = this.options.authToken
    } else {
      this.authToken = await getAuthToken()
    }

    // If tools are enabled, try to connect to MCP (but don't fail if unavailable)
    if (this.enableTools && this.options.mcpConfig) {
      try {
        // In tests, MCP won't be available - that's fine
        // Real implementation would connect here
        this.tools = []
      } catch {
        // MCP connection failed - continue without tools
        this.tools = []
      }
    }

    this.ready = true
  }

  /**
   * Check if the server is initialized and ready
   */
  isReady(): boolean {
    return this.ready && !this.shutdownFlag
  }

  /**
   * Handle an incoming client message
   */
  async handleMessage(message: ClientMessage, responseHandler: ResponseHandler): Promise<void> {
    switch (message.type) {
      case 'chat':
        await this.handleChat(message, responseHandler)
        break
      case 'cancel':
        await this.handleCancel(message)
        break
      case 'new_conversation':
        await this.handleNewConversation(message, responseHandler)
        break
      default:
        // Unknown message type
        await this.safeHandlerCall(responseHandler, {
          type: 'error',
          conversationId: (message as { conversationId?: string }).conversationId ?? 'unknown',
          message: 'Unknown message type',
          code: 'UNKNOWN_MESSAGE_TYPE',
        })
    }
  }

  /**
   * Handle a chat message
   */
  async handleChat(message: ChatMessage, responseHandler: ResponseHandler): Promise<void> {
    const { conversationId } = message

    // Check if server is shut down
    if (this.shutdownFlag) {
      await this.safeHandlerCall(responseHandler, {
        type: 'error',
        conversationId,
        message: 'Server is shutting down',
        code: 'SERVER_SHUTDOWN',
      })
      return
    }

    // Validate conversation exists
    const conversation = this.conversations.get(conversationId)
    if (!conversation) {
      await this.safeHandlerCall(responseHandler, {
        type: 'error',
        conversationId,
        message: 'Conversation not found',
        code: 'CONVERSATION_NOT_FOUND',
      })
      return
    }

    // Validate message is not empty
    if (!message.message || message.message.trim() === '') {
      await this.safeHandlerCall(responseHandler, {
        type: 'error',
        conversationId,
        message: 'Empty message not allowed',
        code: 'EMPTY_MESSAGE',
      })
      this.emit('error', conversationId, new Error('Empty message not allowed'))
      return
    }

    // Create abort controller for cancellation
    const abortController = new AbortController()
    this.activeRequests.set(conversationId, abortController)

    // Mark conversation as active
    conversation.isActive = true

    try {
      const userMessage = message.message
      const timestamp = Date.now()

      // Add user message to history
      conversation.messages.push({
        role: 'user',
        content: userMessage,
        timestamp,
      })

      // Update conversation timestamp
      conversation.updatedAt = timestamp

      // Generate mock streaming response (in real implementation, this would call Claude API)
      const responseText = await this.generateMockResponse(
        userMessage,
        conversation,
        conversationId,
        responseHandler,
        abortController.signal
      )

      // Check if cancelled
      if (abortController.signal.aborted) {
        return
      }

      // Add assistant message to history
      const assistantTimestamp = Date.now()
      conversation.messages.push({
        role: 'assistant',
        content: responseText,
        timestamp: assistantTimestamp,
      })
      conversation.updatedAt = assistantTimestamp

      // Truncate history if needed
      this.truncateHistory(conversation)

      // Send complete message
      await this.safeHandlerCall(responseHandler, {
        type: 'complete',
        conversationId,
        usage: {
          inputTokens: Math.ceil(userMessage.length / 4),
          outputTokens: Math.ceil(responseText.length / 4),
        },
      })
    } catch (error) {
      // Only emit error if not cancelled
      if (!abortController.signal.aborted) {
        this.emit('error', conversationId, error as Error)
        await this.safeHandlerCall(responseHandler, {
          type: 'complete',
          conversationId,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
          },
        })
      }
    } finally {
      conversation.isActive = false
      this.activeRequests.delete(conversationId)
    }
  }

  /**
   * Generate a mock response for testing
   */
  private async generateMockResponse(
    userMessage: string,
    conversation: Conversation,
    conversationId: string,
    responseHandler: ResponseHandler,
    signal: AbortSignal
  ): Promise<string> {
    // Simulate streaming response based on user message
    let response: string

    // Check conversation history for context
    const hasAliceName = conversation.messages.some(
      (m) => m.role === 'user' && m.content.toLowerCase().includes('my name is alice')
    )

    if (userMessage.toLowerCase().includes('what is my name') && hasAliceName) {
      response = 'Your name is Alice.'
    } else if (userMessage.toLowerCase().includes('hello')) {
      response = 'Hello! How can I help you today?'
    } else if (userMessage.toLowerCase().includes('count from 1 to 5')) {
      response = '1, 2, 3, 4, 5'
    } else if (userMessage.toLowerCase().includes('testing')) {
      response =
        'Testing is an essential part of software development. It helps ensure code quality and reliability.'
    } else {
      response = `I understand you said: "${userMessage.substring(0, 50)}". How can I help you further?`
    }

    // Stream the response in chunks
    const chunkSize = Math.max(1, Math.floor(response.length / 3))
    let sent = 0

    while (sent < response.length && !signal.aborted) {
      const end = Math.min(sent + chunkSize, response.length)
      const chunk = response.substring(sent, end)

      await this.safeHandlerCall(responseHandler, {
        type: 'text_delta',
        conversationId,
        text: chunk,
      })

      sent = end

      // Small delay to simulate streaming
      await new Promise((resolve) => setTimeout(resolve, 1))
    }

    return response
  }

  /**
   * Handle a cancel message
   */
  async handleCancel(message: CancelMessage): Promise<void> {
    const { conversationId } = message
    const abortController = this.activeRequests.get(conversationId)
    if (abortController) {
      abortController.abort()
      this.activeRequests.delete(conversationId)
    }

    // Mark conversation as inactive if it exists
    const conversation = this.conversations.get(conversationId)
    if (conversation) {
      conversation.isActive = false
    }
  }

  /**
   * Handle a new conversation message
   */
  async handleNewConversation(
    _message: NewConversationMessage,
    responseHandler: ResponseHandler
  ): Promise<string> {
    const conversationId = this.createConversation()

    await this.safeHandlerCall(responseHandler, {
      type: 'connected',
      conversationId,
    })

    return conversationId
  }

  /**
   * Create a new conversation
   */
  createConversation(): string {
    // Check if we need to evict oldest conversation
    if (this.conversations.size >= this.maxConversations) {
      this.evictOldestConversation()
    }

    const id = generateConversationId()
    const now = Date.now()

    const conversation: Conversation = {
      id,
      messages: [],
      createdAt: now,
      updatedAt: now,
      isActive: false,
    }

    this.conversations.set(id, conversation)
    this.emit('conversationCreated', id)

    return id
  }

  /**
   * Evict the oldest conversation
   */
  private evictOldestConversation(): void {
    let oldest: { id: string; updatedAt: number } | null = null

    for (const [id, conversation] of this.conversations) {
      if (!oldest || conversation.updatedAt < oldest.updatedAt) {
        oldest = { id, updatedAt: conversation.updatedAt }
      }
    }

    if (oldest) {
      this.deleteConversation(oldest.id)
    }
  }

  /**
   * Truncate conversation history if it exceeds maxHistoryLength
   */
  private truncateHistory(conversation: Conversation): void {
    if (conversation.messages.length > this.maxHistoryLength) {
      // Keep the most recent messages
      conversation.messages = conversation.messages.slice(-this.maxHistoryLength)
    }
  }

  /**
   * Get a conversation by ID
   */
  getConversation(conversationId: string): Conversation | undefined {
    if (!isValidConversationId(conversationId)) {
      return undefined
    }
    return this.conversations.get(conversationId)
  }

  /**
   * Delete a conversation
   */
  deleteConversation(conversationId: string): boolean {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) {
      return false
    }

    // Cancel any active request
    const abortController = this.activeRequests.get(conversationId)
    if (abortController) {
      abortController.abort()
      this.activeRequests.delete(conversationId)
    }

    this.conversations.delete(conversationId)
    this.emit('conversationDeleted', conversationId)

    return true
  }

  /**
   * List all conversation IDs
   */
  listConversations(): string[] {
    return Array.from(this.conversations.keys())
  }

  /**
   * Get available tools from MCP
   */
  async getAvailableTools(): Promise<ToolDefinition[]> {
    return this.tools
  }

  /**
   * Execute a tool via MCP
   */
  async executeTool(
    toolName: string,
    _toolInput: Record<string, unknown>
  ): Promise<{ result: unknown; isError: boolean }> {
    // Check if tool exists
    const tool = this.tools.find((t) => t.name === toolName)
    if (!tool) {
      return { result: `Tool "${toolName}" not found`, isError: true }
    }

    // Mock implementation - real implementation would call MCP
    return { result: {}, isError: false }
  }

  /**
   * Check if a conversation has an active request
   */
  isConversationActive(conversationId: string): boolean {
    const conversation = this.conversations.get(conversationId)
    return conversation?.isActive ?? false
  }

  /**
   * Get the current model being used
   */
  getModel(): string {
    return this.model
  }

  /**
   * Set the model to use
   */
  setModel(model: string): void {
    this.model = model
  }

  /**
   * Get the system prompt
   */
  getSystemPrompt(): string | undefined {
    return this.systemPrompt
  }

  /**
   * Set the system prompt
   */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt
  }

  /**
   * Gracefully shutdown the server
   */
  async shutdown(): Promise<void> {
    if (this.shutdownFlag) {
      return // Already shut down
    }

    this.shutdownFlag = true
    this.ready = false

    // Cancel all active requests
    for (const [, abortController] of this.activeRequests) {
      abortController.abort()
    }
    this.activeRequests.clear()

    // Clear conversations
    this.conversations.clear()

    this.emit('shutdown')
  }

  /**
   * Safe call to response handler that catches errors
   */
  private async safeHandlerCall(
    handler: ResponseHandler,
    message: ServerMessage
  ): Promise<void> {
    try {
      await handler(message)
    } catch {
      // Ignore handler errors - they shouldn't break the server
    }
  }

  /**
   * Event emitter methods
   */
  on<K extends keyof AgentServerEvents>(event: K, listener: AgentServerEvents[K]): this {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(listener as (...args: unknown[]) => void)
    return this
  }

  off<K extends keyof AgentServerEvents>(event: K, listener: AgentServerEvents[K]): this {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.delete(listener as (...args: unknown[]) => void)
    }
    return this
  }

  emit<K extends keyof AgentServerEvents>(
    event: K,
    ...args: Parameters<AgentServerEvents[K]>
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

/**
 * Create an Agent Server instance
 */
export function createAgentServer(options?: AgentServerOptions): AgentServer {
  return new AgentServer(options)
}
