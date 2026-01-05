import type { ObsidianClient } from '../client/client.js'
import type { TFile, CachedMetadata } from '../types.js'

// Helper to escape special regex characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Helper to normalize tags (remove # prefix if present)
function normalizeTag(tag: string): string {
  return tag.startsWith('#') ? tag.slice(1) : tag
}

// Helper to extract title from content
function extractTitle(content: string): string {
  // Try to find first heading
  const headingMatch = content.match(/^#\s+(.+)$/m)
  if (headingMatch) {
    return headingMatch[1].trim()
  }
  // Fall back to first line
  const firstLine = content.split('\n')[0]
  return firstLine ? firstLine.slice(0, 50) : 'Untitled'
}

// Helper to create snippet around matched text
function createSnippet(content: string, query: string, maxLength = 150): string {
  const lowerContent = content.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const index = lowerContent.indexOf(lowerQuery)

  if (index === -1) {
    return content.slice(0, maxLength)
  }

  const start = Math.max(0, index - 50)
  const end = Math.min(content.length, index + query.length + 100)
  let snippet = content.slice(start, end)

  if (start > 0) snippet = '...' + snippet
  if (end < content.length) snippet = snippet + '...'

  return snippet
}

// Helper to get tags from file
function getFileTags(metadata: CachedMetadata | null): string[] {
  const tags: string[] = []
  if (metadata?.tags) {
    for (const tagCache of metadata.tags) {
      // Remove # prefix for consistency
      const tag = tagCache.tag.startsWith('#') ? tagCache.tag.slice(1) : tagCache.tag
      if (!tags.includes(tag)) {
        tags.push(tag)
      }
    }
  }
  return tags
}

// Helper to check if file has all specified tags
function hasAllTags(metadata: CachedMetadata | null, requiredTags: string[]): boolean {
  if (!metadata?.tags || requiredTags.length === 0) {
    return requiredTags.length === 0
  }

  const fileTags = metadata.tags.map(t => normalizeTag(t.tag).toLowerCase())

  return requiredTags.every(requiredTag => {
    const normalizedRequired = normalizeTag(requiredTag).toLowerCase()
    return fileTags.some(fileTag => fileTag === normalizedRequired)
  })
}

// Helper to serialize frontmatter to YAML
function serializeFrontmatter(frontmatter: Record<string, unknown>): string {
  const lines: string[] = []

  for (const [key, value] of Object.entries(frontmatter)) {
    lines.push(serializeYamlValue(key, value))
  }

  return lines.join('\n')
}

function serializeYamlValue(key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return `${key}: null`
  }

  if (typeof value === 'boolean' || typeof value === 'number') {
    return `${key}: ${value}`
  }

  if (typeof value === 'string') {
    // Check if string needs quoting
    if (value.includes(':') || value.includes('"') || value.includes('\n') || value.includes('#')) {
      const escaped = value.replace(/"/g, '\\"').replace(/\n/g, '\\n')
      return `${key}: "${escaped}"`
    }
    return `${key}: ${value}`
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${key}: []`
    }
    const allSimple = value.every(v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    if (allSimple) {
      const items = value.map(v => typeof v === 'string' ? v : String(v)).join(', ')
      return `${key}: [${items}]`
    }
    // Complex array
    const arrayLines = [`${key}:`]
    for (const item of value) {
      if (typeof item === 'object' && item !== null) {
        arrayLines.push(`  -`)
        for (const [k, v] of Object.entries(item)) {
          arrayLines.push(`    ${serializeYamlValue(k, v)}`)
        }
      } else {
        arrayLines.push(`  - ${item}`)
      }
    }
    return arrayLines.join('\n')
  }

  if (typeof value === 'object') {
    const objLines = [`${key}:`]
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      objLines.push(`  ${serializeYamlValue(k, v)}`)
    }
    return objLines.join('\n')
  }

  return `${key}: ${value}`
}

// Helper to check if path is safe (no path traversal)
function isPathSafe(filePath: string): boolean {
  // Reject empty paths
  if (!filePath) return false

  // Reject absolute paths
  if (filePath.startsWith('/') || /^[a-zA-Z]:/.test(filePath)) return false

  // Reject parent directory references
  const segments = filePath.split(/[/\\]/)
  if (segments.includes('..')) return false

  return true
}

// Helper to validate path
function validatePath(path: string): void {
  if (!path || path.trim() === '') {
    throw new Error('Path cannot be empty')
  }
  if (!isPathSafe(path)) {
    throw new Error('Path contains invalid traversal patterns')
  }
}

// Helper to validate path has .md extension
function validateMarkdownPath(path: string): void {
  validatePath(path)
  if (!path.endsWith('.md')) {
    throw new Error('Path must have .md extension')
  }
  // Check for invalid characters
  const invalidChars = /[<>:"|?*]/
  if (invalidChars.test(path)) {
    throw new Error('Path contains invalid characters')
  }
}

// Helper to parse time duration (e.g., "7d", "1d", "24h")
function parseTimeDuration(duration: string): number {
  const match = duration.match(/^(\d+)([dhm])$/)
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`)
  }

  const value = parseInt(match[1], 10)
  const unit = match[2]

  switch (unit) {
    case 'd': return value * 24 * 60 * 60 * 1000
    case 'h': return value * 60 * 60 * 1000
    case 'm': return value * 60 * 1000
    default: throw new Error(`Unknown time unit: ${unit}`)
  }
}

