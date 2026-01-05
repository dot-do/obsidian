import type { Backend, FileStat, EventRef } from '../types.js';
type BackendEventCallback = (path: string) => void;
export declare class MemoryBackend implements Backend {
    files: Map<string, string | ArrayBuffer>;
    private stats;
    private eventListeners;
    constructor(initialFiles?: Record<string, string>);
    read(path: string): Promise<string>;
    readBinary(path: string): Promise<ArrayBuffer>;
    write(path: string, content: string): Promise<void>;
    writeBinary(path: string, content: ArrayBuffer): Promise<void>;
    delete(path: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    stat(path: string): Promise<FileStat | null>;
    list(path: string): Promise<string[]>;
    mkdir(_path: string): Promise<void>;
    rename(from: string, to: string): Promise<void>;
    copy(from: string, to: string): Promise<void>;
    on(event: string, callback: BackendEventCallback): EventRef;
    off(event: string, ref: EventRef): void;
    trigger(event: string, ...args: string[]): void;
}
export {};
//# sourceMappingURL=memory-backend.d.ts.map