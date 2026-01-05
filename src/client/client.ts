import type { Backend, TFile, CachedMetadata, EventRef, EventCallback } from '../types.js'
import { Vault } from '../vault/vault.js'
import { MetadataCache } from '../metadata/cache.js'
import { Graph } from '../graph/graph.js'
import { GraphEngine } from '../graph/engine.js'
import { SearchEngine } from '../search/engine.js'
import { MemoryBackend } from '../vault/memory-backend.js'
import { FileSystemBackend } from '../vault/fs-backend.js'
import { RestApiBackend } from '../vault/rest-backend.js'

// Re-export shared types from types.ts
export type {
  Note,
  NoteResult,
  ContextOptions,
  VaultContext,
  GenerateContextOptions,
  QueryContextOptions,
} from './types.js'

// Import types for internal use
import type {
  NoteResult,
  ContextOptions,
  VaultContext,
  GenerateContextOptions,
  QueryContextOptions,
} from './types.js'

// Type alias for backend types
export type VaultBackend = Backend

/**
 * Client options for creating an ObsidianClient.
 * Supports multiple backend configurations.
 */
export interface ClientOptions {
  /** Path to the vault on disk (used with filesystem backend) */
  vaultPath?: string
  /** Backend type to use */
  backend?: 'filesystem' | 'memory' | 'rest'
  /** Initial files for memory backend */
  initialFiles?: Record<string, string>
  /** REST API URL (used with rest backend) */
  restApiUrl?: string
  /** REST API key (used with rest backend) */
  restApiKey?: string
}

/**
 * Legacy options interface that accepts a pre-created backend.
 * Maintained for backward compatibility.
 */
export interface ObsidianClientOptions {
  backend: Backend
  vaultPath?: string
}

export interface SearchResultItem {
  file: TFile
  score: number
  matches?: Array<[number, number]>
}

export interface ClientSearch {
  searchContent(query: string): Promise<SearchResultItem[]>
  searchFiles(query: string): Promise<SearchResultItem[]>
}

export interface VaultStats {
  totalNotes: number
  totalLinks: number
  totalTags: number
  totalSize: number
}

export class ObsidianClient {
  public vault!: Vault
  public metadataCache!: MetadataCache
  public graph!: Graph
  public search!: ClientSearch
  public vaultPath?: string

  private backend!: VaultBackend
  private options: ClientOptions | ObsidianClientOptions
  private initialized = false
  private disposed = false
  private eventListeners = new Map<string, Set<EventCallback<unknown>>>()
  private eventRefs: EventRef[] = []
  private contentCache = new Map<string, string>()

  /**
   * Creates an ObsidianClient.
   *
   * @param options - Either ClientOptions (new API with backend type) or ObsidianClientOptions (legacy API with backend instance)
   *
   * New API usage:
   * ```typescript
   * const client = new ObsidianClient({ backend: 'memory', initialFiles: { 'note.md': '# Note' } })
   * const client = new ObsidianClient({ backend: 'filesystem', vaultPath: '/path/to/vault' })
   * const client = new ObsidianClient({ backend: 'rest', restApiUrl: 'http://localhost:3000', restApiKey: 'key' })
   * ```
   *
   * Legacy API usage:
   * ```typescript
   * const client = new ObsidianClient({ backend: new MemoryBackend() })
   * ```
   */
  constructor(options: ClientOptions | ObsidianClientOptions) {
    this.options = options

    // Determine if using legacy API (backend is an object instance) or new API (backend is a string type)
    const isLegacyOptions = this.isLegacyOptions(options)

    if (isLegacyOptions) {
      // Legacy API: backend is already provided
      const legacyOpts = options as ObsidianClientOptions
      if (!legacyOpts.backend) {
        throw new Error('Backend is required')
      }
      this.backend = legacyOpts.backend
      this.vaultPath = legacyOpts.vaultPath?.replace(/\/$/, '')
    } else {
      // New API: create backend from options
      const clientOpts = options as ClientOptions
      this.backend = this.createBackend(clientOpts)
      this.vaultPath = clientOpts.vaultPath?.replace(/\/$/, '')
    }

    // Initialize components
    this.vault = new Vault(this.backend)
    this.metadataCache = new MetadataCache(this.vault)
    this.graph = new Graph(this.metadataCache)

    // Create search adapter
    const searchEngine = new SearchEngine(this.vault, this.metadataCache)
    this.search = {
      searchContent: async (query: string): Promise<SearchResultItem[]> => {
        const results = await searchEngine.search(query)
        return results.map(r => ({
          file: r.file,
          score: r.score,
          matches: r.matches.flatMap(m => m.positions.map(p => [p, query.length] as [number, number]))
        }))
      },
      searchFiles: async (query: string): Promise<SearchResultItem[]> => {
        const files = this.vault.getMarkdownFiles()
        const results: SearchResultItem[] = []

        for (const file of files) {
          const queryLower = query.toLowerCase()
          const fileNameLower = file.name.toLowerCase()
          const basenameLower = file.basename.toLowerCase()

          if (fileNameLower.includes(queryLower) || basenameLower.includes(queryLower)) {
            const score = basenameLower === queryLower ? 100 :
                          basenameLower.startsWith(queryLower) ? 80 : 50
            results.push({ file, score })
          }
        }

        return results.sort((a, b) => b.score - a.score)
      }
    }

    // Set up event forwarding from vault
    this.setupEventForwarding()
  }

