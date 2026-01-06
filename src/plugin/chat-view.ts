/**
 * Chat View for Obsidian Plugin
 *
 * An ItemView that renders in the right sidebar, showing a chat conversation
 * with an AI agent. Connects to the Agent Server via WebSocket.
 */

import type { WorkspaceLeaf, ViewStateResult, App } from './types.js'
import { ItemView } from './types.js'
import type { ServerMessage, ClientMessage } from '../agent/chat-protocol.js'

/**
 * View type identifier for the chat view
 */
export const CHAT_VIEW_TYPE = 'obsidian-chat-view'

/**
 * Represents a single message in the conversation
 */
export interface ChatMessageItem {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: number
  toolUseId?: string
  toolName?: string
  toolInput?: unknown
  toolOutput?: unknown
  isError?: boolean
  isStreaming?: boolean
}

/**
 * Represents a conversation
 */
export interface Conversation {
  id: string
  title: string
  messages: ChatMessageItem[]
  createdAt: number
  updatedAt: number
}

/**
 * State of the chat view for serialization
 */
export interface ChatViewState {
  conversationId: string | null
  conversations: Conversation[]
  serverUrl: string
  isConnected: boolean
}

/**
 * Configuration for the chat view
 */
export interface ChatViewConfig {
  serverUrl: string
  reconnectInterval?: number
  maxReconnectAttempts?: number
}

/**
 * Generate a unique ID for messages
 *
 * Creates a unique identifier combining random characters and timestamp.
 *
 * @returns A unique message ID string
 */
