import { describe, it, expect, beforeEach } from 'vitest'
import { Vault } from '../../src/vault/vault.js'
import { MemoryBackend } from '../../src/vault/memory-backend.js'
import { MetadataCache } from '../../src/metadata/cache.js'
import { FileManager } from '../../src/vault/file-manager.js'
import type { TFile } from '../../src/types.js'

describe('FileManager', () => {
  let backend: MemoryBackend
  let vault: Vault
  let cache: MetadataCache
  let fileManager: FileManager

  beforeEach(async () => {
    backend = new MemoryBackend()
    vault = new Vault(backend)
    cache = new MetadataCache(vault)
    fileManager = new FileManager(vault, cache)
  })

  describe('renameFile', () => {
    beforeEach(async () => {
      // Set up test files with links
      await backend.write('notes/target.md', '# Target Note\nThis is the target.')
      await backend.write('notes/source.md', '# Source Note\nLink to [[target]].')
      await backend.write('notes/another.md', '# Another Note\nAlso links to [[target]] and [[target|alias]].')
      await backend.write('daily/2024-01-01.md', '# Daily Note\nReference: [[notes/target]]')
      await backend.write('notes/nested/deep.md', '# Deep Note\nLink: [[target]]')
      await backend.write('index.md', '# Index\n- [[notes/target]]\n- [[notes/target|Main Target]]')
    })

    it('should rename file and update all links', async () => {
      const file = vault.getFileByPath('notes/target.md')!
      expect(file).toBeDefined()

      await fileManager.renameFile(file, 'notes/renamed.md')

      // File should exist at new path
      const renamedFile = vault.getFileByPath('notes/renamed.md')
      expect(renamedFile).toBeDefined()
      expect(renamedFile?.path).toBe('notes/renamed.md')

      // File should not exist at old path
      expect(vault.getFileByPath('notes/target.md')).toBeNull()

      // Links in source.md should be updated
      const sourceContent = await vault.read(vault.getFileByPath('notes/source.md')!)
      expect(sourceContent).toContain('[[renamed]]')
      expect(sourceContent).not.toContain('[[target]]')
    })

    it('should preserve link aliases when renaming', async () => {
      const file = vault.getFileByPath('notes/target.md')!
      await fileManager.renameFile(file, 'notes/renamed.md')

      // Links with aliases should keep the alias
      const anotherContent = await vault.read(vault.getFileByPath('notes/another.md')!)
      expect(anotherContent).toContain('[[renamed|alias]]')
    })

    it('should update links in different directories', async () => {
      const file = vault.getFileByPath('notes/target.md')!
      await fileManager.renameFile(file, 'notes/renamed.md')

      const dailyContent = await vault.read(vault.getFileByPath('daily/2024-01-01.md')!)
      expect(dailyContent).toContain('[[notes/renamed]]')
      expect(dailyContent).not.toContain('[[notes/target]]')
    })

    it('should update links with full path aliases', async () => {
      const file = vault.getFileByPath('notes/target.md')!
      await fileManager.renameFile(file, 'notes/renamed.md')

      const indexContent = await vault.read(vault.getFileByPath('index.md')!)
      expect(indexContent).toContain('[[notes/renamed]]')
      expect(indexContent).toContain('[[notes/renamed|Main Target]]')
    })

    it('should handle moving file to different directory', async () => {
      const file = vault.getFileByPath('notes/target.md')!
      await fileManager.renameFile(file, 'archive/target.md')

      // File should be at new location
      const movedFile = vault.getFileByPath('archive/target.md')
      expect(movedFile).toBeDefined()

      // Old location should be empty
      expect(vault.getFileByPath('notes/target.md')).toBeNull()

      // Links should be updated to new path
      const sourceContent = await vault.read(vault.getFileByPath('notes/source.md')!)
      expect(sourceContent).toContain('[[archive/target]]')
    })

    it('should throw if file does not exist', async () => {
      const fakeFile: TFile = {
        path: 'nonexistent.md',
        name: 'nonexistent.md',
        basename: 'nonexistent',
        extension: 'md',
        stat: { ctime: 0, mtime: 0, size: 0 }
      }

      await expect(fileManager.renameFile(fakeFile, 'new.md'))
        .rejects.toThrow()
    })

    it('should throw if new path already exists', async () => {
      await backend.write('notes/existing.md', 'Existing content')
      const file = vault.getFileByPath('notes/target.md')!

      await expect(fileManager.renameFile(file, 'notes/existing.md'))
        .rejects.toThrow()
    })

    it('should update embedded links', async () => {
      await backend.write('notes/with-embed.md', '# Note with embed\n![[target]]\nSome text')
      const file = vault.getFileByPath('notes/target.md')!

      await fileManager.renameFile(file, 'notes/renamed.md')

      const embedContent = await vault.read(vault.getFileByPath('notes/with-embed.md')!)
      expect(embedContent).toContain('![[renamed]]')
      expect(embedContent).not.toContain('![[target]]')
    })

    it('should handle links with heading references', async () => {
      await backend.write('notes/heading-link.md', '# With Heading\nLink: [[target#heading]]')
      const file = vault.getFileByPath('notes/target.md')!

      await fileManager.renameFile(file, 'notes/renamed.md')

      const content = await vault.read(vault.getFileByPath('notes/heading-link.md')!)
      expect(content).toContain('[[renamed#heading]]')
    })

    it('should handle links with block references', async () => {
      await backend.write('notes/block-link.md', '# With Block\nLink: [[target#^block-id]]')
      const file = vault.getFileByPath('notes/target.md')!

      await fileManager.renameFile(file, 'notes/renamed.md')

      const content = await vault.read(vault.getFileByPath('notes/block-link.md')!)
      expect(content).toContain('[[renamed#^block-id]]')
    })

    it('should create parent directories if they do not exist', async () => {
      const file = vault.getFileByPath('notes/target.md')!
      await fileManager.renameFile(file, 'new/nested/folder/target.md')

      const movedFile = vault.getFileByPath('new/nested/folder/target.md')
      expect(movedFile).toBeDefined()
    })

    it('should emit rename event', async () => {
      const events: Array<{ oldPath: string; newPath: string }> = []
      vault.on('rename', (data: { file: TFile; oldPath: string }) => {
        events.push({ oldPath: data.oldPath, newPath: data.file.path })
      })

      const file = vault.getFileByPath('notes/target.md')!
      await fileManager.renameFile(file, 'notes/renamed.md')

      expect(events).toHaveLength(1)
      expect(events[0].oldPath).toBe('notes/target.md')
      expect(events[0].newPath).toBe('notes/renamed.md')
    })
  })

  describe('generateMarkdownLink', () => {
    beforeEach(async () => {
      await backend.write('notes/target.md', '# Target')
      await backend.write('notes/source.md', '# Source')
      await backend.write('notes/nested/deep.md', '# Deep')
      await backend.write('other/file.md', '# Other')
      await backend.write('attachments/image.png', 'binary')
      await backend.write('root.md', '# Root')
      await backend.write('notes/My Note.md', '# My Note')
      await backend.write('notes/target with spaces.md', '# Target with spaces')
    })

    it('should generate markdown link with relative path', () => {
      const file = vault.getFileByPath('notes/target.md')!
      const link = fileManager.generateMarkdownLink(file, 'notes/source.md')
      expect(link).toBe('[[target]]')
    })

    it('should generate link with folder path when needed', () => {
      const file = vault.getFileByPath('notes/target.md')!
      const link = fileManager.generateMarkdownLink(file, 'other/file.md')
      expect(link).toBe('[[notes/target]]')
    })

    it('should generate link to nested file from same directory', () => {
      const file = vault.getFileByPath('notes/nested/deep.md')!
      const link = fileManager.generateMarkdownLink(file, 'notes/source.md')
      expect(link).toBe('[[nested/deep]]')
    })

    it('should generate markdown link with alias', () => {
      const file = vault.getFileByPath('notes/target.md')!
      const link = fileManager.generateMarkdownLink(file, 'notes/source.md', undefined, 'My Alias')
      expect(link).toBe('[[target|My Alias]]')
    })

    it('should generate markdown link with heading subpath', () => {
      const file = vault.getFileByPath('notes/target.md')!
      const link = fileManager.generateMarkdownLink(file, 'notes/source.md', '#section')
      expect(link).toBe('[[target#section]]')
    })

    it('should generate markdown link with block subpath', () => {
      const file = vault.getFileByPath('notes/target.md')!
      const link = fileManager.generateMarkdownLink(file, 'notes/source.md', '#^block-id')
      expect(link).toBe('[[target#^block-id]]')
    })

    it('should generate markdown link with subpath and alias', () => {
      const file = vault.getFileByPath('notes/target.md')!
      const link = fileManager.generateMarkdownLink(file, 'notes/source.md', '#section', 'See Section')
      expect(link).toBe('[[target#section|See Section]]')
    })

    it('should handle link to root file', () => {
      const file = vault.getFileByPath('root.md')!
      const link = fileManager.generateMarkdownLink(file, 'notes/source.md')
      expect(link).toBe('[[root]]')
    })

    it('should handle link from root file', () => {
      const file = vault.getFileByPath('notes/target.md')!
      const link = fileManager.generateMarkdownLink(file, 'root.md')
      expect(link).toBe('[[notes/target]]')
    })

    it('should handle files with spaces in name', () => {
      const file = vault.getFileByPath('notes/target with spaces.md')!
      const link = fileManager.generateMarkdownLink(file, 'notes/source.md')
      expect(link).toBe('[[target with spaces]]')
    })

    it('should handle non-markdown files (images)', () => {
      const file = vault.getFileByPath('attachments/image.png')!
      const link = fileManager.generateMarkdownLink(file, 'notes/source.md')
      expect(link).toBe('[[attachments/image.png]]')
    })

    it('should use shortest unambiguous path', async () => {
      // Create a file with same basename in different folder
      await backend.write('archive/target.md', '# Archive Target')

      const file = vault.getFileByPath('notes/target.md')!
      const link = fileManager.generateMarkdownLink(file, 'other/file.md')

      // Should include folder to disambiguate
      expect(link).toBe('[[notes/target]]')
    })

    it('should generate link without folder when basename is unique', async () => {
      // unique.md only exists in one place
      await backend.write('notes/unique.md', '# Unique')

      const file = vault.getFileByPath('notes/unique.md')!
      const link = fileManager.generateMarkdownLink(file, 'other/file.md')

      expect(link).toBe('[[unique]]')
    })

    it('should handle linking to self (for heading reference)', () => {
      const file = vault.getFileByPath('notes/source.md')!
      const link = fileManager.generateMarkdownLink(file, 'notes/source.md', '#heading')
      expect(link).toBe('[[#heading]]')
    })
  })

  describe('processFrontMatter', () => {
    beforeEach(async () => {
      await backend.write('notes/with-frontmatter.md', `---
title: Test Note
tags:
  - tag1
  - tag2
date: 2024-01-01
---

# Content

Some content here.`)

      await backend.write('notes/no-frontmatter.md', `# No Frontmatter

Just content.`)

      await backend.write('notes/empty-frontmatter.md', `---
---

# Empty Frontmatter`)
    })

    it('should process frontmatter atomically', async () => {
      const file = vault.getFileByPath('notes/with-frontmatter.md')!

      await fileManager.processFrontMatter(file, (fm) => {
        fm.title = 'Updated Title'
        fm.newField = 'new value'
      })

      const content = await vault.read(file)
      expect(content).toContain('title: Updated Title')
      expect(content).toContain('newField: new value')
      expect(content).toContain('# Content')
    })

    it('should preserve existing frontmatter fields', async () => {
      const file = vault.getFileByPath('notes/with-frontmatter.md')!

      await fileManager.processFrontMatter(file, (fm) => {
        fm.newField = 'new'
      })

      const content = await vault.read(file)
      expect(content).toContain('tags:')
      expect(content).toContain('- tag1')
      expect(content).toContain('date: 2024-01-01')
    })

    it('should remove frontmatter fields when set to undefined', async () => {
      const file = vault.getFileByPath('notes/with-frontmatter.md')!

      await fileManager.processFrontMatter(file, (fm) => {
        delete fm.tags
      })

      const content = await vault.read(file)
      expect(content).not.toContain('tags:')
      expect(content).not.toContain('- tag1')
    })

    it('should add frontmatter to file without frontmatter', async () => {
      const file = vault.getFileByPath('notes/no-frontmatter.md')!

      await fileManager.processFrontMatter(file, (fm) => {
        fm.title = 'New Title'
        fm.created = '2024-01-01'
      })

      const content = await vault.read(file)
      expect(content).toMatch(/^---\n/)
      expect(content).toContain('title: New Title')
      expect(content).toContain('created: 2024-01-01')
      expect(content).toContain('# No Frontmatter')
    })

    it('should handle empty frontmatter', async () => {
      const file = vault.getFileByPath('notes/empty-frontmatter.md')!

      await fileManager.processFrontMatter(file, (fm) => {
        fm.title = 'Now Has Title'
      })

      const content = await vault.read(file)
      expect(content).toContain('title: Now Has Title')
      expect(content).toContain('# Empty Frontmatter')
    })

    it('should preserve content after frontmatter', async () => {
      const file = vault.getFileByPath('notes/with-frontmatter.md')!
      const originalContent = await vault.read(file)

      await fileManager.processFrontMatter(file, (fm) => {
        fm.title = 'Changed'
      })

      const newContent = await vault.read(file)
      expect(newContent).toContain('Some content here.')
    })

    it('should handle arrays in frontmatter', async () => {
      const file = vault.getFileByPath('notes/with-frontmatter.md')!

      await fileManager.processFrontMatter(file, (fm) => {
        (fm.tags as string[]).push('tag3')
      })

      const content = await vault.read(file)
      expect(content).toContain('- tag1')
      expect(content).toContain('- tag2')
      expect(content).toContain('- tag3')
    })

    it('should handle nested objects in frontmatter', async () => {
      const file = vault.getFileByPath('notes/with-frontmatter.md')!

      await fileManager.processFrontMatter(file, (fm) => {
        fm.metadata = { author: 'Test', version: 1 }
      })

      const content = await vault.read(file)
      expect(content).toContain('metadata:')
      expect(content).toContain('author: Test')
      expect(content).toContain('version: 1')
    })

    it('should be atomic - rollback on error', async () => {
      const file = vault.getFileByPath('notes/with-frontmatter.md')!
      const originalContent = await vault.read(file)

      await expect(
        fileManager.processFrontMatter(file, () => {
          throw new Error('Processing failed')
        })
      ).rejects.toThrow('Processing failed')

      // Content should be unchanged
      const content = await vault.read(file)
      expect(content).toBe(originalContent)
    })

    it('should handle concurrent modifications safely', async () => {
      const file = vault.getFileByPath('notes/with-frontmatter.md')!

      // Start two concurrent modifications
      const promise1 = fileManager.processFrontMatter(file, (fm) => {
        fm.field1 = 'value1'
      })

      const promise2 = fileManager.processFrontMatter(file, (fm) => {
        fm.field2 = 'value2'
      })

      await Promise.all([promise1, promise2])

      const content = await vault.read(file)
      // Both modifications should be present
      expect(content).toContain('field1: value1')
      expect(content).toContain('field2: value2')
    })

    it('should handle boolean values correctly', async () => {
      const file = vault.getFileByPath('notes/with-frontmatter.md')!

      await fileManager.processFrontMatter(file, (fm) => {
        fm.published = true
        fm.draft = false
      })

      const content = await vault.read(file)
      expect(content).toContain('published: true')
      expect(content).toContain('draft: false')
    })

    it('should handle null values correctly', async () => {
      const file = vault.getFileByPath('notes/with-frontmatter.md')!

      await fileManager.processFrontMatter(file, (fm) => {
        fm.nullField = null
      })

      const content = await vault.read(file)
      expect(content).toContain('nullField: null')
    })

    it('should preserve frontmatter formatting style', async () => {
      await backend.write('notes/formatted.md', `---
title: "Quoted Title"
tags: [inline, array]
---

Content`)

      const file = vault.getFileByPath('notes/formatted.md')!

      await fileManager.processFrontMatter(file, (fm) => {
        fm.newField = 'value'
      })

      const content = await vault.read(file)
      // Should still have valid YAML
      expect(content).toMatch(/^---\n/)
      expect(content).toMatch(/\n---\n/)
    })
  })

  describe('createMarkdownFile', () => {
    it('should create a new markdown file', async () => {
      const file = await fileManager.createMarkdownFile('notes/new.md', '# New Note\n\nContent here.')

      expect(file).toBeDefined()
      expect(file.path).toBe('notes/new.md')
      expect(file.extension).toBe('md')
    })

    it('should create file with correct content', async () => {
      const content = '# Test\n\nSome content.'
      await fileManager.createMarkdownFile('test.md', content)

      const file = vault.getFileByPath('test.md')!
      const readContent = await vault.read(file)
      expect(readContent).toBe(content)
    })

    it('should create parent directories if needed', async () => {
      await fileManager.createMarkdownFile('deep/nested/folder/note.md', '# Note')

      const file = vault.getFileByPath('deep/nested/folder/note.md')
      expect(file).toBeDefined()
    })

    it('should throw if file already exists', async () => {
      await backend.write('existing.md', 'Content')

      await expect(fileManager.createMarkdownFile('existing.md', 'New content'))
        .rejects.toThrow()
    })

    it('should add .md extension if missing', async () => {
      const file = await fileManager.createMarkdownFile('notes/noext', '# Note')

      expect(file.path).toBe('notes/noext.md')
    })

    it('should emit create event', async () => {
      const events: TFile[] = []
      vault.on('create', (file: TFile) => {
        events.push(file)
      })

      await fileManager.createMarkdownFile('events/test.md', '# Test')

      expect(events).toHaveLength(1)
      expect(events[0].path).toBe('events/test.md')
    })

    it('should handle empty content', async () => {
      const file = await fileManager.createMarkdownFile('empty.md', '')

      expect(file).toBeDefined()
      const content = await vault.read(file)
      expect(content).toBe('')
    })

    it('should handle content with frontmatter', async () => {
      const content = `---
title: New Note
---

# New Note`

      const file = await fileManager.createMarkdownFile('with-fm.md', content)

      const readContent = await vault.read(file)
      expect(readContent).toContain('title: New Note')
    })
  })

  describe('getLinkPath', () => {
    beforeEach(async () => {
      await backend.write('notes/target.md', '# Target')
      await backend.write('notes/source.md', '# Source')
      await backend.write('other/target.md', '# Other Target')
      await backend.write('unique.md', '# Unique')
    })

    it('should return basename for file in same directory', () => {
      const linkPath = fileManager.getLinkPath('notes/target.md', 'notes/source.md')
      expect(linkPath).toBe('target')
    })

    it('should return relative path for file in different directory', () => {
      const linkPath = fileManager.getLinkPath('notes/target.md', 'other/source.md')
      expect(linkPath).toBe('notes/target')
    })

    it('should return full path when basename is ambiguous', () => {
      const linkPath = fileManager.getLinkPath('notes/target.md', 'daily/log.md')
      expect(linkPath).toBe('notes/target')
    })

    it('should return basename when file is unique', () => {
      const linkPath = fileManager.getLinkPath('unique.md', 'notes/source.md')
      expect(linkPath).toBe('unique')
    })

    it('should handle nested paths', () => {
      const linkPath = fileManager.getLinkPath('notes/target.md', 'deep/nested/file.md')
      expect(linkPath).toBe('notes/target')
    })

    it('should return empty string for self-reference', () => {
      const linkPath = fileManager.getLinkPath('notes/source.md', 'notes/source.md')
      expect(linkPath).toBe('')
    })

    it('should handle root files correctly', () => {
      const linkPath = fileManager.getLinkPath('unique.md', 'notes/source.md')
      expect(linkPath).toBe('unique')
    })

    it('should handle non-markdown files', () => {
      const linkPath = fileManager.getLinkPath('attachments/image.png', 'notes/source.md')
      expect(linkPath).toBe('attachments/image.png')
    })
  })

  describe('edge cases', () => {
    it('should handle files with special characters in names', async () => {
      await backend.write('notes/[special].md', '# Special')
      await backend.write('notes/source.md', '# Source with link [[special]]')

      const file = vault.getFileByPath('notes/[special].md')!
      const link = fileManager.generateMarkdownLink(file, 'notes/source.md')

      expect(link).toBe('[[special]]')
    })

    it('should handle files with unicode characters', async () => {
      await backend.write('notes/日本語.md', '# Japanese')

      const file = vault.getFileByPath('notes/日本語.md')!
      const link = fileManager.generateMarkdownLink(file, 'notes/source.md')

      expect(link).toBe('[[日本語]]')
    })

    it('should handle deeply nested file structures', async () => {
      await backend.write('a/b/c/d/e/f/deep.md', '# Deep')

      const file = vault.getFileByPath('a/b/c/d/e/f/deep.md')!
      const link = fileManager.generateMarkdownLink(file, 'notes/source.md')

      // Should still generate a valid link
      expect(link).toContain('deep')
    })

    it('should handle files with dots in name', async () => {
      await backend.write('notes/file.v2.md', '# File v2')

      const file = vault.getFileByPath('notes/file.v2.md')!
      expect(file.basename).toBe('file.v2')

      const link = fileManager.generateMarkdownLink(file, 'notes/source.md')
      expect(link).toBe('[[file.v2]]')
    })

    it('should handle rename to same directory', async () => {
      await backend.write('notes/old-name.md', '# Old')
      await backend.write('notes/linker.md', '# Linker\n[[old-name]]')

      const file = vault.getFileByPath('notes/old-name.md')!
      await fileManager.renameFile(file, 'notes/new-name.md')

      expect(vault.getFileByPath('notes/old-name.md')).toBeNull()
      expect(vault.getFileByPath('notes/new-name.md')).toBeDefined()

      const linkerContent = await vault.read(vault.getFileByPath('notes/linker.md')!)
      expect(linkerContent).toContain('[[new-name]]')
    })

    it('should handle empty vault gracefully', async () => {
      const emptyBackend = new MemoryBackend()
      const emptyVault = new Vault(emptyBackend)
      const emptyCache = new MetadataCache(emptyVault)
      const emptyFileManager = new FileManager(emptyVault, emptyCache)

      // Should not throw when creating first file
      const file = await emptyFileManager.createMarkdownFile('first.md', '# First')
      expect(file).toBeDefined()
    })

    it('should handle markdown links in code blocks (should not update)', async () => {
      await backend.write('notes/target.md', '# Target')
      await backend.write('notes/with-code.md', `# With Code

\`\`\`markdown
[[target]]
\`\`\`

Actual link: [[target]]
`)

      const file = vault.getFileByPath('notes/target.md')!
      await fileManager.renameFile(file, 'notes/renamed.md')

      const content = await vault.read(vault.getFileByPath('notes/with-code.md')!)
      // Code block should be unchanged
      expect(content).toContain('```markdown\n[[target]]\n```')
      // Actual link should be updated
      expect(content).toContain('Actual link: [[renamed]]')
    })

    it('should handle inline code with links (should not update)', async () => {
      await backend.write('notes/target.md', '# Target')
      await backend.write('notes/with-inline.md', '# Note\n\nInline `[[target]]` and real [[target]]')

      const file = vault.getFileByPath('notes/target.md')!
      await fileManager.renameFile(file, 'notes/renamed.md')

      const content = await vault.read(vault.getFileByPath('notes/with-inline.md')!)
      // Inline code should be unchanged
      expect(content).toContain('`[[target]]`')
      // Real link should be updated
      expect(content).toContain('real [[renamed]]')
    })
  })

  describe('listFilesByExtension', () => {
    beforeEach(async () => {
      await backend.write('notes/note1.md', '# Note 1')
      await backend.write('notes/note2.md', '# Note 2')
      await backend.write('notes/draft.txt', 'Draft content')
      await backend.write('assets/image.png', 'binary data')
      await backend.write('assets/photo.jpg', 'photo data')
      await backend.write('data/config.json', '{}')
      await backend.write('data/settings.yaml', 'key: value')
      await backend.write('archive/old-note.md', '# Old')
      await backend.write('notes/nested/deep.md', '# Deep Note')
    })

    it('should list all markdown files', () => {
      const mdFiles = fileManager.listFilesByExtension('md')

      expect(mdFiles).toHaveLength(4)
      expect(mdFiles.map(f => f.path).sort()).toEqual([
        'archive/old-note.md',
        'notes/nested/deep.md',
        'notes/note1.md',
        'notes/note2.md'
      ])
    })

    it('should list files by extension case-insensitively', () => {
      const mdFiles = fileManager.listFilesByExtension('MD')

      expect(mdFiles).toHaveLength(4)
    })

    it('should return empty array for non-existent extension', () => {
      const pdfFiles = fileManager.listFilesByExtension('pdf')

      expect(pdfFiles).toEqual([])
    })

    it('should list image files by extension', () => {
      const pngFiles = fileManager.listFilesByExtension('png')
      const jpgFiles = fileManager.listFilesByExtension('jpg')

      expect(pngFiles).toHaveLength(1)
      expect(pngFiles[0].path).toBe('assets/image.png')
      expect(jpgFiles).toHaveLength(1)
      expect(jpgFiles[0].path).toBe('assets/photo.jpg')
    })

    it('should list files with multiple extensions', () => {
      const allFiles = fileManager.listFilesByExtension(['md', 'txt'])

      expect(allFiles).toHaveLength(5)
      expect(allFiles.some(f => f.extension === 'md')).toBe(true)
      expect(allFiles.some(f => f.extension === 'txt')).toBe(true)
    })

    it('should handle extension with leading dot', () => {
      const mdFiles1 = fileManager.listFilesByExtension('md')
      const mdFiles2 = fileManager.listFilesByExtension('.md')

      expect(mdFiles1).toEqual(mdFiles2)
    })

    it('should include files in nested directories', () => {
      const mdFiles = fileManager.listFilesByExtension('md')

      expect(mdFiles.some(f => f.path === 'notes/nested/deep.md')).toBe(true)
    })

    it('should return TFile objects with correct properties', () => {
      const mdFiles = fileManager.listFilesByExtension('md')

      mdFiles.forEach(file => {
        expect(file).toHaveProperty('path')
        expect(file).toHaveProperty('name')
        expect(file).toHaveProperty('basename')
        expect(file).toHaveProperty('extension')
        expect(file).toHaveProperty('stat')
        expect(file.extension).toBe('md')
      })
    })
  })

  describe('getFilesInDirectory', () => {
    beforeEach(async () => {
      await backend.write('root.md', '# Root')
      await backend.write('notes/note1.md', '# Note 1')
      await backend.write('notes/note2.md', '# Note 2')
      await backend.write('notes/nested/deep.md', '# Deep')
      await backend.write('notes/nested/deeper/file.md', '# Deeper')
      await backend.write('archive/old.md', '# Old')
      await backend.write('assets/image.png', 'binary')
    })

    it('should list files in root directory (non-recursive)', () => {
      const files = fileManager.getFilesInDirectory('/', false)

      expect(files).toHaveLength(1)
      expect(files[0].path).toBe('root.md')
    })

    it('should list files in subdirectory (non-recursive)', () => {
      const files = fileManager.getFilesInDirectory('notes', false)

      expect(files).toHaveLength(2)
      expect(files.map(f => f.path).sort()).toEqual([
        'notes/note1.md',
        'notes/note2.md'
      ])
    })

    it('should list files recursively', () => {
      const files = fileManager.getFilesInDirectory('notes', true)

      expect(files).toHaveLength(4)
      expect(files.map(f => f.path).sort()).toEqual([
        'notes/nested/deep.md',
        'notes/nested/deeper/file.md',
        'notes/note1.md',
        'notes/note2.md'
      ])
    })

    it('should handle nested directory recursively', () => {
      const files = fileManager.getFilesInDirectory('notes/nested', true)

      expect(files).toHaveLength(2)
      expect(files.some(f => f.path === 'notes/nested/deep.md')).toBe(true)
      expect(files.some(f => f.path === 'notes/nested/deeper/file.md')).toBe(true)
    })

    it('should return empty array for non-existent directory', () => {
      const files = fileManager.getFilesInDirectory('nonexistent', false)

      expect(files).toEqual([])
    })

    it('should handle directory path with trailing slash', () => {
      const files1 = fileManager.getFilesInDirectory('notes/', false)
      const files2 = fileManager.getFilesInDirectory('notes', false)

      expect(files1).toEqual(files2)
    })

    it('should handle directory path with leading slash', () => {
      const files1 = fileManager.getFilesInDirectory('/notes', false)
      const files2 = fileManager.getFilesInDirectory('notes', false)

      expect(files1).toEqual(files2)
    })

    it('should list all files recursively from root', () => {
      const files = fileManager.getFilesInDirectory('/', true)

      expect(files.length).toBeGreaterThanOrEqual(7)
    })
  })

  describe('watchFileChanges', () => {
    it('should watch for file creation', async () => {
      const callback = vi.fn()
      const watcher = fileManager.watchFileChanges(callback)

      await backend.write('new-file.md', '# New File')

      expect(callback).toHaveBeenCalledWith({
        type: 'create',
        file: expect.objectContaining({ path: 'new-file.md' })
      })

      watcher.unwatch()
    })

    it('should watch for file modification', async () => {
      await backend.write('watch-me.md', '# Original')

      const callback = vi.fn()
      const watcher = fileManager.watchFileChanges(callback)

      const file = vault.getFileByPath('watch-me.md')!
      await vault.modify(file, '# Modified')

      expect(callback).toHaveBeenCalledWith({
        type: 'modify',
        file: expect.objectContaining({ path: 'watch-me.md' })
      })

      watcher.unwatch()
    })

    it('should watch for file deletion', async () => {
      await backend.write('delete-me.md', '# Delete')

      const callback = vi.fn()
      const watcher = fileManager.watchFileChanges(callback)

      const file = vault.getFileByPath('delete-me.md')!
      await vault.delete(file)

      expect(callback).toHaveBeenCalledWith({
        type: 'delete',
        file: expect.objectContaining({ path: 'delete-me.md' })
      })

      watcher.unwatch()
    })

    it('should watch for file rename', async () => {
      await backend.write('old-name.md', '# Old Name')

      const callback = vi.fn()
      const watcher = fileManager.watchFileChanges(callback)

      const file = vault.getFileByPath('old-name.md')!
      await vault.rename(file, 'new-name.md')

      expect(callback).toHaveBeenCalledWith({
        type: 'rename',
        file: expect.objectContaining({ path: 'new-name.md' }),
        oldPath: 'old-name.md'
      })

      watcher.unwatch()
    })

    it('should support multiple watchers simultaneously', async () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      const watcher1 = fileManager.watchFileChanges(callback1)
      const watcher2 = fileManager.watchFileChanges(callback2)

      await backend.write('watched.md', '# Watched')

      expect(callback1).toHaveBeenCalledTimes(1)
      expect(callback2).toHaveBeenCalledTimes(1)

      watcher1.unwatch()
      watcher2.unwatch()
    })

    it('should stop receiving events after unwatch', async () => {
      const callback = vi.fn()
      const watcher = fileManager.watchFileChanges(callback)

      await backend.write('file1.md', '# File 1')
      expect(callback).toHaveBeenCalledTimes(1)

      watcher.unwatch()

      await backend.write('file2.md', '# File 2')
      expect(callback).toHaveBeenCalledTimes(1) // Still 1, not 2
    })

    it('should filter events by file pattern', async () => {
      const callback = vi.fn()
      const watcher = fileManager.watchFileChanges(callback, {
        pattern: '**/*.md'
      })

      await backend.write('note.md', '# Note')
      await backend.write('image.png', 'binary')

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          file: expect.objectContaining({ path: 'note.md' })
        })
      )

      watcher.unwatch()
    })

    it('should filter events by directory', async () => {
      const callback = vi.fn()
      const watcher = fileManager.watchFileChanges(callback, {
        directory: 'notes'
      })

      await backend.write('notes/watched.md', '# Watched')
      await backend.write('other/ignored.md', '# Ignored')

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          file: expect.objectContaining({ path: 'notes/watched.md' })
        })
      )

      watcher.unwatch()
    })

    it('should handle rapid successive changes', async () => {
      const callback = vi.fn()
      const watcher = fileManager.watchFileChanges(callback)

      await backend.write('rapid1.md', '# 1')
      await backend.write('rapid2.md', '# 2')
      await backend.write('rapid3.md', '# 3')

      expect(callback).toHaveBeenCalledTimes(3)

      watcher.unwatch()
    })

    it('should return watcher with unwatch method', () => {
      const callback = vi.fn()
      const watcher = fileManager.watchFileChanges(callback)

      expect(watcher).toBeDefined()
      expect(typeof watcher.unwatch).toBe('function')

      watcher.unwatch()
    })
  })

  describe('normalizePath', () => {
    it('should remove leading slash', () => {
      expect(fileManager.normalizePath('/path/to/file.md')).toBe('path/to/file.md')
    })

    it('should remove trailing slash', () => {
      expect(fileManager.normalizePath('path/to/folder/')).toBe('path/to/folder')
    })

    it('should convert backslashes to forward slashes', () => {
      expect(fileManager.normalizePath('path\\to\\file.md')).toBe('path/to/file.md')
    })

    it('should handle mixed slashes', () => {
      expect(fileManager.normalizePath('path/to\\file.md')).toBe('path/to/file.md')
    })

    it('should collapse double slashes', () => {
      expect(fileManager.normalizePath('path//to///file.md')).toBe('path/to/file.md')
    })

    it('should resolve relative paths with dot', () => {
      expect(fileManager.normalizePath('path/./to/file.md')).toBe('path/to/file.md')
    })

    it('should resolve relative paths with double dot', () => {
      expect(fileManager.normalizePath('path/to/../file.md')).toBe('path/file.md')
    })

    it('should handle complex relative paths', () => {
      expect(fileManager.normalizePath('path/to/./nested/../file.md')).toBe('path/to/file.md')
    })

    it('should handle root path', () => {
      expect(fileManager.normalizePath('/')).toBe('')
    })

    it('should handle empty string', () => {
      expect(fileManager.normalizePath('')).toBe('')
    })

    it('should handle already normalized path', () => {
      expect(fileManager.normalizePath('path/to/file.md')).toBe('path/to/file.md')
    })

    it('should handle Windows-style absolute paths', () => {
      expect(fileManager.normalizePath('C:\\Users\\path\\file.md')).toBe('C:/Users/path/file.md')
    })

    it('should preserve spaces in filenames', () => {
      expect(fileManager.normalizePath('path/to/my file.md')).toBe('path/to/my file.md')
    })

    it('should handle paths with special characters', () => {
      expect(fileManager.normalizePath('path/to/file-name_123.md')).toBe('path/to/file-name_123.md')
    })

    it('should handle unicode characters', () => {
      expect(fileManager.normalizePath('path/to/日本語.md')).toBe('path/to/日本語.md')
    })

    it('should handle multiple parent directory references', () => {
      expect(fileManager.normalizePath('a/b/c/../../d/file.md')).toBe('a/d/file.md')
    })

    it('should not go beyond root with excessive parent references', () => {
      expect(fileManager.normalizePath('../../../file.md')).toBe('file.md')
    })

    it('should handle paths with only separators', () => {
      expect(fileManager.normalizePath('///')).toBe('')
    })

    it('should handle paths with dots at the end', () => {
      expect(fileManager.normalizePath('path/to/file.')).toBe('path/to/file.')
    })
  })

  describe('getRelativePath', () => {
    it('should return filename for files in same directory', () => {
      const relativePath = fileManager.getRelativePath('notes/target.md', 'notes/source.md')
      expect(relativePath).toBe('target.md')
    })

    it('should calculate relative path with parent traversal', () => {
      const relativePath = fileManager.getRelativePath('other/target.md', 'notes/source.md')
      expect(relativePath).toBe('../other/target.md')
    })

    it('should handle nested subdirectories', () => {
      const relativePath = fileManager.getRelativePath('notes/nested/deep.md', 'notes/source.md')
      expect(relativePath).toBe('nested/deep.md')
    })

    it('should handle multiple levels of parent traversal', () => {
      const relativePath = fileManager.getRelativePath('a/b/c.md', 'x/y/z/source.md')
      expect(relativePath).toBe('../../../a/b/c.md')
    })

    it('should handle root file to nested file', () => {
      const relativePath = fileManager.getRelativePath('notes/target.md', 'root.md')
      expect(relativePath).toBe('notes/target.md')
    })

    it('should handle nested file to root file', () => {
      const relativePath = fileManager.getRelativePath('root.md', 'notes/source.md')
      expect(relativePath).toBe('../root.md')
    })

    it('should handle common ancestor paths', () => {
      const relativePath = fileManager.getRelativePath('notes/a/target.md', 'notes/b/source.md')
      expect(relativePath).toBe('../a/target.md')
    })
  })

  describe('getBacklinks', () => {
    beforeEach(async () => {
      await backend.write('notes/target.md', '# Target Note\nSome content.')
      await backend.write('notes/source.md', '# Source Note\nLink to [[target]].')
      await backend.write('notes/another.md', '# Another Note\nAlso links to [[target]] and [[target|alias]].')
      await backend.write('notes/embed.md', '# Embed Note\nEmbed: ![[target]]')
      await backend.write('notes/no-links.md', '# No Links\nNo links here.')
      // Initialize the cache
      await cache.initialize()
    })

    it('should find all files linking to a target', async () => {
      const file = vault.getFileByPath('notes/target.md')!
      const backlinks = fileManager.getBacklinks(file)

      expect(backlinks.size).toBe(3)
      expect(backlinks.has('notes/source.md')).toBe(true)
      expect(backlinks.has('notes/another.md')).toBe(true)
      expect(backlinks.has('notes/embed.md')).toBe(true)
    })

    it('should return link positions', async () => {
      const file = vault.getFileByPath('notes/target.md')!
      const backlinks = fileManager.getBacklinks(file)

      const sourceLinks = backlinks.get('notes/source.md')!
      expect(sourceLinks).toHaveLength(1)
      expect(sourceLinks[0].link).toBe('target')
      expect(sourceLinks[0].position).toHaveProperty('line')
      expect(sourceLinks[0].position).toHaveProperty('col')
    })

    it('should include multiple links from same file', async () => {
      const file = vault.getFileByPath('notes/target.md')!
      const backlinks = fileManager.getBacklinks(file)

      const anotherLinks = backlinks.get('notes/another.md')!
      expect(anotherLinks.length).toBe(2)
    })

    it('should include embeds as backlinks', async () => {
      const file = vault.getFileByPath('notes/target.md')!
      const backlinks = fileManager.getBacklinks(file)

      expect(backlinks.has('notes/embed.md')).toBe(true)
    })

    it('should return empty map for file with no backlinks', async () => {
      const file = vault.getFileByPath('notes/no-links.md')!
      const backlinks = fileManager.getBacklinks(file)

      expect(backlinks.size).toBe(0)
    })

    it('should not include self-references', async () => {
      await backend.write('notes/self-ref.md', '# Self\n[[self-ref]]')
      await cache.indexFile(vault.getFileByPath('notes/self-ref.md')!)

      const file = vault.getFileByPath('notes/self-ref.md')!
      const backlinks = fileManager.getBacklinks(file)

      expect(backlinks.has('notes/self-ref.md')).toBe(false)
    })
  })

  describe('updateLinks', () => {
    it('should update basename links', () => {
      const content = '# Note\nLink: [[target]]\nAnother: [[other]]'
      const result = fileManager.updateLinks(content, 'notes/target.md', 'notes/renamed.md')

      expect(result).toContain('[[renamed]]')
      expect(result).toContain('[[other]]') // Should not change
    })

    it('should update full path links', () => {
      const content = '# Note\nLink: [[notes/target]]'
      const result = fileManager.updateLinks(content, 'notes/target.md', 'archive/target.md')

      expect(result).toContain('[[archive/target]]')
    })

    it('should preserve aliases', () => {
      const content = '# Note\nLink: [[target|My Alias]]'
      const result = fileManager.updateLinks(content, 'notes/target.md', 'notes/renamed.md')

      expect(result).toContain('[[renamed|My Alias]]')
    })

    it('should preserve subpaths (headings)', () => {
      const content = '# Note\nLink: [[target#section]]'
      const result = fileManager.updateLinks(content, 'notes/target.md', 'notes/renamed.md')

      expect(result).toContain('[[renamed#section]]')
    })

    it('should preserve block references', () => {
      const content = '# Note\nLink: [[target#^block-id]]'
      const result = fileManager.updateLinks(content, 'notes/target.md', 'notes/renamed.md')

      expect(result).toContain('[[renamed#^block-id]]')
    })

    it('should update embeds', () => {
      const content = '# Note\nEmbed: ![[target]]'
      const result = fileManager.updateLinks(content, 'notes/target.md', 'notes/renamed.md')

      expect(result).toContain('![[renamed]]')
    })

    it('should not update links in code blocks', () => {
      const content = '# Note\n```\n[[target]]\n```\nReal: [[target]]'
      const result = fileManager.updateLinks(content, 'notes/target.md', 'notes/renamed.md')

      expect(result).toContain('```\n[[target]]\n```')
      expect(result).toContain('Real: [[renamed]]')
    })

    it('should not update links in inline code', () => {
      const content = '# Note\nInline `[[target]]` and real [[target]]'
      const result = fileManager.updateLinks(content, 'notes/target.md', 'notes/renamed.md')

      expect(result).toContain('`[[target]]`')
      expect(result).toContain('real [[renamed]]')
    })

    it('should handle multiple links in same content', () => {
      const content = '[[target]] and [[target|alias]] and [[notes/target#heading]]'
      const result = fileManager.updateLinks(content, 'notes/target.md', 'notes/renamed.md')

      expect(result).toBe('[[renamed]] and [[renamed|alias]] and [[notes/renamed#heading]]')
    })
  })
})
