/**
 * EventController - Orchestrates Event Functionality
 * 
 * Responsibilities:
 * - Coordinate between DataService, Logic, and UI
 * - Handle user interactions
 * - Manage form state
 * - Trigger navigation
 * 
 * Part of EPC17 Event Management System
 * Architecture: Controller pattern - delegates to specialized modules
 */

class EventController {
    constructor(dataService, logic, ui) {
        if (!dataService || !logic || !ui) {
            throw new Error('EventController requires dataService, logic, and ui modules');
        }

        this.dataService = dataService;
        this.logic = logic;
        this.ui = ui;
        this.currentEventId = null;
        this.trackAssignments = new Map();
        
        window.debugLogger?.init('EventController', 'EventController initialized');
    }

    // ============================================================================
    // INITIALIZATION
    // ============================================================================

    /**
     * Initialize the controller
     */
    init() {
        this.bindEvents();
        this.loadEventContent();
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        // New event button
        const newEventBtn = document.getElementById('new-event');
        if (newEventBtn) {
            newEventBtn.addEventListener('click', () => this.showEventForm());
        }
    }

    // ============================================================================
    // VIEW MANAGEMENT
    // ============================================================================

    /**
     * Load and display events list
     */
    async loadEventContent() {
        const container = document.getElementById('events-content');
        if (!container) return;

        try {
            const result = await this.dataService.getAllEvents({}, 1, 1000);
            const events = result.events || result;
            
            if (events.length === 0) {
                container.innerHTML = this.ui.renderEmptyState();
            } else {
                // Calculate stats for each event
                const statsMap = {};
                events.forEach(event => {
                    statsMap[event.id] = {
                        spotsAvailable: this.logic.calculateAvailableSpots(event),
                        registrationOpen: this.logic.isRegistrationOpen(event)
                    };
                });
                
                container.innerHTML = this.ui.renderEventsList(events, statsMap);
            }
        } catch (error) {
            console.error('Failed to load events:', error);
            container.innerHTML = this.ui.renderEmptyState();
        }
    }

    /**
     * Show event creation/edit form
     * @param {string|null} eventId - Event ID for editing, null for creating
     */
    showEventForm(eventId = null) {
        const isEdit = eventId !== null;
        const event = isEdit ? this.dataService.getEvent(eventId) : null;
        const series = this.dataService.getEventsArray().length > 0 ? 
            window.dataManager.getAllSeries() : [];
        const title = isEdit ? 'Edit Event' : 'Create New Event';

        const formHtml = this.ui.renderEventForm(event, series, isEdit);
        
        if (window.Helpers && window.Helpers.showModal) {
            window.Helpers.showModal(title, formHtml);
        }

        // Set eventId in form dataset for edit mode
        if (isEdit && eventId) {
            const form = document.getElementById('event-form');
            if (form) {
                form.dataset.eventId = eventId;
                // Also set custom outcomes if they exist
                if (event && Array.isArray(event.customOutcomes)) {
                    form.dataset.customOutcomes = JSON.stringify(event.customOutcomes);
                }
            }
        }

        // Bind form interactions
        this.bindFormInteractions(eventId);
    }

    /**
     * Show event details
     * @param {string} eventId - Event ID
     */
    showEventDetails(eventId) {
        const event = this.dataService.getEvent(eventId);
        if (!event) {
            if (window.Helpers) {
                window.Helpers.showToast('Event not found', 'error');
            }
            return;
        }

        const series = this.dataService.getEventSeries(eventId);
        const participants = this.dataService.getEventParticipants(eventId);
        
        const stats = {
            spotsAvailable: this.logic.calculateAvailableSpots(event),
            registrationOpen: this.logic.isRegistrationOpen(event)
        };

        const detailsHtml = this.ui.renderEventDetails(event, series, participants, stats);
        
        if (window.Helpers && window.Helpers.showModal) {
            window.Helpers.showModal('Event Details', detailsHtml);
        }
    }

