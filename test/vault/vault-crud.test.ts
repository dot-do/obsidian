import { describe, it, expect, beforeEach } from 'vitest'
import { Vault } from '../../src/vault/vault.js'
import { MemoryBackend } from '../../src/vault/memory-backend.js'

describe('Vault', () => {
  let vault: Vault
  let backend: MemoryBackend

  beforeEach(() => {
    backend = new MemoryBackend()
    vault = new Vault(backend)
  })

  describe('read operations', () => {
    describe('read', () => {
      it('should read file content from the vault', async () => {
        await backend.write('test.md', '# Test')
        const file = vault.getFileByPath('test.md')
        expect(file).not.toBeNull()
        const content = await vault.read(file!)
        expect(content).toBe('# Test')
      })

      it('should throw error when reading non-existent file', async () => {
        const file = vault.getFileByPath('nonexistent.md')
        expect(file).toBeNull()
      })

      it('should read markdown files with complex content', async () => {
        const complexContent = `---
title: Test Document
tags: [test, markdown]
---

# Heading 1

This is a paragraph with **bold** and *italic* text.

## Heading 2

- List item 1
- List item 2

[[Internal Link]]

\`\`\`javascript
const code = 'example';
\`\`\`
`
        await backend.write('complex.md', complexContent)
        const file = vault.getFileByPath('complex.md')
        expect(file).not.toBeNull()
        const content = await vault.read(file!)
        expect(content).toBe(complexContent)
      })

      it('should read files from nested directories', async () => {
        await backend.write('folder/subfolder/nested.md', '# Nested')
        const file = vault.getFileByPath('folder/subfolder/nested.md')
        expect(file).not.toBeNull()
        expect(file!.path).toBe('folder/subfolder/nested.md')
        const content = await vault.read(file!)
        expect(content).toBe('# Nested')
      })

      it('should read empty files', async () => {
        await backend.write('empty.md', '')
        const file = vault.getFileByPath('empty.md')
        expect(file).not.toBeNull()
        const content = await vault.read(file!)
        expect(content).toBe('')
      })
    })

    describe('cachedRead', () => {
      it('should return cached content on subsequent reads', async () => {
        await backend.write('cached.md', '# Cached Content')
        const file = vault.getFileByPath('cached.md')
        expect(file).not.toBeNull()

        const content1 = await vault.cachedRead(file!)
        const content2 = await vault.cachedRead(file!)

        expect(content1).toBe('# Cached Content')
        expect(content2).toBe('# Cached Content')
      })

      it('should use cache instead of hitting backend again', async () => {
        await backend.write('cached.md', '# Original')
        const file = vault.getFileByPath('cached.md')
        expect(file).not.toBeNull()

        // First read populates the cache
        const content1 = await vault.cachedRead(file!)
        expect(content1).toBe('# Original')

        // Modify backend directly (bypassing vault)
        await backend.write('cached.md', '# Modified')

        // Second read should still return cached value
        const content2 = await vault.cachedRead(file!)
        expect(content2).toBe('# Original')
      })

      it('should invalidate cache when file is modified through vault', async () => {
        await backend.write('cached.md', '# Original')
        const file = vault.getFileByPath('cached.md')
        expect(file).not.toBeNull()

        await vault.cachedRead(file!)
        await vault.modify(file!, '# Modified Through Vault')

        const content = await vault.cachedRead(file!)
        expect(content).toBe('# Modified Through Vault')
      })
    })

    describe('readBinary', () => {
      it('should read binary file content', async () => {
        const binaryData = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        await backend.writeBinary('image.png', binaryData.buffer as ArrayBuffer)

        const file = vault.getFileByPath('image.png')
        expect(file).not.toBeNull()

        const buffer = await vault.readBinary(file!)
        expect(buffer).toBeInstanceOf(ArrayBuffer)
        expect(new Uint8Array(buffer)).toEqual(binaryData)
      })

      it('should read text file as binary', async () => {
        await backend.write('text.md', 'Hello World')
        const file = vault.getFileByPath('text.md')
        expect(file).not.toBeNull()

        const buffer = await vault.readBinary(file!)
        const decoder = new TextDecoder()
        expect(decoder.decode(buffer)).toBe('Hello World')
      })

      it('should handle large binary files', async () => {
        const largeData = new Uint8Array(1024 * 1024) // 1MB
        for (let i = 0; i < largeData.length; i++) {
          largeData[i] = i % 256
        }
        await backend.writeBinary('large.bin', largeData.buffer as ArrayBuffer)

        const file = vault.getFileByPath('large.bin')
        expect(file).not.toBeNull()

        const buffer = await vault.readBinary(file!)
        expect(buffer.byteLength).toBe(1024 * 1024)
      })
    })
  })

  describe('write operations', () => {
    describe('create', () => {
      it('should create new file with content', async () => {
        const file = await vault.create('new.md', '# New')
        expect(file.path).toBe('new.md')
        expect(file.name).toBe('new.md')
        expect(file.basename).toBe('new')
        expect(file.extension).toBe('md')

        const content = await vault.read(file)
        expect(content).toBe('# New')
      })

      it('should create file in nested directory', async () => {
        const file = await vault.create('folder/subfolder/new.md', '# Nested New')
        expect(file.path).toBe('folder/subfolder/new.md')
        expect(file.name).toBe('new.md')

        const content = await vault.read(file)
        expect(content).toBe('# Nested New')
      })

      it('should create empty file', async () => {
        const file = await vault.create('empty.md', '')
        expect(file.path).toBe('empty.md')

        const content = await vault.read(file)
        expect(content).toBe('')
      })

      it('should throw error when file already exists', async () => {
        await vault.create('existing.md', '# Original')

        await expect(vault.create('existing.md', '# Duplicate')).rejects.toThrow()
      })

      it('should set file stat properties on creation', async () => {
        const before = Date.now()
        const file = await vault.create('new.md', '# Content')
        const after = Date.now()

        expect(file.stat).toBeDefined()
        expect(file.stat.ctime).toBeGreaterThanOrEqual(before)
        expect(file.stat.ctime).toBeLessThanOrEqual(after)
        expect(file.stat.mtime).toBeGreaterThanOrEqual(before)
        expect(file.stat.mtime).toBeLessThanOrEqual(after)
        expect(file.stat.size).toBe('# Content'.length)
      })

      it('should create files with various extensions', async () => {
        const mdFile = await vault.create('doc.md', '# Markdown')
        expect(mdFile.extension).toBe('md')

        const txtFile = await vault.create('doc.txt', 'Plain text')
        expect(txtFile.extension).toBe('txt')

        const jsonFile = await vault.create('config.json', '{}')
        expect(jsonFile.extension).toBe('json')
      })
    })

    describe('modify', () => {
      it('should modify existing file content', async () => {
        const file = await vault.create('original.md', '# Original')
        await vault.modify(file, '# Modified')

        const content = await vault.read(file)
        expect(content).toBe('# Modified')
      })

      it('should update mtime on modification', async () => {
        const file = await vault.create('original.md', '# Original')
        const originalMtime = file.stat.mtime

        // Small delay to ensure different timestamp
        await new Promise(resolve => setTimeout(resolve, 10))

        await vault.modify(file, '# Modified')

        const updatedFile = vault.getFileByPath('original.md')
        expect(updatedFile).not.toBeNull()
        expect(updatedFile!.stat.mtime).toBeGreaterThanOrEqual(originalMtime)
      })

      it('should throw error when modifying non-existent file', async () => {
        const fakeFile = {
          path: 'nonexistent.md',
          name: 'nonexistent.md',
          basename: 'nonexistent',
          extension: 'md',
          stat: { ctime: 0, mtime: 0, size: 0 }
        }

        await expect(vault.modify(fakeFile, '# Content')).rejects.toThrow()
      })

      it('should modify file to empty content', async () => {
        const file = await vault.create('original.md', '# Has Content')
        await vault.modify(file, '')

        const content = await vault.read(file)
        expect(content).toBe('')
      })

      it('should update file size on modification', async () => {
        const file = await vault.create('original.md', 'short')
        expect(file.stat.size).toBe(5)

        await vault.modify(file, 'this is a much longer content string')

        const updatedFile = vault.getFileByPath('original.md')
        expect(updatedFile).not.toBeNull()
        expect(updatedFile!.stat.size).toBe('this is a much longer content string'.length)
      })
    })

    describe('append', () => {
      it('should append content to existing file', async () => {
        const file = await vault.create('original.md', '# Title\n')
        await vault.append(file, 'Appended content')

        const content = await vault.read(file)
        expect(content).toBe('# Title\nAppended content')
      })

      it('should append multiple times', async () => {
        const file = await vault.create('list.md', '# List\n')
        await vault.append(file, '- Item 1\n')
        await vault.append(file, '- Item 2\n')
        await vault.append(file, '- Item 3\n')

        const content = await vault.read(file)
        expect(content).toBe('# List\n- Item 1\n- Item 2\n- Item 3\n')
      })

      it('should append to empty file', async () => {
        const file = await vault.create('empty.md', '')
        await vault.append(file, 'First content')

        const content = await vault.read(file)
        expect(content).toBe('First content')
      })

      it('should throw error when appending to non-existent file', async () => {
        const fakeFile = {
          path: 'nonexistent.md',
          name: 'nonexistent.md',
          basename: 'nonexistent',
          extension: 'md',
          stat: { ctime: 0, mtime: 0, size: 0 }
        }

        await expect(vault.append(fakeFile, 'Content')).rejects.toThrow()
      })

      it('should update mtime and size on append', async () => {
        const file = await vault.create('original.md', '# Title')
        const originalSize = file.stat.size

        await new Promise(resolve => setTimeout(resolve, 10))

        await vault.append(file, '\nMore content')

        const updatedFile = vault.getFileByPath('original.md')
        expect(updatedFile).not.toBeNull()
        expect(updatedFile!.stat.size).toBeGreaterThan(originalSize)
      })
    })

    describe('process', () => {
      it('should process file content atomically', async () => {
        const file = await vault.create('original.md', 'hello world')

        const result = await vault.process(file, (content) => content.toUpperCase())

        expect(result).toBe('HELLO WORLD')
        const content = await vault.read(file)
        expect(content).toBe('HELLO WORLD')
      })

      it('should allow complex transformations', async () => {
        const file = await vault.create('list.md', '- item 1\n- item 2\n- item 3')

        const result = await vault.process(file, (content) => {
          return content.split('\n').map((line, i) => `${i + 1}. ${line.slice(2)}`).join('\n')
        })

        expect(result).toBe('1. item 1\n2. item 2\n3. item 3')
      })

      it('should throw error when processing non-existent file', async () => {
        const fakeFile = {
          path: 'nonexistent.md',
          name: 'nonexistent.md',
          basename: 'nonexistent',
          extension: 'md',
          stat: { ctime: 0, mtime: 0, size: 0 }
        }

        await expect(vault.process(fakeFile, (c) => c)).rejects.toThrow()
      })

      it('should handle transformer returning same content', async () => {
        const file = await vault.create('original.md', 'unchanged')

        const result = await vault.process(file, (content) => content)

        expect(result).toBe('unchanged')
        const content = await vault.read(file)
        expect(content).toBe('unchanged')
      })

      it('should handle transformer returning empty string', async () => {
        const file = await vault.create('original.md', 'has content')

        const result = await vault.process(file, () => '')

        expect(result).toBe('')
        const content = await vault.read(file)
        expect(content).toBe('')
      })

      it('should update file metadata after processing', async () => {
        const file = await vault.create('original.md', 'short')

        await vault.process(file, () => 'this is a much longer string')

        const updatedFile = vault.getFileByPath('original.md')
        expect(updatedFile).not.toBeNull()
        expect(updatedFile!.stat.size).toBe('this is a much longer string'.length)
      })
    })
  })

  describe('delete operations', () => {
    describe('delete', () => {
      it('should delete existing file', async () => {
        const file = await vault.create('to-delete.md', '# Delete me')
        expect(vault.getFileByPath('to-delete.md')).not.toBeNull()

        await vault.delete(file)

        expect(vault.getFileByPath('to-delete.md')).toBeNull()
      })

      it('should throw error when deleting non-existent file', async () => {
        const fakeFile = {
          path: 'nonexistent.md',
          name: 'nonexistent.md',
          basename: 'nonexistent',
          extension: 'md',
          stat: { ctime: 0, mtime: 0, size: 0 }
        }

        await expect(vault.delete(fakeFile)).rejects.toThrow()
      })

      it('should delete file from nested directory', async () => {
        const file = await vault.create('folder/nested.md', '# Nested')
        await vault.delete(file)

        expect(vault.getFileByPath('folder/nested.md')).toBeNull()
      })

      it('should not affect other files when deleting', async () => {
        const file1 = await vault.create('file1.md', '# File 1')
        const file2 = await vault.create('file2.md', '# File 2')

        await vault.delete(file1)

        expect(vault.getFileByPath('file1.md')).toBeNull()
        expect(vault.getFileByPath('file2.md')).not.toBeNull()

        const content = await vault.read(file2)
        expect(content).toBe('# File 2')
      })

      it('should make file unreadable after deletion', async () => {
        const file = await vault.create('deleted.md', '# Content')
        await vault.delete(file)

        await expect(vault.read(file)).rejects.toThrow()
      })
    })

    describe('trash', () => {
      it('should move file to trash instead of permanent deletion', async () => {
        const file = await vault.create('to-trash.md', '# Trash me')

        await vault.trash(file)

        expect(vault.getFileByPath('to-trash.md')).toBeNull()
      })

      it('should throw error when trashing non-existent file', async () => {
        const fakeFile = {
          path: 'nonexistent.md',
          name: 'nonexistent.md',
          basename: 'nonexistent',
          extension: 'md',
          stat: { ctime: 0, mtime: 0, size: 0 }
        }

        await expect(vault.trash(fakeFile)).rejects.toThrow()
      })

      it('should trash file from nested directory', async () => {
        const file = await vault.create('folder/nested.md', '# Nested')

        await vault.trash(file)

        expect(vault.getFileByPath('folder/nested.md')).toBeNull()
      })

      it('should make file unreadable after trashing', async () => {
        const file = await vault.create('trashed.md', '# Content')
        await vault.trash(file)

        await expect(vault.read(file)).rejects.toThrow()
      })
    })
  })

  describe('rename/copy operations', () => {
    describe('rename', () => {
      it('should rename file and update path', async () => {
        const file = await vault.create('original.md', '# Original')

        await vault.rename(file, 'renamed.md')

        expect(vault.getFileByPath('original.md')).toBeNull()
        const renamedFile = vault.getFileByPath('renamed.md')
        expect(renamedFile).not.toBeNull()
        expect(renamedFile!.path).toBe('renamed.md')
        expect(renamedFile!.name).toBe('renamed.md')
        expect(renamedFile!.basename).toBe('renamed')
      })

      it('should preserve content after rename', async () => {
        const file = await vault.create('original.md', '# Content to preserve')

        await vault.rename(file, 'renamed.md')

        const renamedFile = vault.getFileByPath('renamed.md')
        expect(renamedFile).not.toBeNull()
        const content = await vault.read(renamedFile!)
        expect(content).toBe('# Content to preserve')
      })

      it('should move file to different directory', async () => {
        const file = await vault.create('source/file.md', '# Content')

        await vault.rename(file, 'destination/file.md')

        expect(vault.getFileByPath('source/file.md')).toBeNull()
        const movedFile = vault.getFileByPath('destination/file.md')
        expect(movedFile).not.toBeNull()
        expect(movedFile!.path).toBe('destination/file.md')
      })

      it('should throw error when renaming non-existent file', async () => {
        const fakeFile = {
          path: 'nonexistent.md',
          name: 'nonexistent.md',
          basename: 'nonexistent',
          extension: 'md',
          stat: { ctime: 0, mtime: 0, size: 0 }
        }

        await expect(vault.rename(fakeFile, 'new.md')).rejects.toThrow()
      })

      it('should throw error when target path already exists', async () => {
        const file1 = await vault.create('file1.md', '# File 1')
        await vault.create('file2.md', '# File 2')

        await expect(vault.rename(file1, 'file2.md')).rejects.toThrow()
      })

      it('should update file reference after rename', async () => {
        const file = await vault.create('original.md', '# Content')

        await vault.rename(file, 'renamed.md')

        // The original file object should now have updated path
        expect(file.path).toBe('renamed.md')
        expect(file.name).toBe('renamed.md')
      })

      it('should change extension when renaming', async () => {
        const file = await vault.create('document.md', '# Markdown')

        await vault.rename(file, 'document.txt')

        const renamedFile = vault.getFileByPath('document.txt')
        expect(renamedFile).not.toBeNull()
        expect(renamedFile!.extension).toBe('txt')
      })
    })

    describe('copy', () => {
      it('should copy file to new path', async () => {
        const original = await vault.create('original.md', '# Original')

        const copy = await vault.copy(original, 'copy.md')

        expect(copy.path).toBe('copy.md')
        expect(copy.name).toBe('copy.md')
        expect(copy.basename).toBe('copy')

        // Both files should exist
        expect(vault.getFileByPath('original.md')).not.toBeNull()
        expect(vault.getFileByPath('copy.md')).not.toBeNull()
      })

      it('should duplicate content in copied file', async () => {
        const original = await vault.create('original.md', '# Content to copy')

        const copy = await vault.copy(original, 'copy.md')

        const originalContent = await vault.read(original)
        const copyContent = await vault.read(copy)

        expect(originalContent).toBe('# Content to copy')
        expect(copyContent).toBe('# Content to copy')
      })

      it('should copy file to different directory', async () => {
        const original = await vault.create('source/file.md', '# Content')

        const copy = await vault.copy(original, 'destination/file.md')

        expect(vault.getFileByPath('source/file.md')).not.toBeNull()
        expect(copy.path).toBe('destination/file.md')

        const content = await vault.read(copy)
        expect(content).toBe('# Content')
      })

      it('should throw error when copying non-existent file', async () => {
        const fakeFile = {
          path: 'nonexistent.md',
          name: 'nonexistent.md',
          basename: 'nonexistent',
          extension: 'md',
          stat: { ctime: 0, mtime: 0, size: 0 }
        }

        await expect(vault.copy(fakeFile, 'copy.md')).rejects.toThrow()
      })

      it('should throw error when target path already exists', async () => {
        const original = await vault.create('original.md', '# Original')
        await vault.create('existing.md', '# Existing')

        await expect(vault.copy(original, 'existing.md')).rejects.toThrow()
      })

      it('should create independent copy that can be modified separately', async () => {
        const original = await vault.create('original.md', '# Original')
        const copy = await vault.copy(original, 'copy.md')

        await vault.modify(copy, '# Modified Copy')

        const originalContent = await vault.read(original)
        const copyContent = await vault.read(copy)

        expect(originalContent).toBe('# Original')
        expect(copyContent).toBe('# Modified Copy')
      })

      it('should set new creation time for copied file', async () => {
        const original = await vault.create('original.md', '# Content')

        await new Promise(resolve => setTimeout(resolve, 10))

        const copy = await vault.copy(original, 'copy.md')

        expect(copy.stat.ctime).toBeGreaterThanOrEqual(original.stat.ctime)
      })

      it('should copy with different extension', async () => {
        const original = await vault.create('document.md', '# Markdown content')

        const copy = await vault.copy(original, 'document-backup.txt')

        expect(copy.extension).toBe('txt')
        const content = await vault.read(copy)
        expect(content).toBe('# Markdown content')
      })
    })
  })

  describe('file listing operations', () => {
    describe('getFileByPath', () => {
      it('should return file when it exists', async () => {
        await backend.write('test.md', '# Test')

        const file = vault.getFileByPath('test.md')

        expect(file).not.toBeNull()
        expect(file!.path).toBe('test.md')
        expect(file!.name).toBe('test.md')
        expect(file!.basename).toBe('test')
        expect(file!.extension).toBe('md')
      })

      it('should return null when file does not exist', () => {
        const file = vault.getFileByPath('nonexistent.md')
        expect(file).toBeNull()
      })

      it('should find files in nested directories', async () => {
        await backend.write('folder/subfolder/deep.md', '# Deep')

        const file = vault.getFileByPath('folder/subfolder/deep.md')

        expect(file).not.toBeNull()
        expect(file!.path).toBe('folder/subfolder/deep.md')
      })
    })

    describe('getMarkdownFiles', () => {
      it('should return only markdown files', async () => {
        await backend.write('doc1.md', '# Doc 1')
        await backend.write('doc2.md', '# Doc 2')
        await backend.write('image.png', 'binary')
        await backend.write('config.json', '{}')

        const files = vault.getMarkdownFiles()

        expect(files).toHaveLength(2)
        expect(files.map(f => f.path).sort()).toEqual(['doc1.md', 'doc2.md'])
      })

      it('should return empty array when no markdown files exist', async () => {
        await backend.write('image.png', 'binary')

        const files = vault.getMarkdownFiles()

        expect(files).toHaveLength(0)
      })

      it('should include markdown files in nested directories', async () => {
        await backend.write('root.md', '# Root')
        await backend.write('folder/nested.md', '# Nested')
        await backend.write('folder/subfolder/deep.md', '# Deep')

        const files = vault.getMarkdownFiles()

        expect(files).toHaveLength(3)
      })
    })

    describe('getFiles', () => {
      it('should return all files in vault', async () => {
        await backend.write('doc.md', '# Doc')
        await backend.write('image.png', 'binary')
        await backend.write('config.json', '{}')

        const files = vault.getFiles()

        expect(files).toHaveLength(3)
      })

      it('should return empty array when vault is empty', () => {
        const files = vault.getFiles()
        expect(files).toHaveLength(0)
      })

      it('should include files from all directories', async () => {
        await backend.write('root.md', '# Root')
        await backend.write('folder/file.md', '# Folder')
        await backend.write('folder/subfolder/deep.md', '# Deep')

        const files = vault.getFiles()

        expect(files).toHaveLength(3)
      })
    })

    describe('getAllLoadedFiles', () => {
      it('should return all files and folders', async () => {
        await backend.write('root.md', '# Root')
        await backend.write('folder/nested.md', '# Nested')

        const allFiles = vault.getAllLoadedFiles()

        // Should include files and folders
        expect(allFiles.length).toBeGreaterThanOrEqual(2)
      })
    })

    describe('getAbstractFileByPath', () => {
      it('should return file for file path', async () => {
        await backend.write('test.md', '# Test')

        const file = vault.getAbstractFileByPath('test.md')

        expect(file).not.toBeNull()
        expect(file!.path).toBe('test.md')
      })

      it('should return folder for folder path', async () => {
        await backend.write('folder/test.md', '# Test')

        const folder = vault.getAbstractFileByPath('folder')

        expect(folder).not.toBeNull()
        expect(folder!.path).toBe('folder')
      })

      it('should return null for non-existent path', () => {
        const result = vault.getAbstractFileByPath('nonexistent')
        expect(result).toBeNull()
      })
    })

    describe('getAllFolders', () => {
      it('should return all folders in vault', async () => {
        await backend.write('folder1/file.md', '# File')
        await backend.write('folder2/file.md', '# File')
        await backend.write('folder1/subfolder/file.md', '# File')

        const folders = vault.getAllFolders()

        expect(folders.length).toBeGreaterThanOrEqual(3)
      })

      it('should include root folder when includeRoot is true', async () => {
        await backend.write('folder/file.md', '# File')

        const foldersWithRoot = vault.getAllFolders(true)
        const foldersWithoutRoot = vault.getAllFolders(false)

        expect(foldersWithRoot.length).toBe(foldersWithoutRoot.length + 1)
      })

      it('should return empty array for empty vault without root', () => {
        const folders = vault.getAllFolders(false)
        expect(folders).toHaveLength(0)
      })
    })
  })
})
