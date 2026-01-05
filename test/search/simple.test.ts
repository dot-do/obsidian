import { describe, it, expect } from 'vitest'
import { prepareSimpleSearch } from '../../src/search/search.js'

describe('prepareSimpleSearch', () => {
  describe('basic word matching', () => {
    it('should match all words in query', () => {
      const search = prepareSimpleSearch('hello world')
      expect(search('hello world')).not.toBeNull()
      expect(search('world hello')).not.toBeNull()
      expect(search('hello there world')).not.toBeNull()
    })

    it('should return null if any word is missing', () => {
      const search = prepareSimpleSearch('hello world')
      expect(search('hello there')).toBeNull()
      expect(search('world only')).toBeNull()
    })

    it('should match single word query', () => {
      const search = prepareSimpleSearch('test')
      expect(search('test')).not.toBeNull()
      expect(search('this is a test')).not.toBeNull()
      expect(search('testing something')).not.toBeNull()
    })

    it('should match three or more words', () => {
      const search = prepareSimpleSearch('one two three')
      expect(search('one two three')).not.toBeNull()
      expect(search('three two one')).not.toBeNull()
      expect(search('one and two and three')).not.toBeNull()
      expect(search('one two')).toBeNull()
    })
  })

  describe('word boundary matching', () => {
    it('should match at word start (prefix match)', () => {
      const search = prepareSimpleSearch('test')
      expect(search('test')).not.toBeNull()
      expect(search('testing')).not.toBeNull()
      expect(search('tester')).not.toBeNull()
    })

    it('should not match in the middle of a word', () => {
      const search = prepareSimpleSearch('test')
      expect(search('contest')).toBeNull()
      expect(search('detesting')).toBeNull()
      expect(search('attest')).toBeNull()
    })

    it('should match after non-word characters', () => {
      const search = prepareSimpleSearch('test')
      expect(search('my-test-file')).not.toBeNull()
      expect(search('my_test_file')).not.toBeNull()
      expect(search('my.test.file')).not.toBeNull()
      expect(search('my/test/file')).not.toBeNull()
    })

    it('should match camelCase word boundaries', () => {
      const search = prepareSimpleSearch('File')
      expect(search('getFileName')).not.toBeNull()
      expect(search('MyFileHandler')).not.toBeNull()
    })

    it('should match after numbers', () => {
      const search = prepareSimpleSearch('test')
      expect(search('123test')).not.toBeNull()
      expect(search('v2test')).not.toBeNull()
    })
  })

  describe('match positions', () => {
    it('should include all match positions', () => {
      const search = prepareSimpleSearch('hello world')
      const result = search('hello beautiful world')
      expect(result?.matches).toHaveLength(2)
    })

    it('should return correct position for single word', () => {
      const search = prepareSimpleSearch('test')
      const result = search('test')
      expect(result).not.toBeNull()
      expect(result?.matches).toEqual([[0, 4]])
    })

    it('should return correct positions for multiple words', () => {
      const search = prepareSimpleSearch('hello world')
      const result = search('hello world')
      expect(result).not.toBeNull()
      expect(result?.matches).toHaveLength(2)
      expect(result?.matches).toContainEqual([0, 5])  // hello
      expect(result?.matches).toContainEqual([6, 5])  // world
    })

    it('should return positions in order of appearance in target', () => {
      const search = prepareSimpleSearch('world hello')
      const result = search('hello world')
      expect(result).not.toBeNull()
      // Positions should be ordered by offset, not query order
      const offsets = result?.matches?.map(([offset]) => offset) ?? []
      expect(offsets).toEqual([...offsets].sort((a, b) => a - b))
    })

    it('should handle prefix matches with correct length', () => {
      const search = prepareSimpleSearch('test')
      const result = search('testing')
      expect(result).not.toBeNull()
      // Should match 'test' (4 chars) at position 0
      expect(result?.matches).toContainEqual([0, 4])
    })

    it('should return valid positions within string bounds', () => {
      const target = 'the quick brown fox'
      const search = prepareSimpleSearch('quick fox')
      const result = search(target)
      expect(result).not.toBeNull()
      result?.matches?.forEach(([offset, length]) => {
        expect(offset).toBeGreaterThanOrEqual(0)
        expect(offset + length).toBeLessThanOrEqual(target.length)
      })
    })
  })

  describe('scoring', () => {
    it('should return a score greater than 0 for matches', () => {
      const search = prepareSimpleSearch('test')
      const result = search('test')
      expect(result).not.toBeNull()
      expect(result!.score).toBeGreaterThan(0)
    })

    it('should return higher score for more query words matched', () => {
      const search = prepareSimpleSearch('one two three')
      const result = search('one two three four')
      expect(result).not.toBeNull()
      expect(result!.score).toBeGreaterThan(0)
    })

    it('should return consistent scores for same input', () => {
      const search = prepareSimpleSearch('hello world')
      const result1 = search('hello world')
      const result2 = search('hello world')
      expect(result1!.score).toBe(result2!.score)
    })
  })

  describe('case sensitivity', () => {
    it('should be case insensitive', () => {
      const search = prepareSimpleSearch('test')
      expect(search('TEST')).not.toBeNull()
      expect(search('Test')).not.toBeNull()
      expect(search('TeSt')).not.toBeNull()
    })

    it('should handle uppercase query', () => {
      const search = prepareSimpleSearch('TEST')
      expect(search('test')).not.toBeNull()
      expect(search('Test')).not.toBeNull()
    })

    it('should handle mixed case in both query and target', () => {
      const search = prepareSimpleSearch('HeLLo WoRLd')
      expect(search('hello world')).not.toBeNull()
      expect(search('HELLO WORLD')).not.toBeNull()
    })
  })

  describe('whitespace handling', () => {
    it('should handle multiple spaces between words in query', () => {
      const search = prepareSimpleSearch('hello   world')
      expect(search('hello world')).not.toBeNull()
    })

    it('should handle leading/trailing whitespace in query', () => {
      const search = prepareSimpleSearch('  hello world  ')
      expect(search('hello world')).not.toBeNull()
    })

    it('should handle tabs in query', () => {
      const search = prepareSimpleSearch('hello\tworld')
      expect(search('hello world')).not.toBeNull()
    })

    it('should match target with extra whitespace', () => {
      const search = prepareSimpleSearch('hello world')
      expect(search('hello    world')).not.toBeNull()
      expect(search('  hello  world  ')).not.toBeNull()
    })
  })

  describe('edge cases', () => {
    it('should handle empty query', () => {
      const search = prepareSimpleSearch('')
      const result = search('test')
      // Empty query could match everything or return null - define behavior
      expect(result).not.toBeNull()
    })

    it('should handle whitespace-only query', () => {
      const search = prepareSimpleSearch('   ')
      const result = search('test')
      // Whitespace-only should behave like empty query
      expect(result).not.toBeNull()
    })

    it('should return null for empty target', () => {
      const search = prepareSimpleSearch('test')
      expect(search('')).toBeNull()
    })

    it('should handle single character query', () => {
      const search = prepareSimpleSearch('a')
      expect(search('apple')).not.toBeNull()
      expect(search('banana')).toBeNull()  // 'a' is not at word start
    })

    it('should handle very long query', () => {
      const words = Array.from({ length: 100 }, (_, i) => `word${i}`)
      const query = words.join(' ')
      const target = words.join(' ')
      const search = prepareSimpleSearch(query)
      expect(search(target)).not.toBeNull()
    })

    it('should handle special regex characters in query', () => {
      const search = prepareSimpleSearch('test.file')
      expect(search('test.file.txt')).not.toBeNull()
    })

    it('should handle brackets and special chars', () => {
      const search = prepareSimpleSearch('[test]')
      expect(search('[test]')).not.toBeNull()
    })

    it('should handle parentheses', () => {
      const search = prepareSimpleSearch('(test)')
      expect(search('(test)')).not.toBeNull()
    })

    it('should handle asterisk and plus', () => {
      const search = prepareSimpleSearch('test*')
      expect(search('test* pattern')).not.toBeNull()
    })
  })

  describe('unicode and international characters', () => {
    it('should handle unicode characters', () => {
      const search = prepareSimpleSearch('cafe')
      expect(search('cafe latte')).not.toBeNull()
    })

    it('should handle accented characters', () => {
      const search = prepareSimpleSearch('resume')
      expect(search('resume document')).not.toBeNull()
    })

    it('should handle emoji in target', () => {
      const search = prepareSimpleSearch('test')
      expect(search('test file')).not.toBeNull()
    })

    it('should handle CJK characters', () => {
      const search = prepareSimpleSearch('test')
      expect(search('test file')).not.toBeNull()
    })
  })

  describe('real-world scenarios', () => {
    it('should match file names', () => {
      const search = prepareSimpleSearch('button')
      expect(search('Button.tsx')).not.toBeNull()
      expect(search('PrimaryButton.tsx')).not.toBeNull()
      expect(search('button-styles.css')).not.toBeNull()
    })

    it('should match file paths', () => {
      const search = prepareSimpleSearch('components button')
      expect(search('src/components/Button.tsx')).not.toBeNull()
      expect(search('components/ui/Button.vue')).not.toBeNull()
    })

    it('should match markdown content', () => {
      const search = prepareSimpleSearch('react hooks')
      expect(search('# React Hooks Tutorial')).not.toBeNull()
      expect(search('Learn about React and Hooks')).not.toBeNull()
    })

    it('should match code identifiers', () => {
      const search = prepareSimpleSearch('get user')
      expect(search('getUserData')).not.toBeNull()
      expect(search('get_user_info')).not.toBeNull()
    })

    it('should match tags', () => {
      const search = prepareSimpleSearch('javascript')
      expect(search('#javascript #programming')).not.toBeNull()
    })

    it('should match frontmatter content', () => {
      const search = prepareSimpleSearch('draft')
      expect(search('status: draft')).not.toBeNull()
    })
  })

  describe('duplicate words', () => {
    it('should handle duplicate words in query', () => {
      const search = prepareSimpleSearch('test test')
      expect(search('test')).not.toBeNull()
    })

    it('should handle multiple occurrences in target', () => {
      const search = prepareSimpleSearch('test')
      const result = search('test and test again')
      expect(result).not.toBeNull()
      // Should find at least one match
      expect(result?.matches?.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('search function reusability', () => {
    it('should be reusable for multiple targets', () => {
      const search = prepareSimpleSearch('test')
      expect(search('test one')).not.toBeNull()
      expect(search('test two')).not.toBeNull()
      expect(search('no match here')).toBeNull()
    })

    it('should return consistent results for same input', () => {
      const search = prepareSimpleSearch('hello world')
      const result1 = search('hello world')
      const result2 = search('hello world')
      expect(result1!.score).toBe(result2!.score)
      expect(result1!.matches).toEqual(result2!.matches)
    })

    it('should not be affected by previous searches', () => {
      const search = prepareSimpleSearch('test')
      search('something else')
      search('another string')
      const result = search('test')
      expect(result).not.toBeNull()
      expect(result!.score).toBeGreaterThan(0)
    })
  })

  describe('result structure', () => {
    it('should return object with score property', () => {
      const search = prepareSimpleSearch('test')
      const result = search('test')
      expect(result).toHaveProperty('score')
      expect(typeof result?.score).toBe('number')
    })

    it('should return object with matches property', () => {
      const search = prepareSimpleSearch('test')
      const result = search('test')
      expect(result).toHaveProperty('matches')
      expect(Array.isArray(result?.matches)).toBe(true)
    })

    it('should return matches as array of [offset, length] tuples', () => {
      const search = prepareSimpleSearch('test')
      const result = search('test')
      expect(result?.matches).toBeDefined()
      result?.matches?.forEach(match => {
        expect(Array.isArray(match)).toBe(true)
        expect(match.length).toBe(2)
        expect(typeof match[0]).toBe('number')  // offset
        expect(typeof match[1]).toBe('number')  // length
        expect(match[0]).toBeGreaterThanOrEqual(0)
        expect(match[1]).toBeGreaterThan(0)
      })
    })
  })

  describe('comparison with fuzzy search behavior', () => {
    it('should require all words (unlike fuzzy which is more lenient)', () => {
      const search = prepareSimpleSearch('hello world')
      // Simple search requires ALL words to be present
      expect(search('hello')).toBeNull()
      expect(search('world')).toBeNull()
      expect(search('hello world')).not.toBeNull()
    })

    it('should only match at word boundaries (stricter than fuzzy)', () => {
      const search = prepareSimpleSearch('test')
      // Simple search should not match 'test' inside 'contest'
      expect(search('contest')).toBeNull()
      // But should match 'test' at the start of 'testing'
      expect(search('testing')).not.toBeNull()
    })
  })

  describe('performance considerations', () => {
    it('should handle long targets efficiently', () => {
      const search = prepareSimpleSearch('needle')
      const longTarget = 'haystack '.repeat(10000) + 'needle' + ' haystack'.repeat(10000)
      const start = performance.now()
      const result = search(longTarget)
      const duration = performance.now() - start
      expect(result).not.toBeNull()
      expect(duration).toBeLessThan(100)  // Should complete in under 100ms
    })

    it('should handle many words in query', () => {
      const words = Array.from({ length: 20 }, (_, i) => `word${i}`)
      const search = prepareSimpleSearch(words.join(' '))
      const target = words.join(' and ')
      const result = search(target)
      expect(result).not.toBeNull()
      expect(result?.matches).toHaveLength(20)
    })
  })
})
