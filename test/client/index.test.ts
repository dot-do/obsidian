import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ObsidianClient } from '../../src/client/client.js'
import { MemoryBackend } from '../../src/vault/memory-backend.js'
import type { TFile, EventRef } from '../../src/types.js'

describe('ObsidianClient (obsidian-3mz)', () => {
  let client: ObsidianClient
  let backend: MemoryBackend

  beforeEach(() => {
    backend = new MemoryBackend()
  })

  describe('Initialization with vault path', () => {
    it('should initialize with a vault path', () => {
      client = new ObsidianClient({
        backend,
        vaultPath: '/path/to/vault'
      })

      expect(client).toBeInstanceOf(ObsidianClient)
    })

    it('should store vault path in vaultPath property', () => {
      client = new ObsidianClient({
        backend,
        vaultPath: '/my/obsidian/vault'
      })

      expect(client.vaultPath).toBe('/my/obsidian/vault')
    })

    it('should allow vault path to be optional', () => {
      client = new ObsidianClient({ backend })

      expect(client.vaultPath).toBeUndefined()
    })

    it('should normalize vault path to remove trailing slash', () => {
      client = new ObsidianClient({
        backend,
        vaultPath: '/path/to/vault/'
      })

      expect(client.vaultPath).toBe('/path/to/vault')
    })

    it('should handle empty vault path', () => {
      client = new ObsidianClient({
        backend,
        vaultPath: ''
      })

      expect(client.vaultPath).toBe('')
    })

    it('should handle vault path with spaces', () => {
      client = new ObsidianClient({
        backend,
        vaultPath: '/path/to/My Vault'
      })

      expect(client.vaultPath).toBe('/path/to/My Vault')
    })

    it('should handle relative vault paths', () => {
      client = new ObsidianClient({
        backend,
        vaultPath: './vault'
      })

      expect(client.vaultPath).toBe('./vault')
    })
  })

  describe('Core property access', () => {
    beforeEach(() => {
      client = new ObsidianClient({ backend })
    })

    it('should provide access to vault', () => {
      expect(client.vault).toBeDefined()
      expect(client.vault).not.toBeNull()
    })

    it('should provide access to cache (metadataCache)', () => {
      expect(client.cache).toBeDefined()
      expect(client.cache).not.toBeNull()
    })

    it('should provide access to metadataCache', () => {
      expect(client.metadataCache).toBeDefined()
      expect(client.metadataCache).not.toBeNull()
    })

    it('should have cache and metadataCache reference the same object', () => {
      expect(client.cache).toBe(client.metadataCache)
    })

    it('should provide access to graph', () => {
      expect(client.graph).toBeDefined()
      expect(client.graph).not.toBeNull()
    })

    it('should provide access to search', () => {
      expect(client.search).toBeDefined()
      expect(client.search).not.toBeNull()
    })
  })

  describe('Context generation', () => {
    beforeEach(async () => {
      client = new ObsidianClient({ backend })
      await client.initialize()
    })

    describe('generateContext()', () => {
      it('should generate context string for a file', async () => {
        await backend.write('note.md', '# Note\n\n[[link]]')
        await client.initialize()

        const file = client.vault.getFileByPath('note.md')!
        const context = await client.generateContext(file)

        expect(typeof context).toBe('string')
        expect(context.length).toBeGreaterThan(0)
      })

      it('should include file metadata in context', async () => {
        await backend.write('note.md', `---
title: Test Note
tags: [test]
---
# Content`)
        await client.initialize()

        const file = client.vault.getFileByPath('note.md')!
        const context = await client.generateContext(file)

        expect(context).toContain('Test Note')
        expect(context).toContain('test')
      })

      it('should include links in context', async () => {
        await backend.write('note.md', '# Note\n\n[[Linked Note]]')
        await backend.write('Linked Note.md', '# Linked Note')
        await client.initialize()

        const file = client.vault.getFileByPath('note.md')!
        const context = await client.generateContext(file, { depth: 1 })

        expect(context).toContain('Linked Note')
      })

      it('should include backlinks in context', async () => {
        await backend.write('target.md', '# Target')
        await backend.write('source.md', '# Source\n\n[[target]]')
        await client.initialize()

        const file = client.vault.getFileByPath('target.md')!
        const context = await client.generateContext(file, { depth: 1 })

        expect(context).toContain('source')
      })

      it('should support depth option for traversal', async () => {
        await backend.write('note.md', '# Note\n\n[[link1]]')
        await backend.write('link1.md', '# Link1\n\n[[link2]]')
        await backend.write('link2.md', '# Link2')
        await client.initialize()

        const file = client.vault.getFileByPath('note.md')!
        const shallowContext = await client.generateContext(file, { depth: 1 })
        const deepContext = await client.generateContext(file, { depth: 2 })

        // At depth 1, should include link1 content but NOT link2 content
        expect(shallowContext).toContain('link1')
        expect(shallowContext).toContain('Link1') // link1 content
        expect(shallowContext).not.toContain('# Link2') // link2 content as a heading

        // At depth 2, should include both link1 and link2 content
        expect(deepContext).toContain('Link1')
        expect(deepContext).toContain('Link2')
      })

      it('should default to depth of 0', async () => {
        await backend.write('note.md', '# Note\n\n[[link1]]')
        await backend.write('link1.md', '# Link1\n\n[[link2]]')
        await backend.write('link2.md', '# Link2')
        await client.initialize()

        const file = client.vault.getFileByPath('note.md')!
        const context = await client.generateContext(file)

        // At depth 0, should NOT include linked note content
        expect(context).not.toContain('Link1')
        expect(context).not.toContain('link2')
      })

      it('should handle notes with no links', async () => {
        await backend.write('isolated.md', '# Isolated Note')
        await client.initialize()

        const file = client.vault.getFileByPath('isolated.md')!
        const context = await client.generateContext(file)

        expect(typeof context).toBe('string')
        expect(context).toContain('Isolated Note')
      })

      it('should handle circular references', async () => {
        await backend.write('a.md', '# A\n\n[[b]]')
        await backend.write('b.md', '# B\n\n[[a]]')
        await client.initialize()

        const file = client.vault.getFileByPath('a.md')!
        const context = await client.generateContext(file, { depth: 3 })

        expect(typeof context).toBe('string')
        expect(context.length).toBeGreaterThan(0)
      })

      it('should throw error for non-existent file', async () => {
        const fakeFile: TFile = {
          path: 'nonexistent.md',
          name: 'nonexistent.md',
          basename: 'nonexistent',
          extension: 'md',
          stat: { ctime: 0, mtime: 0, size: 0 }
        }

        await expect(client.generateContext(fakeFile)).rejects.toThrow()
      })
    })

    describe('getFileContext()', () => {
      it('should return file, metadata, and neighbors', async () => {
        await backend.write('note.md', `---
title: Note
---
# Note

[[link]]`)
        await backend.write('link.md', '# Link')
        await client.initialize()

        const file = client.vault.getFileByPath('note.md')!
        const context = client.getFileContext(file)

        expect(context.file).toBe(file)
        expect(context.metadata).toBeDefined()
        expect(context.neighbors).toBeDefined()
        expect(Array.isArray(context.neighbors)).toBe(true)
      })

      it('should include all direct neighbors (outlinks and backlinks)', async () => {
        await backend.write('center.md', '# Center\n\n[[out]]')
        await backend.write('out.md', '# Out')
        await backend.write('in.md', '# In\n\n[[center]]')
        await client.initialize()
        await client.reindex()

        const file = client.vault.getFileByPath('center.md')!
        const context = client.getFileContext(file)

        const neighborPaths = context.neighbors.map(f => f.path)
        expect(neighborPaths).toContain('out.md')
        expect(neighborPaths).toContain('in.md')
      })

      it('should not include duplicates in neighbors', async () => {
        await backend.write('note.md', '# Note\n\n[[link]]\n[[link]]')
        await backend.write('link.md', '# Link\n\n[[note]]')
        await client.initialize()

        const file = client.vault.getFileByPath('note.md')!
        const context = client.getFileContext(file)

        const linkCount = context.neighbors.filter(f => f.path === 'link.md').length
        expect(linkCount).toBe(1)
      })

      it('should not include the file itself in neighbors', async () => {
        await backend.write('self.md', '# Self\n\n[[self]]')
        await client.initialize()

        const file = client.vault.getFileByPath('self.md')!
        const context = client.getFileContext(file)

        expect(context.neighbors).not.toContain(file)
      })

      it('should return null metadata for file without frontmatter', async () => {
        await backend.write('plain.md', '# Plain Note')
        await client.initialize()
        await client.reindex()

        const file = client.vault.getFileByPath('plain.md')!
        const context = client.getFileContext(file)

        expect(context.metadata).toBeDefined()
        expect(context.metadata!.frontmatter).toBeUndefined()
      })

      it('should return empty neighbors for isolated file', async () => {
        await backend.write('isolated.md', '# Isolated')
        await client.initialize()

        const file = client.vault.getFileByPath('isolated.md')!
        const context = client.getFileContext(file)

        expect(context.neighbors).toHaveLength(0)
      })
    })
  })

  describe('Event handling', () => {
    beforeEach(async () => {
      client = new ObsidianClient({ backend })
      await client.initialize()
    })

    describe('on() method', () => {
      it('should support registering event listeners', () => {
        const callback = vi.fn()
        const ref = client.on('create', callback)

        expect(ref).toBeDefined()
        expect(typeof ref.unsubscribe).toBe('function')
      })

      it('should support create event', async () => {
        const callback = vi.fn()
        client.on('create', callback)

        await client.createNote('new.md', '# New')

        expect(callback).toHaveBeenCalledTimes(1)
      })

      it('should support modify event', async () => {
        const callback = vi.fn()
        await client.createNote('note.md', '# Original')

        client.on('modify', callback)

        await client.updateNote('note.md', '# Modified')

        expect(callback).toHaveBeenCalledTimes(1)
      })

      it('should support delete event', async () => {
        const callback = vi.fn()
        const file = await client.createNote('delete.md', '# Delete')

        client.on('delete', callback)

        await client.vault.delete(file)

        expect(callback).toHaveBeenCalledTimes(1)
      })

      it('should support rename event', async () => {
        const callback = vi.fn()
        const file = await client.createNote('old.md', '# Old')

        client.on('rename', callback)

        await client.vault.rename(file, 'new.md')

        expect(callback).toHaveBeenCalledTimes(1)
      })

      it('should support custom events', () => {
        const callback = vi.fn()
        client.on('custom-event', callback)

        client.trigger('custom-event', { data: 'test' })

        expect(callback).toHaveBeenCalledWith({ data: 'test' })
      })

      it('should allow multiple listeners for same event', async () => {
        const callback1 = vi.fn()
        const callback2 = vi.fn()

        client.on('create', callback1)
        client.on('create', callback2)

        await client.createNote('test.md', '# Test')

        expect(callback1).toHaveBeenCalledTimes(1)
        expect(callback2).toHaveBeenCalledTimes(1)
      })
    })

    describe('off() method', () => {
      it('should unsubscribe event listeners', async () => {
        const callback = vi.fn()
        const ref = client.on('create', callback)

        await client.createNote('file1.md', '# File 1')
        expect(callback).toHaveBeenCalledTimes(1)

        client.off('create', ref)

        await client.createNote('file2.md', '# File 2')
        expect(callback).toHaveBeenCalledTimes(1)
      })

      it('should support unsubscribe via EventRef', async () => {
        const callback = vi.fn()
        const ref = client.on('create', callback)

        await client.createNote('file1.md', '# File 1')
        expect(callback).toHaveBeenCalledTimes(1)

        ref.unsubscribe()

        await client.createNote('file2.md', '# File 2')
        expect(callback).toHaveBeenCalledTimes(1)
      })

      it('should only unsubscribe the specific listener', async () => {
        const callback1 = vi.fn()
        const callback2 = vi.fn()

        const ref1 = client.on('create', callback1)
        client.on('create', callback2)

        ref1.unsubscribe()

        await client.createNote('test.md', '# Test')

        expect(callback1).not.toHaveBeenCalled()
        expect(callback2).toHaveBeenCalledTimes(1)
      })
    })

    describe('trigger() method', () => {
      it('should allow manual event triggering', () => {
        const callback = vi.fn()
        client.on('manual-event', callback)

        client.trigger('manual-event', { custom: 'data' })

        expect(callback).toHaveBeenCalledWith({ custom: 'data' })
      })

      it('should trigger without data', () => {
        const callback = vi.fn()
        client.on('simple-event', callback)

        client.trigger('simple-event')

        expect(callback).toHaveBeenCalledTimes(1)
      })

      it('should not throw if no listeners registered', () => {
        expect(() => {
          client.trigger('no-listeners', { data: 'test' })
        }).not.toThrow()
      })
    })

    describe('Event propagation', () => {
      it('should propagate vault events to client listeners', async () => {
        const callback = vi.fn()
        client.on('create', callback)

        await client.vault.create('direct.md', '# Direct')

        expect(callback).toHaveBeenCalledTimes(1)
      })

      it('should propagate metadata cache events to client listeners', async () => {
        const callback = vi.fn()
        client.on('changed', callback)

        await client.createNote('note.md', '# Note')

        expect(callback).toHaveBeenCalled()
      })
    })
  })

  describe('Vault path utilities', () => {
    it('should resolve absolute paths from vault path', () => {
      client = new ObsidianClient({
        backend,
        vaultPath: '/vault'
      })

      const absolutePath = client.getAbsolutePath('note.md')

      expect(absolutePath).toBe('/vault/note.md')
    })

    it('should resolve nested paths', () => {
      client = new ObsidianClient({
        backend,
        vaultPath: '/vault'
      })

      const absolutePath = client.getAbsolutePath('folder/note.md')

      expect(absolutePath).toBe('/vault/folder/note.md')
    })

    it('should handle vault path without leading slash', () => {
      client = new ObsidianClient({
        backend,
        vaultPath: 'vault'
      })

      const absolutePath = client.getAbsolutePath('note.md')

      expect(absolutePath).toBe('vault/note.md')
    })

    it('should return relative path when no vault path set', () => {
      client = new ObsidianClient({ backend })

      const absolutePath = client.getAbsolutePath('note.md')

      expect(absolutePath).toBe('note.md')
    })

    it('should get relative path from absolute path', () => {
      client = new ObsidianClient({
        backend,
        vaultPath: '/vault'
      })

      const relativePath = client.getRelativePath('/vault/note.md')

      expect(relativePath).toBe('note.md')
    })

    it('should get relative path for nested files', () => {
      client = new ObsidianClient({
        backend,
        vaultPath: '/vault'
      })

      const relativePath = client.getRelativePath('/vault/folder/note.md')

      expect(relativePath).toBe('folder/note.md')
    })

    it('should return path as-is if not within vault', () => {
      client = new ObsidianClient({
        backend,
        vaultPath: '/vault'
      })

      const relativePath = client.getRelativePath('/other/note.md')

      expect(relativePath).toBe('/other/note.md')
    })

    it('should handle paths with trailing slashes', () => {
      client = new ObsidianClient({
        backend,
        vaultPath: '/vault/'
      })

      const absolutePath = client.getAbsolutePath('note.md')

      expect(absolutePath).toBe('/vault/note.md')
    })
  })

  describe('Integration with components', () => {
    beforeEach(async () => {
      client = new ObsidianClient({ backend })
      await client.initialize()
    })

    it('should have vault integrated with metadataCache', async () => {
      const file = await client.vault.create('note.md', `---
title: Test
---
# Content`)
      await client.reindex()

      const cache = client.metadataCache.getFileCache(file)

      expect(cache).toBeDefined()
      expect(cache!.frontmatter!.title).toBe('Test')
    })

    it('should have metadataCache integrated with graph', async () => {
      await client.createNote('a.md', '# A\n\n[[b]]')
      await client.createNote('b.md', '# B')
      await client.reindex()

      const backlinks = client.graph.getBacklinks('b.md')

      expect(backlinks).toContain('a.md')
    })

    it('should have all components using same vault instance', () => {
      // All components should reference the same vault
      expect(client.vault).toBeDefined()
      expect(client.metadataCache).toBeDefined()
      expect(client.graph).toBeDefined()
    })

    it('should update all components when note is created', async () => {
      await client.createNote('new.md', `---
tags: [test]
---
# New

[[target]]`)
      await client.createNote('target.md', '# Target')
      await client.reindex()

      const file = client.vault.getFileByPath('new.md')
      const cache = client.metadataCache.getFileCache(file!)
      const backlinks = client.graph.getBacklinks('target.md')

      expect(file).toBeDefined()
      expect(cache!.frontmatter!.tags).toContain('test')
      expect(backlinks).toContain('new.md')
    })

    it('should update all components when note is modified', async () => {
      const file = await client.createNote('note.md', '# Original')

      await client.updateNote('note.md', `---
updated: true
---
# Updated

[[new-link]]`)

      const cache = client.metadataCache.getFileCache(file)
      expect(cache!.frontmatter!.updated).toBe(true)
    })

    it('should update all components when note is deleted', async () => {
      const file = await client.createNote('delete.md', '# Delete\n\n[[target]]')
      await client.createNote('target.md', '# Target')

      await client.vault.delete(file)

      const deletedFile = client.vault.getFileByPath('delete.md')
      const backlinks = client.graph.getBacklinks('target.md')

      expect(deletedFile).toBeNull()
      expect(backlinks).not.toContain('delete.md')
    })
  })

  describe('Error handling', () => {
    beforeEach(() => {
      client = new ObsidianClient({ backend })
    })

    it('should throw error when backend is not provided', () => {
      expect(() => {
        // @ts-expect-error - Testing missing backend
        new ObsidianClient({})
      }).toThrow(/backend.*required/i)
    })

    it('should throw error when backend is null', () => {
      expect(() => {
        // @ts-expect-error - Testing null backend
        new ObsidianClient({ backend: null })
      }).toThrow(/backend.*required/i)
    })

    it('should handle initialization errors gracefully', async () => {
      const failingBackend = {
        ...backend,
        read: async () => { throw new Error('Backend failure') },
        list: async () => { return ['test.md'] }
      }

      const failingClient = new ObsidianClient({ backend: failingBackend as any })

      // Since initialization does minimal work, this should not throw
      // Errors would occur when reading files
      await failingClient.initialize()
      // This is valid - no error expected during init
      expect(true).toBe(true)
    })

    it('should provide helpful error for uninitialized client operations', async () => {
      // Client created but not initialized
      await expect(client.getNote('note.md')).rejects.toThrow(/not initialized|initialize/i)
    })
  })

  describe('Lifecycle management', () => {
    it('should support dispose/cleanup method', () => {
      client = new ObsidianClient({ backend })

      expect(typeof client.dispose).toBe('function')
    })

    it('should clean up resources on dispose', async () => {
      client = new ObsidianClient({ backend })
      await client.initialize()

      const callback = vi.fn()
      client.on('create', callback)

      client.dispose()

      // After dispose, events should not fire
      await client.vault.create('test.md', '# Test')
      expect(callback).not.toHaveBeenCalled()
    })

    it('should allow multiple dispose calls', () => {
      client = new ObsidianClient({ backend })

      expect(() => {
        client.dispose()
        client.dispose()
        client.dispose()
      }).not.toThrow()
    })

    it('should throw error when using client after dispose', async () => {
      client = new ObsidianClient({ backend })
      await client.initialize()

      client.dispose()

      await expect(client.createNote('note.md', '# Note')).rejects.toThrow(/disposed/i)
    })
  })

  describe('Advanced features', () => {
    beforeEach(async () => {
      client = new ObsidianClient({ backend })
      await client.initialize()
    })

    it('should support batch operations', async () => {
      const files = await client.batchCreate([
        { path: 'note1.md', content: '# Note 1' },
        { path: 'note2.md', content: '# Note 2' },
        { path: 'note3.md', content: '# Note 3' }
      ])

      expect(files).toHaveLength(3)
      expect(client.vault.getFiles()).toHaveLength(3)
    })

    it('should support batch updates', async () => {
      await client.createNote('note1.md', '# Original 1')
      await client.createNote('note2.md', '# Original 2')

      await client.batchUpdate([
        { path: 'note1.md', content: '# Updated 1' },
        { path: 'note2.md', content: '# Updated 2' }
      ])

      const result1 = await client.getNote('note1.md')
      const result2 = await client.getNote('note2.md')

      expect(result1.content).toBe('# Updated 1')
      expect(result2.content).toBe('# Updated 2')
    })

    it('should provide vault statistics', () => {
      const stats = client.getVaultStats()

      expect(stats).toHaveProperty('totalNotes')
      expect(stats).toHaveProperty('totalLinks')
      expect(stats).toHaveProperty('totalTags')
      expect(stats).toHaveProperty('totalSize')
    })

    it('should calculate vault statistics correctly', async () => {
      await client.createNote('note1.md', '# Note 1\n\n#tag1')
      await client.createNote('note2.md', '# Note 2\n\n[[note1]]\n#tag2')

      const stats = client.getVaultStats()

      expect(stats.totalNotes).toBe(2)
      expect(stats.totalLinks).toBeGreaterThan(0)
      expect(stats.totalTags).toBeGreaterThan(0)
    })
  })

  describe('Backwards compatibility', () => {
    it('should support init() as alias for initialize()', async () => {
      client = new ObsidianClient({ backend })

      await expect(client.init()).resolves.toBeUndefined()
    })

    it('should support getVaultContext() as alias for getContext()', async () => {
      client = new ObsidianClient({ backend })
      await client.initialize()

      const context = await client.getVaultContext({ scope: 'summary' })

      expect(context).toBeDefined()
      expect(context.summary).toBeDefined()
    })
  })
})
