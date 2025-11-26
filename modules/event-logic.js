/**
 * EventLogic - Pure Business Logic for Events
 * 
 * Responsibilities:
 * - Event validation rules
 * - Status calculation and transitions
 * - Participant eligibility checks
 * - Fee calculations
 * - Race format validation
 * - Date/time calculations
 * 
 * Part of EPC17 Event Management System
 * Architecture: Pure, stateless functions (no side effects)
 */

const EventLogic = {
    // ============================================================================
    // VALIDATION
    // ============================================================================

    /**
     * Validate complete event data
     * @param {Object} eventData - Event data to validate
     * @returns {Object} { valid: boolean, errors: Array }
     */
    validateEventData(eventData) {
        const errors = [];

        // Required fields
        if (!eventData.name || eventData.name.trim() === '') {
            errors.push('Event name is required');
        }

        if (!eventData.location || eventData.location.trim() === '') {
            errors.push('Event location is required');
        }

        if (!eventData.date) {
            errors.push('Event date is required');
        }

        if (!eventData.numberOfTracks || eventData.numberOfTracks < 1) {
            errors.push('Number of tracks must be at least 1');
        }

        if (!eventData.maxParticipants || eventData.maxParticipants < 1) {
            errors.push('Maximum participants must be at least 1');
        }

        // Validate elimination type
        const eliminationValidation = this.validateEliminationType(
            eventData.eliminationType,
            eventData.customOutcomes,
            eventData.customLossLimit,
            eventData.numberOfTracks
        );
        if (!eliminationValidation.valid) {
            errors.push(...eliminationValidation.errors);
        }

        // Validate class settings if series is specified
        if (eventData.seriesId && eventData.classSettings) {
            const classValidation = this.validateClassSettings(
                eventData.classSettings,
                eventData.seriesId
            );
            if (!classValidation.valid) {
                errors.push(...classValidation.errors);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    },

    /**
     * Validate event name
     * @param {string} name - Event name
     * @returns {Object} { valid: boolean, error: string }
     */
    validateEventName(name) {
        if (!name || name.trim() === '') {
            return { valid: false, error: 'Event name is required' };
        }

        if (name.length < 3) {
            return { valid: false, error: 'Event name must be at least 3 characters' };
        }

        if (name.length > 100) {
            return { valid: false, error: 'Event name must be less than 100 characters' };
        }

        return { valid: true, error: '' };
    },

    /**
     * Validate event dates
     * @param {string} eventDate - Event date
     * @param {string} driverMeetingTime - Optional meeting time
     * @returns {Object} { valid: boolean, errors: Array }
     */
    validateEventDates(eventDate, driverMeetingTime) {
        const errors = [];

        if (!eventDate) {
            errors.push('Event date is required');
            return { valid: false, errors };
        }

        const date = new Date(eventDate);
        if (isNaN(date.getTime())) {
            errors.push('Invalid event date format');
        }

        // Optional: warn if date is in the past
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        if (date < now) {
            // Just a warning, not an error
            console.warn('Event date is in the past');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    },

    /**
     * Validate participant capacity
     * @param {Object} event - Event object
     * @returns {Object} { valid: boolean, error: string }
     */
    validateParticipantCapacity(event) {
        if (!event.maxParticipants || event.maxParticipants < 1) {
            return { valid: false, error: 'Maximum participants must be at least 1' };
        }

        const currentParticipants = event.participants ? event.participants.length : 0;
        if (currentParticipants > event.maxParticipants) {
            return {
                valid: false,
                error: `Current participants (${currentParticipants}) exceeds maximum (${event.maxParticipants})`
            };
        }

        return { valid: true, error: '' };
    },

    /**
     * Validate class settings
     * @param {Array} classSettings - Array of class settings
     * @param {string} seriesId - Series ID (for reference, actual validation done in DataService)
     * @returns {Object} { valid: boolean, errors: Array }
     */
    validateClassSettings(classSettings, seriesId) {
        const errors = [];

        if (!Array.isArray(classSettings)) {
            errors.push('Class settings must be an array');
            return { valid: false, errors };
        }

        classSettings.forEach((cs, index) => {
            if (!cs.classId) {
                errors.push(`Class setting ${index + 1}: classId is required`);
            }

            if (cs.enabled && (cs.price === undefined || cs.price < 0)) {
                errors.push(`Class setting ${index + 1}: valid price is required for enabled classes`);
            }
        });

        return {
            valid: errors.length === 0,
            errors
        };
    },

    /**
     * Validate elimination type
     * @param {string} type - Elimination type
     * @param {Array} customOutcomes - Custom outcomes for 'custom' type
     * @param {number} customLossLimit - Loss limit for 'custom' type
     * @param {number} numberOfTracks - Number of tracks/lanes
     * @returns {Object} { valid: boolean, errors: Array }
     */
    validateEliminationType(type, customOutcomes, customLossLimit, numberOfTracks) {
        const errors = [];
        const validTypes = ['single', 'double', 'double_random', 'custom'];

        if (!type) {
            errors.push('Elimination type is required');
            return { valid: false, errors };
        }

        if (!validTypes.includes(type)) {
            errors.push(`Invalid elimination type: ${type}. Must be one of: ${validTypes.join(', ')}`);
        }

        // Validate custom elimination settings
        if (type === 'custom') {
            if (!customOutcomes || !Array.isArray(customOutcomes)) {
                errors.push('Custom outcomes are required for custom elimination type');
            } else if (customOutcomes.length !== numberOfTracks) {
                errors.push(`Custom outcomes must have exactly ${numberOfTracks} positions`);
            } else {
                const validOutcomes = ['win', 'lose', 'eliminated'];
                customOutcomes.forEach((outcome, index) => {
                    if (!validOutcomes.includes(outcome.toLowerCase())) {
                        errors.push(`Position ${index + 1}: invalid outcome "${outcome}". Must be: ${validOutcomes.join(', ')}`);
                    }
                });

                // At least one position must result in 'win'
                const hasWin = customOutcomes.some(o => o.toLowerCase() === 'win');
                if (!hasWin) {
                    errors.push('At least one finishing position must result in "win"');
                }
            }

            if (!customLossLimit || customLossLimit < 1) {
                errors.push('Custom loss limit must be at least 1');
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    },

    // ============================================================================
    // CALCULATIONS
    // ============================================================================

    /**
     * Calculate available spots for an event
     * @param {Object} event - Event object
     * @returns {number|null} Available spots or null if unlimited
     */
    calculateAvailableSpots(event) {
        if (!event.maxParticipants) return null;
        const currentParticipants = event.participants ? event.participants.length : 0;
        return Math.max(0, event.maxParticipants - currentParticipants);
    },

    /**
     * Calculate event duration (placeholder - can be enhanced)
     * @param {Object} event - Event object
     * @returns {string} Duration estimate
     */
    calculateEventDuration(event) {
        // Simple estimation based on participants and elimination type
        const participants = event.participants ? event.participants.length : 0;
        if (participants === 0) return 'TBD';

        // Rough estimate: more participants = longer event
        const hours = Math.ceil(participants / 10);
        return `~${hours} hour${hours > 1 ? 's' : ''}`;
    },

    /**
     * Calculate total event fees
     * @param {Object} event - Event object
     * @returns {number} Total fees from all class settings
     */
    calculateTotalEventFees(event) {
        if (!event.classSettings || event.classSettings.length === 0) {
            return 0;
        }

        return event.classSettings
            .filter(cs => cs.enabled)
            .reduce((total, cs) => total + (cs.price || 0), 0);
    },

    /**
     * Check if registration is open
     * @param {Object} event - Event object
     * @returns {boolean} True if registration is open and spots available
     */
    isRegistrationOpen(event) {
        if (!event.registrationOpen) return false;

        const spotsAvailable = this.calculateAvailableSpots(event);
        return spotsAvailable === null || spotsAvailable > 0;
    },

    // ============================================================================
    // STATUS LOGIC (CENTRALIZED)
    // ============================================================================

    /**
     * Determine event status based on bracket state
     * @param {Object} event - Event object
     * @param {Object} bracket - Race bracket
     * @returns {string} Suggested status
     */
    determineEventStatus(event, bracket) {
        // If event is manually set to cancelled, keep it
        if (event.status === 'cancelled') {
            return 'cancelled';
        }

        // Check if bracket exists and has races
        const hasRaces = bracket && bracket.classes &&
            Object.values(bracket.classes).some(classBracket =>
                classBracket.rounds && classBracket.rounds.length > 0
            );

        if (!hasRaces) {
            return 'upcoming';
        }

        // Check if all classes are complete
        const allClassesComplete = bracket && bracket.classes &&
            Object.values(bracket.classes).every(classBracket =>
                classBracket.isComplete === true
            );

        if (allClassesComplete) {
            return 'completed';
        }

        return 'active';
    },

    /**
     * Check if status change is allowed
     * @param {string} currentStatus - Current status
     * @param {string} newStatus - Desired new status
     * @param {Object} event - Event object
     * @returns {Object} { allowed: boolean, reason: string }
     */
    canChangeStatus(currentStatus, newStatus, event) {
        const validStatuses = ['upcoming', 'active', 'completed', 'cancelled', 'finished'];

        if (!validStatuses.includes(newStatus)) {
            return {
                allowed: false,
                reason: `Invalid status: ${newStatus}`
            };
        }

        // Can't change status of finished events
        if (currentStatus === 'finished') {
            return {
                allowed: false,
                reason: 'Cannot change status of finished events'
            };
        }

        // Can't go back from completed to active
        if (currentStatus === 'completed' && newStatus === 'active') {
            return {
                allowed: false,
                reason: 'Cannot reactivate completed events'
            };
        }

        return { allowed: true, reason: '' };
    },

    /**
     * Get valid next statuses for current state
     * @param {string} currentStatus - Current status
     * @param {Object} event - Event object
     * @returns {Array} Array of valid next statuses
     */
    getNextValidStatuses(currentStatus, event) {
        const statusMap = {
            'upcoming': ['active', 'cancelled'],
            'active': ['completed', 'cancelled'],
            'completed': ['finished', 'cancelled'],
            'cancelled': ['upcoming'],
            'finished': []
        };

        return statusMap[currentStatus] || [];
    },

    /**
     * Check if event is editable
     * @param {Object} event - Event object
     * @returns {boolean} True if event can be edited
     */
    isEventEditable(event) {
        // Completed or finished events have locked tournament settings
        return event.status !== 'completed' && event.status !== 'finished';
    },

    /**
     * Check if event is locked
     * @param {Object} event - Event object
     * @returns {boolean} True if event is locked
     */
    isEventLocked(event) {
        return event.status === 'completed' || event.status === 'finished';
    },

    // ============================================================================
    // PARTICIPANT LOGIC
    // ============================================================================

    /**
     * Check if participant can be added to event
     * @param {Object} event - Event object
     * @param {Object} participant - Participant object
     * @returns {Object} { canAdd: boolean, reason: string }
     */
    canAddParticipant(event, participant) {
        if (!event) {
            return { canAdd: false, reason: 'Event not found' };
        }

        if (!participant) {
            return { canAdd: false, reason: 'Participant not found' };
        }

        // Check if already registered
        if (event.participants && event.participants.includes(participant.id)) {
            return { canAdd: false, reason: 'Participant already registered' };
        }

        // Check capacity
        const spotsAvailable = this.calculateAvailableSpots(event);
        if (spotsAvailable !== null && spotsAvailable <= 0) {
            return { canAdd: false, reason: 'Event is full' };
        }

        // Check if registration is open
        if (!event.registrationOpen) {
            return { canAdd: false, reason: 'Registration is closed' };
        }

        return { canAdd: true, reason: '' };
    },

    /**
     * Get participant classes for a specific event
     * @param {Object} participant - Participant object
     * @param {string} eventId - Event ID
     * @returns {Array} Array of class names
     */
    getParticipantClassesForEvent(participant, eventId) {
        if (!participant) return [];

        // Check event-specific classes first
        if (participant.eventClasses && participant.eventClasses[eventId]) {
            return participant.eventClasses[eventId];
        }

        // Fallback to general selected classes
        if (participant.selectedClasses && Array.isArray(participant.selectedClasses)) {
            return participant.selectedClasses;
        }

        // Legacy: single sledClass
        if (participant.sledClass) {
            return [participant.sledClass];
        }

        // Legacy: multiple sledClasses
        if (participant.sledClasses && Array.isArray(participant.sledClasses)) {
            return participant.sledClasses;
        }

        return [];
    },

    // ============================================================================
    // RACE INTEGRATION
    // ============================================================================

    /**
     * Check if event can generate races
     * @param {Object} event - Event object
     * @returns {Object} { canGenerate: boolean, reason: string }
     */
    canGenerateRaces(event) {
        if (!event) {
            return { canGenerate: false, reason: 'Event not found' };
        }

        if (event.status === 'completed' || event.status === 'finished') {
            return { canGenerate: false, reason: 'Event is already completed' };
        }

        if (!event.participants || event.participants.length < 2) {
            return { canGenerate: false, reason: 'Need at least 2 participants' };
        }

        return { canGenerate: true, reason: '' };
    },

    /**
     * Get race configuration from event
     * @param {Object} event - Event object
     * @returns {Object} Race configuration
     */
    getRaceConfiguration(event) {
        return {
            numberOfTracks: event.numberOfTracks || 2,
            eliminationType: event.eliminationType || 'single',
            customOutcomes: event.customOutcomes || [],
            customLossLimit: event.customLossLimit || 2,
            customUseBrackets: event.customUseBrackets !== undefined ? event.customUseBrackets : false,
            customFinalType: event.customFinalType || 'unique',
            freeRunEnabled: event.freeRunEnabled || false,
            requiresClassSeparation: event.requiresClassSeparation !== undefined ? event.requiresClassSeparation : true
        };
    },

    // ============================================================================
    // SERIES INTEGRATION
    // ============================================================================

    /**
     * Get series classes (requires dataManager context, but logic is here)
     * @param {string} seriesId - Series ID
     * @param {Function} getSeriesFunc - Function to get series (from DataService)
     * @returns {Array} Array of class objects
     */
    getSeriesClasses(seriesId, getSeriesFunc) {
        if (!seriesId || !getSeriesFunc) return [];

        const series = getSeriesFunc(seriesId);
        if (!series || !series.sledClasses) return [];

        return series.sledClasses;
    },

    /**
     * Merge event and series classes
     * @param {Object} event - Event object
     * @param {Object} series - Series object
     * @returns {Array} Merged class settings
     */
    mergeEventAndSeriesClasses(event, series) {
        if (!series || !series.sledClasses) return [];

        // If event has class settings, use those
        if (event.classSettings && event.classSettings.length > 0) {
            return event.classSettings.map(cs => {
                const seriesClass = series.sledClasses.find(sc => sc.id === cs.classId);
                return {
                    ...cs,
                    name: seriesClass ? seriesClass.name : cs.classId,
                    defaultFee: seriesClass ? seriesClass.defaultFee : 0
                };
            });
        }

        // Fallback: create default settings from series classes
        return series.sledClasses.map(sc => ({
            classId: sc.id,
            name: sc.name,
            enabled: true,
            price: sc.defaultFee || 0,
            defaultFee: sc.defaultFee || 0
        }));
    },

    // ============================================================================
    // UTILITY FUNCTIONS
    // ============================================================================

    /**
     * Format event date for display
     * @param {string} dateString - ISO date string
     * @returns {string} Formatted date
     */
    formatEventDate(dateString) {
        if (!dateString) return 'TBD';
        
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (error) {
            return dateString;
        }
    },

    /**
     * Check if event is today
     * @param {Object} event - Event object
     * @returns {boolean} True if event is today
     */
    isEventToday(event) {
        if (!event.date) return false;

        const eventDate = new Date(event.date);
        const today = new Date();
        
        return eventDate.toDateString() === today.toDateString();
    },

    /**
     * Check if event is upcoming
     * @param {Object} event - Event object
     * @returns {boolean} True if event is in the future
     */
    isEventUpcoming(event) {
        if (!event.date) return false;

        const eventDate = new Date(event.date);
        const now = new Date();
        
        return eventDate > now;
    },

    /**
     * Check if event is past
     * @param {Object} event - Event object
     * @returns {boolean} True if event is in the past
     */
    isEventPast(event) {
        if (!event.date) return false;

        const eventDate = new Date(event.date);
        const now = new Date();
        
        return eventDate < now;
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventLogic;
}

// Make available globally
if (typeof window !== 'undefined') {
    window.EventLogic = EventLogic;
}

