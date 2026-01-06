/**
 * Agent Authentication Module
 *
 * Provides authentication for the Agent Server using Claude Code CLI token.
 *
 * Token sources (priority order):
 * 1. Environment variable: ANTHROPIC_API_KEY
 * 2. Claude Code CLI: `claude auth token`
 * 3. Config file: ~/.config/obsidian-agent/auth.json
 *
 * @module agent/auth
 */

import { exec } from 'child_process'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

/**
 * Authentication token with metadata
 */
export interface AuthToken {
  /** The actual token value */
  value: string
  /** Where the token came from */
  source: 'env' | 'cli' | 'config'
  /** Optional expiration timestamp */
  expiresAt?: number
}

/**
 * Configuration stored in auth.json
 */
export interface AuthConfig {
  token: string
  expiresAt?: number
}

/**
 * Token validation result
 */
export interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * Options for token expiration check
 */
export interface ExpirationOptions {
  /** Buffer time in milliseconds before actual expiration */
  bufferMs?: number
}

/**
 * Options for token validation
 */
export interface ValidationOptions {
  /** Whether to verify token with Claude API */
  verifyWithApi?: boolean
}

/**
 * Options for getAuthToken
 */
export interface GetAuthTokenOptions {
  /** Automatically refresh expired tokens */
  autoRefresh?: boolean
}

/**
 * Options for refreshToken
 */
export interface RefreshTokenOptions {
  /** Save refreshed token to config file */
  saveToConfig?: boolean
}

/**
 * Base class for authentication errors
 */
export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

/**
 * Error thrown when no authentication source is available
 */
export class NoAuthenticationError extends AuthError {
  constructor() {
    super(
      'No authentication available. Please either:\n' +
      '  1. Set the ANTHROPIC_API_KEY environment variable\n' +
      '  2. Run "claude login" to authenticate with Claude Code CLI\n' +
      '  3. Save a valid auth configuration'
    )
    this.name = 'NoAuthenticationError'
  }
}

/**
 * Error thrown when Claude CLI is not installed
 */
export class ClaudeCliNotInstalledError extends AuthError {
  constructor() {
    super(
      'Claude Code CLI is not installed. Please install it with:\n' +
      '  npm install -g @anthropic-ai/claude-code\n' +
      'Or use npx: npx @anthropic-ai/claude-code'
    )
    this.name = 'ClaudeCliNotInstalledError'
  }
}

/**
 * Error thrown when Claude CLI requires authentication
 */
export class ClaudeCliAuthRequiredError extends AuthError {
  constructor() {
    super(
      'Claude Code CLI requires authentication. Please run:\n' +
      '  claude login'
    )
    this.name = 'ClaudeCliAuthRequiredError'
  }
}

/**
 * Error thrown when token has expired
 */
export class TokenExpiredError extends AuthError {
  constructor() {
    super(
      'Authentication expired. Please refresh your credentials by running:\n' +
      '  claude login\n' +
      'Or renew your API key.'
    )
    this.name = 'TokenExpiredError'
  }
}

/** Valid token prefixes */
const VALID_TOKEN_PREFIXES = ['sk-ant-', 'sk-', 'anthropic-']

/**
 * Get the path to the config file
 *
 * Respects XDG_CONFIG_HOME if set
 */
export function getConfigPath(): string {
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  return path.join(configHome, 'obsidian-agent', 'auth.json')
}

/**
 * Get token from ANTHROPIC_API_KEY environment variable
 *
 * @returns Token if env var is set, null otherwise
 */
export function getTokenFromEnv(): AuthToken | null {
  const value = process.env.ANTHROPIC_API_KEY?.trim()
  if (!value) {
    return null
  }
  return {
    value,
    source: 'env',
  }
}

/**
 * Get token from Claude Code CLI
 *
 * Executes `claude auth token` command to retrieve a valid token
 *
 * @throws {ClaudeCliNotInstalledError} When Claude CLI is not installed
 * @throws {ClaudeCliAuthRequiredError} When CLI requires authentication
 */
export async function getTokenFromCli(): Promise<AuthToken> {
  return new Promise((resolve, reject) => {
    exec('claude auth token', (error, result) => {
      if (error) {
        const errorMessage = error.message.toLowerCase()
        const errorCode = (error as NodeJS.ErrnoException).code

        // Check for CLI not installed
        if (errorCode === 'ENOENT' || errorMessage.includes('command not found') || errorMessage.includes('not found')) {
          reject(new ClaudeCliNotInstalledError())
          return
        }

        // Check for timeout
        if (errorCode === 'ETIMEDOUT') {
          reject(new AuthError('Claude CLI command timed out. Please try again.'))
          return
        }

        // Check for authentication required
        if (errorMessage.includes('not authenticated') || errorMessage.includes('login')) {
          reject(new ClaudeCliAuthRequiredError())
          return
        }

        reject(new AuthError(`Claude CLI error: ${error.message}`))
        return
      }

      // Parse token from output - look for a line that looks like a token
      const output = result.stdout
      const lines = output.trim().split('\n')

      // Find a line that looks like a token
      for (const line of lines) {
        const trimmed = line.trim()
        if (VALID_TOKEN_PREFIXES.some(prefix => trimmed.startsWith(prefix))) {
          resolve({
            value: trimmed,
            source: 'cli',
          })
          return
        }
      }

      // If no token found, use the last non-empty line (trimmed)
      const lastLine = lines[lines.length - 1]?.trim()
      if (lastLine) {
        resolve({
          value: lastLine,
          source: 'cli',
        })
        return
      }

      reject(new AuthError('No token returned from Claude CLI'))
    })
  })
}

