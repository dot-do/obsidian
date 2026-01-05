/**
 * Context generator for obsidian-hhi
 *
 * Generates structured context from vault content optimized for LLM consumption.
 */

import type { TFile, CachedMetadata } from '../types.js'
import type { ObsidianClient } from './client.js'

/**
 * Options for context generation
 */
export interface ContextOptions {
  /** The scope of context to generate */
  scope: 'summary' | 'recent' | 'related'
  /** Path for related context (required when scope is 'related') */
  focus?: string
  /** Maximum tokens to include in output */
  maxTokens?: number
}

/**
 * Note interface for context generation
 */
export interface Note {
  file: TFile
  content: string
  metadata: CachedMetadata | null
}

/**
 * Vault context result
 */
export interface VaultContext {
  /** Summary of the vault */
  summary: string
  /** Recently modified notes */
  recentNotes: Note[]
  /** Notes related to focus path */
  relatedNotes: Note[]
  /** Tag cloud with counts */
  tagCloud: { tag: string; count: number }[]
  /** Graph statistics */
  graphStats: GraphStats
}

/**
 * Graph statistics for context
 */
export interface GraphStats {
  /** Total number of notes in the vault */
  totalNotes: number
  /** Total number of links between notes */
  totalLinks: number
  /** Number of orphan notes (no links) */
  orphanCount: number
  /** Average number of links per note */
  averageLinks: number
}

/**
 * Get graph statistics from the client
 */
export function getGraphStats(client: ObsidianClient): GraphStats {
  const stats = client.graph.getStats()
  return {
    totalNotes: stats.totalNodes,
    totalLinks: stats.totalEdges,
    orphanCount: stats.orphanCount,
    averageLinks: stats.averageDegree,
  }
}

/**
 * Get tag cloud with counts from the vault
 */