    /**
     * Show participant management interface
     * @param {string} eventId - Event ID
     */
    showParticipantManagement(eventId) {
        const event = this.dataService.getEvent(eventId);
        if (!event) {
            if (window.Helpers) {
                window.Helpers.showToast('Event not found', 'error');
            }
            return;
        }

        const allParticipants = window.dataManager.getParticipantsArray();
        const eventParticipants = this.dataService.getEventParticipants(eventId);
        const availableParticipants = allParticipants.filter(p => 
            !event.participants.includes(p.id)
        );

        const manageHtml = this.ui.renderParticipantManagement(
            event,
            eventParticipants,
            availableParticipants
        );

        if (window.Helpers && window.Helpers.showModal) {
            window.Helpers.showModal('Manage Participants', manageHtml);
        }
    }

    // ============================================================================
    // ACTIONS
    // ============================================================================

    /**
     * Handle event creation
     * @param {Object} formData - Form data
     * @returns {Promise<Object>} Created event
     */
    async handleCreateEvent(formData) {
        try {
            // Validate data
            const validation = this.logic.validateEventData(formData);
            if (!validation.valid) {
                throw new Error(validation.errors.join(', '));
            }

            // Validate class settings if series is specified
            if (formData.seriesId) {
                const classValidation = this.dataService.validateEventClassSettings(formData);
                if (!classValidation.valid) {
                    throw new Error(classValidation.errors.join(', '));
                }
            }

            if (window.Helpers) {
                window.Helpers.showLoading();
            }

            const result = await this.dataService.createEvent(formData);
            
            if (window.Helpers) {
                window.Helpers.showToast('Event created successfully!', 'success');
                window.Helpers.hideModal();
            }
            
            this.loadEventContent();
            
            // Update standings if part of series
            if (formData.seriesId && window.seriesManager) {
                window.seriesManager.loadSeriesContent();
            }

            return result;
        } catch (error) {
            console.error('Event creation error:', error);
            if (window.Helpers) {
                window.Helpers.showToast('Error creating event: ' + error.message, 'error');
            }
            throw error;
        } finally {
            if (window.Helpers) {
                window.Helpers.hideLoading();
            }
        }
    }

    /**
     * Handle event update
     * @param {string} eventId - Event ID
     * @param {Object} updates - Updated fields
     * @returns {Promise<Object>} Updated event
     */
    async handleUpdateEvent(eventId, updates) {
        try {
            // Check if event is editable
            if (!this.dataService.canEventBeEdited(eventId)) {
                throw new Error('Cannot edit completed or finished events');
            }

            // Validate data
            const event = this.dataService.getEvent(eventId);
            const mergedData = { ...event, ...updates };
            const validation = this.logic.validateEventData(mergedData);
            if (!validation.valid) {
                throw new Error(validation.errors.join(', '));
            }

            // Validate class settings if series is specified
            if (updates.seriesId || event.seriesId) {
                const classValidation = this.dataService.validateEventClassSettings(mergedData);
                if (!classValidation.valid) {
                    throw new Error(classValidation.errors.join(', '));
                }
            }

            if (window.Helpers) {
                window.Helpers.showLoading();
            }

            const result = await this.dataService.updateEvent(eventId, updates);
            
            if (window.Helpers) {
                window.Helpers.showToast('Event updated successfully!', 'success');
                window.Helpers.hideModal();
            }
            
            this.loadEventContent();
            
            // Update standings if part of series
            if (mergedData.seriesId && window.seriesManager) {
                window.seriesManager.loadSeriesContent();
            }

            return result;
        } catch (error) {
            console.error('Event update error:', error);
            if (window.Helpers) {
                window.Helpers.showToast('Error updating event: ' + error.message, 'error');
            }
            throw error;
        } finally {
            if (window.Helpers) {
                window.Helpers.hideLoading();
            }
        }
    }

