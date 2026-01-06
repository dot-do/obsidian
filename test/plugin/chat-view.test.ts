/**
 * TDD RED Tests for Chat View
 *
 * Comprehensive tests for the Obsidian Plugin Chat View that:
 * 1. Renders in the right sidebar
 * 2. Shows chat conversation history
 * 3. Has an input field for user messages
 * 4. Connects to Agent Server via WebSocket
 * 5. Displays streaming text responses
 * 6. Shows tool execution status (start/result)
 * 7. Renders markdown content
 * 8. Handles errors gracefully
 * 9. Supports multiple conversations
 *
 * All tests should FAIL (RED state) until implementation is complete.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import {
  ChatView,
  CHAT_VIEW_TYPE,
  type ChatViewState,
  type ChatMessageItem,
  type Conversation,
  type ChatViewConfig,
} from '../../src/plugin/chat-view.js'
import {
  type WorkspaceLeaf,
  type App,
  type Vault,
  type Workspace,
  type ViewStateResult,
} from '../../src/plugin/types.js'
import type {
  ServerMessage,
  ClientMessage,
  TextDeltaMessage,
  ToolStartMessage,
  ToolResultMessage,
  CompleteMessage,
  ErrorMessage,
  ConnectedMessage,
} from '../../src/agent/chat-protocol.js'

// ============================================================================
// Mock Helpers
// ============================================================================

/**
 * Create a mock WorkspaceLeaf
 */
function createMockLeaf(): WorkspaceLeaf {
  return {
    view: null,
    getDisplayText: vi.fn().mockReturnValue('Chat'),
    getViewState: vi.fn().mockReturnValue({}),
    setViewState: vi.fn().mockResolvedValue(undefined),
    detach: vi.fn(),
  } as unknown as WorkspaceLeaf
}

/**
 * Create a mock App instance
 */
function createMockApp(): App {
  return {
    vault: {
      getName: vi.fn().mockReturnValue('Test Vault'),
      getRoot: vi.fn(),
      getAbstractFileByPath: vi.fn(),
      read: vi.fn(),
      cachedRead: vi.fn(),
      create: vi.fn(),
      modify: vi.fn(),
      delete: vi.fn(),
      rename: vi.fn(),
      getMarkdownFiles: vi.fn().mockReturnValue([]),
    } as unknown as Vault,
    workspace: {
      getLeaf: vi.fn(),
      getLeavesOfType: vi.fn().mockReturnValue([]),
      revealLeaf: vi.fn(),
      detachLeavesOfType: vi.fn(),
      getRightLeaf: vi.fn(),
      getLeftLeaf: vi.fn(),
      on: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
      off: vi.fn(),
      trigger: vi.fn(),
    } as unknown as Workspace,
    metadataCache: {
      getFileCache: vi.fn(),
      getFirstLinkpathDest: vi.fn(),
      on: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
      off: vi.fn(),
    },
  } as App
}

/**
 * Create a mock WebSocket
 */
function createMockWebSocket(): {
  ws: WebSocket
  triggerOpen: () => void
  triggerClose: (code?: number, reason?: string) => void
  triggerError: (error?: Event) => void
  triggerMessage: (data: string) => void
} {
  const listeners: Record<string, ((event: unknown) => void)[]> = {
    open: [],
    close: [],
    error: [],
    message: [],
  }

  const ws = {
    readyState: WebSocket.CONNECTING,
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn((event: string, callback: (event: unknown) => void) => {
      if (!listeners[event]) {
        listeners[event] = []
      }
      listeners[event].push(callback)
    }),
    removeEventListener: vi.fn((event: string, callback: (event: unknown) => void) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((cb) => cb !== callback)
      }
    }),
  } as unknown as WebSocket

  return {
    ws,
    triggerOpen: () => {
      (ws as any).readyState = WebSocket.OPEN
      listeners.open.forEach((cb) => cb(new Event('open')))
    },
    triggerClose: (code = 1000, reason = '') => {
      (ws as any).readyState = WebSocket.CLOSED
      listeners.close.forEach((cb) =>
        cb(new CloseEvent('close', { code, reason }))
      )
    },
    triggerError: (error?: Event) => {
      listeners.error.forEach((cb) => cb(error || new Event('error')))
    },
    triggerMessage: (data: string) => {
      listeners.message.forEach((cb) =>
        cb(new MessageEvent('message', { data }))
      )
    },
  }
}

/**
 * Create a ViewStateResult mock
 */
