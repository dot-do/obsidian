/**
 * Shared utility for extracting tags from files.
 */
import type { TFile, CachedMetadata } from '../types.js';
/**
 * Get all tags from a file (both frontmatter and inline).
 *
 * @param _file - The TFile (unused, kept for API compatibility)
 * @param metadata - The cached metadata for the file
 * @returns Array of tag strings without the # prefix
 */
export declare function getFileTags(_file: TFile, metadata: CachedMetadata | null): string[];
//# sourceMappingURL=tags.d.ts.map