import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { runCli } from '../../src/cli/cli.js'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

/**
 * Test helper to create a temporary vault with given files
 * @param files - Record of file paths to content
 * @returns Path to the temporary vault directory
 */
async function createTempVault(files: Record<string, string>): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidian-test-'))

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(tempDir, filePath)
    const dir = path.dirname(fullPath)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(fullPath, content, 'utf-8')
  }

  return tempDir
}

/**
 * Test helper to clean up a temporary vault
 * @param vaultPath - Path to the vault to clean up
 */
async function cleanupTempVault(vaultPath: string): Promise<void> {
  await fs.rm(vaultPath, { recursive: true, force: true })
}

describe('CLI', () => {
  let vaultPath: string

  afterEach(async () => {
    if (vaultPath) {
      await cleanupTempVault(vaultPath)
    }
  })

  describe('search command', () => {
    beforeEach(async () => {
      vaultPath = await createTempVault({
        'notes/daily.md': `---
tags: [daily, journal]
---
# Daily Note

Today I worked on the [[project]] and met with [[Alice]].
This was a productive day.`,
        'notes/project.md': `---
tags: [project, work]
---
# Project Notes

Working on the new feature for [[client]].
Need to review the [[daily]] updates.`,
        'notes/alice.md': `---
tags: [person, contact]
---
# Alice

Contact info for Alice.
She works on [[project]].`,
        'archive/old-note.md': `---
tags: [archive]
---
# Old Note

This is an archived note about [[project]].`,
        'readme.md': `# Vault Readme

This is the readme for the vault. Not much here.`
      })
    })

    describe('basic search', () => {
      it('should search for notes containing a query string', async () => {
        const result = await runCli(['search', 'project'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('notes/daily.md')
        expect(result.stdout).toContain('notes/project.md')
        expect(result.stdout).toContain('notes/alice.md')
        expect(result.stdout).toContain('archive/old-note.md')
      })

      it('should return exit code 0 when no results found', async () => {
        const result = await runCli(['search', 'nonexistent-query-xyz'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toBe('')
      })

      it('should search case-insensitively', async () => {
        const result = await runCli(['search', 'DAILY'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('notes/daily.md')
      })

      it('should show match context in results', async () => {
        const result = await runCli(['search', 'productive'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('productive day')
      })

      it('should search frontmatter content', async () => {
        const result = await runCli(['search', 'journal'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('notes/daily.md')
      })

      it('should require a query argument', async () => {
        const result = await runCli(['search'], { vaultPath })

        expect(result.exitCode).toBe(1)
        expect(result.stderr).toContain('query')
      })
    })

    describe('--tags filter', () => {
      it('should filter results by a single tag', async () => {
        const result = await runCli(['search', 'project', '--tags', 'daily'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('notes/daily.md')
        expect(result.stdout).not.toContain('notes/project.md')
        expect(result.stdout).not.toContain('notes/alice.md')
      })

      it('should filter results by multiple tags (OR logic)', async () => {
        const result = await runCli(['search', 'project', '--tags', 'daily,archive'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('notes/daily.md')
        expect(result.stdout).toContain('archive/old-note.md')
        expect(result.stdout).not.toContain('notes/project.md')
      })

      it('should handle tag filter with no matching results', async () => {
        const result = await runCli(['search', 'project', '--tags', 'nonexistent-tag'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toBe('')
      })

      it('should support tag names with hash prefix', async () => {
        const result = await runCli(['search', 'project', '--tags', '#daily'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('notes/daily.md')
      })

      it('should filter by nested tags', async () => {
        vaultPath = await createTempVault({
          'note1.md': `---
tags: [project/web]
---
# Note 1
Content about web project`,
          'note2.md': `---
tags: [project/mobile]
---
# Note 2
Content about mobile project`
        })

        const result = await runCli(['search', 'project', '--tags', 'project/web'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('note1.md')
        expect(result.stdout).not.toContain('note2.md')
      })
    })

    describe('--json output', () => {
      it('should output results in JSON format', async () => {
        const result = await runCli(['search', 'project', '--json'], { vaultPath })

        expect(result.exitCode).toBe(0)
        const json = JSON.parse(result.stdout)
        expect(Array.isArray(json)).toBe(true)
        expect(json.length).toBeGreaterThan(0)
      })

      it('should include file path in JSON results', async () => {
        const result = await runCli(['search', 'Daily Note', '--json'], { vaultPath })

        expect(result.exitCode).toBe(0)
        const json = JSON.parse(result.stdout)
        expect(json[0]).toHaveProperty('path')
        expect(json[0].path).toBe('notes/daily.md')
      })

      it('should include match score in JSON results', async () => {
        const result = await runCli(['search', 'project', '--json'], { vaultPath })

        expect(result.exitCode).toBe(0)
        const json = JSON.parse(result.stdout)
        expect(json[0]).toHaveProperty('score')
        expect(typeof json[0].score).toBe('number')
      })

      it('should include match positions in JSON results', async () => {
        const result = await runCli(['search', 'productive', '--json'], { vaultPath })

        expect(result.exitCode).toBe(0)
        const json = JSON.parse(result.stdout)
        expect(json[0]).toHaveProperty('matches')
        expect(Array.isArray(json[0].matches)).toBe(true)
      })

      it('should return empty array for no results in JSON mode', async () => {
        const result = await runCli(['search', 'nonexistent-xyz', '--json'], { vaultPath })

        expect(result.exitCode).toBe(0)
        const json = JSON.parse(result.stdout)
        expect(json).toEqual([])
      })

      it('should combine --tags and --json flags', async () => {
        const result = await runCli(['search', 'project', '--tags', 'daily', '--json'], { vaultPath })

        expect(result.exitCode).toBe(0)
        const json = JSON.parse(result.stdout)
        expect(json.length).toBe(1)
        expect(json[0].path).toBe('notes/daily.md')
      })
    })

    describe('fuzzy search', () => {
      it('should find results with typos using fuzzy matching', async () => {
        const result = await runCli(['search', 'porject'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('project.md')
      })

      it('should rank exact matches higher than fuzzy matches', async () => {
        const result = await runCli(['search', 'project', '--json'], { vaultPath })

        expect(result.exitCode).toBe(0)
        const json = JSON.parse(result.stdout)
        // Project.md should be ranked first as it has "project" in title
        expect(json[0].path).toBe('notes/project.md')
      })
    })
  })

  describe('read command', () => {
    beforeEach(async () => {
      vaultPath = await createTempVault({
        'notes/example.md': `---
title: Example Note
tags: [test, example]
---
# Example Note

This is the content of the example note.

## Section 1

Some content in section 1 with a [[link-to-other]].

## Section 2

More content here referencing [[notes/example]].`,
        'notes/link-to-other.md': `---
title: Other Note
---
# Other Note

This note links back to [[example]].`,
        'notes/orphan.md': `---
title: Orphan
---
# Orphan Note

No one links to this note.`,
        'folder/nested.md': `---
title: Nested Note
---
# Nested Note

A note in a nested folder linking to [[example]].`
      })
    })

    describe('reading content', () => {
      it('should read and output file content', async () => {
        const result = await runCli(['read', 'notes/example.md'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('# Example Note')
        expect(result.stdout).toContain('This is the content of the example note.')
      })

      it('should read file from nested directory', async () => {
        const result = await runCli(['read', 'folder/nested.md'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('# Nested Note')
      })

      it('should read file by basename without extension', async () => {
        const result = await runCli(['read', 'example'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('# Example Note')
      })

      it('should read file by full path', async () => {
        const result = await runCli(['read', 'notes/example.md'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('# Example Note')
      })

      it('should output frontmatter as part of content', async () => {
        const result = await runCli(['read', 'notes/example.md'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('title: Example Note')
        expect(result.stdout).toContain('tags: [test, example]')
      })

      it('should preserve markdown formatting', async () => {
        const result = await runCli(['read', 'notes/example.md'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('## Section 1')
        expect(result.stdout).toContain('[[link-to-other]]')
      })
    })

    describe('error handling for missing files', () => {
      it('should return exit code 1 for non-existent file', async () => {
        const result = await runCli(['read', 'nonexistent.md'], { vaultPath })

        expect(result.exitCode).toBe(1)
        expect(result.stderr).toContain('not found')
      })

      it('should return descriptive error message for missing file', async () => {
        const result = await runCli(['read', 'missing-note.md'], { vaultPath })

        expect(result.exitCode).toBe(1)
        expect(result.stderr).toContain('missing-note.md')
        expect(result.stderr.toLowerCase()).toMatch(/not found|does not exist/)
      })

      it('should return exit code 1 for directory path', async () => {
        const result = await runCli(['read', 'notes'], { vaultPath })

        expect(result.exitCode).toBe(1)
        expect(result.stderr).toMatch(/not a file|directory|invalid/)
      })

      it('should require file argument', async () => {
        const result = await runCli(['read'], { vaultPath })

        expect(result.exitCode).toBe(1)
        expect(result.stderr).toContain('file')
      })
    })

    describe('--backlinks flag', () => {
      it('should show backlinks to the file', async () => {
        const result = await runCli(['read', 'notes/example.md', '--backlinks'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('link-to-other.md')
        expect(result.stdout).toContain('nested.md')
      })

      it('should show backlinks section header', async () => {
        const result = await runCli(['read', 'notes/example.md', '--backlinks'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toMatch(/backlinks|Backlinks|BACKLINKS/i)
      })

      it('should show no backlinks message for orphan files', async () => {
        const result = await runCli(['read', 'notes/orphan.md', '--backlinks'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toMatch(/no backlinks|0 backlinks|none/i)
      })

      it('should still show file content with --backlinks', async () => {
        const result = await runCli(['read', 'notes/example.md', '--backlinks'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('# Example Note')
        expect(result.stdout).toContain('This is the content')
      })

      it('should resolve wikilinks to correct files for backlinks', async () => {
        const result = await runCli(['read', 'notes/link-to-other.md', '--backlinks'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('example.md')
      })

      it('should show backlink count', async () => {
        const result = await runCli(['read', 'notes/example.md', '--backlinks'], { vaultPath })

        expect(result.exitCode).toBe(0)
        // Should show at least 2 backlinks (link-to-other.md and nested.md)
        expect(result.stdout).toMatch(/2|3.*backlink/i)
      })
    })

    describe('--json output for read', () => {
      it('should output content in JSON format', async () => {
        const result = await runCli(['read', 'notes/example.md', '--json'], { vaultPath })

        expect(result.exitCode).toBe(0)
        const json = JSON.parse(result.stdout)
        expect(json).toHaveProperty('content')
        expect(json.content).toContain('# Example Note')
      })

      it('should include path in JSON output', async () => {
        const result = await runCli(['read', 'notes/example.md', '--json'], { vaultPath })

        expect(result.exitCode).toBe(0)
        const json = JSON.parse(result.stdout)
        expect(json).toHaveProperty('path')
        expect(json.path).toBe('notes/example.md')
      })

      it('should include frontmatter as parsed object in JSON output', async () => {
        const result = await runCli(['read', 'notes/example.md', '--json'], { vaultPath })

        expect(result.exitCode).toBe(0)
        const json = JSON.parse(result.stdout)
        expect(json).toHaveProperty('frontmatter')
        expect(json.frontmatter).toHaveProperty('title', 'Example Note')
        expect(json.frontmatter.tags).toContain('test')
      })

      it('should include backlinks in JSON output when --backlinks is used', async () => {
        const result = await runCli(['read', 'notes/example.md', '--backlinks', '--json'], { vaultPath })

        expect(result.exitCode).toBe(0)
        const json = JSON.parse(result.stdout)
        expect(json).toHaveProperty('backlinks')
        expect(Array.isArray(json.backlinks)).toBe(true)
        expect(json.backlinks.length).toBeGreaterThanOrEqual(2)
      })
    })
  })

  describe('create command', () => {
    beforeEach(async () => {
      vaultPath = await createTempVault({
        'existing.md': `# Existing Note

This note already exists.`
      })
    })

    describe('basic creation', () => {
      it('should create a new file with default content', async () => {
        const result = await runCli(['create', 'new-note.md'], { vaultPath })

        expect(result.exitCode).toBe(0)

        // Verify file was created
        const content = await fs.readFile(path.join(vaultPath, 'new-note.md'), 'utf-8')
        expect(content).toBeDefined()
      })

      it('should output the path of created file', async () => {
        const result = await runCli(['create', 'new-note.md'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('new-note.md')
      })

      it('should create file in nested directory', async () => {
        const result = await runCli(['create', 'folder/subfolder/nested.md'], { vaultPath })

        expect(result.exitCode).toBe(0)

        const content = await fs.readFile(path.join(vaultPath, 'folder/subfolder/nested.md'), 'utf-8')
        expect(content).toBeDefined()
      })

      it('should fail if file already exists', async () => {
        const result = await runCli(['create', 'existing.md'], { vaultPath })

        expect(result.exitCode).toBe(1)
        expect(result.stderr).toMatch(/exists|already/i)
      })

      it('should require file path argument', async () => {
        const result = await runCli(['create'], { vaultPath })

        expect(result.exitCode).toBe(1)
        expect(result.stderr).toContain('path')
      })

      it('should add .md extension if not provided', async () => {
        const result = await runCli(['create', 'new-note'], { vaultPath })

        expect(result.exitCode).toBe(0)

        const exists = await fs.access(path.join(vaultPath, 'new-note.md')).then(() => true).catch(() => false)
        expect(exists).toBe(true)
      })
    })

    describe('--content flag', () => {
      it('should create file with specified content', async () => {
        const result = await runCli(['create', 'new-note.md', '--content', '# My New Note\n\nThis is the content.'], { vaultPath })

        expect(result.exitCode).toBe(0)

        const content = await fs.readFile(path.join(vaultPath, 'new-note.md'), 'utf-8')
        expect(content).toBe('# My New Note\n\nThis is the content.')
      })

      it('should support multiline content', async () => {
        const multilineContent = `# Title

First paragraph.

Second paragraph with more text.`

        const result = await runCli(['create', 'multiline.md', '--content', multilineContent], { vaultPath })

        expect(result.exitCode).toBe(0)

        const content = await fs.readFile(path.join(vaultPath, 'multiline.md'), 'utf-8')
        expect(content).toBe(multilineContent)
      })

      it('should preserve wikilinks in content', async () => {
        const result = await runCli(['create', 'linked.md', '--content', 'Link to [[other-note]]'], { vaultPath })

        expect(result.exitCode).toBe(0)

        const content = await fs.readFile(path.join(vaultPath, 'linked.md'), 'utf-8')
        expect(content).toContain('[[other-note]]')
      })

      it('should create empty file with empty content flag', async () => {
        const result = await runCli(['create', 'empty.md', '--content', ''], { vaultPath })

        expect(result.exitCode).toBe(0)

        const content = await fs.readFile(path.join(vaultPath, 'empty.md'), 'utf-8')
        expect(content).toBe('')
      })
    })

    describe('--tags flag', () => {
      it('should create file with frontmatter tags', async () => {
        const result = await runCli(['create', 'tagged.md', '--tags', 'project,important'], { vaultPath })

        expect(result.exitCode).toBe(0)

        const content = await fs.readFile(path.join(vaultPath, 'tagged.md'), 'utf-8')
        expect(content).toContain('---')
        expect(content).toMatch(/tags:.*project/)
        expect(content).toMatch(/tags:.*important/)
      })

      it('should support single tag', async () => {
        const result = await runCli(['create', 'single-tag.md', '--tags', 'todo'], { vaultPath })

        expect(result.exitCode).toBe(0)

        const content = await fs.readFile(path.join(vaultPath, 'single-tag.md'), 'utf-8')
        expect(content).toMatch(/tags:.*todo/)
      })

      it('should handle tags with hash prefix', async () => {
        const result = await runCli(['create', 'hash-tags.md', '--tags', '#project,#work'], { vaultPath })

        expect(result.exitCode).toBe(0)

        const content = await fs.readFile(path.join(vaultPath, 'hash-tags.md'), 'utf-8')
        expect(content).toMatch(/tags:.*project/)
        expect(content).toMatch(/tags:.*work/)
      })

      it('should combine --content and --tags', async () => {
        const result = await runCli(['create', 'combined.md', '--content', '# Combined Note\n\nBody content.', '--tags', 'test,combined'], { vaultPath })

        expect(result.exitCode).toBe(0)

        const content = await fs.readFile(path.join(vaultPath, 'combined.md'), 'utf-8')
        expect(content).toContain('---')
        expect(content).toMatch(/tags:.*test/)
        expect(content).toContain('# Combined Note')
        expect(content).toContain('Body content.')
      })

      it('should support nested tags', async () => {
        const result = await runCli(['create', 'nested-tags.md', '--tags', 'project/web,status/active'], { vaultPath })

        expect(result.exitCode).toBe(0)

        const content = await fs.readFile(path.join(vaultPath, 'nested-tags.md'), 'utf-8')
        expect(content).toMatch(/project\/web/)
        expect(content).toMatch(/status\/active/)
      })
    })

    describe('--json output for create', () => {
      it('should output creation result in JSON format', async () => {
        const result = await runCli(['create', 'json-output.md', '--json'], { vaultPath })

        expect(result.exitCode).toBe(0)
        const json = JSON.parse(result.stdout)
        expect(json).toHaveProperty('path')
        expect(json.path).toBe('json-output.md')
      })

      it('should include created timestamp in JSON output', async () => {
        const result = await runCli(['create', 'timestamp.md', '--json'], { vaultPath })

        expect(result.exitCode).toBe(0)
        const json = JSON.parse(result.stdout)
        expect(json).toHaveProperty('created')
        expect(typeof json.created).toBe('number')
      })
    })
  })

  describe('backlinks command', () => {
    beforeEach(async () => {
      vaultPath = await createTempVault({
        'notes/hub.md': `---
title: Hub Note
---
# Hub Note

This is the central hub that many notes link to.`,
        'notes/spoke1.md': `---
title: Spoke 1
---
# Spoke 1

This note links to [[hub]] and [[spoke2]].`,
        'notes/spoke2.md': `---
title: Spoke 2
---
# Spoke 2

This note links to [[hub]].`,
        'notes/spoke3.md': `---
title: Spoke 3
---
# Spoke 3

This note links to [[hub]] and [[notes/spoke1]].`,
        'folder/deep.md': `---
title: Deep Note
---
# Deep Note

Links to [[hub]] from a nested folder.`,
        'notes/orphan.md': `---
title: Orphan
---
# Orphan

No links to this note anywhere.`,
        'notes/alias.md': `---
title: Alias Note
aliases: [the-hub, central]
---
# Alias Note

Links to [[the-hub]] using alias.`
      })
    })

    describe('basic backlinks', () => {
      it('should list all files that link to the target', async () => {
        const result = await runCli(['backlinks', 'notes/hub.md'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('spoke1.md')
        expect(result.stdout).toContain('spoke2.md')
        expect(result.stdout).toContain('spoke3.md')
        expect(result.stdout).toContain('deep.md')
      })

      it('should find backlinks by basename', async () => {
        const result = await runCli(['backlinks', 'hub'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('spoke1.md')
        expect(result.stdout).toContain('spoke2.md')
      })

      it('should return empty result for files with no backlinks', async () => {
        const result = await runCli(['backlinks', 'notes/orphan.md'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout.trim()).toBe('')
      })

      it('should find backlinks from nested folders', async () => {
        const result = await runCli(['backlinks', 'notes/hub.md'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('folder/deep.md')
      })

      it('should show backlink count', async () => {
        const result = await runCli(['backlinks', 'notes/hub.md'], { vaultPath })

        expect(result.exitCode).toBe(0)
        // Should show count (4 or 5 backlinks including alias)
        expect(result.stdout).toMatch(/4|5/)
      })

      it('should require file argument', async () => {
        const result = await runCli(['backlinks'], { vaultPath })

        expect(result.exitCode).toBe(1)
        expect(result.stderr).toContain('file')
      })

      it('should return exit code 1 for non-existent file', async () => {
        const result = await runCli(['backlinks', 'nonexistent.md'], { vaultPath })

        expect(result.exitCode).toBe(1)
        expect(result.stderr).toMatch(/not found|does not exist/i)
      })
    })

    describe('alias resolution', () => {
      it('should find backlinks through aliases', async () => {
        // Create a vault where hub has aliases
        vaultPath = await createTempVault({
          'hub.md': `---
title: Hub
aliases: [central, main-hub]
---
# Hub`,
          'linker.md': `# Linker

Links to [[central]] and [[main-hub]].`
        })

        const result = await runCli(['backlinks', 'hub.md'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('linker.md')
      })
    })

    describe('--json output for backlinks', () => {
      it('should output backlinks in JSON format', async () => {
        const result = await runCli(['backlinks', 'notes/hub.md', '--json'], { vaultPath })

        expect(result.exitCode).toBe(0)
        const json = JSON.parse(result.stdout)
        expect(Array.isArray(json)).toBe(true)
      })

      it('should include source file path in JSON', async () => {
        const result = await runCli(['backlinks', 'notes/hub.md', '--json'], { vaultPath })

        expect(result.exitCode).toBe(0)
        const json = JSON.parse(result.stdout)
        expect(json.some((bl: { path: string }) => bl.path.includes('spoke1.md'))).toBe(true)
      })

      it('should include link position in JSON', async () => {
        const result = await runCli(['backlinks', 'notes/hub.md', '--json'], { vaultPath })

        expect(result.exitCode).toBe(0)
        const json = JSON.parse(result.stdout)
        expect(json[0]).toHaveProperty('position')
        expect(json[0].position).toHaveProperty('line')
      })

      it('should include link context in JSON', async () => {
        const result = await runCli(['backlinks', 'notes/hub.md', '--json'], { vaultPath })

        expect(result.exitCode).toBe(0)
        const json = JSON.parse(result.stdout)
        expect(json[0]).toHaveProperty('context')
        expect(typeof json[0].context).toBe('string')
      })

      it('should return empty array for no backlinks in JSON mode', async () => {
        const result = await runCli(['backlinks', 'notes/orphan.md', '--json'], { vaultPath })

        expect(result.exitCode).toBe(0)
        const json = JSON.parse(result.stdout)
        expect(json).toEqual([])
      })
    })

    describe('--depth flag', () => {
      it('should show second-degree backlinks with --depth 2', async () => {
        const result = await runCli(['backlinks', 'notes/spoke1.md', '--depth', '2'], { vaultPath })

        expect(result.exitCode).toBe(0)
        // spoke3 links to spoke1, so spoke3's backlinks should appear at depth 2
        expect(result.stdout).toContain('spoke3.md')
      })
    })
  })

  describe('global CLI options', () => {
    beforeEach(async () => {
      vaultPath = await createTempVault({
        'test.md': '# Test'
      })
    })

    describe('--help', () => {
      it('should show help message', async () => {
        const result = await runCli(['--help'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('obsidian')
        expect(result.stdout).toContain('search')
        expect(result.stdout).toContain('read')
        expect(result.stdout).toContain('create')
        expect(result.stdout).toContain('backlinks')
      })

      it('should show help for specific command', async () => {
        const result = await runCli(['search', '--help'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('search')
        expect(result.stdout).toContain('query')
        expect(result.stdout).toContain('--tags')
      })
    })

    describe('--version', () => {
      it('should show version number', async () => {
        const result = await runCli(['--version'], { vaultPath })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toMatch(/\d+\.\d+\.\d+/)
      })
    })

    describe('--vault flag', () => {
      it('should use specified vault path', async () => {
        const result = await runCli(['read', 'test.md', '--vault', vaultPath])

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('# Test')
      })

      it('should error with invalid vault path', async () => {
        const result = await runCli(['read', 'test.md', '--vault', '/nonexistent/path'])

        expect(result.exitCode).toBe(1)
        expect(result.stderr).toMatch(/vault|path|not found|invalid/i)
      })
    })

    describe('unknown command', () => {
      it('should show error for unknown command', async () => {
        const result = await runCli(['unknowncommand'], { vaultPath })

        expect(result.exitCode).toBe(1)
        expect(result.stderr).toMatch(/unknown|invalid|command/i)
      })
    })
  })

  describe('list command', () => {
    beforeEach(async () => {
      vaultPath = await createTempVault({
        'notes/daily.md': '# Daily',
        'notes/project.md': '# Project',
        'archive/old.md': '# Old',
        'readme.md': '# Readme',
        'notes/subfolder/deep.md': '# Deep'
      })
    })

    it('should list all markdown files in vault', async () => {
      const result = await runCli(['list'], { vaultPath })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('daily.md')
      expect(result.stdout).toContain('project.md')
      expect(result.stdout).toContain('old.md')
      expect(result.stdout).toContain('readme.md')
      expect(result.stdout).toContain('deep.md')
    })

    it('should list files in specific folder', async () => {
      const result = await runCli(['list', 'notes'], { vaultPath })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('daily.md')
      expect(result.stdout).toContain('project.md')
      expect(result.stdout).not.toContain('readme.md')
    })

    it('should output in JSON format with --json', async () => {
      const result = await runCli(['list', '--json'], { vaultPath })

      expect(result.exitCode).toBe(0)
      const json = JSON.parse(result.stdout)
      expect(Array.isArray(json)).toBe(true)
      expect(json.length).toBe(5)
    })
  })

  describe('tags command', () => {
    beforeEach(async () => {
      vaultPath = await createTempVault({
        'note1.md': `---
tags: [project, work, important]
---
# Note 1`,
        'note2.md': `---
tags: [project, personal]
---
# Note 2`,
        'note3.md': `---
tags: [work]
---
# Note 3`,
        'note4.md': `# Note 4

Some #inline-tag here and #another-tag.`
      })
    })

    it('should list all unique tags in vault', async () => {
      const result = await runCli(['tags'], { vaultPath })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('project')
      expect(result.stdout).toContain('work')
      expect(result.stdout).toContain('important')
      expect(result.stdout).toContain('personal')
      expect(result.stdout).toContain('inline-tag')
      expect(result.stdout).toContain('another-tag')
    })

    it('should show tag counts', async () => {
      const result = await runCli(['tags', '--count'], { vaultPath })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toMatch(/project.*2|2.*project/)
      expect(result.stdout).toMatch(/work.*2|2.*work/)
    })

    it('should output in JSON format', async () => {
      const result = await runCli(['tags', '--json'], { vaultPath })

      expect(result.exitCode).toBe(0)
      const json = JSON.parse(result.stdout)
      expect(Array.isArray(json) || typeof json === 'object').toBe(true)
    })
  })
})
