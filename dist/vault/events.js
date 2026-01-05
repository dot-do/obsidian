// Event system for Vault
// Provides a simple pub/sub mechanism for file system events
/**
 * Generic event system with support for typed event callbacks
 * Provides on(), off(), and trigger() methods for managing event subscriptions
 */
export class Events {
    listeners = new Map();
    /**
     * Subscribe to an event
     * @param event - The event name to listen for
     * @param callback - The function to call when the event is triggered
     * @returns An EventRef that can be used to unsubscribe
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        const ref = { unsubscribe: () => this.off(event, ref) };
        this.listeners.get(event).add({ callback, ref });
        return ref;
    }
    /**
     * Unsubscribe a listener from an event
     * @param event - The event name
     * @param refOrCallback - The EventRef or callback to remove
     */
    off(event, refOrCallback) {
        const eventListeners = this.listeners.get(event);
        if (!eventListeners)
            return;
        for (const entry of eventListeners) {
            if (entry.ref === refOrCallback || entry.callback === refOrCallback) {
                eventListeners.delete(entry);
                break;
            }
        }
    }
    /**
     * Trigger an event with optional arguments
     * All listeners are called even if one throws an error
     * @param event - The event name to trigger
     * @param args - Arguments to pass to all listeners
     */
    trigger(event, ...args) {
        const eventListeners = this.listeners.get(event);
        if (!eventListeners)
            return;
        // Copy to array to allow safe modification during iteration
        const listenersCopy = Array.from(eventListeners);
        for (const entry of listenersCopy) {
            try {
                entry.callback(...args);
            }
            catch {
                // Ignore errors from listeners to ensure all listeners are called
            }
        }
    }
}
//# sourceMappingURL=events.js.map