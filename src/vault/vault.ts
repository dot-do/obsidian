import type { Backend, TFile, TFolder, TAbstractFile, FileStat } from '../types.js'
import { Events, EventRef } from './events.js'

interface ExtendedBackend extends Backend {
  files?: Map<string, string | ArrayBuffer>
  on?(event: string, callback: (path: string) => void): EventRef
}

export class Vault extends Events {
  private fileCache = new Map<string, TFile>()
  private folderCache = new Map<string, TFolder>()
  private contentCache = new Map<string, string>()
  private syncScanned = false
  private backendCreatesInProgress = new Set<string>()
  private backendModifiesInProgress = new Set<string>()
  private backendDeletesInProgress = new Set<string>()

  constructor(private backend: Backend) {
    super()
    // Listen to backend events if supported
    this.setupBackendListeners()
  }

  private setupBackendListeners(): void {
    const extBackend = this.backend as ExtendedBackend
    if (typeof extBackend.on !== 'function') return

    // Listen for backend create events
    extBackend.on('create', (path: string) => {
      // Skip if this create was initiated by vault.create()
      if (this.backendCreatesInProgress.has(path)) return

      const file = this.refreshFileSync(path)
      if (file) {
        this.registerFoldersForPath(path)
        this.buildFolderChildren()
        this.trigger('create', file)
      }
    })

    // Listen for backend modify events
    extBackend.on('modify', (path: string) => {
      // Skip if this modify was initiated by vault.modify()
      if (this.backendModifiesInProgress.has(path)) return

      const file = this.fileCache.get(path)
      if (file) {
        this.refreshFileSync(path)
        // Don't invalidate content cache for backend-only modifications
        // This preserves the cachedRead behavior where cache should not be
        // invalidated when backend is modified directly (bypassing vault)
        this.trigger('modify', file)
      }
    })

    // Listen for backend delete events
    extBackend.on('delete', (path: string) => {
      // Skip if this delete was initiated by vault.delete()
      if (this.backendDeletesInProgress.has(path)) return

      const file = this.fileCache.get(path)
      if (file) {
        const deletedFile = { ...file }
        this.fileCache.delete(path)
        this.contentCache.delete(path)

        const parentPath = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : ''
        const parent = this.folderCache.get(parentPath)
        if (parent) {
          parent.children = parent.children.filter(c => c.path !== path)
        }

        this.trigger('delete', deletedFile)
      }
    })

    // Listen for backend rename events
    extBackend.on('rename', (oldPath: string) => {
      // This is handled in the vault's rename method, but if called directly on backend
      // we would need the new path too which isn't available from the callback signature
    })
  }

  private refreshFileSync(path: string): TFile | null {
    const extBackend = this.backend as ExtendedBackend
    if (extBackend.files && extBackend.files instanceof Map && extBackend.files.has(path)) {
      const content = extBackend.files.get(path)!
      const size = typeof content === 'string' ? content.length : content.byteLength
      const now = Date.now()
      const stat: FileStat = { ctime: now, mtime: now, size }
      const file = this.createTFile(path, stat)
      this.fileCache.set(path, file)
      return file
    }
    return null
  }

  private createTFile(path: string, stat: FileStat): TFile {
    const name = path.split('/').pop() || path
    const lastDotIndex = name.lastIndexOf('.')
    const basename = lastDotIndex > 0 ? name.slice(0, lastDotIndex) : name
    const extension = lastDotIndex > 0 ? name.slice(lastDotIndex + 1) : ''
    return { path, name, basename, extension, stat }
  }

  private async refreshFile(path: string): Promise<TFile | null> {
    const stat = await this.backend.stat(path)
    if (!stat) {
      this.fileCache.delete(path)
      return null
    }
    const file = this.createTFile(path, stat)
    this.fileCache.set(path, file)
    return file
  }

  private syncScanBackend(): void {
    if (this.syncScanned) return

    // Always ensure root folder exists
    this.ensureRootFolder()

    const extBackend = this.backend as ExtendedBackend
    if (extBackend.files && extBackend.files instanceof Map) {
      for (const [path, content] of extBackend.files.entries()) {
        const size = typeof content === 'string' ? content.length : content.byteLength
        const now = Date.now()
        const stat: FileStat = { ctime: now, mtime: now, size }
        const file = this.createTFile(path, stat)
        this.fileCache.set(path, file)

        // Register parent folders
        this.registerFoldersForPath(path)
      }
      this.buildFolderChildren()
    }
    this.syncScanned = true
  }

  private ensureRootFolder(): void {
    if (!this.folderCache.has('')) {
      this.folderCache.set('', {
        path: '',
        name: '',
        children: [],
        isRoot: () => true
      })
    }
  }