  /**
   * Check if options are legacy format (with backend instance)
   */
  private isLegacyOptions(options: ClientOptions | ObsidianClientOptions): options is ObsidianClientOptions {
    const backend = (options as ObsidianClientOptions).backend
    // Legacy options have backend as an object instance (not a string type)
    return backend !== undefined && typeof backend === 'object' && backend !== null
  }

  /**
   * Create a backend based on the options.
   * Supports filesystem, memory, and REST API backends.
   */
  private createBackend(options: ClientOptions): VaultBackend {
    // If no backend type specified, require vaultPath for filesystem or error
    if (!options.backend) {
      if (options.vaultPath) {
        return new FileSystemBackend(options.vaultPath)
      }
      // No backend type and no vaultPath - error
      throw new Error('Backend is required')
    }

    switch (options.backend) {
      case 'memory':
        return new MemoryBackend(options.initialFiles)
      case 'rest':
        if (!options.restApiUrl) {
          throw new Error('restApiUrl is required for REST backend')
        }
        if (!options.restApiKey) {
          throw new Error('restApiKey is required for REST backend')
        }
        return new RestApiBackend(options.restApiUrl, options.restApiKey)
      case 'filesystem':
        if (!options.vaultPath) {
          throw new Error('vaultPath is required for filesystem backend')
        }
        return new FileSystemBackend(options.vaultPath)
      default:
        throw new Error(`Unknown backend type: ${options.backend}`)
    }
  }

  private setupEventForwarding(): void {
    // Forward vault events
    const vaultEvents = ['create', 'modify', 'delete', 'rename']
    for (const eventName of vaultEvents) {
      const ref = this.vault.on(eventName, (data: unknown) => {
        if (!this.disposed && typeof this.trigger === 'function') {
          this.trigger(eventName, data)
        }
      })
      this.eventRefs.push(ref)
    }

    // Forward metadata cache events
    const cacheRef = this.metadataCache.on('changed', (data: unknown) => {
      if (!this.disposed && typeof this.trigger === 'function') {
        this.trigger('changed', data)
      }
    })
    this.eventRefs.push(cacheRef)
  }

  // Alias for metadataCache
  get cache(): MetadataCache {
    return this.metadataCache
  }

  /**
   * Initializes the client by loading all files and building caches.
   * Must be called before using most other methods.
   * @returns A promise that resolves when initialization is complete.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    // Initialize the backend if it has an initialize method (e.g., FileSystemBackend)
    // This scans for existing files and populates the files map
    const backendWithInit = this.backend as { initialize?: () => Promise<void> }
    if (typeof backendWithInit.initialize === 'function') {
      await backendWithInit.initialize()
    }

    // Initialize the metadata cache (which also initializes vault file list)
    await this.metadataCache.initialize()

    // Populate content cache for sync operations
    const files = this.vault.getMarkdownFiles()
    for (const file of files) {
      try {
        const content = await this.vault.read(file)
        this.contentCache.set(file.path, content)
      } catch {
        // Ignore errors during initialization
      }
    }

    this.initialized = true
  }

  // Legacy init alias for backwards compatibility
  async init(): Promise<void> {
    return this.initialize()
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Client not initialized. Call initialize() first.')
    }
  }

  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error('Client has been disposed')
    }
  }

  /**
   * Retrieves a note with its content, metadata, and backlinks.
   * @param path - The vault-relative path to the markdown file.
   * @returns A promise resolving to the note's file, content, metadata, and backlinks.
   * @throws Error if file not found or not a markdown file.
   */
  async getNote(path: string): Promise<NoteResult> {
    this.ensureInitialized()
    this.ensureNotDisposed()

    const file = this.vault.getFileByPath(path)
    if (!file) {
      throw new Error(`File not found: ${path}`)
    }

    if (file.extension !== 'md') {
      throw new Error(`Not a markdown file: ${path}`)
    }

    const content = await this.vault.read(file)
    const metadata = this.metadataCache.getFileCache(file)

    // Get backlinks
    const backlinkPaths = this.graph.getBacklinks(path)
    const backlinks: TFile[] = []
    for (const blPath of backlinkPaths) {
      const blFile = this.vault.getFileByPath(blPath)
      if (blFile) {
        backlinks.push(blFile)
      }
    }

    return {
      file,
      content,
      metadata,
      backlinks
    }
  }

