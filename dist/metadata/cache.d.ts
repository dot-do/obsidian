import type { TFile, CachedMetadata, EventCallback, EventRef } from '../types.js';
import type { Vault } from '../vault/vault.js';
/**
 * Events base class providing event emitter functionality
 */
export declare class Events {
    private eventListeners;
    private nextListenerId;
    on<T>(event: string, callback: EventCallback<T>): EventRef;
    off(event: string, ref: EventRef): void;
    trigger(event: string, ...args: unknown[]): void;
}
/**
 * Parser function type for parsing markdown content into metadata
 */
export type MarkdownParser = (content: string) => CachedMetadata;
export declare class MetadataCache extends Events {
    private vault;
    private parser;
    private cache;
    private contentHashes;
    private initialized;
    private batchWindow;
    private batchFiles;
    private batchStartTime;
    private batchTimeout;
    resolvedLinks: Record<string, Record<string, number>>;
    unresolvedLinks: Record<string, Record<string, number>>;
    constructor(vault: Vault, parser?: MarkdownParser);
    /**
     * Set up listeners for vault events to automatically index files
     */
    private setupVaultListeners;
    private updateLinksToDeletedFile;
    private updateLinksToRenamedFile;
    /**
     * Re-index all files that have backlinks to a given path.
     * This is called after a file is renamed to update link resolution.
     * @param oldPath The old path of the renamed file
     */
    private reindexBacklinks;
    private isMarkdownFile;
    getFileCache(file: TFile): CachedMetadata | null;
    getCache(path: string): CachedMetadata | null;
    initialize(): Promise<void>;
    indexFile(file: TFile): Promise<CachedMetadata | null>;
    private simpleHash;
    clearCache(file: TFile): void;
    getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null;
    fileToLinktext(file: TFile, sourcePath: string): string;
    setBatchWindow(ms: number): void;
    flushBatch(): void;
    private addToBatch;
    private hasMetadataChanged;
    /**
     * Resolve a link to a target file
     * @param link The link text (e.g., "note", "folder/note", "note#heading")
     * @param sourcePath The path of the file containing the link
     * @returns The resolved TFile or null if not found
     */
    resolveLink(link: string, sourcePath: string): TFile | null;
    /**
     * Update the link graphs (resolvedLinks and unresolvedLinks) for a given file
     * This is called after indexing a file to update the link tracking
     */
    private updateLinkGraphs;
    /**
     * Legacy alias for updateLinkGraphs - kept for backward compatibility
     */
    private updateLinkTracking;
    private parseContent;
    private parseFrontmatter;
    private parseYaml;
    private parseYamlBlock;
    private parseYamlArray;
    private findNextNonEmptyLine;
    private parseYamlValue;
    private extractFrontmatterLinks;
    private findCodeBlockRanges;
    private isInCodeBlock;
    private getPosition;
    private parseLinks;
    private parseEmbeds;
    private parseTags;
    private parseHeadings;
    private parseBlocks;
}
//# sourceMappingURL=cache.d.ts.map