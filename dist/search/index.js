/**
 * Search Index Module
 *
 * Provides high-performance search indexing for large vaults.
 * Features:
 * - Inverted index for fast content lookups
 * - Incremental indexing (only re-index changed files)
 * - Search result caching with TTL
 * - Term frequency scoring
 */
// Default stop words for English
const DEFAULT_STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'this',
    'that', 'these', 'those', 'it', 'its', 'as', 'if', 'not', 'no', 'yes',
]);
/**
 * SearchIndex provides fast full-text search with inverted index.
 * Supports incremental updates and result caching.
 */
export class SearchIndex {
    vault;
    cache;
    options;
    /** Inverted index: term -> list of documents containing term */
    invertedIndex = new Map();
    /** Document metadata: path -> document info */
    documents = new Map();
    /** Total number of documents */
    documentCount = 0;
    /** Result cache with LRU eviction */
    resultCache = new Map();
    /** Tracks if index needs full rebuild */
    needsRebuild = true;
    /** Paths of files that need re-indexing */
    dirtyPaths = new Set();
    constructor(vault, cache, options = {}) {
        this.vault = vault;
        this.cache = cache;
        this.options = {
            minTermLength: options.minTermLength ?? 2,
            stopWords: options.stopWords ?? DEFAULT_STOP_WORDS,
            maxCacheEntries: options.maxCacheEntries ?? 100,
            cacheTTL: options.cacheTTL ?? 30000,
        };
    }
    /**
     * Build or rebuild the entire search index.
     * Call this initially or when you need a full refresh.
     */
    async buildIndex() {
        this.invertedIndex.clear();
        this.documents.clear();
        this.resultCache.clear();
        this.dirtyPaths.clear();
        const files = this.vault.getMarkdownFiles();
        this.documentCount = files.length;
        for (const file of files) {
            await this.indexFile(file);
        }
        this.needsRebuild = false;
    }
    /**
     * Mark a file as needing re-indexing.
     * Call this when a file is modified.
     */
    markDirty(path) {
        this.dirtyPaths.add(path);
        this.invalidateCache();
    }
    /**
     * Mark a file as deleted.
     * Removes it from the index.
     */
    markDeleted(path) {
        this.removeFromIndex(path);
        this.invalidateCache();
    }
    /**
     * Update index for any dirty files.
     * Call this before searching for accurate results.
     */
    async updateIndex() {
        if (this.needsRebuild) {
            await this.buildIndex();
            return;
        }
        for (const path of this.dirtyPaths) {
            const file = this.vault.getFileByPath(path);
            if (file) {
                this.removeFromIndex(path);
                await this.indexFile(file);
            }
            else {
                this.removeFromIndex(path);
            }
        }
        this.dirtyPaths.clear();
    }
    /**
     * Check if the index needs updating.
     */
    needsUpdate() {
        return this.needsRebuild || this.dirtyPaths.size > 0;
    }
    /**
     * Get index statistics.
     */
    getStats() {
        return {
            documentCount: this.documents.size,
            termCount: this.invertedIndex.size,
            cacheSize: this.resultCache.size,
        };
    }
    /**
     * Search the index for documents matching the query.
     * Uses TF-IDF scoring for relevance.
     */
    search(query, limit) {
        // Check cache first
        const cacheKey = `${query}:${limit ?? 'all'}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) {
            return cached;
        }
        // Tokenize query
        const queryTerms = this.tokenize(query);
        if (queryTerms.length === 0) {
            return [];
        }
        // Find documents containing any query terms
        const documentScores = new Map();
        for (let i = 0; i < queryTerms.length; i++) {
            const term = queryTerms[i];
            const entries = this.findEntriesForTerm(term);
            for (let j = 0; j < entries.length; j++) {
                const entry = entries[j];
                const existing = documentScores.get(entry.path);
                const idf = this.calculateIDF(term);
                const tf = entry.tf;
                const tfidf = tf * idf;
                if (existing) {
                    existing.score += tfidf;
                    existing.matchedTerms.push(term);
                    existing.positions.set(term, entry.positions);
                }
                else {
                    const positions = new Map();
                    positions.set(term, entry.positions);
                    documentScores.set(entry.path, {
                        score: tfidf,
                        matchedTerms: [term],
                        positions,
                    });
                }
            }
        }
        // Convert to results and apply additional scoring factors
        const results = [];
        const files = this.vault.getMarkdownFiles();
        const fileMap = new Map(files.map(f => [f.path, f]));
        const documentEntries = Array.from(documentScores.entries());
        for (let i = 0; i < documentEntries.length; i++) {
            const [path, scoreData] = documentEntries[i];
            const file = fileMap.get(path);
            if (!file)
                continue;
            const docMeta = this.documents.get(path);
            // Boost score based on various factors
            let finalScore = scoreData.score;
            // Boost for matching more query terms
            const termCoverage = scoreData.matchedTerms.length / queryTerms.length;
            finalScore *= (0.5 + termCoverage * 0.5);
            // Boost for title matches
            if (docMeta) {
                const titleLower = docMeta.title.toLowerCase();
                for (const term of scoreData.matchedTerms) {
                    if (titleLower.includes(term)) {
                        finalScore *= 1.5;
                        break;
                    }
                }
            }
            // Boost for shorter documents (higher density)
            if (docMeta && docMeta.termCount > 0) {
                const density = scoreData.matchedTerms.length / docMeta.termCount;
                finalScore *= (1 + density * 10);
            }
            results.push({
                file,
                score: finalScore,
                matchedTerms: scoreData.matchedTerms,
                positions: scoreData.positions,
            });
        }
        // Sort by score descending
        results.sort((a, b) => b.score - a.score);
        // Apply limit
        const limitedResults = limit ? results.slice(0, limit) : results;
        // Cache results
        this.addToCache(cacheKey, limitedResults);
        return limitedResults;
    }
    /**
     * Find entries matching a term (including prefix matches).
     */
    findEntriesForTerm(term) {
        // Exact match first
        const exact = this.invertedIndex.get(term);
        if (exact) {
            return exact;
        }
        // Prefix match for terms longer than 3 characters
        if (term.length >= 3) {
            const results = [];
            const indexEntries = Array.from(this.invertedIndex.entries());
            for (let i = 0; i < indexEntries.length; i++) {
                const [indexedTerm, entries] = indexEntries[i];
                if (indexedTerm.startsWith(term)) {
                    results.push(...entries);
                }
            }
            return results;
        }
        return [];
    }
    /**
     * Index a single file.
     */
    async indexFile(file) {
        const content = await this.vault.cachedRead(file);
        const lines = content.split('\n');
        // Extract document metadata
        const metadata = this.cache.getFileCache(file);
        const title = this.extractTitle(content, file);
        const tags = this.extractTags(file, metadata);
        // Tokenize and build term frequency map
        const termFrequency = new Map();
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const lineTerms = this.tokenize(lines[lineNum]);
            for (const term of lineTerms) {
                const existing = termFrequency.get(term);
                if (existing) {
                    existing.count++;
                    if (!existing.positions.includes(lineNum + 1)) {
                        existing.positions.push(lineNum + 1);
                    }
                }
                else {
                    termFrequency.set(term, { count: 1, positions: [lineNum + 1] });
                }
            }
        }
        // Add to inverted index
        let totalTerms = 0;
        const termEntries = Array.from(termFrequency.entries());
        for (let i = 0; i < termEntries.length; i++) {
            const [term, data] = termEntries[i];
            totalTerms += data.count;
            const entry = {
                path: file.path,
                tf: data.count,
                positions: data.positions,
            };
            const existing = this.invertedIndex.get(term);
            if (existing) {
                existing.push(entry);
            }
            else {
                this.invertedIndex.set(term, [entry]);
            }
        }
        // Store document metadata
        this.documents.set(file.path, {
            path: file.path,
            mtime: file.stat.mtime,
            termCount: totalTerms,
            title,
            tags,
        });
    }
    /**
     * Remove a file from the index.
     */
    removeFromIndex(path) {
        // Remove from inverted index
        const invertedEntries = Array.from(this.invertedIndex.entries());
        for (let i = 0; i < invertedEntries.length; i++) {
            const [term, entries] = invertedEntries[i];
            const filtered = entries.filter(e => e.path !== path);
            if (filtered.length === 0) {
                this.invertedIndex.delete(term);
            }
            else if (filtered.length !== entries.length) {
                this.invertedIndex.set(term, filtered);
            }
        }
        // Remove from document metadata
        this.documents.delete(path);
    }
    /**
     * Tokenize text into searchable terms.
     */
    tokenize(text) {
        const terms = [];
        const words = text.toLowerCase().split(/[\s\-_./\\,;:!?'"()[\]{}]+/);
        for (const word of words) {
            // Skip short words
            if (word.length < this.options.minTermLength)
                continue;
            // Skip stop words
            if (this.options.stopWords.has(word))
                continue;
            // Skip pure numbers
            if (/^\d+$/.test(word))
                continue;
            terms.push(word);
        }
        return terms;
    }
    /**
     * Extract document title from content.
     */
    extractTitle(content, file) {
        const lines = content.split('\n');
        for (const line of lines) {
            const match = line.match(/^#\s+(.+)$/);
            if (match) {
                return match[1].trim();
            }
        }
        return file.basename;
    }
    /**
     * Extract tags from file metadata.
     */
    extractTags(file, metadata) {
        const tags = [];
        // Frontmatter tags
        if (metadata?.frontmatter?.tags) {
            const fmTags = metadata.frontmatter.tags;
            if (Array.isArray(fmTags)) {
                tags.push(...fmTags.map(t => String(t)));
            }
            else if (typeof fmTags === 'string') {
                tags.push(fmTags);
            }
        }
        // Inline tags
        if (metadata?.tags) {
            for (const tagCache of metadata.tags) {
                const tag = tagCache.tag.startsWith('#') ? tagCache.tag.slice(1) : tagCache.tag;
                if (!tags.includes(tag)) {
                    tags.push(tag);
                }
            }
        }
        return tags;
    }
    /**
     * Calculate Inverse Document Frequency for a term.
     */
    calculateIDF(term) {
        const entries = this.invertedIndex.get(term);
        if (!entries || entries.length === 0) {
            return 0;
        }
        const docFrequency = entries.length;
        const totalDocs = Math.max(this.documents.size, 1);
        // Standard IDF formula with smoothing
        return Math.log((totalDocs + 1) / (docFrequency + 1)) + 1;
    }
    /**
     * Get result from cache if valid.
     */
    getFromCache(key) {
        const entry = this.resultCache.get(key);
        if (!entry)
            return null;
        const now = Date.now();
        if (now - entry.timestamp > this.options.cacheTTL) {
            this.resultCache.delete(key);
            return null;
        }
        return entry.value;
    }
    /**
     * Add result to cache with LRU eviction.
     */
    addToCache(key, value) {
        // Evict oldest entries if at capacity
        while (this.resultCache.size >= this.options.maxCacheEntries) {
            const oldestKey = this.resultCache.keys().next().value;
            if (oldestKey) {
                this.resultCache.delete(oldestKey);
            }
            else {
                break;
            }
        }
        this.resultCache.set(key, {
            value,
            timestamp: Date.now(),
            key,
        });
    }
    /**
     * Invalidate the entire result cache.
     */
    invalidateCache() {
        this.resultCache.clear();
    }
    /**
     * Clear the entire index.
     */
    clear() {
        this.invertedIndex.clear();
        this.documents.clear();
        this.resultCache.clear();
        this.dirtyPaths.clear();
        this.documentCount = 0;
        this.needsRebuild = true;
    }
}
//# sourceMappingURL=index.js.map