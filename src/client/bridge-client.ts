/**
 * Bridge Client - WebSocket client for connecting to Obsidian Bridge plugin
 *
 * Provides the same interface as ObsidianClient but uses the Bridge plugin
 * for live Obsidian data instead of filesystem access.
 */

import WebSocket from 'ws'

const BRIDGE_PORT = 22360
const BRIDGE_HOST = 'localhost'
const CONNECTION_TIMEOUT = 500 // ms

interface McpRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

interface McpResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string }
}

/**
 * Check if the Bridge plugin is available
 */
export async function isBridgeAvailable(port = BRIDGE_PORT): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://${BRIDGE_HOST}:${port}`)
    const timeout = setTimeout(() => {
      ws.terminate()
      resolve(false)
    }, CONNECTION_TIMEOUT)

    ws.on('open', () => {
      clearTimeout(timeout)
      ws.close()
      resolve(true)
    })

    ws.on('error', () => {
      clearTimeout(timeout)
      resolve(false)
    })
  })
}

/**
 * BridgeClient - WebSocket client for Obsidian Bridge plugin
 */
export class BridgeClient {
  private ws: WebSocket | null = null
  private requestId = 0
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }>()
  private connected = false

  constructor(private port = BRIDGE_PORT) {}

  /**
   * Connect to the Bridge plugin
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'))
      }, CONNECTION_TIMEOUT * 2)

      this.ws = new WebSocket(`ws://${BRIDGE_HOST}:${this.port}`)

      this.ws.on('open', async () => {
        clearTimeout(timeout)
        this.connected = true

        // Send initialize request
        try {
          await this.request('initialize', {
            protocolVersion: '2024-11-05',
            clientInfo: { name: 'obsidian-cli', version: '0.1.0' }
          })
          // Send initialized notification
          this.notify('initialized', {})
          resolve()
        } catch (err) {
          reject(err)
        }
      })

      this.ws.on('message', (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString()) as McpResponse
          if (response.id !== undefined) {
            const pending = this.pendingRequests.get(response.id)
            if (pending) {
              this.pendingRequests.delete(response.id)
              if (response.error) {
                pending.reject(new Error(response.error.message))
              } else {
                pending.resolve(response.result)
              }
            }
          }
        } catch {
          // Ignore parse errors for notifications
        }
      })

      this.ws.on('error', (err: Error) => {
        clearTimeout(timeout)
        reject(err)
      })

      this.ws.on('close', () => {
        this.connected = false
        // Reject all pending requests
        for (const [, pending] of this.pendingRequests) {
          pending.reject(new Error('Connection closed'))
        }
        this.pendingRequests.clear()
      })
    })
  }

  /**
   * Disconnect from the Bridge plugin
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.connected = false
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected
  }

  /**
   * Send a request and wait for response
   */
  private async request(method: string, params?: unknown): Promise<unknown> {
    if (!this.ws || !this.connected) {
      throw new Error('Not connected to Bridge')
    }

    const id = ++this.requestId
    const request: McpRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params
    }

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      this.ws!.send(JSON.stringify(request))

      // Timeout for individual requests
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error('Request timeout'))
        }
      }, 30000)
    })
  }

  /**
   * Send a notification (no response expected)
   */
  private notify(method: string, params?: unknown): void {
    if (!this.ws || !this.connected) return
    this.ws.send(JSON.stringify({ jsonrpc: '2.0', method, params }))
  }

  /**
   * Call a tool on the Bridge
   */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const result = await this.request('tools/call', { name, arguments: args })
    // Extract content from MCP tool result format
    const toolResult = result as { content?: Array<{ type: string; text: string }> }
    if (toolResult.content?.[0]?.text) {
      try {
        return JSON.parse(toolResult.content[0].text)
      } catch {
        return toolResult.content[0].text
      }
    }
    return result
  }

  // High-level API methods that mirror ObsidianClient

  /**
   * Search notes in the vault
   */
  async search(query: string, options?: { limit?: number }): Promise<Array<{ path: string; score: number; excerpt: string }>> {
    const result = await this.callTool('vault_search', { query, ...options }) as { results: Array<{ path: string; score: number; excerpt: string }> }
    return result.results || []
  }

  /**
   * List files in the vault
   */
  async list(path?: string, recursive = true): Promise<Array<{ path: string; type: string }>> {
    const result = await this.callTool('vault_list', { path, recursive }) as { files: Array<{ path: string; type: string }> }
    return result.files || []
  }

  /**
   * Read a note
   */
  async readNote(path: string, options?: { includeBacklinks?: boolean; includeMetadata?: boolean }): Promise<{
    path: string
    content: string
    metadata?: Record<string, unknown>
    backlinks?: Array<{ path: string; count: number }>
  }> {
    return await this.callTool('note_read', { path, ...options }) as {
      path: string
      content: string
      metadata?: Record<string, unknown>
      backlinks?: Array<{ path: string; count: number }>
    }
  }

  /**
   * Create a note
   */
  async createNote(path: string, content: string, frontmatter?: Record<string, unknown>): Promise<{ path: string; created: boolean }> {
    return await this.callTool('note_create', { path, content, frontmatter }) as { path: string; created: boolean }
  }

  /**
   * Update a note
   */
  async updateNote(path: string, content: string): Promise<{ path: string; updated: boolean }> {
    return await this.callTool('note_update', { path, content }) as { path: string; updated: boolean }
  }

  /**
   * Get backlinks for a note
   */
  async getBacklinks(path: string): Promise<Array<{ path: string; count: number }>> {
    const result = await this.callTool('graph_backlinks', { path }) as { backlinks: Array<{ path: string; count: number }> }
    return result.backlinks || []
  }

  /**
   * Get vault context
   */
  async getContext(options?: { scope?: string }): Promise<{
    summary: string
    recentNotes: Array<{ path: string; mtime: number }>
    tagCloud: Array<{ tag: string; count: number }>
  }> {
    return await this.callTool('vault_context', options || {}) as {
      summary: string
      recentNotes: Array<{ path: string; mtime: number }>
      tagCloud: Array<{ tag: string; count: number }>
    }
  }
}

/**
 * Create a BridgeClient and connect, or return null if unavailable
 */
export async function createBridgeClient(port = BRIDGE_PORT): Promise<BridgeClient | null> {
  const available = await isBridgeAvailable(port)
  if (!available) return null

  const client = new BridgeClient(port)
  try {
    await client.connect()
    return client
  } catch {
    return null
  }
}
