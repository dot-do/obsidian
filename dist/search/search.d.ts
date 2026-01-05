import type { SearchResult } from '../types.js';
export type SearchMatchFn = (text: string) => SearchResult | null;
/**
 * Prepares a simple search function that matches words at word boundaries.
 * All query words must be present in the target for a match.
 * Matching is case-insensitive and supports prefix matching.
 */
export declare function prepareSimpleSearch(query: string): SearchMatchFn;
/**
 * Prepare a fuzzy search function for the given query.
 * Returns a function that can be called with target strings to find fuzzy matches.
 */
export declare function prepareFuzzySearch(query: string): SearchMatchFn;
//# sourceMappingURL=search.d.ts.map