/**
 * Enhanced Pairing Engine Module for EPC17 Event Management System
 * Handles multi-lane race generation, lane assignment optimization, and opponent tracking
 */

class PairingEngine {
    constructor() {
        this.laneHistory = new Map(); // Track lane usage per driver: driverId -> {lane1: count, lane2: count, ...}
        this.opponentHistory = new Map(); // Track opponent pairings: driverId -> Set(opponentIds)
        this.raceHistory = new Map(); // Track all races for a driver: driverId -> [raceIds]
        this.classLaneStats = new Map(); // Track lane stats per class
        this.eventRaceNumbers = new Map(); // Track race numbers for each event: eventId -> next race number
    }

    /**
     * Initialize tracking for an event
     */
    initializeEvent(eventId, participants, numberOfLanes) {
        console.log(`Initializing pairing engine for event ${eventId}`, {
            participants: participants.length,
            numberOfLanes
        });
        
        // Reset histories for this event
        this.clearHistories();
        
        // Initialize race numbering for this event
        this.eventRaceNumbers.set(eventId, 1);
        
        // Initialize lane history for all participants
        participants.forEach(participant => {
            const laneStats = {};
            for (let lane = 1; lane <= numberOfLanes; lane++) {
                laneStats[lane] = 0;
            }
            this.laneHistory.set(participant.id, laneStats);
            this.opponentHistory.set(participant.id, new Set());
            this.raceHistory.set(participant.id, []);
        });
        
        return true;
    }

    /**
     * Get the next race number for an event
     */
    getNextRaceNumber(eventId) {
        if (!this.eventRaceNumbers.has(eventId)) {
            this.eventRaceNumbers.set(eventId, 1);
        }
        return this.eventRaceNumbers.get(eventId);
    }

    /**
     * Increment the race number for an event
     */
    incrementRaceNumber(eventId) {
        const current = this.getNextRaceNumber(eventId);
        this.eventRaceNumbers.set(eventId, current + 1);
        return current;
    }

    /**
     * Explicitly set the next race number for an event
     */
    setNextRaceNumber(eventId, nextNumber) {
        const n = Number(nextNumber);
        const safe = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
        this.eventRaceNumbers.set(eventId, safe);
        return safe;
    }

    /**
     * Validate that a race number hasn't been used before
     * Rule: EPC17_WORKFLOW.md v1 - prevent race number conflicts
     */
    validateRaceNumber(eventId, raceNumber) {
        if (!Number.isFinite(raceNumber) || raceNumber <= 0) {
            console.warn(`⚠️ Invalid race number: ${raceNumber}`);
            return false;
        }

        // Check if this race number is already in use
        const currentNext = this.getNextRaceNumber(eventId);
        if (raceNumber >= currentNext) {
            console.warn(`⚠️ Race number ${raceNumber} conflicts with next available number ${currentNext}`);
            return false;
        }

        return true;
    }

    /**
     * Get all used race numbers for an event (for validation)
     */
    getUsedRaceNumbers(eventId) {
        // This would need to be implemented with access to the race data
        // For now, we'll use a simple approach based on the next race number
        const nextNumber = this.getNextRaceNumber(eventId);
        const usedNumbers = [];
        for (let i = 1; i < nextNumber; i++) {
            usedNumbers.push(i);
        }
        return usedNumbers;
    }

    /**
     * Generate heats for a round using multi-lane logic with Free Run support and performance optimizations
     */
    async generateHeats(participants, numberOfLanes, roundNumber = 1, eventId = null, freeRunEnabled = false) {
        console.log(`🔧 OPTIMIZED: Generating heats for round ${roundNumber}`, {
            participants: participants.length,
            numberOfLanes,
            isFirstRound: roundNumber === 1,
            freeRunEnabled,
            isLargeDataset: participants.length > 50
        });

        // Performance warnings and early termination for very large datasets
        if (participants.length > 500) {
            console.warn(`⚠️ PERFORMANCE WARNING: ${participants.length} participants detected. Consider breaking into smaller events for optimal performance.`);
            
            // Show warning to user
            if (window.showToast) {
                window.showToast(`Very large dataset (${participants.length} participants). Consider breaking into smaller events for better performance.`, 'warning');
            }
            
            // For extremely large datasets, add more processing breaks but keep same logic
            if (participants.length > 1000) {
                console.warn(`🚨 Processing ${participants.length} participants with extra performance optimizations`);
            }
        } else if (participants.length > 100) {
            console.warn(`⚠️ Large dataset detected (${participants.length} participants). Processing may take longer.`);
        }

        // Debug pairing logic (reduced for performance)
        if (participants.length <= 20 || roundNumber === 1) {
            this.debugPairingLogic(participants, numberOfLanes, roundNumber);
        }

        if (participants.length === 0) {
            return [];
        }

        // If fewer participants than lanes, create one final heat
        if (participants.length <= numberOfLanes) {
            return [this.createFinalHeat(participants, numberOfLanes, roundNumber)];
        }

        const heats = [];
        let availableParticipants = [...participants];
        let heatNumber = 1;

        // For first round, shuffle participants completely randomly
        if (roundNumber === 1) {
            console.log('First round detected - applying full randomization');
            availableParticipants = this.shuffleArray(availableParticipants);
        }

        // Apply Free Run logic for heat assignment with performance optimization
        if (freeRunEnabled) {
            console.log('🏃 Free Run Mode ENABLED - Fill races to capacity first');
            const generatedHeats = await this.generateHeatsWithFreeRunOptimized(availableParticipants, numberOfLanes, roundNumber, eventId);
            heats.push(...generatedHeats);
        } else {
            console.log('⚖️ Balanced Mode ENABLED - Balance last races');
            const generatedHeats = await this.generateHeatsBalancedOptimized(availableParticipants, numberOfLanes, roundNumber, eventId);
            heats.push(...generatedHeats);
        }

        console.log(`✅ Generated ${heats.length} heats for round ${roundNumber} (Free Run: ${freeRunEnabled})`);
        
        // Safety check - ensure we always return an array
        if (!Array.isArray(heats)) {
            console.error('❌ CRITICAL ERROR: generateHeats did not return an array:', heats);
            return [];
        }
        
        return heats;
    }

    /**
     * Generate heats with Free Run enabled - fill to capacity first
     */
    generateHeatsWithFreeRun(participants, numberOfLanes, roundNumber, eventId) {
        const heats = [];
        let availableParticipants = [...participants];
        let heatNumber = 1;

        console.log(`🏃 Free Run Mode: ${availableParticipants.length} drivers, ${numberOfLanes} lanes`);

        // Generate heats until all participants are assigned
        while (availableParticipants.length > 0) {
            const participantsRemaining = availableParticipants.length;
            
            if (participantsRemaining <= numberOfLanes) {
                // Last heat - take all remaining participants
                const finalHeat = this.createFinalHeat(availableParticipants, numberOfLanes, roundNumber, eventId);
                heats.push(finalHeat);
                console.log(`🏃 Free Run: Final heat with ${participantsRemaining} drivers`);
                break;
            } else {
                // Take full lanes worth (fill to capacity)
                const heat = this.createOptimalHeat(
                    availableParticipants, 
                    numberOfLanes, 
                    roundNumber, 
                    heatNumber,
                    eventId
                );
                
                if (heat) {
                    heats.push(heat);
                    console.log(`🏃 Free Run: Heat ${heatNumber} with ${numberOfLanes} drivers (filled to capacity)`);
                    
                    // Remove assigned participants
                    heat.lanes.forEach(laneAssignment => {
                        if (laneAssignment.participant) {
                            const index = availableParticipants.findIndex(p => 
                                p.id === laneAssignment.participant.id
                            );
                            if (index !== -1) {
                                availableParticipants.splice(index, 1);
                            }
                        }
                    });
                    
                    heatNumber++;
                } else {
                    break;
                }
            }
        }

        return heats;
    }

