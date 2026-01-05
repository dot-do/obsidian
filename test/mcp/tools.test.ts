import { describe, it, expect, beforeEach } from 'vitest'
import { obsidianTools, type McpTool } from '../../src/mcp/tools.js'

/**
 * TDD Tests for MCP Tool Definitions
 *
 * These tests define the expected structure and behavior of the obsidianTools array.
 * Currently in RED phase - all tests should fail until implementation is complete.
 */

// Required tools that must be defined
const REQUIRED_TOOLS = [
  'vault_search',
  'vault_list',
  'note_read',
  'note_create',
  'note_update',
  'note_append',
  'frontmatter_update',
  'graph_backlinks',
  'graph_forward_links',
  'graph_neighbors',
  'vault_context',
] as const

// Tools that should be read-only (do not modify vault state)
const READ_ONLY_TOOLS = [
  'vault_search',
  'vault_list',
  'note_read',
  'graph_backlinks',
  'graph_forward_links',
  'graph_neighbors',
  'vault_context',
]

// Tools that can potentially be destructive (modify or delete data)
const DESTRUCTIVE_TOOLS = [
  'note_update',
  'frontmatter_update',
]

// Tools that create new data (not destructive, but write operations)
const WRITE_TOOLS = [
  'note_create',
  'note_append',
]

