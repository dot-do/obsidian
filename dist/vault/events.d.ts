/**
 * Reference to an event subscription that can be used to unsubscribe
 */
export interface EventRef {
    unsubscribe(): void;
}
/**
 * Generic event system with support for typed event callbacks
 * Provides on(), off(), and trigger() methods for managing event subscriptions
 */
export declare class Events {
    private listeners;
    /**
     * Subscribe to an event
     * @param event - The event name to listen for
     * @param callback - The function to call when the event is triggered
     * @returns An EventRef that can be used to unsubscribe
     */
    on<T = unknown>(event: string, callback: (data: T) => void): EventRef;
    /**
     * Unsubscribe a listener from an event
     * @param event - The event name
     * @param refOrCallback - The EventRef or callback to remove
     */
    off(event: string, refOrCallback: EventRef | Function): void;
    /**
     * Trigger an event with optional arguments
     * All listeners are called even if one throws an error
     * @param event - The event name to trigger
     * @param args - Arguments to pass to all listeners
     */
    trigger(event: string, ...args: any[]): void;
}
//# sourceMappingURL=events.d.ts.map