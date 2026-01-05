/**
 * MCP Tool Definitions for obsidian.do
 *
 * Defines the available tools exposed via the Model Context Protocol.
 */
export const obsidianTools = [
    // Read-only tools first
    {
        name: 'vault_search',
        description: 'Search the vault for notes matching a query string. Returns matching notes with relevance scores.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The search query to find matching notes in the vault',
                },
                limit: {
                    type: 'integer',
                    description: 'Maximum number of results to return',
                    minimum: 1,
                },
                filter: {
                    type: 'object',
                    description: 'Optional filter criteria to narrow search results',
                },
            },
            required: ['query'],
        },
        annotations: {
            readOnlyHint: true,
        },
    },
    {
        name: 'vault_list',
        description: 'List files and folders in the vault. Can recursively list contents.',
        inputSchema: {
            type: 'object',
            properties: {
                folder: {
                    type: 'string',
                    description: 'The folder path to list contents from (defaults to root)',
                },
                recursive: {
                    type: 'boolean',
                    description: 'Whether to recursively list all nested files and folders',
                },
            },
        },
        annotations: {
            readOnlyHint: true,
        },
    },
    {
        name: 'note_read',
        description: 'Read the content of a note at the specified path.',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'The path to the note to read',
                },
                includeMetadata: {
                    type: 'boolean',
                    description: 'Whether to include parsed frontmatter metadata in the response',
                },
            },
            required: ['path'],
        },
        annotations: {
            readOnlyHint: true,
        },
    },
    {
        name: 'graph_backlinks',
        description: 'Get all backlinks pointing to a note. Returns notes that link to the specified note.',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'The path to the note to find backlinks for',
                },
                includeContext: {
                    type: 'boolean',
                    description: 'Whether to include the surrounding context of each backlink',
                },
            },
            required: ['path'],
        },
        annotations: {
            readOnlyHint: true,
        },
    },
    {
        name: 'graph_forward_links',
        description: 'Get all forward links from a note. Returns notes that the specified note links to.',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'The path to the note to find outgoing links from',
                },
                includeUnresolved: {
                    type: 'boolean',
                    description: 'Whether to include unresolved (broken) links in the results',
                },
            },
            required: ['path'],
        },
        annotations: {
            readOnlyHint: true,
        },
    },
    {
        name: 'graph_neighbors',
        description: 'Get neighbor notes in the graph within a specified depth.',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'The path to the note to find neighbors for',
                },
                depth: {
                    type: 'integer',
                    description: 'The depth of neighbors to traverse in the graph',
                    minimum: 1,
                },
                direction: {
                    type: 'string',
                    description: 'The direction to traverse: "incoming", "outgoing", or "both"',
                },
            },
            required: ['path'],
        },
        annotations: {
            readOnlyHint: true,
        },
    },
    {
        name: 'vault_context',
        description: 'Get context from the vault based on a scope. Returns relevant content for the specified scope.',
        inputSchema: {
            type: 'object',
            properties: {
                scope: {
                    type: 'string',
                    description: 'The scope to gather context from (e.g., "note", "folder", "vault")',
                },
                maxTokens: {
                    type: 'integer',
                    description: 'Maximum number of tokens to include in the context',
                    minimum: 1,
                },
            },
            required: ['scope'],
        },
        annotations: {
            readOnlyHint: true,
        },
    },
    // Write tools (non-destructive)
    {
        name: 'note_create',
        description: 'Create a new note at the specified path with the given content.',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'The path where the new note should be created',
                },
                content: {
                    type: 'string',
                    description: 'The content to write to the new note',
                },
                frontmatter: {
                    type: 'object',
                    description: 'Optional frontmatter metadata to include in the note',
                },
            },
            required: ['path', 'content'],
        },
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
        },
    },
    {
        name: 'note_append',
        description: 'Append content to an existing note at the specified position.',
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
                    description: 'Where to append the content: "end", "start", or "after-frontmatter"',
                },
            },
            required: ['path', 'content'],
        },
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
        },
    },
    // Destructive tools
    {
        name: 'note_update',
        description: 'Update the entire content of an existing note, replacing its current content.',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'The path to the note to update',
                },
                content: {
                    type: 'string',
                    description: 'The new content to replace the existing note content',
                },
            },
            required: ['path', 'content'],
        },
        annotations: {
            readOnlyHint: false,
            destructiveHint: true,
        },
    },
    {
        name: 'frontmatter_update',
        description: 'Update the frontmatter metadata of a note.',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'The path to the note to update frontmatter for',
                },
                frontmatter: {
                    type: 'object',
                    description: 'The frontmatter properties to set or update',
                },
                merge: {
                    type: 'boolean',
                    description: 'Whether to merge with existing frontmatter or replace entirely',
                },
            },
            required: ['path', 'frontmatter'],
        },
        annotations: {
            readOnlyHint: false,
            destructiveHint: true,
        },
    },
];
//# sourceMappingURL=tools.js.map