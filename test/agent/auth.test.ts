import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import * as path from 'path'
import * as os from 'os'

// Mock child_process before importing the module under test
vi.mock('child_process', () => ({
  exec: vi.fn(),
  execSync: vi.fn(),
}))

// Mock fs/promises for config file tests
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
  stat: vi.fn(),
}))

// Import mocked modules
import { exec, execSync } from 'child_process'
import * as fs from 'fs/promises'

// Import the module under test (will fail until implemented)
import {
  getAuthToken,
  getTokenFromEnv,
  getTokenFromCli,
  getTokenFromConfig,
  validateToken,
  isTokenExpired,
  refreshToken,
  saveTokenToConfig,
  getConfigPath,
  type AuthToken,
  type AuthConfig,
  AuthError,
  TokenExpiredError,
  NoAuthenticationError,
  ClaudeCliNotInstalledError,
  ClaudeCliAuthRequiredError,
} from '../../src/agent/auth.js'

/**
 * Test helper to mock exec callback
 */
function mockExecSuccess(stdout: string, stderr = '') {
  (exec as unknown as Mock).mockImplementation(
    (_cmd: string, callback: (error: Error | null, result: { stdout: string; stderr: string }) => void) => {
      callback(null, { stdout, stderr })
    }
  )
}

function mockExecError(error: Error) {
  (exec as unknown as Mock).mockImplementation(
    (_cmd: string, callback: (error: Error | null) => void) => {
      callback(error)
    }
  )
}

