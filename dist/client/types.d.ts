/**
 * Shared type definitions for obsidian client module.
 *
 * This file consolidates interfaces that were previously duplicated
 * between client.ts and context.ts.
 */
import type { TFile, CachedMetadata } from '../types.js';
import type { BacklinkResult } from '../graph/engine.js';
import type { GraphStats } from '../graph/graph.js';
/**
 * Note interface for the main client API (getNote, etc).
 * Contains file, content, metadata, and detailed backlink information.
 */
export interface Note {
    file: TFile;
    content: string;
    metadata: CachedMetadata;
    backlinks: BacklinkResult[];
}
/**
 * Legacy Note result from getNote() with full note information.
 * Maintained for backward compatibility.
 */
export interface NoteResult {
    file: TFile;
    content: string;
    metadata: CachedMetadata | null;
    backlinks: TFile[];
}
/**
 * Note interface for context generation.
 * Simpler version without backlinks, used in VaultContext results.
 */
export interface ContextNote {
    file: TFile;
    content: string;
    metadata: CachedMetadata | null;
}
/**
 * Options for client getContext/getVaultContext methods.
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
 * Options for generateContext method (per-note context generation).
 */
export interface GenerateContextOptions {
    depth?: number;
    maxTokens?: number;
}
/**
 * Options for generateContextForQuery method.
 */
export interface QueryContextOptions {
    maxNotes?: number;
    maxTokens?: number;
}
/**
 * Vault context result from client getContext/getVaultContext methods.
 * All properties are optional as they depend on the scope.
 */
export interface VaultContext {
    summary?: string;
    tagCloud?: Record<string, number>;
    graphStats?: GraphStats;
    recentNotes?: TFile[];
    relatedNotes?: TFile[];
}
/**
 * Graph statistics for context generation.
 */
export interface ContextGraphStats {
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
 * Full vault context result from context generator functions.
 * All properties are required with defaults.
 */
export interface GeneratedVaultContext {
    /** Summary of the vault */
    summary: string;
    /** Recently modified notes */
    recentNotes: ContextNote[];
    /** Notes related to focus path */
    relatedNotes: ContextNote[];
    /** Tag cloud with counts */
    tagCloud: {
        tag: string;
        count: number;
    }[];
    /** Graph statistics */
    graphStats: ContextGraphStats;
}
//# sourceMappingURL=types.d.ts.map