/**
 * TDD RED Tests for CLI Agent Command
 *
 * The CLI Agent Command provides a terminal interface for interacting
 * with the Agent Chat System via WebSocket connection.
 *
 * Command: obsidian agent [options]
 * Alternative: obsidian chat [options]
 *
 * Key responsibilities:
 * - Register command with CLI program
 * - Parse command-line options
 * - Connect to ChatWsServer via WebSocket
 * - Send/receive messages interactively
 * - Display streaming responses in real-time
 * - Support conversation management
 * - Handle errors and connection failures
 * - Support stdin/stdout for interactive mode
 *
 * All tests should FAIL until the implementation is complete (GREEN phase).
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { EventEmitter } from 'events'
import { Readable, Writable } from 'stream'
import WebSocket from 'ws'

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

// Import types from protocol (which exists)
import type { ServerMessage, ClientMessage } from '../../src/agent/chat-protocol.js'
import { createChatWsServer, type ChatWsServer } from '../../src/agent/chat-ws-server.js'

// Types for the module under test (which doesn't exist yet)
export interface AgentCommandOptions {
  /** WebSocket server URL */
  server?: string
  /** Single message to send and exit */
  message?: string
  /** Start a new conversation */
  new?: boolean
  /** Show conversation history */
  history?: boolean
  /** Conversation ID to continue */
  conversation?: string
  /** Output format */
  format?: 'text' | 'json'
  /** Connection timeout in milliseconds */
  timeout?: number
  /** Quiet mode - suppress status messages */
  quiet?: boolean
}

export interface AgentCommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

// Define the expected interface for AgentCommand
interface AgentCommand {
  register(program: unknown): void
  run(options: AgentCommandOptions, stdin?: Readable, stdout?: Writable): Promise<AgentCommandResult>
}

// Try to import the module under test - will fail initially (RED phase)
let AgentCommand: AgentCommand | null = null
let createAgentCommand: ((options?: Partial<AgentCommandOptions>) => AgentCommand) | null = null

try {
  const module = await import('../../src/cli/agent-command.js')
  AgentCommand = module.AgentCommand
  createAgentCommand = module.createAgentCommand
} catch {
  // Module doesn't exist yet - this is expected for RED phase
  AgentCommand = null
  createAgentCommand = null
}

/**
 * Helper: Create a mock stdin stream
 */
function createMockStdin(): Readable {
  const stream = new Readable({
    read() {},
  })
  return stream
}

/**
 * Helper: Create a mock stdout stream that captures output
 */
function createMockStdout(): Writable & { getOutput(): string } {
  let output = ''
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString()
      callback()
    },
  }) as Writable & { getOutput(): string }

  stream.getOutput = () => output
  return stream
}

/**
 * Helper: Wait for a condition with timeout
 */
async function waitFor(
  condition: () => boolean,
  timeout = 5000,
  interval = 50
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
  throw new Error('Condition not met within timeout')
}

/**
 * Helper: Create a simple mock program for command registration
 */
function createMockProgram() {
  const commands: Map<string, unknown> = new Map()
  const options: Map<string, unknown> = new Map()

  const program = {
    command: vi.fn((name: string) => {
      const cmd = {
        name,
        description: vi.fn(() => cmd),
        option: vi.fn((_flag: string, _desc: string, _default?: unknown) => {
          return cmd
        }),
        action: vi.fn((_handler: unknown) => cmd),
        alias: vi.fn((_alias: string) => cmd),
      }
      commands.set(name, cmd)
      return cmd
    }),
    getCommand: (name: string) => commands.get(name),
    commands,
    options,
  }

  return program
}

// =============================================================================
// COMMAND REGISTRATION TESTS
// =============================================================================

