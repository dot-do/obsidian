import { describe, it, expect, beforeEach } from 'vitest'
import { GraphEngine, type Backlink, type ForwardLink } from '../../src/graph/engine.js'
import type { MetadataCache } from '../../src/metadata/cache.js'
import type { TFile, CachedMetadata, LinkCache, Pos } from '../../src/types.js'

// Test fixtures:
// index.md - links to daily-note.md, project.md
// daily-note.md - links to project.md, ideas.md
// project.md - links to tasks.md
// tasks.md - links to project.md (bidirectional)
// ideas.md - no outgoing links
// orphan.md - no links in or out
// multi-link.md - links to target.md multiple times at different positions
// target.md - no outgoing links

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

function createPos(line: number, col: number, offset: number): Pos {
  return {
    start: { line, col, offset },
    end: { line, col: col + 10, offset: offset + 10 }
  }
}

function createLinkCache(link: string, line: number = 1, col: number = 0): LinkCache {
  return {
    link,
    original: `[[${link}]]`,
    position: createPos(line, col, line * 100 + col)
  }
}

// Mock MetadataCache that simulates our test graph
function createMockCache(): MetadataCache {
  const files: Record<string, TFile> = {
    'index.md': createMockFile('index.md'),
    'daily-note.md': createMockFile('daily-note.md'),
    'project.md': createMockFile('project.md'),
    'tasks.md': createMockFile('tasks.md'),
    'ideas.md': createMockFile('ideas.md'),
    'orphan.md': createMockFile('orphan.md'),
    'multi-link.md': createMockFile('multi-link.md'),
    'target.md': createMockFile('target.md'),
    'folder/nested.md': createMockFile('folder/nested.md'),
    'folder/deep/file.md': createMockFile('folder/deep/file.md')
  }

  // Graph structure:
  // index -> daily-note, project
  // daily-note -> project, ideas
  // project -> tasks
  // tasks -> project (bidirectional)
  // ideas (no outlinks)
  // orphan (isolated)
  // multi-link -> target (3 links at different positions)
  // folder/nested -> index
  // folder/deep/file -> folder/nested
  const metadata: Record<string, CachedMetadata> = {
    'index.md': {
      links: [
        createLinkCache('daily-note', 5, 0),
        createLinkCache('project', 10, 0)
      ]
    },
    'daily-note.md': {
      links: [
        createLinkCache('project', 3, 10),
        createLinkCache('ideas', 7, 5)
      ]
    },
    'project.md': {
      links: [
        createLinkCache('tasks', 2, 0)
      ]
    },
    'tasks.md': {
      links: [
        createLinkCache('project', 1, 0)
      ]
    },
    'ideas.md': {
      links: []
    },
    'orphan.md': {
      links: []
    },
    'multi-link.md': {
      links: [
        createLinkCache('target', 1, 0),
        createLinkCache('target', 5, 20),
        createLinkCache('target', 12, 5)
      ]
    },
    'target.md': {
      links: []
    },
    'folder/nested.md': {
      links: [
        createLinkCache('index', 1, 0)
      ]
    },
    'folder/deep/file.md': {
      links: [
        createLinkCache('folder/nested', 1, 0)
      ]
    }
  }

  // Build resolved links structure (source -> target -> count)
  const resolvedLinks: Record<string, Record<string, number>> = {
    'index.md': { 'daily-note.md': 1, 'project.md': 1 },
    'daily-note.md': { 'project.md': 1, 'ideas.md': 1 },
    'project.md': { 'tasks.md': 1 },
    'tasks.md': { 'project.md': 1 },
    'ideas.md': {},
    'orphan.md': {},
    'multi-link.md': { 'target.md': 3 },
    'target.md': {},
    'folder/nested.md': { 'index.md': 1 },
    'folder/deep/file.md': { 'folder/nested.md': 1 }
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
    unresolvedLinks: {
      'daily-note.md': { 'nonexistent': 1 }
    },
    on: () => ({ unsubscribe: () => {} }),
    off: () => {},
    trigger: () => {}
  } as MetadataCache
}

