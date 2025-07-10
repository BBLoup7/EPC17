/**
 * Data Management for Snowmobile Drag Racing Event Manager
 * Server-based data persistence via REST API with real-time notifications
 * SIMPLIFIED: Single storage strategy using server API only
 */

class DataManager {
    constructor() {
        console.log('🏁 Initializing DataManager with server API (SIMPLIFIED)');
        this.baseUrl = this.getBaseUrl();
        this.data = {
            participants: [],
            series: [],
            events: [],
            races: [],
            raceBrackets: {}
        };
        
        // Performance optimizations
        this.loadedDataTypes = new Set(); // Track what's been loaded
        this.paginationCache = new Map(); // Cache paginated results
        this.statsCache = new Map(); // Cache calculated statistics
        this.lastLoadTime = new Map(); // Track when data was last loaded
        this.loadingPromises = new Map(); // Prevent duplicate loads
        
        // Initialize event bus and statistics manager
        this.eventBus = null;
        this.statisticsManager = null;
        this.initializeIntegrations();
    }

    /**
     * Initialize integrations with other systems
     */
    initializeIntegrations() {
        // Initialize event bus if available
        if (typeof globalEventBus !== 'undefined') {
            this.eventBus = globalEventBus;
            console.log('📡 DataManager connected to global event bus');
        } else if (typeof window !== 'undefined' && window.globalEventBus) {
            this.eventBus = window.globalEventBus;
            console.log('📡 DataManager connected to window event bus');
        }
        
        // Initialize statistics manager
        if (typeof StatisticsManager !== 'undefined') {
            this.statisticsManager = new StatisticsManager(this);
            if (this.eventBus) {
                this.statisticsManager.setEventBus(this.eventBus);
            }
            console.log('📊 StatisticsManager initialized and connected');
        }
    }

    /**
     * Get the base URL for API calls
     */
    getBaseUrl() {
        // Always use the current host to avoid 127.0.0.1 vs localhost issues
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        const port = window.location.port || '5000';
        return `${protocol}//${hostname}:${port}/api`;
    }

    /**
     * SIMPLIFIED: Load data from server only
     */
    async loadFromStorage(dataTypes = null) {
        console.log('📡 Loading data from server (SIMPLIFIED)...');
        
        // If no specific types requested, load essential data first
        if (!dataTypes) {
            dataTypes = ['series', 'events', 'race-brackets']; // Load core data first including race brackets
        }
        
        try {
            // Load requested data types in parallel, but only if not already loaded
            const loadPromises = dataTypes
                .filter(type => !this.loadedDataTypes.has(type))
                .map(async (type) => {
                    if (this.loadingPromises.has(type)) {
                        return this.loadingPromises.get(type);
                    }
                    
                    let loadPromise;
                    
                    // Handle race-brackets specially
                    if (type === 'race-brackets') {
                        loadPromise = this.loadRaceBrackets().catch(() => ({}));
                    } else {
                        loadPromise = this.fetchFromServer(type).catch(() => []);
                    }
                    
                    this.loadingPromises.set(type, loadPromise);
                    
                    const data = await loadPromise;
                    
                    // For race-brackets, data is already stored in this.data.raceBrackets by loadRaceBrackets
                    if (type !== 'race-brackets') {
                        // Map data types to correct property names
                        const propertyMap = {
                            'participant': 'participants',
                            'participants': 'participants',
                            'series': 'series',
                            'event': 'events',
                            'events': 'events',
                            'race': 'races',
                            'races': 'races'
                        };
                        const propertyName = propertyMap[type] || type + 's';
                        this.data[propertyName] = data;
                    }
                    
                    this.loadedDataTypes.add(type);
                    this.lastLoadTime.set(type, Date.now());
                    this.loadingPromises.delete(type);
                    
                    if (type === 'race-brackets') {
                        console.log(`✅ ${type} loaded from server: ${Object.keys(data).length} events`);
                    } else {
                        console.log(`✅ ${type} loaded from server: ${Array.isArray(data) ? data.length : 'object'}`);
                    }
                    return data;
                });
            
            if (loadPromises.length > 0) {
                await Promise.all(loadPromises);
            }
            
        } catch (error) {
            console.error('❌ Failed to load data from server:', error);
            throw error;
        }
        
        return true;
    }

