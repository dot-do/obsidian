import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { MetadataCache } from '../../src/metadata/cache.js'
import { Vault } from '../../src/vault/vault.js'
import { MemoryBackend } from '../../src/vault/memory-backend.js'
import type { TFile, CachedMetadata, EventRef } from '../../src/types.js'

describe('MetadataCache Event System (obsidian-m8a)', () => {
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

  describe('Event emission on cache updates', () => {
    it('should emit cache-update event when file is indexed for the first time', async () => {
      const callback = vi.fn()
      cache.on('cache-update', callback)

      await vault.create('test.md', '# Test\n\n[[link]]')
      await cache.indexFile(vault.getFileByPath('test.md')!)

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'test.md' }),
        expect.objectContaining({ links: expect.any(Array) }),
        null
      )
    })

    it('should emit cache-update event when file metadata changes', async () => {
      await vault.create('test.md', '# Original')
      const file = vault.getFileByPath('test.md')!
      await cache.indexFile(file)

      const callback = vi.fn()
      cache.on('cache-update', callback)

      await vault.modify(file, '# Modified\n\n[[new-link]]')
      await cache.indexFile(file)

      expect(callback).toHaveBeenCalledTimes(1)
      const [emittedFile, metadata] = callback.mock.calls[0] as [TFile, CachedMetadata]
      expect(emittedFile.path).toBe('test.md')
      expect(metadata.links).toHaveLength(1)
      expect(metadata.links?.[0].link).toBe('new-link')
    })

    it('should emit cache-update with previous metadata', async () => {
      await vault.create('test.md', '# Original\n\n[[old-link]]')
      const file = vault.getFileByPath('test.md')!
      await cache.indexFile(file)

      const callback = vi.fn()
      cache.on('cache-update', callback)

      await vault.modify(file, '# Modified\n\n[[new-link]]')
      await cache.indexFile(file)

      expect(callback).toHaveBeenCalledTimes(1)
      const [, newMetadata, oldMetadata] = callback.mock.calls[0] as [TFile, CachedMetadata, CachedMetadata | null]

      expect(newMetadata.links?.[0].link).toBe('new-link')
      expect(oldMetadata?.links?.[0].link).toBe('old-link')
    })

    it('should emit cache-update event with null old metadata for new files', async () => {
      const callback = vi.fn()
      cache.on('cache-update', callback)

      await vault.create('new.md', '# New')
      const file = vault.getFileByPath('new.md')!
      await cache.indexFile(file)

      expect(callback).toHaveBeenCalledTimes(1)
      const [, , oldMetadata] = callback.mock.calls[0] as [TFile, CachedMetadata, CachedMetadata | null]
      expect(oldMetadata).toBeNull()
    })

    it('should not emit cache-update if metadata has not changed', async () => {
      await vault.create('test.md', '# Unchanged')
      const file = vault.getFileByPath('test.md')!
      await cache.indexFile(file)

      const callback = vi.fn()
      cache.on('cache-update', callback)

      // Re-index without changes
      await cache.indexFile(file)

      expect(callback).not.toHaveBeenCalled()
    })

    it('should emit cache-clear event when cache entry is removed', async () => {
      await vault.create('test.md', '# Test')
      const file = vault.getFileByPath('test.md')!
      await cache.indexFile(file)

      const callback = vi.fn()
      cache.on('cache-clear', callback)

      await vault.delete(file)
      cache.clearCache(file)

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(file)
    })
  })

  describe('Event subscriptions', () => {
    it('should return EventRef from on() method', () => {
      const callback = vi.fn()
      const ref = cache.on('cache-update', callback)

      expect(ref).toBeDefined()
      expect(typeof ref).toBe('object')
      expect(typeof ref.unsubscribe).toBe('function')
    })

    it('should support multiple listeners for the same event', async () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()
      const callback3 = vi.fn()

      cache.on('cache-update', callback1)
      cache.on('cache-update', callback2)
      cache.on('cache-update', callback3)

      await vault.create('test.md', '# Test')
      const file = vault.getFileByPath('test.md')!
      await cache.indexFile(file)

      expect(callback1).toHaveBeenCalledTimes(1)
      expect(callback2).toHaveBeenCalledTimes(1)
      expect(callback3).toHaveBeenCalledTimes(1)
    })

    it('should stop receiving events after unsubscribe', async () => {
      const callback = vi.fn()
      const ref = cache.on('cache-update', callback)

      await vault.create('first.md', '# First')
      let file = vault.getFileByPath('first.md')!
      await cache.indexFile(file)

      expect(callback).toHaveBeenCalledTimes(1)

      ref.unsubscribe()

      await vault.create('second.md', '# Second')
      file = vault.getFileByPath('second.md')!
      await cache.indexFile(file)

      expect(callback).toHaveBeenCalledTimes(1) // Still 1, not 2
    })

    it('should support off() method for unsubscription', async () => {
      const callback = vi.fn()
      const ref = cache.on('cache-update', callback)

      await vault.create('test.md', '# Test')
      let file = vault.getFileByPath('test.md')!
      await cache.indexFile(file)

      expect(callback).toHaveBeenCalledTimes(1)

      cache.off('cache-update', ref)

      await vault.modify(file, '# Modified')
      await cache.indexFile(file)

      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('should call listeners in registration order', async () => {
      const order: number[] = []

      cache.on('cache-update', () => order.push(1))
      cache.on('cache-update', () => order.push(2))
      cache.on('cache-update', () => order.push(3))

      await vault.create('test.md', '# Test')
      const file = vault.getFileByPath('test.md')!
      await cache.indexFile(file)

      expect(order).toEqual([1, 2, 3])
    })

    it('should continue calling listeners even if one throws', async () => {
      const callback1 = vi.fn()
      const throwingCallback = vi.fn(() => { throw new Error('Listener error') })
      const callback3 = vi.fn()

      cache.on('cache-update', callback1)
      cache.on('cache-update', throwingCallback)
      cache.on('cache-update', callback3)

      await vault.create('test.md', '# Test')
      const file = vault.getFileByPath('test.md')!
      await cache.indexFile(file)

      expect(callback1).toHaveBeenCalledTimes(1)
      expect(throwingCallback).toHaveBeenCalledTimes(1)
      expect(callback3).toHaveBeenCalledTimes(1)
    })
  })

  describe('File change event handling', () => {
    it('should handle vault create event and emit cache-update', async () => {
      const callback = vi.fn()
      cache.on('cache-update', callback)

      // Create file through vault - cache should auto-index
      await vault.create('auto.md', '# Auto-indexed')

      // Wait for async indexing
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'auto.md' }),
        expect.any(Object),
        null
      )
    })

    it('should handle vault modify event and emit cache-update', async () => {
      await vault.create('test.md', '# Original')
      const file = vault.getFileByPath('test.md')!

      // Wait for initial indexing
      await new Promise(resolve => setTimeout(resolve, 50))

      const callback = vi.fn()
      cache.on('cache-update', callback)

      await vault.modify(file, '# Modified\n\n[[link]]')

      // Wait for re-indexing
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callback).toHaveBeenCalledTimes(1)
      const [, metadata] = callback.mock.calls[0] as [TFile, CachedMetadata, CachedMetadata | null]
      expect(metadata.links).toHaveLength(1)
    })

    it('should handle vault delete event and emit cache-clear', async () => {
      await vault.create('test.md', '# Test')
      const file = vault.getFileByPath('test.md')!

      // Wait for initial indexing
      await new Promise(resolve => setTimeout(resolve, 50))

      const callback = vi.fn()
      cache.on('cache-clear', callback)

      await vault.delete(file)

      // Wait for cache clear
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ path: 'test.md' }))
    })

    it('should handle vault rename event and update cache keys', async () => {
      await vault.create('old.md', '# Old Name')
      const file = vault.getFileByPath('old.md')!

      // Wait for initial indexing
      await new Promise(resolve => setTimeout(resolve, 50))

      const updateCallback = vi.fn()
      const clearCallback = vi.fn()
      cache.on('cache-update', updateCallback)
      cache.on('cache-clear', clearCallback)

      await vault.rename(file, 'new.md')

      // Wait for re-indexing
      await new Promise(resolve => setTimeout(resolve, 50))

      // Should clear old entry and create new one
      expect(clearCallback).toHaveBeenCalledWith(expect.objectContaining({ path: 'old.md' }))
      expect(updateCallback).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'new.md' }),
        expect.any(Object),
        null
      )
    })

    it('should track changes to link counts on file modifications', async () => {
      await vault.create('target.md', '# Target')
      await vault.create('source.md', '[[target]]')

      // Wait for initial indexing
      await new Promise(resolve => setTimeout(resolve, 100))

      const callback = vi.fn()
      cache.on('links-changed', callback)

      const source = vault.getFileByPath('source.md')!
      await vault.modify(source, '[[target]] [[target]] [[target]]')

      // Wait for re-indexing
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(callback).toHaveBeenCalled()
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ path: 'source.md' }))
    })
  })

  describe('Batch event notifications', () => {
    it('should batch multiple rapid cache updates', async () => {
      const callback = vi.fn()
      cache.on('cache-batch-complete', callback)

      // Create multiple files in quick succession
      await Promise.all([
        vault.create('batch1.md', '# Batch 1'),
        vault.create('batch2.md', '# Batch 2'),
        vault.create('batch3.md', '# Batch 3'),
        vault.create('batch4.md', '# Batch 4'),
        vault.create('batch5.md', '# Batch 5')
      ])

      // Wait for batch processing
      await new Promise(resolve => setTimeout(resolve, 150))

      // Should emit batch-complete event after all are processed
      expect(callback).toHaveBeenCalled()
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          filesProcessed: 5,
          duration: expect.any(Number)
        })
      )
    })

    it('should collect all files in batch operation', async () => {
      let batchFiles: TFile[] = []
      cache.on('cache-batch-complete', (info: { files: TFile[] }) => {
        batchFiles = info.files
      })

      await Promise.all([
        vault.create('file1.md', '# File 1'),
        vault.create('file2.md', '# File 2'),
        vault.create('file3.md', '# File 3')
      ])

      // Wait for batch processing
      await new Promise(resolve => setTimeout(resolve, 150))

      expect(batchFiles).toHaveLength(3)
      expect(batchFiles.map(f => f.path)).toContain('file1.md')
      expect(batchFiles.map(f => f.path)).toContain('file2.md')
      expect(batchFiles.map(f => f.path)).toContain('file3.md')
    })

    it('should emit individual cache-update events within a batch', async () => {
      const individualCallback = vi.fn()
      const batchCallback = vi.fn()

      cache.on('cache-update', individualCallback)
      cache.on('cache-batch-complete', batchCallback)

      await Promise.all([
        vault.create('batch1.md', '# Batch 1'),
        vault.create('batch2.md', '# Batch 2'),
        vault.create('batch3.md', '# Batch 3')
      ])

      // Wait for batch processing
      await new Promise(resolve => setTimeout(resolve, 150))

      // Individual events should fire for each file
      expect(individualCallback).toHaveBeenCalledTimes(3)
      // Batch complete should fire once
      expect(batchCallback).toHaveBeenCalledTimes(1)
    })

    it('should debounce batch events when files are created gradually', async () => {
      const callback = vi.fn()
      cache.on('cache-batch-complete', callback)

      // Create files with small delays between them
      await vault.create('file1.md', '# File 1')
      await new Promise(resolve => setTimeout(resolve, 20))
      await vault.create('file2.md', '# File 2')
      await new Promise(resolve => setTimeout(resolve, 20))
      await vault.create('file3.md', '# File 3')

      // Wait for batch window to close
      await new Promise(resolve => setTimeout(resolve, 200))

      // Should still batch them together if within debounce window
      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('should support configurable batch window size', async () => {
      // Set batch window to 100ms
      cache.setBatchWindow(100)

      const callback = vi.fn()
      cache.on('cache-batch-complete', callback)

      await vault.create('file1.md', '# File 1')

      // Wait less than batch window
      await new Promise(resolve => setTimeout(resolve, 50))
      await vault.create('file2.md', '# File 2')

      // Wait for batch window to close
      await new Promise(resolve => setTimeout(resolve, 100))

      // Should batch both files together
      const callArg = callback.mock.calls[0][0] as { filesProcessed: number }
      expect(callArg.filesProcessed).toBe(2)
    })

    it('should handle empty batches gracefully', async () => {
      const callback = vi.fn()
      cache.on('cache-batch-complete', callback)

      // Trigger batch processing with no files
      cache.flushBatch()

      expect(callback).not.toHaveBeenCalled()
    })

    it('should allow manual batch flushing', async () => {
      const callback = vi.fn()
      cache.on('cache-batch-complete', callback)

      await vault.create('file1.md', '# File 1')
      await vault.create('file2.md', '# File 2')

      // Manually flush before batch window closes
      cache.flushBatch()

      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('should emit batch statistics with timing information', async () => {
      let batchStats: { filesProcessed: number; duration: number; averageTime: number } | null = null

      cache.on('cache-batch-complete', (stats: { filesProcessed: number; duration: number; averageTime: number }) => {
        batchStats = stats
      })

      await Promise.all([
        vault.create('stats1.md', '# Stats 1'),
        vault.create('stats2.md', '# Stats 2'),
        vault.create('stats3.md', '# Stats 3')
      ])

      // Wait for batch processing
      await new Promise(resolve => setTimeout(resolve, 150))

      expect(batchStats).not.toBeNull()
      expect(batchStats?.filesProcessed).toBe(3)
      expect(batchStats?.duration).toBeGreaterThan(0)
      expect(batchStats?.averageTime).toBeGreaterThan(0)
    })
  })

  describe('Event system edge cases', () => {
    it('should handle unsubscribe during event callback', async () => {
      const order: number[] = []
      let ref2: EventRef

      cache.on('cache-update', () => order.push(1))
      ref2 = cache.on('cache-update', () => {
        order.push(2)
        ref2.unsubscribe() // Unsubscribe self during callback
      })
      cache.on('cache-update', () => order.push(3))

      await vault.create('file1.md', '# File 1')
      const file1 = vault.getFileByPath('file1.md')!
      await cache.indexFile(file1)

      await vault.create('file2.md', '# File 2')
      const file2 = vault.getFileByPath('file2.md')!
      await cache.indexFile(file2)

      // First indexing: all three fire
      // Second indexing: only 1 and 3 fire (2 unsubscribed itself)
      expect(order).toEqual([1, 2, 3, 1, 3])
    })

    it('should handle subscribing new listener during event callback', async () => {
      const order: number[] = []

      cache.on('cache-update', () => {
        order.push(1)
        // Subscribe new listener during callback
        cache.on('cache-update', () => order.push('late'))
      })
      cache.on('cache-update', () => order.push(2))

      await vault.create('file1.md', '# File 1')
      const file1 = vault.getFileByPath('file1.md')!
      await cache.indexFile(file1)

      await vault.create('file2.md', '# File 2')
      const file2 = vault.getFileByPath('file2.md')!
      await cache.indexFile(file2)

      // New listener should be called on second event
      expect(order).toContain(1)
      expect(order).toContain(2)
      expect(order).toContain('late')
    })

    it('should not emit events for non-markdown files', async () => {
      const callback = vi.fn()
      cache.on('cache-update', callback)

      await vault.create('image.png', 'binary-data')
      await vault.create('data.json', '{"key": "value"}')

      // Wait for potential indexing attempts
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callback).not.toHaveBeenCalled()
    })

    it('should handle multiple unsubscribe calls gracefully', () => {
      const callback = vi.fn()
      const ref = cache.on('cache-update', callback)

      ref.unsubscribe()
      ref.unsubscribe() // Second call
      ref.unsubscribe() // Third call

      // Should not throw
      expect(() => ref.unsubscribe()).not.toThrow()
    })

    it('should handle rapid file modifications without losing events', async () => {
      const events: string[] = []
      cache.on('cache-update', (file: TFile) => {
        events.push(file.path)
      })

      const file = await vault.create('rapid.md', '# V1')

      // Rapid modifications
      await cache.indexFile(file)
      await vault.modify(file, '# V2')
      await cache.indexFile(file)
      await vault.modify(file, '# V3')
      await cache.indexFile(file)
      await vault.modify(file, '# V4')
      await cache.indexFile(file)

      // All modifications should emit events
      expect(events.filter(e => e === 'rapid.md').length).toBe(4)
    })

    it('should support custom event types', () => {
      const callback = vi.fn()
      cache.on('custom-event', callback)

      cache.trigger('custom-event', { customData: 'test' })

      expect(callback).toHaveBeenCalledWith({ customData: 'test' })
    })

    it('should handle large number of subscribers efficiently', async () => {
      const callbacks: any[] = []

      // Register 100 listeners
      for (let i = 0; i < 100; i++) {
        const cb = vi.fn()
        callbacks.push(cb)
        cache.on('cache-update', cb)
      }

      await vault.create('test.md', '# Test')
      const file = vault.getFileByPath('test.md')!
      await cache.indexFile(file)

      // All should be called
      callbacks.forEach(cb => {
        expect(cb).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('Event system API completeness', () => {
    it('should expose on() method', () => {
      expect(typeof cache.on).toBe('function')
    })

    it('should expose off() method', () => {
      expect(typeof cache.off).toBe('function')
    })

    it('should expose trigger() method', () => {
      expect(typeof cache.trigger).toBe('function')
    })

    it('should expose clearCache() method', () => {
      expect(typeof cache.clearCache).toBe('function')
    })

    it('should expose setBatchWindow() method', () => {
      expect(typeof cache.setBatchWindow).toBe('function')
    })

    it('should expose flushBatch() method', () => {
      expect(typeof cache.flushBatch).toBe('function')
    })

    it('should support standard event names', () => {
      const eventNames = [
        'cache-update',
        'cache-clear',
        'links-changed',
        'cache-batch-complete'
      ]

      eventNames.forEach(eventName => {
        expect(() => {
          const ref = cache.on(eventName, () => {})
          ref.unsubscribe()
        }).not.toThrow()
      })
    })
  })
})