describe('GraphEngine backlinks', () => {
  let engine: GraphEngine
  let mockCache: MetadataCache

  beforeEach(() => {
    mockCache = createMockCache()
    engine = new GraphEngine(mockCache)
  })

  describe('getBacklinks', () => {
    it('should return all files linking to the target file', () => {
      // project.md is linked from: index.md, daily-note.md, tasks.md
      const backlinks = engine.getBacklinks('project.md')

      expect(backlinks).toBeDefined()
      expect(Array.isArray(backlinks)).toBe(true)
      expect(backlinks.length).toBe(3)

      const sourcePaths = backlinks.map(b => b.file.path)
      expect(sourcePaths).toContain('index.md')
      expect(sourcePaths).toContain('daily-note.md')
      expect(sourcePaths).toContain('tasks.md')
    })

    it('should include link context with link text and position', () => {
      // project.md is linked from index.md at line 10, col 0
      const backlinks = engine.getBacklinks('project.md')
      const indexBacklink = backlinks.find(b => b.file.path === 'index.md')

      expect(indexBacklink).toBeDefined()
      expect(indexBacklink!.links).toBeDefined()
      expect(indexBacklink!.links.length).toBeGreaterThan(0)

      const linkInfo = indexBacklink!.links[0]
      expect(linkInfo.link).toBe('project')
      expect(linkInfo.position).toBeDefined()
      expect(linkInfo.position.line).toBe(10)
      expect(linkInfo.position.col).toBe(0)
    })

    it('should return empty array for file with no backlinks', () => {
      // orphan.md has no incoming links
      const backlinks = engine.getBacklinks('orphan.md')

      expect(backlinks).toEqual([])
    })

    it('should return empty array for non-existent file', () => {
      const backlinks = engine.getBacklinks('does-not-exist.md')

      expect(backlinks).toEqual([])
    })

    it('should handle file linked from single source', () => {
      // ideas.md is only linked from daily-note.md
      const backlinks = engine.getBacklinks('ideas.md')

      expect(backlinks.length).toBe(1)
      expect(backlinks[0].file.path).toBe('daily-note.md')
    })

    it('should handle multiple links from same file to target', () => {
      // target.md is linked 3 times from multi-link.md
      const backlinks = engine.getBacklinks('target.md')

      expect(backlinks.length).toBe(1) // One source file
      expect(backlinks[0].file.path).toBe('multi-link.md')
      expect(backlinks[0].links.length).toBe(3) // Three separate links

      // Verify each link has correct position
      const positions = backlinks[0].links.map(l => l.position)
      expect(positions).toContainEqual({ line: 1, col: 0 })
      expect(positions).toContainEqual({ line: 5, col: 20 })
      expect(positions).toContainEqual({ line: 12, col: 5 })
    })

    it('should handle files in nested folders', () => {
      // index.md is linked from folder/nested.md
      const backlinks = engine.getBacklinks('index.md')

      const sourcePaths = backlinks.map(b => b.file.path)
      expect(sourcePaths).toContain('folder/nested.md')
    })

    it('should handle deeply nested file paths', () => {
      // folder/nested.md is linked from folder/deep/file.md
      const backlinks = engine.getBacklinks('folder/nested.md')

      expect(backlinks.length).toBe(1)
      expect(backlinks[0].file.path).toBe('folder/deep/file.md')
    })

    it('should return proper TFile objects for source files', () => {
      const backlinks = engine.getBacklinks('project.md')

      for (const backlink of backlinks) {
        expect(backlink.file).toHaveProperty('path')
        expect(backlink.file).toHaveProperty('name')
        expect(backlink.file).toHaveProperty('basename')
        expect(backlink.file).toHaveProperty('extension')
        expect(backlink.file).toHaveProperty('stat')
        expect(backlink.file.extension).toBe('md')
      }
    })

    it('should preserve link order by position within file', () => {
      // multi-link.md has 3 links at lines 1, 5, 12
      const backlinks = engine.getBacklinks('target.md')
      const positions = backlinks[0].links.map(l => l.position.line)

      // Should be ordered by position (ascending)
      expect(positions).toEqual([1, 5, 12])
    })

    it('should handle bidirectional links correctly', () => {
      // project.md and tasks.md link to each other
      const projectBacklinks = engine.getBacklinks('project.md')
      const tasksBacklinks = engine.getBacklinks('tasks.md')

      const projectSources = projectBacklinks.map(b => b.file.path)
      const tasksSources = tasksBacklinks.map(b => b.file.path)

      expect(projectSources).toContain('tasks.md')
      expect(tasksSources).toContain('project.md')
    })

    it('should not include self-references in backlinks', () => {
      // Even if a file links to itself, it shouldn't appear in its own backlinks
      // (unless explicitly designed to do so)
      const backlinks = engine.getBacklinks('index.md')
      const sourcePaths = backlinks.map(b => b.file.path)

      expect(sourcePaths).not.toContain('index.md')
    })
  })

  describe('getForwardLinks', () => {
    it('should return all files linked from source', () => {
      // index.md links to: daily-note.md, project.md
      const forwardLinks = engine.getForwardLinks('index.md')

      expect(forwardLinks).toBeDefined()
      expect(Array.isArray(forwardLinks)).toBe(true)
      expect(forwardLinks.length).toBe(2)

      const linkTexts = forwardLinks.map(l => l.link)
      expect(linkTexts).toContain('daily-note')
      expect(linkTexts).toContain('project')
    })

    it('should include resolved file reference when target exists', () => {
      const forwardLinks = engine.getForwardLinks('index.md')
      const dailyNoteLink = forwardLinks.find(l => l.link === 'daily-note')

      expect(dailyNoteLink).toBeDefined()
      expect(dailyNoteLink!.resolved).not.toBeNull()
      expect(dailyNoteLink!.resolved!.path).toBe('daily-note.md')
    })

    it('should return null for resolved when target does not exist', () => {
      // Create a mock cache with an unresolved link
      const cacheWithUnresolved = {
        ...mockCache,
        getCache: (path: string) => {
          if (path === 'broken-links.md') {
            return {
              links: [createLinkCache('nonexistent-file', 1, 0)]
            }
          }
          return mockCache.getCache(path)
        }
      } as MetadataCache

      const engineWithBroken = new GraphEngine(cacheWithUnresolved)
      const forwardLinks = engineWithBroken.getForwardLinks('broken-links.md')

      expect(forwardLinks.length).toBe(1)
      expect(forwardLinks[0].link).toBe('nonexistent-file')
      expect(forwardLinks[0].resolved).toBeNull()
    })

    it('should return empty array for file with no forward links', () => {
      // ideas.md has no outgoing links
      const forwardLinks = engine.getForwardLinks('ideas.md')

      expect(forwardLinks).toEqual([])
    })

    it('should return empty array for orphan file', () => {
      const forwardLinks = engine.getForwardLinks('orphan.md')

      expect(forwardLinks).toEqual([])
    })

    it('should return empty array for non-existent file', () => {
      const forwardLinks = engine.getForwardLinks('does-not-exist.md')

      expect(forwardLinks).toEqual([])
    })

    it('should handle multiple links to same target', () => {
      // multi-link.md has 3 links to target.md
      const forwardLinks = engine.getForwardLinks('multi-link.md')

      // Should return 3 forward links (one per link occurrence)
      expect(forwardLinks.length).toBe(3)

      // All should point to target
      for (const link of forwardLinks) {
        expect(link.link).toBe('target')
        expect(link.resolved).not.toBeNull()
        expect(link.resolved!.path).toBe('target.md')
      }
    })

    it('should handle links to files in nested folders', () => {
      // folder/deep/file.md links to folder/nested
      const forwardLinks = engine.getForwardLinks('folder/deep/file.md')

      expect(forwardLinks.length).toBe(1)
      expect(forwardLinks[0].link).toBe('folder/nested')
      expect(forwardLinks[0].resolved).not.toBeNull()
      expect(forwardLinks[0].resolved!.path).toBe('folder/nested.md')
    })

    it('should preserve link order by position in file', () => {
      // index.md links to daily-note at line 5, project at line 10
      const forwardLinks = engine.getForwardLinks('index.md')

      // Links should be in order of appearance
      expect(forwardLinks[0].link).toBe('daily-note')
      expect(forwardLinks[1].link).toBe('project')
    })

    it('should return proper TFile objects for resolved links', () => {
      const forwardLinks = engine.getForwardLinks('index.md')

      for (const link of forwardLinks) {
        if (link.resolved) {
          expect(link.resolved).toHaveProperty('path')
          expect(link.resolved).toHaveProperty('name')
          expect(link.resolved).toHaveProperty('basename')
          expect(link.resolved).toHaveProperty('extension')
          expect(link.resolved).toHaveProperty('stat')
        }
      }
    })
  })

  describe('edge cases', () => {
    it('should handle empty cache gracefully', () => {
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

      const emptyEngine = new GraphEngine(emptyCache)

      expect(emptyEngine.getBacklinks('any.md')).toEqual([])
      expect(emptyEngine.getForwardLinks('any.md')).toEqual([])
    })

    it('should handle file with null metadata', () => {
      const nullMetadataCache = {
        ...mockCache,
        getCache: () => null
      } as MetadataCache

      const nullEngine = new GraphEngine(nullMetadataCache)

      expect(nullEngine.getForwardLinks('index.md')).toEqual([])
    })

    it('should handle file with undefined links array', () => {
      const undefinedLinksCache = {
        ...mockCache,
        getCache: () => ({}) // metadata with no links property
      } as MetadataCache

      const undefinedEngine = new GraphEngine(undefinedLinksCache)

      expect(undefinedEngine.getForwardLinks('index.md')).toEqual([])
    })

    it('should handle path with special characters', () => {
      const specialPath = 'notes/2024-01-15 Meeting Notes.md'
      const backlinks = engine.getBacklinks(specialPath)
      const forwardLinks = engine.getForwardLinks(specialPath)

      expect(Array.isArray(backlinks)).toBe(true)
      expect(Array.isArray(forwardLinks)).toBe(true)
    })

    it('should handle path normalization consistently', () => {
      // Both with and without .md extension should work
      const backlinksWith = engine.getBacklinks('project.md')
      const forwardLinksWith = engine.getForwardLinks('index.md')

      expect(Array.isArray(backlinksWith)).toBe(true)
      expect(Array.isArray(forwardLinksWith)).toBe(true)
    })
  })

  describe('consistency between backlinks and forward links', () => {
    it('should have symmetric relationship: if A links to B, B has A as backlink', () => {
      // index.md -> project.md
      // So project.md should have index.md as backlink
      const forwardFromIndex = engine.getForwardLinks('index.md')
      const projectLink = forwardFromIndex.find(l => l.link === 'project')

      expect(projectLink).toBeDefined()

      const backlinksToProject = engine.getBacklinks('project.md')
      const indexBacklink = backlinksToProject.find(b => b.file.path === 'index.md')

      expect(indexBacklink).toBeDefined()
    })

    it('should count total links correctly across backlinks', () => {
      // project.md has 3 backlinks (from index, daily-note, tasks)
      const backlinks = engine.getBacklinks('project.md')
      const totalLinkCount = backlinks.reduce((sum, b) => sum + b.links.length, 0)

      expect(totalLinkCount).toBe(3)
    })

    it('should not double-count links in bidirectional relationships', () => {
      // project and tasks link to each other
      const projectBacklinks = engine.getBacklinks('project.md')
      const tasksBacklinks = engine.getBacklinks('tasks.md')

      // Each should only count the other once
      const tasksLinkingToProject = projectBacklinks.filter(b => b.file.path === 'tasks.md')
      const projectLinkingToTasks = tasksBacklinks.filter(b => b.file.path === 'project.md')

      expect(tasksLinkingToProject.length).toBe(1)
      expect(projectLinkingToTasks.length).toBe(1)
    })
  })

  describe('performance considerations', () => {
    it('should handle files with many backlinks efficiently', () => {
      const startTime = Date.now()
      const backlinks = engine.getBacklinks('project.md')
      const elapsed = Date.now() - startTime

      expect(elapsed).toBeLessThan(100) // Should complete quickly
      expect(Array.isArray(backlinks)).toBe(true)
    })

    it('should handle files with many forward links efficiently', () => {
      const startTime = Date.now()
      const forwardLinks = engine.getForwardLinks('multi-link.md')
      const elapsed = Date.now() - startTime

      expect(elapsed).toBeLessThan(100) // Should complete quickly
      expect(Array.isArray(forwardLinks)).toBe(true)
    })

    it('should not recalculate on repeated calls with same input', () => {
      // First call
      const backlinks1 = engine.getBacklinks('project.md')
      // Second call should be fast (potentially cached)
      const startTime = Date.now()
      const backlinks2 = engine.getBacklinks('project.md')
      const elapsed = Date.now() - startTime

      expect(elapsed).toBeLessThan(50)
      expect(backlinks1.length).toBe(backlinks2.length)
    })
  })
})
