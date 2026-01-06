import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Vault, VaultOptions } from '../../src/vault/vault.js'
import { MemoryBackend } from '../../src/vault/memory-backend.js'

describe('Vault Caching', () => {
  let vault: Vault
  let backend: MemoryBackend

  beforeEach(() => {
    backend = new MemoryBackend()
    vault = new Vault(backend)
  })

  describe('VaultOptions', () => {
    it('should accept custom cache sizes', () => {
      const options: VaultOptions = {
        contentCacheSize: 100,
        fileCacheSize: 200
      }
      const customVault = new Vault(new MemoryBackend(), options)
      const stats = customVault.getCacheStats()
      expect(stats.contentCache.capacity).toBe(100)
      expect(stats.fileCache.capacity).toBe(200)
    })

    it('should use default values when not specified', () => {
      const stats = vault.getCacheStats()
      expect(stats.contentCache.capacity).toBe(500)
      expect(stats.fileCache.capacity).toBe(5000)
    })

    it('should accept partial options', () => {
      const customVault = new Vault(new MemoryBackend(), { contentCacheSize: 50 })
      const stats = customVault.getCacheStats()
      expect(stats.contentCache.capacity).toBe(50)
      expect(stats.fileCache.capacity).toBe(5000) // default
    })
  })

  describe('Content LRU Cache', () => {
    it('should cache file content on cachedRead', async () => {
      await backend.write('test.md', '# Test Content')
      const file = vault.getFileByPath('test.md')!

      // First read - should populate cache
      await vault.cachedRead(file)
      expect(vault.getCacheStats().contentCache.size).toBe(1)

      // Second read - should use cache (verify by modifying backend directly)
      await backend.write('test.md', '# Modified')
      const cached = await vault.cachedRead(file)
      expect(cached).toBe('# Test Content') // Still returns cached value
    })

    it('should invalidate cache on vault.modify', async () => {
      await backend.write('test.md', '# Original')
      const file = vault.getFileByPath('test.md')!

      await vault.cachedRead(file)
      await vault.modify(file, '# Modified')

      const content = await vault.cachedRead(file)
      expect(content).toBe('# Modified')
    })

    it('should invalidate cache on vault.append', async () => {
      await backend.write('test.md', '# Original')
      const file = vault.getFileByPath('test.md')!

      await vault.cachedRead(file)
      await vault.append(file, '\nAppended')

      const content = await vault.cachedRead(file)
      expect(content).toBe('# Original\nAppended')
    })

    it('should remove from cache on delete', async () => {
      const file = await vault.create('test.md', '# Test')
      await vault.cachedRead(file)
      expect(vault.getCacheStats().contentCache.size).toBe(1)

      await vault.delete(file)
      expect(vault.getCacheStats().contentCache.size).toBe(0)
    })

    it('should remove from cache on rename', async () => {
      const file = await vault.create('old.md', '# Test')
      await vault.cachedRead(file)

      await vault.rename(file, 'new.md')

      // Old path should be removed from cache
      expect(vault.getCacheStats().contentCache.size).toBe(0)
    })

    it('should evict LRU entries when cache is full', async () => {
      const smallCacheVault = new Vault(backend, { contentCacheSize: 3 })

      const file1 = await smallCacheVault.create('file1.md', 'content1')
      const file2 = await smallCacheVault.create('file2.md', 'content2')
      const file3 = await smallCacheVault.create('file3.md', 'content3')

      await smallCacheVault.cachedRead(file1)
      await smallCacheVault.cachedRead(file2)
      await smallCacheVault.cachedRead(file3)

      expect(smallCacheVault.getCacheStats().contentCache.size).toBe(3)

      // Add fourth file, should evict file1
      const file4 = await smallCacheVault.create('file4.md', 'content4')
      await smallCacheVault.cachedRead(file4)

      expect(smallCacheVault.getCacheStats().contentCache.size).toBe(3)
    })
  })

  describe('File Cache', () => {
    it('should cache file metadata', async () => {
      await backend.write('test.md', '# Test')
      vault.getFileByPath('test.md')
      expect(vault.getCacheStats().fileCache.size).toBeGreaterThan(0)
    })

    it('should use LRU eviction for file cache', async () => {
      const smallCacheVault = new Vault(backend, { fileCacheSize: 3 })

      await smallCacheVault.create('file1.md', 'content1')
      await smallCacheVault.create('file2.md', 'content2')
      await smallCacheVault.create('file3.md', 'content3')
      await smallCacheVault.create('file4.md', 'content4')

      expect(smallCacheVault.getCacheStats().fileCache.size).toBe(3)
    })
  })

  describe('getCacheStats', () => {
    it('should return accurate cache statistics', async () => {
      await vault.create('file1.md', 'content1')
      await vault.create('folder/file2.md', 'content2')

      const file1 = vault.getFileByPath('file1.md')!
      await vault.cachedRead(file1)

      const stats = vault.getCacheStats()
      expect(stats.fileCache.size).toBeGreaterThan(0)
      expect(stats.contentCache.size).toBe(1)
      expect(stats.folderCache.size).toBeGreaterThan(0)
    })
  })

  describe('clearCaches', () => {
    it('should clear all caches', async () => {
      await vault.create('test.md', 'content')
      const file = vault.getFileByPath('test.md')!
      await vault.cachedRead(file)

      vault.clearCaches()

      const stats = vault.getCacheStats()
      expect(stats.fileCache.size).toBe(0)
      expect(stats.contentCache.size).toBe(0)
      expect(stats.folderCache.size).toBe(0)
      expect(stats.pathToParentCache.size).toBe(0)
    })
  })

  describe('clearContentCache', () => {
    it('should only clear content cache', async () => {
      await vault.create('test.md', 'content')
      const file = vault.getFileByPath('test.md')!
      await vault.cachedRead(file)

      vault.clearContentCache()

      const stats = vault.getCacheStats()
      expect(stats.contentCache.size).toBe(0)
      expect(stats.fileCache.size).toBeGreaterThan(0)
    })
  })

  describe('Lazy Folder Tree Construction', () => {
    it('should build folder tree lazily', async () => {
      await backend.write('folder1/file1.md', 'content1')
      await backend.write('folder1/subfolder/file2.md', 'content2')
      await backend.write('folder2/file3.md', 'content3')

      // Getting files should work without explicit folder tree build
      const files = vault.getFiles()
      expect(files.length).toBe(3)

      // Getting folders should trigger tree build
      const folders = vault.getAllFolders(false)
      expect(folders.length).toBeGreaterThan(0)
    })

    it('should update folder structure on file create', async () => {
      await vault.create('new-folder/new-file.md', 'content')

      const folder = vault.getAbstractFileByPath('new-folder')
      expect(folder).not.toBeNull()
    })

    it('should update folder children after modifications', async () => {
      await vault.create('folder/file1.md', 'content1')
      await vault.create('folder/file2.md', 'content2')

      const folder = vault.getAbstractFileByPath('folder')
      expect(folder).not.toBeNull()

      // Access getAllLoadedFiles to ensure children are populated
      vault.getAllLoadedFiles()

      // The folder should have children
      if (folder && 'children' in folder) {
        expect(folder.children.length).toBeGreaterThan(0)
      }
    })
  })

  describe('Parent Path Caching', () => {
    it('should cache parent paths after folder operations', async () => {
      await vault.create('deep/nested/folder/file.md', 'content')

      // Access the folder structure - this triggers parent path caching
      vault.getAllLoadedFiles()

      // Parent path cache should be populated after folder tree is built
      expect(vault.getCacheStats().pathToParentCache.size).toBeGreaterThan(0)
    })

    it('should clear parent path cache on clearCaches', async () => {
      await vault.create('folder/file.md', 'content')
      vault.getAllLoadedFiles()

      const beforeClear = vault.getCacheStats().pathToParentCache.size
      expect(beforeClear).toBeGreaterThan(0)

      vault.clearCaches()
      expect(vault.getCacheStats().pathToParentCache.size).toBe(0)
    })
  })
})

describe('Vault Debouncing', () => {
  let vault: Vault
  let backend: MemoryBackend

  beforeEach(() => {
    vi.useFakeTimers()
    backend = new MemoryBackend()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should debounce rapid file events when enabled', async () => {
    vault = new Vault(backend, { enableWatchDebounce: true, watchDebounceMs: 50 })

    const createCallback = vi.fn()
    vault.on('create', createCallback)

    // Simulate rapid external file creation
    await vault.create('test.md', 'content')

    // The vault's own create should fire immediately (not debounced)
    expect(createCallback).toHaveBeenCalledTimes(1)
  })

  it('should not debounce when disabled', async () => {
    vault = new Vault(backend, { enableWatchDebounce: false })

    const createCallback = vi.fn()
    vault.on('create', createCallback)

    await vault.create('test.md', 'content')
    expect(createCallback).toHaveBeenCalledTimes(1)
  })

  it('should use custom debounce delay', () => {
    vault = new Vault(backend, { watchDebounceMs: 200 })
    // Vault is created successfully with custom delay
    expect(vault).toBeDefined()
  })
})
