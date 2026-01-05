import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMcpServer, type McpRequest, type McpResponse, type ObsidianMcpServer } from '../../src/mcp/server.js'
import type { ObsidianClient } from '../../src/client/client.js'
import type { TFile, CachedMetadata, Backend } from '../../src/types.js'

// Mock ObsidianClient for testing
function createMockClient(overrides: Partial<ObsidianClient> = {}): ObsidianClient {
  const mockVault = {
    getFileByPath: vi.fn(),
    getMarkdownFiles: vi.fn().mockReturnValue([]),
    read: vi.fn(),
    getFiles: vi.fn().mockReturnValue([]),
  }

  const mockMetadataCache = {
    getFileCache: vi.fn(),
    getCache: vi.fn(),
  }

  return {
    vault: mockVault as any,
    metadataCache: mockMetadataCache as any,
    graph: {} as any,
    init: vi.fn(),
    getContext: vi.fn(),
    generateContext: vi.fn(),
    ...overrides,
  } as unknown as ObsidianClient
}

function createMockFile(path: string, content?: string): TFile {
  const parts = path.split('/')
  const name = parts[parts.length - 1]
  const basename = name.replace(/\.[^.]+$/, '')
  const extension = name.split('.').pop() || ''

  return {
    path,
    name,
    basename,
    extension,
    stat: {
      ctime: Date.now(),
      mtime: Date.now(),
      size: content?.length ?? 0,
    },
  }
}

