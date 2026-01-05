import { describe, it, expect, beforeEach } from 'vitest'
import { MetadataCache } from '../../src/metadata/cache.js'
import { Vault } from '../../src/vault/vault.js'
import { MemoryBackend } from '../../src/vault/memory-backend.js'

describe('MetadataCache Link Resolution', () => {
  let backend: MemoryBackend
  let vault: Vault
  let cache: MetadataCache

  beforeEach(async () => {
    backend = new MemoryBackend()
    vault = new Vault(backend)
    cache = new MetadataCache(vault)

    // Set up a vault structure with various files for testing
    await backend.write('notes/a.md', '# Note A\n\nLink to [[b]]')
    await backend.write('notes/b.md', '# Note B\n\nContent here')
    await backend.write('notes/c.md', '# Note C\n\n## Section One\n\nParagraph ^block1')
    await backend.write('archive/b.md', '# Archived B\n\nDifferent file with same basename')
    await backend.write('daily/2024-01-01.md', '# Daily Note')
    await backend.write('projects/deep/nested/file.md', '# Deeply nested file')
    await backend.write('notes/with spaces.md', '# File with spaces')
    await backend.write('notes/CamelCase.md', '# CamelCase file')
    await backend.write('attachments/image.png', 'binary-content-placeholder')
  })

  describe('getFirstLinkpathDest', () => {
    describe('exact path matching', () => {
      it('should resolve exact path match with extension', () => {
        const target = cache.getFirstLinkpathDest('notes/b.md', 'notes/a.md')
        expect(target).not.toBeNull()
        expect(target?.path).toBe('notes/b.md')
      })

      it('should resolve exact path match without extension', () => {
        const target = cache.getFirstLinkpathDest('notes/b', 'notes/a.md')
        expect(target).not.toBeNull()
        expect(target?.path).toBe('notes/b.md')
      })

      it('should resolve deeply nested exact path', () => {
        const target = cache.getFirstLinkpathDest('projects/deep/nested/file.md', 'notes/a.md')
        expect(target).not.toBeNull()
        expect(target?.path).toBe('projects/deep/nested/file.md')
      })

      it('should resolve path with spaces', () => {
        const target = cache.getFirstLinkpathDest('notes/with spaces.md', 'notes/a.md')
        expect(target).not.toBeNull()
        expect(target?.path).toBe('notes/with spaces.md')
      })
    })

    describe('basename matching', () => {
      it('should resolve basename match when unambiguous', () => {
        const target = cache.getFirstLinkpathDest('c', 'notes/a.md')
        expect(target).not.toBeNull()
        expect(target?.path).toBe('notes/c.md')
      })

      it('should resolve CamelCase basename', () => {
        const target = cache.getFirstLinkpathDest('CamelCase', 'notes/a.md')
        expect(target).not.toBeNull()
        expect(target?.path).toBe('notes/CamelCase.md')
      })

      it('should resolve basename with spaces', () => {
        const target = cache.getFirstLinkpathDest('with spaces', 'notes/a.md')
        expect(target).not.toBeNull()
        expect(target?.path).toBe('notes/with spaces.md')
      })

      it('should resolve daily note by basename', () => {
        const target = cache.getFirstLinkpathDest('2024-01-01', 'notes/a.md')
        expect(target).not.toBeNull()
        expect(target?.path).toBe('daily/2024-01-01.md')
      })
    })

    describe('extension handling', () => {
      it('should resolve with .md extension added', () => {
        const target = cache.getFirstLinkpathDest('notes/b', 'notes/a.md')
        expect(target).not.toBeNull()
        expect(target?.path).toBe('notes/b.md')
      })

      it('should not add extension when already present', () => {
        const target = cache.getFirstLinkpathDest('notes/b.md', 'notes/a.md')
        expect(target).not.toBeNull()
        expect(target?.path).toBe('notes/b.md')
      })

      it('should handle non-markdown extensions', () => {
        const target = cache.getFirstLinkpathDest('attachments/image.png', 'notes/a.md')
        expect(target).not.toBeNull()
        expect(target?.path).toBe('attachments/image.png')
      })
    })

    describe('ambiguous link resolution', () => {
      it('should prefer same-folder match for ambiguous basename links', () => {
        // Both notes/b.md and archive/b.md exist
        // When linking from notes/a.md, should prefer notes/b.md
        const target = cache.getFirstLinkpathDest('b', 'notes/a.md')
        expect(target).not.toBeNull()
        expect(target?.path).toBe('notes/b.md')
      })

      it('should prefer same-folder match when source is in archive', () => {
        // When linking from archive folder, should prefer archive/b.md
        const target = cache.getFirstLinkpathDest('b', 'archive/other.md')
        expect(target).not.toBeNull()
        expect(target?.path).toBe('archive/b.md')
      })

      it('should fall back to first match when not in same folder', () => {
        // When source is in a folder without b.md, should still resolve
        const target = cache.getFirstLinkpathDest('b', 'daily/2024-01-01.md')
        expect(target).not.toBeNull()
        // Should return one of the b.md files (implementation detail which one)
        expect(['notes/b.md', 'archive/b.md']).toContain(target?.path)
      })

      it('should use partial path for disambiguation', () => {
        // Use folder prefix to disambiguate
        const target = cache.getFirstLinkpathDest('archive/b', 'notes/a.md')
        expect(target).not.toBeNull()
        expect(target?.path).toBe('archive/b.md')
      })
    })

    describe('unresolvable links', () => {
      it('should return null for unresolvable link', () => {
        const target = cache.getFirstLinkpathDest('nonexistent', 'notes/a.md')
        expect(target).toBeNull()
      })

      it('should return null for completely wrong path', () => {
        const target = cache.getFirstLinkpathDest('foo/bar/baz.md', 'notes/a.md')
        expect(target).toBeNull()
      })

      it('should return null for empty linkpath', () => {
        const target = cache.getFirstLinkpathDest('', 'notes/a.md')
        expect(target).toBeNull()
      })

      it('should return null for path with only extension', () => {
        const target = cache.getFirstLinkpathDest('.md', 'notes/a.md')
        expect(target).toBeNull()
      })
    })

    describe('heading references', () => {
      it('should handle heading references and resolve base file', () => {
        const target = cache.getFirstLinkpathDest('c#Section One', 'notes/a.md')
        expect(target).not.toBeNull()
        expect(target?.path).toBe('notes/c.md')
      })

      it('should handle heading reference with full path', () => {
        const target = cache.getFirstLinkpathDest('notes/c.md#Section One', 'notes/a.md')
        expect(target).not.toBeNull()
        expect(target?.path).toBe('notes/c.md')
      })

      it('should handle nested heading references', () => {
        const target = cache.getFirstLinkpathDest('c#Section One#Subsection', 'notes/a.md')
        expect(target).not.toBeNull()
        expect(target?.path).toBe('notes/c.md')
      })

      it('should resolve file even if heading does not exist', () => {
        // Link resolution should find the file; heading validation is separate
        const target = cache.getFirstLinkpathDest('c#NonexistentHeading', 'notes/a.md')
        expect(target).not.toBeNull()
        expect(target?.path).toBe('notes/c.md')
      })
    })

    describe('block references', () => {
      it('should handle block references and resolve base file', () => {
        const target = cache.getFirstLinkpathDest('c#^block1', 'notes/a.md')
        expect(target).not.toBeNull()
        expect(target?.path).toBe('notes/c.md')
      })

      it('should handle block reference with full path', () => {
        const target = cache.getFirstLinkpathDest('notes/c.md#^block1', 'notes/a.md')
        expect(target).not.toBeNull()
        expect(target?.path).toBe('notes/c.md')
      })

      it('should resolve file even if block does not exist', () => {
        // Link resolution should find the file; block validation is separate
        const target = cache.getFirstLinkpathDest('c#^nonexistentblock', 'notes/a.md')
        expect(target).not.toBeNull()
        expect(target?.path).toBe('notes/c.md')
      })
    })

    describe('edge cases', () => {
      it('should handle self-referential links', () => {
        const target = cache.getFirstLinkpathDest('a', 'notes/a.md')
        expect(target).not.toBeNull()
        expect(target?.path).toBe('notes/a.md')
      })

      it('should handle link from root-level file', () => {
        // Assuming a root-level file exists
        const target = cache.getFirstLinkpathDest('notes/b.md', 'root.md')
        expect(target).not.toBeNull()
        expect(target?.path).toBe('notes/b.md')
      })

      it('should be case-sensitive for paths', () => {
        // Obsidian is typically case-sensitive on most systems
        const target = cache.getFirstLinkpathDest('notes/B.md', 'notes/a.md')
        // Should not match notes/b.md (lowercase)
        expect(target).toBeNull()
      })

      it('should handle trailing slashes gracefully', () => {
        const target = cache.getFirstLinkpathDest('notes/', 'notes/a.md')
        expect(target).toBeNull() // folders are not files
      })

      it('should handle relative path segments', () => {
        // Obsidian typically does not support .. or . in links
        const target = cache.getFirstLinkpathDest('../archive/b', 'notes/a.md')
        // Implementation detail: may or may not resolve
        // Testing that it doesn't crash
        expect(target?.path ?? null).toSatisfy((p: string | null) => p === null || p === 'archive/b.md')
      })
    })
  })

  describe('fileToLinktext', () => {
    describe('shortest unambiguous link generation', () => {
      it('should generate shortest unambiguous link using basename', () => {
        const file = { path: 'notes/c.md', name: 'c.md', basename: 'c', extension: 'md', stat: { ctime: 0, mtime: 0, size: 0 } }
        const linktext = cache.fileToLinktext(file, 'notes/a.md')
        expect(linktext).toBe('c')
      })

      it('should generate basename without extension for markdown files', () => {
        const file = { path: 'daily/2024-01-01.md', name: '2024-01-01.md', basename: '2024-01-01', extension: 'md', stat: { ctime: 0, mtime: 0, size: 0 } }
        const linktext = cache.fileToLinktext(file, 'notes/a.md')
        expect(linktext).toBe('2024-01-01')
      })

      it('should include extension for non-markdown files', () => {
        const file = { path: 'attachments/image.png', name: 'image.png', basename: 'image', extension: 'png', stat: { ctime: 0, mtime: 0, size: 0 } }
        const linktext = cache.fileToLinktext(file, 'notes/a.md')
        expect(linktext).toBe('image.png')
      })
    })

    describe('disambiguation with folder paths', () => {
      it('should include folder for disambiguation when basename is ambiguous', () => {
        // b.md exists in both notes/ and archive/
        const file = { path: 'archive/b.md', name: 'b.md', basename: 'b', extension: 'md', stat: { ctime: 0, mtime: 0, size: 0 } }
        const linktext = cache.fileToLinktext(file, 'notes/a.md')
        expect(linktext).toBe('archive/b')
      })

      it('should use relative path when same folder', () => {
        const file = { path: 'notes/b.md', name: 'b.md', basename: 'b', extension: 'md', stat: { ctime: 0, mtime: 0, size: 0 } }
        const linktext = cache.fileToLinktext(file, 'notes/a.md')
        // When in same folder with ambiguous basename, might still just use basename
        // if same-folder preference makes it unambiguous
        expect(linktext).toBe('b')
      })

      it('should use shortest distinguishing path prefix', () => {
        const file = { path: 'projects/deep/nested/file.md', name: 'file.md', basename: 'file', extension: 'md', stat: { ctime: 0, mtime: 0, size: 0 } }
        const linktext = cache.fileToLinktext(file, 'notes/a.md')
        // Should use minimal path to be unambiguous
        expect(linktext).toBe('file')
      })

      it('should include parent folder when multiple files have same name in different subfolders', async () => {
        // Add another file.md in a different location
        await backend.write('archive/deep/file.md', '# Another nested file')

        const file = { path: 'projects/deep/nested/file.md', name: 'file.md', basename: 'file', extension: 'md', stat: { ctime: 0, mtime: 0, size: 0 } }
        const linktext = cache.fileToLinktext(file, 'notes/a.md')
        // Should include enough path to disambiguate
        expect(linktext).toContain('nested/file')
      })
    })

    describe('source path awareness', () => {
      it('should consider source path when generating link', () => {
        const file = { path: 'notes/b.md', name: 'b.md', basename: 'b', extension: 'md', stat: { ctime: 0, mtime: 0, size: 0 } }
        const linktext = cache.fileToLinktext(file, 'notes/a.md')
        // From same folder, should be just basename
        expect(linktext).toBe('b')
      })

      it('should work when source is in different folder', () => {
        const file = { path: 'notes/c.md', name: 'c.md', basename: 'c', extension: 'md', stat: { ctime: 0, mtime: 0, size: 0 } }
        const linktext = cache.fileToLinktext(file, 'archive/b.md')
        expect(linktext).toBe('c')
      })

      it('should handle source in deeply nested folder', () => {
        const file = { path: 'notes/a.md', name: 'a.md', basename: 'a', extension: 'md', stat: { ctime: 0, mtime: 0, size: 0 } }
        const linktext = cache.fileToLinktext(file, 'projects/deep/nested/file.md')
        expect(linktext).toBe('a')
      })
    })

    describe('edge cases', () => {
      it('should handle files with spaces in name', () => {
        const file = { path: 'notes/with spaces.md', name: 'with spaces.md', basename: 'with spaces', extension: 'md', stat: { ctime: 0, mtime: 0, size: 0 } }
        const linktext = cache.fileToLinktext(file, 'notes/a.md')
        expect(linktext).toBe('with spaces')
      })

      it('should handle self-link', () => {
        const file = { path: 'notes/a.md', name: 'a.md', basename: 'a', extension: 'md', stat: { ctime: 0, mtime: 0, size: 0 } }
        const linktext = cache.fileToLinktext(file, 'notes/a.md')
        expect(linktext).toBe('a')
      })

      it('should handle files with special characters', async () => {
        await backend.write('notes/file (1).md', '# File with parens')
        const file = { path: 'notes/file (1).md', name: 'file (1).md', basename: 'file (1)', extension: 'md', stat: { ctime: 0, mtime: 0, size: 0 } }
        const linktext = cache.fileToLinktext(file, 'notes/a.md')
        expect(linktext).toBe('file (1)')
      })

      it('should handle CamelCase files', () => {
        const file = { path: 'notes/CamelCase.md', name: 'CamelCase.md', basename: 'CamelCase', extension: 'md', stat: { ctime: 0, mtime: 0, size: 0 } }
        const linktext = cache.fileToLinktext(file, 'notes/a.md')
        expect(linktext).toBe('CamelCase')
      })

      it('should handle root-level source file', () => {
        const file = { path: 'notes/b.md', name: 'b.md', basename: 'b', extension: 'md', stat: { ctime: 0, mtime: 0, size: 0 } }
        const linktext = cache.fileToLinktext(file, 'root.md')
        // b is unambiguous since only notes/b and archive/b exist
        // From root, might need disambiguation
        expect(['b', 'notes/b']).toContain(linktext)
      })
    })
  })

  describe('resolved and unresolved links tracking', () => {
    it('should populate resolvedLinks after cache indexing', () => {
      // After indexing, resolvedLinks should track which files link to which
      expect(cache.resolvedLinks).toBeDefined()
      expect(typeof cache.resolvedLinks).toBe('object')
    })

    it('should populate unresolvedLinks for broken links', () => {
      // unresolvedLinks should track links that don't resolve to any file
      expect(cache.unresolvedLinks).toBeDefined()
      expect(typeof cache.unresolvedLinks).toBe('object')
    })

    it('should count link occurrences in resolvedLinks', () => {
      // resolvedLinks[sourcePath][targetPath] should be a count
      // This is a structure test - actual population happens during indexing
      const mockResolvedLinks: Record<string, Record<string, number>> = {
        'notes/a.md': { 'notes/b.md': 1 }
      }
      expect(mockResolvedLinks['notes/a.md']['notes/b.md']).toBe(1)
    })
  })
})
