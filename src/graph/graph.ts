import type { TFile } from '../types.js'
import type { MetadataCache } from '../metadata/cache.js'

export interface GraphAnalysis {
  clusters: string[][]
  orphans: string[]
  hubs: Array<{ path: string; connections: number }>
}

export interface DeadLink {
  source: string
  link: string
}

export interface LinkedFile {
  file: TFile
  count: number
}

export interface GraphStats {
  totalNodes: number
  totalEdges: number
  orphanCount: number
  averageDegree: number
}

export interface NodeDegree {
  in: number
  out: number
  total: number
}

export type DegreeType = 'in' | 'out' | 'total'

export class Graph {
  constructor(private cache: MetadataCache) {}

  /**
   * Get outlinks from a file (files this file links to)
   */
  getOutlinks(path: string): string[] {
    const resolvedLinks = this.cache.resolvedLinks
    const targets = resolvedLinks[path]
    if (!targets) return []
    return Object.keys(targets)
  }

  /**
   * Get backlinks to a file (files that link to this file)
   */
  getBacklinks(path: string): string[] {
    const resolvedLinks = this.cache.resolvedLinks
    const backlinks: string[] = []

    for (const [source, targets] of Object.entries(resolvedLinks)) {
      if (targets[path]) {
        backlinks.push(source)
      }
    }

    return backlinks
  }

  /**
   * Get all direct neighbors of a file (both outlinks and backlinks)
   */
  private getDirectNeighbors(path: string): string[] {
    const outlinks = this.getOutlinks(path)
    const backlinks = this.getBacklinks(path)

    // Combine and deduplicate
    const neighborSet = new Set<string>([...outlinks, ...backlinks])
    return Array.from(neighborSet)
  }

  /**
   * Check if a file path exists in the graph
   */
  private fileExists(path: string): boolean {
    const resolvedLinks = this.cache.resolvedLinks
    // Exists if it's a source of links
    if (path in resolvedLinks) return true
    // Exists if it's a target of any link
    for (const targets of Object.values(resolvedLinks)) {
      if (path in targets) return true
    }
    return false
  }

  /**
   * Get neighbors within a certain depth using BFS traversal
   * @param path - The source file path
   * @param depth - Maximum depth to traverse (default 1)
   * @param limit - Maximum number of neighbors to return (default unlimited)
   */
  getNeighbors(path: string, depth: number = 1, limit?: number): TFile[] {
    // Handle edge cases
    if (depth <= 0) return []
    if (limit === 0) return []

    // Check if source exists
    if (!this.fileExists(path)) return []

    // BFS traversal
    const visited = new Set<string>([path])
    const neighbors: string[] = []
    let currentLevel: string[] = [path]

    for (let d = 0; d < depth; d++) {
      const nextLevel: string[] = []

      for (const current of currentLevel) {
        const directNeighbors = this.getDirectNeighbors(current)

        for (const neighbor of directNeighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor)
            neighbors.push(neighbor)
            nextLevel.push(neighbor)
          }
        }
      }