function createMockViewStateResult(): ViewStateResult {
  return { history: false }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('ChatView', () => {
  let leaf: WorkspaceLeaf
  let view: ChatView
  let mockWs: ReturnType<typeof createMockWebSocket>

  beforeEach(() => {
    // Create mock DOM elements
    vi.stubGlobal('document', {
      createElement: vi.fn((tag: string) => {
        const el = {
          tagName: tag.toUpperCase(),
          className: '',
          innerHTML: '',
          textContent: '',
          style: {},
          children: [],
          classList: {
            add: vi.fn(),
            remove: vi.fn(),
            contains: vi.fn(),
            toggle: vi.fn(),
          },
          appendChild: vi.fn((child: unknown) => {
            (el.children as unknown[]).push(child)
            return child
          }),
          removeChild: vi.fn(),
          insertBefore: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          querySelector: vi.fn(),
          querySelectorAll: vi.fn().mockReturnValue([]),
          setAttribute: vi.fn(),
          getAttribute: vi.fn(),
          focus: vi.fn(),
          blur: vi.fn(),
          scrollTo: vi.fn(),
          scrollIntoView: vi.fn(),
        }
        return el
      }),
      createTextNode: vi.fn((text: string) => ({ textContent: text })),
    })

    // Create mock WebSocket class
    mockWs = createMockWebSocket()
    vi.stubGlobal(
      'WebSocket',
      vi.fn().mockImplementation(() => mockWs.ws)
    )

    leaf = createMockLeaf()
    view = new ChatView(leaf)
    ;(view as any).app = createMockApp()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  // ==========================================================================
  // View Lifecycle Tests
  // ==========================================================================

  describe('View Lifecycle', () => {
    describe('constructor', () => {
      it('should create a ChatView instance', () => {
        expect(view).toBeInstanceOf(ChatView)
      })

      it('should store the leaf reference', () => {
        expect(view.leaf).toBe(leaf)
      })

      it('should initialize with null conversationId', () => {
        // Access private property for testing
        expect((view as any).conversationId).toBeNull()
      })

      it('should initialize with empty conversations map', () => {
        expect((view as any).conversations.size).toBe(0)
      })

      it('should initialize with disconnected state', () => {
        expect((view as any).isConnected).toBe(false)
      })

      it('should initialize with default server URL', () => {
        expect((view as any).serverUrl).toBe('ws://localhost:3000')
      })
    })

    describe('getViewType', () => {
      it('should return the correct view type identifier', () => {
        expect(view.getViewType()).toBe(CHAT_VIEW_TYPE)
      })

      it('should return "obsidian-chat-view"', () => {
        expect(view.getViewType()).toBe('obsidian-chat-view')
      })
    })

    describe('getDisplayText', () => {
      it('should return a display name for the view', () => {
        const displayText = view.getDisplayText()
        expect(typeof displayText).toBe('string')
        expect(displayText.length).toBeGreaterThan(0)
      })

      it('should return "AI Chat" or similar', () => {
        expect(view.getDisplayText()).toMatch(/chat|Chat|AI/i)
      })
    })

    describe('getIcon', () => {
      it('should return an icon name', () => {
        const icon = view.getIcon()
        expect(typeof icon).toBe('string')
        expect(icon.length).toBeGreaterThan(0)
      })

      it('should return a valid Obsidian icon identifier', () => {
        // Common Obsidian icons: message-square, bot, sparkles, etc.
        expect(view.getIcon()).toMatch(/^[a-z-]+$/)
      })
    })

    describe('onOpen', () => {
      it('should render the view UI', async () => {
        await view.onOpen()

        // Should create container elements
        expect(view.containerEl.children.length).toBeGreaterThan(0)
      })

      it('should create the messages container', async () => {
        await view.onOpen()

        expect((view as any).messagesContainerEl).toBeDefined()
      })

      it('should create the input element', async () => {
        await view.onOpen()

        expect((view as any).inputEl).toBeDefined()
      })

      it('should create the status element', async () => {
        await view.onOpen()

        expect((view as any).statusEl).toBeDefined()
      })

      it('should attempt to connect to the server', async () => {
        await view.onOpen()

        expect(WebSocket).toHaveBeenCalledWith(expect.stringMatching(/^wss?:\/\//))
      })

      it('should set up input event listeners', async () => {
        await view.onOpen()

        expect((view as any).inputEl?.addEventListener).toHaveBeenCalledWith(
          'keydown',
          expect.any(Function)
        )
      })

      it('should render header with controls', async () => {
        await view.onOpen()

        // Check for new conversation button
        const header = view.containerEl.querySelector('.chat-header')
        expect(header).toBeDefined()
      })
    })

    describe('onClose', () => {
      it('should disconnect from the server', async () => {
        await view.onOpen()
        mockWs.triggerOpen()
        await view.onClose()

        expect(mockWs.ws.close).toHaveBeenCalled()
      })

      it('should clean up event listeners', async () => {
        await view.onOpen()
        await view.onClose()

        expect(mockWs.ws.removeEventListener).toHaveBeenCalled()
      })

      it('should clear the container element', async () => {
        await view.onOpen()
        await view.onClose()

        expect(view.containerEl.innerHTML).toBe('')
      })

      it('should set isConnected to false', async () => {
        await view.onOpen()
        mockWs.triggerOpen()
        await view.onClose()

        expect((view as any).isConnected).toBe(false)
      })

      it('should not throw if not connected', async () => {
        await expect(view.onClose()).resolves.not.toThrow()
      })
    })

    describe('getState', () => {
      it('should return current state object', () => {
        const state = view.getState()

        expect(state).toBeDefined()
        expect(typeof state).toBe('object')
      })

      it('should include conversationId', () => {
        const state = view.getState()

        expect(state).toHaveProperty('conversationId')
      })

      it('should include conversations array', () => {
        const state = view.getState()

        expect(state).toHaveProperty('conversations')
        expect(Array.isArray(state.conversations)).toBe(true)
      })

      it('should include serverUrl', () => {
        const state = view.getState()

        expect(state).toHaveProperty('serverUrl')
        expect(typeof state.serverUrl).toBe('string')
      })

      it('should include isConnected', () => {
        const state = view.getState()

        expect(state).toHaveProperty('isConnected')
        expect(typeof state.isConnected).toBe('boolean')
      })

      it('should serialize conversations correctly', async () => {
        // Add a conversation first
        await view.onOpen()
        mockWs.triggerOpen()
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'connected',
            conversationId: 'conv-test-123',
          })
        )

        const state = view.getState()

        expect(state.conversationId).toBe('conv-test-123')
      })
    })

    describe('setState', () => {
      it('should restore conversationId from state', async () => {
        const state: ChatViewState = {
          conversationId: 'conv-restored-123',
          conversations: [],
          serverUrl: 'ws://localhost:3000',
          isConnected: false,
        }

        await view.setState(state, createMockViewStateResult())

        expect((view as any).conversationId).toBe('conv-restored-123')
      })

      it('should restore conversations from state', async () => {
        const conversation: Conversation = {
          id: 'conv-test-456',
          title: 'Test Conversation',
          messages: [
            {
              id: 'msg-1',
              role: 'user',
              content: 'Hello',
              timestamp: Date.now(),
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }

        const state: ChatViewState = {
          conversationId: 'conv-test-456',
          conversations: [conversation],
          serverUrl: 'ws://localhost:3000',
          isConnected: false,
        }

        await view.setState(state, createMockViewStateResult())

        expect((view as any).conversations.get('conv-test-456')).toBeDefined()
      })

      it('should restore serverUrl from state', async () => {
        const state: ChatViewState = {
          conversationId: null,
          conversations: [],
          serverUrl: 'ws://custom-server:8080',
          isConnected: false,
        }

        await view.setState(state, createMockViewStateResult())

        expect((view as any).serverUrl).toBe('ws://custom-server:8080')
      })

      it('should handle invalid state gracefully', async () => {
        await expect(
          view.setState(null, createMockViewStateResult())
        ).resolves.not.toThrow()
      })

      it('should handle partial state', async () => {
        const partialState = { conversationId: 'conv-partial' }

        await expect(
          view.setState(partialState, createMockViewStateResult())
        ).resolves.not.toThrow()
      })

      it('should update the UI after restoring state', async () => {
        await view.onOpen()

        const conversation: Conversation = {
          id: 'conv-ui-test',
          title: 'UI Test',
          messages: [
            {
              id: 'msg-1',
              role: 'user',
              content: 'Test message',
              timestamp: Date.now(),
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }

        await view.setState(
          {
            conversationId: 'conv-ui-test',
            conversations: [conversation],
            serverUrl: 'ws://localhost:3000',
            isConnected: false,
          },
          createMockViewStateResult()
        )

        // Should render the restored messages
        const messagesContainer = (view as any).messagesContainerEl
        expect(messagesContainer?.children.length).toBeGreaterThan(0)
      })
    })
  })

  // ==========================================================================
  // WebSocket Connection Tests
  // ==========================================================================

  describe('WebSocket Connection', () => {
    describe('connect', () => {
      it('should create a WebSocket connection', () => {
        view.connect()

        expect(WebSocket).toHaveBeenCalled()
      })

      it('should connect to the configured server URL', () => {
        view.setServerUrl('ws://custom-server:9000')
        view.connect()

        expect(WebSocket).toHaveBeenCalledWith('ws://custom-server:9000')
      })

      it('should set up open event handler', () => {
        view.connect()

        expect(mockWs.ws.addEventListener).toHaveBeenCalledWith(
          'open',
          expect.any(Function)
        )
      })

      it('should set up close event handler', () => {
        view.connect()

        expect(mockWs.ws.addEventListener).toHaveBeenCalledWith(
          'close',
          expect.any(Function)
        )
      })

      it('should set up error event handler', () => {
        view.connect()

        expect(mockWs.ws.addEventListener).toHaveBeenCalledWith(
          'error',
          expect.any(Function)
        )
      })

      it('should set up message event handler', () => {
        view.connect()

        expect(mockWs.ws.addEventListener).toHaveBeenCalledWith(
          'message',
          expect.any(Function)
        )
      })

      it('should not create duplicate connections', () => {
        view.connect()
        view.connect()

        // Should only create one WebSocket
        expect(WebSocket).toHaveBeenCalledTimes(1)
      })
    })

    describe('disconnect', () => {
      it('should close the WebSocket connection', () => {
        view.connect()
        view.disconnect()

        expect(mockWs.ws.close).toHaveBeenCalled()
      })

      it('should set isConnected to false', () => {
        view.connect()
        mockWs.triggerOpen()
        view.disconnect()

        expect((view as any).isConnected).toBe(false)
      })

      it('should clear the WebSocket reference', () => {
        view.connect()
        view.disconnect()

        expect((view as any).ws).toBeNull()
      })

      it('should not throw if not connected', () => {
        expect(() => view.disconnect()).not.toThrow()
      })

      it('should reset reconnect attempts', () => {
        view.connect()
        ;(view as any).reconnectAttempts = 3
        view.disconnect()

        expect((view as any).reconnectAttempts).toBe(0)
      })
    })

    describe('connection events', () => {
      it('should set isConnected to true on open', () => {
        view.connect()
        mockWs.triggerOpen()

        expect((view as any).isConnected).toBe(true)
      })

      it('should reset reconnect attempts on successful connection', () => {
        view.connect()
        ;(view as any).reconnectAttempts = 3
        mockWs.triggerOpen()

        expect((view as any).reconnectAttempts).toBe(0)
      })

      it('should update connection status UI on open', async () => {
        await view.onOpen()
        mockWs.triggerOpen()

        expect((view as any).statusEl?.classList.add).toHaveBeenCalledWith(
          expect.stringMatching(/connected/i)
        )
      })

      it('should set isConnected to false on close', () => {
        view.connect()
        mockWs.triggerOpen()
        mockWs.triggerClose()

        expect((view as any).isConnected).toBe(false)
      })

      it('should attempt reconnection on unexpected close', () => {
        vi.useFakeTimers()
        view.connect()
        mockWs.triggerOpen()
        mockWs.triggerClose(1006, 'Abnormal closure')

        vi.advanceTimersByTime(3000)

        expect(WebSocket).toHaveBeenCalledTimes(2)
        vi.useRealTimers()
      })

      it('should not reconnect after normal close', () => {
        vi.useFakeTimers()
        view.connect()
        mockWs.triggerOpen()
        mockWs.triggerClose(1000, 'Normal closure')

        vi.advanceTimersByTime(3000)

        expect(WebSocket).toHaveBeenCalledTimes(1)
        vi.useRealTimers()
      })

      it('should show error on connection error', async () => {
        await view.onOpen()
        mockWs.triggerError()

        expect((view as any).errorEl?.textContent).toMatch(/error|Error/i)
      })

      it('should respect max reconnect attempts', () => {
        vi.useFakeTimers()
        view.setReconnectConfig(100, 3)
        view.connect()

        // Simulate connection failures with exponential backoff timing
        // Close 1: schedules reconnect at 100ms (100 * 2^0)
        mockWs.triggerClose(1006, 'Connection failed')
        vi.advanceTimersByTime(100)
        expect(WebSocket).toHaveBeenCalledTimes(2) // 1 initial + 1 reconnect

        // Close 2: schedules reconnect at 200ms (100 * 2^1)
        mockWs.triggerClose(1006, 'Connection failed')
        vi.advanceTimersByTime(200)
        expect(WebSocket).toHaveBeenCalledTimes(3)

        // Close 3: schedules reconnect at 400ms (100 * 2^2)
        mockWs.triggerClose(1006, 'Connection failed')
        vi.advanceTimersByTime(400)
        expect(WebSocket).toHaveBeenCalledTimes(4) // 1 initial + 3 reconnects

        // Close 4: should NOT reconnect (max attempts reached)
        mockWs.triggerClose(1006, 'Connection failed')
        vi.advanceTimersByTime(1000) // Wait plenty of time

        // Should have only attempted 3 reconnects total
        expect(WebSocket).toHaveBeenCalledTimes(4) // 1 initial + 3 reconnects
        vi.useRealTimers()
      })

      it('should use exponential backoff for reconnection', () => {
        vi.useFakeTimers()
        view.setReconnectConfig(1000, 5)
        view.connect()
        expect(WebSocket).toHaveBeenCalledTimes(1)

        // First close - delay is 1000ms (1000 * 2^0)
        mockWs.triggerClose(1006)
        vi.advanceTimersByTime(999)
        expect(WebSocket).toHaveBeenCalledTimes(1) // Not yet
        vi.advanceTimersByTime(1)
        expect(WebSocket).toHaveBeenCalledTimes(2) // Now (after 1000ms)

        // Second close - delay is 2000ms (1000 * 2^1)
        mockWs.triggerClose(1006)
        vi.advanceTimersByTime(1000)
        expect(WebSocket).toHaveBeenCalledTimes(2) // Not yet (only 1000ms)
        vi.advanceTimersByTime(1000)
        expect(WebSocket).toHaveBeenCalledTimes(3) // Now (after 2000ms)

        // Third close - delay is 4000ms (1000 * 2^2)
        mockWs.triggerClose(1006)
        vi.advanceTimersByTime(2000)
        expect(WebSocket).toHaveBeenCalledTimes(3) // Not yet (only 2000ms)
        vi.advanceTimersByTime(2000)
        expect(WebSocket).toHaveBeenCalledTimes(4) // Now (after 4000ms)

        vi.useRealTimers()
      })
    })

    describe('message handling', () => {
      it('should parse incoming messages as JSON', () => {
        view.connect()
        mockWs.triggerOpen()

        const message: ConnectedMessage = {
          type: 'connected',
          conversationId: 'conv-parse-test',
        }

        mockWs.triggerMessage(JSON.stringify(message))

        expect((view as any).conversationId).toBe('conv-parse-test')
      })

      it('should handle invalid JSON gracefully', async () => {
        await view.onOpen()
        mockWs.triggerOpen()

        expect(() => {
          mockWs.triggerMessage('not valid json')
        }).not.toThrow()

        expect((view as any).errorEl?.textContent).toMatch(/error|invalid/i)
      })

      it('should handle unknown message types gracefully', async () => {
        await view.onOpen()
        mockWs.triggerOpen()

        expect(() => {
          mockWs.triggerMessage(JSON.stringify({ type: 'unknown_type' }))
        }).not.toThrow()
      })
    })
  })

  // ==========================================================================
  // Message Rendering Tests
  // ==========================================================================

  describe('Message Rendering', () => {
    beforeEach(async () => {
      await view.onOpen()
      mockWs.triggerOpen()
      mockWs.triggerMessage(
        JSON.stringify({
          type: 'connected',
          conversationId: 'conv-render-test',
        })
      )
    })

    describe('user messages', () => {
      it('should render user messages when sent', () => {
        view.sendMessage('Hello, AI!')

        const messagesContainer = (view as any).messagesContainerEl
        expect(messagesContainer?.children.length).toBeGreaterThan(0)
      })

      it('should display user message content', () => {
        view.sendMessage('Test message content')

        const messagesContainer = (view as any).messagesContainerEl
        const messageEl = messagesContainer?.children[0]
        expect(messageEl?.textContent).toContain('Test message content')
      })

      it('should mark user messages with correct role class', () => {
        view.sendMessage('User message')

        const messagesContainer = (view as any).messagesContainerEl
        const messageEl = messagesContainer?.children[0]
        expect(messageEl?.classList.add).toHaveBeenCalledWith(
          expect.stringMatching(/user|message-user/)
        )
      })

      it('should include timestamp on user messages', () => {
        const beforeTime = Date.now()
        view.sendMessage('Timestamped message')

        const conversation = view.getCurrentConversation()
        const lastMessage = conversation?.messages[conversation.messages.length - 1]

        expect(lastMessage?.timestamp).toBeGreaterThanOrEqual(beforeTime)
      })

      it('should generate unique message IDs', () => {
        view.sendMessage('First message')
        view.sendMessage('Second message')

        const conversation = view.getCurrentConversation()
        const ids = conversation?.messages.map((m) => m.id)
        const uniqueIds = new Set(ids)

        expect(uniqueIds.size).toBe(ids?.length)
      })
    })

    describe('assistant messages', () => {
      it('should render assistant messages from text_delta', () => {
        const textDelta: TextDeltaMessage = {
          type: 'text_delta',
          conversationId: 'conv-render-test',
          text: 'Hello, human!',
        }

        mockWs.triggerMessage(JSON.stringify(textDelta))

        const messagesContainer = (view as any).messagesContainerEl
        expect(messagesContainer?.children.length).toBeGreaterThan(0)
      })

      it('should accumulate streaming text deltas', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'text_delta',
            conversationId: 'conv-render-test',
            text: 'Hello, ',
          })
        )

        mockWs.triggerMessage(
          JSON.stringify({
            type: 'text_delta',
            conversationId: 'conv-render-test',
            text: 'world!',
          })
        )

        expect((view as any).streamingBuffer).toBe('Hello, world!')
      })

      it('should display accumulated text in UI', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'text_delta',
            conversationId: 'conv-render-test',
            text: 'Streaming ',
          })
        )

        mockWs.triggerMessage(
          JSON.stringify({
            type: 'text_delta',
            conversationId: 'conv-render-test',
            text: 'text',
          })
        )

        const messagesContainer = (view as any).messagesContainerEl
        const messageEl = messagesContainer?.children[0]
        expect(messageEl?.textContent).toContain('Streaming text')
      })

      it('should mark assistant messages with correct role class', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'text_delta',
            conversationId: 'conv-render-test',
            text: 'Assistant response',
          })
        )

        const messagesContainer = (view as any).messagesContainerEl
        const messageEl = messagesContainer?.children[0]
        expect(messageEl?.classList.add).toHaveBeenCalledWith(
          expect.stringMatching(/assistant|message-assistant/)
        )
      })

      it('should show streaming indicator during text_delta', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'text_delta',
            conversationId: 'conv-render-test',
            text: 'Streaming...',
          })
        )

        const conversation = view.getCurrentConversation()
        const lastMessage = conversation?.messages[conversation.messages.length - 1]

        expect(lastMessage?.isStreaming).toBe(true)
      })

      it('should remove streaming indicator on complete', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'text_delta',
            conversationId: 'conv-render-test',
            text: 'Final text',
          })
        )

        mockWs.triggerMessage(
          JSON.stringify({
            type: 'complete',
            conversationId: 'conv-render-test',
            usage: { inputTokens: 10, outputTokens: 5 },
          })
        )

        const conversation = view.getCurrentConversation()
        const lastAssistantMessage = conversation?.messages.find(
          (m) => m.role === 'assistant'
        )

        expect(lastAssistantMessage?.isStreaming).toBe(false)
      })

      it('should finalize message content on complete', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'text_delta',
            conversationId: 'conv-render-test',
            text: 'Complete message',
          })
        )

        mockWs.triggerMessage(
          JSON.stringify({
            type: 'complete',
            conversationId: 'conv-render-test',
            usage: { inputTokens: 10, outputTokens: 5 },
          })
        )

        const conversation = view.getCurrentConversation()
        const lastAssistantMessage = conversation?.messages.find(
          (m) => m.role === 'assistant'
        )

        expect(lastAssistantMessage?.content).toBe('Complete message')
      })
    })

    describe('tool messages', () => {
      it('should render tool_start message', () => {
        const toolStart: ToolStartMessage = {
          type: 'tool_start',
          conversationId: 'conv-render-test',
          toolUseId: 'tool-use-123',
          name: 'vault_search',
          input: { query: 'test' },
        }

        mockWs.triggerMessage(JSON.stringify(toolStart))

        const messagesContainer = (view as any).messagesContainerEl
        expect(messagesContainer?.children.length).toBeGreaterThan(0)
      })

      it('should display tool name in tool_start', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'tool_start',
            conversationId: 'conv-render-test',
            toolUseId: 'tool-use-456',
            name: 'note_read',
            input: { path: 'test.md' },
          })
        )

        const conversation = view.getCurrentConversation()
        const toolMessage = conversation?.messages.find((m) => m.role === 'tool')

        expect(toolMessage?.toolName).toBe('note_read')
      })

      it('should display tool input in tool_start', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'tool_start',
            conversationId: 'conv-render-test',
            toolUseId: 'tool-use-789',
            name: 'vault_create',
            input: { path: 'new-note.md', content: '# New Note' },
          })
        )

        const conversation = view.getCurrentConversation()
        const toolMessage = conversation?.messages.find((m) => m.role === 'tool')

        expect(toolMessage?.toolInput).toEqual({
          path: 'new-note.md',
          content: '# New Note',
        })
      })

      it('should update tool message with tool_result', () => {
        // First send tool_start
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'tool_start',
            conversationId: 'conv-render-test',
            toolUseId: 'tool-use-result-test',
            name: 'vault_search',
            input: { query: 'search term' },
          })
        )

        // Then send tool_result
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'tool_result',
            conversationId: 'conv-render-test',
            toolUseId: 'tool-use-result-test',
            output: { results: ['file1.md', 'file2.md'] },
            isError: false,
          })
        )

        const conversation = view.getCurrentConversation()
        const toolMessage = conversation?.messages.find(
          (m) => m.toolUseId === 'tool-use-result-test'
        )

        expect(toolMessage?.toolOutput).toEqual({
          results: ['file1.md', 'file2.md'],
        })
      })

      it('should mark tool message as error when isError is true', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'tool_start',
            conversationId: 'conv-render-test',
            toolUseId: 'tool-use-error-test',
            name: 'note_read',
            input: { path: 'nonexistent.md' },
          })
        )

        mockWs.triggerMessage(
          JSON.stringify({
            type: 'tool_result',
            conversationId: 'conv-render-test',
            toolUseId: 'tool-use-error-test',
            output: 'File not found',
            isError: true,
          })
        )

        const conversation = view.getCurrentConversation()
        const toolMessage = conversation?.messages.find(
          (m) => m.toolUseId === 'tool-use-error-test'
        )

        expect(toolMessage?.isError).toBe(true)
      })

      it('should render tool indicator with status', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'tool_start',
            conversationId: 'conv-render-test',
            toolUseId: 'tool-indicator-test',
            name: 'vault_list',
            input: {},
          })
        )

        const messagesContainer = (view as any).messagesContainerEl
        const toolIndicator = messagesContainer?.querySelector('.tool-indicator')

        expect(toolIndicator).toBeDefined()
      })

      it('should show spinner during tool execution', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'tool_start',
            conversationId: 'conv-render-test',
            toolUseId: 'tool-spinner-test',
            name: 'vault_search',
            input: { query: 'test' },
          })
        )

        const messagesContainer = (view as any).messagesContainerEl
        const spinner = messagesContainer?.querySelector('.spinner, .loading')

        expect(spinner).toBeDefined()
      })

      it('should hide spinner after tool_result', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'tool_start',
            conversationId: 'conv-render-test',
            toolUseId: 'tool-spinner-hide-test',
            name: 'vault_search',
            input: {},
          })
        )

        mockWs.triggerMessage(
          JSON.stringify({
            type: 'tool_result',
            conversationId: 'conv-render-test',
            toolUseId: 'tool-spinner-hide-test',
            output: { results: [] },
            isError: false,
          })
        )

        const messagesContainer = (view as any).messagesContainerEl
        const toolEl = messagesContainer?.querySelector(
          '[data-tool-use-id="tool-spinner-hide-test"]'
        )

        expect(toolEl?.classList.contains('loading')).toBe(false)
      })
    })

    describe('markdown rendering', () => {
      it('should render markdown headings', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'text_delta',
            conversationId: 'conv-render-test',
            text: '# Heading 1\n\n## Heading 2',
          })
        )

        mockWs.triggerMessage(
          JSON.stringify({
            type: 'complete',
            conversationId: 'conv-render-test',
            usage: { inputTokens: 10, outputTokens: 5 },
          })
        )

        // Should invoke markdown renderer
        const messagesContainer = (view as any).messagesContainerEl
        expect(messagesContainer?.innerHTML).toContain('h1')
      })

      it('should render markdown code blocks', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'text_delta',
            conversationId: 'conv-render-test',
            text: '```javascript\nconst x = 1;\n```',
          })
        )

        mockWs.triggerMessage(
          JSON.stringify({
            type: 'complete',
            conversationId: 'conv-render-test',
            usage: { inputTokens: 10, outputTokens: 5 },
          })
        )

        const messagesContainer = (view as any).messagesContainerEl
        expect(messagesContainer?.innerHTML).toContain('code')
      })

      it('should render markdown links', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'text_delta',
            conversationId: 'conv-render-test',
            text: 'Check out [this link](https://example.com)',
          })
        )

        mockWs.triggerMessage(
          JSON.stringify({
            type: 'complete',
            conversationId: 'conv-render-test',
            usage: { inputTokens: 10, outputTokens: 5 },
          })
        )

        const messagesContainer = (view as any).messagesContainerEl
        expect(messagesContainer?.innerHTML).toContain('a')
      })

      it('should render wikilinks', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'text_delta',
            conversationId: 'conv-render-test',
            text: 'See [[linked note]] for more info',
          })
        )

        mockWs.triggerMessage(
          JSON.stringify({
            type: 'complete',
            conversationId: 'conv-render-test',
            usage: { inputTokens: 10, outputTokens: 5 },
          })
        )

        const messagesContainer = (view as any).messagesContainerEl
        // Should render wikilink as internal link
        expect(messagesContainer?.innerHTML).toContain('internal-link')
      })

      it('should render markdown lists', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'text_delta',
            conversationId: 'conv-render-test',
            text: '- Item 1\n- Item 2\n- Item 3',
          })
        )

        mockWs.triggerMessage(
          JSON.stringify({
            type: 'complete',
            conversationId: 'conv-render-test',
            usage: { inputTokens: 10, outputTokens: 5 },
          })
        )

        const messagesContainer = (view as any).messagesContainerEl
        expect(messagesContainer?.innerHTML).toContain('ul')
      })

      it('should render inline code', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'text_delta',
            conversationId: 'conv-render-test',
            text: 'Use the `npm install` command',
          })
        )

        mockWs.triggerMessage(
          JSON.stringify({
            type: 'complete',
            conversationId: 'conv-render-test',
            usage: { inputTokens: 10, outputTokens: 5 },
          })
        )

        const messagesContainer = (view as any).messagesContainerEl
        expect(messagesContainer?.innerHTML).toContain('code')
      })

      it('should render bold and italic text', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'text_delta',
            conversationId: 'conv-render-test',
            text: '**bold** and *italic* text',
          })
        )

        mockWs.triggerMessage(
          JSON.stringify({
            type: 'complete',
            conversationId: 'conv-render-test',
            usage: { inputTokens: 10, outputTokens: 5 },
          })
        )

        const messagesContainer = (view as any).messagesContainerEl
        expect(messagesContainer?.innerHTML).toMatch(/strong|b/)
        expect(messagesContainer?.innerHTML).toMatch(/em|i/)
      })
    })
  })

  // ==========================================================================
  // Input Handling Tests
  // ==========================================================================

  describe('Input Handling', () => {
    beforeEach(async () => {
      await view.onOpen()
      mockWs.triggerOpen()
      mockWs.triggerMessage(
        JSON.stringify({
          type: 'connected',
          conversationId: 'conv-input-test',
        })
      )
    })

    describe('sendMessage', () => {
      it('should send chat message to server', () => {
        view.sendMessage('Test message')

        expect(mockWs.ws.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"chat"')
        )
      })

      it('should include conversationId in sent message', () => {
        view.sendMessage('Test message')

        expect(mockWs.ws.send).toHaveBeenCalledWith(
          expect.stringContaining('"conversationId":"conv-input-test"')
        )
      })

      it('should include message content in sent message', () => {
        view.sendMessage('Hello, world!')

        expect(mockWs.ws.send).toHaveBeenCalledWith(
          expect.stringContaining('"message":"Hello, world!"')
        )
      })

      it('should not send empty messages', () => {
        view.sendMessage('')

        expect(mockWs.ws.send).not.toHaveBeenCalled()
      })

      it('should not send whitespace-only messages', () => {
        view.sendMessage('   \n\t  ')

        expect(mockWs.ws.send).not.toHaveBeenCalled()
      })

      it('should add message to conversation', () => {
        view.sendMessage('Local message')

        const conversation = view.getCurrentConversation()
        expect(conversation?.messages.some((m) => m.content === 'Local message')).toBe(
          true
        )
      })

      it('should not send when disconnected', () => {
        view.disconnect()
        view.sendMessage('Disconnected message')

        expect(mockWs.ws.send).not.toHaveBeenCalled()
      })

      it('should show error when sending while disconnected', () => {
        view.disconnect()
        view.sendMessage('Disconnected message')

        expect((view as any).errorEl?.textContent).toMatch(
          /not connected|disconnected/i
        )
      })

      it('should trim message content before sending', () => {
        view.sendMessage('  trimmed message  ')

        expect(mockWs.ws.send).toHaveBeenCalledWith(
          expect.stringContaining('"message":"trimmed message"')
        )
      })
    })

    describe('cancelMessage', () => {
      it('should send cancel message to server', () => {
        view.cancelMessage()

        expect(mockWs.ws.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"cancel"')
        )
      })

      it('should include conversationId in cancel message', () => {
        view.cancelMessage()

        expect(mockWs.ws.send).toHaveBeenCalledWith(
          expect.stringContaining('"conversationId":"conv-input-test"')
        )
      })

      it('should not send cancel when disconnected', () => {
        view.disconnect()
        view.cancelMessage()

        expect(mockWs.ws.send).not.toHaveBeenCalled()
      })

      it('should clear streaming buffer on cancel', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'text_delta',
            conversationId: 'conv-input-test',
            text: 'Partial ',
          })
        )

        view.cancelMessage()

        expect((view as any).streamingBuffer).toBe('')
      })
    })

    describe('newConversation', () => {
      it('should send new_conversation message to server', () => {
        view.newConversation()

        expect(mockWs.ws.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"new_conversation"')
        )
      })

      it('should not send when disconnected', () => {
        view.disconnect()
        view.newConversation()

        expect(mockWs.ws.send).not.toHaveBeenCalled()
      })

      it('should preserve existing conversations', () => {
        const oldConversationId = (view as any).conversationId

        view.newConversation()

        // Simulate server response with new conversation
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'connected',
            conversationId: 'conv-new-123',
          })
        )

        expect((view as any).conversations.has(oldConversationId)).toBe(true)
      })
    })

    describe('keyboard handling', () => {
      it('should send message on Enter key', async () => {
        const inputEl = (view as any).inputEl
        inputEl.value = 'Enter message'

        const keydownHandler = inputEl.addEventListener.mock.calls.find(
          (call: unknown[]) => call[0] === 'keydown'
        )?.[1]

        keydownHandler?.({
          key: 'Enter',
          shiftKey: false,
          preventDefault: vi.fn(),
        })

        expect(mockWs.ws.send).toHaveBeenCalledWith(
          expect.stringContaining('Enter message')
        )
      })

      it('should not send message on Shift+Enter', async () => {
        const inputEl = (view as any).inputEl
        inputEl.value = 'Multiline message'

        const keydownHandler = inputEl.addEventListener.mock.calls.find(
          (call: unknown[]) => call[0] === 'keydown'
        )?.[1]

        keydownHandler?.({
          key: 'Enter',
          shiftKey: true,
          preventDefault: vi.fn(),
        })

        expect(mockWs.ws.send).not.toHaveBeenCalled()
      })

      it('should clear input after sending', async () => {
        const inputEl = (view as any).inputEl
        inputEl.value = 'Clear me'

        const keydownHandler = inputEl.addEventListener.mock.calls.find(
          (call: unknown[]) => call[0] === 'keydown'
        )?.[1]

        keydownHandler?.({
          key: 'Enter',
          shiftKey: false,
          preventDefault: vi.fn(),
        })

        expect(inputEl.value).toBe('')
      })

      it('should handle Escape key to cancel streaming', async () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'text_delta',
            conversationId: 'conv-input-test',
            text: 'Streaming...',
          })
        )

        const inputEl = (view as any).inputEl
        const keydownHandler = inputEl.addEventListener.mock.calls.find(
          (call: unknown[]) => call[0] === 'keydown'
        )?.[1]

        keydownHandler?.({
          key: 'Escape',
          preventDefault: vi.fn(),
        })

        expect(mockWs.ws.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"cancel"')
        )
      })
    })

    describe('focusInput', () => {
      it('should focus the input element', () => {
        view.focusInput()

        expect((view as any).inputEl?.focus).toHaveBeenCalled()
      })
    })

    describe('clearInput', () => {
      it('should clear the input field', () => {
        const inputEl = (view as any).inputEl
        inputEl.value = 'Some text'

        ;(view as any).clearInput()

        expect(inputEl.value).toBe('')
      })
    })
  })

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('Error Handling', () => {
    beforeEach(async () => {
      await view.onOpen()
      mockWs.triggerOpen()
      mockWs.triggerMessage(
        JSON.stringify({
          type: 'connected',
          conversationId: 'conv-error-test',
        })
      )
    })

    describe('error messages', () => {
      it('should display error message from server', () => {
        const errorMessage: ErrorMessage = {
          type: 'error',
          conversationId: 'conv-error-test',
          message: 'Something went wrong',
        }

        mockWs.triggerMessage(JSON.stringify(errorMessage))

        expect((view as any).errorEl?.textContent).toContain(
          'Something went wrong'
        )
      })

      it('should display error code when present', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'error',
            conversationId: 'conv-error-test',
            message: 'Rate limit exceeded',
            code: 'RATE_LIMIT',
          })
        )

        expect((view as any).errorEl?.textContent).toMatch(
          /RATE_LIMIT|rate.*limit/i
        )
      })

      it('should allow dismissing error messages', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'error',
            conversationId: 'conv-error-test',
            message: 'Dismissible error',
          })
        )

        ;(view as any).clearError()

        expect((view as any).errorEl?.textContent).toBe('')
      })

      it('should handle connection error gracefully', () => {
        mockWs.triggerError()

        expect((view as any).errorEl?.textContent).toMatch(
          /connection|error/i
        )
      })

      it('should show reconnecting message during reconnection', () => {
        vi.useFakeTimers()
        mockWs.triggerClose(1006)

        expect((view as any).statusEl?.textContent).toMatch(
          /reconnect|connecting/i
        )

        vi.useRealTimers()
      })

      it('should show disconnected message after max reconnect attempts', () => {
        vi.useFakeTimers()
        view.setReconnectConfig(100, 1)

        mockWs.triggerClose(1006)
        vi.advanceTimersByTime(100)
        mockWs.triggerClose(1006)

        expect((view as any).statusEl?.textContent).toMatch(
          /disconnect|offline/i
        )

        vi.useRealTimers()
      })
    })

    describe('message validation', () => {
      it('should ignore messages for wrong conversation', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'text_delta',
            conversationId: 'conv-wrong-id',
            text: 'Wrong conversation',
          })
        )

        const conversation = view.getCurrentConversation()
        expect(
          conversation?.messages.some((m) => m.content === 'Wrong conversation')
        ).toBe(false)
      })

      it('should handle missing conversationId in message', () => {
        expect(() => {
          mockWs.triggerMessage(
            JSON.stringify({
              type: 'text_delta',
              text: 'No conversation ID',
            })
          )
        }).not.toThrow()
      })

      it('should handle malformed message gracefully', () => {
        expect(() => {
          mockWs.triggerMessage(
            JSON.stringify({
              type: 'text_delta',
              conversationId: 123, // Should be string
              text: null, // Should be string
            })
          )
        }).not.toThrow()
      })
    })
  })

  // ==========================================================================
  // Conversation Management Tests
  // ==========================================================================

  describe('Conversation Management', () => {
    beforeEach(async () => {
      await view.onOpen()
      mockWs.triggerOpen()
    })

    describe('getCurrentConversation', () => {
      it('should return null when no conversation is active', () => {
        expect(view.getCurrentConversation()).toBeNull()
      })

      it('should return current conversation after connection', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'connected',
            conversationId: 'conv-current-test',
          })
        )

        const conversation = view.getCurrentConversation()
        expect(conversation?.id).toBe('conv-current-test')
      })

      it('should return conversation with messages', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'connected',
            conversationId: 'conv-messages-test',
          })
        )

        view.sendMessage('Test message')

        const conversation = view.getCurrentConversation()
        expect(conversation?.messages.length).toBeGreaterThan(0)
      })
    })

    describe('getAllConversations', () => {
      it('should return empty array when no conversations', () => {
        expect(view.getAllConversations()).toEqual([])
      })

      it('should return all conversations', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'connected',
            conversationId: 'conv-all-1',
          })
        )

        view.newConversation()

        mockWs.triggerMessage(
          JSON.stringify({
            type: 'connected',
            conversationId: 'conv-all-2',
          })
        )

        const conversations = view.getAllConversations()
        expect(conversations.length).toBe(2)
      })

      it('should return conversations sorted by updatedAt', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'connected',
            conversationId: 'conv-sort-1',
          })
        )

        view.newConversation()

        mockWs.triggerMessage(
          JSON.stringify({
            type: 'connected',
            conversationId: 'conv-sort-2',
          })
        )

        view.sendMessage('Update second conversation')

        const conversations = view.getAllConversations()
        expect(conversations[0].id).toBe('conv-sort-2')
      })
    })

    describe('switchConversation', () => {
      it('should switch to specified conversation', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'connected',
            conversationId: 'conv-switch-1',
          })
        )

        view.newConversation()

        mockWs.triggerMessage(
          JSON.stringify({
            type: 'connected',
            conversationId: 'conv-switch-2',
          })
        )

        view.switchConversation('conv-switch-1')

        expect((view as any).conversationId).toBe('conv-switch-1')
      })

      it('should update UI when switching conversations', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'connected',
            conversationId: 'conv-ui-switch-1',
          })
        )

        view.sendMessage('Message in first conversation')

        view.newConversation()

        mockWs.triggerMessage(
          JSON.stringify({
            type: 'connected',
            conversationId: 'conv-ui-switch-2',
          })
        )

        view.sendMessage('Message in second conversation')

        view.switchConversation('conv-ui-switch-1')

        const messagesContainer = (view as any).messagesContainerEl
        expect(messagesContainer?.children[0]?.textContent).toContain(
          'Message in first conversation'
        )
      })

      it('should throw error for non-existent conversation', () => {
        expect(() => {
          view.switchConversation('conv-nonexistent')
        }).toThrow()
      })

      it('should not switch if already on that conversation', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'connected',
            conversationId: 'conv-same',
          })
        )

        const updateSpy = vi.spyOn(view as any, 'updateMessagesDisplay')

        view.switchConversation('conv-same')

        expect(updateSpy).not.toHaveBeenCalled()
      })
    })

    describe('deleteConversation', () => {
      it('should remove conversation from list', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'connected',
            conversationId: 'conv-delete-test',
          })
        )

        view.deleteConversation('conv-delete-test')

        expect((view as any).conversations.has('conv-delete-test')).toBe(false)
      })

      it('should switch to another conversation if current is deleted', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'connected',
            conversationId: 'conv-delete-1',
          })
        )

        view.newConversation()

        mockWs.triggerMessage(
          JSON.stringify({
            type: 'connected',
            conversationId: 'conv-delete-2',
          })
        )

        view.deleteConversation('conv-delete-2')

        expect((view as any).conversationId).toBe('conv-delete-1')
      })

      it('should set conversationId to null if last conversation deleted', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'connected',
            conversationId: 'conv-last-delete',
          })
        )

        view.deleteConversation('conv-last-delete')

        expect((view as any).conversationId).toBeNull()
      })

      it('should throw error for non-existent conversation', () => {
        expect(() => {
          view.deleteConversation('conv-nonexistent')
        }).toThrow()
      })
    })

    describe('clearAllConversations', () => {
      it('should remove all conversations', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'connected',
            conversationId: 'conv-clear-1',
          })
        )

        view.newConversation()

        mockWs.triggerMessage(
          JSON.stringify({
            type: 'connected',
            conversationId: 'conv-clear-2',
          })
        )

        view.clearAllConversations()

        expect((view as any).conversations.size).toBe(0)
      })

      it('should set conversationId to null', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'connected',
            conversationId: 'conv-clear-all',
          })
        )

        view.clearAllConversations()

        expect((view as any).conversationId).toBeNull()
      })

      it('should clear messages display', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'connected',
            conversationId: 'conv-clear-display',
          })
        )

        view.sendMessage('Test message')
        view.clearAllConversations()

        const messagesContainer = (view as any).messagesContainerEl
        expect(messagesContainer?.children.length).toBe(0)
      })
    })

    describe('conversation metadata', () => {
      it('should set conversation title', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'connected',
            conversationId: 'conv-title-test',
          })
        )

        view.sendMessage('First message becomes title')

        const conversation = view.getCurrentConversation()
        expect(conversation?.title).toBeTruthy()
      })

      it('should update conversation updatedAt on new message', () => {
        vi.useFakeTimers()
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'connected',
            conversationId: 'conv-updated-test',
          })
        )

        const initialTime = view.getCurrentConversation()?.updatedAt

        // Wait a bit and send another message
        vi.advanceTimersByTime(100)
        view.sendMessage('Update message')

        const updatedTime = view.getCurrentConversation()?.updatedAt
        expect(updatedTime).toBeGreaterThan(initialTime!)
        vi.useRealTimers()
      })

      it('should preserve createdAt timestamp', () => {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'connected',
            conversationId: 'conv-created-test',
          })
        )

        const createdAt = view.getCurrentConversation()?.createdAt

        view.sendMessage('New message')

        expect(view.getCurrentConversation()?.createdAt).toBe(createdAt)
      })
    })
  })

  // ==========================================================================
  // Configuration Tests
  // ==========================================================================

  describe('Configuration', () => {
    describe('setServerUrl', () => {
      it('should update the server URL', () => {
        view.setServerUrl('ws://new-server:8080')

        expect((view as any).serverUrl).toBe('ws://new-server:8080')
      })

      it('should disconnect and reconnect if currently connected', async () => {
        await view.onOpen()
        mockWs.triggerOpen()

        view.setServerUrl('ws://new-server:9000')

        expect(mockWs.ws.close).toHaveBeenCalled()
        expect(WebSocket).toHaveBeenCalledWith('ws://new-server:9000')
      })

      it('should not connect if not currently connected', () => {
        view.setServerUrl('ws://new-server:7000')

        expect(WebSocket).not.toHaveBeenCalled()
      })

      it('should validate URL format', () => {
        expect(() => {
          view.setServerUrl('invalid-url')
        }).toThrow()
      })

      it('should accept wss:// URLs', () => {
        expect(() => {
          view.setServerUrl('wss://secure-server:443')
        }).not.toThrow()

        expect((view as any).serverUrl).toBe('wss://secure-server:443')
      })
    })

    describe('getServerUrl', () => {
      it('should return current server URL', () => {
        expect(view.getServerUrl()).toBe('ws://localhost:3000')
      })

      it('should return updated URL after setServerUrl', () => {
        view.setServerUrl('ws://custom:5000')

        expect(view.getServerUrl()).toBe('ws://custom:5000')
      })
    })

    describe('setReconnectConfig', () => {
      it('should update reconnect interval', () => {
        view.setReconnectConfig(5000, 10)

        expect((view as any).reconnectInterval).toBe(5000)
      })

      it('should update max reconnect attempts', () => {
        view.setReconnectConfig(1000, 15)

        expect((view as any).maxReconnectAttempts).toBe(15)
      })

      it('should throw for invalid interval', () => {
        expect(() => {
          view.setReconnectConfig(-1000, 5)
        }).toThrow()
      })

      it('should throw for invalid max attempts', () => {
        expect(() => {
          view.setReconnectConfig(1000, -1)
        }).toThrow()
      })
    })

    describe('getIsConnected', () => {
      it('should return false initially', () => {
        expect(view.getIsConnected()).toBe(false)
      })

      it('should return true after connection', async () => {
        await view.onOpen()
        mockWs.triggerOpen()

        expect(view.getIsConnected()).toBe(true)
      })

      it('should return false after disconnect', async () => {
        await view.onOpen()
        mockWs.triggerOpen()
        view.disconnect()

        expect(view.getIsConnected()).toBe(false)
      })
    })
  })

  // ==========================================================================
  // UI Scrolling Tests
  // ==========================================================================

  describe('UI Scrolling', () => {
    beforeEach(async () => {
      await view.onOpen()
      mockWs.triggerOpen()
      mockWs.triggerMessage(
        JSON.stringify({
          type: 'connected',
          conversationId: 'conv-scroll-test',
        })
      )
    })

    it('should scroll to bottom when new user message is added', () => {
      view.sendMessage('New message')

      expect((view as any).messagesContainerEl?.scrollTo).toHaveBeenCalled()
    })

    it('should scroll to bottom when assistant message arrives', () => {
      mockWs.triggerMessage(
        JSON.stringify({
          type: 'text_delta',
          conversationId: 'conv-scroll-test',
          text: 'Assistant message',
        })
      )

      expect((view as any).messagesContainerEl?.scrollTo).toHaveBeenCalled()
    })

    it('should scroll to bottom on streaming updates', () => {
      mockWs.triggerMessage(
        JSON.stringify({
          type: 'text_delta',
          conversationId: 'conv-scroll-test',
          text: 'First part ',
        })
      )

      mockWs.triggerMessage(
        JSON.stringify({
          type: 'text_delta',
          conversationId: 'conv-scroll-test',
          text: 'second part',
        })
      )

      // Should have scrolled multiple times
      expect(
        (view as any).messagesContainerEl?.scrollTo
      ).toHaveBeenCalledTimes(2)
    })

    it('should not scroll if user has scrolled up', () => {
      // Simulate user scrolling up
      const messagesContainer = (view as any).messagesContainerEl
      messagesContainer.scrollTop = 0
      messagesContainer.scrollHeight = 1000
      messagesContainer.clientHeight = 500

      mockWs.triggerMessage(
        JSON.stringify({
          type: 'text_delta',
          conversationId: 'conv-scroll-test',
          text: 'New message while scrolled up',
        })
      )

      // Should not auto-scroll when user has scrolled up
      expect(messagesContainer.scrollTo).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // Edge Cases and Integration Tests
  // ==========================================================================

  describe('Edge Cases', () => {
    beforeEach(async () => {
      await view.onOpen()
      mockWs.triggerOpen()
      mockWs.triggerMessage(
        JSON.stringify({
          type: 'connected',
          conversationId: 'conv-edge-test',
        })
      )
    })

    it('should handle rapid message sending', () => {
      for (let i = 0; i < 10; i++) {
        view.sendMessage(`Message ${i}`)
      }

      expect(mockWs.ws.send).toHaveBeenCalledTimes(10)
    })

    it('should handle rapid streaming updates', () => {
      for (let i = 0; i < 100; i++) {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'text_delta',
            conversationId: 'conv-edge-test',
            text: `chunk${i} `,
          })
        )
      }

      expect((view as any).streamingBuffer.split(' ').length).toBe(101) // 100 chunks + trailing
    })

    it('should handle very long messages', () => {
      const longMessage = 'x'.repeat(100000)

      view.sendMessage(longMessage)

      expect(mockWs.ws.send).toHaveBeenCalled()
    })

    it('should handle special characters in messages', () => {
      view.sendMessage('Message with <script>alert("xss")</script>')

      const conversation = view.getCurrentConversation()
      const message = conversation?.messages[0]

      // Should be escaped or sanitized
      expect(message?.content).not.toContain('<script>')
    })

    it('should handle emoji in messages', () => {
      view.sendMessage('Hello 👋 World 🌍')

      const conversation = view.getCurrentConversation()
      const message = conversation?.messages[0]

      expect(message?.content).toContain('👋')
      expect(message?.content).toContain('🌍')
    })

    it('should handle multiple tool executions in sequence', () => {
      const tools = ['tool-1', 'tool-2', 'tool-3']

      for (const toolId of tools) {
        mockWs.triggerMessage(
          JSON.stringify({
            type: 'tool_start',
            conversationId: 'conv-edge-test',
            toolUseId: toolId,
            name: 'test_tool',
            input: {},
          })
        )

        mockWs.triggerMessage(
          JSON.stringify({
            type: 'tool_result',
            conversationId: 'conv-edge-test',
            toolUseId: toolId,
            output: 'result',
            isError: false,
          })
        )
      }

      const conversation = view.getCurrentConversation()
      const toolMessages = conversation?.messages.filter((m) => m.role === 'tool')

      expect(toolMessages?.length).toBe(3)
    })

    it('should handle interleaved text and tool messages', () => {
      // Text delta
      mockWs.triggerMessage(
        JSON.stringify({
          type: 'text_delta',
          conversationId: 'conv-edge-test',
          text: 'Let me search for that. ',
        })
      )

      // Tool start
      mockWs.triggerMessage(
        JSON.stringify({
          type: 'tool_start',
          conversationId: 'conv-edge-test',
          toolUseId: 'interleave-tool',
          name: 'vault_search',
          input: { query: 'test' },
        })
      )

      // Tool result
      mockWs.triggerMessage(
        JSON.stringify({
          type: 'tool_result',
          conversationId: 'conv-edge-test',
          toolUseId: 'interleave-tool',
          output: { results: ['file.md'] },
          isError: false,
        })
      )

      // More text delta
      mockWs.triggerMessage(
        JSON.stringify({
          type: 'text_delta',
          conversationId: 'conv-edge-test',
          text: 'Found one result.',
        })
      )

      // Complete
      mockWs.triggerMessage(
        JSON.stringify({
          type: 'complete',
          conversationId: 'conv-edge-test',
          usage: { inputTokens: 50, outputTokens: 25 },
        })
      )

      const conversation = view.getCurrentConversation()
      expect(conversation?.messages.length).toBeGreaterThan(1)
    })

    it('should handle reconnection during streaming', () => {
      // Start streaming
      mockWs.triggerMessage(
        JSON.stringify({
          type: 'text_delta',
          conversationId: 'conv-edge-test',
          text: 'Partial message...',
        })
      )

      // Simulate connection drop
      mockWs.triggerClose(1006)

      // Should mark streaming message as incomplete or handle gracefully
      const conversation = view.getCurrentConversation()
      const lastMessage = conversation?.messages[conversation.messages.length - 1]

      expect(lastMessage?.isStreaming).toBe(false)
    })
  })

  // ==========================================================================
  // View Type Constant Tests
  // ==========================================================================

  describe('CHAT_VIEW_TYPE constant', () => {
    it('should be defined', () => {
      expect(CHAT_VIEW_TYPE).toBeDefined()
    })

    it('should be a string', () => {
      expect(typeof CHAT_VIEW_TYPE).toBe('string')
    })

    it('should match expected value', () => {
      expect(CHAT_VIEW_TYPE).toBe('obsidian-chat-view')
    })
  })
})
