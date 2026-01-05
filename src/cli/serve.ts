/**
 * HTTP Server for REST API access to Obsidian vault
 * Task: obsidian-39h
 *
 * Provides endpoints for:
 * - /health - Health check
 * - /api/search - Search notes
 * - /api/notes/:path - CRUD operations on notes
 * - /api/backlinks/:path - Get backlinks for a note
 */

import { Hono, type Context } from 'hono'
import { serve as honoServe } from '@hono/node-server'
import { cors } from 'hono/cors'
import * as fs from 'fs/promises'
import * as path from 'path'
import type { Server } from 'node:http'
import type { ServerType } from '@hono/node-server'
import { Vault } from '../vault/vault.js'
import { FileSystemBackend } from '../vault/fs-backend.js'
import { MetadataCache } from '../metadata/cache.js'
import { SearchEngine } from '../search/engine.js'
import { GraphEngine } from '../graph/engine.js'
import { prepareSimpleSearch } from '../search/search.js'

export interface ServeOptions {
  /** Port to listen on (default: 3000) */
  port: number
  /** Host to bind to (default: 127.0.0.1) */
  host: string
  /** Path to the vault directory */
  vaultPath: string
  /** CORS origin configuration (default: 'http://localhost:*' for localhost origins only) */
  corsOrigin?: string | string[]
}

export interface VaultServerContext {
  vault: Vault
  cache: MetadataCache
  searchEngine: SearchEngine
  graphEngine: GraphEngine
  backend: FileSystemBackend
  /** CORS origin configuration */
  corsOrigin?: string | string[]
}

/**
 * Default CORS origin - restricts to localhost only
 * Matches http://localhost:PORT and http://127.0.0.1:PORT
 */
const DEFAULT_CORS_ORIGINS = [
  'http://localhost',
  'http://127.0.0.1',
]

/**
 * CORS origin handler that validates origins against allowed patterns
 */
function createCorsOriginHandler(corsOrigin?: string | string[]): (origin: string, c: Context) => string | null {
  return (origin: string, _c: Context): string | null => {
    // If no origin in request (e.g., same-origin or non-browser), allow
    if (!origin) {
      return '*'
    }

    const allowedOrigins = corsOrigin
      ? (Array.isArray(corsOrigin) ? corsOrigin : [corsOrigin])
      : DEFAULT_CORS_ORIGINS

    // Check if origin matches any allowed pattern
    for (const allowed of allowedOrigins) {
      // Exact match
      if (allowed === origin) {
        return origin
      }
      // Wildcard '*' allows all origins
      if (allowed === '*') {
        return origin
      }
      // Pattern match for localhost with any port (e.g., http://localhost matches http://localhost:3000)
      if (origin.startsWith(allowed + ':') || origin === allowed) {
        return origin
      }
    }

    // Origin not allowed - return null to deny
    return null
  }
}

/**
 * Create a Hono app configured with vault endpoints
 */