  /**
   * Creates a new note with optional frontmatter.
   * @param path - The vault-relative path for the new file.
   * @param content - The markdown content of the note.
   * @param frontmatter - Optional key-value pairs to include as YAML frontmatter.
   * @returns A promise resolving to the created TFile.
   * @throws Error if file already exists.
   */
  async createNote(path: string, content: string, frontmatter?: Record<string, unknown>): Promise<TFile> {
    this.ensureInitialized()
    this.ensureNotDisposed()

    // Normalize path
    const normalizedPath = path.replace(/\/+/g, '/')

    // Check if file exists
    if (this.vault.getFileByPath(normalizedPath)) {
      throw new Error(`File already exists: ${normalizedPath}`)
    }

    // Build content with frontmatter
    let finalContent = content
    if (frontmatter && Object.keys(frontmatter).length > 0) {
      const yamlContent = this.serializeYaml(frontmatter)
      finalContent = `---\n${yamlContent}---\n\n${content}`
    }

    // Create the file (vault.create will trigger the 'create' event which we forward)
    const file = await this.vault.create(normalizedPath, finalContent)

    // Index the new file (will be auto-indexed by metadataCache listening to vault events)
    // but we do it explicitly to ensure it's indexed before returning
    await this.metadataCache.indexFile(file)

    // Re-resolve links from files that have unresolved links pointing to this new file
    await this.resolveLinksToNewFile(file)

    return file
  }

  // Re-resolve links from files that have unresolved links that might now resolve to a newly created file
  private async resolveLinksToNewFile(newFile: TFile): Promise<void> {
    const unresolvedLinks = this.metadataCache.unresolvedLinks
    const basename = newFile.basename.toLowerCase()
    const filesToReindex: TFile[] = []

    for (const [sourcePath, links] of Object.entries(unresolvedLinks)) {
      for (const link of Object.keys(links)) {
        // Normalize link for comparison (like we do in getFirstLinkpathDest)
        const normalizedLink = link.toLowerCase().replace(/[\s_-]+/g, '')
        const normalizedBasename = basename.replace(/[\s_-]+/g, '')

        // Check if this unresolved link might match the new file
        if (normalizedLink === normalizedBasename ||
            normalizedLink === newFile.path.replace(/\.md$/, '').toLowerCase() ||
            normalizedLink === newFile.name.toLowerCase()) {
          const sourceFile = this.vault.getFileByPath(sourcePath)
          if (sourceFile && !filesToReindex.some(f => f.path === sourcePath)) {
            filesToReindex.push(sourceFile)
          }
        }
      }
    }

    // Re-index files that had unresolved links
    for (const file of filesToReindex) {
      await this.metadataCache.indexFile(file)
    }
  }

  private serializeYaml(obj: Record<string, unknown>): string {
    const lines: string[] = []

    for (const [key, value] of Object.entries(obj)) {
      lines.push(this.serializeYamlValue(key, value, 0))
    }

    return lines.join('\n') + '\n'
  }

