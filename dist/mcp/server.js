// JSON-RPC error codes
const ERROR_CODES = {
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
};
const SERVER_VERSION = '1.0.0';
const PROTOCOL_VERSION = '2024-11-05';
/**
 * Returns the list of available MCP tools.
 * These tools provide access to Obsidian vault functionality:
 * - vault_search: Search notes by content or filename
 * - note_read: Read note content and metadata
 * - note_create: Create new notes
 * - note_update: Update existing notes
 * - vault_list: List all markdown files
 * - graph_backlinks: Get backlinks for a note
 */
function getTools() {
    return [
        {
            name: 'vault_search',
            description: 'Search for notes in the vault by content or file name',
            inputSchema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search query to find matching notes',
                    },
                    limit: {
                        type: 'integer',
                        description: 'Maximum number of results to return',
                        minimum: 1,
                    },
                },
                required: ['query'],
            },
        },
        {
            name: 'note_read',
            description: 'Read the content of a note by its path',
            inputSchema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The path to the note file',
                    },
                },
                required: ['path'],
            },
        },
        {
            name: 'note_create',
            description: 'Create a new note with the specified content',
            inputSchema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The path for the new note file',
                    },
                    content: {
                        type: 'string',
                        description: 'The content of the note',
                    },
                },
                required: ['path', 'content'],
            },
        },
        {
            name: 'note_update',
            description: 'Update the content of an existing note',
            inputSchema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The path to the note file to update',
                    },
                    content: {
                        type: 'string',
                        description: 'The new content for the note',
                    },
                },
                required: ['path', 'content'],
            },
        },
        {
            name: 'vault_list',
            description: 'List all markdown files in the vault',
            inputSchema: {
                type: 'object',
                properties: {},
                required: [],
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
        },
    ];
}
function validateToolArgs(toolName, args) {
    if (args === null || args === undefined || typeof args !== 'object') {
        const tools = getTools();
        const tool = tools.find(t => t.name === toolName);
        if (tool && tool.inputSchema.required.length > 0) {
            return { valid: false, error: `Missing required parameter: ${tool.inputSchema.required[0]}` };
        }
        return { valid: true };
    }
    const argsObj = args;
    const tools = getTools();
    const tool = tools.find(t => t.name === toolName);
    if (!tool) {
        return { valid: true }; // Let the tool call handler deal with unknown tools
    }
    // Check required parameters
    for (const required of tool.inputSchema.required) {
        if (!(required in argsObj)) {
            return { valid: false, error: `Missing required parameter: ${required}` };
        }
    }
    // Validate parameter types
    for (const [paramName, paramSchema] of Object.entries(tool.inputSchema.properties)) {
        if (paramName in argsObj) {
            const value = argsObj[paramName];
            if (paramSchema.type === 'string' && typeof value !== 'string') {
                return { valid: false, error: `Parameter '${paramName}' must be a string` };
            }
            if (paramSchema.type === 'integer') {
                if (typeof value !== 'number' || !Number.isInteger(value)) {
                    return { valid: false, error: `Parameter '${paramName}' must be an integer` };
                }
                if (paramSchema.minimum !== undefined && value < paramSchema.minimum) {
                    return { valid: false, error: `Parameter '${paramName}' must be at least ${paramSchema.minimum}` };
                }
            }
        }
    }
    return { valid: true };
}
export function createMcpServer(options) {
    const { client } = options;
    let initialized = false;
    async function handleInitialize(request) {
        initialized = true;
        return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
                protocolVersion: PROTOCOL_VERSION,
                serverInfo: {
                    name: 'obsidian.do',
                    version: SERVER_VERSION,
                },
                capabilities: {
                    tools: {
                        listChanged: true,
                    },
                },
            },
        };
    }
    async function handleToolsList(request) {
        return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
                tools: getTools(),
            },
        };
    }
    async function handleVaultSearch(args) {
        const { query, limit } = args;
        // Handle empty query
        if (!query) {
            return {
                content: [{ type: 'text', text: JSON.stringify({ results: [] }) }],
            };
        }
        const files = client.vault.getMarkdownFiles();
        const results = [];
        const queryLower = query.toLowerCase();
        for (const file of files) {
            const content = await client.vault.read(file);
            const contentLower = content.toLowerCase();
            const filePathLower = file.path.toLowerCase();
            const matches = [];
            // Check file path
            if (filePathLower.includes(queryLower)) {
                matches.push(`File path contains "${query}"`);
            }
            // Check content
            if (contentLower.includes(queryLower)) {
                // Extract snippet around match
                const index = contentLower.indexOf(queryLower);
                const start = Math.max(0, index - 50);
                const end = Math.min(content.length, index + query.length + 50);
                const snippet = content.substring(start, end);
                matches.push(snippet);
            }
            if (matches.length > 0) {
                results.push({ path: file.path, matches });
            }
        }
        // Apply limit
        const limitedResults = limit ? results.slice(0, limit) : results;
        return {
            content: [{ type: 'text', text: JSON.stringify({ results: limitedResults }) }],
        };
    }
    async function handleNoteRead(args) {
        const { path } = args;
        const file = client.vault.getFileByPath(path);
        if (!file) {
            return {
                content: [{ type: 'text', text: `File not found: ${path}` }],
                isError: true,
            };
        }
        try {
            const content = await client.vault.read(file);
            const metadata = client.metadataCache.getFileCache(file);
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            path: file.path,
                            content,
                            metadata: metadata || null,
                        }),
                    }],
            };
        }
        catch (error) {
            return {
                content: [{ type: 'text', text: `Error reading file: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true,
            };
        }
    }
    async function handleNoteCreate(args) {
        const { path, content } = args;
        // Check if file already exists
        const existingFile = client.vault.getFileByPath(path);
        if (existingFile) {
            return {
                content: [{ type: 'text', text: `File already exists: ${path}` }],
                isError: true,
            };
        }
        try {
            const vault = client.vault;
            const file = await vault.create(path, content);
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            path: file.path,
                        }),
                    }],
            };
        }
        catch (error) {
            return {
                content: [{ type: 'text', text: `Error creating file: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true,
            };
        }
    }
    async function handleNoteUpdate(args) {
        const { path, content } = args;
        const file = client.vault.getFileByPath(path);
        if (!file) {
            return {
                content: [{ type: 'text', text: `File not found: ${path}` }],
                isError: true,
            };
        }
        try {
            const vault = client.vault;
            await vault.modify(file, content);
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            path: file.path,
                        }),
                    }],
            };
        }
        catch (error) {
            return {
                content: [{ type: 'text', text: `Error updating file: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true,
            };
        }
    }
    async function handleVaultList() {
        const files = client.vault.getMarkdownFiles();
        const paths = files.map(f => f.path);
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({ files: paths }),
                }],
        };
    }
    async function handleGraphBacklinks(args) {
        const { path, includeContext } = args;
        const file = client.vault.getFileByPath(path);
        if (!file) {
            return {
                content: [{ type: 'text', text: `File not found: ${path}` }],
                isError: true,
            };
        }
        try {
            const backlinkPaths = client.graph.getBacklinks(path);
            const backlinks = [];
            for (const blPath of backlinkPaths) {
                const blFile = client.vault.getFileByPath(blPath);
                let title;
                let context;
                if (blFile) {
                    try {
                        const content = await client.vault.read(blFile);
                        // Extract title from first heading or first line
                        const headingMatch = content.match(/^#\s+(.+)$/m);
                        title = headingMatch ? headingMatch[1].trim() : blFile.basename;
                        if (includeContext) {
                            // Find the line that contains the link to our file
                            const targetName = file.basename;
                            const lines = content.split('\n');
                            for (const line of lines) {
                                if (line.includes(`[[${targetName}]]`) || line.includes(`[[${path}]]`)) {
                                    context = line.trim();
                                    break;
                                }
                            }
                        }
                    }
                    catch {
                        title = blFile.basename;
                    }
                }
                const backlinkInfo = { path: blPath, title };
                if (includeContext && context) {
                    backlinkInfo.context = context;
                }
                backlinks.push(backlinkInfo);
            }
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            backlinks,
                            count: backlinks.length,
                        }),
                    }],
            };
        }
        catch (error) {
            return {
                content: [{ type: 'text', text: `Error getting backlinks: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true,
            };
        }
    }
    async function handleToolsCall(request) {
        const params = request.params;
        if (!params || !params.name) {
            return {
                jsonrpc: '2.0',
                id: request.id,
                error: {
                    code: ERROR_CODES.METHOD_NOT_FOUND,
                    message: 'Tool name is required',
                },
            };
        }
        const { name, arguments: args } = params;
        const tools = getTools();
        const tool = tools.find(t => t.name === name);
        if (!tool) {
            return {
                jsonrpc: '2.0',
                id: request.id,
                error: {
                    code: ERROR_CODES.METHOD_NOT_FOUND,
                    message: `Unknown tool: ${name}`,
                },
            };
        }
        // Validate arguments
        const validation = validateToolArgs(name, args);
        if (!validation.valid) {
            return {
                jsonrpc: '2.0',
                id: request.id,
                error: {
                    code: ERROR_CODES.INVALID_PARAMS,
                    message: validation.error,
                },
            };
        }
        let result;
        switch (name) {
            case 'vault_search':
                result = await handleVaultSearch(args);
                break;
            case 'note_read':
                result = await handleNoteRead(args);
                break;
            case 'note_create':
                result = await handleNoteCreate(args);
                break;
            case 'note_update':
                result = await handleNoteUpdate(args);
                break;
            case 'vault_list':
                result = await handleVaultList();
                break;
            case 'graph_backlinks':
                result = await handleGraphBacklinks(args);
                break;
            default:
                return {
                    jsonrpc: '2.0',
                    id: request.id,
                    error: {
                        code: ERROR_CODES.METHOD_NOT_FOUND,
                        message: `Unknown tool: ${name}`,
                    },
                };
        }
        return {
            jsonrpc: '2.0',
            id: request.id,
            result,
        };
    }
    async function handlePing(request) {
        return {
            jsonrpc: '2.0',
            id: request.id,
            result: {},
        };
    }
    async function handleNotificationsInitialized(request) {
        return {
            jsonrpc: '2.0',
            id: request.id,
            result: {},
        };
    }
    return {
        async handleRequest(request) {
            // Check if this is a notification (no id) - don't send a response for notifications
            if (request.id === undefined || request.id === null) {
                // Handle notifications silently
                if (request.method === 'notifications/initialized') {
                    initialized = true;
                }
                return null;
            }
            switch (request.method) {
                case 'initialize':
                    return handleInitialize(request);
                case 'tools/list':
                    return handleToolsList(request);
                case 'tools/call':
                    return handleToolsCall(request);
                case 'ping':
                    return handlePing(request);
                case 'notifications/initialized':
                    return handleNotificationsInitialized(request);
                default:
                    return {
                        jsonrpc: '2.0',
                        id: request.id,
                        error: {
                            code: ERROR_CODES.METHOD_NOT_FOUND,
                            message: `Unknown method: ${request.method}`,
                        },
                    };
            }
        },
    };
}
//# sourceMappingURL=server.js.map