  private registerFoldersForPath(path: string): void {
    const parts = path.split('/')
    for (let i = 0; i < parts.length - 1; i++) {
      const folderPath = parts.slice(0, i + 1).join('/')
      if (!this.folderCache.has(folderPath)) {
        const name = parts[i]
        const folder: TFolder = {
          path: folderPath,
          name,
          children: [],
          isRoot: () => false
        }
        this.folderCache.set(folderPath, folder)
      }
    }

    // Register root folder
    if (!this.folderCache.has('')) {
      this.folderCache.set('', {
        path: '',
        name: '',
        children: [],
        isRoot: () => true
      })
    }
  }

  private buildFolderChildren(): void {
    // Clear existing children
    for (const folder of this.folderCache.values()) {
      folder.children = []
    }

    // Add files to their parent folders
    for (const file of this.fileCache.values()) {
      const parentPath = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : ''
      const parent = this.folderCache.get(parentPath)
      if (parent && !parent.children.some(c => c.path === file.path)) {
        parent.children.push(file)
      }
    }

    // Add folders to their parent folders
    for (const folder of this.folderCache.values()) {
      if (folder.path === '') continue // Skip root
      const parentPath = folder.path.includes('/') ? folder.path.substring(0, folder.path.lastIndexOf('/')) : ''
      const parent = this.folderCache.get(parentPath)
      if (parent && !parent.children.some(c => c.path === folder.path)) {
        parent.children.push(folder)
      }
    }
  }

  getFileByPath(path: string): TFile | null {
    // Normalize path
    path = this.normalizePath(path)

    // Sync scan the backend if not done
    this.syncScanBackend()

    // Try cache first
    if (this.fileCache.has(path)) {
      return this.fileCache.get(path)!
    }

    // Check if file was added to backend after initial scan
    const extBackend = this.backend as ExtendedBackend
    if (extBackend.files && extBackend.files instanceof Map && extBackend.files.has(path)) {
      const content = extBackend.files.get(path)!
      const size = typeof content === 'string' ? content.length : content.byteLength
      const now = Date.now()
      const stat: FileStat = { ctime: now, mtime: now, size }
      const file = this.createTFile(path, stat)
      this.fileCache.set(path, file)
      this.registerFoldersForPath(path)
      this.buildFolderChildren()
      return file
    }

    return null
  }

  getAbstractFileByPath(path: string): TAbstractFile | null {
    // Normalize path: remove leading and trailing slashes
    path = this.normalizePath(path)

    this.syncScanBackend()

    // Check files first
    const file = this.fileCache.get(path)
    if (file) return file

    // Check folders
    const folder = this.folderCache.get(path)
    if (folder) return folder

    return null
  }

  private normalizePath(path: string): string {
    // Remove leading slash
    if (path.startsWith('/')) {
      path = path.substring(1)
    }
    // Remove trailing slash
    if (path.endsWith('/') && path.length > 1) {
      path = path.slice(0, -1)
    }
    return path
  }

  getMarkdownFiles(): TFile[] {
    this.rescanBackend()
    return Array.from(this.fileCache.values()).filter(f => f.extension === 'md')
  }

  private rescanBackend(): void {
    const extBackend = this.backend as ExtendedBackend
    if (extBackend.files && extBackend.files instanceof Map) {
      let hasNewFiles = false
      for (const [path, content] of extBackend.files.entries()) {
        if (!this.fileCache.has(path)) {
          const size = typeof content === 'string' ? content.length : content.byteLength
          const now = Date.now()
          const stat: FileStat = { ctime: now, mtime: now, size }
          const file = this.createTFile(path, stat)
          this.fileCache.set(path, file)
          this.registerFoldersForPath(path)
          hasNewFiles = true
        }
      }
      if (hasNewFiles) {
        this.buildFolderChildren()
      }
    }
  }

  getFiles(): TFile[] {
    this.syncScanBackend()
    return Array.from(this.fileCache.values())
  }

  getAllLoadedFiles(): TAbstractFile[] {
    this.syncScanBackend()
    const files: TAbstractFile[] = Array.from(this.fileCache.values())
    const folders: TAbstractFile[] = Array.from(this.folderCache.values())
    return [...files, ...folders]
  }

  getAllFolders(includeRoot = true): TFolder[] {
    this.syncScanBackend()
    const folders = Array.from(this.folderCache.values())
    if (!includeRoot) {
      return folders.filter(f => !f.isRoot())
    }
    return folders
  }

  async read(file: TFile): Promise<string> {
    return this.backend.read(file.path)
  }

  async cachedRead(file: TFile): Promise<string> {
    // Check if content is cached
    if (this.contentCache.has(file.path)) {
      return this.contentCache.get(file.path)!
    }
    // Read from backend and cache
    const content = await this.backend.read(file.path)
    this.contentCache.set(file.path, content)
    return content
  }

  async readBinary(file: TFile): Promise<ArrayBuffer> {
    return this.backend.readBinary(file.path)
  }