    /**
     * Handle event deletion
     * @param {string} eventId - Event ID
     * @returns {Promise<boolean>} Success status
     */
    async handleDeleteEvent(eventId) {
        try {
            const event = this.dataService.getEvent(eventId);
            if (!event) {
                throw new Error('Event not found');
            }

            const confirmed = confirm(`Delete event "${event.name}"? This action cannot be undone.`);
            if (!confirmed) return false;

            if (window.Helpers) {
                window.Helpers.showLoading();
            }

            await this.dataService.deleteEvent(eventId);
            
            if (window.Helpers) {
                window.Helpers.showToast('Event deleted successfully!', 'success');
            }
            
            this.loadEventContent();
            
            return true;
        } catch (error) {
            console.error('Event deletion error:', error);
            if (window.Helpers) {
                window.Helpers.showToast('Error deleting event: ' + error.message, 'error');
            }
            throw error;
        } finally {
            if (window.Helpers) {
                window.Helpers.hideLoading();
            }
        }
    }

    /**
     * Handle participant addition to event
     * @param {string} eventId - Event ID
     * @param {string} participantId - Participant ID
     */
    async handleParticipantAdd(eventId, participantId) {
        try {
            const event = this.dataService.getEvent(eventId);
            const participant = window.dataManager.getParticipant(participantId);
            
            const canAdd = this.logic.canAddParticipant(event, participant);
            if (!canAdd.canAdd) {
                if (window.Helpers) {
                    window.Helpers.showToast(canAdd.reason, 'warning');
                }
                return;
            }

            const success = await this.dataService.addParticipantToEvent(eventId, participantId);
            
            if (success) {
                if (window.Helpers) {
                    window.Helpers.showToast('Participant added successfully!', 'success');
                }
                this.showParticipantManagement(eventId);
                this.loadEventContent();
            }
        } catch (error) {
            console.error('Failed to add participant:', error);
            if (window.Helpers) {
                window.Helpers.showToast('Error adding participant: ' + error.message, 'error');
            }
        }
    }

    /**
     * Handle participant removal from event
     * @param {string} eventId - Event ID
     * @param {string} participantId - Participant ID
     */
    async handleParticipantRemove(eventId, participantId) {
        try {
            const success = await this.dataService.removeParticipantFromEvent(eventId, participantId);
            
            if (success) {
                if (window.Helpers) {
                    window.Helpers.showToast('Participant removed successfully!', 'success');
                }
                this.showParticipantManagement(eventId);
                this.loadEventContent();
            }
        } catch (error) {
            console.error('Failed to remove participant:', error);
            if (window.Helpers) {
                window.Helpers.showToast('Error removing participant: ' + error.message, 'error');
            }
        }
    }

    /**
     * Handle race bracket generation
     * @param {string} eventId - Event ID
     */
    async handleBracketGeneration(eventId) {
        const event = this.dataService.getEvent(eventId);
        if (!event) {
            if (window.Helpers) {
                window.Helpers.showToast('Event not found', 'error');
            }
            return;
        }

        const canGenerate = this.logic.canGenerateRaces(event);
        if (!canGenerate.canGenerate) {
            if (window.Helpers) {
                window.Helpers.showToast(canGenerate.reason, 'warning');
            }
            return;
        }

        try {
            const bracket = window.dataManager.createRaceBracket(eventId);
            
            if (bracket) {
                // Automatically update event status based on race existence
                try {
                    await this.dataService.updateEventStatusFromRaces(eventId);
                    window.debugLogger?.debug('EventController', `Event ${eventId} status updated based on race brackets`);
                } catch (statusError) {
                    console.error('Warning: Failed to update event status:', statusError);
                }
                
                if (window.Helpers) {
                    window.Helpers.showToast('Race bracket generated successfully!', 'success');
                    window.Helpers.hideModal();
                }
                
                // Navigate to races section to view bracket
                if (window.app) {
                    window.app.navigateToSection('races');
                }
            } else {
                if (window.Helpers) {
                    window.Helpers.showToast('Failed to generate bracket', 'error');
                }
            }
        } catch (error) {
            console.error('Bracket generation error:', error);
            if (window.Helpers) {
                window.Helpers.showToast('Error generating bracket: ' + error.message, 'error');
            }
        }
    }

    // ============================================================================
    // FORM INTERACTIONS
    // ============================================================================

