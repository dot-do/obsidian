import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawn, type ChildProcess } from 'child_process'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Creates a temporary vault with given files for testing
 * @param files - Record of file paths to content
 * @returns Path to the temporary vault directory
 */
async function createTempVault(files: Record<string, string>): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidian-serve-test-'))

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(tempDir, filePath)
    const dir = path.dirname(fullPath)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(fullPath, content, 'utf-8')
  }

  // Create .obsidian folder to mark it as a vault
  await fs.mkdir(path.join(tempDir, '.obsidian'), { recursive: true })

  return tempDir
}

/**
 * Cleans up a temporary vault
 * @param vaultPath - Path to the vault to clean up
 */
async function cleanupTempVault(vaultPath: string): Promise<void> {
  await fs.rm(vaultPath, { recursive: true, force: true })
}

/**
 * Finds an available port for the server
 * @returns Promise resolving to an available port number
 */
async function getAvailablePort(): Promise<number> {
  const net = await import('net')
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') {
        const port = address.port
        server.close(() => resolve(port))
      } else {
        reject(new Error('Could not get port'))
      }
    })
    server.on('error', reject)
  })
}

/**
 * Starts the CLI serve command
 * @param vaultPath - Path to the vault
 * @param port - Port to run the server on
 * @param timeout - Timeout in milliseconds to wait for server to be ready
 * @returns Promise resolving to the child process
 */
async function startServer(
  vaultPath: string,
  port: number,
  timeout: number = 10000
): Promise<ChildProcess> {
  // Path to the CLI entry point - we'll build this to dist/cli.js
  const cliPath = path.join(process.cwd(), 'dist', 'cli.js')

  const child = spawn('node', [cliPath, 'serve', '--port', String(port), '--vault', vaultPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'test' },
  })

  // Wait for server to be ready by polling the health endpoint
  const startTime = Date.now()
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(1000),
      })
      if (response.ok) {
        return child
      }
    } catch {
      // Server not ready yet, continue polling
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  child.kill()
  throw new Error(`Server did not become ready within ${timeout}ms`)
}

/**
 * Stops a running server process
 * @param child - The child process to stop
 */
async function stopServer(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.killed || child.exitCode !== null) {
      resolve()
      return
    }

    child.on('exit', () => resolve())
    child.kill('SIGTERM')

    // Force kill after 5 seconds if graceful shutdown fails
    setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL')
      }
      resolve()
    }, 5000)
  })
}

// ============================================================================
// Tests - These should FAIL because implementation doesn't exist yet (RED)
// ============================================================================

