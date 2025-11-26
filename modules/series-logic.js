/**
 * Series Business Logic - Pure functions for series calculations
 * NO data access, NO UI, ONLY calculations
 * All functions are pure: same input = same output
 */

const SeriesBusinessLogic = {
    /**
     * Check if a season is currently active
     * @param {Object} season - Season object
     * @returns {boolean} True if season is active
     */
    isSeasonActive(season) {
        if (!season) return false;
        
        const now = new Date();
        const startDate = season.startDate ? new Date(season.startDate) : null;
        const endDate = season.endDate ? new Date(season.endDate) : null;
        
        // If no dates set, check status only
        if (!startDate && !endDate) {
            return season.status === 'active';
        }
        
        // Check if current date is within season range
        const isAfterStart = !startDate || now >= startDate;
        const isBeforeEnd = !endDate || now <= endDate;
        
        return isAfterStart && isBeforeEnd && season.status !== 'completed';
    },

    /**
     * Get active seasons from a list
     * @param {Array} seasons - Array of season objects
     * @returns {Array} Filtered array of active seasons
     */
    getActiveSeasons(seasons) {
        if (!Array.isArray(seasons)) return [];
        return seasons.filter(season => this.isSeasonActive(season));
    },

    /**
     * Check if series is active (has active seasons or recent events)
     * @param {Object} series - Series object
     * @param {Array} events - Array of event objects for this series
     * @returns {boolean} True if series is active
     */
    isSeriesActive(series, events = []) {
        // Check for active seasons
        if (series.seasons && series.seasons.length > 0) {
            const activeSeasons = this.getActiveSeasons(series.seasons);
            if (activeSeasons.length > 0) return true;
        }
        
        // Check for recent events (within last 90 days)
        if (events.length > 0) {
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
            
            const recentEvents = events.filter(event => {
                const eventDate = new Date(event.date);
                return eventDate >= ninetyDaysAgo;
            });
            
            return recentEvents.length > 0;
        }
        
        // Check explicit status
        return series.status === 'active';
    },

    /**
     * Get class definition by ID
     * @param {Object} series - Series object
     * @param {string} classId - Class ID to find
     * @returns {Object|null} Class object or null
     */
    getClassById(series, classId) {
        if (!series || !series.sledClasses) return null;
        return series.sledClasses.find(cls => cls.id === classId) || null;
    },

    /**
     * Get class name by ID (helper for display)
     * @param {Object} series - Series object
     * @param {string} classId - Class ID
     * @returns {string} Class name or 'Unknown'
     */
    getClassName(series, classId) {
        const cls = this.getClassById(series, classId);
        return cls ? cls.name : 'Unknown';
    },

    /**
     * Resolve event class settings to full class information
     * Merges series class definitions with event-specific settings
     * @param {Object} series - Series object
     * @param {Array} eventClassSettings - Event's class settings array
     * @returns {Array} Array of resolved class objects
     */
    resolveEventClasses(series, eventClassSettings = []) {
        if (!series || !series.sledClasses) return [];
        
        // If no event class settings, return all series classes (enabled by default)
        if (!eventClassSettings || eventClassSettings.length === 0) {
            return series.sledClasses.map(cls => ({
                ...cls,
                enabled: true,
                price: cls.defaultFee
            }));
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
    },

    /**
     * Get enabled classes for an event
     * @param {Object} series - Series object
     * @param {Array} eventClassSettings - Event's class settings
     * @returns {Array} Array of enabled class objects
     */
    getEnabledEventClasses(series, eventClassSettings = []) {
        const resolved = this.resolveEventClasses(series, eventClassSettings);
        return resolved.filter(cls => cls.enabled);
    },

    /**
     * Calculate series statistics
     * @param {Object} series - Series object
     * @param {Array} events - Array of events for this series
     * @returns {Object} Statistics object
     */
    calculateSeriesStats(series, events = []) {
        const activeSeasons = this.getActiveSeasons(series.seasons || []);
        const isActive = this.isSeriesActive(series, events);
        
        // Count events by status
        const upcomingEvents = events.filter(e => new Date(e.date) > new Date()).length;
        const completedEvents = events.filter(e => e.status === 'completed' || e.status === 'finished').length;
        
        // Get unique participants across all events
        const uniqueParticipants = new Set();
        events.forEach(event => {
            if (event.participants && Array.isArray(event.participants)) {
                event.participants.forEach(pid => uniqueParticipants.add(pid));
            }
        });
        
        return {
            totalSeasons: (series.seasons || []).length,
            activeSeasons: activeSeasons.length,
            totalEvents: events.length,
            upcomingEvents,
            completedEvents,
            totalClasses: (series.sledClasses || []).length,
            uniqueParticipants: uniqueParticipants.size,
            isActive
        };
    },

    /**
     * Find season by ID
     * @param {Object} series - Series object
     * @param {string} seasonId - Season ID
     * @returns {Object|null} Season object or null
     */
    getSeasonById(series, seasonId) {
        if (!series || !series.seasons) return null;
        return series.seasons.find(s => s.id === seasonId) || null;
    },

    /**
     * Validate class settings for an event
     * @param {Object} series - Series object
     * @param {Array} classSettings - Proposed class settings
     * @returns {Object} { valid: boolean, errors: Array }
     */
    validateEventClassSettings(series, classSettings) {
        const errors = [];
        
        if (!series || !series.sledClasses) {
            errors.push('Series or series classes not found');
            return { valid: false, errors };
        }
        
        if (!Array.isArray(classSettings)) {
            errors.push('Class settings must be an array');
            return { valid: false, errors };
        }
        
        // Check that all classIds reference valid series classes
        classSettings.forEach((setting, index) => {
            if (!setting.classId) {
                errors.push(`Class setting at index ${index} missing classId`);
                return;
            }
            
            const seriesClass = series.sledClasses.find(cls => cls.id === setting.classId);
            if (!seriesClass) {
                errors.push(`Class ${setting.classId} not found in series ${series.id}`);
            }
            
            // Validate price if specified
            if (setting.price !== undefined && typeof setting.price !== 'number') {
                errors.push(`Class setting at index ${index} has invalid price`);
            }
        });
        
        return {
            valid: errors.length === 0,
            errors
        };
    },

    /**
     * Sort series by criteria
     * @param {Array} seriesArray - Array of series objects
     * @param {string} sortBy - Sort criteria ('name', 'date', 'active')
     * @param {string} order - Sort order ('asc' or 'desc')
     * @returns {Array} Sorted array
     */
    sortSeries(seriesArray, sortBy = 'date', order = 'desc') {
        const sorted = [...seriesArray];
        
        sorted.sort((a, b) => {
            let comparison = 0;
            
            switch (sortBy) {
                case 'name':
                    comparison = a.name.localeCompare(b.name);
                    break;
                    
                case 'date':
                    const dateA = new Date(a.createdAt);
                    const dateB = new Date(b.createdAt);
                    comparison = dateA - dateB;
                    break;
                    
                case 'active':
                    // Active first
                    const activeA = a.status === 'active' ? 1 : 0;
                    const activeB = b.status === 'active' ? 1 : 0;
                    comparison = activeB - activeA;
                    break;
                    
                default:
                    comparison = 0;
            }
            
            return order === 'asc' ? comparison : -comparison;
        });
        
        return sorted;
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SeriesBusinessLogic;
}

// Make available globally
if (typeof window !== 'undefined') {
    window.SeriesBusinessLogic = SeriesBusinessLogic;
}

