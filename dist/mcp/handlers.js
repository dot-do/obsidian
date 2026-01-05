import * as path from 'path';
// Helper to escape special regex characters
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// Helper to normalize tags (remove # prefix if present)
function normalizeTag(tag) {
    return tag.startsWith('#') ? tag.slice(1) : tag;
}
// Helper to extract title from content
function extractTitle(content) {
    // Try to find first heading
    const headingMatch = content.match(/^#\s+(.+)$/m);
    if (headingMatch) {
        return headingMatch[1].trim();
    }
    // Fall back to first line
    const firstLine = content.split('\n')[0];
    return firstLine ? firstLine.slice(0, 50) : 'Untitled';
}
// Helper to create snippet around matched text
function createSnippet(content, query, maxLength = 150) {
    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerContent.indexOf(lowerQuery);
    if (index === -1) {
        return content.slice(0, maxLength);
    }
    const start = Math.max(0, index - 50);
    const end = Math.min(content.length, index + query.length + 100);
    let snippet = content.slice(start, end);
    if (start > 0)
        snippet = '...' + snippet;
    if (end < content.length)
        snippet = snippet + '...';
    return snippet;
}
// Helper to get tags from file
function getFileTags(metadata) {
    const tags = [];
    if (metadata?.tags) {
        for (const tagCache of metadata.tags) {
            // Remove # prefix for consistency
            const tag = tagCache.tag.startsWith('#') ? tagCache.tag.slice(1) : tagCache.tag;
            if (!tags.includes(tag)) {
                tags.push(tag);
            }
        }
    }
    return tags;
}
// Helper to check if file has all specified tags
function hasAllTags(metadata, requiredTags) {
    if (!metadata?.tags || requiredTags.length === 0) {
        return requiredTags.length === 0;
    }
    const fileTags = metadata.tags.map(t => normalizeTag(t.tag).toLowerCase());
    return requiredTags.every(requiredTag => {
        const normalizedRequired = normalizeTag(requiredTag).toLowerCase();
        return fileTags.some(fileTag => fileTag === normalizedRequired);
    });
}
// Helper to serialize frontmatter to YAML
function serializeFrontmatter(frontmatter) {
    const lines = [];
    for (const [key, value] of Object.entries(frontmatter)) {
        lines.push(serializeYamlValue(key, value));
    }
    return lines.join('\n');
}
function serializeYamlValue(key, value) {
    if (value === null || value === undefined) {
        return `${key}: null`;
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
        return `${key}: ${value}`;
    }
    if (typeof value === 'string') {
        // Check if string needs quoting
        if (value.includes(':') || value.includes('"') || value.includes('\n') || value.includes('#')) {
            const escaped = value.replace(/"/g, '\\"').replace(/\n/g, '\\n');
            return `${key}: "${escaped}"`;
        }
        return `${key}: ${value}`;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return `${key}: []`;
        }
        const allSimple = value.every(v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean');
        if (allSimple) {
            const items = value.map(v => typeof v === 'string' ? v : String(v)).join(', ');
            return `${key}: [${items}]`;
        }
        // Complex array
        const arrayLines = [`${key}:`];
        for (const item of value) {
            if (typeof item === 'object' && item !== null) {
                arrayLines.push(`  -`);
                for (const [k, v] of Object.entries(item)) {
                    arrayLines.push(`    ${serializeYamlValue(k, v)}`);
                }
            }
            else {
                arrayLines.push(`  - ${item}`);
            }
        }
        return arrayLines.join('\n');
    }
    if (typeof value === 'object') {
        const objLines = [`${key}:`];
        for (const [k, v] of Object.entries(value)) {
            objLines.push(`  ${serializeYamlValue(k, v)}`);
        }
        return objLines.join('\n');
    }
    return `${key}: ${value}`;
}
// Helper to check if path is safe (no path traversal)
function isPathSafe(filePath) {
    // Reject empty paths
    if (!filePath)
        return false;
    // Reject absolute paths
    if (filePath.startsWith('/') || /^[a-zA-Z]:/.test(filePath))
        return false;
    // Normalize the path to resolve all . and .. segments
    // This handles cases like './foo/../../../etc/passwd' which normalizes to '../../etc/passwd'
    const normalized = path.normalize(filePath);
    // After normalization, check if path escapes the root
    // A normalized path starting with '..' would escape the vault root
    if (normalized.startsWith('..'))
        return false;
    // Also reject if normalized path is absolute (edge case on some systems)
    if (path.isAbsolute(normalized))
        return false;
    // Reject paths that contain .. anywhere in segments (belt and suspenders)
    const segments = normalized.split(/[/\\]/);
    if (segments.includes('..'))
        return false;
    return true;
}
// Helper to validate path
function validatePath(path) {
    if (!path || path.trim() === '') {
        throw new Error('Path cannot be empty');
    }
    if (!isPathSafe(path)) {
        throw new Error('Path contains invalid traversal patterns');
    }
}
// Helper to validate path has .md extension
function validateMarkdownPath(path) {
    validatePath(path);
    if (!path.endsWith('.md')) {
        throw new Error('Path must have .md extension');
    }
    // Check for invalid characters
    const invalidChars = /[<>:"|?*]/;
    if (invalidChars.test(path)) {
        throw new Error('Path contains invalid characters');
    }
}
// Helper to parse time duration (e.g., "7d", "1d", "24h")
function parseTimeDuration(duration) {
    const match = duration.match(/^(\d+)([dhm])$/);
    if (!match) {
        throw new Error(`Invalid duration format: ${duration}`);
    }
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
        case 'd': return value * 24 * 60 * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'm': return value * 60 * 1000;
        default: throw new Error(`Unknown time unit: ${unit}`);
    }
}
// Helper to get link context from file content
function getLinkContext(content, targetPath, metadata) {
    const contexts = [];
    const lines = content.split('\n');
    const targetName = targetPath.replace(/\.md$/, '').split('/').pop() || '';
    if (metadata?.links) {
        for (const link of metadata.links) {
            // Check if this link points to our target
            const linkName = link.link.split('#')[0]; // Remove heading reference
            if (linkName.toLowerCase() === targetName.toLowerCase() ||
                link.link.toLowerCase().includes(targetName.toLowerCase())) {
                const line = lines[link.position.start.line] || '';
                if (line && !contexts.includes(line)) {
                    contexts.push(line.trim());
                }
            }
        }
    }
    return contexts;
}
export async function handleVaultSearch(client, args) {
    const { query, limit, filter } = args;
    // Validate query
    if (!query || query.trim() === '') {
        throw new Error('Query cannot be empty');
    }
    const files = client.vault.getMarkdownFiles();
    const matches = [];
    // Use provided limit or default to 50
    const maxResults = limit ?? 50;
    for (const file of files) {
        try {
            const content = await client.vault.read(file);
            const metadata = client.metadataCache.getCache(file.path);
            // Check tag filter
            if (filter?.tags && filter.tags.length > 0) {
                if (!hasAllTags(metadata, filter.tags)) {
                    continue;
                }
            }
            // Search content and file name (case-insensitive)
            const lowerQuery = query.toLowerCase();
            const lowerContent = content.toLowerCase();
            const lowerFileName = file.basename.toLowerCase();
            // Escape regex chars for safe pattern matching
            const escapedQuery = escapeRegex(lowerQuery);
            // Count occurrences for scoring
            const contentMatches = (lowerContent.match(new RegExp(escapedQuery, 'g')) || []).length;
            const nameMatches = lowerFileName.includes(lowerQuery) ? 10 : 0; // Boost for filename match
            const totalMatches = contentMatches + nameMatches;
            if (totalMatches > 0) {
                matches.push({
                    path: file.path,
                    title: extractTitle(content),
                    snippet: createSnippet(content, query),
                    score: totalMatches,
                    tags: getFileTags(metadata),
                });
            }
        }
        catch {
            // Skip files that can't be read
        }
    }
    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);
    // Limit results
    return { matches: matches.slice(0, maxResults) };
}
export async function handleNoteRead(client, args) {
    const { path, includeBacklinks } = args;
    validatePath(path);
    const file = client.vault.getFileByPath(path);
    if (!file) {
        throw new Error(`Note not found: ${path}`);
    }
    const content = await client.vault.read(file);
    const cache = client.metadataCache.getCache(path);
    const result = {
        path: file.path,
        content,
        metadata: {
            frontmatter: cache?.frontmatter,
            headings: cache?.headings?.map(h => ({ heading: h.heading, level: h.level })),
            links: cache?.links?.map(l => ({ link: l.link, original: l.original })),
        },
    };
    if (includeBacklinks) {
        result.backlinks = client.graph.getBacklinks(path);
    }
    return result;
}
export async function handleNoteCreate(client, args) {
    const { path, content, frontmatter } = args;
    validateMarkdownPath(path);
    if (!content || content.trim() === '') {
        throw new Error('Content cannot be empty');
    }
    // Check if file already exists
    const existingFile = client.vault.getFileByPath(path);
    if (existingFile) {
        throw new Error(`File already exists: ${path}`);
    }
    let finalContent = content;
    // Handle frontmatter
    if (frontmatter && Object.keys(frontmatter).length > 0) {
        // Check if content already has frontmatter
        const hasFrontmatter = content.startsWith('---');
        if (hasFrontmatter) {
            // Parse existing frontmatter and merge
            const endIndex = content.indexOf('---', 3);
            if (endIndex !== -1) {
                const bodyContent = content.slice(endIndex + 3).replace(/^\n+/, '');
                const yamlContent = serializeFrontmatter(frontmatter);
                finalContent = `---\n${yamlContent}\n---\n\n${bodyContent}`;
            }
        }
        else {
            // Add new frontmatter
            const yamlContent = serializeFrontmatter(frontmatter);
            finalContent = `---\n${yamlContent}\n---\n\n${content}`;
        }
    }
    const file = await client.vault.create(path, finalContent);
    return {
        path: file.path,
        success: true,
        content: finalContent,
        file: {
            basename: file.basename,
            extension: file.extension,
        },
    };
}
export async function handleGraphBacklinks(client, args) {
    const { path, includeContext } = args;
    validatePath(path);
    const file = client.vault.getFileByPath(path);
    if (!file) {
        throw new Error(`Note not found: ${path}`);
    }
    const backlinkPaths = client.graph.getBacklinks(path);
    const backlinks = [];
    for (const blPath of backlinkPaths) {
        const blFile = client.vault.getFileByPath(blPath);
        let title;
        let context;
        let contexts;
        let linkCount = 1;
        // Get link count from resolved links
        const resolvedLinks = client.metadataCache.resolvedLinks[blPath];
        if (resolvedLinks && resolvedLinks[path]) {
            linkCount = resolvedLinks[path];
        }
        if (blFile) {
            try {
                const content = await client.vault.read(blFile);
                title = extractTitle(content);
                if (includeContext) {
                    const metadata = client.metadataCache.getCache(blPath);
                    const allContexts = getLinkContext(content, path, metadata);
                    if (allContexts.length > 0) {
                        context = allContexts[0];
                        if (allContexts.length > 1) {
                            contexts = allContexts;
                        }
                    }
                }
            }
            catch {
                // Use path as fallback title
                title = blPath.split('/').pop()?.replace('.md', '');
            }
        }
        const backlinkInfo = { path: blPath, title, linkCount };
        if (includeContext && context) {
            backlinkInfo.context = context;
        }
        if (includeContext && contexts && contexts.length > 1) {
            backlinkInfo.contexts = contexts;
        }
        backlinks.push(backlinkInfo);
    }
    return {
        backlinks,
        count: backlinks.length,
    };
}
// Helper to estimate tokens from text (rough approximation: ~4 chars per token)
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
// Helper to truncate files array to fit within token limit
function truncateFilesToTokenLimit(files, maxTokens) {
    let currentTokens = 0;
    const result = [];
    for (const file of files) {
        // Estimate tokens for this file entry (path + metadata structure)
        const fileTokens = estimateTokens(JSON.stringify(file));
        if (currentTokens + fileTokens > maxTokens) {
            break;
        }
        currentTokens += fileTokens;
        result.push(file);
    }
    return result;
}
export async function handleVaultContext(client, args) {
    const { scope, maxTokens } = args;
    if (!scope || scope.trim() === '' || scope !== scope.trim()) {
        throw new Error('Invalid scope');
    }
    const files = client.vault.getMarkdownFiles();
    // Parse scope
    if (scope === 'all') {
        const folders = new Set();
        const fileInfos = [];
        for (const file of files) {
            const metadata = client.metadataCache.getCache(file.path);
            fileInfos.push({
                path: file.path,
                metadata: {
                    frontmatter: metadata?.frontmatter,
                },
            });
            // Extract folders
            const parts = file.path.split('/');
            for (let i = 1; i < parts.length; i++) {
                folders.add(parts.slice(0, i).join('/'));
            }
        }
        // Build graph edges
        const edges = [];
        const resolvedLinks = client.metadataCache.resolvedLinks;
        for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
            for (const targetPath of Object.keys(targets)) {
                edges.push({ source: sourcePath, target: targetPath });
            }
        }
        // Apply token limit if specified
        const truncatedFiles = maxTokens ? truncateFilesToTokenLimit(fileInfos, maxTokens) : fileInfos;
        return {
            files: truncatedFiles,
            folders: Array.from(folders).sort(),
            stats: { totalNotes: files.length },
            graph: { edges },
        };
    }
    if (scope.startsWith('folder:')) {
        const folderPath = scope.slice(7);
        const filteredFiles = files.filter(f => f.path.startsWith(folderPath + '/'));
        if (filteredFiles.length === 0 && !files.some(f => f.path.startsWith(folderPath))) {
            throw new Error(`Folder not found: ${folderPath}`);
        }
        const fileInfos = filteredFiles.map(f => ({
            path: f.path,
            metadata: {
                frontmatter: client.metadataCache.getCache(f.path)?.frontmatter,
            },
        }));
        // Apply token limit if specified
        const truncatedFiles = maxTokens ? truncateFilesToTokenLimit(fileInfos, maxTokens) : fileInfos;
        return { files: truncatedFiles };
    }
    if (scope.startsWith('tag:')) {
        const tagName = scope.slice(4);
        const fileInfos = [];
        for (const file of files) {
            const metadata = client.metadataCache.getCache(file.path);
            if (hasAllTags(metadata, [tagName])) {
                fileInfos.push({
                    path: file.path,
                    metadata: {
                        frontmatter: metadata?.frontmatter,
                    },
                });
            }
        }
        // Apply token limit if specified
        const truncatedFiles = maxTokens ? truncateFilesToTokenLimit(fileInfos, maxTokens) : fileInfos;
        return { files: truncatedFiles };
    }
    if (scope.startsWith('recent:')) {
        const duration = scope.slice(7);
        const durationMs = parseTimeDuration(duration);
        const now = Date.now();
        const recentFiles = files
            .filter(f => now - f.stat.mtime < durationMs)
            .sort((a, b) => b.stat.mtime - a.stat.mtime);
        const fileInfos = recentFiles.map(f => ({
            path: f.path,
            metadata: {
                frontmatter: client.metadataCache.getCache(f.path)?.frontmatter,
            },
        }));
        // Apply token limit if specified
        const truncatedFiles = maxTokens ? truncateFilesToTokenLimit(fileInfos, maxTokens) : fileInfos;
        return { files: truncatedFiles };
    }
    if (scope.startsWith('linked:')) {
        const notePath = scope.slice(7);
        const file = client.vault.getFileByPath(notePath);
        if (!file) {
            throw new Error(`Note not found: ${notePath}`);
        }
        const linkedPaths = new Set();
        // Get outgoing links
        const resolvedLinks = client.metadataCache.resolvedLinks[notePath];
        if (resolvedLinks) {
            for (const targetPath of Object.keys(resolvedLinks)) {
                linkedPaths.add(targetPath);
            }
        }
        // Get backlinks
        const backlinks = client.graph.getBacklinks(notePath);
        for (const blPath of backlinks) {
            linkedPaths.add(blPath);
        }
        const fileInfos = [];
        for (const linkedPath of linkedPaths) {
            const linkedFile = client.vault.getFileByPath(linkedPath);
            if (linkedFile) {
                fileInfos.push({
                    path: linkedFile.path,
                    metadata: {
                        frontmatter: client.metadataCache.getCache(linkedPath)?.frontmatter,
                    },
                });
            }
        }
        // Apply token limit if specified
        const truncatedFiles = maxTokens ? truncateFilesToTokenLimit(fileInfos, maxTokens) : fileInfos;
        return { files: truncatedFiles };
    }
    throw new Error(`Invalid scope: ${scope}`);
}
export async function handleVaultList(client, args) {
    const { folder, recursive = true } = args;
    let files = client.vault.getMarkdownFiles();
    if (folder) {
        // Check if folder exists by checking if any files are in it
        const folderFiles = files.filter(f => f.path.startsWith(folder + '/'));
        if (folderFiles.length === 0) {
            throw new Error(`Folder not found: ${folder}`);
        }
        if (recursive) {
            files = folderFiles;
        }
        else {
            // Only include files directly in the folder
            files = folderFiles.filter(f => {
                const relativePath = f.path.slice(folder.length + 1);
                return !relativePath.includes('/');
            });
        }
    }
    // Sort alphabetically
    files.sort((a, b) => a.path.localeCompare(b.path));
    return {
        files: files.map(f => ({
            path: f.path,
            name: f.name,
            basename: f.basename,
            stat: { mtime: f.stat.mtime, size: f.stat.size },
        })),
        total: files.length,
    };
}
export async function handleNoteUpdate(client, args) {
    const { path, content } = args;
    validatePath(path);
    if (!content || content.trim() === '') {
        throw new Error('Content cannot be empty');
    }
    const file = client.vault.getFileByPath(path);
    if (!file) {
        throw new Error(`Note not found: ${path}`);
    }
    // Update content using vault.modify for existing files
    await client.vault.modify(file, content);
    return {
        path,
        success: true,
    };
}
export async function handleNoteAppend(client, args) {
    const { path, content, position = 'end' } = args;
    validatePath(path);
    if (!content) {
        throw new Error('Content cannot be empty');
    }
    if (position !== 'end' && position !== 'after-frontmatter') {
        throw new Error(`Invalid position: ${position}`);
    }
    const file = client.vault.getFileByPath(path);
    if (!file) {
        throw new Error(`Note not found: ${path}`);
    }
    const existingContent = await client.vault.read(file);
    let newContent;
    if (position === 'after-frontmatter') {
        // Check if file has frontmatter
        if (existingContent.startsWith('---')) {
            const endIndex = existingContent.indexOf('---', 3);
            if (endIndex !== -1) {
                const frontmatter = existingContent.slice(0, endIndex + 3);
                const body = existingContent.slice(endIndex + 3);
                newContent = frontmatter + content + body;
            }
            else {
                newContent = existingContent + content;
            }
        }
        else {
            // No frontmatter, prepend to start
            newContent = content + existingContent;
        }
    }
    else {
        // Append to end
        newContent = existingContent + content;
    }
    await client.vault.modify(file, newContent);
    return {
        path,
        success: true,
    };
}
export async function handleFrontmatterUpdate(client, args) {
    const { path, frontmatter, merge = true } = args;
    validatePath(path);
    if (!frontmatter || Object.keys(frontmatter).length === 0) {
        throw new Error('Frontmatter cannot be empty');
    }
    const file = client.vault.getFileByPath(path);
    if (!file) {
        throw new Error(`Note not found: ${path}`);
    }
    const existingContent = await client.vault.read(file);
    const existingMetadata = client.metadataCache.getCache(path);
    // Determine final frontmatter
    let finalFrontmatter;
    if (merge && existingMetadata?.frontmatter) {
        finalFrontmatter = { ...existingMetadata.frontmatter, ...frontmatter };
    }
    else {
        finalFrontmatter = frontmatter;
    }
    // Extract body content
    let bodyContent = existingContent;
    if (existingContent.startsWith('---')) {
        const endIndex = existingContent.indexOf('---', 3);
        if (endIndex !== -1) {
            bodyContent = existingContent.slice(endIndex + 3).replace(/^\n+/, '');
        }
    }
    // Build new content
    const yamlContent = serializeFrontmatter(finalFrontmatter);
    const newContent = `---\n${yamlContent}\n---\n\n${bodyContent}`;
    await client.vault.modify(file, newContent);
    return {
        path,
        success: true,
    };
}
export async function handleGraphForwardLinks(client, args) {
    const { path, includeUnresolved } = args;
    validatePath(path);
    const file = client.vault.getFileByPath(path);
    if (!file) {
        throw new Error(`Note not found: ${path}`);
    }
    const resolvedLinks = client.metadataCache.resolvedLinks[path] || {};
    const links = [];
    for (const [targetPath, count] of Object.entries(resolvedLinks)) {
        const targetFile = client.vault.getFileByPath(targetPath);
        let title;
        if (targetFile) {
            try {
                const content = await client.vault.read(targetFile);
                title = extractTitle(content);
            }
            catch {
                title = targetPath.split('/').pop()?.replace('.md', '');
            }
        }
        links.push({
            path: targetPath,
            title,
            linkCount: count,
        });
    }
    const result = {
        links,
        count: links.length,
    };
    if (includeUnresolved) {
        const metadata = client.metadataCache.getCache(path);
        const unresolvedLinks = [];
        if (metadata?.links) {
            for (const link of metadata.links) {
                const linkTarget = link.link.split('#')[0];
                // Check if this link is not in resolved links
                const isResolved = Object.keys(resolvedLinks).some(resolved => resolved.includes(linkTarget) || linkTarget.includes(resolved.replace('.md', '')));
                if (!isResolved && !unresolvedLinks.includes(linkTarget)) {
                    unresolvedLinks.push(linkTarget);
                }
            }
        }
        if (unresolvedLinks.length > 0) {
            result.unresolvedLinks = unresolvedLinks;
        }
    }
    return result;
}
export async function handleGraphNeighbors(client, args) {
    const { path, depth = 1, direction = 'both' } = args;
    validatePath(path);
    if (depth !== undefined && (depth < 1 || depth < 0)) {
        throw new Error('Depth must be a positive number');
    }
    if (direction && !['both', 'incoming', 'outgoing'].includes(direction)) {
        throw new Error(`Invalid direction: ${direction}`);
    }
    const file = client.vault.getFileByPath(path);
    if (!file) {
        throw new Error(`Note not found: ${path}`);
    }
    // Limit max depth to prevent performance issues
    const effectiveDepth = Math.min(depth, 10);
    const visited = new Set([path]);
    const neighbors = [];
    // BFS to find neighbors at each depth
    let currentLevel = [path];
    for (let d = 1; d <= effectiveDepth; d++) {
        const nextLevel = [];
        for (const currentPath of currentLevel) {
            // Get outgoing links
            if (direction === 'both' || direction === 'outgoing') {
                const resolvedLinks = client.metadataCache.resolvedLinks[currentPath] || {};
                for (const targetPath of Object.keys(resolvedLinks)) {
                    if (!visited.has(targetPath)) {
                        visited.add(targetPath);
                        nextLevel.push(targetPath);
                        // Determine relationship
                        let relationship = 'outgoing';
                        if (direction === 'both') {
                            const backlinks = client.graph.getBacklinks(path);
                            if (backlinks.includes(targetPath)) {
                                relationship = 'both';
                            }
                        }
                        neighbors.push({
                            path: targetPath,
                            depth: d,
                            relationship,
                        });
                    }
                }
            }
            // Get incoming links (backlinks)
            if (direction === 'both' || direction === 'incoming') {
                const backlinks = client.graph.getBacklinks(currentPath);
                for (const blPath of backlinks) {
                    if (!visited.has(blPath)) {
                        visited.add(blPath);
                        nextLevel.push(blPath);
                        // Determine relationship
                        let relationship = 'incoming';
                        if (direction === 'both') {
                            const resolvedLinks = client.metadataCache.resolvedLinks[path] || {};
                            if (Object.keys(resolvedLinks).includes(blPath)) {
                                relationship = 'both';
                            }
                        }
                        neighbors.push({
                            path: blPath,
                            depth: d,
                            relationship,
                        });
                    }
                }
            }
        }
        currentLevel = nextLevel;
    }
    return {
        neighbors,
        count: neighbors.length,
    };
}
//# sourceMappingURL=handlers.js.map