/**
 * Event Management Module for Snowmobile Drag Racing Event Manager
 * Handles event creation, configuration, track management, and participant registration
 */

class EventManager {
    constructor() {
        this.currentEventId = null;
        this.trackAssignments = new Map();
        this.init();
    }

    /**
     * Initialize the event management module
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

    /**
     * Load the event management content
     */
    async loadEventContent() {
        const container = document.getElementById('events-content');
        if (!container) return;

        try {
            const result = await dataManager.getEvents();
            const events = result.events || result; // Handle both paginated and direct array responses
            
            if (events.length === 0) {
                this.showEmptyState(container);
            } else {
                this.showEventsList(container, events);
            }
        } catch (error) {
            console.error('Failed to load events:', error);
            this.showEmptyState(container);
        }
    }

    /**
     * Show empty state when no events exist
     */
    showEmptyState(container) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🏁</div>
                <h3>No Events Created</h3>
                <p>Create your first racing event to get started. Events can be part of a series or standalone competitions.</p>
                <button class="btn btn-primary" onclick="eventManager.showEventForm()">
                    Create First Event
                </button>
            </div>
        `;
    }

    /**
     * Show list of existing events
     */
    showEventsList(container, events) {
        const eventsHtml = `
            <div class="events-section">
                <h4 class="events-section-title">🏁 All Events</h4>
                <div class="events-grid">
                    ${events.map(e => this.generateEventCardHtml(e)).join('')}
                </div>
            </div>
        `;
        
        container.innerHTML = eventsHtml;
    }

    /**
     * Generate HTML for an event card
     */
    generateEventCardHtml(event) {
        const series = event.seriesId ? dataManager.getSeries(event.seriesId) : null;
        const spotsAvailable = this.getSpotsAvailable(event);
        
        return `
            <div class="event-card" data-event-id="${event.id}">
                <div class="event-header">
                    <h3 class="event-name">${Helpers.sanitizeHtml(event.name)}</h3>
                    <div class="event-status-badges">
                        ${event.registrationOpen ? 
                            '<span class="registration-status open">Open</span>' : 
                            '<span class="registration-status closed">Closed</span>'
                        }
                    </div>
                </div>
                
                ${series ? `
                    <div class="series-info">
                        <span class="series-badge">${Helpers.sanitizeHtml(series.name)}</span>
                    </div>
                ` : ''}
                
