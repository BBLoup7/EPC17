/**
 * Series Data Service - Pure data operations for Series system
 * Single source of truth: always delegates to DataManager
 * NO UI, NO business logic, ONLY data CRUD
 */

class SeriesDataService {
    constructor(dataManager) {
        if (!dataManager) {
            throw new Error('SeriesDataService requires DataManager instance');
        }
        this.dataManager = dataManager;
        window.debugLogger?.init('SeriesData', 'SeriesDataService initialized');
    }

    /**
     * Get all series
     * @returns {Array} Array of series objects
     */
    getAllSeries() {
        return this.dataManager.getAllSeries();
    }

    /**
     * Get series by ID
     * @param {string} id - Series ID
     * @returns {Object|null} Series object or null
     */
    getSeries(id) {
        return this.dataManager.getSeries(id);
    }

    /**
     * Create new series
     * @param {Object} seriesData - Series data
     * @returns {Promise<Object>} Created series object
     */
    async createSeries(seriesData) {
        // Normalize data structure
        const normalizedData = this.normalizeSeriesData(seriesData);
        
        // Validate required fields
        this.validateSeriesData(normalizedData);
        
        // Create via DataManager
        const series = await this.dataManager.addSeries(normalizedData);
        
        window.debugLogger?.debug('SeriesData', 'Series created:', series.id);
        return series;
    }

    /**
     * Update existing series
     * @param {string} id - Series ID
     * @param {Object} updates - Data to update
     * @returns {Promise<boolean>} Success status
     */
    async updateSeries(id, updates) {
        // Normalize updates
        const normalizedUpdates = this.normalizeSeriesData(updates);
        
        // Update via DataManager
        const success = await this.dataManager.updateSeries(id, normalizedUpdates);
        
        if (success) {
            window.debugLogger?.debug('SeriesData', 'Series updated:', id);
        }
        
        return success;
    }

    /**
     * Delete series
     * @param {string} id - Series ID
     * @returns {Promise<boolean>} Success status
     */
    async deleteSeries(id) {
        const success = await this.dataManager.deleteSeries(id);
        
        if (success) {
            window.debugLogger?.debug('SeriesData', 'Series deleted:', id);
        }
        
        return success;
    }

    /**
     * Get events for a series
     * @param {string} seriesId - Series ID
     * @returns {Promise<Array>} Array of event objects
     */
    async getSeriesEvents(seriesId) {
        const result = await this.dataManager.getEvents({ seriesId }, 1, 10000);
        return result.events || result || [];
    }

    /**
     * Get events for a specific season
     * @param {string} seriesId - Series ID
     * @param {string} seasonId - Season ID
     * @returns {Promise<Array>} Array of event objects
     */
    async getSeasonEvents(seriesId, seasonId) {
        const result = await this.dataManager.getEvents({ seriesId, seasonId }, 1, 10000);
        return result.events || result || [];
    }

    /**
     * Normalize series data to consistent schema
     * Fixes: createdAt vs createdDate, ensures arrays exist
     */
    normalizeSeriesData(data) {
        const normalized = { ...data };
        
        // Standardize timestamp field
        if (normalized.createdDate && !normalized.createdAt) {
            normalized.createdAt = normalized.createdDate;
            delete normalized.createdDate;
        }
        
        // Ensure createdAt exists for new series
        if (!normalized.createdAt) {
            normalized.createdAt = new Date().toISOString();
        }
        
        // Ensure arrays exist
        normalized.seasons = normalized.seasons || [];
        normalized.sledClasses = normalized.sledClasses || [];
        normalized.events = normalized.events || [];
        
        // Ensure each season has required fields
        normalized.seasons = normalized.seasons.map(season => ({
            id: season.id || this.generateId('season'),
            name: season.name || 'Unnamed Season',
            startDate: season.startDate || null,
            endDate: season.endDate || null,
            status: season.status || 'upcoming',
            createdAt: season.createdAt || new Date().toISOString()
        }));
        
        // Ensure each class has required fields
        normalized.sledClasses = normalized.sledClasses.map(cls => ({
            id: cls.id || this.generateId('class'),
            name: cls.name || 'Unnamed Class',
            defaultFee: typeof cls.defaultFee === 'number' ? cls.defaultFee : (cls.fee || 0),
            description: cls.description || `${cls.name} class racing`
        }));
        
        return normalized;
    }

    /**
     * Validate series data
     */
    validateSeriesData(data) {
        if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
            throw new Error('Series name is required');
        }
        
        // Validate seasons if provided
        if (data.seasons && data.seasons.length > 0) {
            data.seasons.forEach((season, index) => {
                if (!season.name) {
                    throw new Error(`Season at index ${index} missing name`);
                }
                
                // Validate date order
                if (season.startDate && season.endDate) {
                    if (new Date(season.endDate) <= new Date(season.startDate)) {
                        throw new Error(`Season "${season.name}": end date must be after start date`);
                    }
                }
            });
        }
        
        // Validate classes if provided
        if (data.sledClasses && data.sledClasses.length > 0) {
            data.sledClasses.forEach((cls, index) => {
                if (!cls.name) {
                    throw new Error(`Class at index ${index} missing name`);
                }
            });
        }
    }

    /**
     * Generate unique ID
     */
    generateId(prefix = 'series') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SeriesDataService;
}

// Make available globally
if (typeof window !== 'undefined') {
    window.SeriesDataService = SeriesDataService;
}

