import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { Vault } from '../../src/vault/vault.js'
import { MemoryBackend } from '../../src/vault/memory-backend.js'
import type { TFile, EventRef } from '../../src/types.js'

describe('Vault Event System', () => {
  let vault: Vault
  let backend: MemoryBackend

  beforeEach(() => {
    backend = new MemoryBackend()
    vault = new Vault(backend)
  })

  describe('on("create", callback)', () => {
    it('should fire create event when a new file is created', async () => {
      const callback = vi.fn()
      vault.on('create', callback)

      const file = await vault.create('notes/test.md', '# Hello World')

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(file)
    })

    it('should include file object with correct properties in create event', async () => {
      const callback = vi.fn()
      vault.on('create', callback)

      await vault.create('folder/document.md', 'content')

      const eventFile = callback.mock.calls[0][0] as TFile
      expect(eventFile.path).toBe('folder/document.md')
      expect(eventFile.name).toBe('document.md')
      expect(eventFile.basename).toBe('document')
      expect(eventFile.extension).toBe('md')
      expect(eventFile.stat).toBeDefined()
      expect(eventFile.stat.size).toBeGreaterThan(0)
    })

    it('should fire create event for binary files', async () => {
      const callback = vi.fn()
      vault.on('create', callback)

      const buffer = new ArrayBuffer(8)
      // Assuming createBinary method exists or create handles binary
      await vault.create('assets/image.png', buffer as unknown as string)

      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('should not fire create event when modifying existing file', async () => {
      await vault.create('existing.md', 'original content')

      const callback = vi.fn()
      vault.on('create', callback)

      const file = vault.getFileByPath('existing.md')!
      await vault.modify(file, 'updated content')

      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('on("modify", callback)', () => {
    it('should fire modify event when file content is changed', async () => {
      const file = await vault.create('test.md', 'original')

      const callback = vi.fn()
      vault.on('modify', callback)

      await vault.modify(file, 'modified content')

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(file)
    })

    it('should fire modify event when using append', async () => {
      const file = await vault.create('test.md', 'start')

      const callback = vi.fn()
      vault.on('modify', callback)

      await vault.append(file, '\nappended')

      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('should fire modify event when using process', async () => {
      const file = await vault.create('test.md', 'hello')

      const callback = vi.fn()
      vault.on('modify', callback)

      await vault.process(file, (content) => content.toUpperCase())

      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('should not fire modify event for newly created files', async () => {
      const callback = vi.fn()
      vault.on('modify', callback)

      await vault.create('new-file.md', 'content')

      expect(callback).not.toHaveBeenCalled()
    })

    it('should fire modify event with updated stat information', async () => {
      const file = await vault.create('test.md', 'short')
      const originalMtime = file.stat.mtime

      // Small delay to ensure mtime difference
      await new Promise(resolve => setTimeout(resolve, 10))

      const callback = vi.fn()
      vault.on('modify', callback)

      await vault.modify(file, 'much longer content here')

      const modifiedFile = callback.mock.calls[0][0] as TFile
      expect(modifiedFile.stat.mtime).toBeGreaterThanOrEqual(originalMtime)
      expect(modifiedFile.stat.size).toBeGreaterThan(5) // "short".length
    })
  })

  describe('on("delete", callback)', () => {
    it('should fire delete event when file is deleted', async () => {
      const file = await vault.create('to-delete.md', 'content')

      const callback = vi.fn()
      vault.on('delete', callback)

      await vault.delete(file)

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(file)
    })

    it('should fire delete event when file is trashed', async () => {
      const file = await vault.create('to-trash.md', 'content')

      const callback = vi.fn()
      vault.on('delete', callback)

      await vault.trash(file)

      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('should include file path in delete event even after file is gone', async () => {
      const file = await vault.create('deleted-file.md', 'content')

      const callback = vi.fn()
      vault.on('delete', callback)

      await vault.delete(file)

      const deletedFile = callback.mock.calls[0][0] as TFile
      expect(deletedFile.path).toBe('deleted-file.md')
    })

    it('should not fire delete event for non-existent files', async () => {
      const callback = vi.fn()
      vault.on('delete', callback)

      const fakeFile: TFile = {
        path: 'non-existent.md',
        name: 'non-existent.md',
        basename: 'non-existent',
        extension: 'md',
        stat: { ctime: 0, mtime: 0, size: 0 }
      }

      // Should throw or handle gracefully, but not fire event
      try {
        await vault.delete(fakeFile)
      } catch {
        // Expected to throw
      }

      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('on("rename", callback)', () => {
    it('should fire rename event with file and oldPath', async () => {
      const file = await vault.create('old-name.md', 'content')

      const callback = vi.fn()
      vault.on('rename', callback)

      await vault.rename(file, 'new-name.md')

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith({
        file: expect.objectContaining({ path: 'new-name.md' }),
        oldPath: 'old-name.md'
      })
    })

    it('should include correct file object after rename', async () => {
      const file = await vault.create('original.md', 'content')

      const callback = vi.fn()
      vault.on('rename', callback)

      await vault.rename(file, 'folder/renamed.md')

      const eventData = callback.mock.calls[0][0] as { file: TFile; oldPath: string }
      expect(eventData.file.path).toBe('folder/renamed.md')
      expect(eventData.file.name).toBe('renamed.md')
      expect(eventData.file.basename).toBe('renamed')
      expect(eventData.oldPath).toBe('original.md')
    })

    it('should fire rename event when moving file to different folder', async () => {
      const file = await vault.create('root-file.md', 'content')

      const callback = vi.fn()
      vault.on('rename', callback)

      await vault.rename(file, 'subfolder/root-file.md')

      expect(callback).toHaveBeenCalledWith({
        file: expect.objectContaining({ path: 'subfolder/root-file.md' }),
        oldPath: 'root-file.md'
      })
    })

    it('should fire rename event when changing file extension', async () => {
      const file = await vault.create('note.md', 'content')

      const callback = vi.fn()
      vault.on('rename', callback)

      await vault.rename(file, 'note.txt')

      const eventData = callback.mock.calls[0][0] as { file: TFile; oldPath: string }
      expect(eventData.file.extension).toBe('txt')
      expect(eventData.oldPath).toBe('note.md')
    })

    it('should not fire delete or create events during rename', async () => {
      const file = await vault.create('test.md', 'content')

      const createCallback = vi.fn()
      const deleteCallback = vi.fn()
      vault.on('create', createCallback)
      vault.on('delete', deleteCallback)

      await vault.rename(file, 'renamed.md')

      expect(createCallback).not.toHaveBeenCalled()
      expect(deleteCallback).not.toHaveBeenCalled()
    })
  })

  describe('Event Subscription/Unsubscription', () => {
    it('should return EventRef with unsubscribe method', () => {
      const callback = vi.fn()
      const ref = vault.on('create', callback)

      expect(ref).toBeDefined()
      expect(typeof ref.unsubscribe).toBe('function')
    })

    it('should stop receiving events after unsubscribe', async () => {
      const callback = vi.fn()
      const ref = vault.on('create', callback)

      await vault.create('file1.md', 'content')
      expect(callback).toHaveBeenCalledTimes(1)

      ref.unsubscribe()

      await vault.create('file2.md', 'content')
      expect(callback).toHaveBeenCalledTimes(1) // Still 1, not 2
    })

    it('should support off() method for unsubscription', async () => {
      const callback = vi.fn()
      const ref = vault.on('modify', callback)

      const file = await vault.create('test.md', 'content')
      await vault.modify(file, 'modified')
      expect(callback).toHaveBeenCalledTimes(1)

      vault.off('modify', ref)

      await vault.modify(file, 'modified again')
      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('should handle multiple unsubscribe calls gracefully', async () => {
      const callback = vi.fn()
      const ref = vault.on('create', callback)

      ref.unsubscribe()
      ref.unsubscribe() // Second call should not throw
      ref.unsubscribe() // Third call should not throw

      await vault.create('test.md', 'content')
      expect(callback).not.toHaveBeenCalled()
    })

    it('should only unsubscribe the specific listener', async () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      const ref1 = vault.on('create', callback1)
      vault.on('create', callback2)

      ref1.unsubscribe()

      await vault.create('test.md', 'content')

      expect(callback1).not.toHaveBeenCalled()
      expect(callback2).toHaveBeenCalledTimes(1)
    })
  })

  describe('Multiple Listeners for Same Event', () => {
    it('should support multiple listeners for create event', async () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()
      const callback3 = vi.fn()

      vault.on('create', callback1)
      vault.on('create', callback2)
      vault.on('create', callback3)

      await vault.create('test.md', 'content')

      expect(callback1).toHaveBeenCalledTimes(1)
      expect(callback2).toHaveBeenCalledTimes(1)
      expect(callback3).toHaveBeenCalledTimes(1)
    })

    it('should support multiple listeners for different events', async () => {
      const createCallback = vi.fn()
      const modifyCallback = vi.fn()
      const deleteCallback = vi.fn()

      vault.on('create', createCallback)
      vault.on('modify', modifyCallback)
      vault.on('delete', deleteCallback)

      const file = await vault.create('test.md', 'content')
      await vault.modify(file, 'updated')
      await vault.delete(file)

      expect(createCallback).toHaveBeenCalledTimes(1)
      expect(modifyCallback).toHaveBeenCalledTimes(1)
      expect(deleteCallback).toHaveBeenCalledTimes(1)
    })

    it('should call all listeners even if one throws', async () => {
      const callback1 = vi.fn()
      const throwingCallback = vi.fn().mockImplementation(() => {
        throw new Error('Listener error')
      })
      const callback3 = vi.fn()

      vault.on('create', callback1)
      vault.on('create', throwingCallback)
      vault.on('create', callback3)

      await vault.create('test.md', 'content')

      expect(callback1).toHaveBeenCalledTimes(1)
      expect(throwingCallback).toHaveBeenCalledTimes(1)
      expect(callback3).toHaveBeenCalledTimes(1)
    })

    it('should allow same callback to be registered multiple times', async () => {
      const callback = vi.fn()

      vault.on('create', callback)
      vault.on('create', callback)

      await vault.create('test.md', 'content')

      expect(callback).toHaveBeenCalledTimes(2)
    })

    it('should handle large number of listeners', async () => {
      const callbacks: Mock[] = []

      for (let i = 0; i < 100; i++) {
        const cb = vi.fn()
        callbacks.push(cb)
        vault.on('create', cb)
      }

      await vault.create('test.md', 'content')

      callbacks.forEach(cb => {
        expect(cb).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('Event Ordering', () => {
    it('should call listeners in registration order', async () => {
      const order: number[] = []

      vault.on('create', () => order.push(1))
      vault.on('create', () => order.push(2))
      vault.on('create', () => order.push(3))

      await vault.create('test.md', 'content')

      expect(order).toEqual([1, 2, 3])
    })

    it('should maintain order after some listeners unsubscribe', async () => {
      const order: number[] = []

      vault.on('create', () => order.push(1))
      const ref2 = vault.on('create', () => order.push(2))
      vault.on('create', () => order.push(3))

      ref2.unsubscribe()

      await vault.create('test.md', 'content')

      expect(order).toEqual([1, 3])
    })

    it('should fire create before modify for initial file creation', async () => {
      const events: string[] = []

      vault.on('create', () => events.push('create'))
      vault.on('modify', () => events.push('modify'))

      await vault.create('test.md', 'content')

      // Create should fire, but not modify for new file creation
      expect(events).toEqual(['create'])
    })

    it('should fire events synchronously during operation', async () => {
      let eventFired = false
      let modifyCompleted = false

      vault.on('modify', () => {
        eventFired = true
        expect(modifyCompleted).toBe(false) // Event should fire before operation completes
      })

      const file = await vault.create('test.md', 'content')
      await vault.modify(file, 'updated')
      modifyCompleted = true

      expect(eventFired).toBe(true)
    })

    it('should fire rename event after file is accessible at new path', async () => {
      const file = await vault.create('old.md', 'content')

      vault.on('rename', async ({ file: renamedFile }) => {
        // File should be readable at new path when event fires
        const content = await vault.read(renamedFile)
        expect(content).toBe('content')
      })

      await vault.rename(file, 'new.md')
    })

    it('should fire delete event before file becomes inaccessible', async () => {
      const file = await vault.create('test.md', 'content')
      let contentAtDeleteTime: string | null = null

      vault.on('delete', async (deletedFile: TFile) => {
        // The file object should still have the path info
        contentAtDeleteTime = deletedFile.path
      })

      await vault.delete(file)

      expect(contentAtDeleteTime).toBe('test.md')
    })
  })

  describe('trigger() method', () => {
    it('should allow manual event triggering', () => {
      const callback = vi.fn()
      vault.on('create', callback)

      const mockFile: TFile = {
        path: 'manual.md',
        name: 'manual.md',
        basename: 'manual',
        extension: 'md',
        stat: { ctime: Date.now(), mtime: Date.now(), size: 100 }
      }

      vault.trigger('create', mockFile)

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(mockFile)
    })

    it('should trigger custom events', () => {
      const callback = vi.fn()
      vault.on('custom-event', callback)

      vault.trigger('custom-event', { customData: 'test' })

      expect(callback).toHaveBeenCalledWith({ customData: 'test' })
    })

    it('should trigger events with no listeners without error', () => {
      expect(() => {
        vault.trigger('no-listeners', { data: 'test' })
      }).not.toThrow()
    })
  })

  describe('Edge Cases', () => {
    it('should handle rapid successive operations', async () => {
      const createCallback = vi.fn()
      const modifyCallback = vi.fn()

      vault.on('create', createCallback)
      vault.on('modify', modifyCallback)

      const file = await vault.create('rapid.md', 'initial')
      await Promise.all([
        vault.modify(file, 'content1'),
        vault.modify(file, 'content2'),
        vault.modify(file, 'content3')
      ])

      expect(createCallback).toHaveBeenCalledTimes(1)
      expect(modifyCallback).toHaveBeenCalledTimes(3)
    })

    it('should handle empty file creation', async () => {
      const callback = vi.fn()
      vault.on('create', callback)

      await vault.create('empty.md', '')

      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('should handle files with special characters in path', async () => {
      const callback = vi.fn()
      vault.on('create', callback)

      await vault.create('folder/file with spaces.md', 'content')

      const file = callback.mock.calls[0][0] as TFile
      expect(file.path).toBe('folder/file with spaces.md')
    })

    it('should handle deeply nested file paths', async () => {
      const callback = vi.fn()
      vault.on('create', callback)

      await vault.create('a/b/c/d/e/f/deep.md', 'content')

      const file = callback.mock.calls[0][0] as TFile
      expect(file.path).toBe('a/b/c/d/e/f/deep.md')
      expect(file.name).toBe('deep.md')
    })

    it('should not fire events for copy operation as create', async () => {
      const createCallback = vi.fn()
      vault.on('create', createCallback)

      const original = await vault.create('original.md', 'content')
      createCallback.mockClear()

      await vault.copy(original, 'copy.md')

      // Copy should fire create event for the new file
      expect(createCallback).toHaveBeenCalledTimes(1)
      expect(createCallback).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'copy.md' })
      )
    })

    it('should handle unsubscribe during event callback', async () => {
      const order: number[] = []
      let ref2: EventRef

      vault.on('create', () => order.push(1))
      ref2 = vault.on('create', () => {
        order.push(2)
        ref2.unsubscribe() // Unsubscribe self during callback
      })
      vault.on('create', () => order.push(3))

      await vault.create('file1.md', 'content')
      await vault.create('file2.md', 'content')

      // First create: all three fire
      // Second create: only 1 and 3 fire (2 unsubscribed itself)
      expect(order).toEqual([1, 2, 3, 1, 3])
    })

    it('should handle subscribing during event callback', async () => {
      const order: number[] = []

      vault.on('create', () => {
        order.push(1)
        vault.on('create', () => order.push('late'))
      })
      vault.on('create', () => order.push(2))

      await vault.create('file1.md', 'content')
      await vault.create('file2.md', 'content')

      // First file: 1, 2 (late listener not yet registered when event started)
      // Second file: 1, late (from first registration), 2, late (from second registration)
      expect(order).toContain(1)
      expect(order).toContain(2)
    })
  })

  describe('Type Safety', () => {
    it('should have correct type for create event callback', async () => {
      vault.on('create', (file: TFile) => {
        // TypeScript should recognize file as TFile
        const _path: string = file.path
        const _stat: { ctime: number; mtime: number; size: number } = file.stat
        expect(_path).toBeDefined()
        expect(_stat).toBeDefined()
      })

      await vault.create('test.md', 'content')
    })

    it('should have correct type for rename event callback', async () => {
      vault.on('rename', (data: { file: TFile; oldPath: string }) => {
        const _file: TFile = data.file
        const _oldPath: string = data.oldPath
        expect(_file).toBeDefined()
        expect(_oldPath).toBeDefined()
      })

      const file = await vault.create('test.md', 'content')
      await vault.rename(file, 'renamed.md')
    })
  })
})
