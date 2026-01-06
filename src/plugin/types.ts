/**
 * Mock Obsidian Types for Plugin Development
 *
 * These types mock the Obsidian API for testing purposes.
 * They provide the minimal interface needed for the ChatView plugin.
 */

/**
 * Base class for all workspace leaves (panels/tabs)
 */
export abstract class WorkspaceLeaf {
  view: ItemView | null = null

  /**
   * Get the display text for this leaf
   */
  abstract getDisplayText(): string

  /**
   * Get the view state for serialization
   */
  abstract getViewState(): Record<string, unknown>

  /**
   * Set the view state for deserialization
   */
  abstract setViewState(state: Record<string, unknown>): Promise<void>

  /**
   * Detach the leaf from the workspace
   */
  abstract detach(): void
}

/**
 * Base class for all views in Obsidian
 */
export abstract class ItemView {
  /**
   * The container element for this view
   */
  containerEl: HTMLElement

  /**
   * The leaf this view is attached to
   */
  leaf: WorkspaceLeaf

  /**
   * The app instance
   */
  app: App

  constructor(leaf: WorkspaceLeaf) {
    this.leaf = leaf
    this.containerEl = document.createElement('div')
    this.app = {} as App
  }

  /**
   * Get the view type identifier
   */
  abstract getViewType(): string

  /**
   * Get the display text for this view
   */
  abstract getDisplayText(): string

  /**
   * Get the icon for this view
   */
  abstract getIcon(): string

  /**
   * Called when the view is opened
   */
  abstract onOpen(): Promise<void>

  /**
   * Called when the view is closed
   */
  abstract onClose(): Promise<void>

  /**
   * Get the state of this view for serialization
   */
  getState(): Record<string, unknown> {
    throw new Error('Not implemented')
  }

  /**
   * Set the state of this view from deserialization
   */
  setState(state: unknown, result: ViewStateResult): Promise<void> {
    throw new Error('Not implemented')
  }
}

/**
 * Result object passed to setState
 */
export interface ViewStateResult {
  history: boolean
}

/**
 * The main Obsidian App instance
 */
export interface App {
  vault: Vault
  workspace: Workspace
  metadataCache: MetadataCache
}

/**
 * The vault (file system) interface
 */
export interface Vault {
  getName(): string
  getRoot(): TFolder
  getAbstractFileByPath(path: string): TAbstractFile | null
  read(file: TFile): Promise<string>
  cachedRead(file: TFile): Promise<string>
  create(path: string, data: string): Promise<TFile>
  modify(file: TFile, data: string): Promise<void>
  delete(file: TFile): Promise<void>
  rename(file: TFile, newPath: string): Promise<void>
  getMarkdownFiles(): TFile[]
}

/**
 * The workspace interface for managing views
 */
export interface Workspace {
  getLeaf(newLeaf?: boolean | 'split' | 'tab' | 'window'): WorkspaceLeaf
  getLeavesOfType(viewType: string): WorkspaceLeaf[]
  revealLeaf(leaf: WorkspaceLeaf): void
  detachLeavesOfType(viewType: string): void
  getRightLeaf(shouldCreate: boolean): WorkspaceLeaf | null
  getLeftLeaf(shouldCreate: boolean): WorkspaceLeaf | null
  on(name: string, callback: (...args: unknown[]) => void): EventRef
  off(name: string, callback: (...args: unknown[]) => void): void
  trigger(name: string, ...args: unknown[]): void
}

/**
 * Metadata cache for parsed frontmatter and links
 */
export interface MetadataCache {
  getFileCache(file: TFile): CachedMetadata | null
  getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null
  on(name: string, callback: (...args: unknown[]) => void): EventRef
  off(name: string, callback: (...args: unknown[]) => void): void
}

/**
 * Event reference for unsubscribing
 */
export interface EventRef {
  unsubscribe: () => void
}

/**
 * A file in the vault
 */
export interface TFile {
  path: string
  name: string
  basename: string
  extension: string
  stat: FileStat
  parent: TFolder | null
}

/**
 * A folder in the vault
 */
export interface TFolder {
  path: string
  name: string
  children: TAbstractFile[]
  parent: TFolder | null
  isRoot(): boolean
}

