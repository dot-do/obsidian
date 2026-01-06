/**
 * Shared utility for extracting tags from files.
 */
/**
 * Get all tags from a file (both frontmatter and inline).
 *
 * @param _file - The TFile (unused, kept for API compatibility)
 * @param metadata - The cached metadata for the file
 * @returns Array of tag strings without the # prefix
 */
export function getFileTags(_file, metadata) {
    const tags = [];
    // Get frontmatter tags
    if (metadata?.frontmatter?.tags) {
        const fmTags = metadata.frontmatter.tags;
        if (Array.isArray(fmTags)) {
            tags.push(...fmTags.map(t => String(t)));
        }
        else if (typeof fmTags === 'string') {
            tags.push(fmTags);
        }
    }
    // Get inline tags
    if (metadata?.tags) {
        for (const tagCache of metadata.tags) {
            const tag = tagCache.tag.startsWith('#') ? tagCache.tag.slice(1) : tagCache.tag;
            if (!tags.includes(tag)) {
                tags.push(tag);
            }
        }
    }
    return tags;
}
//# sourceMappingURL=tags.js.map