// Helper to get link context from file content
function getLinkContext(content: string, targetPath: string, metadata: CachedMetadata | null): string[] {
  const contexts: string[] = []
  const lines = content.split('\n')
  const targetName = targetPath.replace(/\.md$/, '').split('/').pop() || ''

  if (metadata?.links) {
    for (const link of metadata.links) {
      // Check if this link points to our target
      const linkName = link.link.split('#')[0] // Remove heading reference
      if (linkName.toLowerCase() === targetName.toLowerCase() ||
          link.link.toLowerCase().includes(targetName.toLowerCase())) {
        const line = lines[link.position.start.line] || ''
        if (line && !contexts.includes(line)) {
          contexts.push(line.trim())
        }
      }
    }
  }

  return contexts
}

export interface SearchMatch {
  path: string
  title: string
  snippet: string
  score: number
  tags: string[]
}

export interface SearchResult {
  matches: SearchMatch[]
}

export async function handleVaultSearch(client: ObsidianClient, args: { query: string; limit?: number; filter?: { tags?: string[] } }): Promise<SearchResult> {
  const { query, limit, filter } = args

  // Validate query
  if (!query || query.trim() === '') {
    throw new Error('Query cannot be empty')
  }

  const files = client.vault.getMarkdownFiles()
  const matches: SearchMatch[] = []
  // Use provided limit or default to 50
  const maxResults = limit ?? 50

  for (const file of files) {
    try {
      const content = await client.vault.read(file)
      const metadata = client.metadataCache.getCache(file.path)

      // Check tag filter
      if (filter?.tags && filter.tags.length > 0) {
        if (!hasAllTags(metadata, filter.tags)) {
          continue
        }
      }

      // Search content and file name (case-insensitive)
      const lowerQuery = query.toLowerCase()
      const lowerContent = content.toLowerCase()
      const lowerFileName = file.basename.toLowerCase()

      // Escape regex chars for safe pattern matching
      const escapedQuery = escapeRegex(lowerQuery)

      // Count occurrences for scoring
      const contentMatches = (lowerContent.match(new RegExp(escapedQuery, 'g')) || []).length
      const nameMatches = lowerFileName.includes(lowerQuery) ? 10 : 0 // Boost for filename match

      const totalMatches = contentMatches + nameMatches

      if (totalMatches > 0) {
        matches.push({
          path: file.path,
          title: extractTitle(content),
          snippet: createSnippet(content, query),
          score: totalMatches,
          tags: getFileTags(metadata),
        })
      }
    } catch {
      // Skip files that can't be read
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score)

  // Limit results
  return { matches: matches.slice(0, maxResults) }
}

export interface NoteReadResult {
  path: string
  content: string
  metadata: {
    frontmatter?: Record<string, unknown>
    headings?: Array<{ heading: string; level: number }>
    links?: Array<{ link: string; original: string }>
  }
  backlinks?: string[]
}

export async function handleNoteRead(client: ObsidianClient, args: { path: string; includeBacklinks?: boolean }): Promise<NoteReadResult> {
  const { path, includeBacklinks } = args

  validatePath(path)

  const file = client.vault.getFileByPath(path)
  if (!file) {
    throw new Error(`Note not found: ${path}`)
  }

  const content = await client.vault.read(file)
  const cache = client.metadataCache.getCache(path)

  const result: NoteReadResult = {
    path: file.path,
    content,
    metadata: {
      frontmatter: cache?.frontmatter as Record<string, unknown> | undefined,
      headings: cache?.headings?.map(h => ({ heading: h.heading, level: h.level })),
      links: cache?.links?.map(l => ({ link: l.link, original: l.original })),
    },
  }

  if (includeBacklinks) {
    result.backlinks = client.graph.getBacklinks(path)
  }

  return result
}

export interface NoteCreateResult {
  path: string
  success: boolean
  content: string
  file: {
    basename: string
    extension: string
  }
}

export async function handleNoteCreate(client: ObsidianClient, args: { path: string; content: string; frontmatter?: Record<string, unknown> }): Promise<NoteCreateResult> {
  const { path, content, frontmatter } = args

  validateMarkdownPath(path)

  if (!content || content.trim() === '') {
    throw new Error('Content cannot be empty')
  }

  // Check if file already exists
  const existingFile = client.vault.getFileByPath(path)
  if (existingFile) {
    throw new Error(`File already exists: ${path}`)
  }

  let finalContent = content

  // Handle frontmatter
  if (frontmatter && Object.keys(frontmatter).length > 0) {
    // Check if content already has frontmatter
    const hasFrontmatter = content.startsWith('---')

    if (hasFrontmatter) {
      // Parse existing frontmatter and merge
      const endIndex = content.indexOf('---', 3)
      if (endIndex !== -1) {
        const bodyContent = content.slice(endIndex + 3).replace(/^\n+/, '')
        const yamlContent = serializeFrontmatter(frontmatter)
        finalContent = `---\n${yamlContent}\n---\n\n${bodyContent}`
      }
    } else {
      // Add new frontmatter
      const yamlContent = serializeFrontmatter(frontmatter)
      finalContent = `---\n${yamlContent}\n---\n\n${content}`
    }
  }

  const file = await client.vault.create(path, finalContent)

  return {
    path: file.path,
    success: true,
    content: finalContent,
    file: {
      basename: file.basename,
      extension: file.extension,
    },
  }
}

export interface BacklinkInfo {
  path: string
  title?: string
  context?: string
  contexts?: string[]
  linkCount?: number
}

export interface BacklinksResult {
  backlinks: BacklinkInfo[]
  count: number
}

export async function handleGraphBacklinks(client: ObsidianClient, args: { path: string; includeContext?: boolean }): Promise<BacklinksResult> {
  const { path, includeContext } = args

  validatePath(path)

  const file = client.vault.getFileByPath(path)
  if (!file) {
    throw new Error(`Note not found: ${path}`)
  }

  const backlinkPaths = client.graph.getBacklinks(path)
  const backlinks: BacklinkInfo[] = []

  for (const blPath of backlinkPaths) {
    const blFile = client.vault.getFileByPath(blPath)
    let title: string | undefined
    let context: string | undefined
    let contexts: string[] | undefined
    let linkCount = 1

    // Get link count from resolved links
    const resolvedLinks = client.metadataCache.resolvedLinks[blPath]
    if (resolvedLinks && resolvedLinks[path]) {
      linkCount = resolvedLinks[path]
    }

    if (blFile) {
      try {
        const content = await client.vault.read(blFile)
        title = extractTitle(content)

        if (includeContext) {
          const metadata = client.metadataCache.getCache(blPath)
          const allContexts = getLinkContext(content, path, metadata)

          if (allContexts.length > 0) {
            context = allContexts[0]
            if (allContexts.length > 1) {
              contexts = allContexts
            }
          }
        }
      } catch {
        // Use path as fallback title
        title = blPath.split('/').pop()?.replace('.md', '')
      }
    }

    const backlinkInfo: BacklinkInfo = { path: blPath, title, linkCount }
    if (includeContext && context) {
      backlinkInfo.context = context
    }
    if (includeContext && contexts && contexts.length > 1) {
      backlinkInfo.contexts = contexts
    }

    backlinks.push(backlinkInfo)
  }

  return {
    backlinks,
    count: backlinks.length,
  }
}

export interface FileInfo {
  path: string
  metadata?: {
    frontmatter?: Record<string, unknown>
  }
}

export interface VaultContextResult {
  files: Array<FileInfo & { path: string }>
  folders?: string[]
  stats?: { totalNotes: number }
  graph?: { edges: Array<{ source: string; target: string }> }
}

// Helper to estimate tokens from text (rough approximation: ~4 chars per token)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// Helper to truncate files array to fit within token limit
function truncateFilesToTokenLimit(
  files: Array<FileInfo & { path: string }>,
  maxTokens: number
): Array<FileInfo & { path: string }> {
  let currentTokens = 0
  const result: Array<FileInfo & { path: string }> = []

  for (const file of files) {
    // Estimate tokens for this file entry (path + metadata structure)
    const fileTokens = estimateTokens(JSON.stringify(file))
    if (currentTokens + fileTokens > maxTokens) {
      break
    }
    currentTokens += fileTokens
    result.push(file)
  }

  return result
}

export async function handleVaultContext(client: ObsidianClient, args: { scope: string; maxTokens?: number }): Promise<VaultContextResult> {
  const { scope, maxTokens } = args

  if (!scope || scope.trim() === '' || scope !== scope.trim()) {
    throw new Error('Invalid scope')
  }

  const files = client.vault.getMarkdownFiles()

  // Parse scope
  if (scope === 'all') {
    const folders = new Set<string>()
    const fileInfos: Array<FileInfo & { path: string }> = []

    for (const file of files) {
      const metadata = client.metadataCache.getCache(file.path)
      fileInfos.push({
        path: file.path,
        metadata: {
          frontmatter: metadata?.frontmatter as Record<string, unknown> | undefined,
        },
      })

      // Extract folders
      const parts = file.path.split('/')
      for (let i = 1; i < parts.length; i++) {
        folders.add(parts.slice(0, i).join('/'))
      }
    }

    // Build graph edges
    const edges: Array<{ source: string; target: string }> = []
    const resolvedLinks = client.metadataCache.resolvedLinks
    for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
      for (const targetPath of Object.keys(targets)) {
        edges.push({ source: sourcePath, target: targetPath })
      }
    }

    // Apply token limit if specified
    const truncatedFiles = maxTokens ? truncateFilesToTokenLimit(fileInfos, maxTokens) : fileInfos

    return {
      files: truncatedFiles,
      folders: Array.from(folders).sort(),
      stats: { totalNotes: files.length },
      graph: { edges },
    }
  }

  if (scope.startsWith('folder:')) {
    const folderPath = scope.slice(7)
    const filteredFiles = files.filter(f => f.path.startsWith(folderPath + '/'))

    if (filteredFiles.length === 0 && !files.some(f => f.path.startsWith(folderPath))) {
      throw new Error(`Folder not found: ${folderPath}`)
    }

    const fileInfos = filteredFiles.map(f => ({
      path: f.path,
      metadata: {
        frontmatter: client.metadataCache.getCache(f.path)?.frontmatter as Record<string, unknown> | undefined,
      },
    }))

    // Apply token limit if specified
    const truncatedFiles = maxTokens ? truncateFilesToTokenLimit(fileInfos, maxTokens) : fileInfos

    return { files: truncatedFiles }
  }

  if (scope.startsWith('tag:')) {
    const tagName = scope.slice(4)
    const fileInfos: Array<FileInfo & { path: string }> = []

    for (const file of files) {
      const metadata = client.metadataCache.getCache(file.path)
      if (hasAllTags(metadata, [tagName])) {
        fileInfos.push({
          path: file.path,
          metadata: {
            frontmatter: metadata?.frontmatter as Record<string, unknown> | undefined,
          },
        })
      }
    }

    // Apply token limit if specified
    const truncatedFiles = maxTokens ? truncateFilesToTokenLimit(fileInfos, maxTokens) : fileInfos

    return { files: truncatedFiles }
  }

  if (scope.startsWith('recent:')) {
    const duration = scope.slice(7)
    const durationMs = parseTimeDuration(duration)
    const now = Date.now()

    const recentFiles = files
      .filter(f => now - f.stat.mtime < durationMs)
      .sort((a, b) => b.stat.mtime - a.stat.mtime)

    const fileInfos = recentFiles.map(f => ({
      path: f.path,
      metadata: {
        frontmatter: client.metadataCache.getCache(f.path)?.frontmatter as Record<string, unknown> | undefined,
      },
    }))

    // Apply token limit if specified
    const truncatedFiles = maxTokens ? truncateFilesToTokenLimit(fileInfos, maxTokens) : fileInfos

    return { files: truncatedFiles }
  }

  if (scope.startsWith('linked:')) {
    const notePath = scope.slice(7)
    const file = client.vault.getFileByPath(notePath)
    if (!file) {
      throw new Error(`Note not found: ${notePath}`)
    }

    const linkedPaths = new Set<string>()

    // Get outgoing links
    const resolvedLinks = client.metadataCache.resolvedLinks[notePath]
    if (resolvedLinks) {
      for (const targetPath of Object.keys(resolvedLinks)) {
        linkedPaths.add(targetPath)
      }
    }

    // Get backlinks
    const backlinks = client.graph.getBacklinks(notePath)
    for (const blPath of backlinks) {
      linkedPaths.add(blPath)
    }

    const fileInfos: Array<FileInfo & { path: string }> = []
    for (const linkedPath of linkedPaths) {
      const linkedFile = client.vault.getFileByPath(linkedPath)
      if (linkedFile) {
        fileInfos.push({
          path: linkedFile.path,
          metadata: {
            frontmatter: client.metadataCache.getCache(linkedPath)?.frontmatter as Record<string, unknown> | undefined,
          },
        })
      }
    }

    // Apply token limit if specified
    const truncatedFiles = maxTokens ? truncateFilesToTokenLimit(fileInfos, maxTokens) : fileInfos

    return { files: truncatedFiles }
  }

  throw new Error(`Invalid scope: ${scope}`)
}

