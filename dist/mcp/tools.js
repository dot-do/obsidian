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
 * Search notes in the vault by content or filename.
 * Returns matching notes with relevance scores and snippets.
 */
export const vaultSearchTool = {
    name: 'vault_search',
    description: 'Search for notes in the vault by content or filename. Returns matching notes with relevance scores and contextual snippets. Supports filtering by tags.',
    inputSchema: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'The search query to find matching notes. Searches both content and filenames.',
            },
            limit: {
                type: 'integer',
                description: 'Maximum number of results to return (default: 50)',
                minimum: 1,
                maximum: 100,
            },
            filter: {
                type: 'object',
                description: 'Optional filter criteria to narrow search results',
                properties: {
                    tags: {
                        type: 'array',
                        description: 'Only include notes that have all specified tags',
                        items: {
                            type: 'string',
                            description: 'Tag name (with or without # prefix)',
                        },
                    },
                },
            },
        },
        required: ['query'],
    },
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
    },
};
/**
 * List all notes in the vault or a specific folder.
 * Returns file paths, names, and metadata.
 */
export const vaultListTool = {
    name: 'vault_list',
    description: 'List all markdown files in the vault or a specific folder. Returns file paths, names, and basic metadata like modification time and size.',
    inputSchema: {
        type: 'object',
        properties: {
            folder: {
                type: 'string',
                description: 'The folder path to list contents from. If not specified, lists from vault root.',
            },
            recursive: {
                type: 'boolean',
                description: 'Whether to recursively list all nested files and folders (default: true)',
                default: true,
            },
        },
    },
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
    },
};
/**
 * Read the content and metadata of a note.
 */
export const noteReadTool = {
    name: 'note_read',
    description: 'Read the content of a note at the specified path. Returns the full content along with parsed metadata including frontmatter, headings, and links.',
    inputSchema: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'The path to the note to read (e.g., "folder/note.md")',
            },
            includeMetadata: {
                type: 'boolean',
                description: 'Whether to include parsed frontmatter metadata in the response (default: true)',
                default: true,
            },
            includeBacklinks: {
                type: 'boolean',
                description: 'Whether to include a list of notes that link to this note',
                default: false,
            },
        },
        required: ['path'],
    },
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
    },
};
/**
 * Create a new note with specified content and optional frontmatter.
 */
export const noteCreateTool = {
    name: 'note_create',
    description: 'Create a new note at the specified path with the given content. Optionally include frontmatter metadata. Fails if a note already exists at the path.',
    inputSchema: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'The path where the new note should be created (must end with .md)',
            },
            content: {
                type: 'string',
                description: 'The markdown content to write to the new note',
            },
            frontmatter: {
                type: 'object',
                description: 'Optional frontmatter metadata to include at the top of the note (e.g., tags, title, date)',
            },
        },
        required: ['path', 'content'],
    },
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
    },
};
/**
 * Update the entire content of an existing note.
 * This is a destructive operation that replaces all content.
 */
export const noteUpdateTool = {
    name: 'note_update',
    description: 'Update the entire content of an existing note, replacing its current content completely. Use note_append for adding content without overwriting.',
    inputSchema: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'The path to the note to update',
            },
            content: {
                type: 'string',
                description: 'The new content that will replace the existing note content',
            },
        },
        required: ['path', 'content'],
    },
    annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
    },
};
/**
 * Append content to an existing note.
 * Non-destructive operation that adds content without overwriting.
 */
export const noteAppendTool = {
    name: 'note_append',
    description: 'Append content to an existing note at a specified position. Can append at the end, start, or after frontmatter.',
    inputSchema: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'The path to the note to append to',
            },
            content: {
                type: 'string',
                description: 'The content to append to the note',
            },
            position: {
                type: 'string',
                description: 'Where to append the content',
                enum: ['end', 'after-frontmatter'],
                default: 'end',
            },
        },
        required: ['path', 'content'],
    },
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
    },
};
/**
 * Update the frontmatter metadata of a note.
 */
