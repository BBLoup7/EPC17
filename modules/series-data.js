/**
 * Series Data Service - Pure data operations for Series system
 * Single source of truth: always delegates to DataManager
 * NO UI, NO business logic, ONLY data CRUD
 *
 * Exports: SeriesDataService (window.SeriesDataService)
 * Inputs: DataManager instance
 * Outputs: normalized series objects
 * Error modes: validation errors thrown; CRUD failures propagate from DataManager
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
     * Normalize legacy status values to active | archived
     */
    normalizeStatus(status) {
        const value = String(status || 'active').trim().toLowerCase();
        if (['archived', 'completed', 'cancelled', 'canceled'].includes(value)) {
            return 'archived';
        }
        return 'active';
    }

    getAllSeries() {
        return (this.dataManager.getAllSeries() || []).map((s) => this.normalizeSeriesData(s));
    }

    getSeries(id) {
        const series = this.dataManager.getSeries(id);
        return series ? this.normalizeSeriesData(series) : null;
    }

    async createSeries(seriesData) {
        const normalizedData = this.normalizeSeriesData(seriesData);
        this.validateSeriesData(normalizedData);
        const series = await this.dataManager.addSeries(normalizedData);
        window.debugLogger?.debug('SeriesData', 'Series created:', series.id);
        return series;
    }

    async updateSeries(id, updates) {
        const existing = this.getSeries(id);
        if (!existing) {
            throw new Error('Series not found');
        }
        const normalizedUpdates = this.normalizeSeriesData({ ...existing, ...updates });
        this.validateSeriesData(normalizedUpdates);
        const success = await this.dataManager.updateSeries(id, normalizedUpdates);
        if (success) {
            window.debugLogger?.debug('SeriesData', 'Series updated:', id);
        }
        return success;
    }

    async archiveSeries(id) {
        return this.updateSeries(id, { status: 'archived' });
    }

    async restoreSeries(id) {
        return this.updateSeries(id, { status: 'active' });
    }

    async deleteSeries(id) {
        const success = await this.dataManager.deleteSeries(id);
        if (success) {
            window.debugLogger?.debug('SeriesData', 'Series deleted:', id);
        }
        return success;
    }

    /**
     * Duplicate a series with new IDs for series, seasons, and classes
     */
    async duplicateSeries(id) {
        const source = this.getSeries(id);
        if (!source) {
            throw new Error('Series not found');
        }

        const seasonIdMap = new Map();
        const seasons = (source.seasons || []).map((season) => {
            const newId = this.generateId('season');
            seasonIdMap.set(season.id, newId);
            return {
                ...season,
                id: newId,
                createdAt: new Date().toISOString()
            };
        });

        const sledClasses = (source.sledClasses || []).map((cls) => ({
            ...cls,
            id: this.generateId('class')
        }));

        let defaultSeasonId = null;
        if (source.defaultSeasonId && seasonIdMap.has(source.defaultSeasonId)) {
            defaultSeasonId = seasonIdMap.get(source.defaultSeasonId);
        }

        const copy = {
            name: `Copy of ${source.name}`,
            shortName: source.shortName || '',
            description: source.description || '',
            status: 'active',
            seasons,
            sledClasses,
            defaultSeasonId,
            events: [],
            standings: []
        };

        return this.createSeries(copy);
    }

    async getSeriesEvents(seriesId) {
        const result = await this.dataManager.getEvents({ seriesId }, 1, 10000);
        return result.events || result || [];
    }

    async getSeasonEvents(seriesId, seasonId) {
        const result = await this.dataManager.getEvents({ seriesId, seasonId }, 1, 10000);
        return result.events || result || [];
    }

    /**
     * Normalize series data to consistent schema
     */
    normalizeSeriesData(data) {
        const normalized = { ...data };

        if (normalized.createdDate && !normalized.createdAt) {
            normalized.createdAt = normalized.createdDate;
            delete normalized.createdDate;
        }

        if (!normalized.createdAt) {
            normalized.createdAt = new Date().toISOString();
        }

        normalized.status = this.normalizeStatus(normalized.status);
        normalized.shortName = (normalized.shortName || '').trim();
        normalized.description = normalized.description || '';
        normalized.seasons = normalized.seasons || [];
        normalized.sledClasses = normalized.sledClasses || [];
        normalized.events = normalized.events || [];
        normalized.standings = normalized.standings || [];

        normalized.seasons = normalized.seasons.map((season) => ({
            id: season.id || this.generateId('season'),
            name: season.name || 'Unnamed Season',
            startDate: season.startDate || null,
            endDate: season.endDate || null,
            status: season.status || 'upcoming',
            createdAt: season.createdAt || new Date().toISOString()
        }));

        normalized.sledClasses = normalized.sledClasses.map((cls) => ({
            id: cls.id || this.generateId('class'),
            name: cls.name || 'Unnamed Class',
            defaultFee: typeof cls.defaultFee === 'number' ? cls.defaultFee : (cls.fee || 0),
            description: cls.description || `${cls.name} class racing`
        }));

        const seasonIds = new Set(normalized.seasons.map((s) => s.id));
        if (normalized.defaultSeasonId && !seasonIds.has(normalized.defaultSeasonId)) {
            normalized.defaultSeasonId = null;
        } else {
            normalized.defaultSeasonId = normalized.defaultSeasonId || null;
        }

        return normalized;
    }

    validateSeriesData(data) {
        if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
            throw new Error('Series name is required');
        }

        if (data.seasons && data.seasons.length > 0) {
            data.seasons.forEach((season, index) => {
                if (!season.name) {
                    throw new Error(`Season at index ${index} missing name`);
                }
                if (season.startDate && season.endDate) {
                    if (new Date(season.endDate) <= new Date(season.startDate)) {
                        throw new Error(`Season "${season.name}": end date must be after start date`);
                    }
                }
            });
        }

        if (data.sledClasses && data.sledClasses.length > 0) {
            data.sledClasses.forEach((cls, index) => {
                if (!cls.name) {
                    throw new Error(`Class at index ${index} missing name`);
                }
            });
        }
    }

    generateId(prefix = 'series') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SeriesDataService;
}

if (typeof window !== 'undefined') {
    window.SeriesDataService = SeriesDataService;
}
