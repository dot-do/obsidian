/**
 * Note Tool Handlers
 */

import { App, TFile, normalizePath } from 'obsidian'
import { McpToolDefinition } from '../protocol'

export const toolDefinitions: McpToolDefinition[] = [
  {
    name: 'note_read',
    description: 'Read a note with content and metadata',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Note path (e.g., "folder/note.md")' },
        includeBacklinks: { type: 'boolean', description: 'Include backlinks' },
        includeMetadata: { type: 'boolean', description: 'Include parsed metadata' },
      },
      required: ['path'],
    },
  },
  {
    name: 'note_create',
    description: 'Create a new note',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Note path' },
        content: { type: 'string', description: 'Note content' },
        frontmatter: { type: 'object', description: 'YAML frontmatter' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'note_update',
    description: 'Update an existing note',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Note path' },
        content: { type: 'string', description: 'New content' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'note_append',
    description: 'Append content to an existing note',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Note path' },
        content: { type: 'string', description: 'Content to append' },
      },
      required: ['path', 'content'],
    },
  },
]

export async function handleRead(
  app: App,
  args: Record<string, unknown>
): Promise<unknown> {
  const path = normalizePath(args.path as string)
  const includeBacklinks = args.includeBacklinks !== false
  const includeMetadata = args.includeMetadata !== false

  const file = app.vault.getAbstractFileByPath(path)
  if (!file || !(file instanceof TFile)) {
    throw new Error(`Note not found: ${path}`)
  }

  const content = await app.vault.cachedRead(file)
  const result: Record<string, unknown> = {
    path: file.path,
    content,
    stat: {
      ctime: file.stat.ctime,
      mtime: file.stat.mtime,
      size: file.stat.size,
    },
  }

  if (includeMetadata) {
    const cache = app.metadataCache.getFileCache(file)
    if (cache) {
      result.metadata = {
        frontmatter: cache.frontmatter,
        headings: cache.headings?.map((h) => ({ heading: h.heading, level: h.level })),
        links: cache.links?.map((l) => {
          const resolved = app.metadataCache.getFirstLinkpathDest(l.link, file.path)
          return {
            link: l.link,
            displayText: l.displayText,
            resolved: !!resolved,
            target: resolved?.path,
          }
        }),
        tags: cache.tags?.map((t) => t.tag),
        embeds: cache.embeds?.map((e) => e.link),
      }
    }
  }

  if (includeBacklinks) {
    const backlinks: Array<{ path: string; count: number }> = []
    const resolvedLinks = app.metadataCache.resolvedLinks
    for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
      if (targets[file.path]) {
        backlinks.push({ path: sourcePath, count: targets[file.path] })
      }
    }
    result.backlinks = backlinks
  }

  // Check if active in workspace
  const activeFile = app.workspace.getActiveFile()
  result.activeInWorkspace = activeFile?.path === file.path

  return result
}

export async function handleCreate(
  app: App,
  args: Record<string, unknown>
): Promise<unknown> {
  const path = normalizePath(args.path as string)
  let content = args.content as string
  const frontmatter = args.frontmatter as Record<string, unknown> | undefined

  // Check if file already exists
  const existing = app.vault.getAbstractFileByPath(path)
  if (existing) {
    throw new Error(`Note already exists: ${path}`)
  }

  // Add frontmatter if provided
  if (frontmatter && Object.keys(frontmatter).length > 0) {
    const yaml = Object.entries(frontmatter)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join('\n')
    content = `---\n${yaml}\n---\n\n${content}`
  }

  // Ensure parent folder exists
  const folderPath = path.substring(0, path.lastIndexOf('/'))
  if (folderPath) {
    const folder = app.vault.getAbstractFileByPath(folderPath)
    if (!folder) {
      await app.vault.createFolder(folderPath)
    }
  }

  const file = await app.vault.create(path, content)

  return {
    path: file.path,
    created: true,
    stat: {
      ctime: file.stat.ctime,
      mtime: file.stat.mtime,
      size: file.stat.size,
    },
  }
}

export async function handleUpdate(
  app: App,
  args: Record<string, unknown>
): Promise<unknown> {
  const path = normalizePath(args.path as string)
  const content = args.content as string

  const file = app.vault.getAbstractFileByPath(path)
  if (!file || !(file instanceof TFile)) {
    throw new Error(`Note not found: ${path}`)
  }

  await app.vault.modify(file, content)

  return {
    path: file.path,
    updated: true,
    stat: {
      ctime: file.stat.ctime,
      mtime: file.stat.mtime,
      size: file.stat.size,
    },
  }
}

export async function handleAppend(
  app: App,
  args: Record<string, unknown>
): Promise<unknown> {
  const path = normalizePath(args.path as string)
  const appendContent = args.content as string

  const file = app.vault.getAbstractFileByPath(path)
  if (!file || !(file instanceof TFile)) {
    throw new Error(`Note not found: ${path}`)
  }

  await app.vault.process(file, (content) => content + '\n' + appendContent)

  return {
    path: file.path,
    appended: true,
    stat: {
      ctime: file.stat.ctime,
      mtime: file.stat.mtime,
      size: file.stat.size,
    },
  }
}
