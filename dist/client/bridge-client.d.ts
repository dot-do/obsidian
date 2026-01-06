/**
 * Bridge Client - WebSocket client for connecting to Obsidian Bridge plugin
 *
 * Provides the same interface as ObsidianClient but uses the Bridge plugin
 * for live Obsidian data instead of filesystem access.
 */
/**
 * Check if the Bridge plugin is available
 */
export declare function isBridgeAvailable(port?: number): Promise<boolean>;
/**
 * BridgeClient - WebSocket client for Obsidian Bridge plugin
 */
export declare class BridgeClient {
    private port;
    private ws;
    private requestId;
    private pendingRequests;
    private connected;
    constructor(port?: number);
    /**
     * Connect to the Bridge plugin
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the Bridge plugin
     */
    disconnect(): void;
    /**
     * Check if connected
     */
    isConnected(): boolean;
    /**
     * Send a request and wait for response
     */
    private request;
    /**
     * Send a notification (no response expected)
     */
    private notify;
    /**
     * Call a tool on the Bridge
     */
    callTool(name: string, args?: Record<string, unknown>): Promise<unknown>;
    /**
     * Search notes in the vault
     */
    search(query: string, options?: {
        limit?: number;
    }): Promise<Array<{
        path: string;
        score: number;
        excerpt: string;
    }>>;
    /**
     * List files in the vault
     */
    list(path?: string, recursive?: boolean): Promise<Array<{
        path: string;
        type: string;
    }>>;
    /**
     * Read a note
     */
    readNote(path: string, options?: {
        includeBacklinks?: boolean;
        includeMetadata?: boolean;
    }): Promise<{
        path: string;
        content: string;
        metadata?: Record<string, unknown>;
        backlinks?: Array<{
            path: string;
            count: number;
        }>;
    }>;
    /**
     * Create a note
     */
    createNote(path: string, content: string, frontmatter?: Record<string, unknown>): Promise<{
        path: string;
        created: boolean;
    }>;
    /**
     * Update a note
     */
    updateNote(path: string, content: string): Promise<{
        path: string;
        updated: boolean;
    }>;
    /**
     * Get backlinks for a note
     */
    getBacklinks(path: string): Promise<Array<{
        path: string;
        count: number;
    }>>;
    /**
     * Get vault context
     */
    getContext(options?: {
        scope?: string;
    }): Promise<{
        summary: string;
        recentNotes: Array<{
            path: string;
            mtime: number;
        }>;
        tagCloud: Array<{
            tag: string;
            count: number;
        }>;
    }>;
}
/**
 * Create a BridgeClient and connect, or return null if unavailable
 */
export declare function createBridgeClient(port?: number): Promise<BridgeClient | null>;
//# sourceMappingURL=bridge-client.d.ts.map