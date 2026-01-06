/**
 * Chat Protocol Types and Serialization
 *
 * Defines the WebSocket message protocol between the Obsidian plugin
 * Chat View (client) and the Agent Server (server).
 */

import { z } from 'zod'

// ============================================================================
// Client Message Types
// ============================================================================

export interface ChatMessage {
  type: 'chat'
  conversationId: string
  message: string
}

export interface CancelMessage {
  type: 'cancel'
  conversationId: string
}

export interface NewConversationMessage {
  type: 'new_conversation'
}

export type ClientMessage = ChatMessage | CancelMessage | NewConversationMessage

// ============================================================================
// Server Message Types
// ============================================================================

export interface TextDeltaMessage {
  type: 'text_delta'
  conversationId: string
  text: string
}

export interface ToolStartMessage {
  type: 'tool_start'
  conversationId: string
  toolUseId: string
  name: string
  input: unknown
}

export interface ToolResultMessage {
  type: 'tool_result'
  conversationId: string
  toolUseId: string
  output: unknown
  isError: boolean
}

export interface CompleteMessage {
  type: 'complete'
  conversationId: string
  usage: {
    inputTokens: number
    outputTokens: number
  }
}

export interface ErrorMessage {
  type: 'error'
  conversationId: string
  message: string
  code?: string
}

export interface ConnectedMessage {
  type: 'connected'
  conversationId: string
}

export type ServerMessage =
  | TextDeltaMessage
  | ToolStartMessage
  | ToolResultMessage
  | CompleteMessage
  | ErrorMessage
  | ConnectedMessage

// ============================================================================
// Zod Schemas
// ============================================================================

export const ChatMessageSchema = z
  .object({
    type: z.literal('chat'),
    conversationId: z.string(),
    message: z.string(),
  })
  .strict()
  .transform((data) => ({
    type: data.type,
    conversationId: data.conversationId,
    message: data.message,
  }))

export const CancelMessageSchema = z
  .object({
    type: z.literal('cancel'),
    conversationId: z.string(),
  })
  .strict()
  .transform((data) => ({
    type: data.type,
    conversationId: data.conversationId,
  }))

export const NewConversationMessageSchema = z
  .object({
    type: z.literal('new_conversation'),
  })
  .passthrough()
  .transform((data) => ({
    type: data.type as 'new_conversation',
  }))

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('chat'),
    conversationId: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal('cancel'),
    conversationId: z.string(),
  }),
  z.object({
    type: z.literal('new_conversation'),
  }),
])

export const TextDeltaMessageSchema = z
  .object({
    type: z.literal('text_delta'),
    conversationId: z.string(),
    text: z.string(),
  })
  .strict()

export const ToolStartMessageSchema = z
  .object({
    type: z.literal('tool_start'),
    conversationId: z.string(),
    toolUseId: z.string(),
    name: z.string(),
    input: z.unknown(),
  })
  .strict()

export const ToolResultMessageSchema = z
  .object({
    type: z.literal('tool_result'),
    conversationId: z.string(),
    toolUseId: z.string(),
    output: z.unknown(),
    isError: z.boolean(),
  })
  .strict()

const UsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
})

export const CompleteMessageSchema = z
  .object({
    type: z.literal('complete'),
    conversationId: z.string(),
    usage: UsageSchema,
  })
  .strict()

export const ErrorMessageSchema = z
  .object({
    type: z.literal('error'),
    conversationId: z.string(),
    message: z.string(),
    code: z.string().optional(),
  })
  .strict()

export const ConnectedMessageSchema = z
  .object({
    type: z.literal('connected'),
    conversationId: z.string(),
  })
  .strict()

export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text_delta'),
    conversationId: z.string(),
    text: z.string(),
  }),
  z.object({
    type: z.literal('tool_start'),
    conversationId: z.string(),
    toolUseId: z.string(),
    name: z.string(),
    input: z.unknown(),
  }),
  z.object({
    type: z.literal('tool_result'),
    conversationId: z.string(),
    toolUseId: z.string(),
    output: z.unknown(),
    isError: z.boolean(),
  }),
  z.object({
    type: z.literal('complete'),
    conversationId: z.string(),
    usage: UsageSchema,
  }),
  z.object({
    type: z.literal('error'),
    conversationId: z.string(),
    message: z.string(),
    code: z.string().optional(),
  }),
  z.object({
    type: z.literal('connected'),
    conversationId: z.string(),
  }),
])

// ============================================================================
// Serialization Functions
// ============================================================================

/**
 * Parse a JSON string into a validated ClientMessage
 */
export function parseClientMessage(data: string): ClientMessage {
  const parsed = JSON.parse(data)
  const result = ClientMessageSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`Invalid client message: ${result.error.message}`)
  }
  return result.data as ClientMessage
}

/**
 * Parse a JSON string into a validated ServerMessage
 */
export function parseServerMessage(data: string): ServerMessage {
  const parsed = JSON.parse(data)
  const result = ServerMessageSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`Invalid server message: ${result.error.message}`)
  }
  return result.data as ServerMessage
}

/**
 * Serialize a ClientMessage to a JSON string
 */
export function serializeClientMessage(message: ClientMessage): string {
  return JSON.stringify(message)
}

/**
 * Serialize a ServerMessage to a JSON string
 */
export function serializeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message)
}

// ============================================================================
// Conversation ID Utilities
// ============================================================================

// Valid conversation ID pattern: must start with "conv-" followed by alphanumeric, dash, or underscore characters
const CONVERSATION_ID_PATTERN = /^conv-[a-zA-Z0-9_-]+$/
const MIN_CONVERSATION_ID_LENGTH = 8
const MAX_CONVERSATION_ID_LENGTH = 255

/**
 * Generate a unique conversation ID with UUID v4 format
 */
export function generateConversationId(): string {
  // Generate UUID v4 format
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
  return `conv-${uuid}`
}

/**
 * Validate a conversation ID, throwing an error if invalid
 */
export function validateConversationId(id: unknown): void {
  if (typeof id !== 'string') {
    throw new Error('Conversation ID must be a string')
  }
  if (id.length === 0) {
    throw new Error('Conversation ID cannot be empty')
  }
  if (id.length < MIN_CONVERSATION_ID_LENGTH) {
    throw new Error(`Conversation ID must be at least ${MIN_CONVERSATION_ID_LENGTH} characters`)
  }
  if (id.length > MAX_CONVERSATION_ID_LENGTH) {
    throw new Error(`Conversation ID cannot exceed ${MAX_CONVERSATION_ID_LENGTH} characters`)
  }
  if (!id.startsWith('conv-')) {
    throw new Error('Conversation ID must start with "conv-"')
  }
  if (!CONVERSATION_ID_PATTERN.test(id)) {
    throw new Error('Conversation ID contains invalid characters')
  }
}

/**
 * Check if a conversation ID is valid without throwing
 */
export function isValidConversationId(id: unknown): boolean {
  if (typeof id !== 'string') {
    return false
  }
  if (id.length < MIN_CONVERSATION_ID_LENGTH) {
    return false
  }
  if (id.length > MAX_CONVERSATION_ID_LENGTH) {
    return false
  }
  return CONVERSATION_ID_PATTERN.test(id)
}
