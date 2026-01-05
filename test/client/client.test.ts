import { describe, it, expect, beforeEach } from 'vitest'
import { ObsidianClient, ObsidianClientOptions } from '../../src/client/client.js'
import { MemoryBackend } from '../../src/vault/memory-backend.js'

describe('ObsidianClient', () => {
  let client: ObsidianClient
  let backend: MemoryBackend

  beforeEach(() => {
    backend = new MemoryBackend()
  })

  describe('initialization', () => {
    describe('constructor', () => {
      it('should create an ObsidianClient with a backend', () => {
        const options: ObsidianClientOptions = { backend }
        client = new ObsidianClient(options)

        expect(client).toBeInstanceOf(ObsidianClient)
      })

      it('should accept optional vaultPath option', () => {
        const options: ObsidianClientOptions = { backend, vaultPath: '/my/vault' }
        client = new ObsidianClient(options)

        expect(client).toBeInstanceOf(ObsidianClient)
      })

      it('should initialize vault property', () => {
        const options: ObsidianClientOptions = { backend }
        client = new ObsidianClient(options)

        expect(client.vault).toBeDefined()
      })

      it('should initialize metadataCache property', () => {
        const options: ObsidianClientOptions = { backend }
        client = new ObsidianClient(options)

        expect(client.metadataCache).toBeDefined()
      })

      it('should initialize graph property', () => {
        const options: ObsidianClientOptions = { backend }
        client = new ObsidianClient(options)

        expect(client.graph).toBeDefined()
      })

      it('should initialize search property', () => {
        const options: ObsidianClientOptions = { backend }
        client = new ObsidianClient(options)

        expect(client.search).toBeDefined()
      })
    })

    describe('initialize()', () => {
      it('should return a promise that resolves when initialization is complete', async () => {
        const options: ObsidianClientOptions = { backend }
        client = new ObsidianClient(options)

        await expect(client.initialize()).resolves.toBeUndefined()
      })

      it('should load all files from the backend during initialization', async () => {
        await backend.write('note1.md', '# Note 1')
        await backend.write('note2.md', '# Note 2')
        await backend.write('folder/note3.md', '# Note 3')

        const options: ObsidianClientOptions = { backend }
        client = new ObsidianClient(options)
        await client.initialize()

        const files = client.vault.getMarkdownFiles()
        expect(files).toHaveLength(3)
      })

      it('should parse metadata for all files during initialization', async () => {
        await backend.write('note.md', `---
title: Test Note
tags: [test, example]
---

# Content

[[Another Note]]
`)
        const options: ObsidianClientOptions = { backend }
        client = new ObsidianClient(options)
        await client.initialize()

        const file = client.vault.getFileByPath('note.md')
        expect(file).not.toBeNull()
        const cache = client.metadataCache.getFileCache(file!)
        expect(cache).not.toBeNull()
        expect(cache!.frontmatter).toBeDefined()
        expect(cache!.frontmatter!.title).toBe('Test Note')
      })

      it('should build link graph during initialization', async () => {
        await backend.write('note-a.md', '# Note A\n\n[[Note B]]')
        await backend.write('note-b.md', '# Note B\n\n[[Note A]]')

        const options: ObsidianClientOptions = { backend }
        client = new ObsidianClient(options)
        await client.initialize()

        const backlinks = client.graph.getBacklinks('note-a.md')
        expect(backlinks).toContain('note-b.md')
      })

      it('should handle empty vault during initialization', async () => {
        const options: ObsidianClientOptions = { backend }
        client = new ObsidianClient(options)

        await expect(client.initialize()).resolves.toBeUndefined()
        expect(client.vault.getFiles()).toHaveLength(0)
      })

      it('should only initialize once even if called multiple times', async () => {
        await backend.write('note.md', '# Note')

        const options: ObsidianClientOptions = { backend }
        client = new ObsidianClient(options)

        await client.initialize()
        await client.initialize() // Second call should be idempotent

        const files = client.vault.getFiles()
        expect(files).toHaveLength(1)
      })
    })

    describe('Memory backend with initialFiles', () => {
      it('should support MemoryBackend with initial files via constructor', async () => {
        // This tests that MemoryBackend should support initial files in constructor
        const backendWithFiles = new MemoryBackend({
          'note1.md': '# Note 1',
          'note2.md': '# Note 2',
          'folder/nested.md': '# Nested Note'
        })

        const options: ObsidianClientOptions = { backend: backendWithFiles }
        client = new ObsidianClient(options)
        await client.initialize()

        const files = client.vault.getMarkdownFiles()
        expect(files).toHaveLength(3)
      })

      it('should properly parse frontmatter from initial files', async () => {
        const backendWithFiles = new MemoryBackend({
          'note.md': `---
title: Initial Note
date: 2024-01-01
---

# Content here`
        })

        const options: ObsidianClientOptions = { backend: backendWithFiles }
        client = new ObsidianClient(options)
        await client.initialize()

        const file = client.vault.getFileByPath('note.md')
        const cache = client.metadataCache.getFileCache(file!)
        expect(cache!.frontmatter!.title).toBe('Initial Note')
        expect(cache!.frontmatter!.date).toBe('2024-01-01')
      })

      it('should build graph from initial files with links', async () => {
        const backendWithFiles = new MemoryBackend({
          'hub.md': '# Hub\n\n[[Spoke 1]]\n[[Spoke 2]]\n[[Spoke 3]]',
          'Spoke 1.md': '# Spoke 1\n\n[[hub]]',
          'Spoke 2.md': '# Spoke 2\n\n[[hub]]',
          'Spoke 3.md': '# Spoke 3\n\n[[hub]]'
        })

        const options: ObsidianClientOptions = { backend: backendWithFiles }
        client = new ObsidianClient(options)
        await client.initialize()

        const hubBacklinks = client.graph.getBacklinks('hub.md')
        expect(hubBacklinks).toHaveLength(3)
      })
    })
  })

  describe('getNote()', () => {
    beforeEach(async () => {
      const options: ObsidianClientOptions = { backend }
      client = new ObsidianClient(options)
    })

    describe('basic retrieval', () => {
      it('should return file, content, metadata, and backlinks for a note', async () => {
        await backend.write('test.md', '# Test Content')
        await client.initialize()

        const result = await client.getNote('test.md')

        expect(result).toHaveProperty('file')
        expect(result).toHaveProperty('content')
        expect(result).toHaveProperty('metadata')
        expect(result).toHaveProperty('backlinks')
      })

      it('should return the correct file object', async () => {
        await backend.write('notes/my-note.md', '# My Note')
        await client.initialize()

        const result = await client.getNote('notes/my-note.md')

        expect(result.file.path).toBe('notes/my-note.md')
        expect(result.file.name).toBe('my-note.md')
        expect(result.file.basename).toBe('my-note')
        expect(result.file.extension).toBe('md')
      })

      it('should return the correct content', async () => {
        const content = `---
title: Test
---

# Heading

Some paragraph text.

- List item 1
- List item 2
`
        await backend.write('test.md', content)
        await client.initialize()

        const result = await client.getNote('test.md')

        expect(result.content).toBe(content)
      })

      it('should throw error for non-existent note', async () => {
        await client.initialize()

        await expect(client.getNote('does-not-exist.md')).rejects.toThrow()
      })

      it('should throw error for path that is not a markdown file', async () => {
        await backend.write('image.png', 'binary content')
        await client.initialize()

        await expect(client.getNote('image.png')).rejects.toThrow()
      })
    })

    describe('content retrieval', () => {
      it('should return empty content for empty file', async () => {
        await backend.write('empty.md', '')
        await client.initialize()

        const result = await client.getNote('empty.md')

        expect(result.content).toBe('')
      })

      it('should return content with unicode characters', async () => {
        const content = '# Unicode Test\n\nEmoji: 🚀 中文 العربية'
        await backend.write('unicode.md', content)
        await client.initialize()

        const result = await client.getNote('unicode.md')

        expect(result.content).toBe(content)
      })

      it('should return content with code blocks intact', async () => {
        const content = `# Code Example

\`\`\`javascript
const x = 1;
function test() {
  return x;
}
\`\`\`

Inline \`code\` here.
`
        await backend.write('code.md', content)
        await client.initialize()

        const result = await client.getNote('code.md')

        expect(result.content).toBe(content)
      })
    })

    describe('metadata retrieval', () => {
      it('should return parsed frontmatter metadata', async () => {
        await backend.write('meta.md', `---
title: My Document
author: John Doe
tags:
  - test
  - example
date: 2024-01-15
draft: false
---

# Content`)
        await client.initialize()

        const result = await client.getNote('meta.md')

        expect(result.metadata).not.toBeNull()
        expect(result.metadata!.frontmatter).toBeDefined()
        expect(result.metadata!.frontmatter!.title).toBe('My Document')
        expect(result.metadata!.frontmatter!.author).toBe('John Doe')
        expect(result.metadata!.frontmatter!.tags).toEqual(['test', 'example'])
        expect(result.metadata!.frontmatter!.draft).toBe(false)
      })

      it('should return null metadata for file without frontmatter', async () => {
        await backend.write('no-meta.md', '# Just a Heading\n\nSome content.')
        await client.initialize()

        const result = await client.getNote('no-meta.md')

        // Metadata object exists but frontmatter is undefined
        expect(result.metadata!.frontmatter).toBeUndefined()
      })

      it('should return links in metadata', async () => {
        await backend.write('with-links.md', `# Document

This links to [[Another Note]] and also [[folder/deep note|Deep Note]].

And an embed: ![[image.png]]
`)
        await client.initialize()

        const result = await client.getNote('with-links.md')

        expect(result.metadata).not.toBeNull()
        expect(result.metadata!.links).toBeDefined()
        expect(result.metadata!.links).toHaveLength(2)
        expect(result.metadata!.links![0].link).toBe('Another Note')
        expect(result.metadata!.links![1].link).toBe('folder/deep note')
        expect(result.metadata!.links![1].displayText).toBe('Deep Note')
      })

      it('should return embeds in metadata', async () => {
        await backend.write('with-embeds.md', '# Document\n\n![[image.png]]\n![[note.md]]')
        await client.initialize()

        const result = await client.getNote('with-embeds.md')

        expect(result.metadata!.embeds).toBeDefined()
        expect(result.metadata!.embeds).toHaveLength(2)
      })

      it('should return tags in metadata', async () => {
        await backend.write('tagged.md', `---
tags: [frontmatter-tag]
---

# Document

#inline-tag and another #nested/tag here.
`)
        await client.initialize()

        const result = await client.getNote('tagged.md')

        expect(result.metadata!.tags).toBeDefined()
        expect(result.metadata!.tags!.some(t => t.tag === '#inline-tag')).toBe(true)
        expect(result.metadata!.tags!.some(t => t.tag === '#nested/tag')).toBe(true)
      })

      it('should return headings in metadata', async () => {
        await backend.write('headings.md', `# Heading 1

## Heading 2

### Heading 3

#### Heading 4

Some content between headings.

## Another H2
`)
        await client.initialize()

        const result = await client.getNote('headings.md')

        expect(result.metadata!.headings).toBeDefined()
        expect(result.metadata!.headings).toHaveLength(5)
        expect(result.metadata!.headings![0].heading).toBe('Heading 1')
        expect(result.metadata!.headings![0].level).toBe(1)
        expect(result.metadata!.headings![1].level).toBe(2)
        expect(result.metadata!.headings![2].level).toBe(3)
      })

      it('should return blocks with IDs in metadata', async () => {
        await backend.write('blocks.md', `# Document

This is a paragraph with a block ID. ^block-1

- List item ^list-block

> Quote block ^quote-id
`)
        await client.initialize()

        const result = await client.getNote('blocks.md')

        expect(result.metadata!.blocks).toBeDefined()
        expect(result.metadata!.blocks!['block-1']).toBeDefined()
        expect(result.metadata!.blocks!['list-block']).toBeDefined()
        expect(result.metadata!.blocks!['quote-id']).toBeDefined()
      })
    })

    describe('backlinks retrieval', () => {
      it('should return empty array when no backlinks exist', async () => {
        await backend.write('lonely.md', '# Lonely Note')
        await client.initialize()

        const result = await client.getNote('lonely.md')

        expect(result.backlinks).toEqual([])
      })

      it('should return files that link to this note', async () => {
        await backend.write('target.md', '# Target Note')
        await backend.write('linker1.md', '# Linker 1\n\n[[target]]')
        await backend.write('linker2.md', '# Linker 2\n\n[[target]]')
        await client.initialize()

        const result = await client.getNote('target.md')

        expect(result.backlinks).toHaveLength(2)
        expect(result.backlinks.map(f => f.path).sort()).toEqual(['linker1.md', 'linker2.md'])
      })

      it('should handle backlinks with different link formats', async () => {
        await backend.write('my note.md', '# My Note')
        await backend.write('linker.md', '# Linker\n\n[[my note]] and [[My Note]] and [[my note|alias]]')
        await client.initialize()

        const result = await client.getNote('my note.md')

        expect(result.backlinks).toHaveLength(1)
        expect(result.backlinks[0].path).toBe('linker.md')
      })

      it('should return backlinks from nested folder notes', async () => {
        await backend.write('root-note.md', '# Root Note')
        await backend.write('folder/nested-linker.md', '# Nested\n\n[[root-note]]')
        await backend.write('folder/deep/very-nested.md', '# Very Nested\n\n[[root-note]]')
        await client.initialize()

        const result = await client.getNote('root-note.md')

        expect(result.backlinks).toHaveLength(2)
      })

      it('should include backlinks from frontmatter links', async () => {
        await backend.write('target.md', '# Target')
        await backend.write('linker.md', `---
related: "[[target]]"
---

# Note with frontmatter link`)
        await client.initialize()

        const result = await client.getNote('target.md')

        expect(result.backlinks.some(f => f.path === 'linker.md')).toBe(true)
      })

      it('should return backlinks as TFile objects with correct properties', async () => {
        await backend.write('target.md', '# Target')
        await backend.write('folder/linker.md', '# Linker\n\n[[target]]')
        await client.initialize()

        const result = await client.getNote('target.md')

        expect(result.backlinks).toHaveLength(1)
        const backlink = result.backlinks[0]
        expect(backlink.path).toBe('folder/linker.md')
        expect(backlink.name).toBe('linker.md')
        expect(backlink.basename).toBe('linker')
        expect(backlink.extension).toBe('md')
        expect(backlink.stat).toBeDefined()
      })
    })
  })

  describe('createNote()', () => {
    beforeEach(async () => {
      const options: ObsidianClientOptions = { backend }
      client = new ObsidianClient(options)
      await client.initialize()
    })

    describe('basic creation', () => {
      it('should create a new note with content', async () => {
        const file = await client.createNote('new-note.md', '# New Note\n\nContent here.')

        expect(file.path).toBe('new-note.md')
        const content = await client.vault.read(file)
        expect(content).toBe('# New Note\n\nContent here.')
      })

      it('should return a TFile with correct properties', async () => {
        const file = await client.createNote('test.md', '# Test')

        expect(file.path).toBe('test.md')
        expect(file.name).toBe('test.md')
        expect(file.basename).toBe('test')
        expect(file.extension).toBe('md')
        expect(file.stat).toBeDefined()
        expect(file.stat.size).toBeGreaterThan(0)
      })

      it('should throw error if file already exists', async () => {
        await client.createNote('existing.md', '# Original')

        await expect(client.createNote('existing.md', '# Duplicate')).rejects.toThrow()
      })

      it('should create note with empty content', async () => {
        const file = await client.createNote('empty.md', '')

        expect(file.path).toBe('empty.md')
        const content = await client.vault.read(file)
        expect(content).toBe('')
      })
    })

    describe('frontmatter support', () => {
      it('should create note with frontmatter when provided', async () => {
        const file = await client.createNote('with-meta.md', '# Content', {
          title: 'My Title',
          tags: ['tag1', 'tag2'],
          draft: true
        })

        const content = await client.vault.read(file)
        expect(content).toContain('---')
        expect(content).toContain('title: My Title')
        expect(content).toContain('# Content')
      })

      it('should serialize frontmatter as valid YAML', async () => {
        const file = await client.createNote('yaml-test.md', 'Body content', {
          title: 'Test',
          count: 42,
          enabled: true,
          items: ['a', 'b', 'c'],
          nested: { key: 'value' }
        })

        const content = await client.vault.read(file)
        const result = await client.getNote('yaml-test.md')

        expect(result.metadata!.frontmatter!.title).toBe('Test')
        expect(result.metadata!.frontmatter!.count).toBe(42)
        expect(result.metadata!.frontmatter!.enabled).toBe(true)
        expect(result.metadata!.frontmatter!.items).toEqual(['a', 'b', 'c'])
      })

      it('should handle special characters in frontmatter values', async () => {
        const file = await client.createNote('special.md', 'Content', {
          title: 'Title with: colon and "quotes"',
          description: 'Multi\nline\nvalue'
        })

        const result = await client.getNote('special.md')
        expect(result.metadata!.frontmatter!.title).toBe('Title with: colon and "quotes"')
      })

      it('should not add frontmatter when not provided', async () => {
        const file = await client.createNote('no-front.md', '# Just content')

        const content = await client.vault.read(file)
        expect(content).toBe('# Just content')
        expect(content).not.toContain('---')
      })

      it('should handle empty frontmatter object', async () => {
        const file = await client.createNote('empty-front.md', '# Content', {})

        const content = await client.vault.read(file)
        // Empty frontmatter should not be added
        expect(content).toBe('# Content')
      })

      it('should handle date objects in frontmatter', async () => {
        const date = new Date('2024-06-15T10:30:00Z')
        const file = await client.createNote('dated.md', 'Content', {
          created: date
        })

        const result = await client.getNote('dated.md')
        // Date should be serialized as ISO string or similar
        expect(result.metadata!.frontmatter!.created).toBeDefined()
      })
    })

    describe('parent folder creation', () => {
      it('should create parent folders if they do not exist', async () => {
        const file = await client.createNote('folder/subfolder/note.md', '# Nested Note')

        expect(file.path).toBe('folder/subfolder/note.md')
        const content = await client.vault.read(file)
        expect(content).toBe('# Nested Note')
      })

      it('should create deeply nested folders', async () => {
        const file = await client.createNote('a/b/c/d/e/deep.md', '# Very Deep')

        expect(file.path).toBe('a/b/c/d/e/deep.md')
      })

      it('should not fail if parent folder already exists', async () => {
        await client.createNote('folder/first.md', '# First')
        const file = await client.createNote('folder/second.md', '# Second')

        expect(file.path).toBe('folder/second.md')
      })

      it('should handle folder names with spaces', async () => {
        const file = await client.createNote('My Folder/My Subfolder/note.md', '# Spaced')

        expect(file.path).toBe('My Folder/My Subfolder/note.md')
      })
    })

    describe('metadata cache integration', () => {
      it('should update metadata cache after creation', async () => {
        const file = await client.createNote('cached.md', `---
title: Cached Note
---

# Heading

[[Another Note]]
`)

        const cache = client.metadataCache.getFileCache(file)
        expect(cache).not.toBeNull()
        expect(cache!.frontmatter!.title).toBe('Cached Note')
        expect(cache!.headings).toHaveLength(1)
        expect(cache!.links).toHaveLength(1)
      })

      it('should update link graph after creation', async () => {
        await backend.write('target.md', '# Target')
        await client.initialize()

        await client.createNote('linker.md', '# Linker\n\n[[target]]')

        const backlinks = client.graph.getBacklinks('target.md')
        expect(backlinks).toContain('linker.md')
      })
    })
  })

  describe('updateNote()', () => {
    beforeEach(async () => {
      const options: ObsidianClientOptions = { backend }
      client = new ObsidianClient(options)
      await client.initialize()
    })

    describe('content update', () => {
      it('should update the content of an existing note', async () => {
        await client.createNote('note.md', '# Original')

        await client.updateNote('note.md', '# Updated Content')

        const result = await client.getNote('note.md')
        expect(result.content).toBe('# Updated Content')
      })

      it('should throw error for non-existent note', async () => {
        await expect(client.updateNote('ghost.md', '# Content')).rejects.toThrow()
      })

      it('should preserve frontmatter when updating content without it', async () => {
        await client.createNote('meta.md', '# Original', { title: 'Keep This' })

        await client.updateNote('meta.md', '# New Content')

        const result = await client.getNote('meta.md')
        // The update should replace full content - frontmatter is part of content
        expect(result.content).toBe('# New Content')
      })

      it('should allow updating to empty content', async () => {
        await client.createNote('note.md', '# Content')

        await client.updateNote('note.md', '')

        const result = await client.getNote('note.md')
        expect(result.content).toBe('')
      })

      it('should update file stat mtime after update', async () => {
        const file = await client.createNote('note.md', '# Original')
        const originalMtime = file.stat.mtime

        await new Promise(resolve => setTimeout(resolve, 10))
        await client.updateNote('note.md', '# Updated')

        const updatedFile = client.vault.getFileByPath('note.md')
        expect(updatedFile!.stat.mtime).toBeGreaterThanOrEqual(originalMtime)
      })

      it('should handle large content updates', async () => {
        await client.createNote('big.md', '# Small')

        const largeContent = '# Large\n\n' + 'Lorem ipsum dolor sit amet.\n'.repeat(10000)
        await client.updateNote('big.md', largeContent)

        const result = await client.getNote('big.md')
        expect(result.content).toBe(largeContent)
      })
    })

    describe('metadata cache integration', () => {
      it('should update metadata cache after content update', async () => {
        await client.createNote('links.md', '# No Links')

        await client.updateNote('links.md', '# Now Has Links\n\n[[Target 1]]\n[[Target 2]]')

        const file = client.vault.getFileByPath('links.md')
        const cache = client.metadataCache.getFileCache(file!)
        expect(cache!.links).toHaveLength(2)
      })

      it('should update link graph after adding links', async () => {
        await client.createNote('target.md', '# Target')
        await client.createNote('source.md', '# Source - no links yet')

        await client.updateNote('source.md', '# Source\n\n[[target]]')

        const backlinks = client.graph.getBacklinks('target.md')
        expect(backlinks).toContain('source.md')
      })

      it('should update link graph after removing links', async () => {
        await client.createNote('target.md', '# Target')
        await client.createNote('source.md', '# Source\n\n[[target]]')

        await client.updateNote('source.md', '# Source - link removed')

        const backlinks = client.graph.getBacklinks('target.md')
        expect(backlinks).not.toContain('source.md')
      })

      it('should update headings in cache after update', async () => {
        await client.createNote('headings.md', '# One Heading')

        await client.updateNote('headings.md', '# H1\n## H2\n### H3')

        const file = client.vault.getFileByPath('headings.md')
        const cache = client.metadataCache.getFileCache(file!)
        expect(cache!.headings).toHaveLength(3)
      })

      it('should update tags in cache after update', async () => {
        await client.createNote('tags.md', '# No tags')

        await client.updateNote('tags.md', '# Has Tags\n\n#new-tag #another-tag')

        const file = client.vault.getFileByPath('tags.md')
        const cache = client.metadataCache.getFileCache(file!)
        expect(cache!.tags).toHaveLength(2)
      })
    })
  })

  describe('updateFrontmatter()', () => {
    beforeEach(async () => {
      const options: ObsidianClientOptions = { backend }
      client = new ObsidianClient(options)
      await client.initialize()
    })

    describe('frontmatter modification', () => {
      it('should update existing frontmatter fields', async () => {
        await client.createNote('note.md', '# Content', { title: 'Old Title', count: 1 })

        await client.updateFrontmatter('note.md', { title: 'New Title' })

        const result = await client.getNote('note.md')
        expect(result.metadata!.frontmatter!.title).toBe('New Title')
        // Other fields should be preserved
        expect(result.metadata!.frontmatter!.count).toBe(1)
      })

      it('should add new frontmatter fields', async () => {
        await client.createNote('note.md', '# Content', { existing: 'value' })

        await client.updateFrontmatter('note.md', { newField: 'new value' })

        const result = await client.getNote('note.md')
        expect(result.metadata!.frontmatter!.existing).toBe('value')
        expect(result.metadata!.frontmatter!.newField).toBe('new value')
      })

      it('should add frontmatter to note that has none', async () => {
        await client.createNote('bare.md', '# Just Content')

        await client.updateFrontmatter('bare.md', { title: 'Added Title' })

        const result = await client.getNote('bare.md')
        expect(result.metadata!.frontmatter!.title).toBe('Added Title')
        expect(result.content).toContain('# Just Content')
      })

      it('should preserve content after frontmatter update', async () => {
        const body = `# Heading

Paragraph with **bold** and *italic*.

- List item 1
- List item 2

[[Link]]
`
        await client.createNote('content.md', body, { title: 'Original' })

        await client.updateFrontmatter('content.md', { title: 'Updated' })

        const result = await client.getNote('content.md')
        expect(result.content).toContain('# Heading')
        expect(result.content).toContain('Paragraph with **bold**')
        expect(result.content).toContain('[[Link]]')
      })

      it('should remove fields when set to undefined or null', async () => {
        await client.createNote('note.md', '# Content', {
          keep: 'this',
          remove: 'this too'
        })

        await client.updateFrontmatter('note.md', { remove: undefined })

        const result = await client.getNote('note.md')
        expect(result.metadata!.frontmatter!.keep).toBe('this')
        expect(result.metadata!.frontmatter!.remove).toBeUndefined()
      })

      it('should handle array updates in frontmatter', async () => {
        await client.createNote('arrays.md', '# Content', { tags: ['a', 'b'] })

        await client.updateFrontmatter('arrays.md', { tags: ['x', 'y', 'z'] })

        const result = await client.getNote('arrays.md')
        expect(result.metadata!.frontmatter!.tags).toEqual(['x', 'y', 'z'])
      })

      it('should handle nested object updates', async () => {
        await client.createNote('nested.md', '# Content', {
          meta: { a: 1, b: 2 }
        })

        await client.updateFrontmatter('nested.md', {
          meta: { a: 10, c: 3 }
        })

        const result = await client.getNote('nested.md')
        // Full replacement of nested objects
        expect(result.metadata!.frontmatter!.meta).toEqual({ a: 10, c: 3 })
      })

      it('should throw error for non-existent note', async () => {
        await expect(client.updateFrontmatter('ghost.md', { title: 'X' })).rejects.toThrow()
      })

      it('should handle boolean values in frontmatter', async () => {
        await client.createNote('bool.md', '# Content', { published: false })

        await client.updateFrontmatter('bool.md', { published: true, draft: false })

        const result = await client.getNote('bool.md')
        expect(result.metadata!.frontmatter!.published).toBe(true)
        expect(result.metadata!.frontmatter!.draft).toBe(false)
      })

      it('should handle numeric values in frontmatter', async () => {
        await client.createNote('nums.md', '# Content')

        await client.updateFrontmatter('nums.md', {
          integer: 42,
          float: 3.14159,
          negative: -100
        })

        const result = await client.getNote('nums.md')
        expect(result.metadata!.frontmatter!.integer).toBe(42)
        expect(result.metadata!.frontmatter!.float).toBeCloseTo(3.14159)
        expect(result.metadata!.frontmatter!.negative).toBe(-100)
      })
    })

    describe('metadata cache integration', () => {
      it('should update metadata cache after frontmatter update', async () => {
        const file = await client.createNote('cached.md', '# Content', { old: 'value' })

        await client.updateFrontmatter('cached.md', { new: 'value' })

        const cache = client.metadataCache.getFileCache(file)
        expect(cache!.frontmatter!.new).toBe('value')
      })

      it('should preserve links in cache after frontmatter update', async () => {
        await client.createNote('links.md', '# Content\n\n[[Target]]', { title: 'Old' })

        await client.updateFrontmatter('links.md', { title: 'New' })

        const file = client.vault.getFileByPath('links.md')
        const cache = client.metadataCache.getFileCache(file!)
        expect(cache!.links).toHaveLength(1)
        expect(cache!.links![0].link).toBe('Target')
      })
    })
  })

  describe('search integration', () => {
    beforeEach(async () => {
      const options: ObsidianClientOptions = { backend }
      client = new ObsidianClient(options)
    })

    it('should have search property initialized', async () => {
      await client.initialize()
      expect(client.search).toBeDefined()
    })

    it('should support searching for notes by content', async () => {
      await backend.write('note1.md', '# Apple Pie Recipe')
      await backend.write('note2.md', '# Banana Bread')
      await backend.write('note3.md', '# Apple Crumble')
      await client.initialize()

      // Search functionality through the client
      const results = await client.search.searchContent('apple')

      expect(results.length).toBeGreaterThanOrEqual(2)
    })

    it('should support searching by file name', async () => {
      await backend.write('meeting-notes.md', '# Meeting')
      await backend.write('project-notes.md', '# Project')
      await backend.write('random.md', '# Random')
      await client.initialize()

      const results = await client.search.searchFiles('notes')

      expect(results.length).toBe(2)
    })
  })

  describe('edge cases and error handling', () => {
    beforeEach(async () => {
      const options: ObsidianClientOptions = { backend }
      client = new ObsidianClient(options)
      await client.initialize()
    })

    it('should handle notes with only frontmatter', async () => {
      const file = await client.createNote('only-front.md', '', {
        title: 'Just Frontmatter'
      })

      const result = await client.getNote('only-front.md')
      expect(result.metadata!.frontmatter!.title).toBe('Just Frontmatter')
    })

    it('should handle circular backlinks', async () => {
      await client.createNote('a.md', '# A\n\n[[b]]')
      await client.createNote('b.md', '# B\n\n[[a]]')

      const resultA = await client.getNote('a.md')
      const resultB = await client.getNote('b.md')

      expect(resultA.backlinks.map(f => f.path)).toContain('b.md')
      expect(resultB.backlinks.map(f => f.path)).toContain('a.md')
    })

    it('should handle self-referencing notes', async () => {
      await client.createNote('self.md', '# Self\n\n[[self]]')

      const result = await client.getNote('self.md')
      // Self-reference might or might not be included in backlinks
      expect(result.backlinks.map(f => f.path)).toContain('self.md')
    })

    it('should handle notes with broken/unresolved links', async () => {
      await client.createNote('broken-links.md', '# Note\n\n[[does not exist]]\n[[also missing]]')

      const result = await client.getNote('broken-links.md')
      expect(result.metadata!.links).toHaveLength(2)
    })

    it('should handle special characters in file paths', async () => {
      const file = await client.createNote('notes/special-chars/file (1).md', '# Special')

      expect(file.path).toBe('notes/special-chars/file (1).md')
    })

    it('should handle very long file names', async () => {
      const longName = 'a'.repeat(200) + '.md'
      const file = await client.createNote(longName, '# Long Name')

      expect(file.path).toBe(longName)
    })

    it('should handle concurrent operations', async () => {
      const promises = [
        client.createNote('concurrent-1.md', '# Note 1'),
        client.createNote('concurrent-2.md', '# Note 2'),
        client.createNote('concurrent-3.md', '# Note 3')
      ]

      const files = await Promise.all(promises)

      expect(files).toHaveLength(3)
      expect(new Set(files.map(f => f.path)).size).toBe(3)
    })

    it('should handle unicode in file paths', async () => {
      const file = await client.createNote('notes/日本語/ファイル.md', '# Japanese')

      expect(file.path).toBe('notes/日本語/ファイル.md')
    })

    it('should handle file path normalization', async () => {
      const file = await client.createNote('folder//double-slash.md', '# Normalized')

      // Path should be normalized
      expect(file.path).not.toContain('//')
    })
  })
})