export function getTagCloud(client: ObsidianClient): { tag: string; count: number }[] {
  const tagCounts: Record<string, number> = {}
  const files = client.vault.getMarkdownFiles()

  for (const file of files) {
    const metadata = client.metadataCache.getFileCache(file)
    const tags = getFileTags(file, metadata)

    for (const tag of tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1
    }
  }

  // Convert to array and sort by count descending
  return Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Get tags from a file (both frontmatter and inline)
 */
function getFileTags(file: TFile, metadata: CachedMetadata | null): string[] {
  const tags: string[] = []

  // Get frontmatter tags
  if (metadata?.frontmatter?.tags) {
    const fmTags = metadata.frontmatter.tags
    if (Array.isArray(fmTags)) {
      tags.push(...fmTags.map(t => String(t)))
    } else if (typeof fmTags === 'string') {
      tags.push(fmTags)
    }
  }

  // Get inline tags
  if (metadata?.tags) {
    for (const tagCache of metadata.tags) {
      const tag = tagCache.tag.startsWith('#') ? tagCache.tag.slice(1) : tagCache.tag
      if (!tags.includes(tag)) {
        tags.push(tag)
      }
    }
  }

  return tags
}

/**
 * Get recently modified notes
 */
export async function getRecentNotes(client: ObsidianClient, limit: number = 10): Promise<Note[]> {
  const files = client.vault.getMarkdownFiles()
    .sort((a, b) => b.stat.mtime - a.stat.mtime)
    .slice(0, limit)

  const notes: Note[] = []
  for (const file of files) {
    const content = await client.vault.read(file)
    const metadata = client.metadataCache.getFileCache(file)
    notes.push({ file, content, metadata })
  }

  return notes
}

/**
 * Get notes related to a focus path using graph neighbors
 */
export async function getRelatedNotes(client: ObsidianClient, focusPath: string): Promise<Note[]> {
  const neighbors = client.graph.getNeighbors(focusPath, 1)
  const notes: Note[] = []

  for (const file of neighbors) {
    const actualFile = client.vault.getFileByPath(file.path)
    if (actualFile) {
      const content = await client.vault.read(actualFile)
      const metadata = client.metadataCache.getFileCache(actualFile)
      notes.push({ file: actualFile, content, metadata })
    }
  }

  return notes
}

/**
 * Generate vault summary
 */
function generateVaultSummary(client: ObsidianClient, stats: GraphStats): string {
  const tagCloud = getTagCloud(client)
  const topTags = tagCloud.slice(0, 5).map(t => t.tag).join(', ')

  let summary = `Vault contains ${stats.totalNotes} notes with ${stats.totalLinks} links.`

  if (stats.orphanCount > 0) {
    summary += ` ${stats.orphanCount} notes are orphaned (no links).`
  }

  if (topTags) {
    summary += ` Top tags: ${topTags}.`
  }

  return summary
}

/**
 * Truncate context to fit within token limit
 * Approximate: 1 token ~= 4 characters
 */
export function truncateContext(context: VaultContext, maxTokens: number): VaultContext {
  const maxChars = maxTokens * 4
  let currentChars = estimateContextSize(context)

  if (currentChars <= maxChars) {
    return context
  }

  // Clone context to avoid mutating original
  const truncated: VaultContext = {
    summary: context.summary,
    recentNotes: [...context.recentNotes],
    relatedNotes: [...context.relatedNotes],
    tagCloud: [...context.tagCloud],
    graphStats: { ...context.graphStats },
  }

  // Truncate recent notes content first
  while (estimateContextSize(truncated) > maxChars && truncated.recentNotes.length > 0) {
    const lastNote = truncated.recentNotes[truncated.recentNotes.length - 1]
    if (lastNote.content.length > 200) {
      // Truncate content
      truncated.recentNotes[truncated.recentNotes.length - 1] = {
        ...lastNote,
        content: lastNote.content.slice(0, 200) + '... (truncated)',
      }
    } else {
      // Remove note entirely
      truncated.recentNotes.pop()
    }
  }

  // Truncate related notes content
  while (estimateContextSize(truncated) > maxChars && truncated.relatedNotes.length > 0) {
    const lastNote = truncated.relatedNotes[truncated.relatedNotes.length - 1]
    if (lastNote.content.length > 200) {
      truncated.relatedNotes[truncated.relatedNotes.length - 1] = {
        ...lastNote,
        content: lastNote.content.slice(0, 200) + '... (truncated)',
      }
    } else {
      truncated.relatedNotes.pop()
    }
  }

  // Truncate tag cloud
  while (estimateContextSize(truncated) > maxChars && truncated.tagCloud.length > 5) {
    truncated.tagCloud.pop()
  }

  // Truncate summary if still over
  if (estimateContextSize(truncated) > maxChars && truncated.summary.length > 100) {
    truncated.summary = truncated.summary.slice(0, 100) + '... (truncated)'
  }

  return truncated
}

/**
 * Estimate the size of context in characters
 */
function estimateContextSize(context: VaultContext): number {
  let size = context.summary.length

  for (const note of context.recentNotes) {
    size += note.file.path.length + note.content.length + 50 // overhead for structure
  }

  for (const note of context.relatedNotes) {
    size += note.file.path.length + note.content.length + 50
  }

  for (const tag of context.tagCloud) {
    size += tag.tag.length + 10 // count overhead
  }

  size += 100 // graphStats overhead

  return size
}

/**
 * Generate context based on options
 */
export async function generateContext(
  client: ObsidianClient,
  options: ContextOptions
): Promise<VaultContext> {
  const graphStats = getGraphStats(client)

  // Initialize context with defaults
  let context: VaultContext = {
    summary: '',
    recentNotes: [],
    relatedNotes: [],
    tagCloud: [],
    graphStats,
  }

  switch (options.scope) {
    case 'summary':
      context.summary = generateVaultSummary(client, graphStats)
      context.tagCloud = getTagCloud(client)
      break

    case 'recent':
      context.recentNotes = await getRecentNotes(client, 10)
      break

    case 'related':
      if (options.focus) {
        context.relatedNotes = await getRelatedNotes(client, options.focus)
      }
      break
  }

  // Apply token limit if specified
  if (options.maxTokens) {
    context = truncateContext(context, options.maxTokens)
  }

  return context
}
