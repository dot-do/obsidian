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
import { CAC } from 'cac';
/**
 * Parsed command line arguments
 */
export interface ParsedArgs {
    /** The command to execute (e.g., 'search', 'mcp', 'serve') */
    command?: string;
    /** Positional arguments after the command */
    args: string[];
    /** Parsed flags from command line */
    flags: Record<string, string | boolean>;
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
export declare function parseArgs(argv: string[]): ParsedArgs;
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
export declare function resolveVaultPath(flags: Record<string, string | boolean>): string;
/**
 * Validate that a vault path exists and is accessible
 *
 * @param vaultPath - Path to validate
 * @throws Error if vault path is invalid, doesn't exist, or isn't readable
 */
export declare function validateVaultPath(vaultPath: string): void;
/**
 * Display version information and exit
 */
export declare function showVersion(): void;
/**
 * Display help information and exit
 *
 * @param command - Optional specific command to show help for
 */
export declare function showHelp(command?: string): void;
/**
 * Route to the appropriate command handler
 *
 * @param command - Command name to route to
 * @param args - Parsed arguments
 * @param flags - Parsed flags
 * @throws Error if command is unknown
 */
export declare function routeToCommand(command: string, args: string[], flags: Record<string, string | boolean>): void;
/**
 * Create the CLI instance with all commands
 */
export declare function createCli(): CAC;
/**
 * Run the CLI
 */
export declare function run(): void;
/**
 * Main CLI entry point
 *
 * @param argv - Command line arguments
 * @returns Exit code (0 for success, non-zero for error)
 */
export declare function main(argv: string[]): Promise<number>;
//# sourceMappingURL=index.d.ts.map