export interface VaultListResult {
  files: Array<{
    path: string
    name: string
    basename: string
    stat: { mtime: number; size: number }
  }>
  total: number
}

export async function handleVaultList(client: ObsidianClient, args: { folder?: string; recursive?: boolean }): Promise<VaultListResult> {
  const { folder, recursive = true } = args

  let files = client.vault.getMarkdownFiles()

  if (folder) {
    // Check if folder exists by checking if any files are in it
    const folderFiles = files.filter(f => f.path.startsWith(folder + '/'))
    if (folderFiles.length === 0) {
      throw new Error(`Folder not found: ${folder}`)
    }

    if (recursive) {
      files = folderFiles
    } else {
      // Only include files directly in the folder
      files = folderFiles.filter(f => {
        const relativePath = f.path.slice(folder.length + 1)
        return !relativePath.includes('/')
      })
    }
  }

  // Sort alphabetically
  files.sort((a, b) => a.path.localeCompare(b.path))

  return {
    files: files.map(f => ({
      path: f.path,
      name: f.name,
      basename: f.basename,
      stat: { mtime: f.stat.mtime, size: f.stat.size },
    })),
    total: files.length,
  }
}

export interface NoteUpdateResult {
  path: string
  success: boolean
}

export async function handleNoteUpdate(client: ObsidianClient, args: { path: string; content: string }): Promise<NoteUpdateResult> {
  const { path, content } = args

  validatePath(path)

  if (!content || content.trim() === '') {
    throw new Error('Content cannot be empty')
  }

  const file = client.vault.getFileByPath(path)
  if (!file) {
    throw new Error(`Note not found: ${path}`)
  }

  // Update content using vault.create with same path (overwrites)
  // The mock client handles this through the create method
  await client.vault.create(path, content)

  return {
    path,
    success: true,
  }
}

