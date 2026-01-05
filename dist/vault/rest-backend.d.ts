import type { Backend, FileStat } from '../types.js';
/**
 * REST API backend for reading/writing vaults via HTTP
 */
export declare class RestApiBackend implements Backend {
    private baseUrl;
    private apiKey;
    constructor(apiUrl: string, apiKey: string);
    private request;
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
}
//# sourceMappingURL=rest-backend.d.ts.map