import type { TFile } from '../types.js';
import type { Vault } from './vault.js';
import type { MetadataCache } from '../metadata/cache.js';
interface FileChangeEvent {
    type: 'create' | 'modify' | 'delete' | 'rename';
    file: TFile;
    oldPath?: string;
}
interface FileWatcher {
    unwatch: () => void;
}
interface WatchOptions {
    pattern?: string;
    directory?: string;
}
export declare class FileManager {
    private vault;
    private cache;
    private frontmatterLock;
    constructor(vault: Vault, cache: MetadataCache);
    /**
     * Normalize a path, handling various edge cases:
     * - Remove leading/trailing slashes
     * - Convert backslashes to forward slashes
     * - Collapse double slashes
     * - Resolve relative paths (. and ..)
     */
    normalizePath(path: string): string;
    /**
     * List all files with the specified extension(s).
     * @param extension Extension(s) to filter by (without leading dot, case-insensitive)
     */
    listFilesByExtension(extension: string | string[]): TFile[];
    /**
     * Get all files in a directory.
     * @param directory The directory path
     * @param recursive Whether to include files in subdirectories
     */
    getFilesInDirectory(directory: string, recursive: boolean): TFile[];
    /**
     * Watch for file changes in the vault.
     * @param callback Callback to invoke when a file changes
     * @param options Optional filtering options
     */
    watchFileChanges(callback: (event: FileChangeEvent) => void, options?: WatchOptions): FileWatcher;
    /**
     * Get the linkpath to use for linking to a file from a source path.
     * Returns the shortest unambiguous path.
     * @param targetPath The path of the file to link to
     * @param sourcePath The path of the source file
     */
    getLinkPath(targetPath: string, sourcePath: string): string;
    /**
     * Generate a markdown link to a file from a source file.
     * Uses shortest unambiguous path (wikilink style by default).
     * @param file The target file to link to
     * @param sourcePath The path of the source file containing the link
     * @param subpath Optional subpath (heading or block reference)
     * @param alias Optional display text for the link
     */
    generateMarkdownLink(file: TFile, sourcePath: string, subpath?: string, alias?: string): string;
    /**
     * Create a new markdown file with the given content.
     * @param path The path for the new file
     * @param content The content of the file
     */
    createMarkdownFile(path: string, content: string): Promise<TFile>;
    /**
     * Process frontmatter of a file atomically.
     * @param file The file whose frontmatter to process
     * @param fn Function that receives current frontmatter and modifies it
     */
    processFrontMatter(file: TFile, fn: (frontmatter: Record<string, unknown>) => void): Promise<void>;
    /**
     * Get the relative path from a source file to a target file.
     * Used for generating relative links between files.
     * @param targetPath The path of the target file
     * @param sourcePath The path of the source file
     * @returns The relative path string
     */
    getRelativePath(targetPath: string, sourcePath: string): string;
    /**
     * Get all files that link to the specified file (backlinks).
     * Returns a Map where keys are source file paths and values are arrays of link information.
     * @param file The file to find backlinks for
     * @returns Map of source paths to link details
     */
    getBacklinks(file: TFile): Map<string, Array<{
        link: string;
        position: {
            line: number;
            col: number;
        };
    }>>;
    /**
     * Check if a link target resolves to a specific file.
     * @private
     */
    private linkResolvesToFile;
    /**
     * Update links in content, replacing old path references with new path.
     * Handles wikilinks, embeds, and preserves aliases and subpaths.
     * @param content The content to update
     * @param oldPath The old file path to replace
     * @param newPath The new file path
     * @returns The updated content
     */
    updateLinks(content: string, oldPath: string, newPath: string): string;
    /**
     * Rename a file and update all links pointing to it throughout the vault.
     * @param file The file to rename
     * @param newPath The new path for the file
     */
    renameFile(file: TFile, newPath: string): Promise<void>;
}
export {};
//# sourceMappingURL=file-manager.d.ts.map