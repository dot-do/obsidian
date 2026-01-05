/**
 * REST API backend for reading/writing vaults via HTTP
 */
export class RestApiBackend {
    baseUrl;
    apiKey;
    constructor(apiUrl, apiKey) {
        this.baseUrl = apiUrl.replace(/\/$/, '');
        this.apiKey = apiKey;
    }
    async request(method, path, options = {}) {
        const headers = {
            'Authorization': `Bearer ${this.apiKey}`,
            ...options.headers
        };
        const response = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers,
            body: options.body
        });
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error(`File not found: ${path}`);
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response;
    }
    async read(filePath) {
        const response = await this.request('GET', `/vault/${encodeURIComponent(filePath)}`, {
            headers: { 'Accept': 'text/plain' }
        });
        return response.text();
    }
    async readBinary(filePath) {
        const response = await this.request('GET', `/vault/${encodeURIComponent(filePath)}`, {
            headers: { 'Accept': 'application/octet-stream' }
        });
        return response.arrayBuffer();
    }
    async write(filePath, content) {
        await this.request('PUT', `/vault/${encodeURIComponent(filePath)}`, {
            body: content,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
    async writeBinary(filePath, content) {
        await this.request('PUT', `/vault/${encodeURIComponent(filePath)}`, {
            body: content,
            headers: { 'Content-Type': 'application/octet-stream' }
        });
    }
    async delete(filePath) {
        await this.request('DELETE', `/vault/${encodeURIComponent(filePath)}`);
    }
    async exists(filePath) {
        try {
            await this.request('HEAD', `/vault/${encodeURIComponent(filePath)}`);
            return true;
        }
        catch {
            return false;
        }
    }
    async stat(filePath) {
        try {
            const response = await this.request('HEAD', `/vault/${encodeURIComponent(filePath)}`);
            const mtime = response.headers.get('Last-Modified');
            const size = response.headers.get('Content-Length');
            return {
                ctime: mtime ? new Date(mtime).getTime() : Date.now(),
                mtime: mtime ? new Date(mtime).getTime() : Date.now(),
                size: size ? parseInt(size, 10) : 0
            };
        }
        catch {
            return null;
        }
    }
    async list(dirPath) {
        const response = await this.request('GET', `/vault/${encodeURIComponent(dirPath)}?list=true`, {
            headers: { 'Accept': 'application/json' }
        });
        const data = await response.json();
        return data.files || [];
    }
    async mkdir(dirPath) {
        await this.request('PUT', `/vault/${encodeURIComponent(dirPath)}?mkdir=true`);
    }
    async rename(from, to) {
        await this.request('POST', `/vault/${encodeURIComponent(from)}?rename=${encodeURIComponent(to)}`);
    }
    async copy(from, to) {
        await this.request('POST', `/vault/${encodeURIComponent(from)}?copy=${encodeURIComponent(to)}`);
    }
}
//# sourceMappingURL=rest-backend.js.map