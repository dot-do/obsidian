import type { TFile, LinkCache, Pos } from '../types.js'
import type { MetadataCache } from '../metadata/cache.js'

/**
 * Represents a link position in simplified form
 */
export interface LinkPosition {
  link: string
  position: { line: number; col: number }
}

/**
 * Simple backlink result with source file and link positions
 */
export interface Backlink {
  file: TFile
  links: LinkPosition[]
}

/**
 * Extended backlink result with full link metadata and context
 */
export interface BacklinkResult {
  file: TFile
  links: LinkCache[]
  context: string[]
}

/**
 * Forward link with resolved target file reference
 */
export interface ForwardLink {
  link: string
  resolved: TFile | null
}

/**
 * GraphEngine provides backlink and forward link analysis for vault files.
 * It uses the MetadataCache to traverse resolved links and extract link metadata.
 */
export class GraphEngine {
  private contentCache = new Map<string, string>()
  private backlinkIndex: Map<string, Set<string>> | null = null

  constructor(private cache: MetadataCache) {}

  /**
   * Invalidate the backlink index (call when links change)
   */
  invalidateBacklinkIndex(): void {
    this.backlinkIndex = null
  }

  /**
   * Get or build the backlink index for O(1) backlink lookups
   */
  private getBacklinkIndex(): Map<string, Set<string>> {
    if (!this.backlinkIndex) {
      this.backlinkIndex = this.buildBacklinkIndex()
    }
    return this.backlinkIndex
  }

  /**
   * Build the inverted index: target -> set of source files
   */
  private buildBacklinkIndex(): Map<string, Set<string>> {
    const index = new Map<string, Set<string>>()
    const resolvedLinks = this.cache.resolvedLinks

    for (const [source, targets] of Object.entries(resolvedLinks)) {
      for (const target of Object.keys(targets)) {
        if (!index.has(target)) {
          index.set(target, new Set())
        }
        index.get(target)!.add(source)
      }
    }

    return index
  }

  /**
   * Get all backlinks pointing to a specific file path.
   * Returns simplified backlink info with source file and link positions.
   * Uses an inverted index for O(1) lookup of source files.
   *
   * @param path - The target file path to find backlinks for
   * @returns Array of Backlink objects, each containing the source file and link positions
   */
  getBacklinks(path: string): Backlink[] {
    const backlinks: Backlink[] = []
    const index = this.getBacklinkIndex()
    const sourcePaths = index.get(path)

    if (!sourcePaths) {
      return backlinks
    }

    // Iterate only through source files that link to this target (O(1) lookup)
    for (const sourcePath of sourcePaths) {
      // Skip self-references
      if (sourcePath === path) continue

      // Get the metadata for the source file to extract link details
      const sourceMetadata = this.cache.getCache(sourcePath)

      if (sourceMetadata && sourceMetadata.links) {
        // Find all links in the source that point to our target
        const linksToTarget: LinkPosition[] = []

        for (const linkCache of sourceMetadata.links) {
          // Resolve the link to check if it points to our target
          const resolved = this.cache.getFirstLinkpathDest(linkCache.link, sourcePath)

          if (resolved && resolved.path === path) {
            linksToTarget.push({
              link: linkCache.link,
              position: {
                line: linkCache.position.start.line,
                col: linkCache.position.start.col
              }
            })
          }
        }

        if (linksToTarget.length > 0) {
          // Sort links by position (line, then col)
          linksToTarget.sort((a, b) => {
            if (a.position.line !== b.position.line) {
              return a.position.line - b.position.line
            }
            return a.position.col - b.position.col
          })

          // Create TFile object for the source
          const sourceFile = this.createTFileFromPath(sourcePath)

          backlinks.push({
            file: sourceFile,
            links: linksToTarget
          })
        }
      }
    }

    return backlinks
  }

  /**
   * Get extended backlinks with full LinkCache metadata and surrounding context.
   * This is useful for displaying backlink previews in a UI.
   * Uses an inverted index for O(1) lookup of source files.
   *
   * @param path - The target file path to find backlinks for
   * @returns Array of BacklinkResult objects with full link metadata and context strings
   */
  getBacklinksWithContext(path: string): BacklinkResult[] {
    const results: BacklinkResult[] = []
    const index = this.getBacklinkIndex()
    const sourcePaths = index.get(path)

    if (!sourcePaths) {
      return results
    }

    // Iterate only through source files that link to this target (O(1) lookup)
    for (const sourcePath of sourcePaths) {
      // Skip self-references
      if (sourcePath === path) continue

      const sourceFile = this.getFileByPath(sourcePath)
      const metadata = this.cache.getCache(sourcePath)

      if (sourceFile && metadata?.links) {
        const relevantLinks = metadata.links.filter(
          l => this.cache.getFirstLinkpathDest(l.link, sourcePath)?.path === path
        )

        if (relevantLinks.length > 0) {
          // Sort links by position
          relevantLinks.sort((a, b) => {
            if (a.position.start.line !== b.position.start.line) {
              return a.position.start.line - b.position.start.line
            }
            return a.position.start.col - b.position.start.col
          })

          results.push({
            file: sourceFile,
            links: relevantLinks,
            context: relevantLinks.map(l => this.getContext(sourcePath, l.position))
          })
        }
      }
    }

    return results
  }