    /**
     * Bind form interactions and real-time updates
     * @param {string|null} eventId - Event ID for edit mode
     */
    bindFormInteractions(eventId = null) {
        const form = document.getElementById('event-form');
        if (!form) return;

        // Track visualization updates
        const trackSelect = document.getElementById('numberOfTracks');
        const eliminationSelect = document.getElementById('eliminationType');
        
        const updateTrackVisualization = () => {
            this.updateTrackVisualization();
        };

        if (trackSelect) trackSelect.addEventListener('change', updateTrackVisualization);
        if (eliminationSelect) eliminationSelect.addEventListener('change', updateTrackVisualization);

        // Initial visualization
        updateTrackVisualization();

        // Form submission
        form.addEventListener('submit', (e) => this.handleFormSubmit(e, eventId));

        // Series change handler
        const seriesSelect = document.getElementById('seriesId');
        if (seriesSelect) {
            seriesSelect.addEventListener('change', () => {
                this.handleSeriesChange(seriesSelect.value);
            });
        }
    }

    /**
     * Handle form submission
     * @param {Event} event - Submit event
     * @param {string|null} eventId - Event ID for editing
     */
    async handleFormSubmit(event, eventId = null) {
        event.preventDefault();
        
        const form = event.target;
        const formData = this.getEventFormData(form);
        const isEdit = eventId !== null;

        try {
            if (isEdit) {
                await this.handleUpdateEvent(eventId, formData);
            } else {
                await this.handleCreateEvent(formData);
            }
        } catch (error) {
            console.error('Form submission error:', error);
        }
    }

    /**
     * Handle series selection change
     * @param {string} seriesId - Series ID
     */
    handleSeriesChange(seriesId) {
        this.updateClassSettings(seriesId);
    }

    /**
     * Handle elimination type change
     * @param {string} type - Elimination type
     */
    handleEliminationTypeChange(type) {
        this.updateTrackVisualization();
    }

    /**
     * Update track visualization
     */
    updateTrackVisualization() {
        const tracksContainer = document.getElementById('track-visualization');
        const numberOfTracks = parseInt(document.getElementById('numberOfTracks')?.value || 2);
        const eliminationType = document.getElementById('eliminationType')?.value || 'single';
        
        if (!tracksContainer) return;

        const html = this.ui.renderTrackVisualization(numberOfTracks, eliminationType);
        tracksContainer.innerHTML = html;

        // Handle custom outcomes display
        const customContainer = document.getElementById('custom-outcomes-container');
        const customRowsContainer = document.getElementById('custom-outcomes-rows');
        
        if (eliminationType === 'custom') {
            if (customContainer) customContainer.style.display = 'block';
            
            if (customRowsContainer) {
                const form = document.getElementById('event-form');
                const isEdit = form && form.querySelector('input[name="eventName"]')?.value;
                const isLocked = form && form.querySelector('select[name="eliminationType"]')?.disabled;
                const current = (() => {
                    try {
                        if (isEdit) {
                            const eventId = form?.dataset?.eventId;
                            if (eventId) {
                                const event = this.dataService.getEvent(eventId);
                                if (event && Array.isArray(event.customOutcomes)) {
                                    return event.customOutcomes;
                                }
                            }
                            const raw = form?.dataset?.customOutcomes || '';
                            return raw ? JSON.parse(raw) : [];
                        }
                        return [];
                    } catch { return []; }
                })();
                
                const options = ['win','lose','eliminated'];
                const rows = Array.from({ length: numberOfTracks }, (_, idx) => {
                    const pos = idx + 1;
                    const sel = (current[idx] || (idx === 0 ? 'win' : 'eliminated')).toLowerCase();
                    const opts = options.map(o => `<option value="${o}" ${sel===o?'selected':''}>${o.charAt(0).toUpperCase()+o.slice(1)}</option>`).join('');
                    return `<div class="form-row"><label>Position ${pos}</label><select class="custom-outcome" data-position="${pos}" ${isLocked ? 'disabled' : ''}>${opts}</select></div>`;
                }).join('');
                
                customRowsContainer.innerHTML = rows;
                
                // Persist custom selections back into the form dataset
                if (form) {
                    const selects = customRowsContainer.querySelectorAll('select.custom-outcome');
                    const outcomes = Array.from(selects).map(s => s.value);
                    form.dataset.customOutcomes = JSON.stringify(outcomes);
                    selects.forEach(s => s.addEventListener('change', () => {
                        const newer = Array.from(customRowsContainer.querySelectorAll('select.custom-outcome')).map(x => x.value);
                        form.dataset.customOutcomes = JSON.stringify(newer);
                    }));
                }
            }
        } else {
            if (customContainer) customContainer.style.display = 'none';
        }
    }

