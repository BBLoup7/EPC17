/**
 * Unified Statistics Manager for EPC17 Event Management System
 * Handles all participant statistics calculations and updates
 * OPTIMIZED for large datasets (hundreds of events, thousands of drivers)
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
        
        console.log('📊 StatisticsManager initialized (OPTIMIZED)');
    }

    /**
     * Set the event bus for notifications
     */
    setEventBus(eventBus) {
        this.eventBus = eventBus;
    }

    /**
     * OPTIMIZED: Update participant statistics with caching and batching
     */
    async updateParticipantStatistics(raceResults, eventId, heatId) {
        console.log('📊 Updating participant statistics for heat:', heatId);
        
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

        // Process queue in background if not already processing
        if (!this.isProcessing) {
            this.processUpdateQueue();
        }

        return true;
    }

    /**
     * OPTIMIZED: Reverse participant statistics for a heat reset
     */
    async reverseParticipantStatistics(raceResults, eventId, heatId) {
        console.log('📊 Reversing participant statistics for heat:', heatId);
        
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
        console.log(`📊 Processing ${this.updateQueue.length} statistics updates...`);

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
                console.log(`📊 ${action} stats for ${participant.name}:`, {
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
        console.log(`✅ Processed batch: ${updatedParticipants.size} participants ${action}`);
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
        console.log('📊 Starting optimized statistics recalculation...');
        
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
                        console.log(`📊 Processed ${processedCount}/${totalParticipants} participants`);
                    }
                    
                } catch (error) {
                    console.error(`❌ Error processing participant ${participant.id}:`, error);
                }
            });
            
            await Promise.all(batchPromises);
            
            // Yield control to prevent blocking UI
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        console.log(`✅ Statistics recalculation completed: ${processedCount} participants processed`);
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
        console.log('🧹 Statistics cache cleared');
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
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StatisticsManager;
} 