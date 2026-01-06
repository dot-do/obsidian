/**
 * TDD RED Tests for MCP Stdio-WebSocket Adapter
 *
 * This adapter bridges:
 * - Input: stdio (stdin/stdout) - what Claude Agent SDK expects for MCP
 * - Output: WebSocket - what our Bridge plugin provides on port 22360
 *
 * The adapter is spawned as a subprocess by the Agent SDK. It receives MCP
 * JSON-RPC messages on stdin and forwards them to the Bridge WebSocket,
 * then sends responses back on stdout.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { EventEmitter } from 'events'
import type { Readable, Writable } from 'stream'

// Mock WebSocket before importing the adapter
vi.mock('ws', () => {
  return {
    default: vi.fn(),
    WebSocket: vi.fn()
  }
})

// Import after mocking
import {
  McpWsAdapter,
  createMcpWsAdapter,
  type McpWsAdapterOptions
} from '../../src/agent/mcp-ws-adapter.js'

/**
 * Mock WebSocket implementation for testing
 */
class MockWebSocket extends EventEmitter {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  url: string
  sentMessages: string[] = []

  constructor(url: string) {
    super()
    this.url = url
  }

  send(data: string) {
    this.sentMessages.push(data)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    this.emit('close')
  }

  terminate() {
    this.readyState = MockWebSocket.CLOSED
    this.emit('close')
  }

  // Helper to simulate connection open
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN
    this.emit('open')
  }

  // Helper to simulate message received
  simulateMessage(data: string | object) {
    const message = typeof data === 'object' ? JSON.stringify(data) : data
    this.emit('message', Buffer.from(message))
  }

  // Helper to simulate error
  simulateError(error: Error) {
    this.emit('error', error)
  }

  // Helper to simulate close
  simulateClose(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED
    this.emit('close', code, reason)
  }
}

/**
 * Mock stdin stream for testing
 */
class MockStdin extends EventEmitter implements Partial<Readable> {
  readable = true
  destroyed = false

  // Helper to simulate data
  write(data: string) {
    this.emit('data', Buffer.from(data))
  }

  // Helper to simulate end
  end() {
    this.emit('end')
  }

  // Helper to simulate close
  close() {
    this.destroyed = true
    this.emit('close')
  }

  destroy() {
    this.destroyed = true
    this.emit('close')
  }
}

/**
 * Mock stdout stream for testing
 */
class MockStdout extends EventEmitter implements Partial<Writable> {
  writable = true
  writtenData: string[] = []

  write(chunk: string | Buffer): boolean {
    const data = typeof chunk === 'string' ? chunk : chunk.toString()
    this.writtenData.push(data)
    return true
  }

  end() {
    this.writable = false
    this.emit('finish')
  }
}

