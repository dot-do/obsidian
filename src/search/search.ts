// TextSearchResult is the result of matching text against a query.
// This is different from SearchResult in engine.ts which includes file info.
// TextSearchResult only contains score and match positions for text matching.
export interface TextSearchResult {
  score: number
  matches: Array<[number, number]> // [offset, length]
}

export type SearchMatchFn = (text: string) => TextSearchResult | null

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Check if a position is at a valid word boundary.
 * Valid boundaries:
 * - Start of string
 * - After non-alphanumeric character
 * - At camelCase boundary (lowercase followed by uppercase)
 * - After a digit
 */
function isAtWordBoundary(text: string, pos: number): boolean {
  if (pos === 0) return true
  const prevChar = text[pos - 1]
  const currChar = text[pos]

  // After non-alphanumeric
  if (!/[a-zA-Z0-9]/.test(prevChar)) return true

  // CamelCase boundary: previous is lowercase, current is uppercase
  if (/[a-z]/.test(prevChar) && /[A-Z]/.test(currChar)) return true

  // After digit
  if (/[0-9]/.test(prevChar)) return true

  return false
}

/**
 * Prepares a simple search function that matches words at word boundaries.
 * All query words must be present in the target for a match.
 * Matching is case-insensitive and supports prefix matching.
 */
export function prepareSimpleSearch(query: string): SearchMatchFn {
  // Split query into words, filtering out empty strings
  const words = query.split(/\s+/).filter(w => w.length > 0)

  // Handle empty query - matches everything
  if (words.length === 0) {
    return (text: string) => {
      if (text === '') return null
      return { score: 1, matches: [] }
    }
  }

  // Deduplicate words for matching purposes
  const uniqueWords = [...new Set(words.map(w => w.toLowerCase()))]

  return (text: string): TextSearchResult | null => {
    if (text === '') return null

    const textLower = text.toLowerCase()
    const allMatches: Array<[number, number]> = []

    // Check that all words match and collect positions
    // Store only the FIRST match for each query word
    for (const word of uniqueWords) {
      let found = false
      let searchStart = 0

      while (searchStart < textLower.length) {
        const idx = textLower.indexOf(word, searchStart)
        if (idx === -1) break

        // Check if this is at a word boundary
        if (isAtWordBoundary(text, idx)) {
          allMatches.push([idx, word.length])
          found = true
          break // Only record first match per word
        }

        searchStart = idx + 1
      }

      if (!found) {
        return null // Word not found at word boundary - no match
      }
    }

    // Sort matches by offset
    allMatches.sort((a, b) => a[0] - b[0])

    // Calculate score based on number of matched words
    const score = uniqueWords.length

    return {
      score,
      matches: allMatches
    }
  }
}

/**
 * Prepare a fuzzy search function for the given query.
 * Returns a function that can be called with target strings to find fuzzy matches.
 */
export function prepareFuzzySearch(query: string): SearchMatchFn {
  const queryLower = query.toLowerCase()

  return (text: string): TextSearchResult | null => {
    // Handle empty query - matches everything
    if (query.length === 0) {
      return { score: 0.1, matches: [] }
    }

    // Handle empty target
    if (text.length === 0) {
      return null
    }

    // Query longer than target can't match
    if (query.length > text.length) {
      return null
    }

    const textLower = text.toLowerCase()

    // Try to find the best fuzzy match
    const matchResult = findFuzzyMatch(queryLower, textLower, text)
    if (!matchResult) {
      return null
    }

    const { positions, score } = matchResult

    // Convert positions to ranges
    const matches = positionsToRanges(positions)

    return { score, matches }
  }
}

/**
 * Find fuzzy match positions and calculate score.
 * Returns null if no match found.
 */
function findFuzzyMatch(
  queryLower: string,
  textLower: string,
  originalText: string
): { positions: number[]; score: number } | null {
  // First, check if all query characters exist in order
  const positions = findBestMatchPositions(queryLower, textLower, originalText)
  if (!positions) {
    return null
  }

  const score = calculateScore(queryLower, textLower, originalText, positions)

  return { positions, score }
}

/**
 * Find the best matching positions for query characters in the text.
 * Uses a greedy algorithm with preference for word boundaries and consecutive matches.
 */
function findBestMatchPositions(
  queryLower: string,
  textLower: string,
  originalText: string
): number[] | null {
  // First verify all characters can be found in order
  if (!canMatch(queryLower, textLower)) {
    return null
  }

  // Use dynamic programming to find optimal match positions
  const positions: number[] = []
  let queryIdx = 0
  let textIdx = 0

  while (queryIdx < queryLower.length && textIdx < textLower.length) {
    const queryChar = queryLower[queryIdx]

    // Find all possible positions for this character
    const candidates: number[] = []
    for (let i = textIdx; i < textLower.length; i++) {
      if (textLower[i] === queryChar) {
        // Check if remaining query can still be matched
        if (canMatchFrom(queryLower, queryIdx + 1, textLower, i + 1)) {
          candidates.push(i)
        }
      }
    }

    if (candidates.length === 0) {
      return null
    }

    // Score each candidate and pick the best
    const bestCandidate = pickBestCandidate(
      candidates,
      positions,
      textLower,
      originalText
    )

    positions.push(bestCandidate)
    textIdx = bestCandidate + 1
    queryIdx++
  }

  return positions.length === queryLower.length ? positions : null
}

