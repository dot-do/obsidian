// Core types for obsidian.do

export interface TFile {
  path: string
  name: string
  basename: string
  extension: string
  stat: FileStat
}

export interface TFolder {
  path: string
  name: string
  children: TAbstractFile[]
  isRoot(): boolean
}

export type TAbstractFile = TFile | TFolder

export interface FileStat {
  ctime: number
  mtime: number
  size: number
}

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

export interface LinkCache {
  link: string
  original: string
  displayText?: string
  position: Pos
}

export interface EmbedCache {
  link: string
  original: string
  displayText?: string
  position: Pos
}

export interface TagCache {
  tag: string
  position: Pos
}

export interface HeadingCache {
  heading: string
  level: number
  position: Pos
}

export interface SectionCache {
  type: string
  position: Pos
  id?: string
}

export interface BlockCache {
  id: string
  position: Pos
}

export interface FrontmatterLinkCache {
  key: string
  link: string
  original: string
  displayText?: string
}

export interface Pos {
  start: Loc
  end: Loc
}

export interface Loc {
  line: number
  col: number
  offset: number
}

export interface SearchResult {
  score: number
  matches: Array<[number, number]> // [offset, length]
}

export interface GraphNode {
  path: string
  neighbors: string[]
}

export interface Backend {
  read(path: string): Promise<string>
  readBinary(path: string): Promise<ArrayBuffer>
  write(path: string, content: string): Promise<void>
  writeBinary(path: string, content: ArrayBuffer): Promise<void>
  delete(path: string): Promise<void>
  exists(path: string): Promise<boolean>
  stat(path: string): Promise<FileStat | null>
  list(path: string): Promise<string[]>
  mkdir(path: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  copy(from: string, to: string): Promise<void>
}

export type EventCallback<T> = (data: T) => void
export type EventRef = { unsubscribe: () => void }
