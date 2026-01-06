/**
 * A debouncer that batches rapid successive calls and executes them after a delay.
 * Useful for file watching to avoid processing multiple events for the same file.
 */
export declare class Debouncer<T> {
    private pending;
    private readonly delay;
    private readonly callback;
    /**
     * Creates a new debouncer.
     * @param callback - The function to call after the debounce delay
     * @param delay - The delay in milliseconds (default: 100ms)
     */
    constructor(callback: (key: string, data: T) => void, delay?: number);
    /**
     * Schedules a callback for the given key. If called again with the same key
     * before the delay expires, the timer is reset and the data is updated.
     * @param key - A unique identifier for this debounced item
     * @param data - The data to pass to the callback
     */
    schedule(key: string, data: T): void;
    /**
     * Cancels a pending debounced callback for the given key.
     * @param key - The key to cancel
     * @returns True if a pending callback was cancelled, false otherwise
     */
    cancel(key: string): boolean;
    /**
     * Immediately executes and clears all pending callbacks.
     */
    flush(): void;
    /**
     * Clears all pending callbacks without executing them.
     */
    clear(): void;
    /**
     * Returns the number of pending callbacks.
     */
    get size(): number;
    /**
     * Checks if there's a pending callback for the given key.
     * @param key - The key to check
     */
    isPending(key: string): boolean;
}
/**
 * A coalescing debouncer that merges multiple events for the same key
 * and provides the latest event type to the callback.
 */
export declare class EventCoalescer {
    private pending;
    private readonly delay;
    private readonly callback;
    /**
     * Creates a new event coalescer.
     * @param callback - The function to call with coalesced events
     * @param delay - The delay in milliseconds (default: 50ms)
     */
    constructor(callback: (key: string, types: Set<string>, data: unknown) => void, delay?: number);
    /**
     * Adds an event to be coalesced for the given key.
     * @param key - A unique identifier for the file/item
     * @param type - The event type (e.g., 'create', 'modify', 'delete')
     * @param data - Optional data associated with the event
     */
    add(key: string, type: string, data?: unknown): void;
    /**
     * Clears all pending events without executing them.
     */
    clear(): void;
    /**
     * Returns the number of pending event groups.
     */
    get size(): number;
}
//# sourceMappingURL=debounce.d.ts.map