/**
 * Tool Handler Registry
 */

import { App } from 'obsidian'
import { McpToolDefinition } from '../protocol'
import * as vault from './vault'
import * as note from './note'
import * as frontmatter from './frontmatter'
import * as graph from './graph'

// Handler function type
type ToolHandler = (app: App, args: Record<string, unknown>) => Promise<unknown>

// Registry of all handlers
const handlers: Record<string, ToolHandler> = {
  vault_search: vault.handleSearch,
  vault_list: vault.handleList,
  vault_context: vault.handleContext,
  note_read: note.handleRead,
  note_create: note.handleCreate,
  note_update: note.handleUpdate,
  note_append: note.handleAppend,
  frontmatter_update: frontmatter.handleUpdate,
  graph_backlinks: graph.handleBacklinks,
  graph_forward_links: graph.handleForwardLinks,
  graph_neighbors: graph.handleNeighbors,
}

// Get all tool definitions
export function getToolDefinitions(): McpToolDefinition[] {
  return [
    ...vault.toolDefinitions,
    ...note.toolDefinitions,
    ...frontmatter.toolDefinitions,
    ...graph.toolDefinitions,
  ]
}

// Handle a tool call
export async function handleToolCall(
  app: App,
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const handler = handlers[name]
  if (!handler) {
    throw new Error(`Unknown tool: ${name}`)
  }

  try {
    const result = await handler(app, args)
    return {
      content: [
        {
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    throw new Error(`Tool ${name} failed: ${message}`)
  }
}
