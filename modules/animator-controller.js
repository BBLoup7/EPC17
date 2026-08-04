/**
 * Animator Controller Module
 * WebSocket management, state management, and transition orchestration
 * Part of EPC17 Animator Page Rework
 */

class AnimatorController {
    constructor() {
        // Configuration
        this.RESULT_DISPLAY_DURATION = 6000; // 6 seconds
        this.COMPLETE_OVERLAY_DURATION = 2000; // 2 seconds
        this.RECONNECT_INTERVAL = 5000; // 5 seconds
        // Fallback polling should still feel “live” if WebSocket is unavailable
        this.FALLBACK_POLL_INTERVAL = 3000; // 3 seconds
        this.REFRESH_DEBOUNCE_MS = 200; // collapse bursty WS events
        
        // State
        this.socket = null;
        this.socketConnected = false;
        this.useWebSocket = true;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        
        // Data
        this.currentEvent = null;
        this.races = [];
        this.participants = [];
        this.participantsById = new Map();
        this.raceBrackets = {};
        this.lastRaceTime = null;
        this.lastDataRefreshTime = null;
        this.lastRenderedCenterRaceId = null;
        this.completedRaceIds = new Set();
        
        // Race queues
        this.currentRace = null;
        this.liveCurrentRace = null;
        this.nextRaces = [];
        this.previousRaces = [];

        // Manual override state
        this.pinnedRaceId = null;
        
        // Timers
        this.timerInterval = null;
        this.fallbackPollInterval = null;
        this.refreshDebounceTimeout = null;
        this.queuedRefreshOptions = {};
        
        // Flags
        this.isShowingResults = false;
        this.lastCompletedRaceId = null;
        
        // DOM references
        this.nextRacesContainer = null;
        this.currentRaceContainer = null;
        this.previousRacesContainer = null;
        this.floatLayer = null;
        
        window.debugLogger?.init('Animator', 'AnimatorController initialized');
    }
    
    /**
     * Initialize the controller
     */
    async init() {
        window.debugLogger?.debug('Animator', 'Starting AnimatorController initialization...');
        
        // Wait for authentication
        const authSuccess = await this.waitForAuth();
        if (!authSuccess) {
            console.error('🔐 Authentication failed');
            this.showAccessDeniedMessage('Please log in to access the animator');
            return;
        }

        // Ensure required globals exist on this standalone page
        const bootstrapped = await this.ensureDataLayer();
        if (!bootstrapped) {
            console.error('❌ Failed to initialize data layer for animator');
            this.showAccessDeniedMessage('Failed to initialize data layer. Please refresh.');
            return;
        }
        
        // Get DOM references
        this.nextRacesContainer = document.getElementById('next-races');
        this.currentRaceContainer = document.getElementById('cardsHost');
        this.previousRacesContainer = document.getElementById('prev-races');
        this.floatLayer = document.getElementById('animator-float-layer') || null;
        
        // Load initial data
        await this.loadData();

        // Seed completion tracking BEFORE any WS/poll refresh so historical
        // completed heats do not trigger a false cinematic sequence on join.
        this.seedCompletionState();
        
        // Setup WebSocket connection
        this.setupWebSocket();
        
        // Setup EventBus fallback
        this.setupEventBusListeners();
        
        // Setup keyboard controls
        this.setupKeyboardControls();

        // Setup click/tap interactions (pin + replay)
        this.setupInteractionControls();
        
        // Start timer
        this.startTimer();
        
        // Render initial state (calm first paint — no cinema)
        this.renderAll();
        
        // Setup fallback polling (only if WebSocket fails)
        setTimeout(() => {
            if (!this.socketConnected) {
                window.debugLogger?.debug('Animator', 'WebSocket not connected, enabling fallback polling');
                this.startFallbackPolling();
            }
        }, 5000);
        
        window.debugLogger?.debug('Animator', 'AnimatorController initialized successfully');
    }

    /**
     * Mark all currently completed heats as already-seen so the first refresh
     * does not treat them as newly completed (which caused join-time flashing).
     */
    seedCompletionState() {
        this.computeQueues();
        const completedNow = (this.races || [])
            .filter(r => this.isRaceCompleted(r) && this.hasMeaningfulResults(r) && r?.id)
            .map(r => r.id);
        this.completedRaceIds = new Set(completedNow);
        this.lastRenderedCenterRaceId = this.currentRace?.id || null;
        window.debugLogger?.debug('Animator', 'Seeded completion state', {
            completedCount: completedNow.length,
            centerRaceId: this.lastRenderedCenterRaceId
        });
    }

    getFloatLayer() {
        if (this.floatLayer) return this.floatLayer;
        const el = document.createElement('div');
        el.id = 'animator-float-layer';
        el.className = 'animator-float-layer';
        el.setAttribute('aria-hidden', 'true');
        document.body.appendChild(el);
        this.floatLayer = el;
        return el;
    }

    createPlaceholderFor(element) {
        const ph = document.createElement('div');
        ph.className = 'animator-placeholder';
        const rect = element.getBoundingClientRect();
        ph.style.height = `${rect.height}px`;
        ph.style.width = '100%';
        return ph;
    }