    /**
     * OPTIMIZED: Generate heats with Free Run enabled - with chunked processing
     */
    async generateHeatsWithFreeRunOptimized(participants, numberOfLanes, roundNumber, eventId) {
        const heats = [];
        let availableParticipants = [...participants];
        let heatNumber = 1;
        const startTime = Date.now();

        console.log(`🔧 OPTIMIZED Free Run Mode: ${availableParticipants.length} drivers, ${numberOfLanes} lanes`);

        // Process in chunks to prevent UI blocking - optimized for different dataset sizes
        const isLargeDataset = participants.length > 200;
        const isVeryLargeDataset = participants.length > 1000;
        
        // More frequent breaks for larger datasets but same logic
        const chunkSize = isVeryLargeDataset ? 2 : (isLargeDataset ? 5 : 10);
        let processedHeats = 0;

        // Generate heats until all participants are assigned
        while (availableParticipants.length > 0) {
            const participantsRemaining = availableParticipants.length;
            
            if (participantsRemaining <= numberOfLanes) {
                // Last heat - take all remaining participants
                const finalHeat = this.createFinalHeat(availableParticipants, numberOfLanes, roundNumber, eventId);
                heats.push(finalHeat);
                console.log(`🏃 Optimized Free Run: Final heat with ${participantsRemaining} drivers`);
                break;
            } else {
                // Take full lanes worth (fill to capacity)
                const heat = await this.createOptimalHeatOptimized(
                    availableParticipants, 
                    numberOfLanes, 
                    roundNumber, 
                    heatNumber,
                    eventId
                );
                
                if (heat) {
                    heats.push(heat);
                    console.log(`🏃 Optimized Free Run: Heat ${heatNumber} with ${numberOfLanes} drivers`);
                    
                    // Remove assigned participants
                    heat.lanes.forEach(laneAssignment => {
                        if (laneAssignment.participant) {
                            const index = availableParticipants.findIndex(p => 
                                p.id === laneAssignment.participant.id
                            );
                            if (index !== -1) {
                                availableParticipants.splice(index, 1);
                            }
                        }
                    });
                    
                    heatNumber++;
                    processedHeats++;
                    
                    // Yield control every chunk to prevent UI blocking
                    if (processedHeats % chunkSize === 0) {
                        await new Promise(resolve => setTimeout(resolve, 5));
                        
                        // Performance monitoring and user feedback for large datasets
                        const elapsed = Date.now() - startTime;
                        if (isVeryLargeDataset && processedHeats % 50 === 0) {
                            console.log(`🔧 Progress: Generated ${processedHeats} heats, ${availableParticipants.length} participants remaining (${elapsed}ms elapsed)`);
                        }
                        
                        // Reasonable timeout for extremely large datasets (but keep processing)
                        if (elapsed > 120000) { // 2 minute timeout - much more generous
                            console.warn(`⚠️ Heat generation taking longer than expected (${elapsed}ms). Continuing but consider breaking into smaller events.`);
                            // Don't break - just warn and continue with same logic
                        }
                    }
                } else {
                    break;
                }
            }
        }

        const totalTime = Date.now() - startTime;
        console.log(`✅ Optimized Free Run completed: ${heats.length} heats in ${totalTime}ms (avg: ${Math.round(totalTime/heats.length)}ms per heat)`);
        return heats;
    }

    /**
     * Generate heats with balanced mode - balance the last 2 races optimally
     */
    generateHeatsBalanced(participants, numberOfLanes, roundNumber, eventId) {
        const heats = [];
        let availableParticipants = [...participants];
        let heatNumber = 1;

        const totalParticipants = availableParticipants.length;
        console.log(`⚖️ Balanced Mode: ${totalParticipants} drivers, ${numberOfLanes} lanes`);

        // Calculate optimal distribution for balanced racing
        const optimalDistribution = this.calculateOptimalBalancedDistribution(totalParticipants, numberOfLanes);
        console.log(`⚖️ Optimal distribution:`, optimalDistribution);

        // Generate heats according to optimal distribution
        for (let i = 0; i < optimalDistribution.length; i++) {
            const participantsForThisHeat = optimalDistribution[i];
            
            // Take the required number of participants
            const selectedParticipants = availableParticipants.splice(0, participantsForThisHeat);
            
            const heat = this.createOptimalHeat(
                selectedParticipants, 
                numberOfLanes, 
                roundNumber, 
                heatNumber,
                eventId
            );
            
            if (heat) {
                heats.push(heat);
                console.log(`⚖️ Balanced: Heat ${heatNumber} with ${participantsForThisHeat} drivers`);
                heatNumber++;
            }
        }

        return heats;
    }

    /**
     * OPTIMIZED: Generate heats with balanced mode - with performance optimizations
     */
    async generateHeatsBalancedOptimized(participants, numberOfLanes, roundNumber, eventId) {
        const heats = [];
        let availableParticipants = [...participants];
        let heatNumber = 1;
        const startTime = Date.now();

        const totalParticipants = availableParticipants.length;
        console.log(`🔧 OPTIMIZED Balanced Mode: ${totalParticipants} drivers, ${numberOfLanes} lanes`);

        // Calculate optimal distribution for balanced racing
        const optimalDistribution = this.calculateOptimalBalancedDistribution(totalParticipants, numberOfLanes);
        console.log(`⚖️ Optimal distribution:`, optimalDistribution);

        // Process in chunks to prevent UI blocking - optimized for different dataset sizes  
        const isLargeDataset = totalParticipants > 200;
        const isVeryLargeDataset = totalParticipants > 1000;
        
        // More frequent breaks for larger datasets but same logic
        const chunkSize = isVeryLargeDataset ? 2 : (isLargeDataset ? 3 : 5);
        let processedHeats = 0;

        // Generate heats according to optimal distribution
        for (let i = 0; i < optimalDistribution.length; i++) {
            const participantsForThisHeat = optimalDistribution[i];
            
            // Take the required number of participants
            const selectedParticipants = availableParticipants.splice(0, participantsForThisHeat);
            
            const heat = await this.createOptimalHeatOptimized(
                selectedParticipants, 
                numberOfLanes, 
                roundNumber, 
                heatNumber,
                eventId
            );
            
            if (heat) {
                heats.push(heat);
                console.log(`⚖️ Optimized Balanced: Heat ${heatNumber} with ${participantsForThisHeat} drivers`);
                heatNumber++;
                processedHeats++;
                
                // Yield control every chunk to prevent UI blocking
                if (processedHeats % chunkSize === 0) {
                    await new Promise(resolve => setTimeout(resolve, 5));
                    
                    // Performance monitoring and user feedback for large datasets
                    const elapsed = Date.now() - startTime;
                    if (isVeryLargeDataset && processedHeats % 50 === 0) {
                        console.log(`🔧 Balanced Progress: Generated ${processedHeats} heats (${elapsed}ms elapsed)`);
                    }
                    
                    // Reasonable timeout for extremely large datasets (but keep processing)
                    if (elapsed > 120000) { // 2 minute timeout - much more generous
                        console.warn(`⚠️ Balanced heat generation taking longer than expected (${elapsed}ms). Continuing but consider breaking into smaller events.`);
                        // Don't break - just warn and continue with same logic
                    }
                }
            }
        }

        const totalTime = Date.now() - startTime;
        console.log(`✅ Optimized Balanced completed: ${heats.length} heats in ${totalTime}ms (avg: ${Math.round(totalTime/heats.length)}ms per heat)`);
        return heats;
    }

    /**
     * Calculate optimal balanced distribution for the last 2 races
     * Examples:
     * - 6 drivers, 5 lanes = [3, 3] (2 races of 3)
     * - 7 drivers, 5 lanes = [4, 3] (1 race of 4, 1 race of 3)
     * - 4 drivers, 3 lanes = [2, 2] (2 races of 2)
     */
    calculateOptimalBalancedDistribution(totalParticipants, numberOfLanes) {
        if (totalParticipants <= numberOfLanes) {
            // Single race if participants <= lanes
            return [totalParticipants];
        }

        const fullHeats = Math.floor(totalParticipants / numberOfLanes);
        const remainingParticipants = totalParticipants % numberOfLanes;

        console.log(`⚖️ Distribution calculation: ${totalParticipants} total, ${fullHeats} full heats, ${remainingParticipants} remaining`);

        if (remainingParticipants === 0) {
            // Perfect fit - all heats are full
            return Array(fullHeats).fill(numberOfLanes);
        }

        // We have remaining participants to distribute optimally
        const distribution = [];

        if (fullHeats === 0) {
            // All participants fit in one heat, but we want to balance
            if (totalParticipants <= 2) {
                return [totalParticipants];
            } else {
                // Split into 2 balanced races
                const firstRace = Math.ceil(totalParticipants / 2);
                const secondRace = totalParticipants - firstRace;
                return [firstRace, secondRace];
            }
        }

        // Add full heats first
        for (let i = 0; i < fullHeats - 1; i++) {
            distribution.push(numberOfLanes);
        }

        // Now handle the last 2 races optimally
        const participantsForLastTwoRaces = numberOfLanes + remainingParticipants;
        
        if (participantsForLastTwoRaces <= numberOfLanes * 2) {
            // We can balance the last 2 races
            const firstOfLastTwo = Math.ceil(participantsForLastTwoRaces / 2);
            const secondOfLastTwo = participantsForLastTwoRaces - firstOfLastTwo;
            
            distribution.push(firstOfLastTwo);
            distribution.push(secondOfLastTwo);
        } else {
            // We need more than 2 races for the remaining participants
            // Add one more full heat and handle the rest
            distribution.push(numberOfLanes);
            
            // Handle the final remaining participants
            if (remainingParticipants <= 2) {
                // Split remaining into 2 races if possible
                if (remainingParticipants === 1) {
                    // Take 1 from the last full heat to create 2 balanced races
                    const lastFullHeat = distribution[distribution.length - 1];
                    distribution[distribution.length - 1] = lastFullHeat - 1;
                    distribution.push(2); // 1 moved + 1 remaining
                } else {
                    distribution.push(remainingParticipants);
                }
            } else {
                // Split remaining participants optimally
                const firstRemaining = Math.ceil(remainingParticipants / 2);
                const secondRemaining = remainingParticipants - firstRemaining;
                distribution.push(firstRemaining);
                distribution.push(secondRemaining);
            }
        }

        console.log(`⚖️ Final balanced distribution:`, distribution);
        return distribution;
    }

