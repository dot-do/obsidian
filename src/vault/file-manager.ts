import type { TFile, EventRef } from '../types.js'
import type { Vault } from './vault.js'
import type { MetadataCache } from '../metadata/cache.js'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

// Types for file watching
interface FileChangeEvent {
  type: 'create' | 'modify' | 'delete' | 'rename'
  file: TFile
  oldPath?: string
}

interface FileWatcher {
  unwatch: () => void
}

interface WatchOptions {
  pattern?: string
  directory?: string
}

// Minimatch-like pattern matching for file paths
function matchesPattern(path: string, pattern: string): boolean {
  // Convert glob pattern to regex
  // Handle **/ which should match zero or more directory levels (including no directory)
  let regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*\//g, '(?:.*/)?') // **/ matches zero or more directories including none
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')

  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(path)
}

export class FileManager {
  private frontmatterLock = new Map<string, Promise<void>>()

  constructor(private vault: Vault, private cache: MetadataCache) {}

  /**
   * Normalize a path, handling various edge cases:
   * - Remove leading/trailing slashes
   * - Convert backslashes to forward slashes
   * - Collapse double slashes
   * - Resolve relative paths (. and ..)
   */
  normalizePath(path: string): string {
    if (path === '' || path === '/') return ''

    // Convert backslashes to forward slashes
    let normalized = path.replace(/\\/g, '/')

    // Collapse double slashes
    normalized = normalized.replace(/\/+/g, '/')

    // Remove leading slash (unless it's a Windows drive letter)
    if (normalized.startsWith('/') && !normalized.match(/^\/[A-Za-z]:/)) {
      normalized = normalized.substring(1)
    }

    // Remove trailing slash
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1)
    }

    // Handle empty after normalization
    if (normalized === '' || normalized === '/') return ''

    // Resolve . and .. segments
    const segments = normalized.split('/')
    const result: string[] = []

    for (const segment of segments) {
      if (segment === '.') {
        continue
      } else if (segment === '..') {
        if (result.length > 0 && result[result.length - 1] !== '..') {
          result.pop()
        }
        // If we go past root, just ignore the ..
      } else if (segment !== '') {
        result.push(segment)
      }
    }

    return result.join('/')
  }

  /**
   * List all files with the specified extension(s).
   * @param extension Extension(s) to filter by (without leading dot, case-insensitive)
   */
  listFilesByExtension(extension: string | string[]): TFile[] {
    const extensions = Array.isArray(extension) ? extension : [extension]
    const normalizedExtensions = extensions.map(ext =>
      ext.startsWith('.') ? ext.substring(1).toLowerCase() : ext.toLowerCase()
    )

    return this.vault.getFiles().filter(file =>
      normalizedExtensions.includes(file.extension.toLowerCase())
    )
  }

  /**
   * Get all files in a directory.
   * @param directory The directory path
   * @param recursive Whether to include files in subdirectories
   */
  getFilesInDirectory(directory: string, recursive: boolean): TFile[] {
    // Normalize the directory path
    let normalizedDir = this.normalizePath(directory)

    // Handle root directory
    const isRoot = normalizedDir === '' || normalizedDir === '/'

    return this.vault.getFiles().filter(file => {
      const filePath = file.path

      if (isRoot) {
        if (recursive) {
          return true
        }
        // Non-recursive: only files directly in root (no slashes in path)
        return !filePath.includes('/')
      }

      // Check if file is in this directory
      if (!filePath.startsWith(normalizedDir + '/')) {
        return false
      }

      if (recursive) {
        return true
      }

      // Non-recursive: check that there are no more slashes after the directory
      const relativePath = filePath.substring(normalizedDir.length + 1)
      return !relativePath.includes('/')
    })
  }

  /**
   * Watch for file changes in the vault.
   * @param callback Callback to invoke when a file changes
   * @param options Optional filtering options
   */
  watchFileChanges(callback: (event: FileChangeEvent) => void, options?: WatchOptions): FileWatcher {
    const refs: EventRef[] = []

    const shouldNotify = (file: TFile): boolean => {
      if (options?.pattern && !matchesPattern(file.path, options.pattern)) {
        return false
      }
      if (options?.directory) {
        const normalizedDir = this.normalizePath(options.directory)
        if (!file.path.startsWith(normalizedDir + '/') && file.path !== normalizedDir) {
          return false
        }
      }
      return true
    }

    // Watch for create events
    refs.push(this.vault.on<TFile>('create', (file) => {
      if (shouldNotify(file)) {
        callback({ type: 'create', file })
      }
    }))

    // Watch for modify events
    refs.push(this.vault.on<TFile>('modify', (file) => {
      if (shouldNotify(file)) {
        callback({ type: 'modify', file })
      }
    }))

    // Watch for delete events
    refs.push(this.vault.on<TFile>('delete', (file) => {
      if (shouldNotify(file)) {
        callback({ type: 'delete', file })
      }
    }))

    // Watch for rename events
    refs.push(this.vault.on<{ file: TFile; oldPath: string }>('rename', (data) => {
      if (shouldNotify(data.file)) {
        callback({ type: 'rename', file: data.file, oldPath: data.oldPath })
      }
    }))

    return {
      unwatch: () => {
        for (const ref of refs) {
          ref.unsubscribe()
        }
      }
    }
  }

  /**
   * Get the linkpath to use for linking to a file from a source path.
   * Returns the shortest unambiguous path.
   * @param targetPath The path of the file to link to
   * @param sourcePath The path of the source file
   */
  getLinkPath(targetPath: string, sourcePath: string): string {
    const normalizedTarget = this.normalizePath(targetPath)
    const normalizedSource = this.normalizePath(sourcePath)

    // Self-reference
    if (normalizedTarget === normalizedSource) {
      return ''
    }

    // Get file info
    const targetName = normalizedTarget.split('/').pop() || normalizedTarget
    const lastDotIndex = targetName.lastIndexOf('.')
    let targetBasename = lastDotIndex > 0 ? targetName.slice(0, lastDotIndex) : targetName
    const targetExtension = lastDotIndex > 0 ? targetName.slice(lastDotIndex + 1) : ''

    // Strip outer square brackets from basename for link generation
    // (files like [special].md should link as [[special]] not [[[special]]])
    if (targetBasename.startsWith('[') && targetBasename.endsWith(']')) {
      targetBasename = targetBasename.slice(1, -1)
    }

    // Non-markdown files always use full path with extension
    if (targetExtension !== 'md') {
      return normalizedTarget
    }

    // Get source directory
    const sourceDir = normalizedSource.includes('/')
      ? normalizedSource.substring(0, normalizedSource.lastIndexOf('/'))
      : ''

    // Get target directory
    const targetDir = normalizedTarget.includes('/')
      ? normalizedTarget.substring(0, normalizedTarget.lastIndexOf('/'))
      : ''

    // If source and target are in the same directory, use basename only
    if (sourceDir === targetDir) {
      return targetBasename
    }

    // Path without extension for later use
    const pathWithoutExt = normalizedTarget.endsWith('.md')
      ? normalizedTarget.slice(0, -3)
      : normalizedTarget

    // If target is in a subdirectory of source's directory, use relative path
    if (sourceDir && targetDir.startsWith(sourceDir + '/')) {
      return pathWithoutExt.substring(sourceDir.length + 1)
    }

    // If source is in root directory and target is not, always use full path
    if (sourceDir === '' && targetDir !== '') {
      return pathWithoutExt
    }

    // Check if basename is unique in the vault
    const allFiles = this.vault.getFiles()
    const filesWithSameBasename = allFiles.filter(f => f.basename === targetBasename && f.extension === 'md')

    // Check if there are any files that start with this basename (could cause ambiguity)
    const filesStartingWithBasename = allFiles.filter(f =>
      f.extension === 'md' &&
      f.basename !== targetBasename &&
      f.basename.startsWith(targetBasename + ' ')
    )

    // If basename is unique AND no files start with this basename, just use basename
    if (filesWithSameBasename.length === 1 && filesStartingWithBasename.length === 0) {
      return targetBasename
    }

    // Otherwise, need to use path (without .md extension)
    return pathWithoutExt
  }

  /**
   * Generate a markdown link to a file from a source file.
   * Uses shortest unambiguous path (wikilink style by default).
   * @param file The target file to link to
   * @param sourcePath The path of the source file containing the link
   * @param subpath Optional subpath (heading or block reference)
   * @param alias Optional display text for the link
   */
  generateMarkdownLink(file: TFile, sourcePath: string, subpath?: string, alias?: string): string {
    const linkPath = this.getLinkPath(file.path, sourcePath)

    // Build the link
    let link = linkPath
    if (subpath) {
      link += subpath
    }

    if (alias) {
      return `[[${link}|${alias}]]`
    }

    return `[[${link}]]`
  }

  /**
   * Create a new markdown file with the given content.
   * @param path The path for the new file
   * @param content The content of the file
   */
  async createMarkdownFile(path: string, content: string): Promise<TFile> {
    // Normalize path and ensure .md extension
    let normalizedPath = this.normalizePath(path)
    if (!normalizedPath.endsWith('.md')) {
      normalizedPath += '.md'
    }

    // Check if file already exists
    const existing = this.vault.getFileByPath(normalizedPath)
    if (existing) {
      throw new Error(`File already exists: ${normalizedPath}`)
    }

    // Create the file
    return this.vault.create(normalizedPath, content)
  }

  /**
   * Process frontmatter of a file atomically.
   * @param file The file whose frontmatter to process
   * @param fn Function that receives current frontmatter and modifies it
   */
  async processFrontMatter(file: TFile, fn: (frontmatter: Record<string, unknown>) => void): Promise<void> {
    // Get or create lock for this file
    const existingLock = this.frontmatterLock.get(file.path)

    const processWithLock = async (): Promise<void> => {
      // Read current content
      const content = await this.vault.read(file)
      const originalContent = content

      // Parse frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?/)

      let frontmatter: Record<string, unknown> = {}
      let bodyContent: string = content

      if (frontmatterMatch) {
        try {
          const yamlContent = frontmatterMatch[1]
          frontmatter = yamlContent.trim() === '' ? {} : (parseYaml(yamlContent) || {})
          bodyContent = content.substring(frontmatterMatch[0].length)
        } catch {
          frontmatter = {}
          bodyContent = content.substring(frontmatterMatch[0].length)
        }
      }

      // Apply the function
      try {
        fn(frontmatter)
      } catch (err) {
        // On error, don't modify the file
        throw err
      }

      // Serialize the modified frontmatter
      const newYaml = stringifyYaml(frontmatter, { lineWidth: 0 }).trim()

      // Reconstruct the file
      let newContent: string
      if (Object.keys(frontmatter).length === 0) {
        // No frontmatter fields left, but we had frontmatter before
        if (frontmatterMatch) {
          newContent = `---\n---\n${bodyContent}`
        } else {
          newContent = bodyContent
        }
      } else {
        newContent = `---\n${newYaml}\n---\n${bodyContent}`
      }

      // Only write if content actually changed
      if (newContent !== originalContent) {
        await this.vault.modify(file, newContent)
      }
    }

    // Chain promises to handle concurrent modifications
    if (existingLock) {
      const newLock = existingLock.then(processWithLock).finally(() => {
        // Clean up lock if this is the current one
        if (this.frontmatterLock.get(file.path) === newLock) {
          this.frontmatterLock.delete(file.path)
        }
      })
      this.frontmatterLock.set(file.path, newLock)
      await newLock
    } else {
      const newLock = processWithLock().finally(() => {
        // Clean up lock if this is the current one
        if (this.frontmatterLock.get(file.path) === newLock) {
          this.frontmatterLock.delete(file.path)
        }
      })
      this.frontmatterLock.set(file.path, newLock)
      await newLock
    }
  }

  /**
   * Get the relative path from a source file to a target file.
   * Used for generating relative links between files.
   * @param targetPath The path of the target file
   * @param sourcePath The path of the source file
   * @returns The relative path string
   */
  getRelativePath(targetPath: string, sourcePath: string): string {
    const normalizedTarget = this.normalizePath(targetPath)
    const normalizedSource = this.normalizePath(sourcePath)

    // Get source and target directories
    const sourceDir = normalizedSource.includes('/')
      ? normalizedSource.substring(0, normalizedSource.lastIndexOf('/'))
      : ''
    const targetDir = normalizedTarget.includes('/')
      ? normalizedTarget.substring(0, normalizedTarget.lastIndexOf('/'))
      : ''

    // Get target filename
    const targetName = normalizedTarget.split('/').pop() || normalizedTarget

    // If in same directory, return just the filename
    if (sourceDir === targetDir) {
      return targetName
    }

    // Calculate relative path
    const sourceParts = sourceDir ? sourceDir.split('/') : []
    const targetParts = targetDir ? targetDir.split('/') : []

    // Find common prefix length
    let commonLength = 0
    while (
      commonLength < sourceParts.length &&
      commonLength < targetParts.length &&
      sourceParts[commonLength] === targetParts[commonLength]
    ) {
      commonLength++
    }

    // Build relative path
    const upCount = sourceParts.length - commonLength
    const downPath = targetParts.slice(commonLength)

    const relativeParts: string[] = []
    for (let i = 0; i < upCount; i++) {
      relativeParts.push('..')
    }
    relativeParts.push(...downPath)
    relativeParts.push(targetName)

    return relativeParts.join('/')
  }

  /**
   * Get all files that link to the specified file (backlinks).
   * Returns a Map where keys are source file paths and values are arrays of link information.
   * @param file The file to find backlinks for
   * @returns Map of source paths to link details
   */
  getBacklinks(file: TFile): Map<string, Array<{ link: string; position: { line: number; col: number } }>> {
    const backlinks = new Map<string, Array<{ link: string; position: { line: number; col: number } }>>()
    const targetBasename = file.basename
    const targetPath = file.path
    const targetPathWithoutExt = targetPath.endsWith('.md') ? targetPath.slice(0, -3) : targetPath
    const targetDir = targetPath.includes('/') ? targetPath.substring(0, targetPath.lastIndexOf('/')) : ''

    const allMdFiles = this.vault.getMarkdownFiles()

    for (const mdFile of allMdFiles) {
      if (mdFile.path === targetPath) continue // Skip self

      const metadata = this.cache.getFileCache(mdFile)
      if (!metadata?.links && !metadata?.embeds) continue

      const links: Array<{ link: string; position: { line: number; col: number } }> = []
      const sourceDir = mdFile.path.includes('/')
        ? mdFile.path.substring(0, mdFile.path.lastIndexOf('/'))
        : ''

      // Check regular links
      if (metadata.links) {
        for (const linkCache of metadata.links) {
          const linkTarget = linkCache.link.split('#')[0] // Remove heading/block ref

          // Check if this link resolves to our file
          if (this.linkResolvesToFile(linkTarget, sourceDir, targetBasename, targetPath, targetPathWithoutExt, targetDir, allMdFiles)) {
            links.push({
              link: linkCache.link,
              position: {
                line: linkCache.position.start.line,
                col: linkCache.position.start.col
              }
            })
          }
        }
      }

      // Check embeds
      if (metadata.embeds) {
        for (const embedCache of metadata.embeds) {
          const linkTarget = embedCache.link.split('#')[0]

          if (this.linkResolvesToFile(linkTarget, sourceDir, targetBasename, targetPath, targetPathWithoutExt, targetDir, allMdFiles)) {
            links.push({
              link: embedCache.link,
              position: {
                line: embedCache.position.start.line,
                col: embedCache.position.start.col
              }
            })
          }
        }
      }

      if (links.length > 0) {
        backlinks.set(mdFile.path, links)
      }
    }

    return backlinks
  }

  /**
   * Check if a link target resolves to a specific file.
   * @private
   */
  private linkResolvesToFile(
    linkTarget: string,
    sourceDir: string,
    targetBasename: string,
    targetPath: string,
    targetPathWithoutExt: string,
    targetDir: string,
    allMdFiles: TFile[]
  ): boolean {
    // Match by basename (same directory or unique)
    if (linkTarget === targetBasename) {
      // If same directory, it's a match
      if (sourceDir === targetDir) {
        return true
      }
      // Check if it would resolve to this file (unique basename)
      const filesWithBasename = allMdFiles.filter(f => f.basename === targetBasename)
      if (filesWithBasename.length === 1 && filesWithBasename[0].path === targetPath) {
        return true
      }
    }

    // Match by full path (without extension)
    if (linkTarget === targetPathWithoutExt || linkTarget === targetPath) {
      return true
    }

    // Match by relative path from source
    if (sourceDir) {
      const resolvedPath = `${sourceDir}/${linkTarget}`
      if (resolvedPath === targetPathWithoutExt || resolvedPath + '.md' === targetPath) {
        return true
      }
    }

    return false
  }

  /**
   * Update links in content, replacing old path references with new path.
   * Handles wikilinks, embeds, and preserves aliases and subpaths.
   * @param content The content to update
   * @param oldPath The old file path to replace
   * @param newPath The new file path
   * @returns The updated content
   */
  updateLinks(content: string, oldPath: string, newPath: string): string {
    const oldPathWithoutExt = oldPath.endsWith('.md') ? oldPath.slice(0, -3) : oldPath
    const newPathWithoutExt = newPath.endsWith('.md') ? newPath.slice(0, -3) : newPath

    const oldName = oldPath.split('/').pop() || oldPath
    const oldBasename = oldName.endsWith('.md') ? oldName.slice(0, -3) : oldName.replace(/\.[^.]+$/, '')

    const newName = newPath.split('/').pop() || newPath
    const newBasename = newName.endsWith('.md') ? newName.slice(0, -3) : newName.replace(/\.[^.]+$/, '')

    // Track code regions to skip
    const codeRegions: Array<{ start: number; end: number }> = []

    // Find fenced code blocks
    const codeBlockRegex = /```[\s\S]*?```/g
    let match
    while ((match = codeBlockRegex.exec(content)) !== null) {
      codeRegions.push({ start: match.index, end: match.index + match[0].length })
    }

    // Find inline code
    const inlineCodeRegex = /`[^`]+`/g
    while ((match = inlineCodeRegex.exec(content)) !== null) {
      codeRegions.push({ start: match.index, end: match.index + match[0].length })
    }

    const isInCodeRegion = (index: number): boolean => {
      return codeRegions.some(region => index >= region.start && index < region.end)
    }

    // Find and replace wikilinks
    const wikilinkRegex = /(!?\[\[)([^\]|#]+)(#[^\]|]*)?((?:\|[^\]]*)?)\]\]/g
    const replacements: Array<{ start: number; end: number; replacement: string }> = []

    while ((match = wikilinkRegex.exec(content)) !== null) {
      if (isInCodeRegion(match.index)) continue

      const prefix = match[1]
      const linkTarget = match[2]
      const subpath = match[3] || ''
      const aliasSection = match[4] || ''

      // Check if this link should be updated
      let shouldUpdate = false
      let newLink = linkTarget

      if (linkTarget === oldBasename) {
        shouldUpdate = true
        newLink = newBasename
      } else if (linkTarget === oldPathWithoutExt || linkTarget === oldPath) {
        shouldUpdate = true
        newLink = newPathWithoutExt
      }

      if (shouldUpdate) {
        const replacement = `${prefix}${newLink}${subpath}${aliasSection}]]`
        replacements.push({
          start: match.index,
          end: match.index + match[0].length,
          replacement
        })
      }
    }

    // Apply replacements in reverse order
    replacements.sort((a, b) => b.start - a.start)
    for (const { start, end, replacement } of replacements) {
      content = content.substring(0, start) + replacement + content.substring(end)
    }

    return content
  }

  /**
   * Rename a file and update all links pointing to it throughout the vault.
   * @param file The file to rename
   * @param newPath The new path for the file
   */
  async renameFile(file: TFile, newPath: string): Promise<void> {
    const normalizedNewPath = this.normalizePath(newPath)

    // Check if file exists
    const existingFile = this.vault.getFileByPath(file.path)
    if (!existingFile) {
      throw new Error(`File not found: ${file.path}`)
    }

    // Check if new path already exists
    const targetFile = this.vault.getFileByPath(normalizedNewPath)
    if (targetFile) {
      throw new Error(`File already exists at target path: ${normalizedNewPath}`)
    }

    // Get old basename (without extension)
    const oldName = file.path.split('/').pop() || file.path
    const oldBasename = oldName.endsWith('.md') ? oldName.slice(0, -3) : oldName.replace(/\.[^.]+$/, '')

    // Get new basename (without extension)
    const newName = normalizedNewPath.split('/').pop() || normalizedNewPath
    const newBasename = newName.endsWith('.md') ? newName.slice(0, -3) : newName.replace(/\.[^.]+$/, '')

    // Get old and new directories
    const oldDir = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : ''
    const newDir = normalizedNewPath.includes('/') ? normalizedNewPath.substring(0, normalizedNewPath.lastIndexOf('/')) : ''

    // Get old path without extension (for link matching)
    const oldPathWithoutExt = file.path.endsWith('.md') ? file.path.slice(0, -3) : file.path
    const newPathWithoutExt = normalizedNewPath.endsWith('.md') ? normalizedNewPath.slice(0, -3) : normalizedNewPath

    // Update links in all markdown files
    const allMdFiles = this.vault.getMarkdownFiles()

    for (const mdFile of allMdFiles) {
      if (mdFile.path === file.path) continue // Skip the file being renamed

      let content = await this.vault.read(mdFile)
      let modified = false

      // Track code block and inline code regions
      const codeRegions: Array<{ start: number; end: number }> = []

      // Find fenced code blocks
      const codeBlockRegex = /```[\s\S]*?```/g
      let match
      while ((match = codeBlockRegex.exec(content)) !== null) {
        codeRegions.push({ start: match.index, end: match.index + match[0].length })
      }

      // Find inline code
      const inlineCodeRegex = /`[^`]+`/g
      while ((match = inlineCodeRegex.exec(content)) !== null) {
        codeRegions.push({ start: match.index, end: match.index + match[0].length })
      }

      const isInCodeRegion = (index: number): boolean => {
        return codeRegions.some(region => index >= region.start && index < region.end)
      }

      // Find all wikilinks (including embeds)
      const wikilinkRegex = /(!?\[\[)([^\]|#]+)(#[^\]|]*)?((?:\|[^\]]*)?)\]\]/g
      const replacements: Array<{ start: number; end: number; replacement: string }> = []

      while ((match = wikilinkRegex.exec(content)) !== null) {
        if (isInCodeRegion(match.index)) continue

        const prefix = match[1] // [[ or ![[
        const linkTarget = match[2] // The link target (basename or path)
        const subpath = match[3] || '' // #heading or #^block
        const aliasSection = match[4] || '' // |alias or empty

        // Check if this link points to our file
        let isMatch = false

        // Match by basename (same directory or unique)
        if (linkTarget === oldBasename) {
          // Get source file directory
          const sourceDir = mdFile.path.includes('/')
            ? mdFile.path.substring(0, mdFile.path.lastIndexOf('/'))
            : ''

          // If same directory as old file, it's a match
          if (sourceDir === oldDir) {
            isMatch = true
          } else {
            // Check if it would resolve to this file (unique basename)
            const filesWithBasename = allMdFiles.filter(f => f.basename === oldBasename)
            if (filesWithBasename.length === 1 && filesWithBasename[0].path === file.path) {
              isMatch = true
            }
          }
        }

        // Match by full path (without extension)
        if (!isMatch && (linkTarget === oldPathWithoutExt || linkTarget === file.path)) {
          isMatch = true
        }

        // Match by relative path from source
        if (!isMatch) {
          const sourceDir = mdFile.path.includes('/')
            ? mdFile.path.substring(0, mdFile.path.lastIndexOf('/'))
            : ''
          if (sourceDir) {
            const resolvedPath = `${sourceDir}/${linkTarget}`
            if (resolvedPath === oldPathWithoutExt || resolvedPath + '.md' === file.path) {
              isMatch = true
            }
          }
        }

        if (isMatch) {
          // Calculate new link
          let newLink: string

          // Get the source file's directory
          const sourceDir = mdFile.path.includes('/')
            ? mdFile.path.substring(0, mdFile.path.lastIndexOf('/'))
            : ''

          // Determine the best link format
          if (sourceDir === newDir) {
            // Same directory - use basename only
            newLink = newBasename
          } else {
            // Different directory - use path without extension
            newLink = newPathWithoutExt
          }

          const replacement = `${prefix}${newLink}${subpath}${aliasSection}]]`

          replacements.push({
            start: match.index,
            end: match.index + match[0].length,
            replacement
          })
          modified = true
        }
      }

      // Apply replacements in reverse order to preserve indices
      if (modified) {
        replacements.sort((a, b) => b.start - a.start)
        for (const { start, end, replacement } of replacements) {
          content = content.substring(0, start) + replacement + content.substring(end)
        }
        await this.vault.modify(mdFile, content)
      }
    }

    // Actually rename the file
    await this.vault.rename(file, normalizedNewPath)
  }
}
