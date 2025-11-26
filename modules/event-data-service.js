/**
 * EventDataService - Single Source of Truth for Event Data
 * 
 * Responsibilities:
 * - All event CRUD operations
 * - Participant registration/removal for events
 * - Event-series linking
 * - Event status management (centralized)
 * - Data validation before save
 * 
 * Part of EPC17 Event Management System
 * Architecture: Clean separation of concerns following Series refactor pattern
 */

class EventDataService {
    constructor(dataManager) {
        if (!dataManager) {
            throw new Error('DataManager is required for EventDataService');
        }
        this.dataManager = dataManager;
        window.debugLogger?.init('EventData', 'EventDataService initialized');
    }

    // ============================================================================
    // CRUD OPERATIONS
    // ============================================================================

    /**
     * Get event by ID
     * @param {string} eventId - Event ID
     * @returns {Object|null} Event object or null if not found
     */
    getEvent(eventId) {
        if (!eventId) {
            console.warn('getEvent: eventId is required');
            return null;
        }
        // Access data directly to avoid circular dependency with dataManager.getEvent()
        if (!this.dataManager.data || !this.dataManager.data.events) {
            console.warn('getEvent: Events not loaded');
            return null;
        }
        return this.dataManager.data.events.find(e => e.id === eventId) || null;
    }

    /**
     * Get all events with optional filters
     * @param {Object} filters - Filter criteria
     * @param {number} page - Page number (default 1)
     * @param {number} limit - Items per page (default 1000)
     * @returns {Promise<Object>} Paginated events result
     */
    async getAllEvents(filters = {}, page = 1, limit = 1000) {
        try {
            return await this.dataManager.getEvents(filters, page, limit);
        } catch (error) {
            console.error('Failed to get events:', error);
            throw error;
        }
    }

    /**
     * Get events as array (synchronous)
     * @returns {Array} Array of events
     */
    getEventsArray() {
        return this.dataManager.getEventsArray() || [];
    }

