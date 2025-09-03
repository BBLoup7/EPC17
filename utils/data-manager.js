/**
 * Data Management for EPC17 Event Management System
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
     * OPTIMIZED: Load from storage with performance enhancements
     */
    async loadFromStorage(dataTypes = null, force = false) {
        console.log('🔄 Loading data from server with performance optimizations...');
        
        // Use performance monitoring if available
        if (window.performanceMonitor) {
            return await window.performanceMonitor.trackOperation('data_storage_load', async () => {
                return await this.loadFromStorageOptimized(dataTypes, force);
            });
        } else {
            return await this.loadFromStorageOptimized(dataTypes, force);
        }
    }

    /**
     * Internal optimized loading implementation
     */
    async loadFromStorageOptimized(dataTypes = null, force = false) {
        try {
            const typesToLoad = dataTypes || ['participants', 'events', 'series', 'race-brackets'];
            console.log('📋 Data types to load:', typesToLoad);
            
            // Create batched requests to reduce server load
            const batchSize = 2; // Load 2 data types concurrently
            const batches = [];
            
            for (let i = 0; i < typesToLoad.length; i += batchSize) {
                batches.push(typesToLoad.slice(i, i + batchSize));
            }
            
            // Process batches sequentially to prevent server overload
            for (const batch of batches) {
                const loadPromises = batch
                    .filter(type => {
                        return force || type === 'participants' || type === 'race-brackets' ||
                               !this.data[type] ||
                               (Array.isArray(this.data[type]) && this.data[type].length === 0) ||
                               (typeof this.data[type] === 'object' && Object.keys(this.data[type]).length === 0);
                    })
                    .map(async (type) => {
                        return await this.loadSingleDataTypeOptimized(type);
                    });
                
                // Wait for current batch to complete before starting next
                await Promise.all(loadPromises);
                
                // Small delay between batches to prevent overwhelming the server
                if (batches.indexOf(batch) < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }
            
            console.log('✅ Optimized data loading completed');
            
            // Initialize event statuses for existing events
            await this.initializeEventStatuses();
            
            // Cleanup old data to prevent memory leaks
            this.cleanupOldCachedData();
            
            return true;
            
        } catch (error) {
            console.error('❌ Failed to load data from server:', error);
            throw error;
        }
    }

    /**
     * Load single data type with error handling, retries, and enhanced caching
     */
    async loadSingleDataTypeOptimized(type, retryCount = 0) {
        const maxRetries = 2;
        
        // Check for cached network data first
        if (this.shouldUseCachedData(type)) {
            console.log(`📊 Using cached data for ${type}`);
            return this.data[type];
        }
        
        try {
            console.log(`🔍 Loading ${type} from server (attempt ${retryCount + 1})`);
            
            const startTime = performance.now();
            // Load all data with high limits for complete functionality
            const queryParams = type === 'participants' ? { limit: 50000 } : {};
            let url = `${this.baseUrl}/${type}`;
            
            // Add query parameters if needed
            if (Object.keys(queryParams).length > 0) {
                const params = new URLSearchParams(queryParams);
                url += `?${params.toString()}`;
            }
            
            const response = await fetch(url, {
                headers: {
                    'Cache-Control': this.getCacheControlHeader(type),
                    'Accept': 'application/json',
                    'If-Modified-Since': this.getLastModifiedHeader(type)
                }
            });
            
            const endTime = performance.now();
            const requestTime = endTime - startTime;
            
            // Log slow network requests for debugging
            if (requestTime > 800) {
                console.warn(`🐌 Slow network request: ${type} took ${requestTime.toFixed(2)}ms`);
            }
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            // Check if data was modified (304 Not Modified)
            if (response.status === 304) {
                console.log(`📊 ${type} not modified, using cached data`);
                return this.data[type];
            }
            
            const data = await response.json();
            
            // Update cache metadata
            this.updateCacheMetadata(type, response.headers);
            
            // Process data efficiently based on type
            await this.processLoadedData(type, data);
            
            return data;
            
        } catch (error) {
            console.error(`❌ Failed to load ${type}:`, error);
            
            // Enhanced retry logic for network failures
            if (retryCount < maxRetries && this.shouldRetryRequest(error)) {
                const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 5000);
                console.log(`🔄 Retrying ${type} load in ${backoffDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
                return await this.loadSingleDataTypeOptimized(type, retryCount + 1);
            }
            
            // Set empty data for failed loads to prevent app crashes
            this.setEmptyDataForType(type);
            throw error;
        }
    }

    /**
     * Process loaded data with memory-efficient techniques
     */
    async processLoadedData(type, data) {
        const startTime = performance.now();
        
        // Validate data structure before processing
        if (!this.validateDataStructure(type, data)) {
            console.warn(`⚠️ Invalid data structure for ${type}, using empty data`);
            this.setEmptyDataForType(type);
            return;
        }
        
        if (type === 'participants' && data.participants) {
            // Optimize participant data structure
            this.data[type] = this.optimizeParticipantData(data.participants);
            console.log(`✅ ${type} optimized: ${this.data[type].length} participants`);
            
            // Performance warning for large datasets
            if (data.participants.length > 10000) {
                console.warn(`⚠️ PERFORMANCE WARNING: Loaded ${data.participants.length} participants. This may cause performance issues. Consider contacting software representative for optimization.`);
            }
            
        } else if (type === 'events' && data.events) {
            // Optimize event data structure
            this.data[type] = this.optimizeEventData(data.events);
            console.log(`✅ ${type} optimized: ${this.data[type].length} events`);
            
        } else if (type === 'series' && data.series) {
            this.data[type] = data.series;
            console.log(`✅ ${type} loaded: ${this.data[type].length} series`);
            
        } else if (type === 'races' && Array.isArray(data)) {
            this.data[type] = data;
            console.log(`✅ ${type} loaded: ${data.length} races`);
            
        } else if (type === 'races' && data.races && Array.isArray(data.races)) {
            this.data[type] = data.races;
            console.log(`✅ ${type} loaded: ${data.races.length} races`);
            
        } else if (type === 'race-brackets' && Array.isArray(data)) {
            // Efficiently convert array to eventId-keyed object
            const bracketMap = new Map();
            
            // Process in chunks to prevent blocking
            const chunkSize = 20;
            for (let i = 0; i < data.length; i += chunkSize) {
                const chunk = data.slice(i, i + chunkSize);
                
                chunk.forEach(bracket => {
                    if (bracket && bracket.eventId) {
                        bracketMap.set(bracket.eventId, bracket);
                    }
                });
                
                // Yield control to prevent UI blocking
                if (i + chunkSize < data.length) {
                    await new Promise(resolve => setTimeout(resolve, 1));
                }
            }
            
            // Convert Map to plain object for compatibility
            this.data.raceBrackets = Object.fromEntries(bracketMap);
            console.log(`✅ ${type} optimized: ${data.length} brackets converted to eventId map`);
            
        } else if (Array.isArray(data)) {
            this.data[type] = data;
            console.log(`✅ ${type} loaded: ${data.length} items`);
            
        } else {
            this.data[type] = data;
            console.log(`✅ ${type} loaded: ${Object.keys(data).length} items`);
        }
        
        const endTime = performance.now();
        console.log(`⏱️ ${type} processing took ${(endTime - startTime).toFixed(2)}ms`);
    }

    /**
     * Optimize participant data for better performance
     */
    optimizeParticipantData(participants) {
        return participants.map(participant => {
            // Ensure consistent data structure
            return {
                ...participant,
                selectedClasses: participant.selectedClasses || [],
                status: participant.status || 'active',
                totalFee: typeof participant.totalFee === 'number' ? participant.totalFee : 0,
                // Pre-compute searchable text for faster filtering
                _searchText: [
                    participant.name,
                    participant.nickname,
                    participant.racingNumber,
                                    participant.vehicleMake,
                participant.vehicleModel,
                participant.vehicleYear,
                    participant.contact?.email,
                    participant.contactEmail
                ].filter(Boolean).join(' ').toLowerCase()
            };
        });
    }

    /**
     * Optimize event data for better performance
     */
    optimizeEventData(events) {
        return events.map(event => {
            // Ensure consistent data structure and pre-compute values
            return {
                ...event,
                participants: event.participants || [],
                classes: event.classes || [],
                // Pre-format date for display
                _formattedDate: event.date ? new Date(event.date).toLocaleDateString() : 'TBD',
                // Pre-compute participant count
                _participantCount: (event.participants || []).length
            };
        });
    }

    /**
     * Set empty data for failed type loads
     */
    setEmptyDataForType(type) {
        if (type === 'race-brackets') {
            this.data.raceBrackets = {};
        } else {
            this.data[type] = [];
        }
    }

    /**
     * Validate data structure before processing
     */
    validateDataStructure(type, data) {
        if (!data) {
            console.warn(`⚠️ ${type}: Data is null or undefined`);
            return false;
        }

        // Check for corrupted data (non-object/array)
        if (typeof data !== 'object' || data === null) {
            console.warn(`⚠️ ${type}: Data is not an object or array`);
            return false;
        }

        // Check for extremely large arrays that might be corrupted
        if (Array.isArray(data) && data.length > 100000) {
            console.warn(`⚠️ ${type}: Data array is suspiciously large (${data.length} items)`);
            return false;
        }

        // Type-specific validation
        switch (type) {
            case 'participants':
                return data.participants && Array.isArray(data.participants);
            case 'events':
                return data.events && Array.isArray(data.events);
            case 'series':
                return data.series && Array.isArray(data.series);
            case 'races':
                return Array.isArray(data) || (data.races && Array.isArray(data.races));
            case 'race-brackets':
                return Array.isArray(data);
            default:
                return true;
        }
    }

    /**
     * Enhanced cleanup with cache metadata management
     */
    cleanupOldCachedData() {
        // Clear any temporary processing data
        if (this.tempData) {
            this.tempData.clear();
        }
        
        // Clean old cache metadata (keep only last 10 entries per type)
        if (this.cacheMetadata) {
            Object.keys(this.cacheMetadata).forEach(type => {
                const cacheAge = Date.now() - (this.cacheMetadata[type]?.lastLoaded || 0);
                if (cacheAge > 24 * 60 * 60 * 1000) { // 24 hours
                    delete this.cacheMetadata[type];
                }
            });
        }
        
        // Force garbage collection hint
        if (window.gc && typeof window.gc === 'function') {
            setTimeout(() => window.gc(), 1000);
        }
    }

    /**
     * Check if we should use cached data
     */
    shouldUseCachedData(type) {
        if (!this.data[type]) return false;
        
        const cacheAge = Date.now() - (this.cacheMetadata?.[type]?.lastLoaded || 0);
        
        // Different cache TTL for different data types
        const ttl = this.getCacheTTL(type);
        
        return cacheAge < ttl;
    }

    /**
     * Get cache TTL for different data types
     */
    getCacheTTL(type) {
        const ttlMap = {
            'participants': 30000,      // 30 seconds (frequently changing)
            'events': 60000,           // 1 minute (moderately changing)  
            'series': 300000,          // 5 minutes (rarely changing)
            'race-brackets': 120000    // 2 minutes (slow to load, moderate changes)
        };
        
        return ttlMap[type] || 60000; // Default 1 minute
    }

    /**
     * Get appropriate Cache-Control header
     */
    getCacheControlHeader(type) {
        if (type === 'race-brackets') {
            return 'max-age=120'; // 2 minutes for race brackets
        } else if (type === 'participants') {
            return 'max-age=30';  // 30 seconds for participants
        }
        return 'max-age=60'; // Default 1 minute
    }

    /**
     * Get Last-Modified header for conditional requests
     */
    getLastModifiedHeader(type) {
        return this.cacheMetadata?.[type]?.lastModified || '';
    }

    /**
     * Update cache metadata
     */
    updateCacheMetadata(type, headers) {
        if (!this.cacheMetadata) {
            this.cacheMetadata = {};
        }
        
        this.cacheMetadata[type] = {
            lastLoaded: Date.now(),
            lastModified: headers.get('Last-Modified') || '',
            etag: headers.get('ETag') || ''
        };
    }

    /**
     * Determine if request should be retried
     */
    shouldRetryRequest(error) {
        // Retry on network errors, timeouts, or 5xx server errors
        return error.name === 'TypeError' || 
               error.message.includes('fetch') ||
               error.message.includes('timeout') ||
               (error.message.includes('HTTP 5'));
    }

    /**
     * SIMPLIFIED: Fetch from server
     */
    async fetchFromServer(endpoint, queryParams = {}) {
        let url = `${this.baseUrl}/${endpoint}`;
        
        // Add query parameters if provided
        if (Object.keys(queryParams).length > 0) {
            const params = new URLSearchParams(queryParams);
            url += `?${params.toString()}`;
        }
        
        console.log(`🔍 DEBUG - Fetching from server: ${url}`);
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
     * Enhanced: Save to server with retry logic and batching
     */
    async saveToServer(endpoint, data, isUpdate = false, options = {}) {
        const maxRetries = options.maxRetries || 3;
        const retryDelay = options.retryDelay || 1000;
        const batch = options.batch || false;

        // If batching is enabled, queue the save instead of immediate execution
        if (batch && !options.force) {
            return this.queueBatchSave(endpoint, data, isUpdate);
        }

        const url = `${this.baseUrl}/${endpoint}`;
        const method = isUpdate ? 'PUT' : 'POST';
        const finalUrl = isUpdate ? `${url}/${data.id}` : url;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`💾 Saving ${endpoint} to server (attempt ${attempt}/${maxRetries})`);
                
                const response = await fetch(finalUrl, {
                    method,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data)
                });

                if (!response.ok) {
                    // Handle 404 specifically for better user experience
                    if (response.status === 404) {
                        console.warn(`⚠️ Server endpoint not found for ${endpoint}, retrying...`);
                        throw new Error(`Server endpoint not found (404)`);
                    }
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const result = await response.json();
                console.log(`✅ Successfully saved ${endpoint} to server`);
                return result;

            } catch (error) {
                console.error(`❌ Failed to save ${endpoint} (attempt ${attempt}/${maxRetries}):`, error);
                
                if (attempt === maxRetries) {
                    // Show user-friendly error message
                    this.showConnectionError(endpoint, error.message);
                    throw new Error(`Failed to save ${endpoint} after ${maxRetries} attempts: ${error.message}`);
                }
                
                // Progressive backoff delay
                const delay = retryDelay * Math.pow(2, attempt - 1);
                console.log(`⏳ Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    /**
     * Queue batch save operations
     */
    queueBatchSave(endpoint, data, isUpdate = false) {
        if (!this.batchQueue) {
            this.batchQueue = new Map();
        }

        const key = `${endpoint}_${data.id || 'new'}`;
        this.batchQueue.set(key, { endpoint, data, isUpdate });
        console.log(`📦 Queued ${endpoint} for batch save`);

        // Debounce batch execution
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
        }

        this.batchTimeout = setTimeout(() => {
            this.executeBatchSaves();
        }, 500); // 500ms debounce

        return Promise.resolve();
    }

    /**
     * Execute all queued batch saves
     */
    async executeBatchSaves() {
        if (!this.batchQueue || this.batchQueue.size === 0) {
            return;
        }

        console.log(`🚀 Executing batch save for ${this.batchQueue.size} items`);
        const promises = [];

        for (const [key, { endpoint, data, isUpdate }] of this.batchQueue.entries()) {
            promises.push(
                this.saveToServer(endpoint, data, isUpdate, { force: true, maxRetries: 2 })
                    .catch(error => {
                        console.error(`Failed to save ${endpoint} in batch:`, error);
                        return { key, error: error.message };
                    })
            );
        }

        try {
            const results = await Promise.allSettled(promises);
            const failures = results.filter(r => r.status === 'rejected' || r.value?.error);
            
            if (failures.length > 0) {
                console.warn(`⚠️ ${failures.length} items failed to save in batch`);
            } else {
                console.log(`✅ Batch save completed successfully`);
            }
        } finally {
            this.batchQueue.clear();
            this.batchTimeout = null;
        }
    }

    /**
     * Show connection error to user
     */
    showConnectionError(endpoint, error) {
        if (window.showToast) {
            window.showToast(`Connection error saving ${endpoint}. Changes saved locally.`, 'warning');
        } else {
            console.warn(`Connection error: ${error}`);
        }
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
    async getEvents(filters = {}, page = 1, limit = 1000) {
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
                        // Reduced logging to prevent console spam during live display refresh
                        // console.log(`   📋 Loaded bracket for event ${bracket.eventId}: ID ${bracket.id}`);
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
            
            console.log('🔍 DEBUG - Adding participant to server:', {
                id: participantData.id,
                name: participantData.name,
                dataKeys: Object.keys(participantData)
            });
            
            // Save to server FIRST
            let savedParticipant;
            try {
                console.log('📡 Attempting to save to server...');
                savedParticipant = await this.saveToServer('participants', participantData);
                console.log('✅ Successfully saved to server:', savedParticipant.id);
                console.log('🔍 DEBUG - Server response:', {
                    id: savedParticipant.id,
                    name: savedParticipant.name,
                    responseKeys: Object.keys(savedParticipant)
                });
            } catch (serverError) {
                console.error('❌ FAILED to save to server:', serverError);
                console.error('❌ Server error details:', {
                    message: serverError.message,
                    stack: serverError.stack
                });
                throw new Error(`Failed to save participant to server: ${serverError.message}`);
            }
            
            // Update local cache ONLY if server save succeeded
            if (!this.data.participants) {
                this.data.participants = [];
            }
            
            // Remove any existing participant with the same ID (in case of updates)
            this.data.participants = this.data.participants.filter(p => p.id !== savedParticipant.id);
            
            // Add the new participant
            this.data.participants.push(savedParticipant);
            
            console.log('🔍 DEBUG - After adding to cache:', {
                id: savedParticipant.id,
                name: savedParticipant.name,
                totalParticipants: this.data.participants.length
            });
            
            // Emit event for real-time updates
            if (this.eventBus) {
                this.eventBus.emit('participant-added', savedParticipant);
            }
            
            return savedParticipant;
            
        } catch (error) {
            console.error('❌ Error in addParticipant:', error);
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
        // First check in main participants array
        if (this.data.participants) {
            const participant = this.data.participants.find(p => p.id === id);
            if (participant) {
                return participant;
            }
        }
        
        // Then check in event-specific participants
        if (this.data.eventParticipants) {
            for (const eventId in this.data.eventParticipants) {
                const eventParticipants = this.data.eventParticipants[eventId];
                const participant = eventParticipants.find(p => p.id === id);
                if (participant) {
                    return participant;
                }
            }
        }
        
        console.log(`🔍 DEBUG - Participant ${id} not found. Available: ${this.data.participants?.length || 0} participants + event-specific participants`);
        return null;
    }

    /**
     * Get all participants as a simple array (synchronous)
     * For component compatibility - returns array directly
     */
    getParticipantsArray() {
        console.log('🔍 getParticipantsArray() called');
        console.log('🔍 this.data.participants:', this.data.participants);
        console.log('🔍 this.data.participants length:', this.data.participants?.length || 0);
        return this.data.participants || [];
    }

    /**
     * Load participants for a specific event
     */
    async loadParticipantsForEvent(eventId) {
        console.log(`🔍 DEBUG - Loading participants for event: ${eventId}`);
        
        try {
            // Use the fetchFromServer method with query parameters
            const participants = await this.fetchFromServer('participants', { eventId });
            console.log(`🔍 DEBUG - Loaded ${participants.length} participants for event ${eventId}`);
            
            // Store these participants in memory for this event
            if (!this.data.eventParticipants) {
                this.data.eventParticipants = {};
            }
            this.data.eventParticipants[eventId] = participants;
            
            return participants;
        } catch (error) {
            console.error(`❌ Failed to load participants for event ${eventId}:`, error);
            throw error;
        }
    }

    /**
     * Get all events as a simple array (synchronous)
     * For component compatibility - returns array directly
     */
    getEventsArray() {
        return this.data.events || [];
    }

    /**
     * Get all races as a simple array (synchronous)
     * For component compatibility - returns array directly
     */
    getRacesArray() {
        return this.data.races || [];
    }

    /**
     * SIMPLIFIED: Get races with pagination and filtering
     */
    async getRaces(filters = {}, page = 1, limit = 50) {
        // Check if we need to load races
        if (!this.loadedDataTypes.has('races')) {
            await this.loadFromStorage(['races']);
        }
        
        // Ensure races is an array
        let races = this.data.races;
        if (!Array.isArray(races)) {
            console.warn('⚠️ Races data is not an array, initializing as empty array:', typeof races);
            races = [];
        }
        
        // Apply filters
        if (filters.eventId) {
            races = races.filter(r => r.eventId === filters.eventId);
        }
        if (filters.status) {
            races = races.filter(r => r.status === filters.status);
        }
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            races = races.filter(r => 
                r.name && r.name.toLowerCase().includes(searchLower)
            );
        }
        
        // If no pagination is requested (default case for live display), return array directly
        if (page === 1 && limit === 50 && Object.keys(filters).length === 0) {
            return races;
        }
        
        // Apply pagination
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedRaces = races.slice(startIndex, endIndex);
        
        return {
            races: paginatedRaces,
            total: races.length,
            page,
            limit,
            totalPages: Math.ceil(races.length / limit)
        };
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
            
            // Update local data cache - ensure series array exists
            if (!this.data.series) {
                console.warn('⚠️ this.data.series was null/undefined, initializing as array');
                this.data.series = [];
            }
            
            if (!Array.isArray(this.data.series)) {
                console.error('❌ this.data.series is not an array:', typeof this.data.series);
                this.data.series = [];
            }
            
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
        // Ensure series data is loaded and is an array
        if (!this.data.series) {
            console.warn('⚠️ this.data.series is null/undefined, returning empty array');
            return [];
        }
        
        if (!Array.isArray(this.data.series)) {
            console.error('❌ this.data.series is not an array:', typeof this.data.series);
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
            
            // Add timestamps and set initial status
            eventData.createdAt = new Date().toISOString();
            eventData.updatedAt = new Date().toISOString();
            eventData.status = eventData.status || 'upcoming'; // Set default status to upcoming
            
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
        if (!this.data.events) {
            console.warn('⚠️ getEvent: Events array not initialized');
            return null;
        }
        
        const event = this.data.events.find(e => e.id === id);
        if (!event) {
            console.warn(`⚠️ getEvent: Event ${id} not found in cache. Available events: ${this.data.events.length}`);
            if (this.data.events.length > 0) {
                console.log('📋 Available event IDs:', this.data.events.slice(0, 5).map(e => e.id));
            }
            
            // Try to reload events from server if not found
            console.log('🔄 Attempting to reload events from server...');
            this.loadFromStorageOptimized(['events'], true).then(() => {
                console.log('✅ Events reloaded from server');
            }).catch(error => {
                console.error('❌ Failed to reload events:', error);
            });
        }
        return event;
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
     * Update event status
     */
    async updateEventStatus(eventId, newStatus) {
        try {
            console.log(`🔄 Updating event ${eventId} status to: ${newStatus}`);
            
            const response = await fetch(`${this.baseUrl}/events/${eventId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status: newStatus })
            });

            if (!response.ok) {
                throw new Error(`Failed to update event status: ${response.statusText}`);
            }

            // Get the updated event data from the response
            let updatedEvent;
            try {
                updatedEvent = await response.json();
            } catch (error) {
                console.warn('⚠️ Could not parse response as JSON, updating status only');
                // If we can't parse the response, just update the status in the existing event
                const eventIndex = this.data.events.findIndex(e => e.id === eventId);
                if (eventIndex !== -1) {
                    this.data.events[eventIndex].status = newStatus;
                    this.data.events[eventIndex].updatedAt = new Date().toISOString();
                    console.log(`✅ Updated event ${eventId} status in local cache`);
                }
                // Emit event and return
                if (this.eventBus) {
                    this.eventBus.emit('eventStatusUpdated', { eventId, status: newStatus });
                }
                console.log(`✅ Event ${eventId} status updated to: ${newStatus}`);
                return true;
            }
            
            // Update local cache - ensure we have the events array
            if (!this.data.events) {
                console.warn('⚠️ Events array not initialized, creating it');
                this.data.events = [];
            }
            
            const eventIndex = this.data.events.findIndex(e => e.id === eventId);
            if (eventIndex !== -1) {
                // Update the existing event with new status and any other updated fields
                this.data.events[eventIndex] = { ...this.data.events[eventIndex], ...updatedEvent };
                console.log(`✅ Updated event ${eventId} in local cache`);
            } else {
                console.warn(`⚠️ Event ${eventId} not found in local cache, adding it`);
                // If event not in cache, add it (this shouldn't happen normally)
                this.data.events.push(updatedEvent);
            }

            // Emit event for UI updates
            if (this.eventBus) {
                this.eventBus.emit('eventStatusUpdated', { eventId, status: newStatus });
            }

            console.log(`✅ Event ${eventId} status updated to: ${newStatus}`);
            return true;
        } catch (error) {
            console.error('❌ Error updating event status:', error);
            throw error;
        }
    }

    /**
     * Check if an event is completed (all classes have finished their finals)
     */
    isEventCompleted(eventId) {
        try {
            const bracket = this.getRaceBracket(eventId);
            if (!bracket || !bracket.classes) {
                console.log(`🔍 Event ${eventId}: No bracket or classes found`);
                return false;
            }

            const classNames = Object.keys(bracket.classes);
            const totalClasses = classNames.length;
            
            if (totalClasses === 0) {
                console.log(`🔍 Event ${eventId}: No classes in bracket`);
                return false;
            }

            // Check each class completion status
            const classStatuses = {};
            let completedCount = 0;
            
            Object.entries(bracket.classes).forEach(([className, classBracket]) => {
                const isComplete = classBracket.isComplete === true;
                classStatuses[className] = isComplete;
                if (isComplete) completedCount++;
            });

            const allClassesComplete = completedCount === totalClasses;
            
            console.log(`🔍 Event ${eventId} completion check:`);
            console.log(`   📊 Classes: ${completedCount}/${totalClasses} complete`);
            console.log(`   📋 Status by class:`, classStatuses);
            console.log(`   🎯 Result: ${allClassesComplete ? 'COMPLETED ✅' : 'IN PROGRESS ⏳'}`);
            
            return allClassesComplete;
        } catch (error) {
            console.error('❌ Error checking event completion:', error);
            return false;
        }
    }

    /**
     * Set all existing events to 'upcoming' status if they don't have a status
     */
    async initializeEventStatuses() {
        try {
            console.log('🔄 Initializing event statuses...');
            
            const events = this.data.events.filter(event => !event.status);
            if (events.length === 0) {
                console.log('✅ All events already have status values');
                return;
            }

            console.log(`📝 Setting ${events.length} events to 'upcoming' status`);
            
            for (const event of events) {
                await this.updateEventStatus(event.id, 'upcoming');
            }

            console.log('✅ Event status initialization complete');
        } catch (error) {
            console.error('❌ Error initializing event statuses:', error);
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
            
            // Check if participant exists - if not found, try refreshing cache first
            let participant = this.getParticipant(participantId);
            if (!participant) {
                console.log('⚠️ Participant not found in cache, refreshing from server...');
                await this.loadFromStorage(['participants'], true); // Force refresh
                participant = this.getParticipant(participantId);
            }
            
            if (!participant) {
                console.error('❌ Participant still not found after cache refresh:', participantId);
                console.log('🔍 Available participants:', this.data.participants.map(p => ({ id: p.id, name: p.name })));
                throw new Error('Participant not found');
            }
            
            // Debug: Log the actual objects to see their structure
            console.log('🔍 DEBUG - Event object:', {
                id: event.id,
                name: event.name,
                hasName: 'name' in event,
                keys: Object.keys(event)
            });
            console.log('🔍 DEBUG - Participant object:', {
                id: participant.id,
                name: participant.name,
                hasName: 'name' in participant,
                keys: Object.keys(participant)
            });
            
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
            
            console.log(`🔧 Updated participant ${participant.name || participant.id || 'Unknown'} eventId to ${eventId}`);
            
            // Broadcast participant registered event
            if (this.eventBus) {
                this.eventBus.emit('participant-registered', {
                    eventId,
                    participantId,
                    eventName: event.name || 'Unknown Event',
                    participantName: participant.name || 'Unknown Participant',
                    timestamp: new Date().toISOString()
                });
            }
            
            console.log(`✅ Participant ${participant.name || participant.id || 'Unknown'} registered for event ${event.name || event.id || 'Unknown'}`);
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
     * OPTIMIZED: Save race bracket with batching and improved error handling
     */
    async saveRaceBracket(eventId, bracketData, options = {}) {
        try {
            // Ensure the bracket has an eventId
            bracketData.eventId = eventId;
            
            // Check if bracket already exists in local cache
            const existingBracket = this.data.raceBrackets[eventId];
            const isUpdate = existingBracket && existingBracket.id;
            let savedBracket;

            // Use batch saving for better performance during rapid saves
            const useBatch = options.batch !== false; // Default to true unless explicitly disabled
            
            if (isUpdate) {
                // Try to update existing bracket using PUT
                console.log('🔄 Attempting to update existing race bracket for event:', eventId, 'with ID:', existingBracket.id);
                bracketData.id = existingBracket.id;
                
                try {
                    // Use enhanced saveToServer with batch support
                    savedBracket = await this.saveToServer('race-brackets', bracketData, true, {
                        batch: useBatch,
                        maxRetries: 2,
                        retryDelay: 500
                    });
                    console.log('✅ Successfully updated existing race bracket');
                } catch (updateError) {
                    // If update fails (404 - bracket doesn't exist on server), create new one
                    if (updateError.message.includes('404') || updateError.message.includes('not found')) {
                        console.warn('⚠️ Bracket not found on server, creating new one instead');
                        // Remove ID to force creation of new bracket
                        delete bracketData.id;
                        savedBracket = await this.saveToServer('race-brackets', bracketData, false, {
                            batch: useBatch,
                            maxRetries: 2,
                            retryDelay: 500
                        });
                        console.log('✅ Created new race bracket after update failed');
                    } else {
                        // Re-throw other errors
                        throw updateError;
                    }
                }
            } else {
                // Create new bracket using POST
                console.log('📝 Creating new race bracket for event:', eventId);
                savedBracket = await this.saveToServer('race-brackets', bracketData, false, {
                    batch: useBatch,
                    maxRetries: 2,
                    retryDelay: 500
                });
            }
                
            // Update local data cache immediately (optimistic update)
            this.data.raceBrackets[eventId] = savedBracket || bracketData;
            
            // Broadcast bracket saved event
            if (this.eventBus) {
                this.eventBus.emit('race-bracket-saved', {
                    eventId,
                    bracket: savedBracket || bracketData,
                    timestamp: new Date().toISOString()
                });
            }
            
            console.log('✅ Race bracket saved via server for event:', eventId, 'Final ID:', savedBracket?.id || 'pending');
            return savedBracket || bracketData;
        } catch (error) {
            console.error('❌ Failed to save race bracket for event:', eventId, error);
            
            // Optimistic update: save to local cache even if server fails
            this.data.raceBrackets[eventId] = bracketData;
            console.log('💾 Bracket saved locally while server is unavailable');
            
            // Try one more fallback: create a completely new bracket (non-batched)
            try {
                console.log('🔄 Attempting fallback: creating fresh bracket...');
                const fallbackData = { ...bracketData };
                delete fallbackData.id; // Remove any existing ID
                const fallbackBracket = await this.saveToServer('race-brackets', fallbackData, false, {
                    batch: false, // Don't batch the fallback
                    maxRetries: 1,
                    retryDelay: 1000
                });
                
                // Update local cache
                this.data.raceBrackets[eventId] = fallbackBracket;
                
                console.log('✅ Fallback bracket creation succeeded:', fallbackBracket.id);
                return fallbackBracket;
            } catch (fallbackError) {
                console.warn('⚠️ Fallback bracket creation also failed, but local save succeeded:', fallbackError);
                // Return local data since we've already saved it locally
                return bracketData;
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

    /**
     * SIMPLIFIED: Get all race brackets
     */
    async getRaceBrackets() {
        // Check if we need to load race brackets
        if (!this.loadedDataTypes.has('race-brackets')) {
            await this.loadRaceBrackets();
        }
        
        return this.data.raceBrackets || {};
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