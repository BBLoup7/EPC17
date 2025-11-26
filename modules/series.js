/**
 * Series Manager - Orchestrates series functionality using clean architecture
 * REFACTORED: Now delegates to specialized modules instead of doing everything
 * 
 * Architecture:
 * - SeriesDataService: Data operations (single source of truth)
 * - SeriesBusinessLogic: Pure calculation functions
 * - SeriesUIRenderer: HTML generation
 * - SeriesFormController: Form management
 */

class SeriesManager {
    constructor() {
        this.initialized = false;
        this.currentView = 'list'; // 'list', 'form', 'details'
        
        // Initialize after authentication
        this.initAfterAuth();
    }

    /**
     * Initialize after authentication is complete
     */
    async initAfterAuth() {
        window.debugLogger?.debug('Series', 'Waiting for authentication...');
        await this.waitForAuthentication();
        this.init();
        this.initialized = true;
        window.debugLogger?.debug('Series', 'Initialized after authentication');
    }

    /**
     * Wait for authentication to complete
     */
    async waitForAuthentication() {
        let attempts = 0;
        while (!window.Auth && attempts < 100) {
            await new Promise(resolve => setTimeout(resolve, 50));
            attempts++;
        }
        
        if (!window.Auth) {
            console.warn('🔐 SeriesManager: Auth system not available');
            return false;
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        if (!window.currentUser) {
            window.debugLogger?.debug('Series', 'No current user');
            return false;
        }
        
        return true;
    }

    /**
     * Initialize the series management module
     */
    init() {
        // Ensure DataManager is available
        if (!window.dataManager) {
            throw new Error('DataManager is required');
        }

        // Initialize sub-modules (clean architecture)
        this.dataService = new SeriesDataService(window.dataManager);
        this.businessLogic = SeriesBusinessLogic;
        this.uiRenderer = SeriesUIRenderer;
        this.formController = new SeriesFormController(
            this.dataService,
            this.businessLogic,
            this.uiRenderer
        );

        // Bind global events
        this.bindEvents();
        
        window.debugLogger?.init('Series', 'SeriesManager initialized with clean architecture');
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        if (this.listenersBound) {
            window.debugLogger?.debug('Series', 'Event listeners already bound, skipping');
            return;
        }
        
        // Store handlers for cleanup
        this.clickHandler = (e) => {
            const target = e.target;
            
            // Create series
            if (target.matches('.btn-create-series') || target.closest('.btn-create-series')) {
                this.showSeriesForm();
            }
            
            // Delete series
            else if (target.matches('.btn-delete-series') || target.closest('.btn-delete-series')) {
                const btn = target.closest('.btn-delete-series');
                const seriesId = btn?.dataset.seriesId;
                if (seriesId) this.deleteSeries(seriesId);
            }
            
            // View series
            else if (target.matches('.btn-view-series') || target.closest('.btn-view-series')) {
                const btn = target.closest('.btn-view-series');
                const seriesId = btn?.dataset.seriesId;
                if (seriesId) this.viewSeriesDetails(seriesId);
            }
            
            // Configure series
            else if (target.matches('.btn-configure-series') || target.closest('.btn-configure-series')) {
                const btn = target.closest('.btn-configure-series');
                const seriesId = btn?.dataset.seriesId;
                if (seriesId) this.showSeriesConfiguration(seriesId);
            }
        };

        this.formCancelHandler = () => {
            this.loadSeriesContent();
        };

        this.refreshHandler = () => {
            this.loadSeriesContent();
        };

        // Event delegation for dynamic content
        document.addEventListener('click', this.clickHandler);

        // Listen for form cancel
        document.addEventListener('series-form-cancel', this.formCancelHandler);

        // Listen for refresh requests
        document.addEventListener('series-refresh', this.refreshHandler);

        this.listenersBound = true;
    }

    /**
     * Cleanup event listeners
     */
    cleanup() {
        if (this.clickHandler) {
            document.removeEventListener('click', this.clickHandler);
            this.clickHandler = null;
        }
        if (this.formCancelHandler) {
            document.removeEventListener('series-form-cancel', this.formCancelHandler);
            this.formCancelHandler = null;
        }
        if (this.refreshHandler) {
            document.removeEventListener('series-refresh', this.refreshHandler);
            this.refreshHandler = null;
        }
        this.listenersBound = false;
        window.debugLogger?.debug('Series', 'Event listeners cleaned up');
    }

    /**
     * Load the series management content
     */
    async loadSeriesContent() {
        const container = document.getElementById('series-content') || 
                         document.getElementById('seriesListContainer');
        
        if (!container) {
            console.warn('Series container not found');
            return;
        }

        try {
            // Get all series
            const allSeries = this.dataService.getAllSeries();
            
            // Calculate stats for each series
            const statsMap = {};
            for (const series of allSeries) {
                const events = await this.dataService.getSeriesEvents(series.id);
                statsMap[series.id] = this.businessLogic.calculateSeriesStats(series, events);
            }
            
            // Render list
            const html = this.uiRenderer.renderSeriesList(allSeries, statsMap);
            container.innerHTML = html;
            
            this.currentView = 'list';
            
        } catch (error) {
            console.error('Error loading series content:', error);
            container.innerHTML = this.uiRenderer.renderEmptyState();
        }
    }

    /**
     * Show series creation/edit form
     */
    showSeriesForm(seriesId = null) {
        const container = document.getElementById('series-content') || 
                         document.getElementById('seriesListContainer');
        
        if (!container) {
            console.error('Series container not found');
            return;
        }

        try {
            this.formController.showForm(seriesId, container);
            this.currentView = 'form';
        } catch (error) {
            console.error('Error showing series form:', error);
            if (window.Helpers) {
                window.Helpers.showToast('Error loading form: ' + error.message, 'error');
            }
        }
    }

    /**
     * Delete series with confirmation
     */
    async deleteSeries(seriesId) {
        const series = this.dataService.getSeries(seriesId);
        if (!series) {
            console.error('Series not found:', seriesId);
            return;
        }

        // Use global confirmDelete if available
        if (window.confirmDelete) {
            window.confirmDelete(`series "${series.name}"`, async () => {
                await this.performSeriesDeletion(seriesId);
            });
        } else {
            // Fallback to basic confirm
            if (confirm(`Delete series "${series.name}"?`)) {
                await this.performSeriesDeletion(seriesId);
            }
        }
    }

    /**
     * Perform series deletion
     */
    async performSeriesDeletion(seriesId) {
        try {
            const success = await this.dataService.deleteSeries(seriesId);
            
            if (success) {
                if (window.Helpers) {
                    window.Helpers.showToast('Series deleted successfully!', 'success');
                }
                this.loadSeriesContent();
            } else {
                throw new Error('Delete operation failed');
            }
        } catch (error) {
            console.error('Error deleting series:', error);
            if (window.Helpers) {
                window.Helpers.showToast('Error deleting series: ' + error.message, 'error');
            }
        }
    }

    /**
     * View series details
     */
    async viewSeriesDetails(seriesId) {
        const series = this.dataService.getSeries(seriesId);
        if (!series) {
            if (window.Helpers) {
                window.Helpers.showToast('Series not found', 'error');
            }
            return;
        }

        try {
            // Calculate stats
            const events = await this.dataService.getSeriesEvents(seriesId);
            const stats = this.businessLogic.calculateSeriesStats(series, events);
            
            // Render details in modal
            const detailsHtml = this.uiRenderer.renderSeriesDetails(series, stats);
            
            if (window.Helpers && window.Helpers.showModal) {
                window.Helpers.showModal('Series Details', detailsHtml);
            } else {
                // Fallback: show in main container
                const container = document.getElementById('series-content') || 
                                 document.getElementById('seriesListContainer');
                if (container) {
                    container.innerHTML = detailsHtml;
                    this.currentView = 'details';
                }
            }
        } catch (error) {
            console.error('Error viewing series details:', error);
            if (window.Helpers) {
                window.Helpers.showToast('Error loading details: ' + error.message, 'error');
            }
        }
    }

    /**
     * Show series configuration
     */
    showSeriesConfiguration(seriesId) {
        // Configuration is just editing the series
        this.showSeriesForm(seriesId);
    }

    /**
     * Get series by ID (for backward compatibility)
     */
    getSeries(seriesId) {
        return this.dataService.getSeries(seriesId);
    }

    /**
     * Get all series (for backward compatibility)
     */
    getAllSeries() {
        return this.dataService.getAllSeries();
    }

    /**
     * Get series statistics for dashboard
     */
    async getSeriesStats() {
        try {
            const allSeries = this.dataService.getAllSeries();
            
            let totalEvents = 0;
            let activeSeries = 0;
            
            for (const series of allSeries) {
                const events = await this.dataService.getSeriesEvents(series.id);
                totalEvents += events.length;
                
                const stats = this.businessLogic.calculateSeriesStats(series, events);
                if (stats.isActive) {
                    activeSeries++;
                }
            }
            
            return {
                total: allSeries.length,
                active: activeSeries,
                totalEvents: totalEvents
            };
        } catch (error) {
            console.error('Error getting series stats:', error);
            return {
                total: 0,
                active: 0,
                totalEvents: 0
            };
        }
    }

    /**
     * Get event count for a series (backward compatibility)
     */
    async getSeriesEventCount(seriesId) {
        try {
            const events = await this.dataService.getSeriesEvents(seriesId);
            return events.length;
        } catch (error) {
            console.error('Error getting event count:', error);
            return 0;
        }
    }

    /**
     * Get series seasons (backward compatibility)
     */
    getSeriesSeasons(seriesId) {
        const series = this.dataService.getSeries(seriesId);
        return series?.seasons || [];
    }

    /**
     * Get active seasons for a series (backward compatibility)
     */
    getActiveSeasons(seriesId) {
        const series = this.dataService.getSeries(seriesId);
        if (!series) return [];
        return this.businessLogic.getActiveSeasons(series.seasons || []);
    }

    /**
     * Check if season is active (backward compatibility)
     */
    isSeasonActive(season) {
        return this.businessLogic.isSeasonActive(season);
    }

    /**
     * Get events for a specific season (backward compatibility)
     */
    async getSeasonEvents(seriesId, seasonId) {
        return await this.dataService.getSeasonEvents(seriesId, seasonId);
    }

    /**
     * Create series (backward compatibility - delegates to dataService)
     */
    async createSeries(seriesData) {
        return await this.dataService.createSeries(seriesData);
    }

    /**
     * Remove duplicate series (utility function)
     */
    async removeDuplicateSeries() {
        try {
            const allSeries = this.dataService.getAllSeries();
            const seen = new Map();
            const duplicates = [];

            allSeries.forEach(series => {
                const key = series.name.toLowerCase().trim();
                if (seen.has(key)) {
                    const existingSeries = seen.get(key);
                    const timeDiff = Math.abs(
                        new Date(series.createdAt) - new Date(existingSeries.createdAt)
                    );
                    
                    if (timeDiff < 5000) {
                        duplicates.push(series.id);
                    }
                } else {
                    seen.set(key, series);
                }
            });

            for (const seriesId of duplicates) {
                await this.dataService.deleteSeries(seriesId);
            }

            if (duplicates.length > 0) {
                window.debugLogger?.debug('Series', `Removed ${duplicates.length} duplicate series`);
                this.loadSeriesContent();
            }

            return duplicates.length;
        } catch (error) {
            console.error('Error removing duplicate series:', error);
            return 0;
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SeriesManager;
}

// Make available globally
if (typeof window !== 'undefined') {
    window.SeriesManager = SeriesManager;
}

// Add debugging functions to window for manual cleanup
if (typeof window !== 'undefined') {
    window.debugSeriesManager = {
        removeDuplicates: () => {
            if (window.seriesManager) {
                return window.seriesManager.removeDuplicateSeries();
            }
            console.warn('SeriesManager not initialized');
            return 0;
        },
        
        listAllSeries: () => {
            if (window.dataManager) {
                const allSeries = window.dataManager.getAllSeries();
                window.debugLogger?.debug('Series', 'All series in DataManager:', allSeries);
                return allSeries;
            }
            console.warn('DataManager not available');
            return [];
        },
        
        refreshSeries: () => {
            if (window.seriesManager) {
                window.seriesManager.loadSeriesContent();
                window.debugLogger?.debug('Series', 'Series content refreshed');
            } else {
                console.warn('SeriesManager not initialized');
            }
        }
    };
}
