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
        this.activeRequests = new Map(); // Track active network requests for deduplication
        this.resourceLocks = new Map(); // Resource locking for critical sections
        
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
     * Execute an operation exclusively for a given resource
     * Prevents race conditions for critical updates
     */
    async executeExclusive(resourceId, operation) {
        // Get existing promise or start with resolved
        const previousPromise = this.resourceLocks.get(resourceId) || Promise.resolve();
        
        // Create new promise chaining off the previous one
        const currentPromise = previousPromise.then(async () => {
            try {
                return await operation();
            } catch (error) {
                throw error;
            }
        });
        
        // Update lock - handle errors so the chain continues
        this.resourceLocks.set(resourceId, currentPromise.catch(() => {}));
        
        return currentPromise;
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
     * Normalize identifiers to string for reliable cross-layer comparisons.
     * Some API/database paths may surface IDs as numbers while UI paths keep strings.
     */
    normalizeId(id) {
        return id == null ? '' : String(id);
    }

    /**
     * Perform a fetch using Auth wrapper if available (adds Authorization token)
     */
    request(url, options = {}) {
        // Check if we have authentication before making requests
        if (!window.Auth || !window.currentUser) {
            console.warn('🚫 No authentication available, skipping request to:', url);
            return Promise.reject(new Error('Authentication required'));
        }
        
        if (window.Auth && typeof window.Auth.fetch === 'function') {
            return window.Auth.fetch(url, options);
        }
        return fetch(url, options);
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
                        // Wrap each load in try-catch to prevent one failure from stopping all loads
                        try {
                            return await this.loadSingleDataTypeOptimized(type);
                        } catch (error) {
                            // Log warning but don't rethrow - allows other data types to continue loading
                            console.warn(`⚠️ Failed to load ${type}, continuing with other data types:`, error.message);
                            this.setEmptyDataForType(type);
                            return null;
                        }
                    });
                
                // Wait for current batch to complete before starting next (using allSettled to handle individual failures)
                await Promise.allSettled(loadPromises);
                
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
     * UPDATED: Added request deduplication
     */
    async loadSingleDataTypeOptimized(type, retryCount = 0) {
        const maxRetries = 2;
        
        // Check for cached network data first
        if (this.shouldUseCachedData(type)) {
            console.log(`📊 Using cached data for ${type}`);
            return this.data[type];
        }

        // Request Deduplication: Check if request is already in progress
        const requestKey = `load_${type}`;
        if (this.activeRequests.has(requestKey)) {
            console.log(`🔄 Request for ${type} already in progress, reusing promise`);
            return this.activeRequests.get(requestKey);
        }
        
        // Create new request promise
        const requestPromise = (async () => {
            try {
                console.log(`🔍 Loading ${type} from server (attempt ${retryCount + 1})`);
                
                const startTime = performance.now();
                // For participants, keep memory footprint bounded on initial load.
                if (type === 'participants') {
                    const firstPage = await this.fetchParticipantsPage({}, 1, 200);
                    await this.processLoadedData('participants', {
                        participants: firstPage.participants || []
                    });
                    return this.data[type];
                }

                // Load all data with reasonable limits to avoid server issues
                const queryParams = {};
                let url = `${this.baseUrl}/${type}`;

                // Add query parameters if needed
                if (Object.keys(queryParams).length > 0) {
                    const params = new URLSearchParams(queryParams);
                    url += `?${params.toString()}`;
                }

                const response = await this.request(url, {
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
                    // Handle 403 gracefully - user doesn't have permission, just set empty data
                    if (response.status === 403) {
                        console.warn(`⚠️ Access denied for ${type} - user lacks permission, continuing with empty data`);
                        this.setEmptyDataForType(type);
                        return this.data[type];
                    } else if (response.status === 401) {
                        throw new Error(`Authentication required (401): Please log in to access ${type} data`);
                    } else if (response.status === 404) {
                        throw new Error(`Not found (404): ${type} data not available on server`);
                    } else {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
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
                    // We need to clear the active request before retrying recursively
                    this.activeRequests.delete(requestKey);
                    return await this.loadSingleDataTypeOptimized(type, retryCount + 1);
                }
                
                // Set empty data for failed loads to prevent app crashes
                this.setEmptyDataForType(type);
                throw error;
            }
        })();

        // Store promise
        this.activeRequests.set(requestKey, requestPromise);
        
        try {
            return await requestPromise;
        } finally {
            // Clean up when done
            this.activeRequests.delete(requestKey);
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
            // Optimize participant data structure (includes migration)
            this.data[type] = this.optimizeParticipantData(data.participants);
            console.log(`✅ ${type} optimized: ${this.data[type].length} participants`);
            
            // Run migration on first load if needed
            if (!this._participantsMigrationRun) {
                this._participantsMigrationRun = true;
                const needsMigration = this.data[type].some(p => !p._migrated);
                
                if (needsMigration) {
                    console.log('🔄 Detected participants needing migration, will run async migration...');
                    // Run migration asynchronously to not block loading
                    setTimeout(async () => {
                        try {
                            const result = await this.migrateAllParticipants();
                            console.log('✅ Participant migration completed:', result);
                        } catch (error) {
                            console.error('❌ Participant migration failed:', error);
                        }
                    }, 1000);
                }
            }
            
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
            // Handle direct array response (legacy or direct endpoint)
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

        } else if (type === 'race-brackets' && data.brackets && Array.isArray(data.brackets)) {
            // Handle paginated response from server
            const bracketMap = new Map();
            const brackets = data.brackets;

            // Process in chunks to prevent blocking
            const chunkSize = 20;
            for (let i = 0; i < brackets.length; i += chunkSize) {
                const chunk = brackets.slice(i, i + chunkSize);

                chunk.forEach(bracket => {
                    if (bracket && bracket.eventId) {
                        bracketMap.set(bracket.eventId, bracket);
                    }
                });

                // Yield control to prevent UI blocking
                if (i + chunkSize < brackets.length) {
                    await new Promise(resolve => setTimeout(resolve, 1));
                }
            }

            // Convert Map to plain object for compatibility
            this.data.raceBrackets = Object.fromEntries(bracketMap);
            console.log(`✅ ${type} optimized: ${brackets.length} brackets from paginated response converted to eventId map`);
            
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
     * UPDATED: Enforces consolidated nested structure
     */
    optimizeParticipantData(participants) {
        return participants.map(participant => {
            // Migrate to new structure if needed
            const migrated = this.migrateParticipantStructure(participant);
            
            // Ensure consistent data structure with nested contact and statistics
            return {
                ...migrated,
                // Nested contact structure (primary source)
                contact: migrated.contact || {
                    email: migrated.contactEmail || '',
                    phone: migrated.contactPhone || '',
                    emergency: migrated.emergencyContact || ''
                },
                // Nested statistics structure (primary source)
                statistics: migrated.statistics || {},
                // eventClasses as primary source, selectedClasses as computed aggregate
                eventClasses: migrated.eventClasses || {},
                selectedClasses: this.computeSelectedClasses(migrated.eventClasses || {}),
                status: migrated.status || 'active',
                totalFee: typeof migrated.totalFee === 'number' ? migrated.totalFee : 0,
                // Pre-compute searchable text for faster filtering
                _searchText: [
                    migrated.name,
                    migrated.nickname,
                    migrated.racingNumber,
                    migrated.vehicleMake,
                    migrated.vehicleModel,
                    migrated.vehicleYear,
                    migrated.contact?.email,
                    migrated.contactEmail
                ].filter(Boolean).join(' ').toLowerCase()
            };
        });
    }

    /**
     * Compute selectedClasses as aggregate from eventClasses
     */
    computeSelectedClasses(eventClasses) {
        if (!eventClasses || typeof eventClasses !== 'object') {
            return [];
        }
        
        const allClasses = new Set();
        Object.values(eventClasses).forEach(classes => {
            if (Array.isArray(classes)) {
                classes.forEach(cls => allClasses.add(cls));
            }
        });
        
        return Array.from(allClasses);
    }

    /**
     * Migrate participant structure to new consolidated format
     * Converts old flat structure to nested contact/statistics
     */
    migrateParticipantStructure(participant) {
        if (!participant) return participant;
        
        // Create copy to avoid mutating original
        const migrated = { ...participant };
        
        // 1. Migrate contact information to nested structure
        if (!migrated.contact || typeof migrated.contact !== 'object') {
            migrated.contact = {
                email: migrated.contactEmail || migrated.contact?.email || '',
                phone: migrated.contactPhone || migrated.contact?.phone || '',
                emergency: migrated.emergencyContact || migrated.emergencyPhone || migrated.contact?.emergency || ''
            };
        }
        
        // 2. Migrate statistics to nested structure
        if (!migrated.statistics || typeof migrated.statistics !== 'object') {
            migrated.statistics = {
                totalRaces: migrated.totalRaces || 0,
                totalWins: migrated.totalWins || 0,
                winRate: migrated.winRate || 0,
                avgPosition: migrated.avgPosition || 0,
                bestStreak: migrated.bestStreak || 0,
                eventsParticipated: migrated.eventsParticipated || 0,
                lanePerformance: migrated.lanePerformance || {},
                recentWinRate: migrated.recentWinRate || 0,
                lastUpdated: migrated.lastRaceDate || migrated.updatedAt || new Date().toISOString(),
                lastCalculated: Date.now(),
                totalLosses: migrated.totalLosses || 0,
                bestPosition: migrated.bestPosition || null,
                worstPosition: migrated.worstPosition || null,
                raceHistory: migrated.raceHistory || []
            };
        }
        
        // 3. Migrate class tracking to eventClasses as primary source
        if (!migrated.eventClasses || typeof migrated.eventClasses !== 'object') {
            migrated.eventClasses = {};
            
            // If participant has eventId and classes, create eventClasses mapping
            if (migrated.eventId) {
                const classes = migrated.selectedClasses || migrated.sledClasses || 
                               (migrated.sledClass ? [migrated.sledClass] : []);
                if (classes.length > 0) {
                    migrated.eventClasses[migrated.eventId] = Array.isArray(classes) ? classes : [classes];
                }
            }
        }
        
        // 4. Compute selectedClasses as aggregate if not present
        if (!migrated.selectedClasses || !Array.isArray(migrated.selectedClasses)) {
            migrated.selectedClasses = this.computeSelectedClasses(migrated.eventClasses);
        }
        
        // Mark as migrated to avoid re-migration
        migrated._migrated = true;
        migrated._migrationDate = new Date().toISOString();
        
        return migrated;
    }

    /**
     * Batch migrate all participants to new structure
     */
    async migrateAllParticipants() {
        console.log('🔄 Starting participant data migration...');
        
        const participants = this.data.participants || [];
        let migratedCount = 0;
        let alreadyMigratedCount = 0;
        const errors = [];
        
        for (let i = 0; i < participants.length; i++) {
            try {
                const participant = participants[i];
                
                // Skip if already migrated
                if (participant._migrated) {
                    alreadyMigratedCount++;
                    continue;
                }
                
                // Migrate structure
                const migrated = this.migrateParticipantStructure(participant);
                
                // Update in memory
                this.data.participants[i] = migrated;
                
                // Update on server (batch save to avoid overwhelming server)
                try {
                    await this.saveToServer('participants', migrated, true);
                    migratedCount++;
                    
                    if (migratedCount % 10 === 0) {
                        console.log(`📊 Migration progress: ${migratedCount}/${participants.length} participants`);
                    }
                } catch (serverError) {
                    console.warn(`⚠️ Failed to save migrated participant ${participant.id} to server:`, serverError.message);
                    // Continue migration even if server save fails
                    migratedCount++;
                }
                
            } catch (error) {
                console.error(`❌ Migration failed for participant ${participants[i]?.id}:`, error);
                errors.push({ participantId: participants[i]?.id, error: error.message });
            }
        }
        
        console.log(`✅ Migration complete: ${migratedCount} migrated, ${alreadyMigratedCount} already migrated, ${errors.length} errors`);
        
        if (errors.length > 0) {
            console.warn('⚠️ Migration errors:', errors);
        }
        
        return {
            total: participants.length,
            migrated: migratedCount,
            alreadyMigrated: alreadyMigratedCount,
            errors: errors
        };
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
                return Array.isArray(data) || (data.brackets && Array.isArray(data.brackets));
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
            'participants': 120000,    // 2 minutes
            'events': 300000,          // 5 minutes
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
     * Load all participant pages to get complete dataset
     */
    async loadAllParticipantPages(maxPages = 100) {
        const pageSize = 2000; // Load 2000 participants per page
        let allParticipants = [];
        let page = 1;
        let hasMorePages = true;

        console.log('🔄 Loading all participants with pagination...');

        while (hasMorePages) {
            try {
                const startTime = performance.now();
                const url = `${this.baseUrl}/participants?page=${page}&limit=${pageSize}`;

                const response = await this.request(url, {
                    headers: {
                        'Cache-Control': 'max-age=30',
                        'Accept': 'application/json'
                    }
                });

                if (!response.ok) {
                    if (response.status === 403) {
                        console.warn(`⚠️ Access denied for participants - user lacks permission, continuing with empty data`);
                        // Return empty data gracefully instead of throwing
                        this.data.participants = [];
                        this.data.participantsById = {};
                        this.loadedDataTypes.add('participants');
                        return;
                    } else if (response.status === 401) {
                        throw new Error(`Authentication required (401): Please log in to access participants data`);
                    } else {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                }

                const data = await response.json();
                const participants = data.participants || [];
                const total = data.total || 0;

                console.log(`📄 Loaded page ${page}: ${participants.length} participants (total: ${allParticipants.length + participants.length}/${total})`);

                allParticipants = allParticipants.concat(participants);

                // Check if we have all participants or if this was the last page
                hasMorePages = allParticipants.length < total && participants.length === pageSize;

                // Update cache metadata from the first response
                if (page === 1) {
                    this.updateCacheMetadata('participants', response.headers);
                }

                const endTime = performance.now();
                const requestTime = endTime - startTime;
                if (requestTime > 800) {
                    console.warn(`🐌 Slow participant page load: page ${page} took ${requestTime.toFixed(2)}ms`);
                }

                page++;

                // Prevent infinite loops
                if (page > maxPages) {
                    console.warn(`⚠️ Too many pages, stopping at page ${maxPages}`);
                    hasMorePages = false;
                }

            } catch (error) {
                console.error(`❌ Failed to load participants page ${page}:`, error);
                throw error;
            }
        }

        console.log(`✅ Loaded all participants: ${allParticipants.length} total`);

        // Process the combined data
        const combinedData = { participants: allParticipants };
        await this.processLoadedData('participants', combinedData);
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
        const response = await this.request(url);
        
        if (!response.ok) {
            if (response.status === 404) {
                console.log(`📭 ${endpoint} not found on server (404) - this is normal for new items`);
                return [];
            } else if (response.status === 403) {
                console.warn(`⚠️ Access denied for ${endpoint} - user lacks permission, returning empty data`);
                return [];
            } else if (response.status === 401) {
                throw new Error(`Authentication required (401): Please log in to access ${endpoint}`);
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
            if (data.brackets && Array.isArray(data.brackets)) {
                return data.brackets; // Return just the brackets array
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
                
                const response = await this.request(finalUrl, {
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
        const response = await this.request(url, {
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
     * Clear all data from database (Admin only)
     * Calls server API to clear database and resets local cache
     */
    async clearAllData() {
        try {
            console.log('🧹 Clearing all data from database...');
            
            // Call server API endpoint
            const url = `${this.baseUrl}/clear-database`;
            const response = await this.request(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            // Clear all local cache and data
            this.data = {
                participants: [],
                series: [],
                events: [],
                races: [],
                raceBrackets: {}
            };
            
            // Reset loaded data types
            this.loadedDataTypes.clear();
            this.loadingPromises.clear();
            this.paginationCache.clear();
            this.statsCache.clear();
            this.lastLoadTime.clear();
            this.activeRequests.clear();
            this.resourceLocks.clear();
            
            // Broadcast data cleared event
            if (this.eventBus) {
                this.eventBus.emit('data-cleared', {
                    timestamp: new Date().toISOString()
                });
            }
            
            console.log('✅ All data cleared successfully');
            return result;
            
        } catch (error) {
            console.error('❌ Failed to clear all data:', error);
            throw error;
        }
    }

    /**
     * SIMPLIFIED: Get participants with pagination and filtering
     */
    async getParticipants(filters = {}, page = 1, limit = 50) {
        return this.fetchParticipantsPage(filters, page, limit);
    }

    /**
     * Fetch participants page directly from server (Server-side Pagination)
     */
    async fetchParticipantsPage(filters = {}, page = 1, limit = 25) {
        const queryParams = new URLSearchParams({
            page: page,
            limit: limit
        });

        if (filters.eventId) queryParams.append('eventId', filters.eventId);
        if (filters.seriesId) queryParams.append('seriesId', filters.seriesId);
        if (filters.search) queryParams.append('search', filters.search);
        if (filters.class) queryParams.append('class', filters.class);

        try {
            const response = await this.request(`${this.baseUrl}/participants?${queryParams.toString()}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const result = await response.json();
            
            // Normalize data structure if needed
            if (result.participants) {
                result.participants = result.participants.map(p => this.normalizeParticipantData(p));
                // Keep local cache warm for edit flows that fetch participant by ID.
                if (!Array.isArray(this.data.participants)) {
                    this.data.participants = [];
                }
                const cacheById = new Map(
                    this.data.participants.map(p => [this.normalizeId(p.id), p])
                );
                result.participants.forEach(participant => {
                    cacheById.set(this.normalizeId(participant.id), participant);
                });
                this.data.participants = Array.from(cacheById.values());
            }
            
            return result;
        } catch (error) {
            console.error('Error fetching participants page:', error);
            throw error;
        }
    }

    /**
     * SIMPLIFIED: Get events with pagination and filtering
     */
    async getEvents(filters = {}, page = 1, limit = 50) {
        return this.fetchEventsPage(filters, page, limit);
    }

    /**
     * Fetch events page directly from server (Server-side Pagination)
     */
    async fetchEventsPage(filters = {}, page = 1, limit = 50) {
        const queryParams = new URLSearchParams({
            page: page,
            limit: limit
        });

        if (filters.seriesId) queryParams.append('seriesId', filters.seriesId);
        if (filters.seasonId) queryParams.append('seasonId', filters.seasonId);
        if (filters.status) queryParams.append('status', filters.status);
        if (filters.search) queryParams.append('search', filters.search);

        try {
            const response = await this.request(`${this.baseUrl}/events?${queryParams.toString()}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching events page:', error);
            throw error;
        }
    }

    /**
     * SIMPLIFIED: Load race brackets from server with enhanced logging
     */
    async loadRaceBrackets() {
        try {
            console.log('🔄 Loading race brackets from server...');

            // Use the standard loadFromStorage method to load from server
            await this.loadFromStorage(['race-brackets']);

            // Ensure the data structure is correct
            if (!this.data.raceBrackets) {
                this.data.raceBrackets = {};
            }
            if (!this.data.raceBracketsByEvent) {
                // Create eventId map from the loaded brackets
                this.data.raceBracketsByEvent = {};
                Object.values(this.data.raceBrackets).forEach(bracket => {
                    if (bracket.eventId) {
                        this.data.raceBracketsByEvent[bracket.eventId] = bracket;
                    }
                });
            }

            this.loadedDataTypes.add('race-brackets');

            const bracketCount = Object.keys(this.data.raceBrackets).length;
            console.log(`✅ Loaded ${bracketCount} race brackets from server`);
            return Object.values(this.data.raceBrackets);
        } catch (error) {
            console.error('❌ Failed to load race brackets:', error);
            this.data.raceBrackets = {};
            this.data.raceBracketsByEvent = {};
            return [];
        }
    }

    // Participant Management
    /**
     * UPDATED: Add new participant with consolidated nested structure
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
            
            // Enforce nested structure and compute aggregates
            const normalizedData = this.normalizeParticipantData(participantData);
            
            console.log('🔍 DEBUG - Adding participant to server:', {
                id: normalizedData.id,
                name: normalizedData.name,
                hasContact: !!normalizedData.contact,
                hasStatistics: !!normalizedData.statistics,
                hasEventClasses: !!normalizedData.eventClasses
            });
            
            // Save to server FIRST
            let savedParticipant;
            try {
                console.log('📡 Attempting to save to server...');
                savedParticipant = await this.saveToServer('participants', normalizedData);
                console.log('✅ Successfully saved to server:', savedParticipant.id);
            } catch (serverError) {
                console.error('❌ FAILED to save to server:', serverError);
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
            
            console.log('✅ Participant added:', savedParticipant.name, `(Total: ${this.data.participants.length})`);
            
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
     * Normalize participant data to enforced consolidated structure
     */
    normalizeParticipantData(data) {
        const normalized = { ...data };
        
        // 1. Enforce nested contact structure
        if (!normalized.contact || typeof normalized.contact !== 'object') {
            normalized.contact = {
                email: data.contactEmail || data.contact?.email || '',
                phone: data.contactPhone || data.contact?.phone || '',
                emergency: data.emergencyContact || data.emergencyPhone || data.contact?.emergency || ''
            };
        }
        
        // 2. Initialize statistics structure (will be populated by StatisticsManager)
        if (!normalized.statistics || typeof normalized.statistics !== 'object') {
            normalized.statistics = {
                totalRaces: 0,
                totalWins: 0,
                winRate: 0,
                avgPosition: 0,
                bestStreak: 0,
                eventsParticipated: 0,
                lanePerformance: {},
                recentWinRate: 0,
                lastUpdated: new Date().toISOString(),
                lastCalculated: Date.now(),
                totalLosses: 0,
                bestPosition: null,
                worstPosition: null,
                raceHistory: []
            };
        }
        
        // 3. Enforce eventClasses as primary source, compute selectedClasses
        if (!normalized.eventClasses || typeof normalized.eventClasses !== 'object') {
            normalized.eventClasses = {};
        }
        
        // If eventId and classes provided, add to eventClasses mapping
        if (data.eventId) {
            const classes = data.selectedClasses || data.sledClasses || 
                           (data.sledClass ? [data.sledClass] : []);
            if (classes.length > 0) {
                normalized.eventClasses[data.eventId] = Array.isArray(classes) ? classes : [classes];
            }
        }
        
        // Compute selectedClasses as aggregate from eventClasses
        normalized.selectedClasses = this.computeSelectedClasses(normalized.eventClasses);
        
        // 4. Set default values
        normalized.status = normalized.status || 'active';
        normalized.totalFee = typeof normalized.totalFee === 'number' ? normalized.totalFee : 0;
        
        return normalized;
    }

    /**
     * UPDATED: Update participant with structure enforcement and aggregate computation
     */
    async updateParticipant(id, updates) {
        try {
            const normalizedId = this.normalizeId(id);
            const index = this.data.participants.findIndex(
                p => this.normalizeId(p.id) === normalizedId
            );
            if (index === -1) {
                throw new Error('Participant not found');
            }

            // Add updated timestamp
            updates.updatedAt = new Date().toISOString();
            
            // Merge with existing data
            const updatedParticipant = { ...this.data.participants[index], ...updates };
            
            // Normalize to enforce consolidated structure
            const normalizedData = this.normalizeParticipantData(updatedParticipant);

            // Save to server
            const savedParticipant = await this.saveToServer('participants', normalizedData, true);
            
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
        const normalizedId = this.normalizeId(id);

        // First check in main participants array
        if (this.data.participants) {
            const participant = this.data.participants.find(
                p => this.normalizeId(p.id) === normalizedId
            );
            if (participant) {
                return participant;
            }
        }
        
        // Then check in event-specific participants
        if (this.data.eventParticipants) {
            for (const eventId in this.data.eventParticipants) {
                const eventParticipants = this.data.eventParticipants[eventId];
                const participant = eventParticipants.find(
                    p => this.normalizeId(p.id) === normalizedId
                );
                if (participant) {
                    return participant;
                }
            }
        }
        
        console.log(`🔍 DEBUG - Participant ${normalizedId} not found. Available: ${this.data.participants?.length || 0} participants + event-specific participants`);
        return null;
    }

    /**
     * Get participant by ID with server fallback.
     */
    async getParticipantById(id) {
        const participantId = this.normalizeId(id);
        if (!participantId) return null;

        const cached = this.getParticipant(participantId);
        if (cached) {
            return cached;
        }

        try {
            const response = await this.request(`${this.baseUrl}/participants/${encodeURIComponent(participantId)}`);
            if (!response.ok) {
                return null;
            }

            const participant = this.normalizeParticipantData(await response.json());
            if (!Array.isArray(this.data.participants)) {
                this.data.participants = [];
            }
            const existingIndex = this.data.participants.findIndex(
                p => this.normalizeId(p.id) === participantId
            );
            if (existingIndex >= 0) {
                this.data.participants[existingIndex] = participant;
            } else {
                this.data.participants.push(participant);
            }
            return participant;
        } catch (error) {
            console.error('Failed to fetch participant by ID:', error);
            return null;
        }
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
     * Calculate participant statistics for an event
     * Returns an object with uniqueDrivers and totalRegistrations
     */
    getEventParticipantStats(eventId) {
        const eventIdStr = eventId != null ? String(eventId) : '';
        if (!eventIdStr) {
            return { uniqueDrivers: 0, totalRegistrations: 0, eventParticipants: [] };
        }

        const allParticipants = this.getParticipantsArray();

        // Build a quick lookup map (includes any event-specific participant cache if present)
        const participantsById = new Map();
        allParticipants.forEach(p => {
            if (p && p.id != null) participantsById.set(String(p.id), p);
        });

        const eventSpecificParticipants = this.data?.eventParticipants?.[eventIdStr];
        if (Array.isArray(eventSpecificParticipants)) {
            eventSpecificParticipants.forEach(p => {
                if (p && p.id != null) participantsById.set(String(p.id), p);
            });
        }

        // Determine which participants belong to this event.
        // Primary source: event.participants (authoritative for registration).
        // Fallbacks: legacy participant.eventId, multi-event participant.eventIds/events, and eventClasses mapping.
        const participantIds = new Set();
        const event = this.getEvent(eventIdStr);
        if (event && Array.isArray(event.participants)) {
            event.participants.forEach(pid => {
                if (pid != null && pid !== '') participantIds.add(String(pid));
            });
        }

        allParticipants.forEach(p => {
            if (!p || p.id == null) return;
            const pid = String(p.id);

            // Legacy: single event binding
            if (p.eventId != null && String(p.eventId) === eventIdStr) {
                participantIds.add(pid);
                return;
            }

            // Multi-event: eventIds (server) or events (older schema)
            const eventIds = Array.isArray(p.eventIds) ? p.eventIds : Array.isArray(p.events) ? p.events : null;
            if (Array.isArray(eventIds) && eventIds.some(eid => String(eid) === eventIdStr)) {
                participantIds.add(pid);
                return;
            }

            // Event-specific classes imply registration
            if (
                p.eventClasses &&
                typeof p.eventClasses === 'object' &&
                Object.prototype.hasOwnProperty.call(p.eventClasses, eventIdStr)
            ) {
                participantIds.add(pid);
            }
        });

        const eventParticipants = Array.from(participantIds)
            .map(pid => participantsById.get(pid))
            .filter(Boolean);

        // Calculate total registrations (sum of class entries per participant for this specific event)
        const totalRegistrations = eventParticipants.reduce((sum, participant) => {
            const eventClasses =
                participant.eventClasses && typeof participant.eventClasses === 'object'
                    ? participant.eventClasses[eventIdStr]
                    : null;

            let classCount = 0;
            if (Array.isArray(eventClasses) && eventClasses.length > 0) {
                classCount = eventClasses.length;
            } else if (Array.isArray(participant.sledClasses) && participant.sledClasses.length > 0) {
                classCount = participant.sledClasses.length;
            } else if (Array.isArray(participant.selectedClasses) && participant.selectedClasses.length > 0) {
                classCount = participant.selectedClasses.length;
            } else if (participant.sledClass) {
                classCount = 1;
            } else {
                // Default to 1 entry if the participant is registered but class data is missing
                classCount = 1;
            }

            return sum + classCount;
        }, 0);

        return {
            uniqueDrivers: participantIds.size,
            totalRegistrations,
            eventParticipants
        };
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
     * DEPRECATED: Add new event via server only
     * @deprecated Use window.eventDataService.createEvent() instead
     */
    async addEvent(eventData) {
        console.warn('⚠️ DEPRECATED: dataManager.addEvent() - Use eventDataService.createEvent() instead');
        
        if (window.eventDataService) {
            return await window.eventDataService.createEvent(eventData);
        }
        throw new Error('eventDataService not available — cannot use deprecated dataManager.addEvent()');
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
     * Note: Uses eventDataService if available, otherwise direct data access
     */
    getEvent(id) {
        // Use eventDataService if available (avoids circular dependency)
        if (window.eventDataService) {
            return window.eventDataService.getEvent(id);
        }
        
        // Direct data access (standard fallback for pages without eventDataService)
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
     * DEPRECATED: Update event via server only
     * @deprecated Use window.eventDataService.updateEvent() instead
     */
    async updateEvent(id, updates) {
        console.warn('⚠️ DEPRECATED: dataManager.updateEvent() - Use eventDataService.updateEvent() instead');
        
        if (window.eventDataService) {
            return await window.eventDataService.updateEvent(id, updates);
        }
        throw new Error('eventDataService not available — cannot use deprecated dataManager.updateEvent()');
    }

    /**
     * DEPRECATED: Delete event via server only
     * @deprecated Use window.eventDataService.deleteEvent() instead
     */
    async deleteEvent(id) {
        console.warn('⚠️ DEPRECATED: dataManager.deleteEvent() - Use eventDataService.deleteEvent() instead');
        
        if (window.eventDataService) {
            return await window.eventDataService.deleteEvent(id);
        }
        throw new Error('eventDataService not available — cannot use deprecated dataManager.deleteEvent()');
    }

    /**
     * Update event status
     * Note: Uses eventDataService if available, otherwise direct server call
     */
    async updateEventStatus(eventId, newStatus) {
        // Use eventDataService if available (avoids circular dependency)
        if (window.eventDataService) {
            return await window.eventDataService.updateEventStatus(eventId, newStatus);
        }
        
        // Fallback: direct server call
        try {
            console.log(`🔄 Updating event ${eventId} status to: ${newStatus}`);
            
            const response = await this.request(`${this.baseUrl}/events/${eventId}`, {
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
     * @deprecated Use window.eventDataService.isEventCompleted() instead
     */
    async isEventCompleted(eventId) {
        console.warn('⚠️ DEPRECATED: dataManager.isEventCompleted() - Use eventDataService.isEventCompleted() instead');
        
        if (window.eventDataService) {
            return await window.eventDataService.isEventCompleted(eventId);
        }
        throw new Error('eventDataService not available — cannot use deprecated dataManager.isEventCompleted()');
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
     * @deprecated Use window.eventDataService.addParticipantToEvent() instead
     */
    async registerParticipantForEvent(eventId, participantId) {
        console.warn('⚠️ DEPRECATED: dataManager.registerParticipantForEvent() - Use eventDataService.addParticipantToEvent() instead');

        if (!eventId || !participantId) {
            throw new Error('Event ID and Participant ID are required');
        }

        try {
            const normalizedEventId = this.normalizeId(eventId);
            const normalizedParticipantId = this.normalizeId(participantId);
            const response = await this.request(`${this.baseUrl}/events/${eventId}/participants`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ participantId })
            });

            if (!response.ok) {
                let errorPayload = null;
                try {
                    errorPayload = await response.json();
                } catch (parseError) {
                    errorPayload = null;
                }
                const message = errorPayload?.error || `Failed to register participant for event: ${response.statusText}`;
                throw new Error(message);
            }

            let responseData = null;
            try {
                responseData = await response.json();
            } catch (parseError) {
                responseData = null;
            }

            // Update local cache for event + participant records
            if (Array.isArray(this.data.events)) {
                const eventIndex = this.data.events.findIndex(
                    e => this.normalizeId(e.id) === normalizedEventId
                );
                if (eventIndex !== -1) {
                    const event = this.data.events[eventIndex];
                    let participants = Array.isArray(event.participants) ? event.participants : [];
                    const hasParticipant = participants.some(
                        pid => this.normalizeId(pid) === normalizedParticipantId
                    );
                    if (!hasParticipant) {
                        participants = [...participants, participantId];
                    }
                    this.data.events[eventIndex] = {
                        ...event,
                        participants,
                        currentParticipants: participants.length
                    };
                }
            }

            if (Array.isArray(this.data.participants)) {
                const participantIndex = this.data.participants.findIndex(
                    p => this.normalizeId(p.id) === normalizedParticipantId
                );
                if (participantIndex !== -1) {
                    const participant = this.data.participants[participantIndex];
                    const eventIds = Array.isArray(participant.eventIds) ? participant.eventIds : [];
                    const hasEventId = eventIds.some(eid => this.normalizeId(eid) === normalizedEventId);
                    const updatedEventIds = hasEventId ? eventIds : [...eventIds, eventId];
                    this.data.participants[participantIndex] = {
                        ...participant,
                        eventIds: updatedEventIds
                    };
                }
            }

            if (this.data.eventParticipants && Array.isArray(this.data.eventParticipants[eventId])) {
                const eventParticipants = this.data.eventParticipants[eventId];
                const alreadyIncluded = eventParticipants.some(
                    p => this.normalizeId(p.id) === normalizedParticipantId
                );
                if (!alreadyIncluded) {
                    const participant = this.data.participants?.find(
                        p => this.normalizeId(p.id) === normalizedParticipantId
                    );
                    if (participant) {
                        this.data.eventParticipants[eventId] = [...eventParticipants, participant];
                    }
                }
            }

            return responseData?.success ?? true;
        } catch (error) {
            console.error('Failed to register participant for event:', error);
            throw error;
        }
    }

    /**
     * Remove participant from event
     * @deprecated Use window.eventDataService.removeParticipantFromEvent() instead
     */
    async removeParticipantFromEvent(eventId, participantId) {
        console.warn('⚠️ DEPRECATED: dataManager.removeParticipantFromEvent() - Use eventDataService.removeParticipantFromEvent() instead');
        
        if (window.eventDataService) {
            return await window.eventDataService.removeParticipantFromEvent(eventId, participantId);
        }
        throw new Error('eventDataService not available — cannot use deprecated dataManager.removeParticipantFromEvent()');
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
            if (!raceData.id) {
                raceData.id = 'race_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            }

            const now = new Date().toISOString();
            raceData.createdAt = now;
            raceData.updatedAt = now;

            const response = await this.request(`${this.baseUrl}/races`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(raceData)
            });

            if (!response.ok) {
                throw new Error(`Failed to add race: ${response.statusText}`);
            }

            const savedRace = await response.json();

            if (!Array.isArray(this.data.races)) {
                this.data.races = [];
            }
            this.data.races.push(savedRace);

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
     * WORKING: Save race bracket - uses localStorage as server is broken
     * UPDATED: Added mutex locking
     */
    async saveRaceBracket(eventId, bracketData) {
        return this.executeExclusive(`bracket_${eventId}`, async () => {
            try {
                bracketData.eventId = eventId;
                if (!bracketData.id) {
                    bracketData.id = this.generateUniqueId();
                }

                const response = await this.request(`${this.baseUrl}/race-brackets`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(bracketData)
                });

                if (!response.ok) {
                    throw new Error(`Failed to save race bracket: ${response.statusText}`);
                }

                const savedBracket = await response.json();
                this.data.raceBrackets[eventId] = savedBracket;

                // Also update the eventId mapping for consistency
                if (!this.data.raceBracketsByEvent) {
                    this.data.raceBracketsByEvent = {};
                }
                this.data.raceBracketsByEvent[eventId] = savedBracket;

                console.log('✅ Bracket saved via server:', savedBracket.id);
                return savedBracket;

            } catch (error) {
                console.error('❌ Bracket save failed:', error);
                this.data.raceBrackets[eventId] = bracketData;

                // Also update the eventId mapping for consistency
                if (!this.data.raceBracketsByEvent) {
                    this.data.raceBracketsByEvent = {};
                }
                this.data.raceBracketsByEvent[eventId] = bracketData;

                return bracketData;
            }
        });
    }

    /**
     * Clean up duplicate bracket entries for the same eventId
     */
    async cleanupDuplicateBrackets() {
        try {
            console.log('🔧 Cleaning up duplicate bracket entries...');
            const brackets = await this.fetchFromServer('race-brackets');

            if (!Array.isArray(brackets)) {
                console.warn('⚠️ Server returned non-array for race brackets during cleanup');
                return;
            }

            // Group brackets by eventId
            const bracketsByEvent = new Map();
            brackets.forEach(bracket => {
                if (bracket.eventId) {
                    if (!bracketsByEvent.has(bracket.eventId)) {
                        bracketsByEvent.set(bracket.eventId, []);
                    }
                    bracketsByEvent.get(bracket.eventId).push(bracket);
                }
            });

            // Find events with multiple brackets
            const eventsWithDuplicates = Array.from(bracketsByEvent.entries()).filter(([_, eventBrackets]) => eventBrackets.length > 1);

            if (eventsWithDuplicates.length === 0) {
                console.log('✅ No duplicate brackets found');
                return;
            }

            console.log(`🔧 Found ${eventsWithDuplicates.length} events with duplicate brackets`);

            // For each event with duplicates, keep only the most recent bracket
            const cleanupPromises = eventsWithDuplicates.map(async ([eventId, eventBrackets]) => {
                // Sort by updatedAt timestamp (most recent first)
                eventBrackets.sort((a, b) => {
                    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                    return bTime - aTime;
                });

                const keepBracket = eventBrackets[0];
                const deleteBrackets = eventBrackets.slice(1);

                console.log(`🔧 Event ${eventId}: keeping bracket ${keepBracket.id}, deleting ${deleteBrackets.length} duplicates`);

                // Delete duplicate brackets
                for (const bracket of deleteBrackets) {
                    try {
                        await this.request(`${this.baseUrl}/race-brackets/${bracket.id}`, {
                            method: 'DELETE'
                        });
                        console.log(`   🗑️ Deleted duplicate bracket ${bracket.id} for event ${eventId}`);
                    } catch (deleteError) {
                        // Handle 404 errors gracefully - bracket may already be deleted
                        if (deleteError.message.includes('404') || deleteError.message.includes('not found')) {
                            console.log(`   ℹ️ Duplicate bracket ${bracket.id} already deleted (404)`);
                        } else {
                            console.warn(`   ⚠️ Failed to delete duplicate bracket ${bracket.id}:`, deleteError);
                        }
                    }
                }

                return { eventId, kept: keepBracket.id, deleted: deleteBrackets.length };
            });

            const results = await Promise.all(cleanupPromises);
            const totalDeleted = results.reduce((sum, result) => sum + result.deleted, 0);

            console.log(`✅ Bracket cleanup completed: kept ${results.length} brackets, deleted ${totalDeleted} duplicates`);

            // Reload brackets to get the cleaned up data
            await this.loadRaceBrackets();

        } catch (error) {
            console.error('❌ Bracket cleanup failed:', error);
        }
    }

    /**
     * Update existing race bracket
     */
    async updateRaceBracket(bracketId, bracketData) {
        try {
            const response = await this.request(`${this.baseUrl}/race-brackets/${bracketId}`, {
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
     * Delete race bracket for an event
     */
    deleteRaceBracket(eventId) {
        try {
            console.log(`🗑️ Deleting race bracket for event: ${eventId}`);
            
            // Remove from local cache
            if (this.data.raceBrackets && this.data.raceBrackets[eventId]) {
                delete this.data.raceBrackets[eventId];
                console.log(`✅ Race bracket removed from local cache for event: ${eventId}`);
            }
            
            // Remove from server
            this.deleteFromServer('race-brackets', eventId).catch(error => {
                console.warn('⚠️ Failed to delete race bracket from server:', error);
            });
            
            // Emit event for UI updates
            if (this.eventBus) {
                this.eventBus.emit('raceBracketDeleted', { eventId });
            }
            
            return true;
        } catch (error) {
            console.error('❌ Error deleting race bracket:', error);
            return false;
        }
    }

    /**
     * Get race bracket by event ID (backwards compatibility)
     */
    async getRaceBracket(eventId) {
        // Ensure race brackets are loaded from localStorage first
        if (!this.loadedDataTypes.has('race-brackets')) {
            try {
                await this.loadRaceBrackets();
            } catch (error) {
                console.error('❌ Failed to load race brackets:', error);
                // Continue to try specific fetch
            }
        }

        // Try the new eventId map first, then fallback to old structure
        let bracket = this.data.raceBracketsByEvent?.[eventId] || this.data.raceBrackets?.[eventId];
        
        if (bracket && bracket.classes) {
            if (!this.data.raceBracketsByEvent) this.data.raceBracketsByEvent = {};
            this.data.raceBracketsByEvent[eventId] = bracket;
            return bracket;
        }

        // Not found in cache, try fetching specifically for this event
        try {
            console.log(`🔍 Bracket for event ${eventId} not found in cache, fetching from server...`);
            const url = `${this.baseUrl}/race-brackets?eventId=${eventId}`;
            const response = await this.request(url);
            
            if (response.ok) {
                const data = await response.json();
                // The API returns { brackets: [...], total: ... }
                if (data.brackets && data.brackets.length > 0) {
                    bracket = data.brackets[0];
                     
                     // Cache it
                     if (!this.data.raceBrackets) this.data.raceBrackets = {};
                     if (!this.data.raceBracketsByEvent) this.data.raceBracketsByEvent = {};
                     
                     if (bracket.id) {
                        this.data.raceBrackets[bracket.id] = bracket;
                     }
                     this.data.raceBrackets[eventId] = bracket;
                     this.data.raceBracketsByEvent[eventId] = bracket;
                     
                     console.log(`✅ Successfully fetched and cached bracket for event ${eventId}`);
                     return bracket;
                }
            }
        } catch (e) {
            console.error(`❌ Failed to fetch specific bracket for event ${eventId}:`, e);
        }
        
        return null;
    }

    /**
     * Get race bracket by bracket ID
     */
    getRaceBracketById(bracketId) {
        return this.data.raceBrackets?.[bracketId] || null;
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
     * Generate a unique ID (alias for generateId)
     */
    generateUniqueId() {
        return this.generateId();
    }

    /**
     * Get server health status
     */
    async getServerHealth() {
        try {
            const response = await this.request(`${this.baseUrl}/health`);
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