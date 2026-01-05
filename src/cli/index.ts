#!/usr/bin/env node
/**
 * Core CLI Entry Point (obsidian-au3)
 *
 * This module provides the main CLI functionality using cac library:
 * - search - Search notes in vault
 * - read - Read note content
 * - create - Create new note
 * - backlinks - Show backlinks for note
 * - list - List files in vault
 * - tags - List all tags in vault
 * - serve - Start HTTP server
 * - mcp - Start MCP server mode
 */

import { cac, CAC } from 'cac'
import { ObsidianClient } from '../client/client.js'

const VERSION = '0.1.0'

/**
 * Parsed command line arguments
 */
export interface ParsedArgs {
  /** The command to execute (e.g., 'search', 'mcp', 'serve') */
  command?: string
  /** Positional arguments after the command */
  args: string[]
  /** Parsed flags from command line */
  flags: Record<string, string | boolean>
}

/**
 * Parse command line arguments into structured format
 *
 * @param argv - Command line arguments (typically process.argv.slice(2))
 * @returns Parsed arguments with command, args, and flags
 *
 * @example
 * parseArgs(['search', 'query', '--vault', '/path'])
 * // => { command: 'search', args: ['query'], flags: { vault: '/path' } }
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: undefined,
    args: [],
    flags: {},
  }

  // Flags that take values (next argument is the value)
  const valueFlagSet = new Set(['vault', 'tags', 'port', 'host', 'content', 'depth', 'limit', 'folder'])

  // Boolean flags (no value)
  const booleanFlagSet = new Set(['version', 'help', 'json', 'backlinks', 'count'])

  // All known flags
  const knownFlagSet = new Set([...valueFlagSet, ...booleanFlagSet])

  // Short flag mappings
  const shortFlagMap: Record<string, string> = {
    v: 'version',
    h: 'help',
  }

  let i = 0
  let foundDoubleDash = false

  while (i < argv.length) {
    const arg = argv[i]

    // Handle -- separator
    if (arg === '--') {
      foundDoubleDash = true
      i++
      continue
    }

    // After --, everything is a literal argument
    if (foundDoubleDash) {
      result.args.push(arg)
      i++
      continue
    }

    // Handle --flag=value syntax (only for known flags)
    if (arg.startsWith('--') && arg.includes('=')) {
      const eqIndex = arg.indexOf('=')
      const flagName = arg.slice(2, eqIndex)
      const flagValue = arg.slice(eqIndex + 1)

      if (knownFlagSet.has(flagName)) {
        result.flags[flagName] = flagValue
        i++
        continue
      }
      // Unknown flag with = syntax, treat as argument
      if (result.command === undefined) {
        result.command = arg
      } else {
        result.args.push(arg)
      }
      i++
      continue
    }

    // Handle long flags (--flag)
    if (arg.startsWith('--')) {
      const flagName = arg.slice(2)

      // Only process known flags
      if (knownFlagSet.has(flagName)) {
        // Check if this flag takes a value
        if (valueFlagSet.has(flagName) && i + 1 < argv.length) {
          result.flags[flagName] = argv[i + 1]
          i += 2
          continue
        }

        // Boolean flag
        result.flags[flagName] = true
        i++
        continue
      }

      // Unknown flag, treat as argument
      if (result.command === undefined) {
        result.command = arg
      } else {
        result.args.push(arg)
      }
      i++
      continue
    }

    // Handle short flags (-v, -h)
    if (arg.startsWith('-') && arg.length === 2 && !isNumeric(arg)) {
      const shortFlag = arg.slice(1)
      const longFlag = shortFlagMap[shortFlag]

      if (longFlag) {
        result.flags[longFlag] = true
        i++
        continue
      }
      // Unknown short flag, treat as argument
      if (result.command === undefined) {
        result.command = arg
      } else {
        result.args.push(arg)
      }
      i++
      continue
    }

    // Not a flag - could be command or argument
    if (result.command === undefined) {
      result.command = arg
    } else {
      result.args.push(arg)
    }
    i++
  }

  return result
}

/**
 * Check if a string is a numeric value (including negative numbers)
 */
function isNumeric(str: string): boolean {
  return /^-?\d+$/.test(str)
}

/**
 * Resolve vault path from flags, environment, or current directory
 *
 * Priority:
 * 1. --vault flag
 * 2. OBSIDIAN_VAULT environment variable
 * 3. Current directory
 *
 * @param flags - Parsed command line flags
 * @returns Resolved absolute vault path
 */
export function resolveVaultPath(flags: Record<string, string | boolean>): string {
  if (typeof flags.vault === 'string') {
    return flags.vault
  }
  return process.env.OBSIDIAN_VAULT || process.cwd()
}

/**
 * Display version information and exit
 */
export function showVersion(): void {
  console.log(`obsidian.do v${VERSION}`)
}

/**
 * Create an ObsidianClient with the given vault path
 */
async function createClient(vaultPath: string): Promise<ObsidianClient> {
  const client = new ObsidianClient({ backend: 'filesystem', vaultPath })
  await client.initialize()
  return client
}

