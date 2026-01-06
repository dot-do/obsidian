import { describe, it, expect, beforeEach } from 'vitest'
import { ObsidianClient, ObsidianClientOptions, NoteFilterOptions } from '../../src/client/client.js'
import { MemoryBackend } from '../../src/vault/memory-backend.js'

describe('ObsidianClient Convenience Methods', () => {
  let client: ObsidianClient
  let backend: MemoryBackend

  beforeEach(async () => {
    backend = new MemoryBackend({
      'folder1/note1.md': `---
tags: [test, example]
---
# Note 1

[[Note2]]`,
      'folder1/note2.md': `---
tags: [test]
---
# Note 2`,
      'folder1/sub/note3.md': `---
tags: [nested]
---
# Nested Note`,
      'folder2/note4.md': `---
tags: [other]
---
# Note 4`,
      'orphan.md': '# Orphan Note - no links'
    })

    const options: ObsidianClientOptions = { backend }
    client = new ObsidianClient(options)
    await client.initialize()
  })

  describe('getRecentNotesSync', () => {
    it('should return recently modified notes', () => {
      const recent = client.getRecentNotesSync()
      expect(recent.length).toBeLessThanOrEqual(10)
      expect(recent.length).toBeGreaterThan(0)
    })

    it('should respect the limit parameter', () => {
      const recent = client.getRecentNotesSync(2)
      expect(recent.length).toBeLessThanOrEqual(2)
    })

    it('should return notes sorted by mtime descending', () => {
      const recent = client.getRecentNotesSync()
      for (let i = 1; i < recent.length; i++) {
        expect(recent[i - 1].stat.mtime).toBeGreaterThanOrEqual(recent[i].stat.mtime)
      }
    })
  })

  describe('getRecentNotesWithContent', () => {
    it('should return notes with content and metadata', async () => {
      const recent = await client.getRecentNotesWithContent(2)
      expect(recent.length).toBeLessThanOrEqual(2)
      for (const note of recent) {
        expect(note.file).toBeDefined()
        expect(typeof note.content).toBe('string')
        expect(note.metadata).toBeDefined()
      }
    })
  })

  describe('getNotesByFolder', () => {
    it('should return notes in a folder recursively', () => {
      const notes = client.getNotesByFolder('folder1')
      expect(notes.length).toBe(3) // note1, note2, sub/note3
      expect(notes.map(f => f.path)).toContain('folder1/note1.md')
      expect(notes.map(f => f.path)).toContain('folder1/sub/note3.md')
    })

    it('should return notes in a folder non-recursively', () => {
      const notes = client.getNotesByFolder('folder1', false)
      expect(notes.length).toBe(2) // note1, note2 only
      expect(notes.map(f => f.path)).toContain('folder1/note1.md')
      expect(notes.map(f => f.path)).not.toContain('folder1/sub/note3.md')
    })

    it('should handle folder path normalization', () => {
      const notes1 = client.getNotesByFolder('folder1/')
      const notes2 = client.getNotesByFolder('/folder1')
      const notes3 = client.getNotesByFolder('folder1')
      expect(notes1.length).toBe(notes3.length)
      expect(notes2.length).toBe(notes3.length)
    })

    it('should return empty array for non-existent folder', () => {
      const notes = client.getNotesByFolder('nonexistent')
      expect(notes).toEqual([])
    })
  })

  describe('getNotesByTag', () => {
    it('should return notes with a specific tag', () => {
      const notes = client.getNotesByTag('test')
      expect(notes.length).toBe(2) // note1 and note2
      expect(notes.map(f => f.path)).toContain('folder1/note1.md')
      expect(notes.map(f => f.path)).toContain('folder1/note2.md')
    })

    it('should handle tag with or without # prefix', () => {
      const notes1 = client.getNotesByTag('test')
      const notes2 = client.getNotesByTag('#test')
      expect(notes1.length).toBe(notes2.length)
    })

    it('should return empty array for non-existent tag', () => {
      const notes = client.getNotesByTag('nonexistent')
      expect(notes).toEqual([])
    })
  })

  describe('getNotesByTags', () => {
    it('should return notes matching any tag by default', () => {
      const notes = client.getNotesByTags(['test', 'other'])
      expect(notes.length).toBe(3) // note1, note2, note4
    })

    it('should return notes matching all tags when requireAll is true', () => {
      const notes = client.getNotesByTags(['test', 'example'], true)
      expect(notes.length).toBe(1) // only note1
      expect(notes[0].path).toBe('folder1/note1.md')
    })
  })

  describe('getNotes (flexible filtering)', () => {
    it('should filter by folder', () => {
      const notes = client.getNotes({ folder: 'folder1' })
      expect(notes.length).toBe(3)
    })

    it('should filter by single tag', () => {
      const notes = client.getNotes({ tags: 'test' })
      expect(notes.length).toBe(2)
    })

    it('should filter by multiple tags (any)', () => {
      const notes = client.getNotes({ tags: ['test', 'other'] })
      expect(notes.length).toBe(3)
    })

    it('should filter by multiple tags (all)', () => {
      const notes = client.getNotes({ tags: ['test', 'example'], requireAllTags: true })
      expect(notes.length).toBe(1)
    })

    it('should respect limit', () => {
      const notes = client.getNotes({ limit: 2 })
      expect(notes.length).toBe(2)
    })

    it('should sort by name ascending', () => {
      const notes = client.getNotes({ sortBy: 'name', sortOrder: 'asc' })
      for (let i = 1; i < notes.length; i++) {
        expect(notes[i - 1].basename.localeCompare(notes[i].basename)).toBeLessThanOrEqual(0)
      }
    })

    it('should sort by mtime descending by default', () => {
      const notes = client.getNotes({})
      for (let i = 1; i < notes.length; i++) {
        expect(notes[i - 1].stat.mtime).toBeGreaterThanOrEqual(notes[i].stat.mtime)
      }
    })

    it('should combine multiple filters', () => {
      const notes = client.getNotes({
        folder: 'folder1',
        tags: 'test',
        limit: 1
      })
      expect(notes.length).toBe(1)
    })
  })

  describe('getNotesWithContent', () => {
    it('should return notes with content matching filter', async () => {
      const notes = await client.getNotesWithContent({ tags: 'test', limit: 1 })
      expect(notes.length).toBe(1)
      expect(notes[0].content).toBeDefined()
      expect(notes[0].metadata).toBeDefined()
    })
  })

  describe('getAllTags', () => {
    it('should return all unique tags', () => {
      const tags = client.getAllTags()
      expect(tags).toContain('test')
      expect(tags).toContain('example')
      expect(tags).toContain('nested')
      expect(tags).toContain('other')
    })

    it('should return tags sorted alphabetically', () => {
      const tags = client.getAllTags()
      const sorted = [...tags].sort()
      expect(tags).toEqual(sorted)
    })

    it('should not include duplicates', () => {
      const tags = client.getAllTags()
      const uniqueTags = [...new Set(tags)]
      expect(tags.length).toBe(uniqueTags.length)
    })
  })

  describe('getAllFolders', () => {
    it('should return all unique folders', () => {
      const folders = client.getAllFolders()
      expect(folders).toContain('folder1')
      expect(folders).toContain('folder1/sub')
      expect(folders).toContain('folder2')
    })

    it('should return folders sorted alphabetically', () => {
      const folders = client.getAllFolders()
      const sorted = [...folders].sort()
      expect(folders).toEqual(sorted)
    })
  })

  describe('hasNote', () => {
    it('should return true for existing note', () => {
      expect(client.hasNote('folder1/note1.md')).toBe(true)
    })

    it('should return false for non-existent note', () => {
      expect(client.hasNote('nonexistent.md')).toBe(false)
    })
  })

  describe('getOrphanNotes', () => {
    it('should return notes with no links', () => {
      const orphans = client.getOrphanNotes()
      expect(orphans.map(f => f.path)).toContain('orphan.md')
    })
  })

  describe('getBacklinksFor', () => {
    it('should return files that link to a note', async () => {
      // Create a link situation
      await client.createNote('target.md', '# Target')
      await client.createNote('linker.md', '# Linker\n\n[[target]]')

      const backlinks = client.getBacklinksFor('target.md')
      expect(backlinks.map(f => f.path)).toContain('linker.md')
    })

    it('should return empty array for note with no backlinks', () => {
      const backlinks = client.getBacklinksFor('orphan.md')
      expect(backlinks).toEqual([])
    })
  })

  describe('getOutlinksFor', () => {
    it('should return files that a note links to', async () => {
      await client.createNote('target.md', '# Target')
      await client.createNote('source.md', '# Source\n\n[[target]]')

      const outlinks = client.getOutlinksFor('source.md')
      expect(outlinks.map(f => f.path)).toContain('target.md')
    })
  })

  describe('deleteNote', () => {
    it('should delete a note and return this for chaining', async () => {
      await client.createNote('todelete.md', '# Delete Me')
      expect(client.hasNote('todelete.md')).toBe(true)

      const result = await client.deleteNote('todelete.md')
      expect(result).toBe(client) // method chaining
      expect(client.hasNote('todelete.md')).toBe(false)
    })

    it('should throw error for non-existent note', async () => {
      await expect(client.deleteNote('nonexistent.md')).rejects.toThrow()
    })
  })

  describe('renameNote', () => {
    it('should rename a note and return this for chaining', async () => {
      await client.createNote('oldname.md', '# Old')
      expect(client.hasNote('oldname.md')).toBe(true)

      const result = await client.renameNote('oldname.md', 'newname.md')
      expect(result).toBe(client) // method chaining
      expect(client.hasNote('oldname.md')).toBe(false)
      expect(client.hasNote('newname.md')).toBe(true)
    })

    it('should throw error for non-existent source', async () => {
      await expect(client.renameNote('nonexistent.md', 'new.md')).rejects.toThrow()
    })

    it('should throw error if destination exists', async () => {
      await client.createNote('source.md', '# Source')
      await client.createNote('dest.md', '# Dest')

      await expect(client.renameNote('source.md', 'dest.md')).rejects.toThrow()
    })
  })
})
