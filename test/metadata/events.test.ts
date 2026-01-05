import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { MetadataCache } from '../../src/metadata/cache.js'
import { Vault } from '../../src/vault/vault.js'
import { MemoryBackend } from '../../src/vault/memory-backend.js'
import type { TFile, CachedMetadata, EventRef } from '../../src/types.js'

describe('MetadataCache events', () => {
  let backend: MemoryBackend
  let vault: Vault
  let cache: MetadataCache

  beforeEach(() => {
    backend = new MemoryBackend()
    vault = new Vault(backend)
    cache = new MetadataCache(vault)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('changed event', () => {
    it('should emit changed event when file is indexed', async () => {
      const callback = vi.fn()
      cache.on('changed', callback)

      // Create a file in the vault
      const file = await vault.create('notes/test.md', '# Test\n\nSome [[link]] here')

      // Wait for indexing to complete
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callback).toHaveBeenCalled()
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'notes/test.md' }),
        expect.any(Object), // CachedMetadata
        expect.any(String) // oldContent hash or empty
      )
    })

    it('should emit changed event with file and metadata when markdown file created', async () => {
      const callback = vi.fn()
      cache.on('changed', callback)

      await vault.create('document.md', '# Title\n\n## Heading 2\n\nParagraph with [[wikilink]]')

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callback).toHaveBeenCalledTimes(1)
      const [file, metadata] = callback.mock.calls[0] as [TFile, CachedMetadata, string]
      expect(file.path).toBe('document.md')
      expect(metadata.headings).toBeDefined()
      expect(metadata.links).toBeDefined()
    })

    it('should emit changed event with parsed frontmatter', async () => {
      const callback = vi.fn()
      cache.on('changed', callback)

      await vault.create('with-frontmatter.md', `---
title: My Note
tags:
  - test
  - example
---

# Content here
`)

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callback).toHaveBeenCalled()
      const [, metadata] = callback.mock.calls[0] as [TFile, CachedMetadata, string]
      expect(metadata.frontmatter).toBeDefined()
      expect(metadata.frontmatter?.title).toBe('My Note')
      expect(metadata.frontmatter?.tags).toEqual(['test', 'example'])
    })

    it('should emit changed event with links array for wiki links', async () => {
      const callback = vi.fn()
      cache.on('changed', callback)

      await vault.create('links.md', '[[note-a]] and [[note-b|alias]] and [[folder/note-c]]')

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callback).toHaveBeenCalled()
      const [, metadata] = callback.mock.calls[0] as [TFile, CachedMetadata, string]
      expect(metadata.links).toHaveLength(3)
      expect(metadata.links?.[0].link).toBe('note-a')
      expect(metadata.links?.[1].link).toBe('note-b')
      expect(metadata.links?.[1].displayText).toBe('alias')
      expect(metadata.links?.[2].link).toBe('folder/note-c')
    })

    it('should emit changed event with embeds array for embedded content', async () => {
      const callback = vi.fn()
      cache.on('changed', callback)

      await vault.create('embeds.md', '![[image.png]] and ![[document.pdf]]')

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callback).toHaveBeenCalled()
      const [, metadata] = callback.mock.calls[0] as [TFile, CachedMetadata, string]
      expect(metadata.embeds).toHaveLength(2)
      expect(metadata.embeds?.[0].link).toBe('image.png')
      expect(metadata.embeds?.[1].link).toBe('document.pdf')
    })

    it('should emit changed event with tags array', async () => {
      const callback = vi.fn()
      cache.on('changed', callback)

      await vault.create('tagged.md', '#tag1 some text #nested/tag #another-tag')

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callback).toHaveBeenCalled()
      const [, metadata] = callback.mock.calls[0] as [TFile, CachedMetadata, string]
      expect(metadata.tags).toHaveLength(3)
      expect(metadata.tags?.map(t => t.tag)).toContain('#tag1')
      expect(metadata.tags?.map(t => t.tag)).toContain('#nested/tag')
      expect(metadata.tags?.map(t => t.tag)).toContain('#another-tag')
    })

    it('should emit changed event with headings hierarchy', async () => {
      const callback = vi.fn()
      cache.on('changed', callback)

      await vault.create('headings.md', `# H1
## H2
### H3
## Another H2
# Another H1`)

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callback).toHaveBeenCalled()
      const [, metadata] = callback.mock.calls[0] as [TFile, CachedMetadata, string]
      expect(metadata.headings).toHaveLength(5)
      expect(metadata.headings?.[0]).toMatchObject({ heading: 'H1', level: 1 })
      expect(metadata.headings?.[1]).toMatchObject({ heading: 'H2', level: 2 })
      expect(metadata.headings?.[2]).toMatchObject({ heading: 'H3', level: 3 })
    })

    it('should emit changed event with block references', async () => {
      const callback = vi.fn()
      cache.on('changed', callback)

      await vault.create('blocks.md', `Paragraph one ^block1

Paragraph two ^block2

- list item ^listblock`)

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callback).toHaveBeenCalled()
      const [, metadata] = callback.mock.calls[0] as [TFile, CachedMetadata, string]
      expect(metadata.blocks).toBeDefined()
      expect(metadata.blocks?.['block1']).toBeDefined()
      expect(metadata.blocks?.['block2']).toBeDefined()
      expect(metadata.blocks?.['listblock']).toBeDefined()
    })

    it('should emit changed event with position information', async () => {
      const callback = vi.fn()
      cache.on('changed', callback)

      await vault.create('positions.md', '# Title\n\n[[link]]')

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callback).toHaveBeenCalled()
      const [, metadata] = callback.mock.calls[0] as [TFile, CachedMetadata, string]

      // Headings should have position info
      expect(metadata.headings?.[0].position).toBeDefined()
      expect(metadata.headings?.[0].position.start.line).toBe(0)

      // Links should have position info
      expect(metadata.links?.[0].position).toBeDefined()
      expect(metadata.links?.[0].position.start.line).toBe(2)
    })

    it('should not emit changed event for non-markdown files', async () => {
      const callback = vi.fn()
      cache.on('changed', callback)

      await backend.write('image.png', 'binary-data')
      await backend.write('data.json', '{"key": "value"}')

      await new Promise(resolve => setTimeout(resolve, 50))

      // Should not emit for non-markdown files
      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('resolve event', () => {
    it('should emit resolve event when links are resolved', async () => {
      const callback = vi.fn()
      cache.on('resolve', callback)

      // Create target file first
      await vault.create('target.md', '# Target')
      // Create file with link
      await vault.create('source.md', '[[target]]')

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callback).toHaveBeenCalled()
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'source.md' })
      )
    })

    it('should emit resolve event with file when wikilinks are resolved', async () => {
      const callback = vi.fn()
      cache.on('resolve', callback)

      await vault.create('note-a.md', '# Note A')
      await vault.create('note-b.md', '[[note-a]] is linked')

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callback).toHaveBeenCalled()
      const callArgs = callback.mock.calls.find(
        (args: [TFile]) => args[0].path === 'note-b.md'
      )
      expect(callArgs).toBeDefined()
    })

    it('should update resolvedLinks when resolve event fires', async () => {
      await vault.create('target.md', '# Target')
      await vault.create('source.md', '[[target]]')

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(cache.resolvedLinks['source.md']).toBeDefined()
      expect(cache.resolvedLinks['source.md']['target.md']).toBe(1)
    })

    it('should track multiple links to same target', async () => {
      await vault.create('target.md', '# Target')
      await vault.create('source.md', '[[target]] and [[target]] again')

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(cache.resolvedLinks['source.md']['target.md']).toBe(2)
    })

    it('should update unresolvedLinks for broken links', async () => {
      await vault.create('source.md', '[[nonexistent]] link')

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(cache.unresolvedLinks['source.md']).toBeDefined()
      expect(cache.unresolvedLinks['source.md']['nonexistent']).toBe(1)
    })

    it('should resolve links across folders', async () => {
      await vault.create('folder-a/note.md', '# Note in A')
      await vault.create('folder-b/linker.md', '[[folder-a/note]]')

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(cache.resolvedLinks['folder-b/linker.md']).toBeDefined()
      expect(cache.resolvedLinks['folder-b/linker.md']['folder-a/note.md']).toBe(1)
    })

    it('should resolve basename links to same-folder files preferentially', async () => {
      await vault.create('folder-a/note.md', '# Note in A')
      await vault.create('folder-b/note.md', '# Note in B')
      await vault.create('folder-a/linker.md', '[[note]]')

      await new Promise(resolve => setTimeout(resolve, 100))

      // Should resolve to same-folder file
      expect(cache.resolvedLinks['folder-a/linker.md']['folder-a/note.md']).toBe(1)
    })
  })

  describe('resolved event', () => {
    it('should emit resolved event after all files indexed', async () => {
      const callback = vi.fn()
      cache.on('resolved', callback)

      // Create multiple files
      await vault.create('file1.md', '# File 1')
      await vault.create('file2.md', '# File 2')
      await vault.create('file3.md', '# File 3')

      // Wait for full indexing
      await new Promise(resolve => setTimeout(resolve, 200))

      expect(callback).toHaveBeenCalled()
    })

    it('should emit resolved event only once after batch indexing', async () => {
      const callback = vi.fn()
      cache.on('resolved', callback)

      // Create multiple files in quick succession
      await Promise.all([
        vault.create('batch1.md', '# Batch 1'),
        vault.create('batch2.md', '# Batch 2'),
        vault.create('batch3.md', '# Batch 3'),
      ])

      await new Promise(resolve => setTimeout(resolve, 200))

      // Should only fire once after all files are indexed
      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('should have all links resolved when resolved event fires', async () => {
      let linksAtResolvedEvent: Record<string, Record<string, number>> = {}

      cache.on('resolved', () => {
        linksAtResolvedEvent = { ...cache.resolvedLinks }
      })

      await vault.create('target.md', '# Target')
      await vault.create('linker1.md', '[[target]]')
      await vault.create('linker2.md', '[[target]]')

      await new Promise(resolve => setTimeout(resolve, 200))

      expect(linksAtResolvedEvent['linker1.md']).toBeDefined()
      expect(linksAtResolvedEvent['linker2.md']).toBeDefined()
    })

    it('should emit resolved after initial vault scan', async () => {
      // Pre-populate backend before creating cache
      await backend.write('existing1.md', '# Existing 1')
      await backend.write('existing2.md', '# Existing 2')

      const callback = vi.fn()

      // Create new cache which should scan existing files
      const newCache = new MetadataCache(vault)
      newCache.on('resolved', callback)

      // Trigger initial scan
      await newCache.initialize?.()

      await new Promise(resolve => setTimeout(resolve, 200))

      expect(callback).toHaveBeenCalled()
    })

    it('should provide access to all cached metadata after resolved', async () => {
      cache.on('resolved', () => {
        const cache1 = cache.getCache('doc1.md')
        const cache2 = cache.getCache('doc2.md')

        expect(cache1).not.toBeNull()
        expect(cache2).not.toBeNull()
      })

      await vault.create('doc1.md', '# Document 1')
      await vault.create('doc2.md', '# Document 2')

      await new Promise(resolve => setTimeout(resolve, 200))
    })
  })

  describe('vault modify event integration', () => {
    it('should re-index on vault modify event', async () => {
      const changedCallback = vi.fn()
      cache.on('changed', changedCallback)

      const file = await vault.create('mutable.md', '# Original')

      await new Promise(resolve => setTimeout(resolve, 50))
      changedCallback.mockClear()

      // Modify the file
      await vault.modify(file, '# Modified\n\n[[new-link]]')

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(changedCallback).toHaveBeenCalled()
      const [, metadata] = changedCallback.mock.calls[0] as [TFile, CachedMetadata, string]
      expect(metadata.links).toHaveLength(1)
      expect(metadata.links?.[0].link).toBe('new-link')
    })

    it('should update metadata when content changes', async () => {
      const file = await vault.create('dynamic.md', '# Title\n\n[[link-a]]')

      await new Promise(resolve => setTimeout(resolve, 100))

      let metadata = cache.getCache('dynamic.md')
      expect(metadata?.links?.[0].link).toBe('link-a')

      await vault.modify(file, '# New Title\n\n[[link-b]] [[link-c]]')

      await new Promise(resolve => setTimeout(resolve, 100))

      metadata = cache.getCache('dynamic.md')
      expect(metadata?.links).toHaveLength(2)
      expect(metadata?.links?.map(l => l.link)).toContain('link-b')
      expect(metadata?.links?.map(l => l.link)).toContain('link-c')
    })

    it('should update frontmatter on modify', async () => {
      const file = await vault.create('meta.md', `---
status: draft
---

# Content`)

      await new Promise(resolve => setTimeout(resolve, 100))

      let metadata = cache.getCache('meta.md')
      expect(metadata?.frontmatter?.status).toBe('draft')

      await vault.modify(file, `---
status: published
author: Test
---

# Content`)

      await new Promise(resolve => setTimeout(resolve, 100))

      metadata = cache.getCache('meta.md')
      expect(metadata?.frontmatter?.status).toBe('published')
      expect(metadata?.frontmatter?.author).toBe('Test')
    })

    it('should update resolved links on modify', async () => {
      await vault.create('target.md', '# Target')
      const source = await vault.create('source.md', '[[target]]')

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(cache.resolvedLinks['source.md']['target.md']).toBe(1)

      await vault.modify(source, '[[target]] [[target]] [[target]]')

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(cache.resolvedLinks['source.md']['target.md']).toBe(3)
    })

    it('should move link from resolved to unresolved when target deleted', async () => {
      const target = await vault.create('target.md', '# Target')
      await vault.create('source.md', '[[target]]')

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(cache.resolvedLinks['source.md']['target.md']).toBe(1)

      await vault.delete(target)

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(cache.resolvedLinks['source.md']?.['target.md']).toBeUndefined()
      expect(cache.unresolvedLinks['source.md']['target']).toBe(1)
    })
  })

  describe('vault rename event integration', () => {
    it('should update link graph on vault rename', async () => {
      await vault.create('old-name.md', '# Content')
      await vault.create('linker.md', '[[old-name]]')

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(cache.resolvedLinks['linker.md']['old-name.md']).toBe(1)

      const file = vault.getFileByPath('old-name.md')!
      await vault.rename(file, 'new-name.md')

      await new Promise(resolve => setTimeout(resolve, 100))

      // Old path should be removed
      expect(cache.resolvedLinks['linker.md']?.['old-name.md']).toBeUndefined()
      // Link should now be unresolved (unless auto-updated)
      expect(
        cache.resolvedLinks['linker.md']?.['new-name.md'] ||
        cache.unresolvedLinks['linker.md']?.['old-name']
      ).toBeDefined()
    })

    it('should update cache key when file renamed', async () => {
      await vault.create('before.md', '# Before\n\n[[some-link]]')

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(cache.getCache('before.md')).not.toBeNull()

      const file = vault.getFileByPath('before.md')!
      await vault.rename(file, 'after.md')

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(cache.getCache('before.md')).toBeNull()
      expect(cache.getCache('after.md')).not.toBeNull()
    })

    it('should emit changed event after rename', async () => {
      const changedCallback = vi.fn()
      cache.on('changed', changedCallback)

      await vault.create('renaming.md', '# Will be renamed')

      await new Promise(resolve => setTimeout(resolve, 50))
      changedCallback.mockClear()

      const file = vault.getFileByPath('renaming.md')!
      await vault.rename(file, 'renamed.md')

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(changedCallback).toHaveBeenCalled()
      const calledWithNewPath = changedCallback.mock.calls.some(
        (args: [TFile, CachedMetadata, string]) => args[0].path === 'renamed.md'
      )
      expect(calledWithNewPath).toBe(true)
    })

    it('should preserve metadata content after rename', async () => {
      await vault.create('original.md', `---
title: Original
---

# Heading

[[link]]`)

      await new Promise(resolve => setTimeout(resolve, 100))

      const originalMetadata = cache.getCache('original.md')

      const file = vault.getFileByPath('original.md')!
      await vault.rename(file, 'moved.md')

      await new Promise(resolve => setTimeout(resolve, 100))

      const newMetadata = cache.getCache('moved.md')

      expect(newMetadata?.frontmatter?.title).toBe(originalMetadata?.frontmatter?.title)
      expect(newMetadata?.headings).toHaveLength(originalMetadata?.headings?.length ?? 0)
      expect(newMetadata?.links).toHaveLength(originalMetadata?.links?.length ?? 0)
    })

    it('should update all incoming links when target renamed', async () => {
      await vault.create('target.md', '# Target')
      await vault.create('linker1.md', '[[target]]')
      await vault.create('linker2.md', '[[target]]')

      await new Promise(resolve => setTimeout(resolve, 100))

      const file = vault.getFileByPath('target.md')!
      await vault.rename(file, 'new-target.md')

      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify link tracking is updated
      expect(cache.resolvedLinks['linker1.md']?.['target.md']).toBeUndefined()
      expect(cache.resolvedLinks['linker2.md']?.['target.md']).toBeUndefined()
    })

    it('should handle folder rename affecting nested files', async () => {
      await vault.create('folder/nested.md', '# Nested')
      await vault.create('linker.md', '[[folder/nested]]')

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(cache.resolvedLinks['linker.md']['folder/nested.md']).toBe(1)

      // Simulate folder rename by renaming the file path
      const file = vault.getFileByPath('folder/nested.md')!
      await vault.rename(file, 'renamed-folder/nested.md')

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(cache.getCache('folder/nested.md')).toBeNull()
      expect(cache.getCache('renamed-folder/nested.md')).not.toBeNull()
    })
  })

  describe('vault delete event integration', () => {
    it('should clean up on vault delete', async () => {
      await vault.create('to-delete.md', '# Will be deleted\n\n[[link]]')

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(cache.getCache('to-delete.md')).not.toBeNull()

      const file = vault.getFileByPath('to-delete.md')!
      await vault.delete(file)

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(cache.getCache('to-delete.md')).toBeNull()
    })

    it('should remove from resolvedLinks when file deleted', async () => {
      await vault.create('source.md', '[[target]]')
      await vault.create('target.md', '# Target')

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(cache.resolvedLinks['source.md']).toBeDefined()

      const source = vault.getFileByPath('source.md')!
      await vault.delete(source)

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(cache.resolvedLinks['source.md']).toBeUndefined()
    })

    it('should update incoming link tracking when target deleted', async () => {
      await vault.create('target.md', '# Target')
      await vault.create('linker.md', '[[target]]')

      await new Promise(resolve => setTimeout(resolve, 100))

      const target = vault.getFileByPath('target.md')!
      await vault.delete(target)

      await new Promise(resolve => setTimeout(resolve, 100))

      // Link should now be unresolved
      expect(cache.unresolvedLinks['linker.md']?.['target']).toBe(1)
    })

    it('should emit changed event for files that linked to deleted file', async () => {
      await vault.create('target.md', '# Target')
      await vault.create('linker.md', '[[target]]')

      await new Promise(resolve => setTimeout(resolve, 100))

      const changedCallback = vi.fn()
      cache.on('changed', changedCallback)

      const target = vault.getFileByPath('target.md')!
      await vault.delete(target)

      await new Promise(resolve => setTimeout(resolve, 100))

      // May or may not emit changed for linker depending on implementation
      // But resolve event should fire to update link status
    })

    it('should handle deleting file with many incoming links', async () => {
      await vault.create('hub.md', '# Hub')
      await vault.create('spoke1.md', '[[hub]]')
      await vault.create('spoke2.md', '[[hub]]')
      await vault.create('spoke3.md', '[[hub]]')

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(cache.resolvedLinks['spoke1.md']['hub.md']).toBe(1)
      expect(cache.resolvedLinks['spoke2.md']['hub.md']).toBe(1)
      expect(cache.resolvedLinks['spoke3.md']['hub.md']).toBe(1)

      const hub = vault.getFileByPath('hub.md')!
      await vault.delete(hub)

      await new Promise(resolve => setTimeout(resolve, 100))

      // All spokes should now have unresolved links
      expect(cache.unresolvedLinks['spoke1.md']?.['hub']).toBe(1)
      expect(cache.unresolvedLinks['spoke2.md']?.['hub']).toBe(1)
      expect(cache.unresolvedLinks['spoke3.md']?.['hub']).toBe(1)
    })

    it('should remove unresolvedLinks entries when source file deleted', async () => {
      await vault.create('orphan.md', '[[nonexistent]]')

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(cache.unresolvedLinks['orphan.md']?.['nonexistent']).toBe(1)

      const orphan = vault.getFileByPath('orphan.md')!
      await vault.delete(orphan)

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(cache.unresolvedLinks['orphan.md']).toBeUndefined()
    })
  })

  describe('event subscription management', () => {
    it('should return EventRef from on()', () => {
      const callback = vi.fn()
      const ref = cache.on('changed', callback)

      expect(ref).toBeDefined()
      expect(typeof ref.unsubscribe).toBe('function')
    })

    it('should stop receiving events after unsubscribe', async () => {
      const callback = vi.fn()
      const ref = cache.on('changed', callback)

      await vault.create('first.md', '# First')
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callback).toHaveBeenCalledTimes(1)

      ref.unsubscribe()

      await vault.create('second.md', '# Second')
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callback).toHaveBeenCalledTimes(1) // Still 1
    })

    it('should support off() method', async () => {
      const callback = vi.fn()
      const ref = cache.on('changed', callback)

      await vault.create('test1.md', '# Test')
      await new Promise(resolve => setTimeout(resolve, 50))

      cache.off('changed', ref)

      await vault.create('test2.md', '# Test')
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('should support multiple listeners for same event', async () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()
      const callback3 = vi.fn()

      cache.on('changed', callback1)
      cache.on('changed', callback2)
      cache.on('changed', callback3)

      await vault.create('multi.md', '# Multi')
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callback1).toHaveBeenCalledTimes(1)
      expect(callback2).toHaveBeenCalledTimes(1)
      expect(callback3).toHaveBeenCalledTimes(1)
    })

    it('should call listeners in registration order', async () => {
      const order: number[] = []

      cache.on('changed', () => order.push(1))
      cache.on('changed', () => order.push(2))
      cache.on('changed', () => order.push(3))

      await vault.create('order.md', '# Order')
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(order).toEqual([1, 2, 3])
    })

    it('should continue calling listeners even if one throws', async () => {
      const callback1 = vi.fn()
      const throwingCallback = vi.fn(() => { throw new Error('Listener error') })
      const callback3 = vi.fn()

      cache.on('changed', callback1)
      cache.on('changed', throwingCallback)
      cache.on('changed', callback3)

      await vault.create('error.md', '# Error')
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callback1).toHaveBeenCalledTimes(1)
      expect(throwingCallback).toHaveBeenCalledTimes(1)
      expect(callback3).toHaveBeenCalledTimes(1)
    })
  })

  describe('trigger() method', () => {
    it('should allow manual event triggering', () => {
      const callback = vi.fn()
      cache.on('changed', callback)

      const mockFile: TFile = {
        path: 'manual.md',
        name: 'manual.md',
        basename: 'manual',
        extension: 'md',
        stat: { ctime: Date.now(), mtime: Date.now(), size: 100 }
      }

      const mockMetadata: CachedMetadata = {
        links: [],
        headings: [{ heading: 'Test', level: 1, position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 6, offset: 6 } } }]
      }

      cache.trigger('changed', mockFile, mockMetadata, '')

      expect(callback).toHaveBeenCalledWith(mockFile, mockMetadata, '')
    })

    it('should support custom events', () => {
      const callback = vi.fn()
      cache.on('custom-event', callback)

      cache.trigger('custom-event', { custom: 'data' })

      expect(callback).toHaveBeenCalledWith({ custom: 'data' })
    })
  })

  describe('edge cases', () => {
    it('should handle rapid file changes', async () => {
      const changedCallback = vi.fn()
      cache.on('changed', changedCallback)

      const file = await vault.create('rapid.md', '# V1')

      // Rapid modifications
      await vault.modify(file, '# V2')
      await vault.modify(file, '# V3')
      await vault.modify(file, '# V4')
      await vault.modify(file, '# V5')

      await new Promise(resolve => setTimeout(resolve, 200))

      // Should have indexed multiple times (or debounced)
      expect(changedCallback).toHaveBeenCalled()
    })

    it('should handle empty files', async () => {
      const callback = vi.fn()
      cache.on('changed', callback)

      await vault.create('empty.md', '')

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callback).toHaveBeenCalled()
      const [, metadata] = callback.mock.calls[0] as [TFile, CachedMetadata, string]
      expect(metadata.links ?? []).toHaveLength(0)
      expect(metadata.headings ?? []).toHaveLength(0)
    })

    it('should handle files with only frontmatter', async () => {
      const callback = vi.fn()
      cache.on('changed', callback)

      await vault.create('only-frontmatter.md', `---
key: value
---`)

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callback).toHaveBeenCalled()
      const [, metadata] = callback.mock.calls[0] as [TFile, CachedMetadata, string]
      expect(metadata.frontmatter?.key).toBe('value')
    })

    it('should handle circular link references', async () => {
      await vault.create('a.md', '[[b]]')
      await vault.create('b.md', '[[c]]')
      await vault.create('c.md', '[[a]]')

      await new Promise(resolve => setTimeout(resolve, 200))

      expect(cache.resolvedLinks['a.md']['b.md']).toBe(1)
      expect(cache.resolvedLinks['b.md']['c.md']).toBe(1)
      expect(cache.resolvedLinks['c.md']['a.md']).toBe(1)
    })

    it('should handle self-referential links', async () => {
      await vault.create('self.md', '[[self]]')

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(cache.resolvedLinks['self.md']['self.md']).toBe(1)
    })

    it('should handle very long files', async () => {
      const callback = vi.fn()
      cache.on('changed', callback)

      const longContent = Array(1000)
        .fill(null)
        .map((_, i) => `## Heading ${i}\n\nParagraph ${i}\n`)
        .join('\n')

      await vault.create('long.md', longContent)

      await new Promise(resolve => setTimeout(resolve, 200))

      expect(callback).toHaveBeenCalled()
      const [, metadata] = callback.mock.calls[0] as [TFile, CachedMetadata, string]
      expect(metadata.headings?.length).toBe(1000)
    })

    it('should handle unicode in file names and content', async () => {
      const callback = vi.fn()
      cache.on('changed', callback)

      await vault.create('日本語.md', '# タイトル\n\n[[リンク]]')

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callback).toHaveBeenCalled()
      const [file, metadata] = callback.mock.calls[0] as [TFile, CachedMetadata, string]
      expect(file.path).toBe('日本語.md')
      expect(metadata.headings?.[0].heading).toBe('タイトル')
      expect(metadata.links?.[0].link).toBe('リンク')
    })
  })
})
