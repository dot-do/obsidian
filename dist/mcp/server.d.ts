import type { ObsidianClient } from '../client/client.js';
/**
 * MCP (Model Context Protocol) Request interface.
 * Represents a JSON-RPC 2.0 request message.
 */
export interface McpRequest {
    jsonrpc: '2.0';
    id: number;
    method: string;
    params: unknown;
}
/**
 * MCP Response interface.
 * Represents a JSON-RPC 2.0 response message.
 */
export interface McpResponse {
    jsonrpc: '2.0';
    id: number;
    result?: unknown;
    error?: {
        code: number;
        message: string;
    };
}
/**
 * ObsidianMcpServer interface.
 * Defines the contract for the MCP server that handles JSON-RPC requests.
 */
export interface ObsidianMcpServer {
    handleRequest(request: McpRequest): Promise<McpResponse | null>;
}
export declare function createMcpServer(options: {
    client: ObsidianClient;
}): ObsidianMcpServer;
//# sourceMappingURL=server.d.ts.map