export interface NoteAppendResult {
  path: string
  success: boolean
}

export async function handleNoteAppend(client: ObsidianClient, args: { path: string; content: string; position?: 'end' | 'after-frontmatter' }): Promise<NoteAppendResult> {
  const { path, content, position = 'end' } = args

  validatePath(path)

  if (!content) {
    throw new Error('Content cannot be empty')
  }

  if (position !== 'end' && position !== 'after-frontmatter') {
    throw new Error(`Invalid position: ${position}`)
  }

  const file = client.vault.getFileByPath(path)
  if (!file) {
    throw new Error(`Note not found: ${path}`)
  }

  const existingContent = await client.vault.read(file)
  let newContent: string

  if (position === 'after-frontmatter') {
    // Check if file has frontmatter
    if (existingContent.startsWith('---')) {
      const endIndex = existingContent.indexOf('---', 3)
      if (endIndex !== -1) {
        const frontmatter = existingContent.slice(0, endIndex + 3)
        const body = existingContent.slice(endIndex + 3)
        newContent = frontmatter + content + body
      } else {
        newContent = existingContent + content
      }
    } else {
      // No frontmatter, prepend to start
      newContent = content + existingContent
    }
  } else {
    // Append to end
    newContent = existingContent + content
  }

  await client.vault.create(path, newContent)

  return {
    path,
    success: true,
  }
}

