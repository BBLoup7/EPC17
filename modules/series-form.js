/**
 * Series Form Controller - Manages detail-pane form state and validation
 *
 * Exports: SeriesFormController (window.SeriesFormController)
 * Inputs: dataService, businessLogic, uiRenderer, optional onSaved callback
 * Outputs: create/update via dataService; dispatches series-refresh
 * Error modes: toast on validation/save failure
 */

class SeriesFormController {
    constructor(dataService, businessLogic, uiRenderer) {
        this.dataService = dataService;
        this.businessLogic = businessLogic;
        this.uiRenderer = uiRenderer;
        this.currentSeries = null;
        this.stats = {};
        window.debugLogger?.init('SeriesForm', 'SeriesFormController initialized');
    }

    /**
     * Show series form in the detail pane
     * @param {string|null} seriesId
     * @param {HTMLElement} container
     * @param {Object} stats - event/class counts for the series
     */
    async showForm(seriesId = null, container, stats = {}) {
        if (!container) {
            throw new Error('Container element required');
        }

        this.stats = stats || {};

        if (seriesId) {
            this.currentSeries = this.dataService.getSeries(seriesId);
            if (!this.currentSeries) {
                throw new Error('Series not found');
            }
        } else {
            this.currentSeries = null;
        }

        container.innerHTML = this.uiRenderer.renderSeriesForm(this.currentSeries, this.stats);
        this.bindFormEvents(container);
    }

