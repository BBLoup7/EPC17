/**
 * Series Form Controller - Manages form state and validation
 * Coordinates between UI and data layers
 * NO direct DOM manipulation in business logic
 */

class SeriesFormController {
    constructor(dataService, businessLogic, uiRenderer) {
        this.dataService = dataService;
        this.businessLogic = businessLogic;
        this.uiRenderer = uiRenderer;
        this.currentSeries = null;
        window.debugLogger?.init('SeriesForm', 'SeriesFormController initialized');
    }

    /**
     * Show series form (create or edit)
     * @param {string|null} seriesId - Series ID for editing, null for create
     * @param {HTMLElement} container - Container element
     */
    async showForm(seriesId = null, container) {
        if (!container) {
            throw new Error('Container element required');
        }

        // Load series if editing
        if (seriesId) {
            this.currentSeries = this.dataService.getSeries(seriesId);
            if (!this.currentSeries) {
                throw new Error('Series not found');
            }
        } else {
            this.currentSeries = null;
        }

        // Render form
        container.innerHTML = this.uiRenderer.renderSeriesForm(this.currentSeries);

        // Bind form events
        this.bindFormEvents(container);
    }

    /**
     * Bind form event listeners
     */
    bindFormEvents(container) {
        const form = container.querySelector('#seriesForm');
        if (!form) return;

        // Form submission
        form.addEventListener('submit', (e) => this.handleSubmit(e));

        // Cancel button
        const cancelBtn = form.querySelector('.btn-cancel-form');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.handleCancel());
        }

        // Add season button
        const addSeasonBtn = form.querySelector('.btn-add-season');
        if (addSeasonBtn) {
            addSeasonBtn.addEventListener('click', () => this.addSeasonRow());
        }

        // Add class button
        const addClassBtn = form.querySelector('.btn-add-class');
        if (addClassBtn) {
            addClassBtn.addEventListener('click', () => this.addClassRow());
        }

        // Remove season buttons (event delegation)
        form.addEventListener('click', (e) => {
            if (e.target.closest('.btn-remove-season')) {
                const btn = e.target.closest('.btn-remove-season');
                this.removeSeasonRow(btn.dataset.index);
            }
        });

        // Remove class buttons (event delegation)
        form.addEventListener('click', (e) => {
            if (e.target.closest('.btn-remove-class')) {
                const btn = e.target.closest('.btn-remove-class');
                this.removeClassRow(btn.dataset.index);
            }
        });
    }

    /**
     * Handle form submission
     */
    async handleSubmit(event) {
        event.preventDefault();

        const form = event.target;
        const formData = new FormData(form);

        try {
            // Show loading state
            if (window.Helpers) {
                window.Helpers.showLoading();
            }

            // Collect form data
            const seriesData = this.collectFormData(formData);

            // Create or update
            let result;
            if (this.currentSeries) {
                result = await this.dataService.updateSeries(this.currentSeries.id, seriesData);
                if (result) {
                    this.showSuccess('Series updated successfully!');
                } else {
                    throw new Error('Update failed');
                }
            } else {
                result = await this.dataService.createSeries(seriesData);
                this.showSuccess('Series created successfully!');
            }

            // Trigger refresh event
            this.triggerRefreshEvent();

            // Navigate back to list
            this.handleCancel();

        } catch (error) {
            console.error('Form submission error:', error);
            this.showError('Error saving series: ' + error.message);
        } finally {
            if (window.Helpers) {
                window.Helpers.hideLoading();
            }
        }
    }

    /**
     * Collect data from form
     */
    collectFormData(formData) {
        const data = {
            name: formData.get('name'),
            description: formData.get('description'),
            status: formData.get('status'),
            seasons: this.collectSeasons(formData),
            sledClasses: this.collectClasses(formData)
        };

        return data;
    }

    /**
     * Collect seasons from form
     */
    collectSeasons(formData) {
        const seasons = [];
        const seasonNames = formData.getAll('seasonName[]');
        const seasonStartDates = formData.getAll('seasonStartDate[]');
        const seasonEndDates = formData.getAll('seasonEndDate[]');
        const seasonStatuses = formData.getAll('seasonStatus[]');

        for (let i = 0; i < seasonNames.length; i++) {
            if (seasonNames[i].trim()) {
                seasons.push({
                    name: seasonNames[i].trim(),
                    startDate: seasonStartDates[i] || null,
                    endDate: seasonEndDates[i] || null,
                    status: seasonStatuses[i] || 'upcoming'
                });
            }
        }

        return seasons;
    }

    /**
     * Collect classes from form
     */
    collectClasses(formData) {
        const classes = [];
        const classNames = formData.getAll('className[]');
        const classFees = formData.getAll('classFee[]');
        const classDescriptions = formData.getAll('classDescription[]');

        for (let i = 0; i < classNames.length; i++) {
            if (classNames[i].trim()) {
                classes.push({
                    name: classNames[i].trim(),
                    defaultFee: parseFloat(classFees[i]) || 0,
                    description: classDescriptions[i] || `${classNames[i].trim()} class racing`
                });
            }
        }

        return classes;
    }

    /**
     * Add season row to form
     */
    addSeasonRow() {
        const container = document.getElementById('seasonsContainer');
        if (!container) return;

        // Replace empty state if needed
        const emptyState = container.querySelector('.seasons-empty');
        if (emptyState) {
            container.innerHTML = '<div class="seasons-list"></div>';
        }

        const seasonsList = container.querySelector('.seasons-list');
        if (!seasonsList) return;

        const index = seasonsList.querySelectorAll('.season-row').length;

        const seasonRow = document.createElement('div');
        seasonRow.className = 'season-row';
        seasonRow.dataset.seasonIndex = index;
        seasonRow.innerHTML = `
            <div class="season-inputs">
                <input type="text" name="seasonName[]" placeholder="Season name" class="season-name-input">
                <input type="date" name="seasonStartDate[]" class="season-start-input">
                <input type="date" name="seasonEndDate[]" class="season-end-input">
                <select name="seasonStatus[]" class="season-status-input">
                    <option value="upcoming">Upcoming</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                </select>
            </div>
            <button type="button" class="btn btn-danger btn-remove-season" data-index="${index}">
                <i class="fas fa-trash"></i>
            </button>
        `;

        seasonsList.appendChild(seasonRow);
    }

    /**
     * Remove season row
     */
    removeSeasonRow(index) {
        const row = document.querySelector(`[data-season-index="${index}"]`);
        if (row) {
            row.remove();

            // Check if list is now empty
            const seasonsList = document.querySelector('.seasons-list');
            if (seasonsList && seasonsList.children.length === 0) {
                const container = document.getElementById('seasonsContainer');
                container.innerHTML = '<div class="seasons-empty"><p>No seasons created yet. Add your first season to get started.</p></div>';
            }
        }
    }

    /**
     * Add class row to form
     */
    addClassRow() {
        const container = document.getElementById('classesContainer');
        if (!container) return;

        // Replace empty state if needed
        const emptyState = container.querySelector('.classes-empty');
        if (emptyState) {
            container.innerHTML = '<div class="classes-list"></div>';
        }

        const classesList = container.querySelector('.classes-list');
        if (!classesList) return;

        const index = classesList.querySelectorAll('.class-row').length;

        const classRow = document.createElement('div');
        classRow.className = 'class-row';
        classRow.dataset.classIndex = index;
        classRow.innerHTML = `
            <div class="class-inputs">
                <input type="text" name="className[]" placeholder="Class name" class="class-name-input">
                <input type="number" name="classFee[]" min="0" step="0.01" value="0" 
                       class="class-fee-input" placeholder="Default fee">
                <input type="text" name="classDescription[]" placeholder="Class description" 
                       class="class-description-input">
            </div>
            <button type="button" class="btn btn-danger btn-remove-class" data-index="${index}">
                <i class="fas fa-trash"></i>
            </button>
        `;

        classesList.appendChild(classRow);
    }

    /**
     * Remove class row
     */
    removeClassRow(index) {
        const row = document.querySelector(`[data-class-index="${index}"]`);
        if (row) {
            row.remove();

            // Check if list is now empty
            const classesList = document.querySelector('.classes-list');
            if (classesList && classesList.children.length === 0) {
                const container = document.getElementById('classesContainer');
                container.innerHTML = '<div class="classes-empty"><p>No racing classes defined yet. Add classes to organize participants.</p></div>';
            }
        }
    }

    /**
     * Handle cancel
     */
    handleCancel() {
        this.currentSeries = null;
        this.triggerCancelEvent();
    }

    /**
     * Show success message
     */
    showSuccess(message) {
        if (window.Helpers && window.Helpers.showToast) {
            window.Helpers.showToast(message, 'success');
        } else {
            window.debugLogger?.debug('SeriesForm', message);
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        if (window.Helpers && window.Helpers.showToast) {
            window.Helpers.showToast(message, 'error');
        } else {
            console.error('❌', message);
        }
    }

    /**
     * Trigger refresh event
     */
    triggerRefreshEvent() {
        if (window.globalEventBus) {
            window.globalEventBus.emit('series-updated');
        }
        
        // Also dispatch custom event
        document.dispatchEvent(new CustomEvent('series-refresh'));
    }

    /**
     * Trigger cancel event
     */
    triggerCancelEvent() {
        document.dispatchEvent(new CustomEvent('series-form-cancel'));
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SeriesFormController;
}

// Make available globally
if (typeof window !== 'undefined') {
    window.SeriesFormController = SeriesFormController;
}