    /**
     * SIMPLIFIED: Fetch from server
     */
    async fetchFromServer(endpoint) {
        const url = `${this.baseUrl}/${endpoint}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            if (response.status === 404) {
                console.log(`📭 ${endpoint} not found on server (404) - this is normal for new items`);
                return [];
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Handle paginated responses from server
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            // Check if this is a paginated response
            if (data.series && Array.isArray(data.series)) {
                return data.series; // Return just the series array
            }
            if (data.events && Array.isArray(data.events)) {
                return data.events; // Return just the events array
            }
            if (data.participants && Array.isArray(data.participants)) {
                return data.participants; // Return just the participants array
            }
            if (data.races && Array.isArray(data.races)) {
                return data.races; // Return just the races array
            }
        }
        
        // Return data as-is if it's already an array or not paginated
        return data;
    }

    /**
     * SIMPLIFIED: Save to server
     */
    async saveToServer(endpoint, data, isUpdate = false) {
        const url = `${this.baseUrl}/${endpoint}`;
        const method = isUpdate ? 'PUT' : 'POST';
        const finalUrl = isUpdate ? `${url}/${data.id}` : url;
        
        const response = await fetch(finalUrl, {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    }

    /**
     * SIMPLIFIED: Delete from server
     */
    async deleteFromServer(endpoint, id) {
        const url = `${this.baseUrl}/${endpoint}/${id}`;
        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    }

    /**
     * SIMPLIFIED: Get participants with pagination and filtering
     */
    async getParticipants(filters = {}, page = 1, limit = 50) {
        // Check if we need to load participants
        if (!this.loadedDataTypes.has('participants')) {
            await this.loadFromStorage(['participants']);
        }
        
        let participants = this.data.participants;
        
        // Apply filters
        if (filters.eventId) {
            participants = participants.filter(p => 
                p.events && p.events.includes(filters.eventId)
            );
        }
        if (filters.seriesId) {
            participants = participants.filter(p => 
                p.series && p.series.includes(filters.seriesId)
            );
        }
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            participants = participants.filter(p => 
                p.name && p.name.toLowerCase().includes(searchLower)
            );
        }
        if (filters.class) {
            participants = participants.filter(p => 
                p.classes && p.classes.includes(filters.class)
            );
        }
        
        // Apply pagination
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedParticipants = participants.slice(startIndex, endIndex);
        
        return {
            participants: paginatedParticipants,
            total: participants.length,
            page,
            limit,
            totalPages: Math.ceil(participants.length / limit)
        };
    }

    /**
     * SIMPLIFIED: Get events with pagination and filtering
     */
    async getEvents(filters = {}, page = 1, limit = 20) {
        // Check if we need to load events
        if (!this.loadedDataTypes.has('events')) {
            await this.loadFromStorage(['events']);
        }
        
        let events = this.data.events;
        
        // Apply filters
        if (filters.seriesId) {
            events = events.filter(e => e.seriesId === filters.seriesId);
        }
        if (filters.seasonId) {
            events = events.filter(e => e.seasonId === filters.seasonId);
        }
        if (filters.status) {
            events = events.filter(e => e.status === filters.status);
        }
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            events = events.filter(e => 
                e.name && e.name.toLowerCase().includes(searchLower)
            );
        }
        
        // Apply pagination
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedEvents = events.slice(startIndex, endIndex);
        
        return {
            events: paginatedEvents,
            total: events.length,
            page,
            limit,
            totalPages: Math.ceil(events.length / limit)
        };
    }

    /**
     * SIMPLIFIED: Load race brackets from server with enhanced logging
     */
    async loadRaceBrackets() {
        try {
            console.log('🔄 Loading race brackets from server...');
            const brackets = await this.fetchFromServer('race-brackets');
            if (Array.isArray(brackets)) {
                // Convert array to eventId-keyed object
                const bracketMap = {};
                brackets.forEach(bracket => {
                    if (bracket.eventId) {
                        bracketMap[bracket.eventId] = bracket;
                        console.log(`   📋 Loaded bracket for event ${bracket.eventId}: ID ${bracket.id}`);
                    } else {
                        console.warn('   ⚠️ Bracket missing eventId:', bracket);
                    }
                });
                this.data.raceBrackets = bracketMap;
                console.log(`🏁 Race brackets loaded from server: ${brackets.length} brackets total`);
                
                // Log the structure for debugging
                console.log('📊 Bracket cache structure:', Object.keys(bracketMap).length, 'events with brackets');
                
                return bracketMap;
            } else {
                console.warn('⚠️ Server returned non-array for race brackets:', brackets);
                return {};
            }
        } catch (error) {
            console.error('❌ Failed to load race brackets from server:', error);
            // Initialize empty brackets map to prevent errors
            this.data.raceBrackets = {};
            return {};
        }
    }

    // Participant Management
    /**
     * SIMPLIFIED: Add new participant via server only
     */
    async addParticipant(participantData) {
        try {
            // Generate ID if not provided
            if (!participantData.id) {
                participantData.id = 'participant_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            }
            
            // Add timestamps
            participantData.createdAt = new Date().toISOString();
            participantData.updatedAt = new Date().toISOString();
            
            // Save to server
            const savedParticipant = await this.saveToServer('participants', participantData, false);
            
            // Update local data cache
            this.data.participants.push(savedParticipant);
            
            // Broadcast participant added event
            if (this.eventBus) {
                this.eventBus.emit('participant-added', {
                    participant: savedParticipant,
                    timestamp: new Date().toISOString()
                });
            }
            
            console.log('✅ Participant added via server:', savedParticipant.id);
            return savedParticipant;
        } catch (error) {
            console.error('Failed to add participant:', error);
            throw error;
        }
    }

    /**
     * SIMPLIFIED: Update participant via server only
     */
    async updateParticipant(id, updates) {
        try {
            const index = this.data.participants.findIndex(p => p.id === id);
            if (index === -1) {
                throw new Error('Participant not found');
            }

            // Add updated timestamp
            updates.updatedAt = new Date().toISOString();
            
            // Update the participant (merge with existing data)
            const updatedParticipant = { ...this.data.participants[index], ...updates };

            // Save to server
            const savedParticipant = await this.saveToServer('participants', updatedParticipant, true);
            
            // Update local data cache
            this.data.participants[index] = savedParticipant;
            
            // Broadcast participant updated event
            if (this.eventBus) {
                this.eventBus.emit('participant-updated', {
                    participant: savedParticipant,
                    timestamp: new Date().toISOString()
                });
            }
            
            console.log('✅ Participant updated via server:', id);
            return savedParticipant;
        } catch (error) {
            console.error('Failed to update participant:', error);
            throw error;
        }
    }

    /**
     * Get participant by ID
     */
    getParticipant(id) {
        return this.data.participants.find(p => p.id === id);
    }

    /**
     * Get all participants as a simple array (synchronous)
     * For component compatibility - returns array directly
     */
    getParticipantsArray() {
        return this.data.participants || [];
    }

    /**
     * Get all events as a simple array (synchronous)
     * For component compatibility - returns array directly
     */
    getEventsArray() {
        return this.data.events || [];
    }

    /**
     * SIMPLIFIED: Delete participant via server only
     */
    async deleteParticipant(id) {
        try {
            // Delete from server
            await this.deleteFromServer('participants', id);
            
            // Update local data cache
                const index = this.data.participants.findIndex(p => p.id === id);
                if (index !== -1) {
                    const participant = this.data.participants[index];
                    this.data.participants.splice(index, 1);

                // Broadcast participant deleted event
                if (this.eventBus) {
                    this.eventBus.emit('participant-deleted', {
                        participantId: id,
                        participantName: participant.name,
                        timestamp: new Date().toISOString()
                    });
                }

                console.log('✅ Participant deleted via server:', participant.name);
                return true;
            }
            
                throw new Error('Participant not found');
        } catch (error) {
            console.error('Failed to delete participant:', error);
            throw error;
        }
    }

    // Series Management
    /**
     * SIMPLIFIED: Add new series via server only
     */
    async addSeries(seriesData) {
        try {
            // Generate ID if not provided
            if (!seriesData.id) {
                seriesData.id = 'series_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            }
            
            // Add timestamps
            seriesData.createdAt = new Date().toISOString();
            seriesData.updatedAt = new Date().toISOString();
            
            // Save to server
            const savedSeries = await this.saveToServer('series', seriesData, false);
            
            // Update local data cache
            this.data.series.push(savedSeries);
            
            // Broadcast series added event
            if (this.eventBus) {
                this.eventBus.emit('series-added', {
                    series: savedSeries,
                    timestamp: new Date().toISOString()
                });
            }
            
            console.log('✅ Series added via server:', savedSeries.id);
            return savedSeries;
        } catch (error) {
            console.error('Failed to add series:', error);
            throw error;
        }
    }

    /**
     * Get all series
     */
    getAllSeries() {
        // Ensure series data is loaded
        if (!this.loadedDataTypes.has('series')) {
            console.warn('⚠️ Series data not loaded, returning empty array');
            return [];
        }
        return [...this.data.series];
    }

    /**
     * Get series by ID
     */
    getSeries(id) {
        return this.data.series.find(s => s.id === id);
    }

    /**
     * SIMPLIFIED: Update series via server only
     */
    async updateSeries(id, updates) {
        try {
            const index = this.data.series.findIndex(s => s.id === id);
            if (index === -1) {
                throw new Error('Series not found');
            }

            // Add updated timestamp
            updates.updatedAt = new Date().toISOString();

            // Update the series (merge with existing data)
            const updatedSeries = { ...this.data.series[index], ...updates };

            // Save to server
            const savedSeries = await this.saveToServer('series', updatedSeries, true);
            
            // Update local data cache
            this.data.series[index] = savedSeries;

            // Broadcast series updated event
            if (this.eventBus) {
                this.eventBus.emit('series-updated', {
                    series: savedSeries,
                    timestamp: new Date().toISOString()
                });
            }

            console.log('✅ Series updated via server:', id);
            return savedSeries;
        } catch (error) {
            console.error('Failed to update series:', error);
            throw error;
        }
    }

    /**
     * SIMPLIFIED: Delete series via server only
     */
    async deleteSeries(id) {
        try {
            // Find the series first
            const index = this.data.series.findIndex(s => s.id === id);
            if (index === -1) {
                throw new Error('Series not found');
            }

            const series = this.data.series[index];
            
            // Delete from server
            await this.deleteFromServer('series', id);
            
            // Update local data cache
            this.data.series.splice(index, 1);

            // Remove associated events
            this.data.events = this.data.events.filter(event => event.seriesId !== id);

            // Remove series from participants
            this.data.participants.forEach(participant => {
                if (participant.series && participant.series.includes(id)) {
                    participant.series = participant.series.filter(sId => sId !== id);
                }
            });

            // Broadcast series deleted event
            if (this.eventBus) {
                this.eventBus.emit('series-deleted', {
                    seriesId: id,
                    seriesName: series.name,
                    timestamp: new Date().toISOString()
                });
            }
            
            console.log('✅ Series deleted via server:', series.name);
            return true;
        } catch (error) {
            console.error('Failed to delete series:', error);
            throw error;
        }
    }

    // Event Management
    /**
     * SIMPLIFIED: Add new event via server only
     */
    async addEvent(eventData) {
        try {
            // Generate ID if not provided
            if (!eventData.id) {
                eventData.id = 'event_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            }
            
            // Add timestamps
            eventData.createdAt = new Date().toISOString();
            eventData.updatedAt = new Date().toISOString();
            
            // Save to server
            const savedEvent = await this.saveToServer('events', eventData, false);
            
            // Update local data cache
            this.data.events.push(savedEvent);
            
            // Broadcast event added event
            if (this.eventBus) {
                this.eventBus.emit('event-added', {
                    event: savedEvent,
                    timestamp: new Date().toISOString()
                });
            }
            
            console.log('✅ Event added via server:', savedEvent.id);
            return savedEvent;
        } catch (error) {
            console.error('Failed to add event:', error);
            throw error;
        }
    }

    /**
     * Get events from local cache (for backward compatibility)
     * Use getEvents(filters, page, limit) for server loading
     */
    getEventsFromCache(filters = {}) {
        let events = this.data.events;
        
        if (filters.seriesId) {
            events = events.filter(e => e.seriesId === filters.seriesId);
        }
        if (filters.seasonId) {
            events = events.filter(e => e.seasonId === filters.seasonId);
        }
        if (filters.status) {
            events = events.filter(e => e.status === filters.status);
        }

        return events;
    }

    /**
     * Get event by ID
     */
    getEvent(id) {
        return this.data.events.find(e => e.id === id);
    }

    /**
     * SIMPLIFIED: Update event via server only
     */
    async updateEvent(id, updates) {
        try {
            const index = this.data.events.findIndex(e => e.id === id);
            if (index === -1) {
            throw new Error('Event not found');
            }

            // Add updated timestamp
            updates.updatedAt = new Date().toISOString();

            // Update the event (merge with existing data)
            const updatedEvent = { ...this.data.events[index], ...updates };

            // Save to server
            const savedEvent = await this.saveToServer('events', updatedEvent, true);
            
            // Update local data cache
            this.data.events[index] = savedEvent;
            
            // Broadcast event updated event
            if (this.eventBus) {
                this.eventBus.emit('event-updated', {
                    event: savedEvent,
                    timestamp: new Date().toISOString()
                });
            }
            
            console.log('✅ Event updated via server:', id);
            return savedEvent;
        } catch (error) {
            console.error('Failed to update event:', error);
            throw error;
        }
    }

    /**
     * SIMPLIFIED: Delete event via server only
     */
    async deleteEvent(id) {
        try {
            // Find the event first
            const index = this.data.events.findIndex(e => e.id === id);
            if (index === -1) {
                throw new Error('Event not found');
            }

            const event = this.data.events[index];
            
            // Delete from server
            await this.deleteFromServer('events', id);
            
            // Update local data cache
            this.data.events.splice(index, 1);

            // Broadcast event deleted event
            if (this.eventBus) {
                this.eventBus.emit('event-deleted', {
                    eventId: id,
                    eventName: event.name,
                    timestamp: new Date().toISOString()
                });
            }
            
            console.log('✅ Event deleted via server:', event.name);
            return true;
        } catch (error) {
            console.error('Failed to delete event:', error);
            throw error;
        }
    }

    /**
     * Register participant for event
     */
    async registerParticipantForEvent(eventId, participantId) {
        try {
            console.log(`📝 Registering participant ${participantId} for event ${eventId}`);
            
            // Find the event
            const event = this.getEvent(eventId);
            if (!event) {
                throw new Error('Event not found');
            }
            
            // Check if participant exists
            const participant = this.getParticipant(participantId);
            if (!participant) {
                throw new Error('Participant not found');
            }
            
            // Initialize participants array if it doesn't exist
            if (!event.participants) {
                event.participants = [];
            }
            
            // Check if participant is already registered
            if (event.participants.includes(participantId)) {
                console.log(`⚠️ Participant ${participantId} is already registered for event ${eventId}`);
                return true; // Already registered, return success
            }
            
            // Check if event is full
            if (event.maxParticipants && event.participants.length >= event.maxParticipants) {
                throw new Error('Event is full');
            }
            
            // Add participant to event
            event.participants.push(participantId);
            
            // 🔧 CRITICAL FIX: Also set the participant's eventId field for race system compatibility
            const updatedParticipant = {
                ...participant,
                eventId: eventId
            };
            
            // Update both event and participant
            const [updatedEvent, updatedParticipantRecord] = await Promise.all([
                this.updateEvent(eventId, {
                    participants: event.participants
                }),
                this.updateParticipant(participantId, updatedParticipant)
            ]);
            
            console.log(`🔧 Updated participant ${participant.name} eventId to ${eventId}`);
            
            // Broadcast participant registered event
            if (this.eventBus) {
                this.eventBus.emit('participant-registered', {
                    eventId,
                    participantId,
                    eventName: event.name,
                    participantName: participant.name,
                    timestamp: new Date().toISOString()
                });
            }
            
            console.log(`✅ Participant ${participant.name} registered for event ${event.name}`);
            return true;
        } catch (error) {
            console.error('Failed to register participant for event:', error);
            throw error;
        }
    }

    /**
     * Remove participant from event
     */
    async removeParticipantFromEvent(eventId, participantId) {
        try {
            console.log(`📝 Removing participant ${participantId} from event ${eventId}`);
            
            // Find the event
            const event = this.getEvent(eventId);
            if (!event) {
                throw new Error('Event not found');
            }
            
            // Check if participant exists
            const participant = this.getParticipant(participantId);
            if (!participant) {
                throw new Error('Participant not found');
            }
            
            // Initialize participants array if it doesn't exist
            if (!event.participants) {
                event.participants = [];
            }
            
            // Find and remove participant
            const participantIndex = event.participants.indexOf(participantId);
            if (participantIndex === -1) {
                console.log(`⚠️ Participant ${participantId} is not registered for event ${eventId}`);
                return true; // Not registered, return success
            }
            
            // Remove participant from event
            event.participants.splice(participantIndex, 1);
            
            // 🔧 CRITICAL FIX: Also clear the participant's eventId field if this was their only event
            const updatedParticipant = {
                ...participant,
                eventId: null  // Clear eventId when removing from event
            };
            
            // Update both event and participant
            const [updatedEvent, updatedParticipantRecord] = await Promise.all([
                this.updateEvent(eventId, {
                    participants: event.participants
                }),
                this.updateParticipant(participantId, updatedParticipant)
            ]);
            
            console.log(`🔧 Cleared participant ${participant.name} eventId`);
            
            // Broadcast participant removed event
            if (this.eventBus) {
                this.eventBus.emit('participant-removed', {
                    eventId,
                    participantId,
                    eventName: event.name,
                    participantName: participant.name,
                    timestamp: new Date().toISOString()
                });
            }
            
            console.log(`✅ Participant ${participant.name} removed from event ${event.name}`);
            return true;
        } catch (error) {
            console.error('Failed to remove participant from event:', error);
            throw error;
        }
    }

    /**
     * 🔧 MIGRATION FUNCTION: Fix existing participants with missing eventId fields
     */
    async migrateParticipantEventIds() {
        try {
            console.log('🔄 Starting participant eventId migration...');
            
            const allParticipants = this.getParticipantsArray();
            const allEvents = this.getEventsArray();
            
            let fixedCount = 0;
            
            // Check each event for participants that need eventId field
            for (const event of allEvents) {
                if (!event.participants || event.participants.length === 0) continue;
                
                for (const participantId of event.participants) {
                    const participant = allParticipants.find(p => p.id === participantId);
                    if (!participant) {
                        console.warn(`⚠️ Participant ${participantId} not found in participants list`);
                        continue;
                    }
                    
                    // Check if participant is missing eventId
                    if (!participant.eventId || participant.eventId !== event.id) {
                        console.log(`🔧 Fixing participant ${participant.name} eventId: ${participant.eventId} -> ${event.id}`);
                        
                        const updatedParticipant = {
                            ...participant,
                            eventId: event.id
                        };
                        
                        await this.updateParticipant(participantId, updatedParticipant);
                        fixedCount++;
                    }
                }
            }
            
            console.log(`✅ Migration complete: Fixed ${fixedCount} participants`);
            return fixedCount;
        } catch (error) {
            console.error('Migration failed:', error);
            throw error;
        }
    }

    // Race Management
    /**
     * SIMPLIFIED: Add new race via server only
     */
    async addRace(raceData) {
        try {
            // Generate ID if not provided
            if (!raceData.id) {
                raceData.id = 'race_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            }
            
            // Add timestamps
            raceData.createdAt = new Date().toISOString();
            raceData.updatedAt = new Date().toISOString();
            
            // Save to server
            const savedRace = await this.saveToServer('races', raceData, false);
            
            // Update local data cache
            this.data.races.push(savedRace);
            
            // Broadcast race added event
            if (this.eventBus) {
                this.eventBus.emit('race-added', {
                    race: savedRace,
                    timestamp: new Date().toISOString()
                });
            }
            
            console.log('✅ Race added via server:', savedRace.id);
            return savedRace;
        } catch (error) {
            console.error('Failed to add race:', error);
            throw error;
        }
    }

    /**
     * SIMPLIFIED: Save race bracket via server only with robust error handling
     */
    async saveRaceBracket(eventId, bracketData) {
        try {
            // Ensure the bracket has an eventId
            bracketData.eventId = eventId;
            
            // Check if bracket already exists in local cache
            const existingBracket = this.data.raceBrackets[eventId];
            let savedBracket;
            
            if (existingBracket && existingBracket.id) {
                // Try to update existing bracket using PUT
                console.log('🔄 Attempting to update existing race bracket for event:', eventId, 'with ID:', existingBracket.id);
                bracketData.id = existingBracket.id;
                
                try {
                    savedBracket = await this.updateRaceBracket(existingBracket.id, bracketData);
                    console.log('✅ Successfully updated existing race bracket');
                } catch (updateError) {
                    // If update fails (404 - bracket doesn't exist on server), create new one
                    if (updateError.message.includes('404') || updateError.message.includes('not found')) {
                        console.warn('⚠️ Bracket not found on server, creating new one instead');
                        // Remove ID to force creation of new bracket
                        delete bracketData.id;
                        savedBracket = await this.saveToServer('race-brackets', bracketData, false);
                        console.log('✅ Created new race bracket after update failed');
                    } else {
                        // Re-throw other errors
                        throw updateError;
                    }
                }
            } else {
                // Create new bracket using POST
                console.log('📝 Creating new race bracket for event:', eventId);
                savedBracket = await this.saveToServer('race-brackets', bracketData, false);
            }
                
            // Update local data cache
            this.data.raceBrackets[eventId] = savedBracket;
            
            // Broadcast bracket saved event
            if (this.eventBus) {
                this.eventBus.emit('race-bracket-saved', {
                    eventId,
                    bracket: savedBracket,
                    timestamp: new Date().toISOString()
                });
            }
            
            console.log('✅ Race bracket saved via server for event:', eventId, 'Final ID:', savedBracket.id);
            return savedBracket;
        } catch (error) {
            console.error('❌ Failed to save race bracket for event:', eventId, error);
            
            // Try one more fallback: create a completely new bracket
            try {
                console.log('🔄 Attempting fallback: creating fresh bracket...');
                const fallbackData = { ...bracketData };
                delete fallbackData.id; // Remove any existing ID
                const fallbackBracket = await this.saveToServer('race-brackets', fallbackData, false);
                
                // Update local cache
                this.data.raceBrackets[eventId] = fallbackBracket;
                
                console.log('✅ Fallback bracket creation succeeded:', fallbackBracket.id);
                return fallbackBracket;
            } catch (fallbackError) {
                console.error('❌ Fallback bracket creation also failed:', fallbackError);
                throw new Error(`All bracket save attempts failed. Original: ${error.message}, Fallback: ${fallbackError.message}`);
            }
        }
    }

    /**
     * Update existing race bracket
     */
    async updateRaceBracket(bracketId, bracketData) {
        try {
            const response = await fetch(`${this.baseUrl}/race-brackets/${bracketId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(bracketData)
            });