export interface FrontmatterUpdateResult {
  path: string
  success: boolean
}

export async function handleFrontmatterUpdate(client: ObsidianClient, args: { path: string; frontmatter: Record<string, unknown>; merge?: boolean }): Promise<FrontmatterUpdateResult> {
  const { path, frontmatter, merge = true } = args

  validatePath(path)

  if (!frontmatter || Object.keys(frontmatter).length === 0) {
    throw new Error('Frontmatter cannot be empty')
  }

  const file = client.vault.getFileByPath(path)
  if (!file) {
    throw new Error(`Note not found: ${path}`)
  }

  const existingContent = await client.vault.read(file)
  const existingMetadata = client.metadataCache.getCache(path)

  // Determine final frontmatter
  let finalFrontmatter: Record<string, unknown>
  if (merge && existingMetadata?.frontmatter) {
    finalFrontmatter = { ...existingMetadata.frontmatter, ...frontmatter }
  } else {
    finalFrontmatter = frontmatter
  }

  // Extract body content
  let bodyContent = existingContent
  if (existingContent.startsWith('---')) {
    const endIndex = existingContent.indexOf('---', 3)
    if (endIndex !== -1) {
      bodyContent = existingContent.slice(endIndex + 3).replace(/^\n+/, '')
    }
  }

  // Build new content
  const yamlContent = serializeFrontmatter(finalFrontmatter)
  const newContent = `---\n${yamlContent}\n---\n\n${bodyContent}`

  await client.vault.create(path, newContent)

  return {
    path,
    success: true,
  }
}

