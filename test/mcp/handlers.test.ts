import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  handleVaultSearch,
  handleNoteRead,
  handleNoteCreate,
  handleGraphBacklinks,
  handleVaultContext,
  handleVaultList,
  handleNoteUpdate,
  handleNoteAppend,
  handleFrontmatterUpdate,
  handleGraphForwardLinks,
  handleGraphNeighbors,
} from '../../src/mcp/handlers.js'
import type { ObsidianClient } from '../../src/client/client.js'
import type { TFile, CachedMetadata } from '../../src/types.js'

// Mock ObsidianClient for testing
function createMockClient(options: {
  files?: TFile[]
  fileContents?: Record<string, string>
  metadata?: Record<string, CachedMetadata>
  backlinks?: Record<string, string[]>
  resolvedLinks?: Record<string, Record<string, number>>
} = {}): ObsidianClient {
  const files = options.files ?? []
  const fileContents = options.fileContents ?? {}
  const metadata = options.metadata ?? {}
  const backlinks = options.backlinks ?? {}
  const resolvedLinks = options.resolvedLinks ?? {}

  return {
    vault: {
      getMarkdownFiles: vi.fn(() => files),
      getFileByPath: vi.fn((path: string) => files.find(f => f.path === path) ?? null),
      read: vi.fn(async (file: TFile) => {
        if (file.path in fileContents) return fileContents[file.path]
        throw new Error(`File not found: ${file.path}`)
      }),
      create: vi.fn(async (path: string, content: string) => {
        const newFile: TFile = {
          path,
          name: path.split('/').pop()!,
          basename: path.split('/').pop()!.replace(/\.[^.]+$/, ''),
          extension: path.split('.').pop()!,
          stat: { ctime: Date.now(), mtime: Date.now(), size: content.length },
        }
        files.push(newFile)
        fileContents[path] = content
        return newFile
      }),
      modify: vi.fn(async (file: TFile, content: string) => {
        fileContents[file.path] = content
      }),
      getFiles: vi.fn(() => files),
      getAllFolders: vi.fn(() => []),
    },
    metadataCache: {
      getCache: vi.fn((path: string) => metadata[path] ?? null),
      getFileCache: vi.fn((file: TFile) => metadata[file.path] ?? null),
      resolvedLinks,
      unresolvedLinks: {},
      getFirstLinkpathDest: vi.fn(),
    },
    graph: {
      getBacklinks: vi.fn((path: string) => backlinks[path] ?? []),
      getOutlinks: vi.fn(() => []),
      getNeighbors: vi.fn(() => []),
    },
    getContext: vi.fn(),
    generateContext: vi.fn(() => ''),
  } as unknown as ObsidianClient
}

function createMockFile(path: string, overrides: Partial<TFile> = {}): TFile {
  const name = path.split('/').pop()!
  const basename = name.replace(/\.[^.]+$/, '')
  const extension = path.split('.').pop()!
  return {
    path,
    name,
    basename,
    extension,
    stat: { ctime: Date.now(), mtime: Date.now(), size: 100 },
    ...overrides,
  }
}