/**
 * Create the CLI instance with all commands
 */
export function createCli(): CAC {
  const cli = cac('obsidian')

  // Global options
  cli.option('--vault <path>', 'Path to Obsidian vault')
  cli.option('--json', 'Output as JSON')

  // Search command
  cli
    .command('search <query>', 'Search notes in vault')
    .option('--tags <tags>', 'Filter by tags (comma-separated)')
    .option('--folder <folder>', 'Filter by folder')
    .option('--limit <n>', 'Limit results', { default: 20 })
    .action(async (query: string, options: {
      vault?: string
      json?: boolean
      tags?: string
      folder?: string
      limit?: number
    }) => {
      try {
        const vaultPath = options.vault || process.env.OBSIDIAN_VAULT || process.cwd()
        const client = await createClient(vaultPath)

        const searchOptions: { filter?: { tags?: string[]; folder?: string }; limit?: number } = {
          limit: options.limit
        }

        if (options.tags || options.folder) {
          searchOptions.filter = {}
          if (options.tags) {
            searchOptions.filter.tags = options.tags.split(',').map(t => t.trim().replace(/^#/, ''))
          }
          if (options.folder) {
            searchOptions.filter.folder = options.folder
          }
        }

        const results = await client.search.searchContent(query)

        // Apply tag filter manually if specified
        let filteredResults = results
        if (options.tags) {
          const tagFilters = options.tags.split(',').map(t => t.trim().replace(/^#/, '').toLowerCase())
          filteredResults = results.filter(r => {
            const metadata = client.metadataCache.getFileCache(r.file)
            const fileTags = getFileTags(metadata)
            return tagFilters.some(tag =>
              fileTags.some(ft => ft.toLowerCase() === tag)
            )
          })
        }

        // Apply limit
        if (options.limit) {
          filteredResults = filteredResults.slice(0, options.limit)
        }

        if (options.json) {
          console.log(JSON.stringify({
            results: filteredResults.map(r => ({
              path: r.file.path,
              score: r.score
            }))
          }, null, 2))
        } else {
          for (const r of filteredResults) {
            console.log(`${r.file.path} (score: ${r.score})`)
          }
        }

        client.dispose()
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`)
        process.exit(1)
      }
    })

  // Read command
  cli
    .command('read <path>', 'Read note content')
    .alias('cat')
    .option('--backlinks', 'Include backlinks')
    .action(async (notePath: string, options: {
      vault?: string
      json?: boolean
      backlinks?: boolean
    }) => {
      try {
        const vaultPath = options.vault || process.env.OBSIDIAN_VAULT || process.cwd()
        const client = await createClient(vaultPath)

        const note = await client.getNote(notePath)

        if (options.json) {
          const result: Record<string, unknown> = {
            path: note.file.path,
            content: note.content,
            frontmatter: note.metadata?.frontmatter || {}
          }
          if (options.backlinks) {
            result.backlinks = note.backlinks.map(bl => ({
              path: bl.path
            }))
          }
          console.log(JSON.stringify(result, null, 2))
        } else {
          console.log(note.content)

          if (options.backlinks && note.backlinks.length > 0) {
            console.log('\n--- Backlinks ---')
            for (const bl of note.backlinks) {
              console.log(`- ${bl.path}`)
            }
          }
        }

        client.dispose()
      } catch (error) {
        console.error(`Note not found: ${notePath}`)
        process.exit(1)
      }
    })

  // Create command
  cli
    .command('create <path>', 'Create new note')
    .option('--content <content>', 'Note content')
    .option('--tags <tags>', 'Tags (comma-separated)')
    .action(async (notePath: string, options: {
      vault?: string
      json?: boolean
      content?: string
      tags?: string
    }) => {
      try {
        const vaultPath = options.vault || process.env.OBSIDIAN_VAULT || process.cwd()
        const client = await createClient(vaultPath)

        const frontmatter = options.tags
          ? { tags: options.tags.split(',').map(t => t.trim().replace(/^#/, '')) }
          : undefined

        await client.createNote(notePath, options.content || '', frontmatter)

        if (options.json) {
          console.log(JSON.stringify({ path: notePath, created: true }, null, 2))
        } else {
          console.log(`Created: ${notePath}`)
        }

        client.dispose()
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`)
        process.exit(1)
      }
    })

  // Backlinks command
  cli
    .command('backlinks <path>', 'Show backlinks for note')
    .option('--depth <n>', 'Depth of backlink traversal', { default: 1 })
    .action(async (notePath: string, options: {
      vault?: string
      json?: boolean
      depth?: number
    }) => {
      try {
        const vaultPath = options.vault || process.env.OBSIDIAN_VAULT || process.cwd()
        const client = await createClient(vaultPath)

        const note = await client.getNote(notePath)
        const backlinks = note.backlinks

        if (options.json) {
          console.log(JSON.stringify(
            backlinks.map(bl => ({ path: bl.path })),
            null,
            2
          ))
        } else {
          if (backlinks.length === 0) {
            console.log('No backlinks found')
          } else {
            for (const bl of backlinks) {
              console.log(`${bl.path}`)
            }
          }
        }

        client.dispose()
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`)
        process.exit(1)
      }
    })

  // List command
  cli
    .command('list [folder]', 'List files in vault')
    .action(async (folder: string | undefined, options: {
      vault?: string
      json?: boolean
    }) => {
      try {
        const vaultPath = options.vault || process.env.OBSIDIAN_VAULT || process.cwd()
        const client = await createClient(vaultPath)

        let files = client.vault.getMarkdownFiles()

        // Filter by folder if specified
        if (folder) {
          const normalizedFolder = folder.replace(/\/$/, '')
          files = files.filter(f => f.path.startsWith(normalizedFolder + '/'))
        }

        if (options.json) {
          console.log(JSON.stringify(
            files.map(f => ({
              path: f.path,
              name: f.name,
              basename: f.basename
            })),
            null,
            2
          ))
        } else {
          for (const f of files) {
            console.log(f.path)
          }
        }

        client.dispose()
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`)
        process.exit(1)
      }
    })

  // Tags command
  cli
    .command('tags', 'List all tags in vault')
    .option('--count', 'Show tag counts')
    .action(async (options: {
      vault?: string
      json?: boolean
      count?: boolean
    }) => {
      try {
        const vaultPath = options.vault || process.env.OBSIDIAN_VAULT || process.cwd()
        const client = await createClient(vaultPath)

        const files = client.vault.getMarkdownFiles()
        const tagCounts = new Map<string, number>()

        for (const file of files) {
          const metadata = client.metadataCache.getFileCache(file)
          const tags = getFileTags(metadata)

          for (const tag of tags) {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
          }
        }

        // Sort by name
        const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]))

        if (options.json) {
          if (options.count) {
            console.log(JSON.stringify(
              sortedTags.map(([tag, count]) => ({ tag, count })),
              null,
              2
            ))
          } else {
            console.log(JSON.stringify(
              sortedTags.map(([tag]) => tag),
              null,
              2
            ))
          }
        } else {
          if (options.count) {
            for (const [tag, count] of sortedTags) {
              console.log(`${tag}: ${count}`)
            }
          } else {
            for (const [tag] of sortedTags) {
              console.log(tag)
            }
          }
        }

        client.dispose()
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`)
        process.exit(1)
      }
    })

  // Serve command
  cli
    .command('serve', 'Start HTTP server for REST API access')
    .option('--port <port>', 'Port to listen on', { default: 3000 })
    .option('--host <host>', 'Host to bind to', { default: '127.0.0.1' })
    .action(async (options: {
      vault?: string
      port?: number
      host?: string
    }) => {
      try {
        const { main: serveMain } = await import('./serve.js')
        const vaultPath = options.vault || process.env.OBSIDIAN_VAULT || process.cwd()
        await serveMain([], {
          vault: vaultPath,
          port: String(options.port || 3000),
          host: options.host || '127.0.0.1'
        })
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`)
        process.exit(1)
      }
    })

  // MCP command
  cli
    .command('mcp', 'Start MCP server mode')
    .action(async (options: {
      vault?: string
    }) => {
      try {
        const vaultPath = options.vault || process.env.OBSIDIAN_VAULT || process.cwd()
        const { runMcpCommand } = await import('./mcp.js')
        await runMcpCommand({ vaultPath })
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`)
        process.exit(1)
      }
    })

  cli.help()
  cli.version(VERSION)

  return cli
}

/**
 * Helper function to extract tags from file metadata
 */
function getFileTags(metadata: ReturnType<ObsidianClient['metadataCache']['getFileCache']>): string[] {
  const tags: string[] = []

  // Get frontmatter tags
  if (metadata?.frontmatter?.tags) {
    const fmTags = metadata.frontmatter.tags
    if (Array.isArray(fmTags)) {
      tags.push(...fmTags.map(t => String(t)))
    } else if (typeof fmTags === 'string') {
      tags.push(fmTags)
    }
  }

  // Get inline tags
  if (metadata?.tags) {
    for (const tagCache of metadata.tags) {
      const tag = tagCache.tag.startsWith('#') ? tagCache.tag.slice(1) : tagCache.tag
      tags.push(tag)
    }
  }

  return tags
}

/**
 * Run the CLI
 */
export function run(): void {
  const cli = createCli()
  cli.parse()
}

/**
 * Main CLI entry point
 *
 * @param args - Command line arguments (defaults to process.argv.slice(2))
 * @returns Exit code (0 for success, non-zero for error)
 */
export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  try {
    const cli = createCli()
    cli.parse(['', '', ...args], { run: false })
    await cli.runMatchedCommand()
    return 0
  } catch (error) {
    // Errors are already handled and logged by command actions
    // This catch is for unexpected errors
    if (error instanceof Error && error.message) {
      console.error(`Error: ${error.message}`)
    }
    return 1
  }
}

// Execute CLI when run directly (not when imported as a module)
// Check if this module is the entry point
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  main().then(code => process.exit(code))
}