/**
 * Union type for files and folders
 */
export type TAbstractFile = TFile | TFolder

/**
 * File statistics
 */
export interface FileStat {
  ctime: number
  mtime: number
  size: number
}

/**
 * Cached metadata for a file
 */
export interface CachedMetadata {
  links?: LinkCache[]
  embeds?: EmbedCache[]
  tags?: TagCache[]
  headings?: HeadingCache[]
  sections?: SectionCache[]
  frontmatter?: Record<string, unknown>
  frontmatterPosition?: Pos
  frontmatterLinks?: FrontmatterLinkCache[]
  blocks?: Record<string, BlockCache>
}

/**
 * A link in the document
 */
export interface LinkCache {
  link: string
  original: string
  displayText?: string
  position: Pos
}

/**
 * An embed in the document
 */
export interface EmbedCache {
  link: string
  original: string
  displayText?: string
  position: Pos
}

/**
 * A tag in the document
 */
export interface TagCache {
  tag: string
  position: Pos
}

/**
 * A heading in the document
 */
export interface HeadingCache {
  heading: string
  level: number
  position: Pos
}

/**
 * A section in the document
 */
export interface SectionCache {
  type: string
  position: Pos
  id?: string
}

/**
 * A block in the document
 */
export interface BlockCache {
  id: string
  position: Pos
}

/**
 * A frontmatter link
 */
export interface FrontmatterLinkCache {
  key: string
  link: string
  original: string
  displayText?: string
}

/**
 * Position in the document
 */
export interface Pos {
  start: Loc
  end: Loc
}

/**
 * Location in the document
 */
export interface Loc {
  line: number
  col: number
  offset: number
}

/**
 * Base class for Obsidian plugins
 */
export abstract class Plugin {
  app: App
  manifest: PluginManifest

  constructor(app: App, manifest: PluginManifest) {
    this.app = app
    this.manifest = manifest
  }

  /**
   * Called when the plugin is loaded
   */
  abstract onload(): Promise<void>

  /**
   * Called when the plugin is unloaded
   */
  abstract onunload(): void

  /**
   * Register a view type with the workspace
   */
  registerView(
    viewType: string,
    viewCreator: (leaf: WorkspaceLeaf) => ItemView
  ): void {
    throw new Error('Not implemented')
  }

  /**
   * Add a ribbon icon
   */
  addRibbonIcon(
    icon: string,
    title: string,
    callback: (evt: MouseEvent) => void
  ): HTMLElement {
    throw new Error('Not implemented')
  }

  /**
   * Add a command
   */
  addCommand(command: Command): Command {
    throw new Error('Not implemented')
  }

  /**
   * Add a settings tab
   */
  addSettingTab(tab: PluginSettingTab): void {
    throw new Error('Not implemented')
  }

  /**
   * Load plugin data
   */
  loadData(): Promise<unknown> {
    throw new Error('Not implemented')
  }

  /**
   * Save plugin data
   */
  saveData(data: unknown): Promise<void> {
    throw new Error('Not implemented')
  }
}

/**
 * Plugin manifest from manifest.json
 */
export interface PluginManifest {
  id: string
  name: string
  version: string
  minAppVersion: string
  description: string
  author: string
  authorUrl?: string
  isDesktopOnly?: boolean
}

/**
 * A command that can be executed
 */
export interface Command {
  id: string
  name: string
  icon?: string
  hotkeys?: Hotkey[]
  callback?: () => void
  checkCallback?: (checking: boolean) => boolean | void
  editorCallback?: (editor: unknown, view: unknown) => void
  editorCheckCallback?: (checking: boolean, editor: unknown, view: unknown) => boolean | void
}

/**
 * A hotkey definition
 */
export interface Hotkey {
  modifiers: string[]
  key: string
}

/**
 * Base class for plugin settings tabs
 */
export abstract class PluginSettingTab {
  app: App
  plugin: Plugin
  containerEl: HTMLElement

  constructor(app: App, plugin: Plugin) {
    this.app = app
    this.plugin = plugin
    this.containerEl = document.createElement('div')
  }

  abstract display(): void

