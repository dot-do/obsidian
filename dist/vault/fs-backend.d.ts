import type { Backend, FileStat } from '../types.js';
/**
 * File system backend for reading/writing vaults from disk
 */
export declare class FileSystemBackend implements Backend {
    private basePath;
    constructor(basePath: string);
    private resolvePath;
    read(filePath: string): Promise<string>;
    readBinary(filePath: string): Promise<ArrayBuffer>;
    write(filePath: string, content: string): Promise<void>;
    writeBinary(filePath: string, content: ArrayBuffer): Promise<void>;
    delete(filePath: string): Promise<void>;
    exists(filePath: string): Promise<boolean>;
    stat(filePath: string): Promise<FileStat | null>;
    list(dirPath: string): Promise<string[]>;
    mkdir(dirPath: string): Promise<void>;
    rename(from: string, to: string): Promise<void>;
    copy(from: string, to: string): Promise<void>;
    /**
     * Recursively scan directory and return all file paths
     */
    scanDirectory(dirPath?: string): Promise<string[]>;
}
//# sourceMappingURL=fs-backend.d.ts.map