export const frontmatterUpdateTool = {
    name: 'frontmatter_update',
    description: 'Update the frontmatter (YAML metadata) of a note. Can merge with existing frontmatter or replace it entirely.',
    inputSchema: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'The path to the note to update frontmatter for',
            },
            frontmatter: {
                type: 'object',
                description: 'The frontmatter properties to set or update (e.g., { "tags": ["project"], "status": "draft" })',
            },
            merge: {
                type: 'boolean',
                description: 'If true, merge with existing frontmatter; if false, replace entirely (default: true)',
                default: true,
            },
        },
        required: ['path', 'frontmatter'],
    },
    annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
    },
};
/**
 * Get all backlinks (incoming links) to a note.
 */
export const graphBacklinksTool = {
    name: 'graph_backlinks',
    description: 'Get all backlinks pointing to a note. Returns a list of notes that contain links to the specified note, with optional context showing where the link appears.',
    inputSchema: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'The path to the note to find backlinks for',
            },
            includeContext: {
                type: 'boolean',
                description: 'Whether to include the surrounding context/line where each backlink appears',
                default: false,
            },
        },
        required: ['path'],
    },
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
    },
};
/**
 * Get all forward links (outgoing links) from a note.
 */
export const graphForwardLinksTool = {
    name: 'graph_forward_links',
    description: 'Get all forward links from a note. Returns notes that the specified note links to, including link counts and optionally unresolved (broken) links.',
    inputSchema: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'The path to the note to find outgoing links from',
            },
            includeUnresolved: {
                type: 'boolean',
                description: 'Whether to include unresolved (broken) links that point to non-existent notes',
                default: false,
            },
        },
        required: ['path'],
    },
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
    },
};
/**
 * Get neighbor notes in the knowledge graph.
 */
export const graphNeighborsTool = {
    name: 'graph_neighbors',
    description: 'Get neighbor notes in the knowledge graph within a specified depth. Traverses both incoming and outgoing links to find related notes.',
    inputSchema: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'The path to the note to find neighbors for',
            },
            depth: {
                type: 'integer',
                description: 'How many hops to traverse in the graph (default: 1, max: 10)',
                minimum: 1,
                maximum: 10,
                default: 1,
            },
            direction: {
                type: 'string',
                description: 'The direction to traverse links',
                enum: ['incoming', 'outgoing', 'both'],
                default: 'both',
            },
        },
        required: ['path'],
    },
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
    },
};
/**
 * Generate context from the vault for a given scope.
 */
export const vaultContextTool = {
    name: 'vault_context',
    description: 'Generate context from the vault based on a scope. Useful for gathering relevant content for AI context windows. Supports scopes like "all", "folder:path", "tag:name", "recent:7d", "linked:note.md".',
    inputSchema: {
        type: 'object',
        properties: {
            scope: {
                type: 'string',
                description: 'The scope to gather context from. Options: "all" (entire vault), "folder:path" (specific folder), "tag:name" (notes with tag), "recent:Nd" (notes modified in last N days), "linked:path" (notes linked to/from a note)',
            },
            maxTokens: {
                type: 'integer',
                description: 'Maximum approximate tokens to include in the context (for AI context window management)',
                minimum: 100,
                maximum: 100000,
            },
        },
        required: ['scope'],
    },
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
    },
};
/**
 * Array of all available MCP tool definitions.
 * Ordered with read-only tools first, then write tools, then destructive tools.
 */
export const obsidianTools = [
    // Read-only tools (safe operations)
    vaultSearchTool,
    vaultListTool,
    noteReadTool,
    graphBacklinksTool,
    graphForwardLinksTool,
    graphNeighborsTool,
    vaultContextTool,
    // Write tools (create/append - non-destructive)
    noteCreateTool,
    noteAppendTool,
    // Destructive tools (update/replace operations)
    noteUpdateTool,
    frontmatterUpdateTool,
];
/**
 * Get a tool definition by name.
 */