  /**
   * Get all forward links from a specific file.
   * Returns link text and resolved target file reference.
   *
   * @param path - The source file path to get forward links from
   * @returns Array of ForwardLink objects with link text and resolved file (or null if unresolved)
   */
  getForwardLinks(path: string): ForwardLink[] {
    const forwardLinks: ForwardLink[] = []
    const metadata = this.cache.getCache(path)

    if (!metadata || !metadata.links) {
      return forwardLinks
    }

    for (const linkCache of metadata.links) {
      const resolved = this.cache.getFirstLinkpathDest(linkCache.link, path)

      forwardLinks.push({
        link: linkCache.link,
        resolved: resolved
      })
    }

    return forwardLinks
  }

  /**
   * Get raw LinkCache array for forward links (matches Obsidian API style).
   *
   * @param path - The source file path
   * @returns Array of LinkCache objects from the file's metadata
   */
  getForwardLinksRaw(path: string): LinkCache[] {
    const metadata = this.cache.getCache(path)
    return metadata?.links ?? []
  }

  /**
   * Set cached content for a file path (used for context extraction).
   * This allows context to be extracted without async file reads.
   *
   * @param path - The file path
   * @param content - The file content
   */
  setContentCache(path: string, content: string): void {
    this.contentCache.set(path, content)
  }

  /**
   * Clear the content cache for a specific path or all paths.
   *
   * @param path - Optional specific path to clear, or clear all if not provided
   */
  clearContentCache(path?: string): void {
    if (path) {
      this.contentCache.delete(path)
    } else {
      this.contentCache.clear()
    }
  }

  /**
   * Extract surrounding text context for a link at a given position.
   * Returns empty string if content is not cached.
   *
   * @param path - The file path containing the link
   * @param position - The position of the link in the file
   * @returns Context string with surrounding text, or empty string if unavailable
   */
  private getContext(path: string, position: Pos): string {
    const content = this.contentCache.get(path)
    if (!content) {
      // Return a placeholder context based on position if content not cached
      return `Line ${position.start.line + 1}`
    }

    const lines = content.split('\n')
    const lineIndex = position.start.line

    // Get the line containing the link
    if (lineIndex < 0 || lineIndex >= lines.length) {
      return ''
    }

    const contextLine = lines[lineIndex]

    // Get surrounding context (one line before and after if available)
    const contextLines: string[] = []

    if (lineIndex > 0) {
      contextLines.push(lines[lineIndex - 1].trim())
    }

    contextLines.push(contextLine.trim())

    if (lineIndex < lines.length - 1) {
      contextLines.push(lines[lineIndex + 1].trim())
    }

    // Join context lines and truncate if too long
    let context = contextLines.join(' ').trim()
    const maxLength = 200
    if (context.length > maxLength) {
      context = context.substring(0, maxLength) + '...'
    }

    return context
  }

  /**
   * Get a TFile by path from the vault (if available via metadataCache).
   * Falls back to creating a TFile from path if vault access is not available.
   *
   * @param path - The file path
   * @returns TFile object
   */
  private getFileByPath(path: string): TFile | null {
    // Try to get from vault if available through cache
    const vault = (this.cache as unknown as { vault?: { getFileByPath: (p: string) => TFile | null } }).vault
    if (vault?.getFileByPath) {
      const file = vault.getFileByPath(path)
      if (file) return file
    }

    // Fall back to creating TFile from path
    return this.createTFileFromPath(path)
  }

  /**
   * Create a TFile object from a path string.
   *
   * @param path - The file path
   * @returns A TFile object with parsed name, basename, and extension
   */
  private createTFileFromPath(path: string): TFile {
    const name = path.split('/').pop() ?? path
    const basename = name.replace(/\.md$/, '')
    const extension = name.includes('.') ? name.split('.').pop() ?? 'md' : 'md'

    return {
      path,
      name,
      basename,
      extension,
      stat: { ctime: Date.now(), mtime: Date.now(), size: 0 }
    }
  }
}
