import type { ObsidianClient } from '../client/client.js'
import { obsidianTools, validateToolArgs, type McpToolDefinition } from './tools.js'
import {
  handleVaultSearch,
  handleVaultList,
  handleNoteRead,
  handleNoteCreate,
  handleNoteUpdate,
  handleNoteAppend,
  handleFrontmatterUpdate,
  handleGraphBacklinks,
  handleGraphForwardLinks,
  handleGraphNeighbors,
  handleVaultContext,
} from './handlers.js'

/**
 * MCP (Model Context Protocol) Request interface.
 * Represents a JSON-RPC 2.0 request message.
 */
export interface McpRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params: unknown
}

/**
 * MCP Response interface.
 * Represents a JSON-RPC 2.0 response message.
 */
export interface McpResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string }
}

/**
 * ObsidianMcpServer interface.
 * Defines the contract for the MCP server that handles JSON-RPC requests.
 */
export interface ObsidianMcpServer {
  handleRequest(request: McpRequest): Promise<McpResponse | null>
}

interface McpContent {
  type: 'text'
  text: string
}

interface McpToolResult {
  content: McpContent[]
  isError?: boolean
}

// JSON-RPC error codes
const ERROR_CODES = {
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
}

const SERVER_VERSION = '1.0.0'
const PROTOCOL_VERSION = '2024-11-05'

/**
 * Returns the list of available MCP tools.
 * Uses comprehensive tool definitions from tools.ts that include:
 * - name: tool identifier
 * - description: what the tool does
 * - inputSchema: JSON Schema for arguments
 * - annotations: hints like readOnlyHint, destructiveHint, idempotentHint
 */
function getTools(): McpToolDefinition[] {
  return obsidianTools
}

/**
 * Wraps a handler result in the MCP tool result format.
 * Converts handler results to JSON text content.
 */
function wrapResult(result: unknown): McpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
  }
}

/**
 * Wraps an error in the MCP tool result format.
 */
function wrapError(error: unknown): McpToolResult {
  const message = error instanceof Error ? error.message : String(error)
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  }
}

export function createMcpServer(options: { client: ObsidianClient }): ObsidianMcpServer {
  const { client } = options
  let initialized = false

  async function handleInitialize(request: McpRequest): Promise<McpResponse> {
    initialized = true
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: {
          name: 'obsidian.do',
          version: SERVER_VERSION,
        },
        capabilities: {
          tools: {
            listChanged: true,
          },
        },
      },
    }
  }

  async function handleToolsList(request: McpRequest): Promise<McpResponse> {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        tools: getTools(),
      },
    }
  }

  async function handleToolsCall(request: McpRequest): Promise<McpResponse> {
    const params = request.params as { name: string; arguments?: unknown } | undefined

    if (!params || !params.name) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: ERROR_CODES.METHOD_NOT_FOUND,
          message: 'Tool name is required',
        },
      }
    }

    const { name, arguments: args } = params
    const tools = getTools()
    const tool = tools.find(t => t.name === name)

    if (!tool) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: ERROR_CODES.METHOD_NOT_FOUND,
          message: `Unknown tool: ${name}`,
        },
      }
    }

    // Validate arguments using the comprehensive validator from tools.ts
    const validation = validateToolArgs(name, args)
    if (!validation.valid) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: ERROR_CODES.INVALID_PARAMS,
          message: validation.error,
        },
      }
    }

    let result: McpToolResult

    try {
      switch (name) {
        case 'vault_search': {
          const searchResult = await handleVaultSearch(client, args as { query: string; filter?: { tags?: string[] } })
          result = wrapResult(searchResult)
          break
        }
        case 'vault_list': {
          const listResult = await handleVaultList(client, args as { folder?: string; recursive?: boolean })
          result = wrapResult(listResult)
          break
        }
        case 'note_read': {
          const readResult = await handleNoteRead(client, args as { path: string; includeBacklinks?: boolean })
          result = wrapResult(readResult)
          break
        }
        case 'note_create': {
          const createResult = await handleNoteCreate(client, args as { path: string; content: string; frontmatter?: Record<string, unknown> })
          result = wrapResult(createResult)
          break
        }
        case 'note_update': {
          const updateResult = await handleNoteUpdate(client, args as { path: string; content: string })
          result = wrapResult(updateResult)
          break
        }
        case 'note_append': {
          const appendResult = await handleNoteAppend(client, args as { path: string; content: string; position?: 'end' | 'after-frontmatter' })
          result = wrapResult(appendResult)
          break
        }
        case 'frontmatter_update': {
          const fmResult = await handleFrontmatterUpdate(client, args as { path: string; frontmatter: Record<string, unknown>; merge?: boolean })
          result = wrapResult(fmResult)
          break
        }
        case 'graph_backlinks': {
          const backlinksResult = await handleGraphBacklinks(client, args as { path: string; includeContext?: boolean })
          result = wrapResult(backlinksResult)
          break
        }
        case 'graph_forward_links': {
          const forwardResult = await handleGraphForwardLinks(client, args as { path: string; includeUnresolved?: boolean })
          result = wrapResult(forwardResult)
          break
        }
        case 'graph_neighbors': {
          const neighborsResult = await handleGraphNeighbors(client, args as { path: string; depth?: number; direction?: 'both' | 'incoming' | 'outgoing' })
          result = wrapResult(neighborsResult)
          break
        }
        case 'vault_context': {
          const contextResult = await handleVaultContext(client, args as { scope: string })
          result = wrapResult(contextResult)
          break
        }
        default:
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: ERROR_CODES.METHOD_NOT_FOUND,
              message: `Unknown tool: ${name}`,
            },
          }
      }
    } catch (error) {
      result = wrapError(error)
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      result,
    }
  }

  async function handlePing(request: McpRequest): Promise<McpResponse> {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {},
    }
  }

  async function handleNotificationsInitialized(request: McpRequest): Promise<McpResponse> {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {},
    }
  }

  return {
    async handleRequest(request: McpRequest): Promise<McpResponse | null> {
      // Check if this is a notification (no id) - don't send a response for notifications
      if (request.id === undefined || request.id === null) {
        // Handle notifications silently
        if (request.method === 'notifications/initialized') {
          initialized = true
        }
        return null
      }

      switch (request.method) {
        case 'initialize':
          return handleInitialize(request)
        case 'tools/list':
          return handleToolsList(request)
        case 'tools/call':
          return handleToolsCall(request)
        case 'ping':
          return handlePing(request)
        case 'notifications/initialized':
          return handleNotificationsInitialized(request)
        default:
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: ERROR_CODES.METHOD_NOT_FOUND,
              message: `Unknown method: ${request.method}`,
            },
          }
      }
    },
  }
}
