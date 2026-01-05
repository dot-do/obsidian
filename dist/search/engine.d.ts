import type { TFile } from '../types.js';
import type { Vault } from '../vault/vault.js';
import type { MetadataCache } from '../metadata/cache.js';
export interface SearchResult {
    file: TFile;
    score: number;
    matches: Array<{
        line: number;
        text: string;
        positions: number[];
    }>;
}
export interface SearchOptions {
    limit?: number;
    filter?: {
        folder?: string;
        tags?: string[];
    };
}
/**
 * SearchEngine provides full-text search and filtering capabilities for vault notes.
 * Supports content search, tag filtering, property filtering, and link queries.
 */
export declare class SearchEngine {
    private vault;
    private cache;
    /**
     * Creates a new SearchEngine instance.
     * @param vault - The Vault instance to search.
     * @param cache - The MetadataCache for accessing file metadata.
     */
    constructor(vault: Vault, cache: MetadataCache);
    /**
     * Searches for notes matching a query string with optional filters.
     * @param query - The search query (case-insensitive text search).
     * @param options - Optional search options including limit, folder filter, and tag filters.
     * @returns A promise resolving to an array of SearchResult objects sorted by relevance.
     */
    search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
    /**
     * Finds all files with a specific tag.
     * @param tag - The tag to search for (with or without # prefix).
     * @returns An array of TFile objects that have the specified tag.
     */
    findByTag(tag: string): TFile[];
    /**
     * Finds all files with a specific frontmatter property value.
     * @param key - The property key (supports dot notation for nested properties).
     * @param value - The value to match. Use undefined to find files missing the property.
     * @returns An array of TFile objects matching the property criteria.
     */
    findByProperty(key: string, value: unknown): TFile[];
    /**
     * Finds all files that link to a specific target note.
     * @param target - The target note name or path (with or without .md extension).
     * @returns An array of TFile objects that contain links to the target.
     */
    findByLink(target: string): TFile[];
    /**
     * Get all tags from a file (both frontmatter and inline)
     */
    private getFileTags;
    /**
     * Escape special regex characters in a string
     */
    private escapeRegex;
    /**
     * Calculate relevance score for a search result
     */
    private calculateScore;
}
//# sourceMappingURL=engine.d.ts.map