            if (!response.ok) {
                // Create detailed error message with status code
                const errorText = await response.text().catch(() => '');
                let errorMessage = `HTTP error! status: ${response.status}`;
                
                if (response.status === 404) {
                    errorMessage += ' - Race bracket not found on server';
                } else if (errorText) {
                    try {
                        const errorJson = JSON.parse(errorText);
                        errorMessage += ` - ${errorJson.error || errorText}`;
                    } catch {
                        errorMessage += ` - ${errorText}`;
                    }
                }
                
                const error = new Error(errorMessage);
                error.status = response.status;
                throw error;
            }

            const savedBracket = await response.json();
            console.log('✅ Race bracket updated via server:', bracketId);
            return savedBracket;
        } catch (error) {
            console.error('❌ Failed to update race bracket:', bracketId, error.message);
            throw error;
        }
    }

    /**
     * Get race bracket by event ID
     */
    getRaceBracket(eventId) {
        return this.data.raceBrackets[eventId] || null;
    }

    // Utility Methods
    /**
     * Generate a unique ID
     */
    generateId() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // Fallback for browsers that don't support crypto.randomUUID
        return 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Get server health status
     */
    async getServerHealth() {
        try {
            const response = await fetch(`${this.baseUrl}/health`);
            if (response.ok) {
            return await response.json();
            }
            throw new Error(`Server health check failed: ${response.status}`);
        } catch (error) {
            console.error('Server health check failed:', error);
            return { status: 'error', message: error.message };
        }
    }

    /**
     * Clear all data from server and local cache
     */
    async clearAllData() {
        try {
            console.log('🧹 Clearing all data from server and local cache...');
            
            // Clear local data cache
            this.data = {
                participants: [],
                series: [],
                events: [],
                races: [],
                raceBrackets: {}
            };
            
            // Clear loaded data types tracking
            this.loadedDataTypes.clear();
            this.paginationCache.clear();
            this.statsCache.clear();
            this.lastLoadTime.clear();
            this.loadingPromises.clear();
            
            // Clear data from server by calling clear endpoints
            try {
                const response = await fetch(`${this.baseUrl}/clear-all`, { method: 'DELETE' });
                if (response.ok) {
                    console.log('✅ Server data cleared');
                } else {
                    console.warn('⚠️ Server clear endpoint returned error:', response.status);
                }
            } catch (serverError) {
                console.warn('⚠️ Server clear endpoint not available, only cleared local cache:', serverError);
            }
            
            // Broadcast data cleared event
            if (this.eventBus) {
                this.eventBus.emit('data-cleared', {
                    timestamp: new Date().toISOString()
                });
            }
            
            console.log('✅ All data cleared successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to clear all data:', error);
            throw error;
        }
    }

    /**
     * Debug data storage status
     */
    debugDataStorage() {
        console.log('=== DATA STORAGE DEBUG (SERVER-ONLY) ===');
        
        // Memory data
        console.log('📊 Data in memory:');
        console.log(`   - Participants: ${this.data.participants.length}`);
        console.log(`   - Series: ${this.data.series.length}`);
        console.log(`   - Events: ${this.data.events.length}`);
        console.log(`   - Races: ${this.data.races.length}`);
        
        // Loaded data types
        console.log('📋 Loaded data types:', Array.from(this.loadedDataTypes));
        
        // Server health
        this.getServerHealth().then(health => {
            console.log('🏥 Server health:', health);
        });
        
        console.log('=========================');
        
        return {
            memory: {
                participants: this.data.participants.length,
                series: this.data.series.length,
                events: this.data.events.length,
                races: this.data.races.length
            },
            loadedTypes: Array.from(this.loadedDataTypes)
        };
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataManager;
                    } else {
window.DataManager = DataManager;
} 