  private serializeYamlValue(key: string, value: unknown, indent: number): string {
    const prefix = '  '.repeat(indent)

    if (value === null || value === undefined) {
      return `${prefix}${key}: null`
    }

    if (value instanceof Date) {
      return `${prefix}${key}: ${value.toISOString()}`
    }

    if (typeof value === 'boolean' || typeof value === 'number') {
      return `${prefix}${key}: ${value}`
    }

    if (typeof value === 'string') {
      // Check if string needs quoting
      if (value.includes(':') || value.includes('"') || value.includes('\n') || value.includes('#')) {
        // Use quoted string
        const escaped = value.replace(/"/g, '\\"').replace(/\n/g, '\\n')
        return `${prefix}${key}: "${escaped}"`
      }
      return `${prefix}${key}: ${value}`
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return `${prefix}${key}: []`
      }
      // Check if array contains simple values
      const allSimple = value.every(v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
      if (allSimple) {
        const items = value.map(v => typeof v === 'string' ? v : String(v)).join(', ')
        return `${prefix}${key}: [${items}]`
      }
      // Complex array
      const arrayLines = [`${prefix}${key}:`]
      for (const item of value) {
        if (typeof item === 'object' && item !== null) {
          arrayLines.push(`${prefix}  -`)
          for (const [k, v] of Object.entries(item)) {
            arrayLines.push(this.serializeYamlValue(k, v, indent + 2))
          }
        } else {
          arrayLines.push(`${prefix}  - ${item}`)
        }
      }
      return arrayLines.join('\n')
    }

    if (typeof value === 'object') {
      const objLines = [`${prefix}${key}:`]
      for (const [k, v] of Object.entries(value)) {
        objLines.push(this.serializeYamlValue(k, v, indent + 1))
      }
      return objLines.join('\n')
    }

    return `${prefix}${key}: ${value}`
  }

  /**
   * Updates the content of an existing note.
   * @param path - The vault-relative path to the file.
   * @param content - The new markdown content.
   * @returns A promise that resolves when the update is complete.
   * @throws Error if file not found.
   */
  async updateNote(path: string, content: string): Promise<void> {
    this.ensureInitialized()
    this.ensureNotDisposed()

    const file = this.vault.getFileByPath(path)
    if (!file) {
      throw new Error(`File not found: ${path}`)
    }

    // vault.modify will trigger the 'modify' event which we forward
    await this.vault.modify(file, content)

    // Re-index the file (will be auto-indexed by metadataCache listening to vault events)
    // but we do it explicitly to ensure it's indexed before returning
    await this.metadataCache.indexFile(file)
  }

  /**
   * Updates just the frontmatter of a note, preserving the body content.
   * @param path - The vault-relative path to the file.
   * @param frontmatter - Key-value pairs to merge into existing frontmatter. Set a value to undefined to remove it.
   * @returns A promise that resolves when the update is complete.
   * @throws Error if file not found.
   */
  async updateFrontmatter(path: string, frontmatter: Record<string, unknown>): Promise<void> {
    this.ensureInitialized()
    this.ensureNotDisposed()

    const file = this.vault.getFileByPath(path)
    if (!file) {
      throw new Error(`File not found: ${path}`)
    }

    const content = await this.vault.read(file)
    const existingMetadata = this.metadataCache.getFileCache(file)

    // Parse existing frontmatter
    const existingFrontmatter = existingMetadata?.frontmatter || {}

    // Merge frontmatter
    const mergedFrontmatter: Record<string, unknown> = { ...existingFrontmatter }
    for (const [key, value] of Object.entries(frontmatter)) {
      if (value === undefined) {
        delete mergedFrontmatter[key]
      } else {
        mergedFrontmatter[key] = value
      }
    }

    // Extract body content (after frontmatter)
    let bodyContent = content
    if (existingMetadata?.frontmatterPosition) {
      const endOffset = existingMetadata.frontmatterPosition.end.offset
      bodyContent = content.substring(endOffset).replace(/^[\r\n]+/, '')
    }

    // Build new content
    let newContent: string
    if (Object.keys(mergedFrontmatter).length > 0) {
      const yamlContent = this.serializeYaml(mergedFrontmatter)
      newContent = `---\n${yamlContent}---\n\n${bodyContent}`
    } else {
      newContent = bodyContent
    }

    await this.vault.modify(file, newContent)

    // Re-index the file
    await this.metadataCache.indexFile(file)
  }

  /**
   * Gets file context including metadata and neighboring files (linked and backlinked).
   * @param file - The TFile to get context for.
   * @returns An object containing the file, its cached metadata, and neighboring files.
   */
  getFileContext(file: TFile): { file: TFile; metadata: CachedMetadata | null; neighbors: TFile[] } {
    this.ensureInitialized()

    // Synchronously index this file if needed
    // This uses the internal cache check which should be already populated by ensureAllFilesIndexed
    const metadata = this.metadataCache.getFileCache(file)

    // Get outgoing links
    const outlinks = this.graph.getOutlinks(file.path)
    // Get backlinks
    const backlinks = this.graph.getBacklinks(file.path)

    // Combine and dedupe, excluding self
    const neighborPaths = new Set<string>()
    for (const path of [...outlinks, ...backlinks]) {
      if (path !== file.path) {
        neighborPaths.add(path)
      }
    }

    const neighbors: TFile[] = []
    for (const path of neighborPaths) {
      const neighborFile = this.vault.getFileByPath(path)
      if (neighborFile) {
        neighbors.push(neighborFile)
      }
    }

    return { file, metadata, neighbors }
  }

  // Async version of getFileContext that ensures indexing is complete
  async getFileContextAsync(file: TFile): Promise<{ file: TFile; metadata: CachedMetadata | null; neighbors: TFile[] }> {
    this.ensureInitialized()
    await this.ensureAllFilesIndexed()
    return this.getFileContext(file)
  }

  // Ensure all files in the vault are indexed in the metadata cache
  // Public so tests can call this after writing files directly to backend
  async ensureAllFilesIndexed(): Promise<void> {
    const files = this.vault.getMarkdownFiles()
    for (const file of files) {
      if (!this.metadataCache.getFileCache(file)) {
        await this.metadataCache.indexFile(file)
      }
    }
  }

  // Force re-index all files, including those already cached
  // This is needed to properly resolve links when target files are created after source files
  async reindex(): Promise<void> {
    const files = this.vault.getMarkdownFiles()
    for (const file of files) {
      await this.metadataCache.indexFile(file)
    }
  }

  /**
   * Generates a rich context string for a note, including metadata, content, links, and backlinks.
   * @param pathOrFile - The path or TFile to generate context for.
   * @param options - Optional settings for depth (linked note traversal) and maxTokens (truncation).
   * @returns A promise resolving to a formatted context string.
   * @throws Error if file not found.
   */
  async generateContext(pathOrFile: string | TFile, options?: GenerateContextOptions): Promise<string> {
    this.ensureInitialized()

    // Ensure all files are indexed for proper link resolution
    await this.ensureAllFilesIndexed()

    const depth = options?.depth ?? 0  // Default depth is 0
    const maxTokens = options?.maxTokens

    // Handle both string path and TFile
    let file: TFile | null
    let path: string

    if (typeof pathOrFile === 'string') {
      path = pathOrFile
      file = this.vault.getFileByPath(path)
      if (!file) {
        throw new Error(`File not found: ${path}`)
      }
    } else {
      file = pathOrFile
      path = file.path
      // Verify file exists
      const existingFile = this.vault.getFileByPath(path)
      if (!existingFile) {
        throw new Error(`File not found: ${path}`)
      }
    }

    const visitedPaths = new Set<string>()
    let context = await this.generateNoteContext(file, visitedPaths, depth, maxTokens)

    // Handle maxTokens truncation
    if (maxTokens && context.length > maxTokens * 4) {
      context = this.truncateContext(context, maxTokens)
    }

    return context
  }

  private async generateNoteContext(
    file: TFile,
    visitedPaths: Set<string>,
    remainingDepth: number,
    maxTokens?: number
  ): Promise<string> {
    if (visitedPaths.has(file.path)) {
      return ''
    }
    visitedPaths.add(file.path)

    const content = await this.vault.cachedRead(file)
    const metadata = this.metadataCache.getFileCache(file)

    const sections: string[] = []

    // Add source file path
    sections.push(`## Source: ${file.path}`)
    sections.push('')

    // Add frontmatter if present
    if (metadata?.frontmatter) {
      sections.push('### Metadata')
      sections.push('---')
      for (const [key, value] of Object.entries(metadata.frontmatter)) {
        if (Array.isArray(value)) {
          sections.push(`${key}: [${value.join(', ')}]`)
        } else {
          sections.push(`${key}: ${value}`)
        }
      }
      sections.push('---')
      sections.push('')
    }

    // Add content
    sections.push('### Content')
    sections.push(content)
    sections.push('')

    // Get outgoing links
    const outlinks = this.graph.getOutlinks(file.path)
    if (outlinks.length > 0) {
      sections.push('### Links')
      for (const link of outlinks) {
        const linkFile = this.vault.getFileByPath(link)
        sections.push(`- ${linkFile ? link : `${link} (unresolved)`}`)
      }
      sections.push('')
    }

    // Get backlinks
    const backlinks = this.graph.getBacklinks(file.path)
    if (backlinks.length > 0) {
      sections.push('### Backlinks')
      for (const backlink of backlinks) {
        sections.push(`- ${backlink}`)
      }
      sections.push('')
    }

    let context = sections.join('\n')

    // Include linked notes if depth > 0
    if (remainingDepth > 0) {
      const linkedPaths = [...new Set([...outlinks, ...backlinks])]

      for (const linkedPath of linkedPaths) {
        if (visitedPaths.has(linkedPath)) {
          continue
        }

        const linkedFile = this.vault.getFileByPath(linkedPath)
        if (linkedFile) {
          const linkedContext = await this.generateNoteContext(
            linkedFile,
            visitedPaths,
            remainingDepth - 1,
            maxTokens
          )
          if (linkedContext) {
            context += '\n---\n\n' + linkedContext
          }
        }
      }
    }

    return context
  }

  private truncateContext(context: string, maxTokens: number): string {
    // Approximate: 1 token ~= 4 characters
    const maxChars = maxTokens * 4
    if (context.length <= maxChars) {
      return context
    }

    // Find a good breakpoint
    let truncateIndex = maxChars
    const lastNewline = context.lastIndexOf('\n', truncateIndex)
    if (lastNewline > maxChars * 0.8) {
      truncateIndex = lastNewline
    }

    return context.substring(0, truncateIndex) + '\n\n... (truncated)'
  }

  /**
   * Generates context for notes matching a search query.
   * @param query - The search query string.
   * @param options - Optional settings for maxNotes and maxTokens.
   * @returns A promise resolving to a formatted context string of matching notes.
   */
  async generateContextForQuery(query: string, options?: QueryContextOptions): Promise<string> {
    this.ensureInitialized()

    // Ensure all files are indexed for proper search
    await this.ensureAllFilesIndexed()

    const maxNotes = options?.maxNotes ?? 10
    const maxTokens = options?.maxTokens

    // Search for matching files
    const searchEngine = new SearchEngine(this.vault, this.metadataCache)
    const results = await searchEngine.search(query, { limit: maxNotes })

    if (results.length === 0) {
      return `No notes found matching: ${query}`
    }

    const sections: string[] = []
    sections.push(`# Context for query: "${query}"`)
    sections.push('')

    for (const result of results) {
      const content = await this.vault.cachedRead(result.file)
      const metadata = this.metadataCache.getFileCache(result.file)

      sections.push(`## ${result.file.path}`)
      sections.push('')

      // Add metadata if present
      if (metadata?.frontmatter) {
        sections.push('---')
        for (const [key, value] of Object.entries(metadata.frontmatter)) {
          if (Array.isArray(value)) {
            sections.push(`${key}: [${value.join(', ')}]`)
          } else {
            sections.push(`${key}: ${value}`)
          }
        }
        sections.push('---')
        sections.push('')
      }

      sections.push(content)
      sections.push('')
    }

    let context = sections.join('\n')

    // Handle maxTokens truncation
    if (maxTokens && context.length > maxTokens * 4) {
      context = this.truncateContext(context, maxTokens)
    }

    return context
  }

  /**
   * Generates context for notes with a specific tag.
   * @param tag - The tag to search for (with or without # prefix).
   * @returns A promise resolving to a formatted context string of tagged notes.
   */
  async generateContextForTag(tag: string): Promise<string> {
    return this.generateContextForTags([tag], false)
  }

  /**
   * Generates context for notes with specified tags.
   * @param tags - Array of tags to search for (with or without # prefix).
   * @param requireAll - If true, notes must have all tags; if false, any matching tag suffices.
   * @returns A promise resolving to a formatted context string of matching notes.
   */
  async generateContextForTags(tags: string[], requireAll = true): Promise<string> {
    this.ensureInitialized()

    // Ensure all files are indexed for proper tag search
    await this.ensureAllFilesIndexed()

    const searchEngine = new SearchEngine(this.vault, this.metadataCache)
    const matchingFiles = tags.length === 1
      ? searchEngine.findByTag(tags[0])
      : this.findByMultipleTags(tags, requireAll)

    if (matchingFiles.length === 0) {
      return `No notes found with tags: ${tags.join(', ')}`
    }

    const sections: string[] = []
    sections.push(`# Context for tags: ${tags.join(', ')}`)
    sections.push('')

    for (const file of matchingFiles) {
      const content = await this.vault.cachedRead(file)
      const metadata = this.metadataCache.getFileCache(file)

      sections.push(`## ${file.path}`)
      sections.push('')

      // Add metadata if present
      if (metadata?.frontmatter) {
        sections.push('---')
        for (const [key, value] of Object.entries(metadata.frontmatter)) {
          if (Array.isArray(value)) {
            sections.push(`${key}: [${value.join(', ')}]`)
          } else {
            sections.push(`${key}: ${value}`)
          }
        }
        sections.push('---')
        sections.push('')
      }

      sections.push(content)
      sections.push('')
    }

    return sections.join('\n')
  }

  private findByMultipleTags(tags: string[], requireAll: boolean): TFile[] {
    const files = this.vault.getMarkdownFiles()
    const matchingFiles: TFile[] = []

    // Normalize tags
    const normalizedTags = tags.map(t => t.startsWith('#') ? t.slice(1).toLowerCase() : t.toLowerCase())

    for (const file of files) {
      const metadata = this.metadataCache.getFileCache(file)
      const fileTags = this.getFileTags(file, metadata)

      const matches = requireAll
        ? normalizedTags.every(tag => fileTags.some(ft => ft.toLowerCase() === tag))
        : normalizedTags.some(tag => fileTags.some(ft => ft.toLowerCase() === tag))

      if (matches) {
        matchingFiles.push(file)
      }
    }

    return matchingFiles
  }

  private getFileTags(_file: TFile, metadata: CachedMetadata | null): string[] {
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
        tags.push(tag)
      }
    }

