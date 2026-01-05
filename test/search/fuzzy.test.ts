import { describe, it, expect } from 'vitest'
import { prepareFuzzySearch } from '../../src/search/search.js'

describe('prepareFuzzySearch', () => {
  describe('basic matching', () => {
    it('should match exact substring', () => {
      const search = prepareFuzzySearch('test')
      const result = search('This is a test string')
      expect(result).not.toBeNull()
      expect(result?.score).toBeGreaterThan(0)
    })

    it('should match exact string', () => {
      const search = prepareFuzzySearch('hello')
      const result = search('hello')
      expect(result).not.toBeNull()
      expect(result?.score).toBeGreaterThan(0)
    })

    it('should match at beginning of string', () => {
      const search = prepareFuzzySearch('hello')
      const result = search('hello world')
      expect(result).not.toBeNull()
      expect(result?.score).toBeGreaterThan(0)
    })

    it('should match at end of string', () => {
      const search = prepareFuzzySearch('world')
      const result = search('hello world')
      expect(result).not.toBeNull()
      expect(result?.score).toBeGreaterThan(0)
    })

    it('should match in middle of string', () => {
      const search = prepareFuzzySearch('is')
      const result = search('this is a test')
      expect(result).not.toBeNull()
      expect(result?.score).toBeGreaterThan(0)
    })
  })

  describe('fuzzy matching', () => {
    it('should match fuzzy patterns with skipped characters', () => {
      const search = prepareFuzzySearch('tst')
      const result = search('test')
      expect(result).not.toBeNull()
    })

    it('should match fuzzy pattern across word boundaries', () => {
      const search = prepareFuzzySearch('hw')
      const result = search('hello world')
      expect(result).not.toBeNull()
    })

    it('should match fuzzy pattern with multiple gaps', () => {
      const search = prepareFuzzySearch('abc')
      const result = search('a1b2c3')
      expect(result).not.toBeNull()
    })

    it('should match camelCase patterns', () => {
      const search = prepareFuzzySearch('gFN')
      const result = search('getFileName')
      expect(result).not.toBeNull()
    })

    it('should match snake_case patterns', () => {
      const search = prepareFuzzySearch('gfn')
      const result = search('get_file_name')
      expect(result).not.toBeNull()
    })

    it('should match kebab-case patterns', () => {
      const search = prepareFuzzySearch('gfn')
      const result = search('get-file-name')
      expect(result).not.toBeNull()
    })

    it('should match file path patterns', () => {
      const search = prepareFuzzySearch('src/comp')
      const result = search('src/components/Button.tsx')
      expect(result).not.toBeNull()
    })

    it('should match acronym patterns', () => {
      const search = prepareFuzzySearch('npm')
      const result = search('node package manager')
      expect(result).not.toBeNull()
    })
  })

  describe('scoring', () => {
    it('should return higher score for exact matches', () => {
      const search = prepareFuzzySearch('test')
      const exact = search('test')
      const partial = search('testing something')
      expect(exact).not.toBeNull()
      expect(partial).not.toBeNull()
      expect(exact!.score).toBeGreaterThan(partial!.score)
    })

    it('should return higher score for matches at word start', () => {
      const search = prepareFuzzySearch('test')
      const wordStart = search('test file')
      const wordMiddle = search('a test file')
      expect(wordStart).not.toBeNull()
      expect(wordMiddle).not.toBeNull()
      expect(wordStart!.score).toBeGreaterThan(wordMiddle!.score)
    })

    it('should return higher score for consecutive character matches', () => {
      const search = prepareFuzzySearch('abc')
      const consecutive = search('abc')
      const spread = search('a1b2c3')
      expect(consecutive).not.toBeNull()
      expect(spread).not.toBeNull()
      expect(consecutive!.score).toBeGreaterThan(spread!.score)
    })

    it('should return higher score for shorter target strings', () => {
      const search = prepareFuzzySearch('test')
      const short = search('test')
      const long = search('test with a very long string that contains more characters')
      expect(short).not.toBeNull()
      expect(long).not.toBeNull()
      expect(short!.score).toBeGreaterThan(long!.score)
    })

    it('should return higher score for matches closer to beginning', () => {
      const search = prepareFuzzySearch('find')
      const beginning = search('find me here')
      const end = search('here you will find it')
      expect(beginning).not.toBeNull()
      expect(end).not.toBeNull()
      expect(beginning!.score).toBeGreaterThan(end!.score)
    })

    it('should return higher score for camelCase boundary matches', () => {
      const search = prepareFuzzySearch('gfn')
      const camelMatch = search('getFileName')
      const randomMatch = search('grafting')
      expect(camelMatch).not.toBeNull()
      expect(randomMatch).not.toBeNull()
      expect(camelMatch!.score).toBeGreaterThan(randomMatch!.score)
    })

    it('should return positive scores for valid matches', () => {
      const search = prepareFuzzySearch('test')
      const result = search('testing')
      expect(result).not.toBeNull()
      expect(result!.score).toBeGreaterThan(0)
    })
  })

  describe('non-matches', () => {
    it('should return null for non-matches', () => {
      const search = prepareFuzzySearch('xyz')
      const result = search('hello world')
      expect(result).toBeNull()
    })

    it('should return null when characters are in wrong order', () => {
      const search = prepareFuzzySearch('cba')
      const result = search('abc')
      expect(result).toBeNull()
    })

    it('should return null for empty target string', () => {
      const search = prepareFuzzySearch('test')
      const result = search('')
      expect(result).toBeNull()
    })

    it('should return null when query is longer than target', () => {
      const search = prepareFuzzySearch('longer query')
      const result = search('short')
      expect(result).toBeNull()
    })

    it('should return null when not all characters are found', () => {
      const search = prepareFuzzySearch('abcxyz')
      const result = search('abc')
      expect(result).toBeNull()
    })
  })

  describe('match positions', () => {
    it('should include match positions in result', () => {
      const search = prepareFuzzySearch('test')
      const result = search('test')
      expect(result).not.toBeNull()
      expect(result?.matches).toBeDefined()
      expect(Array.isArray(result?.matches)).toBe(true)
    })

    it('should return correct positions for exact match', () => {
      const search = prepareFuzzySearch('test')
      const result = search('test')
      expect(result).not.toBeNull()
      expect(result?.matches).toEqual([[0, 4]])
    })

    it('should return correct positions for substring match', () => {
      const search = prepareFuzzySearch('test')
      const result = search('a test here')
      expect(result).not.toBeNull()
      expect(result?.matches).toContainEqual([2, 6])
    })

    it('should return multiple position ranges for fuzzy match', () => {
      const search = prepareFuzzySearch('ac')
      const result = search('abc')
      expect(result).not.toBeNull()
      expect(result?.matches).toBeDefined()
      expect(result?.matches?.length).toBeGreaterThanOrEqual(1)
    })

    it('should return positions that cover all matched characters', () => {
      const search = prepareFuzzySearch('hw')
      const result = search('hello world')
      expect(result).not.toBeNull()
      expect(result?.matches).toBeDefined()
      // Positions should include index 0 (h) and index 6 (w)
      const allPositions = result?.matches?.flatMap(([start, end]) =>
        Array.from({ length: end - start }, (_, i) => start + i)
      ) ?? []
      expect(allPositions).toContain(0)
      expect(allPositions).toContain(6)
    })

    it('should return contiguous ranges for consecutive matches', () => {
      const search = prepareFuzzySearch('hello')
      const result = search('hello world')
      expect(result).not.toBeNull()
      expect(result?.matches).toEqual([[0, 5]])
    })
  })

  describe('case sensitivity', () => {
    it('should be case insensitive by default', () => {
      const search = prepareFuzzySearch('test')
      const result = search('TEST')
      expect(result).not.toBeNull()
    })

    it('should match uppercase query against lowercase target', () => {
      const search = prepareFuzzySearch('TEST')
      const result = search('test')
      expect(result).not.toBeNull()
    })

    it('should match mixed case query against target', () => {
      const search = prepareFuzzySearch('TeSt')
      const result = search('test')
      expect(result).not.toBeNull()
    })

    it('should match lowercase query against mixed case target', () => {
      const search = prepareFuzzySearch('getfilename')
      const result = search('getFileName')
      expect(result).not.toBeNull()
    })

    it('should handle all caps target', () => {
      const search = prepareFuzzySearch('hello')
      const result = search('HELLO WORLD')
      expect(result).not.toBeNull()
    })
  })

  describe('edge cases', () => {
    it('should handle empty query', () => {
      const search = prepareFuzzySearch('')
      const result = search('test')
      // Empty query should match everything or return a specific result
      expect(result).not.toBeNull()
    })

    it('should handle single character query', () => {
      const search = prepareFuzzySearch('t')
      const result = search('test')
      expect(result).not.toBeNull()
    })

    it('should handle single character target', () => {
      const search = prepareFuzzySearch('t')
      const result = search('t')
      expect(result).not.toBeNull()
    })

    it('should handle whitespace in query', () => {
      const search = prepareFuzzySearch('hello world')
      const result = search('hello world')
      expect(result).not.toBeNull()
    })

    it('should handle special characters in query', () => {
      const search = prepareFuzzySearch('test.ts')
      const result = search('mytest.ts')
      expect(result).not.toBeNull()
    })

    it('should handle unicode characters', () => {
      const search = prepareFuzzySearch('cafe')
      const result = search('cafe')
      expect(result).not.toBeNull()
    })

    it('should handle numbers in query', () => {
      const search = prepareFuzzySearch('test123')
      const result = search('test123file')
      expect(result).not.toBeNull()
    })

    it('should handle repeated characters in query', () => {
      const search = prepareFuzzySearch('aaa')
      const result = search('abababab')
      expect(result).not.toBeNull()
    })

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(1000) + 'test' + 'b'.repeat(1000)
      const search = prepareFuzzySearch('test')
      const result = search(longString)
      expect(result).not.toBeNull()
    })
  })

  describe('real-world scenarios', () => {
    it('should match file names with fuzzy query', () => {
      const search = prepareFuzzySearch('btn')
      const result = search('Button.tsx')
      expect(result).not.toBeNull()
    })

    it('should match file paths', () => {
      const search = prepareFuzzySearch('src/cmp/btn')
      const result = search('src/components/Button.tsx')
      expect(result).not.toBeNull()
    })

    it('should match function names', () => {
      const search = prepareFuzzySearch('usrauth')
      const result = search('userAuthentication')
      expect(result).not.toBeNull()
    })

    it('should match class names', () => {
      const search = prepareFuzzySearch('httpcli')
      const result = search('HttpClientService')
      expect(result).not.toBeNull()
    })

    it('should match with typos (transposed characters)', () => {
      const search = prepareFuzzySearch('tset')
      const result = search('test')
      // This may or may not match depending on implementation
      // If it matches, it should have a lower score
      if (result) {
        expect(result.score).toBeLessThan(prepareFuzzySearch('test')('test')!.score)
      }
    })

    it('should rank exact filename match higher than path match', () => {
      const search = prepareFuzzySearch('Button')
      const exactFile = search('Button.tsx')
      const inPath = search('src/components/Button/index.tsx')
      expect(exactFile).not.toBeNull()
      expect(inPath).not.toBeNull()
      expect(exactFile!.score).toBeGreaterThanOrEqual(inPath!.score)
    })

    it('should match markdown file names', () => {
      const search = prepareFuzzySearch('readme')
      const result = search('README.md')
      expect(result).not.toBeNull()
    })

    it('should match package names', () => {
      const search = prepareFuzzySearch('react-dom')
      const result = search('@types/react-dom')
      expect(result).not.toBeNull()
    })
  })

  describe('search function reusability', () => {
    it('should be reusable for multiple targets', () => {
      const search = prepareFuzzySearch('test')
      const result1 = search('test one')
      const result2 = search('test two')
      const result3 = search('no match here')

      expect(result1).not.toBeNull()
      expect(result2).not.toBeNull()
      expect(result3).toBeNull()
    })

    it('should return consistent results for same input', () => {
      const search = prepareFuzzySearch('test')
      const result1 = search('testing')
      const result2 = search('testing')

      expect(result1).not.toBeNull()
      expect(result2).not.toBeNull()
      expect(result1!.score).toBe(result2!.score)
      expect(result1!.matches).toEqual(result2!.matches)
    })

    it('should not be affected by previous searches', () => {
      const search = prepareFuzzySearch('test')
      search('something else entirely')
      search('another unrelated string')
      const result = search('test')

      expect(result).not.toBeNull()
      expect(result!.score).toBeGreaterThan(0)
    })
  })

  describe('result structure', () => {
    it('should return object with score property', () => {
      const search = prepareFuzzySearch('test')
      const result = search('test')
      expect(result).toHaveProperty('score')
      expect(typeof result?.score).toBe('number')
    })

    it('should return object with matches property', () => {
      const search = prepareFuzzySearch('test')
      const result = search('test')
      expect(result).toHaveProperty('matches')
      expect(Array.isArray(result?.matches)).toBe(true)
    })

    it('should return matches as array of [start, end] tuples', () => {
      const search = prepareFuzzySearch('test')
      const result = search('test')
      expect(result?.matches).toBeDefined()
      result?.matches?.forEach(match => {
        expect(Array.isArray(match)).toBe(true)
        expect(match.length).toBe(2)
        expect(typeof match[0]).toBe('number')
        expect(typeof match[1]).toBe('number')
        expect(match[0]).toBeLessThanOrEqual(match[1])
      })
    })

    it('should return valid index ranges within target string bounds', () => {
      const target = 'hello world'
      const search = prepareFuzzySearch('hw')
      const result = search(target)
      expect(result).not.toBeNull()
      result?.matches?.forEach(([start, end]) => {
        expect(start).toBeGreaterThanOrEqual(0)
        expect(end).toBeLessThanOrEqual(target.length)
      })
    })
  })
})
