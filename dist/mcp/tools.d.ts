/**
 * MCP Tool Definitions for obsidian.do
 *
 * Defines the available tools exposed via the Model Context Protocol.
 */
export interface McpTool {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
    annotations?: {
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
    };
}
export declare const obsidianTools: McpTool[];
//# sourceMappingURL=tools.d.ts.map