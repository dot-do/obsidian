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
import type {
  ClientMessage,
  ServerMessage,
  ChatMessage,
  CancelMessage,
  NewConversationMessage,
} from './chat-protocol.js'

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

/**
 * Agent Server Core
 *
 * Manages chat conversations with Claude API, streaming responses,
 * tool execution via MCP, and conversation history.
 */
export class AgentServer {
  constructor(_options?: AgentServerOptions) {
    throw new Error('Not implemented')
  }

  /**
   * Initialize the server (authenticate and connect to MCP)
   */
  async initialize(): Promise<void> {
    throw new Error('Not implemented')
  }

  /**
   * Check if the server is initialized and ready
   */
  isReady(): boolean {
    throw new Error('Not implemented')
  }

  /**
   * Handle an incoming client message
   */
  async handleMessage(message: ClientMessage, responseHandler: ResponseHandler): Promise<void> {
    throw new Error('Not implemented')
  }

  /**
   * Handle a chat message
   */
  async handleChat(message: ChatMessage, responseHandler: ResponseHandler): Promise<void> {
    throw new Error('Not implemented')
  }

  /**
   * Handle a cancel message
   */
  async handleCancel(message: CancelMessage): Promise<void> {
    throw new Error('Not implemented')
  }

  /**
   * Handle a new conversation message
   */
  async handleNewConversation(
    _message: NewConversationMessage,
    responseHandler: ResponseHandler
  ): Promise<string> {
    throw new Error('Not implemented')
  }

  /**
   * Create a new conversation
   */
  createConversation(): string {
    throw new Error('Not implemented')
  }

  /**
   * Get a conversation by ID
   */
  getConversation(conversationId: string): Conversation | undefined {
    throw new Error('Not implemented')
  }

  /**
   * Delete a conversation
   */
  deleteConversation(conversationId: string): boolean {
    throw new Error('Not implemented')
  }

  /**
   * List all conversation IDs
   */
  listConversations(): string[] {
    throw new Error('Not implemented')
  }

  /**
   * Get available tools from MCP
   */
  async getAvailableTools(): Promise<ToolDefinition[]> {
    throw new Error('Not implemented')
  }

  /**
   * Execute a tool via MCP
   */
  async executeTool(
    toolName: string,
    toolInput: Record<string, unknown>
  ): Promise<{ result: unknown; isError: boolean }> {
    throw new Error('Not implemented')
  }

  /**
   * Check if a conversation has an active request
   */
  isConversationActive(conversationId: string): boolean {
    throw new Error('Not implemented')
  }

  /**
   * Get the current model being used
   */
  getModel(): string {
    throw new Error('Not implemented')
  }

  /**
   * Set the model to use
   */
  setModel(model: string): void {
    throw new Error('Not implemented')
  }

  /**
   * Get the system prompt
   */
  getSystemPrompt(): string | undefined {
    throw new Error('Not implemented')
  }

  /**
   * Set the system prompt
   */
  setSystemPrompt(prompt: string): void {
    throw new Error('Not implemented')
  }

  /**
   * Gracefully shutdown the server
   */
  async shutdown(): Promise<void> {
    throw new Error('Not implemented')
  }

  /**
   * Event emitter methods
   */
  on<K extends keyof AgentServerEvents>(
    _event: K,
    _listener: AgentServerEvents[K]
  ): this {
    throw new Error('Not implemented')
  }

  off<K extends keyof AgentServerEvents>(
    _event: K,
    _listener: AgentServerEvents[K]
  ): this {
    throw new Error('Not implemented')
  }

  emit<K extends keyof AgentServerEvents>(
    _event: K,
    ..._args: Parameters<AgentServerEvents[K]>
  ): boolean {
    throw new Error('Not implemented')
  }
}

/**
 * Create an Agent Server instance
 */
export function createAgentServer(options?: AgentServerOptions): AgentServer {
  return new AgentServer(options)
}