    /**
     * Update class settings list when series changes
     * @param {string} seriesId - Series ID
     */
    updateClassSettings(seriesId) {
        const container = document.getElementById('eventClassesList');
        if (container) {
            container.innerHTML = this.ui.renderClassSettings([], seriesId);
        }
    }

    // ============================================================================
    // STATUS MANAGEMENT
    // ============================================================================

    /**
     * Update event status (delegates to DataService)
     * @param {string} eventId - Event ID
     * @param {string} newStatus - New status
     */
    async updateEventStatus(eventId, newStatus) {
        try {
            await this.dataService.updateEventStatus(eventId, newStatus);
            this.loadEventContent();
        } catch (error) {
            console.error('Failed to update status:', error);
            if (window.Helpers) {
                window.Helpers.showToast('Error updating status: ' + error.message, 'error');
            }
        }
    }

    // ============================================================================
    // UTILITIES
    // ============================================================================

    /**
     * Extract form data into event object
     * @param {HTMLFormElement} form - Form element
     * @returns {Object} Event data
     */
    getEventFormData(form) {
        const formData = new FormData(form);
        const currentEvent = form.dataset.eventId ? this.dataService.getEvent(form.dataset.eventId) : null;
        const isCompleted = currentEvent && (currentEvent.status === 'completed' || currentEvent.status === 'finished');
        
        const eventData = {
            name: formData.get('eventName'),
            location: formData.get('location'),
            date: formData.get('eventDate'),
            seriesId: formData.get('seriesId') || null,
            seasonId: formData.get('seasonId') || null,
            driverMeetingTime: formData.get('driverMeetingTime') || '08:00',
            maxParticipants: parseInt(formData.get('maxParticipants')),
            classSettings: this.getEventClassSettings(),
            registrationOpen: formData.get('registrationOpen') === 'on',
            description: formData.get('eventDescription') || '',
            trackSurface: formData.get('trackSurface') || 'snow',
            requiresClassSeparation: formData.get('requiresClassSeparation') === 'on'
        };

        // Only update tournament settings if event is not completed
        if (!isCompleted) {
            eventData.numberOfTracks = parseInt(formData.get('numberOfTracks'));
            eventData.eliminationType = formData.get('eliminationType');
            eventData.customOutcomes = (() => {
                try {
                    return JSON.parse(form.dataset.customOutcomes || '[]');
                } catch { return []; }
            })();
            eventData.customLossLimit = (() => {
                const input = document.getElementById('customLossLimit');
                return parseInt(input?.value || '2', 10);
            })();
            eventData.customUseBrackets = (() => {
                const select = document.getElementById('customUseBrackets');
                return (select?.value || 'false') === 'true';
            })();
            eventData.customFinalType = (() => {
                const select = document.getElementById('customFinalType');
                return select?.value || 'unique';
            })();
            eventData.freeRunEnabled = formData.get('freeRunEnabled') === 'on';
            
            // Tie-breaker settings
            eventData.tieBreakerEnabled = formData.get('tieBreakerEnabled') === 'on';
            eventData.tieBreakerRank = (() => {
                const input = document.getElementById('tieBreakerRank');
                return parseInt(input?.value || '3', 10);
            })();
        }

        return eventData;
    }

