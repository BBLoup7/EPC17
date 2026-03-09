/**
 * Class Resolver Utility
 * Centralizes class resolution logic to eliminate duplication across event.js, race.js, registration.js
 * 
 * Problem solved: Previously, multiple files had duplicate fallback logic to resolve:
 * - Series class definitions (id, name, defaultFee, description)
 * - Event class settings (classId, enabled, price)
 * 
 * This module provides a single source of truth for class resolution.
 */

const ClassResolver = {
    /**
     * Resolve full class information for an event
     * Merges series class definitions with event-specific settings
     * 
     * @param {Object} event - Event object
     * @param {Object} dataManager - DataManager instance
     * @returns {Array} Array of resolved class objects with full information
     */
    resolveEventClasses(event, dataManager) {
        if (!event) return [];
        
        // Get series if event belongs to one
        const series = event.seriesId ? dataManager.getSeries(event.seriesId) : null;
        
        if (!series || !series.sledClasses || series.sledClasses.length === 0) {
            return [];
        }
        
        // Use SeriesBusinessLogic if available for consistent resolution
        if (window.SeriesBusinessLogic) {
            return window.SeriesBusinessLogic.resolveEventClasses(series, event.classSettings || []);
        }
        
        // Fallback: manual resolution
        return this._manualResolve(series, event.classSettings || []);
    },

    /**
     * Get enabled classes for an event
     * @param {Object} event - Event object
     * @param {Object} dataManager - DataManager instance
     * @returns {Array} Array of enabled class objects
     */
    getEnabledEventClasses(event, dataManager) {
        const resolved = this.resolveEventClasses(event, dataManager);
        return resolved.filter(cls => cls.enabled !== false);
    },

    /**
     * Get class name by ID
     * @param {Object} event - Event object
     * @param {string} classId - Class ID
     * @param {Object} dataManager - DataManager instance
     * @returns {string} Class name or 'Unknown'
     */
    getClassName(event, classId, dataManager) {
        if (!event || !classId) return 'Unknown';
        
        const series = event.seriesId ? dataManager.getSeries(event.seriesId) : null;
        
        if (!series || !series.sledClasses) return 'Unknown';
        
        const cls = series.sledClasses.find(c => c.id === classId);
        return cls ? cls.name : 'Unknown';
    },

    /**
     * Get class definition by ID
     * @param {Object} event - Event object  
     * @param {string} classId - Class ID
     * @param {Object} dataManager - DataManager instance
     * @returns {Object|null} Class object or null
     */
    getClassById(event, classId, dataManager) {
        if (!event || !classId) return null;
        
        const series = event.seriesId ? dataManager.getSeries(event.seriesId) : null;
        
        if (!series || !series.sledClasses) return null;
        
        return series.sledClasses.find(c => c.id === classId) || null;
    },

    /**
     * Get all series classes for an event (even if not in event.classSettings)
     * Useful for fallback scenarios
     * @param {Object} event - Event object
     * @param {Object} dataManager - DataManager instance
     * @returns {Array} Array of series class objects
     */
    getSeriesClasses(event, dataManager) {
        if (!event) return [];
        
        const series = event.seriesId ? dataManager.getSeries(event.seriesId) : null;
        
        return series?.sledClasses || [];
    },

    /**
     * Check if an event has class settings configured
     * @param {Object} event - Event object
     * @returns {boolean} True if event has class settings
     */
    hasClassSettings(event) {
        return event && 
               event.classSettings && 
               Array.isArray(event.classSettings) && 
               event.classSettings.length > 0;
    },

    /**
     * Manual resolution (fallback if SeriesBusinessLogic not available)
     */
    _manualResolve(series, eventClassSettings) {
        // Strict behavior: event must explicitly configure classes
        if (!eventClassSettings || eventClassSettings.length === 0) {
            return [];
        }
        
        // Merge event settings with series class definitions
        return eventClassSettings.map(setting => {
            const seriesClass = series.sledClasses.find(cls => cls.id === setting.classId);
            
            if (!seriesClass) {
                console.warn(`Class ${setting.classId} not found in series ${series.id}`);
                return null;
            }
            
            return {
                id: seriesClass.id,
                name: seriesClass.name,
                description: seriesClass.description,
                defaultFee: seriesClass.defaultFee,
                enabled: setting.enabled !== false,
                price: typeof setting.price === 'number' ? setting.price : seriesClass.defaultFee
            };
        }).filter(Boolean); // Remove nulls
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ClassResolver;
}

// Make available globally
if (typeof window !== 'undefined') {
    window.ClassResolver = ClassResolver;
}