    /**
     * Create an optimal heat assignment
     */
    createOptimalHeat(availableParticipants, numberOfLanes, roundNumber, heatNumber, eventId = null) {
        const participantsToAssign = Math.min(availableParticipants.length, numberOfLanes);
        
        if (participantsToAssign === 0) {
            return null;
        }

        let selectedParticipants;
        
        // First round: completely random selection
        if (roundNumber === 1) {
            selectedParticipants = availableParticipants.slice(0, participantsToAssign);
            console.log(`Round 1: Selected first ${participantsToAssign} participants randomly`);
        } else {
            // Subsequent rounds: apply constraints
            selectedParticipants = this.selectOptimalParticipants(
                availableParticipants, 
                participantsToAssign,
                roundNumber
            );
            console.log(`Round ${roundNumber}: Applied constraints for participant selection`);
        }

        // Assign lanes optimally (always apply lane distribution logic)
        const laneAssignments = this.assignLanesOptimally(selectedParticipants, numberOfLanes, roundNumber);

        // Get race number for this event
        const raceNumber = eventId ? this.incrementRaceNumber(eventId) : heatNumber;
        
        console.log(`🏁 Assigned Race #${raceNumber} to heat ${heatNumber} in round ${roundNumber}${eventId ? ` for event ${eventId}` : ''}`);

        return {
            id: `heat-r${roundNumber}-h${heatNumber}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            round: roundNumber,
            heatNumber,
            raceNumber,
            numberOfLanes,
            lanes: laneAssignments,
            status: 'pending',
            results: null,
            startTime: null,
            endTime: null
        };
    }

    /**
     * OPTIMIZED: Create an optimal heat assignment with performance optimizations
     */
    async createOptimalHeatOptimized(availableParticipants, numberOfLanes, roundNumber, heatNumber, eventId = null) {
        const participantsToAssign = Math.min(availableParticipants.length, numberOfLanes);
        
        if (participantsToAssign === 0) {
            return null;
        }

        let selectedParticipants;
        
        // First round: completely random selection
        if (roundNumber === 1) {
            selectedParticipants = availableParticipants.slice(0, participantsToAssign);
            if (participantsToAssign <= 10) { // Only log for smaller groups to reduce console spam
                console.log(`Round 1: Selected first ${participantsToAssign} participants randomly`);
            }
        } else {
            // Subsequent rounds: apply constraints with performance optimization
            selectedParticipants = await this.selectOptimalParticipantsOptimized(
                availableParticipants, 
                participantsToAssign,
                roundNumber
            );
            if (participantsToAssign <= 10) { // Only log for smaller groups
                console.log(`Round ${roundNumber}: Applied optimized constraints for participant selection`);
            }
        }

        // Assign lanes optimally with performance optimization
        const laneAssignments = await this.assignLanesOptimallyOptimized(selectedParticipants, numberOfLanes, roundNumber);

        // Get race number for this event
        const raceNumber = eventId ? this.incrementRaceNumber(eventId) : heatNumber;
        
        if (heatNumber <= 5 || heatNumber % 10 === 0) { // Reduced logging frequency
            console.log(`🏁 Assigned Race #${raceNumber} to heat ${heatNumber} in round ${roundNumber}${eventId ? ` for event ${eventId}` : ''}`);
        }

        return {
            id: `heat-r${roundNumber}-h${heatNumber}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            round: roundNumber,
            heatNumber,
            raceNumber,
            numberOfLanes,
            lanes: laneAssignments,
            status: 'pending',
            results: null,
            startTime: null,
            endTime: null
        };
    }

    /**
     * Create a final heat (when participants <= lanes)
     */
    createFinalHeat(participants, numberOfLanes, roundNumber = 1, eventId = null) {
        const laneAssignments = this.assignLanesOptimally(participants, numberOfLanes, roundNumber);
        
        // Get race number for this event
        const raceNumber = eventId ? this.incrementRaceNumber(eventId) : 1;
        
        console.log(`🏁 Assigned Race #${raceNumber} to FINAL heat in round ${roundNumber}${eventId ? ` for event ${eventId}` : ''}`);

        return {
            id: `final-heat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            round: 'final',
            heatNumber: 1,
            raceNumber,
            numberOfLanes,
            lanes: laneAssignments,
            status: 'pending',
            results: null,
            startTime: null,
            endTime: null,
            isFinal: true
        };
    }

    /**
     * Shuffle array using Fisher-Yates algorithm
     */
    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        console.log('Array shuffled:', {
            original: array.map(p => p.name),
            shuffled: shuffled.map(p => p.name)
        });
        return shuffled;
    }

    /**
     * Select optimal participants for a heat based on lane diversity and opponent history
     */
    selectOptimalParticipants(availableParticipants, count, roundNumber = 1) {
        if (availableParticipants.length <= count) {
            return [...availableParticipants];
        }

        // For first round, just return first participants (they're already shuffled)
        if (roundNumber === 1) {
            return availableParticipants.slice(0, count);
        }

        console.log(`Applying constraints for round ${roundNumber} participant selection (prioritizing lane diversity)`);

        // Enhanced selection that prioritizes lane diversity
        return this.selectParticipantsWithLaneDiversity(availableParticipants, count, roundNumber);
    }

    /**
     * Select participants prioritizing those with different least-used lanes
     */
    selectParticipantsWithLaneDiversity(availableParticipants, count, roundNumber) {
        console.log(`Selecting ${count} participants with lane diversity priority`);
        
        // Get each participant's least used lane
        const participantLanePrefs = availableParticipants.map(participant => {
            const laneStats = this.laneHistory.get(participant.id) || {};
            const leastUsedLane = this.getLeastUsedLane(laneStats);
            const opponents = this.opponentHistory.get(participant.id) || new Set();
            
            return {
                participant,
                leastUsedLane: leastUsedLane.lane,
                leastUsedCount: leastUsedLane.count,
                opponentCount: opponents.size
            };
        });

        console.log('Participant lane preferences:', participantLanePrefs.map(p => 
            `${p.participant.name}: lane ${p.leastUsedLane} (used ${p.leastUsedCount} times)`
        ));

        // Try to find the best combination with diverse lanes and minimal rematches
        if (availableParticipants.length <= 10) {
            // For small groups, use exhaustive search
            const combinations = this.generateCombinations(availableParticipants, count, roundNumber);
            let bestCombination = null;
            let bestScore = Infinity;

            combinations.forEach(combination => {
                const score = this.calculateDiverseCombinationScore(combination);
                if (score < bestScore) {
                    bestScore = score;
                    bestCombination = combination;
                }
            });

            const result = bestCombination || availableParticipants.slice(0, count);
            console.log(`Selected via exhaustive search:`, result.map(p => p.name));
            return result;
        } else {
            // For large groups, use improved greedy selection
            const result = this.greedySelectionWithLaneDiversity(participantLanePrefs, count);
            console.log(`Selected via greedy lane diversity:`, result.map(p => p.name));
            return result;
        }
    }

    /**
     * Greedy selection prioritizing lane diversity
     */
    greedySelectionWithLaneDiversity(participantPrefs, count) {
        const selected = [];
        const available = [...participantPrefs];
        const usedLanes = new Set();

        console.log('Starting greedy selection with lane diversity...');

        // Select participants with different least-used lanes first
        while (selected.length < count && available.length > 0) {
            let bestParticipant = null;
            let bestScore = Infinity;

            available.forEach((participantPref, index) => {
                const participant = participantPref.participant;
                const leastUsedLane = participantPref.leastUsedLane;
                
                // Calculate score based on lane diversity and rematch avoidance
                let score = 0;
                
                // Bonus for using a lane that hasn't been used by other selected participants
                if (!usedLanes.has(leastUsedLane)) {
                    score -= 100; // Big bonus for lane diversity
                    console.log(`  ${participant.name}: Lane diversity bonus (lane ${leastUsedLane})`);
                }
                
                // Penalty for rematches
                const selectedParticipants = selected.map(s => s.participant);
                selectedParticipants.forEach(other => {
                    if (this.haveRacedBefore(participant.id, other.id)) {
                        score += 50; // Penalty for rematch
                        console.log(`  ${participant.name}: Rematch penalty vs ${other.name}`);
                    }
                });
                
                // Slight bonus for lower lane usage count
                score += participantPref.leastUsedCount;
                
                console.log(`  ${participant.name}: Score ${score} (lane ${leastUsedLane}, used ${participantPref.leastUsedCount} times)`);
                
                if (score < bestScore) {
                    bestScore = score;
                    bestParticipant = { participantPref, index };
                }
            });

            if (bestParticipant) {
                const participantPref = bestParticipant.participantPref;
                selected.push(participantPref);
                usedLanes.add(participantPref.leastUsedLane);
                available.splice(bestParticipant.index, 1);
                
                console.log(`Selected ${participantPref.participant.name} (lane ${participantPref.leastUsedLane}, score: ${bestScore})`);
            } else {
                break;
            }
        }

        return selected.map(p => p.participant);
    }

    /**
     * Calculate combination score considering lane diversity and rematches
     */
    calculateDiverseCombinationScore(participants) {
        let score = 0;
        
        // Get lane preferences for each participant
        const lanePrefs = participants.map(p => {
            const laneStats = this.laneHistory.get(p.id) || {};
            return this.getLeastUsedLane(laneStats).lane;
        });
        
        // Bonus for lane diversity (unique least-used lanes)
        const uniqueLanes = new Set(lanePrefs);
        const diversityBonus = uniqueLanes.size * -20; // More unique lanes = better score
        score += diversityBonus;
        
        // Penalty for rematches
        for (let i = 0; i < participants.length; i++) {
            for (let j = i + 1; j < participants.length; j++) {
                if (this.haveRacedBefore(participants[i].id, participants[j].id)) {
                    score += 30; // Rematch penalty
                }
            }
        }
        
        return score;
    }

    /**
     * Generate all possible combinations of participants
     */
    generateCombinations(participants, count, roundNumber = 1) {
        if (count > participants.length) {
            return [participants];
        }

        // For performance, limit to reasonable number of combinations
        if (participants.length > 10) {
            // Use greedy approach for large groups
            return [this.greedySelection(participants, count, roundNumber)];
        }

        const combinations = [];
        const generate = (start, current) => {
            if (current.length === count) {
                combinations.push([...current]);
                return;
            }
            
            for (let i = start; i < participants.length; i++) {
                current.push(participants[i]);
                generate(i + 1, current);
                current.pop();
            }
        };

        generate(0, []);
        return combinations;
    }

    /**
     * Greedy selection for large participant groups
     */
    greedySelection(participants, count, roundNumber = 1) {
        const selected = [];
        const available = [...participants];

        // For first round, select completely randomly
        if (roundNumber === 1) {
            console.log('Greedy selection: First round - selecting randomly');
            const shuffled = this.shuffleArray(available);
            return shuffled.slice(0, count);
        }

        console.log('Greedy selection: Applying rematch constraints');

        // Select first participant randomly
        const firstIndex = Math.floor(Math.random() * available.length);
        selected.push(available.splice(firstIndex, 1)[0]);

        // Select remaining participants to minimize rematches
        while (selected.length < count && available.length > 0) {
            let bestParticipant = null;
            let bestScore = Infinity;

            available.forEach(participant => {
                const score = this.calculateParticipantScore(participant, selected);
                if (score < bestScore) {
                    bestScore = score;
                    bestParticipant = participant;
                }
            });

            if (bestParticipant) {
                selected.push(bestParticipant);
                const index = available.indexOf(bestParticipant);
                available.splice(index, 1);
                console.log(`Selected ${bestParticipant.name} (score: ${bestScore})`);
            }
        }

        return selected;
    }

    /**
     * Calculate score for a participant when paired with others
     */
    calculateParticipantScore(participant, otherParticipants) {
        let score = 0;
        const participantOpponents = this.opponentHistory.get(participant.id) || new Set();

        otherParticipants.forEach(other => {
            if (participantOpponents.has(other.id)) {
                score += 10; // Heavy penalty for rematches
            }
        });

        return score;
    }

    /**
     * Calculate compatibility score for a combination of participants
     */
    calculateCombinationScore(participants) {
        let score = 0;

        // Check all pairwise opponent histories
        for (let i = 0; i < participants.length; i++) {
            for (let j = i + 1; j < participants.length; j++) {
                const p1Opponents = this.opponentHistory.get(participants[i].id) || new Set();
                if (p1Opponents.has(participants[j].id)) {
                    score += 10; // Penalty for rematch
                }
            }
        }

        return score;
    }

    /**
     * Assign lanes optimally using points-based system to minimize lane repetition
     */
    assignLanesOptimally(participants, numberOfLanes, roundNumber = 1) {
        const laneAssignments = [];
        
        // Initialize all lanes as empty
        for (let lane = 1; lane <= numberOfLanes; lane++) {
            laneAssignments.push({
                lane,
                participant: null
            });
        }

        // If no participants, return empty lanes
        if (participants.length === 0) {
            return laneAssignments;
        }

        // For first round, assign lanes randomly
        if (roundNumber === 1) {
            console.log('Round 1: Assigning lanes randomly');
            const shuffledParticipants = this.shuffleArray([...participants]);
            
            shuffledParticipants.forEach((participant, index) => {
                if (index < numberOfLanes) {
                    laneAssignments[index].participant = participant;
                }
            });
            
            console.log('Round 1 lane assignments:', laneAssignments.map(la => ({
                lane: la.lane,
                participant: la.participant?.name || 'Empty'
            })));
            
            return laneAssignments;
        }

        console.log(`Round ${roundNumber}: Applying enhanced points-based lane optimization`);

        // Use improved points-based lane assignment algorithm
        return this.assignLanesWithPointsSystem(participants, numberOfLanes, laneAssignments);
    }

    /**
     * OPTIMIZED: Assign lanes optimally with performance optimizations
     */
    async assignLanesOptimallyOptimized(participants, numberOfLanes, roundNumber = 1) {
        const laneAssignments = [];
        
        // Initialize all lanes as empty
        for (let lane = 1; lane <= numberOfLanes; lane++) {
            laneAssignments.push({
                lane,
                participant: null
            });
        }

        // If no participants, return empty lanes
        if (participants.length === 0) {
            return laneAssignments;
        }

        // For first round, assign lanes randomly (no optimization needed)
        if (roundNumber === 1) {
            if (participants.length <= 10) { // Reduce logging
                console.log('Round 1: Assigning lanes randomly');
            }
            const shuffledParticipants = this.shuffleArray([...participants]);
            
            shuffledParticipants.forEach((participant, index) => {
                if (index < numberOfLanes) {
                    laneAssignments[index].participant = participant;
                }
            });
            
            if (participants.length <= 10) { // Reduce logging
                console.log('Round 1 lane assignments:', laneAssignments.map(la => ({
                    lane: la.lane,
                    participant: la.participant?.name || 'Empty'
                })));
            }
            
            return laneAssignments;
        }

        if (participants.length <= 10) { // Reduce logging
            console.log(`Round ${roundNumber}: Applying optimized points-based lane optimization`);
        }

        // Use optimized points-based lane assignment algorithm
        return await this.assignLanesWithPointsSystemOptimized(participants, numberOfLanes, laneAssignments);
    }

    /**
     * OPTIMIZED: Select optimal participants with performance optimizations
     */
    async selectOptimalParticipantsOptimized(availableParticipants, count, roundNumber = 1) {
        if (availableParticipants.length <= count) {
            return [...availableParticipants];
        }

        // For first round, just return first participants (they're already shuffled)
        if (roundNumber === 1) {
            return availableParticipants.slice(0, count);
        }

        // For large datasets, use simplified selection to avoid performance bottlenecks
        if (availableParticipants.length > 50) {
            console.log(`🔧 Large dataset (${availableParticipants.length} participants): Using simplified selection for performance`);
            return this.selectParticipantsSimplified(availableParticipants, count, roundNumber);
        }

        if (availableParticipants.length <= 20) { // Only log for smaller groups
            console.log(`Applying optimized constraints for round ${roundNumber} participant selection`);
        }

        // For smaller datasets, use the full optimization with async processing
        return await this.selectParticipantsWithLaneDiversityOptimized(availableParticipants, count, roundNumber);
    }

    /**
     * Simplified participant selection for large datasets
     */
    selectParticipantsSimplified(availableParticipants, count, roundNumber) {
        // Simple approach: randomize order and take first N, with basic rematch avoidance
        const shuffled = this.shuffleArray([...availableParticipants]);
        
        // Try to avoid obvious rematches by checking first few participants
        const selected = [];
        const used = new Set();
        
        for (const participant of shuffled) {
            if (selected.length >= count) break;
            
            // Simple rematch check: avoid if recently raced with someone already selected
            let hasRecentRematch = false;
            if (roundNumber > 2) { // Only check for rematch avoidance after round 2
                for (const otherParticipant of selected) {
                    if (this.haveRacedBefore(participant.id, otherParticipant.id)) {
                        hasRecentRematch = true;
                        break;
                    }
                }
            }
            
            if (!hasRecentRematch || selected.length === 0) {
                selected.push(participant);
                used.add(participant.id);
            }
        }
        
        // Fill remaining slots if needed
        while (selected.length < count && selected.length < shuffled.length) {
            for (const participant of shuffled) {
                if (!used.has(participant.id)) {
                    selected.push(participant);
                    used.add(participant.id);
                    break;
                }
            }
        }
        
        return selected.slice(0, count);
    }

    /**
     * OPTIMIZED: Select participants with lane diversity - async version
     */
    async selectParticipantsWithLaneDiversityOptimized(availableParticipants, count, roundNumber) {
        console.log(`Selecting ${count} participants with optimized lane diversity priority`);
        
        // Get each participant's least used lane
        const participantLanePrefs = availableParticipants.map(participant => {
            const laneStats = this.laneHistory.get(participant.id) || {};
            const leastUsedLane = this.getLeastUsedLane(laneStats);
            const opponents = this.opponentHistory.get(participant.id) || new Set();
            
            return {
                participant,
                leastUsedLane: leastUsedLane.lane,
                leastUsedCount: leastUsedLane.count,
                opponentCount: opponents.size
            };
        });

        if (availableParticipants.length <= 20) { // Reduce logging
            console.log('Participant lane preferences:', participantLanePrefs.map(p => 
                `${p.participant.name}: lane ${p.leastUsedLane} (used ${p.leastUsedCount} times)`
            ));
        }

        // Try to find the best combination with diverse lanes and minimal rematches
        if (availableParticipants.length <= 8) { // Reduced threshold for exhaustive search
            // For small groups, use exhaustive search
            const combinations = this.generateCombinations(availableParticipants, count, roundNumber);
            let bestCombination = null;
            let bestScore = Infinity;

            // Process combinations in chunks to prevent blocking
            const chunkSize = 50;
            for (let i = 0; i < combinations.length; i += chunkSize) {
                const chunk = combinations.slice(i, i + chunkSize);
                
                chunk.forEach(combination => {
                    const score = this.calculateDiverseCombinationScore(combination);
                    if (score < bestScore) {
                        bestScore = score;
                        bestCombination = combination;
                    }
                });
                
                // Yield control every chunk
                if (i + chunkSize < combinations.length) {
                    await new Promise(resolve => setTimeout(resolve, 1));
                }
            }

            const result = bestCombination || availableParticipants.slice(0, count);
            if (availableParticipants.length <= 10) { // Reduce logging
                console.log(`Selected via optimized exhaustive search:`, result.map(p => p.name));
            }
            return result;
        } else {
            // For larger groups, use improved greedy selection
            const result = await this.greedySelectionWithLaneDiversityOptimized(participantLanePrefs, count);
            if (availableParticipants.length <= 20) { // Reduce logging
                console.log(`Selected via optimized greedy lane diversity:`, result.map(p => p.name));
            }
            return result;
        }
    }

    /**
     * OPTIMIZED: Greedy selection with performance improvements
     */
    async greedySelectionWithLaneDiversityOptimized(participantPrefs, count) {
        const selected = [];
        const available = [...participantPrefs];
        const usedLanes = new Set();

        if (participantPrefs.length <= 10) { // Reduce logging
            console.log('Starting optimized greedy selection with lane diversity...');
        }

        // Select participants with different least-used lanes first
        while (selected.length < count && available.length > 0) {
            let bestParticipant = null;
            let bestScore = Infinity;

            // Process available participants in chunks for large datasets
            const chunkSize = Math.min(20, available.length);
            for (let i = 0; i < available.length; i += chunkSize) {
                const chunk = available.slice(i, Math.min(i + chunkSize, available.length));
                
                chunk.forEach((participantPref, chunkIndex) => {
                    const actualIndex = i + chunkIndex;
                    const participant = participantPref.participant;
                    const leastUsedLane = participantPref.leastUsedLane;
                    
                    // Calculate score based on lane diversity and rematch avoidance
                    let score = 0;
                    
                    // Bonus for using a lane that hasn't been used by other selected participants
                    if (!usedLanes.has(leastUsedLane)) {
                        score -= 100; // Big bonus for lane diversity
                    }
                    
                    // Penalty for rematches
                    const selectedParticipants = selected.map(s => s.participant);
                    selectedParticipants.forEach(other => {
                        if (this.haveRacedBefore(participant.id, other.id)) {
                            score += 50; // Penalty for rematch
                        }
                    });
                    
                    // Slight bonus for lower lane usage count
                    score += participantPref.leastUsedCount;
                    
                    if (score < bestScore) {
                        bestScore = score;
                        bestParticipant = { participantPref, index: actualIndex };
                    }
                });
                
                // Yield control every chunk for large datasets
                if (available.length > 50 && i + chunkSize < available.length) {
                    await new Promise(resolve => setTimeout(resolve, 1));
                }
            }

            if (bestParticipant) {
                const participantPref = bestParticipant.participantPref;
                selected.push(participantPref);
                usedLanes.add(participantPref.leastUsedLane);
                available.splice(bestParticipant.index, 1);
                
                if (participantPrefs.length <= 10) { // Reduce logging
                    console.log(`Selected ${participantPref.participant.name} (lane ${participantPref.leastUsedLane}, score: ${bestScore})`);
                }
            } else {
                break;
            }
        }

        return selected.map(p => p.participant);
    }

    /**
     * OPTIMIZED: Points-based lane assignment with performance improvements
     */
    async assignLanesWithPointsSystemOptimized(participants, numberOfLanes, laneAssignments) {
        if (participants.length <= 10) { // Reduce logging
            console.log('🎯 Assigning lanes with optimized points-based system...');
            console.log(`   Participants: ${participants.length}, Available lanes: ${numberOfLanes}`);
        }
        
        // Calculate points for each participant-lane combination
        const participantLaneScores = participants.map(participant => {
            const laneStats = this.laneHistory.get(participant.id) || {};
            const laneScores = [];
            
            for (let lane = 1; lane <= numberOfLanes; lane++) {
                const usage = laneStats[lane] || 0;
                // Points system: 2 points for first race, +1 for each additional
                let points = 0;
                if (usage > 0) {
                    points = 2 + (usage - 1); // 2 for first, +1 for each additional
                }
                // If never raced on this lane, 0 points (best option)
                
                laneScores.push({
                    lane,
                    usage,
                    points,
                    participant
                });
            }
            
            // Sort by points (lowest first - best lanes)
            laneScores.sort((a, b) => a.points - b.points);
            
            return {
                participant,
                laneScores,
                bestLane: laneScores[0].lane,
                bestPoints: laneScores[0].points
            };
        });

        if (participants.length <= 10) { // Reduce logging
            console.log('📊 Participant lane scores:');
            participantLaneScores.forEach(p => {
                const topLanes = p.laneScores.slice(0, 3).map(ls => `L${ls.lane}:${ls.points}pts`).join(', ');
                console.log(`   ${p.participant.name}: ${topLanes}`);
            });
        }

        // Check for rematches among participants
        const rematchCount = this.countRematches(participants);
        if (participants.length <= 10) { // Reduce logging
            console.log(`⚠️  Rematch count: ${rematchCount} pairs have raced before`);
        }

        // Find optimal assignment using optimized algorithm
        const assignment = await this.findOptimalPointsAssignmentOptimized(participantLaneScores, numberOfLanes);
        
        // Apply the assignment and calculate total points
        let totalPoints = 0;
        assignment.forEach(({ participant, lane }) => {
            const participantScore = participantLaneScores.find(p => p.participant.id === participant.id);
            const laneScore = participantScore.laneScores.find(ls => ls.lane === lane);
            
            laneAssignments[lane - 1].participant = participant;
            totalPoints += laneScore.points;
            
            if (participants.length <= 10) { // Reduce logging
                console.log(`   ✅ ${participant.name} -> Lane ${lane} (${laneScore.points} pts, usage: ${laneScore.usage})`);
            }
        });

        if (participants.length <= 10) { // Reduce logging
            console.log(`🎯 Total assignment points: ${totalPoints} (lower is better)`);
            console.log(`📈 Average points per participant: ${(totalPoints / participants.length).toFixed(1)}`);
        }

        return laneAssignments;
    }

    /**
     * OPTIMIZED: Find optimal lane assignment with performance improvements
     */
    async findOptimalPointsAssignmentOptimized(participantLaneScores, numberOfLanes) {
        const participants = participantLaneScores.map(p => p.participant);
        
        // For small groups, try exhaustive search (reduced threshold)
        if (participants.length <= 4) { // Reduced from 5 to 4
            return await this.exhaustivePointsSearchOptimized(participantLaneScores, numberOfLanes);
        } else {
            // For larger groups, use improved greedy algorithm
            return await this.greedyPointsAssignmentOptimized(participantLaneScores, numberOfLanes);
        }
    }

    /**
     * OPTIMIZED: Exhaustive search with chunked processing
     */
    async exhaustivePointsSearchOptimized(participantLaneScores, numberOfLanes) {
        const participants = participantLaneScores.map(p => p.participant);
        
        let bestAssignment = null;
        let bestScore = Infinity;
        let processedCount = 0;
        
        if (participants.length <= 10) { // Reduce logging
            console.log('🔍 Using optimized exhaustive search for optimal assignment...');
        }
        
        const startTime = Date.now();
        
        // Generate all possible lane assignments with chunked processing
        const generateAssignments = async (participantIndex, currentAssignment, usedLanes) => {
            if (participantIndex >= participants.length) {
                const score = this.calculatePointsAssignmentScore(currentAssignment, participantLaneScores);
                if (score < bestScore) {
                    bestScore = score;
                    bestAssignment = [...currentAssignment];
                }
                processedCount++;
                
                // Yield control periodically to prevent blocking
                if (processedCount % 100 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 1));
                    
                    // Early termination for long-running searches
                    const elapsed = Date.now() - startTime;
                    if (elapsed > 5000) { // 5 second timeout
                        console.warn(`⚠️ Exhaustive search timeout reached (${elapsed}ms). Using best found so far.`);
                        return;
                    }
                }
                return;
            }
            
            const participant = participants[participantIndex];
            
            // Try each available lane for this participant
            for (let lane = 1; lane <= numberOfLanes; lane++) {
                if (!usedLanes.has(lane)) {
                    const newUsedLanes = new Set(usedLanes);
                    newUsedLanes.add(lane);
                    currentAssignment.push({ participant, lane });
                    
                    await generateAssignments(participantIndex + 1, currentAssignment, newUsedLanes);
                    
                    currentAssignment.pop();
                }
            }
        };
        
        await generateAssignments(0, [], new Set());
        
        if (participants.length <= 10) { // Reduce logging
            console.log(`🎯 Optimized exhaustive search found solution with score: ${bestScore} (processed ${processedCount} combinations)`);
        }
        
        return bestAssignment || participants.map((participant, index) => ({
            participant,
            lane: Math.min(index + 1, numberOfLanes)
        }));
    }

    /**
     * OPTIMIZED: Greedy assignment with async processing
     */
    async greedyPointsAssignmentOptimized(participantLaneScores, numberOfLanes) {
        const assignment = [];
        const usedLanes = new Set();
        
        if (participantLaneScores.length <= 10) { // Reduce logging
            console.log('🎯 Using optimized greedy points-based assignment for large group...');
        }
        
        // Sort participants by their best available lane score (lowest first)
        const sortedParticipants = [...participantLaneScores].sort((a, b) => {
            return a.bestPoints - b.bestPoints;
        });
        
        // Assign participants in order of their best lane preference
        for (let i = 0; i < sortedParticipants.length; i++) {
            const participantScore = sortedParticipants[i];
            let bestLane = null;
            let bestPoints = Infinity;
            
            // Find the best available lane for this participant
            participantScore.laneScores.forEach(laneScore => {
                if (!usedLanes.has(laneScore.lane) && laneScore.points < bestPoints) {
                    bestPoints = laneScore.points;
                    bestLane = laneScore.lane;
                }
            });
            
            if (bestLane) {
                assignment.push({
                    participant: participantScore.participant,
                    lane: bestLane
                });
                usedLanes.add(bestLane);
                
                if (participantLaneScores.length <= 10) { // Reduce logging
                    console.log(`   📍 ${participantScore.participant.name} -> Lane ${bestLane} (${bestPoints} pts)`);
                }
            }
            
            // Yield control periodically for large datasets
            if (i > 0 && i % 10 === 0 && sortedParticipants.length > 20) {
                await new Promise(resolve => setTimeout(resolve, 1));
            }
        }
        
        return assignment;
    }

    /**
     * Assign lanes using enhanced points-based system
     * Points: 2 for first race on lane, +1 for each additional race
     * Prioritizes avoiding rematches, then minimizes total points
     */
    assignLanesWithPointsSystem(participants, numberOfLanes, laneAssignments) {
        console.log('🎯 Assigning lanes with points-based system...');
        console.log(`   Participants: ${participants.length}, Available lanes: ${numberOfLanes}`);
        
        // Calculate points for each participant-lane combination
        const participantLaneScores = participants.map(participant => {
            const laneStats = this.laneHistory.get(participant.id) || {};
            const laneScores = [];
            
            for (let lane = 1; lane <= numberOfLanes; lane++) {
                const usage = laneStats[lane] || 0;
                // Points system: 2 points for first race, +1 for each additional
                let points = 0;
                if (usage > 0) {
                    points = 2 + (usage - 1); // 2 for first, +1 for each additional
                }
                // If never raced on this lane, 0 points (best option)
                
                laneScores.push({
                    lane,
                    usage,
                    points,
                    participant
                });
            }
            
            // Sort by points (lowest first - best lanes)
            laneScores.sort((a, b) => a.points - b.points);
            
            return {
                participant,
                laneScores,
                bestLane: laneScores[0].lane,
                bestPoints: laneScores[0].points
            };
        });

        console.log('📊 Participant lane scores:');
        participantLaneScores.forEach(p => {
            const topLanes = p.laneScores.slice(0, 3).map(ls => `L${ls.lane}:${ls.points}pts`).join(', ');
            console.log(`   ${p.participant.name}: ${topLanes}`);
        });

        // Check for rematches among participants
        const rematchCount = this.countRematches(participants);
        console.log(`⚠️  Rematch count: ${rematchCount} pairs have raced before`);

        // Find optimal assignment using points-based Hungarian-style algorithm
        const assignment = this.findOptimalPointsAssignment(participantLaneScores, numberOfLanes);
        
        // Apply the assignment and calculate total points
        let totalPoints = 0;
        assignment.forEach(({ participant, lane }) => {
            const participantScore = participantLaneScores.find(p => p.participant.id === participant.id);
            const laneScore = participantScore.laneScores.find(ls => ls.lane === lane);
            
            laneAssignments[lane - 1].participant = participant;
            totalPoints += laneScore.points;
            
            console.log(`   ✅ ${participant.name} -> Lane ${lane} (${laneScore.points} pts, usage: ${laneScore.usage})`);
        });

        console.log(`🎯 Total assignment points: ${totalPoints} (lower is better)`);
        console.log(`📈 Average points per participant: ${(totalPoints / participants.length).toFixed(1)}`);

        return laneAssignments;
    }

    /**
     * Count rematches among participants
     */
    countRematches(participants) {
        let rematchCount = 0;
        for (let i = 0; i < participants.length; i++) {
            for (let j = i + 1; j < participants.length; j++) {
                if (this.haveRacedBefore(participants[i].id, participants[j].id)) {
                    rematchCount++;
                }
            }
        }
        return rematchCount;
    }

    /**
     * Find optimal lane assignment using points-based optimization
     */
    findOptimalPointsAssignment(participantLaneScores, numberOfLanes) {
        const participants = participantLaneScores.map(p => p.participant);
        
        // For small groups, try exhaustive search
        if (participants.length <= 5) {
            return this.exhaustivePointsSearch(participantLaneScores, numberOfLanes);
        } else {
            // For larger groups, use improved greedy algorithm
            return this.greedyPointsAssignment(participantLaneScores, numberOfLanes);
        }
    }

    /**
     * Exhaustive search for optimal points assignment (small groups)
     */
    exhaustivePointsSearch(participantLaneScores, numberOfLanes) {
        const participants = participantLaneScores.map(p => p.participant);
        
        let bestAssignment = null;
        let bestScore = Infinity;
        
        console.log('🔍 Using exhaustive search for optimal assignment...');
        
        // Generate all possible lane assignments
        const generateAssignments = (participantIndex, currentAssignment, usedLanes) => {
            if (participantIndex >= participants.length) {
                const score = this.calculatePointsAssignmentScore(currentAssignment, participantLaneScores);
                if (score < bestScore) {
                    bestScore = score;
                    bestAssignment = [...currentAssignment];
                }
                return;
            }
            
            const participant = participants[participantIndex];
            
            // Try each available lane for this participant
            for (let lane = 1; lane <= numberOfLanes; lane++) {
                if (!usedLanes.has(lane)) {
                    const newUsedLanes = new Set(usedLanes);
                    newUsedLanes.add(lane);
                    currentAssignment.push({ participant, lane });
                    
                    generateAssignments(participantIndex + 1, currentAssignment, newUsedLanes);
                    
                    currentAssignment.pop();
                }
            }
        };
        
        generateAssignments(0, [], new Set());
        
        console.log(`🎯 Exhaustive search found solution with score: ${bestScore}`);
        
        return bestAssignment || participants.map((participant, index) => ({
            participant,
            lane: Math.min(index + 1, numberOfLanes)
        }));
    }

    /**
     * Greedy points-based assignment for larger groups
     */
    greedyPointsAssignment(participantLaneScores, numberOfLanes) {
        const assignment = [];
        const usedLanes = new Set();
        
        console.log('🎯 Using greedy points-based assignment for large group...');
        
        // Sort participants by their best available lane score (lowest first)
        const sortedParticipants = [...participantLaneScores].sort((a, b) => {
            return a.bestPoints - b.bestPoints;
        });
        
        // Assign participants in order of their best lane preference
        sortedParticipants.forEach(participantScore => {
            let bestLane = null;
            let bestPoints = Infinity;
            
            // Find the best available lane for this participant
            participantScore.laneScores.forEach(laneScore => {
                if (!usedLanes.has(laneScore.lane) && laneScore.points < bestPoints) {
                    bestPoints = laneScore.points;
                    bestLane = laneScore.lane;
                }
            });
            
            if (bestLane) {
                assignment.push({
                    participant: participantScore.participant,
                    lane: bestLane
                });
                usedLanes.add(bestLane);
                console.log(`   📍 ${participantScore.participant.name} -> Lane ${bestLane} (${bestPoints} pts)`);
            }
        });
        
        return assignment;
    }

    /**
     * Calculate total score for a points-based assignment
     */
    calculatePointsAssignmentScore(assignment, participantLaneScores) {
        let totalScore = 0;
        
        assignment.forEach(({ participant, lane }) => {
            const participantScore = participantLaneScores.find(p => p.participant.id === participant.id);
            const laneScore = participantScore.laneScores.find(ls => ls.lane === lane);
            totalScore += laneScore.points;
        });
        
        return totalScore;
    }

    /**
     * LEGACY: Assign lanes prioritizing diversity and least-used lanes (keeping for compatibility)
     */
    assignLanesWithDiversityPriority(participants, numberOfLanes, laneAssignments) {
        console.log('Assigning lanes with diversity priority...');
        
        // Get each participant's lane preferences (least used first)
        const participantPreferences = participants.map(participant => {
            const laneStats = this.laneHistory.get(participant.id) || {};
            const preferences = [];
            
            for (let lane = 1; lane <= numberOfLanes; lane++) {
                const usage = laneStats[lane] || 0;
                preferences.push({
                    lane,
                    usage,
                    participant
                });
            }
            
            // Sort by usage (least used first)
            preferences.sort((a, b) => a.usage - b.usage);
            
            return {
                participant,
                preferences,
                leastUsedLane: preferences[0].lane,
                leastUsedCount: preferences[0].usage
            };
        });

        console.log('Participant lane preferences:', participantPreferences.map(p => 
            `${p.participant.name}: prefers lane ${p.leastUsedLane} (used ${p.leastUsedCount} times)`
        ));

        // Try optimal assignment using the Hungarian algorithm approach
        const assignment = this.findOptimalLaneAssignment(participantPreferences, numberOfLanes);
        
        // Apply the assignment
        assignment.forEach(({ participant, lane }) => {
            laneAssignments[lane - 1].participant = participant;
            const laneStats = this.laneHistory.get(participant.id) || {};
            const usage = laneStats[lane] || 0;
            console.log(`Assigned ${participant.name} to lane ${lane} (usage: ${usage})`);
        });

        return laneAssignments;
    }

    /**
     * Find optimal lane assignment to minimize total usage and maximize diversity
     */
    findOptimalLaneAssignment(participantPreferences, numberOfLanes) {
        const participants = participantPreferences.map(p => p.participant);
        
        // For small numbers of participants, try all permutations
        if (participants.length <= 6) {
            return this.exhaustiveAssignmentSearch(participantPreferences, numberOfLanes);
        } else {
            // For larger groups, use greedy algorithm
            return this.greedyLaneAssignment(participantPreferences, numberOfLanes);
        }
    }

    /**
     * Exhaustive search for optimal lane assignment (small groups)
     */
    exhaustiveAssignmentSearch(participantPreferences, numberOfLanes) {
        const participants = participantPreferences.map(p => p.participant);
        const availableLanes = Array.from({length: numberOfLanes}, (_, i) => i + 1);
        
        let bestAssignment = null;
        let bestScore = Infinity;
        
        // Generate all possible lane assignments
        const generateAssignments = (participantIndex, currentAssignment, usedLanes) => {
            if (participantIndex >= participants.length) {
                const score = this.calculateAssignmentScore(currentAssignment, participantPreferences);
                if (score < bestScore) {
                    bestScore = score;
                    bestAssignment = [...currentAssignment];
                }
                return;
            }
            
            const participant = participants[participantIndex];
            
            // Try each available lane for this participant
            for (let lane = 1; lane <= numberOfLanes; lane++) {
                if (!usedLanes.has(lane)) {
                    const newUsedLanes = new Set(usedLanes);
                    newUsedLanes.add(lane);
                    currentAssignment.push({ participant, lane });
                    
                    generateAssignments(participantIndex + 1, currentAssignment, newUsedLanes);
                    
                    currentAssignment.pop();
                }
            }
        };
        
        generateAssignments(0, [], new Set());
        
        return bestAssignment || participants.map((participant, index) => ({
            participant,
            lane: Math.min(index + 1, numberOfLanes)
        }));
    }

    /**
     * Greedy lane assignment for larger groups
     */
    greedyLaneAssignment(participantPreferences, numberOfLanes) {
        const assignment = [];
        const usedLanes = new Set();
        const unassignedParticipants = [...participantPreferences];
        
        console.log('Using greedy lane assignment for large group...');
        
        // First, try to assign each participant to their least-used lane if available
        for (let i = unassignedParticipants.length - 1; i >= 0; i--) {
            const participantPref = unassignedParticipants[i];
            const leastUsedLane = participantPref.leastUsedLane;
            
            if (!usedLanes.has(leastUsedLane)) {
                assignment.push({
                    participant: participantPref.participant,
                    lane: leastUsedLane
                });
                usedLanes.add(leastUsedLane);
                unassignedParticipants.splice(i, 1);
                console.log(`Direct assignment: ${participantPref.participant.name} -> lane ${leastUsedLane}`);
            }
        }
        
        // Assign remaining participants to best available lanes
        unassignedParticipants.forEach(participantPref => {
            let bestLane = null;
            let bestUsage = Infinity;
            
            for (let lane = 1; lane <= numberOfLanes; lane++) {
                if (!usedLanes.has(lane)) {
                    const laneStats = this.laneHistory.get(participantPref.participant.id) || {};
                    const usage = laneStats[lane] || 0;
                    
                    if (usage < bestUsage) {
                        bestUsage = usage;
                        bestLane = lane;
                    }
                }
            }
            
            if (bestLane) {
                assignment.push({
                    participant: participantPref.participant,
                    lane: bestLane
                });
                usedLanes.add(bestLane);
                console.log(`Secondary assignment: ${participantPref.participant.name} -> lane ${bestLane} (usage: ${bestUsage})`);
            }
        });
        
        return assignment;
    }

    /**
     * Calculate score for a lane assignment (lower is better)
     */
    calculateAssignmentScore(assignment, participantPreferences) {
        let score = 0;
        
        assignment.forEach(({ participant, lane }) => {
            const participantPref = participantPreferences.find(p => p.participant.id === participant.id);
            if (participantPref) {
                const laneUsage = participantPref.preferences.find(p => p.lane === lane)?.usage || 0;
                score += laneUsage; // Penalty for higher usage
                
                // Bonus if this is their least-used lane
                if (lane === participantPref.leastUsedLane) {
                    score -= 10; // Bonus for optimal assignment
                }
            }
        });
        
        return score;
    }

    /**
     * Record race results and update histories
     */
    recordRaceResult(heat, results) {
        console.log('Recording race result for heat:', heat.id);
        
        if (!results || !Array.isArray(results)) {
            console.warn('Invalid results provided');
            return false;
        }

        // Update opponent history
        const participants = heat.lanes
            .filter(lane => lane.participant)
            .map(lane => lane.participant);

        participants.forEach(participant1 => {
            const opponents = this.opponentHistory.get(participant1.id) || new Set();
            participants.forEach(participant2 => {
                if (participant1.id !== participant2.id) {
                    opponents.add(participant2.id);
                }
            });
            this.opponentHistory.set(participant1.id, opponents);
        });

        // Update lane history
        heat.lanes.forEach(laneAssignment => {
            if (laneAssignment.participant) {
                const laneStats = this.laneHistory.get(laneAssignment.participant.id) || {};
                laneStats[laneAssignment.lane] = (laneStats[laneAssignment.lane] || 0) + 1;
                this.laneHistory.set(laneAssignment.participant.id, laneStats);
            }
        });

        // Update race history
        participants.forEach(participant => {
            const races = this.raceHistory.get(participant.id) || [];
            races.push(heat.id);
            this.raceHistory.set(participant.id, races);
        });

        console.log('Race result recorded successfully');
        return true;
    }

    /**
     * Reverse a race result - remove it from all tracking histories
     */
    reverseRaceResult(heat, results) {
        console.log('Reversing race result for heat:', heat.id);
        
        if (!results || !Array.isArray(results)) {
            console.warn('Invalid results provided for reversal');
            return false;
        }

        // Get participants from the heat
        const participants = heat.lanes
            .filter(lane => lane.participant)
            .map(lane => lane.participant);

        // Reverse opponent history - remove this heat's opponents
        participants.forEach(participant1 => {
            const opponents = this.opponentHistory.get(participant1.id) || new Set();
            participants.forEach(participant2 => {
                if (participant1.id !== participant2.id) {
                    opponents.delete(participant2.id);
                }
            });
            this.opponentHistory.set(participant1.id, opponents);
        });

        // Reverse lane history - decrement lane usage
        heat.lanes.forEach(laneAssignment => {
            if (laneAssignment.participant) {
                const laneStats = this.laneHistory.get(laneAssignment.participant.id) || {};
                if (laneStats[laneAssignment.lane]) {
                    laneStats[laneAssignment.lane] = Math.max(0, laneStats[laneAssignment.lane] - 1);
                }
                this.laneHistory.set(laneAssignment.participant.id, laneStats);
            }
        });

        // Reverse race history - remove this heat from race counts
        participants.forEach(participant => {
            const races = this.raceHistory.get(participant.id) || [];
            const index = races.indexOf(heat.id);
            if (index > -1) {
                races.splice(index, 1);
            }
            this.raceHistory.set(participant.id, races);
        });

        console.log('Race result reversed successfully');
        return true;
    }

    /**
     * Get statistics for a participant
     */
    getParticipantStats(participantId) {
        return {
            laneHistory: this.laneHistory.get(participantId) || {},
            opponents: Array.from(this.opponentHistory.get(participantId) || []),
            raceCount: (this.raceHistory.get(participantId) || []).length
        };
    }

    /**
     * Get detailed pairing statistics for all participants
     */
    getPairingStatistics() {
        const stats = {
            totalParticipants: this.laneHistory.size,
            laneUsageStats: {},
            opponentMatchStats: {},
            raceCountStats: {}
        };

        // Collect lane usage statistics
        this.laneHistory.forEach((laneStats, participantId) => {
            const totalRaces = Object.values(laneStats).reduce((sum, count) => sum + count, 0);
            const laneDistribution = {};
            
            Object.entries(laneStats).forEach(([lane, count]) => {
                laneDistribution[lane] = {
                    count,
                    percentage: totalRaces > 0 ? Math.round((count / totalRaces) * 100) : 0
                };
            });

            stats.laneUsageStats[participantId] = {
                totalRaces,
                laneDistribution,
                mostUsedLane: this.getMostUsedLane(laneStats),
                leastUsedLane: this.getLeastUsedLane(laneStats)
            };
        });

        // Collect opponent match statistics
        this.opponentHistory.forEach((opponents, participantId) => {
            stats.opponentMatchStats[participantId] = {
                uniqueOpponents: opponents.size,
                opponentsList: Array.from(opponents)
            };
        });

        // Collect race count statistics
        this.raceHistory.forEach((races, participantId) => {
            stats.raceCountStats[participantId] = races.length;
        });

        return stats;
    }

    /**
     * Get the most used lane for a participant
     */
    getMostUsedLane(laneStats) {
        let maxLane = null;
        let maxCount = -1;
        
        Object.entries(laneStats).forEach(([lane, count]) => {
            if (count > maxCount) {
                maxCount = count;
                maxLane = lane;
            }
        });
        
        return { lane: maxLane, count: maxCount };
    }

    /**
     * Get the least used lane for a participant
     */
    getLeastUsedLane(laneStats) {
        let minLane = null;
        let minCount = Infinity;
        
        Object.entries(laneStats).forEach(([lane, count]) => {
            if (count < minCount) {
                minCount = count;
                minLane = lane;
            }
        });
        
        return { lane: minLane, count: minCount };
    }

    /**
     * Analyze upcoming heat for constraint violations
     */
    analyzeHeatConstraints(heat) {
        const analysis = {
            rematches: [],
            laneRepeats: [],
            recommendations: []
        };

        const participants = heat.lanes
            .filter(lane => lane.participant)
            .map(lane => lane.participant);

        // Check for rematches
        for (let i = 0; i < participants.length; i++) {
            for (let j = i + 1; j < participants.length; j++) {
                const p1 = participants[i];
                const p2 = participants[j];
                
                if (this.haveRacedBefore(p1.id, p2.id)) {
                    analysis.rematches.push({
                        participant1: p1.name,
                        participant2: p2.name,
                        participant1Id: p1.id,
                        participant2Id: p2.id
                    });
                }
            }
        }

        // Check for lane repetition concerns
        heat.lanes.forEach(laneAssignment => {
            if (laneAssignment.participant) {
                const stats = this.getParticipantStats(laneAssignment.participant.id);
                const laneHistory = stats.laneHistory;
                const currentLane = laneAssignment.lane;
                const currentLaneUsage = laneHistory[currentLane] || 0;
                const totalRaces = Object.values(laneHistory).reduce((sum, count) => sum + count, 0);
                
                if (totalRaces > 0) {
                    const usagePercentage = (currentLaneUsage / totalRaces) * 100;
                    
                    if (usagePercentage > 50) {
                        analysis.laneRepeats.push({
                            participant: laneAssignment.participant.name,
                            participantId: laneAssignment.participant.id,
                            lane: currentLane,
                            usage: currentLaneUsage,
                            totalRaces,
                            percentage: Math.round(usagePercentage)
                        });
                    }
                }
            }
        });

        // Generate recommendations
        if (analysis.rematches.length > 0) {
            analysis.recommendations.push(`${analysis.rematches.length} rematch(es) detected - consider rearranging if possible`);
        }
        
        if (analysis.laneRepeats.length > 0) {
            analysis.recommendations.push(`${analysis.laneRepeats.length} participant(s) assigned to frequently used lanes`);
        }
        
        if (analysis.rematches.length === 0 && analysis.laneRepeats.length === 0) {
            analysis.recommendations.push('Heat follows optimal pairing constraints');
        }

        return analysis;
    }

    /**
     * Get optimal lane assignment for a specific participant
     */
    getOptimalLaneForParticipant(participantId, numberOfLanes, excludeLanes = []) {
        const laneStats = this.laneHistory.get(participantId) || {};
        let bestLane = 1;
        let lowestUsage = Infinity;

        for (let lane = 1; lane <= numberOfLanes; lane++) {
            if (excludeLanes.includes(lane)) continue;
            
            const usage = laneStats[lane] || 0;
            if (usage < lowestUsage) {
                lowestUsage = usage;
                bestLane = lane;
            }
        }

        return bestLane;
    }

    /**
     * Check if two participants have raced before
     */
    haveRacedBefore(participantId1, participantId2) {
        const opponents = this.opponentHistory.get(participantId1) || new Set();
        return opponents.has(participantId2);
    }

    /**
     * Clear all histories (for new events)
     */
    clearHistories() {
        this.laneHistory.clear();
        this.opponentHistory.clear();
        this.raceHistory.clear();
        this.classLaneStats.clear();
        this.eventRaceNumbers.clear();
    }

    /**
     * Export history data for persistence
     */
    exportHistories() {
        return {
            laneHistory: Object.fromEntries(
                Array.from(this.laneHistory.entries()).map(([id, stats]) => [id, stats])
            ),
            opponentHistory: Object.fromEntries(
                Array.from(this.opponentHistory.entries()).map(([id, opponents]) => [id, Array.from(opponents)])
            ),
            raceHistory: Object.fromEntries(this.raceHistory),
            eventRaceNumbers: Object.fromEntries(this.eventRaceNumbers)
        };
    }

    /**
     * Import history data from persistence
     */
    importHistories(data) {
        if (data.laneHistory) {
            this.laneHistory = new Map(Object.entries(data.laneHistory));
        }
        if (data.opponentHistory) {
            this.opponentHistory = new Map(
                Object.entries(data.opponentHistory).map(([id, opponents]) => [id, new Set(opponents)])
            );
        }
        if (data.raceHistory) {
            this.raceHistory = new Map(Object.entries(data.raceHistory));
        }
        if (data.eventRaceNumbers) {
            this.eventRaceNumbers = new Map(Object.entries(data.eventRaceNumbers));
        }
    }

    /**
     * Debug method to verify pairing logic
     */
    debugPairingLogic(participants, numberOfLanes, roundNumber) {
        console.log('=== PAIRING DEBUG ===');
        console.log('Round:', roundNumber);
        console.log('Participants:', participants.map(p => p.name));
        console.log('Number of lanes:', numberOfLanes);
        console.log('Is first round:', roundNumber === 1);
        
        if (roundNumber > 1) {
            console.log('Opponent history:');
            this.opponentHistory.forEach((opponents, participantId) => {
                const participant = participants.find(p => p.id === participantId);
                if (participant) {
                    console.log(`  ${participant.name}: raced against ${opponents.size} opponents`);
                }
            });
            
            console.log('Lane history:');
            this.laneHistory.forEach((laneStats, participantId) => {
                const participant = participants.find(p => p.id === participantId);
                if (participant) {
                    const totalRaces = Object.values(laneStats).reduce((sum, count) => sum + count, 0);
                    console.log(`  ${participant.name}: ${totalRaces} total races`, laneStats);
                }
            });
        }
        
        console.log('=== END DEBUG ===');
    }

    /**
     * Test method to verify race balancing logic
     */
    testRaceBalancing() {
        console.log('🧪 Testing Race Balancing Logic...');
        
        const testCases = [
            { drivers: 6, lanes: 5, expected: { freeRun: [5, 1], balanced: [3, 3] } },
            { drivers: 7, lanes: 5, expected: { freeRun: [5, 2], balanced: [4, 3] } },
            { drivers: 4, lanes: 3, expected: { freeRun: [3, 1], balanced: [2, 2] } },
            { drivers: 9, lanes: 4, expected: { freeRun: [4, 4, 1], balanced: [4, 3, 2] } },
            { drivers: 8, lanes: 3, expected: { freeRun: [3, 3, 2], balanced: [3, 3, 2] } }
        ];

        testCases.forEach((testCase, index) => {
            console.log(`\n🧪 Test Case ${index + 1}: ${testCase.drivers} drivers, ${testCase.lanes} lanes`);
            
            // Test Free Run mode
            const freeRunDistribution = this.calculateFreeRunDistribution(testCase.drivers, testCase.lanes);
            console.log(`🏃 Free Run: ${freeRunDistribution.join(', ')} (expected: ${testCase.expected.freeRun.join(', ')})`);
            
            // Test Balanced mode
            const balancedDistribution = this.calculateOptimalBalancedDistribution(testCase.drivers, testCase.lanes);
            console.log(`⚖️ Balanced: ${balancedDistribution.join(', ')} (expected: ${testCase.expected.balanced.join(', ')})`);
        });
    }

    /**
     * Calculate Free Run distribution for testing
     */
    calculateFreeRunDistribution(totalParticipants, numberOfLanes) {
        const distribution = [];
        let remaining = totalParticipants;
        
        while (remaining > 0) {
            if (remaining <= numberOfLanes) {
                distribution.push(remaining);
                break;
            } else {
                distribution.push(numberOfLanes);
                remaining -= numberOfLanes;
            }
        }
        
        return distribution;
    }


}

// Ensure global availability
if (typeof window !== 'undefined') {
    window.PairingEngine = PairingEngine;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PairingEngine;
} 