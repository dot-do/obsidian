/**
 * Search Index Module
 *
 * Provides high-performance search indexing for large vaults.
 * Features:
 * - Inverted index for fast content lookups
 * - Incremental indexing (only re-index changed files)
 * - Search result caching with TTL
 * - Term frequency scoring
 */
import type { TFile } from '../types.js';
import type { Vault } from '../vault/vault.js';
import type { MetadataCache } from '../metadata/cache.js';
export interface IndexEntry {
    /** File path */
    path: string;
    /** Term frequency in this document */
    tf: number;
    /** Positions of the term in the document (line numbers) */
    positions: number[];
}
export interface DocumentMeta {
    /** File path */
    path: string;
    /** Last modified time when indexed */
    mtime: number;
    /** Total number of terms in document */
    termCount: number;
    /** Document title (first heading or basename) */
    title: string;
    /** Tags from frontmatter and inline */
    tags: string[];
}
export interface SearchIndexOptions {
    /** Minimum term length to index (default: 2) */
    minTermLength?: number;
    /** Stop words to exclude from indexing */
    stopWords?: Set<string>;
    /** Maximum cache entries (default: 100) */
    maxCacheEntries?: number;
    /** Cache TTL in milliseconds (default: 30000) */
    cacheTTL?: number;
}
export interface IndexedSearchResult {
    file: TFile;
    score: number;
    matchedTerms: string[];
    positions: Map<string, number[]>;
}
/**
 * SearchIndex provides fast full-text search with inverted index.
 * Supports incremental updates and result caching.
 */
export declare class SearchIndex {
    private vault;
    private cache;
    private options;
    /** Inverted index: term -> list of documents containing term */
    private invertedIndex;
    /** Document metadata: path -> document info */
    private documents;
    /** Total number of documents */
    private documentCount;
    /** Result cache with LRU eviction */
    private resultCache;
    /** Tracks if index needs full rebuild */
    private needsRebuild;
    /** Paths of files that need re-indexing */
    private dirtyPaths;
    constructor(vault: Vault, cache: MetadataCache, options?: SearchIndexOptions);
    /**
     * Build or rebuild the entire search index.
     * Call this initially or when you need a full refresh.
     */
    buildIndex(): Promise<void>;
    /**
     * Mark a file as needing re-indexing.
     * Call this when a file is modified.
     */
    markDirty(path: string): void;
    /**
     * Mark a file as deleted.
     * Removes it from the index.
     */
    markDeleted(path: string): void;
    /**
     * Update index for any dirty files.
     * Call this before searching for accurate results.
     */
    updateIndex(): Promise<void>;
    /**
     * Check if the index needs updating.
     */
    needsUpdate(): boolean;
    /**
     * Get index statistics.
     */
    getStats(): {
        documentCount: number;
        termCount: number;
        cacheSize: number;
    };
    /**
     * Search the index for documents matching the query.
     * Uses TF-IDF scoring for relevance.
     */
    search(query: string, limit?: number): IndexedSearchResult[];
    /**
     * Find entries matching a term (including prefix matches).
     */
    private findEntriesForTerm;
    /**
     * Index a single file.
     */
    private indexFile;
    /**
     * Remove a file from the index.
     */
    private removeFromIndex;
    /**
     * Tokenize text into searchable terms.
     */
    private tokenize;
    /**
     * Extract document title from content.
     */
    private extractTitle;
    /**
     * Extract tags from file metadata.
     */
    private extractTags;
    /**
     * Calculate Inverse Document Frequency for a term.
     */
    private calculateIDF;
    /**
     * Get result from cache if valid.
     */
    private getFromCache;
    /**
     * Add result to cache with LRU eviction.
     */
    private addToCache;
    /**
     * Invalidate the entire result cache.
     */
    private invalidateCache;
    /**
     * Clear the entire index.
     */
    clear(): void;
}
//# sourceMappingURL=index.d.ts.map