/**
 * Check if query can be matched in text (all chars in order).
 */
function canMatch(queryLower: string, textLower: string): boolean {
  let queryIdx = 0
  for (let i = 0; i < textLower.length && queryIdx < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIdx]) {
      queryIdx++
    }
  }
  return queryIdx === queryLower.length
}

/**
 * Check if remaining query can be matched from given positions.
 */
function canMatchFrom(
  queryLower: string,
  queryStart: number,
  textLower: string,
  textStart: number
): boolean {
  let queryIdx = queryStart
  for (let i = textStart; i < textLower.length && queryIdx < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIdx]) {
      queryIdx++
    }
  }
  return queryIdx === queryLower.length
}

/**
 * Pick the best candidate position based on scoring heuristics.
 */
function pickBestCandidate(
  candidates: number[],
  prevPositions: number[],
  textLower: string,
  originalText: string
): number {
  let bestCandidate = candidates[0]
  let bestScore = -Infinity

  for (const pos of candidates) {
    let score = 0

    // Bonus for consecutive match
    if (prevPositions.length > 0 && pos === prevPositions[prevPositions.length - 1] + 1) {
      score += 15
    }

    // Bonus for word boundary match (start of word)
    if (isWordBoundary(textLower, pos)) {
      score += 10
    }

    // Bonus for camelCase boundary
    if (isCamelCaseBoundary(originalText, pos)) {
      score += 8
    }

    // Prefer earlier positions (smaller penalty for later)
    score -= pos * 0.1

    if (score > bestScore) {
      bestScore = score
      bestCandidate = pos
    }
  }

  return bestCandidate
}

/**
 * Check if position is at a word boundary.
 */
function isWordBoundary(text: string, pos: number): boolean {
  if (pos === 0) return true
  const prevChar = text[pos - 1]
  return /[\s_\-./\\]/.test(prevChar)
}

/**
 * Check if position is at a camelCase boundary.
 */
function isCamelCaseBoundary(text: string, pos: number): boolean {
  if (pos === 0) return true
  const currChar = text[pos]
  const prevChar = text[pos - 1]
  // Current char is uppercase and previous is lowercase
  return /[A-Z]/.test(currChar) && /[a-z]/.test(prevChar)
}

/**
 * Calculate the match score based on various factors.
 */
function calculateScore(
  queryLower: string,
  textLower: string,
  originalText: string,
  positions: number[]
): number {
  let score = 0

  // Base score for matching
  score += 10

  // Bonus for query length coverage
  const coverage = queryLower.length / textLower.length
  score += coverage * 20

  // Count consecutive matches
  let consecutiveCount = 0
  for (let i = 1; i < positions.length; i++) {
    if (positions[i] === positions[i - 1] + 1) {
      consecutiveCount++
    }
  }
  score += consecutiveCount * 5

  // Bonus for word boundary matches
  let boundaryMatches = 0
  for (const pos of positions) {
    if (isWordBoundary(textLower, pos)) {
      boundaryMatches++
    }
    if (isCamelCaseBoundary(originalText, pos)) {
      boundaryMatches++
    }
  }
  score += boundaryMatches * 3

  // Bonus for match starting at the beginning
  if (positions[0] === 0) {
    score += 10
  } else {
    // Penalty for later start positions
    score -= positions[0] * 0.5
  }

  // Bonus for shorter target string (exact match bonus)
  if (queryLower.length === textLower.length) {
    score += 20
  }

  // Penalty for string length
  score -= textLower.length * 0.1

  return Math.max(score, 0.1) // Ensure positive score for matches
}

/**
 * Convert an array of match positions to ranges [start, end].
 * Consecutive positions are merged into single ranges.
 */
function positionsToRanges(positions: number[]): Array<[number, number]> {
  if (positions.length === 0) {
    return []
  }

  const ranges: Array<[number, number]> = []
  let rangeStart = positions[0]
  let rangeEnd = positions[0] + 1

  for (let i = 1; i < positions.length; i++) {
    if (positions[i] === rangeEnd) {
      // Consecutive, extend the range
      rangeEnd = positions[i] + 1
    } else {
      // Gap, close current range and start new one
      ranges.push([rangeStart, rangeEnd])
      rangeStart = positions[i]
      rangeEnd = positions[i] + 1
    }
  }

  // Close the last range
  ranges.push([rangeStart, rangeEnd])

  return ranges
}
