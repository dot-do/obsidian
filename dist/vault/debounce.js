/**
 * A debouncer that batches rapid successive calls and executes them after a delay.
 * Useful for file watching to avoid processing multiple events for the same file.
 */
export class Debouncer {
    pending = new Map();
    delay;
    callback;
    /**
     * Creates a new debouncer.
     * @param callback - The function to call after the debounce delay
     * @param delay - The delay in milliseconds (default: 100ms)
     */
    constructor(callback, delay = 100) {
        this.callback = callback;
        this.delay = delay;
    }
    /**
     * Schedules a callback for the given key. If called again with the same key
     * before the delay expires, the timer is reset and the data is updated.
     * @param key - A unique identifier for this debounced item
     * @param data - The data to pass to the callback
     */
    schedule(key, data) {
        // Clear existing timer for this key if any
        const existing = this.pending.get(key);
        if (existing) {
            clearTimeout(existing.timer);
        }
        // Set new timer
        const timer = setTimeout(() => {
            this.pending.delete(key);
            this.callback(key, data);
        }, this.delay);
        this.pending.set(key, { data, timer });
    }
    /**
     * Cancels a pending debounced callback for the given key.
     * @param key - The key to cancel
     * @returns True if a pending callback was cancelled, false otherwise
     */
    cancel(key) {
        const existing = this.pending.get(key);
        if (existing) {
            clearTimeout(existing.timer);
            this.pending.delete(key);
            return true;
        }
        return false;
    }
    /**
     * Immediately executes and clears all pending callbacks.
     */
    flush() {
        for (const [key, { data, timer }] of this.pending) {
            clearTimeout(timer);
            this.callback(key, data);
        }
        this.pending.clear();
    }
    /**
     * Clears all pending callbacks without executing them.
     */
    clear() {
        for (const { timer } of this.pending.values()) {
            clearTimeout(timer);
        }
        this.pending.clear();
    }
    /**
     * Returns the number of pending callbacks.
     */
    get size() {
        return this.pending.size;
    }
    /**
     * Checks if there's a pending callback for the given key.
     * @param key - The key to check
     */
    isPending(key) {
        return this.pending.has(key);
    }
}
/**
 * A coalescing debouncer that merges multiple events for the same key
 * and provides the latest event type to the callback.
 */
export class EventCoalescer {
    pending = new Map();
    delay;
    callback;
    /**
     * Creates a new event coalescer.
     * @param callback - The function to call with coalesced events
     * @param delay - The delay in milliseconds (default: 50ms)
     */
    constructor(callback, delay = 50) {
        this.callback = callback;
        this.delay = delay;
    }
    /**
     * Adds an event to be coalesced for the given key.
     * @param key - A unique identifier for the file/item
     * @param type - The event type (e.g., 'create', 'modify', 'delete')
     * @param data - Optional data associated with the event
     */
    add(key, type, data) {
        const existing = this.pending.get(key);
        if (existing) {
            clearTimeout(existing.timer);
            existing.types.add(type);
            if (data !== undefined) {
                existing.latestData = data;
            }
        }
        else {
            this.pending.set(key, {
                types: new Set([type]),
                timer: setTimeout(() => { }, 0), // placeholder
                latestData: data
            });
        }
        const entry = this.pending.get(key);
        entry.timer = setTimeout(() => {
            this.pending.delete(key);
            this.callback(key, entry.types, entry.latestData);
        }, this.delay);
    }
    /**
     * Clears all pending events without executing them.
     */
    clear() {
        for (const { timer } of this.pending.values()) {
            clearTimeout(timer);
        }
        this.pending.clear();
    }
    /**
     * Returns the number of pending event groups.
     */
    get size() {
        return this.pending.size;
    }
}
//# sourceMappingURL=debounce.js.map