export interface ForwardLinkInfo {
  path: string
  title?: string
  linkCount: number
}

export interface ForwardLinksResult {
  links: ForwardLinkInfo[]
  count: number
  unresolvedLinks?: string[]
}

export async function handleGraphForwardLinks(client: ObsidianClient, args: { path: string; includeUnresolved?: boolean }): Promise<ForwardLinksResult> {
  const { path, includeUnresolved } = args

  validatePath(path)

  const file = client.vault.getFileByPath(path)
  if (!file) {
    throw new Error(`Note not found: ${path}`)
  }

  const resolvedLinks = client.metadataCache.resolvedLinks[path] || {}
  const links: ForwardLinkInfo[] = []

  for (const [targetPath, count] of Object.entries(resolvedLinks)) {
    const targetFile = client.vault.getFileByPath(targetPath)
    let title: string | undefined

    if (targetFile) {
      try {
        const content = await client.vault.read(targetFile)
        title = extractTitle(content)
      } catch {
        title = targetPath.split('/').pop()?.replace('.md', '')
      }
    }

    links.push({
      path: targetPath,
      title,
      linkCount: count,
    })
  }

  const result: ForwardLinksResult = {
    links,
    count: links.length,
  }

  if (includeUnresolved) {
    const metadata = client.metadataCache.getCache(path)
    const unresolvedLinks: string[] = []

    if (metadata?.links) {
      for (const link of metadata.links) {
        const linkTarget = link.link.split('#')[0]
        // Check if this link is not in resolved links
        const isResolved = Object.keys(resolvedLinks).some(resolved =>
          resolved.includes(linkTarget) || linkTarget.includes(resolved.replace('.md', ''))
        )
        if (!isResolved && !unresolvedLinks.includes(linkTarget)) {
          unresolvedLinks.push(linkTarget)
        }
      }
    }

    if (unresolvedLinks.length > 0) {
      result.unresolvedLinks = unresolvedLinks
    }
  }

  return result
}

