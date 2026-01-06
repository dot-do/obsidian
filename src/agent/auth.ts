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
    super('TODO: implement')
    this.name = 'NoAuthenticationError'
  }
}

/**
 * Error thrown when Claude CLI is not installed
 */
export class ClaudeCliNotInstalledError extends AuthError {
  constructor() {
    super('TODO: implement')
    this.name = 'ClaudeCliNotInstalledError'
  }
}

/**
 * Error thrown when Claude CLI requires authentication
 */
export class ClaudeCliAuthRequiredError extends AuthError {
  constructor() {
    super('TODO: implement')
    this.name = 'ClaudeCliAuthRequiredError'
  }
}

/**
 * Error thrown when token has expired
 */
export class TokenExpiredError extends AuthError {
  constructor() {
    super('TODO: implement')
    this.name = 'TokenExpiredError'
  }
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
export async function getAuthToken(_options?: GetAuthTokenOptions): Promise<AuthToken> {
  throw new Error('Not implemented')
}

/**
 * Get token from ANTHROPIC_API_KEY environment variable
 *
 * @returns Token if env var is set, null otherwise
 */
export function getTokenFromEnv(): AuthToken | null {
  throw new Error('Not implemented')
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
  throw new Error('Not implemented')
}

/**
 * Get token from config file
 *
 * @throws {AuthError} When config file is missing or corrupted
 * @throws {TokenExpiredError} When stored token has expired
 */
export async function getTokenFromConfig(): Promise<AuthToken> {
  throw new Error('Not implemented')
}

/**
 * Validate token format and optionally verify with API
 *
 * @param token - Token string to validate
 * @param options - Validation options
 */
export function validateToken(_token: string, _options?: ValidationOptions): ValidationResult | Promise<ValidationResult> {
  throw new Error('Not implemented')
}

/**
 * Check if token has expired
 *
 * @param token - Token to check
 * @param options - Expiration check options
 */
export function isTokenExpired(_token: AuthToken, _options?: ExpirationOptions): boolean {
  throw new Error('Not implemented')
}

/**
 * Refresh token by re-running Claude CLI
 *
 * @param options - Refresh options
 */
export async function refreshToken(_options?: RefreshTokenOptions): Promise<AuthToken> {
  throw new Error('Not implemented')
}

/**
 * Save token to config file
 *
 * @param token - Token to save
 */
export async function saveTokenToConfig(_token: AuthToken): Promise<void> {
  throw new Error('Not implemented')
}

/**
 * Get the path to the config file
 *
 * Respects XDG_CONFIG_HOME if set
 */
export function getConfigPath(): string {
  throw new Error('Not implemented')
}
