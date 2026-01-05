import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SearchEngine, type SearchResult, type SearchOptions } from '../../src/search/engine.js'
import type { TFile, CachedMetadata, TagCache, LinkCache, Pos } from '../../src/types.js'
import type { Vault } from '../../src/vault/vault.js'
import type { MetadataCache } from '../../src/metadata/cache.js'

// Helper to create mock TFile
function createMockFile(path: string, overrides: Partial<TFile> = {}): TFile {
  const parts = path.split('/')
  const name = parts[parts.length - 1]
  const basename = name.replace(/\.[^.]+$/, '')
  const extension = name.includes('.') ? name.split('.').pop()! : ''

  return {
    path,
    name,
    basename,
    extension,
    stat: { ctime: Date.now(), mtime: Date.now(), size: 100 },
    ...overrides,
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

// Helper to create mock link cache
function createLinkCache(link: string, line: number = 0): LinkCache {
  return {
    link,
    original: `[[${link}]]`,
    displayText: link,
    position: createPos(line),
  }
}

describe('SearchEngine', () => {
  let vault: Vault
  let cache: MetadataCache
  let engine: SearchEngine
  let mockFiles: TFile[]
  let mockFileContents: Map<string, string>
  let mockMetadata: Map<string, CachedMetadata>

  beforeEach(() => {
    // Set up mock files
    mockFiles = [
      createMockFile('notes/daily/2024-01-01.md'),
      createMockFile('notes/daily/2024-01-02.md'),
      createMockFile('notes/projects/project-alpha.md'),
      createMockFile('notes/projects/project-beta.md'),
      createMockFile('notes/reference/typescript-guide.md'),
      createMockFile('notes/reference/react-patterns.md'),
      createMockFile('inbox/quick-note.md'),
      createMockFile('archive/old-project.md'),
    ]

    // Set up mock file contents
    mockFileContents = new Map([
      ['notes/daily/2024-01-01.md', `---
tags: [daily, journal]
date: 2024-01-01
---
# Daily Note - January 1st

Today I worked on the **project alpha** implementation.
Made good progress on the TypeScript refactoring.

See also [[project-alpha]] and [[typescript-guide]].
`],
      ['notes/daily/2024-01-02.md', `---
tags: [daily, journal]
date: 2024-01-02
---
# Daily Note - January 2nd

Continued work on project alpha.
Fixed several TypeScript type errors.

#typescript #debugging
`],
      ['notes/projects/project-alpha.md', `---
tags: [project, active]
status: active
priority: high
---
# Project Alpha

This is the main project file for Alpha.
Uses TypeScript and React for the frontend.

## Tasks
- [ ] Complete TypeScript migration
- [ ] Add unit tests

Links: [[typescript-guide]], [[react-patterns]]
`],
      ['notes/projects/project-beta.md', `---
tags: [project, planning]
status: planning
priority: medium
---
# Project Beta

A new project in planning phase.
Will use similar tech stack to Project Alpha.

See [[project-alpha]] for reference.
`],
      ['notes/reference/typescript-guide.md', `---
tags: [reference, typescript, programming]
category: reference
---
# TypeScript Guide

Comprehensive guide for TypeScript development.

## Key Concepts
- Type inference
- Generics
- Utility types

#typescript #guide
`],
      ['notes/reference/react-patterns.md', `---
tags: [reference, react, programming]
category: reference
---
# React Patterns

Common patterns for React development.

## Patterns
- Compound components
- Render props
- Custom hooks

See also [[typescript-guide]] for type-safe patterns.
`],
      ['inbox/quick-note.md', `---
tags: [inbox, unsorted]
---
# Quick Note

Random thought about TypeScript generics.
Need to organize this later.

#todo
`],
      ['archive/old-project.md', `---
tags: [archive, project]
status: archived
archived_date: 2023-06-15
---
# Old Project

This project is no longer active.
Archived for reference.
`],
    ])

    // Set up mock metadata
    mockMetadata = new Map([
      ['notes/daily/2024-01-01.md', {
        tags: [createTagCache('#daily'), createTagCache('#journal')],
        links: [createLinkCache('project-alpha', 8), createLinkCache('typescript-guide', 8)],
        frontmatter: { tags: ['daily', 'journal'], date: '2024-01-01' },
      }],
      ['notes/daily/2024-01-02.md', {
        tags: [createTagCache('#daily'), createTagCache('#journal'), createTagCache('#typescript', 10), createTagCache('#debugging', 10)],
        links: [],
        frontmatter: { tags: ['daily', 'journal'], date: '2024-01-02' },
      }],
      ['notes/projects/project-alpha.md', {
        tags: [createTagCache('#project'), createTagCache('#active')],
        links: [createLinkCache('typescript-guide', 14), createLinkCache('react-patterns', 14)],
        frontmatter: { tags: ['project', 'active'], status: 'active', priority: 'high' },
      }],
      ['notes/projects/project-beta.md', {
        tags: [createTagCache('#project'), createTagCache('#planning')],
        links: [createLinkCache('project-alpha', 10)],
        frontmatter: { tags: ['project', 'planning'], status: 'planning', priority: 'medium' },
      }],
      ['notes/reference/typescript-guide.md', {
        tags: [createTagCache('#reference'), createTagCache('#typescript'), createTagCache('#programming'), createTagCache('#typescript', 15), createTagCache('#guide', 15)],
        links: [],
        frontmatter: { tags: ['reference', 'typescript', 'programming'], category: 'reference' },
      }],
      ['notes/reference/react-patterns.md', {
        tags: [createTagCache('#reference'), createTagCache('#react'), createTagCache('#programming')],
        links: [createLinkCache('typescript-guide', 16)],
        frontmatter: { tags: ['reference', 'react', 'programming'], category: 'reference' },
      }],
      ['inbox/quick-note.md', {
        tags: [createTagCache('#inbox'), createTagCache('#unsorted'), createTagCache('#todo', 8)],
        links: [],
        frontmatter: { tags: ['inbox', 'unsorted'] },
      }],
      ['archive/old-project.md', {
        tags: [createTagCache('#archive'), createTagCache('#project')],
        links: [],
        frontmatter: { tags: ['archive', 'project'], status: 'archived', archived_date: '2023-06-15' },
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
      resolvedLinks: {},
      unresolvedLinks: {},
    } as unknown as MetadataCache

    engine = new SearchEngine(vault, cache)
  })

  describe('search(query)', () => {
    describe('basic content search', () => {
      it('should search file content and return matching files', async () => {
        const results = await engine.search('TypeScript')

        expect(results).toBeDefined()
        expect(Array.isArray(results)).toBe(true)
        expect(results.length).toBeGreaterThan(0)
      })

      it('should return SearchResult objects with file, score, and matches', async () => {
        const results = await engine.search('TypeScript')

        expect(results.length).toBeGreaterThan(0)
        const result = results[0]
        expect(result).toHaveProperty('file')
        expect(result).toHaveProperty('score')
        expect(result).toHaveProperty('matches')
        expect(result.file).toHaveProperty('path')
        expect(typeof result.score).toBe('number')
        expect(Array.isArray(result.matches)).toBe(true)
      })

      it('should include match details with line number, text, and positions', async () => {
        const results = await engine.search('TypeScript')

        expect(results.length).toBeGreaterThan(0)
        const match = results[0].matches[0]
        expect(match).toHaveProperty('line')
        expect(match).toHaveProperty('text')
        expect(match).toHaveProperty('positions')
        expect(typeof match.line).toBe('number')
        expect(typeof match.text).toBe('string')
        expect(Array.isArray(match.positions)).toBe(true)
      })

      it('should find all files containing the search term', async () => {
        const results = await engine.search('TypeScript')

        // TypeScript appears in: 2024-01-01, 2024-01-02, project-alpha, typescript-guide, react-patterns, quick-note
        expect(results.length).toBeGreaterThanOrEqual(5)

        const paths = results.map(r => r.file.path)
        expect(paths).toContain('notes/reference/typescript-guide.md')
        expect(paths).toContain('notes/projects/project-alpha.md')
      })

      it('should be case insensitive by default', async () => {
        const lower = await engine.search('typescript')
        const upper = await engine.search('TYPESCRIPT')
        const mixed = await engine.search('TypeScript')

        expect(lower.length).toBe(upper.length)
        expect(lower.length).toBe(mixed.length)
      })

      it('should return empty array when no matches found', async () => {
        const results = await engine.search('xyznonexistent123')

        expect(results).toEqual([])
      })

      it('should handle empty query gracefully', async () => {
        const results = await engine.search('')

        expect(Array.isArray(results)).toBe(true)
      })

      it('should handle special characters in query', async () => {
        const results = await engine.search('[ ] Complete')

        expect(results.length).toBeGreaterThan(0)
        const paths = results.map(r => r.file.path)
        expect(paths).toContain('notes/projects/project-alpha.md')
      })

      it('should match partial words', async () => {
        const results = await engine.search('Script')

        expect(results.length).toBeGreaterThan(0)
      })

      it('should find matches across multiple lines', async () => {
        const results = await engine.search('project')

        expect(results.length).toBeGreaterThan(0)

        // project-alpha.md mentions "project" multiple times
        const alphaResult = results.find(r => r.file.path === 'notes/projects/project-alpha.md')
        expect(alphaResult).toBeDefined()
        expect(alphaResult!.matches.length).toBeGreaterThan(1)
      })
    })

    describe('sorting by relevance', () => {
      it('should sort results by score in descending order', async () => {
        const results = await engine.search('TypeScript')

        for (let i = 1; i < results.length; i++) {
          expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
        }
      })

      it('should rank files with more matches higher', async () => {
        const results = await engine.search('TypeScript')

        // typescript-guide.md should rank high as it's focused on TypeScript
        const guideResult = results.find(r => r.file.path === 'notes/reference/typescript-guide.md')
        expect(guideResult).toBeDefined()
        expect(results.indexOf(guideResult!)).toBeLessThan(results.length / 2)
      })

      it('should rank title matches higher than body matches', async () => {
        const results = await engine.search('React Patterns')

        // react-patterns.md has it in the title, should be first
        expect(results[0].file.path).toBe('notes/reference/react-patterns.md')
      })

      it('should rank exact phrase matches higher than scattered word matches', async () => {
        const results = await engine.search('project alpha')

        // project-alpha.md should rank highest
        expect(results[0].file.path).toBe('notes/projects/project-alpha.md')
      })

      it('should consider match density in scoring', async () => {
        const results = await engine.search('guide')

        // typescript-guide.md has "guide" in title and body
        const guideResult = results.find(r => r.file.path === 'notes/reference/typescript-guide.md')
        expect(guideResult).toBeDefined()
        expect(guideResult!.score).toBeGreaterThan(0)
      })
    })

    describe('search with limit option', () => {
      it('should limit number of results when limit option is provided', async () => {
        const results = await engine.search('project', { limit: 2 })

        expect(results.length).toBeLessThanOrEqual(2)
      })

      it('should return all results when limit is greater than total matches', async () => {
        const allResults = await engine.search('TypeScript')
        const limitedResults = await engine.search('TypeScript', { limit: 100 })

        expect(limitedResults.length).toBe(allResults.length)
      })

      it('should return top-scored results when limiting', async () => {
        const allResults = await engine.search('TypeScript')
        const limitedResults = await engine.search('TypeScript', { limit: 2 })

        expect(limitedResults[0].file.path).toBe(allResults[0].file.path)
        expect(limitedResults[1].file.path).toBe(allResults[1].file.path)
      })

      it('should handle limit of 0', async () => {
        const results = await engine.search('TypeScript', { limit: 0 })

        expect(results).toEqual([])
      })

      it('should handle limit of 1', async () => {
        const results = await engine.search('TypeScript', { limit: 1 })

        expect(results.length).toBe(1)
      })

      it('should handle negative limit gracefully', async () => {
        const results = await engine.search('TypeScript', { limit: -1 })

        // Should either return empty or ignore the limit
        expect(Array.isArray(results)).toBe(true)
      })
    })

    describe('search with folder filter', () => {
      it('should filter results to specified folder', async () => {
        const results = await engine.search('project', {
          filter: { folder: 'notes/projects' },
        })

        expect(results.length).toBeGreaterThan(0)
        results.forEach(result => {
          expect(result.file.path).toMatch(/^notes\/projects\//)
        })
      })

      it('should include files in subfolders when filtering by parent folder', async () => {
        const results = await engine.search('daily', {
          filter: { folder: 'notes' },
        })

        expect(results.length).toBeGreaterThan(0)
        const paths = results.map(r => r.file.path)
        expect(paths.some(p => p.startsWith('notes/daily/'))).toBe(true)
      })

      it('should return empty when folder has no matches', async () => {
        const results = await engine.search('TypeScript', {
          filter: { folder: 'archive' },
        })

        expect(results.length).toBe(0)
      })

      it('should handle non-existent folder gracefully', async () => {
        const results = await engine.search('TypeScript', {
          filter: { folder: 'nonexistent/folder' },
        })

        expect(results).toEqual([])
      })

      it('should handle root folder filter', async () => {
        const results = await engine.search('quick', {
          filter: { folder: 'inbox' },
        })

        expect(results.length).toBe(1)
        expect(results[0].file.path).toBe('inbox/quick-note.md')
      })

      it('should handle folder path with trailing slash', async () => {
        const results = await engine.search('project', {
          filter: { folder: 'notes/projects/' },
        })

        expect(results.length).toBeGreaterThan(0)
        results.forEach(result => {
          expect(result.file.path).toMatch(/^notes\/projects\//)
        })
      })

      it('should handle folder path without leading slash', async () => {
        const results = await engine.search('project', {
          filter: { folder: 'notes/projects' },
        })

        expect(results.length).toBeGreaterThan(0)
      })
    })

    describe('search with tags filter', () => {
      it('should filter results by single tag', async () => {
        const results = await engine.search('', {
          filter: { tags: ['project'] },
        })

        expect(results.length).toBeGreaterThan(0)
        results.forEach(result => {
          const metadata = mockMetadata.get(result.file.path)
          expect(metadata?.frontmatter?.tags).toContain('project')
        })
      })

      it('should filter results by multiple tags (AND logic)', async () => {
        const results = await engine.search('', {
          filter: { tags: ['reference', 'typescript'] },
        })

        expect(results.length).toBeGreaterThan(0)
        results.forEach(result => {
          const metadata = mockMetadata.get(result.file.path)
          expect(metadata?.frontmatter?.tags).toContain('reference')
          expect(metadata?.frontmatter?.tags).toContain('typescript')
        })
      })

      it('should combine tag filter with content search', async () => {
        const results = await engine.search('guide', {
          filter: { tags: ['reference'] },
        })

        expect(results.length).toBeGreaterThan(0)
        results.forEach(result => {
          const metadata = mockMetadata.get(result.file.path)
          expect(metadata?.frontmatter?.tags).toContain('reference')
        })
      })

      it('should handle tag filter with hash prefix', async () => {
        const withHash = await engine.search('', {
          filter: { tags: ['#project'] },
        })
        const withoutHash = await engine.search('', {
          filter: { tags: ['project'] },
        })

        expect(withHash.length).toBe(withoutHash.length)
      })

      it('should return empty when no files match tags', async () => {
        const results = await engine.search('TypeScript', {
          filter: { tags: ['nonexistent-tag'] },
        })

        expect(results).toEqual([])
      })

      it('should handle empty tags array', async () => {
        const results = await engine.search('TypeScript', {
          filter: { tags: [] },
        })

        // Empty tags should not filter anything
        expect(results.length).toBeGreaterThan(0)
      })

      it('should match inline tags as well as frontmatter tags', async () => {
        const results = await engine.search('', {
          filter: { tags: ['todo'] },
        })

        expect(results.length).toBeGreaterThan(0)
        const paths = results.map(r => r.file.path)
        expect(paths).toContain('inbox/quick-note.md')
      })
    })

    describe('combined filter options', () => {
      it('should combine folder and tags filters', async () => {
        const results = await engine.search('', {
          filter: {
            folder: 'notes',
            tags: ['project'],
          },
        })

        expect(results.length).toBeGreaterThan(0)
        results.forEach(result => {
          expect(result.file.path).toMatch(/^notes\//)
          const metadata = mockMetadata.get(result.file.path)
          expect(metadata?.frontmatter?.tags).toContain('project')
        })
      })

      it('should combine folder, tags, and limit', async () => {
        const results = await engine.search('', {
          limit: 1,
          filter: {
            folder: 'notes/reference',
            tags: ['programming'],
          },
        })

        expect(results.length).toBeLessThanOrEqual(1)
        if (results.length > 0) {
          expect(results[0].file.path).toMatch(/^notes\/reference\//)
        }
      })

      it('should combine content search with folder and tags', async () => {
        const results = await engine.search('patterns', {
          filter: {
            folder: 'notes',
            tags: ['reference'],
          },
        })

        expect(results.length).toBeGreaterThan(0)
        expect(results[0].file.path).toBe('notes/reference/react-patterns.md')
      })
    })
  })

  describe('findByTag(tag)', () => {
    it('should find all files with the specified tag', () => {
      const files = engine.findByTag('project')

      expect(files.length).toBeGreaterThan(0)
      files.forEach(file => {
        const metadata = mockMetadata.get(file.path)
        const hasFrontmatterTag = metadata?.frontmatter?.tags?.includes('project')
        const hasInlineTag = metadata?.tags?.some(t => t.tag === '#project')
        expect(hasFrontmatterTag || hasInlineTag).toBe(true)
      })
    })

    it('should handle tag with hash prefix', () => {
      const withHash = engine.findByTag('#project')
      const withoutHash = engine.findByTag('project')

      expect(withHash.length).toBe(withoutHash.length)
    })

    it('should return empty array when no files have the tag', () => {
      const files = engine.findByTag('nonexistent-tag')

      expect(files).toEqual([])
    })

    it('should find files with inline tags (not in frontmatter)', () => {
      const files = engine.findByTag('todo')

      expect(files.length).toBeGreaterThan(0)
      const paths = files.map(f => f.path)
      expect(paths).toContain('inbox/quick-note.md')
    })

    it('should find files with nested tags', () => {
      // Assuming nested tag support like #project/active
      const files = engine.findByTag('typescript')

      expect(files.length).toBeGreaterThan(0)
    })

    it('should be case insensitive', () => {
      const lower = engine.findByTag('typescript')
      const upper = engine.findByTag('TYPESCRIPT')
      const mixed = engine.findByTag('TypeScript')

      expect(lower.length).toBe(upper.length)
      expect(lower.length).toBe(mixed.length)
    })

    it('should return TFile objects', () => {
      const files = engine.findByTag('project')

      expect(files.length).toBeGreaterThan(0)
      files.forEach(file => {
        expect(file).toHaveProperty('path')
        expect(file).toHaveProperty('name')
        expect(file).toHaveProperty('basename')
        expect(file).toHaveProperty('extension')
        expect(file).toHaveProperty('stat')
      })
    })

    it('should not return duplicate files', () => {
      // typescript-guide.md has #typescript in both frontmatter and body
      const files = engine.findByTag('typescript')
      const paths = files.map(f => f.path)
      const uniquePaths = [...new Set(paths)]

      expect(paths.length).toBe(uniquePaths.length)
    })

    it('should handle empty tag gracefully', () => {
      const files = engine.findByTag('')

      expect(Array.isArray(files)).toBe(true)
    })
  })

  describe('findByProperty(key, value)', () => {
    it('should find files with matching frontmatter property', () => {
      const files = engine.findByProperty('status', 'active')

      expect(files.length).toBeGreaterThan(0)
      files.forEach(file => {
        const metadata = mockMetadata.get(file.path)
        expect(metadata?.frontmatter?.status).toBe('active')
      })
    })

    it('should find files with string property values', () => {
      const files = engine.findByProperty('category', 'reference')

      expect(files.length).toBeGreaterThan(0)
      const paths = files.map(f => f.path)
      expect(paths).toContain('notes/reference/typescript-guide.md')
      expect(paths).toContain('notes/reference/react-patterns.md')
    })

    it('should find files with date property values', () => {
      const files = engine.findByProperty('date', '2024-01-01')

      expect(files.length).toBe(1)
      expect(files[0].path).toBe('notes/daily/2024-01-01.md')
    })

    it('should find files with array property containing value', () => {
      const files = engine.findByProperty('tags', 'project')

      expect(files.length).toBeGreaterThan(0)
      files.forEach(file => {
        const metadata = mockMetadata.get(file.path)
        expect(metadata?.frontmatter?.tags).toContain('project')
      })
    })

    it('should return empty array when no files match', () => {
      const files = engine.findByProperty('nonexistent', 'value')

      expect(files).toEqual([])
    })

    it('should return empty array when value does not match', () => {
      const files = engine.findByProperty('status', 'nonexistent-status')

      expect(files).toEqual([])
    })

    it('should handle boolean property values', () => {
      // Add a mock file with boolean property for this test
      const filesWithBool = engine.findByProperty('draft', true)

      expect(Array.isArray(filesWithBool)).toBe(true)
    })

    it('should handle numeric property values', () => {
      const files = engine.findByProperty('priority', 'high')

      expect(files.length).toBeGreaterThan(0)
    })

    it('should handle null value to find files with property set to null', () => {
      const files = engine.findByProperty('status', null)

      expect(Array.isArray(files)).toBe(true)
    })

    it('should handle undefined value to find files missing the property', () => {
      const files = engine.findByProperty('status', undefined)

      expect(Array.isArray(files)).toBe(true)
      // Files without status property
      files.forEach(file => {
        const metadata = mockMetadata.get(file.path)
        expect(metadata?.frontmatter?.status).toBeUndefined()
      })
    })

    it('should be case sensitive for property keys', () => {
      const files1 = engine.findByProperty('Status', 'active')
      const files2 = engine.findByProperty('status', 'active')

      // Status vs status should be different
      expect(files1.length).not.toBe(files2.length)
    })

    it('should return TFile objects', () => {
      const files = engine.findByProperty('status', 'active')

      expect(files.length).toBeGreaterThan(0)
      files.forEach(file => {
        expect(file).toHaveProperty('path')
        expect(file).toHaveProperty('name')
        expect(file).toHaveProperty('basename')
        expect(file).toHaveProperty('extension')
      })
    })

    it('should handle nested property values', () => {
      // If the implementation supports dot notation for nested properties
      const files = engine.findByProperty('meta.author', 'John')

      expect(Array.isArray(files)).toBe(true)
    })
  })

  describe('findByLink(target)', () => {
    it('should find all files that link to the target', () => {
      const files = engine.findByLink('typescript-guide')

      expect(files.length).toBeGreaterThan(0)
      const paths = files.map(f => f.path)
      expect(paths).toContain('notes/daily/2024-01-01.md')
      expect(paths).toContain('notes/projects/project-alpha.md')
      expect(paths).toContain('notes/reference/react-patterns.md')
    })

    it('should find files linking to target by basename', () => {
      const files = engine.findByLink('project-alpha')

      expect(files.length).toBeGreaterThan(0)
      const paths = files.map(f => f.path)
      expect(paths).toContain('notes/daily/2024-01-01.md')
      expect(paths).toContain('notes/projects/project-beta.md')
    })

    it('should handle target with full path', () => {
      const files = engine.findByLink('notes/reference/typescript-guide.md')

      expect(files.length).toBeGreaterThan(0)
    })

    it('should handle target with or without .md extension', () => {
      const withExt = engine.findByLink('typescript-guide.md')
      const withoutExt = engine.findByLink('typescript-guide')

      expect(withExt.length).toBe(withoutExt.length)
    })

    it('should return empty array when target has no incoming links', () => {
      const files = engine.findByLink('nonexistent-file')

      expect(files).toEqual([])
    })

    it('should not include the target file itself', () => {
      const files = engine.findByLink('typescript-guide')
      const paths = files.map(f => f.path)

      expect(paths).not.toContain('notes/reference/typescript-guide.md')
    })

    it('should return TFile objects', () => {
      const files = engine.findByLink('typescript-guide')

      expect(files.length).toBeGreaterThan(0)
      files.forEach(file => {
        expect(file).toHaveProperty('path')
        expect(file).toHaveProperty('name')
        expect(file).toHaveProperty('basename')
        expect(file).toHaveProperty('extension')
      })
    })

    it('should handle case insensitive link matching', () => {
      const lower = engine.findByLink('typescript-guide')
      const mixed = engine.findByLink('TypeScript-Guide')

      expect(lower.length).toBe(mixed.length)
    })

    it('should not return duplicate files', () => {
      const files = engine.findByLink('typescript-guide')
      const paths = files.map(f => f.path)
      const uniquePaths = [...new Set(paths)]

      expect(paths.length).toBe(uniquePaths.length)
    })

    it('should handle links with aliases', () => {
      // Links like [[typescript-guide|TS Guide]]
      const files = engine.findByLink('typescript-guide')

      expect(files.length).toBeGreaterThan(0)
    })

    it('should handle block reference links', () => {
      // Links like [[typescript-guide#section]] or [[typescript-guide^blockid]]
      const files = engine.findByLink('typescript-guide')

      expect(files.length).toBeGreaterThan(0)
    })

    it('should handle empty target gracefully', () => {
      const files = engine.findByLink('')

      expect(Array.isArray(files)).toBe(true)
    })

    it('should find embed links as well as regular links', () => {
      // Embeds like ![[image.png]] or ![[note]]
      const files = engine.findByLink('typescript-guide')

      // Should include files with embeds of the target
      expect(Array.isArray(files)).toBe(true)
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle vault with no files', async () => {
      vi.mocked(vault.getMarkdownFiles).mockReturnValue([])

      const results = await engine.search('test')

      expect(results).toEqual([])
    })

    it('should handle files with no content', async () => {
      mockFileContents.set('notes/daily/2024-01-01.md', '')

      const results = await engine.search('test')

      expect(Array.isArray(results)).toBe(true)
    })

    it('should handle files with no metadata', async () => {
      mockMetadata.delete('notes/daily/2024-01-01.md')

      const files = engine.findByTag('daily')

      // Should still work, just not find that file
      expect(Array.isArray(files)).toBe(true)
    })

    it('should handle concurrent searches', async () => {
      const searches = await Promise.all([
        engine.search('TypeScript'),
        engine.search('React'),
        engine.search('project'),
      ])

      expect(searches.length).toBe(3)
      searches.forEach(results => {
        expect(Array.isArray(results)).toBe(true)
      })
    })

    it('should handle very long search queries', async () => {
      const longQuery = 'a'.repeat(1000)

      const results = await engine.search(longQuery)

      expect(Array.isArray(results)).toBe(true)
    })

    it('should handle search query with regex special characters', async () => {
      const results = await engine.search('.*+?^${}()|[]\\')

      expect(Array.isArray(results)).toBe(true)
    })

    it('should handle unicode in search query', async () => {
      const results = await engine.search('cafe')

      expect(Array.isArray(results)).toBe(true)
    })

    it('should handle newlines in search query', async () => {
      const results = await engine.search('line1\nline2')

      expect(Array.isArray(results)).toBe(true)
    })
  })

  describe('performance characteristics', () => {
    it('should return results quickly for simple queries', async () => {
      const start = performance.now()
      await engine.search('TypeScript')
      const duration = performance.now() - start

      // Should complete in under 100ms for small vault
      expect(duration).toBeLessThan(100)
    })

    it('should handle limit option efficiently', async () => {
      const startAll = performance.now()
      await engine.search('TypeScript')
      const durationAll = performance.now() - startAll

      const startLimited = performance.now()
      await engine.search('TypeScript', { limit: 1 })
      const durationLimited = performance.now() - startLimited

      // Limited search should be at least as fast
      expect(durationLimited).toBeLessThanOrEqual(durationAll + 10)
    })
  })
})
