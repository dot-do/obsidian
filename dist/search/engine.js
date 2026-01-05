export class SearchEngine {
    vault;
    cache;
    constructor(vault, cache) {
        this.vault = vault;
        this.cache = cache;
    }
    async search(query, options) {
        // Handle edge cases
        if (options?.limit === 0) {
            return [];
        }
        if (options?.limit !== undefined && options.limit < 0) {
            return [];
        }
        const files = this.vault.getMarkdownFiles();
        const results = [];
        // Get the folder filter normalized
        const folderFilter = options?.filter?.folder
            ? options.filter.folder.replace(/\/$/, '') // Remove trailing slash
            : undefined;
        // Normalize tag filters (remove # prefix if present)
        const tagFilters = options?.filter?.tags
            ?.filter(t => t.length > 0)
            ?.map(t => t.startsWith('#') ? t.slice(1).toLowerCase() : t.toLowerCase());
        for (const file of files) {
            // Apply folder filter
            if (folderFilter) {
                if (!file.path.startsWith(folderFilter + '/') && !file.path.startsWith(folderFilter)) {
                    continue;
                }
                // Make sure it's actually in this folder, not just starting with similar name
                const relativePath = file.path.substring(folderFilter.length);
                if (!relativePath.startsWith('/') && relativePath.length > 0 && folderFilter !== file.path.split('/').slice(0, -1).join('/')) {
                    // Check if the path actually starts with folder/
                    if (!file.path.startsWith(folderFilter + '/')) {
                        continue;
                    }
                }
            }
            // Apply tag filter
            if (tagFilters && tagFilters.length > 0) {
                const metadata = this.cache.getFileCache(file);
                const fileTags = this.getFileTags(file, metadata);
                const hasAllTags = tagFilters.every(tag => fileTags.some(ft => ft.toLowerCase() === tag));
                if (!hasAllTags) {
                    continue;
                }
            }
            // Get file content for search
            const content = await this.vault.cachedRead(file);
            // If query is empty but we have filters, return all matching files with base score
            if (!query || query.trim() === '') {
                results.push({
                    file,
                    score: 1,
                    matches: []
                });
                continue;
            }
            // Escape special regex characters in the query
            const escapedQuery = this.escapeRegex(query);
            // Search for matches (case insensitive)
            const regex = new RegExp(escapedQuery, 'gi');
            const lines = content.split('\n');
            const matches = [];
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const lineMatches = [];
                let match;
                // Reset lastIndex for each line
                regex.lastIndex = 0;
                while ((match = regex.exec(line)) !== null) {
                    lineMatches.push(match.index);
                }
                if (lineMatches.length > 0) {
                    matches.push({
                        line: i + 1, // 1-indexed
                        text: line,
                        positions: lineMatches
                    });
                }
            }
            if (matches.length > 0) {
                const score = this.calculateScore(query, content, matches, file);
                results.push({
                    file,
                    score,
                    matches
                });
            }
        }
        // Sort by score descending
        results.sort((a, b) => b.score - a.score);
        // Apply limit
        if (options?.limit !== undefined && options.limit > 0) {
            return results.slice(0, options.limit);
        }
        return results;
    }
    findByTag(tag) {
        if (!tag || tag.trim() === '') {
            return [];
        }
        // Normalize tag (remove # prefix if present, lowercase for comparison)
        const normalizedTag = tag.startsWith('#') ? tag.slice(1).toLowerCase() : tag.toLowerCase();
        const files = this.vault.getMarkdownFiles();
        const matchingFiles = [];
        const seenPaths = new Set();
        for (const file of files) {
            const metadata = this.cache.getFileCache(file);
            const fileTags = this.getFileTags(file, metadata);
            const hasTag = fileTags.some(t => t.toLowerCase() === normalizedTag);
            if (hasTag && !seenPaths.has(file.path)) {
                seenPaths.add(file.path);
                matchingFiles.push(file);
            }
        }
        return matchingFiles;
    }
    findByProperty(key, value) {
        const files = this.vault.getMarkdownFiles();
        const matchingFiles = [];
        for (const file of files) {
            const metadata = this.cache.getFileCache(file);
            const frontmatter = metadata?.frontmatter;
            // Handle nested property access (dot notation)
            const keys = key.split('.');
            let currentValue = frontmatter;
            for (const k of keys) {
                if (currentValue && typeof currentValue === 'object') {
                    currentValue = currentValue[k];
                }
                else {
                    currentValue = undefined;
                    break;
                }
            }
            // Handle undefined value - find files missing the property
            if (value === undefined) {
                if (currentValue === undefined) {
                    matchingFiles.push(file);
                }
                continue;
            }
            // Handle null value - find files with property set to null
            if (value === null) {
                if (currentValue === null) {
                    matchingFiles.push(file);
                }
                continue;
            }
            // Handle array property values - check if array contains value
            if (Array.isArray(currentValue)) {
                if (currentValue.includes(value)) {
                    matchingFiles.push(file);
                }
                continue;
            }
            // Handle direct value comparison
            if (currentValue === value) {
                matchingFiles.push(file);
            }
        }
        return matchingFiles;
    }
    findByLink(target) {
        if (!target || target.trim() === '') {
            return [];
        }
        // Normalize target - remove .md extension and path if present
        const normalizedTarget = target
            .replace(/\.md$/, '')
            .split('/')
            .pop()
            .toLowerCase();
        const files = this.vault.getMarkdownFiles();
        const matchingFiles = [];
        const seenPaths = new Set();
        for (const file of files) {
            // Don't include the target file itself
            const fileBasename = file.basename.toLowerCase();
            if (fileBasename === normalizedTarget) {
                continue;
            }
            const metadata = this.cache.getFileCache(file);
            const links = metadata?.links || [];
            const embeds = metadata?.embeds || [];
            const allLinks = [...links, ...embeds];
            for (const link of allLinks) {
                // Normalize link - remove .md extension, get basename, handle sections/blocks
                const linkTarget = link.link
                    .replace(/\.md$/, '')
                    .split('#')[0] // Remove section reference
                    .split('^')[0] // Remove block reference
                    .split('/')
                    .pop()
                    .toLowerCase();
                if (linkTarget === normalizedTarget && !seenPaths.has(file.path)) {
                    seenPaths.add(file.path);
                    matchingFiles.push(file);
                    break; // No need to check more links for this file
                }
            }
        }
        return matchingFiles;
    }
    /**
     * Get all tags from a file (both frontmatter and inline)
     */
    getFileTags(file, metadata) {
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
                // Remove # prefix from tag
                const tag = tagCache.tag.startsWith('#') ? tagCache.tag.slice(1) : tagCache.tag;
                tags.push(tag);
            }
        }
        return tags;
    }
    /**
     * Escape special regex characters in a string
     */
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    /**
     * Calculate relevance score for a search result
     */
    calculateScore(query, content, matches, file) {
        let score = 0;
        const queryLower = query.toLowerCase();
        const contentLower = content.toLowerCase();
        const lines = content.split('\n');
        // Base score: number of matches
        const totalMatchCount = matches.reduce((sum, m) => sum + m.positions.length, 0);
        score += totalMatchCount * 10;
        // Bonus for title matches (first heading or filename)
        const titleLine = lines.find(l => l.startsWith('# '));
        if (titleLine && titleLine.toLowerCase().includes(queryLower)) {
            score += 100;
        }
        // Bonus for filename match
        if (file.basename.toLowerCase().includes(queryLower)) {
            score += 80;
        }
        // Bonus for exact phrase match
        if (contentLower.includes(queryLower)) {
            score += 50;
        }
        // Bonus for match density (matches per content length)
        const density = totalMatchCount / (content.length / 1000);
        score += density * 5;
        // Bonus for multiple matches spread across lines
        if (matches.length > 1) {
            score += matches.length * 5;
        }
        // Bonus for matches early in the document
        const firstMatchLine = matches[0]?.line || 0;
        if (firstMatchLine <= 5) {
            score += 20;
        }
        return score;
    }
}
//# sourceMappingURL=engine.js.map