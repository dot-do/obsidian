import type { TFile, LinkCache } from '../types.js';
import type { MetadataCache } from '../metadata/cache.js';
/**
 * Represents a link position in simplified form
 */
export interface LinkPosition {
    link: string;
    position: {
        line: number;
        col: number;
    };
}
/**
 * Simple backlink result with source file and link positions
 */
export interface Backlink {
    file: TFile;
    links: LinkPosition[];
}
/**
 * Extended backlink result with full link metadata and context
 */
export interface BacklinkResult {
    file: TFile;
    links: LinkCache[];
    context: string[];
}
/**
 * Forward link with resolved target file reference
 */
export interface ForwardLink {
    link: string;
    resolved: TFile | null;
}
/**
 * GraphEngine provides backlink and forward link analysis for vault files.
 * It uses the MetadataCache to traverse resolved links and extract link metadata.
 */
export declare class GraphEngine {
    private cache;
    private contentCache;
    constructor(cache: MetadataCache);
    /**
     * Get all backlinks pointing to a specific file path.
     * Returns simplified backlink info with source file and link positions.
     *
     * @param path - The target file path to find backlinks for
     * @returns Array of Backlink objects, each containing the source file and link positions
     */
    getBacklinks(path: string): Backlink[];
    /**
     * Get extended backlinks with full LinkCache metadata and surrounding context.
     * This is useful for displaying backlink previews in a UI.
     *
     * @param path - The target file path to find backlinks for
     * @returns Array of BacklinkResult objects with full link metadata and context strings
     */
    getBacklinksWithContext(path: string): BacklinkResult[];
    /**
     * Get all forward links from a specific file.
     * Returns link text and resolved target file reference.
     *
     * @param path - The source file path to get forward links from
     * @returns Array of ForwardLink objects with link text and resolved file (or null if unresolved)
     */
    getForwardLinks(path: string): ForwardLink[];
    /**
     * Get raw LinkCache array for forward links (matches Obsidian API style).
     *
     * @param path - The source file path
     * @returns Array of LinkCache objects from the file's metadata
     */
    getForwardLinksRaw(path: string): LinkCache[];
    /**
     * Set cached content for a file path (used for context extraction).
     * This allows context to be extracted without async file reads.
     *
     * @param path - The file path
     * @param content - The file content
     */
    setContentCache(path: string, content: string): void;
    /**
     * Clear the content cache for a specific path or all paths.
     *
     * @param path - Optional specific path to clear, or clear all if not provided
     */
    clearContentCache(path?: string): void;
    /**
     * Extract surrounding text context for a link at a given position.
     * Returns empty string if content is not cached.
     *
     * @param path - The file path containing the link
     * @param position - The position of the link in the file
     * @returns Context string with surrounding text, or empty string if unavailable
     */
    private getContext;
    /**
     * Get a TFile by path from the vault (if available via metadataCache).
     * Falls back to creating a TFile from path if vault access is not available.
     *
     * @param path - The file path
     * @returns TFile object
     */
    private getFileByPath;
    /**
     * Create a TFile object from a path string.
     *
     * @param path - The file path
     * @returns A TFile object with parsed name, basename, and extension
     */
    private createTFileFromPath;
}
//# sourceMappingURL=engine.d.ts.map