describe('obsidianTools', () => {
  describe('tool array structure', () => {
    it('should export obsidianTools as an array', () => {
      expect(Array.isArray(obsidianTools)).toBe(true)
    })

    it('should have the correct number of tools', () => {
      expect(obsidianTools.length).toBe(REQUIRED_TOOLS.length)
    })

    it('should have unique tool names', () => {
      const names = obsidianTools.map((t) => t.name)
      const uniqueNames = new Set(names)
      expect(uniqueNames.size).toBe(names.length)
    })
  })

  describe('required tools', () => {
    it.each(REQUIRED_TOOLS)('should define %s tool', (toolName) => {
      const tool = obsidianTools.find((t) => t.name === toolName)
      expect(tool).toBeDefined()
    })

    it('should define all required tools', () => {
      const toolNames = obsidianTools.map((t) => t.name)
      for (const required of REQUIRED_TOOLS) {
        expect(toolNames).toContain(required)
      }
    })
  })

  describe('input schemas', () => {
    describe('schema structure', () => {
      it.each(REQUIRED_TOOLS)('%s should have inputSchema with type "object"', (toolName) => {
        const tool = obsidianTools.find((t) => t.name === toolName)
        expect(tool?.inputSchema).toBeDefined()
        expect(tool?.inputSchema.type).toBe('object')
      })

      it.each(REQUIRED_TOOLS)('%s should have inputSchema.properties as object', (toolName) => {
        const tool = obsidianTools.find((t) => t.name === toolName)
        expect(tool?.inputSchema.properties).toBeDefined()
        expect(typeof tool?.inputSchema.properties).toBe('object')
      })
    })

    describe('vault_search schema', () => {
      let tool: McpTool | undefined

      beforeEach(() => {
        tool = obsidianTools.find((t) => t.name === 'vault_search')
      })

      it('should have query property of type string', () => {
        expect(tool?.inputSchema.properties.query).toBeDefined()
        expect((tool?.inputSchema.properties.query as any)?.type).toBe('string')
      })

      it('should require query parameter', () => {
        expect(tool?.inputSchema.required).toContain('query')
      })

      it('should have optional limit property of type integer', () => {
        expect(tool?.inputSchema.properties.limit).toBeDefined()
        expect((tool?.inputSchema.properties.limit as any)?.type).toBe('integer')
      })

      it('should have optional filter property', () => {
        expect(tool?.inputSchema.properties.filter).toBeDefined()
      })

      it('should have description for query property', () => {
        expect((tool?.inputSchema.properties.query as any)?.description).toBeDefined()
        expect((tool?.inputSchema.properties.query as any)?.description.length).toBeGreaterThan(10)
      })
    })

    describe('vault_list schema', () => {
      let tool: McpTool | undefined

      beforeEach(() => {
        tool = obsidianTools.find((t) => t.name === 'vault_list')
      })

      it('should have optional folder property of type string', () => {
        expect(tool?.inputSchema.properties.folder).toBeDefined()
        expect((tool?.inputSchema.properties.folder as any)?.type).toBe('string')
      })

      it('should have optional recursive property of type boolean', () => {
        expect(tool?.inputSchema.properties.recursive).toBeDefined()
        expect((tool?.inputSchema.properties.recursive as any)?.type).toBe('boolean')
      })

      it('should not require any parameters', () => {
        expect(tool?.inputSchema.required).toBeUndefined()
      })
    })

    describe('note_read schema', () => {
      let tool: McpTool | undefined

      beforeEach(() => {
        tool = obsidianTools.find((t) => t.name === 'note_read')
      })

      it('should have path property of type string', () => {
        expect(tool?.inputSchema.properties.path).toBeDefined()
        expect((tool?.inputSchema.properties.path as any)?.type).toBe('string')
      })

      it('should require path parameter', () => {
        expect(tool?.inputSchema.required).toContain('path')
      })

      it('should have optional includeMetadata property of type boolean', () => {
        expect(tool?.inputSchema.properties.includeMetadata).toBeDefined()
        expect((tool?.inputSchema.properties.includeMetadata as any)?.type).toBe('boolean')
      })
    })

    describe('note_create schema', () => {
      let tool: McpTool | undefined

      beforeEach(() => {
        tool = obsidianTools.find((t) => t.name === 'note_create')
      })

      it('should have path property of type string', () => {
        expect(tool?.inputSchema.properties.path).toBeDefined()
        expect((tool?.inputSchema.properties.path as any)?.type).toBe('string')
      })

      it('should have content property of type string', () => {
        expect(tool?.inputSchema.properties.content).toBeDefined()
        expect((tool?.inputSchema.properties.content as any)?.type).toBe('string')
      })

      it('should require path and content parameters', () => {
        expect(tool?.inputSchema.required).toContain('path')
        expect(tool?.inputSchema.required).toContain('content')
      })

      it('should have optional frontmatter property', () => {
        expect(tool?.inputSchema.properties.frontmatter).toBeDefined()
      })
    })

    describe('note_update schema', () => {
      let tool: McpTool | undefined

      beforeEach(() => {
        tool = obsidianTools.find((t) => t.name === 'note_update')
      })

      it('should have path property of type string', () => {
        expect(tool?.inputSchema.properties.path).toBeDefined()
        expect((tool?.inputSchema.properties.path as any)?.type).toBe('string')
      })

      it('should have content property of type string', () => {
        expect(tool?.inputSchema.properties.content).toBeDefined()
        expect((tool?.inputSchema.properties.content as any)?.type).toBe('string')
      })

      it('should require path and content parameters', () => {
        expect(tool?.inputSchema.required).toContain('path')
        expect(tool?.inputSchema.required).toContain('content')
      })
    })

    describe('note_append schema', () => {
      let tool: McpTool | undefined

      beforeEach(() => {
        tool = obsidianTools.find((t) => t.name === 'note_append')
      })

      it('should have path property of type string', () => {
        expect(tool?.inputSchema.properties.path).toBeDefined()
        expect((tool?.inputSchema.properties.path as any)?.type).toBe('string')
      })

      it('should have content property of type string', () => {
        expect(tool?.inputSchema.properties.content).toBeDefined()
        expect((tool?.inputSchema.properties.content as any)?.type).toBe('string')
      })

      it('should require path and content parameters', () => {
        expect(tool?.inputSchema.required).toContain('path')
        expect(tool?.inputSchema.required).toContain('content')
      })

      it('should have optional position property', () => {
        expect(tool?.inputSchema.properties.position).toBeDefined()
      })
    })

    describe('frontmatter_update schema', () => {
      let tool: McpTool | undefined

      beforeEach(() => {
        tool = obsidianTools.find((t) => t.name === 'frontmatter_update')
      })

      it('should have path property of type string', () => {
        expect(tool?.inputSchema.properties.path).toBeDefined()
        expect((tool?.inputSchema.properties.path as any)?.type).toBe('string')
      })

      it('should have frontmatter property of type object', () => {
        expect(tool?.inputSchema.properties.frontmatter).toBeDefined()
        expect((tool?.inputSchema.properties.frontmatter as any)?.type).toBe('object')
      })

      it('should require path and frontmatter parameters', () => {
        expect(tool?.inputSchema.required).toContain('path')
        expect(tool?.inputSchema.required).toContain('frontmatter')
      })

      it('should have optional merge property of type boolean', () => {
        expect(tool?.inputSchema.properties.merge).toBeDefined()
        expect((tool?.inputSchema.properties.merge as any)?.type).toBe('boolean')
      })
    })

    describe('graph_backlinks schema', () => {
      let tool: McpTool | undefined

      beforeEach(() => {
        tool = obsidianTools.find((t) => t.name === 'graph_backlinks')
      })

      it('should have path property of type string', () => {
        expect(tool?.inputSchema.properties.path).toBeDefined()
        expect((tool?.inputSchema.properties.path as any)?.type).toBe('string')
      })

      it('should require path parameter', () => {
        expect(tool?.inputSchema.required).toContain('path')
      })

      it('should have optional includeContext property of type boolean', () => {
        expect(tool?.inputSchema.properties.includeContext).toBeDefined()
        expect((tool?.inputSchema.properties.includeContext as any)?.type).toBe('boolean')
      })
    })

    describe('graph_forward_links schema', () => {
      let tool: McpTool | undefined

      beforeEach(() => {
        tool = obsidianTools.find((t) => t.name === 'graph_forward_links')
      })

      it('should have path property of type string', () => {
        expect(tool?.inputSchema.properties.path).toBeDefined()
        expect((tool?.inputSchema.properties.path as any)?.type).toBe('string')
      })

      it('should require path parameter', () => {
        expect(tool?.inputSchema.required).toContain('path')
      })

      it('should have optional includeUnresolved property of type boolean', () => {
        expect(tool?.inputSchema.properties.includeUnresolved).toBeDefined()
        expect((tool?.inputSchema.properties.includeUnresolved as any)?.type).toBe('boolean')
      })
    })

    describe('graph_neighbors schema', () => {
      let tool: McpTool | undefined

      beforeEach(() => {
        tool = obsidianTools.find((t) => t.name === 'graph_neighbors')
      })

      it('should have path property of type string', () => {
        expect(tool?.inputSchema.properties.path).toBeDefined()
        expect((tool?.inputSchema.properties.path as any)?.type).toBe('string')
      })

      it('should require path parameter', () => {
        expect(tool?.inputSchema.required).toContain('path')
      })

      it('should have optional depth property of type integer', () => {
        expect(tool?.inputSchema.properties.depth).toBeDefined()
        expect((tool?.inputSchema.properties.depth as any)?.type).toBe('integer')
      })

      it('should have optional direction property', () => {
        expect(tool?.inputSchema.properties.direction).toBeDefined()
      })
    })

    describe('vault_context schema', () => {
      let tool: McpTool | undefined

      beforeEach(() => {
        tool = obsidianTools.find((t) => t.name === 'vault_context')
      })

      it('should have scope property of type string', () => {
        expect(tool?.inputSchema.properties.scope).toBeDefined()
        expect((tool?.inputSchema.properties.scope as any)?.type).toBe('string')
      })

      it('should require scope parameter', () => {
        expect(tool?.inputSchema.required).toContain('scope')
      })

      it('should have optional maxTokens property of type integer', () => {
        expect(tool?.inputSchema.properties.maxTokens).toBeDefined()
        expect((tool?.inputSchema.properties.maxTokens as any)?.type).toBe('integer')
      })
    })
  })

  describe('descriptions', () => {
    it.each(REQUIRED_TOOLS)('%s should have a description', (toolName) => {
      const tool = obsidianTools.find((t) => t.name === toolName)
      expect(tool?.description).toBeDefined()
      expect(typeof tool?.description).toBe('string')
    })

    it.each(REQUIRED_TOOLS)('%s should have description longer than 10 characters', (toolName) => {
      const tool = obsidianTools.find((t) => t.name === toolName)
      expect(tool?.description.length).toBeGreaterThan(10)
    })

    it.each(REQUIRED_TOOLS)('%s description should not be empty or whitespace only', (toolName) => {
      const tool = obsidianTools.find((t) => t.name === toolName)
      expect(tool?.description.trim().length).toBeGreaterThan(0)
    })

    describe('specific description content', () => {
      it('vault_search description should mention searching', () => {
        const tool = obsidianTools.find((t) => t.name === 'vault_search')
        expect(tool?.description.toLowerCase()).toMatch(/search/)
      })

      it('vault_list description should mention listing or files', () => {
        const tool = obsidianTools.find((t) => t.name === 'vault_list')
        expect(tool?.description.toLowerCase()).toMatch(/list|files/)
      })

      it('note_read description should mention reading', () => {
        const tool = obsidianTools.find((t) => t.name === 'note_read')
        expect(tool?.description.toLowerCase()).toMatch(/read/)
      })

      it('note_create description should mention creating', () => {
        const tool = obsidianTools.find((t) => t.name === 'note_create')
        expect(tool?.description.toLowerCase()).toMatch(/create/)
      })

      it('note_update description should mention updating or modifying', () => {
        const tool = obsidianTools.find((t) => t.name === 'note_update')
        expect(tool?.description.toLowerCase()).toMatch(/update|modify/)
      })

      it('note_append description should mention appending', () => {
        const tool = obsidianTools.find((t) => t.name === 'note_append')
        expect(tool?.description.toLowerCase()).toMatch(/append/)
      })

      it('frontmatter_update description should mention frontmatter or metadata', () => {
        const tool = obsidianTools.find((t) => t.name === 'frontmatter_update')
        expect(tool?.description.toLowerCase()).toMatch(/frontmatter|metadata/)
      })

      it('graph_backlinks description should mention backlinks', () => {
        const tool = obsidianTools.find((t) => t.name === 'graph_backlinks')
        expect(tool?.description.toLowerCase()).toMatch(/backlink/)
      })

      it('graph_forward_links description should mention links or outgoing', () => {
        const tool = obsidianTools.find((t) => t.name === 'graph_forward_links')
        expect(tool?.description.toLowerCase()).toMatch(/link|outgoing|forward/)
      })

      it('graph_neighbors description should mention neighbors or graph', () => {
        const tool = obsidianTools.find((t) => t.name === 'graph_neighbors')
        expect(tool?.description.toLowerCase()).toMatch(/neighbor|graph/)
      })

      it('vault_context description should mention context', () => {
        const tool = obsidianTools.find((t) => t.name === 'vault_context')
        expect(tool?.description.toLowerCase()).toMatch(/context/)
      })
    })
  })

  describe('annotations', () => {
    describe('readOnlyHint annotation', () => {
      it.each(READ_ONLY_TOOLS)('%s should have readOnlyHint set to true', (toolName) => {
        const tool = obsidianTools.find((t) => t.name === toolName)
        expect(tool?.annotations).toBeDefined()
        expect(tool?.annotations?.readOnlyHint).toBe(true)
      })

      it.each(WRITE_TOOLS)('%s should not have readOnlyHint set to true', (toolName) => {
        const tool = obsidianTools.find((t) => t.name === toolName)
        expect(tool?.annotations?.readOnlyHint).not.toBe(true)
      })

      it.each(DESTRUCTIVE_TOOLS)('%s should not have readOnlyHint set to true', (toolName) => {
        const tool = obsidianTools.find((t) => t.name === toolName)
        expect(tool?.annotations?.readOnlyHint).not.toBe(true)
      })
    })

    describe('destructiveHint annotation', () => {
      it.each(DESTRUCTIVE_TOOLS)('%s should have destructiveHint set to true', (toolName) => {
        const tool = obsidianTools.find((t) => t.name === toolName)
        expect(tool?.annotations).toBeDefined()
        expect(tool?.annotations?.destructiveHint).toBe(true)
      })

      it.each(READ_ONLY_TOOLS)('%s should not have destructiveHint set to true', (toolName) => {
        const tool = obsidianTools.find((t) => t.name === toolName)
        expect(tool?.annotations?.destructiveHint).not.toBe(true)
      })

      it.each(WRITE_TOOLS)('%s should not have destructiveHint set to true', (toolName) => {
        const tool = obsidianTools.find((t) => t.name === toolName)
        expect(tool?.annotations?.destructiveHint).not.toBe(true)
      })
    })

    describe('annotation combinations', () => {
      it('should not have both readOnlyHint and destructiveHint true for any tool', () => {
        for (const tool of obsidianTools) {
          const isReadOnly = tool.annotations?.readOnlyHint === true
          const isDestructive = tool.annotations?.destructiveHint === true
          expect(isReadOnly && isDestructive).toBe(false)
        }
      })

      it('all write operations should have annotations defined', () => {
        const writeOperations = [...WRITE_TOOLS, ...DESTRUCTIVE_TOOLS]
        for (const toolName of writeOperations) {
          const tool = obsidianTools.find((t) => t.name === toolName)
          expect(tool?.annotations).toBeDefined()
        }
      })
    })
  })

  describe('property descriptions', () => {
    it.each(REQUIRED_TOOLS)('%s should have descriptions for all properties', (toolName) => {
      const tool = obsidianTools.find((t) => t.name === toolName)
      if (tool?.inputSchema.properties) {
        for (const [propName, propSchema] of Object.entries(tool.inputSchema.properties)) {
          expect(
            (propSchema as any).description,
            `Property "${propName}" in tool "${toolName}" should have a description`
          ).toBeDefined()
        }
      }
    })

    it.each(REQUIRED_TOOLS)('%s property descriptions should be meaningful (> 5 chars)', (toolName) => {
      const tool = obsidianTools.find((t) => t.name === toolName)
      if (tool?.inputSchema.properties) {
        for (const [propName, propSchema] of Object.entries(tool.inputSchema.properties)) {
          const desc = (propSchema as any).description
          expect(
            desc?.length,
            `Property "${propName}" in tool "${toolName}" should have a meaningful description`
          ).toBeGreaterThan(5)
        }
      }
    })
  })

  describe('schema validation', () => {
    it('all required fields should be defined in properties', () => {
      for (const tool of obsidianTools) {
        if (tool.inputSchema.required) {
          for (const requiredProp of tool.inputSchema.required) {
            expect(
              tool.inputSchema.properties[requiredProp],
              `Required property "${requiredProp}" should be defined in properties for tool "${tool.name}"`
            ).toBeDefined()
          }
        }
      }
    })

    it('all properties should have valid types', () => {
      const validTypes = ['string', 'integer', 'number', 'boolean', 'object', 'array']
      for (const tool of obsidianTools) {
        for (const [propName, propSchema] of Object.entries(tool.inputSchema.properties)) {
          const type = (propSchema as any).type
          if (type) {
            expect(
              validTypes,
              `Property "${propName}" in tool "${tool.name}" has invalid type "${type}"`
            ).toContain(type)
          }
        }
      }
    })

    it('integer properties should have valid constraints', () => {
      for (const tool of obsidianTools) {
        for (const [propName, propSchema] of Object.entries(tool.inputSchema.properties)) {
          const schema = propSchema as any
          if (schema.type === 'integer') {
            // If minimum is defined, it should be a number
            if (schema.minimum !== undefined) {
              expect(typeof schema.minimum).toBe('number')
            }
            // If maximum is defined, it should be a number
            if (schema.maximum !== undefined) {
              expect(typeof schema.maximum).toBe('number')
            }
          }
        }
      }
    })
  })

  describe('tool ordering', () => {
    it('should have tools in a logical order (read operations before write operations)', () => {
      const readToolIndices = READ_ONLY_TOOLS.map((name) =>
        obsidianTools.findIndex((t) => t.name === name)
      ).filter((i) => i !== -1)

      const writeToolIndices = [...WRITE_TOOLS, ...DESTRUCTIVE_TOOLS].map((name) =>
        obsidianTools.findIndex((t) => t.name === name)
      ).filter((i) => i !== -1)

      if (readToolIndices.length > 0 && writeToolIndices.length > 0) {
        const maxReadIndex = Math.max(...readToolIndices)
        const minWriteIndex = Math.min(...writeToolIndices)
        // This is a soft check - read tools should generally come before write tools
        expect(maxReadIndex).toBeLessThan(minWriteIndex + readToolIndices.length)
      }
    })
  })
})