describe('McpWsAdapter', () => {
  let mockWs: MockWebSocket
  let mockStdin: MockStdin
  let mockStdout: MockStdout
  let adapter: McpWsAdapter
  let WebSocketMock: Mock

  beforeEach(async () => {
    // Reset mocks
    mockStdin = new MockStdin()
    mockStdout = new MockStdout()

    // Setup WebSocket mock
    const ws = await import('ws')
    WebSocketMock = ws.default as unknown as Mock
    WebSocketMock.mockImplementation((url: string) => {
      mockWs = new MockWebSocket(url)
      return mockWs
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    if (adapter) {
      adapter.stop()
    }
  })

  // ==========================================================================
  // CONNECTION TESTS
  // ==========================================================================

  describe('Connection', () => {
    it('should connect to WebSocket on specified port', async () => {
      const options: McpWsAdapterOptions = {
        port: 22360,
        stdin: mockStdin as unknown as Readable,
        stdout: mockStdout as unknown as Writable
      }

      adapter = createMcpWsAdapter(options)
      const connectPromise = adapter.start()

      // Simulate successful connection
      mockWs.simulateOpen()

      await connectPromise

      expect(WebSocketMock).toHaveBeenCalledWith('ws://localhost:22360')
      expect(adapter.isConnected()).toBe(true)
    })

    it('should connect to WebSocket on custom port', async () => {
      const options: McpWsAdapterOptions = {
        port: 12345,
        stdin: mockStdin as unknown as Readable,
        stdout: mockStdout as unknown as Writable
      }

      adapter = createMcpWsAdapter(options)
      const connectPromise = adapter.start()

      mockWs.simulateOpen()

      await connectPromise

      expect(WebSocketMock).toHaveBeenCalledWith('ws://localhost:12345')
    })

    it('should connect to WebSocket on custom host', async () => {
      const options: McpWsAdapterOptions = {
        port: 22360,
        host: '192.168.1.100',
        stdin: mockStdin as unknown as Readable,
        stdout: mockStdout as unknown as Writable
      }

      adapter = createMcpWsAdapter(options)
      const connectPromise = adapter.start()

      mockWs.simulateOpen()

      await connectPromise

      expect(WebSocketMock).toHaveBeenCalledWith('ws://192.168.1.100:22360')
    })

    it('should handle connection failure gracefully', async () => {
      const options: McpWsAdapterOptions = {
        port: 22360,
        stdin: mockStdin as unknown as Readable,
        stdout: mockStdout as unknown as Writable
      }

      adapter = createMcpWsAdapter(options)
      const connectPromise = adapter.start()

      // Simulate connection error
      mockWs.simulateError(new Error('Connection refused'))

      await expect(connectPromise).rejects.toThrow('Connection refused')
      expect(adapter.isConnected()).toBe(false)
    })

    it('should handle connection timeout', async () => {
      const options: McpWsAdapterOptions = {
        port: 22360,
        connectionTimeout: 100,
        stdin: mockStdin as unknown as Readable,
        stdout: mockStdout as unknown as Writable
      }

      adapter = createMcpWsAdapter(options)

      // Don't simulate open - let it timeout
      await expect(adapter.start()).rejects.toThrow('Connection timeout')
    })

    it('should reconnect on connection drop', async () => {
      const options: McpWsAdapterOptions = {
        port: 22360,
        reconnect: true,
        reconnectDelay: 50,
        maxReconnectAttempts: 3,
        stdin: mockStdin as unknown as Readable,
        stdout: mockStdout as unknown as Writable
      }

      adapter = createMcpWsAdapter(options)
      const connectPromise = adapter.start()
      mockWs.simulateOpen()
      await connectPromise

      // Simulate connection drop
      const reconnectPromise = new Promise<void>((resolve) => {
        adapter.on('reconnected', () => resolve())
      })

      mockWs.simulateClose(1006, 'Connection lost')

      // Wait for reconnect
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Simulate successful reconnection
      mockWs.simulateOpen()

      await reconnectPromise

      expect(adapter.isConnected()).toBe(true)
    })

    it('should emit error after max reconnect attempts', async () => {
      const options: McpWsAdapterOptions = {
        port: 22360,
        reconnect: true,
        reconnectDelay: 10,
        maxReconnectAttempts: 2,
        stdin: mockStdin as unknown as Readable,
        stdout: mockStdout as unknown as Writable
      }

      adapter = createMcpWsAdapter(options)
      const connectPromise = adapter.start()
      mockWs.simulateOpen()
      await connectPromise

      const errorPromise = new Promise<Error>((resolve) => {
        adapter.on('error', (err) => resolve(err))
      })

      // Simulate repeated connection drops
      mockWs.simulateClose(1006, 'Connection lost')
      await new Promise((resolve) => setTimeout(resolve, 20))
      mockWs.simulateError(new Error('Connection refused'))
      await new Promise((resolve) => setTimeout(resolve, 20))
      mockWs.simulateError(new Error('Connection refused'))

      const error = await errorPromise
      expect(error.message).toContain('Max reconnect attempts')
    })

    it('should not reconnect when reconnect is disabled', async () => {
      const options: McpWsAdapterOptions = {
        port: 22360,
        reconnect: false,
        stdin: mockStdin as unknown as Readable,
        stdout: mockStdout as unknown as Writable
      }

      adapter = createMcpWsAdapter(options)
      const connectPromise = adapter.start()
      mockWs.simulateOpen()
      await connectPromise

      const closePromise = new Promise<void>((resolve) => {
        adapter.on('close', () => resolve())
      })

      mockWs.simulateClose(1006, 'Connection lost')

      await closePromise

      expect(adapter.isConnected()).toBe(false)
      // Should not attempt reconnect - WebSocket constructor should only be called once
      expect(WebSocketMock).toHaveBeenCalledTimes(1)
    })
  })

  // ==========================================================================
  // MESSAGE FORWARDING TESTS
  // ==========================================================================

  describe('Message Forwarding', () => {
    beforeEach(async () => {
      const options: McpWsAdapterOptions = {
        port: 22360,
        stdin: mockStdin as unknown as Readable,
        stdout: mockStdout as unknown as Writable
      }

      adapter = createMcpWsAdapter(options)
      const connectPromise = adapter.start()
      mockWs.simulateOpen()
      await connectPromise
    })

    it('should forward stdin JSON-RPC messages to WebSocket', async () => {
      const message = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          clientInfo: { name: 'test', version: '1.0' },
          capabilities: {}
        }
      }

      mockStdin.write(JSON.stringify(message) + '\n')

      // Wait for message processing
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockWs.sentMessages).toHaveLength(1)
      expect(JSON.parse(mockWs.sentMessages[0])).toEqual(message)
    })

    it('should forward WebSocket responses to stdout', async () => {
      const response = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          serverInfo: { name: 'obsidian.do', version: '0.1.0' },
          protocolVersion: '2024-11-05',
          capabilities: { tools: { listChanged: true } }
        }
      }

      mockWs.simulateMessage(response)

      // Wait for message processing
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockStdout.writtenData).toHaveLength(1)
      const written = JSON.parse(mockStdout.writtenData[0].trim())
      expect(written).toEqual(response)
    })

    it('should preserve message order', async () => {
      const messages = [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
        { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
        { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'vault_list' } }
      ]

      for (const msg of messages) {
        mockStdin.write(JSON.stringify(msg) + '\n')
      }

      // Wait for message processing
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(mockWs.sentMessages).toHaveLength(3)

      // Verify order is preserved
      for (let i = 0; i < messages.length; i++) {
        expect(JSON.parse(mockWs.sentMessages[i])).toEqual(messages[i])
      }
    })

    it('should handle malformed JSON gracefully', async () => {
      const errorPromise = new Promise<Error>((resolve) => {
        adapter.on('parseError', (err) => resolve(err))
      })

      // Send invalid JSON
      mockStdin.write('{ invalid json }\n')

      const error = await errorPromise

      expect(error).toBeInstanceOf(SyntaxError)
      // Should not crash - adapter should still be running
      expect(adapter.isConnected()).toBe(true)
    })

    it('should handle empty lines gracefully', async () => {
      mockStdin.write('\n')
      mockStdin.write('   \n')
      mockStdin.write('\t\n')

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Should not send any messages
      expect(mockWs.sentMessages).toHaveLength(0)
      expect(adapter.isConnected()).toBe(true)
    })

    it('should handle multiple JSON objects in single data chunk', async () => {
      const msg1 = { jsonrpc: '2.0', id: 1, method: 'ping' }
      const msg2 = { jsonrpc: '2.0', id: 2, method: 'ping' }

      // Send both messages in one chunk
      mockStdin.write(JSON.stringify(msg1) + '\n' + JSON.stringify(msg2) + '\n')

      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockWs.sentMessages).toHaveLength(2)
      expect(JSON.parse(mockWs.sentMessages[0])).toEqual(msg1)
      expect(JSON.parse(mockWs.sentMessages[1])).toEqual(msg2)
    })

    it('should handle split JSON messages across data chunks', async () => {
      const message = { jsonrpc: '2.0', id: 1, method: 'test', params: { data: 'value' } }
      const json = JSON.stringify(message)

      // Split the JSON across multiple chunks
      const mid = Math.floor(json.length / 2)
      mockStdin.write(json.substring(0, mid))
      await new Promise((resolve) => setTimeout(resolve, 5))
      mockStdin.write(json.substring(mid) + '\n')

      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockWs.sentMessages).toHaveLength(1)
      expect(JSON.parse(mockWs.sentMessages[0])).toEqual(message)
    })

    it('should write responses with newline delimiter', async () => {
      const response = { jsonrpc: '2.0', id: 1, result: {} }

      mockWs.simulateMessage(response)

      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockStdout.writtenData[0]).toEndWith('\n')
    })
  })

  // ==========================================================================
  // PROTOCOL COMPLIANCE TESTS
  // ==========================================================================

  describe('Protocol Compliance', () => {
    beforeEach(async () => {
      const options: McpWsAdapterOptions = {
        port: 22360,
        stdin: mockStdin as unknown as Readable,
        stdout: mockStdout as unknown as Writable
      }

      adapter = createMcpWsAdapter(options)
      const connectPromise = adapter.start()
      mockWs.simulateOpen()
      await connectPromise
    })

    it('should pass through MCP initialize handshake', async () => {
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          clientInfo: { name: 'claude-agent', version: '1.0.0' },
          capabilities: { tools: { listChanged: true } }
        }
      }

      mockStdin.write(JSON.stringify(initRequest) + '\n')

      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockWs.sentMessages).toHaveLength(1)
      const sent = JSON.parse(mockWs.sentMessages[0])
      expect(sent.method).toBe('initialize')
      expect(sent.params.protocolVersion).toBe('2024-11-05')
      expect(sent.params.clientInfo).toBeDefined()
    })

    it('should pass through tools/list requests', async () => {
      const toolsListRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      }

      mockStdin.write(JSON.stringify(toolsListRequest) + '\n')

      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockWs.sentMessages).toHaveLength(1)
      const sent = JSON.parse(mockWs.sentMessages[0])
      expect(sent.method).toBe('tools/list')
      expect(sent.id).toBe(2)
    })

    it('should pass through tools/call requests', async () => {
      const toolsCallRequest = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'vault_search',
          arguments: { query: 'test', limit: 10 }
        }
      }

      mockStdin.write(JSON.stringify(toolsCallRequest) + '\n')

      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockWs.sentMessages).toHaveLength(1)
      const sent = JSON.parse(mockWs.sentMessages[0])
      expect(sent.method).toBe('tools/call')
      expect(sent.params.name).toBe('vault_search')
      expect(sent.params.arguments).toEqual({ query: 'test', limit: 10 })
    })

    it('should pass through notifications', async () => {
      const notification = {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {}
      }

      mockStdin.write(JSON.stringify(notification) + '\n')

      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockWs.sentMessages).toHaveLength(1)
      const sent = JSON.parse(mockWs.sentMessages[0])
      expect(sent.method).toBe('notifications/initialized')
      expect(sent.id).toBeUndefined() // Notifications don't have id
    })

    it('should pass through ping requests', async () => {
      const pingRequest = {
        jsonrpc: '2.0',
        id: 10,
        method: 'ping',
        params: {}
      }

      mockStdin.write(JSON.stringify(pingRequest) + '\n')

      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockWs.sentMessages).toHaveLength(1)
      const sent = JSON.parse(mockWs.sentMessages[0])
      expect(sent.method).toBe('ping')
    })

    it('should preserve JSON-RPC version in forwarded messages', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'test'
      }

      mockStdin.write(JSON.stringify(request) + '\n')

      await new Promise((resolve) => setTimeout(resolve, 10))

      const sent = JSON.parse(mockWs.sentMessages[0])
      expect(sent.jsonrpc).toBe('2.0')
    })

    it('should preserve request IDs in forwarded messages', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 'string-id-123',
        method: 'test'
      }

      mockStdin.write(JSON.stringify(request) + '\n')

      await new Promise((resolve) => setTimeout(resolve, 10))

      const sent = JSON.parse(mockWs.sentMessages[0])
      expect(sent.id).toBe('string-id-123')
    })

    it('should forward error responses from WebSocket to stdout', async () => {
      const errorResponse = {
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: -32601,
          message: 'Method not found'
        }
      }

      mockWs.simulateMessage(errorResponse)

      await new Promise((resolve) => setTimeout(resolve, 10))

      const written = JSON.parse(mockStdout.writtenData[0].trim())
      expect(written.error).toBeDefined()
      expect(written.error.code).toBe(-32601)
      expect(written.error.message).toBe('Method not found')
    })

    it('should forward complex tool results', async () => {
      const toolResult = {
        jsonrpc: '2.0',
        id: 5,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                results: [
                  { path: 'notes/test.md', score: 0.95, excerpt: 'Test content' }
                ]
              })
            }
          ],
          isError: false
        }
      }

      mockWs.simulateMessage(toolResult)

      await new Promise((resolve) => setTimeout(resolve, 10))

      const written = JSON.parse(mockStdout.writtenData[0].trim())
      expect(written.result.content).toBeDefined()
      expect(written.result.content[0].type).toBe('text')
    })
  })

  // ==========================================================================
  // LIFECYCLE TESTS
  // ==========================================================================

  describe('Lifecycle', () => {
    it('should exit when stdin closes', async () => {
      const options: McpWsAdapterOptions = {
        port: 22360,
        stdin: mockStdin as unknown as Readable,
        stdout: mockStdout as unknown as Writable
      }

      adapter = createMcpWsAdapter(options)
      const connectPromise = adapter.start()
      mockWs.simulateOpen()
      await connectPromise

      const exitPromise = new Promise<number>((resolve) => {
        adapter.on('exit', (code) => resolve(code))
      })

      // Close stdin
      mockStdin.end()

      const exitCode = await exitPromise

      expect(exitCode).toBe(0)
      expect(adapter.isConnected()).toBe(false)
    })

    it('should exit when WebSocket closes', async () => {
      const options: McpWsAdapterOptions = {
        port: 22360,
        reconnect: false,
        stdin: mockStdin as unknown as Readable,
        stdout: mockStdout as unknown as Writable
      }

      adapter = createMcpWsAdapter(options)
      const connectPromise = adapter.start()
      mockWs.simulateOpen()
      await connectPromise

      const exitPromise = new Promise<number>((resolve) => {
        adapter.on('exit', (code) => resolve(code))
      })

      // Close WebSocket
      mockWs.simulateClose(1000, 'Normal closure')

      const exitCode = await exitPromise

      expect(exitCode).toBe(0)
    })

    it('should exit with error code when WebSocket closes unexpectedly', async () => {
      const options: McpWsAdapterOptions = {
        port: 22360,
        reconnect: false,
        stdin: mockStdin as unknown as Readable,
        stdout: mockStdout as unknown as Writable
      }

      adapter = createMcpWsAdapter(options)
      const connectPromise = adapter.start()
      mockWs.simulateOpen()
      await connectPromise

      const exitPromise = new Promise<number>((resolve) => {
        adapter.on('exit', (code) => resolve(code))
      })

      // Close WebSocket with error code
      mockWs.simulateClose(1006, 'Abnormal closure')

      const exitCode = await exitPromise

      expect(exitCode).toBe(1)
    })

    it('should handle SIGTERM gracefully', async () => {
      const options: McpWsAdapterOptions = {
        port: 22360,
        stdin: mockStdin as unknown as Readable,
        stdout: mockStdout as unknown as Writable
      }

      adapter = createMcpWsAdapter(options)
      const connectPromise = adapter.start()
      mockWs.simulateOpen()
      await connectPromise

      const exitPromise = new Promise<number>((resolve) => {
        adapter.on('exit', (code) => resolve(code))
      })

      // Simulate SIGTERM
      adapter.handleSignal('SIGTERM')

      const exitCode = await exitPromise

      expect(exitCode).toBe(0)
      expect(adapter.isConnected()).toBe(false)
    })

    it('should handle SIGINT gracefully', async () => {
      const options: McpWsAdapterOptions = {
        port: 22360,
        stdin: mockStdin as unknown as Readable,
        stdout: mockStdout as unknown as Writable
      }

      adapter = createMcpWsAdapter(options)
      const connectPromise = adapter.start()
      mockWs.simulateOpen()
      await connectPromise

      const exitPromise = new Promise<number>((resolve) => {
        adapter.on('exit', (code) => resolve(code))
      })

      // Simulate SIGINT
      adapter.handleSignal('SIGINT')

      const exitCode = await exitPromise

      expect(exitCode).toBe(0)
    })

    it('should close WebSocket connection when stopping', async () => {
      const options: McpWsAdapterOptions = {
        port: 22360,
        stdin: mockStdin as unknown as Readable,
        stdout: mockStdout as unknown as Writable
      }

      adapter = createMcpWsAdapter(options)
      const connectPromise = adapter.start()
      mockWs.simulateOpen()
      await connectPromise

      expect(adapter.isConnected()).toBe(true)

      adapter.stop()

      expect(mockWs.readyState).toBe(MockWebSocket.CLOSED)
    })

    it('should clean up pending requests on exit', async () => {
      const options: McpWsAdapterOptions = {
        port: 22360,
        stdin: mockStdin as unknown as Readable,
        stdout: mockStdout as unknown as Writable
      }

      adapter = createMcpWsAdapter(options)
      const connectPromise = adapter.start()
      mockWs.simulateOpen()
      await connectPromise

      // Send a request
      const request = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
      mockStdin.write(JSON.stringify(request) + '\n')

      await new Promise((resolve) => setTimeout(resolve, 10))

      // Stop adapter before response arrives
      adapter.stop()

      // Should not throw or hang
      expect(adapter.isConnected()).toBe(false)
    })

    it('should emit close event with proper cleanup', async () => {
      const options: McpWsAdapterOptions = {
        port: 22360,
        stdin: mockStdin as unknown as Readable,
        stdout: mockStdout as unknown as Writable
      }

      adapter = createMcpWsAdapter(options)
      const connectPromise = adapter.start()
      mockWs.simulateOpen()
      await connectPromise

      const closePromise = new Promise<void>((resolve) => {
        adapter.on('close', () => resolve())
      })

      adapter.stop()

      await closePromise

      expect(adapter.isConnected()).toBe(false)
    })
  })

  // ==========================================================================
  // EDGE CASES AND ERROR HANDLING
  // ==========================================================================

  describe('Edge Cases and Error Handling', () => {
    beforeEach(async () => {
      const options: McpWsAdapterOptions = {
        port: 22360,
        stdin: mockStdin as unknown as Readable,
        stdout: mockStdout as unknown as Writable
      }

      adapter = createMcpWsAdapter(options)
      const connectPromise = adapter.start()
      mockWs.simulateOpen()
      await connectPromise
    })

    it('should handle binary WebSocket messages', async () => {
      // Bridge should send text, but handle binary gracefully
      const response = { jsonrpc: '2.0', id: 1, result: {} }
      mockWs.emit('message', Buffer.from(JSON.stringify(response)))

      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockStdout.writtenData).toHaveLength(1)
      const written = JSON.parse(mockStdout.writtenData[0].trim())
      expect(written).toEqual(response)
    })

    it('should handle large messages', async () => {
      const largeContent = 'x'.repeat(100000)
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'note_create',
          arguments: { path: 'test.md', content: largeContent }
        }
      }

      mockStdin.write(JSON.stringify(request) + '\n')

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(mockWs.sentMessages).toHaveLength(1)
      const sent = JSON.parse(mockWs.sentMessages[0])
      expect(sent.params.arguments.content).toBe(largeContent)
    })

    it('should handle rapid message bursts', async () => {
      const count = 100
      const messages = Array.from({ length: count }, (_, i) => ({
        jsonrpc: '2.0',
        id: i + 1,
        method: 'ping'
      }))

      for (const msg of messages) {
        mockStdin.write(JSON.stringify(msg) + '\n')
      }

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockWs.sentMessages).toHaveLength(count)
    })

    it('should handle Unicode in messages', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'vault_search',
          arguments: { query: 'emoji test' }
        }
      }

      mockStdin.write(JSON.stringify(request) + '\n')

      await new Promise((resolve) => setTimeout(resolve, 10))

      const sent = JSON.parse(mockWs.sentMessages[0])
      expect(sent.params.arguments.query).toBe('emoji test')
    })

    it('should handle special characters in JSON', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
        params: {
          data: 'Line1\nLine2\tTabbed\r\nWindows'
        }
      }

      mockStdin.write(JSON.stringify(request) + '\n')

      await new Promise((resolve) => setTimeout(resolve, 10))

      const sent = JSON.parse(mockWs.sentMessages[0])
      expect(sent.params.data).toBe('Line1\nLine2\tTabbed\r\nWindows')
    })

    it('should not forward messages when WebSocket is not connected', async () => {
      // Disconnect WebSocket
      mockWs.readyState = MockWebSocket.CLOSED

      const request = { jsonrpc: '2.0', id: 1, method: 'test' }
      mockStdin.write(JSON.stringify(request) + '\n')

      await new Promise((resolve) => setTimeout(resolve, 10))

      // Message should be queued or dropped, not sent
      expect(mockWs.sentMessages).toHaveLength(0)
    })

    it('should buffer messages during reconnect', async () => {
      const options: McpWsAdapterOptions = {
        port: 22360,
        reconnect: true,
        reconnectDelay: 50,
        stdin: mockStdin as unknown as Readable,
        stdout: mockStdout as unknown as Writable
      }

      // Create a new adapter with reconnect enabled
      adapter.stop()
      adapter = createMcpWsAdapter(options)
      const connectPromise = adapter.start()
      mockWs.simulateOpen()
      await connectPromise

      // Clear sent messages
      mockWs.sentMessages = []

      // Simulate disconnect
      mockWs.readyState = MockWebSocket.CLOSED
      mockWs.simulateClose(1006, 'Connection lost')

      // Send message while disconnected
      const request = { jsonrpc: '2.0', id: 1, method: 'test' }
      mockStdin.write(JSON.stringify(request) + '\n')

      // Wait for reconnect attempt
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Simulate successful reconnection
      mockWs.simulateOpen()

      await new Promise((resolve) => setTimeout(resolve, 50))

      // Message should be sent after reconnect
      expect(mockWs.sentMessages.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ==========================================================================
  // FACTORY FUNCTION TESTS
  // ==========================================================================

  describe('createMcpWsAdapter', () => {
    it('should create adapter with default options', () => {
      const options: McpWsAdapterOptions = {
        stdin: mockStdin as unknown as Readable,
        stdout: mockStdout as unknown as Writable
      }

      adapter = createMcpWsAdapter(options)

      expect(adapter).toBeInstanceOf(McpWsAdapter)
    })

    it('should create adapter with custom port', () => {
      const options: McpWsAdapterOptions = {
        port: 9999,
        stdin: mockStdin as unknown as Readable,
        stdout: mockStdout as unknown as Writable
      }

      adapter = createMcpWsAdapter(options)

      expect(adapter).toBeInstanceOf(McpWsAdapter)
    })

    it('should create adapter with all options', () => {
      const options: McpWsAdapterOptions = {
        port: 22360,
        host: 'example.com',
        connectionTimeout: 5000,
        reconnect: true,
        reconnectDelay: 1000,
        maxReconnectAttempts: 5,
        stdin: mockStdin as unknown as Readable,
        stdout: mockStdout as unknown as Writable
      }

      adapter = createMcpWsAdapter(options)

      expect(adapter).toBeInstanceOf(McpWsAdapter)
    })
  })
})

// ==========================================================================
// INTEGRATION-STYLE TESTS (with mocked components)
// ==========================================================================

describe('McpWsAdapter Integration', () => {
  let mockWs: MockWebSocket
  let mockStdin: MockStdin
  let mockStdout: MockStdout
  let adapter: McpWsAdapter
  let WebSocketMock: Mock

  beforeEach(async () => {
    mockStdin = new MockStdin()
    mockStdout = new MockStdout()

    const ws = await import('ws')
    WebSocketMock = ws.default as unknown as Mock
    WebSocketMock.mockImplementation((url: string) => {
      mockWs = new MockWebSocket(url)
      return mockWs
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    if (adapter) {
      adapter.stop()
    }
  })

  it('should complete full MCP handshake flow', async () => {
    const options: McpWsAdapterOptions = {
      port: 22360,
      stdin: mockStdin as unknown as Readable,
      stdout: mockStdout as unknown as Writable
    }

    adapter = createMcpWsAdapter(options)
    const connectPromise = adapter.start()
    mockWs.simulateOpen()
    await connectPromise

    // Step 1: Initialize request
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        clientInfo: { name: 'test', version: '1.0' },
        capabilities: {}
      }
    }
    mockStdin.write(JSON.stringify(initRequest) + '\n')

    await new Promise((resolve) => setTimeout(resolve, 10))

    // Step 2: Simulate initialize response from Bridge
    const initResponse = {
      jsonrpc: '2.0',
      id: 1,
      result: {
        serverInfo: { name: 'obsidian.do', version: '0.1.0' },
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: true } }
      }
    }
    mockWs.simulateMessage(initResponse)

    await new Promise((resolve) => setTimeout(resolve, 10))

    // Verify response was forwarded to stdout
    expect(mockStdout.writtenData).toHaveLength(1)
    const written1 = JSON.parse(mockStdout.writtenData[0].trim())
    expect(written1.result.serverInfo.name).toBe('obsidian.do')

    // Step 3: Send initialized notification
    const initNotification = {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {}
    }
    mockStdin.write(JSON.stringify(initNotification) + '\n')

    await new Promise((resolve) => setTimeout(resolve, 10))

    // Step 4: Tools/list request
    const toolsListRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    }
    mockStdin.write(JSON.stringify(toolsListRequest) + '\n')

    await new Promise((resolve) => setTimeout(resolve, 10))

    // Verify request was forwarded
    const sentToolsList = mockWs.sentMessages.find(
      (m) => JSON.parse(m).method === 'tools/list'
    )
    expect(sentToolsList).toBeDefined()
  })

  it('should handle tool call flow', async () => {
    const options: McpWsAdapterOptions = {
      port: 22360,
      stdin: mockStdin as unknown as Readable,
      stdout: mockStdout as unknown as Writable
    }

    adapter = createMcpWsAdapter(options)
    const connectPromise = adapter.start()
    mockWs.simulateOpen()
    await connectPromise

    // Send tools/call request
    const toolCallRequest = {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'vault_search',
        arguments: { query: 'test query', limit: 5 }
      }
    }
    mockStdin.write(JSON.stringify(toolCallRequest) + '\n')

    await new Promise((resolve) => setTimeout(resolve, 10))

    // Verify request forwarded
    expect(mockWs.sentMessages).toHaveLength(1)

    // Simulate response
    const toolResponse = {
      jsonrpc: '2.0',
      id: 5,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              results: [
                { path: 'notes/test.md', score: 0.95, excerpt: 'Test content' }
              ]
            })
          }
        ]
      }
    }
    mockWs.simulateMessage(toolResponse)

    await new Promise((resolve) => setTimeout(resolve, 10))

    // Verify response forwarded to stdout
    expect(mockStdout.writtenData).toHaveLength(1)
    const written = JSON.parse(mockStdout.writtenData[0].trim())
    expect(written.id).toBe(5)
    expect(written.result.content).toBeDefined()
  })
})
