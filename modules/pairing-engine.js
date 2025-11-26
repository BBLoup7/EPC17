/**
 * Enhanced Pairing Engine Module for EPC17 Event Management System
 * Handles multi-lane race generation, lane assignment optimization, and opponent tracking
 * 
 * External Dependencies:
 * - window.showToast(message, type): Optional UI notification system for user warnings
 * - window.PairingEngine: Global export for browser environments
 * - Math.random(): Used for shuffling and randomization in Round 1
 */

class PairingEngine {
    constructor() {
        this.laneHistory = new Map(); // Track lane usage: driverId -> {lane1: count, lane2: count, ...}
        this.opponentHistory = new Map(); // Track opponent pairings: driverId -> Set(opponentIds)
        this.raceHistory = new Map(); // Track all races: driverId -> [raceIds]
        this.incompleteRaceHistory = new Map(); // Track incomplete race participation: driverId -> count
        this.classLaneStats = new Map(); // Track lane stats per class
        this.eventRaceNumbers = new Map(); // Track race numbers: eventId -> next race number
        this.classScheduleHistory = new Map(); // Track race schedules: driverId -> {classId: raceNumber}
        this.eventClassOrder = new Map(); // Track class order: eventId -> [classId1, classId2, ...]
    }

    /**
     * Initialize tracking for an event
     */
    initializeEvent(eventId, participants, numberOfLanes) {
        window.debugLogger.debug('Pairing', `Initializing pairing engine for event ${eventId}`, {
            participants: participants.length,
            numberOfLanes
        });
        
        this.clearHistories();
        this.eventRaceNumbers.set(eventId, 1);
        
        participants.forEach(participant => {
            const laneStats = {};
            for (let lane = 1; lane <= numberOfLanes; lane++) {
                laneStats[lane] = 0;
            }
            this.laneHistory.set(participant.id, laneStats);
            this.opponentHistory.set(participant.id, new Set());
            this.raceHistory.set(participant.id, []);
            this.incompleteRaceHistory.set(participant.id, 0);
        });
        
        return true;
    }

    /**
     * Set the class order for an event (used for race spacing calculations)
     */
    setEventClassOrder(eventId, classOrder) {
        if (Array.isArray(classOrder)) {
            this.eventClassOrder.set(eventId, [...classOrder]);
            window.debugLogger.debug('Pairing', `Set class order for event ${eventId}:`, classOrder);
        } else {
            console.warn(`⚠️ Invalid class order provided for event ${eventId}:`, classOrder);
        }
    }

    /**
     * Get the class order for an event
     */
    getEventClassOrder(eventId) {
        return this.eventClassOrder.get(eventId) || [];
    }

    /**
     * Record that a driver is scheduled to race in a specific class at a specific race number
     */
    recordClassSchedule(driverId, classId, raceNumber, eventId) {
        if (!this.classScheduleHistory.has(driverId)) {
            this.classScheduleHistory.set(driverId, {});
        }
        const driverSchedule = this.classScheduleHistory.get(driverId);
        driverSchedule[classId] = raceNumber;
        window.debugLogger.debug('Pairing', `Recorded driver ${driverId} racing in class ${classId} at race #${raceNumber}`);
    }

    /**
     * Get the race schedule for a driver across all classes
     */
    getDriverClassSchedule(driverId) {
        return this.classScheduleHistory.get(driverId) || {};
    }

