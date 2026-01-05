export class MemoryBackend {
    // Public for synchronous access by Vault
    files = new Map();
    stats = new Map();
    eventListeners = new Map();
    constructor(initialFiles) {
        if (initialFiles) {
            const now = Date.now();
            for (const [path, content] of Object.entries(initialFiles)) {
                this.files.set(path, content);
                this.stats.set(path, { ctime: now, mtime: now, size: content.length });
            }
        }
    }
    async read(path) {
        const content = this.files.get(path);
        if (content === undefined)
            throw new Error(`File not found: ${path}`);
        if (content instanceof ArrayBuffer)
            throw new Error(`File is binary: ${path}`);
        return content;
    }
    async readBinary(path) {
        const content = this.files.get(path);
        if (content === undefined)
            throw new Error(`File not found: ${path}`);
        if (typeof content === 'string') {
            return new TextEncoder().encode(content).buffer;
        }
        return content;
    }
    async write(path, content) {
        const now = Date.now();
        const existing = this.stats.get(path);
        const isNew = !this.files.has(path);
        this.files.set(path, content);
        this.stats.set(path, {
            ctime: existing?.ctime ?? now,
            mtime: now,
            size: content.length
        });
        // Emit event
        if (isNew) {
            this.trigger('create', path);
        }
        else {
            this.trigger('modify', path);
        }
    }
    async writeBinary(path, content) {
        const now = Date.now();
        const existing = this.stats.get(path);
        const isNew = !this.files.has(path);
        this.files.set(path, content);
        this.stats.set(path, {
            ctime: existing?.ctime ?? now,
            mtime: now,
            size: content.byteLength
        });
        // Emit event
        if (isNew) {
            this.trigger('create', path);
        }
        else {
            this.trigger('modify', path);
        }
    }
    async delete(path) {
        this.files.delete(path);
        this.stats.delete(path);
        this.trigger('delete', path);
    }
    async exists(path) {
        return this.files.has(path);
    }
    async stat(path) {
        return this.stats.get(path) ?? null;
    }
    async list(path) {
        const prefix = path === '' ? '' : path.endsWith('/') ? path : `${path}/`;
        const results = [];
        for (const key of this.files.keys()) {
            if (prefix === '' || key.startsWith(prefix)) {
                const rest = key.slice(prefix.length);
                const firstSlash = rest.indexOf('/');
                const name = firstSlash === -1 ? rest : rest.slice(0, firstSlash);
                if (name && !results.includes(name)) {
                    results.push(name);
                }
            }
        }
        return results;
    }
    async mkdir(_path) {
        // No-op for memory backend
    }
    async rename(from, to) {
        const content = this.files.get(from);
        const stat = this.stats.get(from);
        if (content === undefined)
            throw new Error(`File not found: ${from}`);
        this.files.set(to, content);
        if (stat)
            this.stats.set(to, { ...stat, mtime: Date.now() });
        this.files.delete(from);
        this.stats.delete(from);
        this.trigger('rename', from, to);
    }
    async copy(from, to) {
        const content = this.files.get(from);
        const stat = this.stats.get(from);
        if (content === undefined)
            throw new Error(`File not found: ${from}`);
        const now = Date.now();
        this.files.set(to, content);
        this.stats.set(to, { ctime: now, mtime: now, size: stat?.size ?? 0 });
        this.trigger('create', to);
    }
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set());
        }
        const ref = { unsubscribe: () => this.off(event, ref) };
        this.eventListeners.get(event).add({ callback, ref });
        return ref;
    }
    off(event, ref) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            for (const listener of listeners) {
                if (listener.ref === ref) {
                    listeners.delete(listener);
                    break;
                }
            }
        }
    }
    trigger(event, ...args) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            const listenersCopy = Array.from(listeners);
            for (const listener of listenersCopy) {
                try {
                    listener.callback(args[0]);
                }
                catch {
                    // Ignore errors from listeners
                }
            }
        }
    }
}
//# sourceMappingURL=memory-backend.js.map