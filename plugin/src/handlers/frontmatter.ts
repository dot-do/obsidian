/**
 * Frontmatter Tool Handlers
 */

import { App, TFile, normalizePath } from 'obsidian'
import { McpToolDefinition } from '../protocol'

export const toolDefinitions: McpToolDefinition[] = [
  {
    name: 'frontmatter_update',
    description: 'Update YAML frontmatter properties',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Note path' },
        properties: { type: 'object', description: 'Properties to set/update' },
        remove: {
          type: 'array',
          description: 'Property keys to remove',
        },
      },
      required: ['path'],
    },
  },
]

export async function handleUpdate(
  app: App,
  args: Record<string, unknown>
): Promise<unknown> {
  const path = normalizePath(args.path as string)
  const properties = (args.properties as Record<string, unknown>) || {}
  const remove = (args.remove as string[]) || []

  const file = app.vault.getAbstractFileByPath(path)
  if (!file || !(file instanceof TFile)) {
    throw new Error(`Note not found: ${path}`)
  }

  // Use Obsidian's processFrontMatter for atomic updates
  await app.fileManager.processFrontMatter(file, (fm) => {
    // Remove specified keys
    for (const key of remove) {
      delete fm[key]
    }
    // Set/update properties
    for (const [key, value] of Object.entries(properties)) {
      fm[key] = value
    }
  })

  // Get updated frontmatter
  const cache = app.metadataCache.getFileCache(file)

  return {
    path: file.path,
    updated: true,
    frontmatter: cache?.frontmatter || {},
  }
}