                <div class="event-details">
                    <div class="detail-row">
                        <span class="detail-icon">📍</span>
                        <span class="detail-text">${Helpers.sanitizeHtml(event.location)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-icon">🏁</span>
                        <span class="detail-text">${event.numberOfTracks} Track${event.numberOfTracks > 1 ? 's' : ''}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-icon">🎯</span>
                        <span class="detail-text">${Helpers.capitalize(event.eliminationType)} Elimination</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-icon">👥</span>
                        <span class="detail-text">${event.participants.length}/${event.maxParticipants || '∞'} Participants</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-icon">💰</span>
                        <span class="detail-text">${Helpers.formatCurrency(event.entryFee || 0)} Entry Fee</span>
                    </div>
                </div>
                
                ${spotsAvailable !== null && spotsAvailable <= 5 && spotsAvailable > 0 ? `
                    <div class="spots-warning">
                        ⚠️ Only ${spotsAvailable} spot${spotsAvailable > 1 ? 's' : ''} remaining!
                    </div>
                ` : ''}
                
                <div class="event-actions">
                    <button class="btn btn-primary" onclick="eventManager.viewEvent('${event.id}')">
                        View Details
                    </button>
                    <button class="btn btn-success" onclick="eventManager.manageParticipants('${event.id}')">
                        Manage Participants
                    </button>
                    <button class="btn btn-secondary" onclick="eventManager.editEvent('${event.id}')">
                        Edit
                    </button>
                    <button class="btn btn-secondary" onclick="eventManager.viewResults('${event.id}')">
                        Results
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Check if registration is open for an event
     */
    isRegistrationOpen(event) {
        return event.registrationOpen && this.getSpotsAvailable(event) > 0;
    }

    /**
     * Get available spots for an event
     */
    getSpotsAvailable(event) {
        if (!event.maxParticipants) return null;
        return Math.max(0, event.maxParticipants - event.participants.length);
    }

    /**
     * Show event creation/edit form
     */
    showEventForm(eventId = null) {
        const isEdit = eventId !== null;
        const event = isEdit ? dataManager.getEvent(eventId) : null;
        const series = dataManager.getAllSeries();
        const title = isEdit ? 'Edit Event' : 'Create New Event';

        const formHtml = `
            <form id="event-form" class="event-form">
                <div class="form-section">
                    <h4>Basic Information</h4>
                    
                    <div class="form-group">
                        <label for="eventName">Event Name *</label>
                        <input type="text" name="eventName" id="eventName" required 
                               placeholder="e.g., Winter Championship Race"
                               value="${isEdit ? Helpers.sanitizeHtml(event.name) : ''}">
                    </div>

                    <div class="form-group">
                        <label for="location">Location *</label>
                        <input type="text" name="location" id="location" required 
                               placeholder="e.g., Frozen Lake Speedway"
                               value="${isEdit ? Helpers.sanitizeHtml(event.location) : ''}">
                    </div>

                    <div class="form-group">
                        <label for="seriesId">Series (Optional)</label>
                        <select name="seriesId" id="seriesId">
                            <option value="">Standalone Event</option>
                            ${series.map(s => `
                                <option value="${s.id}" ${isEdit && event.seriesId === s.id ? 'selected' : ''}>
                                    ${Helpers.sanitizeHtml(s.name)}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>

                <div class="form-section">
                    <h4>Race Configuration</h4>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="numberOfTracks">Participants per Race (Lanes) *</label>
                            <select name="numberOfTracks" id="numberOfTracks" required>
                                ${[2,3,4,5,6,7,8,9,10].map(num => `
                                    <option value="${num}" ${isEdit && event.numberOfTracks === num ? 'selected' : ''}>
                                        ${num} participants per race
                                    </option>
                                `).join('')}
                            </select>
                            <small>Number of participants racing at the same time. 1st place wins, all others lose.</small>
                        </div>
                        
                        <div class="form-group">
                            <label for="eliminationType">Elimination Type *</label>
                            <select name="eliminationType" id="eliminationType" required>
                                <option value="single" ${isEdit && event.eliminationType === 'single' ? 'selected' : ''}>
                                    Single Elimination
                                </option>
                                <option value="double" ${isEdit && event.eliminationType === 'double' ? 'selected' : ''}>
                                    Double Elimination
                                </option>
                            </select>
                        </div>
                    </div>

                    <div class="track-preview" id="track-preview">
                        <h5>Race Format Preview</h5>
                        <div id="track-visualization"></div>
                    </div>
                </div>

                <div class="form-section">
                    <h4>Class Pricing & Registration</h4>
                    <div class="class-pricing-section">
                        <div id="eventClassesList">
                            ${this.generateEventClassesHtml(isEdit ? event.classSettings || [] : [], isEdit ? event.seriesId : null)}
                        </div>
                    </div>

                    <div class="form-group">
                        <div class="form-checkbox">
                            <input type="checkbox" name="registrationOpen" id="registrationOpen" 
                                   ${isEdit && event.registrationOpen ? 'checked' : (!isEdit ? 'checked' : '')}>
                            <label for="registrationOpen">Registration Open</label>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="eventDescription">Event Description</label>
                        <textarea name="eventDescription" id="eventDescription" rows="3" 
                                  placeholder="Optional event description, rules, or special instructions...">${isEdit ? Helpers.sanitizeHtml(event.description || '') : ''}</textarea>
                    </div>
                </div>

                <div class="form-section">
                    <h4>Advanced Settings</h4>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="trackSurface">Track Surface</label>
                            <select name="trackSurface" id="trackSurface">
                                <option value="snow" ${isEdit && event.trackSurface === 'snow' ? 'selected' : ''}>Snow</option>
                                <option value="ice" ${isEdit && event.trackSurface === 'ice' ? 'selected' : ''}>Ice</option>
                                <option value="mixed" ${isEdit && event.trackSurface === 'mixed' ? 'selected' : ''}>Mixed</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-group">
                        <div class="form-checkbox">
                            <input type="checkbox" name="requiresClassSeparation" id="requiresClassSeparation" 
                                   ${isEdit && event.requiresClassSeparation ? 'checked' : 'checked'}>
                            <label for="requiresClassSeparation">Separate classes in bracket (recommended)</label>
                        </div>
                    </div>

                    <div class="form-group">
                        <div class="form-checkbox">
                            <input type="checkbox" name="freeRunEnabled" id="freeRunEnabled" 
                                   ${isEdit && event.freeRunEnabled ? 'checked' : ''}>
                            <label for="freeRunEnabled">Enable Free Run races</label>
                        </div>
                        <small class="form-help">Free Run ON: Fill all lanes, allow solo races. Free Run OFF: Balance last 2 races so nobody races alone.<br/>
                        Example with 5 drivers + 3 lanes: ON = [3,2], OFF = [3,2]. With 7 drivers + 4 lanes: ON = [4,3], OFF = [4,3]. With 9 drivers + 4 lanes: ON = [4,4,1], OFF = [4,3,2].</small>
                    </div>
                </div>

                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">
                        ${isEdit ? 'Update Event' : 'Create Event'}
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="Helpers.hideModal()">
                        Cancel
                    </button>
                </div>

                <div id="event-form-errors" style="display: none;"></div>
            </form>
        `;

        Helpers.showModal(title, formHtml);

        // Bind form interactions
        this.bindFormInteractions(eventId);
    }

    /**
     * Bind form interactions and real-time updates
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
        form.addEventListener('submit', (e) => this.handleEventFormSubmit(e, eventId));

        // Series change handler
        const seriesSelect = document.getElementById('seriesId');
        if (seriesSelect) {
            seriesSelect.addEventListener('change', () => {
                this.updateEventClassesList(seriesSelect.value);
            });
        }
    }

    /**
     * Update track visualization based on current settings
     */
    updateTrackVisualization() {
        const tracksContainer = document.getElementById('track-visualization');
        const numberOfTracks = parseInt(document.getElementById('numberOfTracks')?.value || 1);
        const eliminationType = document.getElementById('eliminationType')?.value || 'single';
        
        if (!tracksContainer) return;

        const lanesHtml = Array.from({ length: numberOfTracks }, (_, i) => `
            <div class="participant-lane">
                <div class="lane-number">${i + 1}</div>
                <div class="lane-label">Participant ${i + 1}</div>
            </div>
        `).join('');

        tracksContainer.innerHTML = `
            <div class="race-format-display">
                <div class="participants-per-race">
                    <h6>Race Format</h6>
                    <div class="lanes-grid">
                        ${lanesHtml}
                    </div>
                </div>
                <div class="race-result">
                    <div class="winner-indicator">🏆 1st Place = Winner</div>
                    <div class="loser-indicator">❌ 2nd-${numberOfTracks}th Place = Eliminated</div>
                </div>
            </div>
            <div class="layout-info">
                <strong>Format:</strong> ${numberOfTracks} participants per race, ${eliminationType} elimination tournament
            </div>
        `;
    }

    /**
     * Handle event form submission
     */
    async handleEventFormSubmit(event, eventId = null) {
        event.preventDefault();
        
        const form = event.target;
        const formData = new FormData(form);
        const isEdit = eventId !== null;

        try {
            Helpers.showLoading();

            // Get class settings from form
            const classSettings = this.getEventClassSettings();

            const eventData = {
                name: formData.get('eventName'),
                location: formData.get('location'),
                seriesId: formData.get('seriesId') || null,
                seasonId: formData.get('seasonId') || null, // Add season support
                numberOfTracks: parseInt(formData.get('numberOfTracks')),
                eliminationType: formData.get('eliminationType'),
                classSettings: classSettings,
                registrationOpen: formData.get('registrationOpen') === 'on',
                description: formData.get('eventDescription') || '',
                trackSurface: formData.get('trackSurface') || 'snow',
                requiresClassSeparation: formData.get('requiresClassSeparation') === 'on',
                freeRunEnabled: formData.get('freeRunEnabled') === 'on'
            };

            let result;
            if (isEdit) {
                result = dataManager.updateEvent(eventId, eventData);
                Helpers.showToast('Event updated successfully!', 'success');
            } else {
                result = dataManager.addEvent(eventData);
                Helpers.showToast('Event created successfully!', 'success');
            }

            if (result) {
                Helpers.hideModal();
                this.loadEventContent();
                
                // Update standings if part of series
                if (eventData.seriesId && window.seriesManager) {
                    window.seriesManager.loadSeriesContent();
                }
            } else {
                Helpers.showToast('Failed to save event', 'error');
            }

        } catch (error) {
            console.error('Event form error:', error);
            Helpers.showToast('An error occurred while saving the event', 'error');
        } finally {
            Helpers.hideLoading();
        }
    }

    /**
     * View detailed event information
     */
    viewEvent(eventId) {
        const event = dataManager.getEvent(eventId);
        if (!event) {
            Helpers.showToast('Event not found', 'error');
            return;
        }

        const series = event.seriesId ? dataManager.getSeries(event.seriesId) : null;
        const participants = event.participants.map(id => dataManager.getParticipant(id)).filter(p => p);
        const registrationOpen = this.isRegistrationOpen(event);
        const spotsAvailable = this.getSpotsAvailable(event);

        const participantsHtml = participants.length > 0 ? 
            participants.map(p => {
                // Handle both old single class and new multiple classes format
                let classDisplay = 'Unknown';
                if (p.sledClasses && Array.isArray(p.sledClasses) && p.sledClasses.length > 0) {
                    classDisplay = p.sledClasses[0].toUpperCase();
                } else if (p.sledClass) {
                    classDisplay = p.sledClass.toUpperCase();
                }
                
                return `
                    <div class="participant-item-mini">
                        <span class="participant-name">${Helpers.sanitizeHtml(p.name)}</span>
                        <span class="participant-class">${classDisplay}</span>
                    </div>
                `;
            }).join('') : '<p><em>No participants registered yet.</em></p>';

        const detailsHtml = `
            <div class="event-details-modal">
                <div class="event-info">
                    <h4>${Helpers.sanitizeHtml(event.name)}</h4>
                    
                    ${series ? `
                        <div class="series-badge-large">
                            Part of ${Helpers.sanitizeHtml(series.name)}
                        </div>
                    ` : ''}
                    
                    <div class="info-grid">
                        <div class="info-item">
                            <strong>Date & Time:</strong>
                            ${Helpers.formatDate(event.date)}
                        </div>
                        <div class="info-item">
                            <strong>Location:</strong>
                            ${Helpers.sanitizeHtml(event.location)}
                        </div>
                        <div class="info-item">
                            <strong>Tracks:</strong>
                            ${event.numberOfTracks} parallel track${event.numberOfTracks > 1 ? 's' : ''}
                        </div>
                        <div class="info-item">
                            <strong>Elimination:</strong>
                            ${Helpers.capitalize(event.eliminationType)} elimination
                        </div>
                        <div class="info-item">
                            <strong>Entry Fee:</strong>
                            ${Helpers.formatCurrency(event.entryFee || 0)}
                        </div>
                        <div class="info-item">
                            <strong>Capacity:</strong>
                            ${event.participants.length}/${event.maxParticipants || '∞'} participants
                        </div>
                        ${event.driverMeetingTime ? `
                            <div class="info-item">
                                <strong>Driver Meeting:</strong>
                                ${event.driverMeetingTime}
                            </div>
                        ` : ''}
                        <div class="info-item">
                            <strong>Registration:</strong>
                            <span class="registration-status ${registrationOpen ? 'open' : 'closed'}">
                                ${registrationOpen ? 'Open' : 'Closed'}
                            </span>
                        </div>
                    </div>
                    
                    ${event.description ? `
                        <div class="description">
                            <strong>Description:</strong>
                            <p>${Helpers.sanitizeHtml(event.description)}</p>
                        </div>
                    ` : ''}
                </div>

                <div class="section-divider"></div>

                <div class="participants-section">
                    <h5>Participants (${participants.length})</h5>
                    <div class="participants-list">
                        ${participantsHtml}
                    </div>
                    ${registrationOpen ? `
                        <button class="btn btn-primary" onclick="eventManager.manageParticipants('${eventId}'); Helpers.hideModal();">
                            Manage Participants
                        </button>
                    ` : ''}
                </div>

                <div class="modal-actions">
                    <button class="btn btn-primary" onclick="eventManager.editEvent('${eventId}'); Helpers.hideModal();">
                        Edit Event
                    </button>
                    ${registrationOpen ? `
                        <button class="btn btn-success" onclick="eventManager.registerParticipant('${eventId}'); Helpers.hideModal();">
                            Register Participant
                        </button>
                    ` : ''}
                    <button class="btn btn-secondary" onclick="Helpers.hideModal()">
                        Close
                    </button>
                </div>
            </div>
        `;

        Helpers.showModal('Event Details', detailsHtml);
    }

    /**
     * Edit event
     */
    editEvent(eventId) {
        this.showEventForm(eventId);
    }

    /**
     * Manage event participants
     */
    manageParticipants(eventId) {
        const event = dataManager.getEvent(eventId);
        if (!event) {
            Helpers.showToast('Event not found', 'error');
            return;
        }

        const allParticipants = dataManager.getParticipantsArray();
        const eventParticipants = event.participants.map(id => dataManager.getParticipant(id)).filter(p => p);
        const availableParticipants = allParticipants.filter(p => !event.participants.includes(p.id));
        const spotsAvailable = this.getSpotsAvailable(event);
        const canAddMore = spotsAvailable === null || spotsAvailable > 0;

        const eventParticipantsHtml = eventParticipants.length > 0 ? 
            eventParticipants.map(p => {
                // Handle both old single class and new multiple classes format
                let classDisplay = 'Unknown';
                if (p.sledClasses && Array.isArray(p.sledClasses) && p.sledClasses.length > 0) {
                    classDisplay = p.sledClasses[0].toUpperCase();
                } else if (p.sledClass) {
                    classDisplay = p.sledClass.toUpperCase();
                }
                
                return `
                    <div class="participant-manage-item">
                        <div class="participant-info">
                            <strong>${Helpers.sanitizeHtml(p.name)}</strong>
                            <span class="participant-class">${classDisplay}</span>
                            <span class="participant-team">${p.team || 'No Team'}</span>
                        </div>
                        <button class="btn btn-danger btn-small" onclick="eventManager.removeParticipant('${eventId}', '${p.id}')">
                            Remove
                        </button>
                    </div>
                `;
            }).join('') : '<p><em>No participants registered yet.</em></p>';

        const availableParticipantsHtml = canAddMore && availableParticipants.length > 0 ? 
            availableParticipants.map(p => {
                // Handle both old single class and new multiple classes format
                let classDisplay = 'Unknown';
                if (p.sledClasses && Array.isArray(p.sledClasses) && p.sledClasses.length > 0) {
                    classDisplay = p.sledClasses[0].toUpperCase();
                } else if (p.sledClass) {
                    classDisplay = p.sledClass.toUpperCase();
                }
                
                return `
                    <div class="participant-manage-item">
                        <div class="participant-info">
                            <strong>${Helpers.sanitizeHtml(p.name)}</strong>
                            <span class="participant-class">${classDisplay}</span>
                            <span class="participant-team">${p.team || 'No Team'}</span>
                        </div>
                        <button class="btn btn-success btn-small" onclick="eventManager.addParticipant('${eventId}', '${p.id}')">
                            Add
                        </button>
                    </div>
                `;
            }).join('') : 
            (canAddMore ? '<p><em>All registered participants are already in this event.</em></p>' : 
             '<p><em>Event is at maximum capacity.</em></p>');

        const manageHtml = `
            <div class="participants-manage-modal">
                <div class="capacity-status">
                    <h4>Event Capacity: ${event.participants.length}/${event.maxParticipants || '∞'}</h4>
                    ${spotsAvailable !== null ? `
                        <p class="capacity-info ${spotsAvailable <= 5 ? 'warning' : ''}">
                            ${spotsAvailable} spot${spotsAvailable !== 1 ? 's' : ''} remaining
                        </p>
                    ` : ''}
                </div>

                <div class="participants-tabs">
                    <div class="tab-header">
                        <button class="tab-btn active" onclick="eventManager.switchTab('registered')">
                            Registered (${eventParticipants.length})
                        </button>
                        <button class="tab-btn" onclick="eventManager.switchTab('available')">
                            Available (${availableParticipants.length})
                        </button>
                    </div>

                    <div class="tab-content active" id="registered-tab">
                        <h5>Registered Participants</h5>
                        <div class="participants-manage-list">
                            ${eventParticipantsHtml}
                        </div>
                    </div>

                    <div class="tab-content" id="available-tab">
                        <h5>Available Participants</h5>
                        <div class="participants-manage-list">
                            ${availableParticipantsHtml}
                        </div>
                    </div>
                </div>

                <div class="modal-actions">
                    <button class="btn btn-primary" onclick="eventManager.generateBracket('${eventId}')">
                        Generate Race Bracket
                    </button>
                    <button class="btn btn-secondary" onclick="Helpers.hideModal()">
                        Done
                    </button>
                </div>
            </div>
        `;

        Helpers.showModal('Manage Participants', manageHtml);
    }

    /**
     * Switch tabs in participant management
     */
    switchTab(tabName) {
        const tabs = document.querySelectorAll('.tab-btn');
        const contents = document.querySelectorAll('.tab-content');
        
        tabs.forEach(tab => tab.classList.remove('active'));
        contents.forEach(content => content.classList.remove('active'));
        
        document.querySelector(`button[onclick="eventManager.switchTab('${tabName}')"]`).classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');
    }

    /**
     * Add participant to event
     */
    async addParticipant(eventId, participantId) {
        const success = await dataManager.registerParticipantForEvent(eventId, participantId);
        
        if (success) {
            Helpers.showToast('Participant added successfully!', 'success');
            this.manageParticipants(eventId); // Refresh the modal
            this.loadEventContent(); // Refresh the main view
        } else {
            Helpers.showToast('Failed to add participant', 'error');
        }
    }

    /**
     * Remove participant from event
     */
    removeParticipant(eventId, participantId) {
        const event = dataManager.getEvent(eventId);
        if (!event) {
            Helpers.showToast('Event not found', 'error');
            return;
        }

        const participantIndex = event.participants.indexOf(participantId);
        if (participantIndex === -1) {
            Helpers.showToast('Participant not in this event', 'error');
            return;
        }

        event.participants.splice(participantIndex, 1);
        const success = dataManager.updateEvent(eventId, event);
        
        if (success) {
            Helpers.showToast('Participant removed successfully!', 'success');
            this.manageParticipants(eventId); // Refresh the modal
            this.loadEventContent(); // Refresh the main view
        } else {
            Helpers.showToast('Failed to remove participant', 'error');
        }
    }

    /**
     * Generate race bracket for event
     */
    generateBracket(eventId) {
        const event = dataManager.getEvent(eventId);
        if (!event) {
            Helpers.showToast('Event not found', 'error');
            return;
        }

        if (event.participants.length < 2) {
            Helpers.showToast('Need at least 2 participants to generate bracket', 'warning');
            return;
        }

        try {
            const bracket = dataManager.createRaceBracket(eventId);
            
            if (bracket) {
                Helpers.showToast('Race bracket generated successfully!', 'success');
                Helpers.hideModal();
                
                // Navigate to races section to view bracket
                if (window.app) {
                    window.app.navigateToSection('races');
                }
            } else {
                Helpers.showToast('Failed to generate bracket', 'error');
            }
        } catch (error) {
            console.error('Bracket generation error:', error);
            Helpers.showToast('Error generating bracket: ' + error.message, 'error');
        }
    }

    /**
     * View event results (placeholder for Phase 4)
     */
    viewResults(eventId) {
        Helpers.showToast('Event results will be available in Phase 4', 'info');
    }

    /**
     * Get event summary for dashboard
     */
    async getEventSummary() {
        try {
            const result = await dataManager.getEvents();
            const allEvents = result.events || result; // Handle both paginated and direct array responses
            const now = new Date();
            
            const upcoming = allEvents.filter(e => new Date(e.date) > now);
            const today = allEvents.filter(e => {
                const eventDate = new Date(e.date);
                return eventDate.toDateString() === now.toDateString();
            });
            const past = allEvents.filter(e => new Date(e.date) < now);
            
            return {
                total: allEvents.length,
                upcoming: upcoming.length,
                today: today.length,
                past: past.length,
                recentEvents: allEvents
                    .sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate))
                    .slice(0, 3)
            };
        } catch (error) {
            console.error('Failed to get event summary:', error);
            return {
                total: 0,
                upcoming: 0,
                today: 0,
                past: 0,
                recentEvents: []
            };
        }
    }

    /**
     * Generate HTML for event class pricing settings
     */
    generateEventClassesHtml(classSettings, seriesId) {
        if (!seriesId) {
            return `
                <div class="no-series-selected">
                    <div class="info-message">
                        <h5>📋 Class Configuration</h5>
                        <p>Select a series above to configure which classes are available for this event and set their pricing.</p>
                        <p><strong>Tip:</strong> You can choose which classes from the series to offer and set custom pricing for each class.</p>
                    </div>
                </div>
            `;
        }

        const series = dataManager.getSeries(seriesId);
        if (!series || !series.sledClasses || series.sledClasses.length === 0) {
            return `
                <div class="no-classes-in-series">
                    <div class="warning-message">
                        <h5>⚠️ No Classes Available</h5>
                        <p>The selected series "${series?.name || 'Unknown'}" doesn't have any classes defined.</p>
                        <p>Please go to the Series management page and add classes to this series first.</p>
                        <button type="button" class="btn btn-secondary" onclick="window.open('series.html', '_blank')">
                            Manage Series Classes
                        </button>
                    </div>
                </div>
            `;
        }

        const classSettingsHtml = series.sledClasses.map((seriesClass, index) => {
            const existingSetting = classSettings.find(cs => cs.classId === seriesClass.id);
            const isEnabled = existingSetting ? existingSetting.enabled : true;
            const price = existingSetting ? existingSetting.price : (seriesClass.defaultFee || 0);

            return `
                <div class="event-class-setting" data-class-id="${seriesClass.id}">
                    <div class="class-toggle">
                        <input type="checkbox" id="class_${index}" ${isEnabled ? 'checked' : ''} 
                               onchange="eventManager.toggleEventClass('${seriesClass.id}', this.checked)">
                        <label for="class_${index}" class="class-name">${Helpers.sanitizeHtml(seriesClass.name)}</label>
                    </div>
                    <div class="class-price-setting">
                        <label for="price_${index}">Price ($):</label>
                        <input type="number" id="price_${index}" value="${price}" min="0" step="0.01"
                               ${!isEnabled ? 'disabled' : ''}
                               onchange="eventManager.updateClassPrice('${seriesClass.id}', this.value)">
                    </div>
                    <div class="class-default-fee">
                        <small>Series default: $${seriesClass.defaultFee || 0}</small>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="class-configuration-header">
                <h5>Available Classes from "${series.name}"</h5>
                <p>Select which classes to offer for this event and set their pricing. Participants will only be able to register for enabled classes.</p>
            </div>
            ${classSettingsHtml}
        `;
    }

    /**
     * Toggle event class enabled/disabled
     */
    toggleEventClass(classId, enabled) {
        const container = document.querySelector(`[data-class-id="${classId}"]`);
        const priceInput = container.querySelector('input[type="number"]');
        
        if (priceInput) {
            priceInput.disabled = !enabled;
        }
        
        // Visual feedback
        container.style.opacity = enabled ? '1' : '0.6';
    }

    /**
     * Update class price
     */
    updateClassPrice(classId, price) {
        // Price is updated in real-time, will be saved when form is submitted
        console.log(`Class ${classId} price updated to $${price}`);
    }

    /**
     * Get event class settings from form
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
     * Update event classes list when series changes
     */
    updateEventClassesList(seriesId) {
        const container = document.getElementById('eventClassesList');
        if (container) {
            container.innerHTML = this.generateEventClassesHtml([], seriesId);
        }
    }
}

// Initialize event manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Wait for app initialization
    setTimeout(() => {
        window.eventManager = new EventManager();
    }, 100);
}); 