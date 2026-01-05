import { describe, it, expect, beforeEach } from 'vitest'
import { MetadataCache } from '../../src/metadata/cache.js'
import { Vault } from '../../src/vault/vault.js'
import { MemoryBackend } from '../../src/vault/memory-backend.js'
import type { TFile, CachedMetadata, LinkCache, TagCache, HeadingCache } from '../../src/types.js'

describe('MetadataCache Core', () => {
  let backend: MemoryBackend
  let vault: Vault
  let cache: MetadataCache

  beforeEach(async () => {
    backend = new MemoryBackend()
    vault = new Vault(backend)
    cache = new MetadataCache(vault)
  })

  describe('getFileCache', () => {
    describe('basic functionality', () => {
      it('should return null for non-existent file', async () => {
        const fakeFile: TFile = {
          path: 'nonexistent.md',
          name: 'nonexistent.md',
          basename: 'nonexistent',
          extension: 'md',
          stat: { ctime: 0, mtime: 0, size: 0 }
        }

        const result = cache.getFileCache(fakeFile)
        expect(result).toBeNull()
      })

      it('should return cached metadata for existing file', async () => {
        await backend.write('test.md', '# Test File\n\nSome content')
        await cache.initialize()

        const file = vault.getFileByPath('test.md')
        expect(file).not.toBeNull()

        const metadata = cache.getFileCache(file!)
        expect(metadata).not.toBeNull()
        expect(metadata).toHaveProperty('headings')
      })

      it('should return null before cache is initialized', async () => {
        await backend.write('test.md', '# Test File')

        const file = vault.getFileByPath('test.md')
        expect(file).not.toBeNull()

        const metadata = cache.getFileCache(file!)
        expect(metadata).toBeNull()
      })

      it('should return cached metadata with correct structure', async () => {
        await backend.write('complete.md', `---
title: Complete Test
tags: [test, example]
---

# Main Heading

Content with [[link]] and #tag

## Sub Heading

More content ^block1
`)
        await cache.initialize()

        const file = vault.getFileByPath('complete.md')
        const metadata = cache.getFileCache(file!)

        expect(metadata).toMatchObject({
          links: expect.any(Array),
          tags: expect.any(Array),
          headings: expect.any(Array),
          frontmatter: expect.any(Object)
        })
      })
    })

    describe('caching behavior', () => {
      it('should return the same object reference for repeated calls', async () => {
        await backend.write('test.md', '# Test')
        await cache.initialize()

        const file = vault.getFileByPath('test.md')!
        const metadata1 = cache.getFileCache(file)
        const metadata2 = cache.getFileCache(file)

        expect(metadata1).toBe(metadata2)
      })

      it('should update cache when file is re-indexed', async () => {
        await backend.write('test.md', '# Original Heading')
        await cache.initialize()

        const file = vault.getFileByPath('test.md')!
        const originalMetadata = cache.getFileCache(file)

        // Modify file content
        await backend.write('test.md', '# Modified Heading\n\n## New Subheading')
        await cache.indexFile(file)

        const updatedMetadata = cache.getFileCache(file)

        expect(updatedMetadata).not.toBe(originalMetadata)
        expect(updatedMetadata?.headings).toHaveLength(2)
      })
    })
  })

  describe('getCache', () => {
    describe('basic functionality', () => {
      it('should return null for non-existent path', async () => {
        await cache.initialize()
        const result = cache.getCache('nonexistent.md')
        expect(result).toBeNull()
      })

      it('should return cached metadata by path string', async () => {
        await backend.write('notes/test.md', '# Test\n\n[[link]]')
        await cache.initialize()

        const metadata = cache.getCache('notes/test.md')

        expect(metadata).not.toBeNull()
        expect(metadata?.links).toBeDefined()
      })

      it('should return same metadata as getFileCache for same file', async () => {
        await backend.write('test.md', '# Test File')
        await cache.initialize()

        const file = vault.getFileByPath('test.md')!
        const metadataByFile = cache.getFileCache(file)
        const metadataByPath = cache.getCache('test.md')

        expect(metadataByFile).toBe(metadataByPath)
      })

      it('should handle paths with spaces', async () => {
        await backend.write('notes/my file.md', '# My File')
        await cache.initialize()

        const metadata = cache.getCache('notes/my file.md')
        expect(metadata).not.toBeNull()
      })

      it('should handle deeply nested paths', async () => {
        await backend.write('a/b/c/d/deep.md', '# Deep File')
        await cache.initialize()

        const metadata = cache.getCache('a/b/c/d/deep.md')
        expect(metadata).not.toBeNull()
      })
    })

    describe('edge cases', () => {
      it('should return null for empty string path', async () => {
        await cache.initialize()
        const result = cache.getCache('')
        expect(result).toBeNull()
      })

      it('should return null for folder path', async () => {
        await backend.write('folder/file.md', '# File')
        await cache.initialize()

        const result = cache.getCache('folder')
        expect(result).toBeNull()
      })

      it('should handle paths without extension', async () => {
        await backend.write('notes/readme', 'Plain text content')
        await cache.initialize()

        // Non-markdown files may or may not be indexed
        const result = cache.getCache('notes/readme')
        // Implementation may return null or metadata depending on policy
        expect(result === null || typeof result === 'object').toBe(true)
      })
    })
  })

  describe('resolvedLinks', () => {
    describe('basic tracking', () => {
      it('should be an empty object before initialization', () => {
        expect(cache.resolvedLinks).toEqual({})
      })

      it('should track links between files after initialization', async () => {
        await backend.write('a.md', 'Link to [[b]]')
        await backend.write('b.md', '# B File')
        await cache.initialize()

        expect(cache.resolvedLinks['a.md']).toBeDefined()
        expect(cache.resolvedLinks['a.md']['b.md']).toBe(1)
      })

      it('should count multiple links to same file', async () => {
        await backend.write('a.md', 'Link to [[b]] and again [[b]] and [[b]]')
        await backend.write('b.md', '# B File')
        await cache.initialize()

        expect(cache.resolvedLinks['a.md']['b.md']).toBe(3)
      })

      it('should track links from multiple source files', async () => {
        await backend.write('a.md', 'Link to [[c]]')
        await backend.write('b.md', 'Link to [[c]]')
        await backend.write('c.md', '# Target')
        await cache.initialize()

        expect(cache.resolvedLinks['a.md']['c.md']).toBe(1)
        expect(cache.resolvedLinks['b.md']['c.md']).toBe(1)
      })

      it('should track links to multiple targets', async () => {
        await backend.write('hub.md', 'Links: [[a]], [[b]], [[c]]')
        await backend.write('a.md', '# A')
        await backend.write('b.md', '# B')
        await backend.write('c.md', '# C')
        await cache.initialize()

        expect(cache.resolvedLinks['hub.md']).toEqual({
          'a.md': 1,
          'b.md': 1,
          'c.md': 1
        })
      })
    })

    describe('link resolution', () => {
      it('should resolve links with .md extension', async () => {
        await backend.write('source.md', 'Link to [[target.md]]')
        await backend.write('target.md', '# Target')
        await cache.initialize()

        expect(cache.resolvedLinks['source.md']['target.md']).toBe(1)
      })

      it('should resolve links without .md extension', async () => {
        await backend.write('source.md', 'Link to [[target]]')
        await backend.write('target.md', '# Target')
        await cache.initialize()

        expect(cache.resolvedLinks['source.md']['target.md']).toBe(1)
      })

      it('should resolve links with folder paths', async () => {
        await backend.write('source.md', 'Link to [[folder/target]]')
        await backend.write('folder/target.md', '# Target')
        await cache.initialize()

        expect(cache.resolvedLinks['source.md']['folder/target.md']).toBe(1)
      })

      it('should resolve ambiguous links to closest match', async () => {
        await backend.write('notes/source.md', 'Link to [[file]]')
        await backend.write('notes/file.md', '# Notes File')
        await backend.write('archive/file.md', '# Archive File')
        await cache.initialize()

        // Should prefer same-folder match
        expect(cache.resolvedLinks['notes/source.md']['notes/file.md']).toBe(1)
      })

      it('should resolve links with heading references', async () => {
        await backend.write('source.md', 'Link to [[target#heading]]')
        await backend.write('target.md', '# Target\n\n## heading')
        await cache.initialize()

        expect(cache.resolvedLinks['source.md']['target.md']).toBe(1)
      })

      it('should resolve links with block references', async () => {
        await backend.write('source.md', 'Link to [[target#^block1]]')
        await backend.write('target.md', '# Target\n\nContent ^block1')
        await cache.initialize()

        expect(cache.resolvedLinks['source.md']['target.md']).toBe(1)
      })
    })

    describe('updating', () => {
      it('should update when new file is indexed', async () => {
        await backend.write('source.md', 'Link to [[target]]')
        await cache.initialize()

        // target.md doesn't exist yet, so link should be unresolved
        expect(cache.resolvedLinks['source.md']).toEqual({})

        // Now create target and re-index source
        await backend.write('target.md', '# Target')
        const sourceFile = vault.getFileByPath('source.md')!
        await cache.indexFile(sourceFile)

        expect(cache.resolvedLinks['source.md']['target.md']).toBe(1)
      })

      it('should clear old links when file is re-indexed with new content', async () => {
        await backend.write('source.md', 'Link to [[old]]')
        await backend.write('old.md', '# Old')
        await cache.initialize()

        expect(cache.resolvedLinks['source.md']['old.md']).toBe(1)

        // Update source to link to different file
        await backend.write('new.md', '# New')
        await backend.write('source.md', 'Link to [[new]]')
        const sourceFile = vault.getFileByPath('source.md')!
        await cache.indexFile(sourceFile)

        expect(cache.resolvedLinks['source.md']['old.md']).toBeUndefined()
        expect(cache.resolvedLinks['source.md']['new.md']).toBe(1)
      })
    })
  })

  describe('unresolvedLinks', () => {
    describe('basic tracking', () => {
      it('should be an empty object before initialization', () => {
        expect(cache.unresolvedLinks).toEqual({})
      })

      it('should track links to non-existent files', async () => {
        await backend.write('source.md', 'Link to [[missing]]')
        await cache.initialize()

        expect(cache.unresolvedLinks['source.md']).toBeDefined()
        expect(cache.unresolvedLinks['source.md']['missing']).toBe(1)
      })

      it('should count multiple unresolved links to same target', async () => {
        await backend.write('source.md', '[[missing]] and [[missing]] again')
        await cache.initialize()

        expect(cache.unresolvedLinks['source.md']['missing']).toBe(2)
      })

      it('should track unresolved links from multiple sources', async () => {
        await backend.write('a.md', 'Link to [[missing]]')
        await backend.write('b.md', 'Link to [[missing]]')
        await cache.initialize()

        expect(cache.unresolvedLinks['a.md']['missing']).toBe(1)
        expect(cache.unresolvedLinks['b.md']['missing']).toBe(1)
      })

      it('should track multiple different unresolved links', async () => {
        await backend.write('source.md', '[[missing1]] and [[missing2]] and [[missing3]]')
        await cache.initialize()

        expect(cache.unresolvedLinks['source.md']).toEqual({
          'missing1': 1,
          'missing2': 1,
          'missing3': 1
        })
      })
    })

    describe('mixed resolved and unresolved', () => {
      it('should correctly categorize mixed links', async () => {
        await backend.write('source.md', '[[exists]] and [[missing]]')
        await backend.write('exists.md', '# Exists')
        await cache.initialize()

        expect(cache.resolvedLinks['source.md']['exists.md']).toBe(1)
        expect(cache.unresolvedLinks['source.md']['missing']).toBe(1)
      })

      it('should not include resolved links in unresolvedLinks', async () => {
        await backend.write('source.md', '[[target]]')
        await backend.write('target.md', '# Target')
        await cache.initialize()

        expect(cache.unresolvedLinks['source.md']).toBeUndefined()
      })

      it('should not include unresolved links in resolvedLinks', async () => {
        await backend.write('source.md', '[[missing]]')
        await cache.initialize()

        expect(cache.resolvedLinks['source.md']).toEqual({})
      })
    })

    describe('updating', () => {
      it('should move from unresolved to resolved when target is created', async () => {
        await backend.write('source.md', '[[target]]')
        await cache.initialize()

        expect(cache.unresolvedLinks['source.md']['target']).toBe(1)

        // Create target and re-index
        await backend.write('target.md', '# Target')
        const sourceFile = vault.getFileByPath('source.md')!
        await cache.indexFile(sourceFile)

        expect(cache.unresolvedLinks['source.md']).toBeUndefined()
        expect(cache.resolvedLinks['source.md']['target.md']).toBe(1)
      })

      it('should clear unresolved links when file is re-indexed', async () => {
        await backend.write('source.md', '[[missing]]')
        await cache.initialize()

        expect(cache.unresolvedLinks['source.md']['missing']).toBe(1)

        // Update source to remove all links
        await backend.write('source.md', 'No links here')
        const sourceFile = vault.getFileByPath('source.md')!
        await cache.indexFile(sourceFile)

        expect(cache.unresolvedLinks['source.md']).toBeUndefined()
      })
    })
  })

  describe('initialize', () => {
    describe('full vault indexing', () => {
      it('should index all markdown files in vault', async () => {
        await backend.write('a.md', '# A')
        await backend.write('b.md', '# B')
        await backend.write('c.md', '# C')
        await cache.initialize()

        expect(cache.getCache('a.md')).not.toBeNull()
        expect(cache.getCache('b.md')).not.toBeNull()
        expect(cache.getCache('c.md')).not.toBeNull()
      })

      it('should index files in nested directories', async () => {
        await backend.write('root.md', '# Root')
        await backend.write('folder/nested.md', '# Nested')
        await backend.write('a/b/c/deep.md', '# Deep')
        await cache.initialize()

        expect(cache.getCache('root.md')).not.toBeNull()
        expect(cache.getCache('folder/nested.md')).not.toBeNull()
        expect(cache.getCache('a/b/c/deep.md')).not.toBeNull()
      })

      it('should not index non-markdown files', async () => {
        await backend.write('doc.md', '# Doc')
        await backend.write('image.png', 'binary-data')
        await backend.write('config.json', '{}')
        await cache.initialize()

        expect(cache.getCache('doc.md')).not.toBeNull()
        expect(cache.getCache('image.png')).toBeNull()
        expect(cache.getCache('config.json')).toBeNull()
      })

      it('should populate resolvedLinks for all files', async () => {
        await backend.write('a.md', '[[b]] and [[c]]')
        await backend.write('b.md', '[[c]]')
        await backend.write('c.md', '# C')
        await cache.initialize()

        expect(cache.resolvedLinks['a.md']).toEqual({ 'b.md': 1, 'c.md': 1 })
        expect(cache.resolvedLinks['b.md']).toEqual({ 'c.md': 1 })
      })

      it('should populate unresolvedLinks for all files', async () => {
        await backend.write('a.md', '[[missing1]]')
        await backend.write('b.md', '[[missing2]]')
        await cache.initialize()

        expect(cache.unresolvedLinks['a.md']).toEqual({ 'missing1': 1 })
        expect(cache.unresolvedLinks['b.md']).toEqual({ 'missing2': 1 })
      })
    })

    describe('empty vault', () => {
      it('should handle empty vault gracefully', async () => {
        await cache.initialize()

        expect(cache.resolvedLinks).toEqual({})
        expect(cache.unresolvedLinks).toEqual({})
      })
    })

    describe('idempotency', () => {
      it('should be idempotent - multiple calls produce same result', async () => {
        await backend.write('test.md', '# Test [[link]]')
        await backend.write('link.md', '# Link')

        await cache.initialize()
        const firstResolvedLinks = { ...cache.resolvedLinks }

        await cache.initialize()
        expect(cache.resolvedLinks).toEqual(firstResolvedLinks)
      })

      it('should reflect changes on re-initialization', async () => {
        await backend.write('test.md', '# Test [[a]]')
        await backend.write('a.md', '# A')
        await cache.initialize()

        expect(cache.resolvedLinks['test.md']['a.md']).toBe(1)

        // Add a new file and link
        await backend.write('b.md', '# B')
        await backend.write('test.md', '# Test [[b]]')
        await cache.initialize()

        expect(cache.resolvedLinks['test.md']['b.md']).toBe(1)
        expect(cache.resolvedLinks['test.md']['a.md']).toBeUndefined()
      })
    })
  })

  describe('indexFile', () => {
    describe('single file indexing', () => {
      it('should index a single file', async () => {
        await backend.write('test.md', '# Test\n\n[[link]]')
        await cache.initialize()

        const file = vault.getFileByPath('test.md')!
        const metadata = cache.getFileCache(file)

        expect(metadata).not.toBeNull()
        expect(metadata?.headings).toHaveLength(1)
        expect(metadata?.links).toHaveLength(1)
      })

      it('should update existing cache entry', async () => {
        await backend.write('test.md', '# Original')
        await cache.initialize()

        const file = vault.getFileByPath('test.md')!
        let metadata = cache.getFileCache(file)
        expect(metadata?.headings?.[0].heading).toBe('Original')

        // Modify file and re-index
        await backend.write('test.md', '# Modified')
        await cache.indexFile(file)

        metadata = cache.getFileCache(file)
        expect(metadata?.headings?.[0].heading).toBe('Modified')
      })

      it('should add new file to cache', async () => {
        await cache.initialize()
        expect(cache.getCache('new.md')).toBeNull()

        await backend.write('new.md', '# New File')
        const file = vault.getFileByPath('new.md')!
        await cache.indexFile(file)

        expect(cache.getCache('new.md')).not.toBeNull()
      })

      it('should update resolvedLinks for indexed file', async () => {
        await backend.write('source.md', '[[target]]')
        await backend.write('target.md', '# Target')
        await cache.initialize()

        expect(cache.resolvedLinks['source.md']['target.md']).toBe(1)

        // Update source to link to new target
        await backend.write('new-target.md', '# New Target')
        await backend.write('source.md', '[[new-target]]')

        const file = vault.getFileByPath('source.md')!
        await cache.indexFile(file)

        expect(cache.resolvedLinks['source.md']['target.md']).toBeUndefined()
        expect(cache.resolvedLinks['source.md']['new-target.md']).toBe(1)
      })

      it('should update unresolvedLinks for indexed file', async () => {
        await backend.write('source.md', '[[missing]]')
        await cache.initialize()

        expect(cache.unresolvedLinks['source.md']['missing']).toBe(1)

        // Update source to resolve the link
        await backend.write('missing.md', '# Found')
        await backend.write('source.md', '[[missing]]')

        const file = vault.getFileByPath('source.md')!
        await cache.indexFile(file)

        expect(cache.unresolvedLinks['source.md']).toBeUndefined()
        expect(cache.resolvedLinks['source.md']['missing.md']).toBe(1)
      })
    })

    describe('return value', () => {
      it('should return the cached metadata after indexing', async () => {
        await backend.write('test.md', '# Test')
        const file = vault.getFileByPath('test.md')!

        const result = await cache.indexFile(file)

        expect(result).not.toBeNull()
        expect(result?.headings).toHaveLength(1)
      })
    })

    describe('error handling', () => {
      it('should handle file read errors gracefully', async () => {
        const fakeFile: TFile = {
          path: 'nonexistent.md',
          name: 'nonexistent.md',
          basename: 'nonexistent',
          extension: 'md',
          stat: { ctime: 0, mtime: 0, size: 0 }
        }

        // Should not throw, but may return null or handle gracefully
        await expect(cache.indexFile(fakeFile)).resolves.toBeDefined()
      })
    })
  })

  describe('parsing - links', () => {
    describe('wiki-style links', () => {
      it('should extract basic wiki links', async () => {
        await backend.write('test.md', 'Link to [[other]]')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.links).toHaveLength(1)
        expect(metadata?.links?.[0]).toMatchObject({
          link: 'other',
          original: '[[other]]'
        })
      })

      it('should extract multiple wiki links', async () => {
        await backend.write('test.md', '[[a]] and [[b]] and [[c]]')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.links).toHaveLength(3)
      })

      it('should extract wiki links with display text', async () => {
        await backend.write('test.md', '[[target|display text]]')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.links?.[0]).toMatchObject({
          link: 'target',
          displayText: 'display text',
          original: '[[target|display text]]'
        })
      })

      it('should extract wiki links with heading reference', async () => {
        await backend.write('test.md', '[[target#heading]]')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.links?.[0].link).toBe('target#heading')
      })

      it('should extract wiki links with block reference', async () => {
        await backend.write('test.md', '[[target#^block1]]')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.links?.[0].link).toBe('target#^block1')
      })

      it('should extract wiki links with path', async () => {
        await backend.write('test.md', '[[folder/subfolder/target]]')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.links?.[0].link).toBe('folder/subfolder/target')
      })

      it('should include position information for links', async () => {
        await backend.write('test.md', 'Before [[link]] after')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        const link = metadata?.links?.[0]

        expect(link?.position).toBeDefined()
        expect(link?.position.start).toMatchObject({
          line: expect.any(Number),
          col: expect.any(Number),
          offset: expect.any(Number)
        })
        expect(link?.position.end).toMatchObject({
          line: expect.any(Number),
          col: expect.any(Number),
          offset: expect.any(Number)
        })
      })
    })

    describe('edge cases', () => {
      it('should handle links with special characters', async () => {
        await backend.write('test.md', '[[file (1)]]')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.links?.[0].link).toBe('file (1)')
      })

      it('should handle links in code blocks - should be ignored', async () => {
        await backend.write('test.md', '```\n[[not-a-link]]\n```')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.links ?? []).toHaveLength(0)
      })

      it('should handle links in inline code - should be ignored', async () => {
        await backend.write('test.md', '`[[not-a-link]]`')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.links ?? []).toHaveLength(0)
      })

      it('should handle empty links', async () => {
        await backend.write('test.md', '[[]]')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        // Empty links should either be ignored or have empty link property
        if (metadata?.links?.length) {
          expect(metadata.links[0].link).toBe('')
        }
      })

      it('should handle nested brackets - not valid', async () => {
        await backend.write('test.md', '[[[nested]]]')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        // Should not create malformed link entries
        const validLinks = metadata?.links?.filter(l => l.link && !l.link.includes('['))
        expect(validLinks?.length ?? 0).toBe(0)
      })
    })
  })

  describe('parsing - tags', () => {
    describe('basic tags', () => {
      it('should extract basic hashtag', async () => {
        await backend.write('test.md', 'Content with #tag')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.tags).toHaveLength(1)
        expect(metadata?.tags?.[0].tag).toBe('#tag')
      })

      it('should extract multiple tags', async () => {
        await backend.write('test.md', '#one #two #three')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.tags).toHaveLength(3)
        expect(metadata?.tags?.map(t => t.tag)).toEqual(['#one', '#two', '#three'])
      })

      it('should extract nested/hierarchical tags', async () => {
        await backend.write('test.md', '#parent/child/grandchild')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.tags?.[0].tag).toBe('#parent/child/grandchild')
      })

      it('should extract tags with numbers', async () => {
        await backend.write('test.md', '#tag123 #2024')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.tags).toHaveLength(2)
      })

      it('should extract tags with underscores', async () => {
        await backend.write('test.md', '#tag_with_underscores')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.tags?.[0].tag).toBe('#tag_with_underscores')
      })

      it('should extract tags with hyphens', async () => {
        await backend.write('test.md', '#tag-with-hyphens')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.tags?.[0].tag).toBe('#tag-with-hyphens')
      })

      it('should include position information for tags', async () => {
        await backend.write('test.md', 'Text #tag here')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        const tag = metadata?.tags?.[0]

        expect(tag?.position).toBeDefined()
        expect(tag?.position.start.line).toBe(0)
      })
    })

    describe('edge cases', () => {
      it('should not extract tags in code blocks', async () => {
        await backend.write('test.md', '```\n#not-a-tag\n```')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.tags ?? []).toHaveLength(0)
      })

      it('should not extract tags in inline code', async () => {
        await backend.write('test.md', '`#not-a-tag`')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.tags ?? []).toHaveLength(0)
      })

      it('should not extract heading markers as tags', async () => {
        await backend.write('test.md', '# Heading')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        // # followed by space is a heading, not a tag
        expect(metadata?.tags ?? []).toHaveLength(0)
      })

      it('should not extract hash in URLs as tags', async () => {
        await backend.write('test.md', 'https://example.com/#section')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.tags ?? []).toHaveLength(0)
      })

      it('should handle tags at start of line', async () => {
        await backend.write('test.md', '#starttag')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.tags?.[0].tag).toBe('#starttag')
      })

      it('should handle tags at end of line', async () => {
        await backend.write('test.md', 'Content #endtag')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.tags?.[0].tag).toBe('#endtag')
      })
    })
  })

  describe('parsing - headings', () => {
    describe('heading levels', () => {
      it('should extract h1 headings', async () => {
        await backend.write('test.md', '# Heading 1')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.headings).toHaveLength(1)
        expect(metadata?.headings?.[0]).toMatchObject({
          heading: 'Heading 1',
          level: 1
        })
      })

      it('should extract h2 headings', async () => {
        await backend.write('test.md', '## Heading 2')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.headings?.[0]).toMatchObject({
          heading: 'Heading 2',
          level: 2
        })
      })

      it('should extract h3 headings', async () => {
        await backend.write('test.md', '### Heading 3')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.headings?.[0]).toMatchObject({
          heading: 'Heading 3',
          level: 3
        })
      })

      it('should extract h4, h5, h6 headings', async () => {
        await backend.write('test.md', '#### H4\n##### H5\n###### H6')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.headings).toHaveLength(3)
        expect(metadata?.headings?.[0].level).toBe(4)
        expect(metadata?.headings?.[1].level).toBe(5)
        expect(metadata?.headings?.[2].level).toBe(6)
      })

      it('should extract multiple headings at different levels', async () => {
        await backend.write('test.md', '# H1\n\n## H2\n\n### H3\n\n## Another H2')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.headings).toHaveLength(4)
      })
    })

    describe('heading content', () => {
      it('should preserve heading text exactly', async () => {
        await backend.write('test.md', '# Hello World!')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.headings?.[0].heading).toBe('Hello World!')
      })

      it('should handle headings with inline formatting', async () => {
        await backend.write('test.md', '# **Bold** and *italic* heading')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        // May preserve or strip formatting - check it extracts something
        expect(metadata?.headings?.[0].heading).toBeDefined()
        expect(metadata?.headings?.[0].heading.length).toBeGreaterThan(0)
      })

      it('should handle headings with links', async () => {
        await backend.write('test.md', '# Heading with [[link]]')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.headings?.[0].heading).toContain('link')
      })

      it('should handle headings with code', async () => {
        await backend.write('test.md', '# Heading with `code`')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.headings?.[0].heading).toContain('code')
      })

      it('should include position information for headings', async () => {
        await backend.write('test.md', '# Heading')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        const heading = metadata?.headings?.[0]

        expect(heading?.position).toBeDefined()
        expect(heading?.position.start.line).toBe(0)
      })
    })

    describe('edge cases', () => {
      it('should not extract headings in code blocks', async () => {
        await backend.write('test.md', '```\n# Not a heading\n```')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.headings ?? []).toHaveLength(0)
      })

      it('should handle setext-style h1 (with ===)', async () => {
        await backend.write('test.md', 'Heading\n=======')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        // Setext style support is optional
        // Test may pass if implemented
        if (metadata?.headings?.length) {
          expect(metadata.headings[0].heading).toBe('Heading')
          expect(metadata.headings[0].level).toBe(1)
        }
      })

      it('should handle setext-style h2 (with ---)', async () => {
        await backend.write('test.md', 'Heading\n-------')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        // Setext style support is optional
        if (metadata?.headings?.length) {
          expect(metadata.headings[0].heading).toBe('Heading')
          expect(metadata.headings[0].level).toBe(2)
        }
      })

      it('should handle empty headings', async () => {
        await backend.write('test.md', '# ')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        // Empty headings may be ignored or have empty string
        if (metadata?.headings?.length) {
          expect(metadata.headings[0].heading).toBe('')
        }
      })

      it('should not count # in inline content as heading', async () => {
        await backend.write('test.md', 'This # is not a heading')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.headings ?? []).toHaveLength(0)
      })
    })
  })

  describe('parsing - frontmatter', () => {
    describe('basic frontmatter', () => {
      it('should extract YAML frontmatter', async () => {
        await backend.write('test.md', `---
title: Test Document
author: Test Author
---

Content`)
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.frontmatter).toBeDefined()
        expect(metadata?.frontmatter?.title).toBe('Test Document')
        expect(metadata?.frontmatter?.author).toBe('Test Author')
      })

      it('should handle empty frontmatter', async () => {
        await backend.write('test.md', `---
---

Content`)
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.frontmatter).toBeDefined()
        expect(Object.keys(metadata?.frontmatter ?? {}).length).toBe(0)
      })

      it('should handle frontmatter with arrays', async () => {
        await backend.write('test.md', `---
tags:
  - tag1
  - tag2
  - tag3
---`)
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.frontmatter?.tags).toEqual(['tag1', 'tag2', 'tag3'])
      })

      it('should handle frontmatter with inline arrays', async () => {
        await backend.write('test.md', `---
tags: [tag1, tag2, tag3]
---`)
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.frontmatter?.tags).toEqual(['tag1', 'tag2', 'tag3'])
      })

      it('should handle frontmatter with nested objects', async () => {
        await backend.write('test.md', `---
metadata:
  created: 2024-01-01
  modified: 2024-01-02
---`)
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.frontmatter?.metadata).toEqual({
          created: '2024-01-01',
          modified: '2024-01-02'
        })
      })

      it('should handle frontmatter with numbers', async () => {
        await backend.write('test.md', `---
count: 42
rating: 4.5
---`)
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.frontmatter?.count).toBe(42)
        expect(metadata?.frontmatter?.rating).toBe(4.5)
      })

      it('should handle frontmatter with booleans', async () => {
        await backend.write('test.md', `---
published: true
draft: false
---`)
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.frontmatter?.published).toBe(true)
        expect(metadata?.frontmatter?.draft).toBe(false)
      })

      it('should handle frontmatter with null values', async () => {
        await backend.write('test.md', `---
empty: null
also_empty: ~
---`)
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.frontmatter?.empty).toBeNull()
        expect(metadata?.frontmatter?.also_empty).toBeNull()
      })

      it('should include frontmatterPosition', async () => {
        await backend.write('test.md', `---
title: Test
---

Content`)
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.frontmatterPosition).toBeDefined()
        expect(metadata?.frontmatterPosition?.start.line).toBe(0)
      })
    })

    describe('edge cases', () => {
      it('should return null frontmatter if not present', async () => {
        await backend.write('test.md', '# No frontmatter')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.frontmatter).toBeUndefined()
      })

      it('should ignore frontmatter-like content not at start', async () => {
        await backend.write('test.md', `Content first

---
not: frontmatter
---`)
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.frontmatter).toBeUndefined()
      })

      it('should handle malformed YAML gracefully', async () => {
        await backend.write('test.md', `---
invalid: yaml: content
  broken indentation
---`)
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        // Should not crash, may return null or partial frontmatter
        expect(metadata).toBeDefined()
      })

      it('should handle frontmatter with multiline strings', async () => {
        await backend.write('test.md', `---
description: |
  This is a
  multiline string
---`)
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.frontmatter?.description).toContain('multiline')
      })

      it('should handle frontmatter with dates', async () => {
        await backend.write('test.md', `---
date: 2024-01-15
datetime: 2024-01-15T10:30:00
---`)
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        // Dates may be parsed as strings or Date objects
        expect(metadata?.frontmatter?.date).toBeDefined()
      })
    })

    describe('frontmatter links', () => {
      it('should extract links from frontmatter', async () => {
        await backend.write('test.md', `---
related: "[[other-note]]"
---`)
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.frontmatterLinks).toBeDefined()
        if (metadata?.frontmatterLinks?.length) {
          expect(metadata.frontmatterLinks[0]).toMatchObject({
            key: 'related',
            link: 'other-note'
          })
        }
      })

      it('should extract multiple frontmatter links', async () => {
        await backend.write('test.md', `---
parent: "[[parent-note]]"
children:
  - "[[child1]]"
  - "[[child2]]"
---`)
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        if (metadata?.frontmatterLinks) {
          expect(metadata.frontmatterLinks.length).toBeGreaterThanOrEqual(1)
        }
      })
    })
  })

  describe('parsing - blocks', () => {
    describe('block identifiers', () => {
      it('should extract block IDs', async () => {
        await backend.write('test.md', 'Some content ^block1')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.blocks).toBeDefined()
        expect(metadata?.blocks?.['block1']).toMatchObject({
          id: 'block1',
          position: expect.any(Object)
        })
      })

      it('should extract multiple block IDs', async () => {
        await backend.write('test.md', `
First paragraph ^block1

Second paragraph ^block2

Third paragraph ^block3
`)
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(Object.keys(metadata?.blocks ?? {}).length).toBe(3)
      })

      it('should handle block IDs with numbers', async () => {
        await backend.write('test.md', 'Content ^123abc')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.blocks?.['123abc']).toBeDefined()
      })

      it('should handle block IDs with hyphens', async () => {
        await backend.write('test.md', 'Content ^my-block-id')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.blocks?.['my-block-id']).toBeDefined()
      })
    })

    describe('edge cases', () => {
      it('should not extract ^ in code blocks as block IDs', async () => {
        await backend.write('test.md', '```\ncode ^notablock\n```')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.blocks?.['notablock']).toBeUndefined()
      })

      it('should not extract ^ in inline code', async () => {
        await backend.write('test.md', '`^notablock`')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.blocks?.['notablock']).toBeUndefined()
      })

      it('should only match ^ at end of line', async () => {
        await backend.write('test.md', 'Content ^notend more content')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.blocks?.['notend']).toBeUndefined()
      })
    })
  })

  describe('parsing - embeds', () => {
    describe('basic embeds', () => {
      it('should extract image embeds', async () => {
        await backend.write('test.md', '![[image.png]]')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.embeds).toHaveLength(1)
        expect(metadata?.embeds?.[0]).toMatchObject({
          link: 'image.png',
          original: '![[image.png]]'
        })
      })

      it('should extract note embeds', async () => {
        await backend.write('test.md', '![[other-note]]')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.embeds?.[0].link).toBe('other-note')
      })

      it('should extract embeds with display text', async () => {
        await backend.write('test.md', '![[image.png|alt text]]')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.embeds?.[0]).toMatchObject({
          link: 'image.png',
          displayText: 'alt text'
        })
      })

      it('should extract embeds with heading reference', async () => {
        await backend.write('test.md', '![[note#heading]]')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.embeds?.[0].link).toBe('note#heading')
      })

      it('should extract embeds with block reference', async () => {
        await backend.write('test.md', '![[note#^block1]]')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.embeds?.[0].link).toBe('note#^block1')
      })
    })

    describe('distinguishing links vs embeds', () => {
      it('should separate links and embeds', async () => {
        await backend.write('test.md', '[[link]] and ![[embed]]')
        await cache.initialize()

        const metadata = cache.getCache('test.md')
        expect(metadata?.links).toHaveLength(1)
        expect(metadata?.embeds).toHaveLength(1)
        expect(metadata?.links?.[0].link).toBe('link')
        expect(metadata?.embeds?.[0].link).toBe('embed')
      })
    })
  })

  describe('performance', () => {
    it('should handle large files efficiently', async () => {
      // Create a large markdown file
      let content = '# Large Document\n\n'
      for (let i = 0; i < 100; i++) {
        content += `## Section ${i}\n\nParagraph with [[link${i}]] and #tag${i}\n\n`
      }
      await backend.write('large.md', content)

      const start = performance.now()
      await cache.initialize()
      const duration = performance.now() - start

      // Should complete in reasonable time (under 1 second)
      expect(duration).toBeLessThan(1000)

      const metadata = cache.getCache('large.md')
      expect(metadata?.headings?.length).toBeGreaterThan(50)
      expect(metadata?.links?.length).toBe(100)
      expect(metadata?.tags?.length).toBe(100)
    })

    it('should handle many files efficiently', async () => {
      // Create many small files
      for (let i = 0; i < 100; i++) {
        await backend.write(`file${i}.md`, `# File ${i}\n\n[[file${(i + 1) % 100}]]`)
      }

      const start = performance.now()
      await cache.initialize()
      const duration = performance.now() - start

      // Should complete in reasonable time (under 2 seconds)
      expect(duration).toBeLessThan(2000)

      // Verify all files were indexed
      for (let i = 0; i < 100; i++) {
        expect(cache.getCache(`file${i}.md`)).not.toBeNull()
      }
    })
  })
})
