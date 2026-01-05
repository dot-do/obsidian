import * as fs from 'fs/promises';
import * as path from 'path';
/**
 * File system backend for reading/writing vaults from disk
 */
export class FileSystemBackend {
    basePath;
    // Public files map for synchronous access by Vault (mirrors MemoryBackend pattern)
    files = new Map();
    stats = new Map();
    initialized = false;
    constructor(basePath) {
        this.basePath = basePath;
    }
    /**
     * Initialize the backend by scanning for existing files.
     * This populates the files map so Vault.syncScanBackend() can discover them.
     */
    async initialize() {
        if (this.initialized)
            return;
        // Scan for all files in the vault directory
        const allFiles = await this.scanDirectory('');
        // Populate the files map with markdown files
        for (const filePath of allFiles) {
            if (filePath.endsWith('.md')) {
                try {
                    const content = await this.read(filePath);
                    const stat = await this.stat(filePath);
                    this.files.set(filePath, content);
                    if (stat) {
                        this.stats.set(filePath, stat);
                    }
                }
                catch {
                    // Skip files that can't be read
                }
            }
        }
        this.initialized = true;
    }
    resolvePath(filePath) {
        const resolved = path.resolve(this.basePath, filePath);
        const normalizedBase = path.resolve(this.basePath);
        if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
            throw new Error('Path traversal detected: path escapes vault root');
        }
        return resolved;
    }
    async read(filePath) {
        const fullPath = this.resolvePath(filePath);
        try {
            return await fs.readFile(fullPath, 'utf-8');
        }
        catch (err) {
            if (err.code === 'ENOENT') {
                throw new Error(`File not found: ${filePath}`);
            }
            throw err;
        }
    }
    async readBinary(filePath) {
        const fullPath = this.resolvePath(filePath);
        try {
            const buffer = await fs.readFile(fullPath);
            return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        }
        catch (err) {
            if (err.code === 'ENOENT') {
                throw new Error(`File not found: ${filePath}`);
            }
            throw err;
        }
    }
    async write(filePath, content) {
        const fullPath = this.resolvePath(filePath);
        // Ensure directory exists
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
        // Keep files map in sync for markdown files
        if (filePath.endsWith('.md')) {
            this.files.set(filePath, content);
            const stat = await this.stat(filePath);
            if (stat) {
                this.stats.set(filePath, stat);
            }
        }
    }
    async writeBinary(filePath, content) {
        const fullPath = this.resolvePath(filePath);
        // Ensure directory exists
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, Buffer.from(content));
        // Keep files map in sync
        this.files.set(filePath, content);
        const stat = await this.stat(filePath);
        if (stat) {
            this.stats.set(filePath, stat);
        }
    }
    async delete(filePath) {
        const fullPath = this.resolvePath(filePath);
        try {
            await fs.unlink(fullPath);
            // Remove from files map
            this.files.delete(filePath);
            this.stats.delete(filePath);
        }
        catch (err) {
            if (err.code === 'ENOENT') {
                throw new Error(`File not found: ${filePath}`);
            }
            throw err;
        }
    }
    async exists(filePath) {
        const fullPath = this.resolvePath(filePath);
        try {
            await fs.access(fullPath);
            return true;
        }
        catch {
            return false;
        }
    }
    async stat(filePath) {
        const fullPath = this.resolvePath(filePath);
        try {
            const stats = await fs.stat(fullPath);
            return {
                ctime: stats.ctimeMs,
                mtime: stats.mtimeMs,
                size: stats.size
            };
        }
        catch {
            return null;
        }
    }
    async list(dirPath) {
        const fullPath = this.resolvePath(dirPath);
        try {
            const entries = await fs.readdir(fullPath, { withFileTypes: true });
            return entries.map(e => e.name);
        }
        catch {
            return [];
        }
    }
    async mkdir(dirPath) {
        const fullPath = this.resolvePath(dirPath);
        await fs.mkdir(fullPath, { recursive: true });
    }
    async rename(from, to) {
        const fromPath = this.resolvePath(from);
        const toPath = this.resolvePath(to);
        // Ensure target directory exists
        await fs.mkdir(path.dirname(toPath), { recursive: true });
        await fs.rename(fromPath, toPath);
        // Update files map
        const content = this.files.get(from);
        const stat = this.stats.get(from);
        if (content !== undefined) {
            this.files.delete(from);
            this.files.set(to, content);
        }
        if (stat) {
            this.stats.delete(from);
            this.stats.set(to, { ...stat, mtime: Date.now() });
        }
    }
    async copy(from, to) {
        const fromPath = this.resolvePath(from);
        const toPath = this.resolvePath(to);
        // Ensure target directory exists
        await fs.mkdir(path.dirname(toPath), { recursive: true });
        await fs.copyFile(fromPath, toPath);
        // Update files map
        const content = this.files.get(from);
        if (content !== undefined) {
            this.files.set(to, content);
            const stat = await this.stat(to);
            if (stat) {
                this.stats.set(to, stat);
            }
        }
    }
    /**
     * Recursively scan directory and return all file paths
     */
    async scanDirectory(dirPath = '') {
        const fullPath = this.resolvePath(dirPath);
        const results = [];
        try {
            const entries = await fs.readdir(fullPath, { withFileTypes: true });
            for (const entry of entries) {
                const relativePath = dirPath ? `${dirPath}/${entry.name}` : entry.name;
                // Skip hidden directories like .obsidian
                if (entry.name.startsWith('.'))
                    continue;
                if (entry.isDirectory()) {
                    const subFiles = await this.scanDirectory(relativePath);
                    results.push(...subFiles);
                }
                else if (entry.isFile()) {
                    results.push(relativePath);
                }
            }
        }
        catch {
            // Directory doesn't exist or not readable
        }
        return results;
    }
}
//# sourceMappingURL=fs-backend.js.map