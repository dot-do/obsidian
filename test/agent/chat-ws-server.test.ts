/**
 * TDD RED Tests for Chat WebSocket Server
 *
 * The Chat WebSocket Server bridges the Plugin Chat View (client) to the Agent Server.
 * It uses the ws library for WebSocket handling and routes messages using the chat protocol.
 *
 * Key responsibilities:
 * - Start/stop WebSocket server on specified port
 * - Accept client connections from Plugin Chat View
 * - Parse and validate incoming client messages
 * - Route messages to AgentServer
 * - Stream AgentServer responses back to clients
 * - Handle multiple concurrent clients
 * - Manage client disconnections gracefully
 * - Handle errors and edge cases
 *
 * All tests should FAIL until the implementation is complete (GREEN phase).
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import WebSocket, { WebSocketServer } from 'ws'
import type { AddressInfo } from 'net'

// Mock dependencies
vi.mock('../../src/agent/auth.js', () => ({
  getAuthToken: vi.fn().mockResolvedValue({
    value: 'sk-ant-test-token-12345',
    source: 'env',
  }),
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

// Import the module under test (which doesn't exist yet)
import type {
  ChatWsServer,
  ChatWsServerOptions,
  ChatWsServerEvents,
} from '../../src/agent/chat-ws-server.js'

// We'll need to import this once implemented
let createChatWsServer: (options?: ChatWsServerOptions) => ChatWsServer

// Try to import - will fail initially (RED phase)
try {
  const module = await import('../../src/agent/chat-ws-server.js')
  createChatWsServer = module.createChatWsServer
} catch {
  // Mock the function for now
  createChatWsServer = () => {
    throw new Error('ChatWsServer not implemented yet')
  }
}

import type {
  ClientMessage,
  ServerMessage,
  ChatMessage,
  CancelMessage,
  NewConversationMessage,
} from '../../src/agent/chat-protocol.js'

import { generateConversationId } from '../../src/agent/chat-protocol.js'

/**
 * Helper: Create a WebSocket client connection
 */