export function createServer(context: VaultServerContext): Hono {
  const { vault, cache, searchEngine, graphEngine, backend, corsOrigin } = context
  const app = new Hono()

  // Add CORS middleware with configurable origin (defaults to localhost only)
  app.use('*', cors({
    origin: createCorsOriginHandler(corsOrigin),
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }))

  // Health check endpoint
  app.get('/health', (c: Context) => {
    return c.json({ status: 'ok' })
  })

  // Search endpoint
  app.get('/api/search', async (c: Context) => {
    const query = c.req.query('q') || ''

    if (!query) {
      return c.json([])
    }

    const searchFn = prepareSimpleSearch(query)
    const files = await backend.scanDirectory()
    const mdFiles = files.filter(f => f.endsWith('.md'))

    const results: Array<{
      path: string
      name: string
      score: number
      matches: Array<{ line: number; text: string }>
    }> = []

    for (const filePath of mdFiles) {
      try {
        const content = await backend.read(filePath)

        // Search in filename
        const filenameResult = searchFn(path.basename(filePath, '.md'))

        // Search in content
        const contentResult = searchFn(content)

        if (filenameResult || contentResult) {
          const matches: Array<{ line: number; text: string }> = []

          // Extract matching lines from content
          if (contentResult && contentResult.matches.length > 0) {
            const lines = content.split('\n')
            let offset = 0

            for (let i = 0; i < lines.length; i++) {
              const lineStart = offset
              const lineEnd = offset + lines[i].length

              // Check if any match falls in this line
              for (const [matchOffset] of contentResult.matches) {
                if (matchOffset >= lineStart && matchOffset < lineEnd) {
                  matches.push({ line: i + 1, text: lines[i].trim() })
                  break
                }
              }

              offset = lineEnd + 1 // +1 for newline
            }
          }

          results.push({
            path: filePath,
            name: path.basename(filePath, '.md'),
            score: (filenameResult?.score || 0) + (contentResult?.score || 0),
            matches
          })
        }
      } catch {
        // Skip files that can't be read
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score)

    return c.json(results)
  })

  // List notes endpoint
  app.get('/api/notes', async (c: Context) => {
    // Scan directory to get fresh file list
    const files = await backend.scanDirectory()
    const mdFiles = files.filter(f => f.endsWith('.md'))

    const notes = mdFiles.map(filePath => ({
      path: filePath,
      name: path.basename(filePath),
      basename: path.basename(filePath, '.md')
    }))

    return c.json(notes)
  })

  // Get note by path
  app.get('/api/notes/:path{.+}', async (c: Context) => {
    const notePath = c.req.param('path')

    try {
      const content = await backend.read(notePath)
      const stat = await backend.stat(notePath)

      return c.json({
        path: notePath,
        content,
        stat
      })
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('not found')) {
        return c.json({ error: 'Note not found' }, 404)
      }
      throw err
    }
  })

  // Create note
  app.post('/api/notes/:path{.+}', async (c: Context) => {
    const notePath = c.req.param('path')

    try {
      // Check if already exists
      const exists = await backend.exists(notePath)
      if (exists) {
        return c.json({ error: 'Note already exists' }, 409)
      }

      const body = await c.req.json()
      const content = body.content || ''

      await backend.write(notePath, content)

      return c.json({
        path: notePath,
        content
      }, 201)
    } catch (err: unknown) {
      if (err instanceof SyntaxError) {
        return c.json({ error: 'Invalid JSON' }, 400)
      }
      throw err
    }
  })

  // Update note
  app.put('/api/notes/:path{.+}', async (c: Context) => {
    const notePath = c.req.param('path')

    try {
      // Check if exists
      const exists = await backend.exists(notePath)
      if (!exists) {
        return c.json({ error: 'Note not found' }, 404)
      }

      const body = await c.req.json()
      const content = body.content

      if (content === undefined) {
        return c.json({ error: 'Missing content field' }, 400)
      }

      await backend.write(notePath, content)

      return c.json({
        path: notePath,
        content
      })
    } catch (err: unknown) {
      if (err instanceof SyntaxError) {
        return c.json({ error: 'Invalid JSON' }, 400)
      }
      throw err
    }
  })

  // Delete note
  app.delete('/api/notes/:path{.+}', async (c: Context) => {
    const notePath = c.req.param('path')

    try {
      await backend.delete(notePath)
      return c.json({ deleted: true })
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('not found')) {
        return c.json({ error: 'Note not found' }, 404)
      }
      throw err
    }
  })

  // Get backlinks for a note
  app.get('/api/backlinks/:path{.+}', async (c: Context) => {
    const notePath = c.req.param('path')

    // Check if file exists
    const exists = await backend.exists(notePath)
    if (!exists) {
      return c.json({ error: 'Note not found' }, 404)
    }

    // Get backlinks using the graph engine
    const backlinks = graphEngine.getBacklinks(notePath)

    // Format response
    const results = await Promise.all(
      backlinks.map(async (bl) => {
        // Get context for each backlink
        const content = await backend.read(bl.file.path)
        const lines = content.split('\n')

        const linksWithContext = bl.links.map(link => {
          const lineIndex = link.position.line
          const contextLine = lineIndex >= 0 && lineIndex < lines.length
            ? lines[lineIndex].trim()
            : ''

          return {
            link: link.link,
            position: link.position,
            context: contextLine
          }
        })

        return {
          path: bl.file.path,
          name: bl.file.name,
          basename: bl.file.basename,
          links: linksWithContext
        }
      })
    )

    return c.json(results)
  })

  return app
}

