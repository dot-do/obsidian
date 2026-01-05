#!/usr/bin/env node
/**
 * CLI executable entry point for obsidian.do
 *
 * This is the main executable that handles:
 * - Command parsing
 * - Vault operations
 * - MCP server mode
 * - HTTP serve mode
 */
import { main } from './cli/index.js';
// Run the CLI
main(process.argv.slice(2)).then((exitCode) => {
    process.exit(exitCode);
}).catch((error) => {
    console.error('Fatal error:', error.message);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map