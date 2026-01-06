/**
 * Plugin Settings
 */

import { App, PluginSettingTab, Setting } from 'obsidian'
import type ObsidianBridgePlugin from './main'

export interface BridgeSettings {
  port: number
  autoStart: boolean
}

export const DEFAULT_SETTINGS: BridgeSettings = {
  port: 22360,
  autoStart: true,
}

export class BridgeSettingTab extends PluginSettingTab {
  plugin: ObsidianBridgePlugin

  constructor(app: App, plugin: ObsidianBridgePlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    containerEl.createEl('h2', { text: 'Obsidian Bridge Settings' })

    // Status display
    const statusEl = containerEl.createDiv({ cls: 'bridge-status' })
    this.updateStatus(statusEl)

    new Setting(containerEl)
      .setName('Port')
      .setDesc('WebSocket server port (requires restart)')
      .addText((text) =>
        text
          .setPlaceholder('22360')
          .setValue(String(this.plugin.settings.port))
          .onChange(async (value) => {
            const port = parseInt(value, 10)
            if (port > 0 && port < 65536) {
              this.plugin.settings.port = port
              await this.plugin.saveSettings()
            }
          })
      )

    new Setting(containerEl)
      .setName('Auto-start')
      .setDesc('Start server automatically when Obsidian opens')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoStart).onChange(async (value) => {
          this.plugin.settings.autoStart = value
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setName('Server Control')
      .setDesc('Start or stop the WebSocket server')
      .addButton((button) =>
        button
          .setButtonText(this.plugin.server?.isRunning ? 'Stop Server' : 'Start Server')
          .onClick(async () => {
            if (this.plugin.server?.isRunning) {
              await this.plugin.stopServer()
            } else {
              await this.plugin.startServer()
            }
            this.display() // Refresh UI
          })
      )
  }

  private updateStatus(el: HTMLElement): void {
    el.empty()
    const isRunning = this.plugin.server?.isRunning
    const clientCount = this.plugin.server?.clientCount || 0

    const statusText = isRunning
      ? `Server running on port ${this.plugin.settings.port} (${clientCount} client${clientCount !== 1 ? 's' : ''})`
      : 'Server stopped'

    el.createEl('p', {
      text: statusText,
      cls: isRunning ? 'bridge-status-running' : 'bridge-status-stopped',
    })
  }
}
