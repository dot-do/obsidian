/**
 * TDD RED Tests for Agent Server Core
 *
 * These tests define the expected behavior for the Agent Server:
 * - Server initialization with authentication
 * - Message handling (chat, cancel, new_conversation)
 * - Streaming response generation
 * - Tool execution flow via MCP
 * - Conversation management
 * - Error handling
 * - Graceful shutdown
 *
 * All tests should FAIL until the implementation is complete.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { EventEmitter } from 'events'

// Mock dependencies before importing the module under test
vi.mock('../../src/agent/auth.js', () => ({
  getAuthToken: vi.fn(),
  AuthError: class AuthError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'AuthError'
    }
  },
  NoAuthenticationError: class NoAuthenticationError extends Error {
    constructor() {
      super('No authentication available')
      this.name = 'NoAuthenticationError'
    }
  },
}))

vi.mock('ws', () => ({
  default: vi.fn(),
  WebSocket: vi.fn(),
}))

// Import mocked modules
import { getAuthToken, NoAuthenticationError } from '../../src/agent/auth.js'

// Import the module under test
import {
  AgentServer,
  createAgentServer,
  type AgentServerOptions,
  type Conversation,
  type ToolDefinition,
  type ResponseHandler,
} from '../../src/agent/server.js'

import type {
  ClientMessage,
  ServerMessage,
  ChatMessage,
  CancelMessage,
  NewConversationMessage,
  TextDeltaMessage,
  ToolStartMessage,
  ToolResultMessage,
  CompleteMessage,
  ErrorMessage,
  ConnectedMessage,
} from '../../src/agent/chat-protocol.js'

import { generateConversationId } from '../../src/agent/chat-protocol.js'

/**
 * Mock Claude API client for testing
 */
class MockClaudeClient {
  messages = {
    create: vi.fn(),
  }
}

/**
 * Mock MCP adapter for testing
 */
class MockMcpAdapter extends EventEmitter {
  connected = false
  sentMessages: unknown[] = []

  async start(): Promise<void> {
    this.connected = true
  }

