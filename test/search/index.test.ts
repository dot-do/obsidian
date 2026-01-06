import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SearchIndex, type SearchIndexOptions } from '../../src/search/index.js'
import type { TFile, CachedMetadata, TagCache, Pos } from '../../src/types.js'
import type { Vault } from '../../src/vault/vault.js'
import type { MetadataCache } from '../../src/metadata/cache.js'

// Helper to create mock TFile
function createMockFile(path: string, mtime: number = Date.now()): TFile {
  const parts = path.split('/')
  const name = parts[parts.length - 1]
  const basename = name.replace(/\.[^.]+$/, '')
  const extension = name.includes('.') ? name.split('.').pop()! : ''

  return {
    path,
    name,
    basename,
    extension,
    stat: { ctime: mtime - 1000, mtime, size: 100 },
  }
}

// Helper to create mock position
function createPos(line: number, col: number = 0): Pos {
  return {
    start: { line, col, offset: 0 },
    end: { line, col: col + 10, offset: 10 },
  }
}

// Helper to create mock tag cache
function createTagCache(tag: string, line: number = 0): TagCache {
  return { tag, position: createPos(line) }
}

describe('SearchIndex', () => {
  let vault: Vault
  let cache: MetadataCache
  let index: SearchIndex
  let mockFiles: TFile[]
  let mockFileContents: Map<string, string>
  let mockMetadata: Map<string, CachedMetadata>

  beforeEach(() => {
    const now = Date.now()

    // Set up mock files
    mockFiles = [
      createMockFile('notes/typescript-guide.md', now),
      createMockFile('notes/react-tutorial.md', now - 1000),
      createMockFile('notes/project-alpha.md', now - 2000),
      createMockFile('notes/daily/2024-01-01.md', now - 3000),
    ]

    // Set up mock file contents
    mockFileContents = new Map([
      ['notes/typescript-guide.md', `---
tags: [typescript, programming]
---
# TypeScript Guide

A comprehensive guide to TypeScript development.
Learn about types, interfaces, and generics.

TypeScript is a typed superset of JavaScript.
`],
      ['notes/react-tutorial.md', `---
tags: [react, javascript]
---
# React Tutorial

Learn React fundamentals including components and hooks.
Build modern web applications with React.
`],
      ['notes/project-alpha.md', `---
tags: [project]
status: active
---
# Project Alpha

Main project documentation.
Uses TypeScript and React together.
`],
      ['notes/daily/2024-01-01.md', `---
tags: [daily]
---
# Daily Note

Today I worked on TypeScript code.
Made progress on the React components.
`],
    ])

    // Set up mock metadata
    mockMetadata = new Map([
      ['notes/typescript-guide.md', {
        frontmatter: { tags: ['typescript', 'programming'] },
        tags: [createTagCache('#typescript'), createTagCache('#programming')],
      }],
      ['notes/react-tutorial.md', {
        frontmatter: { tags: ['react', 'javascript'] },
        tags: [createTagCache('#react'), createTagCache('#javascript')],
      }],
      ['notes/project-alpha.md', {
        frontmatter: { tags: ['project'], status: 'active' },
        tags: [createTagCache('#project')],
      }],
      ['notes/daily/2024-01-01.md', {
        frontmatter: { tags: ['daily'] },
        tags: [createTagCache('#daily')],
      }],
    ])

    // Create mock vault
    vault = {
      getMarkdownFiles: vi.fn(() => mockFiles),
      getFiles: vi.fn(() => mockFiles),
      getFileByPath: vi.fn((path: string) => mockFiles.find(f => f.path === path) ?? null),
      read: vi.fn(async (file: TFile) => mockFileContents.get(file.path) ?? ''),
      cachedRead: vi.fn(async (file: TFile) => mockFileContents.get(file.path) ?? ''),
    } as unknown as Vault

    // Create mock metadata cache
    cache = {
      getFileCache: vi.fn((file: TFile) => mockMetadata.get(file.path) ?? null),
      getCache: vi.fn((path: string) => mockMetadata.get(path) ?? null),
    } as unknown as MetadataCache

    index = new SearchIndex(vault, cache)
  })

  describe('buildIndex', () => {
    it('should build an index from vault files', async () => {
      await index.buildIndex()

      const stats = index.getStats()
      expect(stats.documentCount).toBe(4)
      expect(stats.termCount).toBeGreaterThan(0)
    })

    it('should clear previous index data when rebuilding', async () => {
      await index.buildIndex()
      const firstStats = index.getStats()

      await index.buildIndex()
      const secondStats = index.getStats()

      expect(secondStats.documentCount).toBe(firstStats.documentCount)
    })

    it('should mark index as not needing rebuild after building', async () => {
      expect(index.needsUpdate()).toBe(true)

      await index.buildIndex()

      expect(index.needsUpdate()).toBe(false)
    })
  })

  describe('search', () => {
    beforeEach(async () => {
      await index.buildIndex()
    })

    it('should find documents containing search terms', () => {
      const results = index.search('typescript')

      expect(results.length).toBeGreaterThan(0)
      const paths = results.map(r => r.file.path)
      expect(paths).toContain('notes/typescript-guide.md')
    })

    it('should return results sorted by relevance', () => {
      const results = index.search('typescript')

      // typescript-guide.md should be most relevant for "typescript"
      expect(results[0].file.path).toBe('notes/typescript-guide.md')

      // Scores should be descending
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
      }
    })

    it('should respect limit parameter', () => {
      const results = index.search('typescript', 2)

      expect(results.length).toBeLessThanOrEqual(2)
    })

    it('should return empty array for non-matching query', () => {
      const results = index.search('xyznonexistent')

      expect(results).toEqual([])
    })

    it('should include matched terms in results', () => {
      const results = index.search('typescript')

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].matchedTerms).toContain('typescript')
    })

    it('should match multiple terms', () => {
      const results = index.search('typescript react')

      expect(results.length).toBeGreaterThan(0)
      // project-alpha.md mentions both TypeScript and React
      const alphaResult = results.find(r => r.file.path === 'notes/project-alpha.md')
      expect(alphaResult).toBeDefined()
    })

    it('should handle case-insensitive search', () => {
      const lower = index.search('typescript')
      const upper = index.search('TYPESCRIPT')
      const mixed = index.search('TypeScript')

      expect(lower.length).toBe(upper.length)
      expect(lower.length).toBe(mixed.length)
    })
  })

  describe('caching', () => {
    beforeEach(async () => {
      await index.buildIndex()
    })

    it('should cache search results', () => {
      const first = index.search('typescript')
      const second = index.search('typescript')

      expect(first).toEqual(second)
    })

    it('should return cached results for identical queries', () => {
      const stats1 = index.getStats()
      index.search('typescript')
      const stats2 = index.getStats()

      expect(stats2.cacheSize).toBe(stats1.cacheSize + 1)

      // Second search should use cache
      index.search('typescript')
      const stats3 = index.getStats()

      expect(stats3.cacheSize).toBe(stats2.cacheSize)
    })

    it('should cache different queries separately', () => {
      index.search('typescript')
      index.search('react')

      const stats = index.getStats()
      expect(stats.cacheSize).toBe(2)
    })

    it('should respect cache TTL', async () => {
      const shortTTL = new SearchIndex(vault, cache, { cacheTTL: 10 })
      await shortTTL.buildIndex()

      shortTTL.search('typescript')
      expect(shortTTL.getStats().cacheSize).toBe(1)

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 20))

      // Search again - should create new cache entry
      shortTTL.search('typescript')
      // Old entry should be evicted, new one created
      expect(shortTTL.getStats().cacheSize).toBe(1)
    })
  })

  describe('incremental updates', () => {
    beforeEach(async () => {
      await index.buildIndex()
    })

    it('should mark files as dirty', () => {
      expect(index.needsUpdate()).toBe(false)

      index.markDirty('notes/typescript-guide.md')

      expect(index.needsUpdate()).toBe(true)
    })

    it('should invalidate cache when marking dirty', () => {
      index.search('typescript')
      expect(index.getStats().cacheSize).toBe(1)

      index.markDirty('notes/typescript-guide.md')

      expect(index.getStats().cacheSize).toBe(0)
    })

    it('should update index for dirty files', async () => {
      // Mark a file as dirty
      index.markDirty('notes/typescript-guide.md')
      expect(index.needsUpdate()).toBe(true)

      // Update the index
      await index.updateIndex()

      expect(index.needsUpdate()).toBe(false)
    })

    it('should remove deleted files from index', async () => {
      const resultsBefore = index.search('typescript')
      const beforePaths = resultsBefore.map(r => r.file.path)
      expect(beforePaths).toContain('notes/typescript-guide.md')

      // Mark file as deleted
      index.markDeleted('notes/typescript-guide.md')

      // File should no longer be in search results
      const resultsAfter = index.search('typescript')
      const afterPaths = resultsAfter.map(r => r.file.path)
      expect(afterPaths).not.toContain('notes/typescript-guide.md')
    })
  })

  describe('clear', () => {
    it('should clear all index data', async () => {
      await index.buildIndex()
      index.search('typescript')

      index.clear()

      const stats = index.getStats()
      expect(stats.documentCount).toBe(0)
      expect(stats.termCount).toBe(0)
      expect(stats.cacheSize).toBe(0)
    })

    it('should mark index as needing rebuild after clear', async () => {
      await index.buildIndex()
      expect(index.needsUpdate()).toBe(false)

      index.clear()

      expect(index.needsUpdate()).toBe(true)
    })
  })

  describe('options', () => {
    it('should respect minTermLength option', async () => {
      const strictIndex = new SearchIndex(vault, cache, { minTermLength: 5 })
      await strictIndex.buildIndex()

      // Short terms like "the", "is", etc. should not be indexed
      const results = strictIndex.search('the')
      expect(results).toEqual([])
    })

    it('should respect maxCacheEntries option', async () => {
      const smallCache = new SearchIndex(vault, cache, { maxCacheEntries: 2 })
      await smallCache.buildIndex()

      smallCache.search('typescript')
      smallCache.search('react')
      smallCache.search('project')

      // Cache should only have 2 entries
      expect(smallCache.getStats().cacheSize).toBe(2)
    })

    it('should filter stop words', async () => {
      await index.buildIndex()

      // Common stop words should not return results
      const results = index.search('and')
      // Stop words are filtered, so exact stop word searches return empty
      expect(results.length).toBe(0)
    })
  })

  describe('performance', () => {
    it('should handle large number of searches efficiently', async () => {
      await index.buildIndex()

      const start = performance.now()
      for (let i = 0; i < 100; i++) {
        index.search('typescript')
      }
      const duration = performance.now() - start

      // 100 cached searches should complete quickly
      expect(duration).toBeLessThan(100)
    })

    it('should provide index statistics', async () => {
      await index.buildIndex()

      const stats = index.getStats()

      expect(stats.documentCount).toBe(4)
      expect(stats.termCount).toBeGreaterThan(0)
      expect(stats.cacheSize).toBe(0)
    })
  })
})
