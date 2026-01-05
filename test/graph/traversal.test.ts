import { describe, it, expect, beforeEach } from 'vitest'
import { Graph } from '../../src/graph/graph.js'
import type { MetadataCache } from '../../src/metadata/cache.js'
import type { TFile, CachedMetadata, LinkCache, Pos } from '../../src/types.js'

// Test fixtures: Hub/Spoke pattern
// hub.md - central node linked by all spokes
// spoke1.md, spoke2.md, spoke3.md - link to hub
// orphan.md - no links (isolated node)
// chain-a.md -> chain-b.md -> chain-c.md (for path testing)

function createMockFile(path: string): TFile {
  const name = path.split('/').pop() ?? path
  const basename = name.replace(/\.md$/, '')
  return {
    path,
    name,
    basename,
    extension: 'md',
    stat: { ctime: Date.now(), mtime: Date.now(), size: 100 }
  }
}

function createPos(): Pos {
  return {
    start: { line: 1, col: 0, offset: 0 },
    end: { line: 1, col: 10, offset: 10 }
  }
}

function createLinkCache(link: string): LinkCache {
  return {
    link,
    original: `[[${link}]]`,
    position: createPos()
  }
}

// Mock MetadataCache that simulates our hub/spoke graph
function createMockCache(): MetadataCache {
  const files: Record<string, TFile> = {
    'hub.md': createMockFile('hub.md'),
    'spoke1.md': createMockFile('spoke1.md'),
    'spoke2.md': createMockFile('spoke2.md'),
    'spoke3.md': createMockFile('spoke3.md'),
    'orphan.md': createMockFile('orphan.md'),
    'chain-a.md': createMockFile('chain-a.md'),
    'chain-b.md': createMockFile('chain-b.md'),
    'chain-c.md': createMockFile('chain-c.md'),
    'distant.md': createMockFile('distant.md')
  }

  // Graph structure:
  // spoke1 -> hub
  // spoke2 -> hub
  // spoke3 -> hub
  // hub -> spoke1 (bidirectional for neighbor testing)
  // chain-a -> chain-b -> chain-c -> distant
  // orphan (no links)
  const metadata: Record<string, CachedMetadata> = {
    'hub.md': {
      links: [createLinkCache('spoke1')]
    },
    'spoke1.md': {
      links: [createLinkCache('hub')]
    },
    'spoke2.md': {
      links: [createLinkCache('hub')]
    },
    'spoke3.md': {
      links: [createLinkCache('hub')]
    },
    'orphan.md': {
      links: []
    },
    'chain-a.md': {
      links: [createLinkCache('chain-b')]
    },
    'chain-b.md': {
      links: [createLinkCache('chain-c')]
    },
    'chain-c.md': {
      links: [createLinkCache('distant')]
    },
    'distant.md': {
      links: []
    }
  }

  // Build resolved links structure (source -> target -> count)
  const resolvedLinks: Record<string, Record<string, number>> = {
    'hub.md': { 'spoke1.md': 1 },
    'spoke1.md': { 'hub.md': 1 },
    'spoke2.md': { 'hub.md': 1 },
    'spoke3.md': { 'hub.md': 1 },
    'orphan.md': {},
    'chain-a.md': { 'chain-b.md': 1 },
    'chain-b.md': { 'chain-c.md': 1 },
    'chain-c.md': { 'distant.md': 1 },
    'distant.md': {}
  }

  return {
    getCache: (path: string) => metadata[path] ?? null,
    getFileCache: (file: TFile) => metadata[file.path] ?? null,
    getFirstLinkpathDest: (linkpath: string, _sourcePath: string) => {
      const targetPath = linkpath.endsWith('.md') ? linkpath : `${linkpath}.md`
      return files[targetPath] ?? null
    },
    fileToLinktext: (file: TFile, _sourcePath: string) => file.basename,
    resolvedLinks,
    unresolvedLinks: {},
    on: () => ({ unsubscribe: () => {} }),
    off: () => {},
    trigger: () => {}
  } as MetadataCache
}

