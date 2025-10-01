/**
 * Series Management Module for EPC17 Event Management System
 * Handles series creation and event management with season support
 */

class SeriesManager {
    constructor() {
        this.series = new Map();
        this.currentSeries = null;
        this.currentSeriesId = null;
        this.storageKey = 'epc17_racing_series';
        this.initialized = false;
        // Don't initialize immediately - wait for authentication
        this.initAfterAuth();
    }

    /**
     * Initialize after authentication is complete
     */
    async initAfterAuth() {
        console.log('🔐 SeriesManager: Waiting for authentication...');
        
        // Wait for authentication to complete
        await this.waitForAuthentication();
        
        // Now initialize normally
        this.init();
        this.initialized = true;
        console.log('✅ SeriesManager: Initialized after authentication');
    }

    /**
     * Wait for authentication to complete
     */
    async waitForAuthentication() {
        // Wait for Auth to be available and initialized
        let attempts = 0;
        while (!window.Auth && attempts < 100) { // Max 5 seconds
            await new Promise(resolve => setTimeout(resolve, 50));
            attempts++;
        }
        
        if (!window.Auth) {
            console.warn('🔐 SeriesManager: Auth system not available after waiting');
            return false;
        }
        
        // Wait a bit more for session restoration to complete
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Check if we have a valid session
        if (!window.currentUser) {
            console.log('🔐 SeriesManager: No current user, authentication failed');
            return false;
        }
        
        console.log('🔐 SeriesManager: Authentication complete');
        return true;
    }

    /**
     * Initialize the series management module
     */
    init() {
        // Only load from storage if DataManager is not available
        // Otherwise, we'll sync with DataManager in loadSeriesContent()
        if (!window.dataManager) {
            this.loadSeriesFromStorage();
        }
        
        this.bindEvents();
        
        // Only load content if we're on a page that has the series container
        const container = document.getElementById('series-content') || document.getElementById('seriesListContainer');
        if (container) {
            this.loadSeriesContent();
        } else {
            if (window.debugLogger) {
            window.debugLogger.init('SeriesManager', 'SeriesManager initialized without UI (likely used for data access only)');
        } else {
            console.log('SeriesManager initialized without UI (likely used for data access only)');
        }
        }
    }

