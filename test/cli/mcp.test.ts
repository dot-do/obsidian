import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawn, type ChildProcess } from 'child_process'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

/**
 * Test helper to create a temporary vault with given files
 * @param files - Record of file paths to content
 * @returns Path to the temporary vault directory
 */
async function createTempVault(files: Record<string, string>): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidian-mcp-test-'))

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

/**
 * Test helper to wait for stderr to contain a specific string
 * @param proc - Child process to read from
 * @param text - Text to wait for
 * @param timeout - Timeout in milliseconds
 */
async function waitForStderr(proc: ChildProcess, text: string, timeout: number = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timeout waiting for stderr to contain: ${text}`))
    }, timeout)

    proc.stderr?.on('data', (data: Buffer) => {
      buffer += data.toString()
      if (buffer.includes(text)) {
        clearTimeout(timeoutId)
        resolve()
      }
    })

    proc.on('error', (err) => {
      clearTimeout(timeoutId)
      reject(err)
    })
  })
}

/**
 * Test helper to read stdout from a process until we get a complete JSON response
 * @param proc - Child process to read from
 * @param timeout - Timeout in milliseconds
 * @returns Promise resolving to the JSON response string
 */
async function readStdout(proc: ChildProcess, timeout: number = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const timeoutId = setTimeout(() => {
      reject(new Error('Timeout waiting for response'))
    }, timeout)

    proc.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString()
      // Check if we have a complete JSON object (newline-delimited)
      const lines = buffer.split('\n')
      for (const line of lines) {
        if (line.trim()) {
          try {
            JSON.parse(line)
            clearTimeout(timeoutId)
            resolve(line)
            return
          } catch {
            // Not complete JSON yet, continue
          }
        }
      }
    })

    proc.on('error', (err) => {
      clearTimeout(timeoutId)
      reject(err)
    })

    proc.on('exit', (code) => {
      clearTimeout(timeoutId)
      if (code !== 0 && code !== null) {
        reject(new Error(`Process exited with code ${code}`))
      }
    })
  })
}

describe('mcp command', () => {
  let tempDir: string
  let cliPath: string

  beforeEach(async () => {
    tempDir = await createTempVault({
      'test.md': '# Test Note\n\nThis is a test note.',
    })
    cliPath = path.resolve(__dirname, '../../src/cli/cli.ts')
  })

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempVault(tempDir)
    }
  })

  it('should start MCP server on stdio', { timeout: 30000 }, async () => {
    const proc = spawn('npx', ['tsx', cliPath, 'mcp', '--vault', tempDir], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // Wait for server to be ready
    await waitForStderr(proc, 'MCP server ready')

    const initRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        clientInfo: { name: 'test', version: '1.0' },
        capabilities: {},
      },
    })

    proc.stdin.write(initRequest + '\n')

    const response = await readStdout(proc)
    const parsed = JSON.parse(response)

    expect(parsed.result.serverInfo.name).toBe('obsidian.do')

    proc.kill()
  })

  it('should respond to tools/list', { timeout: 30000 }, async () => {
    const proc = spawn('npx', ['tsx', cliPath, 'mcp', '--vault', tempDir], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // Wait for server to be ready
    await waitForStderr(proc, 'MCP server ready')

    // Initialize first
    const initRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        clientInfo: { name: 'test', version: '1.0' },
        capabilities: {},
      },
    })

    proc.stdin.write(initRequest + '\n')
    await readStdout(proc) // Wait for init response

    // Send initialized notification
    const initNotification = JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    })
    proc.stdin.write(initNotification + '\n')

    // Now request tools/list
    const toolsRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    })

    proc.stdin.write(toolsRequest + '\n')

    const response = await readStdout(proc)
    const parsed = JSON.parse(response)

    expect(parsed.result).toBeDefined()
    expect(parsed.result.tools).toBeDefined()
    expect(Array.isArray(parsed.result.tools)).toBe(true)
    expect(parsed.result.tools.length).toBeGreaterThan(0)

    proc.kill()
  })

  it('should handle tools/call', { timeout: 30000 }, async () => {
    const proc = spawn('npx', ['tsx', cliPath, 'mcp', '--vault', tempDir], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // Initialize first
    const initRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        clientInfo: { name: 'test', version: '1.0' },
        capabilities: {},
      },
    })

    proc.stdin.write(initRequest + '\n')
    await readStdout(proc) // Wait for init response

    // Send initialized notification
    const initNotification = JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    })
    proc.stdin.write(initNotification + '\n')

    // Now call a tool (e.g., vault_list)
    const toolCallRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'vault_list',
        arguments: {},
      },
    })

    proc.stdin.write(toolCallRequest + '\n')

    const response = await readStdout(proc)
    const parsed = JSON.parse(response)

    expect(parsed.result).toBeDefined()
    expect(parsed.result.content).toBeDefined()
    expect(Array.isArray(parsed.result.content)).toBe(true)

    proc.kill()
  })
})