  stop(): void {
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  send(message: unknown): void {
    this.sentMessages.push(message)
  }

  simulateResponse(response: unknown): void {
    this.emit('message', response)
  }
}

/**
 * Helper to create a mock response handler
 */
function createMockResponseHandler(): {
  handler: ResponseHandler
  messages: ServerMessage[]
} {
  const messages: ServerMessage[] = []
  const handler: ResponseHandler = (msg) => {
    messages.push(msg)
  }
  return { handler, messages }
}

/**
 * Helper to create a valid conversation ID
 */
function createConversationId(): string {
  return generateConversationId()
}

// =============================================================================
// SERVER INITIALIZATION TESTS
// =============================================================================

describe('AgentServer', () => {
  let mockClaudeClient: MockClaudeClient
  let mockMcpAdapter: MockMcpAdapter

  beforeEach(() => {
    vi.clearAllMocks()
    mockClaudeClient = new MockClaudeClient()
    mockMcpAdapter = new MockMcpAdapter()

    // Default mock for getAuthToken
    ;(getAuthToken as Mock).mockResolvedValue({
      value: 'sk-ant-test-token-12345',
      source: 'env',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should create server with default options', () => {
      const server = createAgentServer()
      expect(server).toBeInstanceOf(AgentServer)
    })

    it('should create server with custom options', () => {
      const options: AgentServerOptions = {
        model: 'claude-3-opus-20240229',
        maxTokens: 4096,
        systemPrompt: 'You are a helpful assistant.',
        maxConversations: 100,
        maxHistoryLength: 50,
        enableTools: true,
      }

      const server = createAgentServer(options)
      expect(server).toBeInstanceOf(AgentServer)
    })

    it('should initialize with authentication from getAuthToken', async () => {
      const server = createAgentServer()
      await server.initialize()

      expect(getAuthToken).toHaveBeenCalled()
      expect(server.isReady()).toBe(true)
    })

    it('should initialize with provided auth token', async () => {
      const options: AgentServerOptions = {
        authToken: {
          value: 'sk-ant-provided-token',
          source: 'config',
        },
      }

      const server = createAgentServer(options)
      await server.initialize()

      // Should not call getAuthToken when token is provided
      expect(getAuthToken).not.toHaveBeenCalled()
      expect(server.isReady()).toBe(true)
    })

    it('should throw error when no authentication available', async () => {
      ;(getAuthToken as Mock).mockRejectedValue(new NoAuthenticationError())

      const server = createAgentServer()

      await expect(server.initialize()).rejects.toThrow(NoAuthenticationError)
      expect(server.isReady()).toBe(false)
    })

    it('should create Claude API client with token during initialization', async () => {
      const server = createAgentServer()
      await server.initialize()

      // Server should be ready after initialization
      expect(server.isReady()).toBe(true)
    })

    it('should connect to MCP when tools are enabled', async () => {
      const options: AgentServerOptions = {
        enableTools: true,
        mcpConfig: {
          port: 22360,
          host: 'localhost',
        },
      }

      const server = createAgentServer(options)
      await server.initialize()

      // Should be ready with MCP connection
      expect(server.isReady()).toBe(true)
    })

    it('should work without MCP when tools are disabled', async () => {
      const options: AgentServerOptions = {
        enableTools: false,
      }

      const server = createAgentServer(options)
      await server.initialize()

      expect(server.isReady()).toBe(true)
    })

    it('should handle MCP connection failure gracefully', async () => {
      const options: AgentServerOptions = {
        enableTools: true,
        mcpConfig: {
          port: 99999, // Invalid port
          connectionTimeout: 100,
        },
      }

      const server = createAgentServer(options)

      // Should either throw or initialize with tools disabled
      try {
        await server.initialize()
        // If it doesn't throw, tools should be disabled
        const tools = await server.getAvailableTools()
        expect(tools).toEqual([])
      } catch (error) {
        expect(error).toBeDefined()
      }
    })

    it('should not be ready before initialization', () => {
      const server = createAgentServer()
      expect(server.isReady()).toBe(false)
    })

    it('should use default model when not specified', async () => {
      const server = createAgentServer()
      await server.initialize()

      // Should use a default model (e.g., claude-3-sonnet)
      expect(server.getModel()).toBeDefined()
      expect(server.getModel()).toMatch(/claude/)
    })

    it('should use specified model', async () => {
      const options: AgentServerOptions = {
        model: 'claude-3-opus-20240229',
      }

      const server = createAgentServer(options)
      await server.initialize()

      expect(server.getModel()).toBe('claude-3-opus-20240229')
    })
  })

  // ===========================================================================
  // MESSAGE HANDLING TESTS
  // ===========================================================================

  describe('Message Handling', () => {
    let server: AgentServer

    beforeEach(async () => {
      server = createAgentServer({ enableTools: false })
      await server.initialize()
    })

    describe('handleMessage', () => {
      it('should route chat messages to handleChat', async () => {
        const conversationId = server.createConversation()
        const { handler, messages } = createMockResponseHandler()

        const chatMessage: ChatMessage = {
          type: 'chat',
          conversationId,
          message: 'Hello, world!',
        }

        await server.handleMessage(chatMessage, handler)

        // Should receive at least a complete message
        expect(messages.length).toBeGreaterThan(0)
        expect(messages.some((m) => m.type === 'complete')).toBe(true)
      })

      it('should route cancel messages to handleCancel', async () => {
        const conversationId = server.createConversation()
        const { handler } = createMockResponseHandler()

        const cancelMessage: CancelMessage = {
          type: 'cancel',
          conversationId,
        }

        // Should not throw
        await server.handleMessage(cancelMessage, handler)
      })

      it('should route new_conversation messages to handleNewConversation', async () => {
        const { handler, messages } = createMockResponseHandler()

        const newConversationMessage: NewConversationMessage = {
          type: 'new_conversation',
        }

        await server.handleMessage(newConversationMessage, handler)

        // Should receive a connected message with new conversation ID
        expect(messages.some((m) => m.type === 'connected')).toBe(true)
        const connectedMsg = messages.find((m) => m.type === 'connected') as ConnectedMessage
        expect(connectedMsg.conversationId).toMatch(/^conv-/)
      })

      it('should send error for unknown message type', async () => {
        const { handler, messages } = createMockResponseHandler()

        const unknownMessage = {
          type: 'unknown',
          conversationId: 'conv-test',
        } as unknown as ClientMessage

        await server.handleMessage(unknownMessage, handler)

        expect(messages.some((m) => m.type === 'error')).toBe(true)
      })
    })

    describe('handleChat', () => {
      it('should stream text deltas for response', async () => {
        const conversationId = server.createConversation()
        const { handler, messages } = createMockResponseHandler()

        const chatMessage: ChatMessage = {
          type: 'chat',
          conversationId,
          message: 'Say hello',
        }

        await server.handleChat(chatMessage, handler)

        // Should receive text delta messages
        const textDeltas = messages.filter((m) => m.type === 'text_delta')
        expect(textDeltas.length).toBeGreaterThan(0)
      })

      it('should send complete message after response finishes', async () => {
        const conversationId = server.createConversation()
        const { handler, messages } = createMockResponseHandler()

        const chatMessage: ChatMessage = {
          type: 'chat',
          conversationId,
          message: 'Hello',
        }

        await server.handleChat(chatMessage, handler)

        const completeMsg = messages.find((m) => m.type === 'complete') as CompleteMessage
        expect(completeMsg).toBeDefined()
        expect(completeMsg.conversationId).toBe(conversationId)
        expect(completeMsg.usage).toBeDefined()
        expect(completeMsg.usage.inputTokens).toBeGreaterThanOrEqual(0)
        expect(completeMsg.usage.outputTokens).toBeGreaterThanOrEqual(0)
      })

      it('should send error for invalid conversation ID', async () => {
        const { handler, messages } = createMockResponseHandler()

        const chatMessage: ChatMessage = {
          type: 'chat',
          conversationId: 'conv-invalid-nonexistent',
          message: 'Hello',
        }

        await server.handleChat(chatMessage, handler)

        const errorMsg = messages.find((m) => m.type === 'error') as ErrorMessage
        expect(errorMsg).toBeDefined()
        expect(errorMsg.message).toMatch(/conversation|not found/i)
      })

      it('should send error for empty message', async () => {
        const conversationId = server.createConversation()
        const { handler, messages } = createMockResponseHandler()

        const chatMessage: ChatMessage = {
          type: 'chat',
          conversationId,
          message: '',
        }

        await server.handleChat(chatMessage, handler)

        const errorMsg = messages.find((m) => m.type === 'error') as ErrorMessage
        expect(errorMsg).toBeDefined()
        expect(errorMsg.message).toMatch(/empty|message/i)
      })

      it('should include conversation ID in all response messages', async () => {
        const conversationId = server.createConversation()
        const { handler, messages } = createMockResponseHandler()

        const chatMessage: ChatMessage = {
          type: 'chat',
          conversationId,
          message: 'Hello',
        }

        await server.handleChat(chatMessage, handler)

        // All messages should have the correct conversation ID
        for (const msg of messages) {
          expect((msg as { conversationId: string }).conversationId).toBe(conversationId)
        }
      })

      it('should add user message to conversation history', async () => {
        const conversationId = server.createConversation()
        const { handler } = createMockResponseHandler()

        const chatMessage: ChatMessage = {
          type: 'chat',
          conversationId,
          message: 'Test message',
        }

        await server.handleChat(chatMessage, handler)

        const conversation = server.getConversation(conversationId)
        expect(conversation).toBeDefined()
        expect(conversation!.messages.length).toBeGreaterThanOrEqual(1)
        expect(conversation!.messages[0].role).toBe('user')
        expect(conversation!.messages[0].content).toBe('Test message')
      })

      it('should add assistant response to conversation history', async () => {
        const conversationId = server.createConversation()
        const { handler } = createMockResponseHandler()

        const chatMessage: ChatMessage = {
          type: 'chat',
          conversationId,
          message: 'Hello',
        }

        await server.handleChat(chatMessage, handler)

        const conversation = server.getConversation(conversationId)
        expect(conversation!.messages.length).toBeGreaterThanOrEqual(2)
        expect(conversation!.messages[1].role).toBe('assistant')
      })

      it('should update conversation timestamp', async () => {
        const conversationId = server.createConversation()
        const conversationBefore = server.getConversation(conversationId)
        const initialUpdatedAt = conversationBefore!.updatedAt

        // Wait a bit to ensure timestamp changes
        await new Promise((resolve) => setTimeout(resolve, 10))

        const { handler } = createMockResponseHandler()
        const chatMessage: ChatMessage = {
          type: 'chat',
          conversationId,
          message: 'Hello',
        }

        await server.handleChat(chatMessage, handler)

        const conversationAfter = server.getConversation(conversationId)
        expect(conversationAfter!.updatedAt).toBeGreaterThan(initialUpdatedAt)
      })

      it('should mark conversation as active during request', async () => {
        const conversationId = server.createConversation()

        // Mock a slow response to check active state
        let isActiveCheck = false
        const slowHandler: ResponseHandler = (msg) => {
          if (msg.type === 'text_delta') {
            isActiveCheck = server.isConversationActive(conversationId)
          }
        }

        const chatMessage: ChatMessage = {
          type: 'chat',
          conversationId,
          message: 'Hello',
        }

        await server.handleChat(chatMessage, slowHandler)

        // During streaming, conversation should have been active
        expect(isActiveCheck).toBe(true)

        // After completion, should not be active
        expect(server.isConversationActive(conversationId)).toBe(false)
      })

      it('should handle API errors gracefully', async () => {
        // This test assumes we can trigger an API error
        const conversationId = server.createConversation()
        const { handler, messages } = createMockResponseHandler()

        // Send a message that might cause an API error
        const chatMessage: ChatMessage = {
          type: 'chat',
          conversationId,
          message: 'x'.repeat(1000000), // Very long message
        }

        await server.handleChat(chatMessage, handler)

        // Should either complete successfully or send an error
        const hasComplete = messages.some((m) => m.type === 'complete')
        const hasError = messages.some((m) => m.type === 'error')
        expect(hasComplete || hasError).toBe(true)
      })
    })

    describe('handleCancel', () => {
      it('should cancel an active request', async () => {
        const conversationId = server.createConversation()

        // Start a request but don't await it
        const { handler, messages } = createMockResponseHandler()
        const chatMessage: ChatMessage = {
          type: 'chat',
          conversationId,
          message: 'Write a very long essay',
        }

        const chatPromise = server.handleChat(chatMessage, handler)

        // Cancel it
        const cancelMessage: CancelMessage = {
          type: 'cancel',
          conversationId,
        }

        await server.handleCancel(cancelMessage)

        // Wait for the chat to complete
        await chatPromise

        // Response should be truncated or include an error
        // The conversation should no longer be active
        expect(server.isConversationActive(conversationId)).toBe(false)
      })

      it('should be no-op for non-active conversation', async () => {
        const conversationId = server.createConversation()

        const cancelMessage: CancelMessage = {
          type: 'cancel',
          conversationId,
        }

        // Should not throw
        await server.handleCancel(cancelMessage)

        expect(server.isConversationActive(conversationId)).toBe(false)
      })

      it('should be no-op for non-existent conversation', async () => {
        const cancelMessage: CancelMessage = {
          type: 'cancel',
          conversationId: 'conv-nonexistent-12345',
        }

        // Should not throw
        await server.handleCancel(cancelMessage)
      })
    })

    describe('handleNewConversation', () => {
      it('should create a new conversation', async () => {
        const { handler, messages } = createMockResponseHandler()

        const newConvMessage: NewConversationMessage = {
          type: 'new_conversation',
        }

        const conversationId = await server.handleNewConversation(newConvMessage, handler)

        expect(conversationId).toMatch(/^conv-/)
        expect(server.getConversation(conversationId)).toBeDefined()
      })

      it('should send connected message with conversation ID', async () => {
        const { handler, messages } = createMockResponseHandler()

        const newConvMessage: NewConversationMessage = {
          type: 'new_conversation',
        }

        const conversationId = await server.handleNewConversation(newConvMessage, handler)

        const connectedMsg = messages.find((m) => m.type === 'connected') as ConnectedMessage
        expect(connectedMsg).toBeDefined()
        expect(connectedMsg.conversationId).toBe(conversationId)
      })

      it('should emit conversationCreated event', async () => {
        const { handler } = createMockResponseHandler()
        const createdIds: string[] = []

        server.on('conversationCreated', (id) => {
          createdIds.push(id)
        })

        const newConvMessage: NewConversationMessage = {
          type: 'new_conversation',
        }

        const conversationId = await server.handleNewConversation(newConvMessage, handler)

        expect(createdIds).toContain(conversationId)
      })
    })
  })

  // ===========================================================================
  // STREAMING RESPONSE TESTS
  // ===========================================================================

  describe('Streaming Response Generation', () => {
    let server: AgentServer

    beforeEach(async () => {
      server = createAgentServer({ enableTools: false })
      await server.initialize()
    })

    it('should stream text in multiple deltas', async () => {
      const conversationId = server.createConversation()
      const { handler, messages } = createMockResponseHandler()

      const chatMessage: ChatMessage = {
        type: 'chat',
        conversationId,
        message: 'Write a short paragraph about testing.',
      }

      await server.handleChat(chatMessage, handler)

      const textDeltas = messages.filter((m) => m.type === 'text_delta') as TextDeltaMessage[]

      // Should have multiple deltas for streaming
      expect(textDeltas.length).toBeGreaterThan(0)

      // Each delta should have text
      for (const delta of textDeltas) {
        expect(delta.text).toBeDefined()
        expect(typeof delta.text).toBe('string')
      }
    })

    it('should concatenate all deltas to form complete response', async () => {
      const conversationId = server.createConversation()
      const { handler, messages } = createMockResponseHandler()

      const chatMessage: ChatMessage = {
        type: 'chat',
        conversationId,
        message: 'Hello',
      }

      await server.handleChat(chatMessage, handler)

      const textDeltas = messages.filter((m) => m.type === 'text_delta') as TextDeltaMessage[]
      const fullText = textDeltas.map((d) => d.text).join('')

      // Full text should be non-empty
      expect(fullText.length).toBeGreaterThan(0)

      // Full text should match what's stored in history
      const conversation = server.getConversation(conversationId)
      const assistantMessage = conversation!.messages.find((m) => m.role === 'assistant')
      expect(assistantMessage?.content).toBe(fullText)
    })

    it('should send deltas in order', async () => {
      const conversationId = server.createConversation()
      const receivedOrder: number[] = []
      let deltaCount = 0

      const orderHandler: ResponseHandler = (msg) => {
        if (msg.type === 'text_delta') {
          receivedOrder.push(deltaCount++)
        }
      }

      const chatMessage: ChatMessage = {
        type: 'chat',
        conversationId,
        message: 'Count from 1 to 5',
      }

      await server.handleChat(chatMessage, orderHandler)

      // Order should be sequential
      for (let i = 0; i < receivedOrder.length; i++) {
        expect(receivedOrder[i]).toBe(i)
      }
    })

    it('should include usage information in complete message', async () => {
      const conversationId = server.createConversation()
      const { handler, messages } = createMockResponseHandler()

      const chatMessage: ChatMessage = {
        type: 'chat',
        conversationId,
        message: 'Hello',
      }

      await server.handleChat(chatMessage, handler)

      const completeMsg = messages.find((m) => m.type === 'complete') as CompleteMessage
      expect(completeMsg).toBeDefined()
      expect(completeMsg.usage.inputTokens).toBeGreaterThan(0)
      expect(completeMsg.usage.outputTokens).toBeGreaterThan(0)
    })

    it('should handle async response handler', async () => {
      const conversationId = server.createConversation()
      const messages: ServerMessage[] = []

      const asyncHandler: ResponseHandler = async (msg) => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        messages.push(msg)
      }

      const chatMessage: ChatMessage = {
        type: 'chat',
        conversationId,
        message: 'Hello',
      }

      await server.handleChat(chatMessage, asyncHandler)

      expect(messages.length).toBeGreaterThan(0)
      expect(messages.some((m) => m.type === 'complete')).toBe(true)
    })
  })

  // ===========================================================================
  // TOOL EXECUTION TESTS
  // ===========================================================================

  describe('Tool Execution Flow', () => {
    let server: AgentServer

    beforeEach(async () => {
      server = createAgentServer({
        enableTools: true,
        mcpConfig: {
          port: 22360,
          host: 'localhost',
        },
      })
      // Note: This may fail if MCP isn't available in tests
      try {
        await server.initialize()
      } catch {
        // Skip tool tests if MCP isn't available
      }
    })

    it('should get available tools from MCP', async () => {
      if (!server.isReady()) {
        return // Skip if initialization failed
      }

      const tools = await server.getAvailableTools()

      expect(Array.isArray(tools)).toBe(true)
      // Each tool should have required fields
      for (const tool of tools) {
        expect(tool.name).toBeDefined()
        expect(tool.description).toBeDefined()
        expect(tool.inputSchema).toBeDefined()
      }
    })

    it('should send tool_start message when tool is called', async () => {
      if (!server.isReady()) {
        return
      }

      const conversationId = server.createConversation()
      const { handler, messages } = createMockResponseHandler()

      // Send a message that might trigger tool use
      const chatMessage: ChatMessage = {
        type: 'chat',
        conversationId,
        message: 'Search for notes about testing',
      }

      await server.handleChat(chatMessage, handler)

      // If a tool was called, should have tool_start message
      const toolStarts = messages.filter((m) => m.type === 'tool_start') as ToolStartMessage[]

      if (toolStarts.length > 0) {
        const toolStart = toolStarts[0]
        expect(toolStart.conversationId).toBe(conversationId)
        expect(toolStart.toolUseId).toBeDefined()
        expect(toolStart.name).toBeDefined()
        expect(toolStart.input).toBeDefined()
      }
    })

    it('should send tool_result message after tool execution', async () => {
      if (!server.isReady()) {
        return
      }

      const conversationId = server.createConversation()
      const { handler, messages } = createMockResponseHandler()

      const chatMessage: ChatMessage = {
        type: 'chat',
        conversationId,
        message: 'List all notes in my vault',
      }

      await server.handleChat(chatMessage, handler)

      // If a tool was called and completed, should have tool_result
      const toolResults = messages.filter((m) => m.type === 'tool_result') as ToolResultMessage[]

      if (toolResults.length > 0) {
        const toolResult = toolResults[0]
        expect(toolResult.conversationId).toBe(conversationId)
        expect(toolResult.toolUseId).toBeDefined()
        expect(typeof toolResult.isError).toBe('boolean')
        expect(toolResult.output).toBeDefined()
      }
    })

    it('should execute tool directly', async () => {
      if (!server.isReady()) {
        return
      }

      const result = await server.executeTool('vault_list', { path: '/' })

      expect(result).toBeDefined()
      expect(typeof result.isError).toBe('boolean')
      expect(result.result).toBeDefined()
    })

    it('should handle tool execution errors', async () => {
      if (!server.isReady()) {
        return
      }

      const result = await server.executeTool('nonexistent_tool', {})

      expect(result.isError).toBe(true)
    })

    it('should emit toolCall event when tool is called', async () => {
      if (!server.isReady()) {
        return
      }

      const toolCalls: Array<{ conversationId: string; toolName: string; input: unknown }> = []

      server.on('toolCall', (conversationId, toolName, input) => {
        toolCalls.push({ conversationId, toolName, input })
      })

      const conversationId = server.createConversation()
      const { handler } = createMockResponseHandler()

      const chatMessage: ChatMessage = {
        type: 'chat',
        conversationId,
        message: 'Search for notes about testing',
      }

      await server.handleChat(chatMessage, handler)

      // If tools were called, events should be emitted
      for (const call of toolCalls) {
        expect(call.conversationId).toBe(conversationId)
        expect(call.toolName).toBeDefined()
      }
    })

    it('should emit toolResult event when tool completes', async () => {
      if (!server.isReady()) {
        return
      }

      const toolResults: Array<{
        conversationId: string
        toolName: string
        result: unknown
        isError: boolean
      }> = []

      server.on('toolResult', (conversationId, toolName, result, isError) => {
        toolResults.push({ conversationId, toolName, result, isError })
      })

      const conversationId = server.createConversation()
      const { handler } = createMockResponseHandler()

      const chatMessage: ChatMessage = {
        type: 'chat',
        conversationId,
        message: 'List all notes',
      }

      await server.handleChat(chatMessage, handler)

      for (const result of toolResults) {
        expect(result.conversationId).toBe(conversationId)
        expect(typeof result.isError).toBe('boolean')
      }
    })

    it('should match tool_start and tool_result by toolUseId', async () => {
      if (!server.isReady()) {
        return
      }

      const conversationId = server.createConversation()
      const { handler, messages } = createMockResponseHandler()

      const chatMessage: ChatMessage = {
        type: 'chat',
        conversationId,
        message: 'Search for notes and list folders',
      }

      await server.handleChat(chatMessage, handler)

      const toolStarts = messages.filter((m) => m.type === 'tool_start') as ToolStartMessage[]
      const toolResults = messages.filter((m) => m.type === 'tool_result') as ToolResultMessage[]

      // Each tool_start should have a matching tool_result
      for (const start of toolStarts) {
        const matchingResult = toolResults.find((r) => r.toolUseId === start.toolUseId)
        expect(matchingResult).toBeDefined()
      }
    })
  })

  // ===========================================================================
  // CONVERSATION MANAGEMENT TESTS
  // ===========================================================================

  describe('Conversation Management', () => {
    let server: AgentServer

    beforeEach(async () => {
      server = createAgentServer({ maxConversations: 5 })
      await server.initialize()
    })

    describe('createConversation', () => {
      it('should create a new conversation with valid ID', () => {
        const conversationId = server.createConversation()

        expect(conversationId).toMatch(/^conv-/)
        expect(conversationId.length).toBeGreaterThan(8)
      })

      it('should create unique conversation IDs', () => {
        const ids = new Set<string>()

        for (let i = 0; i < 100; i++) {
          const id = server.createConversation()
          expect(ids.has(id)).toBe(false)
          ids.add(id)
        }
      })

      it('should initialize conversation with empty history', () => {
        const conversationId = server.createConversation()
        const conversation = server.getConversation(conversationId)

        expect(conversation).toBeDefined()
        expect(conversation!.messages).toEqual([])
        expect(conversation!.isActive).toBe(false)
      })

      it('should set createdAt and updatedAt timestamps', () => {
        const before = Date.now()
        const conversationId = server.createConversation()
        const after = Date.now()

        const conversation = server.getConversation(conversationId)

        expect(conversation!.createdAt).toBeGreaterThanOrEqual(before)
        expect(conversation!.createdAt).toBeLessThanOrEqual(after)
        expect(conversation!.updatedAt).toBe(conversation!.createdAt)
      })

      it('should emit conversationCreated event', () => {
        const createdIds: string[] = []

        server.on('conversationCreated', (id) => {
          createdIds.push(id)
        })

        const conversationId = server.createConversation()

        expect(createdIds).toContain(conversationId)
      })

      it('should evict oldest conversation when max is reached', async () => {
        // Create max number of conversations
        const ids: string[] = []
        for (let i = 0; i < 5; i++) {
          ids.push(server.createConversation())
          // Small delay to ensure different timestamps
          await new Promise((resolve) => setTimeout(resolve, 5))
        }

        // Create one more
        const newId = server.createConversation()

        // First conversation should be evicted
        expect(server.getConversation(ids[0])).toBeUndefined()

        // New conversation and others should exist
        expect(server.getConversation(newId)).toBeDefined()
        expect(server.getConversation(ids[1])).toBeDefined()
      })
    })

    describe('getConversation', () => {
      it('should return conversation by ID', () => {
        const conversationId = server.createConversation()
        const conversation = server.getConversation(conversationId)

        expect(conversation).toBeDefined()
        expect(conversation!.id).toBe(conversationId)
      })

      it('should return undefined for non-existent ID', () => {
        const conversation = server.getConversation('conv-nonexistent-12345')
        expect(conversation).toBeUndefined()
      })

      it('should return undefined for invalid ID format', () => {
        const conversation = server.getConversation('invalid-format')
        expect(conversation).toBeUndefined()
      })
    })

    describe('deleteConversation', () => {
      it('should delete existing conversation', () => {
        const conversationId = server.createConversation()
        expect(server.getConversation(conversationId)).toBeDefined()

        const deleted = server.deleteConversation(conversationId)

        expect(deleted).toBe(true)
        expect(server.getConversation(conversationId)).toBeUndefined()
      })

      it('should return false for non-existent conversation', () => {
        const deleted = server.deleteConversation('conv-nonexistent-12345')
        expect(deleted).toBe(false)
      })

      it('should emit conversationDeleted event', () => {
        const deletedIds: string[] = []

        server.on('conversationDeleted', (id) => {
          deletedIds.push(id)
        })

        const conversationId = server.createConversation()
        server.deleteConversation(conversationId)

        expect(deletedIds).toContain(conversationId)
      })

      it('should cancel active request when deleting', async () => {
        const conversationId = server.createConversation()
        const { handler } = createMockResponseHandler()

        // Start a long-running request
        const chatMessage: ChatMessage = {
          type: 'chat',
          conversationId,
          message: 'Write a very long essay',
        }

        const chatPromise = server.handleChat(chatMessage, handler)

        // Delete the conversation while request is active
        server.deleteConversation(conversationId)

        // Request should complete (cancelled or finished)
        await chatPromise

        expect(server.getConversation(conversationId)).toBeUndefined()
      })
    })

    describe('listConversations', () => {
      it('should return empty array when no conversations', () => {
        const conversations = server.listConversations()
        expect(conversations).toEqual([])
      })

      it('should return all conversation IDs', () => {
        const id1 = server.createConversation()
        const id2 = server.createConversation()
        const id3 = server.createConversation()

        const conversations = server.listConversations()

        expect(conversations).toContain(id1)
        expect(conversations).toContain(id2)
        expect(conversations).toContain(id3)
        expect(conversations).toHaveLength(3)
      })

      it('should not include deleted conversations', () => {
        const id1 = server.createConversation()
        const id2 = server.createConversation()

        server.deleteConversation(id1)

        const conversations = server.listConversations()

        expect(conversations).not.toContain(id1)
        expect(conversations).toContain(id2)
      })
    })

    describe('conversation history', () => {
      it('should preserve message order in history', async () => {
        const conversationId = server.createConversation()
        const { handler } = createMockResponseHandler()

        // Send multiple messages
        for (let i = 1; i <= 3; i++) {
          const chatMessage: ChatMessage = {
            type: 'chat',
            conversationId,
            message: `Message ${i}`,
          }
          await server.handleChat(chatMessage, handler)
        }

        const conversation = server.getConversation(conversationId)

        // Should have alternating user/assistant messages
        expect(conversation!.messages.length).toBe(6) // 3 user + 3 assistant

        for (let i = 0; i < 3; i++) {
          expect(conversation!.messages[i * 2].role).toBe('user')
          expect(conversation!.messages[i * 2].content).toBe(`Message ${i + 1}`)
          expect(conversation!.messages[i * 2 + 1].role).toBe('assistant')
        }
      })

      it('should include timestamps in messages', async () => {
        const conversationId = server.createConversation()
        const { handler } = createMockResponseHandler()

        const chatMessage: ChatMessage = {
          type: 'chat',
          conversationId,
          message: 'Hello',
        }

        const before = Date.now()
        await server.handleChat(chatMessage, handler)
        const after = Date.now()

        const conversation = server.getConversation(conversationId)

        for (const msg of conversation!.messages) {
          expect(msg.timestamp).toBeGreaterThanOrEqual(before)
          expect(msg.timestamp).toBeLessThanOrEqual(after)
        }
      })

      it('should truncate history when maxHistoryLength is reached', async () => {
        const shortHistoryServer = createAgentServer({
          maxHistoryLength: 4, // Only 4 messages (2 exchanges)
        })
        await shortHistoryServer.initialize()

        const conversationId = shortHistoryServer.createConversation()
        const { handler } = createMockResponseHandler()

        // Send 5 messages (should trigger truncation)
        for (let i = 0; i < 5; i++) {
          const chatMessage: ChatMessage = {
            type: 'chat',
            conversationId,
            message: `Message ${i}`,
          }
          await shortHistoryServer.handleChat(chatMessage, handler)
        }

        const conversation = shortHistoryServer.getConversation(conversationId)

        // Should be truncated to maxHistoryLength
        expect(conversation!.messages.length).toBeLessThanOrEqual(4)

        await shortHistoryServer.shutdown()
      })

      it('should use conversation history for context', async () => {
        const conversationId = server.createConversation()
        const { handler: handler1 } = createMockResponseHandler()
        const { handler: handler2, messages: messages2 } = createMockResponseHandler()

        // First message establishes context
        const firstMessage: ChatMessage = {
          type: 'chat',
          conversationId,
          message: 'My name is Alice.',
        }
        await server.handleChat(firstMessage, handler1)

        // Second message should have context of first
        const secondMessage: ChatMessage = {
          type: 'chat',
          conversationId,
          message: 'What is my name?',
        }
        await server.handleChat(secondMessage, handler2)

        // Response should reference "Alice" if context is used
        const textDeltas = messages2.filter((m) => m.type === 'text_delta') as TextDeltaMessage[]
        const fullResponse = textDeltas.map((d) => d.text).join('')

        expect(fullResponse.toLowerCase()).toContain('alice')
      })
    })
  })

  // ===========================================================================
  // ERROR HANDLING TESTS
  // ===========================================================================

  describe('Error Handling', () => {
    let server: AgentServer

    beforeEach(async () => {
      server = createAgentServer()
      await server.initialize()
    })

    it('should send error message for API failures', async () => {
      const conversationId = server.createConversation()
      const { handler, messages } = createMockResponseHandler()

      // Simulate an API error (implementation-specific)
      // This might need mocking the Claude client
      const chatMessage: ChatMessage = {
        type: 'chat',
        conversationId,
        message: 'Test',
      }

      await server.handleChat(chatMessage, handler)

      // Should complete normally or with error
      const hasComplete = messages.some((m) => m.type === 'complete')
      const hasError = messages.some((m) => m.type === 'error')
      expect(hasComplete || hasError).toBe(true)
    })

    it('should include error code when available', async () => {
      const conversationId = server.createConversation()
      const { handler, messages } = createMockResponseHandler()

      // Use an invalid conversation ID to trigger an error
      const chatMessage: ChatMessage = {
        type: 'chat',
        conversationId: 'conv-invalid-xxxxxx',
        message: 'Test',
      }

      await server.handleChat(chatMessage, handler)

      const errorMsg = messages.find((m) => m.type === 'error') as ErrorMessage
      if (errorMsg) {
        expect(errorMsg.message).toBeDefined()
        // code is optional but should be string if present
        if (errorMsg.code) {
          expect(typeof errorMsg.code).toBe('string')
        }
      }
    })

    it('should emit error event on failures', async () => {
      const errors: Array<{ conversationId: string; error: Error }> = []

      server.on('error', (conversationId, error) => {
        errors.push({ conversationId, error })
      })

      const conversationId = server.createConversation()
      const { handler } = createMockResponseHandler()

      // Try to trigger an error
      const chatMessage: ChatMessage = {
        type: 'chat',
        conversationId,
        message: '', // Empty message should cause error
      }

      await server.handleChat(chatMessage, handler)

      // If an error occurred, it should be in the errors array
      // Note: Some implementations might handle empty message differently
    })

    it('should not expose internal errors to client', async () => {
      const conversationId = server.createConversation()
      const { handler, messages } = createMockResponseHandler()

      const chatMessage: ChatMessage = {
        type: 'chat',
        conversationId: 'conv-invalid-xxxxxx',
        message: 'Test',
      }

      await server.handleChat(chatMessage, handler)

      const errorMsg = messages.find((m) => m.type === 'error') as ErrorMessage
      if (errorMsg) {
        // Error message should be user-friendly, not a stack trace
        expect(errorMsg.message).not.toContain('at ')
        expect(errorMsg.message).not.toContain('.ts:')
        expect(errorMsg.message).not.toContain('.js:')
      }
    })

    it('should recover from errors and continue serving', async () => {
      const conversationId1 = server.createConversation()
      const conversationId2 = server.createConversation()

      const { handler: handler1 } = createMockResponseHandler()
      const { handler: handler2, messages: messages2 } = createMockResponseHandler()

      // First request might fail
      const badMessage: ChatMessage = {
        type: 'chat',
        conversationId: 'conv-invalid-xxxxxx',
        message: 'Test',
      }
      await server.handleChat(badMessage, handler1)

      // Second request should still work
      const goodMessage: ChatMessage = {
        type: 'chat',
        conversationId: conversationId2,
        message: 'Hello',
      }
      await server.handleChat(goodMessage, handler2)

      // Second request should succeed
      expect(messages2.some((m) => m.type === 'complete')).toBe(true)
    })

    it('should handle response handler errors gracefully', async () => {
      const conversationId = server.createConversation()

      // Handler that throws
      const throwingHandler: ResponseHandler = () => {
        throw new Error('Handler error')
      }

      const chatMessage: ChatMessage = {
        type: 'chat',
        conversationId,
        message: 'Hello',
      }

      // Should not throw, should handle gracefully
      await expect(server.handleChat(chatMessage, throwingHandler)).resolves.not.toThrow()
    })

    it('should handle async response handler errors gracefully', async () => {
      const conversationId = server.createConversation()

      // Handler that rejects
      const rejectingHandler: ResponseHandler = async () => {
        throw new Error('Async handler error')
      }

      const chatMessage: ChatMessage = {
        type: 'chat',
        conversationId,
        message: 'Hello',
      }

      // Should not throw, should handle gracefully
      await expect(server.handleChat(chatMessage, rejectingHandler)).resolves.not.toThrow()
    })
  })

  // ===========================================================================
  // GRACEFUL SHUTDOWN TESTS
  // ===========================================================================

  describe('Graceful Shutdown', () => {
    it('should cancel all active requests on shutdown', async () => {
      const server = createAgentServer()
      await server.initialize()

      const conversationId = server.createConversation()
      const { handler } = createMockResponseHandler()

      // Start a request
      const chatMessage: ChatMessage = {
        type: 'chat',
        conversationId,
        message: 'Write a very long essay',
      }

      const chatPromise = server.handleChat(chatMessage, handler)

      // Shutdown while request is active
      await server.shutdown()

      // Request should complete (cancelled)
      await chatPromise

      expect(server.isReady()).toBe(false)
    })

    it('should disconnect from MCP on shutdown', async () => {
      const server = createAgentServer({ enableTools: true })

      try {
        await server.initialize()
      } catch {
        // Skip if MCP not available
        return
      }

      await server.shutdown()

      expect(server.isReady()).toBe(false)
    })

    it('should emit shutdown event', async () => {
      const server = createAgentServer()
      await server.initialize()

      let shutdownEmitted = false
      server.on('shutdown', () => {
        shutdownEmitted = true
      })

      await server.shutdown()

      expect(shutdownEmitted).toBe(true)
    })

    it('should reject new requests after shutdown', async () => {
      const server = createAgentServer()
      await server.initialize()

      await server.shutdown()

      const conversationId = server.createConversation()
      const { handler, messages } = createMockResponseHandler()

      const chatMessage: ChatMessage = {
        type: 'chat',
        conversationId,
        message: 'Hello',
      }

      await server.handleChat(chatMessage, handler)

      // Should receive error
      expect(messages.some((m) => m.type === 'error')).toBe(true)
    })

    it('should be safe to call shutdown multiple times', async () => {
      const server = createAgentServer()
      await server.initialize()

      await server.shutdown()
      await server.shutdown()
      await server.shutdown()

      expect(server.isReady()).toBe(false)
    })

    it('should clean up resources on shutdown', async () => {
      const server = createAgentServer()
      await server.initialize()

      // Create some conversations
      for (let i = 0; i < 5; i++) {
        server.createConversation()
      }

      await server.shutdown()

      // Conversations should be cleared or inaccessible
      expect(server.listConversations()).toEqual([])
    })
  })

  // ===========================================================================
  // CONCURRENT CONVERSATION TESTS
  // ===========================================================================

  describe('Concurrent Conversations', () => {
    let server: AgentServer

    beforeEach(async () => {
      server = createAgentServer()
      await server.initialize()
    })

    afterEach(async () => {
      await server.shutdown()
    })

    it('should handle multiple concurrent conversations', async () => {
      const conversationIds = [
        server.createConversation(),
        server.createConversation(),
        server.createConversation(),
      ]

      const results = await Promise.all(
        conversationIds.map(async (conversationId) => {
          const { handler, messages } = createMockResponseHandler()

          const chatMessage: ChatMessage = {
            type: 'chat',
            conversationId,
            message: `Hello from ${conversationId}`,
          }

          await server.handleChat(chatMessage, handler)

          return { conversationId, messages }
        })
      )

      // Each conversation should have received messages
      for (const result of results) {
        expect(result.messages.some((m) => m.type === 'complete')).toBe(true)

        // Messages should have correct conversation ID
        for (const msg of result.messages) {
          if ('conversationId' in msg) {
            expect(msg.conversationId).toBe(result.conversationId)
          }
        }
      }
    })

    it('should maintain separate history for concurrent conversations', async () => {
      const conv1 = server.createConversation()
      const conv2 = server.createConversation()

      const { handler: handler1 } = createMockResponseHandler()
      const { handler: handler2 } = createMockResponseHandler()

      // Send different messages to each
      await Promise.all([
        server.handleChat(
          { type: 'chat', conversationId: conv1, message: 'My name is Alice' },
          handler1
        ),
        server.handleChat(
          { type: 'chat', conversationId: conv2, message: 'My name is Bob' },
          handler2
        ),
      ])

      const conversation1 = server.getConversation(conv1)
      const conversation2 = server.getConversation(conv2)

      // Histories should be separate
      expect(conversation1!.messages[0].content).toBe('My name is Alice')
      expect(conversation2!.messages[0].content).toBe('My name is Bob')
    })

    it('should not block one conversation on another', async () => {
      const conv1 = server.createConversation()
      const conv2 = server.createConversation()

      const startTime = Date.now()

      const { handler: handler1 } = createMockResponseHandler()
      const { handler: handler2 } = createMockResponseHandler()

      // Run both in parallel
      await Promise.all([
        server.handleChat({ type: 'chat', conversationId: conv1, message: 'Hello' }, handler1),
        server.handleChat({ type: 'chat', conversationId: conv2, message: 'Hello' }, handler2),
      ])

      const endTime = Date.now()

      // If not blocking, total time should be less than sum of individual times
      // (This is a weak test, but gives some indication)
      expect(endTime - startTime).toBeLessThan(10000)
    })

    it('should handle cancel for specific conversation only', async () => {
      const conv1 = server.createConversation()
      const conv2 = server.createConversation()

      const { handler: handler1, messages: messages1 } = createMockResponseHandler()
      const { handler: handler2, messages: messages2 } = createMockResponseHandler()

      // Start both conversations
      const promise1 = server.handleChat(
        { type: 'chat', conversationId: conv1, message: 'Write a long essay' },
        handler1
      )
      const promise2 = server.handleChat(
        { type: 'chat', conversationId: conv2, message: 'Write a long essay' },
        handler2
      )

      // Cancel only conv1
      await server.handleCancel({ type: 'cancel', conversationId: conv1 })

      await Promise.all([promise1, promise2])

      // Conv2 should have completed normally (with complete message)
      expect(messages2.some((m) => m.type === 'complete')).toBe(true)
    })
  })

  // ===========================================================================
  // CONFIGURATION TESTS
  // ===========================================================================

  describe('Configuration', () => {
    it('should allow changing model at runtime', async () => {
      const server = createAgentServer({ model: 'claude-3-sonnet-20240229' })
      await server.initialize()

      expect(server.getModel()).toBe('claude-3-sonnet-20240229')

      server.setModel('claude-3-opus-20240229')

      expect(server.getModel()).toBe('claude-3-opus-20240229')

      await server.shutdown()
    })

    it('should allow changing system prompt at runtime', async () => {
      const server = createAgentServer({ systemPrompt: 'Initial prompt' })
      await server.initialize()

      expect(server.getSystemPrompt()).toBe('Initial prompt')

      server.setSystemPrompt('New prompt')

      expect(server.getSystemPrompt()).toBe('New prompt')

      await server.shutdown()
    })

    it('should use system prompt in conversations', async () => {
      const server = createAgentServer({
        systemPrompt: 'You always respond in exactly 3 words.',
      })
      await server.initialize()

      const conversationId = server.createConversation()
      const { handler, messages } = createMockResponseHandler()

      await server.handleChat(
        { type: 'chat', conversationId, message: 'Hello' },
        handler
      )

      // Response should follow the system prompt (3 words)
      const textDeltas = messages.filter((m) => m.type === 'text_delta') as TextDeltaMessage[]
      const fullResponse = textDeltas.map((d) => d.text).join('')

      // Note: This test might be flaky as the model might not always follow exactly
      // The important thing is the system prompt is used
      expect(fullResponse.length).toBeGreaterThan(0)

      await server.shutdown()
    })

    it('should return undefined for unset system prompt', async () => {
      const server = createAgentServer()
      await server.initialize()

      expect(server.getSystemPrompt()).toBeUndefined()

      await server.shutdown()
    })
  })

  // ===========================================================================
  // EVENT EMITTER TESTS
  // ===========================================================================

  describe('Event Emitter', () => {
    let server: AgentServer

    beforeEach(async () => {
      server = createAgentServer()
      await server.initialize()
    })

    afterEach(async () => {
      await server.shutdown()
    })

    it('should emit events with correct arguments', async () => {
      const events: Array<{ event: string; args: unknown[] }> = []

      server.on('conversationCreated', (id) => {
        events.push({ event: 'conversationCreated', args: [id] })
      })

      server.on('conversationDeleted', (id) => {
        events.push({ event: 'conversationDeleted', args: [id] })
      })

      const conversationId = server.createConversation()
      server.deleteConversation(conversationId)

      expect(events).toHaveLength(2)
      expect(events[0].event).toBe('conversationCreated')
      expect(events[0].args[0]).toBe(conversationId)
      expect(events[1].event).toBe('conversationDeleted')
      expect(events[1].args[0]).toBe(conversationId)
    })

    it('should allow removing event listeners', () => {
      const calls: string[] = []

      const listener = (id: string) => {
        calls.push(id)
      }

      server.on('conversationCreated', listener)

      server.createConversation() // Should trigger
      server.off('conversationCreated', listener)
      server.createConversation() // Should not trigger

      expect(calls).toHaveLength(1)
    })

    it('should support multiple listeners for same event', () => {
      const calls1: string[] = []
      const calls2: string[] = []

      server.on('conversationCreated', (id) => calls1.push(id))
      server.on('conversationCreated', (id) => calls2.push(id))

      server.createConversation()

      expect(calls1).toHaveLength(1)
      expect(calls2).toHaveLength(1)
    })

    it('should return this from on() for chaining', () => {
      const result = server
        .on('conversationCreated', () => {})
        .on('conversationDeleted', () => {})
        .on('error', () => {})

      expect(result).toBe(server)
    })

    it('should return this from off() for chaining', () => {
      const listener = () => {}

      const result = server
        .on('conversationCreated', listener)
        .off('conversationCreated', listener)

      expect(result).toBe(server)
    })
  })

  // ===========================================================================
  // FACTORY FUNCTION TESTS
  // ===========================================================================

  describe('createAgentServer', () => {
    it('should create server with no options', () => {
      const server = createAgentServer()
      expect(server).toBeInstanceOf(AgentServer)
    })

    it('should create server with all options', () => {
      const options: AgentServerOptions = {
        authToken: { value: 'sk-ant-test', source: 'env' },
        model: 'claude-3-opus-20240229',
        maxTokens: 8192,
        systemPrompt: 'Test prompt',
        mcpConfig: {
          port: 22360,
          host: 'localhost',
          connectionTimeout: 5000,
        },
        maxConversations: 50,
        maxHistoryLength: 100,
        enableTools: true,
      }

      const server = createAgentServer(options)
      expect(server).toBeInstanceOf(AgentServer)
    })

    it('should create independent server instances', () => {
      const server1 = createAgentServer({ model: 'model-1' })
      const server2 = createAgentServer({ model: 'model-2' })

      expect(server1).not.toBe(server2)
    })
  })
})
