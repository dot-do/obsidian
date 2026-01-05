import type { Backend, TFile, CachedMetadata, EventRef, EventCallback } from '../types.js';
import { Vault } from '../vault/vault.js';
import { MetadataCache } from '../metadata/cache.js';
import { Graph, GraphStats } from '../graph/graph.js';
import { BacklinkResult } from '../graph/engine.js';
export type VaultBackend = Backend;
/**
 * Client options for creating an ObsidianClient.
 * Supports multiple backend configurations.
 */
export interface ClientOptions {
    /** Path to the vault on disk (used with filesystem backend) */
    vaultPath?: string;
    /** Backend type to use */
    backend?: 'filesystem' | 'memory' | 'rest';
    /** Initial files for memory backend */
    initialFiles?: Record<string, string>;
    /** REST API URL (used with rest backend) */
    restApiUrl?: string;
    /** REST API key (used with rest backend) */
    restApiKey?: string;
}
/**
 * Legacy options interface that accepts a pre-created backend.
 * Maintained for backward compatibility.
 */
export interface ObsidianClientOptions {
    backend: Backend;
    vaultPath?: string;
}
export interface ContextOptions {
    scope: 'summary' | 'recent' | 'related';
    focus?: string;
    maxTokens?: number;
}
export interface VaultContext {
    summary?: string;
    tagCloud?: Record<string, number>;
    graphStats?: GraphStats;
    recentNotes?: TFile[];
    relatedNotes?: TFile[];
}
/**
 * Result from getNote() with full note information.
 * Legacy interface - maintained for backward compatibility.
 */
export interface NoteResult {
    file: TFile;
    content: string;
    metadata: CachedMetadata | null;
    backlinks: TFile[];
}
/**
 * Note interface as specified in task obsidian-4y2.
 * Contains file, content, metadata, and detailed backlink information.
 */
export interface Note {
    file: TFile;
    content: string;
    metadata: CachedMetadata;
    backlinks: BacklinkResult[];
}
export interface SearchResultItem {
    file: TFile;
    score: number;
    matches?: Array<[number, number]>;
}
export interface ClientSearch {
    searchContent(query: string): Promise<SearchResultItem[]>;
    searchFiles(query: string): Promise<SearchResultItem[]>;
}
export interface GenerateContextOptions {
    depth?: number;
    maxTokens?: number;
}
export interface QueryContextOptions {
    maxNotes?: number;
    maxTokens?: number;
}
export interface VaultStats {
    totalNotes: number;
    totalLinks: number;
    totalTags: number;
    totalSize: number;
}
export declare class ObsidianClient {
    vault: Vault;
    metadataCache: MetadataCache;
    graph: Graph;
    search: ClientSearch;
    vaultPath?: string;
    private backend;
    private options;
    private initialized;
    private disposed;
    private eventListeners;
    private eventRefs;
    private contentCache;
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
    constructor(options: ClientOptions | ObsidianClientOptions);
    /**
     * Check if options are legacy format (with backend instance)
     */
    private isLegacyOptions;
    /**
     * Create a backend based on the options.
     * Supports filesystem, memory, and REST API backends.
     */
    private createBackend;
    private setupEventForwarding;
    get cache(): MetadataCache;
    initialize(): Promise<void>;
    init(): Promise<void>;
    private ensureInitialized;
    private ensureNotDisposed;
    getNote(path: string): Promise<NoteResult>;
    createNote(path: string, content: string, frontmatter?: Record<string, unknown>): Promise<TFile>;
    private resolveLinksToNewFile;
    /**
     * Serialize an object to YAML frontmatter string.
     * This is the method specified in task obsidian-4y2.
     */
    private serializeFrontmatter;
    private serializeYaml;
    private serializeYamlValue;
    updateNote(path: string, content: string): Promise<void>;
    updateFrontmatter(path: string, frontmatter: Record<string, unknown>): Promise<void>;
    getFileContext(file: TFile): {
        file: TFile;
        metadata: CachedMetadata | null;
        neighbors: TFile[];
    };
    getFileContextAsync(file: TFile): Promise<{
        file: TFile;
        metadata: CachedMetadata | null;
        neighbors: TFile[];
    }>;
    ensureAllFilesIndexed(): Promise<void>;
    reindex(): Promise<void>;
    generateContext(pathOrFile: string | TFile, options?: GenerateContextOptions): Promise<string>;
    private generateNoteContext;
    private truncateContext;
    generateContextForQuery(query: string, options?: QueryContextOptions): Promise<string>;
    generateContextForTag(tag: string): Promise<string>;
    generateContextForTags(tags: string[], requireAll?: boolean): Promise<string>;
    private findByMultipleTags;
    private getFileTags;
    getVaultContext(options: ContextOptions): Promise<VaultContext>;
    getContext(options: ContextOptions): Promise<VaultContext>;
    private generateVaultSummary;
    private getTagCloud;
    private getRecentNotes;
    private getRelatedNotes;
    on<T>(event: string, callback: EventCallback<T>): EventRef;
    off(event: string, ref: EventRef): void;
    trigger(event: string, data?: unknown): void;
    getAbsolutePath(relativePath: string): string;
    getRelativePath(absolutePath: string): string;
    batchCreate(items: Array<{
        path: string;
        content: string;
        frontmatter?: Record<string, unknown>;
    }>): Promise<TFile[]>;
    batchUpdate(items: Array<{
        path: string;
        content: string;
    }>): Promise<void>;
    getVaultStats(): VaultStats;
    dispose(): void;
}
/**
 * Parse frontmatter from markdown content.
 * Returns the frontmatter object or null if no frontmatter exists.
 */
export declare function parseFrontmatter(content: string): Record<string, unknown> | null;
/**
 * Get the content of a markdown file without the frontmatter.
 */
export declare function getContentWithoutFrontmatter(content: string): string;
//# sourceMappingURL=client.d.ts.map