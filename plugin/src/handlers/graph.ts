/**
 * Graph Tool Handlers
 */

import { App, TFile, normalizePath } from 'obsidian'
import { McpToolDefinition } from '../protocol'

export const toolDefinitions: McpToolDefinition[] = [
  {
    name: 'graph_backlinks',
    description: 'Get all notes that link to a specific note',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Note path' },
      },
      required: ['path'],
    },
  },
  {
    name: 'graph_forward_links',
    description: 'Get all notes that a specific note links to',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Note path' },
      },
      required: ['path'],
    },
  },
  {
    name: 'graph_neighbors',
    description: 'Get connected notes within a depth (bidirectional)',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Note path' },
        depth: { type: 'number', description: 'Max depth (default: 1)' },
      },
      required: ['path'],
    },
  },
]

export async function handleBacklinks(
  app: App,
  args: Record<string, unknown>
): Promise<unknown> {
  const path = normalizePath(args.path as string)

  const file = app.vault.getAbstractFileByPath(path)
  if (!file || !(file instanceof TFile)) {
    throw new Error(`Note not found: ${path}`)
  }

  const backlinks: Array<{ path: string; count: number }> = []
  const resolvedLinks = app.metadataCache.resolvedLinks

  for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
    if (targets[file.path]) {
      backlinks.push({ path: sourcePath, count: targets[file.path] })
    }
  }

  // Sort by count descending
  backlinks.sort((a, b) => b.count - a.count)

  return { path: file.path, backlinks, total: backlinks.length }
}

export async function handleForwardLinks(
  app: App,
  args: Record<string, unknown>
): Promise<unknown> {
  const path = normalizePath(args.path as string)

  const file = app.vault.getAbstractFileByPath(path)
  if (!file || !(file instanceof TFile)) {
    throw new Error(`Note not found: ${path}`)
  }

  const cache = app.metadataCache.getFileCache(file)
  const forwardLinks: Array<{ path: string; resolved: boolean; displayText?: string }> = []

  if (cache?.links) {
    for (const link of cache.links) {
      const resolved = app.metadataCache.getFirstLinkpathDest(link.link, file.path)
      forwardLinks.push({
        path: resolved?.path || link.link,
        resolved: !!resolved,
        displayText: link.displayText,
      })
    }
  }

  return { path: file.path, forwardLinks, total: forwardLinks.length }
}

export async function handleNeighbors(
  app: App,
  args: Record<string, unknown>
): Promise<unknown> {
  const path = normalizePath(args.path as string)
  const maxDepth = (args.depth as number) || 1

  const file = app.vault.getAbstractFileByPath(path)
  if (!file || !(file instanceof TFile)) {
    throw new Error(`Note not found: ${path}`)
  }

  const resolvedLinks = app.metadataCache.resolvedLinks
  const visited = new Set<string>([file.path])
  const neighbors: Array<{ path: string; depth: number; direction: 'in' | 'out' | 'both' }> = []

  // BFS traversal
  let currentLevel = [file.path]

  for (let depth = 1; depth <= maxDepth; depth++) {
    const nextLevel: string[] = []

    for (const currentPath of currentLevel) {
      // Forward links (outgoing)
      const outgoing = resolvedLinks[currentPath] || {}
      for (const targetPath of Object.keys(outgoing)) {
        if (!visited.has(targetPath)) {
          visited.add(targetPath)
          nextLevel.push(targetPath)
          neighbors.push({ path: targetPath, depth, direction: 'out' })
        }
      }

      // Backlinks (incoming)
      for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
        if (targets[currentPath] && !visited.has(sourcePath)) {
          visited.add(sourcePath)
          nextLevel.push(sourcePath)
          neighbors.push({ path: sourcePath, depth, direction: 'in' })
        }
      }
    }

    currentLevel = nextLevel
  }

  return { path: file.path, neighbors, total: neighbors.length }
}
