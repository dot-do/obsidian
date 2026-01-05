import { describe, it, expect, beforeEach } from 'vitest'
import { Vault } from '../../src/vault/vault.js'
import { MemoryBackend } from '../../src/vault/memory-backend.js'
import type { TFile, TFolder, TAbstractFile } from '../../src/types.js'

describe('Vault discovery', () => {
  let backend: MemoryBackend
  let vault: Vault

  beforeEach(async () => {
    backend = new MemoryBackend()
    vault = new Vault(backend)

    // Set up test file structure
    await backend.write('notes/test.md', '# Test Note\nSome content')
    await backend.write('notes/another.md', '# Another Note')
    await backend.write('notes/nested/deep.md', '# Deep Note')
    await backend.write('daily/2024-01-01.md', '# Daily Note')
    await backend.write('attachments/image.png', 'binary-data')
    await backend.write('config.json', '{"key": "value"}')
    await backend.write('readme.txt', 'Plain text file')
    await backend.write('root-note.md', '# Root Note')
  })

  describe('getFileByPath', () => {
    it('should get file by path', () => {
      const file = vault.getFileByPath('notes/test.md')
      expect(file).toBeDefined()
      expect(file?.path).toBe('notes/test.md')
    })

    it('should return null for non-existent path', () => {
      expect(vault.getFileByPath('missing.md')).toBeNull()
    })

    it('should return file with correct name property', () => {
      const file = vault.getFileByPath('notes/test.md')
      expect(file?.name).toBe('test.md')
    })

    it('should return file with correct basename property', () => {
      const file = vault.getFileByPath('notes/test.md')
      expect(file?.basename).toBe('test')
    })

    it('should return file with correct extension property', () => {
      const file = vault.getFileByPath('notes/test.md')
      expect(file?.extension).toBe('md')
    })

    it('should return file with stat information', () => {
      const file = vault.getFileByPath('notes/test.md')
      expect(file?.stat).toBeDefined()
      expect(file?.stat.ctime).toBeTypeOf('number')
      expect(file?.stat.mtime).toBeTypeOf('number')
      expect(file?.stat.size).toBeGreaterThan(0)
    })

    it('should handle files in root directory', () => {
      const file = vault.getFileByPath('root-note.md')
      expect(file).toBeDefined()
      expect(file?.path).toBe('root-note.md')
      expect(file?.name).toBe('root-note.md')
    })

    it('should handle deeply nested files', () => {
      const file = vault.getFileByPath('notes/nested/deep.md')
      expect(file).toBeDefined()
      expect(file?.path).toBe('notes/nested/deep.md')
    })

    it('should return null when path points to a folder', () => {
      // 'notes' is a folder, not a file
      expect(vault.getFileByPath('notes')).toBeNull()
    })

    it('should handle paths with special characters', async () => {
      await backend.write('notes/special [chars].md', 'content')
      const file = vault.getFileByPath('notes/special [chars].md')
      expect(file).toBeDefined()
      expect(file?.basename).toBe('special [chars]')
    })

    it('should be case-sensitive', async () => {
      await backend.write('Notes/Test.MD', 'content')
      expect(vault.getFileByPath('notes/test.md')).not.toBe(vault.getFileByPath('Notes/Test.MD'))
    })
  })

  describe('getAbstractFileByPath', () => {
    it('should get abstract file by path (file)', () => {
      const file = vault.getAbstractFileByPath('notes/test.md')
      expect(file).toBeDefined()
      expect(file?.path).toBe('notes/test.md')
    })

    it('should get abstract file by path (folder)', () => {
      const folder = vault.getAbstractFileByPath('notes')
      expect(folder).toBeDefined()
      expect(folder?.path).toBe('notes')
    })

    it('should return null for non-existent path', () => {
      expect(vault.getAbstractFileByPath('nonexistent')).toBeNull()
    })

    it('should return folder with children', () => {
      const folder = vault.getAbstractFileByPath('notes') as TFolder
      expect(folder).toBeDefined()
      expect(folder.children).toBeDefined()
      expect(folder.children.length).toBeGreaterThan(0)
    })

    it('should distinguish between files and folders', () => {
      const file = vault.getAbstractFileByPath('notes/test.md') as TFile
      const folder = vault.getAbstractFileByPath('notes') as TFolder

      // Files have extension property
      expect(file.extension).toBe('md')

      // Folders have children property
      expect(folder.children).toBeDefined()
    })

    it('should return root folder with empty path', () => {
      const root = vault.getAbstractFileByPath('') as TFolder
      expect(root).toBeDefined()
      expect(root.isRoot()).toBe(true)
    })

    it('should handle nested folder paths', () => {
      const folder = vault.getAbstractFileByPath('notes/nested')
      expect(folder).toBeDefined()
      expect(folder?.path).toBe('notes/nested')
    })
  })

  describe('getMarkdownFiles', () => {
    it('should get all markdown files', () => {
      const files = vault.getMarkdownFiles()
      expect(files.every(f => f.extension === 'md')).toBe(true)
    })

    it('should return array of TFile objects', () => {
      const files = vault.getMarkdownFiles()
      expect(Array.isArray(files)).toBe(true)
      files.forEach(file => {
        expect(file.path).toBeTypeOf('string')
        expect(file.name).toBeTypeOf('string')
        expect(file.basename).toBeTypeOf('string')
        expect(file.extension).toBe('md')
      })
    })

    it('should include all markdown files from all directories', () => {
      const files = vault.getMarkdownFiles()
      const paths = files.map(f => f.path)

      expect(paths).toContain('notes/test.md')
      expect(paths).toContain('notes/another.md')
      expect(paths).toContain('notes/nested/deep.md')
      expect(paths).toContain('daily/2024-01-01.md')
      expect(paths).toContain('root-note.md')
    })

    it('should not include non-markdown files', () => {
      const files = vault.getMarkdownFiles()
      const paths = files.map(f => f.path)

      expect(paths).not.toContain('attachments/image.png')
      expect(paths).not.toContain('config.json')
      expect(paths).not.toContain('readme.txt')
    })

    it('should return correct count of markdown files', () => {
      const files = vault.getMarkdownFiles()
      expect(files.length).toBe(5) // 5 .md files in test setup
    })

    it('should return empty array when no markdown files exist', async () => {
      const emptyBackend = new MemoryBackend()
      const emptyVault = new Vault(emptyBackend)
      await emptyBackend.write('file.txt', 'content')

      const files = emptyVault.getMarkdownFiles()
      expect(files).toEqual([])
    })
  })

  describe('getFiles', () => {
    it('should get all files', () => {
      const files = vault.getFiles()
      expect(files.length).toBeGreaterThan(0)
    })

    it('should return array of TFile objects', () => {
      const files = vault.getFiles()
      files.forEach(file => {
        expect(file.path).toBeTypeOf('string')
        expect(file.name).toBeTypeOf('string')
        expect(file.basename).toBeTypeOf('string')
        expect(file.extension).toBeTypeOf('string')
        expect(file.stat).toBeDefined()
      })
    })

    it('should include all file types', () => {
      const files = vault.getFiles()
      const extensions = new Set(files.map(f => f.extension))

      expect(extensions.has('md')).toBe(true)
      expect(extensions.has('png')).toBe(true)
      expect(extensions.has('json')).toBe(true)
      expect(extensions.has('txt')).toBe(true)
    })

    it('should include files from all directories', () => {
      const files = vault.getFiles()
      const paths = files.map(f => f.path)

      expect(paths).toContain('notes/test.md')
      expect(paths).toContain('attachments/image.png')
      expect(paths).toContain('config.json')
    })

    it('should not include folders', () => {
      const files = vault.getFiles()
      // All items should have extension property (files only)
      files.forEach(file => {
        expect(file.extension).toBeDefined()
        expect(file.extension).not.toBe('')
      })
    })

    it('should return correct total file count', () => {
      const files = vault.getFiles()
      expect(files.length).toBe(8) // Total files in test setup
    })

    it('should return empty array for empty vault', async () => {
      const emptyBackend = new MemoryBackend()
      const emptyVault = new Vault(emptyBackend)

      const files = emptyVault.getFiles()
      expect(files).toEqual([])
    })
  })

  describe('getAllLoadedFiles', () => {
    it('should get all loaded files', () => {
      const items = vault.getAllLoadedFiles()
      expect(items.length).toBeGreaterThan(0)
    })

    it('should return both files and folders', () => {
      const items = vault.getAllLoadedFiles()

      const hasFiles = items.some(item => 'extension' in item)
      const hasFolders = items.some(item => 'children' in item)

      expect(hasFiles).toBe(true)
      expect(hasFolders).toBe(true)
    })

    it('should return array of TAbstractFile objects', () => {
      const items = vault.getAllLoadedFiles()
      items.forEach(item => {
        expect(item.path).toBeTypeOf('string')
        expect(item.name).toBeTypeOf('string')
      })
    })

    it('should include all files from vault', () => {
      const items = vault.getAllLoadedFiles()
      const paths = items.map(i => i.path)

      expect(paths).toContain('notes/test.md')
      expect(paths).toContain('attachments/image.png')
      expect(paths).toContain('root-note.md')
    })

    it('should include all folders', () => {
      const items = vault.getAllLoadedFiles()
      const paths = items.map(i => i.path)

      expect(paths).toContain('notes')
      expect(paths).toContain('notes/nested')
      expect(paths).toContain('daily')
      expect(paths).toContain('attachments')
    })

    it('should include root folder', () => {
      const items = vault.getAllLoadedFiles()
      const root = items.find(i => i.path === '' || i.path === '/')
      expect(root).toBeDefined()
    })
  })

  describe('getAllFolders', () => {
    it('should get all folders', () => {
      const folders = vault.getAllFolders()
      expect(folders.length).toBeGreaterThan(0)
    })

    it('should return array of TFolder objects', () => {
      const folders = vault.getAllFolders()
      folders.forEach(folder => {
        expect(folder.path).toBeTypeOf('string')
        expect(folder.name).toBeTypeOf('string')
        expect(folder.children).toBeDefined()
        expect(folder.isRoot).toBeTypeOf('function')
      })
    })

    it('should include root folder by default', () => {
      const folders = vault.getAllFolders()
      const root = folders.find(f => f.isRoot())
      expect(root).toBeDefined()
    })

    it('should exclude root folder when includeRoot is false', () => {
      const folders = vault.getAllFolders(false)
      const root = folders.find(f => f.isRoot())
      expect(root).toBeUndefined()
    })

    it('should include root folder when includeRoot is true', () => {
      const folders = vault.getAllFolders(true)
      const root = folders.find(f => f.isRoot())
      expect(root).toBeDefined()
    })

    it('should include all directory levels', () => {
      const folders = vault.getAllFolders(false)
      const paths = folders.map(f => f.path)

      expect(paths).toContain('notes')
      expect(paths).toContain('notes/nested')
      expect(paths).toContain('daily')
      expect(paths).toContain('attachments')
    })

    it('should have correct children for each folder', () => {
      const folders = vault.getAllFolders()

      const notesFolder = folders.find(f => f.path === 'notes')
      expect(notesFolder).toBeDefined()
      expect(notesFolder?.children.length).toBeGreaterThan(0)

      // Check that children have correct structure
      const childPaths = notesFolder?.children.map(c => c.path)
      expect(childPaths).toContain('notes/test.md')
      expect(childPaths).toContain('notes/another.md')
      expect(childPaths).toContain('notes/nested')
    })

    it('should not include files', () => {
      const folders = vault.getAllFolders()
      folders.forEach(folder => {
        // Folders should not have extension property
        expect((folder as unknown as TFile).extension).toBeUndefined()
      })
    })

    it('should return correct folder count excluding root', () => {
      const folders = vault.getAllFolders(false)
      // notes, notes/nested, daily, attachments = 4 folders
      expect(folders.length).toBe(4)
    })

    it('should return correct folder count including root', () => {
      const folders = vault.getAllFolders(true)
      // notes, notes/nested, daily, attachments, root = 5 folders
      expect(folders.length).toBe(5)
    })

    it('should have folder names set correctly', () => {
      const folders = vault.getAllFolders(false)

      const nested = folders.find(f => f.path === 'notes/nested')
      expect(nested?.name).toBe('nested')

      const notes = folders.find(f => f.path === 'notes')
      expect(notes?.name).toBe('notes')
    })

    it('should return empty array for empty vault (excluding root)', async () => {
      const emptyBackend = new MemoryBackend()
      const emptyVault = new Vault(emptyBackend)

      const folders = emptyVault.getAllFolders(false)
      expect(folders).toEqual([])
    })

    it('should return only root for empty vault (including root)', async () => {
      const emptyBackend = new MemoryBackend()
      const emptyVault = new Vault(emptyBackend)

      const folders = emptyVault.getAllFolders(true)
      expect(folders.length).toBe(1)
      expect(folders[0].isRoot()).toBe(true)
    })
  })

  describe('Edge cases', () => {
    it('should handle files with multiple dots in name', async () => {
      await backend.write('notes/file.test.md', 'content')
      const file = vault.getFileByPath('notes/file.test.md')

      expect(file?.name).toBe('file.test.md')
      expect(file?.basename).toBe('file.test')
      expect(file?.extension).toBe('md')
    })

    it('should handle files with no extension', async () => {
      await backend.write('Makefile', 'content')
      const file = vault.getFileByPath('Makefile')

      expect(file?.name).toBe('Makefile')
      expect(file?.basename).toBe('Makefile')
      expect(file?.extension).toBe('')
    })

    it('should handle hidden files', async () => {
      await backend.write('.hidden', 'content')
      await backend.write('.gitignore', 'content')

      const files = vault.getFiles()
      const paths = files.map(f => f.path)

      expect(paths).toContain('.hidden')
      expect(paths).toContain('.gitignore')
    })

    it('should handle files with spaces in path', async () => {
      await backend.write('my notes/my file.md', 'content')
      const file = vault.getFileByPath('my notes/my file.md')

      expect(file).toBeDefined()
      expect(file?.path).toBe('my notes/my file.md')
    })

    it('should handle unicode file names', async () => {
      await backend.write('notes/日本語.md', 'content')
      await backend.write('notes/emoji-test.md', 'content')

      const file = vault.getFileByPath('notes/日本語.md')
      expect(file).toBeDefined()
      expect(file?.basename).toBe('日本語')
    })

    it('should normalize paths without leading slash', () => {
      // Both should work and return same file
      const file1 = vault.getFileByPath('notes/test.md')
      const file2 = vault.getFileByPath('/notes/test.md')

      expect(file1?.path).toBe(file2?.path)
    })

    it('should normalize paths without trailing slash for folders', () => {
      const folder1 = vault.getAbstractFileByPath('notes')
      const folder2 = vault.getAbstractFileByPath('notes/')

      expect(folder1?.path).toBe(folder2?.path)
    })
  })
})
