import { describe, it, expect } from 'vitest'
import { LRUCache } from '../../src/vault/lru-cache.js'

describe('LRUCache', () => {
  describe('constructor', () => {
    it('should create cache with default size', () => {
      const cache = new LRUCache<string, number>()
      expect(cache.capacity).toBe(1000)
    })

    it('should create cache with custom size', () => {
      const cache = new LRUCache<string, number>(50)
      expect(cache.capacity).toBe(50)
    })

    it('should throw error for invalid size', () => {
      expect(() => new LRUCache<string, number>(0)).toThrow()
      expect(() => new LRUCache<string, number>(-1)).toThrow()
    })
  })

  describe('get/set', () => {
    it('should store and retrieve values', () => {
      const cache = new LRUCache<string, number>(10)
      cache.set('a', 1)
      cache.set('b', 2)
      expect(cache.get('a')).toBe(1)
      expect(cache.get('b')).toBe(2)
    })

    it('should return undefined for non-existent keys', () => {
      const cache = new LRUCache<string, number>(10)
      expect(cache.get('nonexistent')).toBeUndefined()
    })

    it('should update value for existing key', () => {
      const cache = new LRUCache<string, number>(10)
      cache.set('a', 1)
      cache.set('a', 2)
      expect(cache.get('a')).toBe(2)
      expect(cache.size).toBe(1)
    })
  })

  describe('LRU eviction', () => {
    it('should evict least recently used item when capacity exceeded', () => {
      const cache = new LRUCache<string, number>(3)
      cache.set('a', 1)
      cache.set('b', 2)
      cache.set('c', 3)
      cache.set('d', 4) // Should evict 'a'

      expect(cache.get('a')).toBeUndefined()
      expect(cache.get('b')).toBe(2)
      expect(cache.get('c')).toBe(3)
      expect(cache.get('d')).toBe(4)
      expect(cache.size).toBe(3)
    })

    it('should update LRU order on get', () => {
      const cache = new LRUCache<string, number>(3)
      cache.set('a', 1)
      cache.set('b', 2)
      cache.set('c', 3)
      cache.get('a') // Access 'a', making it recently used
      cache.set('d', 4) // Should evict 'b' (now least recently used)

      expect(cache.get('a')).toBe(1)
      expect(cache.get('b')).toBeUndefined()
      expect(cache.get('c')).toBe(3)
      expect(cache.get('d')).toBe(4)
    })

    it('should update LRU order on set for existing key', () => {
      const cache = new LRUCache<string, number>(3)
      cache.set('a', 1)
      cache.set('b', 2)
      cache.set('c', 3)
      cache.set('a', 10) // Update 'a', making it recently used
      cache.set('d', 4) // Should evict 'b' (now least recently used)

      expect(cache.get('a')).toBe(10)
      expect(cache.get('b')).toBeUndefined()
      expect(cache.get('c')).toBe(3)
      expect(cache.get('d')).toBe(4)
    })
  })

  describe('has', () => {
    it('should return true for existing keys', () => {
      const cache = new LRUCache<string, number>(10)
      cache.set('a', 1)
      expect(cache.has('a')).toBe(true)
    })

    it('should return false for non-existent keys', () => {
      const cache = new LRUCache<string, number>(10)
      expect(cache.has('a')).toBe(false)
    })

    it('should not affect LRU order', () => {
      const cache = new LRUCache<string, number>(3)
      cache.set('a', 1)
      cache.set('b', 2)
      cache.set('c', 3)
      cache.has('a') // Check 'a' but don't update order
      cache.set('d', 4) // Should evict 'a' (still least recently used)

      expect(cache.has('a')).toBe(false)
      expect(cache.has('b')).toBe(true)
    })
  })

  describe('delete', () => {
    it('should remove existing key', () => {
      const cache = new LRUCache<string, number>(10)
      cache.set('a', 1)
      expect(cache.delete('a')).toBe(true)
      expect(cache.get('a')).toBeUndefined()
      expect(cache.size).toBe(0)
    })

    it('should return false for non-existent key', () => {
      const cache = new LRUCache<string, number>(10)
      expect(cache.delete('nonexistent')).toBe(false)
    })
  })

  describe('clear', () => {
    it('should remove all entries', () => {
      const cache = new LRUCache<string, number>(10)
      cache.set('a', 1)
      cache.set('b', 2)
      cache.set('c', 3)
      cache.clear()
      expect(cache.size).toBe(0)
      expect(cache.get('a')).toBeUndefined()
    })
  })

  describe('size', () => {
    it('should return correct size', () => {
      const cache = new LRUCache<string, number>(10)
      expect(cache.size).toBe(0)
      cache.set('a', 1)
      expect(cache.size).toBe(1)
      cache.set('b', 2)
      expect(cache.size).toBe(2)
    })

    it('should not exceed capacity', () => {
      const cache = new LRUCache<string, number>(3)
      cache.set('a', 1)
      cache.set('b', 2)
      cache.set('c', 3)
      cache.set('d', 4)
      expect(cache.size).toBe(3)
    })
  })

  describe('iterators', () => {
    it('should iterate keys from least to most recently used', () => {
      const cache = new LRUCache<string, number>(10)
      cache.set('a', 1)
      cache.set('b', 2)
      cache.set('c', 3)
      cache.get('a') // Move 'a' to most recent

      const keys = Array.from(cache.keys())
      expect(keys).toEqual(['b', 'c', 'a'])
    })

    it('should iterate values', () => {
      const cache = new LRUCache<string, number>(10)
      cache.set('a', 1)
      cache.set('b', 2)

      const values = Array.from(cache.values())
      expect(values).toEqual([1, 2])
    })

    it('should iterate entries', () => {
      const cache = new LRUCache<string, number>(10)
      cache.set('a', 1)
      cache.set('b', 2)

      const entries = Array.from(cache.entries())
      expect(entries).toEqual([['a', 1], ['b', 2]])
    })

    it('should support forEach', () => {
      const cache = new LRUCache<string, number>(10)
      cache.set('a', 1)
      cache.set('b', 2)

      const result: Array<[string, number]> = []
      cache.forEach((value, key) => result.push([key, value]))
      expect(result).toEqual([['a', 1], ['b', 2]])
    })
  })

  describe('type safety', () => {
    it('should work with different types', () => {
      const numCache = new LRUCache<number, string>(10)
      numCache.set(1, 'one')
      expect(numCache.get(1)).toBe('one')

      const objCache = new LRUCache<string, { id: number }>(10)
      objCache.set('obj', { id: 42 })
      expect(objCache.get('obj')).toEqual({ id: 42 })
    })
  })

  describe('edge cases', () => {
    it('should handle cache of size 1', () => {
      const cache = new LRUCache<string, number>(1)
      cache.set('a', 1)
      expect(cache.get('a')).toBe(1)
      cache.set('b', 2)
      expect(cache.get('a')).toBeUndefined()
      expect(cache.get('b')).toBe(2)
    })

    it('should handle null and undefined values', () => {
      const cache = new LRUCache<string, string | null | undefined>(10)
      cache.set('null', null)
      cache.set('undefined', undefined)
      expect(cache.get('null')).toBeNull()
      expect(cache.get('undefined')).toBeUndefined()
      expect(cache.has('null')).toBe(true)
      expect(cache.has('undefined')).toBe(true)
    })
  })
})