    return tags
  }

  async getVaultContext(options: ContextOptions): Promise<VaultContext> {
    return this.getContext(options)
  }

  async getContext(options: ContextOptions): Promise<VaultContext> {
    this.ensureInitialized()

    const context: VaultContext = {}

    if (options.scope === 'summary') {
      context.summary = await this.generateVaultSummary()
      context.tagCloud = this.getTagCloud()
      context.graphStats = this.graph.getStats()
    }

    if (options.scope === 'recent') {
      context.recentNotes = this.getRecentNotes()
    }

    if (options.scope === 'related' && options.focus) {
      context.relatedNotes = this.getRelatedNotes(options.focus)
    }

    return context
  }

  private async generateVaultSummary(): Promise<string> {
    const files = this.vault.getMarkdownFiles()
    const stats = this.graph.getStats()

    return `Vault contains ${files.length} notes with ${stats.totalEdges} links.`
  }

  private getTagCloud(): Record<string, number> {
    const tagCounts: Record<string, number> = {}
    const files = this.vault.getMarkdownFiles()

    for (const file of files) {
      const metadata = this.metadataCache.getFileCache(file)
      const fileTags = this.getFileTags(file, metadata)

      for (const tag of fileTags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1
      }
    }

    return tagCounts
  }

  private getRecentNotes(): TFile[] {
    const files = this.vault.getMarkdownFiles()
    return files.sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, 10)
  }

  private getRelatedNotes(focus: string): TFile[] {
    const neighbors = this.graph.getNeighbors(focus)
    return neighbors
  }

  /**
   * Subscribes to an event emitted by the client.
   * @param event - The event name (e.g., 'create', 'modify', 'delete', 'rename', 'changed').
   * @param callback - The function to call when the event is emitted.
   * @returns An EventRef that can be used to unsubscribe.
   */
  on<T>(event: string, callback: EventCallback<T>): EventRef {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(callback as EventCallback<unknown>)

    return {
      unsubscribe: () => {
        this.eventListeners.get(event)?.delete(callback as EventCallback<unknown>)
      }
    }
  }

  off(event: string, ref: EventRef): void {
    ref.unsubscribe()
  }

  trigger(event: string, data?: unknown): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      for (const callback of listeners) {
        callback(data)
      }
    }
  }

  // Path utilities
  getAbsolutePath(relativePath: string): string {
    if (!this.vaultPath) {
      return relativePath
    }
    return `${this.vaultPath}/${relativePath}`
  }

  getRelativePath(absolutePath: string): string {
    if (!this.vaultPath || !absolutePath.startsWith(this.vaultPath)) {
      return absolutePath
    }
    return absolutePath.substring(this.vaultPath.length + 1)
  }

  /**
   * Creates multiple notes in a batch operation.
   * @param items - Array of objects with path, content, and optional frontmatter.
   * @returns A promise resolving to an array of created TFiles.
   */
  async batchCreate(
    items: Array<{ path: string; content: string; frontmatter?: Record<string, unknown> }>
  ): Promise<TFile[]> {
    this.ensureInitialized()
    this.ensureNotDisposed()

    const files: TFile[] = []
    for (const item of items) {
      const file = await this.createNote(item.path, item.content, item.frontmatter)
      files.push(file)
    }
    return files
  }

  /**
   * Updates multiple notes in a batch operation.
   * @param items - Array of objects with path and content.
   * @returns A promise that resolves when all updates are complete.
   */
  async batchUpdate(items: Array<{ path: string; content: string }>): Promise<void> {
    this.ensureInitialized()
    this.ensureNotDisposed()

    for (const item of items) {
      await this.updateNote(item.path, item.content)
    }
  }

  /**
   * Gets aggregate statistics about the vault.
   * @returns An object with totalNotes, totalLinks, totalTags, and totalSize.
   */
  getVaultStats(): VaultStats {
    this.ensureInitialized()

    const files = this.vault.getMarkdownFiles()
    let totalLinks = 0
    let totalTags = 0
    let totalSize = 0

    for (const file of files) {
      totalSize += file.stat.size
      const metadata = this.metadataCache.getFileCache(file)
      if (metadata) {
        totalLinks += (metadata.links?.length || 0)
        totalTags += (metadata.tags?.length || 0)
      }
    }

    return {
      totalNotes: files.length,
      totalLinks,
      totalTags,
      totalSize
    }
  }

  /**
   * Disposes of the client, cleaning up event listeners and resources.
   * After calling dispose(), the client should not be used.
   */
  dispose(): void {
    if (this.disposed) {
      return
    }

    // Clean up event listeners
    this.eventListeners.clear()

    // Unsubscribe from forwarded events
    for (const ref of this.eventRefs) {
      ref.unsubscribe()
    }
    this.eventRefs = []

    this.disposed = true
  }
}