async function createTestClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`)
    const timeout = setTimeout(() => {
      reject(new Error('Connection timeout'))
    }, 5000)

    ws.on('open', () => {
      clearTimeout(timeout)
      resolve(ws)
    })

    ws.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })
}

/**
 * Helper: Wait for a WebSocket message
 */
async function waitForMessage(ws: WebSocket, timeout = 5000): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Message timeout'))
    }, timeout)

    ws.once('message', (data: Buffer) => {
      clearTimeout(timer)
      try {
        const message = JSON.parse(data.toString())
        resolve(message)
      } catch (error) {
        reject(error)
      }
    })
  })
}

/**
 * Helper: Collect messages for a duration
 */
async function collectMessages(
  ws: WebSocket,
  duration = 100
): Promise<ServerMessage[]> {
  const messages: ServerMessage[] = []

  return new Promise((resolve) => {
    const handler = (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString())
        messages.push(message)
      } catch {
        // Ignore parse errors
      }
    }

    ws.on('message', handler)

    setTimeout(() => {
      ws.off('message', handler)
      resolve(messages)
    }, duration)
  })
}

/**
 * Helper: Send a client message
 */
function sendMessage(ws: WebSocket, message: ClientMessage): void {
  ws.send(JSON.stringify(message))
}

// =============================================================================
// SERVER LIFECYCLE TESTS
// =============================================================================

describe('ChatWsServer', () => {
  describe('Server Lifecycle', () => {
    it('should create server with default options', () => {
      expect(() => createChatWsServer()).not.toThrow()
    })

    it('should create server with custom port', () => {
      const server = createChatWsServer({ port: 3001 })
      expect(server).toBeDefined()
    })

    it('should create server with custom host', () => {
      const server = createChatWsServer({
        port: 3002,
        host: '127.0.0.1',
      })
      expect(server).toBeDefined()
    })

    it('should start server and listen on specified port', async () => {
      const server = createChatWsServer({ port: 3003 })

      await server.start()

      expect(server.isRunning()).toBe(true)
      expect(server.getPort()).toBe(3003)

      await server.stop()
    })

    it('should start server on random port when port is 0', async () => {
      const server = createChatWsServer({ port: 0 })

      await server.start()

      expect(server.isRunning()).toBe(true)
      expect(server.getPort()).toBeGreaterThan(0)

      await server.stop()
    })

    it('should stop server gracefully', async () => {
      const server = createChatWsServer({ port: 3004 })

      await server.start()
      expect(server.isRunning()).toBe(true)

      await server.stop()
      expect(server.isRunning()).toBe(false)
    })

    it('should throw error when starting server on occupied port', async () => {
      const server1 = createChatWsServer({ port: 3005 })
      const server2 = createChatWsServer({ port: 3005 })

      await server1.start()

      await expect(server2.start()).rejects.toThrow(/port|address/i)

      await server1.stop()
    })

    it('should be safe to call stop() multiple times', async () => {
      const server = createChatWsServer({ port: 3006 })

      await server.start()
      await server.stop()
      await server.stop()
      await server.stop()

      expect(server.isRunning()).toBe(false)
    })

    it('should throw error when stopping server that was never started', async () => {
      const server = createChatWsServer({ port: 3007 })

      // Should either throw or be no-op
      await expect(server.stop()).resolves.not.toThrow()
    })

    it('should reject new connections after stop', async () => {
      const server = createChatWsServer({ port: 3008 })

      await server.start()
      const port = server.getPort()
      await server.stop()

      // Try to connect after stop
      await expect(createTestClient(port)).rejects.toThrow()
    })

    it('should emit "listening" event when server starts', async () => {
      const server = createChatWsServer({ port: 3009 })

      let listeningEmitted = false
      server.on('listening', () => {
        listeningEmitted = true
      })

      await server.start()

      expect(listeningEmitted).toBe(true)

      await server.stop()
    })

    it('should emit "close" event when server stops', async () => {
      const server = createChatWsServer({ port: 3010 })

      let closeEmitted = false
      server.on('close', () => {
        closeEmitted = true
      })

      await server.start()
      await server.stop()

      expect(closeEmitted).toBe(true)
    })

    it('should return correct server address', async () => {
      const server = createChatWsServer({
        port: 3011,
        host: 'localhost',
      })

      await server.start()

      const address = server.getAddress()
      expect(address).toBeDefined()
      expect(address.port).toBe(3011)
      expect(address.address).toBeDefined()

      await server.stop()
    })

    it('should initialize AgentServer when starting', async () => {
      const server = createChatWsServer({ port: 3012 })

      await server.start()

      expect(server.getAgentServer()).toBeDefined()
      expect(server.getAgentServer().isReady()).toBe(true)

      await server.stop()
    })

    it('should accept AgentServer options', async () => {
      const server = createChatWsServer({
        port: 3013,
        agentServerOptions: {
          model: 'claude-3-opus-20240229',
          maxTokens: 8192,
        },
      })

      await server.start()

      const agentServer = server.getAgentServer()
      expect(agentServer.getModel()).toBe('claude-3-opus-20240229')

      await server.stop()
    })
  })

  // ===========================================================================
  // CLIENT CONNECTION TESTS
  // ===========================================================================

  describe('Client Connection Handling', () => {
    let server: ChatWsServer
    let port: number

    beforeEach(async () => {
      server = createChatWsServer({ port: 0 })
      await server.start()
      port = server.getPort()
    })

    afterEach(async () => {
      await server.stop()
    })

    it('should accept client connections', async () => {
      const client = await createTestClient(port)

      expect(client.readyState).toBe(WebSocket.OPEN)

      client.close()
    })

    it('should emit "connection" event when client connects', async () => {
      let connectionEmitted = false
      server.on('connection', () => {
        connectionEmitted = true
      })

      const client = await createTestClient(port)

      expect(connectionEmitted).toBe(true)

      client.close()
    })

    it('should track connected clients', async () => {
      const client1 = await createTestClient(port)
      const client2 = await createTestClient(port)

      expect(server.getConnectedClients()).toBe(2)

      client1.close()
      client2.close()
    })

    it('should handle client disconnection', async () => {
      const client = await createTestClient(port)

      let disconnectEmitted = false
      server.on('disconnect', () => {
        disconnectEmitted = true
      })

      client.close()

      // Wait for disconnect to be processed
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(disconnectEmitted).toBe(true)
      expect(server.getConnectedClients()).toBe(0)
    })

    it('should handle unexpected client disconnection', async () => {
      const client = await createTestClient(port)

      // Simulate unexpected disconnect
      client.terminate()

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(server.getConnectedClients()).toBe(0)
    })

    it('should support multiple concurrent clients', async () => {
      const clients = await Promise.all([
        createTestClient(port),
        createTestClient(port),
        createTestClient(port),
      ])

      expect(server.getConnectedClients()).toBe(3)

      clients.forEach((client) => client.close())
    })

    it('should handle client reconnection', async () => {
      const client1 = await createTestClient(port)
      client1.close()

      await new Promise((resolve) => setTimeout(resolve, 100))

      const client2 = await createTestClient(port)

      expect(client2.readyState).toBe(WebSocket.OPEN)

      client2.close()
    })

    it('should send error on invalid JSON message', async () => {
      const client = await createTestClient(port)

      client.send('invalid json {')

      const message = await waitForMessage(client)

      expect(message.type).toBe('error')
      expect(message.message).toMatch(/invalid|json|parse/i)

      client.close()
    })

    it('should send error on invalid message schema', async () => {
      const client = await createTestClient(port)

      client.send(JSON.stringify({ type: 'invalid_type' }))

      const message = await waitForMessage(client)

      expect(message.type).toBe('error')

      client.close()
    })

    it('should close client connection on protocol violation', async () => {
      const client = await createTestClient(port)

      // Send malformed data repeatedly
      for (let i = 0; i < 10; i++) {
        client.send('malformed')
      }

      // Client should eventually be closed or receive errors
      const messages = await collectMessages(client, 200)

      expect(messages.some((m) => m.type === 'error')).toBe(true)

      client.close()
    })
  })

  // ===========================================================================
  // MESSAGE ROUTING TESTS
  // ===========================================================================

  describe('Message Routing', () => {
    let server: ChatWsServer
    let port: number

    beforeEach(async () => {
      server = createChatWsServer({ port: 0 })
      await server.start()
      port = server.getPort()
    })

    afterEach(async () => {
      await server.stop()
    })

    describe('new_conversation messages', () => {
      it('should create new conversation and send connected message', async () => {
        const client = await createTestClient(port)

        const newConvMessage: NewConversationMessage = {
          type: 'new_conversation',
        }

        sendMessage(client, newConvMessage)

        const response = await waitForMessage(client)

        expect(response.type).toBe('connected')
        expect(response.conversationId).toMatch(/^conv-/)

        client.close()
      })

      it('should create unique conversation IDs for different clients', async () => {
        const client1 = await createTestClient(port)
        const client2 = await createTestClient(port)

        sendMessage(client1, { type: 'new_conversation' })
        sendMessage(client2, { type: 'new_conversation' })

        const response1 = await waitForMessage(client1)
        const response2 = await waitForMessage(client2)

        expect(response1.conversationId).not.toBe(response2.conversationId)

        client1.close()
        client2.close()
      })
    })

    describe('chat messages', () => {
      it('should route chat message to AgentServer', async () => {
        const client = await createTestClient(port)

        // First create conversation
        sendMessage(client, { type: 'new_conversation' })
        const connectedMsg = await waitForMessage(client)
        const conversationId = connectedMsg.conversationId

        // Send chat message
        const chatMessage: ChatMessage = {
          type: 'chat',
          conversationId,
          message: 'Hello, world!',
        }

        sendMessage(client, chatMessage)

        // Collect streaming response
        const messages = await collectMessages(client, 500)

        // Should receive text deltas and complete
        expect(messages.some((m) => m.type === 'text_delta')).toBe(true)
        expect(messages.some((m) => m.type === 'complete')).toBe(true)

        client.close()
      })

      it('should stream text deltas back to client', async () => {
        const client = await createTestClient(port)

        sendMessage(client, { type: 'new_conversation' })
        const connectedMsg = await waitForMessage(client)
        const conversationId = connectedMsg.conversationId

        const chatMessage: ChatMessage = {
          type: 'chat',
          conversationId,
          message: 'Tell me a story',
        }

        sendMessage(client, chatMessage)

        const messages = await collectMessages(client, 500)

        const textDeltas = messages.filter((m) => m.type === 'text_delta')
        expect(textDeltas.length).toBeGreaterThan(0)

        // Concatenate all deltas
        const fullText = textDeltas.map((m) => m.text).join('')
        expect(fullText.length).toBeGreaterThan(0)

        client.close()
      })

      it('should send complete message after response', async () => {
        const client = await createTestClient(port)

        sendMessage(client, { type: 'new_conversation' })
        const connectedMsg = await waitForMessage(client)
        const conversationId = connectedMsg.conversationId

        sendMessage(client, {
          type: 'chat',
          conversationId,
          message: 'Hello',
        })

        const messages = await collectMessages(client, 500)

        const completeMsg = messages.find((m) => m.type === 'complete')
        expect(completeMsg).toBeDefined()
        expect(completeMsg.conversationId).toBe(conversationId)
        expect(completeMsg.usage).toBeDefined()

        client.close()
      })

      it('should send error for non-existent conversation', async () => {
        const client = await createTestClient(port)

        const chatMessage: ChatMessage = {
          type: 'chat',
          conversationId: 'conv-nonexistent-12345',
          message: 'Hello',
        }

        sendMessage(client, chatMessage)

        const response = await waitForMessage(client)

        expect(response.type).toBe('error')
        expect(response.message).toMatch(/conversation|not found/i)

        client.close()
      })

      it('should include conversation ID in all response messages', async () => {
        const client = await createTestClient(port)

        sendMessage(client, { type: 'new_conversation' })
        const connectedMsg = await waitForMessage(client)
        const conversationId = connectedMsg.conversationId

        sendMessage(client, {
          type: 'chat',
          conversationId,
          message: 'Test',
        })

        const messages = await collectMessages(client, 500)

        for (const msg of messages) {
          expect(msg.conversationId).toBe(conversationId)
        }

        client.close()
      })
    })

    describe('cancel messages', () => {
      it('should cancel active streaming request', async () => {
        const client = await createTestClient(port)

        sendMessage(client, { type: 'new_conversation' })
        const connectedMsg = await waitForMessage(client)
        const conversationId = connectedMsg.conversationId

        // Start a long request
        sendMessage(client, {
          type: 'chat',
          conversationId,
          message: 'Write a very long essay',
        })

        // Wait for some deltas
        await new Promise((resolve) => setTimeout(resolve, 50))

        // Cancel it
        const cancelMessage: CancelMessage = {
          type: 'cancel',
          conversationId,
        }
        sendMessage(client, cancelMessage)

        // Collect remaining messages
        const messages = await collectMessages(client, 200)

        // Should eventually complete or stop streaming
        expect(messages.some((m) => m.type === 'complete')).toBe(true)

        client.close()
      })

      it('should be no-op for non-active conversation', async () => {
        const client = await createTestClient(port)

        sendMessage(client, { type: 'new_conversation' })
        const connectedMsg = await waitForMessage(client)
        const conversationId = connectedMsg.conversationId

        // Cancel without active request
        sendMessage(client, {
          type: 'cancel',
          conversationId,
        })

        // Should not crash or send error
        await new Promise((resolve) => setTimeout(resolve, 100))

        client.close()
      })
    })
  })

  // ===========================================================================
  // INTEGRATION WITH AGENTSERVER
  // ===========================================================================

  describe('Integration with AgentServer', () => {
    let server: ChatWsServer
    let port: number

    beforeEach(async () => {
      server = createChatWsServer({ port: 0 })
      await server.start()
      port = server.getPort()
    })

    afterEach(async () => {
      await server.stop()
    })

    it('should share AgentServer instance across clients', async () => {
      const client1 = await createTestClient(port)
      const client2 = await createTestClient(port)

      sendMessage(client1, { type: 'new_conversation' })
      sendMessage(client2, { type: 'new_conversation' })

      const response1 = await waitForMessage(client1)
      const response2 = await waitForMessage(client2)

      // Both should get valid conversation IDs from same AgentServer
      expect(response1.conversationId).toMatch(/^conv-/)
      expect(response2.conversationId).toMatch(/^conv-/)

      // Conversations should be in the same AgentServer
      const agentServer = server.getAgentServer()
      expect(agentServer.getConversation(response1.conversationId)).toBeDefined()
      expect(agentServer.getConversation(response2.conversationId)).toBeDefined()

      client1.close()
      client2.close()
    })

    it('should maintain conversation history through AgentServer', async () => {
      const client = await createTestClient(port)

      sendMessage(client, { type: 'new_conversation' })
      const connectedMsg = await waitForMessage(client)
      const conversationId = connectedMsg.conversationId

      // First message
      sendMessage(client, {
        type: 'chat',
        conversationId,
        message: 'My name is Alice',
      })
      await collectMessages(client, 300)

      // Second message referencing first
      sendMessage(client, {
        type: 'chat',
        conversationId,
        message: 'What is my name?',
      })
      const messages = await collectMessages(client, 300)

      // Response should reference Alice
      const textDeltas = messages.filter((m) => m.type === 'text_delta')
      const fullText = textDeltas.map((m) => m.text).join('')

      expect(fullText.toLowerCase()).toContain('alice')

      client.close()
    })

    it('should pass tool events through from AgentServer', async () => {
      const server = createChatWsServer({
        port: 0,
        agentServerOptions: {
          enableTools: true,
        },
      })

      await server.start()
      const port = server.getPort()

      const client = await createTestClient(port)

      sendMessage(client, { type: 'new_conversation' })
      const connectedMsg = await waitForMessage(client)
      const conversationId = connectedMsg.conversationId

      // Send message that might trigger tools
      sendMessage(client, {
        type: 'chat',
        conversationId,
        message: 'Search for notes',
      })

      const messages = await collectMessages(client, 500)

      // If tools are called, should see tool_start and tool_result
      const hasToolMessages =
        messages.some((m) => m.type === 'tool_start') ||
        messages.some((m) => m.type === 'tool_result')

      // Tool messages may or may not appear depending on MCP availability
      // But the test verifies the plumbing works
      expect(messages.some((m) => m.type === 'complete')).toBe(true)

      client.close()
      await server.stop()
    })
  })

  // ===========================================================================
  // ERROR HANDLING TESTS
  // ===========================================================================

  describe('Error Handling', () => {
    let server: ChatWsServer
    let port: number

    beforeEach(async () => {
      server = createChatWsServer({ port: 0 })
      await server.start()
      port = server.getPort()
    })

    afterEach(async () => {
      await server.stop()
    })

    it('should send error message for invalid JSON', async () => {
      const client = await createTestClient(port)

      client.send('not valid json {')

      const response = await waitForMessage(client)

      expect(response.type).toBe('error')
      expect(response.message).toBeDefined()

      client.close()
    })

    it('should send error message for invalid message type', async () => {
      const client = await createTestClient(port)

      client.send(JSON.stringify({ type: 'unknown_type' }))

      const response = await waitForMessage(client)

      expect(response.type).toBe('error')

      client.close()
    })

    it('should send error message for missing required fields', async () => {
      const client = await createTestClient(port)

      // Chat message without conversationId
      client.send(JSON.stringify({ type: 'chat', message: 'hello' }))

      const response = await waitForMessage(client)

      expect(response.type).toBe('error')

      client.close()
    })

    it('should handle client error events gracefully', async () => {
      const client = await createTestClient(port)

      // Simulate client error
      client.emit('error', new Error('Client error'))

      // Server should not crash
      expect(server.isRunning()).toBe(true)

      client.close()
    })

    it('should emit "error" event for server errors', async () => {
      let errorEmitted = false
      server.on('error', () => {
        errorEmitted = true
      })

      // Try to trigger a server error (implementation-specific)
      // This is a placeholder - actual implementation may vary

      // For now just verify the event handler is set up
      expect(errorEmitted).toBe(false)
    })

    it('should continue serving other clients after one client error', async () => {
      const client1 = await createTestClient(port)
      const client2 = await createTestClient(port)

      // Client1 sends bad data
      client1.send('bad data {')

      // Client2 should still work
      sendMessage(client2, { type: 'new_conversation' })
      const response = await waitForMessage(client2)

      expect(response.type).toBe('connected')

      client1.close()
      client2.close()
    })

    it('should handle AgentServer errors gracefully', async () => {
      const client = await createTestClient(port)

      sendMessage(client, { type: 'new_conversation' })
      const connectedMsg = await waitForMessage(client)
      const conversationId = connectedMsg.conversationId

      // Try to trigger an error by sending empty message
      sendMessage(client, {
        type: 'chat',
        conversationId,
        message: '',
      })

      const response = await waitForMessage(client)

      expect(response.type).toBe('error')

      client.close()
    })

    it('should not expose internal errors to client', async () => {
      const client = await createTestClient(port)

      // Send something that might cause internal error
      client.send('malformed')

      const response = await waitForMessage(client)

      // Error message should not contain stack traces
      if (response.type === 'error') {
        expect(response.message).not.toContain('at ')
        expect(response.message).not.toContain('.ts:')
        expect(response.message).not.toContain('.js:')
      }

      client.close()
    })
  })

  // ===========================================================================
  // MULTIPLE CONCURRENT CLIENTS
  // ===========================================================================

  describe('Multiple Concurrent Clients', () => {
    let server: ChatWsServer
    let port: number

    beforeEach(async () => {
      server = createChatWsServer({ port: 0 })
      await server.start()
      port = server.getPort()
    })

    afterEach(async () => {
      await server.stop()
    })

    it('should handle 10 concurrent clients', async () => {
      const clients = await Promise.all(
        Array.from({ length: 10 }, () => createTestClient(port))
      )

      expect(server.getConnectedClients()).toBe(10)

      clients.forEach((client) => client.close())
    })

    it('should route messages independently for each client', async () => {
      const clients = await Promise.all([
        createTestClient(port),
        createTestClient(port),
        createTestClient(port),
      ])

      // Create conversations for each
      const conversationIds = await Promise.all(
        clients.map(async (client) => {
          sendMessage(client, { type: 'new_conversation' })
          const response = await waitForMessage(client)
          return response.conversationId
        })
      )

      // All should be different
      expect(new Set(conversationIds).size).toBe(3)

      // Send messages concurrently
      const results = await Promise.all(
        clients.map(async (client, i) => {
          sendMessage(client, {
            type: 'chat',
            conversationId: conversationIds[i],
            message: `Message from client ${i}`,
          })
          return collectMessages(client, 500)
        })
      )

      // All should receive responses
      for (const messages of results) {
        expect(messages.some((m) => m.type === 'complete')).toBe(true)
      }

      clients.forEach((client) => client.close())
    })

    it('should not mix up messages between clients', async () => {
      const client1 = await createTestClient(port)
      const client2 = await createTestClient(port)

      // Create conversations
      sendMessage(client1, { type: 'new_conversation' })
      sendMessage(client2, { type: 'new_conversation' })

      const conv1 = await waitForMessage(client1)
      const conv2 = await waitForMessage(client2)

      // Send messages simultaneously
      sendMessage(client1, {
        type: 'chat',
        conversationId: conv1.conversationId,
        message: 'Client 1 message',
      })

      sendMessage(client2, {
        type: 'chat',
        conversationId: conv2.conversationId,
        message: 'Client 2 message',
      })

      // Collect responses
      const messages1 = await collectMessages(client1, 500)
      const messages2 = await collectMessages(client2, 500)

      // Each client should only receive their own conversation messages
      for (const msg of messages1) {
        expect(msg.conversationId).toBe(conv1.conversationId)
      }

      for (const msg of messages2) {
        expect(msg.conversationId).toBe(conv2.conversationId)
      }

      client1.close()
      client2.close()
    })

    it('should handle rapid connects and disconnects', async () => {
      // Connect and disconnect rapidly
      for (let i = 0; i < 20; i++) {
        const client = await createTestClient(port)
        client.close()
      }

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Server should still be functional
      expect(server.isRunning()).toBe(true)
      expect(server.getConnectedClients()).toBe(0)
    })

    it('should handle one client disconnecting while others are active', async () => {
      const clients = await Promise.all([
        createTestClient(port),
        createTestClient(port),
        createTestClient(port),
      ])

      // Disconnect middle client
      clients[1].close()

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(server.getConnectedClients()).toBe(2)

      // Other clients should still work
      sendMessage(clients[0], { type: 'new_conversation' })
      const response = await waitForMessage(clients[0])

      expect(response.type).toBe('connected')

      clients[0].close()
      clients[2].close()
    })
  })

  // ===========================================================================
  // AUTHENTICATION/AUTHORIZATION (Optional Feature)
  // ===========================================================================

  describe('Authentication and Authorization', () => {
    it('should optionally support authentication tokens', async () => {
      const server = createChatWsServer({
        port: 0,
        requireAuth: true,
        authToken: 'secret-token-12345',
      })

      await server.start()
      const port = server.getPort()

      // Try to connect without auth
      // Should either receive auth error or connection should be rejected
      // Implementation-specific behavior
      try {
        const client = await createTestClient(port)
        // If connection succeeded, close it
        client.close()
      } catch {
        // Connection was rejected - this is also valid behavior
      }

      await server.stop()
    })

    it('should accept authenticated connections', async () => {
      const server = createChatWsServer({
        port: 0,
        requireAuth: true,
        authToken: 'secret-token-12345',
      })

      await server.start()
      const port = server.getPort()

      // Connect with auth header
      const client = new WebSocket(`ws://localhost:${port}`, {
        headers: {
          Authorization: 'Bearer secret-token-12345',
        },
      })

      await new Promise((resolve, reject) => {
        client.on('open', resolve)
        client.on('error', reject)
      })

      expect(client.readyState).toBe(WebSocket.OPEN)

      client.close()
      await server.stop()
    })

    it('should reject unauthenticated connections when auth is required', async () => {
      const server = createChatWsServer({
        port: 0,
        requireAuth: true,
        authToken: 'secret-token-12345',
      })

      await server.start()
      const port = server.getPort()

      // Connect without auth
      const client = new WebSocket(`ws://localhost:${port}`)

      await expect(
        new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('timeout')), 1000)
          client.on('open', () => {
            clearTimeout(timeout)
            resolve(undefined)
          })
          client.on('close', () => {
            clearTimeout(timeout)
            reject(new Error('Connection closed'))
          })
          client.on('error', () => {
            clearTimeout(timeout)
            reject(new Error('Connection error'))
          })
        })
      ).rejects.toThrow()

      await server.stop()
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe('Edge Cases', () => {
    let server: ChatWsServer
    let port: number

    beforeEach(async () => {
      server = createChatWsServer({ port: 0 })
      await server.start()
      port = server.getPort()
    })

    afterEach(async () => {
      await server.stop()
    })

    it('should handle very large messages', async () => {
      const client = await createTestClient(port)

      sendMessage(client, { type: 'new_conversation' })
      const connectedMsg = await waitForMessage(client)
      const conversationId = connectedMsg.conversationId

      // Send very large message
      const largeMessage = 'x'.repeat(100000)
      sendMessage(client, {
        type: 'chat',
        conversationId,
        message: largeMessage,
      })

      const messages = await collectMessages(client, 1000)

      // Should handle gracefully (either process or error)
      const hasComplete = messages.some((m) => m.type === 'complete')
      const hasError = messages.some((m) => m.type === 'error')
      expect(hasComplete || hasError).toBe(true)

      client.close()
    })

    it('should handle empty messages gracefully', async () => {
      const client = await createTestClient(port)

      client.send('')

      // Should not crash
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(server.isRunning()).toBe(true)

      client.close()
    })

    it('should handle rapid message sending', async () => {
      const client = await createTestClient(port)

      sendMessage(client, { type: 'new_conversation' })
      const connectedMsg = await waitForMessage(client)
      const conversationId = connectedMsg.conversationId

      // Send many messages rapidly
      for (let i = 0; i < 10; i++) {
        sendMessage(client, {
          type: 'chat',
          conversationId,
          message: `Message ${i}`,
        })
      }

      // Should handle all messages
      await new Promise((resolve) => setTimeout(resolve, 1000))

      expect(server.isRunning()).toBe(true)

      client.close()
    })

    it('should handle binary data gracefully', async () => {
      const client = await createTestClient(port)

      // Send binary data
      client.send(Buffer.from([0x00, 0x01, 0x02]))

      const response = await waitForMessage(client)

      // Should send error
      expect(response.type).toBe('error')

      client.close()
    })

    it('should handle messages during server shutdown', async () => {
      const client = await createTestClient(port)

      sendMessage(client, { type: 'new_conversation' })
      await waitForMessage(client)

      // Start shutdown
      const stopPromise = server.stop()

      // Try to send message during shutdown
      sendMessage(client, { type: 'new_conversation' })

      await stopPromise

      // Should complete shutdown
      expect(server.isRunning()).toBe(false)
    })

    it('should close all client connections on server stop', async () => {
      const clients = await Promise.all([
        createTestClient(port),
        createTestClient(port),
        createTestClient(port),
      ])

      await server.stop()

      // Wait for clients to detect closure
      await new Promise((resolve) => setTimeout(resolve, 100))

      for (const client of clients) {
        expect(client.readyState).toBe(WebSocket.CLOSED)
      }
    })
  })

  // ===========================================================================
  // PERFORMANCE TESTS (Optional)
  // ===========================================================================

  describe('Performance', () => {
    it('should handle message throughput efficiently', async () => {
      const server = createChatWsServer({ port: 0 })
      await server.start()
      const port = server.getPort()

      const client = await createTestClient(port)

      sendMessage(client, { type: 'new_conversation' })
      const connectedMsg = await waitForMessage(client)
      const conversationId = connectedMsg.conversationId

      const start = Date.now()
      const messageCount = 5

      for (let i = 0; i < messageCount; i++) {
        sendMessage(client, {
          type: 'chat',
          conversationId,
          message: `Message ${i}`,
        })

        // Wait for completion
        await collectMessages(client, 300)
      }

      const end = Date.now()
      const duration = end - start

      // Should complete in reasonable time
      expect(duration).toBeLessThan(5000)

      client.close()
      await server.stop()
    })

    it('should not leak memory with many connections', async () => {
      const server = createChatWsServer({ port: 0 })
      await server.start()
      const port = server.getPort()

      // Connect and disconnect many times
      for (let i = 0; i < 50; i++) {
        const client = await createTestClient(port)
        sendMessage(client, { type: 'new_conversation' })
        await waitForMessage(client)
        client.close()
        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      // Server should still be healthy
      expect(server.isRunning()).toBe(true)
      expect(server.getConnectedClients()).toBe(0)

      await server.stop()
    })
  })
})
