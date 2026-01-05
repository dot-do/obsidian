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
export declare class SearchEngine {
    private vault;
    private cache;
    constructor(vault: Vault, cache: MetadataCache);
    search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
    findByTag(tag: string): TFile[];
    findByProperty(key: string, value: unknown): TFile[];
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