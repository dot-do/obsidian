/**
 * Context generator for obsidian-hhi
 *
 * Generates structured context from vault content optimized for LLM consumption.
 */
import type { ObsidianClient } from './client.js';
export type { ContextNote as Note, GeneratedVaultContext as VaultContext, ContextGraphStats as GraphStats, ContextOptions, } from './types.js';
import type { ContextNote as Note, GeneratedVaultContext as VaultContext, ContextGraphStats as GraphStats, ContextOptions } from './types.js';
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