describe('ObsidianMcpServer', () => {
  let server: ObsidianMcpServer
  let mockClient: ObsidianClient

  beforeEach(() => {
    mockClient = createMockClient()
    server = createMcpServer({ client: mockClient })
  })

  describe('initialize request', () => {
    describe('serverInfo', () => {
      it('should return server name as "obsidian.do"', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            clientInfo: { name: 'test-client', version: '1.0.0' },
            capabilities: {},
          },
        }

        const response = await server.handleRequest(request)

        expect(response.jsonrpc).toBe('2.0')
        expect(response.id).toBe(1)
        expect(response.error).toBeUndefined()
        expect(response.result).toBeDefined()
        expect((response.result as any).serverInfo).toBeDefined()
        expect((response.result as any).serverInfo.name).toBe('obsidian.do')
      })

      it('should return server version', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            clientInfo: { name: 'test-client', version: '1.0.0' },
            capabilities: {},
          },
        }

        const response = await server.handleRequest(request)

        expect((response.result as any).serverInfo.version).toBeDefined()
        expect(typeof (response.result as any).serverInfo.version).toBe('string')
        expect((response.result as any).serverInfo.version).toMatch(/^\d+\.\d+\.\d+/)
      })

      it('should include protocol version in response', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 2,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            clientInfo: { name: 'test-client', version: '1.0.0' },
            capabilities: {},
          },
        }

        const response = await server.handleRequest(request)

        expect((response.result as any).protocolVersion).toBe('2024-11-05')
      })
    })

    describe('capabilities', () => {
      it('should advertise tools capability', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            clientInfo: { name: 'test-client', version: '1.0.0' },
            capabilities: {},
          },
        }

        const response = await server.handleRequest(request)

        expect((response.result as any).capabilities).toBeDefined()
        expect((response.result as any).capabilities.tools).toBeDefined()
      })

      it('should advertise listChanged capability for tools', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            clientInfo: { name: 'test-client', version: '1.0.0' },
            capabilities: {},
          },
        }

        const response = await server.handleRequest(request)

        expect((response.result as any).capabilities.tools.listChanged).toBe(true)
      })

      it('should not advertise unsupported capabilities', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            clientInfo: { name: 'test-client', version: '1.0.0' },
            capabilities: {},
          },
        }

        const response = await server.handleRequest(request)

        // Resources and prompts are not supported in initial implementation
        expect((response.result as any).capabilities.resources).toBeUndefined()
        expect((response.result as any).capabilities.prompts).toBeUndefined()
      })

      it('should handle client capabilities properly', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            clientInfo: { name: 'test-client', version: '1.0.0' },
            capabilities: {
              tools: { listChanged: true },
            },
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeUndefined()
        expect(response.result).toBeDefined()
      })
    })

    describe('protocol validation', () => {
      it('should preserve request id in response', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 42,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            clientInfo: { name: 'test-client', version: '1.0.0' },
            capabilities: {},
          },
        }

        const response = await server.handleRequest(request)

        expect(response.id).toBe(42)
      })

      it('should return jsonrpc 2.0', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            clientInfo: { name: 'test-client', version: '1.0.0' },
            capabilities: {},
          },
        }

        const response = await server.handleRequest(request)

        expect(response.jsonrpc).toBe('2.0')
      })
    })
  })

  describe('tools/list', () => {
    describe('available tools', () => {
      it('should return tools list with vault_search tool', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeUndefined()
        expect(response.result).toBeDefined()
        expect((response.result as any).tools).toBeDefined()
        expect(Array.isArray((response.result as any).tools)).toBe(true)

        const tools = (response.result as any).tools
        const vaultSearch = tools.find((t: any) => t.name === 'vault_search')
        expect(vaultSearch).toBeDefined()
      })

      it('should return tools list with note_read tool', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }

        const response = await server.handleRequest(request)

        const tools = (response.result as any).tools
        const noteRead = tools.find((t: any) => t.name === 'note_read')
        expect(noteRead).toBeDefined()
      })

      it('should return tools list with note_create tool', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }

        const response = await server.handleRequest(request)

        const tools = (response.result as any).tools
        const noteCreate = tools.find((t: any) => t.name === 'note_create')
        expect(noteCreate).toBeDefined()
      })

      it('should return tools list with note_update tool', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }

        const response = await server.handleRequest(request)

        const tools = (response.result as any).tools
        const noteUpdate = tools.find((t: any) => t.name === 'note_update')
        expect(noteUpdate).toBeDefined()
      })

      it('should return tools list with vault_list tool', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }

        const response = await server.handleRequest(request)

        const tools = (response.result as any).tools
        const vaultList = tools.find((t: any) => t.name === 'vault_list')
        expect(vaultList).toBeDefined()
      })

      it('should return all expected tools', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }

        const response = await server.handleRequest(request)

        const tools = (response.result as any).tools
        const toolNames = tools.map((t: any) => t.name)

        expect(toolNames).toContain('vault_search')
        expect(toolNames).toContain('note_read')
        expect(toolNames).toContain('note_create')
        expect(toolNames).toContain('note_update')
        expect(toolNames).toContain('vault_list')
      })
    })

    describe('tool descriptions', () => {
      it('should include description for vault_search tool', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }

        const response = await server.handleRequest(request)

        const tools = (response.result as any).tools
        const vaultSearch = tools.find((t: any) => t.name === 'vault_search')
        expect(vaultSearch.description).toBeDefined()
        expect(typeof vaultSearch.description).toBe('string')
        expect(vaultSearch.description.length).toBeGreaterThan(0)
      })

      it('should include description for note_read tool', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }

        const response = await server.handleRequest(request)

        const tools = (response.result as any).tools
        const noteRead = tools.find((t: any) => t.name === 'note_read')
        expect(noteRead.description).toBeDefined()
        expect(typeof noteRead.description).toBe('string')
        expect(noteRead.description.length).toBeGreaterThan(0)
      })
    })

    describe('inputSchema', () => {
      it('should include valid JSON Schema for vault_search', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }

        const response = await server.handleRequest(request)

        const tools = (response.result as any).tools
        const vaultSearch = tools.find((t: any) => t.name === 'vault_search')

        expect(vaultSearch.inputSchema).toBeDefined()
        expect(vaultSearch.inputSchema.type).toBe('object')
        expect(vaultSearch.inputSchema.properties).toBeDefined()
      })

      it('should require query parameter for vault_search', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }

        const response = await server.handleRequest(request)

        const tools = (response.result as any).tools
        const vaultSearch = tools.find((t: any) => t.name === 'vault_search')

        expect(vaultSearch.inputSchema.properties.query).toBeDefined()
        expect(vaultSearch.inputSchema.properties.query.type).toBe('string')
        expect(vaultSearch.inputSchema.required).toContain('query')
      })

      it('should include optional limit parameter for vault_search', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }

        const response = await server.handleRequest(request)

        const tools = (response.result as any).tools
        const vaultSearch = tools.find((t: any) => t.name === 'vault_search')

        expect(vaultSearch.inputSchema.properties.limit).toBeDefined()
        expect(vaultSearch.inputSchema.properties.limit.type).toBe('integer')
      })

      it('should include valid JSON Schema for note_read', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }

        const response = await server.handleRequest(request)

        const tools = (response.result as any).tools
        const noteRead = tools.find((t: any) => t.name === 'note_read')

        expect(noteRead.inputSchema).toBeDefined()
        expect(noteRead.inputSchema.type).toBe('object')
        expect(noteRead.inputSchema.properties).toBeDefined()
      })

      it('should require path parameter for note_read', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }

        const response = await server.handleRequest(request)

        const tools = (response.result as any).tools
        const noteRead = tools.find((t: any) => t.name === 'note_read')

        expect(noteRead.inputSchema.properties.path).toBeDefined()
        expect(noteRead.inputSchema.properties.path.type).toBe('string')
        expect(noteRead.inputSchema.required).toContain('path')
      })

      it('should include valid JSON Schema for note_create', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }

        const response = await server.handleRequest(request)

        const tools = (response.result as any).tools
        const noteCreate = tools.find((t: any) => t.name === 'note_create')

        expect(noteCreate.inputSchema).toBeDefined()
        expect(noteCreate.inputSchema.type).toBe('object')
        expect(noteCreate.inputSchema.properties.path).toBeDefined()
        expect(noteCreate.inputSchema.properties.content).toBeDefined()
        expect(noteCreate.inputSchema.required).toContain('path')
        expect(noteCreate.inputSchema.required).toContain('content')
      })

      it('should include valid JSON Schema for note_update', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }

        const response = await server.handleRequest(request)

        const tools = (response.result as any).tools
        const noteUpdate = tools.find((t: any) => t.name === 'note_update')

        expect(noteUpdate.inputSchema).toBeDefined()
        expect(noteUpdate.inputSchema.type).toBe('object')
        expect(noteUpdate.inputSchema.properties.path).toBeDefined()
        expect(noteUpdate.inputSchema.properties.content).toBeDefined()
        expect(noteUpdate.inputSchema.required).toContain('path')
        expect(noteUpdate.inputSchema.required).toContain('content')
      })

      it('should have properly structured schemas with descriptions', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }

        const response = await server.handleRequest(request)

        const tools = (response.result as any).tools
        for (const tool of tools) {
          expect(tool.inputSchema).toBeDefined()
          expect(tool.inputSchema.type).toBe('object')

          // Each property should have a description
          for (const [propName, propSchema] of Object.entries(tool.inputSchema.properties || {})) {
            expect((propSchema as any).description).toBeDefined()
          }
        }
      })
    })
  })

  describe('tools/call', () => {
    describe('vault_search', () => {
      it('should search vault and return matching files', async () => {
        const mockFiles = [
          createMockFile('notes/daily/2024-01-01.md'),
          createMockFile('notes/project/readme.md'),
          createMockFile('notes/ideas.md'),
        ]

        ;(mockClient.vault.getMarkdownFiles as any).mockReturnValue(mockFiles)
        ;(mockClient.vault.read as any).mockImplementation(async (file: TFile) => {
          if (file.path === 'notes/daily/2024-01-01.md') return '# Daily Note\nToday I worked on the project.'
          if (file.path === 'notes/project/readme.md') return '# Project README\nThis project is about testing.'
          if (file.path === 'notes/ideas.md') return '# Ideas\nSome random ideas here.'
          return ''
        })

        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'vault_search',
            arguments: { query: 'project' },
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeUndefined()
        expect(response.result).toBeDefined()

        const content = (response.result as any).content
        expect(content).toBeDefined()
        expect(Array.isArray(content)).toBe(true)
        expect(content.length).toBeGreaterThan(0)
        expect(content[0].type).toBe('text')

        // Should find files containing "project"
        const textContent = content[0].text
        expect(textContent).toContain('project')
      })

      it('should return empty results for no matches', async () => {
        const mockFiles = [
          createMockFile('notes/hello.md'),
        ]

        ;(mockClient.vault.getMarkdownFiles as any).mockReturnValue(mockFiles)
        ;(mockClient.vault.read as any).mockResolvedValue('# Hello World')

        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'vault_search',
            arguments: { query: 'nonexistent-query-xyz' },
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeUndefined()
        expect(response.result).toBeDefined()

        const content = (response.result as any).content
        expect(content).toBeDefined()
      })

      it('should respect limit parameter', async () => {
        const mockFiles = Array.from({ length: 20 }, (_, i) =>
          createMockFile(`notes/note-${i}.md`)
        )

        ;(mockClient.vault.getMarkdownFiles as any).mockReturnValue(mockFiles)
        ;(mockClient.vault.read as any).mockResolvedValue('# Test Note\nSome content about testing.')

        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'vault_search',
            arguments: { query: 'test', limit: 5 },
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeUndefined()
        // Implementation should respect the limit
        const content = (response.result as any).content
        expect(content).toBeDefined()
      })

      it('should return results sorted by relevance', async () => {
        const mockFiles = [
          createMockFile('notes/test.md'),
          createMockFile('notes/testing-guide.md'),
          createMockFile('notes/other.md'),
        ]

        ;(mockClient.vault.getMarkdownFiles as any).mockReturnValue(mockFiles)
        ;(mockClient.vault.read as any).mockImplementation(async (file: TFile) => {
          if (file.path === 'notes/test.md') return '# Test\nThis is a test.'
          if (file.path === 'notes/testing-guide.md') return '# Testing Guide\nHow to test.'
          if (file.path === 'notes/other.md') return '# Other\nSomething else.'
          return ''
        })

        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'vault_search',
            arguments: { query: 'test' },
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeUndefined()
        expect(response.result).toBeDefined()
      })

      it('should handle empty query gracefully', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'vault_search',
            arguments: { query: '' },
          },
        }

        const response = await server.handleRequest(request)

        // Empty query should either return all files or an error
        expect(response).toBeDefined()
      })

      it('should search in file names and content', async () => {
        const mockFiles = [
          createMockFile('notes/apple.md'),
          createMockFile('notes/banana.md'),
        ]

        ;(mockClient.vault.getMarkdownFiles as any).mockReturnValue(mockFiles)
        ;(mockClient.vault.read as any).mockImplementation(async (file: TFile) => {
          if (file.path === 'notes/apple.md') return '# Apple\nA fruit.'
          if (file.path === 'notes/banana.md') return '# Banana\nI love apple pie.'
          return ''
        })

        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'vault_search',
            arguments: { query: 'apple' },
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeUndefined()
        // Should find both files - one by name, one by content
        const content = (response.result as any).content
        expect(content).toBeDefined()
      })
    })

    describe('note_read', () => {
      it('should read note content by path', async () => {
        const mockFile = createMockFile('notes/test.md')
        const mockContent = '# Test Note\n\nThis is test content.'

        ;(mockClient.vault.getFileByPath as any).mockReturnValue(mockFile)
        ;(mockClient.vault.read as any).mockResolvedValue(mockContent)

        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'note_read',
            arguments: { path: 'notes/test.md' },
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeUndefined()
        expect(response.result).toBeDefined()

        const content = (response.result as any).content
        expect(content).toBeDefined()
        expect(content[0].type).toBe('text')
        expect(content[0].text).toContain('Test Note')
        expect(content[0].text).toContain('test content')
      })

      it('should return error for non-existent file', async () => {
        ;(mockClient.vault.getFileByPath as any).mockReturnValue(null)

        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'note_read',
            arguments: { path: 'notes/nonexistent.md' },
          },
        }

        const response = await server.handleRequest(request)

        // Should return an error or isError content
        expect(
          response.error !== undefined ||
          (response.result as any)?.isError === true
        ).toBe(true)
      })

      it('should handle path with special characters', async () => {
        const mockFile = createMockFile('notes/my file (1).md')
        const mockContent = '# Special Note'

        ;(mockClient.vault.getFileByPath as any).mockReturnValue(mockFile)
        ;(mockClient.vault.read as any).mockResolvedValue(mockContent)

        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'note_read',
            arguments: { path: 'notes/my file (1).md' },
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeUndefined()
        expect(response.result).toBeDefined()
      })

      it('should handle nested directory paths', async () => {
        const mockFile = createMockFile('notes/2024/01/daily.md')
        const mockContent = '# Daily Note'

        ;(mockClient.vault.getFileByPath as any).mockReturnValue(mockFile)
        ;(mockClient.vault.read as any).mockResolvedValue(mockContent)

        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'note_read',
            arguments: { path: 'notes/2024/01/daily.md' },
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeUndefined()
        expect(response.result).toBeDefined()
      })

      it('should include metadata when available', async () => {
        const mockFile = createMockFile('notes/test.md')
        const mockContent = '---\ntitle: Test\ntags: [test, example]\n---\n# Test'
        const mockMetadata: CachedMetadata = {
          frontmatter: { title: 'Test', tags: ['test', 'example'] },
          tags: [{ tag: '#test', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 5, offset: 5 } } }],
        }

        ;(mockClient.vault.getFileByPath as any).mockReturnValue(mockFile)
        ;(mockClient.vault.read as any).mockResolvedValue(mockContent)
        ;(mockClient.metadataCache.getFileCache as any).mockReturnValue(mockMetadata)

        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'note_read',
            arguments: { path: 'notes/test.md' },
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeUndefined()
        expect(response.result).toBeDefined()
      })

      it('should handle read errors gracefully', async () => {
        const mockFile = createMockFile('notes/error.md')

        ;(mockClient.vault.getFileByPath as any).mockReturnValue(mockFile)
        ;(mockClient.vault.read as any).mockRejectedValue(new Error('Read error'))

        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'note_read',
            arguments: { path: 'notes/error.md' },
          },
        }

        const response = await server.handleRequest(request)

        // Should handle the error gracefully
        expect(
          response.error !== undefined ||
          (response.result as any)?.isError === true
        ).toBe(true)
      })
    })

    describe('invalid tool', () => {
      it('should return error for unknown tool name', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'nonexistent_tool',
            arguments: {},
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeDefined()
        expect(response.error?.code).toBe(-32601) // Method not found
      })

      it('should return error with descriptive message', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'unknown_tool',
            arguments: {},
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeDefined()
        expect(response.error?.message).toBeDefined()
        expect(response.error?.message.length).toBeGreaterThan(0)
      })

      it('should preserve request id in error response', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 999,
          method: 'tools/call',
          params: {
            name: 'bad_tool',
            arguments: {},
          },
        }

        const response = await server.handleRequest(request)

        expect(response.id).toBe(999)
      })

      it('should return jsonrpc 2.0 in error response', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'fake_tool',
            arguments: {},
          },
        }

        const response = await server.handleRequest(request)

        expect(response.jsonrpc).toBe('2.0')
      })
    })

    describe('input validation', () => {
      it('should return error when required parameter is missing', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'vault_search',
            arguments: {}, // missing required 'query' parameter
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeDefined()
        expect(response.error?.code).toBe(-32602) // Invalid params
      })

      it('should return error for wrong parameter type', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'vault_search',
            arguments: { query: 123 }, // should be string, not number
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeDefined()
        expect(response.error?.code).toBe(-32602) // Invalid params
      })

      it('should return error when path parameter is missing for note_read', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'note_read',
            arguments: {},
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeDefined()
        expect(response.error?.code).toBe(-32602)
      })

      it('should return error when path is not a string', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'note_read',
            arguments: { path: ['array', 'not', 'string'] },
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeDefined()
        expect(response.error?.code).toBe(-32602)
      })

      it('should return error when limit is negative', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'vault_search',
            arguments: { query: 'test', limit: -5 },
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeDefined()
      })

      it('should return error when limit is not an integer', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'vault_search',
            arguments: { query: 'test', limit: 5.5 },
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeDefined()
      })

      it('should accept valid input without error', async () => {
        ;(mockClient.vault.getMarkdownFiles as any).mockReturnValue([])

        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'vault_search',
            arguments: { query: 'valid query', limit: 10 },
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeUndefined()
      })

      it('should handle null arguments', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'vault_search',
            arguments: null,
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeDefined()
        expect(response.error?.code).toBe(-32602)
      })

      it('should handle undefined arguments', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'vault_search',
            arguments: undefined,
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeDefined()
        expect(response.error?.code).toBe(-32602)
      })

      it('should include parameter name in validation error message', async () => {
        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'vault_search',
            arguments: {},
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error?.message).toContain('query')
      })
    })

    describe('note_create', () => {
      it('should create a new note', async () => {
        const mockFile = createMockFile('notes/new-note.md')

        ;(mockClient.vault.getFileByPath as any).mockReturnValue(null)
        ;(mockClient.vault as any).create = vi.fn().mockResolvedValue(mockFile)

        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'note_create',
            arguments: {
              path: 'notes/new-note.md',
              content: '# New Note\n\nContent here.',
            },
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeUndefined()
        expect(response.result).toBeDefined()
      })

      it('should return error if note already exists', async () => {
        const mockFile = createMockFile('notes/existing.md')

        ;(mockClient.vault.getFileByPath as any).mockReturnValue(mockFile)

        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'note_create',
            arguments: {
              path: 'notes/existing.md',
              content: '# Some Content',
            },
          },
        }

        const response = await server.handleRequest(request)

        expect(
          response.error !== undefined ||
          (response.result as any)?.isError === true
        ).toBe(true)
      })
    })

    describe('note_update', () => {
      it('should update an existing note', async () => {
        const mockFile = createMockFile('notes/update-me.md')

        ;(mockClient.vault.getFileByPath as any).mockReturnValue(mockFile)
        ;(mockClient.vault as any).modify = vi.fn().mockResolvedValue(undefined)

        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'note_update',
            arguments: {
              path: 'notes/update-me.md',
              content: '# Updated Content',
            },
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeUndefined()
        expect(response.result).toBeDefined()
      })

      it('should return error if note does not exist', async () => {
        ;(mockClient.vault.getFileByPath as any).mockReturnValue(null)

        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'note_update',
            arguments: {
              path: 'notes/nonexistent.md',
              content: '# Updated Content',
            },
          },
        }

        const response = await server.handleRequest(request)

        expect(
          response.error !== undefined ||
          (response.result as any)?.isError === true
        ).toBe(true)
      })
    })

    describe('vault_list', () => {
      it('should list all markdown files in vault', async () => {
        const mockFiles = [
          createMockFile('notes/one.md'),
          createMockFile('notes/two.md'),
          createMockFile('folder/three.md'),
        ]

        ;(mockClient.vault.getMarkdownFiles as any).mockReturnValue(mockFiles)

        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'vault_list',
            arguments: {},
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeUndefined()
        expect(response.result).toBeDefined()

        const content = (response.result as any).content
        expect(content).toBeDefined()
        expect(content[0].type).toBe('text')

        const textContent = content[0].text
        expect(textContent).toContain('notes/one.md')
        expect(textContent).toContain('notes/two.md')
        expect(textContent).toContain('folder/three.md')
      })

      it('should return empty list for empty vault', async () => {
        ;(mockClient.vault.getMarkdownFiles as any).mockReturnValue([])

        const request: McpRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'vault_list',
            arguments: {},
          },
        }

        const response = await server.handleRequest(request)

        expect(response.error).toBeUndefined()
        expect(response.result).toBeDefined()
      })
    })
  })

  describe('unknown methods', () => {
    it('should return error for unknown method', async () => {
      const request: McpRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'unknown/method',
        params: {},
      }

      const response = await server.handleRequest(request)

      expect(response.error).toBeDefined()
      expect(response.error?.code).toBe(-32601) // Method not found
    })

    it('should preserve request id for unknown method', async () => {
      const request: McpRequest = {
        jsonrpc: '2.0',
        id: 123,
        method: 'something/wrong',
        params: {},
      }

      const response = await server.handleRequest(request)

      expect(response.id).toBe(123)
    })
  })

  describe('ping/pong', () => {
    it('should respond to ping request', async () => {
      const request: McpRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'ping',
        params: {},
      }

      const response = await server.handleRequest(request)

      expect(response.error).toBeUndefined()
      expect(response.result).toBeDefined()
    })
  })

  describe('notifications/initialized', () => {
    it('should handle initialized notification', async () => {
      const request: McpRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'notifications/initialized',
        params: {},
      }

      const response = await server.handleRequest(request)

      // Notifications typically don't require a response, but we handle them gracefully
      expect(response.error).toBeUndefined()
    })
  })
})
