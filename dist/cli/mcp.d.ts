/**
 * MCP Command - Start an MCP server on stdio
 *
 * This command starts an MCP (Model Context Protocol) server that
 * reads JSON-RPC requests from stdin and writes responses to stdout.
 */
export interface McpCommandOptions {
    vaultPath: string;
}
/**
 * Run the MCP server on stdio
 *
 * @param options - Command options including vault path
 */
export declare function runMcpCommand(options: McpCommandOptions): Promise<void>;
//# sourceMappingURL=mcp.d.ts.map