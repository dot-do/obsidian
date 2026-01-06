/**
 * Event Broadcaster
 *
 * Subscribes to Obsidian events and broadcasts them to connected WebSocket clients.
 */

import { App, TFile, TAbstractFile, EventRef } from 'obsidian'
import { BridgeServer } from './server'
import { VaultEvent } from './protocol'

export class EventBroadcaster {
  private refs: EventRef[] = []

  constructor(
    private app: App,
    private server: BridgeServer
  ) {}

  start(): void {
    // Vault events
    this.refs.push(
      this.app.vault.on('create', (file) => {
        if (file instanceof TFile) {
          this.broadcast('create', file)
        }
      })
    )

    this.refs.push(
      this.app.vault.on('modify', (file) => {
        if (file instanceof TFile) {
          this.broadcast('modify', file)
        }
      })
    )

    this.refs.push(
      this.app.vault.on('delete', (file) => {
        if (file instanceof TFile) {
          this.broadcast('delete', file)
        }
      })
    )

    this.refs.push(
      this.app.vault.on('rename', (file, oldPath) => {
        if (file instanceof TFile) {
          this.broadcast('rename', file, oldPath)
        }
      })
    )

    // MetadataCache events
    this.refs.push(
      this.app.metadataCache.on('changed', (file) => {
        this.broadcast('metadata-changed', file)
      })
    )

    console.log('[Bridge] Event broadcaster started')
  }

  stop(): void {
    for (const ref of this.refs) {
      this.app.vault.offref(ref)
    }
    this.refs = []
    console.log('[Bridge] Event broadcaster stopped')
  }

  private broadcast(type: VaultEvent['type'], file: TFile, oldPath?: string): void {
    const event: VaultEvent = {
      type,
      timestamp: Date.now(),
      file: {
        path: file.path,
        name: file.name,
        extension: file.extension,
      },
    }

    if (oldPath) {
      event.oldPath = oldPath
    }

    this.server.broadcast(event)
  }
}
