import { describe, it, expect } from 'vitest'
import {
  // Type imports
  type ChatMessage,
  type CancelMessage,
  type NewConversationMessage,
  type ClientMessage,
  type TextDeltaMessage,
  type ToolStartMessage,
  type ToolResultMessage,
  type CompleteMessage,
  type ErrorMessage,
  type ConnectedMessage,
  type ServerMessage,
  // Schema imports for validation
  ChatMessageSchema,
  CancelMessageSchema,
  NewConversationMessageSchema,
  ClientMessageSchema,
  TextDeltaMessageSchema,
  ToolStartMessageSchema,
  ToolResultMessageSchema,
  CompleteMessageSchema,
  ErrorMessageSchema,
  ConnectedMessageSchema,
  ServerMessageSchema,
  // Utility functions
  parseClientMessage,
  parseServerMessage,
  serializeClientMessage,
  serializeServerMessage,
  generateConversationId,
  validateConversationId,
  isValidConversationId,
} from '../../src/agent/chat-protocol.js'

/**
 * TDD RED Tests for Chat Protocol Types and Serialization
 *
 * These tests define the expected behavior for a WebSocket-based chat protocol
 * between the Obsidian plugin Chat View (client) and the Agent Server (server).
 *
 * All tests should FAIL until implementation is complete.
 */

