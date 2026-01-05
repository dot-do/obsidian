import type { ObsidianClient } from '../client/client.js';
export interface SearchMatch {
    path: string;
    title: string;
    snippet: string;
    score: number;
    tags: string[];
}
export interface VaultSearchResult {
    matches: SearchMatch[];
}
export declare function handleVaultSearch(client: ObsidianClient, args: {
    query: string;
    limit?: number;
    filter?: {
        tags?: string[];
    };
}): Promise<VaultSearchResult>;
export interface NoteReadResult {
    path: string;
    content: string;
    metadata: {
        frontmatter?: Record<string, unknown>;
        headings?: Array<{
            heading: string;
            level: number;
        }>;
        links?: Array<{
            link: string;
            original: string;
        }>;
    };
    backlinks?: string[];
}
export declare function handleNoteRead(client: ObsidianClient, args: {
    path: string;
    includeBacklinks?: boolean;
}): Promise<NoteReadResult>;
export interface NoteCreateResult {
    path: string;
    success: boolean;
    content: string;
    file: {
        basename: string;
        extension: string;
    };
}
export declare function handleNoteCreate(client: ObsidianClient, args: {
    path: string;
    content: string;
    frontmatter?: Record<string, unknown>;
}): Promise<NoteCreateResult>;
export interface BacklinkInfo {
    path: string;
    title?: string;
    context?: string;
    contexts?: string[];
    linkCount?: number;
}
export interface BacklinksResult {
    backlinks: BacklinkInfo[];
    count: number;
}
export declare function handleGraphBacklinks(client: ObsidianClient, args: {
    path: string;
    includeContext?: boolean;
}): Promise<BacklinksResult>;
export interface FileInfo {
    path: string;
    metadata?: {
        frontmatter?: Record<string, unknown>;
    };
}
export interface VaultContextResult {
    files: Array<FileInfo & {
        path: string;
    }>;
    folders?: string[];
    stats?: {
        totalNotes: number;
    };
    graph?: {
        edges: Array<{
            source: string;
            target: string;
        }>;
    };
}
export declare function handleVaultContext(client: ObsidianClient, args: {
    scope: string;
    maxTokens?: number;
}): Promise<VaultContextResult>;
export interface VaultListResult {
    files: Array<{
        path: string;
        name: string;
        basename: string;
        stat: {
            mtime: number;
            size: number;
        };
    }>;
    total: number;
}
export declare function handleVaultList(client: ObsidianClient, args: {
    folder?: string;
    recursive?: boolean;
}): Promise<VaultListResult>;
export interface NoteUpdateResult {
    path: string;
    success: boolean;
}
export declare function handleNoteUpdate(client: ObsidianClient, args: {
    path: string;
    content: string;
}): Promise<NoteUpdateResult>;
export interface NoteAppendResult {
    path: string;
    success: boolean;
}
export declare function handleNoteAppend(client: ObsidianClient, args: {
    path: string;
    content: string;
    position?: 'end' | 'after-frontmatter';
}): Promise<NoteAppendResult>;
export interface FrontmatterUpdateResult {
    path: string;
    success: boolean;
}
export declare function handleFrontmatterUpdate(client: ObsidianClient, args: {
    path: string;
    frontmatter: Record<string, unknown>;
    merge?: boolean;
}): Promise<FrontmatterUpdateResult>;
export interface ForwardLinkInfo {
    path: string;
    title?: string;
    linkCount: number;
}
export interface ForwardLinksResult {
    links: ForwardLinkInfo[];
    count: number;
    unresolvedLinks?: string[];
}
export declare function handleGraphForwardLinks(client: ObsidianClient, args: {
    path: string;
    includeUnresolved?: boolean;
}): Promise<ForwardLinksResult>;
export interface NeighborInfo {
    path: string;
    depth: number;
    relationship: 'incoming' | 'outgoing' | 'both';
}
export interface NeighborsResult {
    neighbors: NeighborInfo[];
    count: number;
}
export declare function handleGraphNeighbors(client: ObsidianClient, args: {
    path: string;
    depth?: number;
    direction?: 'both' | 'incoming' | 'outgoing';
}): Promise<NeighborsResult>;
//# sourceMappingURL=handlers.d.ts.map