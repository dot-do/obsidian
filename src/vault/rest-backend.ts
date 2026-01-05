import type { Backend, FileStat } from '../types.js'

/**
 * REST API backend for reading/writing vaults via HTTP
 */
export class RestApiBackend implements Backend {
  private baseUrl: string
  private apiKey: string

  constructor(apiUrl: string, apiKey: string) {
    this.baseUrl = apiUrl.replace(/\/$/, '')
    this.apiKey = apiKey
  }

  private async request(
    method: string,
    path: string,
    options: { body?: string | ArrayBuffer; headers?: Record<string, string> } = {}
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      ...options.headers
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: options.body
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`File not found: ${path}`)
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return response
  }

  async read(filePath: string): Promise<string> {
    const response = await this.request('GET', `/vault/${encodeURIComponent(filePath)}`, {
      headers: { 'Accept': 'text/plain' }
    })
    return response.text()
  }

  async readBinary(filePath: string): Promise<ArrayBuffer> {
    const response = await this.request('GET', `/vault/${encodeURIComponent(filePath)}`, {
      headers: { 'Accept': 'application/octet-stream' }
    })
    return response.arrayBuffer()
  }

  async write(filePath: string, content: string): Promise<void> {
    await this.request('PUT', `/vault/${encodeURIComponent(filePath)}`, {
      body: content,
      headers: { 'Content-Type': 'text/plain' }
    })
  }

  async writeBinary(filePath: string, content: ArrayBuffer): Promise<void> {
    await this.request('PUT', `/vault/${encodeURIComponent(filePath)}`, {
      body: content,
      headers: { 'Content-Type': 'application/octet-stream' }
    })
  }

  async delete(filePath: string): Promise<void> {
    await this.request('DELETE', `/vault/${encodeURIComponent(filePath)}`)
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await this.request('HEAD', `/vault/${encodeURIComponent(filePath)}`)
      return true
    } catch {
      return false
    }
  }

  async stat(filePath: string): Promise<FileStat | null> {
    try {
      const response = await this.request('HEAD', `/vault/${encodeURIComponent(filePath)}`)
      const mtime = response.headers.get('Last-Modified')
      const size = response.headers.get('Content-Length')

      return {
        ctime: mtime ? new Date(mtime).getTime() : Date.now(),
        mtime: mtime ? new Date(mtime).getTime() : Date.now(),
        size: size ? parseInt(size, 10) : 0
      }
    } catch {
      return null
    }
  }

  async list(dirPath: string): Promise<string[]> {
    const response = await this.request('GET', `/vault/${encodeURIComponent(dirPath)}?list=true`, {
      headers: { 'Accept': 'application/json' }
    })
    const data = await response.json() as { files?: string[] }
    return data.files || []
  }

  async mkdir(dirPath: string): Promise<void> {
    await this.request('PUT', `/vault/${encodeURIComponent(dirPath)}?mkdir=true`)
  }

  async rename(from: string, to: string): Promise<void> {
    await this.request('POST', `/vault/${encodeURIComponent(from)}?rename=${encodeURIComponent(to)}`)
  }

  async copy(from: string, to: string): Promise<void> {
    await this.request('POST', `/vault/${encodeURIComponent(from)}?copy=${encodeURIComponent(to)}`)
  }
}
