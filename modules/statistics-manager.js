/**
 * Unified Statistics Manager for EPC17 Event Management System
 * Handles all participant statistics calculations and updates
 * OPTIMIZED for large datasets (hundreds of events, thousands of drivers)
 * 
 * NOTE: This manager now works alongside the new AnalyticsEngine.
 * - StatisticsManager: Real-time race completion updates, participant stat tracking
 * - AnalyticsEngine: Read-only analytics queries via SQLite API endpoints
 * Both share the same data source (SQLite) but serve different purposes.
 */

class StatisticsManager {
    constructor(dataManager) {
        this.dataManager = dataManager;
        this.participantStats = new Map(); // participantId -> stats object
        this.eventBus = null; // Will be set by DataManager
        this.statsCache = new Map(); // Cache calculated statistics
        this.lastUpdateTime = new Map(); // Track when stats were last updated
        this.updateQueue = []; // Queue for background updates
        this.isProcessing = false; // Prevent concurrent processing
        this.batchSize = 50; // Process stats in batches
        
        window.debugLogger?.init('Statistics', 'StatisticsManager initialized (OPTIMIZED)');
    }

    /**
     * Set the event bus for notifications
     */
    setEventBus(eventBus) {
        this.eventBus = eventBus;
    }

    /**
     * OPTIMIZED: Update participant statistics with caching and batching (DEFERRED)
     * Returns immediately, processes in background
     */
    async updateParticipantStatistics(raceResults, eventId, heatId) {
        window.debugLogger?.debug('Statistics', 'Queueing participant statistics update for heat:', heatId);
        
        if (!raceResults || !Array.isArray(raceResults)) {
            console.warn('Invalid race results provided');
            return false;
        }

        // Queue the update for background processing
        this.updateQueue.push({
            raceResults,
            eventId,
            heatId,
            timestamp: Date.now()
        });

        // DEFERRED: Schedule processing instead of immediate execution
        this.scheduleQueueProcessing();

        // Return immediately - processing happens in background
        return true;
    }

