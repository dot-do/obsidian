/**
 * MCP Command - Start an MCP server on stdio
 *
 * This command starts an MCP (Model Context Protocol) server that
 * reads JSON-RPC requests from stdin and writes responses to stdout.
 */

import * as readline from 'readline'
import { ObsidianClient } from '../client/client.js'
import { createMcpServer, type McpRequest } from '../mcp/server.js'
import { FileSystemBackend } from '../vault/fs-backend.js'

export interface McpCommandOptions {
  vaultPath: string
}

/**
 * Run the MCP server on stdio
 *
 * @param options - Command options including vault path
 */
export async function runMcpCommand(options: McpCommandOptions): Promise<void> {
  const { vaultPath } = options

  // Set up readline IMMEDIATELY to buffer incoming messages during initialization
  const rl = readline.createInterface({
    input: process.stdin,
    output: undefined, // Don't use stdout for readline prompts
    terminal: false,
  })

  // Buffer to hold messages during initialization
  const pendingLines: string[] = []
  let initialized = false
  let client: ObsidianClient
  let server: ReturnType<typeof createMcpServer>

  // Queue incoming lines until initialization is complete
  const lineHandler = (line: string) => {
    const trimmedLine = line.trim()
    if (!trimmedLine) return
    pendingLines.push(trimmedLine)
    processNextLine()
  }

  let processing = false
  const processNextLine = async () => {
    if (!initialized || processing || pendingLines.length === 0) return
    processing = true

    const trimmedLine = pendingLines.shift()!
    try {
      const request = JSON.parse(trimmedLine) as McpRequest

      // Handle the request
      const response = await server.handleRequest(request)

      // Only write response for requests with id (not notifications)
      // In JSON-RPC 2.0, notifications don't have an id and don't expect responses
      if (request.id !== undefined) {
        process.stdout.write(JSON.stringify(response) + '\n')
      }
    } catch (err) {
      // Parse error - send JSON-RPC error response
      const errorResponse = {
        jsonrpc: '2.0' as const,
        id: null,
        error: {
          code: -32700,
          message: 'Parse error',
        },
      }
      process.stdout.write(JSON.stringify(errorResponse) + '\n')
    }

    processing = false
    // Process next pending line if any
    processNextLine()
  }

  rl.on('line', lineHandler)

  // Now do async initialization
  const backend = new FileSystemBackend(vaultPath)

  // Scan and preload files into the backend's internal cache
  const files = await backend.scanDirectory('')
  const fileContents = new Map<string, string | ArrayBuffer>()

  for (const filePath of files) {
    if (filePath.endsWith('.md')) {
      try {
        const content = await backend.read(filePath)
        fileContents.set(filePath, content)
      } catch {
        // Skip unreadable files
      }
    }
  }

  // Create a backend wrapper that exposes the files map for Vault's sync scan
  const backendWithFiles = Object.assign(backend, {
    files: fileContents,
  })

  client = new ObsidianClient({
    backend: backendWithFiles,
    vaultPath,
  })

  // Initialize the client
  await client.initialize()

  // Create MCP server
  server = createMcpServer({ client })

  // Mark as initialized and process any pending lines
  initialized = true
  processNextLine()

  // Return a promise that resolves when stdin closes
  return new Promise<void>((resolve, reject) => {
    // Handle stdin close
    rl.on('close', () => {
      client.dispose()
      resolve()
    })

    // Handle errors
    rl.on('error', (err) => {
      client.dispose()
      reject(err)
    })
  })
}
