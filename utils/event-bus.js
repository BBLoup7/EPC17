/**
 * Event Bus for Real-time Data Change Notifications
 * Simple pub/sub system for module communication
 */

class EventBus {
    constructor() {
        this.listeners = new Map(); // event -> array of callback functions
        this.history = []; // Keep history of recent events for debugging
        this.maxHistorySize = 100;
        window.debugLogger?.init('EventBus', 'EventBus initialized');
    }

    /**
     * Subscribe to an event
     */
    on(eventName, callback) {
        if (typeof callback !== 'function') {
            window.debugLogger?.error('EventBus', 'Callback must be a function');
            return;
        }

        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, []);
        }

        const listeners = this.listeners.get(eventName);
        listeners.push(callback);

        window.debugLogger?.debug('EventBus', `Subscribed to event: ${eventName} (${listeners.length} listeners)`);

        // Return unsubscribe function
        return () => this.off(eventName, callback);
    }

    /**
     * Unsubscribe from an event
     */
    off(eventName, callback) {
        if (!this.listeners.has(eventName)) {
            return false;
        }

        const listeners = this.listeners.get(eventName);
        const index = listeners.indexOf(callback);
        
        if (index > -1) {
            listeners.splice(index, 1);
            window.debugLogger?.debug('EventBus', `Unsubscribed from event: ${eventName} (${listeners.length} listeners remaining)`);
            return true;
        }

        return false;
    }

    /**
     * Subscribe to an event only once
     */
    once(eventName, callback) {
        const unsubscribe = this.on(eventName, (data) => {
            unsubscribe();
            callback(data);
        });
        return unsubscribe;
    }

    /**
     * Emit an event to all listeners
     */
    emit(eventName, data = null) {
        // Add to history
        const eventData = {
            name: eventName,
            data,
            timestamp: new Date().toISOString(),
            id: this.generateEventId()
        };

        this.addToHistory(eventData);

        // Get listeners for this event
        const listeners = this.listeners.get(eventName) || [];
        
        if (listeners.length === 0) {
            window.debugLogger?.debug('EventBus', `Event emitted with no listeners: ${eventName}`);
            return;
        }

        window.debugLogger?.debug('EventBus', `Emitting event: ${eventName} to ${listeners.length} listeners`, data);

        // Call all listeners
        let successCount = 0;
        let errorCount = 0;

        for (const callback of listeners) {
            try {
                // Call callback with event data
                callback(data, eventData);
                successCount++;
            } catch (error) {
                window.debugLogger?.error('EventBus', `Error in event listener for ${eventName}:`, error);
                errorCount++;
            }
        }

        window.debugLogger?.debug('EventBus', `Event ${eventName} processed: ${successCount} success, ${errorCount} errors`);
    }

    /**
     * Add event to history
     */
    addToHistory(eventData) {
        this.history.unshift(eventData);
        
        // Keep history size manageable
        if (this.history.length > this.maxHistorySize) {
            this.history = this.history.slice(0, this.maxHistorySize);
        }
    }

    /**
     * Generate unique event ID
     */
    generateEventId() {
        return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get list of all active event listeners
     */
    getActiveListeners() {
        const result = {};
        for (const [eventName, listeners] of this.listeners.entries()) {
            if (listeners.length > 0) {
                result[eventName] = listeners.length;
            }
        }
        return result;
    }

    /**
     * Get recent event history
     */
    getEventHistory(limit = 20) {
        return this.history.slice(0, limit);
    }

    /**
     * Clear all listeners
     */
    clearAllListeners() {
        const totalListeners = Array.from(this.listeners.values()).reduce((sum, arr) => sum + arr.length, 0);
        this.listeners.clear();
        window.debugLogger?.debug('EventBus', `Cleared all listeners (${totalListeners} total)`);
    }

    /**
     * Debug information
     */
    getDebugInfo() {
        return {
            activeListeners: this.getActiveListeners(),
            recentEvents: this.getEventHistory(10),
            totalEventsProcessed: this.history.length
        };
    }

    /**
     * Remove all listeners for a specific event
     */
    removeAllListeners(eventName) {
        if (this.listeners.has(eventName)) {
            const count = this.listeners.get(eventName).length;
            this.listeners.delete(eventName);
            window.debugLogger?.debug('EventBus', `Removed all listeners for event: ${eventName} (${count} listeners)`);
            return count;
        }
        return 0;
    }
}

/**
 * Global event bus instance
 */
const globalEventBus = new EventBus();

// Export both the class and global instance
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EventBus, globalEventBus };
} else {
    // Browser environment
    window.EventBus = EventBus;
    window.globalEventBus = globalEventBus;
}
