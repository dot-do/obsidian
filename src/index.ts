// obsidian.do - Obsidian-compatible API for headless vault operations

export * from './types.js'
export { Events, EventRef } from './vault/events.js'
export { Vault } from './vault/vault.js'
export { FileManager } from './vault/file-manager.js'
export { MetadataCache } from './metadata/cache.js'
export { Graph } from './graph/graph.js'
export type { GraphStats } from './graph/graph.js'
export { GraphEngine, type BacklinkResult, type Backlink, type ForwardLink } from './graph/engine.js'
export { SearchEngine } from './search/engine.js'
export type { SearchResult, SearchOptions } from './search/engine.js'
export { prepareSimpleSearch, prepareFuzzySearch } from './search/search.js'
export type { TextSearchResult, SearchMatchFn } from './search/search.js'
export { ObsidianClient, parseFrontmatter, getContentWithoutFrontmatter } from './client/client.js'
export type { ClientOptions, Note, NoteResult, VaultBackend, ObsidianClientOptions, VaultStats } from './client/client.js'
export {
  generateContext,
  getGraphStats,
  getTagCloud,
  getRecentNotes,
  getRelatedNotes,
  truncateContext,
} from './client/context.js'
// Export context types from shared types module
// Legacy aliases maintained for backward compatibility
export type {
  ContextOptions as ContextGeneratorOptions,
  GeneratedVaultContext,
  ContextGraphStats,
  ContextNote,
  ContextOptions,
  GenerateContextOptions,
  QueryContextOptions,
} from './client/types.js'
export { MemoryBackend } from './vault/memory-backend.js'
export { FileSystemBackend } from './vault/fs-backend.js'
export { RestApiBackend } from './vault/rest-backend.js'
export { runCli } from './cli/cli.js'
export type { CliResult, CliOptions } from './cli/cli.js'
