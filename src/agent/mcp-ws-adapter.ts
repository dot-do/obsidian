/**
 * MCP Stdio-WebSocket Adapter
 *
 * Bridges Claude Agent SDK's stdio-based MCP protocol with our
 * Bridge plugin's WebSocket server.
 *
 * STUB: All exports throw "Not implemented" for TDD RED phase.
 */

import type { Readable, Writable } from 'stream'

export interface McpWsAdapterOptions {
  bridgeUrl?: string
  stdin?: Readable
  stdout?: Writable
  reconnect?: boolean
  reconnectDelay?: number
  maxReconnectAttempts?: number
}

export class McpWsAdapter {
  constructor(_options?: McpWsAdapterOptions) {
    throw new Error('Not implemented')
  }

  async start(): Promise<void> {
    throw new Error('Not implemented')
  }

  async stop(): Promise<void> {
    throw new Error('Not implemented')
  }

  isConnected(): boolean {
    throw new Error('Not implemented')
  }
}

export function createMcpWsAdapter(_options?: McpWsAdapterOptions): McpWsAdapter {
  throw new Error('Not implemented')
}
