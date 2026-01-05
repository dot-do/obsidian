/**
 * HTTP Server for REST API access to Obsidian vault
 * Task: obsidian-39h
 *
 * Provides endpoints for:
 * - /health - Health check
 * - /api/search - Search notes
 * - /api/notes/:path - CRUD operations on notes
 * - /api/backlinks/:path - Get backlinks for a note
 */
import { Hono } from 'hono';
import { Vault } from '../vault/vault.js';
import { FileSystemBackend } from '../vault/fs-backend.js';
import { MetadataCache } from '../metadata/cache.js';
import { SearchEngine } from '../search/engine.js';
import { GraphEngine } from '../graph/engine.js';
export interface ServeOptions {
    /** Port to listen on (default: 3000) */
    port: number;
    /** Host to bind to (default: 127.0.0.1) */
    host: string;
    /** Path to the vault directory */
    vaultPath: string;
    /** CORS origin configuration (default: 'http://localhost:*' for localhost origins only) */
    corsOrigin?: string | string[];
}
export interface VaultServerContext {
    vault: Vault;
    cache: MetadataCache;
    searchEngine: SearchEngine;
    graphEngine: GraphEngine;
    backend: FileSystemBackend;
    /** CORS origin configuration */
    corsOrigin?: string | string[];
}
/**
 * Create a Hono app configured with vault endpoints
 */
export declare function createServer(context: VaultServerContext): Hono;
/**
 * HTTP server wrapper with lifecycle management
 */
export declare class VaultServer {
    private options;
    private server;
    private vault;
    private cache;
    private searchEngine;
    private graphEngine;
    private backend;
    private app;
    constructor(options: ServeOptions);
    /**
     * Initialize the vault by scanning all files
     */
    initialize(): Promise<void>;
    /**
     * Start the HTTP server
     */
    start(): Promise<void>;
    /**
     * Stop the HTTP server
     */
    stop(): Promise<void>;
}
/**
 * Start the serve command
 */
export declare function serve(options: Partial<ServeOptions> & {
    vaultPath: string;
}): Promise<VaultServer>;
/**
 * Main entry point for CLI serve command
 */
export declare function main(args: string[], flags: Record<string, string | boolean>): Promise<number>;
//# sourceMappingURL=serve.d.ts.map