    /**
     * Load series from DataManager if available, fallback to localStorage
     */
    loadSeriesFromStorage() {
        try {
            // Always prefer DataManager as single source of truth
            if (window.dataManager) {
                console.log('🔄 Loading series from DataManager (single source of truth)');
                const seriesFromDataManager = window.dataManager.getAllSeries();
                this.series.clear();
                seriesFromDataManager.forEach(series => {
                    this.series.set(series.id, series);
                });
                console.log(`Loaded ${seriesFromDataManager.length} series from DataManager`);
                return;
            }

            // Fallback to localStorage only if DataManager is not available
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const seriesArray = JSON.parse(stored);
                console.log('Loading series from localStorage (DataManager not available):', seriesArray);
                
                this.series.clear();
                seriesArray.forEach(series => {
                    this.series.set(series.id, series);
                });
                
                console.log(`Loaded ${seriesArray.length} series from localStorage`);
            }
        } catch (error) {
            console.error('Error loading series from storage:', error);
        }
    }

    /**
     * Save series to DataManager if available, fallback to localStorage
     */
    saveToStorage() {
        try {
            const seriesArray = Array.from(this.series.values());
            
            // Use DataManager if available - don't save directly to avoid duplicates
            if (window.dataManager) {
                console.log('🔄 DataManager available - not saving directly to localStorage to avoid duplicates');
                // Note: We don't save here since DataManager should be the source of truth
                // This method is kept for compatibility but series should be created via DataManager
                return;
            }

            // Fallback to localStorage only when DataManager is not available
            localStorage.setItem(this.storageKey, JSON.stringify(seriesArray));
            console.log('Series saved to localStorage:', seriesArray.length, 'series');
        } catch (error) {
            console.error('Error saving series to storage:', error);
        }
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Event delegation for dynamic content
        document.addEventListener('click', (e) => {
            if (e.target.matches('.btn-create-series')) {
                this.showSeriesForm();
            } else if (e.target.matches('.btn-delete-series')) {
                const seriesId = e.target.dataset.seriesId;
                this.deleteSeries(seriesId);
            } else if (e.target.matches('.btn-view-series')) {
                const seriesId = e.target.dataset.seriesId;
                this.viewSeriesDetails(seriesId);
            } else if (e.target.matches('.btn-configure-series')) {
                const seriesId = e.target.dataset.seriesId;
                this.showSeriesConfiguration(seriesId);
            }
        });
    }

    /**
     * Load the series management content
     */
    async loadSeriesContent() {
        const container = document.getElementById('series-content') || document.getElementById('seriesListContainer');
        if (!container) {
            console.warn('Series container not found - SeriesManager UI not available on this page');
            return;
        }

        // Always sync with DataManager first if available (single source of truth)
        if (window.dataManager) {
            console.log('🔄 Syncing series data from DataManager before loading content (single source of truth)');
            const seriesFromDataManager = window.dataManager.getAllSeries();
            this.series.clear();
            seriesFromDataManager.forEach(series => {
                this.series.set(series.id, series);
            });
            console.log(`Synced ${seriesFromDataManager.length} series from DataManager`);
        }

        const series = this.getAllSeries();
        console.log('Loading series content, found', series.length, 'series');
        
        if (series.length === 0) {
            this.showEmptyState(container);
        } else {
            await this.showSeriesList(container, series);
        }
    }

    /**
     * Show empty state when no series exist
     */
    showEmptyState(container) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <i class="fas fa-flag-checkered"></i>
                </div>
                <h3>No Series Created Yet</h3>
                <p>Create your first racing series to get started with organizing events and managing participants.</p>
                <button class="btn btn-primary btn-create-series">
                    <i class="fas fa-plus"></i> Create First Series
                </button>
            </div>
        `;
    }

    /**
     * Show series list with season information
     */
    async showSeriesList(container, series) {
        const seriesList = series.map(s => {
            const seasons = s.seasons || [];
            const activeSeasons = seasons.filter(season => this.isSeasonActive(season));
            const totalEvents = this.getSeriesEventCount(s.id);
            
            return `
                <div class="series-card" data-series-id="${s.id}">
                    <div class="series-header">
                        <h3 class="series-name">${s.name}</h3>
                        <span class="series-status ${s.status}">${s.status}</span>
                    </div>
                    
                    <div class="series-details">
                        <p class="series-description">${s.description || 'No description provided'}</p>
                        
                        <div class="series-stats">
                            <div class="stat">
                                <span class="stat-label">Seasons:</span>
                                <span class="stat-value">${seasons.length} (${activeSeasons.length} active)</span>
                            </div>
                            <div class="stat">
                                <span class="stat-label">Events:</span>
                                <span class="stat-value">${totalEvents}</span>
                            </div>
                            <div class="stat">
                                <span class="stat-label">Created:</span>
                                <span class="stat-value">${new Date(s.createdAt || s.createdDate).toLocaleDateString()}</span>
                            </div>
                        </div>
                        
                        ${seasons.length > 0 ? `
                            <div class="seasons-preview">
                                <h4>Current Seasons:</h4>
                                <div class="seasons-list">
                                    ${activeSeasons.slice(0, 3).map(season => `
                                        <span class="season-tag ${season.status}">${season.name}</span>
                                    `).join('')}
                                    ${activeSeasons.length > 3 ? `<span class="season-tag more">+${activeSeasons.length - 3} more</span>` : ''}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="series-actions">
                        <button class="btn btn-primary btn-view-series" data-series-id="${s.id}">
                            <i class="fas fa-eye"></i> View Details
                        </button>
                        <button class="btn btn-secondary btn-configure-series" data-series-id="${s.id}">
                            <i class="fas fa-cog"></i> Configure
                        </button>
                        <button class="btn btn-danger btn-delete-series" data-series-id="${s.id}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="series-header">
                <h2>Racing Series</h2>
                <button class="btn btn-primary btn-create-series">
                    <i class="fas fa-plus"></i> Create New Series
                </button>
            </div>
            
            <div class="series-grid">
                ${seriesList}
            </div>
        `;
    }

    /**
     * Show series creation form with season management
     */
    showSeriesForm(seriesId = null) {
        const series = seriesId ? this.getSeries(seriesId) : null;
        const isEditing = !!series;
        
        const formHtml = `
            <div class="series-form-container">
                <h2>${isEditing ? 'Edit Series' : 'Create New Series'}</h2>
                
                <form id="seriesForm" class="series-form">
                    <div class="form-section">
                        <h3>Basic Information</h3>
                        
                        <div class="form-group">
                            <label for="seriesName">Series Name *</label>
                            <input type="text" id="seriesName" name="name" required 
                                   value="${series?.name || ''}" 
                                   placeholder="Enter series name">
                        </div>
                        
                        <div class="form-group">
                            <label for="seriesDescription">Description</label>
                            <textarea id="seriesDescription" name="description" rows="3"
                                      placeholder="Describe your racing series">${series?.description || ''}</textarea>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label for="seriesStatus">Status</label>
                                <select id="seriesStatus" name="status">
                                    <option value="upcoming" ${series?.status === 'upcoming' ? 'selected' : ''}>Upcoming</option>
                                    <option value="active" ${series?.status === 'active' ? 'selected' : ''}>Active</option>
                                    <option value="completed" ${series?.status === 'completed' ? 'selected' : ''}>Completed</option>
                                    <option value="cancelled" ${series?.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                                </select>
                            </div>
                            

                        </div>
                    </div>
                    
                    <div class="form-section">
                        <h3>Season Management</h3>
                        <p class="form-help">Create seasons to organize events and track performance over time periods.</p>
                        
                        <div id="seasonsContainer">
                            ${this.renderSeasonsSection(series)}
                        </div>
                        
                        <button type="button" class="btn btn-secondary btn-add-season" onclick="addSeasonRow()">
                            <i class="fas fa-plus"></i> Add Season
                        </button>
                    </div>
                    
                    <div class="form-section">
                        <h3>Racing Classes</h3>
                        <p class="form-help">Define the racing classes available in this series.</p>
                        
                        <div id="classesContainer">
                            ${this.renderClassesSection(series)}
                        </div>
                        
                        <button type="button" class="btn btn-secondary btn-add-class" onclick="addClassRow()">
                            <i class="fas fa-plus"></i> Add Class
                        </button>
                    </div>
                    
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="cancelSeriesForm()">
                            Cancel
                        </button>
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-save"></i> ${isEditing ? 'Update Series' : 'Create Series'}
                        </button>
                    </div>
                </form>
            </div>
        `;

        // Show form in modal or replace content
        const container = document.getElementById('series-content') || document.getElementById('seriesListContainer');
        if (container) {
            container.innerHTML = formHtml;
            this.bindFormEvents();
        }
    }

    /**
     * Render seasons section for series form
     */
    renderSeasonsSection(series) {
        const seasons = series?.seasons || [];
        
        if (seasons.length === 0) {
            return `
                <div class="seasons-empty">
                    <p>No seasons created yet. Add your first season to get started.</p>
                </div>
            `;
        }
        
        return `
            <div class="seasons-list">
                ${seasons.map((season, index) => `
                    <div class="season-row" data-season-index="${index}">
                        <div class="season-inputs">
                            <input type="text" name="seasonName[]" value="${season.name}" 
                                   placeholder="Season name" class="season-name-input">
                            <input type="date" name="seasonStartDate[]" value="${season.startDate || ''}" 
                                   class="season-start-input">
                            <input type="date" name="seasonEndDate[]" value="${season.endDate || ''}" 
                                   class="season-end-input">
                            <select name="seasonStatus[]" class="season-status-input">
                                <option value="upcoming" ${season.status === 'upcoming' ? 'selected' : ''}>Upcoming</option>
                                <option value="active" ${season.status === 'active' ? 'selected' : ''}>Active</option>
                                <option value="completed" ${season.status === 'completed' ? 'selected' : ''}>Completed</option>
                            </select>
                        </div>
                        <button type="button" class="btn btn-danger btn-remove-season" 
                                onclick="removeSeasonRow(${index})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
    }

    /**
     * Render classes section for series form
     */
    renderClassesSection(series) {
        const classes = series?.sledClasses || [];
        
        if (classes.length === 0) {
            return `
                <div class="classes-empty">
                    <p>No racing classes defined yet. Add classes to organize participants.</p>
                </div>
            `;
        }
        
        return `
            <div class="classes-list">
                ${classes.map((cls, index) => `
                    <div class="class-row" data-class-index="${index}">
                        <div class="class-inputs">
                            <input type="text" name="className[]" value="${cls.name}" 
                                   placeholder="Class name" class="class-name-input">
                            <input type="number" name="classFee[]" value="${cls.defaultFee || 0}" 
                                   min="0" step="0.01" class="class-fee-input">
                            <input type="text" name="classDescription[]" value="${cls.description || ''}" 
                                   placeholder="Class description" class="class-description-input">
                        </div>
                        <button type="button" class="btn btn-danger btn-remove-class" 
                                onclick="removeClassRow(${index})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
    }

    /**
     * Bind form events
     */
    bindFormEvents() {
        const form = document.getElementById('seriesForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleSeriesSubmit(e));
        }
    }

    /**
     * Handle series form submission
     */
    async handleSeriesSubmit(event) {
        event.preventDefault();
        
        const form = event.target;
        const formData = new FormData(form);
        
        // Collect seasons data
        const seasons = [];
        const seasonNames = formData.getAll('seasonName[]');
        const seasonStartDates = formData.getAll('seasonStartDate[]');
        const seasonEndDates = formData.getAll('seasonEndDate[]');
        const seasonStatuses = formData.getAll('seasonStatus[]');
        
        for (let i = 0; i < seasonNames.length; i++) {
            if (seasonNames[i].trim()) {
                seasons.push({
                    id: `season_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name: seasonNames[i].trim(),
                    startDate: seasonStartDates[i] || null,
                    endDate: seasonEndDates[i] || null,
                    status: seasonStatuses[i] || 'upcoming',
                    createdAt: new Date().toISOString()
                });
            }
        }
        
        // Collect classes data
        const sledClasses = [];
        const classNames = formData.getAll('className[]');
        const classFees = formData.getAll('classFee[]');
        const classDescriptions = formData.getAll('classDescription[]');
        
        for (let i = 0; i < classNames.length; i++) {
            if (classNames[i].trim()) {
                sledClasses.push({
                    id: `class_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name: classNames[i].trim(),
                    defaultFee: parseFloat(classFees[i]) || 0,
                    description: classDescriptions[i] || `${classNames[i].trim()} class racing`
                });
            }
        }
        
        const seriesData = {
            name: formData.get('name'),
            description: formData.get('description'),
            status: formData.get('status'),
            seasons: seasons,
            sledClasses: sledClasses
        };
        
        try {
            if (window.dataManager) {
                const series = await window.dataManager.addSeries(seriesData);
                this.series.set(series.id, series);
                console.log('✅ Series created via DataManager:', series);
            } else {
                const series = await this.createSeries(seriesData);
                console.log('✅ Series created locally:', series);
            }
            
            Helpers.showToast('Series created successfully!', 'success');
            this.loadSeriesContent();
            
        } catch (error) {
            console.error('❌ Error creating series:', error);
            Helpers.showToast('Error creating series: ' + error.message, 'error');
        }
    }

    /**
     * Check if a season is currently active
     */
    isSeasonActive(season) {
        if (!season) return false;
        
        const now = new Date();
        const startDate = season.startDate ? new Date(season.startDate) : null;
        const endDate = season.endDate ? new Date(season.endDate) : null;
        
        // If no dates set, check status
        if (!startDate && !endDate) {
            return season.status === 'active';
        }
        
        // Check if current date is within season range
        const isAfterStart = !startDate || now >= startDate;
        const isBeforeEnd = !endDate || now <= endDate;
        
        return isAfterStart && isBeforeEnd && season.status !== 'completed';
    }

    /**
     * Get event count for a series
     */
    getSeriesEventCount(seriesId) {
        if (!window.dataManager) return 0;
        
        try {
            const events = window.dataManager.getEventsFromCache({ seriesId });
            return events.length;
        } catch (error) {
            console.error('Error getting event count:', error);
            return 0;
        }
    }

    /**
     * Get all seasons for a series
     */
    getSeriesSeasons(seriesId) {
        const series = this.getSeries(seriesId);
        return series?.seasons || [];
    }

    /**
     * Get active seasons for a series
     */
    getActiveSeasons(seriesId) {
        const seasons = this.getSeriesSeasons(seriesId);
        return seasons.filter(season => this.isSeasonActive(season));
    }

    /**
     * Get events for a specific season
     */
    async getSeasonEvents(seriesId, seasonId) {
        if (!window.dataManager) return [];
        
        try {
            const events = window.dataManager.getEventsFromCache({ seriesId });
            return events.filter(event => event.seasonId === seasonId);
        } catch (error) {
            console.error('Error getting season events:', error);
            return [];
        }
    }

    /**
     * Get participants for a specific season
     */
    async getSeasonParticipants(seriesId, seasonId) {
        const events = await this.getSeasonEvents(seriesId, seasonId);
        const participantIds = new Set();
        
        events.forEach(event => {
            if (event.participants) {
                event.participants.forEach(pid => participantIds.add(pid));
            }
        });
        
        return Array.from(participantIds);
    }

    /**
     * Check if series is currently active
     */
    async isSeriesActive(series) {
        // For simplified series, consider them active if they have events
        const events = await this.getEvents({ seriesId: series.id });
        return events.length > 0;
    }

    /**
     * Show series configuration form
     */
    showSeriesConfiguration(seriesId) {
        const series = this.getSeries(seriesId);
        if (!series) {
            console.error('Series not found:', seriesId);
            return;
        }
        
        // Call the global configureSeries function
        if (typeof window.configureSeries === 'function') {
            window.configureSeries(seriesId);
        } else {
            console.error('configureSeries function not found in window scope');
        }
    }

    /**
     * View series details
     */
    viewSeriesDetails(seriesId) {
        const series = this.getSeries(seriesId);
        if (!series) {
            alert('Series not found');
            return;
        }
        
        // For now, show a simple details view
        // TODO: Implement full series details view
        const detailsHtml = `
            <div class="series-details-modal">
                <div class="series-info">
                    <h3>${series.name}</h3>
                    <p>${series.description || 'No description provided'}</p>
                    
                    <div class="series-stats">
                        <div class="stat">
                            <span class="stat-label">Status:</span>
                            <span class="stat-value">${series.status}</span>
                        </div>
                        <div class="stat">
                            <span class="stat-label">Created:</span>
                            <span class="stat-value">${new Date(series.createdAt || series.createdDate).toLocaleDateString()}</span>
                        </div>

                    </div>
                    
                    ${series.seasons && series.seasons.length > 0 ? `
                        <div class="seasons-section">
                            <h4>Seasons (${series.seasons.length})</h4>
                            <div class="seasons-list">
                                ${series.seasons.map(season => `
                                    <div class="season-item">
                                        <span class="season-name">${season.name}</span>
                                        <span class="season-status ${season.status}">${season.status}</span>
                                        ${season.startDate ? `<span class="season-date">${new Date(season.startDate).toLocaleDateString()}</span>` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    ${series.sledClasses && series.sledClasses.length > 0 ? `
                        <div class="classes-section">
                            <h4>Racing Classes (${series.sledClasses.length})</h4>
                            <div class="classes-list">
                                ${series.sledClasses.map(cls => `
                                    <div class="class-item">
                                        <span class="class-name">${cls.name}</span>
                                        <span class="class-fee">$${cls.defaultFee || 0}</span>
                                        <span class="class-description">${cls.description || ''}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
                
                <div class="modal-actions">
                    <button class="btn btn-secondary" onclick="closeSeriesDetails()">Close</button>
                    <button class="btn btn-primary" onclick="configureSeries('${seriesId}')">Configure Series</button>
                </div>
            </div>
        `;
        
        // Show modal or replace content
        const container = document.getElementById('series-content') || document.getElementById('seriesListContainer');
        if (container) {
            container.innerHTML = detailsHtml;
        }
    }

    /**
     * Delete series
     */
    async deleteSeries(seriesId) {
        const confirmed = await window.confirmDelete('this series', async () => {
            await this.performSeriesDeletion(seriesId);
        });
    }

    async performSeriesDeletion(seriesId) {
        
        try {
            if (window.dataManager) {
                await window.dataManager.deleteSeries(seriesId);
                this.series.delete(seriesId);
                console.log('✅ Series deleted via DataManager');
            } else {
                this.series.delete(seriesId);
                this.saveToStorage();
                console.log('✅ Series deleted locally');
            }
            
            Helpers.showToast('Series deleted successfully!', 'success');
            this.loadSeriesContent();
            
        } catch (error) {
            console.error('❌ Error deleting series:', error);
            Helpers.showToast('Error deleting series: ' + error.message, 'error');
        }
    }

    /**
     * Create event for specific series
     */
    createEventForSeries(seriesId) {
        // Get the series data
        const series = this.series.get(seriesId);
        if (!series) {
            Helpers.showToast('Series not found', 'error');
            return;
        }

        // Create event form with series pre-selected
        const formHtml = `
            <form id="series-event-form" class="event-form">
                <div class="form-section">
                    <h4>Create Event for: ${Helpers.sanitizeHtml(series.name)}</h4>
                    
                    <div class="form-group">
                        <label for="eventName">Event Name *</label>
                        <input type="text" name="eventName" id="eventName" required 
                               placeholder="e.g., Winter Championship Race">
                    </div>

                    <div class="form-group">
                        <label for="location">Location *</label>
                        <input type="text" name="location" id="location" required 
                               placeholder="e.g., Frozen Lake Speedway">
                    </div>

                    <div class="form-group">
                        <label for="eventDate">Date *</label>
                        <input type="date" name="eventDate" id="eventDate" required>
                    </div>

                    <div class="form-group">
                        <label for="numberOfTracks">Number of Tracks *</label>
                        <select name="numberOfTracks" id="numberOfTracks" required>
                            <option value="1">1 Track</option>
                            <option value="2">2 Tracks</option>
                            <option value="3" selected>3 Tracks</option>
                            <option value="4">4 Tracks</option>
                            <option value="5">5 Tracks</option>
                            <option value="6">6 Tracks</option>
                            <option value="7">7 Tracks</option>
                            <option value="8">8 Tracks</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="eliminationType">Elimination Type *</label>
                        <select name="eliminationType" id="eliminationType" required>
                            <option value="single">Single Elimination</option>
                            <option value="double" selected>Double Elimination</option>
                            <option value="roundrobin">Round Robin</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="maxParticipants">Max Participants</label>
                        <input type="number" name="maxParticipants" id="maxParticipants" 
                               min="8" max="500" value="100">
                    </div>

                    <div class="form-group">
                        <label for="description">Description</label>
                        <textarea name="description" id="description" rows="3" 
                                  placeholder="Event description..."></textarea>
                    </div>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="Helpers.hideModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Create Event</button>
                </div>
            </form>
        `;

        // Show the form in a modal
        Helpers.showModal('Create Event', formHtml);

        // Handle form submission
        document.getElementById('series-event-form').addEventListener('submit', async (e) => {
            await this.handleEventCreation(e, seriesId);
        });
    }

    /**
     * Handle event creation from series
     */
    async handleEventCreation(event, seriesId) {
        event.preventDefault();
        
        const form = event.target;
        const formData = new FormData(form);

        try {
            Helpers.showLoading();

            const eventData = {
                name: formData.get('eventName'),
                location: formData.get('location'),
                date: formData.get('eventDate'),
                seriesId: seriesId,
                numberOfTracks: parseInt(formData.get('numberOfTracks')),
                eliminationType: formData.get('eliminationType'),
                maxParticipants: parseInt(formData.get('maxParticipants')),
                description: formData.get('description') || '',
                classSettings: [],
                registrationOpen: true,
                trackSurface: 'snow',
                requiresClassSeparation: true,
                participants: []
            };

            // Use DataManager to create the event
            if (window.dataManager) {
                const createdEvent = await window.dataManager.addEvent(eventData);
                console.log('✅ Event created for series:', createdEvent);
                
                Helpers.showToast('Event created successfully!', 'success');
                Helpers.hideModal();
                
                // Refresh the series view
                this.loadSeriesContent();
                
                // Navigate to events section to show the new event
                if (window.app) {
                    window.app.navigateToSection('events');
                }
                
            } else {
                throw new Error('DataManager not available');
            }

        } catch (error) {
            console.error('Error creating event:', error);
            Helpers.showToast('Failed to create event: ' + error.message, 'error');
        } finally {
            Helpers.hideLoading();
        }
    }

    /**
     * Get series summary for dashboard
     */
    getSeriesSummary() {
        const allSeries = this.getAllSeries();
        const activeSeries = allSeries.filter(s => this.isSeriesActive(s));
        
        return {
            total: allSeries.length,
            active: activeSeries.length,
            inactive: allSeries.length - activeSeries.length,
            recentSeries: allSeries
                .sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate))
                .slice(0, 3)
        };
    }

    /**
     * Generate HTML for series classes list
     */
    generateSeriesClassesHtml(classes) {
        if (!classes || classes.length === 0) {
            return `
                <div class="no-classes">
                    <p><em>No classes defined yet. Add your first class below.</em></p>
                </div>
            `;
        }

        return classes.map((sledClass, index) => `
            <div class="class-item" data-index="${index}">
                <div class="class-info">
                    <span class="class-name">${Helpers.sanitizeHtml(sledClass.name)}</span>
                    <span class="class-fee">Default: $${sledClass.defaultFee}</span>
                </div>
                <div class="class-actions">
                    <button type="button" class="btn btn-small btn-secondary" onclick="seriesManager.editSeriesClass(${index})">
                        Edit
                    </button>
                    <button type="button" class="btn btn-small btn-danger" onclick="seriesManager.removeSeriesClass(${index})">
                        Delete
                    </button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Add a class to the series
     */
    addClassToSeries() {
        const nameInput = document.getElementById('newClassName');
        const feeInput = document.getElementById('newClassDefaultFee');
        
        const name = nameInput.value.trim();
        const defaultFee = parseFloat(feeInput.value) || 0;
        
        if (!name) {
            Helpers.showToast('Please enter a class name', 'error');
            return;
        }
        
        // Get current classes
        const currentClasses = this.getSeriesClassesFromForm();
        
        // Check for duplicate names
        if (currentClasses.some(c => c.name.toLowerCase() === name.toLowerCase())) {
            Helpers.showToast('Class name already exists', 'error');
            return;
        }
        
        // Add new class
        currentClasses.push({
            name: name,
            defaultFee: defaultFee,
            id: Helpers.generateId()
        });
        
        // Update display
        this.updateSeriesClassesList(currentClasses);
        
        // Clear inputs
        nameInput.value = '';
        feeInput.value = '';
        
        Helpers.showToast(`Class "${name}" added`, 'success');
    }

    /**
     * Edit a series class
     */
    editSeriesClass(index) {
        const classes = this.getSeriesClassesFromForm();
        const sledClass = classes[index];
        
        if (!sledClass) return;
        
        const newName = prompt('Enter class name:', sledClass.name);
        if (!newName || newName.trim() === '') return;
        
        const newFee = prompt('Enter default fee:', sledClass.defaultFee);
        if (newFee === null) return;
        
        const fee = parseFloat(newFee) || 0;
        
        // Check for duplicate names (excluding current)
        if (classes.some((c, i) => i !== index && c.name.toLowerCase() === newName.toLowerCase())) {
            Helpers.showToast('Class name already exists', 'error');
            return;
        }
        
        // Update class
        classes[index] = {
            ...sledClass,
            name: newName.trim(),
            defaultFee: fee
        };
        
        this.updateSeriesClassesList(classes);
        Helpers.showToast(`Class "${newName}" updated`, 'success');
    }

    /**
     * Remove a series class
     */
    removeSeriesClass(index) {
        const classes = this.getSeriesClassesFromForm();
        const sledClass = classes[index];
        
        if (!sledClass) return;
        
        window.confirmDelete(`class "${sledClass.name}"`, () => {
            classes.splice(index, 1);
            this.updateSeriesClassesList(classes);
            Helpers.showToast(`Class "${sledClass.name}" removed`, 'success');
        });
    }

    /**
     * Get classes from form
     */
    getSeriesClassesFromForm() {
        const container = document.getElementById('seriesClassesList');
        if (!container) return [];
        
        const classItems = container.querySelectorAll('.class-item');
        const classes = [];
        
        classItems.forEach((item, index) => {
            const name = item.querySelector('.class-name').textContent;
            const feeText = item.querySelector('.class-fee').textContent;
            const fee = parseFloat(feeText.replace(/[^0-9.]/g, '')) || 0;
            
            classes.push({
                name: name,
                defaultFee: fee,
                id: Helpers.generateId()
            });
        });
        
        return classes;
    }

    /**
     * Update the classes list display
     */
    updateSeriesClassesList(classes) {
        const container = document.getElementById('seriesClassesList');
        if (container) {
            container.innerHTML = this.generateSeriesClassesHtml(classes);
        }
    }

    // Initialize series
    initSeries(seriesId, seriesData) {
        this.currentSeries = {
            id: seriesId,
            ...seriesData,
            events: new Map()
        };
    }

    // Create new series
    async createSeries(seriesData) {
        try {
            // Use DataManager if available
            if (window.dataManager) {
                console.log('✅ Creating series via DataManager');
                
                const series = await window.dataManager.addSeries({
                    ...seriesData,
                    events: []
                });
                
                // Update local cache
                this.series.set(series.id, series);
                
                console.log('Series created via DataManager:', series);
                return series;
                
            } else {
                // Fallback to local storage approach
                console.warn('⚠️ DataManager not available, using local storage');
                
                const series = {
                    id: 'series_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    ...seriesData,
                    events: [],
                    createdAt: new Date().toISOString()
                };

                this.series.set(series.id, series);
                this.saveToStorage();
                
                console.log('Series created locally:', series);
                return series;
            }
        } catch (error) {
            console.error('Error creating series:', error);
            throw error;
        }
    }

    /**
     * Generate a unique ID (with fallback for older browsers)
     */
    generateId() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // Fallback for browsers that don't support crypto.randomUUID
        return 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    // Add event to series
    addEvent(eventData) {
        if (!this.currentSeries) {
            throw new Error('No series initialized');
        }

        const event = {
            id: this.generateId(),
            ...eventData,
            status: 'pending',
            participants: new Map(),
            results: new Map()
        };

        this.currentSeries.events.set(event.id, event);
        return event;
    }

    // Update event status
    updateEventStatus(eventId, status) {
        if (!this.currentSeries) {
            throw new Error('No series initialized');
        }

        const event = this.currentSeries.events.get(eventId);
        if (!event) {
            throw new Error('Event not found');
        }

        event.status = status;
        return event;
    }

    // Record event results
    recordEventResults(eventId, results) {
        if (!this.currentSeries) {
            throw new Error('No series initialized');
        }

        const event = this.currentSeries.events.get(eventId);
        if (!event) {
            throw new Error('Event not found');
        }

        event.results = new Map(Object.entries(results));
        return event;
    }

    /**
     * Get series statistics for the dashboard
     */
    async getSeriesStats() {
        const allSeries = this.getAllSeries();
        const activeSeries = allSeries.filter(series => this.isSeriesActive(series));
        let totalEvents = 0;
        
        // Get events from DataManager directly for accurate count
        try {
            if (window.dataManager) {
                // Try multiple methods to get events count
                let allEvents = [];
                if (typeof window.dataManager.getEventsArray === 'function') {
                    allEvents = window.dataManager.getEventsArray();
                } else if (typeof window.dataManager.getEvents === 'function') {
                    allEvents = await window.dataManager.getEvents({}, 1, 10000);
                }
                
                totalEvents = allEvents.length;
                console.log('📊 Events from DataManager:', allEvents.length);
                console.log('📊 DataManager methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(window.dataManager)));
            } else {
                // Fallback: count events from series
                for (const series of allSeries) {
                    const events = await this.getEvents({ seriesId: series.id });
                    totalEvents += events.length;
                }
                console.log('📊 Events from series fallback:', totalEvents);
            }
        } catch (error) {
            console.warn('Error getting events count:', error);
            totalEvents = 0;
        }
        
        return {
            total: allSeries.length,
            active: activeSeries.length,
            totalEvents: totalEvents
        };
    }

    /**
     * Get all series
     */
    getAllSeries() {
        // TODO: Replace with actual data storage integration
        return Array.from(this.series.values());
    }

    /**
     * Get a specific series by ID
     */
    getSeries(seriesId) {
        return this.series.get(seriesId) || null;
    }

    /**
     * Remove duplicate series based on name and creation date
     */
    removeDuplicateSeries() {
        try {
            if (!window.dataManager) {
                console.warn('DataManager not available for duplicate cleanup');
                return;
            }

            const allSeries = window.dataManager.getAllSeries();
            const seen = new Map();
            const duplicates = [];

            // Find duplicates based on name and similar creation times
            allSeries.forEach(series => {
                const key = series.name.toLowerCase().trim();
                if (seen.has(key)) {
                    const existingSeries = seen.get(key);
                    const timeDiff = Math.abs(new Date(series.createdAt) - new Date(existingSeries.createdAt));
                    
                    // If created within 5 seconds of each other, likely duplicate
                    if (timeDiff < 5000) {
                        duplicates.push(series.id);
                        console.log(`Found duplicate series: "${series.name}" (ID: ${series.id})`);
                    }
                } else {
                    seen.set(key, series);
                }
            });

            // Remove duplicates
            duplicates.forEach(async (seriesId) => {
                try {
                    await window.dataManager.deleteSeries(seriesId);
                    console.log(`Removed duplicate series: ${seriesId}`);
                } catch (error) {
                    console.error(`Failed to remove duplicate series ${seriesId}:`, error);
                }
            });

            if (duplicates.length > 0) {
                console.log(`Removed ${duplicates.length} duplicate series`);
                this.loadSeriesContent(); // Refresh the display
                return duplicates.length;
            } else {
                console.log('No duplicate series found');
                return 0;
            }
        } catch (error) {
            console.error('Error removing duplicate series:', error);
            return 0;
        }
    }

    /**
     * Get events from DataManager
     */
    async getEvents(filters = {}) {
        try {
            if (!window.dataManager) {
                console.warn('DataManager not available for getting events');
                return [];
            }
            
            const result = await window.dataManager.getEvents(filters);
            return result.events || result; // Handle both paginated and direct array responses
        } catch (error) {
            console.error('Failed to get events:', error);
            return [];
        }
    }

    /**
     * Get participant (placeholder - will be replaced with actual registration module integration)
     */
    getParticipant(participantId) {
        // TODO: Integration with registration module
        return null;
    }
}

// Make SeriesManager available globally
window.SeriesManager = SeriesManager;

// Add debugging functions to window for manual cleanup
window.debugSeriesManager = {
    removeDuplicates: () => {
        if (window.seriesManager) {
            const removedCount = window.seriesManager.removeDuplicateSeries();
            console.log(`Debug: Removed ${removedCount} duplicate series`);
            return removedCount;
        } else {
            console.warn('SeriesManager not initialized');
            return 0;
        }
    },
    
    listAllSeries: () => {
        if (window.dataManager) {
            const allSeries = window.dataManager.getAllSeries();
            console.log('All series in DataManager:', allSeries);
            return allSeries;
        } else {
            console.warn('DataManager not available');
            return [];
        }
    },
    
    refreshSeries: () => {
        if (window.seriesManager) {
            window.seriesManager.loadSeriesContent();
            console.log('Series content refreshed');
        } else {
            console.warn('SeriesManager not initialized');
        }
    }
};