    /**
     * Get event class settings from form
     * @returns {Array} Array of class settings
     */
    getEventClassSettings() {
        const classSettings = [];
        const classElements = document.querySelectorAll('.event-class-setting');
        
        classElements.forEach(element => {
            const classId = element.dataset.classId;
            const checkbox = element.querySelector('input[type="checkbox"]');
            const priceInput = element.querySelector('input[type="number"]');
            
            if (checkbox && priceInput) {
                classSettings.push({
                    classId: classId,
                    enabled: checkbox.checked,
                    price: parseFloat(priceInput.value) || 0
                });
            }
        });
        
        return classSettings;
    }

    /**
     * Validate form data
     * @param {Object} formData - Form data
     * @returns {Object} Validation result
     */
    validateFormData(formData) {
        return this.logic.validateEventData(formData);
    }

    /**
     * Show validation errors
     * @param {Array} errors - Array of error messages
     */
    showErrors(errors) {
        const errorsContainer = document.getElementById('event-form-errors');
        if (!errorsContainer) return;

        if (errors.length === 0) {
            errorsContainer.style.display = 'none';
            return;
        }

        errorsContainer.innerHTML = `
            <div class="error-messages">
                <h4>Please fix the following errors:</h4>
                <ul>
                    ${errors.map(error => `<li>${error}</li>`).join('')}
                </ul>
            </div>
        `;
        errorsContainer.style.display = 'block';
    }

    // ============================================================================
    // TAB MANAGEMENT (for participant management)
    // ============================================================================

    /**
     * Switch tabs in participant management
     * @param {string} tabName - Tab name ('registered' or 'available')
     */
    switchTab(tabName) {
        const tabs = document.querySelectorAll('.tab-btn');
        const contents = document.querySelectorAll('.tab-content');
        
        tabs.forEach(tab => tab.classList.remove('active'));
        contents.forEach(content => content.classList.remove('active'));
        
        const targetTab = document.querySelector(`button[onclick="eventManager.switchTab('${tabName}')"]`);
        if (targetTab) targetTab.classList.add('active');
        
        const targetContent = document.getElementById(`${tabName}-tab`);
        if (targetContent) targetContent.classList.add('active');
    }

    // ============================================================================
    // CLASS TOGGLE (for form)
    // ============================================================================

    /**
     * Toggle event class enabled/disabled
     * @param {string} classId - Class ID
     * @param {boolean} enabled - Enabled status
     */
    toggleEventClass(classId, enabled) {
        const container = document.querySelector(`[data-class-id="${classId}"]`);
        if (!container) return;
        
        const priceInput = container.querySelector('input[type="number"]');
        if (priceInput) {
            priceInput.disabled = !enabled;
        }
        
        container.style.opacity = enabled ? '1' : '0.6';
    }

    /**
     * Update class price (placeholder for real-time updates)
     * @param {string} classId - Class ID
     * @param {number} price - New price
     */
    updateClassPrice(classId, price) {
        window.debugLogger?.debug('EventController', `Class ${classId} price updated to $${price}`);
    }

    // ============================================================================
    // BACKWARD COMPATIBILITY HELPERS
    // ============================================================================

    /**
     * Get spots available (backward compatibility)
     * @param {Object} event - Event object
     * @returns {number|null} Available spots
     */
    getSpotsAvailable(event) {
        return this.logic.calculateAvailableSpots(event);
    }

    /**
     * Check if registration is open (backward compatibility)
     * @param {Object} event - Event object
     * @returns {boolean} True if registration is open
     */
    isRegistrationOpen(event) {
        return this.logic.isRegistrationOpen(event);
    }

    /**
     * View event results (placeholder)
     * @param {string} eventId - Event ID
     */
    viewResults(eventId) {
        if (window.Helpers) {
            window.Helpers.showToast('Event results will be available in Phase 4', 'info');
        }
    }

    /**
     * Get event summary for dashboard
     * @returns {Promise<Object>} Summary statistics
     */
    async getEventSummary() {
        return await this.dataService.getEventSummary();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventController;
}

// Make available globally
if (typeof window !== 'undefined') {
    window.EventController = EventController;
}