export function getToolByName(name) {
    return obsidianTools.find(tool => tool.name === name);
}
/**
 * Get all read-only tools (safe for unauthenticated access).
 */
export function getReadOnlyTools() {
    return obsidianTools.filter(tool => tool.annotations?.readOnlyHint === true);
}
/**
 * Get all write tools (require authentication).
 */
export function getWriteTools() {
    return obsidianTools.filter(tool => tool.annotations?.readOnlyHint !== true);
}
/**
 * Get all destructive tools (require extra confirmation).
 */
export function getDestructiveTools() {
    return obsidianTools.filter(tool => tool.annotations?.destructiveHint === true);
}
/**
 * Validate tool arguments against the tool's input schema.
 * Returns validation result with any errors found.
 */
export function validateToolArgs(toolName, args) {
    const tool = getToolByName(toolName);
    if (!tool) {
        return { valid: false, error: `Unknown tool: ${toolName}` };
    }
    // Handle null/undefined args
    if (args === null || args === undefined || typeof args !== 'object') {
        const required = tool.inputSchema.required || [];
        if (required.length > 0) {
            return { valid: false, error: `Missing required parameter: ${required[0]}` };
        }
        return { valid: true };
    }
    const argsObj = args;
    const { properties, required = [] } = tool.inputSchema;
    // Check required parameters
    for (const requiredParam of required) {
        if (!(requiredParam in argsObj)) {
            return { valid: false, error: `Missing required parameter: ${requiredParam}` };
        }
    }
    // Validate parameter types and constraints
    for (const [paramName, paramSchema] of Object.entries(properties)) {
        if (!(paramName in argsObj)) {
            continue; // Skip optional params that aren't provided
        }
        const value = argsObj[paramName];
        // Type validation
        switch (paramSchema.type) {
            case 'string':
                if (typeof value !== 'string') {
                    return { valid: false, error: `Parameter '${paramName}' must be a string` };
                }
                // Validate enum if present
                if (paramSchema.enum && !paramSchema.enum.includes(value)) {
                    return {
                        valid: false,
                        error: `Parameter '${paramName}' must be one of: ${paramSchema.enum.join(', ')}`,
                    };
                }
                break;
            case 'integer':
                if (typeof value !== 'number' || !Number.isInteger(value)) {
                    return { valid: false, error: `Parameter '${paramName}' must be an integer` };
                }
                if (paramSchema.minimum !== undefined && value < paramSchema.minimum) {
                    return { valid: false, error: `Parameter '${paramName}' must be at least ${paramSchema.minimum}` };
                }
                if (paramSchema.maximum !== undefined && value > paramSchema.maximum) {
                    return { valid: false, error: `Parameter '${paramName}' must be at most ${paramSchema.maximum}` };
                }
                break;
            case 'number':
                if (typeof value !== 'number') {
                    return { valid: false, error: `Parameter '${paramName}' must be a number` };
                }
                if (paramSchema.minimum !== undefined && value < paramSchema.minimum) {
                    return { valid: false, error: `Parameter '${paramName}' must be at least ${paramSchema.minimum}` };
                }
                if (paramSchema.maximum !== undefined && value > paramSchema.maximum) {
                    return { valid: false, error: `Parameter '${paramName}' must be at most ${paramSchema.maximum}` };
                }
                break;
            case 'boolean':
                if (typeof value !== 'boolean') {
                    return { valid: false, error: `Parameter '${paramName}' must be a boolean` };
                }
                break;
            case 'object':
                if (typeof value !== 'object' || value === null || Array.isArray(value)) {
                    return { valid: false, error: `Parameter '${paramName}' must be an object` };
                }
                break;
            case 'array':
                if (!Array.isArray(value)) {
                    return { valid: false, error: `Parameter '${paramName}' must be an array` };
                }
                break;
        }
    }
    return { valid: true };
}
//# sourceMappingURL=tools.js.map