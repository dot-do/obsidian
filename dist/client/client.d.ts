import type { Backend, TFile, CachedMetadata, EventRef, EventCallback } from '../types.js';
import { Vault } from '../vault/vault.js';
import { MetadataCache } from '../metadata/cache.js';
import { Graph } from '../graph/graph.js';
export type { Note, NoteResult, ContextOptions, VaultContext, GenerateContextOptions, QueryContextOptions, NoteFilterOptions, NoteWithContent, } from './types.js';
import type { NoteResult, ContextOptions, VaultContext, GenerateContextOptions, QueryContextOptions, NoteFilterOptions, NoteWithContent } from './types.js';
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
export interface SearchResultItem {
    file: TFile;
    score: number;
    matches?: Array<[number, number]>;
}
export interface ClientSearch {
    searchContent(query: string): Promise<SearchResultItem[]>;
    searchFiles(query: string): Promise<SearchResultItem[]>;
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
    /**
     * Initializes the client by loading all files and building caches.
     * Must be called before using most other methods.
     * @returns A promise that resolves when initialization is complete.
     */
    initialize(): Promise<void>;
    init(): Promise<void>;
    private ensureInitialized;
    private ensureNotDisposed;
    /**
     * Retrieves a note with its content, metadata, and backlinks.
     * @param path - The vault-relative path to the markdown file.
     * @returns A promise resolving to the note's file, content, metadata, and backlinks.
     * @throws Error if file not found or not a markdown file.
     */
    getNote(path: string): Promise<NoteResult>;
    /**
     * Creates a new note with optional frontmatter.
     * @param path - The vault-relative path for the new file.
     * @param content - The markdown content of the note.
     * @param frontmatter - Optional key-value pairs to include as YAML frontmatter.
     * @returns A promise resolving to the created TFile.
     * @throws Error if file already exists.
     */
    createNote(path: string, content: string, frontmatter?: Record<string, unknown>): Promise<TFile>;
    private resolveLinksToNewFile;
    private serializeYaml;
    private serializeYamlValue;
    /**
     * Updates the content of an existing note.
     * @param path - The vault-relative path to the file.
     * @param content - The new markdown content.
     * @returns A promise that resolves when the update is complete.
     * @throws Error if file not found.
     */
    updateNote(path: string, content: string): Promise<void>;
    /**
     * Updates just the frontmatter of a note, preserving the body content.
     * @param path - The vault-relative path to the file.
     * @param frontmatter - Key-value pairs to merge into existing frontmatter. Set a value to undefined to remove it.
     * @returns A promise that resolves when the update is complete.
     * @throws Error if file not found.
     */
    updateFrontmatter(path: string, frontmatter: Record<string, unknown>): Promise<void>;
    /**
     * Gets file context including metadata and neighboring files (linked and backlinked).
     * @param file - The TFile to get context for.
     * @returns An object containing the file, its cached metadata, and neighboring files.
     */
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
    /**
     * Generates a rich context string for a note, including metadata, content, links, and backlinks.
     * @param pathOrFile - The path or TFile to generate context for.
     * @param options - Optional settings for depth (linked note traversal) and maxTokens (truncation).
     * @returns A promise resolving to a formatted context string.
     * @throws Error if file not found.
     */
    generateContext(pathOrFile: string | TFile, options?: GenerateContextOptions): Promise<string>;
    private generateNoteContext;
    private truncateContext;
    /**
     * Generates context for notes matching a search query.
     * @param query - The search query string.
     * @param options - Optional settings for maxNotes and maxTokens.
     * @returns A promise resolving to a formatted context string of matching notes.
     */
    generateContextForQuery(query: string, options?: QueryContextOptions): Promise<string>;
    /**
     * Generates context for notes with a specific tag.
     * @param tag - The tag to search for (with or without # prefix).
     * @returns A promise resolving to a formatted context string of tagged notes.
     */
    generateContextForTag(tag: string): Promise<string>;
    /**
     * Generates context for notes with specified tags.
     * @param tags - Array of tags to search for (with or without # prefix).
     * @param requireAll - If true, notes must have all tags; if false, any matching tag suffices.
     * @returns A promise resolving to a formatted context string of matching notes.
     */
    generateContextForTags(tags: string[], requireAll?: boolean): Promise<string>;
    private findByMultipleTags;
    private getFileTags;
    getVaultContext(options: ContextOptions): Promise<VaultContext>;
    getContext(options: ContextOptions): Promise<VaultContext>;
    private generateVaultSummary;
    private getTagCloud;
    private getRecentNotes;
    private getRelatedNotes;
    /**
     * Subscribes to an event emitted by the client.
     * @param event - The event name (e.g., 'create', 'modify', 'delete', 'rename', 'changed').
     * @param callback - The function to call when the event is emitted.
     * @returns An EventRef that can be used to unsubscribe.
     */
    on<T>(event: string, callback: EventCallback<T>): EventRef;
    off(event: string, ref: EventRef): void;
    trigger(event: string, data?: unknown): void;
    getAbsolutePath(relativePath: string): string;
    getRelativePath(absolutePath: string): string;
    /**
     * Creates multiple notes in a batch operation.
     * @param items - Array of objects with path, content, and optional frontmatter.
     * @returns A promise resolving to an array of created TFiles.
     */
    batchCreate(items: Array<{
        path: string;
        content: string;
        frontmatter?: Record<string, unknown>;
    }>): Promise<TFile[]>;
    /**
     * Updates multiple notes in a batch operation.
     * @param items - Array of objects with path and content.
     * @returns A promise that resolves when all updates are complete.
     */
    batchUpdate(items: Array<{
        path: string;
        content: string;
    }>): Promise<void>;
    /**
     * Gets aggregate statistics about the vault.
     * @returns An object with totalNotes, totalLinks, totalTags, and totalSize.
     */
    getVaultStats(): VaultStats;
    /**
     * Disposes of the client, cleaning up event listeners and resources.
     * After calling dispose(), the client should not be used.
     */
    dispose(): void;
    /**
     * Returns recently modified notes synchronously.
     * @param limit - Maximum number of notes to return (default: 10)
     * @returns Array of TFile objects sorted by mtime descending
     */
    getRecentNotesSync(limit?: number): TFile[];
    /**
     * Returns recently modified notes with their content and metadata.
     * @param limit - Maximum number of notes to return (default: 10)
     * @returns Promise resolving to array of NoteWithContent objects
     */
    getRecentNotesWithContent(limit?: number): Promise<NoteWithContent[]>;
    /**
     * Returns notes in a specific folder.
     * @param folder - Folder path to search in
     * @param recursive - If true (default), includes notes in subfolders
     * @returns Array of TFile objects in the folder
     */
    getNotesByFolder(folder: string, recursive?: boolean): TFile[];
    /**
     * Returns notes with a specific tag.
     * @param tag - Tag to search for (with or without # prefix)
     * @returns Array of TFile objects with the tag
     */
    getNotesByTag(tag: string): TFile[];
    /**
     * Returns notes matching multiple tags.
     * @param tags - Array of tags to search for
     * @param requireAll - If true, notes must have all tags; if false (default), any tag matches
     * @returns Array of TFile objects matching the tag criteria
     */
    getNotesByTags(tags: string[], requireAll?: boolean): TFile[];
    /**
     * Flexible note filtering with multiple criteria.
     * @param options - Filter options including folder, tags, limit, and sort settings
     * @returns Array of TFile objects matching the filter criteria
     */
    getNotes(options: NoteFilterOptions): TFile[];
    /**
     * Returns notes with content matching filter criteria.
     * @param options - Filter options
     * @returns Promise resolving to array of NoteWithContent objects
     */
    getNotesWithContent(options: NoteFilterOptions): Promise<NoteWithContent[]>;
    /**
     * Returns all unique tags in the vault, sorted alphabetically.
     * @returns Array of tag strings (without # prefix)
     */
    getAllTags(): string[];
    /**
     * Returns all unique folders in the vault, sorted alphabetically.
     * @returns Array of folder paths
     */
    getAllFolders(): string[];
    /**
     * Checks if a note exists at the given path.
     * @param path - The vault-relative path to check
     * @returns True if the note exists
     */
    hasNote(path: string): boolean;
    /**
     * Returns notes that have no incoming or outgoing links (orphans).
     * @returns Array of TFile objects with no links
     */
    getOrphanNotes(): TFile[];
    /**
     * Returns files that link to the specified note.
     * @param path - The vault-relative path to the note
     * @returns Array of TFile objects that link to the note
     */
    getBacklinksFor(path: string): TFile[];
    /**
     * Returns files that the specified note links to.
     * @param path - The vault-relative path to the note
     * @returns Array of TFile objects that the note links to
     */
    getOutlinksFor(path: string): TFile[];
    /**
     * Deletes a note from the vault.
     * @param path - The vault-relative path to the note
     * @returns This client instance for method chaining
     * @throws Error if file not found
     */
    deleteNote(path: string): Promise<this>;
    /**
     * Renames a note in the vault.
     * @param oldPath - Current vault-relative path to the note
     * @param newPath - New vault-relative path for the note
     * @returns This client instance for method chaining
     * @throws Error if source file not found or destination already exists
     */
    renameNote(oldPath: string, newPath: string): Promise<this>;
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