describe('Agent Authentication', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset environment for each test
    process.env = { ...originalEnv }
    delete process.env.ANTHROPIC_API_KEY
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('Token Retrieval', () => {
    describe('getAuthToken', () => {
      it('should read token from ANTHROPIC_API_KEY env var first', async () => {
        const testToken = 'sk-ant-test-token-from-env'
        process.env.ANTHROPIC_API_KEY = testToken

        const token = await getAuthToken()

        expect(token.value).toBe(testToken)
        expect(token.source).toBe('env')
      })

      it('should fall back to Claude CLI when env var not set', async () => {
        const cliToken = 'sk-ant-cli-token-12345'
        mockExecSuccess(cliToken + '\n')

        const token = await getAuthToken()

        expect(token.value).toBe(cliToken)
        expect(token.source).toBe('cli')
      })

      it('should fall back to config file when CLI fails', async () => {
        const configToken = 'sk-ant-config-token-67890'
        const configPath = path.join(os.homedir(), '.config', 'obsidian-agent', 'auth.json')

        // CLI fails
        mockExecError(new Error('Command not found: claude'))

        // Config file succeeds
        ;(fs.readFile as Mock).mockResolvedValue(
          JSON.stringify({ token: configToken, expiresAt: Date.now() + 86400000 })
        )

        const token = await getAuthToken()

        expect(token.value).toBe(configToken)
        expect(token.source).toBe('config')
      })

      it('should throw NoAuthenticationError when no token source available', async () => {
        // Env not set (already cleared in beforeEach)
        // CLI fails
        mockExecError(new Error('Command not found: claude'))
        // Config file doesn't exist
        ;(fs.readFile as Mock).mockRejectedValue(new Error('ENOENT'))

        await expect(getAuthToken()).rejects.toThrow(NoAuthenticationError)
      })

      it('should not expose token value in error messages', async () => {
        mockExecError(new Error('Command not found: claude'))
        ;(fs.readFile as Mock).mockRejectedValue(new Error('ENOENT'))

        try {
          await getAuthToken()
          expect.fail('Should have thrown')
        } catch (error) {
          expect((error as Error).message).not.toContain('sk-ant')
          expect((error as Error).message).not.toContain('token')
        }
      })
    })

    describe('getTokenFromEnv', () => {
      it('should return token when ANTHROPIC_API_KEY is set', () => {
        const testToken = 'sk-ant-env-token-abc123'
        process.env.ANTHROPIC_API_KEY = testToken

        const token = getTokenFromEnv()

        expect(token).not.toBeNull()
        expect(token!.value).toBe(testToken)
        expect(token!.source).toBe('env')
      })

      it('should return null when ANTHROPIC_API_KEY is not set', () => {
        delete process.env.ANTHROPIC_API_KEY

        const token = getTokenFromEnv()

        expect(token).toBeNull()
      })

      it('should return null when ANTHROPIC_API_KEY is empty string', () => {
        process.env.ANTHROPIC_API_KEY = ''

        const token = getTokenFromEnv()

        expect(token).toBeNull()
      })

      it('should trim whitespace from token', () => {
        process.env.ANTHROPIC_API_KEY = '  sk-ant-trimmed-token  '

        const token = getTokenFromEnv()

        expect(token!.value).toBe('sk-ant-trimmed-token')
      })
    })
  })

  describe('Claude CLI Integration', () => {
    describe('getTokenFromCli', () => {
      it('should execute "claude auth token" command', async () => {
        const expectedToken = 'sk-ant-cli-output-token'
        mockExecSuccess(expectedToken + '\n')

        await getTokenFromCli()

        expect(exec).toHaveBeenCalledWith(
          'claude auth token',
          expect.any(Function)
        )
      })

      it('should parse token from CLI output', async () => {
        const expectedToken = 'sk-ant-parsed-token-xyz'
        mockExecSuccess(expectedToken + '\n')

        const token = await getTokenFromCli()

        expect(token.value).toBe(expectedToken)
        expect(token.source).toBe('cli')
      })

      it('should handle multi-line CLI output (extract token)', async () => {
        const expectedToken = 'sk-ant-multiline-token'
        mockExecSuccess(`Some info message\n${expectedToken}\nMore output\n`)

        const token = await getTokenFromCli()

        expect(token.value).toBe(expectedToken)
      })

      it('should throw ClaudeCliNotInstalledError when CLI not installed', async () => {
        const error = new Error('Command not found: claude') as NodeJS.ErrnoException
        error.code = 'ENOENT'
        mockExecError(error)

        await expect(getTokenFromCli()).rejects.toThrow(ClaudeCliNotInstalledError)
      })

      it('should throw ClaudeCliAuthRequiredError when CLI requires authentication', async () => {
        const error = new Error('Not authenticated. Please run "claude login" first.')
        mockExecError(error)

        await expect(getTokenFromCli()).rejects.toThrow(ClaudeCliAuthRequiredError)
      })

      it('should include helpful message when CLI not installed', async () => {
        const error = new Error('Command not found: claude') as NodeJS.ErrnoException
        error.code = 'ENOENT'
        mockExecError(error)

        try {
          await getTokenFromCli()
          expect.fail('Should have thrown')
        } catch (err) {
          expect((err as Error).message).toContain('Claude Code CLI')
          expect((err as Error).message).toMatch(/install|npm|npx/i)
        }
      })

      it('should suggest running "claude login" when authentication required', async () => {
        const error = new Error('Not authenticated')
        mockExecError(error)

        try {
          await getTokenFromCli()
          expect.fail('Should have thrown')
        } catch (err) {
          expect((err as Error).message).toContain('claude login')
        }
      })

      it('should handle CLI timeout gracefully', async () => {
        const error = new Error('Command timed out') as NodeJS.ErrnoException
        error.code = 'ETIMEDOUT'
        mockExecError(error)

        await expect(getTokenFromCli()).rejects.toThrow(AuthError)
      })
    })
  })

  describe('Token Validation', () => {
    describe('validateToken', () => {
      it('should validate token format (starts with expected prefix)', () => {
        const validToken = 'sk-ant-api03-valid-token-format'

        const result = validateToken(validToken)

        expect(result.valid).toBe(true)
      })

      it('should accept sk-ant- prefix', () => {
        const token = 'sk-ant-test-token'

        const result = validateToken(token)

        expect(result.valid).toBe(true)
      })

      it('should accept anthropic- prefix', () => {
        const token = 'anthropic-test-token'

        const result = validateToken(token)

        expect(result.valid).toBe(true)
      })

      it('should reject invalid token format', () => {
        const invalidToken = 'invalid-token-no-prefix'

        const result = validateToken(invalidToken)

        expect(result.valid).toBe(false)
        expect(result.error).toBeDefined()
      })

      it('should reject empty token', () => {
        const result = validateToken('')

        expect(result.valid).toBe(false)
        expect(result.error).toContain('empty')
      })

      it('should reject token with only whitespace', () => {
        const result = validateToken('   ')

        expect(result.valid).toBe(false)
      })

      it('should provide descriptive error for invalid tokens', () => {
        const invalidToken = 'bad-token'

        const result = validateToken(invalidToken)

        expect(result.error).toMatch(/prefix|format|invalid/i)
      })

      it('should not include the actual token in error messages', () => {
        const secretToken = 'my-secret-bad-token'

        const result = validateToken(secretToken)

        expect(result.error).not.toContain(secretToken)
      })
    })

    describe('isTokenExpired', () => {
      it('should return false for non-expired token', () => {
        const token: AuthToken = {
          value: 'sk-ant-valid-token',
          source: 'cli',
          expiresAt: Date.now() + 86400000, // 24 hours from now
        }

        const expired = isTokenExpired(token)

        expect(expired).toBe(false)
      })

      it('should return true for expired token', () => {
        const token: AuthToken = {
          value: 'sk-ant-expired-token',
          source: 'config',
          expiresAt: Date.now() - 3600000, // 1 hour ago
        }

        const expired = isTokenExpired(token)

        expect(expired).toBe(true)
      })

      it('should return false for token with no expiration', () => {
        const token: AuthToken = {
          value: 'sk-ant-no-expiry-token',
          source: 'env',
        }

        const expired = isTokenExpired(token)

        expect(expired).toBe(false)
      })

      it('should consider token expiring within buffer as expired', () => {
        const token: AuthToken = {
          value: 'sk-ant-almost-expired',
          source: 'cli',
          expiresAt: Date.now() + 30000, // 30 seconds from now (within 5 min buffer)
        }

        const expired = isTokenExpired(token, { bufferMs: 300000 }) // 5 min buffer

        expect(expired).toBe(true)
      })
    })

    describe('token verification with API (optional)', () => {
      it('should verify token with Claude API when requested', async () => {
        const token: AuthToken = {
          value: 'sk-ant-verify-me',
          source: 'env',
        }

        // Mock a successful API verification
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
        })

        const result = await validateToken(token.value, { verifyWithApi: true })

        expect(result.valid).toBe(true)
        expect(fetch).toHaveBeenCalled()
      })

      it('should detect invalid token via API verification', async () => {
        const token: AuthToken = {
          value: 'sk-ant-invalid-api-token',
          source: 'env',
        }

        global.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
        })

        const result = await validateToken(token.value, { verifyWithApi: true })

        expect(result.valid).toBe(false)
        expect(result.error).toMatch(/unauthorized|invalid/i)
      })

      it('should handle API verification network errors gracefully', async () => {
        const token: AuthToken = {
          value: 'sk-ant-network-error-token',
          source: 'env',
        }

        global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

        // Should not throw, should return validation result
        const result = await validateToken(token.value, { verifyWithApi: true })

        expect(result.valid).toBe(false)
        expect(result.error).toMatch(/network|verify|connection/i)
      })
    })
  })

  describe('Config File', () => {
    const configDir = path.join(os.homedir(), '.config', 'obsidian-agent')
    const configPath = path.join(configDir, 'auth.json')

    describe('getConfigPath', () => {
      it('should return correct config path', () => {
        const result = getConfigPath()

        expect(result).toBe(configPath)
      })

      it('should use XDG_CONFIG_HOME when set', () => {
        process.env.XDG_CONFIG_HOME = '/custom/config'

        const result = getConfigPath()

        expect(result).toBe('/custom/config/obsidian-agent/auth.json')
      })
    })

    describe('getTokenFromConfig', () => {
      it('should read token from config file', async () => {
        const configToken = 'sk-ant-config-stored-token'
        const config: AuthConfig = {
          token: configToken,
          expiresAt: Date.now() + 86400000,
        }

        ;(fs.readFile as Mock).mockResolvedValue(JSON.stringify(config))

        const token = await getTokenFromConfig()

        expect(token.value).toBe(configToken)
        expect(token.source).toBe('config')
      })

      it('should throw error when config file does not exist', async () => {
        const error = new Error('ENOENT') as NodeJS.ErrnoException
        error.code = 'ENOENT'
        ;(fs.readFile as Mock).mockRejectedValue(error)

        await expect(getTokenFromConfig()).rejects.toThrow()
      })

      it('should handle corrupted config file gracefully', async () => {
        ;(fs.readFile as Mock).mockResolvedValue('{ invalid json }}}')

        await expect(getTokenFromConfig()).rejects.toThrow(AuthError)
      })

      it('should handle config file with missing token field', async () => {
        ;(fs.readFile as Mock).mockResolvedValue(JSON.stringify({ expiresAt: Date.now() }))

        await expect(getTokenFromConfig()).rejects.toThrow(AuthError)
      })

      it('should return token with expiration from config', async () => {
        const expiresAt = Date.now() + 86400000
        const config: AuthConfig = {
          token: 'sk-ant-expiring-token',
          expiresAt,
        }

        ;(fs.readFile as Mock).mockResolvedValue(JSON.stringify(config))

        const token = await getTokenFromConfig()

        expect(token.expiresAt).toBe(expiresAt)
      })

      it('should throw TokenExpiredError for expired token in config', async () => {
        const config: AuthConfig = {
          token: 'sk-ant-old-expired-token',
          expiresAt: Date.now() - 86400000, // Expired 24 hours ago
        }

        ;(fs.readFile as Mock).mockResolvedValue(JSON.stringify(config))

        await expect(getTokenFromConfig()).rejects.toThrow(TokenExpiredError)
      })
    })

    describe('saveTokenToConfig', () => {
      it('should write token to config file', async () => {
        const token: AuthToken = {
          value: 'sk-ant-save-me',
          source: 'cli',
          expiresAt: Date.now() + 86400000,
        }

        ;(fs.mkdir as Mock).mockResolvedValue(undefined)
        ;(fs.writeFile as Mock).mockResolvedValue(undefined)

        await saveTokenToConfig(token)

        expect(fs.writeFile).toHaveBeenCalledWith(
          configPath,
          expect.stringContaining('sk-ant-save-me'),
          'utf-8'
        )
      })

      it('should create config directory if missing', async () => {
        const token: AuthToken = {
          value: 'sk-ant-new-dir-token',
          source: 'cli',
        }

        ;(fs.mkdir as Mock).mockResolvedValue(undefined)
        ;(fs.writeFile as Mock).mockResolvedValue(undefined)

        await saveTokenToConfig(token)

        expect(fs.mkdir).toHaveBeenCalledWith(
          configDir,
          { recursive: true }
        )
      })

      it('should write valid JSON to config file', async () => {
        const token: AuthToken = {
          value: 'sk-ant-json-token',
          source: 'cli',
          expiresAt: Date.now() + 3600000,
        }

        ;(fs.mkdir as Mock).mockResolvedValue(undefined)
        ;(fs.writeFile as Mock).mockResolvedValue(undefined)

        await saveTokenToConfig(token)

        const writtenContent = (fs.writeFile as Mock).mock.calls[0][1]
        expect(() => JSON.parse(writtenContent)).not.toThrow()

        const parsed = JSON.parse(writtenContent)
        expect(parsed.token).toBe(token.value)
        expect(parsed.expiresAt).toBe(token.expiresAt)
      })

      it('should set restrictive file permissions', async () => {
        const token: AuthToken = {
          value: 'sk-ant-secure-token',
          source: 'cli',
        }

        ;(fs.mkdir as Mock).mockResolvedValue(undefined)
        ;(fs.writeFile as Mock).mockResolvedValue(undefined)

        await saveTokenToConfig(token)

        expect(fs.writeFile).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.objectContaining({ mode: 0o600 }) // Owner read/write only
        )
      })
    })
  })

  describe('Token Refresh', () => {
    describe('refreshToken', () => {
      it('should re-run claude auth token to refresh', async () => {
        const newToken = 'sk-ant-refreshed-token'
        mockExecSuccess(newToken + '\n')

        const token = await refreshToken()

        expect(token.value).toBe(newToken)
        expect(exec).toHaveBeenCalledWith('claude auth token', expect.any(Function))
      })

      it('should save refreshed token to config', async () => {
        const newToken = 'sk-ant-refresh-and-save'
        mockExecSuccess(newToken + '\n')
        ;(fs.mkdir as Mock).mockResolvedValue(undefined)
        ;(fs.writeFile as Mock).mockResolvedValue(undefined)

        await refreshToken({ saveToConfig: true })

        expect(fs.writeFile).toHaveBeenCalled()
      })

      it('should throw error if refresh fails', async () => {
        mockExecError(new Error('CLI error during refresh'))

        await expect(refreshToken()).rejects.toThrow(AuthError)
      })

      it('should detect expired tokens during getAuthToken and auto-refresh', async () => {
        // First call returns expired token from config
        const expiredConfig: AuthConfig = {
          token: 'sk-ant-expired',
          expiresAt: Date.now() - 1000,
        }
        ;(fs.readFile as Mock).mockResolvedValue(JSON.stringify(expiredConfig))

        // CLI is available to refresh
        const freshToken = 'sk-ant-fresh-from-cli'
        mockExecSuccess(freshToken + '\n')

        const token = await getAuthToken({ autoRefresh: true })

        expect(token.value).toBe(freshToken)
      })
    })
  })

  describe('Error Handling', () => {
    describe('error types', () => {
      it('should throw AuthError as base class for auth errors', async () => {
        mockExecError(new Error('Unknown error'))
        ;(fs.readFile as Mock).mockRejectedValue(new Error('ENOENT'))

        try {
          await getAuthToken()
          expect.fail('Should have thrown')
        } catch (error) {
          expect(error).toBeInstanceOf(AuthError)
        }
      })

      it('should provide helpful error when not authenticated', async () => {
        mockExecError(new Error('Not authenticated'))
        ;(fs.readFile as Mock).mockRejectedValue(new Error('ENOENT'))

        try {
          await getAuthToken()
          expect.fail('Should have thrown')
        } catch (error) {
          const message = (error as Error).message.toLowerCase()
          expect(message).toMatch(/authenticate|login|token/i)
        }
      })

      it('should suggest running claude login when needed', async () => {
        mockExecError(new Error('Not authenticated'))
        ;(fs.readFile as Mock).mockRejectedValue(new Error('ENOENT'))

        try {
          await getAuthToken()
          expect.fail('Should have thrown')
        } catch (error) {
          expect((error as Error).message).toContain('claude login')
        }
      })

      it('should not expose token in any error messages', async () => {
        const sensitiveToken = 'sk-ant-super-secret-12345'
        process.env.ANTHROPIC_API_KEY = sensitiveToken

        // Force an error after reading the token
        global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'))

        try {
          await validateToken(sensitiveToken, { verifyWithApi: true })
        } catch (error) {
          expect((error as Error).message).not.toContain(sensitiveToken)
          expect((error as Error).stack).not.toContain(sensitiveToken)
        }
      })
    })

    describe('NoAuthenticationError', () => {
      it('should have correct error name', () => {
        const error = new NoAuthenticationError()
        expect(error.name).toBe('NoAuthenticationError')
      })

      it('should include authentication instructions', () => {
        const error = new NoAuthenticationError()
        expect(error.message).toMatch(/ANTHROPIC_API_KEY|claude login|auth/i)
      })
    })

    describe('ClaudeCliNotInstalledError', () => {
      it('should have correct error name', () => {
        const error = new ClaudeCliNotInstalledError()
        expect(error.name).toBe('ClaudeCliNotInstalledError')
      })

      it('should include installation instructions', () => {
        const error = new ClaudeCliNotInstalledError()
        expect(error.message).toMatch(/install|npm|npx/i)
      })
    })

    describe('ClaudeCliAuthRequiredError', () => {
      it('should have correct error name', () => {
        const error = new ClaudeCliAuthRequiredError()
        expect(error.name).toBe('ClaudeCliAuthRequiredError')
      })

      it('should suggest running claude login', () => {
        const error = new ClaudeCliAuthRequiredError()
        expect(error.message).toContain('claude login')
      })
    })

    describe('TokenExpiredError', () => {
      it('should have correct error name', () => {
        const error = new TokenExpiredError()
        expect(error.name).toBe('TokenExpiredError')
      })

      it('should suggest refreshing token', () => {
        const error = new TokenExpiredError()
        expect(error.message).toMatch(/refresh|expired|renew/i)
      })
    })
  })

  describe('Integration scenarios', () => {
    it('should use env var when all sources available', async () => {
      // All sources available
      process.env.ANTHROPIC_API_KEY = 'sk-ant-env-priority'
      mockExecSuccess('sk-ant-cli-available\n')
      ;(fs.readFile as Mock).mockResolvedValue(
        JSON.stringify({ token: 'sk-ant-config-available', expiresAt: Date.now() + 86400000 })
      )

      const token = await getAuthToken()

      expect(token.source).toBe('env')
      expect(token.value).toBe('sk-ant-env-priority')
    })

    it('should use CLI when env not set but CLI available', async () => {
      delete process.env.ANTHROPIC_API_KEY
      mockExecSuccess('sk-ant-cli-fallback\n')
      ;(fs.readFile as Mock).mockResolvedValue(
        JSON.stringify({ token: 'sk-ant-config-available', expiresAt: Date.now() + 86400000 })
      )

      const token = await getAuthToken()

      expect(token.source).toBe('cli')
      expect(token.value).toBe('sk-ant-cli-fallback')
    })

    it('should use config when env not set and CLI fails', async () => {
      delete process.env.ANTHROPIC_API_KEY
      mockExecError(new Error('CLI not available'))
      ;(fs.readFile as Mock).mockResolvedValue(
        JSON.stringify({ token: 'sk-ant-config-last-resort', expiresAt: Date.now() + 86400000 })
      )

      const token = await getAuthToken()

      expect(token.source).toBe('config')
      expect(token.value).toBe('sk-ant-config-last-resort')
    })

    it('should provide complete error context when all sources fail', async () => {
      delete process.env.ANTHROPIC_API_KEY
      mockExecError(new Error('Command not found: claude'))
      ;(fs.readFile as Mock).mockRejectedValue(new Error('ENOENT'))

      try {
        await getAuthToken()
        expect.fail('Should have thrown')
      } catch (error) {
        const message = (error as Error).message
        // Should mention all options
        expect(message).toMatch(/ANTHROPIC_API_KEY/i)
        expect(message).toMatch(/claude/i)
      }
    })
  })
})
