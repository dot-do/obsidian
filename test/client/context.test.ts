import { describe, it, expect, beforeEach } from 'vitest'
import { ObsidianClient } from '../../src/client/client.js'
import { MemoryBackend } from '../../src/vault/memory-backend.js'
import type { TFile } from '../../src/types.js'

/**
 * Context Generator Tests for obsidian-cb1
 *
 * The context generator creates structured context from vault content
 * optimized for LLM consumption. It should:
 * - Generate context from vault based on query/criteria
 * - Include relevant notes with their frontmatter, content, and links
 * - Produce structured output suitable for LLM input
 * - Support different context generation strategies
 */

describe('ContextGenerator', () => {
  let client: ObsidianClient
  let backend: MemoryBackend

  beforeEach(async () => {
    backend = new MemoryBackend()
    client = new ObsidianClient({ backend })
    await client.initialize()
  })

  describe('generateContext()', () => {
    describe('basic context generation', () => {
      it('should generate context for a single note', async () => {
        await backend.write('note.md', '# Test Note\n\nThis is test content.')

        const context = await client.generateContext('note.md')

        expect(context).toBeDefined()
        expect(typeof context).toBe('string')
        expect(context.length).toBeGreaterThan(0)
      })

      it('should include note frontmatter in generated context', async () => {
        await backend.write('note.md', `---
title: My Note
tags: [important, project]
---

# Content

This is the body.`)

        const context = await client.generateContext('note.md')

        expect(context).toContain('title: My Note')
        expect(context).toContain('tags')
      })

      it('should include note content in generated context', async () => {
        await backend.write('note.md', '# Test Note\n\nThis is unique content xyz123.')

        const context = await client.generateContext('note.md')

        expect(context).toContain('Test Note')
        expect(context).toContain('unique content xyz123')
      })

      it('should include outgoing links in generated context', async () => {
        await backend.write('source.md', '# Source\n\nLinks to [[target1]] and [[target2]].')
        await backend.write('target1.md', '# Target 1')
        await backend.write('target2.md', '# Target 2')

        const context = await client.generateContext('source.md')

        expect(context).toContain('target1')
        expect(context).toContain('target2')
      })

      it('should include backlinks in generated context', async () => {
        await backend.write('target.md', '# Target Note')
        await backend.write('linker1.md', '# Linker 1\n\n[[target]]')
        await backend.write('linker2.md', '# Linker 2\n\n[[target]]')

        const context = await client.generateContext('target.md')

        expect(context).toContain('linker1')
        expect(context).toContain('linker2')
      })

      it('should format context as structured markdown', async () => {
        await backend.write('note.md', `---
title: Test
---

# Heading

Content here.`)

        const context = await client.generateContext('note.md')

        // Should have clear sections/structure
        expect(context).toContain('#')
        expect(context.split('\n').length).toBeGreaterThan(1)
      })

      it('should handle notes without frontmatter', async () => {
        await backend.write('simple.md', '# Simple Note\n\nJust content.')

        const context = await client.generateContext('simple.md')

        expect(context).toBeDefined()
        expect(context).toContain('Simple Note')
      })

      it('should handle notes without links', async () => {
        await backend.write('isolated.md', '# Isolated\n\nNo links here.')

        const context = await client.generateContext('isolated.md')

        expect(context).toBeDefined()
        expect(context).toContain('Isolated')
      })

      it('should throw error for non-existent note', async () => {
        await expect(
          client.generateContext('nonexistent.md')
        ).rejects.toThrow(/not found|does not exist/i)
      })
    })

    describe('depth option', () => {
      it('should support depth option to include linked notes', async () => {
        await backend.write('root.md', '# Root\n\n[[level1]]')
        await backend.write('level1.md', '# Level 1\n\n[[level2]]')
        await backend.write('level2.md', '# Level 2\n\nDeep content.')

        const context = await client.generateContext('root.md', { depth: 1 })

        expect(context).toContain('Root')
        expect(context).toContain('Level 1')
      })

      it('should include linked note content at depth 1', async () => {
        await backend.write('main.md', '# Main\n\n[[linked]]')
        await backend.write('linked.md', '# Linked Note\n\nLinked content.')

        const context = await client.generateContext('main.md', { depth: 1 })

        expect(context).toContain('Linked Note')
        expect(context).toContain('Linked content')
      })

      it('should include second-degree links at depth 2', async () => {
        await backend.write('root.md', '# Root\n\n[[first]]')
        await backend.write('first.md', '# First\n\n[[second]]')
        await backend.write('second.md', '# Second\n\nSecond degree content.')

        const context = await client.generateContext('root.md', { depth: 2 })

        expect(context).toContain('Root')
        expect(context).toContain('First')
        expect(context).toContain('Second')
      })

      it('should default to depth 0 when not specified', async () => {
        await backend.write('main.md', '# Main\n\n[[linked]]')
        await backend.write('linked.md', '# Linked\n\nLinked content.')

        const context = await client.generateContext('main.md')

        expect(context).toContain('Main')
        // Should not include full content of linked notes at depth 0
        expect(context).not.toContain('Linked content')
      })

      it('should handle circular references gracefully', async () => {
        await backend.write('a.md', '# A\n\n[[b]]')
        await backend.write('b.md', '# B\n\n[[a]]')

        const context = await client.generateContext('a.md', { depth: 2 })

        expect(context).toBeDefined()
        expect(context).toContain('A')
        expect(context).toContain('B')
      })

      it('should limit context size when depth is large', async () => {
        // Create a chain
        await backend.write('node0.md', '# Node 0\n\n[[node1]]')
        for (let i = 1; i < 10; i++) {
          await backend.write(`node${i}.md`, `# Node ${i}\n\n[[node${i + 1}]]\n\n${'Content. '.repeat(100)}`)
        }
        await backend.write('node10.md', '# Node 10\n\nEnd node.')

        const context = await client.generateContext('node0.md', { depth: 5 })

        expect(context).toBeDefined()
        // Should not be excessively large
        expect(context.length).toBeLessThan(50000)
      })

      it('should include backlinks in depth traversal', async () => {
        await backend.write('main.md', '# Main Note')
        await backend.write('linker.md', '# Linker\n\n[[main]]')
        await backend.write('second-degree.md', '# Second\n\n[[linker]]')

        const context = await client.generateContext('main.md', { depth: 2 })

        expect(context).toContain('Main Note')
        expect(context).toContain('Linker')
      })
    })

    describe('query-based context generation', () => {
      it('should generate context for notes matching a query', async () => {
        await backend.write('typescript1.md', '# TS Guide\n\nTypeScript patterns.')
        await backend.write('typescript2.md', '# TS Tutorial\n\nLearn TypeScript.')
        await backend.write('javascript.md', '# JS Guide\n\nJavaScript basics.')

        const context = await client.generateContextForQuery('TypeScript')

        expect(context).toBeDefined()
        expect(context).toContain('TS Guide')
        expect(context).toContain('TS Tutorial')
      })

      it('should rank notes by relevance to query', async () => {
        await backend.write('exact.md', '# TypeScript\n\nTypeScript TypeScript TypeScript.')
        await backend.write('mention.md', '# Guide\n\nMentions TypeScript once.')

        const context = await client.generateContextForQuery('TypeScript')

        // More relevant note should appear first
        const exactPos = context.indexOf('exact.md')
        const mentionPos = context.indexOf('mention.md')
        expect(exactPos).toBeLessThan(mentionPos)
      })

      it('should limit results for broad queries', async () => {
        for (let i = 0; i < 50; i++) {
          await backend.write(`note${i}.md`, `# Note ${i}\n\nCommon word: the`)
        }

        const context = await client.generateContextForQuery('the')

        expect(context).toBeDefined()
        // Should not include all 50 notes
        const noteCount = (context.match(/# Note \d+/g) || []).length
        expect(noteCount).toBeLessThanOrEqual(10)
      })

      it('should support maxNotes option to limit results', async () => {
        await backend.write('note1.md', '# Note 1\n\nRelevant content.')
        await backend.write('note2.md', '# Note 2\n\nRelevant content.')
        await backend.write('note3.md', '# Note 3\n\nRelevant content.')

        const context = await client.generateContextForQuery('Relevant', { maxNotes: 2 })

        const noteCount = (context.match(/# Note \d+/g) || []).length
        expect(noteCount).toBe(2)
      })

      it('should return empty context when no notes match query', async () => {
        await backend.write('note.md', '# Note\n\nContent here.')

        const context = await client.generateContextForQuery('nonexistent-xyz-123')

        expect(context).toBeDefined()
        expect(context.length).toBeLessThan(100)
      })

      it('should include note metadata in query results', async () => {
        await backend.write('tagged.md', `---
tags: [typescript, tutorial]
---

# TypeScript Guide

Content here.`)

        const context = await client.generateContextForQuery('TypeScript')

        expect(context).toContain('tags')
        expect(context).toContain('typescript')
      })

      it('should support tag-based context generation', async () => {
        await backend.write('note1.md', `---
tags: [project, active]
---

# Project A`)
        await backend.write('note2.md', `---
tags: [project, archived]
---

# Project B`)

        const context = await client.generateContextForTag('project')

        expect(context).toContain('Project A')
        expect(context).toContain('Project B')
      })

      it('should filter by multiple tags', async () => {
        await backend.write('both.md', `---
tags: [typescript, tutorial]
---

# TS Tutorial`)
        await backend.write('one.md', `---
tags: [typescript]
---

# TS Reference`)

        const context = await client.generateContextForTags(['typescript', 'tutorial'])

        expect(context).toContain('TS Tutorial')
        expect(context).not.toContain('TS Reference')
      })
    })

    describe('structured output format', () => {
      it('should include clear section headers in context', async () => {
        await backend.write('note.md', `---
title: Test
---

# Content

Body text.

## Subsection

More text.`)

        const context = await client.generateContext('note.md')

        // Should have clear structural markers
        expect(context).toMatch(/---/)
        expect(context).toMatch(/#/)
      })

      it('should separate frontmatter from content', async () => {
        await backend.write('note.md', `---
title: Test
---

# Heading

Content.`)

        const context = await client.generateContext('note.md')

        expect(context).toContain('---')
        expect(context).toContain('title: Test')
        expect(context).toContain('# Heading')
      })

      it('should include source file path in context', async () => {
        await backend.write('folder/note.md', '# Note\n\nContent.')

        const context = await client.generateContext('folder/note.md')

        expect(context).toContain('folder/note.md')
      })

      it('should format links section clearly', async () => {
        await backend.write('note.md', '# Note\n\n[[link1]] [[link2]]')
        await backend.write('link1.md', '# Link 1')
        await backend.write('link2.md', '# Link 2')

        const context = await client.generateContext('note.md')

        // Should have a clear links section
        expect(context.toLowerCase()).toMatch(/links|references|related/i)
      })

      it('should format backlinks section clearly', async () => {
        await backend.write('target.md', '# Target')
        await backend.write('linker.md', '# Linker\n\n[[target]]')

        const context = await client.generateContext('target.md')

        // Should have a clear backlinks section
        expect(context.toLowerCase()).toMatch(/backlinks|referenced by/i)
      })

      it('should produce valid markdown output', async () => {
        await backend.write('note.md', `---
title: Test
---

# Heading

Content with **bold** and *italic*.

- List item
- Another item`)

        const context = await client.generateContext('note.md')

        // Should preserve markdown formatting
        expect(context).toContain('**bold**')
        expect(context).toContain('*italic*')
        expect(context).toContain('- ')
      })

      it('should escape special characters appropriately', async () => {
        await backend.write('note.md', '# Note\n\nContent with `code` and [[links]].')

        const context = await client.generateContext('note.md')

        expect(context).toBeDefined()
        expect(context).toContain('code')
      })
    })

    describe('token limit handling', () => {
      it('should support maxTokens option to limit output size', async () => {
        const largeContent = '# Note\n\n' + 'Lorem ipsum dolor sit amet. '.repeat(1000)
        await backend.write('large.md', largeContent)

        const context = await client.generateContext('large.md', { maxTokens: 500 })

        // Approximate: 500 tokens ≈ 2000 characters
        expect(context.length).toBeLessThan(2500)
      })

      it('should prioritize important sections when truncating', async () => {
        const content = `---
title: Important Title
tags: [critical]
---

# Important Heading

Critical content at the top.

${'Filler content. '.repeat(1000)}
`
        await backend.write('note.md', content)

        const context = await client.generateContext('note.md', { maxTokens: 200 })

        // Should still include frontmatter and beginning
        expect(context).toContain('Important Title')
        expect(context).toContain('Critical content')
      })

      it('should truncate linked notes when token limit is low', async () => {
        await backend.write('main.md', '# Main\n\n[[linked]]')
        await backend.write('linked.md', '# Linked\n\n' + 'Content. '.repeat(500))

        const context = await client.generateContext('main.md', { depth: 1, maxTokens: 300 })

        expect(context).toContain('Main')
        expect(context.length).toBeLessThan(1500)
      })

      it('should indicate truncation in output', async () => {
        const largeContent = '# Note\n\n' + 'Content. '.repeat(2000)
        await backend.write('large.md', largeContent)

        const context = await client.generateContext('large.md', { maxTokens: 100 })

        // Should indicate that content was truncated
        expect(context).toMatch(/\.\.\.|truncated|continued/i)
      })

      it('should handle maxTokens with multiple notes', async () => {
        await backend.write('note1.md', '# Note 1\n\n' + 'Content. '.repeat(200))
        await backend.write('note2.md', '# Note 2\n\n' + 'Content. '.repeat(200))
        await backend.write('note3.md', '# Note 3\n\n' + 'Content. '.repeat(200))

        const context = await client.generateContextForQuery('Note', { maxTokens: 500 })

        expect(context).toBeDefined()
        expect(context.length).toBeLessThan(2500)
      })
    })

    describe('edge cases', () => {
      it('should handle empty notes', async () => {
        await backend.write('empty.md', '')

        const context = await client.generateContext('empty.md')

        expect(context).toBeDefined()
      })

      it('should handle notes with only frontmatter', async () => {
        await backend.write('frontmatter-only.md', '---\ntitle: Only Frontmatter\n---')

        const context = await client.generateContext('frontmatter-only.md')

        expect(context).toContain('title: Only Frontmatter')
      })

      it('should handle notes with special characters', async () => {
        await backend.write('special.md', '# Note\n\n中文 العربية emoji: 🚀')

        const context = await client.generateContext('special.md')

        expect(context).toContain('中文')
        expect(context).toContain('🚀')
      })

      it('should handle notes with code blocks', async () => {
        await backend.write('code.md', `# Code Example

\`\`\`typescript
function test() {
  return true;
}
\`\`\`

End.`)

        const context = await client.generateContext('code.md')

        expect(context).toContain('function test()')
        expect(context).toContain('```')
      })

      it('should handle broken links', async () => {
        await backend.write('broken.md', '# Note\n\n[[nonexistent]] [[also-missing]]')

        const context = await client.generateContext('broken.md')

        expect(context).toBeDefined()
        expect(context).toContain('nonexistent')
      })

      it('should handle very long file paths', async () => {
        const longPath = 'a/'.repeat(20) + 'note.md'
        await backend.write(longPath, '# Note\n\nContent.')

        const context = await client.generateContext(longPath)

        expect(context).toBeDefined()
      })

      it('should handle self-referencing notes', async () => {
        await backend.write('self.md', '# Self\n\n[[self]]')

        const context = await client.generateContext('self.md')

        expect(context).toBeDefined()
        expect(context).toContain('Self')
      })

      it('should handle notes with many links', async () => {
        const links = Array.from({ length: 50 }, (_, i) => `[[link${i}]]`).join(' ')
        await backend.write('many-links.md', `# Many Links\n\n${links}`)

        const context = await client.generateContext('many-links.md')

        expect(context).toBeDefined()
        expect(context).toContain('Many Links')
      })
    })

    describe('performance', () => {
      it('should generate context quickly for small notes', async () => {
        await backend.write('small.md', '# Small Note\n\nContent.')

        const start = performance.now()
        await client.generateContext('small.md')
        const duration = performance.now() - start

        expect(duration).toBeLessThan(100)
      })

      it('should handle large notes efficiently', async () => {
        const largeContent = '# Large Note\n\n' + 'Content. '.repeat(10000)
        await backend.write('large.md', largeContent)

        const start = performance.now()
        await client.generateContext('large.md', { maxTokens: 1000 })
        const duration = performance.now() - start

        expect(duration).toBeLessThan(1000)
      })

      it('should handle deep link traversal efficiently', async () => {
        await backend.write('root.md', '# Root\n\n[[n1]] [[n2]] [[n3]]')
        for (let i = 1; i <= 20; i++) {
          await backend.write(`n${i}.md`, `# Note ${i}\n\nContent.`)
        }

        const start = performance.now()
        await client.generateContext('root.md', { depth: 2 })
        const duration = performance.now() - start

        expect(duration).toBeLessThan(500)
      })

      it('should cache and reuse parsed metadata', async () => {
        await backend.write('note.md', '# Note\n\nContent.')

        // Generate context multiple times
        await client.generateContext('note.md')

        const start = performance.now()
        await client.generateContext('note.md')
        const duration = performance.now() - start

        // Second call should be faster due to caching
        expect(duration).toBeLessThan(50)
      })
    })

    describe('integration scenarios', () => {
      it('should generate rich context for interconnected notes', async () => {
        await backend.write('project.md', `---
title: Project Alpha
status: active
tags: [project, typescript]
---

# Project Alpha

Main project file.

See [[architecture]] and [[roadmap]].`)

        await backend.write('architecture.md', `---
tags: [technical, design]
---

# Architecture

Technical design for [[project]].`)

        await backend.write('roadmap.md', `# Roadmap

Plans for [[project]].`)

        await backend.write('meeting.md', '# Meeting Notes\n\nDiscussed [[project]].')

        const context = await client.generateContext('project.md', { depth: 1 })

        expect(context).toContain('Project Alpha')
        expect(context).toContain('Architecture')
        expect(context).toContain('Roadmap')
        expect(context).toContain('status: active')
      })

      it('should generate context for daily notes workflow', async () => {
        await backend.write('2024-01-15.md', `---
date: 2024-01-15
tags: [daily]
---

# Daily Note - Jan 15

Worked on [[project-alpha]].`)

        await backend.write('project-alpha.md', '# Project Alpha\n\nActive project.')

        const context = await client.generateContext('2024-01-15.md', { depth: 1 })

        expect(context).toContain('Daily Note')
        expect(context).toContain('Project Alpha')
        expect(context).toContain('date: 2024-01-15')
      })

      it('should generate context for knowledge graph exploration', async () => {
        await backend.write('hub.md', '# Hub\n\n[[spoke1]] [[spoke2]] [[spoke3]]')
        await backend.write('spoke1.md', '# Spoke 1\n\nConnected to [[hub]].')
        await backend.write('spoke2.md', '# Spoke 2\n\nConnected to [[hub]].')
        await backend.write('spoke3.md', '# Spoke 3\n\nConnected to [[hub]].')

        const context = await client.generateContext('hub.md', { depth: 1 })

        expect(context).toContain('Hub')
        expect(context).toContain('Spoke 1')
        expect(context).toContain('Spoke 2')
        expect(context).toContain('Spoke 3')
      })

      it('should generate context suitable for LLM prompts', async () => {
        await backend.write('topic.md', `---
category: research
tags: [ai, ml]
---

# Machine Learning Topic

Introduction to ML concepts.

Key points:
- Neural networks
- Training data
- Model evaluation`)

        const context = await client.generateContext('topic.md')

        // Context should be well-structured for LLM consumption
        expect(context).toContain('---')
        expect(context).toContain('category: research')
        expect(context).toContain('Machine Learning Topic')
        expect(context).toContain('Neural networks')
        expect(context.length).toBeGreaterThan(50)
      })
    })
  })

  describe('getFileContext()', () => {
    it('should return file, metadata, and neighbors', async () => {
      await backend.write('note.md', '# Note\n\n[[linked]]')
      await backend.write('linked.md', '# Linked')
      await client.reindex()

      const file = client.vault.getFileByPath('note.md')!
      const fileContext = client.getFileContext(file)

      expect(fileContext).toHaveProperty('file')
      expect(fileContext).toHaveProperty('metadata')
      expect(fileContext).toHaveProperty('neighbors')
      expect(fileContext.file.path).toBe('note.md')
    })

    it('should include linked notes as neighbors', async () => {
      await backend.write('main.md', '# Main\n\n[[neighbor1]] [[neighbor2]]')
      await backend.write('neighbor1.md', '# Neighbor 1')
      await backend.write('neighbor2.md', '# Neighbor 2')
      await client.reindex()

      const file = client.vault.getFileByPath('main.md')!
      const fileContext = client.getFileContext(file)

      expect(fileContext.neighbors.length).toBeGreaterThan(0)
      const neighborPaths = fileContext.neighbors.map(f => f.path)
      expect(neighborPaths).toContain('neighbor1.md')
      expect(neighborPaths).toContain('neighbor2.md')
    })

    it('should include backlinks as neighbors', async () => {
      await backend.write('target.md', '# Target')
      await backend.write('linker.md', '# Linker\n\n[[target]]')
      await client.reindex()

      const file = client.vault.getFileByPath('target.md')!
      const fileContext = client.getFileContext(file)

      const neighborPaths = fileContext.neighbors.map(f => f.path)
      expect(neighborPaths).toContain('linker.md')
    })

    it('should return metadata from cache', async () => {
      await backend.write('note.md', `---
title: Test
---

# Heading`)
      await client.reindex()

      const file = client.vault.getFileByPath('note.md')!
      const fileContext = client.getFileContext(file)

      expect(fileContext.metadata).not.toBeNull()
      expect(fileContext.metadata?.frontmatter?.title).toBe('Test')
    })
  })
})