describe('Chat Protocol', () => {
  describe('Client Message Types', () => {
    describe('ChatMessage', () => {
      it('should have type "chat"', () => {
        const message: ChatMessage = {
          type: 'chat',
          conversationId: 'conv-123',
          message: 'Hello, world!',
        }
        expect(message.type).toBe('chat')
      })

      it('should require conversationId field', () => {
        const message: ChatMessage = {
          type: 'chat',
          conversationId: 'conv-456',
          message: 'Test message',
        }
        expect(message.conversationId).toBeDefined()
        expect(typeof message.conversationId).toBe('string')
      })

      it('should require message field', () => {
        const message: ChatMessage = {
          type: 'chat',
          conversationId: 'conv-789',
          message: 'Content here',
        }
        expect(message.message).toBeDefined()
        expect(typeof message.message).toBe('string')
      })

      it('should allow empty message content', () => {
        const message: ChatMessage = {
          type: 'chat',
          conversationId: 'conv-abc',
          message: '',
        }
        expect(message.message).toBe('')
      })
    })

    describe('CancelMessage', () => {
      it('should have type "cancel"', () => {
        const message: CancelMessage = {
          type: 'cancel',
          conversationId: 'conv-123',
        }
        expect(message.type).toBe('cancel')
      })

      it('should require conversationId field', () => {
        const message: CancelMessage = {
          type: 'cancel',
          conversationId: 'conv-456',
        }
        expect(message.conversationId).toBeDefined()
        expect(typeof message.conversationId).toBe('string')
      })
    })

    describe('NewConversationMessage', () => {
      it('should have type "new_conversation"', () => {
        const message: NewConversationMessage = {
          type: 'new_conversation',
        }
        expect(message.type).toBe('new_conversation')
      })

      it('should not require any additional fields', () => {
        const message: NewConversationMessage = {
          type: 'new_conversation',
        }
        expect(Object.keys(message)).toEqual(['type'])
      })
    })

    describe('ClientMessage union type', () => {
      it('should accept ChatMessage', () => {
        const message: ClientMessage = {
          type: 'chat',
          conversationId: 'conv-123',
          message: 'Hello',
        }
        expect(message.type).toBe('chat')
      })

      it('should accept CancelMessage', () => {
        const message: ClientMessage = {
          type: 'cancel',
          conversationId: 'conv-123',
        }
        expect(message.type).toBe('cancel')
      })

      it('should accept NewConversationMessage', () => {
        const message: ClientMessage = {
          type: 'new_conversation',
        }
        expect(message.type).toBe('new_conversation')
      })
    })
  })

  describe('Server Message Types', () => {
    describe('TextDeltaMessage', () => {
      it('should have type "text_delta"', () => {
        const message: TextDeltaMessage = {
          type: 'text_delta',
          conversationId: 'conv-123',
          text: 'Hello ',
        }
        expect(message.type).toBe('text_delta')
      })

      it('should require conversationId field', () => {
        const message: TextDeltaMessage = {
          type: 'text_delta',
          conversationId: 'conv-456',
          text: 'world',
        }
        expect(message.conversationId).toBeDefined()
      })

      it('should require text field', () => {
        const message: TextDeltaMessage = {
          type: 'text_delta',
          conversationId: 'conv-789',
          text: 'streaming content',
        }
        expect(message.text).toBeDefined()
        expect(typeof message.text).toBe('string')
      })

      it('should allow empty text for delta', () => {
        const message: TextDeltaMessage = {
          type: 'text_delta',
          conversationId: 'conv-abc',
          text: '',
        }
        expect(message.text).toBe('')
      })
    })

    describe('ToolStartMessage', () => {
      it('should have type "tool_start"', () => {
        const message: ToolStartMessage = {
          type: 'tool_start',
          conversationId: 'conv-123',
          toolUseId: 'tool-abc',
          name: 'vault_search',
          input: { query: 'test' },
        }
        expect(message.type).toBe('tool_start')
      })

      it('should require toolUseId field', () => {
        const message: ToolStartMessage = {
          type: 'tool_start',
          conversationId: 'conv-123',
          toolUseId: 'tool-xyz-789',
          name: 'note_read',
          input: { path: 'test.md' },
        }
        expect(message.toolUseId).toBeDefined()
        expect(typeof message.toolUseId).toBe('string')
      })

      it('should require name field', () => {
        const message: ToolStartMessage = {
          type: 'tool_start',
          conversationId: 'conv-123',
          toolUseId: 'tool-456',
          name: 'vault_list',
          input: {},
        }
        expect(message.name).toBeDefined()
        expect(typeof message.name).toBe('string')
      })

      it('should require input field', () => {
        const message: ToolStartMessage = {
          type: 'tool_start',
          conversationId: 'conv-123',
          toolUseId: 'tool-789',
          name: 'note_create',
          input: { path: 'new.md', content: '# New Note' },
        }
        expect(message.input).toBeDefined()
      })

      it('should allow any input type', () => {
        const message1: ToolStartMessage = {
          type: 'tool_start',
          conversationId: 'conv-123',
          toolUseId: 'tool-1',
          name: 'test',
          input: { nested: { deep: { value: 123 } } },
        }
        const message2: ToolStartMessage = {
          type: 'tool_start',
          conversationId: 'conv-123',
          toolUseId: 'tool-2',
          name: 'test',
          input: [1, 2, 3],
        }
        const message3: ToolStartMessage = {
          type: 'tool_start',
          conversationId: 'conv-123',
          toolUseId: 'tool-3',
          name: 'test',
          input: 'string input',
        }
        const message4: ToolStartMessage = {
          type: 'tool_start',
          conversationId: 'conv-123',
          toolUseId: 'tool-4',
          name: 'test',
          input: null,
        }

        expect(message1.input).toEqual({ nested: { deep: { value: 123 } } })
        expect(message2.input).toEqual([1, 2, 3])
        expect(message3.input).toBe('string input')
        expect(message4.input).toBeNull()
      })
    })

    describe('ToolResultMessage', () => {
      it('should have type "tool_result"', () => {
        const message: ToolResultMessage = {
          type: 'tool_result',
          conversationId: 'conv-123',
          toolUseId: 'tool-abc',
          output: { success: true },
          isError: false,
        }
        expect(message.type).toBe('tool_result')
      })

      it('should require toolUseId field', () => {
        const message: ToolResultMessage = {
          type: 'tool_result',
          conversationId: 'conv-123',
          toolUseId: 'tool-xyz',
          output: 'result data',
          isError: false,
        }
        expect(message.toolUseId).toBeDefined()
      })

      it('should require output field', () => {
        const message: ToolResultMessage = {
          type: 'tool_result',
          conversationId: 'conv-123',
          toolUseId: 'tool-456',
          output: { files: ['a.md', 'b.md'] },
          isError: false,
        }
        expect(message.output).toBeDefined()
      })

      it('should require isError field', () => {
        const message: ToolResultMessage = {
          type: 'tool_result',
          conversationId: 'conv-123',
          toolUseId: 'tool-789',
          output: { error: 'File not found' },
          isError: true,
        }
        expect(typeof message.isError).toBe('boolean')
      })

      it('should allow any output type', () => {
        const messageWithObject: ToolResultMessage = {
          type: 'tool_result',
          conversationId: 'conv-123',
          toolUseId: 'tool-1',
          output: { result: 'data' },
          isError: false,
        }
        const messageWithArray: ToolResultMessage = {
          type: 'tool_result',
          conversationId: 'conv-123',
          toolUseId: 'tool-2',
          output: ['item1', 'item2'],
          isError: false,
        }
        const messageWithString: ToolResultMessage = {
          type: 'tool_result',
          conversationId: 'conv-123',
          toolUseId: 'tool-3',
          output: 'simple string result',
          isError: false,
        }
        const messageWithNull: ToolResultMessage = {
          type: 'tool_result',
          conversationId: 'conv-123',
          toolUseId: 'tool-4',
          output: null,
          isError: false,
        }

        expect(messageWithObject.output).toEqual({ result: 'data' })
        expect(messageWithArray.output).toEqual(['item1', 'item2'])
        expect(messageWithString.output).toBe('simple string result')
        expect(messageWithNull.output).toBeNull()
      })
    })

    describe('CompleteMessage', () => {
      it('should have type "complete"', () => {
        const message: CompleteMessage = {
          type: 'complete',
          conversationId: 'conv-123',
          usage: { inputTokens: 100, outputTokens: 50 },
        }
        expect(message.type).toBe('complete')
      })

      it('should require usage field with inputTokens', () => {
        const message: CompleteMessage = {
          type: 'complete',
          conversationId: 'conv-123',
          usage: { inputTokens: 500, outputTokens: 200 },
        }
        expect(message.usage.inputTokens).toBeDefined()
        expect(typeof message.usage.inputTokens).toBe('number')
      })

      it('should require usage field with outputTokens', () => {
        const message: CompleteMessage = {
          type: 'complete',
          conversationId: 'conv-123',
          usage: { inputTokens: 300, outputTokens: 150 },
        }
        expect(message.usage.outputTokens).toBeDefined()
        expect(typeof message.usage.outputTokens).toBe('number')
      })

      it('should allow zero tokens', () => {
        const message: CompleteMessage = {
          type: 'complete',
          conversationId: 'conv-123',
          usage: { inputTokens: 0, outputTokens: 0 },
        }
        expect(message.usage.inputTokens).toBe(0)
        expect(message.usage.outputTokens).toBe(0)
      })
    })

    describe('ErrorMessage', () => {
      it('should have type "error"', () => {
        const message: ErrorMessage = {
          type: 'error',
          conversationId: 'conv-123',
          message: 'An error occurred',
        }
        expect(message.type).toBe('error')
      })

      it('should require message field', () => {
        const message: ErrorMessage = {
          type: 'error',
          conversationId: 'conv-123',
          message: 'Something went wrong',
        }
        expect(message.message).toBeDefined()
        expect(typeof message.message).toBe('string')
      })

      it('should allow optional code field', () => {
        const messageWithCode: ErrorMessage = {
          type: 'error',
          conversationId: 'conv-123',
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT',
        }
        const messageWithoutCode: ErrorMessage = {
          type: 'error',
          conversationId: 'conv-456',
          message: 'Unknown error',
        }
        expect(messageWithCode.code).toBe('RATE_LIMIT')
        expect(messageWithoutCode.code).toBeUndefined()
      })
    })

    describe('ConnectedMessage', () => {
      it('should have type "connected"', () => {
        const message: ConnectedMessage = {
          type: 'connected',
          conversationId: 'conv-new-123',
        }
        expect(message.type).toBe('connected')
      })

      it('should require conversationId field', () => {
        const message: ConnectedMessage = {
          type: 'connected',
          conversationId: 'conv-session-abc',
        }
        expect(message.conversationId).toBeDefined()
        expect(typeof message.conversationId).toBe('string')
      })
    })

    describe('ServerMessage union type', () => {
      it('should accept TextDeltaMessage', () => {
        const message: ServerMessage = {
          type: 'text_delta',
          conversationId: 'conv-123',
          text: 'Hello',
        }
        expect(message.type).toBe('text_delta')
      })

      it('should accept ToolStartMessage', () => {
        const message: ServerMessage = {
          type: 'tool_start',
          conversationId: 'conv-123',
          toolUseId: 'tool-1',
          name: 'test_tool',
          input: {},
        }
        expect(message.type).toBe('tool_start')
      })

      it('should accept ToolResultMessage', () => {
        const message: ServerMessage = {
          type: 'tool_result',
          conversationId: 'conv-123',
          toolUseId: 'tool-1',
          output: 'result',
          isError: false,
        }
        expect(message.type).toBe('tool_result')
      })

      it('should accept CompleteMessage', () => {
        const message: ServerMessage = {
          type: 'complete',
          conversationId: 'conv-123',
          usage: { inputTokens: 10, outputTokens: 5 },
        }
        expect(message.type).toBe('complete')
      })

      it('should accept ErrorMessage', () => {
        const message: ServerMessage = {
          type: 'error',
          conversationId: 'conv-123',
          message: 'Error',
        }
        expect(message.type).toBe('error')
      })

      it('should accept ConnectedMessage', () => {
        const message: ServerMessage = {
          type: 'connected',
          conversationId: 'conv-123',
        }
        expect(message.type).toBe('connected')
      })
    })
  })

  describe('Schema Validation', () => {
    describe('ChatMessageSchema', () => {
      it('should validate a valid chat message', () => {
        const result = ChatMessageSchema.safeParse({
          type: 'chat',
          conversationId: 'conv-123',
          message: 'Hello, world!',
        })
        expect(result.success).toBe(true)
      })

      it('should reject message with missing type', () => {
        const result = ChatMessageSchema.safeParse({
          conversationId: 'conv-123',
          message: 'Hello',
        })
        expect(result.success).toBe(false)
      })

      it('should reject message with wrong type value', () => {
        const result = ChatMessageSchema.safeParse({
          type: 'wrong',
          conversationId: 'conv-123',
          message: 'Hello',
        })
        expect(result.success).toBe(false)
      })

      it('should reject message with missing conversationId', () => {
        const result = ChatMessageSchema.safeParse({
          type: 'chat',
          message: 'Hello',
        })
        expect(result.success).toBe(false)
      })

      it('should reject message with missing message field', () => {
        const result = ChatMessageSchema.safeParse({
          type: 'chat',
          conversationId: 'conv-123',
        })
        expect(result.success).toBe(false)
      })

      it('should reject message with non-string conversationId', () => {
        const result = ChatMessageSchema.safeParse({
          type: 'chat',
          conversationId: 123,
          message: 'Hello',
        })
        expect(result.success).toBe(false)
      })

      it('should reject message with non-string message', () => {
        const result = ChatMessageSchema.safeParse({
          type: 'chat',
          conversationId: 'conv-123',
          message: { text: 'Hello' },
        })
        expect(result.success).toBe(false)
      })
    })

    describe('CancelMessageSchema', () => {
      it('should validate a valid cancel message', () => {
        const result = CancelMessageSchema.safeParse({
          type: 'cancel',
          conversationId: 'conv-123',
        })
        expect(result.success).toBe(true)
      })

      it('should reject message with wrong type', () => {
        const result = CancelMessageSchema.safeParse({
          type: 'chat',
          conversationId: 'conv-123',
        })
        expect(result.success).toBe(false)
      })

      it('should reject message with missing conversationId', () => {
        const result = CancelMessageSchema.safeParse({
          type: 'cancel',
        })
        expect(result.success).toBe(false)
      })
    })

    describe('NewConversationMessageSchema', () => {
      it('should validate a valid new_conversation message', () => {
        const result = NewConversationMessageSchema.safeParse({
          type: 'new_conversation',
        })
        expect(result.success).toBe(true)
      })

      it('should reject message with wrong type', () => {
        const result = NewConversationMessageSchema.safeParse({
          type: 'new',
        })
        expect(result.success).toBe(false)
      })

      it('should allow extra fields to be ignored (strict mode should strip them)', () => {
        const result = NewConversationMessageSchema.safeParse({
          type: 'new_conversation',
          extraField: 'should be stripped',
        })
        // Schema should succeed but strip extra fields
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).not.toHaveProperty('extraField')
        }
      })
    })

    describe('ClientMessageSchema (union)', () => {
      it('should validate chat message', () => {
        const result = ClientMessageSchema.safeParse({
          type: 'chat',
          conversationId: 'conv-123',
          message: 'Hello',
        })
        expect(result.success).toBe(true)
      })

      it('should validate cancel message', () => {
        const result = ClientMessageSchema.safeParse({
          type: 'cancel',
          conversationId: 'conv-123',
        })
        expect(result.success).toBe(true)
      })

      it('should validate new_conversation message', () => {
        const result = ClientMessageSchema.safeParse({
          type: 'new_conversation',
        })
        expect(result.success).toBe(true)
      })

      it('should reject unknown message type', () => {
        const result = ClientMessageSchema.safeParse({
          type: 'unknown',
          conversationId: 'conv-123',
        })
        expect(result.success).toBe(false)
      })

      it('should reject null', () => {
        const result = ClientMessageSchema.safeParse(null)
        expect(result.success).toBe(false)
      })

      it('should reject undefined', () => {
        const result = ClientMessageSchema.safeParse(undefined)
        expect(result.success).toBe(false)
      })

      it('should reject non-object', () => {
        const result = ClientMessageSchema.safeParse('string')
        expect(result.success).toBe(false)
      })
    })

    describe('TextDeltaMessageSchema', () => {
      it('should validate a valid text_delta message', () => {
        const result = TextDeltaMessageSchema.safeParse({
          type: 'text_delta',
          conversationId: 'conv-123',
          text: 'Hello',
        })
        expect(result.success).toBe(true)
      })

      it('should reject message with missing text', () => {
        const result = TextDeltaMessageSchema.safeParse({
          type: 'text_delta',
          conversationId: 'conv-123',
        })
        expect(result.success).toBe(false)
      })
    })

    describe('ToolStartMessageSchema', () => {
      it('should validate a valid tool_start message', () => {
        const result = ToolStartMessageSchema.safeParse({
          type: 'tool_start',
          conversationId: 'conv-123',
          toolUseId: 'tool-abc',
          name: 'vault_search',
          input: { query: 'test' },
        })
        expect(result.success).toBe(true)
      })

      it('should reject message with missing toolUseId', () => {
        const result = ToolStartMessageSchema.safeParse({
          type: 'tool_start',
          conversationId: 'conv-123',
          name: 'vault_search',
          input: {},
        })
        expect(result.success).toBe(false)
      })

      it('should reject message with missing name', () => {
        const result = ToolStartMessageSchema.safeParse({
          type: 'tool_start',
          conversationId: 'conv-123',
          toolUseId: 'tool-abc',
          input: {},
        })
        expect(result.success).toBe(false)
      })

      it('should accept any input value including null', () => {
        const result = ToolStartMessageSchema.safeParse({
          type: 'tool_start',
          conversationId: 'conv-123',
          toolUseId: 'tool-abc',
          name: 'test',
          input: null,
        })
        expect(result.success).toBe(true)
      })
    })

    describe('ToolResultMessageSchema', () => {
      it('should validate a valid tool_result message', () => {
        const result = ToolResultMessageSchema.safeParse({
          type: 'tool_result',
          conversationId: 'conv-123',
          toolUseId: 'tool-abc',
          output: { success: true },
          isError: false,
        })
        expect(result.success).toBe(true)
      })

      it('should reject message with missing isError', () => {
        const result = ToolResultMessageSchema.safeParse({
          type: 'tool_result',
          conversationId: 'conv-123',
          toolUseId: 'tool-abc',
          output: 'result',
        })
        expect(result.success).toBe(false)
      })

      it('should reject message with non-boolean isError', () => {
        const result = ToolResultMessageSchema.safeParse({
          type: 'tool_result',
          conversationId: 'conv-123',
          toolUseId: 'tool-abc',
          output: 'result',
          isError: 'false',
        })
        expect(result.success).toBe(false)
      })
    })

    describe('CompleteMessageSchema', () => {
      it('should validate a valid complete message', () => {
        const result = CompleteMessageSchema.safeParse({
          type: 'complete',
          conversationId: 'conv-123',
          usage: { inputTokens: 100, outputTokens: 50 },
        })
        expect(result.success).toBe(true)
      })

      it('should reject message with missing usage', () => {
        const result = CompleteMessageSchema.safeParse({
          type: 'complete',
          conversationId: 'conv-123',
        })
        expect(result.success).toBe(false)
      })

      it('should reject message with missing inputTokens', () => {
        const result = CompleteMessageSchema.safeParse({
          type: 'complete',
          conversationId: 'conv-123',
          usage: { outputTokens: 50 },
        })
        expect(result.success).toBe(false)
      })

      it('should reject message with missing outputTokens', () => {
        const result = CompleteMessageSchema.safeParse({
          type: 'complete',
          conversationId: 'conv-123',
          usage: { inputTokens: 100 },
        })
        expect(result.success).toBe(false)
      })

      it('should reject message with non-numeric tokens', () => {
        const result = CompleteMessageSchema.safeParse({
          type: 'complete',
          conversationId: 'conv-123',
          usage: { inputTokens: '100', outputTokens: 50 },
        })
        expect(result.success).toBe(false)
      })

      it('should reject negative token counts', () => {
        const result = CompleteMessageSchema.safeParse({
          type: 'complete',
          conversationId: 'conv-123',
          usage: { inputTokens: -10, outputTokens: 50 },
        })
        expect(result.success).toBe(false)
      })
    })

    describe('ErrorMessageSchema', () => {
      it('should validate error message without code', () => {
        const result = ErrorMessageSchema.safeParse({
          type: 'error',
          conversationId: 'conv-123',
          message: 'An error occurred',
        })
        expect(result.success).toBe(true)
      })

      it('should validate error message with code', () => {
        const result = ErrorMessageSchema.safeParse({
          type: 'error',
          conversationId: 'conv-123',
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT',
        })
        expect(result.success).toBe(true)
      })

      it('should reject error message with missing message', () => {
        const result = ErrorMessageSchema.safeParse({
          type: 'error',
          conversationId: 'conv-123',
        })
        expect(result.success).toBe(false)
      })
    })

    describe('ConnectedMessageSchema', () => {
      it('should validate a valid connected message', () => {
        const result = ConnectedMessageSchema.safeParse({
          type: 'connected',
          conversationId: 'conv-new-123',
        })
        expect(result.success).toBe(true)
      })

      it('should reject message with wrong type', () => {
        const result = ConnectedMessageSchema.safeParse({
          type: 'connection',
          conversationId: 'conv-123',
        })
        expect(result.success).toBe(false)
      })
    })

    describe('ServerMessageSchema (union)', () => {
      it('should validate all server message types', () => {
        const messages = [
          { type: 'text_delta', conversationId: 'c1', text: 'Hello' },
          { type: 'tool_start', conversationId: 'c1', toolUseId: 't1', name: 'test', input: {} },
          { type: 'tool_result', conversationId: 'c1', toolUseId: 't1', output: 'ok', isError: false },
          { type: 'complete', conversationId: 'c1', usage: { inputTokens: 10, outputTokens: 5 } },
          { type: 'error', conversationId: 'c1', message: 'Error!' },
          { type: 'connected', conversationId: 'c1' },
        ]

        for (const msg of messages) {
          const result = ServerMessageSchema.safeParse(msg)
          expect(result.success).toBe(true)
        }
      })

      it('should reject unknown server message type', () => {
        const result = ServerMessageSchema.safeParse({
          type: 'unknown_server_type',
          conversationId: 'conv-123',
        })
        expect(result.success).toBe(false)
      })
    })
  })

  describe('Serialization', () => {
    describe('serializeClientMessage', () => {
      it('should serialize chat message to JSON string', () => {
        const message: ChatMessage = {
          type: 'chat',
          conversationId: 'conv-123',
          message: 'Hello, world!',
        }
        const json = serializeClientMessage(message)
        expect(typeof json).toBe('string')
        expect(JSON.parse(json)).toEqual(message)
      })

      it('should serialize cancel message to JSON string', () => {
        const message: CancelMessage = {
          type: 'cancel',
          conversationId: 'conv-123',
        }
        const json = serializeClientMessage(message)
        expect(JSON.parse(json)).toEqual(message)
      })

      it('should serialize new_conversation message to JSON string', () => {
        const message: NewConversationMessage = {
          type: 'new_conversation',
        }
        const json = serializeClientMessage(message)
        expect(JSON.parse(json)).toEqual(message)
      })

      it('should handle special characters in message content', () => {
        const message: ChatMessage = {
          type: 'chat',
          conversationId: 'conv-123',
          message: 'Hello\n"world"\t\\backslash\\',
        }
        const json = serializeClientMessage(message)
        const parsed = JSON.parse(json)
        expect(parsed.message).toBe('Hello\n"world"\t\\backslash\\')
      })

      it('should handle unicode characters', () => {
        const message: ChatMessage = {
          type: 'chat',
          conversationId: 'conv-123',
          message: 'Hello 世界 🌍 مرحبا',
        }
        const json = serializeClientMessage(message)
        const parsed = JSON.parse(json)
        expect(parsed.message).toBe('Hello 世界 🌍 مرحبا')
      })

      it('should handle very long message content', () => {
        const longContent = 'a'.repeat(100000)
        const message: ChatMessage = {
          type: 'chat',
          conversationId: 'conv-123',
          message: longContent,
        }
        const json = serializeClientMessage(message)
        const parsed = JSON.parse(json)
        expect(parsed.message).toBe(longContent)
        expect(parsed.message.length).toBe(100000)
      })
    })

    describe('serializeServerMessage', () => {
      it('should serialize text_delta message to JSON string', () => {
        const message: TextDeltaMessage = {
          type: 'text_delta',
          conversationId: 'conv-123',
          text: 'streaming content',
        }
        const json = serializeServerMessage(message)
        expect(JSON.parse(json)).toEqual(message)
      })

      it('should serialize tool_start message with complex input', () => {
        const message: ToolStartMessage = {
          type: 'tool_start',
          conversationId: 'conv-123',
          toolUseId: 'tool-abc',
          name: 'vault_search',
          input: {
            query: 'test query',
            options: {
              limit: 10,
              nested: { deep: true },
            },
          },
        }
        const json = serializeServerMessage(message)
        const parsed = JSON.parse(json)
        expect(parsed.input.options.nested.deep).toBe(true)
      })

      it('should serialize tool_result message', () => {
        const message: ToolResultMessage = {
          type: 'tool_result',
          conversationId: 'conv-123',
          toolUseId: 'tool-abc',
          output: { files: ['a.md', 'b.md'], count: 2 },
          isError: false,
        }
        const json = serializeServerMessage(message)
        const parsed = JSON.parse(json)
        expect(parsed.output.files).toEqual(['a.md', 'b.md'])
      })

      it('should serialize complete message', () => {
        const message: CompleteMessage = {
          type: 'complete',
          conversationId: 'conv-123',
          usage: { inputTokens: 1000, outputTokens: 500 },
        }
        const json = serializeServerMessage(message)
        const parsed = JSON.parse(json)
        expect(parsed.usage.inputTokens).toBe(1000)
      })

      it('should serialize error message', () => {
        const message: ErrorMessage = {
          type: 'error',
          conversationId: 'conv-123',
          message: 'Something went wrong',
          code: 'INTERNAL_ERROR',
        }
        const json = serializeServerMessage(message)
        const parsed = JSON.parse(json)
        expect(parsed.code).toBe('INTERNAL_ERROR')
      })
    })

    describe('parseClientMessage', () => {
      it('should parse valid chat message JSON', () => {
        const json = '{"type":"chat","conversationId":"conv-123","message":"Hello"}'
        const result = parseClientMessage(json)
        expect(result.type).toBe('chat')
        expect((result as ChatMessage).message).toBe('Hello')
      })

      it('should parse valid cancel message JSON', () => {
        const json = '{"type":"cancel","conversationId":"conv-123"}'
        const result = parseClientMessage(json)
        expect(result.type).toBe('cancel')
      })

      it('should parse valid new_conversation message JSON', () => {
        const json = '{"type":"new_conversation"}'
        const result = parseClientMessage(json)
        expect(result.type).toBe('new_conversation')
      })

      it('should throw on invalid JSON', () => {
        expect(() => parseClientMessage('not valid json')).toThrow()
      })

      it('should throw on invalid message structure', () => {
        expect(() => parseClientMessage('{"type":"invalid"}')).toThrow()
      })

      it('should throw on missing required fields', () => {
        expect(() => parseClientMessage('{"type":"chat"}')).toThrow()
      })

      it('should handle whitespace in JSON', () => {
        const json = `{
          "type": "chat",
          "conversationId": "conv-123",
          "message": "Hello"
        }`
        const result = parseClientMessage(json)
        expect(result.type).toBe('chat')
      })
    })

    describe('parseServerMessage', () => {
      it('should parse valid text_delta message JSON', () => {
        const json = '{"type":"text_delta","conversationId":"conv-123","text":"Hello"}'
        const result = parseServerMessage(json)
        expect(result.type).toBe('text_delta')
        expect((result as TextDeltaMessage).text).toBe('Hello')
      })

      it('should parse valid tool_start message JSON', () => {
        const json = '{"type":"tool_start","conversationId":"c1","toolUseId":"t1","name":"test","input":{}}'
        const result = parseServerMessage(json)
        expect(result.type).toBe('tool_start')
      })

      it('should parse valid tool_result message JSON', () => {
        const json = '{"type":"tool_result","conversationId":"c1","toolUseId":"t1","output":"ok","isError":false}'
        const result = parseServerMessage(json)
        expect(result.type).toBe('tool_result')
      })

      it('should parse valid complete message JSON', () => {
        const json = '{"type":"complete","conversationId":"c1","usage":{"inputTokens":10,"outputTokens":5}}'
        const result = parseServerMessage(json)
        expect(result.type).toBe('complete')
      })

      it('should parse valid error message JSON', () => {
        const json = '{"type":"error","conversationId":"c1","message":"Error!"}'
        const result = parseServerMessage(json)
        expect(result.type).toBe('error')
      })

      it('should parse valid connected message JSON', () => {
        const json = '{"type":"connected","conversationId":"conv-new-123"}'
        const result = parseServerMessage(json)
        expect(result.type).toBe('connected')
      })

      it('should throw on invalid JSON', () => {
        expect(() => parseServerMessage('invalid')).toThrow()
      })

      it('should throw on unknown message type', () => {
        expect(() => parseServerMessage('{"type":"unknown","conversationId":"c1"}')).toThrow()
      })
    })
  })

  describe('Conversation ID', () => {
    describe('generateConversationId', () => {
      it('should return a string', () => {
        const id = generateConversationId()
        expect(typeof id).toBe('string')
      })

      it('should generate unique IDs', () => {
        const ids = new Set<string>()
        for (let i = 0; i < 1000; i++) {
          ids.add(generateConversationId())
        }
        expect(ids.size).toBe(1000)
      })

      it('should generate IDs with minimum length', () => {
        const id = generateConversationId()
        expect(id.length).toBeGreaterThanOrEqual(8)
      })

      it('should generate IDs that pass validation', () => {
        const id = generateConversationId()
        expect(isValidConversationId(id)).toBe(true)
      })

      it('should generate IDs with expected prefix', () => {
        const id = generateConversationId()
        expect(id.startsWith('conv-')).toBe(true)
      })
    })

    describe('validateConversationId', () => {
      it('should not throw for valid conversation ID', () => {
        expect(() => validateConversationId('conv-abc123')).not.toThrow()
      })

      it('should throw for empty string', () => {
        expect(() => validateConversationId('')).toThrow()
      })

      it('should throw for null', () => {
        expect(() => validateConversationId(null as any)).toThrow()
      })

      it('should throw for undefined', () => {
        expect(() => validateConversationId(undefined as any)).toThrow()
      })

      it('should throw for non-string', () => {
        expect(() => validateConversationId(123 as any)).toThrow()
      })

      it('should throw for string with invalid characters', () => {
        expect(() => validateConversationId('conv-<script>alert(1)</script>')).toThrow()
      })

      it('should throw for string that is too long', () => {
        const longId = 'conv-' + 'a'.repeat(256)
        expect(() => validateConversationId(longId)).toThrow()
      })

      it('should throw for string without proper prefix', () => {
        expect(() => validateConversationId('abc123')).toThrow()
      })
    })

    describe('isValidConversationId', () => {
      it('should return true for valid ID', () => {
        expect(isValidConversationId('conv-abc123')).toBe(true)
      })

      it('should return true for ID with dashes', () => {
        expect(isValidConversationId('conv-abc-123-def')).toBe(true)
      })

      it('should return true for ID with underscores', () => {
        expect(isValidConversationId('conv-abc_123_def')).toBe(true)
      })

      it('should return false for empty string', () => {
        expect(isValidConversationId('')).toBe(false)
      })

      it('should return false for null', () => {
        expect(isValidConversationId(null as any)).toBe(false)
      })

      it('should return false for undefined', () => {
        expect(isValidConversationId(undefined as any)).toBe(false)
      })

      it('should return false for number', () => {
        expect(isValidConversationId(123 as any)).toBe(false)
      })

      it('should return false for object', () => {
        expect(isValidConversationId({} as any)).toBe(false)
      })

      it('should return false for whitespace-only string', () => {
        expect(isValidConversationId('   ')).toBe(false)
      })

      it('should return false for string with spaces', () => {
        expect(isValidConversationId('conv-abc 123')).toBe(false)
      })

      it('should return false for string with special characters', () => {
        expect(isValidConversationId('conv-abc!@#$%')).toBe(false)
      })

      it('should return false for string that is too short', () => {
        expect(isValidConversationId('c-1')).toBe(false)
      })

      it('should return false for string without conv- prefix', () => {
        expect(isValidConversationId('session-123')).toBe(false)
      })
    })
  })

  describe('Edge Cases', () => {
    describe('message content edge cases', () => {
      it('should handle message with only whitespace', () => {
        const message: ChatMessage = {
          type: 'chat',
          conversationId: 'conv-123',
          message: '   \n\t  ',
        }
        const json = serializeClientMessage(message)
        const parsed = parseClientMessage(json)
        expect((parsed as ChatMessage).message).toBe('   \n\t  ')
      })

      it('should handle message with control characters', () => {
        const message: ChatMessage = {
          type: 'chat',
          conversationId: 'conv-123',
          message: 'Hello\x00\x01\x02World',
        }
        const json = serializeClientMessage(message)
        // JSON.stringify handles control characters
        expect(typeof json).toBe('string')
      })

      it('should handle message with markdown content', () => {
        const markdownContent = `# Heading

**Bold** and *italic*

\`\`\`javascript
const x = 1;
\`\`\`

- List item 1
- List item 2

> Blockquote

[[wikilink]]
`
        const message: ChatMessage = {
          type: 'chat',
          conversationId: 'conv-123',
          message: markdownContent,
        }
        const json = serializeClientMessage(message)
        const parsed = parseClientMessage(json)
        expect((parsed as ChatMessage).message).toBe(markdownContent)
      })
    })

    describe('tool input/output edge cases', () => {
      it('should handle deeply nested input objects', () => {
        const deepObject: any = { level1: { level2: { level3: { level4: { value: 'deep' } } } } }
        const message: ToolStartMessage = {
          type: 'tool_start',
          conversationId: 'conv-123',
          toolUseId: 'tool-1',
          name: 'test',
          input: deepObject,
        }
        const json = serializeServerMessage(message)
        const parsed = parseServerMessage(json) as ToolStartMessage
        expect((parsed.input as any).level1.level2.level3.level4.value).toBe('deep')
      })

      it('should handle array with mixed types in tool output', () => {
        const message: ToolResultMessage = {
          type: 'tool_result',
          conversationId: 'conv-123',
          toolUseId: 'tool-1',
          output: [1, 'two', { three: 3 }, [4, 5], null, true],
          isError: false,
        }
        const json = serializeServerMessage(message)
        const parsed = parseServerMessage(json) as ToolResultMessage
        expect(parsed.output).toEqual([1, 'two', { three: 3 }, [4, 5], null, true])
      })

      it('should handle undefined values in input object', () => {
        // Note: undefined values are stripped in JSON
        const message: ToolStartMessage = {
          type: 'tool_start',
          conversationId: 'conv-123',
          toolUseId: 'tool-1',
          name: 'test',
          input: { a: 1, b: undefined, c: 3 },
        }
        const json = serializeServerMessage(message)
        const parsed = parseServerMessage(json) as ToolStartMessage
        expect((parsed.input as any).b).toBeUndefined()
        expect((parsed.input as any).a).toBe(1)
      })
    })

    describe('large message handling', () => {
      it('should handle messages with 1MB of content', () => {
        const largeContent = 'x'.repeat(1024 * 1024) // 1MB
        const message: ChatMessage = {
          type: 'chat',
          conversationId: 'conv-123',
          message: largeContent,
        }
        const json = serializeClientMessage(message)
        const parsed = parseClientMessage(json)
        expect((parsed as ChatMessage).message.length).toBe(1024 * 1024)
      })

      it('should handle tool result with large output array', () => {
        const largeArray = Array(10000).fill(0).map((_, i) => ({ id: i, data: 'item-' + i }))
        const message: ToolResultMessage = {
          type: 'tool_result',
          conversationId: 'conv-123',
          toolUseId: 'tool-1',
          output: largeArray,
          isError: false,
        }
        const json = serializeServerMessage(message)
        const parsed = parseServerMessage(json) as ToolResultMessage
        expect((parsed.output as any[]).length).toBe(10000)
      })
    })

    describe('usage token edge cases', () => {
      it('should handle very large token counts', () => {
        const message: CompleteMessage = {
          type: 'complete',
          conversationId: 'conv-123',
          usage: { inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: Number.MAX_SAFE_INTEGER },
        }
        const json = serializeServerMessage(message)
        const parsed = parseServerMessage(json) as CompleteMessage
        expect(parsed.usage.inputTokens).toBe(Number.MAX_SAFE_INTEGER)
      })

      it('should handle floating point token counts (should be rejected or truncated)', () => {
        const result = CompleteMessageSchema.safeParse({
          type: 'complete',
          conversationId: 'conv-123',
          usage: { inputTokens: 10.5, outputTokens: 5.5 },
        })
        // Tokens should be integers
        expect(result.success).toBe(false)
      })
    })
  })

  describe('Type Guards (inferred from schema)', () => {
    it('should correctly identify chat message type', () => {
      const message = parseClientMessage('{"type":"chat","conversationId":"c1","message":"hi"}')
      expect(message.type).toBe('chat')
      if (message.type === 'chat') {
        // TypeScript should narrow the type here
        expect(message.message).toBe('hi')
      }
    })

    it('should correctly identify cancel message type', () => {
      const message = parseClientMessage('{"type":"cancel","conversationId":"c1"}')
      expect(message.type).toBe('cancel')
      if (message.type === 'cancel') {
        expect(message.conversationId).toBe('c1')
      }
    })

    it('should correctly identify text_delta message type', () => {
      const message = parseServerMessage('{"type":"text_delta","conversationId":"c1","text":"hi"}')
      expect(message.type).toBe('text_delta')
      if (message.type === 'text_delta') {
        expect(message.text).toBe('hi')
      }
    })

    it('should correctly identify tool_start message type', () => {
      const message = parseServerMessage('{"type":"tool_start","conversationId":"c1","toolUseId":"t1","name":"x","input":{}}')
      expect(message.type).toBe('tool_start')
      if (message.type === 'tool_start') {
        expect(message.toolUseId).toBe('t1')
        expect(message.name).toBe('x')
      }
    })

    it('should correctly identify tool_result message type', () => {
      const message = parseServerMessage('{"type":"tool_result","conversationId":"c1","toolUseId":"t1","output":"ok","isError":false}')
      expect(message.type).toBe('tool_result')
      if (message.type === 'tool_result') {
        expect(message.isError).toBe(false)
      }
    })

    it('should correctly identify complete message type', () => {
      const message = parseServerMessage('{"type":"complete","conversationId":"c1","usage":{"inputTokens":1,"outputTokens":1}}')
      expect(message.type).toBe('complete')
      if (message.type === 'complete') {
        expect(message.usage.inputTokens).toBe(1)
      }
    })

    it('should correctly identify error message type', () => {
      const message = parseServerMessage('{"type":"error","conversationId":"c1","message":"err"}')
      expect(message.type).toBe('error')
      if (message.type === 'error') {
        expect(message.message).toBe('err')
      }
    }
    )

    it('should correctly identify connected message type', () => {
      const message = parseServerMessage('{"type":"connected","conversationId":"c1"}')
      expect(message.type).toBe('connected')
      if (message.type === 'connected') {
        expect(message.conversationId).toBe('c1')
      }
    })
  })
})
