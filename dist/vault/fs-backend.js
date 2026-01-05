import * as fs from 'fs/promises';
import * as path from 'path';
/**
 * File system backend for reading/writing vaults from disk
 */
export class FileSystemBackend {
    basePath;
    constructor(basePath) {
        this.basePath = basePath;
    }
    resolvePath(filePath) {
        return path.join(this.basePath, filePath);
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
    }
    async writeBinary(filePath, content) {
        const fullPath = this.resolvePath(filePath);
        // Ensure directory exists
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, Buffer.from(content));
    }
    async delete(filePath) {
        const fullPath = this.resolvePath(filePath);
        try {
            await fs.unlink(fullPath);
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
    }
    async copy(from, to) {
        const fromPath = this.resolvePath(from);
        const toPath = this.resolvePath(to);
        // Ensure target directory exists
        await fs.mkdir(path.dirname(toPath), { recursive: true });
        await fs.copyFile(fromPath, toPath);
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