    bindFormEvents(container) {
        const form = container.querySelector('#seriesForm');
        if (!form) return;

        form.addEventListener('submit', (e) => this.handleSubmit(e));

        const cancelBtn = form.querySelector('.btn-cancel-form');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.handleCancel());
        }

        const addSeasonBtn = form.querySelector('.btn-add-season');
        if (addSeasonBtn) {
            addSeasonBtn.addEventListener('click', () => this.addSeasonRow());
        }

        const addClassBtn = form.querySelector('.btn-add-class');
        if (addClassBtn) {
            addClassBtn.addEventListener('click', () => this.addClassRow());
        }

        form.addEventListener('click', (e) => {
            if (e.target.closest('.btn-remove-season')) {
                const btn = e.target.closest('.btn-remove-season');
                this.removeSeasonRow(btn.dataset.index);
            }
            if (e.target.closest('.btn-remove-class')) {
                const btn = e.target.closest('.btn-remove-class');
                this.removeClassRow(btn.dataset.index);
            }
        });

        // Keep default-season dropdown in sync when seasons change names/ids
        form.addEventListener('input', (e) => {
            if (e.target.matches('.season-name-input')) {
                this.refreshDefaultSeasonOptions();
            }
        });
    }

    async handleSubmit(event) {
        event.preventDefault();

        const form = event.target;
        const formData = new FormData(form);

        try {
            if (window.Helpers?.showLoading) {
                window.Helpers.showLoading();
            }

            const seriesData = this.collectFormData(formData);

            if (this.currentSeries) {
                const result = await this.dataService.updateSeries(this.currentSeries.id, seriesData);
                if (!result) throw new Error('Update failed');
                this.showSuccess('Series saved');
                document.dispatchEvent(new CustomEvent('series-saved', {
                    detail: { seriesId: this.currentSeries.id }
                }));
            } else {
                const created = await this.dataService.createSeries(seriesData);
                this.showSuccess('Series created');
                document.dispatchEvent(new CustomEvent('series-saved', {
                    detail: { seriesId: created.id }
                }));
            }

            this.triggerRefreshEvent();
        } catch (error) {
            console.error('Form submission error:', error);
            this.showError('Error saving series: ' + error.message);
        } finally {
            if (window.Helpers?.hideLoading) {
                window.Helpers.hideLoading();
            }
        }
    }

    collectFormData(formData) {
        const seasons = this.collectSeasons(formData);
        let defaultSeasonId = formData.get('defaultSeasonId') || null;
        if (defaultSeasonId && !seasons.some((s) => s.id === defaultSeasonId)) {
            defaultSeasonId = null;
        }

        return {
            name: (formData.get('name') || '').trim(),
            shortName: (formData.get('shortName') || '').trim(),
            description: (formData.get('description') || '').trim(),
            status: formData.get('status') === 'archived' ? 'archived' : 'active',
            defaultSeasonId,
            seasons,
            sledClasses: this.collectClasses(formData)
        };
    }

    collectSeasons(formData) {
        const seasons = [];
        const ids = formData.getAll('seasonId[]');
        const names = formData.getAll('seasonName[]');
        const starts = formData.getAll('seasonStartDate[]');
        const ends = formData.getAll('seasonEndDate[]');
        const statuses = formData.getAll('seasonStatus[]');

        for (let i = 0; i < names.length; i++) {
            if (!names[i].trim()) continue;
            seasons.push({
                id: (ids[i] || '').trim() || this.dataService.generateId('season'),
                name: names[i].trim(),
                startDate: starts[i] || null,
                endDate: ends[i] || null,
                status: statuses[i] || 'upcoming',
                createdAt: new Date().toISOString()
            });
        }
        return seasons;
    }

    collectClasses(formData) {
        const classes = [];
        const ids = formData.getAll('classId[]');
        const names = formData.getAll('className[]');
        const fees = formData.getAll('classFee[]');
        const descriptions = formData.getAll('classDescription[]');

        for (let i = 0; i < names.length; i++) {
            if (!names[i].trim()) continue;
            classes.push({
                id: (ids[i] || '').trim() || this.dataService.generateId('class'),
                name: names[i].trim(),
                defaultFee: parseFloat(fees[i]) || 0,
                description: descriptions[i] || `${names[i].trim()} class racing`
            });
        }
        return classes;
    }

    addSeasonRow() {
        const container = document.getElementById('seasonsContainer');
        if (!container) return;

        if (container.querySelector('.seasons-empty')) {
            container.innerHTML = '<div class="seasons-list"></div>';
        }

        const seasonsList = container.querySelector('.seasons-list');
        if (!seasonsList) return;

        const index = seasonsList.querySelectorAll('.season-row').length;
        const newId = this.dataService.generateId('season');

        const seasonRow = document.createElement('div');
        seasonRow.className = 'season-row';
        seasonRow.dataset.seasonIndex = String(index);
        seasonRow.innerHTML = `
            <input type="hidden" name="seasonId[]" value="${newId}">
            <div class="season-inputs">
                <input type="text" name="seasonName[]" placeholder="Season name" class="form-control season-name-input" aria-label="Season name">
                <input type="date" name="seasonStartDate[]" class="form-control season-start-input" aria-label="Start date">
                <input type="date" name="seasonEndDate[]" class="form-control season-end-input" aria-label="End date">
                <select name="seasonStatus[]" class="form-control season-status-input" aria-label="Season status">
                    <option value="upcoming">Upcoming</option>
                    <option value="active" selected>Active</option>
                    <option value="completed">Completed</option>
                </select>
            </div>
            <button type="button" class="btn btn-icon btn-remove-season" data-index="${index}" aria-label="Remove season">
                <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
        `;
        seasonsList.appendChild(seasonRow);
        this.refreshDefaultSeasonOptions();
    }

    removeSeasonRow(index) {
        const row = document.querySelector(`[data-season-index="${index}"]`);
        if (!row) return;
        row.remove();

        const seasonsList = document.querySelector('#seasonsContainer .seasons-list');
        if (seasonsList && seasonsList.children.length === 0) {
            document.getElementById('seasonsContainer').innerHTML =
                '<div class="seasons-empty"><p>No seasons yet. Add a season to track events over time.</p></div>';
        }
        this.refreshDefaultSeasonOptions();
    }

    addClassRow() {
        const container = document.getElementById('classesContainer');
        if (!container) return;

        if (container.querySelector('.classes-empty')) {
            container.innerHTML = '<div class="classes-list"></div>';
        }

        const classesList = container.querySelector('.classes-list');
        if (!classesList) return;

        const index = classesList.querySelectorAll('.class-row').length;
        const newId = this.dataService.generateId('class');

        const classRow = document.createElement('div');
        classRow.className = 'class-row';
        classRow.dataset.classIndex = String(index);
        classRow.innerHTML = `
            <input type="hidden" name="classId[]" value="${newId}">
            <div class="class-inputs">
                <input type="text" name="className[]" placeholder="Class name" class="form-control class-name-input" aria-label="Class name">
                <input type="number" name="classFee[]" min="0" step="0.01" value="0"
                       class="form-control class-fee-input" placeholder="Fee" aria-label="Default fee">
                <input type="text" name="classDescription[]" placeholder="Description"
                       class="form-control class-description-input" aria-label="Class description">
            </div>
            <button type="button" class="btn btn-icon btn-remove-class" data-index="${index}" aria-label="Remove class">
                <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
        `;
        classesList.appendChild(classRow);
    }

    removeClassRow(index) {
        const row = document.querySelector(`[data-class-index="${index}"]`);
        if (!row) return;
        row.remove();

        const classesList = document.querySelector('#classesContainer .classes-list');
        if (classesList && classesList.children.length === 0) {
            document.getElementById('classesContainer').innerHTML =
                '<div class="classes-empty"><p>No racing classes yet. Add classes to organize participants and fees.</p></div>';
        }
    }

    refreshDefaultSeasonOptions() {
        const select = document.getElementById('seriesDefaultSeason');
        if (!select) return;

        const current = select.value;
        const rows = document.querySelectorAll('#seasonsContainer .season-row');
        const options = ['<option value="">None</option>'];

        rows.forEach((row) => {
            const id = row.querySelector('input[name="seasonId[]"]')?.value;
            const name = row.querySelector('.season-name-input')?.value || 'Unnamed Season';
            if (!id) return;
            options.push(`<option value="${id}">${this.uiRenderer.escapeHtml(name)}</option>`);
        });

        select.innerHTML = options.join('');
        if ([...select.options].some((o) => o.value === current)) {
            select.value = current;
        }
    }

    handleCancel() {
        this.currentSeries = null;
        document.dispatchEvent(new CustomEvent('series-form-cancel'));
    }

    showSuccess(message) {
        if (window.Helpers?.showToast) {
            window.Helpers.showToast(message, 'success');
        }
    }

    showError(message) {
        if (window.Helpers?.showToast) {
            window.Helpers.showToast(message, 'error');
        } else {
            console.error(message);
        }
    }

    triggerRefreshEvent() {
        if (window.globalEventBus) {
            window.globalEventBus.emit('series-updated');
        }
        document.dispatchEvent(new CustomEvent('series-refresh'));
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SeriesFormController;
}

if (typeof window !== 'undefined') {
    window.SeriesFormController = SeriesFormController;
}