describe('CLI serve command (TDD - RED)', () => {
  let vaultPath: string
  let serverProcess: ChildProcess | null = null
  let port: number

  beforeEach(async () => {
    // Create test vault with sample files
    vaultPath = await createTempVault({
      'note1.md': `---
title: Test Note
tags: [test]
---
# Test Note

This is a test note for the HTTP server.
`,
      'note2.md': `# Another Note

Content here.`,
    })

    port = await getAvailablePort()
  })

  afterEach(async () => {
    if (serverProcess) {
      await stopServer(serverProcess)
      serverProcess = null
    }
    if (vaultPath) {
      await cleanupTempVault(vaultPath)
    }
  })

  // ==========================================================================
  // Server Startup Tests
  // ==========================================================================

  describe('server startup', () => {
    it('should start HTTP server on specified port', async () => {
      serverProcess = await startServer(vaultPath, port)

      // Verify server is running by hitting health endpoint
      const response = await fetch(`http://127.0.0.1:${port}/health`)
      expect(response.status).toBe(200)
    })

    it('should expose /health endpoint', async () => {
      serverProcess = await startServer(vaultPath, port)

      const response = await fetch(`http://127.0.0.1:${port}/health`)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data).toHaveProperty('status')
      expect(data.status).toBe('ok')
    })

    it('should error when port is already in use', async () => {
      // Start first server
      serverProcess = await startServer(vaultPath, port)

      // Try to start second server on same port
      const cliPath = path.join(process.cwd(), 'dist', 'cli.js')
      const secondProcess = spawn('node', [cliPath, 'serve', '--port', String(port), '--vault', vaultPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stderr = ''
      secondProcess.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      const exitCode = await new Promise<number>((resolve) => {
        secondProcess.on('exit', (code) => resolve(code ?? 1))
      })

      expect(exitCode).not.toBe(0)
      expect(stderr.toLowerCase()).toMatch(/port.*in use|eaddrinuse|already/i)
    })

    it('should error when vault path does not exist', async () => {
      const cliPath = path.join(process.cwd(), 'dist', 'cli.js')
      const invalidPath = '/nonexistent/vault/path'

      const child = spawn('node', [cliPath, 'serve', '--port', String(port), '--vault', invalidPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stderr = ''
      child.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      const exitCode = await new Promise<number>((resolve) => {
        child.on('exit', (code) => resolve(code ?? 1))
      })

      expect(exitCode).not.toBe(0)
      expect(stderr.toLowerCase()).toMatch(/vault.*not found|does not exist|invalid/i)
    })
  })

  // ==========================================================================
  // Graceful Shutdown Tests
  // ==========================================================================

  describe('graceful shutdown', () => {
    it('should handle SIGTERM signal', async () => {
      serverProcess = await startServer(vaultPath, port)

      // Verify server is running
      const beforeResponse = await fetch(`http://127.0.0.1:${port}/health`)
      expect(beforeResponse.status).toBe(200)

      // Send SIGTERM
      serverProcess.kill('SIGTERM')

      // Wait for process to exit
      const exitCode = await new Promise<number | null>((resolve) => {
        serverProcess!.on('exit', (code) => resolve(code))
      })

      expect(exitCode).toBe(0)

      // Verify server is no longer responding
      await expect(
        fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) })
      ).rejects.toThrow()

      serverProcess = null
    })

    it('should close all connections on shutdown', async () => {
      serverProcess = await startServer(vaultPath, port)

      // Make a request to ensure server is active
      await fetch(`http://127.0.0.1:${port}/health`)

      // Send SIGTERM
      serverProcess.kill('SIGTERM')

      // Wait for exit
      await new Promise<void>((resolve) => {
        serverProcess!.on('exit', () => resolve())
      })

      // Server should no longer accept connections
      await expect(
        fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) })
      ).rejects.toThrow()

      serverProcess = null
    })
  })

  // ==========================================================================
  // API Endpoint Tests
  // ==========================================================================

  describe('vault API endpoints', () => {
    beforeEach(async () => {
      serverProcess = await startServer(vaultPath, port)
    })

    it('should expose GET /api/notes endpoint to list notes', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/notes`)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBeGreaterThan(0)
    })

    it('should expose GET /api/notes/:path endpoint to read a note', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/notes/note1.md`)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toHaveProperty('content')
      expect(data.content).toContain('Test Note')
    })

    it('should expose POST /api/notes/:path endpoint to create a note', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/notes/new-note.md`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '# New Note\n\nCreated via API' }),
      })

      expect(response.status).toBe(201)

      // Verify note was created
      const readResponse = await fetch(`http://127.0.0.1:${port}/api/notes/new-note.md`)
      expect(readResponse.status).toBe(200)
      const data = await readResponse.json()
      expect(data.content).toContain('New Note')
    })

    it('should expose PUT /api/notes/:path endpoint to update a note', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/notes/note1.md`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '# Updated Note\n\nUpdated content' }),
      })

      expect(response.status).toBe(200)

      // Verify note was updated
      const readResponse = await fetch(`http://127.0.0.1:${port}/api/notes/note1.md`)
      const data = await readResponse.json()
      expect(data.content).toContain('Updated Note')
    })

    it('should expose DELETE /api/notes/:path endpoint to delete a note', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/notes/note2.md`, {
        method: 'DELETE',
      })

      expect(response.status).toBe(200)

      // Verify note was deleted
      const readResponse = await fetch(`http://127.0.0.1:${port}/api/notes/note2.md`)
      expect(readResponse.status).toBe(404)
    })

    it('should expose GET /api/search endpoint for searching notes', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/search?q=test`)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)
    })

    it('should return 404 for non-existent routes', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/nonexistent`)

      expect(response.status).toBe(404)
    })
  })

  // ==========================================================================
  // Server Configuration Tests
  // ==========================================================================

  describe('server configuration', () => {
    it('should use default port 3000 when --port is not specified', async () => {
      const defaultPort = 3000
      const cliPath = path.join(process.cwd(), 'dist', 'cli.js')

      serverProcess = spawn('node', [cliPath, 'serve', '--vault', vaultPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      // Wait for server to start
      await new Promise((resolve) => setTimeout(resolve, 2000))

      const response = await fetch(`http://127.0.0.1:${defaultPort}/health`)
      expect(response.status).toBe(200)
    })

    it('should support --host flag for binding to specific interface', async () => {
      const cliPath = path.join(process.cwd(), 'dist', 'cli.js')

      serverProcess = spawn('node', [cliPath, 'serve', '--port', String(port), '--host', '127.0.0.1', '--vault', vaultPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      // Wait for server to start
      await new Promise((resolve) => setTimeout(resolve, 2000))

      const response = await fetch(`http://127.0.0.1:${port}/health`)
      expect(response.status).toBe(200)
    })

    it('should include CORS headers in responses', async () => {
      serverProcess = await startServer(vaultPath, port)

      const response = await fetch(`http://127.0.0.1:${port}/health`)

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })
})
