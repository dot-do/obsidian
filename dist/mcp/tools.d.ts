/**
 * MCP Tool Definitions for obsidian-t1m
 *
 * Comprehensive tool definitions following the Model Context Protocol specification.
 * Each tool includes:
 * - name: unique identifier for the tool
 * - description: what the tool does
 * - inputSchema: JSON Schema for arguments
 * - annotations: hints for tool behavior (readOnlyHint, destructiveHint, idempotentHint)
 */
/**
 * MCP Tool Annotation interface following the MCP specification.
 * These hints help clients understand tool behavior without executing them.
 */
export interface McpToolAnnotations {
    /**
     * If true, the tool does not modify any state and only reads data.
     * Safe to call without user confirmation.
     */
    readOnlyHint?: boolean;
    /**
     * If true, the tool may perform destructive operations that could
     * result in data loss (e.g., overwriting files, deleting content).
     * Clients should confirm with users before calling.
     */
    destructiveHint?: boolean;
    /**
     * If true, calling the tool multiple times with the same arguments
     * produces the same result. Safe to retry on failure.
     */
    idempotentHint?: boolean;
    /**
     * If true, the tool may take a long time to complete.
     * Clients should indicate progress to users.
     */
    openWorldHint?: boolean;
}
/**
 * JSON Schema property definition for tool input parameters.
 */
export interface McpSchemaProperty {
    type: 'string' | 'integer' | 'number' | 'boolean' | 'object' | 'array';
    description: string;
    minimum?: number;
    maximum?: number;
    default?: unknown;
    enum?: string[];
    items?: McpSchemaProperty;
    properties?: Record<string, McpSchemaProperty>;
    required?: string[];
}
/**
 * MCP Tool Definition interface following the MCP specification.
 */
export interface McpToolDefinition {
    /** Unique identifier for the tool */
    name: string;
    /** Human-readable description of what the tool does */
    description: string;
    /** JSON Schema defining the tool's input parameters */
    inputSchema: {
        type: 'object';
        properties: Record<string, McpSchemaProperty>;
        required?: string[];
    };
    /** Behavioral hints for the tool */
    annotations?: McpToolAnnotations;
}
/**
 * Search notes in the vault by content or filename.
 * Returns matching notes with relevance scores and snippets.
 */
export declare const vaultSearchTool: McpToolDefinition;
/**
 * List all notes in the vault or a specific folder.
 * Returns file paths, names, and metadata.
 */
export declare const vaultListTool: McpToolDefinition;
/**
 * Read the content and metadata of a note.
 */
export declare const noteReadTool: McpToolDefinition;
/**
 * Create a new note with specified content and optional frontmatter.
 */
export declare const noteCreateTool: McpToolDefinition;
/**
 * Update the entire content of an existing note.
 * This is a destructive operation that replaces all content.
 */
export declare const noteUpdateTool: McpToolDefinition;
/**
 * Append content to an existing note.
 * Non-destructive operation that adds content without overwriting.
 */
export declare const noteAppendTool: McpToolDefinition;
/**
 * Update the frontmatter metadata of a note.
 */
export declare const frontmatterUpdateTool: McpToolDefinition;
/**
 * Get all backlinks (incoming links) to a note.
 */
export declare const graphBacklinksTool: McpToolDefinition;
/**
 * Get all forward links (outgoing links) from a note.
 */
export declare const graphForwardLinksTool: McpToolDefinition;
/**
 * Get neighbor notes in the knowledge graph.
 */
export declare const graphNeighborsTool: McpToolDefinition;
/**
 * Generate context from the vault for a given scope.
 */
export declare const vaultContextTool: McpToolDefinition;
/**
 * Array of all available MCP tool definitions.
 * Ordered with read-only tools first, then write tools, then destructive tools.
 */
export declare const obsidianTools: McpToolDefinition[];
/**
 * Get a tool definition by name.
 */
export declare function getToolByName(name: string): McpToolDefinition | undefined;
/**
 * Get all read-only tools (safe for unauthenticated access).
 */
export declare function getReadOnlyTools(): McpToolDefinition[];
/**
 * Get all write tools (require authentication).
 */
export declare function getWriteTools(): McpToolDefinition[];
/**
 * Get all destructive tools (require extra confirmation).
 */
export declare function getDestructiveTools(): McpToolDefinition[];
/**
 * Validate tool arguments against the tool's input schema.
 * Returns validation result with any errors found.
 */
export declare function validateToolArgs(toolName: string, args: unknown): {
    valid: true;
} | {
    valid: false;
    error: string;
};
//# sourceMappingURL=tools.d.ts.map