    /**
     * Schedule queue processing with deferred execution
     */
    scheduleQueueProcessing() {
        // Clear any existing scheduled processing
        if (this.processingTimeout) {
            clearTimeout(this.processingTimeout);
        }

        // Use requestIdleCallback if available, otherwise setTimeout
        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => {
                if (!this.isProcessing && this.updateQueue.length > 0) {
                    this.processUpdateQueue();
                }
            }, { timeout: 2000 }); // Max 2 second wait
        } else {
            // Fallback to setTimeout with small delay
            this.processingTimeout = setTimeout(() => {
                if (!this.isProcessing && this.updateQueue.length > 0) {
                    this.processUpdateQueue();
                }
            }, 50); // 50ms delay to defer to next event loop cycle
        }

        window.debugLogger?.debug('Statistics', 'Statistics processing scheduled (deferred)');
    }

    /**
     * OPTIMIZED: Reverse participant statistics for a heat reset
     */
    async reverseParticipantStatistics(raceResults, eventId, heatId) {
        window.debugLogger?.debug('Statistics', 'Reversing participant statistics for heat:', heatId);
        
        if (!raceResults || !Array.isArray(raceResults)) {
            console.warn('Invalid race results provided for reversal');
            return false;
        }

        // Queue the reversal for background processing
        this.updateQueue.push({
            raceResults,
            eventId,
            heatId,
            timestamp: Date.now(),
            isReversal: true // Flag to indicate this is a reversal
        });

        // Process queue in background if not already processing
        if (!this.isProcessing) {
            this.processUpdateQueue();
        }

        return true;
    }

    /**
     * OPTIMIZED: Process update queue in background
     */
    async processUpdateQueue() {
        if (this.isProcessing || this.updateQueue.length === 0) {
            return;
        }

        this.isProcessing = true;
        window.debugLogger?.debug('Statistics', `Processing ${this.updateQueue.length} statistics updates...`);

        try {
            // Process updates in batches
            while (this.updateQueue.length > 0) {
                const batch = this.updateQueue.splice(0, this.batchSize);
                await this.processBatch(batch);
                
                // Yield control to prevent blocking UI
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        } catch (error) {
            console.error('❌ Error processing statistics updates:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * OPTIMIZED: Process a batch of updates
     */
    async processBatch(batch) {
        const updatedParticipants = new Set();
        const event = this.dataManager.getEvent(batch[0].eventId);

        for (const update of batch) {
            const { raceResults, eventId, heatId, isReversal = false } = update;
            
            // Process each participant's result
            for (const result of raceResults) {
                if (!result.participantId) continue;
                
                const participantId = result.participantId;
                const participant = this.dataManager.getParticipant(participantId);
                
                if (!participant) {
                    console.warn('Participant not found:', participantId);
                    continue;
                }

                // Check if stats need updating (cache invalidation)
                const cacheKey = `${participantId}_${eventId}`;
                const lastUpdate = this.lastUpdateTime.get(cacheKey) || 0;
                const updateTime = update.timestamp;
                
                if (updateTime <= lastUpdate) {
                    continue; // Skip if already updated
                }

                // Calculate updated statistics with caching
                const updatedStats = await this.calculateParticipantStatsOptimized(participantId);
                
                // Update participant record with new statistics
                const updates = {
                    totalRaces: updatedStats.totalRaces,
                    totalWins: updatedStats.totalWins,
                    winRate: updatedStats.winRate,
                    avgPosition: updatedStats.avgPosition,
                    bestStreak: updatedStats.bestStreak,
                    eventsParticipated: updatedStats.eventsParticipated,
                    lanePerformance: updatedStats.lanePerformance,
                    lastRaceDate: new Date().toISOString(),
                    statistics: updatedStats // Store complete stats object
                };

                // Update participant in database
                await this.dataManager.updateParticipant(participantId, updates);
                updatedParticipants.add(participantId);
                
                // Update cache
                this.statsCache.set(participantId, updatedStats);
                this.lastUpdateTime.set(cacheKey, updateTime);
                
                const action = isReversal ? 'Reversed' : 'Updated';
                window.debugLogger?.debug('Statistics', `${action} stats for ${participant.name}:`, {
                    races: updatedStats.totalRaces,
                    wins: updatedStats.totalWins,
                    winRate: `${updatedStats.winRate}%`
                });
            }
        }

        // Broadcast statistics update event
        if (this.eventBus && updatedParticipants.size > 0) {
            const eventType = batch[0].isReversal ? 'statistics-reversed' : 'statistics-updated';
            this.eventBus.emit(eventType, {
                participantIds: Array.from(updatedParticipants),
                eventId: batch[0].eventId,
                heatId: batch[0].heatId,
                timestamp: new Date().toISOString()
            });
        }

        const action = batch[0].isReversal ? 'reversed' : 'updated';
        window.debugLogger?.debug('Statistics', `Processed batch: ${updatedParticipants.size} participants ${action}`);
    }

    /**
     * OPTIMIZED: Calculate comprehensive statistics with caching
     */
    async calculateParticipantStatsOptimized(participantId) {
        // Check cache first
        if (this.statsCache.has(participantId)) {
            const cachedStats = this.statsCache.get(participantId);
            const cacheAge = Date.now() - (cachedStats.lastCalculated || 0);
            
            // Use cache if less than 5 minutes old
            if (cacheAge < 5 * 60 * 1000) {
                return cachedStats;
            }
        }

        const participant = this.dataManager.getParticipant(participantId);
        if (!participant) {
            return this.getEmptyStats();
        }

        // Get all races for this participant (optimized)
        const allRaces = await this.getParticipantRacesOptimized(participantId);
        
        if (allRaces.length === 0) {
            const emptyStats = this.getEmptyStats();
            this.statsCache.set(participantId, emptyStats);
            return emptyStats;
        }

        // Calculate basic stats
        const totalRaces = allRaces.length;
        const totalWins = allRaces.filter(race => race.position === 1).length;
        const winRate = totalRaces > 0 ? ((totalWins / totalRaces) * 100) : 0;
        
        // Calculate average position
        const positions = allRaces
            .map(race => race.position)
            .filter(pos => pos && pos > 0);
        const avgPosition = positions.length > 0 
            ? (positions.reduce((a, b) => a + b, 0) / positions.length) 
            : 0;

        // Calculate best win streak
        const bestStreak = this.calculateBestWinStreak(allRaces);

        // Count unique events
        const eventsParticipated = new Set(allRaces.map(race => race.eventId)).size;

        // Calculate lane performance
        const lanePerformance = this.calculateLanePerformance(allRaces);

        // Calculate recent performance (last 10 races)
        const recentRaces = allRaces.slice(-10);
        const recentWins = recentRaces.filter(race => race.position === 1).length;
        const recentWinRate = recentRaces.length > 0 ? ((recentWins / recentRaces.length) * 100) : 0;

        const stats = {
            totalRaces,
            totalWins,
            winRate: Math.round(winRate * 10) / 10, // Round to 1 decimal
            avgPosition: Math.round(avgPosition * 10) / 10,
            bestStreak,
            eventsParticipated,
            lanePerformance,
            recentWinRate: Math.round(recentWinRate * 10) / 10,
            lastUpdated: new Date().toISOString(),
            lastCalculated: Date.now(),
            // Additional detailed stats
            totalLosses: totalRaces - totalWins,
            bestPosition: positions.length > 0 ? Math.min(...positions) : null,
            worstPosition: positions.length > 0 ? Math.max(...positions) : null,
            raceHistory: allRaces.slice(-20) // Keep last 20 races for history
        };

        // Update cache
        this.statsCache.set(participantId, stats);
        
        return stats;
    }

    /**
     * OPTIMIZED: Get participant races with caching
     */
    async getParticipantRacesOptimized(participantId) {
        const cacheKey = `races_${participantId}`;
        const lastUpdate = this.lastUpdateTime.get(cacheKey) || 0;
        const cacheAge = Date.now() - lastUpdate;
        
        // Use cache if less than 10 minutes old
        if (cacheAge < 10 * 60 * 1000 && this.statsCache.has(cacheKey)) {
            return this.statsCache.get(cacheKey);
        }

        const races = [];
        
        // Get races from bracket data (optimized)
        const allBrackets = this.dataManager.data.raceBrackets || {};
        
        // Process brackets in chunks to prevent blocking
        const bracketEntries = Object.entries(allBrackets);
        const chunkSize = 10;
        
        for (let i = 0; i < bracketEntries.length; i += chunkSize) {
            const chunk = bracketEntries.slice(i, i + chunkSize);
            
            for (const [eventId, bracket] of chunk) {
                if (!bracket || !bracket.classes) continue;
                
                for (const [className, classBracket] of Object.entries(bracket.classes)) {
                    if (!classBracket.rounds) continue;
                    
                    for (const round of classBracket.rounds) {
                        if (!round.heats) continue;
                        
                        for (const heat of round.heats) {
                            if (!heat.results || !heat.lanes) continue;
                            
                            // Skip incomplete heats — only count completed races
                            if (!StatisticsManager.isHeatCompleted(heat)) continue;
                            
                            // Find this participant in the heat
                            const participantLane = heat.lanes.find(lane => 
                                lane.participant && lane.participant.id === participantId
                            );
                            
                            if (participantLane) {
                                // Find this participant's result
                                const participantResult = heat.results.find(result => 
                                    result.participantId === participantId
                                );
                                
                                if (participantResult) {
                                    races.push({
                                        eventId,
                                        className,
                                        round: round.roundNumber,
                                        heatId: heat.id,
                                        lane: participantLane.lane,
                                        position: participantResult.position,
                                        result: participantResult.result || 'completed',
                                        timestamp: heat.completedAt || round.createdAt,
                                        opponents: heat.lanes
                                            .filter(lane => lane.participant && lane.participant.id !== participantId)
                                            .map(lane => lane.participant.name)
                                            .join(', ')
                                    });
                                }
                            }
                        }
                    }
                }
            }
            
            // Yield control to prevent blocking UI
            if (i + chunkSize < bracketEntries.length) {
                await new Promise(resolve => setTimeout(resolve, 1));
            }
        }

        // Cache the result
        this.statsCache.set(cacheKey, races);
        this.lastUpdateTime.set(cacheKey, Date.now());
        
        return races;
    }

    /**
     * Calculate best win streak
     */
    calculateBestWinStreak(races) {
        let bestStreak = 0;
        let currentStreak = 0;
        
        // Sort races by timestamp to get chronological order
        const sortedRaces = [...races].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        for (const race of sortedRaces) {
            if (race.position === 1) {
                currentStreak++;
                bestStreak = Math.max(bestStreak, currentStreak);
            } else {
                currentStreak = 0;
            }
        }
        
        return bestStreak;
    }

    /**
     * Calculate lane performance statistics
     */
    calculateLanePerformance(races) {
        const laneStats = {};
        
        for (const race of races) {
            if (!race.lane) continue;
            
            if (!laneStats[race.lane]) {
                laneStats[race.lane] = { total: 0, wins: 0, winRate: 0 };
            }
            
            laneStats[race.lane].total++;
            if (race.position === 1) {
                laneStats[race.lane].wins++;
            }
        }
        
        // Calculate win rates
        for (const [lane, stats] of Object.entries(laneStats)) {
            stats.winRate = stats.total > 0 ? Math.round((stats.wins / stats.total) * 1000) / 10 : 0;
        }
        
        return laneStats;
    }

    /**
     * Get empty statistics object
     */
    getEmptyStats() {
        return {
            totalRaces: 0,
            totalWins: 0,
            winRate: 0,
            avgPosition: 0,
            bestStreak: 0,
            eventsParticipated: 0,
            lanePerformance: {},
            recentWinRate: 0,
            lastUpdated: new Date().toISOString(),
            totalLosses: 0,
            bestPosition: null,
            worstPosition: null,
            raceHistory: []
        };
    }

    /**
     * Get statistics for all participants
     */
    async getAllParticipantStats() {
        const participants = this.dataManager.getParticipantsArray();
        const stats = {};
        
        for (const participant of participants) {
            stats[participant.id] = await this.calculateParticipantStatsOptimized(participant.id);
        }
        
        return stats;
    }

    /**
     * Get event statistics
     */
    async getEventStats(eventId) {
        const event = this.dataManager.getEvent(eventId);
        if (!event) return null;
        
        const bracket = this.dataManager.getRaceBracket(eventId);
        if (!bracket) return null;
        
        const stats = {
            eventId,
            eventName: event.name,
            totalParticipants: 0,
            totalRaces: 0,
            completedRaces: 0,
            laneStats: {},
            classStats: {}
        };
        
        for (const [className, classBracket] of Object.entries(bracket.classes || {})) {
            const classParticipants = classBracket.participants ? classBracket.participants.length : 0;
            const classRaces = classBracket.rounds ? 
                classBracket.rounds.reduce((total, round) => total + (round.heats ? round.heats.length : 0), 0) : 0;
            const completedClassRaces = classBracket.rounds ? 
                classBracket.rounds.reduce((total, round) => {
                    return total + (round.heats ? round.heats.filter(heat => heat.isComplete).length : 0);
                }, 0) : 0;
            
            stats.totalParticipants += classParticipants;
            stats.totalRaces += classRaces;
            stats.completedRaces += completedClassRaces;
            
            stats.classStats[className] = {
                participants: classParticipants,
                races: classRaces,
                completedRaces: completedClassRaces
            };
        }
        
        return stats;
    }

    /**
     * OPTIMIZED: Recalculate all statistics with batching
     */
    async recalculateAllStats() {
        window.debugLogger?.debug('Statistics', 'Starting optimized statistics recalculation...');
        
        const participants = this.dataManager.getParticipantsArray();
        const totalParticipants = participants.length;
        let processedCount = 0;
        
        // Process in batches
        for (let i = 0; i < totalParticipants; i += this.batchSize) {
            const batch = participants.slice(i, i + this.batchSize);
            
            const batchPromises = batch.map(async (participant) => {
                try {
                    const stats = await this.calculateParticipantStatsOptimized(participant.id);
                    
                    // Update participant record
                    const updates = {
                        totalRaces: stats.totalRaces,
                        totalWins: stats.totalWins,
                        winRate: stats.winRate,
                        avgPosition: stats.avgPosition,
                        bestStreak: stats.bestStreak,
                        eventsParticipated: stats.eventsParticipated,
                        lanePerformance: stats.lanePerformance,
                        statistics: stats
                    };
                    
                    await this.dataManager.updateParticipant(participant.id, updates);
                    processedCount++;
                    
                    if (processedCount % 10 === 0) {
                        window.debugLogger?.debug('Statistics', `Processed ${processedCount}/${totalParticipants} participants`);
                    }
                    
                } catch (error) {
                    console.error(`❌ Error processing participant ${participant.id}:`, error);
                }
            });
            
            await Promise.all(batchPromises);
            
            // Yield control to prevent blocking UI
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        window.debugLogger?.debug('Statistics', `Statistics recalculation completed: ${processedCount} participants processed`);
        return processedCount;
    }

    /**
     * Clear statistics cache
     */
    clearCache(participantId = null) {
        if (participantId) {
            this.statsCache.delete(participantId);
            this.lastUpdateTime.delete(participantId);
        } else {
            this.statsCache.clear();
            this.lastUpdateTime.clear();
        }
        window.debugLogger?.debug('Statistics', 'Statistics cache cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            statsCacheSize: this.statsCache.size,
            lastUpdateTimeSize: this.lastUpdateTime.size,
            updateQueueLength: this.updateQueue.length,
            isProcessing: this.isProcessing
        };
    }

    /**
     * CENTRALIZED: Get overall statistics across all events and participants
     * Used by analytics.html
     */
    async getOverallStats() {
        const cacheKey = 'overall_stats';
        const lastUpdate = this.lastUpdateTime.get(cacheKey) || 0;
        const cacheAge = Date.now() - lastUpdate;
        
        // Use cache if less than 30 seconds old
        if (cacheAge < 30 * 1000 && this.statsCache.has(cacheKey)) {
            return this.statsCache.get(cacheKey);
        }

        window.debugLogger?.debug('Statistics', 'Calculating overall statistics...');

        const allParticipants = this.dataManager.getParticipantsArray() || [];
        const allEvents = this.dataManager.data.events || [];
        const allBrackets = this.dataManager.data.raceBrackets || {};

        // Calculate total revenue
        const totalRevenue = allParticipants.reduce((sum, p) => {
            return sum + (p.totalFee || 0);
        }, 0);

        // Count unique drivers (participants with unique IDs)
        const uniqueDrivers = new Set(allParticipants.map(p => p.id)).size;

        // Count total entries (all participant-event registrations)
        const totalEntries = allParticipants.reduce((sum, p) => {
            const eventClasses = p.eventClasses || {};
            return sum + Object.keys(eventClasses).length;
        }, 0);

        // Count total races across all brackets
        let totalRaces = 0;
        for (const bracket of Object.values(allBrackets)) {
            if (!bracket || !bracket.classes) continue;
            
            for (const classBracket of Object.values(bracket.classes)) {
                if (!classBracket.rounds) continue;
                
                for (const round of classBracket.rounds) {
                    if (round.heats) {
                        totalRaces += round.heats.filter(h => h.status === 'completed').length;
                    }
                }
            }
        }

        // Calculate events by status
        const eventsByStatus = {
            upcoming: allEvents.filter(e => e.status === 'upcoming').length,
            active: allEvents.filter(e => e.status === 'active' || e.status === 'in-progress').length,
            completed: allEvents.filter(e => e.status === 'completed').length,
            cancelled: allEvents.filter(e => e.status === 'cancelled').length
        };

        // Calculate average participation per event
        const avgParticipantsPerEvent = allEvents.length > 0 
            ? totalEntries / allEvents.length 
            : 0;

        const stats = {
            totalRevenue,
            uniqueDrivers,
            totalEntries,
            totalRaces,
            totalEvents: allEvents.length,
            eventsByStatus,
            avgParticipantsPerEvent: Math.round(avgParticipantsPerEvent * 10) / 10,
            lastUpdated: new Date().toISOString(),
            lastCalculated: Date.now()
        };

        // Cache result
        this.statsCache.set(cacheKey, stats);
        this.lastUpdateTime.set(cacheKey, Date.now());

        return stats;
    }

    /**
     * CENTRALIZED: Get driver statistics with optional event filtering
     * @param {string} participantId - The participant ID
     * @param {string} eventId - Optional event ID to filter by
     */
    async getDriverStats(participantId, eventId = null) {
        const cacheKey = eventId ? `driver_${participantId}_event_${eventId}` : `driver_${participantId}`;
        const lastUpdate = this.lastUpdateTime.get(cacheKey) || 0;
        const cacheAge = Date.now() - lastUpdate;
        
        // Use cache if less than 2 minutes old
        if (cacheAge < 2 * 60 * 1000 && this.statsCache.has(cacheKey)) {
            return this.statsCache.get(cacheKey);
        }

        const participant = this.dataManager.getParticipant(participantId);
        if (!participant) {
            return this.getEmptyStats();
        }

        // Get all races for this participant
        let allRaces = await this.getParticipantRacesOptimized(participantId);

        // Filter by event if specified
        if (eventId) {
            allRaces = allRaces.filter(race => race.eventId === eventId);
        }

        if (allRaces.length === 0) {
            const emptyStats = this.getEmptyStats();
            this.statsCache.set(cacheKey, emptyStats);
            this.lastUpdateTime.set(cacheKey, Date.now());
            return emptyStats;
        }

        // Calculate statistics (using existing calculation logic)
        const totalRaces = allRaces.length;
        const totalWins = allRaces.filter(race => race.position === 1).length;
        const winRate = totalRaces > 0 ? ((totalWins / totalRaces) * 100) : 0;
        
        const positions = allRaces.map(race => race.position).filter(pos => pos && pos > 0);
        const avgPosition = positions.length > 0 
            ? (positions.reduce((a, b) => a + b, 0) / positions.length) 
            : 0;

        const bestStreak = this.calculateBestWinStreak(allRaces);
        const eventsParticipated = new Set(allRaces.map(race => race.eventId)).size;
        const lanePerformance = this.calculateLanePerformance(allRaces);

        const recentRaces = allRaces.slice(-10);
        const recentWins = recentRaces.filter(race => race.position === 1).length;
        const recentWinRate = recentRaces.length > 0 ? ((recentWins / recentRaces.length) * 100) : 0;

        const stats = {
            participantId,
            participantName: participant.name,
            eventId: eventId || 'all',
            totalRaces,
            totalWins,
            winRate: Math.round(winRate * 10) / 10,
            avgPosition: Math.round(avgPosition * 10) / 10,
            bestStreak,
            eventsParticipated,
            lanePerformance,
            recentWinRate: Math.round(recentWinRate * 10) / 10,
            totalLosses: totalRaces - totalWins,
            bestPosition: positions.length > 0 ? Math.min(...positions) : null,
            worstPosition: positions.length > 0 ? Math.max(...positions) : null,
            raceHistory: allRaces.slice(-20),
            lastUpdated: new Date().toISOString(),
            lastCalculated: Date.now()
        };

        // Cache result
        this.statsCache.set(cacheKey, stats);
        this.lastUpdateTime.set(cacheKey, Date.now());

        return stats;
    }

    /**
     * CENTRALIZED: Get time-based analytics with optional event filtering
     * @param {string} eventId - Optional event ID to filter by
     */
    async getTimeAnalytics(eventId = null) {
        const cacheKey = eventId ? `time_analytics_${eventId}` : 'time_analytics_all';
        const lastUpdate = this.lastUpdateTime.get(cacheKey) || 0;
        const cacheAge = Date.now() - lastUpdate;
        
        // Use cache if less than 1 minute old
        if (cacheAge < 60 * 1000 && this.statsCache.has(cacheKey)) {
            return this.statsCache.get(cacheKey);
        }

        window.debugLogger?.debug('Statistics', 'Calculating time analytics...');

        let events = this.dataManager.data.events || [];
        let brackets = this.dataManager.data.raceBrackets || {};

        // Filter by event if specified
        if (eventId) {
            events = events.filter(e => e.id === eventId);
            brackets = { [eventId]: brackets[eventId] };
        }

        // Group events by month
        const eventsByMonth = {};
        const revenueByMonth = {};
        const participantsByMonth = {};

        for (const event of events) {
            if (!event.date) continue;
            
            const date = new Date(event.date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            
            // Count events
            eventsByMonth[monthKey] = (eventsByMonth[monthKey] || 0) + 1;
            
            // Sum revenue
            const eventParticipants = this.dataManager.getParticipantsArray()
                .filter(p => {
                    const eventClasses = p.eventClasses || {};
                    return eventClasses[event.id] && eventClasses[event.id].length > 0;
                });
            
            const eventRevenue = eventParticipants.reduce((sum, p) => sum + (p.totalFee || 0), 0);
            revenueByMonth[monthKey] = (revenueByMonth[monthKey] || 0) + eventRevenue;
            
            // Count unique participants
            participantsByMonth[monthKey] = (participantsByMonth[monthKey] || 0) + eventParticipants.length;
        }

        // Calculate races over time
        const racesByMonth = {};
        for (const [eventIdKey, bracket] of Object.entries(brackets)) {
            const event = events.find(e => e.id === eventIdKey);
            if (!event || !event.date) continue;
            
            const date = new Date(event.date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            
            let eventRaceCount = 0;
            if (bracket && bracket.classes) {
                for (const classBracket of Object.values(bracket.classes)) {
                    if (!classBracket.rounds) continue;
                    
                    for (const round of classBracket.rounds) {
                        if (round.heats) {
                            eventRaceCount += round.heats.filter(h => h.status === 'completed').length;
                        }
                    }
                }
            }
            
            racesByMonth[monthKey] = (racesByMonth[monthKey] || 0) + eventRaceCount;
        }

        const analytics = {
            eventId: eventId || 'all',
            eventsByMonth,
            revenueByMonth,
            participantsByMonth,
            racesByMonth,
            lastUpdated: new Date().toISOString(),
            lastCalculated: Date.now()
        };

        // Cache result
        this.statsCache.set(cacheKey, analytics);
        this.lastUpdateTime.set(cacheKey, Date.now());

        return analytics;
    }

    /**
     * CENTRALIZED: Get class breakdown statistics for an event
     * @param {string} eventId - The event ID
     */
    async getClassBreakdown(eventId) {
        const cacheKey = `class_breakdown_${eventId}`;
        const lastUpdate = this.lastUpdateTime.get(cacheKey) || 0;
        const cacheAge = Date.now() - lastUpdate;
        
        // Use cache if less than 2 minutes old
        if (cacheAge < 2 * 60 * 1000 && this.statsCache.has(cacheKey)) {
            return this.statsCache.get(cacheKey);
        }

        const event = this.dataManager.getEvent(eventId);
        if (!event) {
            return {};
        }

        const participants = this.dataManager.getParticipantsArray()
            .filter(p => {
                const eventClasses = p.eventClasses || {};
                return eventClasses[eventId] && eventClasses[eventId].length > 0;
            });

        const classBreakdown = {};
        
        for (const participant of participants) {
            const classes = participant.eventClasses[eventId] || [];
            
            for (const className of classes) {
                if (!classBreakdown[className]) {
                    classBreakdown[className] = {
                        name: className,
                        participants: 0,
                        totalRevenue: 0
                    };
                }
                
                classBreakdown[className].participants++;
                // Distribute fee evenly across classes
                const feePerClass = (participant.totalFee || 0) / classes.length;
                classBreakdown[className].totalRevenue += feePerClass;
            }
        }

        // Cache result
        this.statsCache.set(cacheKey, classBreakdown);
        this.lastUpdateTime.set(cacheKey, Date.now());

        return classBreakdown;
    }

    /**
     * CENTRALIZED: Get lane performance statistics for an event
     * @param {string} eventId - Optional event ID to filter by
     */
    async getLanePerformanceStats(eventId = null) {
        const cacheKey = eventId ? `lane_performance_${eventId}` : 'lane_performance_all';
        const lastUpdate = this.lastUpdateTime.get(cacheKey) || 0;
        const cacheAge = Date.now() - lastUpdate;
        
        // Use cache if less than 2 minutes old
        if (cacheAge < 2 * 60 * 1000 && this.statsCache.has(cacheKey)) {
            return this.statsCache.get(cacheKey);
        }

        let brackets = this.dataManager.data.raceBrackets || {};
        
        // Filter by event if specified
        if (eventId) {
            brackets = { [eventId]: brackets[eventId] };
        }

        const laneStats = {};
        
        for (const bracket of Object.values(brackets)) {
            if (!bracket || !bracket.classes) continue;
            
            for (const classBracket of Object.values(bracket.classes)) {
                if (!classBracket.rounds) continue;
                
                for (const round of classBracket.rounds) {
                    if (!round.heats) continue;
                    
                    for (const heat of round.heats) {
                        if (!heat.results || !heat.lanes) continue;
                        
                        // Skip incomplete heats — only count completed races
                        if (!StatisticsManager.isHeatCompleted(heat)) continue;
                        
                        for (const result of heat.results) {
                            const lane = heat.lanes.find(l => 
                                l.participant && l.participant.id === result.participantId
                            );
                            
                            if (lane) {
                                const laneNum = lane.lane;
                                
                                if (!laneStats[laneNum]) {
                                    laneStats[laneNum] = {
                                        lane: laneNum,
                                        totalRaces: 0,
                                        totalWins: 0,
                                        winRate: 0
                                    };
                                }
                                
                                laneStats[laneNum].totalRaces++;
                                if (result.position === 1) {
                                    laneStats[laneNum].totalWins++;
                                }
                            }
                        }
                    }
                }
            }
        }

        // Calculate win rates
        for (const stats of Object.values(laneStats)) {
            if (stats.totalRaces > 0) {
                stats.winRate = Math.round((stats.totalWins / stats.totalRaces) * 100 * 10) / 10;
            }
        }

        // Cache result
        this.statsCache.set(cacheKey, laneStats);
        this.lastUpdateTime.set(cacheKey, Date.now());

        return laneStats;
    }

    /**
     * Determine whether a heat should be treated as completed for statistics.
     * Mirrors the Python is_heat_completed() logic in server.py.
     * @param {Object} heat - Heat object from bracket data
     * @returns {boolean} True if the heat is completed
     */
    static isHeatCompleted(heat) {
        if (!heat || typeof heat !== 'object') return false;
        // Legacy schema: isComplete flag
        if (heat.isComplete === true) return true;
        // Current schema: status + non-empty results
        if (heat.status === 'completed') {
            return Array.isArray(heat.results) && heat.results.length > 0;
        }
        return false;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StatisticsManager;
} 