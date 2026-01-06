import type { Backend, TFile, TFolder, TAbstractFile } from '../types.js';
import { Events } from './events.js';
/**
 * Options for configuring the Vault's caching behavior.
 */
export interface VaultOptions {
    /** Maximum number of file contents to cache (default: 500) */
    contentCacheSize?: number;
    /** Maximum number of file metadata entries to cache (default: 5000) */
    fileCacheSize?: number;
    /** Whether to enable debouncing of file watch events (default: false) */
    enableWatchDebounce?: boolean;
    /** Debounce delay in milliseconds for file watch events (default: 100) */
    watchDebounceMs?: number;
}
/**
 * Cache statistics for monitoring vault performance.
 */
export interface CacheStats {
    contentCache: {
        size: number;
        capacity: number;
    };
    fileCache: {
        size: number;
        capacity: number;
    };
    folderCache: {
        size: number;
    };
    pathToParentCache: {
        size: number;
    };
}
/**
 * Vault provides file management for an Obsidian-compatible vault.
 * Wraps a backend storage system and provides caching, event emission, and folder management.
 */
export declare class Vault extends Events {
    private backend;
    private fileCache;
    private folderCache;
    private contentCache;
    private pathToParentCache;
    private syncScanned;
    private backendCreatesInProgress;
    private backendModifiesInProgress;
    private backendDeletesInProgress;
    private options;
    /**
     * Creates a new Vault instance.
     * @param backend - The storage backend to use (filesystem, memory, or REST).
     * @param options - Optional configuration for caching behavior.
     */
    constructor(backend: Backend, options?: VaultOptions);
    private setupBackendListeners;
    private refreshFileSync;
    private createTFile;
    private refreshFile;
    private syncScanBackend;
    private ensureRootFolder;
    private registerFoldersForPath;
    private buildFolderChildren;
    /**
     * Gets a file by its vault-relative path.
     * @param path - The vault-relative path to the file.
     * @returns The TFile if found, or null if not found.
     */
    getFileByPath(path: string): TFile | null;
    /**
     * Gets a file or folder by its vault-relative path.
     * @param path - The vault-relative path.
     * @returns The TFile or TFolder if found, or null if not found.
     */
    getAbstractFileByPath(path: string): TAbstractFile | null;
    private normalizePath;
    /**
     * Gets all markdown files in the vault.
     * @returns An array of TFile objects for all .md files.
     */
    getMarkdownFiles(): TFile[];
    private rescanBackend;
    /**
     * Gets all files in the vault (any extension).
     * @returns An array of all TFile objects.
     */
    getFiles(): TFile[];
    /**
     * Gets all loaded files and folders in the vault.
     * @returns An array of TFile and TFolder objects.
     */
    getAllLoadedFiles(): TAbstractFile[];
    /**
     * Gets all folders in the vault.
     * @param includeRoot - Whether to include the root folder (default: true).
     * @returns An array of TFolder objects.
     */
    getAllFolders(includeRoot?: boolean): TFolder[];
    /**
     * Reads the content of a file.
     * @param file - The TFile to read.
     * @returns A promise resolving to the file content as a string.
     */
    read(file: TFile): Promise<string>;
    /**
     * Reads the content of a file with caching for better performance.
     * @param file - The TFile to read.
     * @returns A promise resolving to the file content as a string.
     */
    cachedRead(file: TFile): Promise<string>;
    /**
     * Reads the content of a file as binary data.
     * @param file - The TFile to read.
     * @returns A promise resolving to the file content as an ArrayBuffer.
     */
    readBinary(file: TFile): Promise<ArrayBuffer>;
    /**
     * Creates a new file in the vault.
     * @param path - The vault-relative path for the new file.
     * @param content - The content to write to the file.
     * @returns A promise resolving to the created TFile.
     * @throws Error if file already exists.
     */
    create(path: string, content: string): Promise<TFile>;
    /**
     * Modifies the content of an existing file.
     * @param file - The TFile to modify.
     * @param content - The new content for the file.
     * @returns A promise that resolves when modification is complete.
     * @throws Error if file not found.
     */
    modify(file: TFile, content: string): Promise<void>;
    /**
     * Appends content to the end of a file.
     * @param file - The TFile to append to.
     * @param content - The content to append.
     * @returns A promise that resolves when the append is complete.
     */
    append(file: TFile, content: string): Promise<void>;
    /**
     * Processes a file's content using a transformation function.
     * @param file - The TFile to process.
     * @param fn - A function that takes current content and returns new content.
     * @returns A promise resolving to the new content after transformation.
     */
    process(file: TFile, fn: (content: string) => string): Promise<string>;
    /**
     * Deletes a file from the vault.
     * @param file - The TFile to delete.
     * @returns A promise that resolves when deletion is complete.
     * @throws Error if file not found.
     */
    delete(file: TFile): Promise<void>;
    /**
     * Moves a file to trash (alias for delete).
     * @param file - The TFile to trash.
     * @returns A promise that resolves when the file is trashed.
     */
    trash(file: TFile): Promise<void>;
    /**
     * Renames or moves a file to a new path.
     * @param file - The TFile to rename.
     * @param newPath - The new vault-relative path.
     * @returns A promise that resolves when the rename is complete.
     * @throws Error if source file not found or target path already exists.
     */
    rename(file: TFile, newPath: string): Promise<void>;
    /**
     * Copies a file to a new path.
     * @param file - The TFile to copy.
     * @param newPath - The vault-relative path for the copy.
     * @returns A promise resolving to the newly created TFile.
     * @throws Error if target path already exists.
     */
    copy(file: TFile, newPath: string): Promise<TFile>;
    /**
     * Gets cache statistics for monitoring vault performance.
     * @returns An object containing size and capacity information for all caches.
     */
    getCacheStats(): CacheStats;
    /**
     * Clears all caches in the vault.
     * This includes file cache, folder cache, content cache, and path-to-parent cache.
     */
    clearCaches(): void;
    /**
     * Clears only the content cache.
     * File and folder metadata caches are preserved.
     */
    clearContentCache(): void;
}
//# sourceMappingURL=vault.d.ts.map