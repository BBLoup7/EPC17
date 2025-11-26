/**
 * Series UI Renderer - Pure HTML generation functions
 * NO data access, NO business logic, ONLY HTML templates
 * All functions receive data and return HTML strings
 */

const SeriesUIRenderer = {
    /**
     * Render series card HTML
     * @param {Object} series - Series object
     * @param {Object} stats - Series statistics
     * @returns {string} HTML string
     */
    renderSeriesCard(series, stats = {}) {
        const createdDate = new Date(series.createdAt).toLocaleDateString();
        const statusClass = series.status || 'active';
        
        return `
            <div class="series-card" data-series-id="${series.id}">
                <div class="series-header">
                    <h3 class="series-name">${this.escapeHtml(series.name)}</h3>
                    <span class="series-status ${statusClass}">${statusClass}</span>
                </div>
                
                <div class="series-details">
                    ${series.description ? `
                        <p class="series-description">${this.escapeHtml(series.description)}</p>
                    ` : ''}
                    
                    <div class="series-stats">
                        <div class="stat">
                            <span class="stat-label">Seasons:</span>
                            <span class="stat-value">${stats.totalSeasons || 0} (${stats.activeSeasons || 0} active)</span>
                        </div>
                        <div class="stat">
                            <span class="stat-label">Events:</span>
                            <span class="stat-value">${stats.totalEvents || 0}</span>
                        </div>
                        <div class="stat">
                            <span class="stat-label">Created:</span>
                            <span class="stat-value">${createdDate}</span>
                        </div>
                    </div>
                    
                    ${this.renderSeasonsPreview(series.seasons, stats.activeSeasons)}
                </div>
                
                <div class="series-actions">
                    <button class="btn btn-primary btn-view-series" data-series-id="${series.id}">
                        <i class="fas fa-eye"></i> View Details
                    </button>
                    <button class="btn btn-secondary btn-configure-series" data-series-id="${series.id}">
                        <i class="fas fa-cog"></i> Configure
                    </button>
                    <button class="btn btn-danger btn-delete-series" data-series-id="${series.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Render seasons preview in series card
     */
    renderSeasonsPreview(seasons = [], activeSeasonsCount = 0) {
        if (!seasons || seasons.length === 0) return '';
        
        const activeSeasons = seasons.filter(s => s.status === 'active');
        
        return `
            <div class="seasons-preview">
                <h4>Current Seasons:</h4>
                <div class="seasons-list">
                    ${activeSeasons.slice(0, 3).map(season => `
                        <span class="season-tag ${season.status}">${this.escapeHtml(season.name)}</span>
                    `).join('')}
                    ${activeSeasons.length > 3 ? `<span class="season-tag more">+${activeSeasons.length - 3} more</span>` : ''}
                </div>
            </div>
        `;
    },

    /**
     * Render series list
     */
    renderSeriesList(seriesArray, statsMap = {}) {
        if (!seriesArray || seriesArray.length === 0) {
            return this.renderEmptyState();
        }
        
        const cardsHtml = seriesArray.map(series => {
            const stats = statsMap[series.id] || {};
            return this.renderSeriesCard(series, stats);
        }).join('');
        
        return `
            <div class="series-header">
                <h2>Racing Series</h2>
                <button class="btn btn-primary btn-create-series">
                    <i class="fas fa-plus"></i> Create New Series
                </button>
            </div>
            
            <div class="series-grid">
                ${cardsHtml}
            </div>
        `;
    },

    /**
     * Render empty state
     */
    renderEmptyState() {
        return `
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
    },

    /**
     * Render series form
     */
    renderSeriesForm(series = null) {
        const isEditing = !!series;
        
        return `
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
                            ${this.renderSeasonsSection(series?.seasons)}
                        </div>
                        
                        <button type="button" class="btn btn-secondary btn-add-season">
                            <i class="fas fa-plus"></i> Add Season
                        </button>
                    </div>
                    
                    <div class="form-section">
                        <h3>Racing Classes</h3>
                        <p class="form-help">Define the racing classes available in this series.</p>
                        
                        <div id="classesContainer">
                            ${this.renderClassesSection(series?.sledClasses)}
                        </div>
                        
                        <button type="button" class="btn btn-secondary btn-add-class">
                            <i class="fas fa-plus"></i> Add Class
                        </button>
                    </div>
                    
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary btn-cancel-form">
                            Cancel
                        </button>
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-save"></i> ${isEditing ? 'Update Series' : 'Create Series'}
                        </button>
                    </div>
                </form>
            </div>
        `;
    },

    /**
     * Render seasons section for form
     */
    renderSeasonsSection(seasons = []) {
        if (!seasons || seasons.length === 0) {
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
                            <input type="text" name="seasonName[]" value="${this.escapeHtml(season.name)}" 
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
                                data-index="${index}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
    },

    /**
     * Render classes section for form
     */
    renderClassesSection(classes = []) {
        if (!classes || classes.length === 0) {
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
                            <input type="text" name="className[]" value="${this.escapeHtml(cls.name)}" 
                                   placeholder="Class name" class="class-name-input">
                            <input type="number" name="classFee[]" value="${cls.defaultFee || 0}" 
                                   min="0" step="0.01" class="class-fee-input" placeholder="Default fee">
                            <input type="text" name="classDescription[]" value="${this.escapeHtml(cls.description || '')}" 
                                   placeholder="Class description" class="class-description-input">
                        </div>
                        <button type="button" class="btn btn-danger btn-remove-class" 
                                data-index="${index}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
    },

    /**
     * Render series details modal content
     */
    renderSeriesDetails(series, stats = {}) {
        return `
            <div class="series-details-modal">
                <div class="series-info">
                    <h3>${this.escapeHtml(series.name)}</h3>
                    <p>${this.escapeHtml(series.description || 'No description provided')}</p>
                    
                    <div class="series-stats">
                        <div class="stat">
                            <span class="stat-label">Status:</span>
                            <span class="stat-value">${series.status || 'active'}</span>
                        </div>
                        <div class="stat">
                            <span class="stat-label">Created:</span>
                            <span class="stat-value">${new Date(series.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div class="stat">
                            <span class="stat-label">Total Events:</span>
                            <span class="stat-value">${stats.totalEvents || 0}</span>
                        </div>
                    </div>
                    
                    ${this.renderSeasonsDetails(series.seasons)}
                    ${this.renderClassesDetails(series.sledClasses)}
                </div>
                
                <div class="modal-actions">
                    <button class="btn btn-secondary btn-close-details">Close</button>
                    <button class="btn btn-primary btn-configure-series" data-series-id="${series.id}">
                        Configure Series
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Render seasons details section
     */
    renderSeasonsDetails(seasons = []) {
        if (!seasons || seasons.length === 0) return '';
        
        return `
            <div class="seasons-section">
                <h4>Seasons (${seasons.length})</h4>
                <div class="seasons-list">
                    ${seasons.map(season => `
                        <div class="season-item">
                            <span class="season-name">${this.escapeHtml(season.name)}</span>
                            <span class="season-status ${season.status}">${season.status}</span>
                            ${season.startDate ? `<span class="season-date">${new Date(season.startDate).toLocaleDateString()}</span>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    /**
     * Render classes details section
     */
    renderClassesDetails(classes = []) {
        if (!classes || classes.length === 0) return '';
        
        return `
            <div class="classes-section">
                <h4>Racing Classes (${classes.length})</h4>
                <div class="classes-list">
                    ${classes.map(cls => `
                        <div class="class-item">
                            <span class="class-name">${this.escapeHtml(cls.name)}</span>
                            <span class="class-fee">$${cls.defaultFee || 0}</span>
                            <span class="class-description">${this.escapeHtml(cls.description || '')}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SeriesUIRenderer;
}

// Make available globally
if (typeof window !== 'undefined') {
    window.SeriesUIRenderer = SeriesUIRenderer;
}

