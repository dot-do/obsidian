import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Graph } from '../../src/graph/graph.js'
import type { MetadataCache } from '../../src/metadata/cache.js'
import type { TFile, CachedMetadata, LinkCache, Pos } from '../../src/types.js'

// Helper to create mock TFile
function createMockFile(path: string): TFile {
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
      size: 100,
    },
  }
}

// Helper to create mock link
function createMockLink(link: string): LinkCache {
  const pos: Pos = {
    start: { line: 0, col: 0, offset: 0 },
    end: { line: 0, col: link.length + 4, offset: link.length + 4 },
  }
  return {
    link,
    original: `[[${link}]]`,
    position: pos,
  }
}

// Helper to create mock metadata with links
function createMockMetadata(links: string[]): CachedMetadata {
  return {
    links: links.map(createMockLink),
  }
}

describe('Graph analysis', () => {
  let graph: Graph
  let mockCache: MetadataCache
  let mockFiles: Map<string, TFile>
  let mockMetadata: Map<string, CachedMetadata>

  beforeEach(() => {
    mockFiles = new Map()
    mockMetadata = new Map()

    // Create a test graph with the following structure:
    // note-a.md -> note-b.md, note-c.md
    // note-b.md -> note-c.md
    // note-c.md -> note-a.md (circular)
    // note-d.md -> note-e.md (separate cluster)
    // orphan.md -> (no links, no incoming)

    const files = [
      'notes/note-a.md',
      'notes/note-b.md',
      'notes/note-c.md',
      'notes/note-d.md',
      'notes/note-e.md',
      'notes/orphan.md',
    ]

    files.forEach((path) => {
      mockFiles.set(path, createMockFile(path))
    })

    // Set up link structure
    mockMetadata.set('notes/note-a.md', createMockMetadata(['note-b', 'note-c']))
    mockMetadata.set('notes/note-b.md', createMockMetadata(['note-c']))
    mockMetadata.set('notes/note-c.md', createMockMetadata(['note-a']))
    mockMetadata.set('notes/note-d.md', createMockMetadata(['note-e']))
    mockMetadata.set('notes/note-e.md', createMockMetadata([]))
    mockMetadata.set('notes/orphan.md', createMockMetadata([]))

    // Create mock cache with resolvedLinks and unresolvedLinks
    mockCache = {
      resolvedLinks: {
        'notes/note-a.md': { 'notes/note-b.md': 1, 'notes/note-c.md': 1 },
        'notes/note-b.md': { 'notes/note-c.md': 1 },
        'notes/note-c.md': { 'notes/note-a.md': 1 },
        'notes/note-d.md': { 'notes/note-e.md': 1 },
        'notes/note-e.md': {},
        'notes/orphan.md': {},
      },
      unresolvedLinks: {
        'notes/note-a.md': { 'non-existent': 1 },
        'notes/note-b.md': { 'missing-note': 1, 'another-missing': 1 },
        'notes/note-c.md': {},
        'notes/note-d.md': {},
        'notes/note-e.md': {},
        'notes/orphan.md': {},
      },
      getCache: vi.fn((path: string) => mockMetadata.get(path) || null),
      getFileCache: vi.fn((file: TFile) => mockMetadata.get(file.path) || null),
      getFirstLinkpathDest: vi.fn((linkpath: string, _sourcePath: string) => {
        // Simulate resolving link to file
        for (const [path, file] of mockFiles) {
          if (path.includes(linkpath)) {
            return file
          }
        }
        return null
      }),
      fileToLinktext: vi.fn((file: TFile) => file.basename),
      on: vi.fn(),
      off: vi.fn(),
      trigger: vi.fn(),
      vault: {} as any,
    } as unknown as MetadataCache

    graph = new Graph(mockCache)
  })

  describe('getOrphans', () => {
    it('should return notes with no incoming or outgoing links', () => {
      const orphans = graph.getOrphans()

      expect(orphans).toHaveLength(1)
      expect(orphans[0].path).toBe('notes/orphan.md')
    })

    it('should not include notes that have outgoing links', () => {
      const orphans = graph.getOrphans()

      const orphanPaths = orphans.map((f) => f.path)
      expect(orphanPaths).not.toContain('notes/note-a.md')
      expect(orphanPaths).not.toContain('notes/note-b.md')
      expect(orphanPaths).not.toContain('notes/note-d.md')
    })

    it('should not include notes that have incoming links', () => {
      const orphans = graph.getOrphans()

      const orphanPaths = orphans.map((f) => f.path)
      expect(orphanPaths).not.toContain('notes/note-c.md')
      expect(orphanPaths).not.toContain('notes/note-e.md')
    })

    it('should return empty array when all notes are connected', () => {
      // Modify mock to have no orphans
      mockCache.resolvedLinks['notes/orphan.md'] = { 'notes/note-a.md': 1 }

      const orphans = graph.getOrphans()

      expect(orphans).toHaveLength(0)
    })

    it('should handle empty vault', () => {
      mockCache.resolvedLinks = {}

      const orphans = graph.getOrphans()

      expect(orphans).toHaveLength(0)
    })
  })

  describe('getDeadLinks', () => {
    it('should return links to non-existent files', () => {
      const deadLinks = graph.getDeadLinks()

      expect(deadLinks.length).toBeGreaterThan(0)
      expect(deadLinks).toContainEqual({
        source: 'notes/note-a.md',
        link: 'non-existent',
      })
    })

    it('should return all dead links from all files', () => {
      const deadLinks = graph.getDeadLinks()

      // note-a has 1 dead link, note-b has 2 dead links
      expect(deadLinks.length).toBe(3)
    })

    it('should include source file path for each dead link', () => {
      const deadLinks = graph.getDeadLinks()

      deadLinks.forEach((deadLink) => {
        expect(deadLink.source).toBeDefined()
        expect(typeof deadLink.source).toBe('string')
        expect(deadLink.source.endsWith('.md')).toBe(true)
      })
    })

    it('should include link text for each dead link', () => {
      const deadLinks = graph.getDeadLinks()

      deadLinks.forEach((deadLink) => {
        expect(deadLink.link).toBeDefined()
        expect(typeof deadLink.link).toBe('string')
        expect(deadLink.link.length).toBeGreaterThan(0)
      })
    })

    it('should return empty array when no dead links exist', () => {
      mockCache.unresolvedLinks = {
        'notes/note-a.md': {},
        'notes/note-b.md': {},
        'notes/note-c.md': {},
        'notes/note-d.md': {},
        'notes/note-e.md': {},
        'notes/orphan.md': {},
      }

      const deadLinks = graph.getDeadLinks()

      expect(deadLinks).toHaveLength(0)
    })

    it('should handle files with only dead links', () => {
      mockCache.resolvedLinks['notes/note-a.md'] = {}
      mockCache.unresolvedLinks['notes/note-a.md'] = {
        'dead-1': 1,
        'dead-2': 1,
        'dead-3': 1,
      }

      const deadLinks = graph.getDeadLinks()

      const noteADeadLinks = deadLinks.filter(
        (d) => d.source === 'notes/note-a.md'
      )
      expect(noteADeadLinks).toHaveLength(3)
    })
  })

  describe('getMostLinked', () => {
    it('should return files sorted by backlink count', () => {
      const mostLinked = graph.getMostLinked(10)

      expect(mostLinked.length).toBeGreaterThan(0)
      // Verify sorted by count descending
      for (let i = 0; i < mostLinked.length - 1; i++) {
        expect(mostLinked[i].count).toBeGreaterThanOrEqual(mostLinked[i + 1].count)
      }
    })

    it('should respect the limit parameter', () => {
      const mostLinked = graph.getMostLinked(2)

      expect(mostLinked.length).toBeLessThanOrEqual(2)
    })

    it('should return note-c as most linked (has 2 incoming links)', () => {
      const mostLinked = graph.getMostLinked(10)

      // note-c is linked from note-a and note-b
      expect(mostLinked[0].file.path).toBe('notes/note-c.md')
      expect(mostLinked[0].count).toBe(2)
    })

    it('should include count for each file', () => {
      const mostLinked = graph.getMostLinked(10)

      mostLinked.forEach((item) => {
        expect(item.count).toBeDefined()
        expect(typeof item.count).toBe('number')
        expect(item.count).toBeGreaterThanOrEqual(0)
      })
    })

    it('should include TFile object for each result', () => {
      const mostLinked = graph.getMostLinked(10)

      mostLinked.forEach((item) => {
        expect(item.file).toBeDefined()
        expect(item.file.path).toBeDefined()
        expect(item.file.name).toBeDefined()
        expect(item.file.basename).toBeDefined()
      })
    })

    it('should return all files when limit exceeds total files', () => {
      const mostLinked = graph.getMostLinked(100)

      // Should include all files with at least 1 backlink
      expect(mostLinked.length).toBeLessThanOrEqual(6)
    })

    it('should handle default limit parameter', () => {
      const mostLinked = graph.getMostLinked()

      expect(Array.isArray(mostLinked)).toBe(true)
    })

    it('should not include files with zero backlinks by default', () => {
      const mostLinked = graph.getMostLinked(10)

      const orphanInList = mostLinked.find(
        (m) => m.file.path === 'notes/orphan.md'
      )
      expect(orphanInList).toBeUndefined()
    })
  })

  describe('getClusters', () => {
    it('should return connected components', () => {
      const clusters = graph.getClusters()

      expect(Array.isArray(clusters)).toBe(true)
      expect(clusters.length).toBeGreaterThanOrEqual(2)
    })

    it('should group connected notes together', () => {
      const clusters = graph.getClusters()

      // Find the cluster containing note-a
      const clusterWithA = clusters.find((c) =>
        c.some((f) => f.path === 'notes/note-a.md')
      )

      expect(clusterWithA).toBeDefined()
      // note-a, note-b, note-c should be in same cluster
      expect(clusterWithA!.some((f) => f.path === 'notes/note-b.md')).toBe(true)
      expect(clusterWithA!.some((f) => f.path === 'notes/note-c.md')).toBe(true)
    })

    it('should separate unconnected components', () => {
      const clusters = graph.getClusters()

      // note-d and note-e form separate cluster from note-a,b,c
      const clusterWithD = clusters.find((c) =>
        c.some((f) => f.path === 'notes/note-d.md')
      )
      const clusterWithA = clusters.find((c) =>
        c.some((f) => f.path === 'notes/note-a.md')
      )

      expect(clusterWithD).toBeDefined()
      expect(clusterWithA).toBeDefined()
      expect(clusterWithD).not.toBe(clusterWithA)
    })

    it('should put orphan in its own cluster', () => {
      const clusters = graph.getClusters()

      const orphanCluster = clusters.find(
        (c) => c.length === 1 && c[0].path === 'notes/orphan.md'
      )

      expect(orphanCluster).toBeDefined()
    })

    it('should return array of TFile arrays', () => {
      const clusters = graph.getClusters()

      clusters.forEach((cluster) => {
        expect(Array.isArray(cluster)).toBe(true)
        cluster.forEach((file) => {
          expect(file.path).toBeDefined()
          expect(file.name).toBeDefined()
        })
      })
    })

    it('should include all files across all clusters', () => {
      const clusters = graph.getClusters()

      const allFiles = clusters.flatMap((c) => c.map((f) => f.path))
      expect(allFiles).toContain('notes/note-a.md')
      expect(allFiles).toContain('notes/note-b.md')
      expect(allFiles).toContain('notes/note-c.md')
      expect(allFiles).toContain('notes/note-d.md')
      expect(allFiles).toContain('notes/note-e.md')
      expect(allFiles).toContain('notes/orphan.md')
    })

    it('should not duplicate files across clusters', () => {
      const clusters = graph.getClusters()

      const allPaths = clusters.flatMap((c) => c.map((f) => f.path))
      const uniquePaths = new Set(allPaths)

      expect(allPaths.length).toBe(uniquePaths.size)
    })

    it('should handle empty vault', () => {
      mockCache.resolvedLinks = {}

      const clusters = graph.getClusters()

      expect(clusters).toHaveLength(0)
    })
  })

  describe('getStats', () => {
    it('should return graph statistics', () => {
      const stats = graph.getStats()

      expect(stats.totalNodes).toBe(6)
      expect(stats.totalEdges).toBeGreaterThan(0)
      expect(stats.orphanCount).toBe(1)
      expect(stats.averageDegree).toBeGreaterThan(0)
    })

    it('should count total nodes correctly', () => {
      const stats = graph.getStats()

      expect(stats.totalNodes).toBe(6)
    })

    it('should count total edges correctly', () => {
      const stats = graph.getStats()

      // note-a: 2 outlinks, note-b: 1, note-c: 1, note-d: 1 = 5 edges
      expect(stats.totalEdges).toBe(5)
    })

    it('should count orphans correctly', () => {
      const stats = graph.getStats()

      expect(stats.orphanCount).toBe(1)
    })

    it('should calculate average degree correctly', () => {
      const stats = graph.getStats()

      // Average degree = (2 * edges) / nodes for undirected graph interpretation
      // Or sum of (in-degree + out-degree) / nodes
      expect(stats.averageDegree).toBeGreaterThan(0)
      expect(typeof stats.averageDegree).toBe('number')
    })

    it('should return object with all required properties', () => {
      const stats = graph.getStats()

      expect(stats).toHaveProperty('totalNodes')
      expect(stats).toHaveProperty('totalEdges')
      expect(stats).toHaveProperty('orphanCount')
      expect(stats).toHaveProperty('averageDegree')
    })

    it('should handle empty vault', () => {
      mockCache.resolvedLinks = {}

      const stats = graph.getStats()

      expect(stats.totalNodes).toBe(0)
      expect(stats.totalEdges).toBe(0)
      expect(stats.orphanCount).toBe(0)
      expect(stats.averageDegree).toBe(0)
    })

    it('should handle vault with only orphans', () => {
      mockCache.resolvedLinks = {
        'notes/orphan-1.md': {},
        'notes/orphan-2.md': {},
        'notes/orphan-3.md': {},
      }

      const stats = graph.getStats()

      expect(stats.totalNodes).toBe(3)
      expect(stats.totalEdges).toBe(0)
      expect(stats.orphanCount).toBe(3)
      expect(stats.averageDegree).toBe(0)
    })

    it('should return numeric values for all properties', () => {
      const stats = graph.getStats()

      expect(typeof stats.totalNodes).toBe('number')
      expect(typeof stats.totalEdges).toBe('number')
      expect(typeof stats.orphanCount).toBe('number')
      expect(typeof stats.averageDegree).toBe('number')
    })

    it('should not return negative values', () => {
      const stats = graph.getStats()

      expect(stats.totalNodes).toBeGreaterThanOrEqual(0)
      expect(stats.totalEdges).toBeGreaterThanOrEqual(0)
      expect(stats.orphanCount).toBeGreaterThanOrEqual(0)
      expect(stats.averageDegree).toBeGreaterThanOrEqual(0)
    })
  })

  describe('getNodeDegree', () => {
    it('should calculate in-degree (number of incoming links)', () => {
      // note-c has 2 incoming links (from note-a and note-b)
      const inDegree = graph.getNodeDegree('notes/note-c.md', 'in')

      expect(inDegree).toBe(2)
    })

    it('should calculate out-degree (number of outgoing links)', () => {
      // note-a has 2 outgoing links (to note-b and note-c)
      const outDegree = graph.getNodeDegree('notes/note-a.md', 'out')

      expect(outDegree).toBe(2)
    })

    it('should calculate total degree (in + out)', () => {
      // note-a: 2 out (to b,c) + 1 in (from c) = 3 total
      const totalDegree = graph.getNodeDegree('notes/note-a.md', 'total')

      expect(totalDegree).toBe(3)
    })

    it('should default to total degree when no type specified', () => {
      const degree = graph.getNodeDegree('notes/note-a.md')
      const totalDegree = graph.getNodeDegree('notes/note-a.md', 'total')

      expect(degree).toBe(totalDegree)
    })

    it('should return 0 for orphan nodes', () => {
      const degree = graph.getNodeDegree('notes/orphan.md')

      expect(degree).toBe(0)
    })

    it('should return 0 for non-existent nodes', () => {
      const degree = graph.getNodeDegree('notes/non-existent.md')

      expect(degree).toBe(0)
    })

    it('should handle nodes with only incoming links', () => {
      // note-e only has incoming link from note-d
      const inDegree = graph.getNodeDegree('notes/note-e.md', 'in')
      const outDegree = graph.getNodeDegree('notes/note-e.md', 'out')

      expect(inDegree).toBe(1)
      expect(outDegree).toBe(0)
    })

    it('should handle nodes with only outgoing links', () => {
      // note-d has outgoing link to note-e, no incoming
      const inDegree = graph.getNodeDegree('notes/note-d.md', 'in')
      const outDegree = graph.getNodeDegree('notes/note-d.md', 'out')

      expect(inDegree).toBe(0)
      expect(outDegree).toBe(1)
    })

    it('should count multiple links to same target as single degree', () => {
      // Even if a file links to another multiple times, degree is 1
      mockCache.resolvedLinks['notes/note-a.md'] = {
        'notes/note-b.md': 3, // 3 links to note-b
      }

      const outDegree = graph.getNodeDegree('notes/note-a.md', 'out')

      expect(outDegree).toBe(1)
    })

    it('should not count self-references in degree', () => {
      mockCache.resolvedLinks['notes/note-a.md'] = {
        'notes/note-a.md': 1, // self-reference
        'notes/note-b.md': 1,
      }

      const outDegree = graph.getNodeDegree('notes/note-a.md', 'out')

      // Should only count link to note-b, not self-reference
      expect(outDegree).toBe(1)
    })
  })

  describe('getAllNodeDegrees', () => {
    it('should return degrees for all nodes in graph', () => {
      const degrees = graph.getAllNodeDegrees()

      expect(degrees).toBeDefined()
      expect(typeof degrees).toBe('object')
      expect(Object.keys(degrees).length).toBeGreaterThan(0)
    })

    it('should include in-degree, out-degree, and total for each node', () => {
      const degrees = graph.getAllNodeDegrees()

      Object.values(degrees).forEach((nodeDegree) => {
        expect(nodeDegree).toHaveProperty('in')
        expect(nodeDegree).toHaveProperty('out')
        expect(nodeDegree).toHaveProperty('total')
        expect(typeof nodeDegree.in).toBe('number')
        expect(typeof nodeDegree.out).toBe('number')
        expect(typeof nodeDegree.total).toBe('number')
      })
    })

    it('should have total equal to in + out for each node', () => {
      const degrees = graph.getAllNodeDegrees()

      Object.values(degrees).forEach((nodeDegree) => {
        expect(nodeDegree.total).toBe(nodeDegree.in + nodeDegree.out)
      })
    })

    it('should include all nodes from the graph', () => {
      const degrees = graph.getAllNodeDegrees()
      const nodePaths = Object.keys(degrees)

      expect(nodePaths).toContain('notes/note-a.md')
      expect(nodePaths).toContain('notes/note-b.md')
      expect(nodePaths).toContain('notes/note-c.md')
      expect(nodePaths).toContain('notes/note-d.md')
      expect(nodePaths).toContain('notes/note-e.md')
      expect(nodePaths).toContain('notes/orphan.md')
    })

    it('should show 0 degrees for orphan nodes', () => {
      const degrees = graph.getAllNodeDegrees()

      expect(degrees['notes/orphan.md']).toEqual({
        in: 0,
        out: 0,
        total: 0,
      })
    })

    it('should correctly calculate hub node degrees', () => {
      const degrees = graph.getAllNodeDegrees()

      // note-c is most linked (2 incoming)
      expect(degrees['notes/note-c.md'].in).toBe(2)
    })

    it('should return empty object for empty vault', () => {
      mockCache.resolvedLinks = {}

      const degrees = graph.getAllNodeDegrees()

      expect(degrees).toEqual({})
    })
  })

  describe('edge cases', () => {
    it('should handle self-referencing notes', () => {
      mockCache.resolvedLinks['notes/note-a.md'] = {
        'notes/note-a.md': 1,
        'notes/note-b.md': 1,
      }

      expect(() => graph.getOrphans()).not.toThrow()
      expect(() => graph.getStats()).not.toThrow()
      expect(() => graph.getClusters()).not.toThrow()
    })

    it('should handle notes with many links', () => {
      const manyLinks: Record<string, number> = {}
      for (let i = 0; i < 100; i++) {
        manyLinks[`notes/target-${i}.md`] = 1
      }
      mockCache.resolvedLinks['notes/hub.md'] = manyLinks

      expect(() => graph.getMostLinked(10)).not.toThrow()
      expect(() => graph.getStats()).not.toThrow()
    })

    it('should handle deeply nested paths', () => {
      mockCache.resolvedLinks['a/b/c/d/e/f/deep.md'] = {
        'a/b/c/d/e/f/other.md': 1,
      }

      expect(() => graph.getClusters()).not.toThrow()
    })

    it('should handle special characters in paths', () => {
      mockCache.resolvedLinks['notes/special [chars] & more.md'] = {
        'notes/target.md': 1,
      }

      expect(() => graph.getDeadLinks()).not.toThrow()
    })
  })
})