    setFloatingRect(el, rect) {
        el.classList.add('floating-card');
        el.style.position = 'fixed';
        el.style.left = `${rect.left}px`;
        el.style.top = `${rect.top}px`;
        el.style.width = `${rect.width}px`;
        el.style.height = `${rect.height}px`;
        el.style.zIndex = '2501';
        el.style.pointerEvents = 'none';
        el.style.margin = '0';
    }
    
    /**
     * Wait for authentication
     */
    async waitForAuth() {
        let attempts = 0;
        while (!window.Auth && attempts < 100) {
            await new Promise(resolve => setTimeout(resolve, 50));
            attempts++;
        }
        
        if (!window.Auth) {
            console.error('🔐 Auth system not available');
            return false;
        }
        
        // Wait for session restoration (Auth.init() runs on DOMContentLoaded)
        attempts = 0;
        while (!window.currentUser && attempts < 120) { // ~6s max
            await new Promise(resolve => setTimeout(resolve, 50));
            attempts++;
        }
        
        if (!window.currentUser) {
            window.debugLogger?.debug('Animator', 'No current user');
            return false;
        }
        
        if (!window.Auth.hasPermission || !window.Auth.hasPermission('animator')) {
            window.debugLogger?.debug('Animator', 'No animator permission');
            return false;
        }
        
        window.debugLogger?.debug('Animator', 'Authentication successful');
        return true;
    }

    /**
     * Ensure DataManager + EventBus globals exist on standalone pages (like animator.html).
     * Other sections boot these via js/app.js, but animator runs standalone.
     */
    async ensureDataLayer() {
        try {
            // DataManager must be instantiated for this page
            if (!window.dataManager) {
                if (!window.DataManager) {
                    console.error('❌ DataManager class not found on window');
                    return false;
                }
                window.debugLogger?.debug('Animator', 'Instantiating DataManager for animator page');
                window.dataManager = new window.DataManager();
            }

            // Provide a consistent global eventBus reference (controller listens on window.eventBus)
            if (!window.eventBus) {
                window.eventBus = window.dataManager.eventBus || window.globalEventBus || null;
            }

            return true;
        } catch (error) {
            console.error('❌ ensureDataLayer failed:', error);
            return false;
        }
    }
    
    /**
     * Setup WebSocket connection
     */
    setupWebSocket() {
        if (!this.useWebSocket) return;
        
        try {
            // Socket.IO client should be loaded from Flask-SocketIO
            if (typeof io === 'undefined') {
                console.warn('⚠️ Socket.IO not available, using fallback');
                this.useWebSocket = false;
                this.updateStatusIndicators();
                this.startFallbackPolling();
                return;
            }
            
            window.debugLogger?.debug('Animator', 'Connecting to WebSocket...');
            this.socket = io();
            
            this.socket.on('connect', () => {
                window.debugLogger?.debug('Animator', 'WebSocket connected');
                this.socketConnected = true;
                this.reconnectAttempts = 0;
                this.updateStatusIndicators();
                
                // Stop fallback polling if it's running
                if (this.fallbackPollInterval) {
                    clearInterval(this.fallbackPollInterval);
                    this.fallbackPollInterval = null;
                }
            });
            
            this.socket.on('disconnect', () => {
                window.debugLogger?.debug('Animator', 'WebSocket disconnected');
                this.socketConnected = false;
                this.updateStatusIndicators();
                this.attemptReconnect();
            });
            
            // Listen for race events
            this.socket.on('race_completed', (data) => {
                window.debugLogger?.debug('Animator', 'Race completed event received:', data);
                this.handleRaceCompleted(data);
            });
            
            this.socket.on('race_started', (data) => {
                window.debugLogger?.debug('Animator', 'Race started event received:', data);
                this.handleRaceStarted(data);
            });
            
            this.socket.on('bracket_updated', (data) => {
                window.debugLogger?.debug('Animator', 'Bracket updated event received:', data);
                this.handleBracketUpdated(data);
            });
            
            this.socket.on('event_status_changed', (data) => {
                window.debugLogger?.debug('Animator', 'Event status changed:', data);
                this.handleEventStatusChanged(data);
            });
            
        } catch (error) {
            console.error('❌ WebSocket setup failed:', error);
            this.useWebSocket = false;
            this.updateStatusIndicators();
            this.startFallbackPolling();
        }
    }
    
