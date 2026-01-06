/**
 * Vault Tool Handlers
 */

import { App, TFile, TFolder } from 'obsidian'
import { McpToolDefinition } from '../protocol'

export const toolDefinitions: McpToolDefinition[] = [
  {
    name: 'vault_search',
    description: 'Search for notes in the vault by content or metadata',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Maximum results (default: 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'vault_list',
    description: 'List files and folders in the vault',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Folder path (default: root)' },
        recursive: { type: 'boolean', description: 'Include subfolders' },
      },
    },
  },
  {
    name: 'vault_context',
    description: 'Get vault context for AI prompts (summary, recent notes, stats)',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['summary', 'recent', 'related'],
          description: 'Context scope',
        },
        focus: { type: 'string', description: 'Focus note path for related scope' },
        maxTokens: { type: 'number', description: 'Approximate max tokens' },
      },
    },
  },
]

export async function handleSearch(
  app: App,
  args: Record<string, unknown>
): Promise<unknown> {
  const query = (args.query as string).toLowerCase()
  const limit = (args.limit as number) || 10
  const results: Array<{ path: string; score: number; excerpt: string }> = []

  const files = app.vault.getMarkdownFiles()

  for (const file of files) {
    const content = await app.vault.cachedRead(file)
    const lowerContent = content.toLowerCase()
    const index = lowerContent.indexOf(query)

    if (index !== -1) {
      // Extract excerpt around match
      const start = Math.max(0, index - 50)
      const end = Math.min(content.length, index + query.length + 50)
      const excerpt = (start > 0 ? '...' : '') + content.slice(start, end) + (end < content.length ? '...' : '')

      results.push({
        path: file.path,
        score: 1, // Simple scoring
        excerpt: excerpt.replace(/\n/g, ' '),
      })

      if (results.length >= limit) break
    }
  }

  return { results, total: results.length }
}

export async function handleList(
  app: App,
  args: Record<string, unknown>
): Promise<unknown> {
  const path = (args.path as string) || ''
  const recursive = args.recursive as boolean

  const files: Array<{ path: string; type: 'file' | 'folder'; size?: number; mtime?: number }> = []

  if (recursive || !path) {
    // List all files
    for (const file of app.vault.getMarkdownFiles()) {
      if (!path || file.path.startsWith(path)) {
        files.push({
          path: file.path,
          type: 'file',
          size: file.stat.size,
          mtime: file.stat.mtime,
        })
      }
    }
  } else {
    // List immediate children of path
    const folder = app.vault.getAbstractFileByPath(path)
    if (folder instanceof TFolder) {
      for (const child of folder.children) {
        if (child instanceof TFile) {
          files.push({
            path: child.path,
            type: 'file',
            size: child.stat.size,
            mtime: child.stat.mtime,
          })
        } else if (child instanceof TFolder) {
          files.push({
            path: child.path,
            type: 'folder',
          })
        }
      }
    }
  }

  return { files, total: files.length }
}

export async function handleContext(
  app: App,
  args: Record<string, unknown>
): Promise<unknown> {
  const scope = (args.scope as string) || 'summary'
  const files = app.vault.getMarkdownFiles()

  // Sort by mtime descending
  const sorted = [...files].sort((a, b) => b.stat.mtime - a.stat.mtime)
  const recent = sorted.slice(0, 10)

  // Collect tags
  const tagCounts: Record<string, number> = {}
  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file)
    if (cache?.tags) {
      for (const t of cache.tags) {
        tagCounts[t.tag] = (tagCounts[t.tag] || 0) + 1
      }
    }
  }

  const tagCloud = Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)

  // Graph stats
  const resolvedLinks = app.metadataCache.resolvedLinks
  let totalEdges = 0
  for (const targets of Object.values(resolvedLinks)) {
    totalEdges += Object.keys(targets).length
  }

  return {
    summary: `Vault contains ${files.length} notes`,
    recentNotes: recent.map((f) => ({
      path: f.path,
      mtime: f.stat.mtime,
    })),
    tagCloud,
    graphStats: {
      totalNodes: files.length,
      totalEdges,
    },
  }
}