/**
 * Get token from config file
 *
 * @throws {AuthError} When config file is missing or corrupted
 * @throws {TokenExpiredError} When stored token has expired
 */
export async function getTokenFromConfig(): Promise<AuthToken> {
  const configPath = getConfigPath()

  let content: string
  try {
    content = await fs.readFile(configPath, 'utf-8')
  } catch (error) {
    throw error // Re-throw file not found errors
  }

  let config: AuthConfig
  try {
    config = JSON.parse(content)
  } catch {
    throw new AuthError('Config file is corrupted: invalid JSON')
  }

  if (!config.token) {
    throw new AuthError('Config file is missing required "token" field')
  }

  const token: AuthToken = {
    value: config.token,
    source: 'config',
    expiresAt: config.expiresAt,
  }

  // Check if token is expired
  if (config.expiresAt && config.expiresAt < Date.now()) {
    throw new TokenExpiredError()
  }

  return token
}

/**
 * Validate token format and optionally verify with API
 *
 * @param token - Token string to validate
 * @param options - Validation options
 */
export function validateToken(token: string, options?: ValidationOptions): ValidationResult | Promise<ValidationResult> {
  // Basic format validation
  const trimmed = token.trim()

  if (!trimmed) {
    return { valid: false, error: 'Token is empty' }
  }

  // Check prefix
  const hasValidPrefix = VALID_TOKEN_PREFIXES.some(prefix => trimmed.startsWith(prefix))
  if (!hasValidPrefix) {
    return { valid: false, error: 'Invalid token format: missing valid prefix (sk-ant-, sk-, or anthropic-)' }
  }

  // If API verification requested, perform async check
  if (options?.verifyWithApi) {
    return verifyTokenWithApi(trimmed)
  }

  return { valid: true }
}

/**
 * Verify token with Claude API
 */
async function verifyTokenWithApi(token: string): Promise<ValidationResult> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': token,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })

    if (response.ok || response.status === 200) {
      return { valid: true }
    }

    if (response.status === 401) {
      return { valid: false, error: 'Unauthorized: invalid API key' }
    }

    return { valid: false, error: `API verification failed with status ${response.status}` }
  } catch {
    return { valid: false, error: 'Network error: unable to verify API connection' }
  }
}

/**
 * Check if token has expired
 *
 * @param token - Token to check
 * @param options - Expiration check options
 */
export function isTokenExpired(token: AuthToken, options?: ExpirationOptions): boolean {
  if (!token.expiresAt) {
    return false
  }

  const bufferMs = options?.bufferMs ?? 0
  return token.expiresAt - bufferMs < Date.now()
}

/**
 * Save token to config file
 *
 * @param token - Token to save
 */
export async function saveTokenToConfig(token: AuthToken): Promise<void> {
  const configPath = getConfigPath()
  const configDir = path.dirname(configPath)

  // Ensure config directory exists
  await fs.mkdir(configDir, { recursive: true })

  const config: AuthConfig = {
    token: token.value,
    expiresAt: token.expiresAt,
  }

  const content = JSON.stringify(config, null, 2)

  // Write with utf-8 encoding
  await fs.writeFile(configPath, content, 'utf-8')

  // Set restrictive permissions (owner read/write only)
  await fs.writeFile(configPath, content, { mode: 0o600 })
}

/**
 * Refresh token by re-running Claude CLI
 *
 * @param options - Refresh options
 */
export async function refreshToken(options?: RefreshTokenOptions): Promise<AuthToken> {
  let token: AuthToken

  try {
    token = await getTokenFromCli()
  } catch (error) {
    if (error instanceof AuthError) {
      throw error
    }
    throw new AuthError(`Failed to refresh authentication: ${(error as Error).message}`)
  }

  if (options?.saveToConfig) {
    await saveTokenToConfig(token)
  }

  return token
}

/**
 * Get authentication token from all available sources
 *
 * Priority order:
 * 1. ANTHROPIC_API_KEY environment variable
 * 2. Claude Code CLI (`claude auth token`)
 * 3. Config file (~/.config/obsidian-agent/auth.json)
 *
 * @param options - Options for token retrieval
 * @throws {NoAuthenticationError} When no token source is available
 */
export async function getAuthToken(options?: GetAuthTokenOptions): Promise<AuthToken> {
  // 1. Try environment variable first
  const envToken = getTokenFromEnv()
  if (envToken) {
    return envToken
  }

  // 2. Try Claude CLI
  try {
    const cliToken = await getTokenFromCli()
    return cliToken
  } catch {
    // CLI failed, continue to config file
  }

  // 3. Try config file
  try {
    const configToken = await getTokenFromConfig()
    return configToken
  } catch (error) {
    // If autoRefresh is enabled and the token is expired, try to refresh
    if (options?.autoRefresh && error instanceof TokenExpiredError) {
      try {
        return await refreshToken()
      } catch {
        // Refresh failed, throw original error
      }
    }
    // Config file failed or doesn't exist
  }

  // All sources exhausted
  throw new NoAuthenticationError()
}
