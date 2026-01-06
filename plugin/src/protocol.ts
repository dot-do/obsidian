/**
 * MCP Protocol Types (JSON-RPC 2.0)
 */

export interface McpRequest {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params?: unknown
}

export interface McpResponse {
  jsonrpc: '2.0'
  id: number | string | null
  result?: unknown
  error?: McpError
}

export interface McpError {
  code: number
  message: string
  data?: unknown
}

export interface McpNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

// Standard JSON-RPC error codes
export const ErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const

// MCP Tool Definition
export interface McpToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, McpSchemaProperty>
    required?: string[]
  }
}

export interface McpSchemaProperty {
  type: string
  description?: string
  enum?: string[]
  default?: unknown
}

// MCP Server Info
export interface McpServerInfo {
  name: string
  version: string
  protocolVersion: string
}

// Tool call params
export interface ToolCallParams {
  name: string
  arguments: Record<string, unknown>
}

// Vault event types
export interface VaultEvent {
  type: 'create' | 'modify' | 'delete' | 'rename' | 'metadata-changed'
  timestamp: number
  file: {
    path: string
    name: string
    extension: string
  }
  oldPath?: string
}

// Helper to create success response
export function successResponse(id: number | string | null, result: unknown): McpResponse {
  return { jsonrpc: '2.0', id, result }
}

// Helper to create error response
export function errorResponse(id: number | string | null, code: number, message: string): McpResponse {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

// Helper to create notification
export function notification(method: string, params?: unknown): McpNotification {
  return { jsonrpc: '2.0', method, params }
}