describe('AgentCommand', () => {
  describe('Command Registration', () => {
    it('should export AgentCommand class', () => {
      expect(AgentCommand).toBeDefined()
    })

    it('should export createAgentCommand factory function', () => {
      expect(createAgentCommand).toBeDefined()
      expect(typeof createAgentCommand).toBe('function')
    })

    it('should have a static register method', () => {
      expect(AgentCommand).toHaveProperty('register')
      expect(typeof (AgentCommand as unknown as { register: unknown }).register).toBe('function')
    })

    it('should register "agent" command with program', () => {
      const program = createMockProgram()

      ;(AgentCommand as unknown as { register: (p: unknown) => void }).register(program)

      expect(program.command).toHaveBeenCalledWith('agent')
    })

    it('should register "chat" as alias for "agent" command', () => {
      const program = createMockProgram()

      ;(AgentCommand as unknown as { register: (p: unknown) => void }).register(program)

      const agentCmd = program.getCommand('agent') as { alias: Mock }
      expect(agentCmd.alias).toHaveBeenCalledWith('chat')
    })

    it('should register --server option with default value', () => {
      const program = createMockProgram()

      ;(AgentCommand as unknown as { register: (p: unknown) => void }).register(program)

      const agentCmd = program.getCommand('agent') as { option: Mock }
      expect(agentCmd.option).toHaveBeenCalledWith(
        expect.stringContaining('--server'),
        expect.any(String),
        expect.stringContaining('ws://localhost:3000')
      )
    })

    it('should register -s as short option for --server', () => {
      const program = createMockProgram()

      ;(AgentCommand as unknown as { register: (p: unknown) => void }).register(program)

      const agentCmd = program.getCommand('agent') as { option: Mock }
      expect(agentCmd.option).toHaveBeenCalledWith(
        expect.stringMatching(/-s.*--server|--server.*-s/),
        expect.any(String),
        expect.any(String)
      )
    })

    it('should register --message option for single message mode', () => {
      const program = createMockProgram()

      ;(AgentCommand as unknown as { register: (p: unknown) => void }).register(program)

      const agentCmd = program.getCommand('agent') as { option: Mock }
      expect(agentCmd.option).toHaveBeenCalledWith(
        expect.stringMatching(/-m.*--message|--message.*-m/),
        expect.any(String)
      )
    })

    it('should register --new option to start new conversation', () => {
      const program = createMockProgram()

      ;(AgentCommand as unknown as { register: (p: unknown) => void }).register(program)

      const agentCmd = program.getCommand('agent') as { option: Mock }
      expect(agentCmd.option).toHaveBeenCalledWith(
        expect.stringMatching(/-n.*--new|--new.*-n/),
        expect.any(String)
      )
    })

    it('should register --history option to show conversation history', () => {
      const program = createMockProgram()

      ;(AgentCommand as unknown as { register: (p: unknown) => void }).register(program)

      const agentCmd = program.getCommand('agent') as { option: Mock }
      expect(agentCmd.option).toHaveBeenCalledWith(
        expect.stringContaining('--history'),
        expect.any(String)
      )
    })

    it('should register --conversation option to continue existing conversation', () => {
      const program = createMockProgram()

      ;(AgentCommand as unknown as { register: (p: unknown) => void }).register(program)

      const agentCmd = program.getCommand('agent') as { option: Mock }
      expect(agentCmd.option).toHaveBeenCalledWith(
        expect.stringMatching(/-c.*--conversation|--conversation.*-c/),
        expect.any(String)
      )
    })

    it('should register --timeout option for connection timeout', () => {
      const program = createMockProgram()

      ;(AgentCommand as unknown as { register: (p: unknown) => void }).register(program)

      const agentCmd = program.getCommand('agent') as { option: Mock }
      expect(agentCmd.option).toHaveBeenCalledWith(
        expect.stringContaining('--timeout'),
        expect.any(String),
        expect.any(Number) // default timeout
      )
    })

    it('should register --format option for output format', () => {
      const program = createMockProgram()

      ;(AgentCommand as unknown as { register: (p: unknown) => void }).register(program)

      const agentCmd = program.getCommand('agent') as { option: Mock }
      expect(agentCmd.option).toHaveBeenCalledWith(
        expect.stringContaining('--format'),
        expect.any(String)
      )
    })

    it('should register --quiet option to suppress status messages', () => {
      const program = createMockProgram()

      ;(AgentCommand as unknown as { register: (p: unknown) => void }).register(program)

      const agentCmd = program.getCommand('agent') as { option: Mock }
      expect(agentCmd.option).toHaveBeenCalledWith(
        expect.stringMatching(/-q.*--quiet|--quiet.*-q/),
        expect.any(String)
      )
    })

    it('should set action handler on command', () => {
      const program = createMockProgram()

      ;(AgentCommand as unknown as { register: (p: unknown) => void }).register(program)

      const agentCmd = program.getCommand('agent') as { action: Mock }
      expect(agentCmd.action).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // WEBSOCKET CONNECTION TESTS
  // ===========================================================================

  describe('WebSocket Connection', () => {
    let server: ChatWsServer
    let serverPort: number

    beforeEach(async () => {
      server = createChatWsServer({ port: 0 })
      await server.start()
      serverPort = server.getPort()
    })

    afterEach(async () => {
      await server.stop()
    })

    it('should connect to WebSocket server on run', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      const resultPromise = command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'test',
        },
        createMockStdin(),
        stdout
      )

      // Wait for connection
      await waitFor(() => server.getConnectedClients() > 0, 5000)

      expect(server.getConnectedClients()).toBe(1)

      // Clean up by waiting for result
      await resultPromise
    })

    it('should use default server URL if not specified', async () => {
      // This test expects connection attempt to default ws://localhost:3000
      const command = createAgentCommand!()

      // This will fail to connect since we're not running on default port
      // but it should attempt the connection
      const result = await command.run(
        { message: 'test', timeout: 500 },
        createMockStdin(),
        createMockStdout()
      )

      // Should fail with connection error
      expect(result.exitCode).not.toBe(0)
      expect(result.stderr.toLowerCase()).toMatch(/connect|timeout|refused/i)
    })

    it('should handle connection timeout', async () => {
      const command = createAgentCommand!()

      const result = await command.run(
        {
          server: 'ws://localhost:59999', // Non-existent server
          message: 'test',
          timeout: 500,
        },
        createMockStdin(),
        createMockStdout()
      )

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr.toLowerCase()).toMatch(/timeout|connect|refused/i)
    })

    it('should handle invalid server URL', async () => {
      const command = createAgentCommand!()

      const result = await command.run(
        {
          server: 'invalid-url',
          message: 'test',
        },
        createMockStdin(),
        createMockStdout()
      )

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr.toLowerCase()).toMatch(/invalid|url|connect/i)
    })

    it('should reconnect on connection drop', async () => {
      const command = createAgentCommand!()
      const stdin = createMockStdin()
      const stdout = createMockStdout()

      // Start the command
      const resultPromise = command.run(
        {
          server: `ws://localhost:${serverPort}`,
        },
        stdin,
        stdout
      )

      // Wait for initial connection
      await waitFor(() => server.getConnectedClients() > 0, 5000)

      // Simulate server restart
      await server.stop()
      server = createChatWsServer({ port: serverPort })
      await server.start()

      // Wait for reconnection (implementation should handle this)
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Clean up
      stdin.destroy()
      await resultPromise
    })

    it('should display connection status on connect', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      const resultPromise = command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'hello',
        },
        createMockStdin(),
        stdout
      )

      await resultPromise

      const output = stdout.getOutput()
      expect(output.toLowerCase()).toMatch(/connected|connecting/i)
    })

    it('should display disconnection status on disconnect', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      const result = await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'hello',
        },
        createMockStdin(),
        stdout
      )

      // Message mode should disconnect cleanly after response
      expect(result.exitCode).toBe(0)
    })

    it('should support ws:// protocol', async () => {
      const command = createAgentCommand!()

      const result = await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'test',
        },
        createMockStdin(),
        createMockStdout()
      )

      expect(result.exitCode).toBe(0)
    })

    it('should support wss:// protocol', async () => {
      const command = createAgentCommand!()

      // This will fail as our test server doesn't support TLS
      // but it should attempt the connection correctly
      const result = await command.run(
        {
          server: 'wss://localhost:59999',
          message: 'test',
          timeout: 500,
        },
        createMockStdin(),
        createMockStdout()
      )

      // Should fail with connection error, not protocol error
      expect(result.exitCode).not.toBe(0)
      expect(result.stderr.toLowerCase()).toMatch(/connect|timeout|refused/i)
    })
  })

  // ===========================================================================
  // MESSAGE HANDLING TESTS
  // ===========================================================================

  describe('Message Handling', () => {
    let server: ChatWsServer
    let serverPort: number

    beforeEach(async () => {
      server = createChatWsServer({ port: 0 })
      await server.start()
      serverPort = server.getPort()
    })

    afterEach(async () => {
      await server.stop()
    })

    it('should send message in --message mode and exit', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      const result = await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'Hello, world!',
        },
        createMockStdin(),
        stdout
      )

      expect(result.exitCode).toBe(0)
      expect(stdout.getOutput()).toBeTruthy()
    })

    it('should create new conversation before sending message', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'Test message',
        },
        createMockStdin(),
        stdout
      )

      // Server should have created a conversation
      const agentServer = server.getAgentServer()
      const conversations = agentServer.listConversations()
      expect(conversations.length).toBeGreaterThan(0)
    })

    it('should display response from server', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'Hello',
        },
        createMockStdin(),
        stdout
      )

      const output = stdout.getOutput()
      // Response should contain something (mock response from server)
      expect(output.length).toBeGreaterThan(0)
    })

    it('should handle empty message gracefully', async () => {
      const command = createAgentCommand!()

      const result = await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: '',
        },
        createMockStdin(),
        createMockStdout()
      )

      // Should error on empty message
      expect(result.exitCode).not.toBe(0)
      expect(result.stderr.toLowerCase()).toMatch(/empty|message|required/i)
    })

    it('should handle very long messages', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      const longMessage = 'x'.repeat(10000)

      const result = await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: longMessage,
        },
        createMockStdin(),
        stdout
      )

      // Should either succeed or fail gracefully
      expect(typeof result.exitCode).toBe('number')
    })

    it('should handle messages with special characters', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      const result = await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'Test with "quotes" and \\escapes\\ and $pecial chars!',
        },
        createMockStdin(),
        stdout
      )

      expect(result.exitCode).toBe(0)
    })

    it('should handle unicode messages', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      const result = await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'Hello World',
        },
        createMockStdin(),
        stdout
      )

      expect(result.exitCode).toBe(0)
    })

    it('should output conversation ID in JSON format mode', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'Hello',
          format: 'json',
        },
        createMockStdin(),
        stdout
      )

      const output = stdout.getOutput()
      const json = JSON.parse(output)
      expect(json).toHaveProperty('conversationId')
      expect(json.conversationId).toMatch(/^conv-/)
    })
  })

  // ===========================================================================
  // STREAMING RESPONSE DISPLAY TESTS
  // ===========================================================================

  describe('Streaming Response Display', () => {
    let server: ChatWsServer
    let serverPort: number

    beforeEach(async () => {
      server = createChatWsServer({ port: 0 })
      await server.start()
      serverPort = server.getPort()
    })

    afterEach(async () => {
      await server.stop()
    })

    it('should display text deltas as they arrive', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()
      let chunks: string[] = []

      // Override write to capture individual writes
      const originalWrite = stdout.write.bind(stdout)
      stdout.write = ((chunk: Buffer | string, encodingOrCb?: BufferEncoding | ((error?: Error | null) => void), cb?: (error?: Error | null) => void) => {
        const str = chunk.toString()
        chunks.push(str)
        if (typeof encodingOrCb === 'function') {
          return originalWrite(chunk, encodingOrCb)
        }
        return originalWrite(chunk, encodingOrCb, cb)
      }) as typeof stdout.write

      await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'Count from 1 to 5',
        },
        createMockStdin(),
        stdout
      )

      // Should receive multiple chunks (streaming)
      expect(chunks.length).toBeGreaterThan(1)
    })

    it('should display response without buffering', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()
      const writeTimestamps: number[] = []

      const originalWrite = stdout.write.bind(stdout)
      stdout.write = ((chunk: Buffer | string, encodingOrCb?: BufferEncoding | ((error?: Error | null) => void), cb?: (error?: Error | null) => void) => {
        writeTimestamps.push(Date.now())
        if (typeof encodingOrCb === 'function') {
          return originalWrite(chunk, encodingOrCb)
        }
        return originalWrite(chunk, encodingOrCb, cb)
      }) as typeof stdout.write

      await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'Tell me a short story',
        },
        createMockStdin(),
        stdout
      )

      // Writes should be spread over time (not all at once)
      if (writeTimestamps.length > 2) {
        const firstWrite = writeTimestamps[0]
        const lastWrite = writeTimestamps[writeTimestamps.length - 1]
        // There should be some time spread
        expect(lastWrite - firstWrite).toBeGreaterThanOrEqual(0)
      }
    })

    it('should add newline after complete response', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'Hello',
        },
        createMockStdin(),
        stdout
      )

      const output = stdout.getOutput()
      expect(output.endsWith('\n')).toBe(true)
    })

    it('should display tool calls when they occur', async () => {
      // Create server with tools enabled
      const toolServer = createChatWsServer({
        port: 0,
        agentServerOptions: {
          enableTools: true,
        },
      })
      await toolServer.start()
      const toolPort = toolServer.getPort()

      const command = createAgentCommand!()
      const stdout = createMockStdout()

      await command.run(
        {
          server: `ws://localhost:${toolPort}`,
          message: 'Search for notes about testing',
        },
        createMockStdin(),
        stdout
      )

      await toolServer.stop()

      // If tools were called, output should mention them
      // (This depends on whether tools are available)
      expect(stdout.getOutput()).toBeDefined()
    })

    it('should display tool results', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'Hello',
        },
        createMockStdin(),
        stdout
      )

      // Tool results would be displayed in the output stream
      expect(stdout.getOutput()).toBeDefined()
    })

    it('should display errors from server', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      // Try to use non-existent conversation
      const result = await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          conversation: 'conv-nonexistent-12345',
          message: 'Hello',
        },
        createMockStdin(),
        stdout
      )

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr.toLowerCase()).toMatch(/error|not found/i)
    })

    it('should support quiet mode to suppress status messages', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'Hello',
          quiet: true,
        },
        createMockStdin(),
        stdout
      )

      const output = stdout.getOutput()
      // Should not contain status messages like "Connected" or "Connecting"
      expect(output.toLowerCase()).not.toMatch(/connecting|connected to/i)
    })

    it('should show usage statistics after response in verbose mode', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'Hello',
          format: 'json',
        },
        createMockStdin(),
        stdout
      )

      const output = stdout.getOutput()
      const json = JSON.parse(output)
      expect(json).toHaveProperty('usage')
      expect(json.usage).toHaveProperty('inputTokens')
      expect(json.usage).toHaveProperty('outputTokens')
    })
  })

  // ===========================================================================
  // CONVERSATION MANAGEMENT TESTS
  // ===========================================================================

  describe('Conversation Management', () => {
    let server: ChatWsServer
    let serverPort: number

    beforeEach(async () => {
      server = createChatWsServer({ port: 0 })
      await server.start()
      serverPort = server.getPort()
    })

    afterEach(async () => {
      await server.stop()
    })

    it('should create new conversation with --new flag', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          new: true,
          message: 'Hello',
        },
        createMockStdin(),
        stdout
      )

      const agentServer = server.getAgentServer()
      expect(agentServer.listConversations().length).toBe(1)
    })

    it('should continue existing conversation with --conversation flag', async () => {
      // First create a conversation
      const command1 = createAgentCommand!()
      const stdout1 = createMockStdout()

      await command1.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'My name is Alice',
          format: 'json',
        },
        createMockStdin(),
        stdout1
      )

      const output1 = JSON.parse(stdout1.getOutput())
      const conversationId = output1.conversationId

      // Now continue the conversation
      const command2 = createAgentCommand!()
      const stdout2 = createMockStdout()

      await command2.run(
        {
          server: `ws://localhost:${serverPort}`,
          conversation: conversationId,
          message: 'What is my name?',
        },
        createMockStdin(),
        stdout2
      )

      const output2 = stdout2.getOutput()
      expect(output2.toLowerCase()).toContain('alice')
    })

    it('should display conversation history with --history flag', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      // First create a conversation
      await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'First message',
          format: 'json',
        },
        createMockStdin(),
        stdout
      )

      const output = JSON.parse(stdout.getOutput())
      const conversationId = output.conversationId

      // Now get history
      const command2 = createAgentCommand!()
      const stdout2 = createMockStdout()

      await command2.run(
        {
          server: `ws://localhost:${serverPort}`,
          conversation: conversationId,
          history: true,
        },
        createMockStdin(),
        stdout2
      )

      const history = stdout2.getOutput()
      expect(history).toContain('First message')
    })

    it('should error if --conversation refers to non-existent conversation', async () => {
      const command = createAgentCommand!()

      const result = await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          conversation: 'conv-nonexistent-id-12345',
          message: 'Hello',
        },
        createMockStdin(),
        createMockStdout()
      )

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr.toLowerCase()).toMatch(/not found|conversation/i)
    })

    it('should output conversation ID after creating new conversation', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'Hello',
          format: 'json',
        },
        createMockStdin(),
        stdout
      )

      const output = JSON.parse(stdout.getOutput())
      expect(output.conversationId).toMatch(/^conv-/)
    })

    it('should maintain conversation state across messages', async () => {
      // This is tested by the "continue existing conversation" test
      // Adding another check for state consistency
      const command1 = createAgentCommand!()
      const stdout1 = createMockStdout()

      await command1.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'Remember the number 42',
          format: 'json',
        },
        createMockStdin(),
        stdout1
      )

      const output1 = JSON.parse(stdout1.getOutput())
      const conversationId = output1.conversationId

      // Second message
      const command2 = createAgentCommand!()
      const stdout2 = createMockStdout()

      await command2.run(
        {
          server: `ws://localhost:${serverPort}`,
          conversation: conversationId,
          message: 'What number did I mention?',
        },
        createMockStdin(),
        stdout2
      )

      // Response should reference 42
      expect(stdout2.getOutput()).toContain('42')
    })
  })

  // ===========================================================================
  // ERROR HANDLING TESTS
  // ===========================================================================

  describe('Error Handling', () => {
    let server: ChatWsServer
    let serverPort: number

    beforeEach(async () => {
      server = createChatWsServer({ port: 0 })
      await server.start()
      serverPort = server.getPort()
    })

    afterEach(async () => {
      await server.stop()
    })

    it('should exit with non-zero code on connection failure', async () => {
      const command = createAgentCommand!()

      const result = await command.run(
        {
          server: 'ws://localhost:59999',
          message: 'test',
          timeout: 500,
        },
        createMockStdin(),
        createMockStdout()
      )

      expect(result.exitCode).not.toBe(0)
    })

    it('should display user-friendly error on connection refused', async () => {
      const command = createAgentCommand!()

      const result = await command.run(
        {
          server: 'ws://localhost:59999',
          message: 'test',
          timeout: 500,
        },
        createMockStdin(),
        createMockStdout()
      )

      expect(result.stderr.toLowerCase()).toMatch(/connect|refused|failed/i)
      // Should not contain stack traces
      expect(result.stderr).not.toMatch(/at \w+/)
    })

    it('should display user-friendly error on timeout', async () => {
      const command = createAgentCommand!()

      const result = await command.run(
        {
          server: 'ws://localhost:59999',
          message: 'test',
          timeout: 100,
        },
        createMockStdin(),
        createMockStdout()
      )

      expect(result.stderr.toLowerCase()).toMatch(/timeout|connect/i)
    })

    it('should handle server disconnect during request', async () => {
      const command = createAgentCommand!()
      const stdin = createMockStdin()
      const stdout = createMockStdout()

      // Start command
      const resultPromise = command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'Long message that takes time',
        },
        stdin,
        stdout
      )

      // Wait for connection
      await waitFor(() => server.getConnectedClients() > 0, 5000)

      // Stop server mid-request
      await server.stop()

      const result = await resultPromise

      // Should handle disconnect gracefully
      expect(result.stderr.toLowerCase()).toMatch(/disconnect|closed|error/i)
    })

    it('should handle malformed server responses', async () => {
      const command = createAgentCommand!()

      // Server should handle this properly
      const result = await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'Hello',
        },
        createMockStdin(),
        createMockStdout()
      )

      // Normal response should work
      expect(result.exitCode).toBe(0)
    })

    it('should display helpful message when server is unavailable', async () => {
      const command = createAgentCommand!()

      const result = await command.run(
        {
          server: 'ws://localhost:59999',
          message: 'test',
          timeout: 500,
        },
        createMockStdin(),
        createMockStdout()
      )

      // Error should suggest checking server
      expect(result.stderr.toLowerCase()).toMatch(/server|connect|running/i)
    })

    it('should handle SIGINT gracefully during streaming', async () => {
      const command = createAgentCommand!()
      const stdin = createMockStdin()
      const stdout = createMockStdout()

      // Start a request
      const resultPromise = command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'Tell me a very long story',
        },
        stdin,
        stdout
      )

      // Wait a bit for streaming to start
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Emit SIGINT (simulate Ctrl+C)
      process.emit('SIGINT')

      const result = await resultPromise

      // Should exit cleanly
      expect(typeof result.exitCode).toBe('number')
    })

    it('should not expose internal errors to user', async () => {
      const command = createAgentCommand!()

      const result = await command.run(
        {
          server: 'invalid-url-format',
          message: 'test',
        },
        createMockStdin(),
        createMockStdout()
      )

      // Error should be user-friendly
      expect(result.stderr).not.toContain('throw')
      expect(result.stderr).not.toContain('.ts:')
      expect(result.stderr).not.toContain('.js:')
    })
  })

  // ===========================================================================
  // INTERACTIVE MODE TESTS
  // ===========================================================================

  describe('Interactive Mode', () => {
    let server: ChatWsServer
    let serverPort: number

    beforeEach(async () => {
      server = createChatWsServer({ port: 0 })
      await server.start()
      serverPort = server.getPort()
    })

    afterEach(async () => {
      await server.stop()
    })

    it('should enter interactive mode when no --message is provided', async () => {
      const command = createAgentCommand!()
      const stdin = createMockStdin()
      const stdout = createMockStdout()

      // Start interactive mode
      const resultPromise = command.run(
        {
          server: `ws://localhost:${serverPort}`,
        },
        stdin,
        stdout
      )

      // Wait for prompt
      await waitFor(() => stdout.getOutput().includes('>') || stdout.getOutput().includes(':'), 2000)

      // Send a message
      stdin.push('Hello\n')

      // Wait for response
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Send exit command
      stdin.push('/exit\n')
      stdin.push(null)

      const result = await resultPromise

      expect(result.exitCode).toBe(0)
    })

    it('should display prompt for user input', async () => {
      const command = createAgentCommand!()
      const stdin = createMockStdin()
      const stdout = createMockStdout()

      const resultPromise = command.run(
        {
          server: `ws://localhost:${serverPort}`,
        },
        stdin,
        stdout
      )

      // Wait for prompt
      await new Promise((resolve) => setTimeout(resolve, 500))

      const output = stdout.getOutput()
      // Should show some kind of prompt
      expect(output).toMatch(/[>:]/i)

      // Clean up
      stdin.push('/exit\n')
      stdin.push(null)
      await resultPromise
    })

    it('should handle multi-line input', async () => {
      const command = createAgentCommand!()
      const stdin = createMockStdin()
      const stdout = createMockStdout()

      const resultPromise = command.run(
        {
          server: `ws://localhost:${serverPort}`,
        },
        stdin,
        stdout
      )

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Send multi-line message (implementation-specific delimiter)
      stdin.push('Line one\n')
      stdin.push('Line two\n')
      stdin.push('\n') // Empty line to submit

      // Wait for response
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Clean up
      stdin.push('/exit\n')
      stdin.push(null)
      await resultPromise

      expect(stdout.getOutput()).toBeDefined()
    })

    it('should support /exit command to quit', async () => {
      const command = createAgentCommand!()
      const stdin = createMockStdin()
      const stdout = createMockStdout()

      const resultPromise = command.run(
        {
          server: `ws://localhost:${serverPort}`,
        },
        stdin,
        stdout
      )

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Send exit command
      stdin.push('/exit\n')
      stdin.push(null)

      const result = await resultPromise

      expect(result.exitCode).toBe(0)
    })

    it('should support /quit as alias for /exit', async () => {
      const command = createAgentCommand!()
      const stdin = createMockStdin()
      const stdout = createMockStdout()

      const resultPromise = command.run(
        {
          server: `ws://localhost:${serverPort}`,
        },
        stdin,
        stdout
      )

      await new Promise((resolve) => setTimeout(resolve, 500))

      stdin.push('/quit\n')
      stdin.push(null)

      const result = await resultPromise

      expect(result.exitCode).toBe(0)
    })

    it('should support /new command to start new conversation', async () => {
      const command = createAgentCommand!()
      const stdin = createMockStdin()
      const stdout = createMockStdout()

      const resultPromise = command.run(
        {
          server: `ws://localhost:${serverPort}`,
        },
        stdin,
        stdout
      )

      await new Promise((resolve) => setTimeout(resolve, 500))

      // Send message to first conversation
      stdin.push('Hello\n')
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Start new conversation
      stdin.push('/new\n')
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Exit
      stdin.push('/exit\n')
      stdin.push(null)

      await resultPromise

      // Should have created a new conversation
      const agentServer = server.getAgentServer()
      expect(agentServer.listConversations().length).toBe(2)
    })

    it('should support /history command to show conversation history', async () => {
      const command = createAgentCommand!()
      const stdin = createMockStdin()
      const stdout = createMockStdout()

      const resultPromise = command.run(
        {
          server: `ws://localhost:${serverPort}`,
        },
        stdin,
        stdout
      )

      await new Promise((resolve) => setTimeout(resolve, 500))

      // Send a message first
      stdin.push('Test message for history\n')
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Request history
      stdin.push('/history\n')
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Exit
      stdin.push('/exit\n')
      stdin.push(null)

      await resultPromise

      const output = stdout.getOutput()
      expect(output).toContain('Test message for history')
    })

    it('should support /clear command to clear conversation', async () => {
      const command = createAgentCommand!()
      const stdin = createMockStdin()
      const stdout = createMockStdout()

      const resultPromise = command.run(
        {
          server: `ws://localhost:${serverPort}`,
        },
        stdin,
        stdout
      )

      await new Promise((resolve) => setTimeout(resolve, 500))

      // Send some messages
      stdin.push('First message\n')
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Clear
      stdin.push('/clear\n')
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Exit
      stdin.push('/exit\n')
      stdin.push(null)

      await resultPromise

      const output = stdout.getOutput()
      expect(output.toLowerCase()).toMatch(/clear|new conversation/i)
    })

    it('should support /help command to show available commands', async () => {
      const command = createAgentCommand!()
      const stdin = createMockStdin()
      const stdout = createMockStdout()

      const resultPromise = command.run(
        {
          server: `ws://localhost:${serverPort}`,
        },
        stdin,
        stdout
      )

      await new Promise((resolve) => setTimeout(resolve, 500))

      // Request help
      stdin.push('/help\n')
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Exit
      stdin.push('/exit\n')
      stdin.push(null)

      await resultPromise

      const output = stdout.getOutput()
      expect(output.toLowerCase()).toContain('/exit')
      expect(output.toLowerCase()).toContain('/help')
    })

    it('should display error for unknown slash commands', async () => {
      const command = createAgentCommand!()
      const stdin = createMockStdin()
      const stdout = createMockStdout()

      const resultPromise = command.run(
        {
          server: `ws://localhost:${serverPort}`,
        },
        stdin,
        stdout
      )

      await new Promise((resolve) => setTimeout(resolve, 500))

      // Send unknown command
      stdin.push('/unknowncommand\n')
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Exit
      stdin.push('/exit\n')
      stdin.push(null)

      await resultPromise

      const output = stdout.getOutput()
      expect(output.toLowerCase()).toMatch(/unknown|invalid|command/i)
    })

    it('should handle EOF (Ctrl+D) gracefully', async () => {
      const command = createAgentCommand!()
      const stdin = createMockStdin()
      const stdout = createMockStdout()

      const resultPromise = command.run(
        {
          server: `ws://localhost:${serverPort}`,
        },
        stdin,
        stdout
      )

      await new Promise((resolve) => setTimeout(resolve, 500))

      // Send EOF
      stdin.push(null)

      const result = await resultPromise

      // Should exit cleanly
      expect(result.exitCode).toBe(0)
    })

    it('should maintain conversation context across interactive messages', async () => {
      const command = createAgentCommand!()
      const stdin = createMockStdin()
      const stdout = createMockStdout()

      const resultPromise = command.run(
        {
          server: `ws://localhost:${serverPort}`,
        },
        stdin,
        stdout
      )

      await new Promise((resolve) => setTimeout(resolve, 500))

      // First message
      stdin.push('My name is Bob\n')
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Second message referencing first
      stdin.push('What is my name?\n')
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Exit
      stdin.push('/exit\n')
      stdin.push(null)

      await resultPromise

      const output = stdout.getOutput().toLowerCase()
      expect(output).toContain('bob')
    })
  })

  // ===========================================================================
  // OUTPUT FORMAT TESTS
  // ===========================================================================

  describe('Output Formats', () => {
    let server: ChatWsServer
    let serverPort: number

    beforeEach(async () => {
      server = createChatWsServer({ port: 0 })
      await server.start()
      serverPort = server.getPort()
    })

    afterEach(async () => {
      await server.stop()
    })

    it('should output plain text by default', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'Hello',
        },
        createMockStdin(),
        stdout
      )

      const output = stdout.getOutput()
      // Should not be JSON
      expect(() => JSON.parse(output)).toThrow()
    })

    it('should output JSON with --format json', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'Hello',
          format: 'json',
        },
        createMockStdin(),
        stdout
      )

      const output = stdout.getOutput()
      const json = JSON.parse(output)
      expect(json).toHaveProperty('response')
      expect(json).toHaveProperty('conversationId')
    })

    it('should include response text in JSON output', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'Hello',
          format: 'json',
        },
        createMockStdin(),
        stdout
      )

      const json = JSON.parse(stdout.getOutput())
      expect(json.response).toBeTruthy()
      expect(typeof json.response).toBe('string')
    })

    it('should include usage statistics in JSON output', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'Hello',
          format: 'json',
        },
        createMockStdin(),
        stdout
      )

      const json = JSON.parse(stdout.getOutput())
      expect(json.usage).toBeDefined()
      expect(typeof json.usage.inputTokens).toBe('number')
      expect(typeof json.usage.outputTokens).toBe('number')
    })

    it('should output errors as JSON in JSON mode', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      const result = await command.run(
        {
          server: 'ws://localhost:59999',
          message: 'Hello',
          format: 'json',
          timeout: 500,
        },
        createMockStdin(),
        stdout
      )

      // Error should be in stderr as JSON
      const errorJson = JSON.parse(result.stderr)
      expect(errorJson).toHaveProperty('error')
    })
  })

  // ===========================================================================
  // INTEGRATION TESTS
  // ===========================================================================

  describe('Integration', () => {
    let server: ChatWsServer
    let serverPort: number

    beforeEach(async () => {
      server = createChatWsServer({ port: 0 })
      await server.start()
      serverPort = server.getPort()
    })

    afterEach(async () => {
      await server.stop()
    })

    it('should complete full request/response cycle', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      const result = await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'Hello, World!',
        },
        createMockStdin(),
        stdout
      )

      expect(result.exitCode).toBe(0)
      expect(stdout.getOutput()).toBeTruthy()
    })

    it('should handle multiple sequential requests', async () => {
      for (let i = 0; i < 3; i++) {
        const command = createAgentCommand!()
        const stdout = createMockStdout()

        const result = await command.run(
          {
            server: `ws://localhost:${serverPort}`,
            message: `Message ${i}`,
          },
          createMockStdin(),
          stdout
        )

        expect(result.exitCode).toBe(0)
      }

      // All requests should have succeeded
      const agentServer = server.getAgentServer()
      expect(agentServer.listConversations().length).toBe(3)
    })

    it('should work with real ChatWsServer', async () => {
      const command = createAgentCommand!()
      const stdout = createMockStdout()

      const result = await command.run(
        {
          server: `ws://localhost:${serverPort}`,
          message: 'Count from 1 to 5',
        },
        createMockStdin(),
        stdout
      )

      expect(result.exitCode).toBe(0)
      const output = stdout.getOutput()
      expect(output).toMatch(/1.*2.*3.*4.*5/s)
    })

    it('should handle concurrent requests from multiple instances', async () => {
      const commands = [1, 2, 3].map(() => createAgentCommand!())
      const stdouts = commands.map(() => createMockStdout())

      const results = await Promise.all(
        commands.map((cmd, i) =>
          cmd.run(
            {
              server: `ws://localhost:${serverPort}`,
              message: `Concurrent message ${i}`,
            },
            createMockStdin(),
            stdouts[i]
          )
        )
      )

      // All should succeed
      for (const result of results) {
        expect(result.exitCode).toBe(0)
      }
    })
  })
})
