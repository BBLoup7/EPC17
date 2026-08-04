/**
 * Series Manager - List + detail workspace orchestrator
 *
 * Architecture:
 * - SeriesDataService: Data operations
 * - SeriesBusinessLogic: Pure calculation / filter / sort
 * - SeriesUIRenderer: HTML generation
 * - SeriesFormController: Detail form management
 *
 * Exports: SeriesManager (window.SeriesManager)
 */

class SeriesManager {
    constructor() {
        this.initialized = false;
        this.selectedSeriesId = null;
        this.statsMap = {};
        this.filters = {
            search: '',
            status: 'active',
            sortBy: 'name',
            sortOrder: 'asc'
        };
        this.initAfterAuth();
    }

    async initAfterAuth() {
        window.debugLogger?.debug('Series', 'Waiting for authentication...');
        await this.waitForAuthentication();
        this.init();
        this.initialized = true;
        window.debugLogger?.debug('Series', 'Initialized after authentication');
    }

    async waitForAuthentication() {
        let attempts = 0;
        while (!window.Auth && attempts < 100) {
            await new Promise((resolve) => setTimeout(resolve, 50));
            attempts++;
        }
        if (!window.Auth) {
            console.warn('SeriesManager: Auth system not available');
            return false;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
        return !!window.currentUser;
    }

    init() {
        if (!window.dataManager) {
            throw new Error('DataManager is required');
        }

        this.dataService = new SeriesDataService(window.dataManager);
        this.businessLogic = SeriesBusinessLogic;
        this.uiRenderer = SeriesUIRenderer;
        this.formController = new SeriesFormController(
            this.dataService,
            this.businessLogic,
            this.uiRenderer
        );

        this.bindEvents();
        this.bindToolbar();
    }

    bindToolbar() {
        const search = document.getElementById('seriesSearch');
        const status = document.getElementById('seriesStatusFilter');
        const sort = document.getElementById('seriesSort');
        const createBtn = document.getElementById('createSeriesBtn');

        if (search) {
            search.addEventListener('input', () => {
                this.filters.search = search.value;
                this.renderListOnly();
            });
        }
        if (status) {
            status.addEventListener('change', () => {
                this.filters.status = status.value;
                this.renderListOnly();
            });
        }
        if (sort) {
            sort.addEventListener('change', () => {
                const [sortBy, sortOrder] = (sort.value || 'name-asc').split('-');
                this.filters.sortBy = sortBy;
                this.filters.sortOrder = sortOrder || 'asc';
                this.renderListOnly();
            });
        }
        if (createBtn) {
            createBtn.addEventListener('click', () => this.showCreateForm());
        }
    }

    bindEvents() {
        if (this.listenersBound) return;

        this.clickHandler = (e) => {
            const listItem = e.target.closest('.series-list-item');
            if (listItem) {
                this.selectSeries(listItem.dataset.seriesId);
                return;
            }

            if (e.target.closest('.btn-create-series')) {
                this.showCreateForm();
                return;
            }

            const archiveBtn = e.target.closest('.btn-archive-series');
            if (archiveBtn) {
                this.archiveSeries(archiveBtn.dataset.seriesId);
                return;
            }

            const restoreBtn = e.target.closest('.btn-restore-series');
            if (restoreBtn) {
                this.restoreSeries(restoreBtn.dataset.seriesId);
                return;
            }

            const duplicateBtn = e.target.closest('.btn-duplicate-series');
            if (duplicateBtn) {
                this.duplicateSeries(duplicateBtn.dataset.seriesId);
                return;
            }

            const deleteBtn = e.target.closest('.btn-delete-series');
            if (deleteBtn) {
                this.deleteSeries(deleteBtn.dataset.seriesId);
            }
        };

        this.refreshHandler = () => this.loadSeriesContent();
        this.savedHandler = (e) => {
            const id = e.detail?.seriesId;
            if (id) this.selectedSeriesId = id;
            this.loadSeriesContent();
        };
        this.cancelHandler = () => {
            this.selectedSeriesId = null;
            this.renderDetailPane();
        };

        document.addEventListener('click', this.clickHandler);
        document.addEventListener('series-refresh', this.refreshHandler);
        document.addEventListener('series-saved', this.savedHandler);
        document.addEventListener('series-form-cancel', this.cancelHandler);
        this.listenersBound = true;
    }

    cleanup() {
        if (this.clickHandler) document.removeEventListener('click', this.clickHandler);
        if (this.refreshHandler) document.removeEventListener('series-refresh', this.refreshHandler);
        if (this.savedHandler) document.removeEventListener('series-saved', this.savedHandler);
        if (this.cancelHandler) document.removeEventListener('series-form-cancel', this.cancelHandler);
        this.listenersBound = false;
    }

    getFilteredSeries() {
        const all = this.dataService.getAllSeries();
        const filtered = this.businessLogic.filterSeries(all, {
            search: this.filters.search,
            status: this.filters.status
        });
        return this.businessLogic.sortSeries(
            filtered,
            this.filters.sortBy,
            this.filters.sortOrder,
            this.statsMap
        );
    }

    async loadSeriesContent() {
        const listEl = document.getElementById('seriesList');
        if (!listEl) {
            console.warn('Series list container not found');
            return;
        }

        try {
            const allSeries = this.dataService.getAllSeries();
            this.statsMap = {};

            // Prefer cache for event counts to keep UI snappy
            const eventsCache = Array.isArray(window.dataManager?.data?.events)
                ? window.dataManager.data.events
                : [];

            for (const series of allSeries) {
                const events = eventsCache.filter((e) => e.seriesId === series.id);
                this.statsMap[series.id] = this.businessLogic.calculateSeriesStats(series, events);
            }

            this.updateDashboardStats(allSeries);
            this.renderListOnly();
            await this.renderDetailPane();
        } catch (error) {
            console.error('Error loading series content:', error);
            listEl.innerHTML = this.uiRenderer.renderEmptyState();
        }
    }

    renderListOnly() {
        const listEl = document.getElementById('seriesList');
        if (!listEl) return;

        const filtered = this.getFilteredSeries();
        const allCount = this.dataService.getAllSeries().length;

        if (allCount === 0) {
            listEl.innerHTML = '';
            const detail = document.getElementById('seriesDetail');
            if (detail) detail.innerHTML = this.uiRenderer.renderEmptyState();
            return;
        }

        if (this.selectedSeriesId && !filtered.some((s) => s.id === this.selectedSeriesId)) {
            // Keep selection even if filtered out of list view — still show detail
        }

        listEl.innerHTML = this.uiRenderer.renderSeriesList(
            filtered,
            this.statsMap,
            this.selectedSeriesId
        );
        listEl.setAttribute('role', 'listbox');
        listEl.setAttribute('aria-label', 'Series');
    }

    async renderDetailPane() {
        const detail = document.getElementById('seriesDetail');
        if (!detail) return;

        if (!this.selectedSeriesId) {
            const allCount = this.dataService.getAllSeries().length;
            detail.innerHTML = allCount === 0
                ? this.uiRenderer.renderEmptyState()
                : this.uiRenderer.renderEmptyDetail();
            return;
        }

        const stats = this.statsMap[this.selectedSeriesId] || {};
        await this.formController.showForm(this.selectedSeriesId, detail, stats);
    }

    async selectSeries(seriesId) {
        this.selectedSeriesId = seriesId;
        this.renderListOnly();
        await this.renderDetailPane();
    }

    showCreateForm() {
        this.selectedSeriesId = null;
        this.renderListOnly();
        const detail = document.getElementById('seriesDetail');
        if (!detail) return;
        this.formController.showForm(null, detail, {});
    }

    showSeriesForm(seriesId = null) {
        if (seriesId) {
            this.selectSeries(seriesId);
        } else {
            this.showCreateForm();
        }
    }

    updateDashboardStats(allSeries) {
        const totalEl = document.getElementById('totalSeries');
        const activeEl = document.getElementById('activeSeries');
        const eventsEl = document.getElementById('totalEvents');

        const activeCount = allSeries.filter((s) => s.status !== 'archived').length;
        let totalEvents = 0;
        Object.values(this.statsMap).forEach((s) => {
            totalEvents += s.totalEvents || 0;
        });

        if (totalEl) totalEl.textContent = String(allSeries.length);
        if (activeEl) activeEl.textContent = String(activeCount);
        if (eventsEl) eventsEl.textContent = String(totalEvents);
    }

    async archiveSeries(seriesId) {
        const series = this.dataService.getSeries(seriesId);
        if (!series) return;
        if (!confirm(`Archive "${series.name}"? It can be restored later.`)) return;

        try {
            await this.dataService.archiveSeries(seriesId);
            if (window.Helpers?.showToast) {
                window.Helpers.showToast('Series archived', 'success');
            }
            await this.loadSeriesContent();
        } catch (error) {
            console.error(error);
            if (window.Helpers?.showToast) {
                window.Helpers.showToast('Failed to archive: ' + error.message, 'error');
            }
        }
    }

    async restoreSeries(seriesId) {
        try {
            await this.dataService.restoreSeries(seriesId);
            if (window.Helpers?.showToast) {
                window.Helpers.showToast('Series restored', 'success');
            }
            await this.loadSeriesContent();
        } catch (error) {
            console.error(error);
            if (window.Helpers?.showToast) {
                window.Helpers.showToast('Failed to restore: ' + error.message, 'error');
            }
        }
    }

    async duplicateSeries(seriesId) {
        const series = this.dataService.getSeries(seriesId);
        if (!series) return;
        if (!confirm(`Duplicate "${series.name}"?`)) return;

        try {
            const copy = await this.dataService.duplicateSeries(seriesId);
            if (window.Helpers?.showToast) {
                window.Helpers.showToast('Series duplicated', 'success');
            }
            this.selectedSeriesId = copy.id;
            // Ensure filter shows active so the copy appears
            const statusFilter = document.getElementById('seriesStatusFilter');
            if (statusFilter) {
                statusFilter.value = 'active';
                this.filters.status = 'active';
            }
            await this.loadSeriesContent();
        } catch (error) {
            console.error(error);
            if (window.Helpers?.showToast) {
                window.Helpers.showToast('Failed to duplicate: ' + error.message, 'error');
            }
        }
    }

    async deleteSeries(seriesId) {
        const series = this.dataService.getSeries(seriesId);
        if (!series) return;

        const events = this.statsMap[seriesId]?.totalEvents || 0;
        if (events > 0) {
            if (window.Helpers?.showToast) {
                window.Helpers.showToast('Cannot delete a series with events. Archive it instead.', 'error');
            }
            return;
        }

        const doDelete = async () => {
            try {
                await this.dataService.deleteSeries(seriesId);
                if (window.Helpers?.showToast) {
                    window.Helpers.showToast('Series deleted', 'success');
                }
                if (this.selectedSeriesId === seriesId) {
                    this.selectedSeriesId = null;
                }
                await this.loadSeriesContent();
            } catch (error) {
                console.error(error);
                if (window.Helpers?.showToast) {
                    window.Helpers.showToast('Error deleting series: ' + error.message, 'error');
                }
            }
        };

        if (window.confirmDelete) {
            window.confirmDelete(`series "${series.name}"`, doDelete);
        } else if (confirm(`Permanently delete "${series.name}"? This cannot be undone.`)) {
            await doDelete();
        }
    }

    // Backward-compatible helpers used elsewhere
    getSeries(seriesId) {
        return this.dataService.getSeries(seriesId);
    }

    getAllSeries() {
        return this.dataService.getAllSeries();
    }

    async getSeriesStats() {
        const allSeries = this.dataService.getAllSeries();
        let totalEvents = 0;
        let activeSeries = 0;
        for (const series of allSeries) {
            const events = await this.dataService.getSeriesEvents(series.id);
            totalEvents += events.length;
            if (series.status !== 'archived') activeSeries++;
        }
        return { total: allSeries.length, active: activeSeries, totalEvents };
    }

    async getSeriesEventCount(seriesId) {
        const events = await this.dataService.getSeriesEvents(seriesId);
        return events.length;
    }

    getSeriesSeasons(seriesId) {
        return this.dataService.getSeries(seriesId)?.seasons || [];
    }

    getActiveSeasons(seriesId) {
        const series = this.dataService.getSeries(seriesId);
        if (!series) return [];
        return this.businessLogic.getActiveSeasons(series.seasons || []);
    }

    isSeasonActive(season) {
        return this.businessLogic.isSeasonActive(season);
    }

    async getSeasonEvents(seriesId, seasonId) {
        return this.dataService.getSeasonEvents(seriesId, seasonId);
    }

    async createSeries(seriesData) {
        return this.dataService.createSeries(seriesData);
    }

    showSeriesConfiguration(seriesId) {
        this.selectSeries(seriesId);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SeriesManager;
}

if (typeof window !== 'undefined') {
    window.SeriesManager = SeriesManager;
}
