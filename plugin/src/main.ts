/**
 * Obsidian Bridge Plugin
 *
 * Exposes Obsidian APIs via WebSocket for external tool integration.
 */

import { Notice, Plugin } from 'obsidian'
import { BridgeServer, DEFAULT_CONFIG } from './server'
import { EventBroadcaster } from './events'
import { BridgeSettings, BridgeSettingTab, DEFAULT_SETTINGS } from './settings'

export default class ObsidianBridgePlugin extends Plugin {
  settings: BridgeSettings = DEFAULT_SETTINGS
  server: BridgeServer | null = null
  events: EventBroadcaster | null = null

  async onload(): Promise<void> {
    console.log('[Bridge] Loading Obsidian Bridge plugin')

    await this.loadSettings()

    // Initialize server
    this.server = new BridgeServer(this.app, {
      port: this.settings.port,
      autoStart: this.settings.autoStart,
    })

    // Initialize event broadcaster
    this.events = new EventBroadcaster(this.app, this.server)

    // Add settings tab
    this.addSettingTab(new BridgeSettingTab(this.app, this))

    // Add commands
    this.addCommand({
      id: 'start-bridge-server',
      name: 'Start Bridge Server',
      callback: () => this.startServer(),
    })

    this.addCommand({
      id: 'stop-bridge-server',
      name: 'Stop Bridge Server',
      callback: () => this.stopServer(),
    })

    this.addCommand({
      id: 'bridge-status',
      name: 'Show Bridge Status',
      callback: () => {
        const status = this.server?.isRunning
          ? `Bridge running on port ${this.settings.port} (${this.server.clientCount} clients)`
          : 'Bridge server is stopped'
        new Notice(status)
      },
    })

    // Auto-start if configured
    if (this.settings.autoStart) {
      // Delay slightly to ensure Obsidian is fully loaded
      setTimeout(() => this.startServer(), 1000)
    }
  }

  async onunload(): Promise<void> {
    console.log('[Bridge] Unloading Obsidian Bridge plugin')
    await this.stopServer()
  }

  async startServer(): Promise<void> {
    if (!this.server) return

    try {
      this.events?.start()
      await this.server.start()
      new Notice(`Bridge server started on port ${this.settings.port}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('[Bridge] Failed to start server:', message)
      new Notice(`Failed to start bridge: ${message}`)
    }
  }

  async stopServer(): Promise<void> {
    if (!this.server) return

    this.events?.stop()
    await this.server.stop()
    new Notice('Bridge server stopped')
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
  }
}