  async create(path: string, content: string): Promise<TFile> {
    // Check if file already exists
    const exists = await this.backend.exists(path)
    if (exists) {
      throw new Error(`File already exists: ${path}`)
    }

    // Mark this path as being created by vault to avoid duplicate events from backend
    this.backendCreatesInProgress.add(path)
    try {
      await this.backend.write(path, content)
      const file = await this.refreshFile(path)
      if (!file) throw new Error('Failed to create file')
      this.registerFoldersForPath(path)
      this.buildFolderChildren()
      this.trigger('create', file)
      return file
    } finally {
      this.backendCreatesInProgress.delete(path)
    }
  }

  async modify(file: TFile, content: string): Promise<void> {
    // Check if file exists before modifying
    const exists = await this.backend.exists(file.path)
    if (!exists) {
      throw new Error(`File not found: ${file.path}`)
    }

    // Mark this path as being modified by vault to avoid duplicate events from backend
    this.backendModifiesInProgress.add(file.path)
    try {
      await this.backend.write(file.path, content)
      // Invalidate content cache
      this.contentCache.delete(file.path)
      const updatedFile = await this.refreshFile(file.path)
      if (updatedFile) {
        // Update the original file object in place
        file.stat = updatedFile.stat
        this.trigger('modify', file)
      }
    } finally {
      this.backendModifiesInProgress.delete(file.path)
    }
  }

  async append(file: TFile, content: string): Promise<void> {
    const existing = await this.backend.read(file.path)
    this.backendModifiesInProgress.add(file.path)
    try {
      await this.backend.write(file.path, existing + content)
      const updatedFile = await this.refreshFile(file.path)
      if (updatedFile) {
        this.trigger('modify', updatedFile)
      }
    } finally {
      this.backendModifiesInProgress.delete(file.path)
    }
  }

  async process(file: TFile, fn: (content: string) => string): Promise<string> {
    const content = await this.backend.read(file.path)
    const newContent = fn(content)
    this.backendModifiesInProgress.add(file.path)
    try {
      await this.backend.write(file.path, newContent)
      const updatedFile = await this.refreshFile(file.path)
      if (updatedFile) {
        this.trigger('modify', updatedFile)
      }
      return newContent
    } finally {
      this.backendModifiesInProgress.delete(file.path)
    }
  }

  async delete(file: TFile): Promise<void> {
    // Check if file exists before deleting
    const exists = await this.backend.exists(file.path)
    if (!exists) {
      throw new Error(`File not found: ${file.path}`)
    }

    const deletedFile = { ...file }
    this.backendDeletesInProgress.add(file.path)
    try {
      await this.backend.delete(file.path)
      this.fileCache.delete(file.path)

      // Remove from parent folder
      const parentPath = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : ''
      const parent = this.folderCache.get(parentPath)
      if (parent) {
        parent.children = parent.children.filter(c => c.path !== file.path)
      }

      this.trigger('delete', deletedFile)
    } finally {
      this.backendDeletesInProgress.delete(file.path)
    }
  }

  async trash(file: TFile): Promise<void> {
    await this.delete(file)
  }

  async rename(file: TFile, newPath: string): Promise<void> {
    // Check if source file exists
    const sourceExists = await this.backend.exists(file.path)
    if (!sourceExists) {
      throw new Error(`File not found: ${file.path}`)
    }

    // Check if target path already exists
    const targetExists = await this.backend.exists(newPath)
    if (targetExists) {
      throw new Error(`File already exists: ${newPath}`)
    }

    const oldPath = file.path
    await this.backend.rename(file.path, newPath)
    this.fileCache.delete(oldPath)
    // Invalidate content cache
    this.contentCache.delete(oldPath)

    // Remove from old parent folder
    const oldParentPath = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : ''
    const oldParent = this.folderCache.get(oldParentPath)
    if (oldParent) {
      oldParent.children = oldParent.children.filter(c => c.path !== oldPath)
    }

    const newFile = await this.refreshFile(newPath)
    if (newFile) {
      // Update the original file object in place
      file.path = newFile.path
      file.name = newFile.name
      file.basename = newFile.basename
      file.extension = newFile.extension
      file.stat = newFile.stat
      this.registerFoldersForPath(newPath)
      this.buildFolderChildren()
      this.trigger('rename', { file: newFile, oldPath })
    }
  }

  async copy(file: TFile, newPath: string): Promise<TFile> {
    // Check if target path already exists
    const targetExists = await this.backend.exists(newPath)
    if (targetExists) {
      throw new Error(`File already exists: ${newPath}`)
    }

    // Mark this path as being created by vault to avoid duplicate events from backend
    this.backendCreatesInProgress.add(newPath)
    try {
      await this.backend.copy(file.path, newPath)
      const newFile = await this.refreshFile(newPath)
      if (!newFile) throw new Error('Failed to copy file')
      this.registerFoldersForPath(newPath)
      this.buildFolderChildren()
      this.trigger('create', newFile)
      return newFile
    } finally {
      this.backendCreatesInProgress.delete(newPath)
    }
  }

}