/**
 * Parse frontmatter from markdown content.
 * Returns the frontmatter object or null if no frontmatter exists.
 */
export function parseFrontmatter(content: string): Record<string, unknown> | null {
  if (!content.startsWith('---')) return null

  const endMatch = content.slice(3).match(/\n---(\n|$)/)
  if (!endMatch) return null

  const yamlContent = content.slice(4, 3 + endMatch.index!)

  try {
    return parseYamlSimple(yamlContent)
  } catch {
    return null
  }
}

/**
 * Get the content of a markdown file without the frontmatter.
 */
export function getContentWithoutFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content

  const endMatch = content.slice(3).match(/\n---(\n|$)/)
  if (!endMatch) return content

  const endIndex = 3 + endMatch.index! + endMatch[0].length
  return content.substring(endIndex).replace(/^\n+/, '')
}

/**
 * Simple YAML parser for frontmatter.
 */
function parseYamlSimple(yamlContent: string): Record<string, unknown> {
  const lines = yamlContent.split('\n')
  const result: Record<string, unknown> = {}

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) continue

    const colonIndex = trimmed.indexOf(':')
    if (colonIndex > 0) {
      const key = trimmed.slice(0, colonIndex).trim()
      const valueStr = trimmed.slice(colonIndex + 1).trim()

      if (valueStr.startsWith('[') && valueStr.endsWith(']')) {
        // Inline array
        const arrayContent = valueStr.slice(1, -1)
        result[key] = arrayContent.split(',').map(v => parseYamlValue(v.trim()))
      } else if (valueStr === '') {
        // Check for array or nested object
        result[key] = null
      } else {
        result[key] = parseYamlValue(valueStr)
      }
    }
  }

  return result
}

/**
 * Parse a single YAML value.
 */
function parseYamlValue(value: string): unknown {
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null' || value === '~') return null

  // Check for quoted string
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }

  // Check for number
  const num = Number(value)
  if (!isNaN(num) && value !== '') return num

  return value
}
