/**
 * Series UI Renderer - Pure HTML generation for list + detail workspace
 * NO data access, NO business logic, ONLY HTML templates
 *
 * Exports: SeriesUIRenderer (window.SeriesUIRenderer)
 */

const SeriesUIRenderer = {
    /**
     * Render a selectable list item
     */
    renderSeriesListItem(series, stats = {}, isSelected = false) {
        const status = series.status === 'archived' ? 'archived' : 'active';
        const short = series.shortName
            ? `<span class="series-list-short">${this.escapeHtml(series.shortName)}</span>`
            : '';

        return `
            <button type="button"
                class="series-list-item${isSelected ? ' active' : ''}"
                data-series-id="${series.id}"
                role="option"
                aria-selected="${isSelected ? 'true' : 'false'}">
                <div class="series-list-item-top">
                    <span class="series-list-name">${this.escapeHtml(series.name)}</span>
                    <span class="series-status-badge ${status}">${status === 'archived' ? 'Archived' : 'Active'}</span>
                </div>
                ${short}
                <div class="series-list-meta" aria-hidden="true">
                    <span title="Events"><i class="fas fa-calendar"></i> ${stats.totalEvents || 0}</span>
                    <span title="Classes"><i class="fas fa-layer-group"></i> ${stats.totalClasses || (series.sledClasses || []).length}</span>
                    <span title="Seasons"><i class="fas fa-clock"></i> ${stats.totalSeasons || (series.seasons || []).length}</span>
                </div>
            </button>
        `;
    },

    /**
     * Render left-side series list
     */
    renderSeriesList(seriesArray, statsMap = {}, selectedId = null) {
        if (!seriesArray || seriesArray.length === 0) {
            return `
                <div class="series-empty-list">
                    <p>No series match your filters.</p>
                </div>
            `;
        }

        return seriesArray.map((series) =>
            this.renderSeriesListItem(series, statsMap[series.id] || {}, series.id === selectedId)
        ).join('');
    },

    /**
     * Empty detail pane
     */
    renderEmptyDetail() {
        return `
            <div class="series-empty-detail">
                <div class="series-empty-icon" aria-hidden="true"><i class="fas fa-trophy"></i></div>
                <h3>Select a series</h3>
                <p>Choose a series from the list to edit details, seasons, and classes — or create a new one.</p>
                <button type="button" class="btn btn-primary btn-create-series">
                    <i class="fas fa-plus" aria-hidden="true"></i> Create Series
                </button>
            </div>
        `;
    },

    /**
     * Full empty state when no series exist at all
     */
    renderEmptyState() {
        return `
            <div class="series-empty-detail">
                <div class="series-empty-icon" aria-hidden="true"><i class="fas fa-flag-checkered"></i></div>
                <h3>No Series Yet</h3>
                <p>Create your first racing series to organize events, seasons, and class fees.</p>
                <button type="button" class="btn btn-primary btn-create-series">
                    <i class="fas fa-plus" aria-hidden="true"></i> Create First Series
                </button>
            </div>
        `;
    },

    /**
     * Detail editor form for create or edit
     */
    renderSeriesForm(series = null, stats = {}) {
        const isEditing = !!series;
        const status = series?.status === 'archived' ? 'archived' : 'active';
        const eventCount = stats.totalEvents || 0;
        const canDelete = isEditing && eventCount === 0;

        return `
            <form id="seriesForm" class="series-detail-form" novalidate>
                <div class="series-detail-header">
                    <div>
                        <h2>${isEditing ? this.escapeHtml(series.name) : 'New Series'}</h2>
                        ${isEditing ? `
                            <p class="series-detail-subtitle">
                                ${eventCount} event${eventCount === 1 ? '' : 's'} ·
                                ${(series.sledClasses || []).length} class${(series.sledClasses || []).length === 1 ? '' : 'es'} ·
                                ${(series.seasons || []).length} season${(series.seasons || []).length === 1 ? '' : 's'}
                            </p>
                        ` : `
                            <p class="series-detail-subtitle">Set up basics, seasons, and racing classes</p>
                        `}
                    </div>
                    <div class="series-detail-actions">
                        ${isEditing ? `
                            <button type="button" class="btn btn-secondary btn-duplicate-series" data-series-id="${series.id}" title="Duplicate series">
                                <i class="fas fa-copy" aria-hidden="true"></i> Duplicate
                            </button>
                            ${status === 'archived' ? `
                                <button type="button" class="btn btn-secondary btn-restore-series" data-series-id="${series.id}">
                                    <i class="fas fa-box-open" aria-hidden="true"></i> Restore
                                </button>
                            ` : `
                                <button type="button" class="btn btn-secondary btn-archive-series" data-series-id="${series.id}">
                                    <i class="fas fa-archive" aria-hidden="true"></i> Archive
                                </button>
                            `}
                            ${canDelete ? `
                                <button type="button" class="btn btn-danger btn-delete-series" data-series-id="${series.id}" title="Delete unused series">
                                    <i class="fas fa-trash" aria-hidden="true"></i>
                                </button>
                            ` : ''}
                        ` : `
                            <button type="button" class="btn btn-secondary btn-cancel-form">Cancel</button>
                        `}
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-save" aria-hidden="true"></i> ${isEditing ? 'Save' : 'Create'}
                        </button>
                    </div>
                </div>

                <section class="form-section" aria-labelledby="series-basics-heading">
                    <h3 id="series-basics-heading">Basic Information</h3>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="seriesName">Series Name *</label>
                            <input type="text" id="seriesName" name="name" class="form-control" required
                                   value="${this.escapeHtml(series?.name || '')}"
                                   placeholder="e.g. Eastern Pro Circuit" autocomplete="off">
                        </div>
                        <div class="form-group">
                            <label for="seriesShortName">Short Name</label>
                            <input type="text" id="seriesShortName" name="shortName" class="form-control"
                                   value="${this.escapeHtml(series?.shortName || '')}"
                                   placeholder="e.g. EPC" maxlength="24" autocomplete="off">
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="seriesDescription">Description / Notes</label>
                        <textarea id="seriesDescription" name="description" class="form-control" rows="3"
                                  placeholder="Optional notes about this series">${this.escapeHtml(series?.description || '')}</textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="seriesStatus">Status</label>
                            <select id="seriesStatus" name="status" class="form-control">
                                <option value="active" ${status === 'active' ? 'selected' : ''}>Active</option>
                                <option value="archived" ${status === 'archived' ? 'selected' : ''}>Archived</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="seriesDefaultSeason">Default Season</label>
                            <select id="seriesDefaultSeason" name="defaultSeasonId" class="form-control">
                                <option value="">None</option>
                                ${(series?.seasons || []).map((season) => `
                                    <option value="${season.id}" ${series?.defaultSeasonId === season.id ? 'selected' : ''}>
                                        ${this.escapeHtml(season.name)}
                                    </option>
                                `).join('')}
                            </select>
                            <p class="form-help">Used when creating new events for this series.</p>
                        </div>
                    </div>
                </section>

                <section class="form-section" aria-labelledby="series-seasons-heading">
                    <div class="section-header-row">
                        <div>
                            <h3 id="series-seasons-heading">Seasons</h3>
                            <p class="form-help">Organize events by date ranges. Mark one as default above.</p>
                        </div>
                        <button type="button" class="btn btn-secondary btn-add-season">
                            <i class="fas fa-plus" aria-hidden="true"></i> Add Season
                        </button>
                    </div>
                    <div id="seasonsContainer">
                        ${this.renderSeasonsSection(series?.seasons, series?.defaultSeasonId)}
                    </div>
                </section>

                <section class="form-section" aria-labelledby="series-classes-heading">
                    <div class="section-header-row">
                        <div>
                            <h3 id="series-classes-heading">Racing Classes</h3>
                            <p class="form-help">Default fees apply when enabling classes on an event.</p>
                        </div>
                        <button type="button" class="btn btn-secondary btn-add-class">
                            <i class="fas fa-plus" aria-hidden="true"></i> Add Class
                        </button>
                    </div>
                    <div id="classesContainer">
                        ${this.renderClassesSection(series?.sledClasses)}
                    </div>
                </section>
            </form>
        `;
    },

    renderSeasonsSection(seasons = [], defaultSeasonId = null) {
        if (!seasons || seasons.length === 0) {
            return `
                <div class="seasons-empty">
                    <p>No seasons yet. Add a season to track events over time.</p>
                </div>
            `;
        }

        return `
            <div class="seasons-list">
                ${seasons.map((season, index) => `
                    <div class="season-row" data-season-index="${index}">
                        <input type="hidden" name="seasonId[]" value="${this.escapeHtml(season.id || '')}">
                        <div class="season-inputs">
                            <input type="text" name="seasonName[]" value="${this.escapeHtml(season.name)}"
                                   placeholder="Season name" class="form-control season-name-input" aria-label="Season name">
                            <input type="date" name="seasonStartDate[]" value="${season.startDate || ''}"
                                   class="form-control season-start-input" aria-label="Start date">
                            <input type="date" name="seasonEndDate[]" value="${season.endDate || ''}"
                                   class="form-control season-end-input" aria-label="End date">
                            <select name="seasonStatus[]" class="form-control season-status-input" aria-label="Season status">
                                <option value="upcoming" ${season.status === 'upcoming' ? 'selected' : ''}>Upcoming</option>
                                <option value="active" ${season.status === 'active' ? 'selected' : ''}>Active</option>
                                <option value="completed" ${season.status === 'completed' ? 'selected' : ''}>Completed</option>
                            </select>
                            ${defaultSeasonId === season.id ? '<span class="default-season-tag">Default</span>' : ''}
                        </div>
                        <button type="button" class="btn btn-icon btn-remove-season" data-index="${index}" aria-label="Remove season">
                            <i class="fas fa-trash" aria-hidden="true"></i>
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
    },

    renderClassesSection(classes = []) {
        if (!classes || classes.length === 0) {
            return `
                <div class="classes-empty">
                    <p>No racing classes yet. Add classes to organize participants and fees.</p>
                </div>
            `;
        }

        return `
            <div class="classes-list">
                ${classes.map((cls, index) => `
                    <div class="class-row" data-class-index="${index}">
                        <input type="hidden" name="classId[]" value="${this.escapeHtml(cls.id || '')}">
                        <div class="class-inputs">
                            <input type="text" name="className[]" value="${this.escapeHtml(cls.name)}"
                                   placeholder="Class name" class="form-control class-name-input" aria-label="Class name">
                            <input type="number" name="classFee[]" value="${cls.defaultFee || 0}"
                                   min="0" step="0.01" class="form-control class-fee-input" placeholder="Fee" aria-label="Default fee">
                            <input type="text" name="classDescription[]" value="${this.escapeHtml(cls.description || '')}"
                                   placeholder="Description" class="form-control class-description-input" aria-label="Class description">
                        </div>
                        <button type="button" class="btn btn-icon btn-remove-class" data-index="${index}" aria-label="Remove class">
                            <i class="fas fa-trash" aria-hidden="true"></i>
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
    },

    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SeriesUIRenderer;
}

if (typeof window !== 'undefined') {
    window.SeriesUIRenderer = SeriesUIRenderer;
}