/**
 * HTTP server wrapper with lifecycle management
 */
export class VaultServer {
  private server: ServerType | null = null
  private vault: Vault
  private cache: MetadataCache
  private searchEngine: SearchEngine
  private graphEngine: GraphEngine
  private backend: FileSystemBackend
  private app: Hono

  constructor(private options: ServeOptions) {
    this.backend = new FileSystemBackend(options.vaultPath)
    this.vault = new Vault(this.backend)
    this.cache = new MetadataCache(this.vault)
    this.searchEngine = new SearchEngine(this.vault, this.cache)
    this.graphEngine = new GraphEngine(this.cache)
    this.app = createServer({
      vault: this.vault,
      cache: this.cache,
      searchEngine: this.searchEngine,
      graphEngine: this.graphEngine,
      backend: this.backend,
      corsOrigin: options.corsOrigin
    })
  }

  /**
   * Initialize the vault by scanning all files
   */
  async initialize(): Promise<void> {
    // Scan all files in the vault
    const files = await this.backend.scanDirectory()

    // Pre-populate the backend files map for Vault sync
    const fileContents = new Map<string, string | ArrayBuffer>()
    for (const filePath of files) {
      if (filePath.endsWith('.md')) {
        try {
          const content = await this.backend.read(filePath)
          fileContents.set(filePath, content)
        } catch {
          // Skip unreadable files
        }
      }
    }

    // Attach files map to backend for vault sync
    ;(this.backend as unknown as { files: Map<string, string | ArrayBuffer> }).files = fileContents

    // Initialize the metadata cache
    await this.cache.initialize()
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    await this.initialize()

    return new Promise((resolve, reject) => {
      try {
        this.server = honoServe({
          fetch: this.app.fetch,
          port: this.options.port,
          hostname: this.options.host,
        })

        const server = this.server
        server.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            console.error(`Error: Port ${this.options.port} is already in use`)
            reject(new Error(`Port ${this.options.port} is already in use`))
          } else {
            reject(err)
          }
        })

        server.on('listening', () => {
          console.log(`Server running at http://${this.options.host}:${this.options.port}`)
          resolve()
        })
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Stop the HTTP server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null
          resolve()
        })
      } else {
        resolve()
      }
    })
  }
}

/**
 * Start the serve command
 */
export async function serve(options: Partial<ServeOptions> & { vaultPath: string }): Promise<VaultServer> {
  const fullOptions: ServeOptions = {
    port: options.port || 3000,
    host: options.host || '127.0.0.1',
    vaultPath: options.vaultPath,
    corsOrigin: options.corsOrigin
  }

  const server = new VaultServer(fullOptions)
  await server.start()
  return server
}

/**
 * Main entry point for CLI serve command
 */
export async function main(args: string[], flags: Record<string, string | boolean>): Promise<number> {
  // Parse options
  const port = typeof flags.port === 'string' ? parseInt(flags.port, 10) : 3000
  const host = typeof flags.host === 'string' ? flags.host : '127.0.0.1'
  const vaultPath = typeof flags.vault === 'string' ? flags.vault : process.cwd()
  // Parse --cors-origin flag (can be comma-separated for multiple origins)
  const corsOriginFlag = flags['cors-origin']
  const corsOrigin = typeof corsOriginFlag === 'string'
    ? (corsOriginFlag.includes(',') ? corsOriginFlag.split(',').map(s => s.trim()) : corsOriginFlag)
    : undefined

  // Validate port
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error('Error: Invalid port number')
    return 1
  }

  // Validate vault path exists
  try {
    const stat = await fs.stat(vaultPath)
    if (!stat.isDirectory()) {
      console.error(`Error: Vault path is not a directory: ${vaultPath}`)
      return 1
    }
  } catch (err: unknown) {
    console.error(`Error: Vault not found or does not exist: ${vaultPath}`)
    return 1
  }

  try {
    const server = await serve({ port, host, vaultPath, corsOrigin })

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log('\nShutting down server...')
      await server.stop()
      process.exit(0)
    }

    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)

    // Keep the process running
    await new Promise(() => {})
    return 0
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error(`Error: ${err.message}`)
    } else {
      console.error('Error: Failed to start server')
    }
    return 1
  }
}
