export class Graph {
    cache;
    backlinkIndex = null;
    constructor(cache) {
        this.cache = cache;
    }
    /**
     * Invalidate the backlink index (call when links change)
     */
    invalidateBacklinkIndex() {
        this.backlinkIndex = null;
    }
    /**
     * Get or build the backlink index for O(1) backlink lookups
     */
    getBacklinkIndex() {
        if (!this.backlinkIndex) {
            this.backlinkIndex = this.buildBacklinkIndex();
        }
        return this.backlinkIndex;
    }
    /**
     * Build the inverted index: target -> set of source files
     */
    buildBacklinkIndex() {
        const index = new Map();
        const resolvedLinks = this.cache.resolvedLinks;
        for (const [source, targets] of Object.entries(resolvedLinks)) {
            for (const target of Object.keys(targets)) {
                if (!index.has(target)) {
                    index.set(target, new Set());
                }
                index.get(target).add(source);
            }
        }
        return index;
    }
    /**
     * Get outlinks from a file (files this file links to)
     */
    getOutlinks(path) {
        const resolvedLinks = this.cache.resolvedLinks;
        const targets = resolvedLinks[path];
        if (!targets)
            return [];
        return Object.keys(targets);
    }
    /**
     * Get backlinks to a file (files that link to this file)
     * Uses an inverted index for O(1) lookup
     */
    getBacklinks(path) {
        const index = this.getBacklinkIndex();
        const sources = index.get(path);
        return sources ? Array.from(sources) : [];
    }
    /**
     * Get all direct neighbors of a file (both outlinks and backlinks)
     */
    getDirectNeighbors(path) {
        const outlinks = this.getOutlinks(path);
        const backlinks = this.getBacklinks(path);
        // Combine and deduplicate
        const neighborSet = new Set([...outlinks, ...backlinks]);
        return Array.from(neighborSet);
    }
    /**
     * Check if a file path exists in the graph
     */
    fileExists(path) {
        const resolvedLinks = this.cache.resolvedLinks;
        // Exists if it's a source of links
        if (path in resolvedLinks)
            return true;
        // Exists if it's a target of any link
        for (const targets of Object.values(resolvedLinks)) {
            if (path in targets)
                return true;
        }
        return false;
    }
    /**
     * Get neighbors within a certain depth using BFS traversal
     * @param path - The source file path
     * @param depth - Maximum depth to traverse (default 1)
     * @param limit - Maximum number of neighbors to return (default unlimited)
     */
    getNeighbors(path, depth = 1, limit) {
        // Handle edge cases
        if (depth <= 0)
            return [];
        if (limit === 0)
            return [];
        // Check if source exists
        if (!this.fileExists(path))
            return [];
        // BFS traversal
        const visited = new Set([path]);
        const neighbors = [];
        let currentLevel = [path];
        for (let d = 0; d < depth; d++) {
            const nextLevel = [];
            for (const current of currentLevel) {
                const directNeighbors = this.getDirectNeighbors(current);
                for (const neighbor of directNeighbors) {
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        neighbors.push(neighbor);
                        nextLevel.push(neighbor);
                    }
                }
            }
            currentLevel = nextLevel;
            if (currentLevel.length === 0)
                break;
        }
        // Convert paths to TFile objects and apply limit
        const files = [];
        for (const neighborPath of neighbors) {
            if (limit !== undefined && files.length >= limit)
                break;
            files.push(this.createTFileFromPath(neighborPath));
        }
        return files;
    }
    /**
     * Find the shortest path between two files using BFS
     * @param from - Source file path
     * @param to - Target file path
     * @returns Array of paths from source to target, or null if no path exists
     */
    findPath(from, to) {
        // Handle same source and target
        if (from === to) {
            // Check if the file exists
            if (this.fileExists(from))
                return [from];
            return null;
        }
        // Check if both files exist
        if (!this.fileExists(from) || !this.fileExists(to))
            return null;
        // BFS to find shortest path
        const visited = new Set([from]);
        const queue = [
            { path: from, route: [from] }
        ];
        while (queue.length > 0) {
            const current = queue.shift();
            const neighbors = this.getDirectNeighbors(current.path);
            for (const neighbor of neighbors) {
                if (neighbor === to) {
                    return [...current.route, to];
                }
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push({
                        path: neighbor,
                        route: [...current.route, neighbor]
                    });
                }
            }
        }
        return null;
    }
    analyze() { throw new Error('Not implemented'); }
    /**
     * Helper to create a TFile object from a path
     */
    createTFileFromPath(path) {
        const parts = path.split('/');
        const name = parts[parts.length - 1];
        const extension = name.includes('.') ? name.split('.').pop() : '';
        const basename = name.replace(`.${extension}`, '');
        return {
            path,
            name,
            basename,
            extension,
            stat: {
                ctime: Date.now(),
                mtime: Date.now(),
                size: 0,
            },
        };
    }
    /**
     * Get all nodes (file paths) from the graph
     */
    getAllNodes() {
        const resolvedLinks = this.cache.resolvedLinks;
        const nodes = new Set(Object.keys(resolvedLinks));
        // Also include target-only nodes
        for (const targets of Object.values(resolvedLinks)) {
            for (const target of Object.keys(targets)) {
                nodes.add(target);
            }
        }
        return Array.from(nodes);
    }
    /**
     * Calculate the in-degree for a node (number of incoming links)
     */
    calculateInDegree(path) {
        let inDegree = 0;
        const resolvedLinks = this.cache.resolvedLinks;
        for (const sourcePath of Object.keys(resolvedLinks)) {
            if (sourcePath === path)
                continue; // Skip self-references
            const targets = resolvedLinks[sourcePath];
            if (targets && path in targets) {
                inDegree++;
            }
        }
        return inDegree;
    }
    /**
     * Calculate the out-degree for a node (number of outgoing links, excluding self-references)
     */
    calculateOutDegree(path) {
        const targets = this.cache.resolvedLinks[path];
        if (!targets)
            return 0;
        let outDegree = 0;
        for (const targetPath of Object.keys(targets)) {
            if (targetPath !== path) { // Exclude self-references
                outDegree++;
            }
        }
        return outDegree;
    }
    /**
     * Get files with no incoming or outgoing links
     */
    getOrphans() {
        const orphans = [];
        const resolvedLinks = this.cache.resolvedLinks;
        for (const path of this.getAllNodes()) {
            const outDegree = this.calculateOutDegree(path);
            const inDegree = this.calculateInDegree(path);
            if (outDegree === 0 && inDegree === 0) {
                orphans.push(this.createTFileFromPath(path));
            }
        }
        return orphans;
    }
    /**
     * Get all dead links (links to non-existent files)
     */
    getDeadLinks() {
        const deadLinks = [];
        const unresolvedLinks = this.cache.unresolvedLinks;
        for (const sourcePath of Object.keys(unresolvedLinks)) {
            const links = unresolvedLinks[sourcePath];
            for (const link of Object.keys(links)) {
                deadLinks.push({
                    source: sourcePath,
                    link,
                });
            }
        }
        return deadLinks;
    }
    /**
     * Get files sorted by backlink count (most linked first)
     */
    getMostLinked(limit = 10) {
        const backlinkCounts = {};
        // Count backlinks for each file
        const resolvedLinks = this.cache.resolvedLinks;
        for (const sourcePath of Object.keys(resolvedLinks)) {
            const targets = resolvedLinks[sourcePath];
            for (const targetPath of Object.keys(targets)) {
                if (targetPath !== sourcePath) { // Exclude self-references
                    backlinkCounts[targetPath] = (backlinkCounts[targetPath] || 0) + 1;
                }
            }
        }
        // Convert to array and sort by count descending
        const result = [];
        for (const [path, count] of Object.entries(backlinkCounts)) {
            if (count > 0) {
                result.push({
                    file: this.createTFileFromPath(path),
                    count,
                });
            }
        }
        result.sort((a, b) => b.count - a.count);
        return result.slice(0, limit);
    }
    /**
     * Get connected components (clusters) using Union-Find algorithm
     */
    getClusters() {
        const nodes = this.getAllNodes();
        if (nodes.length === 0)
            return [];
        // Union-Find data structure
        const parent = {};
        const rank = {};
        // Initialize each node as its own parent
        for (const node of nodes) {
            parent[node] = node;
            rank[node] = 0;
        }
        // Find with path compression
        const find = (x) => {
            if (parent[x] !== x) {
                parent[x] = find(parent[x]);
            }
            return parent[x];
        };
        // Union by rank
        const union = (x, y) => {
            const rootX = find(x);
            const rootY = find(y);
            if (rootX !== rootY) {
                if (rank[rootX] < rank[rootY]) {
                    parent[rootX] = rootY;
                }
                else if (rank[rootX] > rank[rootY]) {
                    parent[rootY] = rootX;
                }
                else {
                    parent[rootY] = rootX;
                    rank[rootX]++;
                }
            }
        };
        // Process all edges (treat graph as undirected for clustering)
        const resolvedLinks = this.cache.resolvedLinks;
        for (const sourcePath of Object.keys(resolvedLinks)) {
            const targets = resolvedLinks[sourcePath];
            for (const targetPath of Object.keys(targets)) {
                if (sourcePath !== targetPath && parent[targetPath] !== undefined) {
                    union(sourcePath, targetPath);
                }
            }
        }
        // Group nodes by their root
        const clusters = {};
        for (const node of nodes) {
            const root = find(node);
            if (!clusters[root]) {
                clusters[root] = [];
            }
            clusters[root].push(this.createTFileFromPath(node));
        }
        return Object.values(clusters);
    }
    /**
     * Get graph statistics
     */
    getStats() {
        const nodes = this.getAllNodes();
        const totalNodes = nodes.length;
        if (totalNodes === 0) {
            return {
                totalNodes: 0,
                totalEdges: 0,
                orphanCount: 0,
                averageDegree: 0,
            };
        }
        // Count total edges (excluding self-references)
        let totalEdges = 0;
        const resolvedLinks = this.cache.resolvedLinks;
        for (const sourcePath of Object.keys(resolvedLinks)) {
            const targets = resolvedLinks[sourcePath];
            for (const targetPath of Object.keys(targets)) {
                if (targetPath !== sourcePath) {
                    totalEdges++;
                }
            }
        }
        // Count orphans
        const orphanCount = this.getOrphans().length;
        // Calculate average degree (sum of all degrees / number of nodes)
        let totalDegree = 0;
        for (const node of nodes) {
            totalDegree += this.calculateInDegree(node) + this.calculateOutDegree(node);
        }
        const averageDegree = totalNodes > 0 ? totalDegree / totalNodes : 0;
        return {
            totalNodes,
            totalEdges,
            orphanCount,
            averageDegree,
        };
    }
    /**
     * Get the degree of a specific node
     */
    getNodeDegree(path, type = 'total') {
        const inDegree = this.calculateInDegree(path);
        const outDegree = this.calculateOutDegree(path);
        switch (type) {
            case 'in':
                return inDegree;
            case 'out':
                return outDegree;
            case 'total':
            default:
                return inDegree + outDegree;
        }
    }
    /**
     * Get degrees for all nodes in the graph
     */
    getAllNodeDegrees() {
        const degrees = {};
        const nodes = this.getAllNodes();
        for (const node of nodes) {
            const inDegree = this.calculateInDegree(node);
            const outDegree = this.calculateOutDegree(node);
            degrees[node] = {
                in: inDegree,
                out: outDegree,
                total: inDegree + outDegree,
            };
        }
        return degrees;
    }
}
//# sourceMappingURL=graph.js.map