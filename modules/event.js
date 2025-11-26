/**
 * EventManager - Backward Compatibility Wrapper
 * 
 * REFACTORED: This class now delegates to the new modular architecture:
 * - EventDataService: CRUD and status management
 * - EventLogic: Pure business logic
 * - EventUI: HTML rendering
 * - EventController: Orchestration
 * 
 * Part of EPC17 Event Management System
 * Maintains backward compatibility with existing code
 */

class EventManager {
    constructor() {
        // Initialize new architecture modules
        this.dataService = null;
        this.logic = null;
        this.ui = null;
        this.controller = null;
        
        // Legacy properties for backward compatibility
        this.currentEventId = null;
        this.trackAssignments = new Map();
        
        // Defer initialization to allow modules to load
        this.initializeModules();
    }

    /**
     * Initialize the modular architecture
     */
    initializeModules() {
        // Wait for dataManager to be available
        if (!window.dataManager) {
            // Only log once to avoid spam
            if (!this._waitingLogged) {
                window.debugLogger?.debug('EventManager', 'Waiting for DataManager...');
                this._waitingLogged = true;
            }
            setTimeout(() => this.initializeModules(), 100);
            return;
        }

        // Initialize modules
        this.dataService = new EventDataService(window.dataManager);
        this.logic = EventLogic;
        this.ui = EventUI;
        this.controller = new EventController(
            this.dataService,
            this.logic,
            this.ui
        );

        window.debugLogger?.init('EventManager', 'EventManager initialized with modular architecture');
        
        // Now perform init
        this.init();
    }

    /**
     * Initialize the event management module
     */
    init() {
        if (!this.controller) {
            console.warn('⚠️ Controller not ready, skipping init');
            return;
        }
        this.controller.init();
    }

    // ============================================================================
    // DELEGATED METHODS - All delegate to controller or dataService
    // ============================================================================

    /**
     * Bind event listeners (delegated to controller)
     */
    bindEvents() {
        if (this.controller) return this.controller.bindEvents();
    }

    /**
     * Load the event management content (delegated to controller)
     */
    async loadEventContent() {
        if (this.controller) return await this.controller.loadEventContent();
    }

    /**
     * Show event creation/edit form (delegated to controller)
     */
    showEventForm(eventId = null) {
        if (this.controller) return this.controller.showEventForm(eventId);
    }

    /**
     * View detailed event information (delegated to controller)
     */
    viewEvent(eventId) {
        if (this.controller) return this.controller.showEventDetails(eventId);
    }

    /**
     * Edit event (delegated to controller)
     */
    editEvent(eventId) {
        if (this.controller) return this.controller.showEventForm(eventId);
    }

    /**
     * Manage event participants (delegated to controller)
     */
    manageParticipants(eventId) {
        if (this.controller) return this.controller.showParticipantManagement(eventId);
    }

    /**
     * Add participant to event (delegated to controller)
     */
    async addParticipant(eventId, participantId) {
        if (this.controller) return await this.controller.handleParticipantAdd(eventId, participantId);
    }

    /**
     * Remove participant from event (delegated to controller)
     */
    async removeParticipant(eventId, participantId) {
        if (this.controller) return await this.controller.handleParticipantRemove(eventId, participantId);
    }

    /**
     * Generate race bracket for event (delegated to controller)
     */
    async generateBracket(eventId) {
        if (this.controller) return await this.controller.handleBracketGeneration(eventId);
    }

    /**
     * View event results (delegated to controller)
     */
    viewResults(eventId) {
        if (this.controller) return this.controller.viewResults(eventId);
    }

    /**
     * Get event summary for dashboard (delegated to controller)
     */
    async getEventSummary() {
        if (this.controller) return await this.controller.getEventSummary();
    }

    /**
     * Switch tabs in participant management (delegated to controller)
     */
    switchTab(tabName) {
        if (this.controller) return this.controller.switchTab(tabName);
    }

    /**
     * Toggle event class enabled/disabled (delegated to controller)
     */
    toggleEventClass(classId, enabled) {
        if (this.controller) return this.controller.toggleEventClass(classId, enabled);
    }