    /**
     * Create new event
     * @param {Object} eventData - Event data
     * @returns {Promise<Object>} Created event
     */
    async createEvent(eventData) {
        try {
            // Ensure required fields
            if (!eventData.name) {
                throw new Error('Event name is required');
            }
            if (!eventData.location) {
                throw new Error('Event location is required');
            }
            if (!eventData.date) {
                throw new Error('Event date is required');
            }

            // Set defaults
            const eventToCreate = {
                ...eventData,
                status: eventData.status || 'upcoming',
                participants: eventData.participants || [],
                classSettings: eventData.classSettings || [],
                registrationOpen: eventData.registrationOpen !== undefined ? eventData.registrationOpen : true,
                requiresClassSeparation: eventData.requiresClassSeparation !== undefined ? eventData.requiresClassSeparation : true,
                freeRunEnabled: eventData.freeRunEnabled || false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            window.debugLogger?.debug('EventData', 'Creating event:', eventToCreate.name);
            
            // FIXED: Call saveToServer directly to avoid circular dependency with dataManager.addEvent()
            const result = await this.dataManager.saveToServer('events', eventToCreate, false);
            
            window.debugLogger?.debug('EventData', 'Event created successfully:', result.id);
            return result;
        } catch (error) {
            console.error('Failed to create event:', error);
            throw error;
        }
    }

    /**
     * Update existing event
     * @param {string} eventId - Event ID
     * @param {Object} updates - Updated fields
     * @returns {Promise<Object>} Updated event
     */
    async updateEvent(eventId, updates) {
        try {
            if (!eventId) {
                throw new Error('Event ID is required');
            }

            const existingEvent = this.getEvent(eventId);
            if (!existingEvent) {
                throw new Error(`Event not found: ${eventId}`);
            }

            // Merge existing event data with updates
            const updatedData = {
                ...existingEvent,
                ...updates,
                id: eventId, // Ensure ID is preserved
                updatedAt: new Date().toISOString()
            };

            window.debugLogger?.debug('EventData', 'Updating event:', eventId);
            
            // FIXED: Use direct database operation to avoid circular dependency
            const result = await this.dataManager.saveToServer('events', updatedData, true);
            
            window.debugLogger?.debug('EventData', 'Event updated successfully:', eventId);
            return result;
        } catch (error) {
            console.error('Failed to update event:', error);
            throw error;
        }
    }

    /**
     * Delete event
     * @param {string} eventId - Event ID
     * @returns {Promise<boolean>} Success status
     */
    async deleteEvent(eventId) {
        try {
            if (!eventId) {
                throw new Error('Event ID is required');
            }

            const event = this.getEvent(eventId);
            if (!event) {
                throw new Error(`Event not found: ${eventId}`);
            }

            window.debugLogger?.debug('EventData', 'Deleting event:', eventId);
            const result = await this.dataManager.deleteEvent(eventId);
            window.debugLogger?.debug('EventData', 'Event deleted successfully:', eventId);
            return result;
        } catch (error) {
            console.error('Failed to delete event:', error);
            throw error;
        }
    }

    // ============================================================================
    // STATUS MANAGEMENT (CENTRALIZED)
    // ============================================================================

    /**
     * Update event status
     * @param {string} eventId - Event ID
     * @param {string} newStatus - New status ('upcoming', 'active', 'completed', 'cancelled')
     * @returns {Promise<boolean>} Success status
     */
    async updateEventStatus(eventId, newStatus) {
        try {
            if (!eventId) {
                throw new Error('Event ID is required');
            }

            const validStatuses = ['upcoming', 'active', 'completed', 'cancelled', 'finished'];
            if (!validStatuses.includes(newStatus)) {
                throw new Error(`Invalid status: ${newStatus}. Must be one of: ${validStatuses.join(', ')}`);
            }

            window.debugLogger?.debug('EventData', `Updating event ${eventId} status to: ${newStatus}`);
            
            // Direct server call to avoid circular dependency with dataManager.updateEventStatus()
            const response = await this.dataManager.request(`${this.dataManager.baseUrl}/events/${eventId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status: newStatus })
            });

            if (response) {
                // Update local cache
                const eventIndex = this.dataManager.data.events.findIndex(e => e.id === eventId);
                if (eventIndex !== -1) {
                    this.dataManager.data.events[eventIndex].status = newStatus;
                }
                window.debugLogger?.debug('EventData', `Event ${eventId} status updated to: ${newStatus}`);
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Failed to update event status:', error);
            throw error;
        }
    }

    /**
     * Check if event is completed (all classes finished)
     * @param {string} eventId - Event ID
     * @returns {Promise<boolean>} True if event is completed
     */
    async isEventCompleted(eventId) {
        try {
            return await this.dataManager.isEventCompleted(eventId);
        } catch (error) {
            console.error('Failed to check event completion:', error);
            return false;
        }
    }

    /**
     * Check if event can be edited
     * @param {string} eventId - Event ID
     * @returns {boolean} True if event can be edited
     */
    canEventBeEdited(eventId) {
        const event = this.getEvent(eventId);
        if (!event) return false;

        // Completed or finished events cannot be edited (tournament settings locked)
        return event.status !== 'completed' && event.status !== 'finished';
    }

    /**
     * Get event status
     * @param {string} eventId - Event ID
     * @returns {string|null} Event status or null if not found
     */
    getEventStatus(eventId) {
        const event = this.getEvent(eventId);
        return event ? event.status : null;
    }

    /**
     * Update event status based on race brackets
     * @param {string} eventId - Event ID
     * @returns {Promise<void>}
     */
    async updateEventStatusFromRaces(eventId) {
        try {
            const event = this.getEvent(eventId);
            if (!event) {
                console.warn(`Event ${eventId} not found for status update`);
                return;
            }

            const bracket = await this.dataManager.getRaceBracket(eventId);
            const hasRaces = bracket && bracket.classes && 
                Object.values(bracket.classes).some(classBracket => 
                    classBracket.rounds && classBracket.rounds.length > 0
                );

            let newStatus = event.status;
            
            if (hasRaces && event.status === 'upcoming') {
                newStatus = 'active';
                window.debugLogger?.debug('EventData', `Event ${eventId} has races - updating status from 'upcoming' to 'active'`);
            } else if (!hasRaces && event.status === 'active') {
                newStatus = 'upcoming';
                window.debugLogger?.debug('EventData', `Event ${eventId} has no races - updating status from 'active' to 'upcoming'`);
            }

            if (newStatus !== event.status) {
                await this.updateEventStatus(eventId, newStatus);
                window.debugLogger?.debug('EventData', `Event ${eventId} status updated to '${newStatus}'`);
            }
        } catch (error) {
            console.error(`Error updating event status from races for ${eventId}:`, error);
        }
    }

    // ============================================================================
    // PARTICIPANT MANAGEMENT
    // ============================================================================

    /**
     * Get participants for an event
     * @param {string} eventId - Event ID
     * @returns {Array} Array of participant objects
     */
    getEventParticipants(eventId) {
        const event = this.getEvent(eventId);
        if (!event || !event.participants) {
            return [];
        }

        return event.participants
            .map(participantId => this.dataManager.getParticipant(participantId))
            .filter(p => p !== null);
    }

    /**
     * Add participant to event
     * @param {string} eventId - Event ID
     * @param {string} participantId - Participant ID
     * @returns {Promise<boolean>} Success status
     */
    async addParticipantToEvent(eventId, participantId) {
        try {
            if (!eventId || !participantId) {
                throw new Error('Event ID and Participant ID are required');
            }

            window.debugLogger?.debug('EventData', `Adding participant ${participantId} to event ${eventId}`);
            const result = await this.dataManager.registerParticipantForEvent(eventId, participantId);
            window.debugLogger?.debug('EventData', 'Participant added to event successfully');
            return result;
        } catch (error) {
            console.error('Failed to add participant to event:', error);
            throw error;
        }
    }

    /**
     * Remove participant from event
     * @param {string} eventId - Event ID
     * @param {string} participantId - Participant ID
     * @returns {Promise<boolean>} Success status
     */
    async removeParticipantFromEvent(eventId, participantId) {
        try {
            if (!eventId || !participantId) {
                throw new Error('Event ID and Participant ID are required');
            }

            window.debugLogger?.debug('EventData', `Removing participant ${participantId} from event ${eventId}`);
            const result = await this.dataManager.removeParticipantFromEvent(eventId, participantId);
            window.debugLogger?.debug('EventData', 'Participant removed from event successfully');
            return result;
        } catch (error) {
            console.error('Failed to remove participant from event:', error);
            throw error;
        }
    }

    /**
     * Get available spots for an event
     * @param {string} eventId - Event ID
     * @returns {number|null} Available spots or null if unlimited
     */
    getAvailableSpots(eventId) {
        const event = this.getEvent(eventId);
        if (!event) return null;
        
        if (!event.maxParticipants) return null;
        return Math.max(0, event.maxParticipants - (event.participants?.length || 0));
    }

    // ============================================================================
    // SERIES/CLASS INTEGRATION
    // ============================================================================

    /**
     * Get series for an event
     * @param {string} eventId - Event ID
     * @returns {Object|null} Series object or null
     */
    getEventSeries(eventId) {
        const event = this.getEvent(eventId);
        if (!event || !event.seriesId) {
            return null;
        }
        return this.dataManager.getSeries(event.seriesId);
    }

    /**
     * Get classes for an event
     * @param {string} eventId - Event ID
     * @returns {Array} Array of class objects
     */
    getEventClasses(eventId) {
        const event = this.getEvent(eventId);
        if (!event) return [];

        const series = this.getEventSeries(eventId);
        if (!series || !series.sledClasses) return [];

        // Return classes that are enabled in event settings
        if (event.classSettings && event.classSettings.length > 0) {
            const enabledClassIds = event.classSettings
                .filter(cs => cs.enabled)
                .map(cs => cs.classId);
            
            return series.sledClasses.filter(sc => enabledClassIds.includes(sc.id));
        }

        // Fallback: return all series classes
        return series.sledClasses;
    }

    /**
     * Validate event class settings
     * @param {Object} eventData - Event data with classSettings
     * @returns {Object} Validation result { valid: boolean, errors: Array }
     */
    validateEventClassSettings(eventData) {
        const errors = [];

        if (!eventData.seriesId) {
            // No series = no class validation needed
            return { valid: true, errors: [] };
        }

        const series = this.dataManager.getSeries(eventData.seriesId);
        if (!series) {
            errors.push('Series not found');
            return { valid: false, errors };
        }

        if (!series.sledClasses || series.sledClasses.length === 0) {
            errors.push('Series has no classes defined');
            return { valid: false, errors };
        }

        // Validate class settings if provided
        if (eventData.classSettings && eventData.classSettings.length > 0) {
            eventData.classSettings.forEach((cs, index) => {
                if (!cs.classId) {
                    errors.push(`Class setting ${index + 1}: classId is required`);
                }
                
                const seriesClass = series.sledClasses.find(sc => sc.id === cs.classId);
                if (!seriesClass) {
                    errors.push(`Class setting ${index + 1}: class not found in series`);
                }

                if (cs.enabled && (cs.price === undefined || cs.price < 0)) {
                    errors.push(`Class setting ${index + 1}: valid price is required for enabled classes`);
                }
            });
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    // ============================================================================
    // RACE INTEGRATION
    // ============================================================================

    /**
     * Check if event has a race bracket
     * @param {string} eventId - Event ID
     * @returns {Promise<boolean>} True if bracket exists
     */
    async hasRaceBracket(eventId) {
        try {
            const bracket = await this.dataManager.getRaceBracket(eventId);
            return bracket !== null && bracket !== undefined;
        } catch (error) {
            console.error('Failed to check for race bracket:', error);
            return false;
        }
    }

    /**
     * Check if event can generate bracket
     * @param {string} eventId - Event ID
     * @returns {Object} { canGenerate: boolean, reason: string }
     */
    canGenerateBracket(eventId) {
        const event = this.getEvent(eventId);
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
    }

    /**
     * Delete race bracket for event
     * @param {string} eventId - Event ID
     * @returns {Promise<boolean>} Success status
     */
    async deleteRaceBracket(eventId) {
        try {
            const event = this.getEvent(eventId);
            if (!event) {
                throw new Error('Event not found');
            }

            // Delete the race bracket
            const success = this.dataManager.deleteRaceBracket(eventId);
            if (success) {
                // Update event status to 'upcoming' since no races exist
                await this.updateEventStatus(eventId, 'upcoming');
                window.debugLogger?.debug('EventData', `Race bracket deleted for event ${eventId}, status set to 'upcoming'`);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error deleting race bracket:', error);
            throw error;
        }
    }

    // ============================================================================
    // UTILITY METHODS
    // ============================================================================

    /**
     * Get event summary statistics
     * @returns {Promise<Object>} Summary statistics
     */
    async getEventSummary() {
        try {
            const result = await this.getAllEvents({}, 1, 1000);
            const allEvents = result.events || result;
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
                    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
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
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventDataService;
}

// Make available globally
if (typeof window !== 'undefined') {
    window.EventDataService = EventDataService;
}

