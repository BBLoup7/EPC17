/**
 * Session Persistence Utility for EPC17
 * Lightweight session memory that remembers user interface state after page refreshes
 * Uses sessionStorage (resets when browser tab is closed)
 */

class SessionPersistence {
    constructor() {
        this.pageKeys = {
            races: 'epc17_races_state',
            participants: 'epc17_participants_state',
            driverProfile: 'epc17_driver_profile_state',
            finalResults: 'epc17_final_results_state',
            analytics: 'epc17_analytics_state'
        };
    }

    /**
     * Get the current page identifier from the URL
     */
    getCurrentPage() {
        const path = window.location.pathname;
        if (path.includes('races.html')) return 'races';
        if (path.includes('participants.html')) return 'participants';
        if (path.includes('driver-profile.html')) return 'driverProfile';
        if (path.includes('final-results.html')) return 'finalResults';
        if (path.includes('analytics.html')) return 'analytics';
        return null;
    }

    /**
     * Save state for the current page
     */
    saveState(state) {
        const page = this.getCurrentPage();
        if (!page) return;

        try {
            const key = this.pageKeys[page];
            sessionStorage.setItem(key, JSON.stringify(state));
        } catch (error) {
            console.warn('Failed to save session state:', error);
        }
    }

    /**
     * Load state for the current page
     */
    loadState() {
        const page = this.getCurrentPage();
        if (!page) return null;

        try {
            const key = this.pageKeys[page];
            const stored = sessionStorage.getItem(key);
            return stored ? JSON.parse(stored) : null;
        } catch (error) {
            console.warn('Failed to load session state:', error);
            return null;
        }
    }

    /**
     * Clear state for the current page
     */
    clearState() {
        const page = this.getCurrentPage();
        if (!page) return;

        try {
            const key = this.pageKeys[page];
            sessionStorage.removeItem(key);
        } catch (error) {
            console.warn('Failed to clear session state:', error);
        }
    }

    /**
     * Update specific properties in the current page state
     */
    updateState(updates) {
        const currentState = this.loadState() || {};
        const newState = { ...currentState, ...updates };
        this.saveState(newState);
        return newState;
    }

    /**
     * Get a specific property from the current page state
     */
    getStateProperty(property, defaultValue = null) {
        const state = this.loadState();
        return state && state[property] !== undefined ? state[property] : defaultValue;
    }

    /**
     * Initialize session persistence for a specific page
     * Call this when the page loads to restore previous state
     */
    initializePage(callback) {
        const state = this.loadState();
        if (state && callback) {
            try {
                callback(state);
            } catch (error) {
                console.error('Error restoring session state:', error);
            }
        }
        return state;
    }
}

// Create global instance
window.SessionPersistence = new SessionPersistence();

// Page-specific persistence helpers
window.SessionPersistence.Races = {
    save(eventId, raceId = null, bracketRound = null, filters = {}) {
        window.SessionPersistence.saveState({
            eventId,
            raceId,
            bracketRound,
            filters,
            timestamp: Date.now()
        });
    },

    load() {
        return window.SessionPersistence.loadState();
    }
};

window.SessionPersistence.Participants = {
    save(searchTerm = '', filters = {}, selectedParticipantId = null, scrollPosition = 0) {
        window.SessionPersistence.saveState({
            searchTerm,
            filters,
            selectedParticipantId,
            scrollPosition,
            timestamp: Date.now()
        });
    },

    load() {
        return window.SessionPersistence.loadState();
    }
};

window.SessionPersistence.DriverProfile = {
    save(driverId, eventFilter = '') {
        window.SessionPersistence.saveState({
            driverId,
            eventFilter,
            timestamp: Date.now()
        });
    },

    load() {
        return window.SessionPersistence.loadState();
    }
};

window.SessionPersistence.FinalResults = {
    save(eventId, classFilter = '') {
        window.SessionPersistence.saveState({
            eventId,
            classFilter,
            timestamp: Date.now()
        });
    },

    load() {
        return window.SessionPersistence.loadState();
    }
};

window.SessionPersistence.Analytics = {
    save(activeTab = 'overall', filters = {}) {
        window.SessionPersistence.saveState({
            activeTab,
            filters,
            timestamp: Date.now()
        });
    },

    load() {
        return window.SessionPersistence.loadState();
    }
};
