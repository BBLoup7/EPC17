/**
 * EventUI - Pure Rendering Functions for Events
 * 
 * Responsibilities:
 * - Generate all event-related HTML
 * - No business logic, only presentation
 * - Consistent styling and structure
 * 
 * Part of EPC17 Event Management System
 * Architecture: Pure rendering (no side effects, no data manipulation)
 */

const EventUI = {
    // ============================================================================
    // LIST VIEWS
    // ============================================================================

    /**
     * Render complete events list
     * @param {Array} events - Array of event objects
     * @param {Object} statsMap - Map of event IDs to stats
     * @returns {string} HTML string
     */
    renderEventsList(events, statsMap = {}) {
        if (!events || events.length === 0) {
            return this.renderEmptyState();
        }

        const eventsHtml = events.map(event => {
            const stats = statsMap[event.id] || {};
            return this.renderEventCard(event, stats);
        }).join('');

        return `
            <div class="events-section">
                <h4 class="events-section-title">🏁 All Events</h4>
                <div class="events-grid">
                    ${eventsHtml}
                </div>
            </div>
        `;
    },

    /**
     * Render empty state
     * @returns {string} HTML string
     */
    renderEmptyState() {
        return `
            <div class="empty-state">
                <div class="empty-state-icon">🏁</div>
                <h3>No Events Created</h3>
                <p>Create your first racing event to get started. Events can be part of a series or standalone competitions.</p>
                <button class="btn btn-primary" onclick="eventManager.showEventForm()">
                    Create First Event
                </button>
            </div>
        `;
    },

    /**
     * Render single event card
     * @param {Object} event - Event object
     * @param {Object} stats - Event statistics
     * @returns {string} HTML string
     */
    renderEventCard(event, stats = {}) {
        const series = event.seriesId && window.dataManager ? 
            window.dataManager.getSeries(event.seriesId) : null;
        const spotsAvailable = stats.spotsAvailable !== undefined ? 
            stats.spotsAvailable : this._calculateSpots(event);

        return `
            <div class="event-card" data-event-id="${event.id}">
                <div class="event-header">
                    <h3 class="event-name">${this._sanitize(event.name)}</h3>
                    <div class="event-status-badges">
                        ${event.registrationOpen ? 
                            '<span class="registration-status open">Open</span>' : 
                            '<span class="registration-status closed">Closed</span>'
                        }
                    </div>
                </div>
                
                ${series ? `
                    <div class="series-info">
                        ${this.renderSeriesBadge(series)}
                    </div>
                ` : ''}
                
                <div class="event-details">
                    <div class="detail-row">
                        <span class="detail-icon">📅</span>
                        <span class="detail-text">${this._formatDate(event.date)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-icon">📍</span>
                        <span class="detail-text">${this._sanitize(event.location)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-icon">🏁</span>
                        <span class="detail-text">${event.numberOfTracks} Track${event.numberOfTracks > 1 ? 's' : ''}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-icon">🎯</span>
                        <span class="detail-text">${this._capitalize(event.eliminationType)} Elimination</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-icon">👥</span>
                        <span class="detail-text">${event.participants.length}/${event.maxParticipants || '∞'} Participants</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-icon">💰</span>
                        <span class="detail-text">${this._formatCurrency(event.entryFee || 0)} Entry Fee</span>
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
    },

    // ============================================================================
    // FORMS
    // ============================================================================

    /**
     * Render event form (create or edit)
     * @param {Object} eventData - Event data (null for create)
     * @param {Array} allSeries - Array of all series
     * @param {boolean} isEdit - True if editing existing event
     * @returns {string} HTML string
     */
    renderEventForm(eventData, allSeries, isEdit) {
        const event = eventData || {};
        const isCompleted = isEdit && (event.status === 'completed' || event.status === 'finished');
        const lockSettings = isCompleted;

        return `
            <form id="event-form" class="event-form">
                ${this.renderBasicInfoSection(event, isEdit, allSeries)}
                ${this.renderRaceConfigSection(event, isEdit, lockSettings)}
                ${this.renderClassPricingSection(event, isEdit)}
                ${this.renderAdvancedSettingsSection(event, isEdit, lockSettings)}
                
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
    },

    /**
     * Render basic info section
     * @param {Object} event - Event object
     * @param {boolean} isEdit - True if editing
     * @param {Array} allSeries - Array of all series
     * @returns {string} HTML string
     */
    renderBasicInfoSection(event, isEdit, allSeries = []) {
        return `
            <div class="form-section">
                <h4>Basic Information</h4>
                
                <div class="form-group">
                    <label for="eventName">Event Name *</label>
                    <input type="text" name="eventName" id="eventName" required 
                           placeholder="e.g., Winter Championship Race"
                           value="${isEdit ? this._sanitize(event.name) : ''}">
                </div>

                <div class="form-group">
                    <label for="location">Location *</label>
                    <input type="text" name="location" id="location" required 
                           placeholder="e.g., Frozen Lake Speedway"
                           value="${isEdit ? this._sanitize(event.location) : ''}">
                </div>

                <div class="form-group">
                    <label for="eventDate">Event Date *</label>
                    <input type="date" name="eventDate" id="eventDate" required 
                           value="${isEdit && event.date ? event.date : ''}">
                </div>

                <div class="form-group">
                    <label for="seriesId">Series (Optional)</label>
                    <select name="seriesId" id="seriesId">
                        <option value="">Standalone Event</option>
                        ${allSeries.map(s => `
                            <option value="${s.id}" ${isEdit && event.seriesId === s.id ? 'selected' : ''}>
                                ${this._sanitize(s.name)}
                            </option>
                        `).join('')}
                    </select>
                </div>
            </div>
        `;
    },

    /**
     * Render race configuration section
     * @param {Object} event - Event object
     * @param {boolean} isEdit - True if editing
     * @param {boolean} lockSettings - True if settings should be locked
     * @returns {string} HTML string
     */
    renderRaceConfigSection(event, isEdit, lockSettings) {
        return `
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
                        <select name="eliminationType" id="eliminationType" required ${lockSettings ? 'disabled' : ''}>
                            <option value="single" ${isEdit && event.eliminationType === 'single' ? 'selected' : ''}>
                                Single Elimination
                            </option>
                            <option value="double" ${isEdit && event.eliminationType === 'double' ? 'selected' : ''}>
                                Double Elimination
                            </option>
                             <option value="double_random" ${isEdit && event.eliminationType === 'double_random' ? 'selected' : ''}>
                                 Double Elimination (Random, no bracket)
                             </option>
                             <option value="custom" ${isEdit && event.eliminationType === 'custom' ? 'selected' : ''}>
                                 Custom Outcomes per Position
                             </option>
                        </select>
                        ${lockSettings ? '<small class="form-help text-warning">⚠️ Cannot change elimination type for completed events</small>' : ''}
                    </div>
                </div>

                <div class="track-preview" id="track-preview">
                    <h5>Race Format Preview</h5>
                    <div id="track-visualization"></div>
                </div>
                
                ${this.renderCustomOutcomesSection(event, isEdit, lockSettings)}
            </div>
        `;
    },

    /**
     * Render custom outcomes section
     * @param {Object} event - Event object
     * @param {boolean} isEdit - True if editing
     * @param {boolean} lockSettings - True if settings should be locked
     * @returns {string} HTML string
     */
    renderCustomOutcomesSection(event, isEdit, lockSettings) {
        return `
            <div class="form-group" id="custom-outcomes-container" style="display:none;">
                <h5>Custom Elimination Settings</h5>
                
                <div class="form-row">
                    <div class="form-group">
                        <label for="customLossLimit">Loss Limit</label>
                        <input type="number" id="customLossLimit" min="1" max="10" 
                               value="${isEdit && event.customLossLimit ? event.customLossLimit : 2}" 
                               style="max-width:100px;" ${lockSettings ? 'disabled' : ''}>
                        <small>Number of losses before elimination</small>
                    </div>
                    <div class="form-group">
                        <label for="customUseBrackets">Bracket System</label>
                        <select id="customUseBrackets" style="max-width:200px;" ${lockSettings ? 'disabled' : ''}>
                            <option value="false" ${isEdit && event.customUseBrackets === false ? 'selected' : ''}>No Brackets (Random pairing)</option>
                            <option value="true" ${isEdit && event.customUseBrackets === true ? 'selected' : ''}>Use Brackets (Structured)</option>
                        </select>
                        <small>How to organize matchups</small>
                    </div>
                    <div class="form-group">
                        <label for="customFinalType">Final Type</label>
                        <select id="customFinalType" style="max-width:200px;" ${lockSettings ? 'disabled' : ''}>
                            <option value="unique" ${isEdit && event.customFinalType === 'unique' ? 'selected' : ''}>Unique Final (Standard)</option>
                            <option value="complete" ${isEdit && event.customFinalType === 'complete' ? 'selected' : ''}>Complete Elimination</option>
                        </select>
                        <small>How to determine final standings</small>
                    </div>
                </div>
                ${lockSettings ? '<div class="form-help text-warning">⚠️ Tournament settings are locked for completed events to prevent data corruption</div>' : ''}
                
                <div class="form-group">
                    <label>Outcomes per Finishing Position</label>
                    <div id="custom-outcomes-rows"></div>
                    <small>For each finishing position, choose the outcome: Win (no loss), Lose (adds a loss, continues), Eliminated (out of event).</small>
                </div>
            </div>
        `;
    },

    /**
     * Render track visualization
     * @param {number} numberOfTracks - Number of tracks/lanes
     * @param {string} eliminationType - Elimination type
     * @returns {string} HTML string
     */
    renderTrackVisualization(numberOfTracks, eliminationType) {
        const lanesHtml = Array.from({ length: numberOfTracks }, (_, i) => `
            <div class="participant-lane">
                <div class="lane-number">${i + 1}</div>
                <div class="lane-label">Participant ${i + 1}</div>
            </div>
        `).join('');

        return `
            <div class="race-format-display">
                <div class="participants-per-race">
                    <h6>Race Format</h6>
                    <div class="lanes-grid">
                        ${lanesHtml}
                    </div>
                </div>
                ${eliminationType === 'custom' ? `
                <div class="race-result">
                    <div class="winner-indicator">Customize outcomes below for each finishing position.</div>
                </div>` : `
                <div class="race-result">
                    <div class="winner-indicator">🏆 1st Place = Winner</div>
                    <div class="loser-indicator">❌ 2nd-${numberOfTracks}th Place = ${eliminationType === 'double' || eliminationType === 'double_random' ? 'Loss (may continue)' : 'Eliminated'}</div>
                </div>`}
            </div>
            <div class="layout-info">
                <strong>Format:</strong> ${numberOfTracks} participants per race, ${eliminationType} elimination tournament
            </div>
        `;
    },

    /**
     * Render class pricing section
     * @param {Object} event - Event object
     * @param {boolean} isEdit - True if editing
     * @returns {string} HTML string
     */
    renderClassPricingSection(event, isEdit) {
        return `
            <div class="form-section">
                <h4>Class Pricing & Registration</h4>
                <div class="class-pricing-section">
                    <div id="eventClassesList">
                        ${this.renderClassSettings(event.classSettings || [], event.seriesId)}
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
                              placeholder="Optional event description, rules, or special instructions...">${isEdit ? this._sanitize(event.description || '') : ''}</textarea>
                </div>
            </div>
        `;
    },

    /**
     * Render advanced settings section
     * @param {Object} event - Event object
     * @param {boolean} isEdit - True if editing
     * @param {boolean} lockSettings - True if settings should be locked
     * @returns {string} HTML string
     */
    renderAdvancedSettingsSection(event, isEdit, lockSettings) {
        return `
            <div class="form-section">
                <h4>Advanced Settings</h4>
                
                <div class="form-row">
                    <div class="form-group">
                        <label for="driverMeetingTime">Driver Meeting Time</label>
                        <input type="time" name="driverMeetingTime" id="driverMeetingTime" 
                               value="${isEdit && event.driverMeetingTime ? event.driverMeetingTime : '08:00'}">
                    </div>
                    <div class="form-group">
                        <label for="maxParticipants">Max Participants</label>
                        <input type="number" name="maxParticipants" id="maxParticipants" min="1" 
                               value="${isEdit && event.maxParticipants ? event.maxParticipants : ''}" required>
                    </div>
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

                <!-- Tie-Breaker Settings -->
                <div class="form-group tie-breaker-settings">
                    <div class="form-checkbox">
                        <input type="checkbox" name="tieBreakerEnabled" id="tieBreakerEnabled" 
                               ${isEdit && event.tieBreakerEnabled ? 'checked' : ''}>
                        <label for="tieBreakerEnabled">Enable Tie-Breaker Races</label>
                    </div>
                    <small class="form-help">Run additional races to resolve ties at specified rank positions.</small>
                </div>

                <div class="form-group tie-breaker-rank-setting" id="tieBreakerRankSetting" style="display: ${isEdit && event.tieBreakerEnabled ? 'block' : 'none'};">
                    <label class="form-label" for="tieBreakerRank">Tie-Breaker Rank Threshold</label>
                    <select id="tieBreakerRank" name="tieBreakerRank" class="form-control">
                        <option value="1" ${isEdit && event.tieBreakerRank == 1 ? 'selected' : ''}>Top 1 (Winner only)</option>
                        <option value="2" ${isEdit && event.tieBreakerRank == 2 ? 'selected' : ''}>Top 2 (1st & 2nd)</option>
                        <option value="3" ${(!isEdit || event.tieBreakerRank == 3 || !event.tieBreakerRank) ? 'selected' : ''}>Top 3 (Podium)</option>
                        <option value="5" ${isEdit && event.tieBreakerRank == 5 ? 'selected' : ''}>Top 5</option>
                        <option value="10" ${isEdit && event.tieBreakerRank == 10 ? 'selected' : ''}>Top 10</option>
                    </select>
                    <small class="form-help">Run tie-breaker races for ties at or above this rank position.</small>
                </div>
            </div>

            <script>
                // Show/hide tie-breaker rank setting based on checkbox
                document.getElementById('tieBreakerEnabled')?.addEventListener('change', function() {
                    const rankSetting = document.getElementById('tieBreakerRankSetting');
                    if (rankSetting) {
                        rankSetting.style.display = this.checked ? 'block' : 'none';
                    }
                });
            </script>
        `;
    },

    // ============================================================================
    // DETAILS
    // ============================================================================

    /**
     * Render event details
     * @param {Object} event - Event object
     * @param {Object} series - Series object (optional)
     * @param {Array} participants - Array of participants
     * @param {Object} stats - Event statistics
     * @returns {string} HTML string
     */
    renderEventDetails(event, series, participants, stats = {}) {
        const registrationOpen = stats.registrationOpen !== undefined ? 
            stats.registrationOpen : (event.registrationOpen && (stats.spotsAvailable === null || stats.spotsAvailable > 0));
        const spotsAvailable = stats.spotsAvailable !== undefined ? 
            stats.spotsAvailable : this._calculateSpots(event);

        return `
            <div class="event-details-modal">
                ${this.renderEventInfo(event, series, registrationOpen, spotsAvailable)}
                
                <div class="section-divider"></div>

                ${this.renderParticipantsList(event, participants, registrationOpen)}

                <div class="modal-actions">
                    <button class="btn btn-primary" onclick="eventManager.editEvent('${event.id}'); Helpers.hideModal();">
                        Edit Event
                    </button>
                    ${registrationOpen ? `
                        <button class="btn btn-success" onclick="eventManager.registerParticipant('${event.id}'); Helpers.hideModal();">
                            Register Participant
                        </button>
                    ` : ''}
                    <button class="btn btn-secondary" onclick="Helpers.hideModal()">
                        Close
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Render event info section
     * @param {Object} event - Event object
     * @param {Object} series - Series object (optional)
     * @param {boolean} registrationOpen - Registration status
     * @param {number|null} spotsAvailable - Available spots
     * @returns {string} HTML string
     */
    renderEventInfo(event, series, registrationOpen, spotsAvailable) {
        return `
            <div class="event-info">
                <h4>${this._sanitize(event.name)}</h4>
                
                ${series ? `
                    <div class="series-badge-large">
                        Part of ${this._sanitize(series.name)}
                    </div>
                ` : ''}
                
                <div class="info-grid">
                    <div class="info-item">
                        <strong>Date & Time:</strong>
                        ${this._formatDate(event.date)}
                    </div>
                    <div class="info-item">
                        <strong>Location:</strong>
                        ${this._sanitize(event.location)}
                    </div>
                    <div class="info-item">
                        <strong>Tracks:</strong>
                        ${event.numberOfTracks} parallel track${event.numberOfTracks > 1 ? 's' : ''}
                    </div>
                    <div class="info-item">
                        <strong>Elimination:</strong>
                        ${this._capitalize(event.eliminationType)} elimination
                    </div>
                    <div class="info-item">
                        <strong>Entry Fee:</strong>
                        ${this._formatCurrency(event.entryFee || 0)}
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
                        ${this.renderRegistrationStatus(registrationOpen)}
                    </div>
                </div>
                
                ${event.description ? `
                    <div class="description">
                        <strong>Description:</strong>
                        <p>${this._sanitize(event.description)}</p>
                    </div>
                ` : ''}
            </div>
        `;
    },

    /**
     * Render participants list
     * @param {Object} event - Event object
     * @param {Array} participants - Array of participants
     * @param {boolean} registrationOpen - Registration status
     * @returns {string} HTML string
     */
    renderParticipantsList(event, participants, registrationOpen) {
        const participantsHtml = participants.length > 0 ? 
            participants.map(p => {
                let classDisplay = 'Unknown';
                if (p.sledClasses && Array.isArray(p.sledClasses) && p.sledClasses.length > 0) {
                    classDisplay = p.sledClasses[0].toUpperCase();
                } else if (p.sledClass) {
                    classDisplay = p.sledClass.toUpperCase();
                }
                
                return `
                    <div class="participant-item-mini">
                        <span class="participant-name">${this._sanitize(p.name)}</span>
                        <span class="participant-class">${classDisplay}</span>
                    </div>
                `;
            }).join('') : '<p><em>No participants registered yet.</em></p>';

        return `
            <div class="participants-section">
                <h5>Participants (${participants.length})</h5>
                <div class="participants-list">
                    ${participantsHtml}
                </div>
                ${registrationOpen ? `
                    <button class="btn btn-primary" onclick="eventManager.manageParticipants('${event.id}'); Helpers.hideModal();">
                        Manage Participants
                    </button>
                ` : ''}
            </div>
        `;
    },

    /**
     * Render event status badge
     * @param {string} status - Event status
     * @returns {string} HTML string
     */
    renderEventStatusBadge(status) {
        const statusClasses = {
            'upcoming': 'status-upcoming',
            'active': 'status-active',
            'completed': 'status-completed',
            'cancelled': 'status-cancelled',
            'finished': 'status-finished'
        };

        const statusLabels = {
            'upcoming': 'Upcoming',
            'active': 'Active',
            'completed': 'Completed',
            'cancelled': 'Cancelled',
            'finished': 'Finished'
        };

        const statusClass = statusClasses[status] || 'status-upcoming';
        const statusLabel = statusLabels[status] || status;

        return `<span class="status-badge ${statusClass}">${statusLabel}</span>`;
    },

    // ============================================================================
    // PARTICIPANT MANAGEMENT
    // ============================================================================

    /**
     * Render participant management modal
     * @param {Object} event - Event object
     * @param {Array} eventParticipants - Participants in event
     * @param {Array} availableParticipants - Available participants to add
     * @returns {string} HTML string
     */
    renderParticipantManagement(event, eventParticipants, availableParticipants) {
        const spotsAvailable = this._calculateSpots(event);
        const canAddMore = spotsAvailable === null || spotsAvailable > 0;

        return `
            <div class="participants-manage-modal">
                ${this.renderCapacityIndicator(event, spotsAvailable)}

                ${this.renderParticipantTabs(event, eventParticipants, availableParticipants, canAddMore)}

                <div class="modal-actions">
                    <button class="btn btn-primary" onclick="eventManager.generateBracket('${event.id}')">
                        Generate Race Bracket
                    </button>
                    <button class="btn btn-secondary" onclick="Helpers.hideModal()">
                        Done
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Render participant tabs
     * @param {Object} event - Event object
     * @param {Array} eventParticipants - Participants in event
     * @param {Array} availableParticipants - Available participants
     * @param {boolean} canAddMore - True if can add more participants
     * @returns {string} HTML string
     */
    renderParticipantTabs(event, eventParticipants, availableParticipants, canAddMore) {
        const eventParticipantsHtml = this._renderParticipantItems(eventParticipants, event.id, 'remove');
        const availableParticipantsHtml = canAddMore ? 
            this._renderParticipantItems(availableParticipants, event.id, 'add') :
            '<p><em>Event is at maximum capacity.</em></p>';

        return `
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
        `;
    },

    // ============================================================================
    // COMPONENTS
    // ============================================================================

    /**
     * Render series badge
     * @param {Object} series - Series object
     * @returns {string} HTML string
     */
    renderSeriesBadge(series) {
        if (!series) return '';
        return `<span class="series-badge">${this._sanitize(series.name)}</span>`;
    },

    /**
     * Render registration status
     * @param {boolean} isOpen - True if registration is open
     * @returns {string} HTML string
     */
    renderRegistrationStatus(isOpen) {
        return `<span class="registration-status ${isOpen ? 'open' : 'closed'}">
            ${isOpen ? 'Open' : 'Closed'}
        </span>`;
    },

    /**
     * Render capacity indicator
     * @param {Object} event - Event object
     * @param {number|null} spotsAvailable - Available spots
     * @returns {string} HTML string
     */
    renderCapacityIndicator(event, spotsAvailable) {
        return `
            <div class="capacity-status">
                <h4>Event Capacity: ${event.participants.length}/${event.maxParticipants || '∞'}</h4>
                ${spotsAvailable !== null ? `
                    <p class="capacity-info ${spotsAvailable <= 5 ? 'warning' : ''}">
                        ${spotsAvailable} spot${spotsAvailable !== 1 ? 's' : ''} remaining
                    </p>
                ` : ''}
            </div>
        `;
    },

    /**
     * Render class settings for event form
     * @param {Array} classSettings - Current class settings
     * @param {string} seriesId - Series ID
     * @returns {string} HTML string
     */
    renderClassSettings(classSettings, seriesId) {
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

        const series = window.dataManager ? window.dataManager.getSeries(seriesId) : null;
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
                        <label for="class_${index}" class="class-name">${this._sanitize(seriesClass.name)}</label>
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
    },

    // ============================================================================
    // PRIVATE HELPER METHODS
    // ============================================================================

    /**
     * Render participant items for management
     * @private
     */
    _renderParticipantItems(participants, eventId, action) {
        if (participants.length === 0) {
            return action === 'add' ? 
                '<p><em>All registered participants are already in this event.</em></p>' :
                '<p><em>No participants registered yet.</em></p>';
        }

        return participants.map(p => {
            let classDisplay = 'Unknown';
            if (p.sledClasses && Array.isArray(p.sledClasses) && p.sledClasses.length > 0) {
                classDisplay = p.sledClasses[0].toUpperCase();
            } else if (p.sledClass) {
                classDisplay = p.sledClass.toUpperCase();
            }

            const buttonClass = action === 'add' ? 'btn-success' : 'btn-danger';
            const buttonText = action === 'add' ? 'Add' : 'Remove';
            const buttonAction = action === 'add' ? 
                `eventManager.addParticipant('${eventId}', '${p.id}')` :
                `eventManager.removeParticipant('${eventId}', '${p.id}')`;
            
            return `
                <div class="participant-manage-item">
                    <div class="participant-info">
                        <strong>${this._sanitize(p.name)}</strong>
                        <span class="participant-class">${classDisplay}</span>
                        <span class="participant-team">${p.team || 'No Team'}</span>
                    </div>
                    <button class="btn ${buttonClass} btn-small" onclick="${buttonAction}">
                        ${buttonText}
                    </button>
                </div>
            `;
        }).join('');
    },

    /**
     * Calculate spots (helper)
     * @private
     */
    _calculateSpots(event) {
        if (!event.maxParticipants) return null;
        return Math.max(0, event.maxParticipants - event.participants.length);
    },

    /**
     * Sanitize HTML
     * @private
     */
    _sanitize(str) {
        if (!str) return '';
        if (typeof window !== 'undefined' && window.Helpers && window.Helpers.sanitizeHtml) {
            return window.Helpers.sanitizeHtml(str);
        }
        return String(str).replace(/[&<>"']/g, (char) => {
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
            return map[char];
        });
    },

    /**
     * Format date
     * @private
     */
    _formatDate(dateString) {
        if (!dateString) return 'TBD';
        if (typeof window !== 'undefined' && window.Helpers && window.Helpers.formatDate) {
            return window.Helpers.formatDate(dateString);
        }
        return new Date(dateString).toLocaleDateString();
    },

    /**
     * Format currency
     * @private
     */
    _formatCurrency(amount) {
        if (typeof window !== 'undefined' && window.Helpers && window.Helpers.formatCurrency) {
            return window.Helpers.formatCurrency(amount);
        }
        return `$${amount.toFixed(2)}`;
    },

    /**
     * Capitalize string
     * @private
     */
    _capitalize(str) {
        if (!str) return '';
        if (typeof window !== 'undefined' && window.Helpers && window.Helpers.capitalize) {
            return window.Helpers.capitalize(str);
        }
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventUI;
}

// Make available globally
if (typeof window !== 'undefined') {
    window.EventUI = EventUI;
}

