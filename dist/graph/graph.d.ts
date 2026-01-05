import type { TFile } from '../types.js';
import type { MetadataCache } from '../metadata/cache.js';
export interface GraphAnalysis {
    clusters: string[][];
    orphans: string[];
    hubs: Array<{
        path: string;
        connections: number;
    }>;
}
export interface DeadLink {
    source: string;
    link: string;
}
export interface LinkedFile {
    file: TFile;
    count: number;
}
export interface GraphStats {
    totalNodes: number;
    totalEdges: number;
    orphanCount: number;
    averageDegree: number;
}
export interface NodeDegree {
    in: number;
    out: number;
    total: number;
}
export type DegreeType = 'in' | 'out' | 'total';
export declare class Graph {
    private cache;
    private backlinkIndex;
    constructor(cache: MetadataCache);
    /**
     * Invalidate the backlink index (call when links change)
     */
    invalidateBacklinkIndex(): void;
    /**
     * Get or build the backlink index for O(1) backlink lookups
     */
    private getBacklinkIndex;
    /**
     * Build the inverted index: target -> set of source files
     */
    private buildBacklinkIndex;
    /**
     * Get outlinks from a file (files this file links to)
     */
    getOutlinks(path: string): string[];
    /**
     * Get backlinks to a file (files that link to this file)
     * Uses an inverted index for O(1) lookup
     */
    getBacklinks(path: string): string[];
    /**
     * Get all direct neighbors of a file (both outlinks and backlinks)
     */
    private getDirectNeighbors;
    /**
     * Check if a file path exists in the graph
     */
    private fileExists;
    /**
     * Get neighbors within a certain depth using BFS traversal
     * @param path - The source file path
     * @param depth - Maximum depth to traverse (default 1)
     * @param limit - Maximum number of neighbors to return (default unlimited)
     */
    getNeighbors(path: string, depth?: number, limit?: number): TFile[];
    /**
     * Find the shortest path between two files using BFS
     * @param from - Source file path
     * @param to - Target file path
     * @returns Array of paths from source to target, or null if no path exists
     */
    findPath(from: string, to: string): string[] | null;
    analyze(): GraphAnalysis;
    /**
     * Helper to create a TFile object from a path
     */
    private createTFileFromPath;
    /**
     * Get all nodes (file paths) from the graph
     */
    private getAllNodes;
    /**
     * Calculate the in-degree for a node (number of incoming links)
     */
    private calculateInDegree;
    /**
     * Calculate the out-degree for a node (number of outgoing links, excluding self-references)
     */
    private calculateOutDegree;
    /**
     * Get files with no incoming or outgoing links
     */
    getOrphans(): TFile[];
    /**
     * Get all dead links (links to non-existent files)
     */
    getDeadLinks(): DeadLink[];
    /**
     * Get files sorted by backlink count (most linked first)
     */
    getMostLinked(limit?: number): LinkedFile[];
    /**
     * Get connected components (clusters) using Union-Find algorithm
     */
    getClusters(): TFile[][];
    /**
     * Get graph statistics
     */
    getStats(): GraphStats;
    /**
     * Get the degree of a specific node
     */
    getNodeDegree(path: string, type?: DegreeType): number;
    /**
     * Get degrees for all nodes in the graph
     */
    getAllNodeDegrees(): Record<string, NodeDegree>;
}
//# sourceMappingURL=graph.d.ts.map