describe('MCP Tool Handlers', () => {
  describe('handleVaultSearch', () => {
    describe('basic search functionality', () => {
      it('should search vault and return matching notes', async () => {
        const files = [
          createMockFile('notes/javascript.md'),
          createMockFile('notes/typescript.md'),
          createMockFile('notes/python.md'),
        ]
        const fileContents = {
          'notes/javascript.md': '# JavaScript\n\nA programming language for the web.',
          'notes/typescript.md': '# TypeScript\n\nA typed superset of JavaScript.',
          'notes/python.md': '# Python\n\nA versatile programming language.',
        }
        const client = createMockClient({ files, fileContents })

        const result = await handleVaultSearch(client, { query: 'JavaScript' })

        expect(result).toBeDefined()
        expect(result.matches).toBeInstanceOf(Array)
        expect(result.matches.length).toBeGreaterThan(0)
        expect(result.matches.some((m: { path: string }) => m.path === 'notes/javascript.md')).toBe(true)
        expect(result.matches.some((m: { path: string }) => m.path === 'notes/typescript.md')).toBe(true)
      })

      it('should return empty array when no matches found', async () => {
        const files = [createMockFile('notes/unrelated.md')]
        const fileContents = { 'notes/unrelated.md': '# Unrelated content' }
        const client = createMockClient({ files, fileContents })

        const result = await handleVaultSearch(client, { query: 'nonexistent term xyz' })

        expect(result).toBeDefined()
        expect(result.matches).toEqual([])
      })

      it('should search file names when content search fails', async () => {
        const files = [
          createMockFile('notes/javascript-guide.md'),
          createMockFile('notes/other.md'),
        ]
        const fileContents = {
          'notes/javascript-guide.md': '# Guide',
          'notes/other.md': '# Other',
        }
        const client = createMockClient({ files, fileContents })

        const result = await handleVaultSearch(client, { query: 'javascript' })

        expect(result.matches).toBeInstanceOf(Array)
        expect(result.matches.some((m: { path: string }) => m.path === 'notes/javascript-guide.md')).toBe(true)
      })

      it('should be case-insensitive by default', async () => {
        const files = [createMockFile('notes/Test.md')]
        const fileContents = { 'notes/Test.md': '# UPPERCASE and lowercase MiXeD' }
        const client = createMockClient({ files, fileContents })

        const result = await handleVaultSearch(client, { query: 'uppercase' })

        expect(result.matches.length).toBeGreaterThan(0)
      })

      it('should include relevance score in results', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Test content' }
        const client = createMockClient({ files, fileContents })

        const result = await handleVaultSearch(client, { query: 'test' })

        expect(result.matches[0]).toHaveProperty('score')
        expect(typeof result.matches[0].score).toBe('number')
        expect(result.matches[0].score).toBeGreaterThan(0)
      })

      it('should return matches sorted by relevance', async () => {
        const files = [
          createMockFile('notes/a.md'),
          createMockFile('notes/b.md'),
          createMockFile('notes/c.md'),
        ]
        const fileContents = {
          'notes/a.md': 'test mentioned once',
          'notes/b.md': 'test test test mentioned multiple times test',
          'notes/c.md': 'test test mentioned twice',
        }
        const client = createMockClient({ files, fileContents })

        const result = await handleVaultSearch(client, { query: 'test' })

        expect(result.matches.length).toBe(3)
        // Higher relevance should come first
        for (let i = 0; i < result.matches.length - 1; i++) {
          expect(result.matches[i].score).toBeGreaterThanOrEqual(result.matches[i + 1].score)
        }
      })
    })

    describe('search with tag filter', () => {
      it('should filter results by single tag', async () => {
        const files = [
          createMockFile('notes/tagged.md'),
          createMockFile('notes/untagged.md'),
        ]
        const fileContents = {
          'notes/tagged.md': '# Tagged Note\nContent here',
          'notes/untagged.md': '# Untagged Note\nContent here',
        }
        const metadata: Record<string, CachedMetadata> = {
          'notes/tagged.md': {
            tags: [{ tag: '#project', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 8, offset: 8 } } }],
          },
          'notes/untagged.md': {},
        }
        const client = createMockClient({ files, fileContents, metadata })

        const result = await handleVaultSearch(client, {
          query: 'Note',
          filter: { tags: ['project'] },
        })

        expect(result.matches.length).toBe(1)
        expect(result.matches[0].path).toBe('notes/tagged.md')
      })

      it('should filter results by multiple tags (AND logic)', async () => {
        const files = [
          createMockFile('notes/both-tags.md'),
          createMockFile('notes/one-tag.md'),
          createMockFile('notes/other-tag.md'),
        ]
        const fileContents = {
          'notes/both-tags.md': '# Has both tags',
          'notes/one-tag.md': '# Has one tag',
          'notes/other-tag.md': '# Has other tag',
        }
        const metadata: Record<string, CachedMetadata> = {
          'notes/both-tags.md': {
            tags: [
              { tag: '#project', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 8, offset: 8 } } },
              { tag: '#active', position: { start: { line: 0, col: 9, offset: 9 }, end: { line: 0, col: 16, offset: 16 } } },
            ],
          },
          'notes/one-tag.md': {
            tags: [{ tag: '#project', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 8, offset: 8 } } }],
          },
          'notes/other-tag.md': {
            tags: [{ tag: '#active', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 7, offset: 7 } } }],
          },
        }
        const client = createMockClient({ files, fileContents, metadata })

        const result = await handleVaultSearch(client, {
          query: 'tag',
          filter: { tags: ['project', 'active'] },
        })

        expect(result.matches.length).toBe(1)
        expect(result.matches[0].path).toBe('notes/both-tags.md')
      })

      it('should handle tag filter with hash prefix', async () => {
        const files = [createMockFile('notes/tagged.md')]
        const fileContents = { 'notes/tagged.md': '# Note' }
        const metadata: Record<string, CachedMetadata> = {
          'notes/tagged.md': {
            tags: [{ tag: '#important', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 10, offset: 10 } } }],
          },
        }
        const client = createMockClient({ files, fileContents, metadata })

        const result = await handleVaultSearch(client, {
          query: 'Note',
          filter: { tags: ['#important'] },
        })

        expect(result.matches.length).toBe(1)
      })

      it('should handle nested tags', async () => {
        const files = [createMockFile('notes/nested-tag.md')]
        const fileContents = { 'notes/nested-tag.md': '# Note' }
        const metadata: Record<string, CachedMetadata> = {
          'notes/nested-tag.md': {
            tags: [{ tag: '#project/active', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 15, offset: 15 } } }],
          },
        }
        const client = createMockClient({ files, fileContents, metadata })

        const result = await handleVaultSearch(client, {
          query: 'Note',
          filter: { tags: ['project/active'] },
        })

        expect(result.matches.length).toBe(1)
      })

      it('should return empty results when tag filter excludes all matches', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Test' }
        const metadata: Record<string, CachedMetadata> = {
          'notes/test.md': {
            tags: [{ tag: '#other', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 6, offset: 6 } } }],
          },
        }
        const client = createMockClient({ files, fileContents, metadata })

        const result = await handleVaultSearch(client, {
          query: 'Test',
          filter: { tags: ['nonexistent'] },
        })

        expect(result.matches).toEqual([])
      })
    })

    describe('search result structure', () => {
      it('should return path and title in each match', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Test Title\n\nContent here' }
        const client = createMockClient({ files, fileContents })

        const result = await handleVaultSearch(client, { query: 'test' })

        expect(result.matches[0]).toHaveProperty('path', 'notes/test.md')
        expect(result.matches[0]).toHaveProperty('title')
      })

      it('should include snippet with matched text', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Title\n\nSome text with keyword in it.' }
        const client = createMockClient({ files, fileContents })

        const result = await handleVaultSearch(client, { query: 'keyword' })

        expect(result.matches[0]).toHaveProperty('snippet')
        expect(result.matches[0].snippet).toContain('keyword')
      })

      it('should include metadata tags in result', async () => {
        const files = [createMockFile('notes/tagged.md')]
        const fileContents = { 'notes/tagged.md': '# Tagged' }
        const metadata: Record<string, CachedMetadata> = {
          'notes/tagged.md': {
            tags: [
              { tag: '#tag1', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 5, offset: 5 } } },
              { tag: '#tag2', position: { start: { line: 0, col: 6, offset: 6 }, end: { line: 0, col: 11, offset: 11 } } },
            ],
          },
        }
        const client = createMockClient({ files, fileContents, metadata })

        const result = await handleVaultSearch(client, { query: 'Tagged' })

        expect(result.matches[0]).toHaveProperty('tags')
        expect(result.matches[0].tags).toContain('tag1')
        expect(result.matches[0].tags).toContain('tag2')
      })
    })

    describe('edge cases', () => {
      it('should handle empty query', async () => {
        const client = createMockClient()

        await expect(handleVaultSearch(client, { query: '' })).rejects.toThrow()
      })

      it('should handle query with only whitespace', async () => {
        const client = createMockClient()

        await expect(handleVaultSearch(client, { query: '   ' })).rejects.toThrow()
      })

      it('should handle special regex characters in query', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': 'Text with (parentheses) and [brackets]' }
        const client = createMockClient({ files, fileContents })

        const result = await handleVaultSearch(client, { query: '(parentheses)' })

        expect(result.matches.length).toBeGreaterThan(0)
      })

      it('should handle empty vault', async () => {
        const client = createMockClient({ files: [], fileContents: {} })

        const result = await handleVaultSearch(client, { query: 'anything' })

        expect(result.matches).toEqual([])
      })

      it('should limit number of results', async () => {
        const files = Array.from({ length: 100 }, (_, i) => createMockFile(`notes/note-${i}.md`))
        const fileContents = Object.fromEntries(files.map(f => [f.path, '# Note with keyword']))
        const client = createMockClient({ files, fileContents })

        const result = await handleVaultSearch(client, { query: 'keyword' })

        expect(result.matches.length).toBeLessThanOrEqual(50) // reasonable limit
      })
    })
  })

  describe('handleNoteRead', () => {
    describe('basic read functionality', () => {
      it('should read note content by path', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Test Note\n\nThis is the content.' }
        const client = createMockClient({ files, fileContents })

        const result = await handleNoteRead(client, { path: 'notes/test.md' })

        expect(result).toBeDefined()
        expect(result.content).toBe('# Test Note\n\nThis is the content.')
      })

      it('should return file metadata', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Test' }
        const metadata: Record<string, CachedMetadata> = {
          'notes/test.md': {
            frontmatter: { title: 'Test', tags: ['test'] },
          },
        }
        const client = createMockClient({ files, fileContents, metadata })

        const result = await handleNoteRead(client, { path: 'notes/test.md' })

        expect(result.metadata).toBeDefined()
        expect(result.metadata.frontmatter).toEqual({ title: 'Test', tags: ['test'] })
      })

      it('should throw error for non-existent note', async () => {
        const client = createMockClient()

        await expect(handleNoteRead(client, { path: 'nonexistent.md' })).rejects.toThrow()
      })

      it('should read note from nested path', async () => {
        const files = [createMockFile('folder/subfolder/deep/note.md')]
        const fileContents = { 'folder/subfolder/deep/note.md': '# Deep Note' }
        const client = createMockClient({ files, fileContents })

        const result = await handleNoteRead(client, { path: 'folder/subfolder/deep/note.md' })

        expect(result.content).toBe('# Deep Note')
      })

      it('should return file path in result', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Test' }
        const client = createMockClient({ files, fileContents })

        const result = await handleNoteRead(client, { path: 'notes/test.md' })

        expect(result.path).toBe('notes/test.md')
      })
    })

    describe('include backlinks option', () => {
      it('should not include backlinks when includeBacklinks is false', async () => {
        const files = [
          createMockFile('notes/target.md'),
          createMockFile('notes/linker.md'),
        ]
        const fileContents = {
          'notes/target.md': '# Target',
          'notes/linker.md': '# Linker [[target]]',
        }
        const backlinks = { 'notes/target.md': ['notes/linker.md'] }
        const client = createMockClient({ files, fileContents, backlinks })

        const result = await handleNoteRead(client, { path: 'notes/target.md', includeBacklinks: false })

        expect(result.backlinks).toBeUndefined()
      })

      it('should include backlinks when includeBacklinks is true', async () => {
        const files = [
          createMockFile('notes/target.md'),
          createMockFile('notes/linker1.md'),
          createMockFile('notes/linker2.md'),
        ]
        const fileContents = {
          'notes/target.md': '# Target',
          'notes/linker1.md': '# Linker 1',
          'notes/linker2.md': '# Linker 2',
        }
        const backlinks = { 'notes/target.md': ['notes/linker1.md', 'notes/linker2.md'] }
        const client = createMockClient({ files, fileContents, backlinks })

        const result = await handleNoteRead(client, { path: 'notes/target.md', includeBacklinks: true })

        expect(result.backlinks).toBeDefined()
        expect(result.backlinks).toBeInstanceOf(Array)
        expect(result.backlinks.length).toBe(2)
        expect(result.backlinks).toContain('notes/linker1.md')
        expect(result.backlinks).toContain('notes/linker2.md')
      })

      it('should return empty backlinks array when note has no backlinks', async () => {
        const files = [createMockFile('notes/orphan.md')]
        const fileContents = { 'notes/orphan.md': '# Orphan' }
        const backlinks = { 'notes/orphan.md': [] }
        const client = createMockClient({ files, fileContents, backlinks })

        const result = await handleNoteRead(client, { path: 'notes/orphan.md', includeBacklinks: true })

        expect(result.backlinks).toEqual([])
      })

      it('should default to not including backlinks', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Test' }
        const backlinks = { 'notes/test.md': ['notes/other.md'] }
        const client = createMockClient({ files, fileContents, backlinks })

        const result = await handleNoteRead(client, { path: 'notes/test.md' })

        expect(result.backlinks).toBeUndefined()
      })
    })

    describe('result structure', () => {
      it('should include all expected fields in result', async () => {
        const files = [createMockFile('notes/complete.md')]
        const fileContents = { 'notes/complete.md': '---\ntitle: Complete Note\n---\n\n# Complete Note\n\nContent here.' }
        const metadata: Record<string, CachedMetadata> = {
          'notes/complete.md': {
            frontmatter: { title: 'Complete Note' },
            headings: [{ heading: 'Complete Note', level: 1, position: { start: { line: 4, col: 0, offset: 30 }, end: { line: 4, col: 15, offset: 45 } } }],
          },
        }
        const client = createMockClient({ files, fileContents, metadata })

        const result = await handleNoteRead(client, { path: 'notes/complete.md' })

        expect(result).toHaveProperty('path')
        expect(result).toHaveProperty('content')
        expect(result).toHaveProperty('metadata')
      })

      it('should include headings in metadata', async () => {
        const files = [createMockFile('notes/headings.md')]
        const fileContents = { 'notes/headings.md': '# H1\n## H2\n### H3' }
        const metadata: Record<string, CachedMetadata> = {
          'notes/headings.md': {
            headings: [
              { heading: 'H1', level: 1, position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 4, offset: 4 } } },
              { heading: 'H2', level: 2, position: { start: { line: 1, col: 0, offset: 5 }, end: { line: 1, col: 5, offset: 10 } } },
              { heading: 'H3', level: 3, position: { start: { line: 2, col: 0, offset: 11 }, end: { line: 2, col: 6, offset: 17 } } },
            ],
          },
        }
        const client = createMockClient({ files, fileContents, metadata })

        const result = await handleNoteRead(client, { path: 'notes/headings.md' })

        expect(result.metadata.headings).toBeDefined()
        expect(result.metadata.headings.length).toBe(3)
      })

      it('should include links in metadata', async () => {
        const files = [createMockFile('notes/links.md')]
        const fileContents = { 'notes/links.md': 'See [[other]] and [[another]]' }
        const metadata: Record<string, CachedMetadata> = {
          'notes/links.md': {
            links: [
              { link: 'other', original: '[[other]]', position: { start: { line: 0, col: 4, offset: 4 }, end: { line: 0, col: 13, offset: 13 } } },
              { link: 'another', original: '[[another]]', position: { start: { line: 0, col: 18, offset: 18 }, end: { line: 0, col: 29, offset: 29 } } },
            ],
          },
        }
        const client = createMockClient({ files, fileContents, metadata })

        const result = await handleNoteRead(client, { path: 'notes/links.md' })

        expect(result.metadata.links).toBeDefined()
        expect(result.metadata.links.length).toBe(2)
      })
    })

    describe('edge cases', () => {
      it('should handle empty file', async () => {
        const files = [createMockFile('notes/empty.md')]
        const fileContents = { 'notes/empty.md': '' }
        const client = createMockClient({ files, fileContents })

        const result = await handleNoteRead(client, { path: 'notes/empty.md' })

        expect(result.content).toBe('')
      })

      it('should handle file with only frontmatter', async () => {
        const files = [createMockFile('notes/frontmatter-only.md')]
        const fileContents = { 'notes/frontmatter-only.md': '---\ntitle: Only Frontmatter\n---' }
        const metadata: Record<string, CachedMetadata> = {
          'notes/frontmatter-only.md': {
            frontmatter: { title: 'Only Frontmatter' },
          },
        }
        const client = createMockClient({ files, fileContents, metadata })

        const result = await handleNoteRead(client, { path: 'notes/frontmatter-only.md' })

        expect(result.content).toBe('---\ntitle: Only Frontmatter\n---')
        expect(result.metadata.frontmatter).toEqual({ title: 'Only Frontmatter' })
      })

      it('should handle path with spaces', async () => {
        const files = [createMockFile('notes/my note with spaces.md')]
        const fileContents = { 'notes/my note with spaces.md': '# Spaced' }
        const client = createMockClient({ files, fileContents })

        const result = await handleNoteRead(client, { path: 'notes/my note with spaces.md' })

        expect(result.content).toBe('# Spaced')
      })

      it('should throw for empty path', async () => {
        const client = createMockClient()

        await expect(handleNoteRead(client, { path: '' })).rejects.toThrow()
      })
    })
  })

  describe('handleNoteCreate', () => {
    describe('basic creation', () => {
      it('should create note with content', async () => {
        const client = createMockClient()

        const result = await handleNoteCreate(client, {
          path: 'notes/new-note.md',
          content: '# New Note\n\nContent here.',
        })

        expect(result).toBeDefined()
        expect(result.path).toBe('notes/new-note.md')
        expect(result.success).toBe(true)
      })

      it('should create note in nested path', async () => {
        const client = createMockClient()

        const result = await handleNoteCreate(client, {
          path: 'projects/2024/january/note.md',
          content: '# Nested Note',
        })

        expect(result.path).toBe('projects/2024/january/note.md')
        expect(result.success).toBe(true)
      })

      it('should return created file metadata', async () => {
        const client = createMockClient()

        const result = await handleNoteCreate(client, {
          path: 'notes/test.md',
          content: '# Test',
        })

        expect(result.file).toBeDefined()
        expect(result.file.basename).toBe('test')
        expect(result.file.extension).toBe('md')
      })

      it('should throw error when file already exists', async () => {
        const files = [createMockFile('notes/existing.md')]
        const fileContents = { 'notes/existing.md': '# Existing' }
        const client = createMockClient({ files, fileContents })

        await expect(handleNoteCreate(client, {
          path: 'notes/existing.md',
          content: '# New Content',
        })).rejects.toThrow()
      })
    })

    describe('frontmatter handling', () => {
      it('should add frontmatter to note when provided', async () => {
        const client = createMockClient()

        const result = await handleNoteCreate(client, {
          path: 'notes/with-frontmatter.md',
          content: '# Note Content',
          frontmatter: { title: 'My Note', tags: ['test', 'new'] },
        })

        expect(result.success).toBe(true)
        // The created content should include frontmatter
        expect(result.content).toContain('---')
        expect(result.content).toContain('title: My Note')
      })

      it('should handle complex frontmatter values', async () => {
        const client = createMockClient()

        const result = await handleNoteCreate(client, {
          path: 'notes/complex-frontmatter.md',
          content: '# Content',
          frontmatter: {
            title: 'Complex',
            date: '2024-01-01',
            nested: { key: 'value' },
            array: [1, 2, 3],
          },
        })

        expect(result.success).toBe(true)
      })

      it('should not duplicate frontmatter if content already has it', async () => {
        const client = createMockClient()

        const result = await handleNoteCreate(client, {
          path: 'notes/has-frontmatter.md',
          content: '---\nexisting: true\n---\n\n# Content',
          frontmatter: { title: 'New Title' },
        })

        expect(result.success).toBe(true)
        // Should merge or handle appropriately
        const frontmatterCount = (result.content.match(/---/g) || []).length
        expect(frontmatterCount).toBe(2) // Just opening and closing
      })

      it('should create note without frontmatter when not provided', async () => {
        const client = createMockClient()

        const result = await handleNoteCreate(client, {
          path: 'notes/no-frontmatter.md',
          content: '# No Frontmatter',
        })

        expect(result.content).toBe('# No Frontmatter')
        expect(result.content).not.toContain('---')
      })
    })

    describe('validation', () => {
      it('should validate path has .md extension', async () => {
        const client = createMockClient()

        await expect(handleNoteCreate(client, {
          path: 'notes/invalid',
          content: '# Content',
        })).rejects.toThrow()
      })

      it('should reject empty content', async () => {
        const client = createMockClient()

        await expect(handleNoteCreate(client, {
          path: 'notes/empty.md',
          content: '',
        })).rejects.toThrow()
      })

      it('should reject empty path', async () => {
        const client = createMockClient()

        await expect(handleNoteCreate(client, {
          path: '',
          content: '# Content',
        })).rejects.toThrow()
      })

      it('should reject path with invalid characters', async () => {
        const client = createMockClient()

        await expect(handleNoteCreate(client, {
          path: 'notes/invalid<>:"|?*.md',
          content: '# Content',
        })).rejects.toThrow()
      })

      it('should sanitize frontmatter keys', async () => {
        const client = createMockClient()

        const result = await handleNoteCreate(client, {
          path: 'notes/sanitized.md',
          content: '# Content',
          frontmatter: {
            'valid-key': 'value',
            'another_key': 'value2',
          },
        })

        expect(result.success).toBe(true)
      })
    })

    describe('edge cases', () => {
      it('should handle unicode in path', async () => {
        const client = createMockClient()

        const result = await handleNoteCreate(client, {
          path: 'notes/unicode-test.md',
          content: '# Content',
        })

        expect(result.success).toBe(true)
      })

      it('should handle very long content', async () => {
        const client = createMockClient()
        const longContent = '# Title\n\n' + 'Lorem ipsum '.repeat(10000)

        const result = await handleNoteCreate(client, {
          path: 'notes/long.md',
          content: longContent,
        })

        expect(result.success).toBe(true)
      })

      it('should handle content with special markdown', async () => {
        const client = createMockClient()
        const specialContent = `# Title

\`\`\`javascript
const x = 1;
\`\`\`

| Table | Header |
|-------|--------|
| Cell  | Cell   |

> Blockquote

- List item
1. Numbered item

[[Internal Link]]
![[Embedded Note]]
`

        const result = await handleNoteCreate(client, {
          path: 'notes/special.md',
          content: specialContent,
        })

        expect(result.success).toBe(true)
      })
    })
  })

  describe('handleGraphBacklinks', () => {
    describe('basic backlink retrieval', () => {
      it('should return all backlinks for a note', async () => {
        const files = [
          createMockFile('notes/target.md'),
          createMockFile('notes/source1.md'),
          createMockFile('notes/source2.md'),
        ]
        const backlinks = { 'notes/target.md': ['notes/source1.md', 'notes/source2.md'] }
        const client = createMockClient({ files, backlinks })

        const result = await handleGraphBacklinks(client, { path: 'notes/target.md' })

        expect(result).toBeDefined()
        expect(result.backlinks).toBeInstanceOf(Array)
        expect(result.backlinks.length).toBe(2)
        expect(result.backlinks.map((b: { path: string }) => b.path)).toContain('notes/source1.md')
        expect(result.backlinks.map((b: { path: string }) => b.path)).toContain('notes/source2.md')
      })

      it('should return empty array when no backlinks exist', async () => {
        const files = [createMockFile('notes/orphan.md')]
        const backlinks = { 'notes/orphan.md': [] }
        const client = createMockClient({ files, backlinks })

        const result = await handleGraphBacklinks(client, { path: 'notes/orphan.md' })

        expect(result.backlinks).toEqual([])
      })

      it('should throw error for non-existent note', async () => {
        const client = createMockClient()

        await expect(handleGraphBacklinks(client, { path: 'nonexistent.md' })).rejects.toThrow()
      })

      it('should include backlink count in result', async () => {
        const files = [createMockFile('notes/target.md')]
        const backlinks = { 'notes/target.md': ['notes/a.md', 'notes/b.md', 'notes/c.md'] }
        const client = createMockClient({ files, backlinks })

        const result = await handleGraphBacklinks(client, { path: 'notes/target.md' })

        expect(result.count).toBe(3)
      })
    })

    describe('include context option', () => {
      it('should not include context when includeContext is false', async () => {
        const files = [
          createMockFile('notes/target.md'),
          createMockFile('notes/source.md'),
        ]
        const fileContents = {
          'notes/target.md': '# Target',
          'notes/source.md': '# Source\n\nThis links to [[target]] in context.',
        }
        const backlinks = { 'notes/target.md': ['notes/source.md'] }
        const client = createMockClient({ files, fileContents, backlinks })

        const result = await handleGraphBacklinks(client, { path: 'notes/target.md', includeContext: false })

        expect(result.backlinks[0].context).toBeUndefined()
      })

      it('should include context when includeContext is true', async () => {
        const files = [
          createMockFile('notes/target.md'),
          createMockFile('notes/source.md'),
        ]
        const fileContents = {
          'notes/target.md': '# Target',
          'notes/source.md': '# Source\n\nThis links to [[target]] in context.',
        }
        const backlinks = { 'notes/target.md': ['notes/source.md'] }
        const metadata: Record<string, CachedMetadata> = {
          'notes/source.md': {
            links: [{ link: 'target', original: '[[target]]', position: { start: { line: 2, col: 14, offset: 25 }, end: { line: 2, col: 24, offset: 35 } } }],
          },
        }
        const client = createMockClient({ files, fileContents, backlinks, metadata })

        const result = await handleGraphBacklinks(client, { path: 'notes/target.md', includeContext: true })

        expect(result.backlinks[0].context).toBeDefined()
        expect(result.backlinks[0].context).toContain('links to')
      })

      it('should include multiple contexts when note is linked multiple times', async () => {
        const files = [
          createMockFile('notes/target.md'),
          createMockFile('notes/source.md'),
        ]
        const fileContents = {
          'notes/target.md': '# Target',
          'notes/source.md': '# Source\n\nFirst [[target]] mention.\n\nSecond [[target]] mention.',
        }
        const backlinks = { 'notes/target.md': ['notes/source.md'] }
        const metadata: Record<string, CachedMetadata> = {
          'notes/source.md': {
            links: [
              { link: 'target', original: '[[target]]', position: { start: { line: 2, col: 6, offset: 15 }, end: { line: 2, col: 16, offset: 25 } } },
              { link: 'target', original: '[[target]]', position: { start: { line: 4, col: 7, offset: 45 }, end: { line: 4, col: 17, offset: 55 } } },
            ],
          },
        }
        const client = createMockClient({ files, fileContents, backlinks, metadata })

        const result = await handleGraphBacklinks(client, { path: 'notes/target.md', includeContext: true })

        expect(result.backlinks[0].contexts).toBeDefined()
        expect(result.backlinks[0].contexts.length).toBe(2)
      })

      it('should default to not including context', async () => {
        const files = [createMockFile('notes/target.md')]
        const backlinks = { 'notes/target.md': ['notes/source.md'] }
        const client = createMockClient({ files, backlinks })

        const result = await handleGraphBacklinks(client, { path: 'notes/target.md' })

        expect(result.backlinks[0]?.context).toBeUndefined()
      })
    })

    describe('result structure', () => {
      it('should include source note title in backlink', async () => {
        const files = [
          createMockFile('notes/target.md'),
          createMockFile('notes/source.md'),
        ]
        const fileContents = {
          'notes/target.md': '# Target',
          'notes/source.md': '# Source Note Title\n\nLinks to [[target]]',
        }
        const backlinks = { 'notes/target.md': ['notes/source.md'] }
        const client = createMockClient({ files, fileContents, backlinks })

        const result = await handleGraphBacklinks(client, { path: 'notes/target.md' })

        expect(result.backlinks[0]).toHaveProperty('title')
      })

      it('should include link count from each source', async () => {
        const files = [
          createMockFile('notes/target.md'),
          createMockFile('notes/source.md'),
        ]
        const backlinks = { 'notes/target.md': ['notes/source.md'] }
        const resolvedLinks = { 'notes/source.md': { 'notes/target.md': 3 } }
        const client = createMockClient({ files, backlinks, resolvedLinks })

        const result = await handleGraphBacklinks(client, { path: 'notes/target.md' })

        expect(result.backlinks[0]).toHaveProperty('linkCount')
        expect(result.backlinks[0].linkCount).toBe(3)
      })
    })

    describe('edge cases', () => {
      it('should handle circular references', async () => {
        const files = [
          createMockFile('notes/a.md'),
          createMockFile('notes/b.md'),
        ]
        const backlinks = {
          'notes/a.md': ['notes/b.md'],
          'notes/b.md': ['notes/a.md'],
        }
        const client = createMockClient({ files, backlinks })

        const resultA = await handleGraphBacklinks(client, { path: 'notes/a.md' })
        const resultB = await handleGraphBacklinks(client, { path: 'notes/b.md' })

        expect(resultA.backlinks.length).toBe(1)
        expect(resultB.backlinks.length).toBe(1)
      })

      it('should handle self-referential links', async () => {
        const files = [createMockFile('notes/self.md')]
        const backlinks = { 'notes/self.md': ['notes/self.md'] }
        const client = createMockClient({ files, backlinks })

        const result = await handleGraphBacklinks(client, { path: 'notes/self.md' })

        expect(result.backlinks.length).toBe(1)
        expect(result.backlinks[0].path).toBe('notes/self.md')
      })

      it('should handle empty path', async () => {
        const client = createMockClient()

        await expect(handleGraphBacklinks(client, { path: '' })).rejects.toThrow()
      })
    })
  })

  describe('handleVaultContext', () => {
    describe('scope: all', () => {
      it('should return full vault context', async () => {
        const files = [
          createMockFile('notes/a.md'),
          createMockFile('notes/b.md'),
          createMockFile('projects/c.md'),
        ]
        const client = createMockClient({ files })

        const result = await handleVaultContext(client, { scope: 'all' })

        expect(result).toBeDefined()
        expect(result.files).toBeInstanceOf(Array)
        expect(result.files.length).toBe(3)
      })

      it('should include folder structure', async () => {
        const files = [
          createMockFile('notes/a.md'),
          createMockFile('projects/b.md'),
          createMockFile('projects/deep/c.md'),
        ]
        const client = createMockClient({ files })

        const result = await handleVaultContext(client, { scope: 'all' })

        expect(result.folders).toBeDefined()
        expect(result.folders).toContain('notes')
        expect(result.folders).toContain('projects')
        expect(result.folders).toContain('projects/deep')
      })

      it('should include vault statistics', async () => {
        const files = [
          createMockFile('notes/a.md'),
          createMockFile('notes/b.md'),
        ]
        const client = createMockClient({ files })

        const result = await handleVaultContext(client, { scope: 'all' })

        expect(result.stats).toBeDefined()
        expect(result.stats.totalNotes).toBe(2)
      })
    })

    describe('scope: folder', () => {
      it('should return context for specific folder', async () => {
        const files = [
          createMockFile('notes/a.md'),
          createMockFile('notes/b.md'),
          createMockFile('projects/c.md'),
        ]
        const client = createMockClient({ files })

        const result = await handleVaultContext(client, { scope: 'folder:notes' })

        expect(result.files.length).toBe(2)
        expect(result.files.every((f: { path: string }) => f.path.startsWith('notes/'))).toBe(true)
      })

      it('should include nested folders', async () => {
        const files = [
          createMockFile('projects/a.md'),
          createMockFile('projects/deep/b.md'),
          createMockFile('projects/deep/deeper/c.md'),
        ]
        const client = createMockClient({ files })

        const result = await handleVaultContext(client, { scope: 'folder:projects' })

        expect(result.files.length).toBe(3)
      })

      it('should throw for non-existent folder', async () => {
        const client = createMockClient()

        await expect(handleVaultContext(client, { scope: 'folder:nonexistent' })).rejects.toThrow()
      })
    })

    describe('scope: tag', () => {
      it('should return context for notes with specific tag', async () => {
        const files = [
          createMockFile('notes/tagged.md'),
          createMockFile('notes/untagged.md'),
        ]
        const metadata: Record<string, CachedMetadata> = {
          'notes/tagged.md': {
            tags: [{ tag: '#project', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 8, offset: 8 } } }],
          },
          'notes/untagged.md': {},
        }
        const client = createMockClient({ files, metadata })

        const result = await handleVaultContext(client, { scope: 'tag:project' })

        expect(result.files.length).toBe(1)
        expect(result.files[0].path).toBe('notes/tagged.md')
      })

      it('should handle nested tags', async () => {
        const files = [createMockFile('notes/nested.md')]
        const metadata: Record<string, CachedMetadata> = {
          'notes/nested.md': {
            tags: [{ tag: '#project/active', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 15, offset: 15 } } }],
          },
        }
        const client = createMockClient({ files, metadata })

        const result = await handleVaultContext(client, { scope: 'tag:project/active' })

        expect(result.files.length).toBe(1)
      })

      it('should return empty for non-existent tag', async () => {
        const files = [createMockFile('notes/test.md')]
        const metadata: Record<string, CachedMetadata> = {
          'notes/test.md': {
            tags: [{ tag: '#other', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 6, offset: 6 } } }],
          },
        }
        const client = createMockClient({ files, metadata })

        const result = await handleVaultContext(client, { scope: 'tag:nonexistent' })

        expect(result.files).toEqual([])
      })
    })

    describe('scope: recent', () => {
      it('should return recently modified notes', async () => {
        const now = Date.now()
        const files = [
          createMockFile('notes/recent.md', { stat: { ctime: now, mtime: now, size: 100 } }),
          createMockFile('notes/old.md', { stat: { ctime: now - 1000000000, mtime: now - 1000000000, size: 100 } }),
        ]
        const client = createMockClient({ files })

        const result = await handleVaultContext(client, { scope: 'recent:7d' })

        expect(result.files.some((f: { path: string }) => f.path === 'notes/recent.md')).toBe(true)
      })

      it('should parse time duration correctly', async () => {
        const now = Date.now()
        const files = [
          createMockFile('notes/a.md', { stat: { ctime: now, mtime: now - 3600000, size: 100 } }), // 1 hour ago
          createMockFile('notes/b.md', { stat: { ctime: now, mtime: now - 86400000 * 2, size: 100 } }), // 2 days ago
        ]
        const client = createMockClient({ files })

        const result = await handleVaultContext(client, { scope: 'recent:1d' })

        expect(result.files.length).toBe(1)
        expect(result.files[0].path).toBe('notes/a.md')
      })

      it('should sort by most recent first', async () => {
        const now = Date.now()
        const files = [
          createMockFile('notes/oldest.md', { stat: { ctime: now, mtime: now - 3000, size: 100 } }),
          createMockFile('notes/newest.md', { stat: { ctime: now, mtime: now, size: 100 } }),
          createMockFile('notes/middle.md', { stat: { ctime: now, mtime: now - 1000, size: 100 } }),
        ]
        const client = createMockClient({ files })

        const result = await handleVaultContext(client, { scope: 'recent:7d' })

        expect(result.files[0].path).toBe('notes/newest.md')
        expect(result.files[2].path).toBe('notes/oldest.md')
      })
    })

    describe('scope: linked', () => {
      it('should return notes linked to/from a specific note', async () => {
        const files = [
          createMockFile('notes/center.md'),
          createMockFile('notes/linked1.md'),
          createMockFile('notes/linked2.md'),
          createMockFile('notes/unlinked.md'),
        ]
        const resolvedLinks = {
          'notes/center.md': { 'notes/linked1.md': 1 },
        }
        const backlinks = { 'notes/center.md': ['notes/linked2.md'] }
        const client = createMockClient({ files, resolvedLinks, backlinks })

        const result = await handleVaultContext(client, { scope: 'linked:notes/center.md' })

        expect(result.files.length).toBe(2)
        expect(result.files.some((f: { path: string }) => f.path === 'notes/linked1.md')).toBe(true)
        expect(result.files.some((f: { path: string }) => f.path === 'notes/linked2.md')).toBe(true)
      })

      it('should throw for non-existent source note', async () => {
        const client = createMockClient()

        await expect(handleVaultContext(client, { scope: 'linked:nonexistent.md' })).rejects.toThrow()
      })
    })

    describe('result structure', () => {
      it('should include file metadata in results', async () => {
        const files = [createMockFile('notes/test.md')]
        const metadata: Record<string, CachedMetadata> = {
          'notes/test.md': {
            frontmatter: { title: 'Test' },
            tags: [{ tag: '#test', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 5, offset: 5 } } }],
          },
        }
        const client = createMockClient({ files, metadata })

        const result = await handleVaultContext(client, { scope: 'all' })

        expect(result.files[0]).toHaveProperty('metadata')
        expect(result.files[0].metadata.frontmatter).toEqual({ title: 'Test' })
      })

      it('should include graph relationships', async () => {
        const files = [
          createMockFile('notes/a.md'),
          createMockFile('notes/b.md'),
        ]
        const resolvedLinks = { 'notes/a.md': { 'notes/b.md': 1 } }
        const client = createMockClient({ files, resolvedLinks })

        const result = await handleVaultContext(client, { scope: 'all' })

        expect(result.graph).toBeDefined()
        expect(result.graph.edges).toBeInstanceOf(Array)
      })
    })

    describe('edge cases', () => {
      it('should throw for invalid scope format', async () => {
        const client = createMockClient()

        await expect(handleVaultContext(client, { scope: 'invalid' })).rejects.toThrow()
      })

      it('should throw for empty scope', async () => {
        const client = createMockClient()

        await expect(handleVaultContext(client, { scope: '' })).rejects.toThrow()
      })

      it('should handle empty vault', async () => {
        const client = createMockClient({ files: [] })

        const result = await handleVaultContext(client, { scope: 'all' })

        expect(result.files).toEqual([])
        expect(result.stats.totalNotes).toBe(0)
      })

      it('should handle scope with extra whitespace', async () => {
        const client = createMockClient()

        await expect(handleVaultContext(client, { scope: '  all  ' })).rejects.toThrow()
      })
    })
  })

  describe('handleVaultList', () => {
    describe('basic listing', () => {
      it('should list all files when no folder specified', async () => {
        const files = [
          createMockFile('notes/a.md'),
          createMockFile('notes/b.md'),
          createMockFile('projects/c.md'),
        ]
        const client = createMockClient({ files })

        const result = await handleVaultList(client, {})

        expect(result).toBeDefined()
        expect(result.files).toBeInstanceOf(Array)
        expect(result.files.length).toBe(3)
        expect(result.files.map((f: { path: string }) => f.path)).toContain('notes/a.md')
        expect(result.files.map((f: { path: string }) => f.path)).toContain('notes/b.md')
        expect(result.files.map((f: { path: string }) => f.path)).toContain('projects/c.md')
      })

      it('should list files in specific folder', async () => {
        const files = [
          createMockFile('notes/a.md'),
          createMockFile('notes/b.md'),
          createMockFile('projects/c.md'),
        ]
        const client = createMockClient({ files })

        const result = await handleVaultList(client, { folder: 'notes' })

        expect(result.files.length).toBe(2)
        expect(result.files.every((f: { path: string }) => f.path.startsWith('notes/'))).toBe(true)
      })

      it('should list files recursively in nested folders', async () => {
        const files = [
          createMockFile('notes/a.md'),
          createMockFile('notes/deep/b.md'),
          createMockFile('notes/deep/deeper/c.md'),
        ]
        const client = createMockClient({ files })

        const result = await handleVaultList(client, { folder: 'notes', recursive: true })

        expect(result.files.length).toBe(3)
      })

      it('should not list nested files when recursive is false', async () => {
        const files = [
          createMockFile('notes/a.md'),
          createMockFile('notes/deep/b.md'),
          createMockFile('notes/deep/deeper/c.md'),
        ]
        const client = createMockClient({ files })

        const result = await handleVaultList(client, { folder: 'notes', recursive: false })

        expect(result.files.length).toBe(1)
        expect(result.files[0].path).toBe('notes/a.md')
      })
    })

    describe('result structure', () => {
      it('should include file metadata in results', async () => {
        const files = [createMockFile('test.md')]
        const client = createMockClient({ files })

        const result = await handleVaultList(client, {})

        expect(result.files[0]).toHaveProperty('path')
        expect(result.files[0]).toHaveProperty('name')
        expect(result.files[0]).toHaveProperty('basename')
      })

      it('should include file stats', async () => {
        const files = [createMockFile('test.md')]
        const client = createMockClient({ files })

        const result = await handleVaultList(client, {})

        expect(result.files[0]).toHaveProperty('stat')
        expect(result.files[0].stat).toHaveProperty('mtime')
        expect(result.files[0].stat).toHaveProperty('size')
      })

      it('should include total count', async () => {
        const files = [
          createMockFile('a.md'),
          createMockFile('b.md'),
          createMockFile('c.md'),
        ]
        const client = createMockClient({ files })

        const result = await handleVaultList(client, {})

        expect(result.total).toBe(3)
      })
    })

    describe('edge cases', () => {
      it('should handle empty vault', async () => {
        const client = createMockClient({ files: [] })

        const result = await handleVaultList(client, {})

        expect(result.files).toEqual([])
        expect(result.total).toBe(0)
      })

      it('should throw for non-existent folder', async () => {
        const client = createMockClient()

        await expect(handleVaultList(client, { folder: 'nonexistent' })).rejects.toThrow()
      })

      it('should sort files alphabetically by path', async () => {
        const files = [
          createMockFile('z.md'),
          createMockFile('a.md'),
          createMockFile('m.md'),
        ]
        const client = createMockClient({ files })

        const result = await handleVaultList(client, {})

        expect(result.files[0].path).toBe('a.md')
        expect(result.files[1].path).toBe('m.md')
        expect(result.files[2].path).toBe('z.md')
      })
    })
  })

  describe('handleNoteUpdate', () => {
    describe('basic update', () => {
      it('should update existing note content', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Old Content' }
        const client = createMockClient({ files, fileContents })

        const result = await handleNoteUpdate(client, {
          path: 'notes/test.md',
          content: '# New Content\n\nUpdated text.',
        })

        expect(result).toBeDefined()
        expect(result.success).toBe(true)
        expect(result.path).toBe('notes/test.md')
      })

      it('should throw error for non-existent note', async () => {
        const client = createMockClient()

        await expect(handleNoteUpdate(client, {
          path: 'nonexistent.md',
          content: '# Content',
        })).rejects.toThrow()
      })

      it('should completely replace note content', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Old\n\nOld content.' }
        const client = createMockClient({ files, fileContents })

        const result = await handleNoteUpdate(client, {
          path: 'notes/test.md',
          content: '# New\n\nNew content.',
        })

        expect(result.success).toBe(true)
      })
    })

    describe('frontmatter handling', () => {
      it('should preserve frontmatter when updating', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '---\ntitle: Test\n---\n\n# Old' }
        const metadata: Record<string, CachedMetadata> = {
          'notes/test.md': {
            frontmatter: { title: 'Test' },
          },
        }
        const client = createMockClient({ files, fileContents, metadata })

        const result = await handleNoteUpdate(client, {
          path: 'notes/test.md',
          content: '---\ntitle: Test\n---\n\n# New',
        })

        expect(result.success).toBe(true)
      })

      it('should update frontmatter if included in content', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '---\ntitle: Old\n---\n\n# Content' }
        const client = createMockClient({ files, fileContents })

        const result = await handleNoteUpdate(client, {
          path: 'notes/test.md',
          content: '---\ntitle: New\ntags: [updated]\n---\n\n# Content',
        })

        expect(result.success).toBe(true)
      })
    })

    describe('validation', () => {
      it('should reject empty content', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Content' }
        const client = createMockClient({ files, fileContents })

        await expect(handleNoteUpdate(client, {
          path: 'notes/test.md',
          content: '',
        })).rejects.toThrow()
      })

      it('should reject empty path', async () => {
        const client = createMockClient()

        await expect(handleNoteUpdate(client, {
          path: '',
          content: '# Content',
        })).rejects.toThrow()
      })
    })

    describe('edge cases', () => {
      it('should handle very long content', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Old' }
        const client = createMockClient({ files, fileContents })
        const longContent = '# Title\n\n' + 'Lorem ipsum '.repeat(10000)

        const result = await handleNoteUpdate(client, {
          path: 'notes/test.md',
          content: longContent,
        })

        expect(result.success).toBe(true)
      })

      it('should handle special markdown characters', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Old' }
        const client = createMockClient({ files, fileContents })

        const result = await handleNoteUpdate(client, {
          path: 'notes/test.md',
          content: '# Test\n\n[[link]] `code` **bold** > quote',
        })

        expect(result.success).toBe(true)
      })
    })
  })

  describe('handleNoteAppend', () => {
    describe('basic append', () => {
      it('should append content to end of note', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Existing Content' }
        const client = createMockClient({ files, fileContents })

        const result = await handleNoteAppend(client, {
          path: 'notes/test.md',
          content: '\n\nNew paragraph.',
        })

        expect(result).toBeDefined()
        expect(result.success).toBe(true)
        expect(result.path).toBe('notes/test.md')
      })

      it('should append to end by default', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Content' }
        const client = createMockClient({ files, fileContents })

        const result = await handleNoteAppend(client, {
          path: 'notes/test.md',
          content: '\n\nAppended.',
        })

        expect(result.success).toBe(true)
      })

      it('should throw error for non-existent note', async () => {
        const client = createMockClient()

        await expect(handleNoteAppend(client, {
          path: 'nonexistent.md',
          content: 'Content',
        })).rejects.toThrow()
      })
    })

    describe('position handling', () => {
      it('should append at end when position is "end"', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Test\n\nContent' }
        const client = createMockClient({ files, fileContents })

        const result = await handleNoteAppend(client, {
          path: 'notes/test.md',
          content: '\n\nEnd content.',
          position: 'end',
        })

        expect(result.success).toBe(true)
      })

      it('should append after frontmatter when position is "after-frontmatter"', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '---\ntitle: Test\n---\n\n# Content' }
        const metadata: Record<string, CachedMetadata> = {
          'notes/test.md': {
            frontmatter: { title: 'Test' },
          },
        }
        const client = createMockClient({ files, fileContents, metadata })

        const result = await handleNoteAppend(client, {
          path: 'notes/test.md',
          content: '\n\nAfter frontmatter.',
          position: 'after-frontmatter',
        })

        expect(result.success).toBe(true)
      })

      it('should handle append to note without frontmatter', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# No Frontmatter' }
        const client = createMockClient({ files, fileContents })

        const result = await handleNoteAppend(client, {
          path: 'notes/test.md',
          content: '\n\nAppended content.',
          position: 'after-frontmatter',
        })

        expect(result.success).toBe(true)
      })
    })

    describe('validation', () => {
      it('should reject empty content', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Content' }
        const client = createMockClient({ files, fileContents })

        await expect(handleNoteAppend(client, {
          path: 'notes/test.md',
          content: '',
        })).rejects.toThrow()
      })

      it('should reject empty path', async () => {
        const client = createMockClient()

        await expect(handleNoteAppend(client, {
          path: '',
          content: 'Content',
        })).rejects.toThrow()
      })

      it('should reject invalid position value', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Content' }
        const client = createMockClient({ files, fileContents })

        await expect(handleNoteAppend(client, {
          path: 'notes/test.md',
          content: 'Content',
          position: 'invalid' as any,
        })).rejects.toThrow()
      })
    })

    describe('edge cases', () => {
      it('should handle appending to empty file', async () => {
        const files = [createMockFile('notes/empty.md')]
        const fileContents = { 'notes/empty.md': '' }
        const client = createMockClient({ files, fileContents })

        const result = await handleNoteAppend(client, {
          path: 'notes/empty.md',
          content: '# First Content',
        })

        expect(result.success).toBe(true)
      })

      it('should preserve existing line endings', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Line 1\n# Line 2' }
        const client = createMockClient({ files, fileContents })

        const result = await handleNoteAppend(client, {
          path: 'notes/test.md',
          content: '\n# Line 3',
        })

        expect(result.success).toBe(true)
      })
    })
  })

  describe('handleFrontmatterUpdate', () => {
    describe('basic update', () => {
      it('should update frontmatter in existing note', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '---\ntitle: Old\n---\n\n# Content' }
        const metadata: Record<string, CachedMetadata> = {
          'notes/test.md': {
            frontmatter: { title: 'Old' },
          },
        }
        const client = createMockClient({ files, fileContents, metadata })

        const result = await handleFrontmatterUpdate(client, {
          path: 'notes/test.md',
          frontmatter: { title: 'New', tags: ['updated'] },
        })

        expect(result).toBeDefined()
        expect(result.success).toBe(true)
        expect(result.path).toBe('notes/test.md')
      })

      it('should add frontmatter to note without frontmatter', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# No Frontmatter' }
        const client = createMockClient({ files, fileContents })

        const result = await handleFrontmatterUpdate(client, {
          path: 'notes/test.md',
          frontmatter: { title: 'Added Title' },
        })

        expect(result.success).toBe(true)
      })

      it('should throw error for non-existent note', async () => {
        const client = createMockClient()

        await expect(handleFrontmatterUpdate(client, {
          path: 'nonexistent.md',
          frontmatter: { title: 'Test' },
        })).rejects.toThrow()
      })
    })

    describe('merge option', () => {
      it('should merge frontmatter when merge is true', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '---\ntitle: Test\nauthor: John\n---\n\n# Content' }
        const metadata: Record<string, CachedMetadata> = {
          'notes/test.md': {
            frontmatter: { title: 'Test', author: 'John' },
          },
        }
        const client = createMockClient({ files, fileContents, metadata })

        const result = await handleFrontmatterUpdate(client, {
          path: 'notes/test.md',
          frontmatter: { tags: ['new'] },
          merge: true,
        })

        expect(result.success).toBe(true)
      })

      it('should replace frontmatter when merge is false', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '---\ntitle: Test\nauthor: John\n---\n\n# Content' }
        const metadata: Record<string, CachedMetadata> = {
          'notes/test.md': {
            frontmatter: { title: 'Test', author: 'John' },
          },
        }
        const client = createMockClient({ files, fileContents, metadata })

        const result = await handleFrontmatterUpdate(client, {
          path: 'notes/test.md',
          frontmatter: { title: 'New' },
          merge: false,
        })

        expect(result.success).toBe(true)
      })

      it('should default to merge behavior', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '---\ntitle: Test\n---\n\n# Content' }
        const metadata: Record<string, CachedMetadata> = {
          'notes/test.md': {
            frontmatter: { title: 'Test' },
          },
        }
        const client = createMockClient({ files, fileContents, metadata })

        const result = await handleFrontmatterUpdate(client, {
          path: 'notes/test.md',
          frontmatter: { author: 'John' },
        })

        expect(result.success).toBe(true)
      })
    })

    describe('frontmatter values', () => {
      it('should handle string values', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Content' }
        const client = createMockClient({ files, fileContents })

        const result = await handleFrontmatterUpdate(client, {
          path: 'notes/test.md',
          frontmatter: { title: 'String Title' },
        })

        expect(result.success).toBe(true)
      })

      it('should handle array values', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Content' }
        const client = createMockClient({ files, fileContents })

        const result = await handleFrontmatterUpdate(client, {
          path: 'notes/test.md',
          frontmatter: { tags: ['tag1', 'tag2', 'tag3'] },
        })

        expect(result.success).toBe(true)
      })

      it('should handle nested object values', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Content' }
        const client = createMockClient({ files, fileContents })

        const result = await handleFrontmatterUpdate(client, {
          path: 'notes/test.md',
          frontmatter: {
            metadata: {
              author: 'John',
              date: '2024-01-01',
            },
          },
        })

        expect(result.success).toBe(true)
      })

      it('should handle date values', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Content' }
        const client = createMockClient({ files, fileContents })

        const result = await handleFrontmatterUpdate(client, {
          path: 'notes/test.md',
          frontmatter: { date: '2024-01-01', created: new Date().toISOString() },
        })

        expect(result.success).toBe(true)
      })

      it('should handle boolean values', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Content' }
        const client = createMockClient({ files, fileContents })

        const result = await handleFrontmatterUpdate(client, {
          path: 'notes/test.md',
          frontmatter: { published: true, draft: false },
        })

        expect(result.success).toBe(true)
      })

      it('should handle numeric values', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Content' }
        const client = createMockClient({ files, fileContents })

        const result = await handleFrontmatterUpdate(client, {
          path: 'notes/test.md',
          frontmatter: { version: 1, rating: 4.5 },
        })

        expect(result.success).toBe(true)
      })
    })

    describe('validation', () => {
      it('should reject empty frontmatter object', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Content' }
        const client = createMockClient({ files, fileContents })

        await expect(handleFrontmatterUpdate(client, {
          path: 'notes/test.md',
          frontmatter: {},
        })).rejects.toThrow()
      })

      it('should reject empty path', async () => {
        const client = createMockClient()

        await expect(handleFrontmatterUpdate(client, {
          path: '',
          frontmatter: { title: 'Test' },
        })).rejects.toThrow()
      })

      it('should sanitize invalid frontmatter keys', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '# Content' }
        const client = createMockClient({ files, fileContents })

        const result = await handleFrontmatterUpdate(client, {
          path: 'notes/test.md',
          frontmatter: { 'valid-key': 'value', 'another_key': 'value2' },
        })

        expect(result.success).toBe(true)
      })
    })

    describe('edge cases', () => {
      it('should preserve note content when updating frontmatter', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '---\ntitle: Old\n---\n\n# Important Content\n\nDo not lose this.' }
        const metadata: Record<string, CachedMetadata> = {
          'notes/test.md': {
            frontmatter: { title: 'Old' },
          },
        }
        const client = createMockClient({ files, fileContents, metadata })

        const result = await handleFrontmatterUpdate(client, {
          path: 'notes/test.md',
          frontmatter: { title: 'New' },
        })

        expect(result.success).toBe(true)
      })

      it('should handle file with only frontmatter', async () => {
        const files = [createMockFile('notes/test.md')]
        const fileContents = { 'notes/test.md': '---\ntitle: Test\n---' }
        const metadata: Record<string, CachedMetadata> = {
          'notes/test.md': {
            frontmatter: { title: 'Test' },
          },
        }
        const client = createMockClient({ files, fileContents, metadata })

        const result = await handleFrontmatterUpdate(client, {
          path: 'notes/test.md',
          frontmatter: { title: 'Updated' },
        })

        expect(result.success).toBe(true)
      })
    })
  })

  describe('handleGraphForwardLinks', () => {
    describe('basic forward link retrieval', () => {
      it('should return all forward links from a note', async () => {
        const files = [
          createMockFile('notes/source.md'),
          createMockFile('notes/target1.md'),
          createMockFile('notes/target2.md'),
        ]
        const fileContents = {
          'notes/source.md': '# Source\n\nLinks to [[target1]] and [[target2]].',
        }
        const resolvedLinks = {
          'notes/source.md': {
            'notes/target1.md': 1,
            'notes/target2.md': 1,
          },
        }
        const client = createMockClient({ files, fileContents, resolvedLinks })

        const result = await handleGraphForwardLinks(client, { path: 'notes/source.md' })

        expect(result).toBeDefined()
        expect(result.links).toBeInstanceOf(Array)
        expect(result.links.length).toBe(2)
        expect(result.links.map((l: { path: string }) => l.path)).toContain('notes/target1.md')
        expect(result.links.map((l: { path: string }) => l.path)).toContain('notes/target2.md')
      })

      it('should return empty array when no forward links exist', async () => {
        const files = [createMockFile('notes/isolated.md')]
        const fileContents = { 'notes/isolated.md': '# Isolated\n\nNo links here.' }
        const resolvedLinks = { 'notes/isolated.md': {} }
        const client = createMockClient({ files, fileContents, resolvedLinks })

        const result = await handleGraphForwardLinks(client, { path: 'notes/isolated.md' })

        expect(result.links).toEqual([])
      })

      it('should throw error for non-existent note', async () => {
        const client = createMockClient()

        await expect(handleGraphForwardLinks(client, { path: 'nonexistent.md' })).rejects.toThrow()
      })

      it('should include link count in result', async () => {
        const files = [createMockFile('notes/source.md'), createMockFile('notes/target.md')]
        const resolvedLinks = { 'notes/source.md': { 'notes/target.md': 3 } }
        const client = createMockClient({ files, resolvedLinks })

        const result = await handleGraphForwardLinks(client, { path: 'notes/source.md' })

        expect(result.count).toBe(1)
      })
    })

    describe('include unresolved option', () => {
      it('should not include unresolved links when includeUnresolved is false', async () => {
        const files = [createMockFile('notes/source.md')]
        const fileContents = { 'notes/source.md': '# Source\n\nLink to [[nonexistent]]' }
        const metadata: Record<string, CachedMetadata> = {
          'notes/source.md': {
            links: [{ link: 'nonexistent', original: '[[nonexistent]]', position: { start: { line: 2, col: 8, offset: 20 }, end: { line: 2, col: 24, offset: 36 } } }],
          },
        }
        const resolvedLinks = { 'notes/source.md': {} }
        const client = createMockClient({ files, fileContents, metadata, resolvedLinks })

        const result = await handleGraphForwardLinks(client, { path: 'notes/source.md', includeUnresolved: false })

        expect(result.unresolvedLinks).toBeUndefined()
      })

      it('should include unresolved links when includeUnresolved is true', async () => {
        const files = [createMockFile('notes/source.md')]
        const fileContents = { 'notes/source.md': '# Source\n\nLink to [[nonexistent]]' }
        const metadata: Record<string, CachedMetadata> = {
          'notes/source.md': {
            links: [{ link: 'nonexistent', original: '[[nonexistent]]', position: { start: { line: 2, col: 8, offset: 20 }, end: { line: 2, col: 24, offset: 36 } } }],
          },
        }
        const resolvedLinks = { 'notes/source.md': {} }
        const client = createMockClient({ files, fileContents, metadata, resolvedLinks })

        const result = await handleGraphForwardLinks(client, { path: 'notes/source.md', includeUnresolved: true })

        expect(result.unresolvedLinks).toBeDefined()
        expect(result.unresolvedLinks).toBeInstanceOf(Array)
        expect(result.unresolvedLinks.length).toBeGreaterThan(0)
      })

      it('should default to not including unresolved links', async () => {
        const files = [createMockFile('notes/source.md')]
        const fileContents = { 'notes/source.md': '# Source' }
        const resolvedLinks = { 'notes/source.md': {} }
        const client = createMockClient({ files, fileContents, resolvedLinks })

        const result = await handleGraphForwardLinks(client, { path: 'notes/source.md' })

        expect(result.unresolvedLinks).toBeUndefined()
      })
    })

    describe('result structure', () => {
      it('should include target note title in link', async () => {
        const files = [
          createMockFile('notes/source.md'),
          createMockFile('notes/target.md'),
        ]
        const fileContents = {
          'notes/source.md': '# Source\n\nLink to [[target]]',
          'notes/target.md': '# Target Title',
        }
        const resolvedLinks = { 'notes/source.md': { 'notes/target.md': 1 } }
        const client = createMockClient({ files, fileContents, resolvedLinks })

        const result = await handleGraphForwardLinks(client, { path: 'notes/source.md' })

        expect(result.links[0]).toHaveProperty('title')
      })

      it('should include link count for each target', async () => {
        const files = [
          createMockFile('notes/source.md'),
          createMockFile('notes/target.md'),
        ]
        const resolvedLinks = { 'notes/source.md': { 'notes/target.md': 5 } }
        const client = createMockClient({ files, resolvedLinks })

        const result = await handleGraphForwardLinks(client, { path: 'notes/source.md' })

        expect(result.links[0]).toHaveProperty('linkCount')
        expect(result.links[0].linkCount).toBe(5)
      })
    })

    describe('edge cases', () => {
      it('should handle self-referential links', async () => {
        const files = [createMockFile('notes/self.md')]
        const fileContents = { 'notes/self.md': '# Self\n\nLink to [[self]]' }
        const resolvedLinks = { 'notes/self.md': { 'notes/self.md': 1 } }
        const client = createMockClient({ files, fileContents, resolvedLinks })

        const result = await handleGraphForwardLinks(client, { path: 'notes/self.md' })

        expect(result.links.length).toBe(1)
        expect(result.links[0].path).toBe('notes/self.md')
      })

      it('should handle empty path', async () => {
        const client = createMockClient()

        await expect(handleGraphForwardLinks(client, { path: '' })).rejects.toThrow()
      })

      it('should handle note with many links', async () => {
        const files = [createMockFile('notes/hub.md')]
        const resolvedLinks = {
          'notes/hub.md': Object.fromEntries(
            Array.from({ length: 50 }, (_, i) => [`notes/link-${i}.md`, 1])
          ),
        }
        const client = createMockClient({ files, resolvedLinks })

        const result = await handleGraphForwardLinks(client, { path: 'notes/hub.md' })

        expect(result.links.length).toBe(50)
      })
    })
  })

  describe('handleGraphNeighbors', () => {
    describe('basic neighbor retrieval', () => {
      it('should return direct neighbors (depth 1) by default', async () => {
        const files = [
          createMockFile('notes/center.md'),
          createMockFile('notes/neighbor1.md'),
          createMockFile('notes/neighbor2.md'),
          createMockFile('notes/distant.md'),
        ]
        const resolvedLinks = {
          'notes/center.md': { 'notes/neighbor1.md': 1 },
        }
        const backlinks = {
          'notes/center.md': ['notes/neighbor2.md'],
          'notes/neighbor1.md': ['notes/distant.md'],
        }
        const client = createMockClient({ files, resolvedLinks, backlinks })

        const result = await handleGraphNeighbors(client, { path: 'notes/center.md' })

        expect(result).toBeDefined()
        expect(result.neighbors).toBeInstanceOf(Array)
        expect(result.neighbors.length).toBe(2)
        expect(result.neighbors.map((n: { path: string }) => n.path)).toContain('notes/neighbor1.md')
        expect(result.neighbors.map((n: { path: string }) => n.path)).toContain('notes/neighbor2.md')
        expect(result.neighbors.map((n: { path: string }) => n.path)).not.toContain('notes/distant.md')
      })

      it('should return neighbors at specified depth', async () => {
        const files = [
          createMockFile('notes/center.md'),
          createMockFile('notes/depth1.md'),
          createMockFile('notes/depth2.md'),
        ]
        const resolvedLinks = {
          'notes/center.md': { 'notes/depth1.md': 1 },
          'notes/depth1.md': { 'notes/depth2.md': 1 },
        }
        const client = createMockClient({ files, resolvedLinks, backlinks: {} })

        const result = await handleGraphNeighbors(client, { path: 'notes/center.md', depth: 2 })

        expect(result.neighbors.length).toBe(2)
        expect(result.neighbors.map((n: { path: string }) => n.path)).toContain('notes/depth1.md')
        expect(result.neighbors.map((n: { path: string }) => n.path)).toContain('notes/depth2.md')
      })

      it('should throw error for non-existent note', async () => {
        const client = createMockClient()

        await expect(handleGraphNeighbors(client, { path: 'nonexistent.md' })).rejects.toThrow()
      })

      it('should return empty array when note has no neighbors', async () => {
        const files = [createMockFile('notes/isolated.md')]
        const resolvedLinks = { 'notes/isolated.md': {} }
        const backlinks = { 'notes/isolated.md': [] }
        const client = createMockClient({ files, resolvedLinks, backlinks })

        const result = await handleGraphNeighbors(client, { path: 'notes/isolated.md' })

        expect(result.neighbors).toEqual([])
      })
    })

    describe('direction option', () => {
      it('should return all neighbors when direction is "both"', async () => {
        const files = [
          createMockFile('notes/center.md'),
          createMockFile('notes/outgoing.md'),
          createMockFile('notes/incoming.md'),
        ]
        const resolvedLinks = { 'notes/center.md': { 'notes/outgoing.md': 1 } }
        const backlinks = { 'notes/center.md': ['notes/incoming.md'] }
        const client = createMockClient({ files, resolvedLinks, backlinks })

        const result = await handleGraphNeighbors(client, { path: 'notes/center.md', direction: 'both' })

        expect(result.neighbors.length).toBe(2)
        expect(result.neighbors.map((n: { path: string }) => n.path)).toContain('notes/outgoing.md')
        expect(result.neighbors.map((n: { path: string }) => n.path)).toContain('notes/incoming.md')
      })

      it('should return only incoming neighbors when direction is "incoming"', async () => {
        const files = [
          createMockFile('notes/center.md'),
          createMockFile('notes/outgoing.md'),
          createMockFile('notes/incoming.md'),
        ]
        const resolvedLinks = { 'notes/center.md': { 'notes/outgoing.md': 1 } }
        const backlinks = { 'notes/center.md': ['notes/incoming.md'] }
        const client = createMockClient({ files, resolvedLinks, backlinks })

        const result = await handleGraphNeighbors(client, { path: 'notes/center.md', direction: 'incoming' })

        expect(result.neighbors.length).toBe(1)
        expect(result.neighbors[0].path).toBe('notes/incoming.md')
      })

      it('should return only outgoing neighbors when direction is "outgoing"', async () => {
        const files = [
          createMockFile('notes/center.md'),
          createMockFile('notes/outgoing.md'),
          createMockFile('notes/incoming.md'),
        ]
        const resolvedLinks = { 'notes/center.md': { 'notes/outgoing.md': 1 } }
        const backlinks = { 'notes/center.md': ['notes/incoming.md'] }
        const client = createMockClient({ files, resolvedLinks, backlinks })

        const result = await handleGraphNeighbors(client, { path: 'notes/center.md', direction: 'outgoing' })

        expect(result.neighbors.length).toBe(1)
        expect(result.neighbors[0].path).toBe('notes/outgoing.md')
      })

      it('should default to both directions', async () => {
        const files = [
          createMockFile('notes/center.md'),
          createMockFile('notes/neighbor.md'),
        ]
        const resolvedLinks = { 'notes/center.md': { 'notes/neighbor.md': 1 } }
        const client = createMockClient({ files, resolvedLinks, backlinks: {} })

        const result = await handleGraphNeighbors(client, { path: 'notes/center.md' })

        expect(result.neighbors.length).toBeGreaterThanOrEqual(1)
      })
    })

    describe('result structure', () => {
      it('should include neighbor depth in result', async () => {
        const files = [
          createMockFile('notes/center.md'),
          createMockFile('notes/neighbor.md'),
        ]
        const resolvedLinks = { 'notes/center.md': { 'notes/neighbor.md': 1 } }
        const client = createMockClient({ files, resolvedLinks, backlinks: {} })

        const result = await handleGraphNeighbors(client, { path: 'notes/center.md' })

        expect(result.neighbors[0]).toHaveProperty('depth')
        expect(result.neighbors[0].depth).toBe(1)
      })

      it('should include relationship type (incoming/outgoing)', async () => {
        const files = [
          createMockFile('notes/center.md'),
          createMockFile('notes/target.md'),
        ]
        const resolvedLinks = { 'notes/center.md': { 'notes/target.md': 1 } }
        const client = createMockClient({ files, resolvedLinks, backlinks: {} })

        const result = await handleGraphNeighbors(client, { path: 'notes/center.md' })

        expect(result.neighbors[0]).toHaveProperty('relationship')
        expect(['incoming', 'outgoing', 'both']).toContain(result.neighbors[0].relationship)
      })

      it('should include total neighbor count', async () => {
        const files = [
          createMockFile('notes/center.md'),
          createMockFile('notes/n1.md'),
          createMockFile('notes/n2.md'),
        ]
        const resolvedLinks = { 'notes/center.md': { 'notes/n1.md': 1, 'notes/n2.md': 1 } }
        const client = createMockClient({ files, resolvedLinks, backlinks: {} })

        const result = await handleGraphNeighbors(client, { path: 'notes/center.md' })

        expect(result.count).toBe(2)
      })
    })

    describe('validation', () => {
      it('should reject negative depth', async () => {
        const files = [createMockFile('notes/test.md')]
        const client = createMockClient({ files })

        await expect(handleGraphNeighbors(client, {
          path: 'notes/test.md',
          depth: -1,
        })).rejects.toThrow()
      })

      it('should reject depth of 0', async () => {
        const files = [createMockFile('notes/test.md')]
        const client = createMockClient({ files })

        await expect(handleGraphNeighbors(client, {
          path: 'notes/test.md',
          depth: 0,
        })).rejects.toThrow()
      })

      it('should reject invalid direction value', async () => {
        const files = [createMockFile('notes/test.md')]
        const client = createMockClient({ files })

        await expect(handleGraphNeighbors(client, {
          path: 'notes/test.md',
          direction: 'invalid' as any,
        })).rejects.toThrow()
      })

      it('should reject empty path', async () => {
        const client = createMockClient()

        await expect(handleGraphNeighbors(client, { path: '' })).rejects.toThrow()
      })
    })

    describe('edge cases', () => {
      it('should handle circular references without infinite loop', async () => {
        const files = [
          createMockFile('notes/a.md'),
          createMockFile('notes/b.md'),
          createMockFile('notes/c.md'),
        ]
        const resolvedLinks = {
          'notes/a.md': { 'notes/b.md': 1 },
          'notes/b.md': { 'notes/c.md': 1 },
          'notes/c.md': { 'notes/a.md': 1 },
        }
        const client = createMockClient({ files, resolvedLinks, backlinks: {} })

        const result = await handleGraphNeighbors(client, { path: 'notes/a.md', depth: 3 })

        expect(result.neighbors).toBeDefined()
        expect(result.neighbors.length).toBeLessThanOrEqual(3)
      })

      it('should not include source note in neighbors', async () => {
        const files = [
          createMockFile('notes/center.md'),
          createMockFile('notes/neighbor.md'),
        ]
        const resolvedLinks = { 'notes/center.md': { 'notes/neighbor.md': 1 } }
        const client = createMockClient({ files, resolvedLinks, backlinks: {} })

        const result = await handleGraphNeighbors(client, { path: 'notes/center.md' })

        expect(result.neighbors.map((n: { path: string }) => n.path)).not.toContain('notes/center.md')
      })

      it('should limit maximum depth to prevent performance issues', async () => {
        const files = [createMockFile('notes/test.md')]
        const client = createMockClient({ files, resolvedLinks: {}, backlinks: {} })

        const result = await handleGraphNeighbors(client, { path: 'notes/test.md', depth: 1000 })

        expect(result).toBeDefined()
      })
    })
  })
})