describe('Graph traversal', () => {
  let graph: Graph
  let mockCache: MetadataCache

  beforeEach(() => {
    mockCache = createMockCache()
    graph = new Graph(mockCache)
  })

  describe('getNeighbors', () => {
    it('should return 1-hop neighbors by default', () => {
      // hub.md has outlink to spoke1.md and backlinks from spoke1, spoke2, spoke3
      const neighbors = graph.getNeighbors('hub.md')

      expect(neighbors).toBeDefined()
      expect(Array.isArray(neighbors)).toBe(true)
      expect(neighbors.length).toBeGreaterThan(0)

      // Should include direct neighbors (1 hop away)
      const paths = neighbors.map(f => f.path)
      expect(paths).toContain('spoke1.md')
      expect(paths).toContain('spoke2.md')
      expect(paths).toContain('spoke3.md')
    })

    it('should return n-hop neighbors with depth param', () => {
      // chain-a.md -> chain-b.md -> chain-c.md -> distant.md
      // With depth=1: should get chain-b
      // With depth=2: should get chain-b and chain-c
      // With depth=3: should get chain-b, chain-c, and distant

      const oneHop = graph.getNeighbors('chain-a.md', 1)
      const twoHop = graph.getNeighbors('chain-a.md', 2)
      const threeHop = graph.getNeighbors('chain-a.md', 3)

      expect(oneHop.map(f => f.path)).toContain('chain-b.md')
      expect(oneHop.map(f => f.path)).not.toContain('chain-c.md')

      expect(twoHop.map(f => f.path)).toContain('chain-b.md')
      expect(twoHop.map(f => f.path)).toContain('chain-c.md')
      expect(twoHop.map(f => f.path)).not.toContain('distant.md')

      expect(threeHop.map(f => f.path)).toContain('chain-b.md')
      expect(threeHop.map(f => f.path)).toContain('chain-c.md')
      expect(threeHop.map(f => f.path)).toContain('distant.md')
    })

    it('should not include the source file', () => {
      const neighbors = graph.getNeighbors('hub.md')
      const paths = neighbors.map(f => f.path)

      expect(paths).not.toContain('hub.md')
    })

    it('should respect limit parameter', () => {
      // hub.md has 3+ neighbors (spoke1, spoke2, spoke3)
      const limited = graph.getNeighbors('hub.md', 1, 2)

      expect(limited.length).toBeLessThanOrEqual(2)
    })

    it('should return empty array for orphan files', () => {
      const neighbors = graph.getNeighbors('orphan.md')

      expect(neighbors).toEqual([])
    })

    it('should return empty array for non-existent files', () => {
      const neighbors = graph.getNeighbors('nonexistent.md')

      expect(neighbors).toEqual([])
    })

    it('should handle depth of 0 (return empty)', () => {
      const neighbors = graph.getNeighbors('hub.md', 0)

      expect(neighbors).toEqual([])
    })

    it('should include both outlinks and backlinks as neighbors', () => {
      // spoke1 links to hub, and hub links back to spoke1
      // So hub's neighbors should include spoke1 (outlink) and spoke2, spoke3 (backlinks)
      const neighbors = graph.getNeighbors('hub.md')
      const paths = neighbors.map(f => f.path)

      // spoke1 is an outlink from hub
      expect(paths).toContain('spoke1.md')
      // spoke2 and spoke3 are backlinks to hub
      expect(paths).toContain('spoke2.md')
      expect(paths).toContain('spoke3.md')
    })

    it('should not include duplicates in n-hop results', () => {
      // In a bidirectional graph, traversing might encounter same node multiple times
      const neighbors = graph.getNeighbors('spoke1.md', 2)
      const paths = neighbors.map(f => f.path)

      // Check for unique paths
      const uniquePaths = [...new Set(paths)]
      expect(paths.length).toBe(uniquePaths.length)
    })

    it('should handle circular references without infinite loop', () => {
      // spoke1 -> hub -> spoke1 forms a cycle
      // Should not loop infinitely
      const neighbors = graph.getNeighbors('spoke1.md', 10)

      expect(neighbors).toBeDefined()
      expect(Array.isArray(neighbors)).toBe(true)
    })
  })

  describe('findPath', () => {
    it('should find shortest path between connected notes', () => {
      // chain-a -> chain-b -> chain-c -> distant
      const path = graph.findPath('chain-a.md', 'distant.md')

      expect(path).not.toBeNull()
      expect(Array.isArray(path)).toBe(true)
      expect(path!.length).toBe(4) // [chain-a, chain-b, chain-c, distant]
      expect(path![0]).toBe('chain-a.md')
      expect(path![path!.length - 1]).toBe('distant.md')
    })

    it('should return null for disconnected notes', () => {
      // orphan.md is not connected to any other file
      const path = graph.findPath('hub.md', 'orphan.md')

      expect(path).toBeNull()
    })

    it('should return direct path for linked notes', () => {
      // spoke1 directly links to hub
      const path = graph.findPath('spoke1.md', 'hub.md')

      expect(path).not.toBeNull()
      expect(path).toEqual(['spoke1.md', 'hub.md'])
    })

    it('should return path with single element for same source and target', () => {
      const path = graph.findPath('hub.md', 'hub.md')

      expect(path).not.toBeNull()
      expect(path).toEqual(['hub.md'])
    })

    it('should return null for non-existent source', () => {
      const path = graph.findPath('nonexistent.md', 'hub.md')

      expect(path).toBeNull()
    })

    it('should return null for non-existent target', () => {
      const path = graph.findPath('hub.md', 'nonexistent.md')

      expect(path).toBeNull()
    })

    it('should find path via backlinks (reverse direction)', () => {
      // hub links to spoke1, so from hub to spoke1 there should be a direct path
      const path = graph.findPath('hub.md', 'spoke1.md')

      expect(path).not.toBeNull()
      expect(path).toEqual(['hub.md', 'spoke1.md'])
    })

    it('should find path through intermediate nodes', () => {
      // spoke2 -> hub -> spoke1
      const path = graph.findPath('spoke2.md', 'spoke1.md')

      expect(path).not.toBeNull()
      expect(path!.length).toBe(3)
      expect(path![0]).toBe('spoke2.md')
      expect(path![1]).toBe('hub.md')
      expect(path![2]).toBe('spoke1.md')
    })

    it('should find shortest path when multiple paths exist', () => {
      // If multiple paths exist, should return the shortest one
      const path = graph.findPath('spoke1.md', 'spoke2.md')

      expect(path).not.toBeNull()
      // spoke1 -> hub -> spoke2 (3 nodes, this is shortest via hub)
      expect(path!.length).toBeLessThanOrEqual(3)
    })

    it('should handle orphan to orphan (both disconnected)', () => {
      const path = graph.findPath('orphan.md', 'orphan.md')

      // Same file should still return a path of itself
      expect(path).toEqual(['orphan.md'])
    })
  })

  describe('edge cases', () => {
    it('should handle empty graph gracefully', () => {
      const emptyCache = {
        getCache: () => null,
        getFileCache: () => null,
        getFirstLinkpathDest: () => null,
        fileToLinktext: () => '',
        resolvedLinks: {},
        unresolvedLinks: {},
        on: () => ({ unsubscribe: () => {} }),
        off: () => {},
        trigger: () => {}
      } as MetadataCache

      const emptyGraph = new Graph(emptyCache)

      expect(emptyGraph.getNeighbors('any.md')).toEqual([])
      expect(emptyGraph.findPath('a.md', 'b.md')).toBeNull()
    })

    it('should handle files with many links', () => {
      // Create a cache with a hub that has many connections
      const manyLinksCache = createMockCache()
      const manyLinksGraph = new Graph(manyLinksCache)

      // Should not throw or hang
      const neighbors = manyLinksGraph.getNeighbors('hub.md', 5)
      expect(Array.isArray(neighbors)).toBe(true)
    })

    it('should handle deeply nested paths', () => {
      // chain-a -> chain-b -> chain-c -> distant
      const path = graph.findPath('chain-a.md', 'distant.md')

      expect(path).not.toBeNull()
      expect(path!.length).toBeGreaterThan(2)
    })
  })

  describe('performance considerations', () => {
    it('should limit traversal depth to prevent excessive computation', () => {
      // Very large depth should still complete in reasonable time
      const startTime = Date.now()
      const neighbors = graph.getNeighbors('hub.md', 100)
      const elapsed = Date.now() - startTime

      expect(elapsed).toBeLessThan(1000) // Should complete in under 1 second
      expect(Array.isArray(neighbors)).toBe(true)
    })

    it('should handle limit=0 efficiently', () => {
      const neighbors = graph.getNeighbors('hub.md', 1, 0)

      expect(neighbors).toEqual([])
    })
  })
})

describe('Graph traversal with complex structures', () => {
  describe('getNeighbors with bidirectional links', () => {
    it('should count bidirectional link as single neighbor', () => {
      // hub <-> spoke1 should result in spoke1 appearing once, not twice
      const mockCache = createMockCache()
      const graph = new Graph(mockCache)

      const neighbors = graph.getNeighbors('hub.md')
      const spoke1Count = neighbors.filter(f => f.path === 'spoke1.md').length

      expect(spoke1Count).toBe(1)
    })
  })

  describe('findPath with complex graph topology', () => {
    it('should prefer shorter paths over longer ones', () => {
      const mockCache = createMockCache()
      const graph = new Graph(mockCache)

      // spoke1 -> hub is direct (length 2)
      // Any other path would be longer
      const path = graph.findPath('spoke1.md', 'hub.md')

      expect(path).toEqual(['spoke1.md', 'hub.md'])
    })

    it('should return consistent paths on repeated calls', () => {
      const mockCache = createMockCache()
      const graph = new Graph(mockCache)

      const path1 = graph.findPath('spoke2.md', 'spoke1.md')
      const path2 = graph.findPath('spoke2.md', 'spoke1.md')

      expect(path1).toEqual(path2)
    })
  })
})