    /**
     * Update class price (delegated to controller)
     */
    updateClassPrice(classId, price) {
        if (this.controller) return this.controller.updateClassPrice(classId, price);
    }

    // ============================================================================
    // HELPER METHODS - Use logic module
    // ============================================================================

    /**
     * Check if registration is open for an event
     */
    isRegistrationOpen(event) {
        if (this.logic) return this.logic.isRegistrationOpen(event);
        return event.registrationOpen && this.getSpotsAvailable(event) > 0;
    }

    /**
     * Get available spots for an event
     */
    getSpotsAvailable(event) {
        if (this.logic) return this.logic.calculateAvailableSpots(event);
        if (!event.maxParticipants) return null;
        return Math.max(0, event.maxParticipants - event.participants.length);
    }

    // ============================================================================
    // DATA ACCESS METHODS - Use dataService
    // ============================================================================

    /**
     * Get event by ID
     */
    getEvent(eventId) {
        if (this.dataService) return this.dataService.getEvent(eventId);
        return window.dataManager ? window.dataManager.getEvent(eventId) : null;
    }

    // ============================================================================
    // STATUS MANAGEMENT - Delegated to dataService
    // ============================================================================

    /**
     * Update event status based on race brackets
     */
    async updateEventStatusFromRaces(eventId) {
        if (this.dataService) {
            return await this.dataService.updateEventStatusFromRaces(eventId);
        }
    }

    /**
     * Delete race bracket for event and update status
     */
    async deleteRaceBracket(eventId) {
        if (this.dataService) {
            return await this.dataService.deleteRaceBracket(eventId);
        }
    }

    // ============================================================================
    // LEGACY METHODS - Preserved for backward compatibility
    // ============================================================================

    /**
     * Generate HTML for event classes (legacy - now in UI module)
     */
    generateEventClassesHtml(classSettings, seriesId) {
        if (this.ui) {
            return this.ui.renderClassSettings(classSettings, seriesId);
        }
        return '';
    }

    /**
     * Bind form interactions (legacy - now in controller)
     */
    bindFormInteractions(eventId = null) {
        if (this.controller) {
            return this.controller.bindFormInteractions(eventId);
        }
    }

    /**
     * Update track visualization (legacy - now in controller)
     */
    updateTrackVisualization() {
        if (this.controller) {
            return this.controller.updateTrackVisualization();
        }
    }

    /**
     * Get event class settings from form (legacy - now in controller)
     */
    getEventClassSettings() {
        if (this.controller) {
            return this.controller.getEventClassSettings();
        }
        return [];
    }

    /**
     * Update event classes list when series changes (legacy - now in controller)
     */
    updateEventClassesList(seriesId) {
        if (this.controller) {
            return this.controller.updateClassSettings(seriesId);
        }
    }

    /**
     * Handle event form submission (legacy - now in controller)
     */
    async handleEventFormSubmit(event, eventId = null) {
        if (this.controller) {
            return await this.controller.handleFormSubmit(event, eventId);
        }
    }

    /**
     * Show empty state (legacy - now in UI module)
     */
    showEmptyState(container) {
        if (this.ui && container) {
            container.innerHTML = this.ui.renderEmptyState();
        }
    }

    /**
     * Show events list (legacy - now uses controller)
     */
    showEventsList(container, events) {
        if (this.ui && container) {
            const statsMap = {};
            events.forEach(event => {
                statsMap[event.id] = {
                    spotsAvailable: this.getSpotsAvailable(event),
                    registrationOpen: this.isRegistrationOpen(event)
                };
            });
            container.innerHTML = this.ui.renderEventsList(events, statsMap);
        }
    }

    /**
     * Generate event card HTML (legacy - now in UI module)
     */
    generateEventCardHtml(event) {
        if (this.ui) {
            const stats = {
                spotsAvailable: this.getSpotsAvailable(event),
                registrationOpen: this.isRegistrationOpen(event)
            };
            return this.ui.renderEventCard(event, stats);
        }
        return '';
    }
}

// Export EventManager class for global use
window.EventManager = EventManager;