    /**
     * Calculate the minimum class spacing for a driver's schedule
     * Returns the minimum number of classes between any two races for this driver
     */
    calculateDriverClassSpacing(driverId, eventId) {
        const classOrder = this.getEventClassOrder(eventId);
        if (classOrder.length === 0) return Infinity;

        const driverSchedule = this.getDriverClassSchedule(driverId);
        const scheduledClasses = Object.keys(driverSchedule);
        if (scheduledClasses.length <= 1) return Infinity;

        const classPositions = scheduledClasses
            .map(classId => classOrder.indexOf(classId))
            .filter(pos => pos !== -1)
            .sort((a, b) => a - b);

        if (classPositions.length <= 1) return Infinity;

        let minSpacing = Infinity;
        for (let i = 1; i < classPositions.length; i++) {
            minSpacing = Math.min(minSpacing, classPositions[i] - classPositions[i - 1]);
        }

        // Check circular spacing (last to first)
        const firstToLastSpacing = (classOrder.length - classPositions[classPositions.length - 1]) + classPositions[0];
        return Math.min(minSpacing, firstToLastSpacing);
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
     */
    validateRaceNumber(eventId, raceNumber) {
        if (!Number.isFinite(raceNumber) || raceNumber <= 0) {
            console.warn(`⚠️ Invalid race number: ${raceNumber}`);
            return false;
        }
        const currentNext = this.getNextRaceNumber(eventId);
        if (raceNumber >= currentNext) {
            console.warn(`⚠️ Race number ${raceNumber} conflicts with next available number ${currentNext}`);
            return false;
        }
        return true;
    }

    /**
     * Get all used race numbers for an event
     */
    getUsedRaceNumbers(eventId) {
        const nextNumber = this.getNextRaceNumber(eventId);
        const usedNumbers = [];
        for (let i = 1; i < nextNumber; i++) {
            usedNumbers.push(i);
        }
        return usedNumbers;
    }

    /**
     * Generate heats for a round using multi-lane logic with Free Run support
     * This is the main entry point for heat generation
     */
    async generateHeats(participants, numberOfLanes, roundNumber = 1, eventId = null, freeRunEnabled = false, classId = null) {
        // Deduplicate participants by ID
        const seenIds = new Set();
        const deduplicatedParticipants = participants.filter(p => {
            if (seenIds.has(p.id)) {
                console.warn(`⚠️ Duplicate participant filtered out in pairing engine: ${p.name} (${p.id})`);
                return false;
            }
            seenIds.add(p.id);
            return true;
        });

        if (deduplicatedParticipants.length !== participants.length) {
            window.debugLogger.debug('Pairing', `Deduplicated ${participants.length - deduplicatedParticipants.length} duplicate participants`);
            participants = deduplicatedParticipants;
        }

        window.debugLogger.debug('Pairing', `Generating heats for round ${roundNumber}`, {
            participants: participants.length,
            numberOfLanes,
            isFirstRound: roundNumber === 1,
            freeRunEnabled,
            isLargeDataset: participants.length > 50
        });

        // Performance warnings
        if (participants.length > 500) {
            console.warn(`⚠️ PERFORMANCE WARNING: ${participants.length} participants detected.`);
            if (window.showToast) {
                window.showToast(`Very large dataset (${participants.length} participants). Consider breaking into smaller events.`, 'warning');
            }
            if (participants.length > 1000) {
                console.warn(`🚨 Processing ${participants.length} participants with extra performance optimizations`);
            }
        } else if (participants.length > 100) {
            console.warn(`⚠️ Large dataset detected (${participants.length} participants). Processing may take longer.`);
        }

        // Debug pairing logic for small groups or first round
        if (participants.length <= 20 || roundNumber === 1) {
            this.debugPairingLogic(participants, numberOfLanes, roundNumber);
        }

        if (participants.length === 0) return [];
        if (participants.length <= numberOfLanes) {
            return [this.createFinalHeat(participants, numberOfLanes, roundNumber, eventId)];
        }

        let availableParticipants = [...participants];
        
        // Shuffle for first round
        if (roundNumber === 1) {
            window.debugLogger.debug('Pairing', 'First round detected - applying full randomization');
            availableParticipants = this.shuffleArray(availableParticipants);
        }

        // Generate heats based on mode
        const heats = freeRunEnabled
            ? await this.generateHeatsWithFreeRun(availableParticipants, numberOfLanes, roundNumber, eventId, classId)
            : await this.generateHeatsBalanced(availableParticipants, numberOfLanes, roundNumber, eventId, classId);

        window.debugLogger.debug('Pairing', `Generated ${heats.length} heats for round ${roundNumber} (Free Run: ${freeRunEnabled})`);
        
        // Safety check
        if (!Array.isArray(heats)) {
            console.error('❌ CRITICAL ERROR: generateHeats did not return an array:', heats);
            return [];
        }
        
        return heats;
    }

    /**
     * Generate heats with Free Run mode - fill to capacity first
     * Unified async implementation (replaces both optimized and non-optimized versions)
     */
    async generateHeatsWithFreeRun(participants, numberOfLanes, roundNumber, eventId, classId) {
        const heats = [];
        let availableParticipants = [...participants];
        let heatNumber = 1;
        const startTime = Date.now();

        window.debugLogger.debug('Pairing', `Free Run Mode: ${availableParticipants.length} drivers, ${numberOfLanes} lanes`);

        // Adaptive chunk size based on dataset size
        const isLargeDataset = participants.length > 200;
        const isVeryLargeDataset = participants.length > 1000;
        const chunkSize = isVeryLargeDataset ? 2 : (isLargeDataset ? 5 : 10);
        let processedHeats = 0;

        while (availableParticipants.length > 0) {
            const participantsRemaining = availableParticipants.length;
            
            if (participantsRemaining <= numberOfLanes) {
                const finalHeat = this.createFinalHeat(availableParticipants, numberOfLanes, roundNumber, eventId);
                heats.push(finalHeat);
                window.debugLogger.debug('Pairing', `Free Run: Final heat with ${participantsRemaining} drivers`);
                break;
            }
            
            const heat = await this.createOptimalHeat(
                availableParticipants,
                numberOfLanes,
                roundNumber,
                heatNumber,
                eventId,
                classId
            );
            
            if (!heat) break;
            
            heats.push(heat);
            window.debugLogger.debug('Pairing', `Free Run: Heat ${heatNumber} with ${numberOfLanes} drivers (filled to capacity)`);
            
            // Remove assigned participants
            heat.lanes.forEach(laneAssignment => {
                if (laneAssignment.participant) {
                    const index = availableParticipants.findIndex(p => p.id === laneAssignment.participant.id);
                    if (index !== -1) {
                        availableParticipants.splice(index, 1);
                    }
                }
            });
            
            heatNumber++;
            processedHeats++;
            
            // Yield control to prevent UI blocking
            if (processedHeats % chunkSize === 0) {
                await new Promise(resolve => setTimeout(resolve, 5));
                
                const elapsed = Date.now() - startTime;
                if (isVeryLargeDataset && processedHeats % 50 === 0) {
                    window.debugLogger.debug('Pairing', `Progress: ${processedHeats} heats, ${availableParticipants.length} remaining (${elapsed}ms)`);
                }
                if (elapsed > 120000) {
                    console.warn(`⚠️ Heat generation taking longer than expected (${elapsed}ms).`);
                }
            }
        }

        const totalTime = Date.now() - startTime;

        // Validate and repair duplicates
        const duplicates = this.validateAndRepairDuplicates(heats);
        if (duplicates.repaired > 0) {
            window.debugLogger.debug('Pairing', `Repaired ${duplicates.repaired} duplicate assignments in free run generation`);
        }

        window.debugLogger.debug('Pairing', `Free Run completed: ${heats.length} heats in ${totalTime}ms (avg: ${Math.round(totalTime/heats.length)}ms per heat)`);
        return heats;
    }

    /**
     * Generate heats with balanced mode - balance the last 2 races
     * Unified async implementation (replaces both optimized and non-optimized versions)
     */
    async generateHeatsBalanced(participants, numberOfLanes, roundNumber, eventId, classId) {
        const heats = [];
        let availableParticipants = [...participants];
        let heatNumber = 1;
        const startTime = Date.now();

        const totalParticipants = availableParticipants.length;
        window.debugLogger.debug('Pairing', `Balanced Mode: ${totalParticipants} drivers, ${numberOfLanes} lanes`);

        const optimalDistribution = this.calculateOptimalBalancedDistribution(totalParticipants, numberOfLanes);
        window.debugLogger.debug('Pairing', `Optimal distribution:`, optimalDistribution);

        // Adaptive chunk size
        const isLargeDataset = totalParticipants > 200;
        const isVeryLargeDataset = totalParticipants > 1000;
        const chunkSize = isVeryLargeDataset ? 2 : (isLargeDataset ? 3 : 5);
        let processedHeats = 0;

        for (let i = 0; i < optimalDistribution.length; i++) {
            const participantsForThisHeat = optimalDistribution[i];
            const selectedParticipants = availableParticipants.splice(0, participantsForThisHeat);
            
            const heat = await this.createOptimalHeat(
                selectedParticipants,
                numberOfLanes,
                roundNumber,
                heatNumber,
                eventId,
                classId
            );
            
            if (heat) {
                heats.push(heat);
                window.debugLogger.debug('Pairing', `Balanced: Heat ${heatNumber} with ${participantsForThisHeat} drivers`);
                heatNumber++;
                processedHeats++;
                
                // Yield control
                if (processedHeats % chunkSize === 0) {
                    await new Promise(resolve => setTimeout(resolve, 5));
                    
                    const elapsed = Date.now() - startTime;
                    if (isVeryLargeDataset && processedHeats % 50 === 0) {
                        window.debugLogger.debug('Pairing', `Balanced Progress: ${processedHeats} heats (${elapsed}ms)`);
                    }
                    if (elapsed > 120000) {
                        console.warn(`⚠️ Balanced generation taking longer than expected (${elapsed}ms).`);
                    }
                }
            }
        }

        const totalTime = Date.now() - startTime;

        // Validate and repair duplicates
        const duplicates = this.validateAndRepairDuplicates(heats);
        if (duplicates.repaired > 0) {
            window.debugLogger.debug('Pairing', `Repaired ${duplicates.repaired} duplicate assignments in balanced generation`);
        }

        window.debugLogger.debug('Pairing', `Balanced completed: ${heats.length} heats in ${totalTime}ms (avg: ${Math.round(totalTime/heats.length)}ms per heat)`);
        return heats;
    }

    /**
     * Validate heats for duplicate participants and repair if found
     */
    validateAndRepairDuplicates(heats) {
        const participantLocations = new Map();
        
        for (const heat of heats) {
            for (const lane of heat.lanes) {
                if (lane.participant?.id) {
                    const participantId = lane.participant.id;
                    if (!participantLocations.has(participantId)) {
                        participantLocations.set(participantId, []);
                    }
                    participantLocations.get(participantId).push({ heatId: heat.id, lane: lane.lane });
                }
            }
        }

        const duplicates = [];
        for (const [participantId, locations] of participantLocations) {
            if (locations.length > 1) {
                const participant = heats.flatMap(h => h.lanes).find(l => l.participant?.id === participantId)?.participant;
                duplicates.push(`${participant?.name || participantId} appears in ${locations.length} heats`);
            }
        }

        if (duplicates.length > 0) {
            console.error(`❌ CRITICAL: Heat generation created duplicates: ${duplicates.join(', ')}`);
            
            const usedParticipants = new Set();
            for (const heat of heats) {
                for (const lane of heat.lanes) {
                    if (lane.participant?.id) {
                        if (usedParticipants.has(lane.participant.id)) {
                            lane.participant = null;
                        } else {
                            usedParticipants.add(lane.participant.id);
                        }
                    }
                }
            }
            return { found: duplicates.length, repaired: duplicates.length };
        }

        return { found: 0, repaired: 0 };
    }

    /**
     * Calculate optimal balanced distribution for the last 2 races
     */
    calculateOptimalBalancedDistribution(totalParticipants, numberOfLanes) {
        if (totalParticipants <= numberOfLanes) return [totalParticipants];

        const fullHeats = Math.floor(totalParticipants / numberOfLanes);
        const remainingParticipants = totalParticipants % numberOfLanes;

        window.debugLogger.debug('Pairing', `Distribution: ${totalParticipants} total, ${fullHeats} full heats, ${remainingParticipants} remaining`);

        if (remainingParticipants === 0) {
            return Array(fullHeats).fill(numberOfLanes);
        }

        const distribution = [];

        if (fullHeats === 0) {
            if (totalParticipants <= 2) return [totalParticipants];
            const firstRace = Math.ceil(totalParticipants / 2);
            return [firstRace, totalParticipants - firstRace];
        }

        // Add full heats except last one
        for (let i = 0; i < fullHeats - 1; i++) {
            distribution.push(numberOfLanes);
        }

        // Balance last 2 races
        const participantsForLastTwo = numberOfLanes + remainingParticipants;
        
        if (participantsForLastTwo <= numberOfLanes * 2) {
            const firstOfLastTwo = Math.ceil(participantsForLastTwo / 2);
            distribution.push(firstOfLastTwo, participantsForLastTwo - firstOfLastTwo);
        } else {
            distribution.push(numberOfLanes);
            if (remainingParticipants <= 2) {
                if (remainingParticipants === 1) {
                    distribution[distribution.length - 1]--;
                    distribution.push(2);
                } else {
                    distribution.push(remainingParticipants);
                }
            } else {
                const firstRemaining = Math.ceil(remainingParticipants / 2);
                distribution.push(firstRemaining, remainingParticipants - firstRemaining);
            }
        }

        window.debugLogger.debug('Pairing', `Final balanced distribution:`, distribution);
        return distribution;
    }

    /**
     * Create an optimal heat assignment
     * Unified async implementation
     */
    async createOptimalHeat(availableParticipants, numberOfLanes, roundNumber, heatNumber, eventId = null, classId = null) {
        const participantsToAssign = Math.min(availableParticipants.length, numberOfLanes);
        if (participantsToAssign === 0) return null;

        let selectedParticipants;
        
        if (roundNumber === 1) {
            selectedParticipants = availableParticipants.slice(0, participantsToAssign);
            if (participantsToAssign <= 10) {
                window.debugLogger.debug('Pairing', `Round 1: Selected first ${participantsToAssign} participants randomly`);
            }
        } else {
            selectedParticipants = await this.selectOptimalParticipants(
                availableParticipants,
                participantsToAssign,
                roundNumber,
                eventId,
                classId
            );
            if (participantsToAssign <= 10) {
                window.debugLogger.debug('Pairing', `Round ${roundNumber}: Applied constraints for participant selection`);
            }
        }

        const laneAssignments = await this.assignLanesOptimally(selectedParticipants, numberOfLanes, roundNumber);
        const raceNumber = eventId ? this.incrementRaceNumber(eventId) : heatNumber;
        
        if (heatNumber <= 5 || heatNumber % 10 === 0) {
            window.debugLogger.debug('Pairing', `Assigned Race #${raceNumber} to heat ${heatNumber} in round ${roundNumber}${eventId ? ` for event ${eventId}` : ''}`);
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
        const laneAssignments = [];
        for (let lane = 1; lane <= numberOfLanes; lane++) {
            laneAssignments.push({ lane, participant: null });
        }

        // Randomly assign participants to lanes for Round 1, otherwise use optimization
        if (roundNumber === 1) {
            const shuffled = this.shuffleArray([...participants]);
            shuffled.forEach((participant, index) => {
                if (index < numberOfLanes) {
                    laneAssignments[index].participant = participant;
                }
            });
        } else {
            participants.forEach((participant, index) => {
                if (index < numberOfLanes) {
                    laneAssignments[index].participant = participant;
                }
            });
        }

        const raceNumber = eventId ? this.incrementRaceNumber(eventId) : 1;
        window.debugLogger.debug('Pairing', `Assigned Race #${raceNumber} to FINAL heat in round ${roundNumber}${eventId ? ` for event ${eventId}` : ''}`);

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
        window.debugLogger.debug('Pairing', 'Array shuffled:', {
            original: array.map(p => p.name),
            shuffled: shuffled.map(p => p.name)
        });
        return shuffled;
    }

    /**
     * Select optimal participants for a heat
     * Unified async implementation with adaptive strategies
     */
    async selectOptimalParticipants(availableParticipants, count, roundNumber = 1, eventId = null, classId = null) {
        if (availableParticipants.length <= count) {
            return [...availableParticipants];
        }

        if (roundNumber === 1) {
            return availableParticipants.slice(0, count);
        }

        // Simplified selection for very large datasets
        if (availableParticipants.length > 50) {
            window.debugLogger.debug('Pairing', `Large dataset (${availableParticipants.length}): Using simplified selection`);
            return this.selectParticipantsSimplified(availableParticipants, count, roundNumber);
        }

        if (availableParticipants.length <= 20) {
            window.debugLogger.debug('Pairing', `Applying constraints for round ${roundNumber} participant selection`);
        }

        return await this.selectParticipantsWithLaneDiversity(availableParticipants, count, roundNumber, eventId, classId);
    }

    /**
     * Simplified participant selection for large datasets
     */
    selectParticipantsSimplified(availableParticipants, count, roundNumber) {
        const shuffled = this.shuffleArray([...availableParticipants]);
        const selected = [];
        const used = new Set();
        
        for (const participant of shuffled) {
            if (selected.length >= count) break;
            
            let hasRecentRematch = false;
            if (roundNumber > 2) {
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
     * Select participants with lane diversity priority
     * Unified async implementation
     */
    async selectParticipantsWithLaneDiversity(availableParticipants, count, roundNumber, eventId = null, classId = null) {
        window.debugLogger.debug('Pairing', `Selecting ${count} participants with lane diversity priority`);
        
        const participantLanePrefs = availableParticipants.map(participant => {
            const laneStats = this.laneHistory.get(participant.id) || {};
            const leastUsedLane = this.getLeastUsedLane(laneStats);
            const opponents = this.opponentHistory.get(participant.id) || new Set();
            const incompleteRaceCount = this.incompleteRaceHistory.get(participant.id) || 0;

            return {
                participant,
                leastUsedLane: leastUsedLane.lane,
                leastUsedCount: leastUsedLane.count,
                opponentCount: opponents.size,
                incompleteRaceCount
            };
        });

        if (availableParticipants.length <= 20) {
            window.debugLogger.debug('Pairing', 'Participant lane preferences:', participantLanePrefs.map(p =>
                `${p.participant.name}: lane ${p.leastUsedLane} (used ${p.leastUsedCount}x, incomplete: ${p.incompleteRaceCount})`
            ));
        }

        // Exhaustive search for small groups
        if (availableParticipants.length <= 8) {
            const combinations = this.generateCombinations(availableParticipants, count, roundNumber);
            let bestCombination = null;
            let bestScore = Infinity;

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
                
                if (i + chunkSize < combinations.length) {
                    await new Promise(resolve => setTimeout(resolve, 1));
                }
            }

            const result = bestCombination || availableParticipants.slice(0, count);
            if (availableParticipants.length <= 10) {
                window.debugLogger.debug('Pairing', `Selected via exhaustive search:`, result.map(p => p.name));
            }
            return result;
        }

        // Greedy selection for larger groups
        const result = await this.greedySelectionWithLaneDiversity(participantLanePrefs, count, eventId, classId);
        if (availableParticipants.length <= 20) {
            window.debugLogger.debug('Pairing', `Selected via greedy lane diversity:`, result.map(p => p.name));
        }
        return result;
    }

    /**
     * Greedy selection with lane diversity priority
     * Unified async implementation
     */
    async greedySelectionWithLaneDiversity(participantPrefs, count, eventId = null, classId = null) {
        const selected = [];
        const available = [...participantPrefs];
        const usedLanes = new Set();

        if (participantPrefs.length <= 10) {
            window.debugLogger.debug('Pairing', 'Starting greedy selection with lane diversity...');
        }

        while (selected.length < count && available.length > 0) {
            let bestParticipant = null;
            let bestScore = Infinity;

            const chunkSize = Math.min(20, available.length);
            for (let i = 0; i < available.length; i += chunkSize) {
                const chunk = available.slice(i, Math.min(i + chunkSize, available.length));
                
                chunk.forEach((participantPref, chunkIndex) => {
                    const actualIndex = i + chunkIndex;
                    const participant = participantPref.participant;
                    const leastUsedLane = participantPref.leastUsedLane;
                    
                    let score = 0;

                    // Lane diversity bonus
                    if (!usedLanes.has(leastUsedLane)) {
                        score -= 100;
                    }

                    // Rematch penalty
                    const selectedParticipants = selected.map(s => s.participant);
                    selectedParticipants.forEach(other => {
                        if (this.haveRacedBefore(participant.id, other.id)) {
                            score += 50;
                        }
                    });

                    // Lane usage
                    score += participantPref.leastUsedCount;

                    // Incomplete race penalty
                    score += participantPref.incompleteRaceCount * 25;

                    // Class spacing penalty
                    if (classId && eventId) {
                        const currentSpacing = this.calculateDriverClassSpacing(participant.id, eventId);
                        if (currentSpacing !== Infinity && currentSpacing < 2) {
                            score += (2 - currentSpacing) * 40;
                        }
                    }

                    if (score < bestScore) {
                        bestScore = score;
                        bestParticipant = { participantPref, index: actualIndex };
                    }
                });
                
                if (available.length > 50 && i + chunkSize < available.length) {
                    await new Promise(resolve => setTimeout(resolve, 1));
                }
            }

            if (bestParticipant) {
                const participantPref = bestParticipant.participantPref;
                selected.push(participantPref);
                usedLanes.add(participantPref.leastUsedLane);
                available.splice(bestParticipant.index, 1);
                
                if (participantPrefs.length <= 10) {
                    window.debugLogger.debug('Pairing', `Selected ${participantPref.participant.name} (lane ${participantPref.leastUsedLane}, score: ${bestScore})`);
                }
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
        
        // Lane diversity bonus
        const lanePrefs = participants.map(p => {
            const laneStats = this.laneHistory.get(p.id) || {};
            return this.getLeastUsedLane(laneStats).lane;
        });
        const uniqueLanes = new Set(lanePrefs);
        score += uniqueLanes.size * -20;
        
        // Rematch penalty
        for (let i = 0; i < participants.length; i++) {
            for (let j = i + 1; j < participants.length; j++) {
                if (this.haveRacedBefore(participants[i].id, participants[j].id)) {
                    score += 30;
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

        if (participants.length > 10) {
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
     * Greedy selection fallback for large participant groups
     */
    greedySelection(participants, count, roundNumber = 1) {
        const selected = [];
        const available = [...participants];

        if (roundNumber === 1) {
            const shuffled = this.shuffleArray(available);
            return shuffled.slice(0, count);
        }

        const firstIndex = Math.floor(Math.random() * available.length);
        selected.push(available.splice(firstIndex, 1)[0]);

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
                score += 10;
            }
        });

        return score;
    }

    /**
     * Assign lanes optimally using points-based system
     * Unified async implementation
     */
    async assignLanesOptimally(participants, numberOfLanes, roundNumber = 1) {
        const laneAssignments = [];
        for (let lane = 1; lane <= numberOfLanes; lane++) {
            laneAssignments.push({ lane, participant: null });
        }

        if (participants.length === 0) return laneAssignments;

        // Round 1: random assignment
        if (roundNumber === 1) {
            if (participants.length <= 10) {
                window.debugLogger.debug('Pairing', 'Round 1: Assigning lanes randomly');
            }
            const shuffledParticipants = this.shuffleArray([...participants]);
            shuffledParticipants.forEach((participant, index) => {
                if (index < numberOfLanes) {
                    laneAssignments[index].participant = participant;
                }
            });
            return laneAssignments;
        }

        if (participants.length <= 10) {
            window.debugLogger.debug('Pairing', `Round ${roundNumber}: Applying points-based lane optimization`);
        }

        return await this.assignLanesWithPointsSystem(participants, numberOfLanes, laneAssignments);
    }

    /**
     * Assign lanes using points-based system
     * Points: 2 for first race on lane, +1 for each additional
     * Unified async implementation
     */
    async assignLanesWithPointsSystem(participants, numberOfLanes, laneAssignments) {
        if (participants.length <= 10) {
            window.debugLogger.debug('Pairing', 'Assigning lanes with points-based system...');
            window.debugLogger.debug('Pairing', `   Participants: ${participants.length}, Available lanes: ${numberOfLanes}`);
        }
        
        const participantLaneScores = participants.map(participant => {
            const laneStats = this.laneHistory.get(participant.id) || {};
            const laneScores = [];
            
            for (let lane = 1; lane <= numberOfLanes; lane++) {
                const usage = laneStats[lane] || 0;
                let points = 0;
                if (usage > 0) {
                    points = 2 + (usage - 1);
                }
                laneScores.push({ lane, usage, points, participant });
            }
            
            laneScores.sort((a, b) => a.points - b.points);
            
            return {
                participant,
                laneScores,
                bestLane: laneScores[0].lane,
                bestPoints: laneScores[0].points
            };
        });

        if (participants.length <= 10) {
            window.debugLogger.debug('Pairing', 'Participant lane scores:');
            participantLaneScores.forEach(p => {
                const topLanes = p.laneScores.slice(0, 3).map(ls => `L${ls.lane}:${ls.points}pts`).join(', ');
                window.debugLogger.debug('Pairing', `   ${p.participant.name}: ${topLanes}`);
            });
        }

        const rematchCount = this.countRematches(participants);
        if (participants.length <= 10) {
            window.debugLogger.debug('Pairing', `Rematch count: ${rematchCount} pairs have raced before`);
        }

        const assignment = await this.findOptimalPointsAssignment(participantLaneScores, numberOfLanes);
        
        let totalPoints = 0;
        assignment.forEach(({ participant, lane }) => {
            const participantScore = participantLaneScores.find(p => p.participant.id === participant.id);
            const laneScore = participantScore.laneScores.find(ls => ls.lane === lane);
            
            laneAssignments[lane - 1].participant = participant;
            totalPoints += laneScore.points;
            
            if (participants.length <= 10) {
                window.debugLogger.debug('Pairing', `${participant.name} -> Lane ${lane} (${laneScore.points} pts, usage: ${laneScore.usage})`);
            }
        });

        if (participants.length <= 10) {
            window.debugLogger.debug('Pairing', `Total assignment points: ${totalPoints} (lower is better)`);
            window.debugLogger.debug('Pairing', `Average points per participant: ${(totalPoints / participants.length).toFixed(1)}`);
        }

        return laneAssignments;
    }

    /**
     * Find optimal lane assignment using points-based optimization
     * Unified async implementation
     */
    async findOptimalPointsAssignment(participantLaneScores, numberOfLanes) {
        const participants = participantLaneScores.map(p => p.participant);
        
        if (participants.length <= 4) {
            return await this.exhaustivePointsSearch(participantLaneScores, numberOfLanes);
        }
        
        return await this.greedyPointsAssignment(participantLaneScores, numberOfLanes);
    }

    /**
     * Exhaustive search for optimal points assignment
     * Unified async implementation
     */
    async exhaustivePointsSearch(participantLaneScores, numberOfLanes) {
        const participants = participantLaneScores.map(p => p.participant);
        let bestAssignment = null;
        let bestScore = Infinity;
        let processedCount = 0;
        
        if (participants.length <= 10) {
            window.debugLogger.debug('Pairing', 'Using exhaustive search for optimal assignment...');
        }
        
        const startTime = Date.now();
        
        const generateAssignments = async (participantIndex, currentAssignment, usedLanes) => {
            if (participantIndex >= participants.length) {
                const score = this.calculatePointsAssignmentScore(currentAssignment, participantLaneScores);
                if (score < bestScore) {
                    bestScore = score;
                    bestAssignment = [...currentAssignment];
                }
                processedCount++;
                
                if (processedCount % 100 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 1));
                    const elapsed = Date.now() - startTime;
                    if (elapsed > 5000) {
                        console.warn(`⚠️ Exhaustive search timeout (${elapsed}ms). Using best found.`);
                        return;
                    }
                }
                return;
            }
            
            const participant = participants[participantIndex];
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
        
        if (participants.length <= 10) {
            window.debugLogger.debug('Pairing', `Exhaustive search found solution with score: ${bestScore} (${processedCount} combinations)`);
        }
        
        return bestAssignment || participants.map((participant, index) => ({
            participant,
            lane: Math.min(index + 1, numberOfLanes)
        }));
    }

    /**
     * Greedy points-based assignment
     * Unified async implementation
     */
    async greedyPointsAssignment(participantLaneScores, numberOfLanes) {
        const assignment = [];
        const usedLanes = new Set();
        
        if (participantLaneScores.length <= 10) {
            window.debugLogger.debug('Pairing', 'Using greedy points-based assignment...');
        }
        
        const sortedParticipants = [...participantLaneScores].sort((a, b) => a.bestPoints - b.bestPoints);
        
        for (let i = 0; i < sortedParticipants.length; i++) {
            const participantScore = sortedParticipants[i];
            let bestLane = null;
            let bestPoints = Infinity;
            
            participantScore.laneScores.forEach(laneScore => {
                if (!usedLanes.has(laneScore.lane) && laneScore.points < bestPoints) {
                    bestPoints = laneScore.points;
                    bestLane = laneScore.lane;
                }
            });
            
            if (bestLane) {
                assignment.push({ participant: participantScore.participant, lane: bestLane });
                usedLanes.add(bestLane);
                
                if (participantLaneScores.length <= 10) {
                    window.debugLogger.debug('Pairing', `${participantScore.participant.name} -> Lane ${bestLane} (${bestPoints} pts)`);
                }
            }
            
            if (i > 0 && i % 10 === 0 && sortedParticipants.length > 20) {
                await new Promise(resolve => setTimeout(resolve, 1));
            }
        }
        
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
     * Record race results and update histories
     */
    recordRaceResult(heat, results, classId = null, eventId = null) {
        window.debugLogger.debug('Pairing', 'Recording race result for heat:', heat.id);

        if (!results || !Array.isArray(results)) {
            console.warn('Invalid results provided');
            return false;
        }

        const participants = heat.lanes.filter(lane => lane.participant).map(lane => lane.participant);
        const isIncompleteRace = participants.length < heat.numberOfLanes;

        // Update opponent history
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

        // Update incomplete race history
        if (isIncompleteRace) {
            participants.forEach(participant => {
                const currentCount = this.incompleteRaceHistory.get(participant.id) || 0;
                this.incompleteRaceHistory.set(participant.id, currentCount + 1);
            });
            window.debugLogger.debug('Pairing', `Recorded incomplete race for ${participants.length} participants (${heat.numberOfLanes} lanes available)`);
        }

        // Record class schedules
        if (classId && eventId && heat.raceNumber) {
            participants.forEach(participant => {
                this.recordClassSchedule(participant.id, classId, heat.raceNumber, eventId);
            });
        }

        window.debugLogger.debug('Pairing', 'Race result recorded successfully');
        return true;
    }

    /**
     * Reverse a race result - remove from all tracking histories
     */
    reverseRaceResult(heat, results, classId = null) {
        window.debugLogger.debug('Pairing', 'Reversing race result for heat:', heat.id);

        if (!results || !Array.isArray(results)) {
            console.warn('Invalid results provided for reversal');
            return false;
        }

        const participants = heat.lanes.filter(lane => lane.participant).map(lane => lane.participant);
        const isIncompleteRace = participants.length < heat.numberOfLanes;

        // Reverse opponent history
        participants.forEach(participant1 => {
            const opponents = this.opponentHistory.get(participant1.id) || new Set();
            participants.forEach(participant2 => {
                if (participant1.id !== participant2.id) {
                    opponents.delete(participant2.id);
                }
            });
            this.opponentHistory.set(participant1.id, opponents);
        });

        // Reverse lane history
        heat.lanes.forEach(laneAssignment => {
            if (laneAssignment.participant) {
                const laneStats = this.laneHistory.get(laneAssignment.participant.id) || {};
                if (laneStats[laneAssignment.lane]) {
                    laneStats[laneAssignment.lane] = Math.max(0, laneStats[laneAssignment.lane] - 1);
                }
                this.laneHistory.set(laneAssignment.participant.id, laneStats);
            }
        });

        // Reverse race history
        participants.forEach(participant => {
            const races = this.raceHistory.get(participant.id) || [];
            const index = races.indexOf(heat.id);
            if (index > -1) {
                races.splice(index, 1);
            }
            this.raceHistory.set(participant.id, races);
        });

        // Reverse incomplete race history
        if (isIncompleteRace) {
            participants.forEach(participant => {
                const currentCount = this.incompleteRaceHistory.get(participant.id) || 0;
                this.incompleteRaceHistory.set(participant.id, Math.max(0, currentCount - 1));
            });
            window.debugLogger.debug('Pairing', `Reversed incomplete race tracking for ${participants.length} participants`);
        }

        // Reverse class schedules
        if (classId) {
            participants.forEach(participant => {
                const driverSchedule = this.classScheduleHistory.get(participant.id);
                if (driverSchedule && driverSchedule[classId]) {
                    delete driverSchedule[classId];
                    window.debugLogger.debug('Pairing', `Removed class schedule for driver ${participant.id} in class ${classId}`);
                }
            });
        }

        window.debugLogger.debug('Pairing', 'Race result reversed successfully');
        return true;
    }

    /**
     * Get statistics for a participant
     */
    getParticipantStats(participantId) {
        return {
            laneHistory: this.laneHistory.get(participantId) || {},
            opponents: Array.from(this.opponentHistory.get(participantId) || []),
            raceCount: (this.raceHistory.get(participantId) || []).length,
            incompleteRaceCount: this.incompleteRaceHistory.get(participantId) || 0
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
            raceCountStats: {},
            incompleteRaceStats: {}
        };

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

        this.opponentHistory.forEach((opponents, participantId) => {
            stats.opponentMatchStats[participantId] = {
                uniqueOpponents: opponents.size,
                opponentsList: Array.from(opponents)
            };
        });

        this.raceHistory.forEach((races, participantId) => {
            stats.raceCountStats[participantId] = races.length;
        });

        this.incompleteRaceHistory.forEach((count, participantId) => {
            const totalRaces = (this.raceHistory.get(participantId) || []).length;
            stats.incompleteRaceStats[participantId] = {
                incompleteCount: count,
                totalRaces,
                incompletePercentage: totalRaces > 0 ? Math.round((count / totalRaces) * 100) : 0
            };
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
            incompleteRaceDistribution: [],
            recommendations: []
        };

        const participants = heat.lanes.filter(lane => lane.participant).map(lane => lane.participant);

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

        // Check for lane repetition
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

        // Check incomplete race distribution
        const isIncompleteHeat = participants.length < heat.numberOfLanes;
        participants.forEach(participant => {
            const stats = this.getParticipantStats(participant.id);
            const incompleteCount = stats.incompleteRaceCount;
            const totalRaces = stats.raceCount;

            if (totalRaces > 0) {
                const incompletePercentage = (incompleteCount / totalRaces) * 100;
                if (incompletePercentage > 40) {
                    analysis.incompleteRaceDistribution.push({
                        participant: participant.name,
                        participantId: participant.id,
                        incompleteCount,
                        totalRaces,
                        incompletePercentage: Math.round(incompletePercentage),
                        isInIncompleteHeat: isIncompleteHeat
                    });
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
        if (analysis.incompleteRaceDistribution.length > 0) {
            const inIncompleteHeat = analysis.incompleteRaceDistribution.filter(p => p.isInIncompleteHeat);
            if (inIncompleteHeat.length > 0) {
                analysis.recommendations.push(`${inIncompleteHeat.length} participant(s) with high incomplete race history assigned to another incomplete heat`);
            } else {
                analysis.recommendations.push(`${analysis.incompleteRaceDistribution.length} participant(s) have disproportionately high incomplete race participation`);
            }
        }
        if (analysis.rematches.length === 0 && analysis.laneRepeats.length === 0 && analysis.incompleteRaceDistribution.length === 0) {
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
        this.incompleteRaceHistory.clear();
        this.classLaneStats.clear();
        this.eventRaceNumbers.clear();
        this.classScheduleHistory.clear();
        this.eventClassOrder.clear();
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
            incompleteRaceHistory: Object.fromEntries(this.incompleteRaceHistory),
            eventRaceNumbers: Object.fromEntries(this.eventRaceNumbers),
            classScheduleHistory: Object.fromEntries(this.classScheduleHistory),
            eventClassOrder: Object.fromEntries(this.eventClassOrder)
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
        if (data.incompleteRaceHistory) {
            this.incompleteRaceHistory = new Map(Object.entries(data.incompleteRaceHistory));
        }
        if (data.eventRaceNumbers) {
            this.eventRaceNumbers = new Map(Object.entries(data.eventRaceNumbers));
        }
        if (data.classScheduleHistory) {
            this.classScheduleHistory = new Map(Object.entries(data.classScheduleHistory));
        }
        if (data.eventClassOrder) {
            this.eventClassOrder = new Map(Object.entries(data.eventClassOrder));
        }
    }

    /**
     * Debug method to verify pairing logic
     */
    debugPairingLogic(participants, numberOfLanes, roundNumber) {
        window.debugLogger.debug('Pairing', '=== PAIRING DEBUG ===');
        window.debugLogger.debug('Pairing', 'Round:', roundNumber);
        window.debugLogger.debug('Pairing', 'Participants:', participants.map(p => p.name));
        window.debugLogger.debug('Pairing', 'Number of lanes:', numberOfLanes);
        window.debugLogger.debug('Pairing', 'Is first round:', roundNumber === 1);
        
        if (roundNumber > 1) {
            window.debugLogger.debug('Pairing', 'Opponent history:');
            this.opponentHistory.forEach((opponents, participantId) => {
                const participant = participants.find(p => p.id === participantId);
                if (participant) {
                    window.debugLogger.debug('Pairing', `  ${participant.name}: raced against ${opponents.size} opponents`);
                }
            });
            
            window.debugLogger.debug('Pairing', 'Lane history:');
            this.laneHistory.forEach((laneStats, participantId) => {
                const participant = participants.find(p => p.id === participantId);
                if (participant) {
                    const totalRaces = Object.values(laneStats).reduce((sum, count) => sum + count, 0);
                    window.debugLogger.debug('Pairing', `  ${participant.name}: ${totalRaces} total races`, laneStats);
                }
            });
        }
        
        window.debugLogger.debug('Pairing', '=== END DEBUG ===');
    }

    /**
     * Test method to verify race balancing logic
     */
    testRaceBalancing() {
        window.debugLogger.debug('Pairing', 'Testing Race Balancing Logic...');
        
        const testCases = [
            { drivers: 6, lanes: 5, expected: { freeRun: [5, 1], balanced: [3, 3] } },
            { drivers: 7, lanes: 5, expected: { freeRun: [5, 2], balanced: [4, 3] } },
            { drivers: 4, lanes: 3, expected: { freeRun: [3, 1], balanced: [2, 2] } },
            { drivers: 9, lanes: 4, expected: { freeRun: [4, 4, 1], balanced: [4, 3, 2] } },
            { drivers: 8, lanes: 3, expected: { freeRun: [3, 3, 2], balanced: [3, 3, 2] } }
        ];

        testCases.forEach((testCase, index) => {
            window.debugLogger.debug('Pairing', `Test Case ${index + 1}: ${testCase.drivers} drivers, ${testCase.lanes} lanes`);
            
            const freeRunDistribution = this.calculateFreeRunDistribution(testCase.drivers, testCase.lanes);
            window.debugLogger.debug('Pairing', `Free Run: ${freeRunDistribution.join(', ')} (expected: ${testCase.expected.freeRun.join(', ')})`);
            
            const balancedDistribution = this.calculateOptimalBalancedDistribution(testCase.drivers, testCase.lanes);
            window.debugLogger.debug('Pairing', `Balanced: ${balancedDistribution.join(', ')} (expected: ${testCase.expected.balanced.join(', ')})`);
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

/**
 * Global export for browser environments
 * Depends on window object being available
 */
if (typeof window !== 'undefined') {
    window.PairingEngine = PairingEngine;
}

/**
 * Export for CommonJS module systems (Node.js)
 */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PairingEngine;
}
