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
        this.FALLBACK_POLL_INTERVAL = 30000; // 30 seconds
        
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
        this.raceBrackets = {};
        this.lastRaceTime = null;
        
        // Race queues
        this.currentRace = null;
        this.nextRaces = [];
        this.previousRaces = [];
        
        // Timers
        this.timerInterval = null;
        this.fallbackPollInterval = null;
        
        // Flags
        this.isShowingResults = false;
        this.lastCompletedRaceId = null;
        
        // DOM references
        this.nextRacesContainer = null;
        this.currentRaceContainer = null;
        this.previousRacesContainer = null;
        
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
        
        // Get DOM references
        this.nextRacesContainer = document.getElementById('next-races');
        this.currentRaceContainer = document.getElementById('cardsHost');
        this.previousRacesContainer = document.getElementById('prev-races');
        
        // Load initial data
        await this.loadData();
        
        // Setup WebSocket connection
        this.setupWebSocket();
        
        // Setup EventBus fallback
        this.setupEventBusListeners();
        
        // Setup keyboard controls
        this.setupKeyboardControls();
        
        // Start timer
        this.startTimer();
        
        // Render initial state
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
     * Wait for authentication
     */
    async waitForAuth() {
        let attempts = 0;
        while (!window.Auth && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 50));
            attempts++;
        }
        
        if (!window.Auth) {
            console.error('🔐 Auth system not available');
            return false;
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
        
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
     * Setup WebSocket connection
     */
    setupWebSocket() {
        if (!this.useWebSocket) return;
        
        try {
            // Socket.IO client should be loaded from Flask-SocketIO
            if (typeof io === 'undefined') {
                console.warn('⚠️ Socket.IO not available, using fallback');
                this.useWebSocket = false;
                this.startFallbackPolling();
                return;
            }
            
            window.debugLogger?.debug('Animator', 'Connecting to WebSocket...');
            this.socket = io();
            
            this.socket.on('connect', () => {
                window.debugLogger?.debug('Animator', 'WebSocket connected');
                this.socketConnected = true;
                this.reconnectAttempts = 0;
                
                // Stop fallback polling if it's running
                if (this.fallbackPollInterval) {
                    clearInterval(this.fallbackPollInterval);
                    this.fallbackPollInterval = null;
                }
            });
            
            this.socket.on('disconnect', () => {
                window.debugLogger?.debug('Animator', 'WebSocket disconnected');
                this.socketConnected = false;
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
     * Load data from API
     */
    async loadData(isRefresh = false) {
        try {
            if (!window.dataManager) {
                throw new Error('DataManager not available');
            }
            
            const [eventsData, participantsData, bracketsData] = await Promise.all([
                window.dataManager.getEvents({}, 1, 1000),
                window.dataManager.getParticipants({}, 1, 2000),
                window.dataManager.getRaceBrackets()
            ]);
            
            const events = Array.isArray(eventsData?.events) ? eventsData.events : 
                          (Array.isArray(eventsData) ? eventsData : []);
            this.participants = Array.isArray(participantsData?.participants) ? participantsData.participants :
                               (Array.isArray(participantsData) ? participantsData : []);
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
            
            // Infer last race time
            this.lastRaceTime = window.AnimatorUtils.inferLastRaceTime(this.races) || 
                               this.lastRaceTime || Date.now();
            
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
        
        // Sort by race number or creation time
        const sorted = [...eventRaces].sort((a, b) => {
            if (a.raceNumber && b.raceNumber) {
                return a.raceNumber - b.raceNumber;
            }
            return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        });
        
        // Upcoming races
        const upcoming = sorted.filter(r =>
            r.status === 'scheduled' ||
            r.status === 'in_progress' ||
            r.status === 'pending' ||
            r.status === 'upcoming' ||
            (!r.status && !r.results)
        );
        
        // Completed races
        const completed = sorted.filter(r =>
            r.status === 'completed' ||
            r.results ||
            r.completedAt ||
            r.isComplete
        ).sort((a, b) => {
            if (a.raceNumber && b.raceNumber) {
                return b.raceNumber - a.raceNumber;
            }
            return new Date(b.completedAt || b.updatedAt || b.createdAt || 0) -
                   new Date(a.completedAt || a.updatedAt || a.createdAt || 0);
        });
        
        this.currentRace = upcoming[0] || null;
        this.nextRaces = upcoming.slice(1, 4);
        this.previousRaces = completed.slice(0, 3);
        
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
        window.AnimatorRenderer.renderNextRacesList(this.nextRaces, this.nextRacesContainer);
        window.AnimatorRenderer.renderCurrentRace(
            this.currentRace,
            this.races,
            this.currentEvent?.id,
            this.currentRaceContainer
        );
        window.AnimatorRenderer.renderPreviousRacesList(this.previousRaces, this.previousRacesContainer);
        
        // Update header
        const timeSinceLastRace = Date.now() - (this.lastRaceTime || Date.now());
        const racesRemaining = this.currentRace ? 
            window.AnimatorUtils.countRemainingRacesInClass(this.races, this.currentRace.className) : 0;
        
        window.AnimatorRenderer.updateHeader(this.currentEvent, timeSinceLastRace, racesRemaining);
    }
    
    /**
     * Handle race completed event
     */
    async handleRaceCompleted(data) {
        window.debugLogger?.debug('Animator', 'Handling race completion');
        
        // Update last race time
        if (data.race?.endTime) {
            this.lastRaceTime = new Date(data.race.endTime).getTime();
        } else {
            this.lastRaceTime = Date.now();
        }
        
        // Reload data
        await this.loadData(true);
        
        // Check if this is a new completion
        const completedRace = this.findNewlyCompletedRace();
        if (completedRace && !this.isShowingResults) {
            await this.showCompletionSequence(completedRace);
        } else {
            this.renderAll();
        }
    }
    
    /**
     * Handle race started event
     */
    async handleRaceStarted(data) {
        window.debugLogger?.debug('Animator', 'Handling race start');
        await this.refreshDataAndRender();
    }
    
    /**
     * Handle bracket updated event
     */
    async handleBracketUpdated(data) {
        window.debugLogger?.debug('Animator', 'Handling bracket update');
        await this.refreshDataAndRender();
    }
    
    /**
     * Handle event status changed
     */
    async handleEventStatusChanged(data) {
        window.debugLogger?.debug('Animator', 'Handling event status change');
        await this.refreshDataAndRender();
    }
    
    /**
     * Refresh data and render
     */
    async refreshDataAndRender() {
        await this.loadData(true);
        this.renderAll();
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
        
        // Step 1: Show "RACE COMPLETE" overlay (2s)
        await new Promise(resolve => {
            window.AnimatorRenderer.showRaceCompleteOverlay(
                race,
                this.currentRaceContainer,
                this.COMPLETE_OVERLAY_DURATION,
                resolve
            );
        });
        
        // Step 2: Show race results (6s)
        await new Promise(resolve => {
            window.AnimatorRenderer.showRaceResults(
                race,
                this.currentRaceContainer,
                this.RESULT_DISPLAY_DURATION,
                resolve
            );
        });
        
        // Step 3: Transition to next race
        this.isShowingResults = false;
        this.renderAll();
    }
    
    /**
     * Skip to next race (keyboard shortcut)
     */
    skipToNextRace() {
        window.debugLogger?.debug('Animator', 'Skipping to next race');
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
    }
    
    /**
     * Update timer display
     */
    updateTimer() {
        const timeSinceLastRace = Date.now() - (this.lastRaceTime || Date.now());
        const timerEl = document.querySelector('.race-timer .t');
        
        if (timerEl) {
            timerEl.textContent = window.AnimatorUtils.formatDuration(timeSinceLastRace);
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

