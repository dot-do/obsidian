/**
 * Context generator for obsidian-hhi
 *
 * Generates structured context from vault content optimized for LLM consumption.
 */
import type { TFile, CachedMetadata } from '../types.js';
import type { ObsidianClient } from './client.js';
/**
 * Options for context generation
 */
export interface ContextOptions {
    /** The scope of context to generate */
    scope: 'summary' | 'recent' | 'related';
    /** Path for related context (required when scope is 'related') */
    focus?: string;
    /** Maximum tokens to include in output */
    maxTokens?: number;
}
/**
 * Note interface for context generation
 */
export interface Note {
    file: TFile;
    content: string;
    metadata: CachedMetadata | null;
}
/**
 * Vault context result
 */
export interface VaultContext {
    /** Summary of the vault */
    summary: string;
    /** Recently modified notes */
    recentNotes: Note[];
    /** Notes related to focus path */
    relatedNotes: Note[];
    /** Tag cloud with counts */
    tagCloud: {
        tag: string;
        count: number;
    }[];
    /** Graph statistics */
    graphStats: GraphStats;
}
/**
 * Graph statistics for context
 */
export interface GraphStats {
    /** Total number of notes in the vault */
    totalNotes: number;
    /** Total number of links between notes */
    totalLinks: number;
    /** Number of orphan notes (no links) */
    orphanCount: number;
    /** Average number of links per note */
    averageLinks: number;
}
/**
 * Get graph statistics from the client
 */
export declare function getGraphStats(client: ObsidianClient): GraphStats;
/**
 * Get tag cloud with counts from the vault
 */
export declare function getTagCloud(client: ObsidianClient): {
    tag: string;
    count: number;
}[];
/**
 * Get recently modified notes
 */
export declare function getRecentNotes(client: ObsidianClient, limit?: number): Promise<Note[]>;
/**
 * Get notes related to a focus path using graph neighbors
 */
export declare function getRelatedNotes(client: ObsidianClient, focusPath: string): Promise<Note[]>;
/**
 * Truncate context to fit within token limit
 * Approximate: 1 token ~= 4 characters
 */
export declare function truncateContext(context: VaultContext, maxTokens: number): VaultContext;
/**
 * Generate context based on options
 */
export declare function generateContext(client: ObsidianClient, options: ContextOptions): Promise<VaultContext>;
//# sourceMappingURL=context.d.ts.map