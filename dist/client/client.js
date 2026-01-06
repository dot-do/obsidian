import { Vault } from '../vault/vault.js';
import { MetadataCache } from '../metadata/cache.js';
import { Graph } from '../graph/graph.js';
import { SearchEngine } from '../search/engine.js';
import { MemoryBackend } from '../vault/memory-backend.js';
import { FileSystemBackend } from '../vault/fs-backend.js';
import { RestApiBackend } from '../vault/rest-backend.js';
export class ObsidianClient {
    vault;
    metadataCache;
    graph;
    search;
    vaultPath;
    backend;
    options;
    initialized = false;
    disposed = false;
    eventListeners = new Map();
    eventRefs = [];
    contentCache = new Map();
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
    constructor(options) {
        this.options = options;
        // Determine if using legacy API (backend is an object instance) or new API (backend is a string type)
        const isLegacyOptions = this.isLegacyOptions(options);
        if (isLegacyOptions) {
            // Legacy API: backend is already provided
            const legacyOpts = options;
            if (!legacyOpts.backend) {
                throw new Error('Backend is required');
            }
            this.backend = legacyOpts.backend;
            this.vaultPath = legacyOpts.vaultPath?.replace(/\/$/, '');
        }
        else {
            // New API: create backend from options
            const clientOpts = options;
            this.backend = this.createBackend(clientOpts);
            this.vaultPath = clientOpts.vaultPath?.replace(/\/$/, '');
        }
        // Initialize components
        this.vault = new Vault(this.backend);
        this.metadataCache = new MetadataCache(this.vault);
        this.graph = new Graph(this.metadataCache);
        // Create search adapter
        const searchEngine = new SearchEngine(this.vault, this.metadataCache);
        this.search = {
            searchContent: async (query) => {
                const results = await searchEngine.search(query);
                return results.map(r => ({
                    file: r.file,
                    score: r.score,
                    matches: r.matches.flatMap(m => m.positions.map(p => [p, query.length]))
                }));
            },
            searchFiles: async (query) => {
                const files = this.vault.getMarkdownFiles();
                const results = [];
                for (const file of files) {
                    const queryLower = query.toLowerCase();
                    const fileNameLower = file.name.toLowerCase();
                    const basenameLower = file.basename.toLowerCase();
                    if (fileNameLower.includes(queryLower) || basenameLower.includes(queryLower)) {
                        const score = basenameLower === queryLower ? 100 :
                            basenameLower.startsWith(queryLower) ? 80 : 50;
                        results.push({ file, score });
                    }
                }
                return results.sort((a, b) => b.score - a.score);
            }
        };
        // Set up event forwarding from vault
        this.setupEventForwarding();
    }
    /**
     * Check if options are legacy format (with backend instance)
     */
    isLegacyOptions(options) {
        const backend = options.backend;
        // Legacy options have backend as an object instance (not a string type)
        return backend !== undefined && typeof backend === 'object' && backend !== null;
    }
    /**
     * Create a backend based on the options.
     * Supports filesystem, memory, and REST API backends.
     */
    createBackend(options) {
        // If no backend type specified, require vaultPath for filesystem or error
        if (!options.backend) {
            if (options.vaultPath) {
                return new FileSystemBackend(options.vaultPath);
            }
            // No backend type and no vaultPath - error
            throw new Error('Backend is required');
        }
        switch (options.backend) {
            case 'memory':
                return new MemoryBackend(options.initialFiles);
            case 'rest':
                if (!options.restApiUrl) {
                    throw new Error('restApiUrl is required for REST backend');
                }
                if (!options.restApiKey) {
                    throw new Error('restApiKey is required for REST backend');
                }
                return new RestApiBackend(options.restApiUrl, options.restApiKey);
            case 'filesystem':
                if (!options.vaultPath) {
                    throw new Error('vaultPath is required for filesystem backend');
                }
                return new FileSystemBackend(options.vaultPath);
            default:
                throw new Error(`Unknown backend type: ${options.backend}`);
        }
    }
    setupEventForwarding() {
        // Forward vault events
        const vaultEvents = ['create', 'modify', 'delete', 'rename'];
        for (const eventName of vaultEvents) {
            const ref = this.vault.on(eventName, (data) => {
                if (!this.disposed && typeof this.trigger === 'function') {
                    this.trigger(eventName, data);
                }
            });
            this.eventRefs.push(ref);
        }
        // Forward metadata cache events
        const cacheRef = this.metadataCache.on('changed', (data) => {
            if (!this.disposed && typeof this.trigger === 'function') {
                this.trigger('changed', data);
            }
        });
        this.eventRefs.push(cacheRef);
    }
    // Alias for metadataCache
    get cache() {
        return this.metadataCache;
    }
    /**
     * Initializes the client by loading all files and building caches.
     * Must be called before using most other methods.
     * @returns A promise that resolves when initialization is complete.
     */
    async initialize() {
        if (this.initialized) {
            return;
        }
        // Initialize the backend if it has an initialize method (e.g., FileSystemBackend)
        // This scans for existing files and populates the files map
        const backendWithInit = this.backend;
        if (typeof backendWithInit.initialize === 'function') {
            await backendWithInit.initialize();
        }
        // Initialize the metadata cache (which also initializes vault file list)
        await this.metadataCache.initialize();
        // Populate content cache for sync operations
        const files = this.vault.getMarkdownFiles();
        for (const file of files) {
            try {
                const content = await this.vault.read(file);
                this.contentCache.set(file.path, content);
            }
            catch {
                // Ignore errors during initialization
            }
        }
        this.initialized = true;
    }
    // Legacy init alias for backwards compatibility
    async init() {
        return this.initialize();
    }
    ensureInitialized() {
        if (!this.initialized) {
            throw new Error('Client not initialized. Call initialize() first.');
        }
    }
    ensureNotDisposed() {
        if (this.disposed) {
            throw new Error('Client has been disposed');
        }
    }
    /**
     * Retrieves a note with its content, metadata, and backlinks.
     * @param path - The vault-relative path to the markdown file.
     * @returns A promise resolving to the note's file, content, metadata, and backlinks.
     * @throws Error if file not found or not a markdown file.
     */
    async getNote(path) {
        this.ensureInitialized();
        this.ensureNotDisposed();
        const file = this.vault.getFileByPath(path);
        if (!file) {
            throw new Error(`File not found: ${path}`);
        }
        if (file.extension !== 'md') {
            throw new Error(`Not a markdown file: ${path}`);
        }
        const content = await this.vault.read(file);
        const metadata = this.metadataCache.getFileCache(file);
        // Get backlinks
        const backlinkPaths = this.graph.getBacklinks(path);
        const backlinks = [];
        for (const blPath of backlinkPaths) {
            const blFile = this.vault.getFileByPath(blPath);
            if (blFile) {
                backlinks.push(blFile);
            }
        }
        return {
            file,
            content,
            metadata,
            backlinks
        };
    }
    /**
     * Creates a new note with optional frontmatter.
     * @param path - The vault-relative path for the new file.
     * @param content - The markdown content of the note.
     * @param frontmatter - Optional key-value pairs to include as YAML frontmatter.
     * @returns A promise resolving to the created TFile.
     * @throws Error if file already exists.
     */
    async createNote(path, content, frontmatter) {
        this.ensureInitialized();
        this.ensureNotDisposed();
        // Normalize path
        const normalizedPath = path.replace(/\/+/g, '/');
        // Check if file exists
        if (this.vault.getFileByPath(normalizedPath)) {
            throw new Error(`File already exists: ${normalizedPath}`);
        }
        // Build content with frontmatter
        let finalContent = content;
        if (frontmatter && Object.keys(frontmatter).length > 0) {
            const yamlContent = this.serializeYaml(frontmatter);
            finalContent = `---\n${yamlContent}---\n\n${content}`;
        }
        // Create the file (vault.create will trigger the 'create' event which we forward)
        const file = await this.vault.create(normalizedPath, finalContent);
        // Index the new file (will be auto-indexed by metadataCache listening to vault events)
        // but we do it explicitly to ensure it's indexed before returning
        await this.metadataCache.indexFile(file);
        // Re-resolve links from files that have unresolved links pointing to this new file
        await this.resolveLinksToNewFile(file);
        return file;
    }
    // Re-resolve links from files that have unresolved links that might now resolve to a newly created file
    async resolveLinksToNewFile(newFile) {
        const unresolvedLinks = this.metadataCache.unresolvedLinks;
        const basename = newFile.basename.toLowerCase();
        const filesToReindex = [];
        for (const [sourcePath, links] of Object.entries(unresolvedLinks)) {
            for (const link of Object.keys(links)) {
                // Normalize link for comparison (like we do in getFirstLinkpathDest)
                const normalizedLink = link.toLowerCase().replace(/[\s_-]+/g, '');
                const normalizedBasename = basename.replace(/[\s_-]+/g, '');
                // Check if this unresolved link might match the new file
                if (normalizedLink === normalizedBasename ||
                    normalizedLink === newFile.path.replace(/\.md$/, '').toLowerCase() ||
                    normalizedLink === newFile.name.toLowerCase()) {
                    const sourceFile = this.vault.getFileByPath(sourcePath);
                    if (sourceFile && !filesToReindex.some(f => f.path === sourcePath)) {
                        filesToReindex.push(sourceFile);
                    }
                }
            }
        }
        // Re-index files that had unresolved links
        for (const file of filesToReindex) {
            await this.metadataCache.indexFile(file);
        }
    }
    serializeYaml(obj) {
        const lines = [];
        for (const [key, value] of Object.entries(obj)) {
            lines.push(this.serializeYamlValue(key, value, 0));
        }
        return lines.join('\n') + '\n';
    }
    serializeYamlValue(key, value, indent) {
        const prefix = '  '.repeat(indent);
        if (value === null || value === undefined) {
            return `${prefix}${key}: null`;
        }
        if (value instanceof Date) {
            return `${prefix}${key}: ${value.toISOString()}`;
        }
        if (typeof value === 'boolean' || typeof value === 'number') {
            return `${prefix}${key}: ${value}`;
        }
        if (typeof value === 'string') {
            // Check if string needs quoting
            if (value.includes(':') || value.includes('"') || value.includes('\n') || value.includes('#')) {
                // Use quoted string
                const escaped = value.replace(/"/g, '\\"').replace(/\n/g, '\\n');
                return `${prefix}${key}: "${escaped}"`;
            }
            return `${prefix}${key}: ${value}`;
        }
        if (Array.isArray(value)) {
            if (value.length === 0) {
                return `${prefix}${key}: []`;
            }
            // Check if array contains simple values
            const allSimple = value.every(v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean');
            if (allSimple) {
                const items = value.map(v => typeof v === 'string' ? v : String(v)).join(', ');
                return `${prefix}${key}: [${items}]`;
            }
            // Complex array
            const arrayLines = [`${prefix}${key}:`];
            for (const item of value) {
                if (typeof item === 'object' && item !== null) {
                    arrayLines.push(`${prefix}  -`);
                    for (const [k, v] of Object.entries(item)) {
                        arrayLines.push(this.serializeYamlValue(k, v, indent + 2));
                    }
                }
                else {
                    arrayLines.push(`${prefix}  - ${item}`);
                }
            }
            return arrayLines.join('\n');
        }
        if (typeof value === 'object') {
            const objLines = [`${prefix}${key}:`];
            for (const [k, v] of Object.entries(value)) {
                objLines.push(this.serializeYamlValue(k, v, indent + 1));
            }
            return objLines.join('\n');
        }
        return `${prefix}${key}: ${value}`;
    }
    /**
     * Updates the content of an existing note.
     * @param path - The vault-relative path to the file.
     * @param content - The new markdown content.
     * @returns A promise that resolves when the update is complete.
     * @throws Error if file not found.
     */
    async updateNote(path, content) {
        this.ensureInitialized();
        this.ensureNotDisposed();
        const file = this.vault.getFileByPath(path);
        if (!file) {
            throw new Error(`File not found: ${path}`);
        }
        // vault.modify will trigger the 'modify' event which we forward
        await this.vault.modify(file, content);
        // Re-index the file (will be auto-indexed by metadataCache listening to vault events)
        // but we do it explicitly to ensure it's indexed before returning
        await this.metadataCache.indexFile(file);
    }
    /**
     * Updates just the frontmatter of a note, preserving the body content.
     * @param path - The vault-relative path to the file.
     * @param frontmatter - Key-value pairs to merge into existing frontmatter. Set a value to undefined to remove it.
     * @returns A promise that resolves when the update is complete.
     * @throws Error if file not found.
     */
    async updateFrontmatter(path, frontmatter) {
        this.ensureInitialized();
        this.ensureNotDisposed();
        const file = this.vault.getFileByPath(path);
        if (!file) {
            throw new Error(`File not found: ${path}`);
        }
        const content = await this.vault.read(file);
        const existingMetadata = this.metadataCache.getFileCache(file);
        // Parse existing frontmatter
        const existingFrontmatter = existingMetadata?.frontmatter || {};
        // Merge frontmatter
        const mergedFrontmatter = { ...existingFrontmatter };
        for (const [key, value] of Object.entries(frontmatter)) {
            if (value === undefined) {
                delete mergedFrontmatter[key];
            }
            else {
                mergedFrontmatter[key] = value;
            }
        }
        // Extract body content (after frontmatter)
        let bodyContent = content;
        if (existingMetadata?.frontmatterPosition) {
            const endOffset = existingMetadata.frontmatterPosition.end.offset;
            bodyContent = content.substring(endOffset).replace(/^[\r\n]+/, '');
        }
        // Build new content
        let newContent;
        if (Object.keys(mergedFrontmatter).length > 0) {
            const yamlContent = this.serializeYaml(mergedFrontmatter);
            newContent = `---\n${yamlContent}---\n\n${bodyContent}`;
        }
        else {
            newContent = bodyContent;
        }
        await this.vault.modify(file, newContent);
        // Re-index the file
        await this.metadataCache.indexFile(file);
    }
    /**
     * Gets file context including metadata and neighboring files (linked and backlinked).
     * @param file - The TFile to get context for.
     * @returns An object containing the file, its cached metadata, and neighboring files.
     */
    getFileContext(file) {
        this.ensureInitialized();
        // Synchronously index this file if needed
        // This uses the internal cache check which should be already populated by ensureAllFilesIndexed
        const metadata = this.metadataCache.getFileCache(file);
        // Get outgoing links
        const outlinks = this.graph.getOutlinks(file.path);
        // Get backlinks
        const backlinks = this.graph.getBacklinks(file.path);
        // Combine and dedupe, excluding self
        const neighborPaths = new Set();
        for (const path of [...outlinks, ...backlinks]) {
            if (path !== file.path) {
                neighborPaths.add(path);
            }
        }
        const neighbors = [];
        for (const path of neighborPaths) {
            const neighborFile = this.vault.getFileByPath(path);
            if (neighborFile) {
                neighbors.push(neighborFile);
            }
        }
        return { file, metadata, neighbors };
    }
    // Async version of getFileContext that ensures indexing is complete
    async getFileContextAsync(file) {
        this.ensureInitialized();
        await this.ensureAllFilesIndexed();
        return this.getFileContext(file);
    }
    // Ensure all files in the vault are indexed in the metadata cache
    // Public so tests can call this after writing files directly to backend
    async ensureAllFilesIndexed() {
        const files = this.vault.getMarkdownFiles();
        for (const file of files) {
            if (!this.metadataCache.getFileCache(file)) {
                await this.metadataCache.indexFile(file);
            }
        }
    }
    // Force re-index all files, including those already cached
    // This is needed to properly resolve links when target files are created after source files
    async reindex() {
        const files = this.vault.getMarkdownFiles();
        for (const file of files) {
            await this.metadataCache.indexFile(file);
        }
    }
    /**
     * Generates a rich context string for a note, including metadata, content, links, and backlinks.
     * @param pathOrFile - The path or TFile to generate context for.
     * @param options - Optional settings for depth (linked note traversal) and maxTokens (truncation).
     * @returns A promise resolving to a formatted context string.
     * @throws Error if file not found.
     */
    async generateContext(pathOrFile, options) {
        this.ensureInitialized();
        // Ensure all files are indexed for proper link resolution
        await this.ensureAllFilesIndexed();
        const depth = options?.depth ?? 0; // Default depth is 0
        const maxTokens = options?.maxTokens;
        // Handle both string path and TFile
        let file;
        let path;
        if (typeof pathOrFile === 'string') {
            path = pathOrFile;
            file = this.vault.getFileByPath(path);
            if (!file) {
                throw new Error(`File not found: ${path}`);
            }
        }
        else {
            file = pathOrFile;
            path = file.path;
            // Verify file exists
            const existingFile = this.vault.getFileByPath(path);
            if (!existingFile) {
                throw new Error(`File not found: ${path}`);
            }
        }
        const visitedPaths = new Set();
        let context = await this.generateNoteContext(file, visitedPaths, depth, maxTokens);
        // Handle maxTokens truncation
        if (maxTokens && context.length > maxTokens * 4) {
            context = this.truncateContext(context, maxTokens);
        }
        return context;
    }
    async generateNoteContext(file, visitedPaths, remainingDepth, maxTokens) {
        if (visitedPaths.has(file.path)) {
            return '';
        }
        visitedPaths.add(file.path);
        const content = await this.vault.cachedRead(file);
        const metadata = this.metadataCache.getFileCache(file);
        const sections = [];
        // Add source file path
        sections.push(`## Source: ${file.path}`);
        sections.push('');
        // Add frontmatter if present
        if (metadata?.frontmatter) {
            sections.push('### Metadata');
            sections.push('---');
            for (const [key, value] of Object.entries(metadata.frontmatter)) {
                if (Array.isArray(value)) {
                    sections.push(`${key}: [${value.join(', ')}]`);
                }
                else {
                    sections.push(`${key}: ${value}`);
                }
            }
            sections.push('---');
            sections.push('');
        }
        // Add content
        sections.push('### Content');
        sections.push(content);
        sections.push('');
        // Get outgoing links
        const outlinks = this.graph.getOutlinks(file.path);
        if (outlinks.length > 0) {
            sections.push('### Links');
            for (const link of outlinks) {
                const linkFile = this.vault.getFileByPath(link);
                sections.push(`- ${linkFile ? link : `${link} (unresolved)`}`);
            }
            sections.push('');
        }
        // Get backlinks
        const backlinks = this.graph.getBacklinks(file.path);
        if (backlinks.length > 0) {
            sections.push('### Backlinks');
            for (const backlink of backlinks) {
                sections.push(`- ${backlink}`);
            }
            sections.push('');
        }
        let context = sections.join('\n');
        // Include linked notes if depth > 0
        if (remainingDepth > 0) {
            const linkedPaths = [...new Set([...outlinks, ...backlinks])];
            for (const linkedPath of linkedPaths) {
                if (visitedPaths.has(linkedPath)) {
                    continue;
                }
                const linkedFile = this.vault.getFileByPath(linkedPath);
                if (linkedFile) {
                    const linkedContext = await this.generateNoteContext(linkedFile, visitedPaths, remainingDepth - 1, maxTokens);
                    if (linkedContext) {
                        context += '\n---\n\n' + linkedContext;
                    }
                }
            }
        }
        return context;
    }
    truncateContext(context, maxTokens) {
        // Approximate: 1 token ~= 4 characters
        const maxChars = maxTokens * 4;
        if (context.length <= maxChars) {
            return context;
        }
        // Find a good breakpoint
        let truncateIndex = maxChars;
        const lastNewline = context.lastIndexOf('\n', truncateIndex);
        if (lastNewline > maxChars * 0.8) {
            truncateIndex = lastNewline;
        }
        return context.substring(0, truncateIndex) + '\n\n... (truncated)';
    }
    /**
     * Generates context for notes matching a search query.
     * @param query - The search query string.
     * @param options - Optional settings for maxNotes and maxTokens.
     * @returns A promise resolving to a formatted context string of matching notes.
     */
    async generateContextForQuery(query, options) {
        this.ensureInitialized();
        // Ensure all files are indexed for proper search
        await this.ensureAllFilesIndexed();
        const maxNotes = options?.maxNotes ?? 10;
        const maxTokens = options?.maxTokens;
        // Search for matching files
        const searchEngine = new SearchEngine(this.vault, this.metadataCache);
        const results = await searchEngine.search(query, { limit: maxNotes });
        if (results.length === 0) {
            return `No notes found matching: ${query}`;
        }
        const sections = [];
        sections.push(`# Context for query: "${query}"`);
        sections.push('');
        for (const result of results) {
            const content = await this.vault.cachedRead(result.file);
            const metadata = this.metadataCache.getFileCache(result.file);
            sections.push(`## ${result.file.path}`);
            sections.push('');
            // Add metadata if present
            if (metadata?.frontmatter) {
                sections.push('---');
                for (const [key, value] of Object.entries(metadata.frontmatter)) {
                    if (Array.isArray(value)) {
                        sections.push(`${key}: [${value.join(', ')}]`);
                    }
                    else {
                        sections.push(`${key}: ${value}`);
                    }
                }
                sections.push('---');
                sections.push('');
            }
            sections.push(content);
            sections.push('');
        }
        let context = sections.join('\n');
        // Handle maxTokens truncation
        if (maxTokens && context.length > maxTokens * 4) {
            context = this.truncateContext(context, maxTokens);
        }
        return context;
    }
    /**
     * Generates context for notes with a specific tag.
     * @param tag - The tag to search for (with or without # prefix).
     * @returns A promise resolving to a formatted context string of tagged notes.
     */
    async generateContextForTag(tag) {
        return this.generateContextForTags([tag], false);
    }
    /**
     * Generates context for notes with specified tags.
     * @param tags - Array of tags to search for (with or without # prefix).
     * @param requireAll - If true, notes must have all tags; if false, any matching tag suffices.
     * @returns A promise resolving to a formatted context string of matching notes.
     */
    async generateContextForTags(tags, requireAll = true) {
        this.ensureInitialized();
        // Ensure all files are indexed for proper tag search
        await this.ensureAllFilesIndexed();
        const searchEngine = new SearchEngine(this.vault, this.metadataCache);
        const matchingFiles = tags.length === 1
            ? searchEngine.findByTag(tags[0])
            : this.findByMultipleTags(tags, requireAll);
        if (matchingFiles.length === 0) {
            return `No notes found with tags: ${tags.join(', ')}`;
        }
        const sections = [];
        sections.push(`# Context for tags: ${tags.join(', ')}`);
        sections.push('');
        for (const file of matchingFiles) {
            const content = await this.vault.cachedRead(file);
            const metadata = this.metadataCache.getFileCache(file);
            sections.push(`## ${file.path}`);
            sections.push('');
            // Add metadata if present
            if (metadata?.frontmatter) {
                sections.push('---');
                for (const [key, value] of Object.entries(metadata.frontmatter)) {
                    if (Array.isArray(value)) {
                        sections.push(`${key}: [${value.join(', ')}]`);
                    }
                    else {
                        sections.push(`${key}: ${value}`);
                    }
                }
                sections.push('---');
                sections.push('');
            }
            sections.push(content);
            sections.push('');
        }
        return sections.join('\n');
    }
    findByMultipleTags(tags, requireAll) {
        const files = this.vault.getMarkdownFiles();
        const matchingFiles = [];
        // Normalize tags
        const normalizedTags = tags.map(t => t.startsWith('#') ? t.slice(1).toLowerCase() : t.toLowerCase());
        for (const file of files) {
            const metadata = this.metadataCache.getFileCache(file);
            const fileTags = this.getFileTags(file, metadata);
            const matches = requireAll
                ? normalizedTags.every(tag => fileTags.some(ft => ft.toLowerCase() === tag))
                : normalizedTags.some(tag => fileTags.some(ft => ft.toLowerCase() === tag));
            if (matches) {
                matchingFiles.push(file);
            }
        }
        return matchingFiles;
    }
    getFileTags(_file, metadata) {
        const tags = [];
        // Get frontmatter tags
        if (metadata?.frontmatter?.tags) {
            const fmTags = metadata.frontmatter.tags;
            if (Array.isArray(fmTags)) {
                tags.push(...fmTags.map(t => String(t)));
            }
            else if (typeof fmTags === 'string') {
                tags.push(fmTags);
            }
        }
        // Get inline tags
        if (metadata?.tags) {
            for (const tagCache of metadata.tags) {
                const tag = tagCache.tag.startsWith('#') ? tagCache.tag.slice(1) : tagCache.tag;
                tags.push(tag);
            }
        }
        return tags;
    }
    async getVaultContext(options) {
        return this.getContext(options);
    }
    async getContext(options) {
        this.ensureInitialized();
        const context = {};
        if (options.scope === 'summary') {
            context.summary = await this.generateVaultSummary();
            context.tagCloud = this.getTagCloud();
            context.graphStats = this.graph.getStats();
        }
        if (options.scope === 'recent') {
            context.recentNotes = this.getRecentNotes();
        }
        if (options.scope === 'related' && options.focus) {
            context.relatedNotes = this.getRelatedNotes(options.focus);
        }
        return context;
    }
    async generateVaultSummary() {
        const files = this.vault.getMarkdownFiles();
        const stats = this.graph.getStats();
        return `Vault contains ${files.length} notes with ${stats.totalEdges} links.`;
    }
    getTagCloud() {
        const tagCounts = {};
        const files = this.vault.getMarkdownFiles();
        for (const file of files) {
            const metadata = this.metadataCache.getFileCache(file);
            const fileTags = this.getFileTags(file, metadata);
            for (const tag of fileTags) {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            }
        }
        return tagCounts;
    }
    getRecentNotes() {
        const files = this.vault.getMarkdownFiles();
        return files.sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, 10);
    }
    getRelatedNotes(focus) {
        const neighbors = this.graph.getNeighbors(focus);
        return neighbors;
    }
    /**
     * Subscribes to an event emitted by the client.
     * @param event - The event name (e.g., 'create', 'modify', 'delete', 'rename', 'changed').
     * @param callback - The function to call when the event is emitted.
     * @returns An EventRef that can be used to unsubscribe.
     */
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set());
        }
        this.eventListeners.get(event).add(callback);
        return {
            unsubscribe: () => {
                this.eventListeners.get(event)?.delete(callback);
            }
        };
    }
    off(event, ref) {
        ref.unsubscribe();
    }
    trigger(event, data) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            for (const callback of listeners) {
                callback(data);
            }
        }
    }
    // Path utilities
    getAbsolutePath(relativePath) {
        if (!this.vaultPath) {
            return relativePath;
        }
        return `${this.vaultPath}/${relativePath}`;
    }
    getRelativePath(absolutePath) {
        if (!this.vaultPath || !absolutePath.startsWith(this.vaultPath)) {
            return absolutePath;
        }
        return absolutePath.substring(this.vaultPath.length + 1);
    }
    /**
     * Creates multiple notes in a batch operation.
     * @param items - Array of objects with path, content, and optional frontmatter.
     * @returns A promise resolving to an array of created TFiles.
     */
    async batchCreate(items) {
        this.ensureInitialized();
        this.ensureNotDisposed();
        const files = [];
        for (const item of items) {
            const file = await this.createNote(item.path, item.content, item.frontmatter);
            files.push(file);
        }
        return files;
    }
    /**
     * Updates multiple notes in a batch operation.
     * @param items - Array of objects with path and content.
     * @returns A promise that resolves when all updates are complete.
     */
    async batchUpdate(items) {
        this.ensureInitialized();
        this.ensureNotDisposed();
        for (const item of items) {
            await this.updateNote(item.path, item.content);
        }
    }
    /**
     * Gets aggregate statistics about the vault.
     * @returns An object with totalNotes, totalLinks, totalTags, and totalSize.
     */
    getVaultStats() {
        this.ensureInitialized();
        const files = this.vault.getMarkdownFiles();
        let totalLinks = 0;
        let totalTags = 0;
        let totalSize = 0;
        for (const file of files) {
            totalSize += file.stat.size;
            const metadata = this.metadataCache.getFileCache(file);
            if (metadata) {
                totalLinks += (metadata.links?.length || 0);
                totalTags += (metadata.tags?.length || 0);
            }
        }
        return {
            totalNotes: files.length,
            totalLinks,
            totalTags,
            totalSize
        };
    }
    /**
     * Disposes of the client, cleaning up event listeners and resources.
     * After calling dispose(), the client should not be used.
     */
    dispose() {
        if (this.disposed) {
            return;
        }
        // Clean up event listeners
        this.eventListeners.clear();
        // Unsubscribe from forwarded events
        for (const ref of this.eventRefs) {
            ref.unsubscribe();
        }
        this.eventRefs = [];
        this.disposed = true;
    }
    // ============================================================================
    // Convenience Methods
    // ============================================================================
    /**
     * Returns recently modified notes synchronously.
     * @param limit - Maximum number of notes to return (default: 10)
     * @returns Array of TFile objects sorted by mtime descending
     */
    getRecentNotesSync(limit = 10) {
        this.ensureInitialized();
        const files = this.vault.getMarkdownFiles();
        return files.sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, limit);
    }
    /**
     * Returns recently modified notes with their content and metadata.
     * @param limit - Maximum number of notes to return (default: 10)
     * @returns Promise resolving to array of NoteWithContent objects
     */
    async getRecentNotesWithContent(limit = 10) {
        this.ensureInitialized();
        const files = this.getRecentNotesSync(limit);
        const results = [];
        for (const file of files) {
            const content = await this.vault.read(file);
            const metadata = this.metadataCache.getFileCache(file);
            results.push({ file, content, metadata });
        }
        return results;
    }
    /**
     * Returns notes in a specific folder.
     * @param folder - Folder path to search in
     * @param recursive - If true (default), includes notes in subfolders
     * @returns Array of TFile objects in the folder
     */
    getNotesByFolder(folder, recursive = true) {
        this.ensureInitialized();
        // Normalize folder path
        let normalizedFolder = folder.replace(/^\/+|\/+$/g, '');
        const files = this.vault.getMarkdownFiles();
        return files.filter(file => {
            const fileDir = file.path.substring(0, file.path.lastIndexOf('/'));
            if (recursive) {
                // Check if file is in folder or any subfolder
                return file.path.startsWith(normalizedFolder + '/') || fileDir === normalizedFolder;
            }
            else {
                // Only direct children
                return fileDir === normalizedFolder;
            }
        });
    }
    /**
     * Returns notes with a specific tag.
     * @param tag - Tag to search for (with or without # prefix)
     * @returns Array of TFile objects with the tag
     */
    getNotesByTag(tag) {
        this.ensureInitialized();
        // Normalize tag (remove # prefix if present)
        const normalizedTag = tag.startsWith('#') ? tag.slice(1).toLowerCase() : tag.toLowerCase();
        const files = this.vault.getMarkdownFiles();
        return files.filter(file => {
            const metadata = this.metadataCache.getFileCache(file);
            const fileTags = this.getFileTags(file, metadata);
            return fileTags.some(t => t.toLowerCase() === normalizedTag);
        });
    }
    /**
     * Returns notes matching multiple tags.
     * @param tags - Array of tags to search for
     * @param requireAll - If true, notes must have all tags; if false (default), any tag matches
     * @returns Array of TFile objects matching the tag criteria
     */
    getNotesByTags(tags, requireAll = false) {
        this.ensureInitialized();
        // Normalize tags
        const normalizedTags = tags.map(t => t.startsWith('#') ? t.slice(1).toLowerCase() : t.toLowerCase());
        const files = this.vault.getMarkdownFiles();
        return files.filter(file => {
            const metadata = this.metadataCache.getFileCache(file);
            const fileTags = this.getFileTags(file, metadata).map(t => t.toLowerCase());
            if (requireAll) {
                return normalizedTags.every(tag => fileTags.includes(tag));
            }
            else {
                return normalizedTags.some(tag => fileTags.includes(tag));
            }
        });
    }
    /**
     * Flexible note filtering with multiple criteria.
     * @param options - Filter options including folder, tags, limit, and sort settings
     * @returns Array of TFile objects matching the filter criteria
     */
    getNotes(options) {
        this.ensureInitialized();
        let files = this.vault.getMarkdownFiles();
        // Filter by folder
        if (options.folder) {
            const normalizedFolder = options.folder.replace(/^\/+|\/+$/g, '');
            files = files.filter(file => {
                const fileDir = file.path.substring(0, file.path.lastIndexOf('/'));
                return file.path.startsWith(normalizedFolder + '/') || fileDir === normalizedFolder;
            });
        }
        // Filter by tags
        if (options.tags) {
            const tagsArray = Array.isArray(options.tags) ? options.tags : [options.tags];
            const normalizedTags = tagsArray.map(t => t.startsWith('#') ? t.slice(1).toLowerCase() : t.toLowerCase());
            files = files.filter(file => {
                const metadata = this.metadataCache.getFileCache(file);
                const fileTags = this.getFileTags(file, metadata).map(t => t.toLowerCase());
                if (options.requireAllTags) {
                    return normalizedTags.every(tag => fileTags.includes(tag));
                }
                else {
                    return normalizedTags.some(tag => fileTags.includes(tag));
                }
            });
        }
        // Sort files
        const sortBy = options.sortBy ?? 'mtime';
        const sortOrder = options.sortOrder ?? (sortBy === 'name' ? 'asc' : 'desc');
        files.sort((a, b) => {
            let comparison = 0;
            switch (sortBy) {
                case 'name':
                    comparison = a.basename.localeCompare(b.basename);
                    break;
                case 'mtime':
                    comparison = a.stat.mtime - b.stat.mtime;
                    break;
                case 'ctime':
                    comparison = a.stat.ctime - b.stat.ctime;
                    break;
                case 'size':
                    comparison = a.stat.size - b.stat.size;
                    break;
            }
            return sortOrder === 'desc' ? -comparison : comparison;
        });
        // Apply limit
        if (options.limit && options.limit > 0) {
            files = files.slice(0, options.limit);
        }
        return files;
    }
    /**
     * Returns notes with content matching filter criteria.
     * @param options - Filter options
     * @returns Promise resolving to array of NoteWithContent objects
     */
    async getNotesWithContent(options) {
        this.ensureInitialized();
        const files = this.getNotes(options);
        const results = [];
        for (const file of files) {
            const content = await this.vault.read(file);
            const metadata = this.metadataCache.getFileCache(file);
            results.push({ file, content, metadata });
        }
        return results;
    }
    /**
     * Returns all unique tags in the vault, sorted alphabetically.
     * @returns Array of tag strings (without # prefix)
     */
    getAllTags() {
        this.ensureInitialized();
        const tags = new Set();
        const files = this.vault.getMarkdownFiles();
        for (const file of files) {
            const metadata = this.metadataCache.getFileCache(file);
            const fileTags = this.getFileTags(file, metadata);
            for (const tag of fileTags) {
                tags.add(tag);
            }
        }
        return [...tags].sort();
    }
    /**
     * Returns all unique folders in the vault, sorted alphabetically.
     * @returns Array of folder paths
     */
    getAllFolders() {
        this.ensureInitialized();
        const folders = new Set();
        const files = this.vault.getMarkdownFiles();
        for (const file of files) {
            const lastSlash = file.path.lastIndexOf('/');
            if (lastSlash > 0) {
                const folder = file.path.substring(0, lastSlash);
                // Add all parent folders too
                const parts = folder.split('/');
                let current = '';
                for (const part of parts) {
                    current = current ? `${current}/${part}` : part;
                    folders.add(current);
                }
            }
        }
        return [...folders].sort();
    }
    /**
     * Checks if a note exists at the given path.
     * @param path - The vault-relative path to check
     * @returns True if the note exists
     */
    hasNote(path) {
        this.ensureInitialized();
        return this.vault.getFileByPath(path) !== null;
    }
    /**
     * Returns notes that have no incoming or outgoing links (orphans).
     * @returns Array of TFile objects with no links
     */
    getOrphanNotes() {
        this.ensureInitialized();
        const files = this.vault.getMarkdownFiles();
        return files.filter(file => {
            const outlinks = this.graph.getOutlinks(file.path);
            const backlinks = this.graph.getBacklinks(file.path);
            return outlinks.length === 0 && backlinks.length === 0;
        });
    }
    /**
     * Returns files that link to the specified note.
     * @param path - The vault-relative path to the note
     * @returns Array of TFile objects that link to the note
     */
    getBacklinksFor(path) {
        this.ensureInitialized();
        const backlinkPaths = this.graph.getBacklinks(path);
        const result = [];
        for (const blPath of backlinkPaths) {
            const file = this.vault.getFileByPath(blPath);
            if (file) {
                result.push(file);
            }
        }
        return result;
    }
    /**
     * Returns files that the specified note links to.
     * @param path - The vault-relative path to the note
     * @returns Array of TFile objects that the note links to
     */
    getOutlinksFor(path) {
        this.ensureInitialized();
        const outlinkPaths = this.graph.getOutlinks(path);
        const result = [];
        for (const olPath of outlinkPaths) {
            const file = this.vault.getFileByPath(olPath);
            if (file) {
                result.push(file);
            }
        }
        return result;
    }
    /**
     * Deletes a note from the vault.
     * @param path - The vault-relative path to the note
     * @returns This client instance for method chaining
     * @throws Error if file not found
     */
    async deleteNote(path) {
        this.ensureInitialized();
        this.ensureNotDisposed();
        const file = this.vault.getFileByPath(path);
        if (!file) {
            throw new Error(`File not found: ${path}`);
        }
        await this.vault.delete(file);
        return this;
    }
    /**
     * Renames a note in the vault.
     * @param oldPath - Current vault-relative path to the note
     * @param newPath - New vault-relative path for the note
     * @returns This client instance for method chaining
     * @throws Error if source file not found or destination already exists
     */
    async renameNote(oldPath, newPath) {
        this.ensureInitialized();
        this.ensureNotDisposed();
        const file = this.vault.getFileByPath(oldPath);
        if (!file) {
            throw new Error(`File not found: ${oldPath}`);
        }
        const existingFile = this.vault.getFileByPath(newPath);
        if (existingFile) {
            throw new Error(`File already exists: ${newPath}`);
        }
        await this.vault.rename(file, newPath);
        return this;
    }
}
/**
 * Parse frontmatter from markdown content.
 * Returns the frontmatter object or null if no frontmatter exists.
 */
