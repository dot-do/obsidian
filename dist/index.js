// obsidian.do - Obsidian-compatible API for headless vault operations
export * from './types.js';
export { Events } from './vault/events.js';
export { Vault } from './vault/vault.js';
export { FileManager } from './vault/file-manager.js';
export { MetadataCache } from './metadata/cache.js';
export { Graph } from './graph/graph.js';
export { GraphEngine } from './graph/engine.js';
export { SearchEngine } from './search/engine.js';
export { prepareSimpleSearch, prepareFuzzySearch } from './search/search.js';
export { ObsidianClient, parseFrontmatter, getContentWithoutFrontmatter } from './client/client.js';
export { MemoryBackend } from './vault/memory-backend.js';
export { FileSystemBackend } from './vault/fs-backend.js';
export { RestApiBackend } from './vault/rest-backend.js';
export { runCli } from './cli/cli.js';
//# sourceMappingURL=index.js.map