  hide(): void {
    throw new Error('Not implemented')
  }
}

/**
 * Component base class for lifecycle management
 */
export abstract class Component {
  /**
   * Register a child component
   */
  addChild<T extends Component>(component: T): T {
    throw new Error('Not implemented')
  }

  /**
   * Remove a child component
   */
  removeChild<T extends Component>(component: T): T {
    throw new Error('Not implemented')
  }

  /**
   * Register an event
   */
  registerEvent(eventRef: EventRef): void {
    throw new Error('Not implemented')
  }

  /**
   * Register an interval
   */
  registerInterval(id: number): number {
    throw new Error('Not implemented')
  }

  /**
   * Called when loaded
   */
  load(): void {
    throw new Error('Not implemented')
  }

  /**
   * Called when unloaded
   */
  unload(): void {
    throw new Error('Not implemented')
  }

  /**
   * Called on load
   */
  onload(): void {
    throw new Error('Not implemented')
  }

  /**
   * Called on unload
   */
  onunload(): void {
    throw new Error('Not implemented')
  }
}

/**
 * Markdown renderer utility
 */
export class MarkdownRenderer {
  /**
   * Render markdown to an element
   */
  static renderMarkdown(
    markdown: string,
    el: HTMLElement,
    sourcePath: string,
    component: Component
  ): Promise<void> {
    throw new Error('Not implemented')
  }
}

/**
 * Setting builder for plugin settings
 */
export class Setting {
  settingEl: HTMLElement
  infoEl: HTMLElement
  nameEl: HTMLElement
  descEl: HTMLElement
  controlEl: HTMLElement

  constructor(containerEl: HTMLElement) {
    this.settingEl = document.createElement('div')
    this.infoEl = document.createElement('div')
    this.nameEl = document.createElement('div')
    this.descEl = document.createElement('div')
    this.controlEl = document.createElement('div')
  }

  setName(name: string): this {
    throw new Error('Not implemented')
  }

  setDesc(desc: string): this {
    throw new Error('Not implemented')
  }

  addText(cb: (text: TextComponent) => void): this {
    throw new Error('Not implemented')
  }

  addTextArea(cb: (text: TextAreaComponent) => void): this {
    throw new Error('Not implemented')
  }

  addToggle(cb: (toggle: ToggleComponent) => void): this {
    throw new Error('Not implemented')
  }

  addButton(cb: (button: ButtonComponent) => void): this {
    throw new Error('Not implemented')
  }

  addDropdown(cb: (dropdown: DropdownComponent) => void): this {
    throw new Error('Not implemented')
  }
}

/**
 * Text input component
 */
export interface TextComponent {
  inputEl: HTMLInputElement
  getValue(): string
  setValue(value: string): this
  setPlaceholder(placeholder: string): this
  onChange(callback: (value: string) => void): this
}

/**
 * Text area component
 */
export interface TextAreaComponent {
  inputEl: HTMLTextAreaElement
  getValue(): string
  setValue(value: string): this
  setPlaceholder(placeholder: string): this
  onChange(callback: (value: string) => void): this
}

/**
 * Toggle component
 */
export interface ToggleComponent {
  getValue(): boolean
  setValue(value: boolean): this
  onChange(callback: (value: boolean) => void): this
}

/**
 * Button component
 */
export interface ButtonComponent {
  buttonEl: HTMLButtonElement
  setButtonText(name: string): this
  setCta(): this
  setWarning(): this
  setIcon(icon: string): this
  onClick(callback: () => void): this
}

/**
 * Dropdown component
 */
export interface DropdownComponent {
  selectEl: HTMLSelectElement
  getValue(): string
  setValue(value: string): this
  addOption(value: string, display: string): this
  addOptions(options: Record<string, string>): this
  onChange(callback: (value: string) => void): this
}

/**
 * Notice for displaying messages to the user
 */
export class Notice {
  noticeEl: HTMLElement

  constructor(message: string, timeout?: number) {
    this.noticeEl = document.createElement('div')
    throw new Error('Not implemented')
  }

  hide(): void {
    throw new Error('Not implemented')
  }

  setMessage(message: string): this {
    throw new Error('Not implemented')
  }
}
