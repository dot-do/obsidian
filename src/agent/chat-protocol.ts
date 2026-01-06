/**
 * Chat Protocol Types and Serialization
 *
 * Defines the WebSocket message protocol between the Obsidian plugin
 * Chat View (client) and the Agent Server (server).
 *
 * STUB: All exports throw "Not implemented" for TDD RED phase.
 */

import { z } from 'zod'

// Client Message Types

export interface ChatMessage {
  type: 'chat'
  conversationId: string
  content: string
  timestamp: number
}

export interface CancelMessage {
  type: 'cancel'
  conversationId: string
}

export interface NewConversationMessage {
  type: 'new_conversation'
  conversationId: string
  timestamp: number
}

export type ClientMessage = ChatMessage | CancelMessage | NewConversationMessage

// Server Message Types

export interface TextDeltaMessage {
  type: 'text_delta'
  conversationId: string
  delta: string
  messageId: string
}

export interface ToolStartMessage {
  type: 'tool_start'
  conversationId: string
  messageId: string
  toolName: string
  toolInput: unknown
}

export interface ToolResultMessage {
  type: 'tool_result'
  conversationId: string
  messageId: string
  toolName: string
  result: unknown
  error?: string
}

export interface CompleteMessage {
  type: 'complete'
  conversationId: string
  messageId: string
  totalTokens?: number
}

export interface ErrorMessage {
  type: 'error'
  conversationId: string
  code: string
  message: string
}

export interface ConnectedMessage {
  type: 'connected'
  version: string
  capabilities: string[]
}

export type ServerMessage =
  | TextDeltaMessage
  | ToolStartMessage
  | ToolResultMessage
  | CompleteMessage
  | ErrorMessage
  | ConnectedMessage

// Zod Schemas - STUBS

export const ChatMessageSchema: z.ZodType<ChatMessage> = z.any() as z.ZodType<ChatMessage>
export const CancelMessageSchema: z.ZodType<CancelMessage> = z.any() as z.ZodType<CancelMessage>
export const NewConversationMessageSchema: z.ZodType<NewConversationMessage> = z.any() as z.ZodType<NewConversationMessage>
export const ClientMessageSchema: z.ZodType<ClientMessage> = z.any() as z.ZodType<ClientMessage>
export const TextDeltaMessageSchema: z.ZodType<TextDeltaMessage> = z.any() as z.ZodType<TextDeltaMessage>
export const ToolStartMessageSchema: z.ZodType<ToolStartMessage> = z.any() as z.ZodType<ToolStartMessage>
export const ToolResultMessageSchema: z.ZodType<ToolResultMessage> = z.any() as z.ZodType<ToolResultMessage>
export const CompleteMessageSchema: z.ZodType<CompleteMessage> = z.any() as z.ZodType<CompleteMessage>
export const ErrorMessageSchema: z.ZodType<ErrorMessage> = z.any() as z.ZodType<ErrorMessage>
export const ConnectedMessageSchema: z.ZodType<ConnectedMessage> = z.any() as z.ZodType<ConnectedMessage>
export const ServerMessageSchema: z.ZodType<ServerMessage> = z.any() as z.ZodType<ServerMessage>

// Utility Functions - STUBS

export function parseClientMessage(_data: string): ClientMessage {
  throw new Error('Not implemented')
}

export function parseServerMessage(_data: string): ServerMessage {
  throw new Error('Not implemented')
}

export function serializeClientMessage(_message: ClientMessage): string {
  throw new Error('Not implemented')
}

export function serializeServerMessage(_message: ServerMessage): string {
  throw new Error('Not implemented')
}

export function generateConversationId(): string {
  throw new Error('Not implemented')
}

export function validateConversationId(_id: string): void {
  throw new Error('Not implemented')
}

export function isValidConversationId(_id: string): boolean {
  throw new Error('Not implemented')
}
