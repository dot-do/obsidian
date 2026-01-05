/**
 * Events base class providing event emitter functionality
 */
export class Events {
    eventListeners = new Map();
    nextListenerId = 1;
    on(event, callback) {
        const id = this.nextListenerId++;
        const listener = { callback: callback, id };
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(listener);
        let unsubscribed = false;
        const ref = {
            unsubscribe: () => {
                if (unsubscribed)
                    return;
                unsubscribed = true;
                const listeners = this.eventListeners.get(event);
                if (listeners) {
                    const index = listeners.findIndex(l => l.id === id);
                    if (index !== -1) {
                        listeners.splice(index, 1);
                    }
                }
            }
        };
        return ref;
    }
    off(event, ref) {
        ref.unsubscribe();
    }
    trigger(event, ...args) {
        const listeners = this.eventListeners.get(event);
        if (!listeners)
            return;
        // Create a copy to allow modification during iteration
        const listenersCopy = [...listeners];
        for (const listener of listenersCopy) {
            try {
                // Call with multiple arguments
                ;
                listener.callback(...args);
            }
            catch (e) {
                // Continue calling other listeners even if one throws
                console.error(`Event listener error for '${event}':`, e);
            }
        }
    }
}
export class MetadataCache extends Events {
    vault;
    parser;
    cache = new Map();
    contentHashes = new Map();
    initialized = false;
    // Batch processing state
    batchWindow = 100; // ms
    batchFiles = [];
    batchStartTime = null;
    batchTimeout = null;
    resolvedLinks = {};
    unresolvedLinks = {};
    constructor(vault, parser = (content) => this.parseContent(content)) {
        super();
        this.vault = vault;
        this.parser = parser;
        this.setupVaultListeners();
    }
    /**
     * Set up listeners for vault events to automatically index files
     */
    setupVaultListeners() {
        // Listen to vault events for auto-indexing
        this.vault.on('create', async (file) => {
            if (file.extension === 'md') {
                await this.indexFile(file);
            }
        });
        this.vault.on('modify', async (file) => {
            if (file.extension === 'md') {
                await this.indexFile(file);
            }
        });
        this.vault.on('delete', (file) => {
            // Get old metadata before deleting for the 'deleted' event
            const oldMetadata = this.cache.get(file.path);
            this.cache.delete(file.path);
            this.contentHashes.delete(file.path);
            delete this.resolvedLinks[file.path];
            delete this.unresolvedLinks[file.path];
            // Emit 'deleted' event with file and old metadata
            this.trigger('deleted', file, oldMetadata);
            // Also emit cache-clear for backward compatibility
            this.trigger('cache-clear', file);
            // Re-resolve links for files that linked to the deleted file
            this.updateLinksToDeletedFile(file.path);
        });
        this.vault.on('rename', async ({ file, oldPath }) => {
            // Remove old cache entry
            const oldMetadata = this.cache.get(oldPath);
            this.cache.delete(oldPath);
            this.contentHashes.delete(oldPath);
            delete this.resolvedLinks[oldPath];
            delete this.unresolvedLinks[oldPath];
            // Create a temporary file reference for the old path for events
            const oldFile = {
                path: oldPath,
                name: oldPath.split('/').pop() || oldPath,
                basename: oldPath.replace(/\.md$/, '').split('/').pop() || oldPath,
                extension: 'md',
                stat: file.stat
            };
            this.trigger('cache-clear', oldFile);
            // Re-index at new path
            if (file.extension === 'md') {
                await this.indexFile(file);
            }
            // Update all files that linked to old path
            this.reindexBacklinks(oldPath);
        });
    }
    updateLinksToDeletedFile(deletedPath) {
        // Find all files that have resolved links to the deleted file
        // and update their link tracking
        const basename = deletedPath.replace(/\.md$/, '').split('/').pop() || '';
        for (const [sourcePath, targets] of Object.entries(this.resolvedLinks)) {
            if (targets[deletedPath]) {
                // This file had a resolved link to the deleted file
                // Re-index it to update link status
                const file = this.vault.getFileByPath(sourcePath);
                if (file) {
                    const metadata = this.cache.get(sourcePath);
                    if (metadata) {
                        // Update link tracking - the link will now be unresolved
                        this.updateLinkTracking(sourcePath, metadata);
                    }
                }
            }
        }
    }
    updateLinksToRenamedFile(oldPath, newPath) {
        // Find all files that have resolved links to the old path
        // and update their link tracking
        for (const [sourcePath, targets] of Object.entries(this.resolvedLinks)) {
            if (targets[oldPath]) {
                // This file had a resolved link to the old path
                // Re-index it to update link status
                const file = this.vault.getFileByPath(sourcePath);
                if (file) {
                    const metadata = this.cache.get(sourcePath);
                    if (metadata) {
                        // Update link tracking
                        this.updateLinkTracking(sourcePath, metadata);
                    }
                }
            }
        }
    }
    /**
     * Re-index all files that have backlinks to a given path.
     * This is called after a file is renamed to update link resolution.
     * @param oldPath The old path of the renamed file
     */
    reindexBacklinks(oldPath) {
        // Find all files that had resolved links to the old path
        // and re-index them to update their link status
        for (const [sourcePath, targets] of Object.entries(this.resolvedLinks)) {
            if (targets[oldPath]) {
                // This file had a resolved link to the old path
                // Re-index it to update link status
                const file = this.vault.getFileByPath(sourcePath);
                if (file) {
                    const metadata = this.cache.get(sourcePath);
                    if (metadata) {
                        // Update link tracking - this will move the link to unresolved
                        // since the target file no longer exists at the old path
                        this.updateLinkTracking(sourcePath, metadata);
                    }
                }
            }
        }
        // Also check unresolved links that might now resolve to the new path
        // (This happens when a file is created that matches an unresolved link)
        for (const [sourcePath, targets] of Object.entries(this.unresolvedLinks)) {
            // Get the basename from the old path to check against unresolved links
            const oldBasename = oldPath.replace(/\.md$/, '').split('/').pop() || '';
            if (targets[oldBasename] || targets[oldPath.replace(/\.md$/, '')]) {
                const file = this.vault.getFileByPath(sourcePath);
                if (file) {
                    const metadata = this.cache.get(sourcePath);
                    if (metadata) {
                        this.updateLinkTracking(sourcePath, metadata);
                    }
                }
            }
        }
    }
    isMarkdownFile(file) {
        return file.extension === 'md';
    }
    getFileCache(file) {
        return this.cache.get(file.path) ?? null;
    }
    getCache(path) {
        if (!path)
            return null;
        return this.cache.get(path) ?? null;
    }
    async initialize() {
        const files = this.vault.getMarkdownFiles();
        for (const file of files) {
            await this.indexFile(file);
        }
        this.initialized = true;
        // Emit 'resolved' event after all files are indexed during initialization
        // Note: This is separate from batch flush since initialize runs sequentially
        this.trigger('resolved');
    }
    async indexFile(file) {
        if (!this.isMarkdownFile(file)) {
            return null;
        }
        // Start batch timing immediately (synchronously) so timer is set up
        // before any async work
        this.addToBatch(file);
        try {
            const content = await this.vault.read(file);
            const oldMetadata = this.cache.get(file.path) ?? null;
            const oldContentHash = this.contentHashes.get(file.path) ?? '';
            const newMetadata = this.parseContent(content);
            const newContentHash = this.simpleHash(content);
            // Check if metadata actually changed
            const metadataChanged = this.hasMetadataChanged(oldMetadata, newMetadata);
            this.cache.set(file.path, newMetadata);
            this.contentHashes.set(file.path, newContentHash);
            // Update link tracking
            this.updateLinkTracking(file.path, newMetadata);
            // Only emit cache-update if metadata changed
            if (metadataChanged) {
                this.trigger('cache-update', file, newMetadata, oldMetadata);
                // Emit 'changed' event (with file, metadata, oldContentHash)
                this.trigger('changed', file, newMetadata, oldContentHash);
                // Check if links changed for links-changed event
                const oldLinkCount = oldMetadata?.links?.length ?? 0;
                const newLinkCount = newMetadata?.links?.length ?? 0;
                if (oldLinkCount !== newLinkCount) {
                    this.trigger('links-changed', file);
                }
                // Emit 'resolve' event if file has links
                if (newMetadata.links && newMetadata.links.length > 0) {
                    this.trigger('resolve', file);
                }
            }
            return newMetadata;
        }
        catch (e) {
            // Handle file read errors gracefully - remove from batch on error
            const idx = this.batchFiles.findIndex(f => f.path === file.path);
            if (idx !== -1) {
                this.batchFiles.splice(idx, 1);
            }
            return null;
        }
    }
    simpleHash(content) {
        // Simple hash for content comparison
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(36);
    }
    clearCache(file) {
        if (this.cache.has(file.path)) {
            this.cache.delete(file.path);
            delete this.resolvedLinks[file.path];
            delete this.unresolvedLinks[file.path];
            this.trigger('cache-clear', file);
        }
    }
    getFirstLinkpathDest(linkpath, sourcePath) {
        if (!linkpath)
            return null;
        // Remove heading/block reference
        const cleanPath = linkpath.split('#')[0];
        if (!cleanPath)
            return null;
        // Handle trailing slashes (folders)
        if (cleanPath.endsWith('/'))
            return null;
        // Handle relative path segments (../path)
        if (cleanPath.includes('..')) {
            // Resolve the relative path
            const sourceDir = sourcePath.split('/').slice(0, -1);
            const pathParts = cleanPath.split('/');
            const resolvedParts = [...sourceDir];
            for (const part of pathParts) {
                if (part === '..') {
                    resolvedParts.pop();
                }
                else if (part !== '.') {
                    resolvedParts.push(part);
                }
            }
            const resolvedPath = resolvedParts.join('/');
            // Try exact match or with .md
            let file = this.vault.getFileByPath(resolvedPath);
            if (file)
                return file;
            file = this.vault.getFileByPath(resolvedPath + '.md');
            if (file)
                return file;
            return null;
        }
        // Try exact match first (for any file type, not just .md)
        let file = this.vault.getFileByPath(cleanPath);
        if (file)
            return file;
        // Try adding .md extension for markdown files
        if (!cleanPath.includes('.')) {
            file = this.vault.getFileByPath(`${cleanPath}.md`);
            if (file)
                return file;
        }
        // Get source directory
        const sourceDir = sourcePath.split('/').slice(0, -1).join('/');
        // Try relative to source path
        if (sourceDir) {
            let targetPath = `${sourceDir}/${cleanPath}`;
            file = this.vault.getFileByPath(targetPath);
            if (file)
                return file;
            if (!cleanPath.includes('.')) {
                file = this.vault.getFileByPath(`${targetPath}.md`);
                if (file)
                    return file;
            }
        }
        // Search all files for matching basename
        const files = this.vault.getFiles(); // Include all files, not just markdown
        const searchBasename = cleanPath.split('/').pop() || cleanPath;
        // For basename matching, remove extension if present for comparison
        const hasExtension = searchBasename.includes('.');
        const basenameToMatch = hasExtension
            ? searchBasename.substring(0, searchBasename.lastIndexOf('.'))
            : searchBasename;
        // If path includes folder AND extension, we already tried exact match - return null
        // This ensures case-sensitive behavior for explicit paths like 'notes/B.md'
        const hasFolder = cleanPath.includes('/');
        if (hasFolder && hasExtension) {
            return null;
        }
        // Normalize for case-insensitive and space/hyphen-insensitive matching (Obsidian style)
        const normalizeForMatch = (s) => s.toLowerCase().replace(/[\s_-]+/g, '');
        const normalizedBasename = normalizeForMatch(basenameToMatch);
        // Prefer files in the same directory (for basename-only links)
        const sameDirMatches = files.filter(f => {
            const fDir = f.path.split('/').slice(0, -1).join('/');
            return fDir === sourceDir && (f.basename === basenameToMatch ||
                normalizeForMatch(f.basename) === normalizedBasename ||
                f.path === cleanPath ||
                f.path === `${cleanPath}.md`);
        });
        if (sameDirMatches.length > 0)
            return sameDirMatches[0];
        // Then any file with matching basename (for markdown files only when no extension specified)
        if (!hasExtension) {
            const anyMatch = files.find(f => (f.basename === basenameToMatch || normalizeForMatch(f.basename) === normalizedBasename) &&
                f.extension === 'md');
            if (anyMatch)
                return anyMatch;
        }
        return null;
    }
    fileToLinktext(file, sourcePath) {
        // For non-markdown files, always include extension
        if (file.extension !== 'md') {
            return file.name;
        }
        // Get all markdown files with the same basename
        const allFiles = this.vault.getMarkdownFiles();
        const sameBasename = allFiles.filter(f => f.basename === file.basename);
        // If basename is unique, just return the basename
        if (sameBasename.length === 1) {
            return file.basename;
        }
        // Multiple files with same basename - need disambiguation
        const sourceDir = sourcePath.split('/').slice(0, -1).join('/');
        const fileDir = file.path.split('/').slice(0, -1).join('/');
        // If the file is in the same directory as source, and getFirstLinkpathDest would
        // prefer same-folder matches, then basename alone might be unambiguous
        if (fileDir === sourceDir) {
            return file.basename;
        }
        // Need to include folder path for disambiguation
        // Find the shortest path that uniquely identifies this file
        const pathParts = file.path.replace(/\.md$/, '').split('/');
        // Try progressively longer paths from the end
        for (let i = pathParts.length - 2; i >= 0; i--) {
            const partialPath = pathParts.slice(i).join('/');
            // Check if this partial path uniquely identifies the file among all same-basename files
            const matchingFiles = sameBasename.filter(f => {
                const fPath = f.path.replace(/\.md$/, '');
                return fPath === partialPath || fPath.endsWith('/' + partialPath);
            });
            if (matchingFiles.length === 1 && matchingFiles[0].path === file.path) {
                return partialPath;
            }
        }
        // Fallback: return full path without extension
        return file.path.replace(/\.md$/, '');
    }
    setBatchWindow(ms) {
        this.batchWindow = ms;
    }
    flushBatch() {
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
            this.batchTimeout = null;
        }
        if (this.batchFiles.length === 0) {
            this.batchStartTime = null;
            return;
        }
        const duration = this.batchStartTime ? Date.now() - this.batchStartTime : 0;
        const filesProcessed = this.batchFiles.length;
        const averageTime = filesProcessed > 0 ? duration / filesProcessed : 0;
        const batchInfo = {
            filesProcessed,
            duration,
            averageTime,
            files: [...this.batchFiles]
        };
        this.batchFiles = [];
        this.batchStartTime = null;
        this.trigger('cache-batch-complete', batchInfo);
        // Emit 'resolved' event after batch is complete
        this.trigger('resolved');
    }
    addToBatch(file) {
        if (this.batchStartTime === null) {
            this.batchStartTime = Date.now();
        }
        this.batchFiles.push(file);
        // Reset the batch timeout
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
        }
        this.batchTimeout = setTimeout(() => {
            this.flushBatch();
        }, this.batchWindow);
    }
    hasMetadataChanged(oldMetadata, newMetadata) {
        if (!oldMetadata)
            return true;
        // Simple comparison - could be made more sophisticated
        return JSON.stringify(oldMetadata) !== JSON.stringify(newMetadata);
    }
    /**
     * Resolve a link to a target file
     * @param link The link text (e.g., "note", "folder/note", "note#heading")
     * @param sourcePath The path of the file containing the link
     * @returns The resolved TFile or null if not found
     */
    resolveLink(link, sourcePath) {
        return this.getFirstLinkpathDest(link, sourcePath);
    }
    /**
     * Update the link graphs (resolvedLinks and unresolvedLinks) for a given file
     * This is called after indexing a file to update the link tracking
     */
    updateLinkGraphs(path, metadata) {
        // Clear old links
        delete this.resolvedLinks[path];
        delete this.unresolvedLinks[path];
        if (!metadata.links)
            return;
        this.resolvedLinks[path] = {};
        this.unresolvedLinks[path] = {};
        for (const link of metadata.links) {
            const target = this.resolveLink(link.link, path);
            if (target) {
                this.resolvedLinks[path][target.path] =
                    (this.resolvedLinks[path][target.path] ?? 0) + 1;
            }
            else {
                // Use the link text without heading/block reference as key
                const linkKey = link.link.split('#')[0];
                this.unresolvedLinks[path][linkKey] =
                    (this.unresolvedLinks[path][linkKey] ?? 0) + 1;
            }
        }
        // Clean up empty unresolved links object
        if (Object.keys(this.unresolvedLinks[path]).length === 0) {
            delete this.unresolvedLinks[path];
        }
    }
    /**
     * Legacy alias for updateLinkGraphs - kept for backward compatibility
     */
    updateLinkTracking(sourcePath, metadata) {
        this.updateLinkGraphs(sourcePath, metadata);
    }
    parseContent(content) {
        const metadata = {};
        // Parse frontmatter
        const frontmatterResult = this.parseFrontmatter(content);
        if (frontmatterResult) {
            metadata.frontmatter = frontmatterResult.data;
            metadata.frontmatterPosition = frontmatterResult.position;
            metadata.frontmatterLinks = this.extractFrontmatterLinks(frontmatterResult.data);
        }
        // Get content without frontmatter for parsing
        const contentWithoutFrontmatter = frontmatterResult
            ? content.slice(frontmatterResult.position.end.offset)
            : content;
        // Track code blocks to exclude them from parsing
        const codeBlockRanges = this.findCodeBlockRanges(content);
        // Parse links
        metadata.links = this.parseLinks(content, codeBlockRanges);
        // Parse embeds
        metadata.embeds = this.parseEmbeds(content, codeBlockRanges);
        // Parse tags
        metadata.tags = this.parseTags(content, codeBlockRanges);
        // Parse headings
        metadata.headings = this.parseHeadings(content, codeBlockRanges);
        // Parse blocks
        metadata.blocks = this.parseBlocks(content, codeBlockRanges);
        return metadata;
    }
    parseFrontmatter(content) {
        if (!content.startsWith('---'))
            return null;
        const endMatch = content.slice(3).match(/\n---(\n|$)/);
        if (!endMatch)
            return null;
        const endIndex = 3 + endMatch.index + endMatch[0].length;
        const yamlContent = content.slice(4, 3 + endMatch.index);
        try {
            const data = this.parseYaml(yamlContent);
            const lines = content.slice(0, endIndex).split('\n');
            const endLine = lines.length - 1;
            return {
                data,
                position: {
                    start: { line: 0, col: 0, offset: 0 },
                    end: { line: endLine, col: 0, offset: endIndex }
                }
            };
        }
        catch {
            return null;
        }
    }
    parseYaml(content) {
        const lines = content.split('\n');
        return this.parseYamlBlock(lines, 0, 0).value;
    }
    parseYamlBlock(lines, startIndex, baseIndent) {
        const result = {};
        let i = startIndex;
        while (i < lines.length) {
            const line = lines[i];
            const trimmed = line.trim();
            // Skip empty lines
            if (!trimmed) {
                i++;
                continue;
            }
            // Calculate indent
            const indent = line.search(/\S/);
            if (indent !== -1 && indent < baseIndent) {
                // Less indented than our block - we're done
                break;
            }
            // Check for key-value pair
            const colonIndex = trimmed.indexOf(':');
            if (colonIndex > 0) {
                const key = trimmed.slice(0, colonIndex).trim();
                const valueStr = trimmed.slice(colonIndex + 1).trim();
                if (valueStr === '|' || valueStr === '|-' || valueStr === '>') {
                    // Multi-line string
                    i++;
                    let multilineValue = '';
                    let blockIndent = -1;
                    while (i < lines.length) {
                        const mlLine = lines[i];
                        const mlTrimmed = mlLine.trim();
                        const mlIndent = mlLine.search(/\S/);
                        if (mlTrimmed === '') {
                            multilineValue += '\n';
                            i++;
                            continue;
                        }
                        if (blockIndent === -1) {
                            blockIndent = mlIndent;
                        }
                        if (mlIndent < blockIndent) {
                            break;
                        }
                        multilineValue += mlLine.slice(blockIndent) + '\n';
                        i++;
                    }
                    result[key] = multilineValue.trimEnd() + '\n';
                }
                else if (valueStr === '') {
                    // Could be array or nested object - look at next line
                    const nextNonEmpty = this.findNextNonEmptyLine(lines, i + 1);
                    if (nextNonEmpty !== -1) {
                        const nextLine = lines[nextNonEmpty];
                        const nextTrimmed = nextLine.trim();
                        const nextIndent = nextLine.search(/\S/);
                        if (nextIndent > indent && nextTrimmed.startsWith('- ')) {
                            // It's an array
                            const arr = this.parseYamlArray(lines, nextNonEmpty, nextIndent);
                            result[key] = arr.value;
                            i = arr.nextIndex;
                        }
                        else if (nextIndent > indent) {
                            // It's a nested object
                            const nested = this.parseYamlBlock(lines, nextNonEmpty, nextIndent);
                            result[key] = nested.value;
                            i = nested.nextIndex;
                        }
                        else {
                            result[key] = null;
                            i++;
                        }
                    }
                    else {
                        result[key] = null;
                        i++;
                    }
                }
                else if (valueStr.startsWith('[') && valueStr.endsWith(']')) {
                    // Inline array
                    const arrayContent = valueStr.slice(1, -1);
                    result[key] = arrayContent.split(',').map(v => this.parseYamlValue(v.trim()));
                    i++;
                }
                else {
                    result[key] = this.parseYamlValue(valueStr);
                    i++;
                }
            }
            else {
                i++;
            }
        }
        return { value: result, nextIndex: i };
    }
    parseYamlArray(lines, startIndex, baseIndent) {
        const result = [];
        let i = startIndex;
        while (i < lines.length) {
            const line = lines[i];
            const trimmed = line.trim();
            if (!trimmed) {
                i++;
                continue;
            }
            const indent = line.search(/\S/);
            if (indent < baseIndent) {
                break;
            }
            if (trimmed.startsWith('- ')) {
                const value = trimmed.slice(2).trim();
                result.push(this.parseYamlValue(value));
                i++;
            }
            else {
                break;
            }
        }
        return { value: result, nextIndex: i };
    }
    findNextNonEmptyLine(lines, startIndex) {
        for (let i = startIndex; i < lines.length; i++) {
            if (lines[i].trim() !== '') {
                return i;
            }
        }
        return -1;
    }
    parseYamlValue(value) {
        if (value === 'true')
            return true;
        if (value === 'false')
            return false;
        if (value === 'null' || value === '~')
            return null;
        // Check for quoted string
        if (value.startsWith('"') && value.endsWith('"')) {
            // Double-quoted string - unescape special characters
            const inner = value.slice(1, -1);
            return inner.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
        }
        if (value.startsWith("'") && value.endsWith("'")) {
            // Single-quoted string - no escape processing in YAML
            return value.slice(1, -1);
        }
        // Check for number
        const num = Number(value);
        if (!isNaN(num) && value !== '')
            return num;
        return value;
    }
    extractFrontmatterLinks(data) {
        const links = [];
        const extractFromValue = (key, value) => {
            if (typeof value === 'string') {
                const linkMatch = value.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
                if (linkMatch) {
                    links.push({
                        key,
                        link: linkMatch[1],
                        original: linkMatch[0],
                        displayText: linkMatch[2]
                    });
                }
            }
            else if (Array.isArray(value)) {
                value.forEach(v => extractFromValue(key, v));
            }
        };
        for (const [key, value] of Object.entries(data)) {
            extractFromValue(key, value);
        }
        return links.length > 0 ? links : [];
    }
    findCodeBlockRanges(content) {
        const ranges = [];
        // Find fenced code blocks
        const fencedRegex = /```[\s\S]*?```/g;
        let match;
        while ((match = fencedRegex.exec(content)) !== null) {
            ranges.push({ start: match.index, end: match.index + match[0].length });
        }
        // Find inline code
        const inlineRegex = /`[^`]+`/g;
        while ((match = inlineRegex.exec(content)) !== null) {
            // Check if not inside a fenced block
            const isInsideFenced = ranges.some(r => match.index >= r.start && match.index < r.end);
            if (!isInsideFenced) {
                ranges.push({ start: match.index, end: match.index + match[0].length });
            }
        }
        return ranges;
    }
    isInCodeBlock(offset, codeBlockRanges) {
        return codeBlockRanges.some(r => offset >= r.start && offset < r.end);
    }
    getPosition(content, offset, length) {
        const beforeMatch = content.slice(0, offset);
        const lines = beforeMatch.split('\n');
        const line = lines.length - 1;
        const col = lines[lines.length - 1].length;
        const matchContent = content.slice(offset, offset + length);
        const matchLines = matchContent.split('\n');
        const endLine = line + matchLines.length - 1;
        const endCol = matchLines.length > 1 ? matchLines[matchLines.length - 1].length : col + length;
        return {
            start: { line, col, offset },
            end: { line: endLine, col: endCol, offset: offset + length }
        };
    }
    parseLinks(content, codeBlockRanges) {
        const links = [];
        // Match wiki-style links but not embeds (which start with !)
        const regex = /(?<!!)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
            if (this.isInCodeBlock(match.index, codeBlockRanges))
                continue;
            const link = match[1];
            const displayText = match[2];
            links.push({
                link,
                original: match[0],
                displayText,
                position: this.getPosition(content, match.index, match[0].length)
            });
        }
        return links;
    }
    parseEmbeds(content, codeBlockRanges) {
        const embeds = [];
        const regex = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
            if (this.isInCodeBlock(match.index, codeBlockRanges))
                continue;
            embeds.push({
                link: match[1],
                original: match[0],
                displayText: match[2],
                position: this.getPosition(content, match.index, match[0].length)
            });
        }
        return embeds;
    }
    parseTags(content, codeBlockRanges) {
        const tags = [];
        // Match tags: # followed by word characters, hyphens, underscores, or slashes
        // Must not be preceded by a word character and not followed by a space (to exclude headings)
        const regex = /(?:^|[^a-zA-Z0-9])#([a-zA-Z0-9_/-]+)/gm;
        let match;
        while ((match = regex.exec(content)) !== null) {
            const tagStart = match.index + match[0].indexOf('#');
            if (this.isInCodeBlock(tagStart, codeBlockRanges))
                continue;
            // Skip if this is a URL hash - check the whole line up to the tag
            const lineStart = content.lastIndexOf('\n', tagStart) + 1;
            const beforeTag = content.slice(lineStart, tagStart);
            if (beforeTag.includes('://') || beforeTag.includes('.com/') || beforeTag.includes('.org/'))
                continue;
            const tag = `#${match[1]}`;
            tags.push({
                tag,
                position: this.getPosition(content, tagStart, tag.length)
            });
        }
        return tags;
    }
    parseHeadings(content, codeBlockRanges) {
        const headings = [];
        // Match ATX-style headings: 1-6 # at start of line followed by space
        const regex = /^(#{1,6})\s+(.+)$/gm;
        let match;
        while ((match = regex.exec(content)) !== null) {
            if (this.isInCodeBlock(match.index, codeBlockRanges))
                continue;
            const level = match[1].length;
            const heading = match[2].trim();
            headings.push({
                heading,
                level,
                position: this.getPosition(content, match.index, match[0].length)
            });
        }
        return headings;
    }
    parseBlocks(content, codeBlockRanges) {
        const blocks = {};
        // Match block IDs: ^blockid at end of line
        const regex = /\^([a-zA-Z0-9-]+)$/gm;
        let match;
        while ((match = regex.exec(content)) !== null) {
            if (this.isInCodeBlock(match.index, codeBlockRanges))
                continue;
            const id = match[1];
            blocks[id] = {
                id,
                position: this.getPosition(content, match.index, match[0].length)
            };
        }
        return Object.keys(blocks).length > 0 ? blocks : {};
    }
}
//# sourceMappingURL=cache.js.map