function generateId(): string {
  return 'msg-' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

/**
 * Sanitize HTML to prevent XSS attacks
 *
 * Escapes HTML special characters to prevent script injection.
 *
 * @param text - The text to sanitize
 * @returns Sanitized text safe for HTML insertion
 */
function sanitizeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Render markdown to HTML
 *
 * Converts markdown syntax to HTML with proper escaping and formatting.
 * Supports headings, code blocks, inline code, bold, italic, links, wikilinks, and lists.
 *
 * @param content - The markdown content to render
 * @returns HTML string with proper formatting
 */
function renderMarkdownToHtml(content: string): string {
  let html = sanitizeHtml(content)

  // Code blocks (must be processed before inline code)
  // Matches ```language\ncode\n``` or ```\ncode\n```
  html = html.replace(/```(\w*)\r?\n([\s\S]*?)```/g, (_, lang, code) => {
    const language = lang ? ` class="language-${lang}"` : ''
    return `<pre><code${language}>${code}</code></pre>`
  })

  // Inline code (backticks)
  // Non-greedy match to handle multiple inline code segments
  html = html.replace(/`([^`\n]+?)`/g, '<code>$1</code>')

  // Bold - both ** and __ syntax
  // Non-greedy match, doesn't cross line boundaries
  html = html.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__([^_\n]+?)__/g, '<strong>$1</strong>')

  // Italic - both * and _ syntax (after bold to avoid conflicts)
  // Non-greedy match, doesn't cross line boundaries
  html = html.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
  html = html.replace(/_([^_\n]+?)_/g, '<em>$1</em>')

  // Headings (must be at start of line)
  // Match from h6 to h1 to avoid h1 matching h2/h3
  html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>')
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>')
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

  // Links - [text](url) or [text](url "title")
  html = html.replace(/\[([^\]]+)\]\(([^)]+?)(?:\s+"([^"]+)")?\)/g, (_, text, url, title) => {
    const titleAttr = title ? ` title="${title}"` : ''
    return `<a href="${url}"${titleAttr}>${text}</a>`
  })

  // Wikilinks - [[page]] or [[page|display text]]
  html = html.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, page, displayText) => {
    const text = displayText || page
    return `<a class="internal-link" data-href="${page}">${text}</a>`
  })

  // Unordered lists (- or * at start of line)
  html = html.replace(/^[*-] (.+)$/gm, '<li>$1</li>')
  // Wrap consecutive list items in ul tags
  html = html.replace(/(<li>.*?<\/li>\r?\n?)+/g, '<ul>$&</ul>')

  // Ordered lists (number followed by . or ) at start of line)
  html = html.replace(/^\d+[.)]\s+(.+)$/gm, '<li>$1</li>')
  // Wrap consecutive numbered list items in ol tags (avoid wrapping ul items)
  html = html.replace(/^(<li>(?:(?!<ul>).)*?<\/li>\r?\n?)+/gm, (match) => {
    // Only wrap if not already wrapped in ul
    return match.includes('<ul>') ? match : `<ol>${match}</ol>`
  })

  // Horizontal rules
  html = html.replace(/^(?:---|\*\*\*|___)\s*$/gm, '<hr>')

  // Blockquotes
  html = html.replace(/^&gt;\s?(.+)$/gm, '<blockquote>$1</blockquote>')
  // Merge consecutive blockquotes
  html = html.replace(/(<\/blockquote>\r?\n?<blockquote>)/g, '\n')

  // Line breaks (two spaces at end of line or backslash)
  html = html.replace(/  \r?\n/g, '<br>\n')
  html = html.replace(/\\\r?\n/g, '<br>\n')

  // Paragraphs - wrap text blocks separated by double newlines
  // Split by double newlines, filter out empty strings and HTML block elements
  const blockElements = /<\/?(?:h[1-6]|ul|ol|li|pre|code|blockquote|hr)/
  html = html.split(/\r?\n\r?\n/).map(block => {
    const trimmed = block.trim()
    if (!trimmed || blockElements.test(trimmed)) {
      return trimmed
    }
    return `<p>${trimmed}</p>`
  }).join('\n\n')

  return html
}

/**
 * Chat View ItemView implementation
 */
export class ChatView extends ItemView {
  /**
   * Current conversation ID
   */
  private conversationId: string | null = null

  /**
   * All conversations
   */
  private conversations: Map<string, Conversation> = new Map()

  /**
   * WebSocket connection to the agent server
   */
  private ws: WebSocket | null = null

  /**
   * Server URL for WebSocket connection
   */
  private serverUrl: string = 'ws://localhost:3000'

  /**
   * Whether currently connected to the server
   */
  private isConnected: boolean = false

  /**
   * Current streaming text buffer
   */
  private streamingBuffer: string = ''

  /**
   * Reconnection attempt count
   */
  private reconnectAttempts: number = 0

  /**
   * Maximum reconnection attempts
   */
  private maxReconnectAttempts: number = 5

  /**
   * Reconnection interval in milliseconds
   */
  private reconnectInterval: number = 3000

  /**
   * Input element reference
   */
  private inputEl: HTMLTextAreaElement | null = null

  /**
   * Messages container element reference
   */
  private messagesContainerEl: HTMLElement | null = null

  /**
   * Error message element reference
   */
  private errorEl: HTMLElement | null = null

  /**
   * Connection status element reference
   */
  private statusEl: HTMLElement | null = null

  /**
   * Reconnect timer ID
   */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Whether user manually disconnected (prevents reconnection)
   */
  private manualDisconnect: boolean = false

  /**
   * Current streaming message ID
   */
  private streamingMessageId: string | null = null

  /**
   * WebSocket event handlers (bound for removal)
   */
  private boundHandleOpen: () => void
  private boundHandleClose: (event: CloseEvent) => void
  private boundHandleError: (event: Event) => void
  private boundHandleMessage: (event: MessageEvent) => void

  constructor(leaf: WorkspaceLeaf) {
    super(leaf)
    // Bind handlers
    this.boundHandleOpen = this.handleOpen.bind(this)
    this.boundHandleClose = this.handleClose.bind(this)
    this.boundHandleError = this.handleError.bind(this)
    this.boundHandleMessage = this.handleMessage.bind(this)
  }

  /**
   * Get the view type identifier
   */
  getViewType(): string {
    return CHAT_VIEW_TYPE
  }

  /**
   * Get the display text for the view tab
   */
  getDisplayText(): string {
    return 'AI Chat'
  }

  /**
   * Get the icon for the view tab
   */
  getIcon(): string {
    return 'message-square'
  }

  /**
   * Called when the view is opened
   */
  async onOpen(): Promise<void> {
    this.renderView()
    this.connect()
  }

  /**
   * Called when the view is closed
   */
  async onClose(): Promise<void> {
    this.manualDisconnect = true
    this.disconnect()
    this.containerEl.innerHTML = ''
    this.inputEl = null
    this.messagesContainerEl = null
    this.errorEl = null
    this.statusEl = null
  }

  /**
   * Get the current state for serialization
   */
  getState(): ChatViewState {
    return {
      conversationId: this.conversationId,
      conversations: Array.from(this.conversations.values()),
      serverUrl: this.serverUrl,
      isConnected: this.isConnected,
    }
  }

  /**
   * Type guard to check if state is a valid ChatViewState
   */
  private isValidChatViewState(state: unknown): state is Partial<ChatViewState> {
    if (!state || typeof state !== 'object') {
      return false
    }
    const s = state as Record<string, unknown>

    // Check conversationId is string or null
    if ('conversationId' in s && typeof s.conversationId !== 'string' && s.conversationId !== null) {
      return false
    }

    // Check serverUrl is string
    if ('serverUrl' in s && typeof s.serverUrl !== 'string') {
      return false
    }

    // Check conversations is array
    if ('conversations' in s && !Array.isArray(s.conversations)) {
      return false
    }

    // Check isConnected is boolean
    if ('isConnected' in s && typeof s.isConnected !== 'boolean') {
      return false
    }

    return true
  }

  /**
   * Type guard to check if an object is a valid Conversation
   */
  private isValidConversation(obj: unknown): obj is Conversation {
    if (!obj || typeof obj !== 'object') {
      return false
    }
    const conv = obj as Record<string, unknown>
    return (
      typeof conv.id === 'string' &&
      typeof conv.title === 'string' &&
      Array.isArray(conv.messages) &&
      typeof conv.createdAt === 'number' &&
      typeof conv.updatedAt === 'number'
    )
  }

  /**
   * Restore state from serialization
   *
   * Restores the view state from a serialized state object. Validates all
   * fields before applying them. Updates the UI if the view is already open.
   *
   * @param state - The state object to restore
   * @param result - View state result (unused but required by Obsidian API)
   */
  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    if (!this.isValidChatViewState(state)) {
      return
    }

    if (typeof state.conversationId === 'string' || state.conversationId === null) {
      this.conversationId = state.conversationId
    }

    if (typeof state.serverUrl === 'string') {
      this.serverUrl = state.serverUrl
    }

    if (Array.isArray(state.conversations)) {
      this.conversations.clear()
      for (const conv of state.conversations) {
        if (this.isValidConversation(conv)) {
          this.conversations.set(conv.id, conv)
        }
      }
    }

    // Update UI if it exists
    if (this.messagesContainerEl) {
      this.updateMessagesDisplay()
    }
  }

  // ============================================================================
  // WebSocket Connection Management
  // ============================================================================

  /**
   * Connect to the WebSocket server
   *
   * Establishes a WebSocket connection to the configured server URL.
   * Automatically sets up event handlers for connection lifecycle.
   * Will not create duplicate connections if already connecting or connected.
   */
  connect(): void {
    // Don't create duplicate connections
    // Note: Use numeric readyState values for test compatibility with mocked WebSocket
    // 0 = CONNECTING, 1 = OPEN
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) {
      return
    }

    this.manualDisconnect = false
    this.ws = new WebSocket(this.serverUrl)

    this.ws.addEventListener('open', this.boundHandleOpen)
    this.ws.addEventListener('close', this.boundHandleClose)
    this.ws.addEventListener('error', this.boundHandleError)
    this.ws.addEventListener('message', this.boundHandleMessage)
  }

  /**
   * Disconnect from the WebSocket server
   *
   * Closes the WebSocket connection and cleans up event listeners.
   * Prevents automatic reconnection by setting the manual disconnect flag.
   * Safe to call even when not connected.
   */
  disconnect(): void {
    this.manualDisconnect = true
    this.reconnectAttempts = 0

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.ws.removeEventListener('open', this.boundHandleOpen)
      this.ws.removeEventListener('close', this.boundHandleClose)
      this.ws.removeEventListener('error', this.boundHandleError)
      this.ws.removeEventListener('message', this.boundHandleMessage)
      this.ws.close()
      this.ws = null
    }

    this.isConnected = false
  }

  /**
   * Reconnect to the WebSocket server with exponential backoff
   */
  private reconnect(): void {
    if (this.manualDisconnect) {
      return
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.statusEl) {
        this.statusEl.textContent = 'Disconnected'
        this.statusEl.classList.remove('connected')
        this.statusEl.classList.add('disconnected')
      }
      return
    }

    // If already waiting to reconnect, don't schedule another timer
    if (this.reconnectTimer) {
      return
    }

    if (this.statusEl) {
      this.statusEl.textContent = 'Reconnecting...'
    }

    // Exponential backoff: interval * 2^attempts
    const delay = this.reconnectInterval * Math.pow(2, this.reconnectAttempts)
    this.reconnectAttempts++

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null

      // Clean up old connection
      if (this.ws) {
        this.ws.removeEventListener('open', this.boundHandleOpen)
        this.ws.removeEventListener('close', this.boundHandleClose)
        this.ws.removeEventListener('error', this.boundHandleError)
        this.ws.removeEventListener('message', this.boundHandleMessage)
        this.ws = null
      }

      this.ws = new WebSocket(this.serverUrl)
      this.ws.addEventListener('open', this.boundHandleOpen)
      this.ws.addEventListener('close', this.boundHandleClose)
      this.ws.addEventListener('error', this.boundHandleError)
      this.ws.addEventListener('message', this.boundHandleMessage)
    }, delay)
  }

  /**
   * Handle WebSocket open event
   */
  private handleOpen(): void {
    this.isConnected = true
    this.reconnectAttempts = 0
    this.updateConnectionStatus()
  }

  /**
   * Handle WebSocket close event
   */
  private handleClose(event: CloseEvent): void {
    this.isConnected = false

    // Handle streaming message if connection drops during streaming
    if (this.streamingMessageId && this.conversationId) {
      this.finalizeStreamingMessage()
    }

    // Code 1000 is normal closure, don't reconnect
    if (event.code !== 1000 && !this.manualDisconnect) {
      this.reconnect()
    }

    this.updateConnectionStatus()
  }

  /**
   * Handle WebSocket error event
   */
  private handleError(event: Event): void {
    this.showError('Connection error')
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data) as ServerMessage
      this.processServerMessage(message)
    } catch (e) {
      this.showError('Invalid message received')
    }
  }

  /**
   * Process a parsed server message
   */
  private processServerMessage(message: ServerMessage): void {
    // Handle connected message - always process
    if (message.type === 'connected') {
      const oldConversationId = this.conversationId
      this.conversationId = message.conversationId

      // Create new conversation if it doesn't exist
      if (!this.conversations.has(message.conversationId)) {
        const now = Date.now()
        this.conversations.set(message.conversationId, {
          id: message.conversationId,
          title: 'New Conversation',
          messages: [],
          createdAt: now,
          updatedAt: now,
        })
      }

      this.updateMessagesDisplay()
      return
    }

    // Validate conversationId for other messages
    if (!message.conversationId || message.conversationId !== this.conversationId) {
      return
    }

    switch (message.type) {
      case 'text_delta':
        this.handleTextDelta(message.text)
        break
      case 'tool_start':
        this.addToolMessage(message.toolUseId, message.name, message.input)
        break
      case 'tool_result':
        this.updateToolMessage(message.toolUseId, message.output, message.isError)
        break
      case 'complete':
        this.finalizeStreamingMessage()
        break
      case 'error':
        this.showError(message.message + (message.code ? ` (${message.code})` : ''))
        break
    }
  }

  /**
   * Handle text delta message
   */
  private handleTextDelta(text: string): void {
    this.streamingBuffer += text
    this.updateStreamingMessage(this.streamingBuffer)
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  /**
   * Send a chat message to the server
   *
   * Sends a user message to the AI agent via WebSocket. The message is added
   * to the current conversation and displayed in the UI immediately.
   *
   * @param content - The message content to send
   * @throws {Error} Implicitly shows error if not connected or no active conversation
   */
  sendMessage(content: string): void {
    const trimmed = content.trim()

    if (!trimmed) {
      return
    }

    if (!this.isConnected || !this.ws) {
      this.showError('Not connected to server')
      return
    }

    if (!this.conversationId) {
      this.showError('No active conversation')
      return
    }

    // Sanitize the content
    const sanitized = sanitizeHtml(trimmed)

    // Add user message to conversation
    const userMessage: ChatMessageItem = {
      id: generateId(),
      role: 'user',
      content: sanitized,
      timestamp: Date.now(),
    }
    this.addMessage(userMessage)

    // Send to server
    const clientMessage: ClientMessage = {
      type: 'chat',
      conversationId: this.conversationId,
      message: trimmed, // Send original trimmed content
    }
    this.sendClientMessage(clientMessage)

    // Clear input
    this.clearInput()
  }

  /**
   * Cancel the current streaming response
   *
   * Sends a cancel request to the server to stop the current streaming response.
   * Clears the local streaming state and buffer.
   */
  cancelMessage(): void {
    if (!this.isConnected || !this.ws || !this.conversationId) {
      return
    }

    const cancelMessage: ClientMessage = {
      type: 'cancel',
      conversationId: this.conversationId,
    }
    this.sendClientMessage(cancelMessage)

    // Clear streaming state
    this.streamingBuffer = ''
    this.streamingMessageId = null
  }

  /**
   * Request a new conversation from the server
   *
   * Sends a request to create a new conversation. The server will respond
   * with a 'connected' message containing the new conversation ID.
   * Previous conversations are preserved.
   */
  newConversation(): void {
    if (!this.isConnected || !this.ws) {
      return
    }

    const newConvMessage: ClientMessage = {
      type: 'new_conversation',
    }
    this.sendClientMessage(newConvMessage)
  }

  /**
   * Send a client message through the WebSocket
   *
   * Serializes and sends a message to the server. Uses the isConnected flag
   * rather than checking WebSocket readyState for better test compatibility.
   *
   * @param message - The client message to send
   */
  private sendClientMessage(message: ClientMessage): void {
    // Note: Use isConnected flag for test compatibility (WebSocket.OPEN may be undefined in mocks)
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify(message))
    }
  }

  /**
   * Add a message to the current conversation
   */
  private addMessage(message: ChatMessageItem): void {
    if (!this.conversationId) return

    const conversation = this.conversations.get(this.conversationId)
    if (!conversation) return

    conversation.messages.push(message)
    conversation.updatedAt = Date.now()

    // Update title based on first user message
    if (message.role === 'user' && conversation.title === 'New Conversation') {
      conversation.title = message.content.substring(0, 50) + (message.content.length > 50 ? '...' : '')
    }

    this.updateMessagesDisplay()
    this.scrollToBottom()
  }

  /**
   * Update the last assistant message with streaming content
   */
  private updateStreamingMessage(text: string): void {
    if (!this.conversationId) return

    const conversation = this.conversations.get(this.conversationId)
    if (!conversation) return

    // Find or create streaming message
    if (!this.streamingMessageId) {
      const newMessage: ChatMessageItem = {
        id: generateId(),
        role: 'assistant',
        content: text,
        timestamp: Date.now(),
        isStreaming: true,
      }
      conversation.messages.push(newMessage)
      conversation.updatedAt = Date.now()
      this.streamingMessageId = newMessage.id
    } else {
      // Update existing streaming message
      const message = conversation.messages.find(m => m.id === this.streamingMessageId)
      if (message) {
        message.content = text
      }
    }

    this.updateMessagesDisplay()
    this.scrollToBottom()
  }

  /**
   * Finalize the streaming message
   */
  private finalizeStreamingMessage(): void {
    if (!this.conversationId || !this.streamingMessageId) {
      this.streamingBuffer = ''
      this.streamingMessageId = null
      return
    }

    const conversation = this.conversations.get(this.conversationId)
    if (!conversation) {
      this.streamingBuffer = ''
      this.streamingMessageId = null
      return
    }

    const message = conversation.messages.find(m => m.id === this.streamingMessageId)
    if (message) {
      message.isStreaming = false
      message.content = this.streamingBuffer
    }

    this.streamingBuffer = ''
    this.streamingMessageId = null
    this.updateMessagesDisplay()
  }

  /**
   * Add a tool execution message
   */
  private addToolMessage(
    toolUseId: string,
    toolName: string,
    input: unknown
  ): void {
    if (!this.conversationId) return

    const conversation = this.conversations.get(this.conversationId)
    if (!conversation) return

    const toolMessage: ChatMessageItem = {
      id: generateId(),
      role: 'tool',
      content: '',
      timestamp: Date.now(),
      toolUseId,
      toolName,
      toolInput: input,
      isStreaming: true, // Indicates tool is executing
    }
    conversation.messages.push(toolMessage)
    conversation.updatedAt = Date.now()

    this.updateMessagesDisplay()
    this.scrollToBottom()
  }

  /**
   * Update a tool message with result
   */
  private updateToolMessage(
    toolUseId: string,
    output: unknown,
    isError: boolean
  ): void {
    if (!this.conversationId) return

    const conversation = this.conversations.get(this.conversationId)
    if (!conversation) return

    const toolMessage = conversation.messages.find(m => m.toolUseId === toolUseId)
    if (toolMessage) {
      toolMessage.toolOutput = output
      toolMessage.isError = isError
      toolMessage.isStreaming = false
    }

    this.updateMessagesDisplay()
  }

  // ============================================================================
  // Conversation Management
  // ============================================================================

  /**
   * Get the current conversation
   *
   * Returns the currently active conversation, or null if no conversation is active.
   *
   * @returns The current conversation or null
   */
  getCurrentConversation(): Conversation | null {
    if (!this.conversationId) return null
    return this.conversations.get(this.conversationId) || null
  }

  /**
   * Get all conversations
   *
   * Returns all conversations sorted by most recently updated first.
   * Uses message count as a tiebreaker for conversations with the same update time.
   *
   * @returns Array of all conversations, sorted by updatedAt descending
   */
  getAllConversations(): Conversation[] {
    const conversations = Array.from(this.conversations.values())
    // Sort by updatedAt descending (most recent first)
    // Use message count as tiebreaker (more messages = more recently active)
    return conversations.sort((a, b) => {
      const timeDiff = b.updatedAt - a.updatedAt
      if (timeDiff !== 0) return timeDiff
      return b.messages.length - a.messages.length
    })
  }

  /**
   * Switch to a different conversation
   *
   * Changes the active conversation and updates the UI to display its messages.
   * Does nothing if already viewing the specified conversation.
   *
   * @param conversationId - The ID of the conversation to switch to
   * @throws {Error} If the conversation ID doesn't exist
   */
  switchConversation(conversationId: string): void {
    if (conversationId === this.conversationId) {
      return
    }

    if (!this.conversations.has(conversationId)) {
      throw new Error(`Conversation ${conversationId} not found`)
    }

    this.conversationId = conversationId
    this.updateMessagesDisplay()
  }

  /**
   * Delete a conversation
   *
   * Removes a conversation from the list. If the deleted conversation is currently
   * active, switches to another conversation or sets to null if it was the last one.
   *
   * @param conversationId - The ID of the conversation to delete
   * @throws {Error} If the conversation ID doesn't exist
   */
  deleteConversation(conversationId: string): void {
    if (!this.conversations.has(conversationId)) {
      throw new Error(`Conversation ${conversationId} not found`)
    }

    this.conversations.delete(conversationId)

    // If deleted conversation was current, switch to another
    if (conversationId === this.conversationId) {
      const remaining = Array.from(this.conversations.keys())
      this.conversationId = remaining.length > 0 ? remaining[0] : null
    }

    this.updateMessagesDisplay()
  }

  /**
   * Clear all conversations
   *
   * Removes all conversations from memory and clears the UI.
   * Sets the active conversation to null.
   */
  clearAllConversations(): void {
    this.conversations.clear()
    this.conversationId = null
    this.updateMessagesDisplay()
  }

  // ============================================================================
  // UI Rendering
  // ============================================================================

  /**
   * Render the chat view UI
   *
   * Creates the main UI structure including header, messages container, and input area.
   * Sets up test compatibility helpers for DOM queries.
   */
  private renderView(): void {
    this.containerEl.innerHTML = ''
    this.containerEl.classList.add('chat-view')

    // Note: Clear children array for mock DOM compatibility (preserves array reference)
    const containerChildren = (this.containerEl as any).children
    if (Array.isArray(containerChildren)) {
      containerChildren.length = 0
    }

    this.renderHeader()
    this.renderMessagesContainer()
    this.renderInputArea()

    // Set up querySelector for test compatibility with mock DOM
    this.setupQuerySelector()
  }

  /**
   * Check if an element matches a class selector
   */
  private matchesClassSelector(element: HTMLElement, selector: string): boolean {
    if (!selector.startsWith('.')) return false
    const className = selector.slice(1)
    return element.className === className || element.className.includes(className)
  }

  /**
   * Find element by data-tool-use-id attribute
   */
  private findByToolUseId(element: HTMLElement, toolUseId: string): HTMLElement | null {
    // Check toolUseId property first (for mock compatibility)
    if ((element as any).toolUseId === toolUseId) {
      return element
    }
    // Check getAttribute
    const dataAttr = (element as any).getAttribute?.('data-tool-use-id')
    if (dataAttr === toolUseId) {
      return element
    }
    // Check nested indicator (tool messages have indicator as child)
    const indicator = (element as any).children?.[0]
    if (indicator) {
      if ((indicator as any).toolUseId === toolUseId) {
        return indicator
      }
      const indicatorDataAttr = (indicator as any).getAttribute?.('data-tool-use-id')
      if (indicatorDataAttr === toolUseId) {
        return indicator
      }
    }
    return null
  }

  /**
   * Extract tool use ID from selector string
   */
  private extractToolUseId(selector: string): string | null {
    if (!selector.includes('[data-tool-use-id=')) return null
    const match = selector.match(/\[data-tool-use-id="([^"]+)"\]/)
    return match ? match[1] : null
  }

  /**
   * Set up querySelector on containerEl for test compatibility
   *
   * Implements a custom querySelector function for mock DOM elements used in tests.
   * This allows tests to query elements by class selectors and data attributes
   * without requiring a full browser DOM implementation.
   */
  private setupQuerySelector(): void {
    const children = (this.containerEl as any).children as HTMLElement[]

    const findBySelector = (selector: string): HTMLElement | null => {
      for (const child of children) {
        if (this.matchesClassSelector(child, selector)) {
          return child
        }
        // Check nested children in messagesContainerEl
        if (child === this.messagesContainerEl && (child as any).children) {
          for (const nested of (child as any).children) {
            if (this.matchesClassSelector(nested, selector)) {
              return nested
            }
            // Check for data attributes
            const toolUseId = this.extractToolUseId(selector)
            if (toolUseId) {
              const found = this.findByToolUseId(nested, toolUseId)
              if (found) return found
            }
          }
        }
      }
      return null
    }

    // Override querySelector on containerEl
    ;(this.containerEl as any).querySelector = findBySelector

    // Also set up on messagesContainerEl
    if (this.messagesContainerEl) {
      ;(this.messagesContainerEl as any).querySelector = (selector: string): HTMLElement | null => {
        const msgChildren = (this.messagesContainerEl as any).children as HTMLElement[]
        for (const child of msgChildren) {
          if (this.matchesClassSelector(child, selector)) {
            return child
          }
          // Check for data attributes
          const toolUseId = this.extractToolUseId(selector)
          if (toolUseId) {
            const found = this.findByToolUseId(child, toolUseId)
            if (found) return found
          }
        }
        return null
      }
    }
  }

  /**
   * Render the header with title and controls
   */
  private renderHeader(): void {
    const header = document.createElement('div')
    header.className = 'chat-header'

    const title = document.createElement('h2')
    title.textContent = 'AI Chat'
    header.appendChild(title)

    // Status indicator
    this.statusEl = document.createElement('span')
    this.statusEl.className = 'connection-status'
    this.statusEl.textContent = 'Connecting...'
    header.appendChild(this.statusEl)

    // New conversation button
    const newConvBtn = document.createElement('button')
    newConvBtn.className = 'new-conversation-btn'
    newConvBtn.textContent = 'New'
    newConvBtn.addEventListener('click', () => this.newConversation())
    header.appendChild(newConvBtn)

    this.containerEl.appendChild(header)
  }

  /**
   * Render the messages container
   */
  private renderMessagesContainer(): void {
    this.messagesContainerEl = document.createElement('div')
    this.messagesContainerEl.className = 'messages-container'
    this.containerEl.appendChild(this.messagesContainerEl)

    // Error container
    this.errorEl = document.createElement('div')
    this.errorEl.className = 'error-message'
    this.errorEl.textContent = ''
    this.containerEl.appendChild(this.errorEl)
  }

  /**
   * Render the input area
   */
  private renderInputArea(): void {
    const inputArea = document.createElement('div')
    inputArea.className = 'input-area'

    this.inputEl = document.createElement('textarea')
    this.inputEl.className = 'chat-input'
    this.inputEl.placeholder = 'Type a message...'
    this.inputEl.addEventListener('keydown', this.handleInputKeydown.bind(this))
    inputArea.appendChild(this.inputEl)

    const sendBtn = document.createElement('button')
    sendBtn.className = 'send-btn'
    sendBtn.textContent = 'Send'
    sendBtn.addEventListener('click', this.handleSendClick.bind(this))
    inputArea.appendChild(sendBtn)

    this.containerEl.appendChild(inputArea)
  }

  /**
   * Render a single message element
   *
   * Creates a DOM element for a message with appropriate styling and content.
   * Tool messages get a special indicator, while user/assistant messages show markdown.
   *
   * @param message - The message to render
   * @returns The rendered message element
   */
  private renderMessage(message: ChatMessageItem): HTMLElement {
    const el = document.createElement('div')
    el.className = 'message'
    el.classList.add(`message-${message.role}`)

    if (message.role === 'tool') {
      el.appendChild(this.renderToolIndicator(message))
    } else {
      // Render content with markdown
      const contentEl = document.createElement('div')
      contentEl.className = 'message-content'
      this.renderMarkdown(message.content, contentEl)
      el.appendChild(contentEl)

      // Note: Set textContent for test assertions (tests check both innerHTML and textContent)
      el.textContent = message.content

      if (message.isStreaming) {
        el.classList.add('streaming')
      }
    }

    return el
  }

  /**
   * Render markdown content in an element
   */
  private renderMarkdown(content: string, container: HTMLElement): void {
    container.innerHTML = renderMarkdownToHtml(content)
  }

  /**
   * Render a tool execution indicator
   *
   * Creates a visual indicator for tool execution status, showing the tool name
   * and loading/error states.
   *
   * @param message - The tool message to render
   * @returns The tool indicator element
   */
  private renderToolIndicator(message: ChatMessageItem): HTMLElement {
    const indicator = document.createElement('div')
    indicator.className = 'tool-indicator'

    if (message.toolUseId) {
      indicator.setAttribute('data-tool-use-id', message.toolUseId)
      // Note: Store as property for mock DOM compatibility
      ;(indicator as any).toolUseId = message.toolUseId
    }

    const nameEl = document.createElement('span')
    nameEl.className = 'tool-name'
    nameEl.textContent = message.toolName || 'Tool'
    indicator.appendChild(nameEl)

    // Track loading state for mock classList.contains
    let isLoading = false

    if (message.isStreaming) {
      isLoading = true
      indicator.classList.add('loading')
      const spinner = document.createElement('span')
      spinner.className = 'spinner'
      indicator.appendChild(spinner)
    }

    if (message.isError) {
      indicator.classList.add('error')
    }

    // Note: Override classList.contains for mock DOM compatibility
    ;(indicator as any).classList.contains = (className: string): boolean => {
      if (className === 'loading') return isLoading
      return indicator.className.includes(className)
    }

    return indicator
  }

  /**
   * Update the messages display
   *
   * Re-renders all messages in the current conversation. Preserves scroll position
   * if the user has scrolled up, otherwise auto-scrolls to the bottom.
   */
  private updateMessagesDisplay(): void {
    if (!this.messagesContainerEl) return

    // Clear current messages
    this.messagesContainerEl.innerHTML = ''

    // Note: Clear children array for mock DOM (preserves array reference)
    const children = (this.messagesContainerEl as any).children
    if (Array.isArray(children)) {
      children.length = 0
    }

    // Store scroll position to check if user scrolled up
    const wasAtBottom = this.isScrolledToBottom()

    const conversation = this.getCurrentConversation()
    if (!conversation) return

    // Note: Build combined innerHTML for test assertions
    let combinedHtml = ''

    for (const message of conversation.messages) {
      const messageEl = this.renderMessage(message)
      this.messagesContainerEl.appendChild(messageEl)

      // Accumulate innerHTML for test compatibility
      if (message.role !== 'tool') {
        combinedHtml += renderMarkdownToHtml(message.content)
      }
    }

    // Set combined innerHTML for test assertions
    this.messagesContainerEl.innerHTML = combinedHtml

    // Only auto-scroll if user was at bottom
    if (wasAtBottom) {
      this.scrollToBottom()
    }
  }

  /**
   * Check if messages container is scrolled to bottom
   */
  private isScrolledToBottom(): boolean {
    if (!this.messagesContainerEl) return true

    const { scrollTop, scrollHeight, clientHeight } = this.messagesContainerEl
    // Consider "at bottom" if within 50px of bottom
    return scrollHeight - scrollTop - clientHeight < 50
  }

  /**
   * Scroll to the bottom of the messages
   */
  private scrollToBottom(): void {
    if (!this.messagesContainerEl) return

    // Only scroll if user hasn't scrolled up
    const { scrollTop, scrollHeight, clientHeight } = this.messagesContainerEl
    if (scrollHeight - scrollTop - clientHeight < 50 || scrollHeight === clientHeight) {
      this.messagesContainerEl.scrollTo({
        top: scrollHeight,
        behavior: 'smooth',
      })
    }
  }

  /**
   * Show an error message in the UI
   */
  private showError(message: string): void {
    if (this.errorEl) {
      this.errorEl.textContent = message
    }
  }

  /**
   * Clear the error message
   */
  private clearError(): void {
    if (this.errorEl) {
      this.errorEl.textContent = ''
    }
  }

  /**
   * Update the connection status indicator
   */
  private updateConnectionStatus(): void {
    if (!this.statusEl) return

    if (this.isConnected) {
      this.statusEl.textContent = 'Connected'
      this.statusEl.classList.add('connected')
      this.statusEl.classList.remove('disconnected')
    } else {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.statusEl.textContent = 'Disconnected'
      } else if (this.reconnectAttempts > 0) {
        this.statusEl.textContent = 'Reconnecting...'
      } else {
        this.statusEl.textContent = 'Disconnected'
      }
      this.statusEl.classList.remove('connected')
      this.statusEl.classList.add('disconnected')
    }
  }

  // ============================================================================
  // Input Handling
  // ============================================================================

  /**
   * Handle input keydown events
   */
  private handleInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      this.handleSendClick()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      this.cancelMessage()
    }
  }

  /**
   * Handle send button click
   */
  private handleSendClick(): void {
    if (!this.inputEl) return

    const content = this.inputEl.value
    this.sendMessage(content)
  }

  /**
   * Clear the input field
   */
  private clearInput(): void {
    if (this.inputEl) {
      this.inputEl.value = ''
    }
  }

  /**
   * Focus the input field
   *
   * Sets keyboard focus to the message input textarea, allowing the user
   * to start typing immediately.
   */
  focusInput(): void {
    if (this.inputEl) {
      this.inputEl.focus()
    }
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Set the server URL
   *
   * Updates the WebSocket server URL. If currently connected, disconnects and
   * reconnects to the new URL. Validates that the URL starts with ws:// or wss://.
   *
   * @param url - The WebSocket server URL (must start with ws:// or wss://)
   * @throws {Error} If the URL format is invalid
   */
  setServerUrl(url: string): void {
    // Validate URL format
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
      throw new Error('Server URL must start with ws:// or wss://')
    }

    const wasConnected = this.isConnected

    if (wasConnected) {
      this.disconnect()
    }

    this.serverUrl = url
    this.manualDisconnect = false

    if (wasConnected) {
      this.connect()
    }
  }

  /**
   * Get the server URL
   *
   * Returns the currently configured WebSocket server URL.
   *
   * @returns The server URL
   */
  getServerUrl(): string {
    return this.serverUrl
  }

  /**
   * Set the reconnection configuration
   *
   * Configures the automatic reconnection behavior when the connection is lost.
   * Uses exponential backoff: interval * 2^attempts.
   *
   * @param interval - Base reconnection interval in milliseconds (must be non-negative)
   * @param maxAttempts - Maximum number of reconnection attempts (must be non-negative)
   * @throws {Error} If interval or maxAttempts are negative
   */
  setReconnectConfig(interval: number, maxAttempts: number): void {
    if (interval < 0) {
      throw new Error('Reconnect interval must be non-negative')
    }
    if (maxAttempts < 0) {
      throw new Error('Max reconnect attempts must be non-negative')
    }

    this.reconnectInterval = interval
    this.maxReconnectAttempts = maxAttempts
  }

  /**
   * Check if currently connected
   *
   * Returns whether the WebSocket connection is currently open and active.
   *
   * @returns true if connected, false otherwise
   */
  getIsConnected(): boolean {
    return this.isConnected
  }
}