export interface NeighborInfo {
  path: string
  depth: number
  relationship: 'incoming' | 'outgoing' | 'both'
}

export interface NeighborsResult {
  neighbors: NeighborInfo[]
  count: number
}

export async function handleGraphNeighbors(client: ObsidianClient, args: { path: string; depth?: number; direction?: 'both' | 'incoming' | 'outgoing' }): Promise<NeighborsResult> {
  const { path, depth = 1, direction = 'both' } = args

  validatePath(path)

  if (depth !== undefined && (depth < 1 || depth < 0)) {
    throw new Error('Depth must be a positive number')
  }

  if (direction && !['both', 'incoming', 'outgoing'].includes(direction)) {
    throw new Error(`Invalid direction: ${direction}`)
  }

  const file = client.vault.getFileByPath(path)
  if (!file) {
    throw new Error(`Note not found: ${path}`)
  }

  // Limit max depth to prevent performance issues
  const effectiveDepth = Math.min(depth, 10)

  const visited = new Set<string>([path])
  const neighbors: NeighborInfo[] = []

  // BFS to find neighbors at each depth
  let currentLevel = [path]

  for (let d = 1; d <= effectiveDepth; d++) {
    const nextLevel: string[] = []

    for (const currentPath of currentLevel) {
      // Get outgoing links
      if (direction === 'both' || direction === 'outgoing') {
        const resolvedLinks = client.metadataCache.resolvedLinks[currentPath] || {}
        for (const targetPath of Object.keys(resolvedLinks)) {
          if (!visited.has(targetPath)) {
            visited.add(targetPath)
            nextLevel.push(targetPath)

            // Determine relationship
            let relationship: 'incoming' | 'outgoing' | 'both' = 'outgoing'
            if (direction === 'both') {
              const backlinks = client.graph.getBacklinks(path)
              if (backlinks.includes(targetPath)) {
                relationship = 'both'
              }
            }

            neighbors.push({
              path: targetPath,
              depth: d,
              relationship,
            })
          }
        }
      }

      // Get incoming links (backlinks)
      if (direction === 'both' || direction === 'incoming') {
        const backlinks = client.graph.getBacklinks(currentPath)
        for (const blPath of backlinks) {
          if (!visited.has(blPath)) {
            visited.add(blPath)
            nextLevel.push(blPath)

            // Determine relationship
            let relationship: 'incoming' | 'outgoing' | 'both' = 'incoming'
            if (direction === 'both') {
              const resolvedLinks = client.metadataCache.resolvedLinks[path] || {}
              if (Object.keys(resolvedLinks).includes(blPath)) {
                relationship = 'both'
              }
            }

            neighbors.push({
              path: blPath,
              depth: d,
              relationship,
            })
          }
        }
      }
    }

    currentLevel = nextLevel
  }

  return {
    neighbors,
    count: neighbors.length,
  }
}
