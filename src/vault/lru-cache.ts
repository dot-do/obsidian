/**
 * A simple LRU (Least Recently Used) cache implementation.
 * Provides O(1) get, set, and delete operations with automatic eviction
 * of least recently used entries when capacity is exceeded.
 */
export class LRUCache<K, V> {
  private cache = new Map<K, V>()
  private readonly maxSize: number

  /**
   * Creates a new LRU cache with the specified maximum size.
   * @param maxSize - The maximum number of entries to store (default: 1000)
   */
  constructor(maxSize: number = 1000) {
    if (maxSize < 1) {
      throw new Error('LRU cache maxSize must be at least 1')
    }
    this.maxSize = maxSize
  }

  /**
   * Gets a value from the cache and marks it as recently used.
   * @param key - The key to look up
   * @returns The value if found, undefined otherwise
   */
  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined
    }
    // Move to end (most recently used) by deleting and re-adding
    const value = this.cache.get(key)!
    this.cache.delete(key)
    this.cache.set(key, value)
    return value
  }

  /**
   * Sets a value in the cache, evicting the least recently used entry if needed.
   * @param key - The key to store
   * @param value - The value to store
   */
  set(key: K, value: V): void {
    // If key exists, delete it first to update its position
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxSize) {
      // Evict the least recently used entry (first item in Map)
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }
    this.cache.set(key, value)
  }

  /**
   * Checks if a key exists in the cache without affecting its position.
   * @param key - The key to check
   * @returns True if the key exists, false otherwise
   */
  has(key: K): boolean {
    return this.cache.has(key)
  }

  /**
   * Deletes a key from the cache.
   * @param key - The key to delete
   * @returns True if the key was deleted, false if it didn't exist
   */
  delete(key: K): boolean {
    return this.cache.delete(key)
  }

  /**
   * Clears all entries from the cache.
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Returns the current number of entries in the cache.
   */
  get size(): number {
    return this.cache.size
  }

  /**
   * Returns the maximum capacity of the cache.
   */
  get capacity(): number {
    return this.maxSize
  }

  /**
   * Returns all keys in the cache (from least to most recently used).
   */
  keys(): IterableIterator<K> {
    return this.cache.keys()
  }

  /**
   * Returns all values in the cache (from least to most recently used).
   */
  values(): IterableIterator<V> {
    return this.cache.values()
  }

  /**
   * Returns all entries in the cache (from least to most recently used).
   */
  entries(): IterableIterator<[K, V]> {
    return this.cache.entries()
  }

  /**
   * Iterates over all entries in the cache.
   */
  forEach(callback: (value: V, key: K, cache: LRUCache<K, V>) => void): void {
    this.cache.forEach((value, key) => callback(value, key, this))
  }
}