      currentLevel = nextLevel
      if (currentLevel.length === 0) break
    }

    // Convert paths to TFile objects and apply limit
    const files: TFile[] = []
    for (const neighborPath of neighbors) {
      if (limit !== undefined && files.length >= limit) break
      files.push(this.createTFileFromPath(neighborPath))
    }

    return files
  }

  /**
   * Find the shortest path between two files using BFS
   * @param from - Source file path
   * @param to - Target file path
   * @returns Array of paths from source to target, or null if no path exists
   */
  findPath(from: string, to: string): string[] | null {
    // Handle same source and target
    if (from === to) {
      // Check if the file exists
      if (this.fileExists(from)) return [from]
      return null
    }

    // Check if both files exist
    if (!this.fileExists(from) || !this.fileExists(to)) return null

    // BFS to find shortest path
    const visited = new Set<string>([from])
    const queue: Array<{ path: string; route: string[] }> = [
      { path: from, route: [from] }
    ]

    while (queue.length > 0) {
      const current = queue.shift()!
      const neighbors = this.getDirectNeighbors(current.path)

      for (const neighbor of neighbors) {
        if (neighbor === to) {
          return [...current.route, to]
        }

        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          queue.push({
            path: neighbor,
            route: [...current.route, neighbor]
          })
        }
      }
    }

    return null
  }

  analyze(): GraphAnalysis { throw new Error('Not implemented') }

  /**
   * Helper to create a TFile object from a path
   */
  private createTFileFromPath(path: string): TFile {
    const parts = path.split('/')
    const name = parts[parts.length - 1]
    const extension = name.includes('.') ? name.split('.').pop()! : ''
    const basename = name.replace(`.${extension}`, '')

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
    }
  }

  /**
   * Get all nodes (file paths) from the graph
   */
  private getAllNodes(): string[] {
    return Object.keys(this.cache.resolvedLinks)
  }

  /**
   * Calculate the in-degree for a node (number of incoming links)
   */
  private calculateInDegree(path: string): number {
    let inDegree = 0
    const resolvedLinks = this.cache.resolvedLinks

    for (const sourcePath of Object.keys(resolvedLinks)) {
      if (sourcePath === path) continue // Skip self-references
      const targets = resolvedLinks[sourcePath]
      if (targets && path in targets) {
        inDegree++
      }
    }

    return inDegree
  }

  /**
   * Calculate the out-degree for a node (number of outgoing links, excluding self-references)
   */
  private calculateOutDegree(path: string): number {
    const targets = this.cache.resolvedLinks[path]
    if (!targets) return 0

    let outDegree = 0
    for (const targetPath of Object.keys(targets)) {
      if (targetPath !== path) { // Exclude self-references
        outDegree++
      }
    }

    return outDegree
  }

  /**
   * Get files with no incoming or outgoing links
   */
  getOrphans(): TFile[] {
    const orphans: TFile[] = []
    const resolvedLinks = this.cache.resolvedLinks

    for (const path of this.getAllNodes()) {
      const outDegree = this.calculateOutDegree(path)
      const inDegree = this.calculateInDegree(path)

      if (outDegree === 0 && inDegree === 0) {
        orphans.push(this.createTFileFromPath(path))
      }
    }

    return orphans
  }

  /**
   * Get all dead links (links to non-existent files)
   */
  getDeadLinks(): DeadLink[] {
    const deadLinks: DeadLink[] = []
    const unresolvedLinks = this.cache.unresolvedLinks

    for (const sourcePath of Object.keys(unresolvedLinks)) {
      const links = unresolvedLinks[sourcePath]
      for (const link of Object.keys(links)) {
        deadLinks.push({
          source: sourcePath,
          link,
        })
      }
    }

    return deadLinks
  }

  /**
   * Get files sorted by backlink count (most linked first)
   */
  getMostLinked(limit: number = 10): LinkedFile[] {
    const backlinkCounts: Record<string, number> = {}

    // Count backlinks for each file
    const resolvedLinks = this.cache.resolvedLinks
    for (const sourcePath of Object.keys(resolvedLinks)) {
      const targets = resolvedLinks[sourcePath]
      for (const targetPath of Object.keys(targets)) {
        if (targetPath !== sourcePath) { // Exclude self-references
          backlinkCounts[targetPath] = (backlinkCounts[targetPath] || 0) + 1
        }
      }
    }

    // Convert to array and sort by count descending
    const result: LinkedFile[] = []
    for (const [path, count] of Object.entries(backlinkCounts)) {
      if (count > 0) {
        result.push({
          file: this.createTFileFromPath(path),
          count,
        })
      }
    }

    result.sort((a, b) => b.count - a.count)

    return result.slice(0, limit)
  }

  /**
   * Get connected components (clusters) using Union-Find algorithm
   */
  getClusters(): TFile[][] {
    const nodes = this.getAllNodes()
    if (nodes.length === 0) return []

    // Union-Find data structure
    const parent: Record<string, string> = {}
    const rank: Record<string, number> = {}

    // Initialize each node as its own parent
    for (const node of nodes) {
      parent[node] = node
      rank[node] = 0
    }

    // Find with path compression
    const find = (x: string): string => {
      if (parent[x] !== x) {
        parent[x] = find(parent[x])
      }
      return parent[x]
    }

    // Union by rank
    const union = (x: string, y: string): void => {
      const rootX = find(x)
      const rootY = find(y)

      if (rootX !== rootY) {
        if (rank[rootX] < rank[rootY]) {
          parent[rootX] = rootY
        } else if (rank[rootX] > rank[rootY]) {
          parent[rootY] = rootX
        } else {
          parent[rootY] = rootX
          rank[rootX]++
        }
      }
    }

    // Process all edges (treat graph as undirected for clustering)
    const resolvedLinks = this.cache.resolvedLinks
    for (const sourcePath of Object.keys(resolvedLinks)) {
      const targets = resolvedLinks[sourcePath]
      for (const targetPath of Object.keys(targets)) {
        if (sourcePath !== targetPath && parent[targetPath] !== undefined) {
          union(sourcePath, targetPath)
        }
      }
    }

    // Group nodes by their root
    const clusters: Record<string, TFile[]> = {}
    for (const node of nodes) {
      const root = find(node)
      if (!clusters[root]) {
        clusters[root] = []
      }
      clusters[root].push(this.createTFileFromPath(node))
    }

    return Object.values(clusters)
  }

  /**
   * Get graph statistics
   */
  getStats(): GraphStats {
    const nodes = this.getAllNodes()
    const totalNodes = nodes.length

    if (totalNodes === 0) {
      return {
        totalNodes: 0,
        totalEdges: 0,
        orphanCount: 0,
        averageDegree: 0,
      }
    }

    // Count total edges (excluding self-references)
    let totalEdges = 0
    const resolvedLinks = this.cache.resolvedLinks
    for (const sourcePath of Object.keys(resolvedLinks)) {
      const targets = resolvedLinks[sourcePath]
      for (const targetPath of Object.keys(targets)) {
        if (targetPath !== sourcePath) {
          totalEdges++
        }
      }
    }

    // Count orphans
    const orphanCount = this.getOrphans().length

    // Calculate average degree (sum of all degrees / number of nodes)
    let totalDegree = 0
    for (const node of nodes) {
      totalDegree += this.calculateInDegree(node) + this.calculateOutDegree(node)
    }
    const averageDegree = totalNodes > 0 ? totalDegree / totalNodes : 0

    return {
      totalNodes,
      totalEdges,
      orphanCount,
      averageDegree,
    }
  }

  /**
   * Get the degree of a specific node
   */
  getNodeDegree(path: string, type: DegreeType = 'total'): number {
    const inDegree = this.calculateInDegree(path)
    const outDegree = this.calculateOutDegree(path)

    switch (type) {
      case 'in':
        return inDegree
      case 'out':
        return outDegree
      case 'total':
      default:
        return inDegree + outDegree
    }
  }

  /**
   * Get degrees for all nodes in the graph
   */
  getAllNodeDegrees(): Record<string, NodeDegree> {
    const degrees: Record<string, NodeDegree> = {}
    const nodes = this.getAllNodes()

    for (const node of nodes) {
      const inDegree = this.calculateInDegree(node)
      const outDegree = this.calculateOutDegree(node)

      degrees[node] = {
        in: inDegree,
        out: outDegree,
        total: inDegree + outDegree,
      }
    }

    return degrees
  }
}