    /**
     * Attempt WebSocket reconnection
     */
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.warn('⚠️ Max reconnect attempts reached, switching to fallback');
            this.useWebSocket = false;
            this.startFallbackPolling();
            return;
        }
        
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        
        window.debugLogger?.debug('Animator', `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        setTimeout(() => {
            if (this.socket) {
                this.socket.connect();
            }
        }, delay);
    }
    
    /**
     * Setup EventBus listeners (fallback)
     */
    setupEventBusListeners() {
        if (!window.eventBus) return;
        
        window.eventBus.on('race-result-recorded', (data) => {
            window.debugLogger?.debug('Animator', 'EventBus: Race result recorded');
            this.handleRaceCompleted(data);
        });
        
        window.eventBus.on('race-status-changed', (data) => {
            window.debugLogger?.debug('Animator', 'EventBus: Race status changed');
            if (data.status === 'completed') {
                this.handleRaceCompleted(data);
            }
        });
        
        window.eventBus.on('race-bracket-saved', (data) => {
            window.debugLogger?.debug('Animator', 'EventBus: Bracket saved');
            this.handleBracketUpdated(data);
        });
        
        window.eventBus.on('event-updated', (data) => {
            window.debugLogger?.debug('Animator', 'EventBus: Event updated');
            this.refreshDataAndRender();
        });
    }
    
    /**
     * Start fallback polling
     */
    startFallbackPolling() {
        if (this.fallbackPollInterval) return;
        
        window.debugLogger?.debug('Animator', 'Starting fallback polling');
        this.fallbackPollInterval = setInterval(() => {
            window.debugLogger?.debug('Animator', 'Fallback poll: refreshing data');
            this.refreshDataAndRender();
        }, this.FALLBACK_POLL_INTERVAL);
        this.updateStatusIndicators();
    }
    
    /**
     * Setup keyboard controls
     */
    setupKeyboardControls() {
        document.addEventListener('keydown', (e) => {
            switch(e.key) {
                case ' ': // Space - skip to next race
                    e.preventDefault();
                    this.skipToNextRace();
                    break;
                case 'l':
                case 'L': // L - return to live/auto
                    e.preventDefault();
                    this.clearPinnedRace({ toastMessage: 'Returned to LIVE (AUTO)', toastType: 'info' });
                    break;
                case '1':
                case '2':
                case '3': { // 1/2/3 - replay recent result by index
                    e.preventDefault();
                    const idx = Number(e.key) - 1;
                    this.replayRecentResultByIndex(idx);
                    break;
                }
                case 'r':
                case 'R': // R - refresh data
                    e.preventDefault();
                    this.refreshDataAndRender();
                    break;
                case 'f':
                case 'F': // F - toggle fullscreen
                    e.preventDefault();
                    this.toggleFullscreen();
                    break;
                case 'Escape': // ESC - clear overlays
                    this.clearOverlays();
                    break;
            }
        });
        
        window.debugLogger?.debug('Animator', 'Keyboard controls enabled');
    }

    /**
     * Setup click/tap + keyboard activation for pinning and replaying results.
     * Uses event delegation against containers.
     */
    setupInteractionControls() {
        const handleActivate = (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const el = target.closest('[data-action][data-race-id]');
            if (!el) return;
            const action = el.getAttribute('data-action');
            const raceId = el.getAttribute('data-race-id');
            if (!action || !raceId) return;
            this.handleAnimatorAction(action, raceId);
        };

        const handleKeyActivate = (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const target = event.target;
            if (!(target instanceof Element)) return;
            const el = target.closest('[data-action][data-race-id]');
            if (!el) return;
            event.preventDefault();
            const action = el.getAttribute('data-action');
            const raceId = el.getAttribute('data-race-id');
            if (!action || !raceId) return;
            this.handleAnimatorAction(action, raceId);
        };

        this.nextRacesContainer?.addEventListener('click', handleActivate);
        this.previousRacesContainer?.addEventListener('click', handleActivate);
        this.nextRacesContainer?.addEventListener('keydown', handleKeyActivate);
        this.previousRacesContainer?.addEventListener('keydown', handleKeyActivate);
    }

    handleAnimatorAction(action, raceId) {
        if (action === 'pin') {
            this.pinRace(raceId);
            return;
        }
        if (action === 'replay') {
            this.replayRaceResultsById(raceId);
            return;
        }
    }

    pinRace(raceId) {
        if (!raceId) return;

        // Toggle off if already pinned
        if (this.pinnedRaceId === raceId) {
            this.clearPinnedRace({ toastMessage: 'Unpinned — back to LIVE (AUTO)', toastType: 'info' });
            return;
        }

        const race = this.races.find(r => r.id === raceId) || null;
        if (!race) {
            this.toast('Race not found to pin', 'warning');
            return;
        }

        if (this.isRaceCompleted(race)) {
            this.toast('Cannot pin a completed race — use Recent Results replay', 'info');
            return;
        }

        this.pinnedRaceId = raceId;
        this.renderAll();
        this.toast(`Pinned Race #${race.raceNumber || 'TBD'}`, 'success');
    }

    clearPinnedRace({ toastMessage = null, toastType = 'info', render = true } = {}) {
        if (!this.pinnedRaceId) return;
        this.pinnedRaceId = null;

        if (toastMessage) {
            this.toast(toastMessage, toastType);
        }

        if (render) {
            this.renderAll();
        }
    }

    replayRecentResultByIndex(index) {
        const race = this.previousRaces?.[index] || null;
        if (!race) {
            this.toast('No recent result in that slot', 'info');
            return;
        }
        this.replayRaceResultsById(race.id);
    }

    async replayRaceResultsById(raceId) {
        if (!raceId) return;
        if (this.isShowingResults) return;

        const race = this.races.find(r => r.id === raceId) ||
                     this.previousRaces.find(r => r.id === raceId) ||
                     null;
        if (!race) {
            this.toast('Race not found to replay', 'warning');
            return;
        }
        if (!this.isRaceCompleted(race)) {
            this.toast('Race is not completed yet', 'info');
            return;
        }

        this.isShowingResults = true;
        this.clearOverlays();

        await new Promise(resolve => {
            window.AnimatorRenderer.showRaceResults(
                race,
                this.currentRaceContainer,
                this.RESULT_DISPLAY_DURATION,
                resolve
            );
        });

        this.isShowingResults = false;
        this.renderAll();
    }

    applyPinnedHighlights() {
        const cards = this.nextRacesContainer?.querySelectorAll('[data-action="pin"][data-race-id]') || [];
        cards.forEach(el => {
            const isPinned = !!(this.pinnedRaceId && el.getAttribute('data-race-id') === this.pinnedRaceId);
            el.classList.toggle('is-pinned', isPinned);
            el.setAttribute('aria-pressed', isPinned ? 'true' : 'false');
        });
    }

    isRaceCompleted(race) {
        if (!race) return false;
        if (race.status === 'completed' || race.completedAt || race.endTime || race.isComplete) return true;
        return this.hasMeaningfulResults(race);
    }

    hasMeaningfulResults(race) {
        const results = race?.results || race?.raceResults || race?.finishOrder;
        if (Array.isArray(results)) return results.length > 0;
        if (results && typeof results === 'object') {
            if (Array.isArray(results.finishOrder)) return results.finishOrder.length > 0;
            return Object.keys(results).length > 0;
        }
        return false;
    }

    toast(message, type = 'info') {
        if (window.Helpers && typeof window.Helpers.showToast === 'function') {
            window.Helpers.showToast(message, type);
            return;
        }
        window.debugLogger?.debug('Animator', `Toast (${type}): ${message}`);
    }
    
    /**
     * Load data from API
     */
    async loadData(isRefresh = false, options = {}) {
        try {
            if (!window.dataManager) {
                throw new Error('DataManager not available');
            }

            const forceRaceBrackets = !!options.forceRaceBrackets || isRefresh;
            const forceEvents = !!options.forceEvents;
            const forceParticipants = !!options.forceParticipants;

            // Force-refresh specific data types by invalidating DataManager cache metadata.
            // (DataManager has internal caching TTLs; for the animator we need immediate freshness.)
            const invalidateTypes = [];
            if (forceRaceBrackets) invalidateTypes.push('race-brackets');
            if (forceEvents) invalidateTypes.push('events');
            if (forceParticipants) invalidateTypes.push('participants');
            if (invalidateTypes.length > 0) {
                this.invalidateDataManagerCache(invalidateTypes);
            }
            if (forceRaceBrackets) {
                await window.dataManager.loadFromStorage(['race-brackets'], true);
            }
            if (forceEvents) {
                await window.dataManager.loadFromStorage(['events'], true);
            }
            if (forceParticipants) {
                await window.dataManager.loadFromStorage(['participants'], true);
            }
            
            const [eventsData, participantsData, bracketsData] = await Promise.all([
                window.dataManager.getEvents({}, 1, 1000),
                window.dataManager.getParticipants({}, 1, 2000),
                window.dataManager.getRaceBrackets()
            ]);
            
            const events = Array.isArray(eventsData?.events) ? eventsData.events : 
                          (Array.isArray(eventsData) ? eventsData : []);
            // Prefer full in-memory participants list (loadAllParticipantPages), fallback to paginated response
            this.participants = Array.isArray(window.dataManager?.data?.participants) ? window.dataManager.data.participants :
                               (Array.isArray(participantsData?.participants) ? participantsData.participants :
                               (Array.isArray(participantsData) ? participantsData : []));
            this.participantsById = new Map(
                (this.participants || [])
                    .filter(p => p && p.id)
                    .map(p => [p.id, p])
            );
            this.raceBrackets = bracketsData || {};
            
            // Extract races from brackets
            this.races = [];
            if (this.raceBrackets && Object.keys(this.raceBrackets).length > 0) {
                Object.entries(this.raceBrackets).forEach(([eventId, bracket]) => {
                    const extracted = window.AnimatorUtils.extractRacesFromBrackets(bracket, eventId);
                    this.races.push(...extracted);
                });
                window.debugLogger?.debug('Animator', `Extracted ${this.races.length} races from brackets`);
            }
            
            // Find current event
            this.currentEvent = window.AnimatorUtils.findEventFromRaceActivity(events, this.races) ||
                               (events.length ? events.sort((a, b) => 
                                   new Date(b.createdAt) - new Date(a.createdAt))[0] : null);
            
            // Infer last result-entry time for the active event only.
            // Never seed with Date.now() — that made the timer reset on every page join.
            const eventRacesForTimer = this.races.filter(race =>
                !this.currentEvent?.id || !race.eventId || race.eventId === this.currentEvent.id
            );
            const inferredLastRaceTime = window.AnimatorUtils.inferLastRaceTime(eventRacesForTimer);
            if (inferredLastRaceTime) {
                // Only move forward to avoid timer "resetting" on refresh
                if (!this.lastRaceTime || inferredLastRaceTime >= this.lastRaceTime) {
                    this.lastRaceTime = inferredLastRaceTime;
                }
            }
            // If no inferable timestamp, leave lastRaceTime as-is (null on first load → idle "—")
            this.lastDataRefreshTime = Date.now();
            this.updateStatusIndicators();
            
            if (!isRefresh) {
                window.debugLogger?.debug('Animator', 'Data loaded successfully');
            }
            
        } catch (error) {
            console.error('❌ Failed to load data:', error);
        }
    }
    
    /**
     * Compute race queues (current, next, previous)
     */
    computeQueues() {
        const eventRaces = this.races.filter(race => 
            !race.eventId || race.eventId === this.currentEvent?.id
        );
        
        // Sort by race number or round/heat, then stable fallbacks
        const sorted = [...eventRaces].sort((a, b) => {
            if (a.raceNumber && b.raceNumber) {
                return a.raceNumber - b.raceNumber;
            }
            if (a.round && b.round && a.round !== b.round) return a.round - b.round;
            if (a.heatNumber && b.heatNumber && a.heatNumber !== b.heatNumber) return a.heatNumber - b.heatNumber;
            const ta = new Date(a.createdAt || 0).getTime();
            const tb = new Date(b.createdAt || 0).getTime();
            if (ta !== tb) return ta - tb;
            return String(a.id || '').localeCompare(String(b.id || ''));
        });
        
        // Upcoming races
        const upcoming = sorted.filter(r => {
            if (this.isRaceCompleted(r)) return false;
            return (
                r.status === 'scheduled' ||
                r.status === 'in_progress' ||
                r.status === 'pending' ||
                r.status === 'upcoming' ||
                !r.status
            );
        });
        
        // Completed races — prefer result-entry timestamps
        const completed = sorted.filter(r => this.isRaceCompleted(r)).sort((a, b) => {
            const ta = new Date(a.endTime || a.completedAt || 0).getTime();
            const tb = new Date(b.endTime || b.completedAt || 0).getTime();
            if (ta !== tb) return tb - ta;
            if (a.raceNumber && b.raceNumber) {
                return b.raceNumber - a.raceNumber;
            }
            return String(b.id || '').localeCompare(String(a.id || ''));
        });
        
        this.liveCurrentRace = upcoming[0] || null;
        this.nextRaces = upcoming.slice(1, 4);
        this.previousRaces = completed.slice(0, 3);

        // Resolve displayed current race (AUTO vs PINNED)
        let pinnedRace = null;
        if (this.pinnedRaceId) {
            pinnedRace = sorted.find(r => r.id === this.pinnedRaceId) || null;
            const stillUpcoming = pinnedRace ? upcoming.some(r => r.id === pinnedRace.id) : false;
            if (!pinnedRace || !stillUpcoming || this.isRaceCompleted(pinnedRace)) {
                // Auto-unpin if it disappeared or is no longer upcoming (or completed)
                this.clearPinnedRace({
                    toastMessage: 'Pinned race is no longer upcoming — back to LIVE (AUTO)',
                    toastType: 'info',
                    render: false
                });
                pinnedRace = null;
            }
        }

        this.currentRace = pinnedRace || this.liveCurrentRace;
        
        return {
            current: this.currentRace,
            next: this.nextRaces,
            previous: this.previousRaces
        };
    }
    
    /**
     * Render all panels
     */
    renderAll() {
        this.computeQueues();
        
        // Render panels
        window.AnimatorRenderer.renderNextRacesList(this.nextRaces, this.nextRacesContainer, this.participantsById);
        if (!this.isShowingResults) {
            window.AnimatorRenderer.renderCurrentRace(
                this.currentRace,
                this.races,
                this.currentEvent?.id,
                this.currentRaceContainer,
                this.participantsById
            );
        }
        window.AnimatorRenderer.renderPreviousRacesList(this.previousRaces, this.previousRacesContainer, this.participantsById);

        // Apply visual markers (PINNED highlight, etc.)
        this.applyPinnedHighlights();
        
        // Update header — null lastRaceTime means idle (no results yet)
        const timeSinceLastRace = this.lastRaceTime != null
            ? Date.now() - this.lastRaceTime
            : null;
        const eventRaces = this.races.filter(race =>
            !race.eventId || race.eventId === this.currentEvent?.id
        );
        const totalRemaining = eventRaces.filter(r =>
            !this.isRaceCompleted(r) &&
            (r.status === 'scheduled' || r.status === 'in_progress' || r.status === 'pending' || r.status === 'upcoming' || !r.status)
        ).length;
        const currentClass = this.currentRace?.className || this.currentRace?.class || null;
        const classRemaining = currentClass ? eventRaces.filter(r =>
            (r.className === currentClass || r.class === currentClass) &&
            !this.isRaceCompleted(r) &&
            (r.status === 'scheduled' || r.status === 'in_progress' || r.status === 'pending' || r.status === 'upcoming' || !r.status)
        ).length : null;
        
        window.AnimatorRenderer.updateHeader(this.currentEvent, timeSinceLastRace, {
            totalRemaining,
            className: currentClass,
            classRemaining
        });
        this.updateStatusIndicators();

        // Track what race is currently shown in the center (used for completion detection on refresh)
        if (!this.isShowingResults) {
            this.lastRenderedCenterRaceId = this.currentRace?.id || null;
        }
    }
    
    /**
     * Handle race completed event
     */
    async handleRaceCompleted(data) {
        window.debugLogger?.debug('Animator', 'Handling race completion');
        
        // Prefer result-entry timestamp from payload; otherwise let loadData infer.
        // Never fall back to Date.now() here — that desyncs the desk timer from real results.
        if (data.race?.endTime) {
            this.lastRaceTime = new Date(data.race.endTime).getTime();
        } else if (data.race?.completedAt) {
            this.lastRaceTime = new Date(data.race.completedAt).getTime();
        }

        // Let the unified refresh path detect the newly completed heat
        await this.refreshDataAndRender({ forceRaceBrackets: true });
    }
    
    /**
     * Handle race started event
     */
    async handleRaceStarted(data) {
        window.debugLogger?.debug('Animator', 'Handling race start');
        this.scheduleRefresh({ forceRaceBrackets: true });
    }
    
    /**
     * Handle bracket updated event
     */
    async handleBracketUpdated(data) {
        window.debugLogger?.debug('Animator', 'Handling bracket update');
        this.scheduleRefresh({ forceRaceBrackets: true });
    }
    
    /**
     * Handle event status changed
     */
    async handleEventStatusChanged(data) {
        window.debugLogger?.debug('Animator', 'Handling event status change');
        this.scheduleRefresh({ forceRaceBrackets: true, forceEvents: true });
    }
    
    /**
     * Refresh data and render
     */
    async refreshDataAndRender(options = {}) {
        // Don’t interrupt cinematic sequences; queue one refresh to run right after.
        if (this.isShowingResults) {
            this.queuedRefreshOptions = this.mergeRefreshOptions(this.queuedRefreshOptions, options);
            return;
        }

        const beforeRaceId = this.lastRenderedCenterRaceId;

        await this.loadData(true, options);

        const newlyCompleted = this.detectNewlyCompletedRaces();
        // Only cinema when the race that was in center just completed.
        // Falling back to newlyCompleted[0] caused join-time flash of historical heats.
        const preferred = beforeRaceId
            ? newlyCompleted.find(r => r.id === beforeRaceId)
            : null;

        if (preferred && !this.isShowingResults) {
            window.debugLogger?.debug('Animator', 'Detected newly completed center race, starting completion sequence', {
                raceId: preferred.id,
                raceNumber: preferred.raceNumber,
                className: preferred.className
            });
            await this.showCompletionSequence(preferred);
            return;
        }

        this.renderAll();
    }

    /**
     * Detect newly completed races since the previous refresh.
     * Returns an array of newly completed races, most-recent first.
     */
    detectNewlyCompletedRaces() {
        const completedNow = this.races
            .filter(r => this.isRaceCompleted(r) && this.hasMeaningfulResults(r))
            .map(r => ({
                race: r,
                t: new Date(r.endTime || r.completedAt || 0).getTime()
            }))
            .filter(x => x.race?.id);

        const newly = completedNow
            .filter(x => !this.completedRaceIds.has(x.race.id))
            .sort((a, b) => (b.t || 0) - (a.t || 0))
            .map(x => x.race);

        // Update completed set for next detection pass
        this.completedRaceIds = new Set(completedNow.map(x => x.race.id));

        return newly;
    }

    mergeRefreshOptions(a = {}, b = {}) {
        return {
            forceRaceBrackets: !!(a.forceRaceBrackets || b.forceRaceBrackets),
            forceEvents: !!(a.forceEvents || b.forceEvents),
            forceParticipants: !!(a.forceParticipants || b.forceParticipants)
        };
    }

    /**
     * Debounced refresh for bursty WS events (prevents jank from repeated full re-renders).
     */
    scheduleRefresh(options = {}) {
        this.queuedRefreshOptions = this.mergeRefreshOptions(this.queuedRefreshOptions, options);
        if (this.refreshDebounceTimeout) return;

        this.refreshDebounceTimeout = setTimeout(async () => {
            this.refreshDebounceTimeout = null;
            const opts = this.queuedRefreshOptions;
            this.queuedRefreshOptions = {};
            window.debugLogger?.debug('Animator', 'Refreshing data (debounced)', opts);
            await this.refreshDataAndRender(opts);
        }, this.REFRESH_DEBOUNCE_MS);
    }
    
    /**
     * Find newly completed race
     */
    findNewlyCompletedRace() {
        this.computeQueues();
        
        if (this.previousRaces.length > 0) {
            const mostRecent = this.previousRaces[0];
            if (mostRecent.id !== this.lastCompletedRaceId) {
                this.lastCompletedRaceId = mostRecent.id;
                return mostRecent;
            }
        }
        
        return null;
    }
    
    /**
     * Show race completion sequence
     */
    async showCompletionSequence(race) {
        if (this.isShowingResults) return;
        
        this.isShowingResults = true;

        // Ensure the center shows the completed race before revealing finish order
        try {
            window.AnimatorRenderer.renderCurrentRace(
                race,
                this.races,
                this.currentEvent?.id,
                this.currentRaceContainer,
                this.participantsById
            );
        } catch (e) {
            // If rendering fails, just fall back to normal
            window.debugLogger?.warn('Animator', 'Failed to render completed race before reveal', e);
        }

        // Cinematic finish-order reveal (all lanes)
        await window.AnimatorRenderer.animateFinishReveal(
            race,
            this.currentRaceContainer,
            this.participantsById,
            { focusMs: 900, gapMs: 250, focusScale: 1.08 }
        );

        // Sync timer from this result entry if present
        const entryTs = new Date(race.endTime || race.completedAt || 0).getTime();
        if (Number.isFinite(entryTs) && entryTs > 0) {
            if (!this.lastRaceTime || entryTs >= this.lastRaceTime) {
                this.lastRaceTime = entryTs;
            }
        }

        // Continuous motion transitions: slide completed into results + promote next race
        await this.runContinuousMotionTransition(race);

        this.isShowingResults = false;
        this.renderAll();

        // If updates arrived while we were animating, process them now.
        const pending = this.queuedRefreshOptions;
        this.queuedRefreshOptions = {};
        if (pending && (pending.forceRaceBrackets || pending.forceEvents || pending.forceParticipants)) {
            this.scheduleRefresh(pending);
        }
    }

    /**
     * Continuous motion transition:
     * - Completed race becomes a summary card that slides into Recent Results (right)
     * - Next race card slides from Up Next (left) into the center as a presentation
     * Always clears center so final renderAll is not stuck at opacity 0.
     */
    async runContinuousMotionTransition(completedRace) {
        const floatLayer = this.getFloatLayer();

        // Ensure next/previous queues reflect the post-completion world (without re-rendering the center yet)
        this.computeQueues();

        const clearCenterForHandoff = () => {
            if (!this.currentRaceContainer) return;
            this.currentRaceContainer.innerHTML = '';
            this.currentRaceContainer.removeAttribute('data-current-race-id');
            this.currentRaceContainer.removeAttribute('data-content-sig');
            this.currentRaceContainer.classList.remove('finish-mode');
        };

        if (!window.gsap) {
            clearCenterForHandoff();
            return;
        }

        try {
            // Fade out current driver cards so the stage can transition cleanly
            try {
                const cards = Array.from(this.currentRaceContainer?.querySelectorAll('.driver-card') || []);
                if (cards.length > 0) {
                    await new Promise(resolve => {
                        gsap.to(cards, {
                            opacity: 0,
                            y: 14,
                            scale: 0.98,
                            duration: 0.35,
                            stagger: 0.03,
                            ease: 'power2.in',
                            onComplete: resolve
                        });
                    });
                }
            } catch (e) {
                // Ignore fade failures
            }

            // 1) Slide a summary card into Recent Results
            try {
                const summaryEl = window.AnimatorRenderer.createPreviousRaceCardElement(completedRace, this.participantsById);
                const targetWidth = this.previousRacesContainer?.getBoundingClientRect().width || 320;

                floatLayer.appendChild(summaryEl);
                summaryEl.style.width = `${targetWidth}px`;
                summaryEl.style.height = 'auto';

                const centerRect = this.currentRaceContainer?.getBoundingClientRect();
                const startRect = centerRect
                    ? {
                          left: centerRect.left + (centerRect.width - targetWidth) / 2,
                          top: centerRect.top + Math.min(80, centerRect.height * 0.15),
                          width: targetWidth,
                          height: Math.max(120, Math.min(220, centerRect.height * 0.35))
                      }
                    : { left: 200, top: 120, width: targetWidth, height: 160 };

                this.setFloatingRect(summaryEl, startRect);

                // Placeholder at top of results list to get an accurate target rect
                const ph = document.createElement('div');
                ph.className = 'prev-card show animator-placeholder';
                ph.style.height = `${startRect.height}px`;

                if (this.previousRacesContainer) {
                    this.previousRacesContainer.insertBefore(ph, this.previousRacesContainer.firstChild);
                }
                const targetRect = ph.getBoundingClientRect();

                await new Promise(resolve => {
                    gsap.to(summaryEl, {
                        left: targetRect.left,
                        top: targetRect.top,
                        width: targetRect.width,
                        height: targetRect.height,
                        duration: 0.75,
                        ease: 'power2.inOut',
                        onComplete: resolve
                    });
                });

                // Replace placeholder with real element in the list
                summaryEl.classList.remove('floating-card');
                summaryEl.style.position = '';
                summaryEl.style.left = '';
                summaryEl.style.top = '';
                summaryEl.style.width = '';
                summaryEl.style.height = '';
                summaryEl.style.zIndex = '';
                summaryEl.style.pointerEvents = '';

                if (ph.parentNode) ph.parentNode.removeChild(ph);
                if (this.previousRacesContainer) {
                    this.previousRacesContainer.insertBefore(summaryEl, this.previousRacesContainer.firstChild);
                }

                // Lock signature so renderAll doesn't immediately rebuild and kill the just-inserted card
                const sig = (this.previousRaces || []).map(r => r?.id || '').join('|');
                this.previousRacesContainer?.setAttribute('data-sig', sig);
            } catch (e) {
                window.debugLogger?.warn('Animator', 'Failed to slide summary into results', e);
            }

            // 2) Promote the next race card from Up Next into the center (presentation)
            try {
                const nextEl = this.nextRacesContainer?.querySelector('.mini-race[data-action="pin"][data-race-id]');
                if (nextEl) {
                    const fromRect = nextEl.getBoundingClientRect();
                    const placeholder = this.createPlaceholderFor(nextEl);
                    nextEl.parentNode?.replaceChild(placeholder, nextEl);

                    floatLayer.appendChild(nextEl);
                    this.setFloatingRect(nextEl, fromRect);

                    const centerRect = this.currentRaceContainer?.getBoundingClientRect();
                    if (centerRect) {
                        const toLeft = centerRect.left + (centerRect.width - fromRect.width) / 2;
                        const toTop = centerRect.top + 18;

                        await new Promise(resolve => {
                            gsap.to(nextEl, {
                                left: toLeft,
                                top: toTop,
                                duration: 0.75,
                                ease: 'power2.inOut',
                                onComplete: resolve
                            });
                        });

                        // Hold briefly as a “presentation”, then fade out so the full driver cards can take over
                        await new Promise(resolve => {
                            gsap.to(nextEl, { duration: 0.35, ease: 'none', onComplete: resolve });
                        });
                        await new Promise(resolve => {
                            gsap.to(nextEl, {
                                opacity: 0,
                                y: -10,
                                duration: 0.35,
                                ease: 'power2.in',
                                onComplete: resolve
                            });
                        });
                    }

                    if (placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
                    if (nextEl.parentNode) nextEl.parentNode.removeChild(nextEl);
                }
            } catch (e) {
                window.debugLogger?.warn('Animator', 'Failed to promote next race card', e);
            }
        } finally {
            // Never leave center stuck at opacity 0 — renderAll paints the new current race
            clearCenterForHandoff();
            // Clean any leftover float nodes
            while (floatLayer.firstChild) {
                floatLayer.removeChild(floatLayer.firstChild);
            }
        }
    }
    
    /**
     * Skip to next race (keyboard shortcut)
     */
    skipToNextRace() {
        window.debugLogger?.debug('Animator', 'Skipping to next race');
        this.clearPinnedRace({ render: false });
        this.clearOverlays();
        this.isShowingResults = false;
        this.refreshDataAndRender();
    }
    
    /**
     * Clear any active overlays
     */
    clearOverlays() {
        const overlays = this.currentRaceContainer?.querySelectorAll('.race-complete-overlay, .race-results-display');
        overlays?.forEach(overlay => overlay.remove());
    }
    
    /**
     * Toggle fullscreen
     */
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error('Fullscreen failed:', err);
            });
        } else {
            document.exitFullscreen();
        }
    }
    
    /**
     * Start timer
     */
    startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        
        this.timerInterval = setInterval(() => {
            this.updateTimer();
        }, 1000);
        
        this.updateTimer();
        this.updateStatusIndicators();
    }
    
    /**
     * Update timer display — idle "—" until a real result-entry timestamp exists
     */
    updateTimer() {
        const timerEl = document.querySelector('.race-timer .t');
        if (!timerEl) return;

        if (this.lastRaceTime == null) {
            timerEl.textContent = '—';
            return;
        }

        const timeSinceLastRace = Date.now() - this.lastRaceTime;
        timerEl.textContent = window.AnimatorUtils.formatDuration(timeSinceLastRace);
    }

    /**
     * Update header status indicators (WebSocket + last update age)
     */
    updateStatusIndicators() {
        const wsEl = document.getElementById('animator-ws-pill');
        const liveEl = document.getElementById('animator-live-pill');

        if (liveEl) {
            const isPinned = !!this.pinnedRaceId;
            liveEl.textContent = isPinned ? 'PINNED' : 'AUTO';
            liveEl.classList.toggle('pinned', isPinned);
        }

        if (wsEl) {
            const mode = this.useWebSocket ? (this.socketConnected ? 'CONNECTED' : 'DISCONNECTED') : 'OFF';
            wsEl.textContent = `WS: ${mode}`;
            wsEl.classList.toggle('ws-connected', this.socketConnected);
            wsEl.classList.toggle('ws-disconnected', this.useWebSocket && !this.socketConnected);
            wsEl.classList.toggle('ws-off', !this.useWebSocket);
        }

        // NOTE: we intentionally removed the “Updated: … ago” pill for a cleaner broadcast UI
    }

    /**
     * Invalidate DataManager cache metadata for the given types.
     * This is a targeted escape hatch for live dashboards that must reflect changes immediately.
     */
    invalidateDataManagerCache(types) {
        try {
            if (!window.dataManager) return;
            if (!window.dataManager.cacheMetadata) {
                window.dataManager.cacheMetadata = {};
            }
            types.forEach(type => {
                if (!window.dataManager.cacheMetadata[type]) {
                    window.dataManager.cacheMetadata[type] = {};
                }
                window.dataManager.cacheMetadata[type].lastLoaded = 0;
                window.dataManager.cacheMetadata[type].etag = '';
                window.dataManager.cacheMetadata[type].lastModified = '';
            });
        } catch (error) {
            window.debugLogger?.warn('Animator', 'Cache invalidation failed', error);
        }
    }
    
    /**
     * Show access denied message
     */
    showAccessDeniedMessage(message) {
        const eventNameEl = document.getElementById('event-name');
        const timerEl = document.querySelector('.race-timer .t');
        
        if (eventNameEl) eventNameEl.textContent = 'Access Denied';
        if (timerEl) timerEl.textContent = 'Permission Required';
        
        if (this.nextRacesContainer) {
            this.nextRacesContainer.innerHTML = '<div class="empty-state">Access Denied</div>';
        }
        if (this.currentRaceContainer) {
            this.currentRaceContainer.innerHTML = `<div class="empty-state">${message}</div>`;
        }
        if (this.previousRacesContainer) {
            this.previousRacesContainer.innerHTML = '<div class="empty-state">Access Denied</div>';
        }
    }
}

// Initialize when DOM is ready
if (typeof window !== 'undefined') {
    window.AnimatorController = AnimatorController;
}

