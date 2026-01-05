// CLI for obsidian.do - headless vault operations
import * as fs from 'fs/promises';
import * as path from 'path';
import { Vault } from '../vault/vault.js';
import { MetadataCache } from '../metadata/cache.js';
import { SearchEngine } from '../search/engine.js';
import { GraphEngine } from '../graph/engine.js';
import { prepareFuzzySearch } from '../search/search.js';
const VERSION = '0.1.0';
/**
 * Filesystem backend for CLI operations
 */
class FileSystemBackend {
    basePath;
    files = new Map();
    constructor(basePath) {
        this.basePath = basePath;
    }
    resolvePath(filePath) {
        return path.join(this.basePath, filePath);
    }
    async read(filePath) {
        const fullPath = this.resolvePath(filePath);
        return fs.readFile(fullPath, 'utf-8');
    }
    async readBinary(filePath) {
        const fullPath = this.resolvePath(filePath);
        const buffer = await fs.readFile(fullPath);
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }
    async write(filePath, content) {
        const fullPath = this.resolvePath(filePath);
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
        // Update files map for vault sync
        this.files.set(filePath, content);
    }
    async writeBinary(filePath, content) {
        const fullPath = this.resolvePath(filePath);
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fullPath, Buffer.from(content));
        this.files.set(filePath, content);
    }
    async delete(filePath) {
        const fullPath = this.resolvePath(filePath);
        await fs.unlink(fullPath);
        this.files.delete(filePath);
    }
    async exists(filePath) {
        const fullPath = this.resolvePath(filePath);
        try {
            await fs.access(fullPath);
            return true;
        }
        catch {
            return false;
        }
    }
    async stat(filePath) {
        const fullPath = this.resolvePath(filePath);
        try {
            const stats = await fs.stat(fullPath);
            return {
                ctime: stats.ctimeMs,
                mtime: stats.mtimeMs,
                size: stats.size
            };
        }
        catch {
            return null;
        }
    }
    async list(dirPath) {
        const fullPath = this.resolvePath(dirPath);
        try {
            return await fs.readdir(fullPath);
        }
        catch {
            return [];
        }
    }
    async mkdir(dirPath) {
        const fullPath = this.resolvePath(dirPath);
        await fs.mkdir(fullPath, { recursive: true });
    }
    async rename(from, to) {
        const fromPath = this.resolvePath(from);
        const toPath = this.resolvePath(to);
        const dir = path.dirname(toPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.rename(fromPath, toPath);
    }
    async copy(from, to) {
        const fromPath = this.resolvePath(from);
        const toPath = this.resolvePath(to);
        const dir = path.dirname(toPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.copyFile(fromPath, toPath);
    }
    /**
     * Scan directory recursively to populate files map
     */
    async scan(dirPath = '') {
        const fullPath = this.resolvePath(dirPath);
        try {
            const entries = await fs.readdir(fullPath, { withFileTypes: true });
            for (const entry of entries) {
                const relativePath = dirPath ? `${dirPath}/${entry.name}` : entry.name;
                if (entry.isDirectory()) {
                    // Skip hidden directories
                    if (!entry.name.startsWith('.')) {
                        await this.scan(relativePath);
                    }
                }
                else if (entry.isFile() && entry.name.endsWith('.md')) {
                    try {
                        const content = await this.read(relativePath);
                        this.files.set(relativePath, content);
                    }
                    catch {
                        // Skip files that can't be read
                    }
                }
            }
        }
        catch {
            // Directory doesn't exist or can't be read
        }
    }
}
function parseArgs(args) {
    const result = {
        command: '',
        positional: [],
        flags: {
            help: false,
            version: false,
            json: false,
            backlinks: false,
            count: false
        }
    };
    let i = 0;
    while (i < args.length) {
        const arg = args[i];
        if (arg === '--help' || arg === '-h') {
            result.flags.help = true;
        }
        else if (arg === '--version' || arg === '-v') {
            result.flags.version = true;
        }
        else if (arg === '--json') {
            result.flags.json = true;
        }
        else if (arg === '--backlinks') {
            result.flags.backlinks = true;
        }
        else if (arg === '--count') {
            result.flags.count = true;
        }
        else if (arg === '--tags') {
            i++;
            result.flags.tags = args[i];
        }
        else if (arg === '--content') {
            i++;
            result.flags.content = args[i];
        }
        else if (arg === '--vault') {
            i++;
            result.flags.vault = args[i];
        }
        else if (arg === '--depth') {
            i++;
            result.flags.depth = parseInt(args[i], 10);
        }
        else if (!arg.startsWith('-')) {
            if (!result.command) {
                result.command = arg;
            }
            else {
                result.positional.push(arg);
            }
        }
        i++;
    }
    return result;
}
/**
 * Check if two strings are a typo match using Levenshtein distance.
 * Returns true if the strings are similar enough (within edit distance threshold).
 */
function isTypoMatch(query, target) {
    // For short strings, be more strict
    if (query.length < 3 || target.length < 3) {
        return false;
    }
    // Length difference should not be too large
    const lenDiff = Math.abs(query.length - target.length);
    if (lenDiff > 2) {
        return false;
    }
    // Calculate Levenshtein distance
    const distance = levenshteinDistance(query, target);
    // Allow 1 edit for strings up to 5 chars, 2 edits for longer strings
    const maxDistance = query.length <= 5 ? 1 : 2;
    return distance <= maxDistance;
}
/**
 * Calculate Levenshtein distance between two strings.
 */
function levenshteinDistance(a, b) {
    const m = a.length;
    const n = b.length;
    // Create a matrix
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    // Initialize first row and column
    for (let i = 0; i <= m; i++)
        dp[i][0] = i;
    for (let j = 0; j <= n; j++)
        dp[0][j] = j;
    // Fill in the matrix
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            }
            else {
                dp[i][j] = 1 + Math.min(dp[i - 1][j], // deletion
                dp[i][j - 1], // insertion
                dp[i - 1][j - 1] // substitution
                );
            }
        }
    }
    return dp[m][n];
}
function getHelpText(command) {
    if (command === 'search') {
        return `obsidian search - Search for notes in your vault

Usage: obsidian search <query> [options]

Arguments:
  query       The search query string

Options:
  --tags <tags>   Filter by tags (comma-separated)
  --json          Output in JSON format
  --help          Show this help message
`;
    }
    if (command === 'read') {
        return `obsidian read - Read a note from your vault

Usage: obsidian read <file> [options]

Arguments:
  file        Path to the file to read

Options:
  --backlinks    Include backlinks to this file
  --json         Output in JSON format
  --help         Show this help message
`;
    }
    if (command === 'create') {
        return `obsidian create - Create a new note

Usage: obsidian create <path> [options]

Arguments:
  path        Path for the new file

Options:
  --content <content>   Content for the new file
  --tags <tags>         Tags to add (comma-separated)
  --json                Output in JSON format
  --help                Show this help message
`;
    }
    if (command === 'backlinks') {
        return `obsidian backlinks - Show backlinks to a file

Usage: obsidian backlinks <file> [options]

Arguments:
  file        Path to the file

Options:
  --depth <n>   Show backlinks up to depth n
  --json        Output in JSON format
  --help        Show this help message
`;
    }
    return `obsidian - Headless vault operations

Usage: obsidian <command> [options]

Commands:
  search      Search for notes in your vault
  read        Read a note from your vault
  create      Create a new note
  backlinks   Show backlinks to a file
  list        List files in your vault
  tags        List all tags in your vault

Options:
  --vault <path>   Path to the vault
  --help           Show this help message
  --version        Show version number
`;
}
/**
 * Run the obsidian.do CLI with the given arguments
 * @param args - Command line arguments (without 'obsidian' prefix)
 * @param options - CLI options including vault path
 * @returns CLI result with exit code, stdout, and stderr
 */
