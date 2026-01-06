/**
 * A simple LRU (Least Recently Used) cache implementation.
 * Provides O(1) get, set, and delete operations with automatic eviction
 * of least recently used entries when capacity is exceeded.
 */
export declare class LRUCache<K, V> {
    private cache;
    private readonly maxSize;
    /**
     * Creates a new LRU cache with the specified maximum size.
     * @param maxSize - The maximum number of entries to store (default: 1000)
     */
    constructor(maxSize?: number);
    /**
     * Gets a value from the cache and marks it as recently used.
     * @param key - The key to look up
     * @returns The value if found, undefined otherwise
     */
    get(key: K): V | undefined;
    /**
     * Sets a value in the cache, evicting the least recently used entry if needed.
     * @param key - The key to store
     * @param value - The value to store
     */
    set(key: K, value: V): void;
    /**
     * Checks if a key exists in the cache without affecting its position.
     * @param key - The key to check
     * @returns True if the key exists, false otherwise
     */
    has(key: K): boolean;
    /**
     * Deletes a key from the cache.
     * @param key - The key to delete
     * @returns True if the key was deleted, false if it didn't exist
     */
    delete(key: K): boolean;
    /**
     * Clears all entries from the cache.
     */
    clear(): void;
    /**
     * Returns the current number of entries in the cache.
     */
    get size(): number;
    /**
     * Returns the maximum capacity of the cache.
     */
    get capacity(): number;
    /**
     * Returns all keys in the cache (from least to most recently used).
     */
    keys(): IterableIterator<K>;
    /**
     * Returns all values in the cache (from least to most recently used).
     */
    values(): IterableIterator<V>;
    /**
     * Returns all entries in the cache (from least to most recently used).
     */
    entries(): IterableIterator<[K, V]>;
    /**
     * Iterates over all entries in the cache.
     */
    forEach(callback: (value: V, key: K, cache: LRUCache<K, V>) => void): void;
}
//# sourceMappingURL=lru-cache.d.ts.map