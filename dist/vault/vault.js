import { Events } from './events.js';
import { LRUCache } from './lru-cache.js';
/**
 * Vault provides file management for an Obsidian-compatible vault.
 * Wraps a backend storage system and provides caching, event emission, and folder management.
 */
export class Vault extends Events {
    backend;
    fileCache;
    folderCache = new Map();
    contentCache;
    pathToParentCache = new Map();
    syncScanned = false;
    backendCreatesInProgress = new Set();
    backendModifiesInProgress = new Set();
    backendDeletesInProgress = new Set();
    options;
    /**
     * Creates a new Vault instance.
     * @param backend - The storage backend to use (filesystem, memory, or REST).
     * @param options - Optional configuration for caching behavior.
     */
    constructor(backend, options = {}) {
        super();
        this.backend = backend;
        this.options = {
            contentCacheSize: options.contentCacheSize ?? 500,
            fileCacheSize: options.fileCacheSize ?? 5000,
            enableWatchDebounce: options.enableWatchDebounce ?? false,
            watchDebounceMs: options.watchDebounceMs ?? 100
        };
        this.fileCache = new LRUCache(this.options.fileCacheSize);
        this.contentCache = new LRUCache(this.options.contentCacheSize);
        // Listen to backend events if supported
        this.setupBackendListeners();
    }
    setupBackendListeners() {
        const extBackend = this.backend;
        if (typeof extBackend.on !== 'function')
            return;
        // Listen for backend create events
        extBackend.on('create', (path) => {
            // Skip if this create was initiated by vault.create()
            if (this.backendCreatesInProgress.has(path))
                return;
            const file = this.refreshFileSync(path);
            if (file) {
                this.registerFoldersForPath(path);
                this.buildFolderChildren();
                this.trigger('create', file);
            }
        });
        // Listen for backend modify events
        extBackend.on('modify', (path) => {
            // Skip if this modify was initiated by vault.modify()
            if (this.backendModifiesInProgress.has(path))
                return;
            const file = this.fileCache.get(path);
            if (file) {
                this.refreshFileSync(path);
                // Don't invalidate content cache for backend-only modifications
                // This preserves the cachedRead behavior where cache should not be
                // invalidated when backend is modified directly (bypassing vault)
                this.trigger('modify', file);
            }
        });
        // Listen for backend delete events
        extBackend.on('delete', (path) => {
            // Skip if this delete was initiated by vault.delete()
            if (this.backendDeletesInProgress.has(path))
                return;
            const file = this.fileCache.get(path);
            if (file) {
                const deletedFile = { ...file };
                this.fileCache.delete(path);
                this.contentCache.delete(path);
                const parentPath = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
                const parent = this.folderCache.get(parentPath);
                if (parent) {
                    parent.children = parent.children.filter(c => c.path !== path);
                }
                this.trigger('delete', deletedFile);
            }
        });
        // Listen for backend rename events
        extBackend.on('rename', (oldPath) => {
            // This is handled in the vault's rename method, but if called directly on backend
            // we would need the new path too which isn't available from the callback signature
        });
    }
    refreshFileSync(path) {
        const extBackend = this.backend;
        if (extBackend.files && extBackend.files instanceof Map && extBackend.files.has(path)) {
            const content = extBackend.files.get(path);
            const size = typeof content === 'string' ? content.length : content.byteLength;
            const now = Date.now();
            const stat = { ctime: now, mtime: now, size };
            const file = this.createTFile(path, stat);
            this.fileCache.set(path, file);
            return file;
        }
        return null;
    }
    createTFile(path, stat) {
        const name = path.split('/').pop() || path;
        const lastDotIndex = name.lastIndexOf('.');
        const basename = lastDotIndex > 0 ? name.slice(0, lastDotIndex) : name;
        const extension = lastDotIndex > 0 ? name.slice(lastDotIndex + 1) : '';
        return { path, name, basename, extension, stat };
    }
    async refreshFile(path) {
        const stat = await this.backend.stat(path);
        if (!stat) {
            this.fileCache.delete(path);
            return null;
        }
        const file = this.createTFile(path, stat);
        this.fileCache.set(path, file);
        return file;
    }
    syncScanBackend() {
        if (this.syncScanned)
            return;
        // Always ensure root folder exists
        this.ensureRootFolder();
        const extBackend = this.backend;
        if (extBackend.files && extBackend.files instanceof Map) {
            for (const [path, content] of extBackend.files.entries()) {
                const size = typeof content === 'string' ? content.length : content.byteLength;
                const now = Date.now();
                const stat = { ctime: now, mtime: now, size };
                const file = this.createTFile(path, stat);
                this.fileCache.set(path, file);
                // Register parent folders
                this.registerFoldersForPath(path);
            }
            this.buildFolderChildren();
        }
        this.syncScanned = true;
    }
    ensureRootFolder() {
        if (!this.folderCache.has('')) {
            this.folderCache.set('', {
                path: '',
                name: '',
                children: [],
                isRoot: () => true
            });
        }
    }
    registerFoldersForPath(path) {
        const parts = path.split('/');
        for (let i = 0; i < parts.length - 1; i++) {
            const folderPath = parts.slice(0, i + 1).join('/');
            if (!this.folderCache.has(folderPath)) {
                const name = parts[i];
                const folder = {
                    path: folderPath,
                    name,
                    children: [],
                    isRoot: () => false
                };
                this.folderCache.set(folderPath, folder);
            }
        }
        // Register root folder
        if (!this.folderCache.has('')) {
            this.folderCache.set('', {
                path: '',
                name: '',
                children: [],
                isRoot: () => true
            });
        }
    }
    buildFolderChildren() {
        // Clear existing children
        for (const folder of this.folderCache.values()) {
            folder.children = [];
        }
        // Add files to their parent folders
        for (const file of this.fileCache.values()) {
            const parentPath = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : '';
            const parent = this.folderCache.get(parentPath);
            if (parent && !parent.children.some(c => c.path === file.path)) {
                parent.children.push(file);
            }
            // Cache the parent path
            this.pathToParentCache.set(file.path, parentPath);
        }
        // Add folders to their parent folders
        for (const folder of this.folderCache.values()) {
            if (folder.path === '')
                continue; // Skip root
            const parentPath = folder.path.includes('/') ? folder.path.substring(0, folder.path.lastIndexOf('/')) : '';
            const parent = this.folderCache.get(parentPath);
            if (parent && !parent.children.some(c => c.path === folder.path)) {
                parent.children.push(folder);
            }
            // Cache the parent path
            this.pathToParentCache.set(folder.path, parentPath);
        }
    }
    /**
     * Gets a file by its vault-relative path.
     * @param path - The vault-relative path to the file.
     * @returns The TFile if found, or null if not found.
     */
    getFileByPath(path) {
        // Normalize path
        path = this.normalizePath(path);
        // Sync scan the backend if not done
        this.syncScanBackend();
        // Try cache first
        if (this.fileCache.has(path)) {
            return this.fileCache.get(path);
        }
        // Check if file was added to backend after initial scan
        const extBackend = this.backend;
        if (extBackend.files && extBackend.files instanceof Map && extBackend.files.has(path)) {
            const content = extBackend.files.get(path);
            const size = typeof content === 'string' ? content.length : content.byteLength;
            const now = Date.now();
            const stat = { ctime: now, mtime: now, size };
            const file = this.createTFile(path, stat);
            this.fileCache.set(path, file);
            this.registerFoldersForPath(path);
            this.buildFolderChildren();
            return file;
        }
        return null;
    }
    /**
     * Gets a file or folder by its vault-relative path.
     * @param path - The vault-relative path.
     * @returns The TFile or TFolder if found, or null if not found.
     */
    getAbstractFileByPath(path) {
        // Normalize path: remove leading and trailing slashes
        path = this.normalizePath(path);
        this.syncScanBackend();
        // Check files first
        const file = this.fileCache.get(path);
        if (file)
            return file;
        // Check folders
        const folder = this.folderCache.get(path);
        if (folder)
            return folder;
        return null;
    }
    normalizePath(path) {
        // Remove leading slash
        if (path.startsWith('/')) {
            path = path.substring(1);
        }
        // Remove trailing slash
        if (path.endsWith('/') && path.length > 1) {
            path = path.slice(0, -1);
        }
        return path;
    }
    /**
     * Gets all markdown files in the vault.
     * @returns An array of TFile objects for all .md files.
     */
    getMarkdownFiles() {
        this.rescanBackend();
        return Array.from(this.fileCache.values()).filter(f => f.extension === 'md');
    }
    rescanBackend() {
        const extBackend = this.backend;
        if (extBackend.files && extBackend.files instanceof Map) {
            let hasNewFiles = false;
            for (const [path, content] of extBackend.files.entries()) {
                if (!this.fileCache.has(path)) {
                    const size = typeof content === 'string' ? content.length : content.byteLength;
                    const now = Date.now();
                    const stat = { ctime: now, mtime: now, size };
                    const file = this.createTFile(path, stat);
                    this.fileCache.set(path, file);
                    this.registerFoldersForPath(path);
                    hasNewFiles = true;
                }
            }
            if (hasNewFiles) {
                this.buildFolderChildren();
            }
        }
    }
    /**
     * Gets all files in the vault (any extension).
     * @returns An array of all TFile objects.
     */
    getFiles() {
        this.syncScanBackend();
        return Array.from(this.fileCache.values());
    }
    /**
     * Gets all loaded files and folders in the vault.
     * @returns An array of TFile and TFolder objects.
     */
    getAllLoadedFiles() {
        this.syncScanBackend();
        const files = Array.from(this.fileCache.values());
        const folders = Array.from(this.folderCache.values());
        return [...files, ...folders];
    }
    /**
     * Gets all folders in the vault.
     * @param includeRoot - Whether to include the root folder (default: true).
     * @returns An array of TFolder objects.
     */
    getAllFolders(includeRoot = true) {
        this.syncScanBackend();
        const folders = Array.from(this.folderCache.values());
        if (!includeRoot) {
            return folders.filter(f => !f.isRoot());
        }
        return folders;
    }
    /**
     * Reads the content of a file.
     * @param file - The TFile to read.
     * @returns A promise resolving to the file content as a string.
     */
    async read(file) {
        return this.backend.read(file.path);
    }
    /**
     * Reads the content of a file with caching for better performance.
     * @param file - The TFile to read.
     * @returns A promise resolving to the file content as a string.
     */
    async cachedRead(file) {
        // Check if content is cached
        if (this.contentCache.has(file.path)) {
            return this.contentCache.get(file.path);
        }
        // Read from backend and cache
        const content = await this.backend.read(file.path);
        this.contentCache.set(file.path, content);
        return content;
    }
    /**
     * Reads the content of a file as binary data.
     * @param file - The TFile to read.
     * @returns A promise resolving to the file content as an ArrayBuffer.
     */
    async readBinary(file) {
        return this.backend.readBinary(file.path);
    }
    /**
     * Creates a new file in the vault.
     * @param path - The vault-relative path for the new file.
     * @param content - The content to write to the file.
     * @returns A promise resolving to the created TFile.
     * @throws Error if file already exists.
     */
    async create(path, content) {
        // Check if file already exists
        const exists = await this.backend.exists(path);
        if (exists) {
            throw new Error(`File already exists: ${path}`);
        }
        // Mark this path as being created by vault to avoid duplicate events from backend
        this.backendCreatesInProgress.add(path);
        try {
            await this.backend.write(path, content);
            const file = await this.refreshFile(path);
            if (!file)
                throw new Error('Failed to create file');
            this.registerFoldersForPath(path);
            this.buildFolderChildren();
            this.trigger('create', file);
            return file;
        }
        finally {
            this.backendCreatesInProgress.delete(path);
        }
    }
    /**
     * Modifies the content of an existing file.
     * @param file - The TFile to modify.
     * @param content - The new content for the file.
     * @returns A promise that resolves when modification is complete.
     * @throws Error if file not found.
     */
    async modify(file, content) {
        // Check if file exists before modifying
        const exists = await this.backend.exists(file.path);
        if (!exists) {
            throw new Error(`File not found: ${file.path}`);
        }
        // Mark this path as being modified by vault to avoid duplicate events from backend
        this.backendModifiesInProgress.add(file.path);
        try {
            await this.backend.write(file.path, content);
            // Invalidate content cache
            this.contentCache.delete(file.path);
            const updatedFile = await this.refreshFile(file.path);
            if (updatedFile) {
                // Update the original file object in place
                file.stat = updatedFile.stat;
                this.trigger('modify', file);
            }
        }
        finally {
            this.backendModifiesInProgress.delete(file.path);
        }
    }
    /**
     * Appends content to the end of a file.
     * @param file - The TFile to append to.
     * @param content - The content to append.
     * @returns A promise that resolves when the append is complete.
     */
    async append(file, content) {
        const existing = await this.backend.read(file.path);
        this.backendModifiesInProgress.add(file.path);
        try {
            await this.backend.write(file.path, existing + content);
            // Invalidate content cache
            this.contentCache.delete(file.path);
            const updatedFile = await this.refreshFile(file.path);
            if (updatedFile) {
                this.trigger('modify', updatedFile);
            }
        }
        finally {
            this.backendModifiesInProgress.delete(file.path);
        }
    }
    /**
     * Processes a file's content using a transformation function.
     * @param file - The TFile to process.
     * @param fn - A function that takes current content and returns new content.
     * @returns A promise resolving to the new content after transformation.
     */
    async process(file, fn) {
        const content = await this.backend.read(file.path);
        const newContent = fn(content);
        this.backendModifiesInProgress.add(file.path);
        try {
            await this.backend.write(file.path, newContent);
            const updatedFile = await this.refreshFile(file.path);
            if (updatedFile) {
                this.trigger('modify', updatedFile);
            }
            return newContent;
        }
        finally {
            this.backendModifiesInProgress.delete(file.path);
        }
    }
    /**
     * Deletes a file from the vault.
     * @param file - The TFile to delete.
     * @returns A promise that resolves when deletion is complete.
     * @throws Error if file not found.
     */
    async delete(file) {
        // Check if file exists before deleting
        const exists = await this.backend.exists(file.path);
        if (!exists) {
            throw new Error(`File not found: ${file.path}`);
        }
        const deletedFile = { ...file };
        this.backendDeletesInProgress.add(file.path);
        try {
            await this.backend.delete(file.path);
            this.fileCache.delete(file.path);
            // Invalidate content cache
            this.contentCache.delete(file.path);
            // Remove from parent folder
            const parentPath = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : '';
            const parent = this.folderCache.get(parentPath);
            if (parent) {
                parent.children = parent.children.filter(c => c.path !== file.path);
            }
            this.trigger('delete', deletedFile);
        }
        finally {
            this.backendDeletesInProgress.delete(file.path);
        }
    }
    /**
     * Moves a file to trash (alias for delete).
     * @param file - The TFile to trash.
     * @returns A promise that resolves when the file is trashed.
     */
    async trash(file) {
        await this.delete(file);
    }
    /**
     * Renames or moves a file to a new path.
     * @param file - The TFile to rename.
     * @param newPath - The new vault-relative path.
     * @returns A promise that resolves when the rename is complete.
     * @throws Error if source file not found or target path already exists.
     */
    async rename(file, newPath) {
        // Check if source file exists
        const sourceExists = await this.backend.exists(file.path);
        if (!sourceExists) {
            throw new Error(`File not found: ${file.path}`);
        }
        // Check if target path already exists
        const targetExists = await this.backend.exists(newPath);
        if (targetExists) {
            throw new Error(`File already exists: ${newPath}`);
        }
        const oldPath = file.path;
        await this.backend.rename(file.path, newPath);
        this.fileCache.delete(oldPath);
        // Invalidate content cache
        this.contentCache.delete(oldPath);
        // Remove from old parent folder
        const oldParentPath = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : '';
        const oldParent = this.folderCache.get(oldParentPath);
        if (oldParent) {
            oldParent.children = oldParent.children.filter(c => c.path !== oldPath);
        }
        const newFile = await this.refreshFile(newPath);
        if (newFile) {
            // Update the original file object in place
            file.path = newFile.path;
            file.name = newFile.name;
            file.basename = newFile.basename;
            file.extension = newFile.extension;
            file.stat = newFile.stat;
            this.registerFoldersForPath(newPath);
            this.buildFolderChildren();
            this.trigger('rename', { file: newFile, oldPath });
        }
    }
    /**
     * Copies a file to a new path.
     * @param file - The TFile to copy.
     * @param newPath - The vault-relative path for the copy.
     * @returns A promise resolving to the newly created TFile.
     * @throws Error if target path already exists.
     */
    async copy(file, newPath) {
        // Check if target path already exists
        const targetExists = await this.backend.exists(newPath);
        if (targetExists) {
            throw new Error(`File already exists: ${newPath}`);
        }
        // Mark this path as being created by vault to avoid duplicate events from backend
        this.backendCreatesInProgress.add(newPath);
        try {
            await this.backend.copy(file.path, newPath);
            const newFile = await this.refreshFile(newPath);
            if (!newFile)
                throw new Error('Failed to copy file');
            this.registerFoldersForPath(newPath);
            this.buildFolderChildren();
            this.trigger('create', newFile);
            return newFile;
        }
        finally {
            this.backendCreatesInProgress.delete(newPath);
        }
    }
    /**
     * Gets cache statistics for monitoring vault performance.
     * @returns An object containing size and capacity information for all caches.
     */
    getCacheStats() {
        return {
            contentCache: {
                size: this.contentCache.size,
                capacity: this.contentCache.capacity
            },
            fileCache: {
                size: this.fileCache.size,
                capacity: this.fileCache.capacity
            },
            folderCache: {
                size: this.folderCache.size
            },
            pathToParentCache: {
                size: this.pathToParentCache.size
            }
        };
    }
    /**
     * Clears all caches in the vault.
     * This includes file cache, folder cache, content cache, and path-to-parent cache.
     */
    clearCaches() {
        this.fileCache.clear();
        this.folderCache.clear();
        this.contentCache.clear();
        this.pathToParentCache.clear();
        this.syncScanned = false;
    }
    /**
     * Clears only the content cache.
     * File and folder metadata caches are preserved.
     */
    clearContentCache() {
        this.contentCache.clear();
    }
}
//# sourceMappingURL=vault.js.map