export async function runCli(args, options) {
    const parsed = parseArgs(args);
    // Handle --vault flag in args
    const vaultPath = parsed.flags.vault || options?.vaultPath;
    // Handle global flags
    if (parsed.flags.version) {
        return { exitCode: 0, stdout: VERSION + '\n', stderr: '' };
    }
    if (parsed.flags.help && !parsed.command) {
        return { exitCode: 0, stdout: getHelpText(), stderr: '' };
    }
    // MCP command is special - it runs as a server
    if (parsed.command === 'mcp') {
        // Resolve vault path with defaults
        const mcpVaultPath = vaultPath || process.env.OBSIDIAN_VAULT || process.cwd();
        const { runMcpCommand } = await import('./mcp.js');
        await runMcpCommand({ vaultPath: mcpVaultPath });
        return { exitCode: 0, stdout: '', stderr: '' };
    }
    // Validate vault path
    if (!vaultPath) {
        return { exitCode: 1, stdout: '', stderr: 'Error: No vault path specified. Use --vault <path> or provide vaultPath option.\n' };
    }
    // Check vault exists
    try {
        const stat = await fs.stat(vaultPath);
        if (!stat.isDirectory()) {
            return { exitCode: 1, stdout: '', stderr: `Error: Vault path is not a directory: ${vaultPath}\n` };
        }
    }
    catch {
        return { exitCode: 1, stdout: '', stderr: `Error: Vault path not found: ${vaultPath}\n` };
    }
    // Initialize vault infrastructure
    const backend = new FileSystemBackend(vaultPath);
    await backend.scan();
    const vault = new Vault(backend);
    const cache = new MetadataCache(vault);
    await cache.initialize();
    const searchEngine = new SearchEngine(vault, cache);
    const graphEngine = new GraphEngine(cache);
    // Handle command help
    if (parsed.flags.help && parsed.command) {
        return { exitCode: 0, stdout: getHelpText(parsed.command), stderr: '' };
    }
    // Route to command handlers
    switch (parsed.command) {
        case 'search':
            return handleSearch(parsed, vault, cache, searchEngine);
        case 'read':
            return handleRead(parsed, vault, cache, graphEngine, vaultPath);
        case 'create':
            return handleCreate(parsed, vault, vaultPath);
        case 'backlinks':
            return handleBacklinks(parsed, vault, cache, graphEngine, vaultPath);
        case 'list':
            return handleList(parsed, vault, vaultPath);
        case 'tags':
            return handleTags(parsed, vault, cache);
        default:
            if (parsed.command) {
                return { exitCode: 1, stdout: '', stderr: `Error: Unknown command '${parsed.command}'\n` };
            }
            return { exitCode: 0, stdout: getHelpText(), stderr: '' };
    }
}
async function handleSearch(parsed, vault, cache, searchEngine) {
    const query = parsed.positional[0];
    if (!query) {
        return { exitCode: 1, stdout: '', stderr: 'Error: Missing query argument\n' };
    }
    // Parse tag filters
    let tagFilters;
    if (parsed.flags.tags) {
        tagFilters = parsed.flags.tags.split(',').map(t => t.trim().replace(/^#/, ''));
    }
    // First try exact search
    let results = await searchEngine.search(query, {
        filter: tagFilters ? { tags: tagFilters } : undefined
    });
    // If no results, try fuzzy search with typo tolerance
    if (results.length === 0 && query.length > 0) {
        const fuzzySearch = prepareFuzzySearch(query);
        const allFiles = vault.getMarkdownFiles();
        const fuzzyResults = [];
        const queryLower = query.toLowerCase();
        for (const file of allFiles) {
            // Apply tag filter if present
            if (tagFilters && tagFilters.length > 0) {
                const metadata = cache.getFileCache(file);
                const fileTags = getFileTags(metadata);
                const hasTag = tagFilters.some(tag => fileTags.some(ft => ft.toLowerCase() === tag.toLowerCase()));
                if (!hasTag)
                    continue;
            }
            const content = await vault.cachedRead(file);
            // Search in filename using fuzzy search
            const filenameResult = fuzzySearch(file.basename);
            // Also try typo-tolerant matching (Levenshtein distance)
            const typoFilenameMatch = isTypoMatch(queryLower, file.basename.toLowerCase());
            // Search in content
            const lines = content.split('\n');
            const matchingLines = [];
            let bestScore = 0;
            let hasTypoMatch = false;
            for (let i = 0; i < lines.length; i++) {
                const lineResult = fuzzySearch(lines[i]);
                if (lineResult) {
                    matchingLines.push({
                        line: i + 1,
                        text: lines[i],
                        positions: lineResult.matches.map(m => m[0])
                    });
                    bestScore = Math.max(bestScore, lineResult.score);
                }
                // Also check for typo matches in words
                const words = lines[i].toLowerCase().split(/\s+/);
                for (const word of words) {
                    if (isTypoMatch(queryLower, word)) {
                        hasTypoMatch = true;
                        if (!matchingLines.some(m => m.line === i + 1)) {
                            matchingLines.push({
                                line: i + 1,
                                text: lines[i],
                                positions: []
                            });
                        }
                        bestScore = Math.max(bestScore, 50); // Give typo matches a decent score
                    }
                }
            }
            if (filenameResult || typoFilenameMatch || matchingLines.length > 0) {
                // Boost filename matches significantly
                let score = bestScore;
                if (filenameResult) {
                    score = filenameResult.score + 100;
                }
                else if (typoFilenameMatch) {
                    score = 80; // Typo match in filename
                }
                fuzzyResults.push({
                    file,
                    score,
                    matches: matchingLines
                });
            }
        }
        // Sort by score descending
        fuzzyResults.sort((a, b) => b.score - a.score);
        results = fuzzyResults;
    }
    // Format output
    if (parsed.flags.json) {
        const jsonResults = results.map(r => ({
            path: r.file.path,
            score: r.score,
            matches: r.matches.map(m => ({
                line: m.line,
                text: m.text,
                positions: m.positions
            }))
        }));
        return { exitCode: 0, stdout: JSON.stringify(jsonResults, null, 2), stderr: '' };
    }
    // Text output
    if (results.length === 0) {
        return { exitCode: 0, stdout: '', stderr: '' };
    }
    const lines = [];
    for (const result of results) {
        lines.push(result.file.path);
        // Show first match context
        if (result.matches.length > 0) {
            const firstMatch = result.matches[0];
            lines.push(`  ${firstMatch.text.trim()}`);
        }
    }
    return { exitCode: 0, stdout: lines.join('\n') + '\n', stderr: '' };
}
function getFileTags(metadata) {
    const tags = [];
    // Get frontmatter tags
    if (metadata?.frontmatter?.tags) {
        const fmTags = metadata.frontmatter.tags;
        if (Array.isArray(fmTags)) {
            tags.push(...fmTags.map(t => String(t)));
        }
        else if (typeof fmTags === 'string') {
            tags.push(fmTags);
        }
    }
    // Get inline tags
    if (metadata?.tags) {
        for (const tagCache of metadata.tags) {
            const tag = tagCache.tag.startsWith('#') ? tagCache.tag.slice(1) : tagCache.tag;
            tags.push(tag);
        }
    }
    return tags;
}
async function handleRead(parsed, vault, cache, graphEngine, vaultPath) {
    const filePath = parsed.positional[0];
    if (!filePath) {
        return { exitCode: 1, stdout: '', stderr: 'Error: Missing file argument\n' };
    }
    // First check if the path is a directory
    try {
        const checkPath = path.join(vaultPath, filePath);
        const checkStat = await fs.stat(checkPath);
        if (checkStat.isDirectory()) {
            return { exitCode: 1, stdout: '', stderr: `Error: Path is a directory, not a file: ${filePath}\n` };
        }
    }
    catch {
        // Not a directory or doesn't exist as-is, continue
    }
    // Try to find the file
    let file = vault.getFileByPath(filePath);
    // Try with .md extension
    if (!file && !filePath.endsWith('.md')) {
        file = vault.getFileByPath(filePath + '.md');
    }
    // Try to find by basename
    if (!file) {
        const basename = filePath.replace(/\.md$/, '').split('/').pop();
        const files = vault.getMarkdownFiles();
        file = files.find(f => f.basename === basename) || null;
    }
    if (!file) {
        return { exitCode: 1, stdout: '', stderr: `Error: File not found: ${filePath}\n` };
    }
    // Check if it's actually a file (not a directory)
    try {
        const fullPath = path.join(vaultPath, file.path);
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
            return { exitCode: 1, stdout: '', stderr: `Error: Path is a directory, not a file: ${filePath}\n` };
        }
    }
    catch {
        return { exitCode: 1, stdout: '', stderr: `Error: File not found: ${filePath}\n` };
    }
    // Read content
    const content = await vault.read(file);
    const metadata = cache.getFileCache(file);
    // Get backlinks if requested
    let backlinks = [];
    if (parsed.flags.backlinks) {
        const backlinkResults = graphEngine.getBacklinks(file.path);
        for (const bl of backlinkResults) {
            for (const link of bl.links) {
                // Get context line
                const sourceContent = await vault.read(bl.file);
                const lines = sourceContent.split('\n');
                const context = lines[link.position.line] || '';
                backlinks.push({
                    path: bl.file.path,
                    line: link.position.line,
                    context: context.trim()
                });
            }
        }
    }
    // Format output
    if (parsed.flags.json) {
        const result = {
            path: file.path,
            content,
            frontmatter: metadata?.frontmatter || {}
        };
        if (parsed.flags.backlinks) {
            result.backlinks = backlinks.map(bl => ({
                path: bl.path,
                position: { line: bl.line },
                context: bl.context
            }));
        }
        return { exitCode: 0, stdout: JSON.stringify(result, null, 2), stderr: '' };
    }
    // Text output
    let output = content;
    if (parsed.flags.backlinks) {
        output += '\n\n---\n';
        output += `Backlinks (${backlinks.length}):\n`;
        if (backlinks.length === 0) {
            output += '  No backlinks found\n';
        }
        else {
            for (const bl of backlinks) {
                output += `  - ${bl.path}\n`;
            }
        }
    }
    return { exitCode: 0, stdout: output, stderr: '' };
}
async function handleCreate(parsed, vault, vaultPath) {
    let filePath = parsed.positional[0];
    if (!filePath) {
        return { exitCode: 1, stdout: '', stderr: 'Error: Missing path argument\n' };
    }
    // Add .md extension if not present
    if (!filePath.endsWith('.md')) {
        filePath = filePath + '.md';
    }
    // Check if file already exists
    const existing = vault.getFileByPath(filePath);
    if (existing) {
        return { exitCode: 1, stdout: '', stderr: `Error: File already exists: ${filePath}\n` };
    }
    // Also check filesystem directly
    try {
        const fullPath = path.join(vaultPath, filePath);
        await fs.access(fullPath);
        return { exitCode: 1, stdout: '', stderr: `Error: File already exists: ${filePath}\n` };
    }
    catch {
        // File doesn't exist, good
    }
    // Build content
    let content = parsed.flags.content ?? '';
    // Add frontmatter with tags if specified
    if (parsed.flags.tags) {
        const tags = parsed.flags.tags.split(',').map(t => t.trim().replace(/^#/, ''));
        const frontmatter = `---\ntags: [${tags.join(', ')}]\n---\n`;
        content = frontmatter + content;
    }
    // Create the file
    await vault.create(filePath, content);
    // Format output
    if (parsed.flags.json) {
        const result = {
            path: filePath,
            created: Date.now()
        };
        return { exitCode: 0, stdout: JSON.stringify(result, null, 2), stderr: '' };
    }
    return { exitCode: 0, stdout: `Created: ${filePath}\n`, stderr: '' };
}
async function handleBacklinks(parsed, vault, cache, graphEngine, vaultPath) {
    const filePath = parsed.positional[0];
    if (!filePath) {
        return { exitCode: 1, stdout: '', stderr: 'Error: Missing file argument\n' };
    }
    // Try to find the file
    let file = vault.getFileByPath(filePath);
    // Try with .md extension
    if (!file && !filePath.endsWith('.md')) {
        file = vault.getFileByPath(filePath + '.md');
    }
    // Try to find by basename
    if (!file) {
        const basename = filePath.replace(/\.md$/, '').split('/').pop();
        const files = vault.getMarkdownFiles();
        file = files.find(f => f.basename === basename) || null;
    }
    if (!file) {
        return { exitCode: 1, stdout: '', stderr: `Error: File not found: ${filePath}\n` };
    }
    // Get backlinks
    const depth = parsed.flags.depth || 1;
    let allBacklinks = [];
    // Get aliases for the target file
    const targetMetadata = cache.getFileCache(file);
    const aliases = [];
    if (targetMetadata?.frontmatter?.aliases) {
        const aliasData = targetMetadata.frontmatter.aliases;
        if (Array.isArray(aliasData)) {
            aliases.push(...aliasData.map(a => String(a)));
        }
        else if (typeof aliasData === 'string') {
            aliases.push(aliasData);
        }
    }
    const processFile = async (targetPath, currentDepth, visited, targetAliases) => {
        if (currentDepth > depth)
            return;
        if (visited.has(targetPath))
            return;
        visited.add(targetPath);
        const targetFile = vault.getFileByPath(targetPath);
        if (!targetFile)
            return;
        // Get direct backlinks from GraphEngine
        const backlinkResults = graphEngine.getBacklinks(targetPath);
        for (const bl of backlinkResults) {
            for (const link of bl.links) {
                // Get context line
                const sourceContent = await vault.read(bl.file);
                const lines = sourceContent.split('\n');
                const context = lines[link.position.line] || '';
                allBacklinks.push({
                    path: bl.file.path,
                    position: { line: link.position.line },
                    context: context.trim()
                });
            }
            // Recurse for depth > 1
            if (currentDepth < depth) {
                await processFile(bl.file.path, currentDepth + 1, visited, []);
            }
        }
        // Also find backlinks via aliases (only for direct file, not recursive)
        if (currentDepth === 1 && targetAliases.length > 0) {
            const allFiles = vault.getMarkdownFiles();
            for (const sourceFile of allFiles) {
                if (sourceFile.path === targetPath)
                    continue;
                if (visited.has(sourceFile.path))
                    continue;
                const sourceMetadata = cache.getFileCache(sourceFile);
                const sourceLinks = sourceMetadata?.links || [];
                for (const link of sourceLinks) {
                    // Check if this link matches any alias
                    const linkTarget = link.link.split('#')[0].split('^')[0];
                    const isAliasMatch = targetAliases.some(alias => alias.toLowerCase() === linkTarget.toLowerCase());
                    if (isAliasMatch) {
                        const sourceContent = await vault.read(sourceFile);
                        const lines = sourceContent.split('\n');
                        const context = lines[link.position.start.line] || '';
                        allBacklinks.push({
                            path: sourceFile.path,
                            position: { line: link.position.start.line },
                            context: context.trim()
                        });
                    }
                }
            }
        }
    };
    await processFile(file.path, 1, new Set(), aliases);
    // Deduplicate by path
    const uniqueBacklinks = new Map();
    for (const bl of allBacklinks) {
        if (!uniqueBacklinks.has(bl.path)) {
            uniqueBacklinks.set(bl.path, bl);
        }
    }
    allBacklinks = Array.from(uniqueBacklinks.values());
    // Format output
    if (parsed.flags.json) {
        return { exitCode: 0, stdout: JSON.stringify(allBacklinks, null, 2), stderr: '' };
    }
    // Text output
    if (allBacklinks.length === 0) {
        return { exitCode: 0, stdout: '', stderr: '' };
    }
    const lines = [`${allBacklinks.length} backlinks:`];
    for (const bl of allBacklinks) {
        lines.push(`  ${bl.path}`);
    }
    return { exitCode: 0, stdout: lines.join('\n') + '\n', stderr: '' };
}
async function handleList(parsed, vault, vaultPath) {
    const folder = parsed.positional[0] || '';
    let files = vault.getMarkdownFiles();
    // Filter by folder if specified
    if (folder) {
        const normalizedFolder = folder.replace(/\/$/, '');
        files = files.filter(f => f.path.startsWith(normalizedFolder + '/'));
    }
    // Format output
    if (parsed.flags.json) {
        const result = files.map(f => ({
            path: f.path,
            name: f.name,
            basename: f.basename
        }));
        return { exitCode: 0, stdout: JSON.stringify(result, null, 2), stderr: '' };
    }
    // Text output
    const lines = files.map(f => f.path);
    return { exitCode: 0, stdout: lines.join('\n') + (lines.length > 0 ? '\n' : ''), stderr: '' };
}
async function handleTags(parsed, vault, cache) {
    const files = vault.getMarkdownFiles();
    const tagCounts = new Map();
    for (const file of files) {
        const metadata = cache.getFileCache(file);
        const tags = getFileTags(metadata);
        for (const tag of tags) {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
    }
    // Sort by name
    const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    // Format output
    if (parsed.flags.json) {
        if (parsed.flags.count) {
            const result = sortedTags.map(([tag, count]) => ({ tag, count }));
            return { exitCode: 0, stdout: JSON.stringify(result, null, 2), stderr: '' };
        }
        const result = sortedTags.map(([tag]) => tag);
        return { exitCode: 0, stdout: JSON.stringify(result, null, 2), stderr: '' };
    }
    // Text output
    if (parsed.flags.count) {
        const lines = sortedTags.map(([tag, count]) => `${tag}: ${count}`);
        return { exitCode: 0, stdout: lines.join('\n') + (lines.length > 0 ? '\n' : ''), stderr: '' };
    }
    const lines = sortedTags.map(([tag]) => tag);
    return { exitCode: 0, stdout: lines.join('\n') + (lines.length > 0 ? '\n' : ''), stderr: '' };
}
// Main entry point when run directly
if (process.argv[1] && (process.argv[1].endsWith('/cli.ts') || process.argv[1].endsWith('/cli.js'))) {
    const args = process.argv.slice(2);
    runCli(args).then((result) => {
        if (result.stdout)
            process.stdout.write(result.stdout);
        if (result.stderr)
            process.stderr.write(result.stderr);
        process.exit(result.exitCode);
    }).catch((error) => {
        console.error('Fatal error:', error.message);
        process.exit(1);
    });
}
//# sourceMappingURL=cli.js.map