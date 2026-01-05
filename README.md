# obsidian.do

**Obsidian-compatible API for headless vault operations** — Access your Obsidian vaults programmatically with a clean TypeScript API, CLI, and MCP server for AI agent integration.

[![npm version](https://img.shields.io/npm/v/obsidian.do.svg)](https://www.npmjs.com/package/obsidian.do)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Why obsidian.do?

Obsidian is excellent for personal knowledge management, but accessing vault data programmatically requires either desktop plugins or manual file parsing. obsidian.do solves this by providing:

- **Headless Access** — Read, write, and search vaults without the Obsidian app running
- **Full Metadata Parsing** — Frontmatter, wiki-links, tags, headings, and blocks parsed automatically
- **Knowledge Graph** — Traverse backlinks, find neighbors, analyze clusters, and detect orphans
- **AI-Ready** — MCP server for Claude, ChatGPT, and other AI agents to interact with your notes
- **Multiple Backends** — Filesystem, in-memory, or REST API backends for any deployment scenario
- **TypeScript Native** — Full type definitions with generics support

```typescript
import { ObsidianClient } from 'obsidian.do'

const client = new ObsidianClient({
  backend: 'filesystem',
  vaultPath: '/path/to/vault'
})
await client.initialize()

// It's just Obsidian
const note = await client.getNote('Projects/my-project.md')
console.log(note.content, note.metadata.frontmatter, note.backlinks)
```

---

## Features

### Vault Operations

| Feature | Description |
|---------|-------------|
| **CRUD Operations** | `read`, `create`, `modify`, `append`, `delete`, `rename`, `copy` |
| **Cached Reads** | Intelligent caching with automatic invalidation on file changes |
| **File Manager** | Get files by path, list markdown files, traverse folders |
| **Event System** | Subscribe to `create`, `modify`, `delete`, `rename` events |

### Metadata Parsing

| Feature | Description |
|---------|-------------|
| **Frontmatter** | YAML frontmatter parsing with position tracking |
| **Wiki-Links** | `[[link]]` and `[[link|alias]]` extraction with resolution |
| **Embeds** | `![[embed]]` detection for transclusions |
| **Tags** | Inline `#tags` and frontmatter `tags:` array support |
| **Headings** | ATX-style heading extraction with level detection |
| **Block References** | `^block-id` parsing for block-level linking |

### Knowledge Graph

| Feature | Description |
|---------|-------------|
| **Backlinks** | Find all notes linking to a given note |
| **Forward Links** | Get resolved outgoing links from a note |
| **Neighbors** | BFS traversal to find connected notes at any depth |
| **Path Finding** | Shortest path between any two notes |
| **Orphan Detection** | Find notes with no incoming or outgoing links |
| **Cluster Analysis** | Connected component detection using Union-Find |
| **Hub Detection** | Find most-linked notes in the vault |

### Search

| Feature | Description |
|---------|-------------|
| **Content Search** | Full-text search with match positions and context |
| **Fuzzy Search** | Typo-tolerant matching with Levenshtein distance |
| **Tag Search** | Find notes by single tag or tag combinations |
| **Property Search** | Query by frontmatter properties with nested dot notation |
| **Link Search** | Find all notes linking to a specific target |

### AI & Agents

| Feature | Description |
|---------|-------------|
| **MCP Server** | Model Context Protocol server for AI agent access |
| **Context Generation** | Generate context strings for LLM prompts with depth control |
| **Query Context** | Search-based context generation for RAG workflows |
| **Tag Context** | Generate context from notes with specific tags |

### Connectivity

| Feature | Description |
|---------|-------------|
| **Filesystem Backend** | Direct access to local vault directories |
| **Memory Backend** | In-memory vault for testing and ephemeral use |
| **REST Backend** | HTTP client for remote vault access |
| **CLI** | Command-line interface for scripting and automation |

---

## Quick Start

### Install

```bash
npm install obsidian.do
```

### Basic Usage

```typescript
import { ObsidianClient } from 'obsidian.do'

// Create client with filesystem backend
const client = new ObsidianClient({
  backend: 'filesystem',
  vaultPath: '/Users/me/Documents/MyVault'
})

// Initialize (scans vault and builds caches)
await client.initialize()

// Read a note with metadata and backlinks
const note = await client.getNote('Daily Notes/2025-01-05.md')
console.log(note.content)
console.log(note.metadata.frontmatter)
console.log(note.backlinks)

// Create a new note with frontmatter
await client.createNote('Projects/new-project.md', '# New Project\n\nProject description...', {
  tags: ['project', 'active'],
  status: 'in-progress'
})

// Search the vault
const results = await client.search.searchContent('machine learning')
for (const result of results) {
  console.log(result.file.path, result.score)
}

// Get vault statistics
const stats = client.getVaultStats()
console.log(`${stats.totalNotes} notes, ${stats.totalLinks} links`)
```

### CLI Usage

```bash
# Search for notes
npx obsidian.do search "typescript" --vault ~/Documents/MyVault

# Read a note with backlinks
npx obsidian.do read "Projects/my-project.md" --backlinks --vault ~/Documents/MyVault

# Create a new note
npx obsidian.do create "Ideas/new-idea.md" --content "# New Idea" --tags idea,draft --vault ~/Documents/MyVault

# List all tags with counts
npx obsidian.do tags --count --vault ~/Documents/MyVault

# List files in a folder
npx obsidian.do list Projects --vault ~/Documents/MyVault

# Start MCP server for AI agents
npx obsidian.do mcp --vault ~/Documents/MyVault
```

---

## Examples

### Knowledge Graph Traversal

```typescript
// Get all backlinks to a note
const backlinks = client.graph.getBacklinks('MOCs/JavaScript.md')
console.log(`${backlinks.length} notes link to JavaScript.md`)

// Find neighbors within 2 hops
const neighbors = client.graph.getNeighbors('Projects/api-design.md', 2)
for (const neighbor of neighbors) {
  console.log(neighbor.path)
}

// Find shortest path between two notes
const path = client.graph.findPath('Inbox/idea.md', 'Archive/completed.md')
if (path) {
  console.log('Connection path:', path.join(' -> '))
}

// Get most-linked notes (hubs)
const hubs = client.graph.getMostLinked(10)
for (const { file, count } of hubs) {
  console.log(`${file.path}: ${count} backlinks`)
}

// Find orphan notes (no links in or out)
const orphans = client.graph.getOrphans()
console.log(`Found ${orphans.length} unlinked notes`)

// Get graph statistics
const stats = client.graph.getStats()
console.log(`${stats.totalNodes} nodes, ${stats.totalEdges} edges`)
console.log(`Average degree: ${stats.averageDegree.toFixed(2)}`)
```

### Context Generation for AI

```typescript
// Generate context for a single note with 1-hop neighbors
const context = await client.generateContext('Projects/my-project.md', {
  depth: 1,
  maxTokens: 4000
})
console.log(context)
// Output includes:
// - Note content
// - Frontmatter metadata
// - Outgoing links
// - Backlinks
// - Content of linked notes

// Generate context from search results
const searchContext = await client.generateContextForQuery('authentication flow', {
  maxNotes: 10,
  maxTokens: 8000
})

// Generate context for notes with specific tags
const tagContext = await client.generateContextForTags(['project', 'active'], true)
```

### Search with Filters

```typescript
import { SearchEngine } from 'obsidian.do'

// Create search engine
const searchEngine = new SearchEngine(client.vault, client.metadataCache)

// Search with folder and tag filters
const results = await searchEngine.search('api design', {
  limit: 20,
  filter: {
    folder: 'Projects',
    tags: ['active']
  }
})

for (const result of results) {
  console.log(`${result.file.path} (score: ${result.score})`)
  for (const match of result.matches) {
    console.log(`  Line ${match.line}: ${match.text.trim()}`)
  }
}

// Find notes by frontmatter property
const draftNotes = searchEngine.findByProperty('status', 'draft')
const publishedNotes = searchEngine.findByProperty('published', true)

// Find notes with missing property
const untaggedNotes = searchEngine.findByProperty('tags', undefined)

// Find notes linking to a specific note
const linkedNotes = searchEngine.findByLink('Resources/api-reference.md')
```

### Event Handling

```typescript
// Subscribe to vault events
client.on('create', (file) => {
  console.log('Created:', file.path)
})

client.on('modify', (file) => {
  console.log('Modified:', file.path)
})

client.on('delete', (file) => {
  console.log('Deleted:', file.path)
})

client.on('rename', ({ file, oldPath }) => {
  console.log(`Renamed: ${oldPath} -> ${file.path}`)
})

// Metadata cache events
client.metadataCache.on('changed', (file, metadata, oldHash) => {
  console.log('Metadata changed for:', file.path)
})

client.metadataCache.on('resolved', () => {
  console.log('All links resolved')
})

// Clean up when done
client.dispose()
```

### Memory Backend for Testing

```typescript
import { ObsidianClient } from 'obsidian.do'

// Create in-memory vault for tests
const client = new ObsidianClient({
  backend: 'memory',
  initialFiles: {
    'index.md': '# My Vault\n\nWelcome to my vault.\n\n[[Projects/todo]]',
    'Projects/todo.md': '---\ntags: [project]\n---\n\n# Todo\n\n- [ ] Task 1',
    'Daily/2025-01-05.md': '# Daily Note\n\n#journal\n\nToday I worked on [[Projects/todo]]'
  }
})

await client.initialize()

// Use as normal
const files = client.vault.getMarkdownFiles()
console.log(`Vault has ${files.length} files`)

// Verify link resolution
const backlinks = client.graph.getBacklinks('Projects/todo.md')
console.log(`todo.md has ${backlinks.length} backlinks`)
```

### REST API Backend

```typescript
import { ObsidianClient } from 'obsidian.do'

// Connect to a remote vault via REST API
const client = new ObsidianClient({
  backend: 'rest',
  restApiUrl: 'https://vault-api.example.com',
  restApiKey: 'your-api-key'
})

await client.initialize()

// Operations work the same way
const note = await client.getNote('Projects/remote-project.md')
await client.createNote('Notes/from-remote.md', '# Remote Note')
```

---

## Architecture

```
+-----------------------------------------------------------------+
|                      Client Application                          |
+-----------------------------------------------------------------+
                              |
+-----------------------------------------------------------------+
|                       ObsidianClient                             |
|  +------------+  +----------------+  +--------+  +--------+      |
|  |   Vault    |  | MetadataCache  |  | Graph  |  | Search |      |
|  +------------+  +----------------+  +--------+  +--------+      |
+-----------------------------------------------------------------+
                              |
+-----------------------------------------------------------------+
|                         Backend                                  |
|  +----------------+  +----------------+  +----------------+      |
|  |   Filesystem   |  |     Memory     |  |    REST API    |      |
|  +----------------+  +----------------+  +----------------+      |
+-----------------------------------------------------------------+
```

### Core Components

1. **Vault** — File operations with caching and event emission
2. **MetadataCache** — Parses and caches markdown metadata (frontmatter, links, tags, headings)
3. **Graph** — Knowledge graph operations (backlinks, neighbors, paths, clusters)
4. **Search** — Full-text and metadata search with scoring
5. **Backend** — Pluggable storage layer (filesystem, memory, REST)

---

## Configuration

### Client Options

```typescript
interface ClientOptions {
  // Backend type
  backend?: 'filesystem' | 'memory' | 'rest'

  // Filesystem backend
  vaultPath?: string

  // Memory backend
  initialFiles?: Record<string, string>

  // REST backend
  restApiUrl?: string
  restApiKey?: string
}
```

### Context Generation Options

```typescript
interface GenerateContextOptions {
  // How many hops to traverse from the source note
  depth?: number  // default: 0

  // Maximum tokens in output (approximate, 1 token ~= 4 chars)
  maxTokens?: number
}

interface QueryContextOptions {
  // Maximum notes to include
  maxNotes?: number  // default: 10

  // Maximum tokens in output
  maxTokens?: number
}
```

### Search Options

```typescript
interface SearchOptions {
  // Maximum results to return
  limit?: number

  // Filter criteria
  filter?: {
    folder?: string    // Only search in this folder
    tags?: string[]    // Only include notes with all these tags
  }
}
```

---

## MCP Server

obsidian.do includes a Model Context Protocol server for AI agent integration:

```bash
# Start MCP server
npx obsidian.do mcp --vault ~/Documents/MyVault

# Or use environment variable
OBSIDIAN_VAULT=~/Documents/MyVault npx obsidian.do mcp
```

### Available Tools

| Tool | Description |
|------|-------------|
| `vault_search` | Search notes by content with optional tag filters |
| `vault_list` | List files in the vault with folder filtering |
| `vault_context` | Get vault context by scope (all, folder:path, tag:name, recent:7d, linked:path) |
| `note_read` | Read a note with metadata and optional backlinks |
| `note_create` | Create a new note with content and frontmatter |
| `note_update` | Update note content |
| `note_append` | Append content to a note (end or after-frontmatter) |
| `frontmatter_update` | Update note frontmatter with merge option |
| `graph_backlinks` | Get backlinks to a note with context |
| `graph_forward_links` | Get outgoing links with unresolved detection |
| `graph_neighbors` | Find connected notes within a depth (incoming/outgoing/both) |

### Claude Desktop Configuration

Add to your Claude Desktop config (`~/.config/claude/claude_desktop_config.json` or `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": ["obsidian.do", "mcp", "--vault", "/path/to/vault"]
    }
  }
}
```

---

## CLI Reference

```bash
obsidian <command> [options]

Commands:
  search <query>      Search for notes in your vault
  read <path>         Read a note from your vault
  create <path>       Create a new note
  backlinks <path>    Show backlinks to a file
  list [folder]       List files in your vault
  tags                List all tags in your vault
  mcp                 Start MCP server (stdio mode)

Options:
  --vault <path>      Path to the vault directory
  --json              Output in JSON format
  --tags <tags>       Filter by tags (comma-separated)
  --content <text>    Content for new note
  --backlinks         Include backlinks in output
  --depth <n>         Traversal depth for backlinks
  --count             Show counts for tags command
  --help              Show help
  --version           Show version
```

---

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:run

# Type check
npm run typecheck

# Build
npm run build

# Lint
npm run lint
```

### Project Structure

```
src/
  client/       # ObsidianClient and high-level API
  vault/        # Vault and backend implementations
    vault.ts        # Core Vault class with file operations
    fs-backend.ts   # Filesystem backend
    memory-backend.ts # In-memory backend for testing
    rest-backend.ts # REST API client backend
  metadata/     # MetadataCache and markdown parsing
    cache.ts        # Metadata parsing and link resolution
  graph/        # Knowledge graph operations
    graph.ts        # Graph traversal, clusters, orphans
    engine.ts       # GraphEngine with detailed backlink info
  search/       # Search engine and fuzzy matching
    engine.ts       # SearchEngine with filters
    search.ts       # Fuzzy and simple search algorithms
  mcp/          # MCP server and tool handlers
    handlers.ts     # MCP tool implementations
  cli/          # CLI implementation
    cli.ts          # Command parsing and execution
  types.ts      # Type definitions
```

---

## License

MIT — see [LICENSE](LICENSE)

---

## Contributing

Contributions welcome! Please open an issue or submit a pull request.

---

<p align="center">
  <strong>Your second brain, now programmable.</strong>
</p>