export function parseFrontmatter(content) {
    if (!content.startsWith('---'))
        return null;
    const endMatch = content.slice(3).match(/\n---(\n|$)/);
    if (!endMatch)
        return null;
    const yamlContent = content.slice(4, 3 + endMatch.index);
    try {
        return parseYamlSimple(yamlContent);
    }
    catch {
        return null;
    }
}
/**
 * Get the content of a markdown file without the frontmatter.
 */
export function getContentWithoutFrontmatter(content) {
    if (!content.startsWith('---'))
        return content;
    const endMatch = content.slice(3).match(/\n---(\n|$)/);
    if (!endMatch)
        return content;
    const endIndex = 3 + endMatch.index + endMatch[0].length;
    return content.substring(endIndex).replace(/^\n+/, '');
}
/**
 * Simple YAML parser for frontmatter.
 */
function parseYamlSimple(yamlContent) {
    const lines = yamlContent.split('\n');
    const result = {};
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        const colonIndex = trimmed.indexOf(':');
        if (colonIndex > 0) {
            const key = trimmed.slice(0, colonIndex).trim();
            const valueStr = trimmed.slice(colonIndex + 1).trim();
            if (valueStr.startsWith('[') && valueStr.endsWith(']')) {
                // Inline array
                const arrayContent = valueStr.slice(1, -1);
                result[key] = arrayContent.split(',').map(v => parseYamlValue(v.trim()));
            }
            else if (valueStr === '') {
                // Check for array or nested object
                result[key] = null;
            }
            else {
                result[key] = parseYamlValue(valueStr);
            }
        }
    }
    return result;
}
/**
 * Parse a single YAML value.
 */
function parseYamlValue(value) {
    if (value === 'true')
        return true;
    if (value === 'false')
        return false;
    if (value === 'null' || value === '~')
        return null;
    // Check for quoted string
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }
    // Check for number
    const num = Number(value);
    if (!isNaN(num) && value !== '')
        return num;
    return value;
}
//# sourceMappingURL=client.js.map