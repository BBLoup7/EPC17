/**
 * Enhanced Race Management Module for EPC17 Event Management System
 * Handles race generation, bracket management, elimination logic, and result tracking
 */

class RaceManager {
    constructor(dataManager, pairingEngine) {
        this.dataManager = dataManager;
        this.pairingEngine = pairingEngine;
        this.eventBrackets = new Map(); // eventId -> bracket data
        this.currentEvent = null;
        this.eventParticipants = new Map(); // eventId -> participants by class
        this.bracketHistory = new Map(); // eventId -> history data
    }

    /**
     * Ensure the pairing engine's next race number cursor is aligned to the
     * next available number for the event based on existing bracket data.
     * This prevents numbering from resetting after a page reload.
     */
    async ensureEventRaceNumberCursor(eventId) {
        try {
            const bracket = await this.getBracket(eventId);
            if (!bracket || !bracket.classes || typeof bracket.classes !== 'object') return;

            let maxRaceNumber = 0;
            for (const className of Object.keys(bracket.classes)) {
                const classData = bracket.classes[className];
                if (!classData || !Array.isArray(classData.rounds)) continue;
                for (const round of classData.rounds) {
                    if (!round || !Array.isArray(round.heats)) continue;
                    for (const heat of round.heats) {
                        if (heat && Number.isFinite(heat.raceNumber)) {
                            if (heat.raceNumber > maxRaceNumber) maxRaceNumber = heat.raceNumber;
                        }
                    }
                }
            }

            const desiredNext = maxRaceNumber + 1;
            const currentNext = this.pairingEngine.getNextRaceNumber(eventId);
            if (!Number.isFinite(currentNext) || currentNext <= maxRaceNumber) {
                this.pairingEngine.setNextRaceNumber(eventId, desiredNext);
            }
        } catch (e) {
            console.warn('ensureEventRaceNumberCursor failed:', e);
        }
    }

    /**
     * Initialize brackets for an event
     */
    async initializeBrackets(eventId) {
        window.debugLogger.debug('Race', ` ================= BRACKET INITIALIZATION DEBUG =================`);
        window.debugLogger.debug('Race', ` Initializing brackets for event ${eventId}`);
        
        try {
            // Ensure we have the latest brackets from storage before any checks
            try {
                await this.dataManager.getRaceBrackets();
            } catch (e) {
                console.warn('⚠️ Could not refresh race brackets before initialization:', e);
            }

            const event = this.dataManager.getEvent(eventId);
            if (!event) {
                throw new Error('Event not found');
            }

            window.debugLogger.debug('Race', ` Event found: ${event.name}`);
            window.debugLogger.debug('Race', ` Event classOrder:`, event.classOrder);
            window.debugLogger.debug('Race', ` Event classSettings count:`, event.classSettings?.length || 0);
            window.debugLogger.debug('Race', ` Event updatedAt:`, event.updatedAt);

            // Set class order in pairing engine for race spacing calculations
            if (event.classOrder && Array.isArray(event.classOrder)) {
                this.pairingEngine.setEventClassOrder(eventId, event.classOrder);
            }

            // Check if event has existing race brackets before blocking initialization
            const existingBracket = await this.dataManager.getRaceBracket(eventId);
            const hasExistingRaces = existingBracket && existingBracket.classes && 
                Object.values(existingBracket.classes).some(classBracket => 
                    classBracket.rounds && classBracket.rounds.length > 0
                );
            
            // Enforce status guardrails: only block if event is completed/finished or active WITH existing races
            const currentStatus = event.status || 'upcoming';
            if (currentStatus === 'completed' || currentStatus === 'finished') {
                throw new Error(`Event is already ${currentStatus} and cannot be re-initialized`);
            }
            
            if (currentStatus === 'active' && hasExistingRaces) {
                throw new Error(`Event is active and already has races. Brackets cannot be initialized again.`);
            }
            
            // Allow initialization for active events without races (e.g., after editing)
            if (currentStatus === 'active' && !hasExistingRaces) {
                window.debugLogger.debug('Race', ' Event is active but has no races - allowing bracket initialization');
            }

            const participants = await this.getEventParticipants(eventId);
            if (participants.length === 0) {
                throw new Error('No participants registered for this event. Please add participants before generating races.');
            }

            window.debugLogger.debug('Race', ` Found ${participants.length} participants for event`);

            // Group participants by class
            const participantsByClass = this.groupParticipantsByClass(participants, event);
            window.debugLogger.debug('Race', ` Participants grouped by class:`, Object.keys(participantsByClass));
            
            // Calculate and store planned total races for the event (for progress display)
            try {
                const plannedTotalRaces = this.calculatePlannedTotalRaces(
                    eventId,
                    participantsByClass,
                    event.numberOfTracks,
                    event.eliminationType || 'single'
                );
                if (Number.isFinite(plannedTotalRaces) && plannedTotalRaces > 0) {
                    await this.dataManager.updateEvent(eventId, {
                        plannedTotalRaces,
                        plannedRacesCalculatedAt: new Date().toISOString()
                    });
                    window.debugLogger.debug('Race', ` Planned total races for event ${eventId}: ${plannedTotalRaces}`);
                }
            } catch (planErr) {
                console.warn('⚠️ Failed to compute planned total races:', planErr);
            }

            // Initialize pairing engine once for the entire event (not per class)
            // This ensures continuous race numbering across all classes
            this.pairingEngine.initializeEvent(eventId, participants, event.numberOfTracks);

            // Create bracket structure
            const bracket = {
                id: this.dataManager.generateUniqueId(), // Generate unique ID for bracket
                eventId,
                numberOfLanes: event.numberOfTracks,
                classes: {},
                createdAt: new Date().toISOString()
            };

            // Store bracket early so generateRound can access it
            this.eventBrackets.set(eventId, bracket);

            window.debugLogger.debug('Race', ` About to call getOrderedClassNamesForBracket...`);
            // Initialize each class bracket in the specified order
            const orderedClassNames = this.getOrderedClassNamesForBracket(participantsByClass, event);
            window.debugLogger.debug('Race', ` Received ordered class names:`, orderedClassNames);
            
            for (const className of orderedClassNames) {
                const participants = participantsByClass[className];
                if (!participants || participants.length === 0) continue;

                window.debugLogger.debug('Race', `Initializing bracket for class ${className} with ${participants.length} participants (following class order)`);
                
                window.debugLogger.debug('Race', ` Initializing bracket for ${className}:`);
                window.debugLogger.debug('Race', `  Event eliminationType: ${event.eliminationType}`);
                window.debugLogger.debug('Race', `  Setting classBracket.eliminationType: ${event.eliminationType}`);
                window.debugLogger.debug('Race', `  Setting currentBracket: ${event.eliminationType === 'double' ? 'upper' : 'null'}`);

                bracket.classes[className] = {
                    participants: participants.map(p => ({
                        ...p,
                        status: 'active',
                        wins: 0,
                        losses: 0,
                        currentBracket: event.eliminationType === 'double' ? 'upper' : null
                    })),
                    rounds: [],
                    currentRound: 1,
                    isComplete: false,
                    winner: null,
                    eliminationType: event.eliminationType,
                    numberOfLanes: event.numberOfTracks,
                    upperBracket: [],
                    lowerBracket: event.eliminationType === 'double' ? [] : null
                };

                window.debugLogger.debug('Race', ` Bracket initialized for ${className} with eliminationType: ${bracket.classes[className].eliminationType}`);

                        // Generate first round
                window.debugLogger.debug('Race', ` Generating first round for ${className}...`);
                await this.generateRound(eventId, className, 1);
                window.debugLogger.debug('Race', ` First round generated for ${className}`);
            }

            // Validate bracket integrity before saving
            const validationResult = this.validateBracketIntegrity(bracket);
            if (!validationResult.isValid) {
                console.error('❌ Bracket validation failed:', validationResult.errors);

                // Attempt to repair the bracket
                window.debugLogger.debug('Race', ' Attempting to repair bracket duplicates...');
                const repairsMade = this.repairBracketDuplicates(bracket);

                if (repairsMade > 0) {
                    window.debugLogger.debug('Race', ` Repaired ${repairsMade} duplicate assignments`);

                    // Re-validate after repair
                    const revalidationResult = this.validateBracketIntegrity(bracket);
                    if (!revalidationResult.isValid) {
                        console.error('❌ Bracket still invalid after repair:', revalidationResult.errors);
                        throw new Error(`Bracket repair failed. Invalid state: ${revalidationResult.errors.join(', ')}`);
                    }
                    window.debugLogger.debug('Race', ' Bracket integrity restored after repair');
                } else {
                    throw new Error(`Bracket generation created invalid state with no repair possible: ${validationResult.errors.join(', ')}`);
                }
            } else {
                window.debugLogger.debug('Race', ' Bracket integrity validated successfully');
            }

            // Save bracket to persistent storage
            await this.dataManager.saveRaceBracket(eventId, bracket);

            // 🚀 UPDATE EVENT STATUS BASED ON RACE EXISTENCE
            try {
                // Use the new automatic status management if available
                if (window.eventManager && typeof window.eventManager.updateEventStatusFromRaces === 'function') {
                    await window.eventManager.updateEventStatusFromRaces(eventId);
                    window.debugLogger.debug('Race', ` Event ${eventId} status automatically updated based on race brackets`);
                } else {
                    // Fallback to old behavior
                    await this.dataManager.updateEventStatus(eventId, 'active');
                    window.debugLogger.debug('Race', ` Event ${eventId} status updated to 'active' after bracket initialization`);
                }
            } catch (statusError) {
                console.error('⚠️ Warning: Failed to update event status:', statusError);
                // Don't fail the bracket initialization if status update fails
            }

            window.debugLogger.debug('Race', 'Brackets initialized successfully');
            window.debugLogger.debug('Race', ` ================= END BRACKET INITIALIZATION DEBUG =================`);
            return bracket;

        } catch (error) {
            console.error('🚀 ❌ Error initializing brackets:', error);
            window.debugLogger.debug('Race', ` ================= END BRACKET INITIALIZATION DEBUG =================`);
            throw error;
        }
    }

    /**
     * Generate a specific round for a class
     */
    async generateRound(eventId, className, roundNumber) {
        window.debugLogger.debug('Race', `Generating round ${roundNumber} for class ${className}`);

        try {
            const bracket = await this.getBracket(eventId);
            if (!bracket || !bracket.classes[className]) {
                throw new Error('Bracket not found');
            }

            const classBracket = bracket.classes[className];

            const type = (classBracket.eliminationType || 'single').toLowerCase();
            window.debugLogger.debug('Race', ` generateRound for ${className} round ${roundNumber}:`);
            window.debugLogger.debug('Race', `  classBracket.eliminationType: ${classBracket.eliminationType}`);
            window.debugLogger.debug('Race', `  detected type: ${type}`);

            if (type === 'single') {
                window.debugLogger.debug('Race', `  Routing to generateSingleEliminationRound`);
                return this.generateSingleEliminationRound(eventId, className, roundNumber);
            } else if (type === 'double') {
                window.debugLogger.debug('Race', `  Routing to generateDoubleEliminationRound`);
                return this.generateDoubleEliminationRound(eventId, className, roundNumber);
            } else if (type === 'double_random' || type === 'custom') {
                window.debugLogger.debug('Race', `  Routing to generateRandomEliminationRound`);
                return this.generateRandomEliminationRound(eventId, className, roundNumber, type);
            } else {
                console.warn(`⚠️ Unknown elimination type '${type}', defaulting to double_random`);
                return this.generateRandomEliminationRound(eventId, className, roundNumber, 'double_random');
            }

        } catch (error) {
            console.error('Error generating round:', error);
            throw error;
        }
    }

    /**
     * Generate a round for non-bracketed formats (double_random, custom)
     */
    async generateRandomEliminationRound(eventId, className, roundNumber, eliminationType) {
        const bracket = await this.getBracket(eventId);
        const classBracket = bracket.classes[className];
        const event = this.dataManager.getEvent(eventId);
        
        // For custom elimination, check if brackets should be used
        if (eliminationType === 'custom' && event?.customUseBrackets === true) {
            window.debugLogger.debug('Race', 'Custom elimination with brackets enabled - using multi-loss bracket logic');
            return this.generateMultiLossBracketRound(eventId, className, roundNumber);
        }
        
        // Everyone active is pooled randomly each round (no brackets)
        const activeParticipants = this.getActiveParticipants(classBracket, roundNumber);
        if (activeParticipants.length === 0) {
            window.debugLogger.debug('Race', 'No active participants for round');
            return [];
        }
        
        const customFinalType = event?.customFinalType || 'unique';
        const customLossLimit = Number.isFinite(event?.customLossLimit) ? Number(event.customLossLimit) : 2;
        
        // Determine if this should be a final round based on final type
        let isFinalRound = false;
        if (customFinalType === 'unique') {
            // Standard: final when participants fit in one race
            isFinalRound = activeParticipants.length <= classBracket.numberOfLanes;
        } else if (customFinalType === 'complete') {
            // Complete elimination: continue until only one undefeated or all reach loss limit
            const undefeatedCount = activeParticipants.filter(p => p.losses === 0).length;
            const allAtLossLimit = activeParticipants.every(p => p.losses >= customLossLimit - 1);
            isFinalRound = (undefeatedCount <= 1 && activeParticipants.length <= classBracket.numberOfLanes) || allAtLossLimit;
        }
        
        const freeRunEnabled = event?.freeRunEnabled === true || event?.freeRunEnabled === 'true';
        
        await this.ensureEventRaceNumberCursor(eventId);
        
        const heats = isFinalRound
            ? [this.pairingEngine.createFinalHeat(activeParticipants, classBracket.numberOfLanes, roundNumber, eventId)]
            : await this.pairingEngine.generateHeats(
                activeParticipants,
                classBracket.numberOfLanes,
                roundNumber,
                eventId,
                freeRunEnabled,
                className
            );
        
        if (!Array.isArray(heats)) {
            console.error('❌ generateHeats returned non-array for random elimination:', heats);
            throw new Error('Failed to generate heats - invalid response from pairing engine');
        }
        
        const roundData = {
            roundNumber,
            heats,
            isComplete: false,
            type: eliminationType,
            bracketType: eliminationType,
            createdAt: new Date().toISOString()
        };
        classBracket.rounds.push(roundData);
        classBracket.currentRound = roundNumber;
        await this.dataManager.saveRaceBracket(eventId, bracket);
        window.debugLogger.debug('Race', `Generated ${heats.length} heats for ${eliminationType} round ${roundNumber} (brackets: ${event?.customUseBrackets === true})`);
        return heats;
    }

    /**
     * Generate multi-loss bracket round for custom elimination with brackets
     */
    async generateMultiLossBracketRound(eventId, className, roundNumber) {
        const bracket = await this.getBracket(eventId);
        const classBracket = bracket.classes[className];
        const event = this.dataManager.getEvent(eventId);
        
        const customLossLimit = Number.isFinite(event?.customLossLimit) ? Number(event.customLossLimit) : 2;
        const freeRunEnabled = event?.freeRunEnabled === true || event?.freeRunEnabled === 'true';
        
        // Group participants by loss count
        const participantsByLosses = new Map();
        classBracket.participants.forEach(participant => {
            if (participant.status === 'active') {
                const losses = participant.losses || 0;
                if (!participantsByLosses.has(losses)) {
                    participantsByLosses.set(losses, []);
                }
                participantsByLosses.get(losses).push(participant);
            }
        });
        
        window.debugLogger.debug('Race', `Multi-loss bracket round ${roundNumber}:`);
        participantsByLosses.forEach((participants, lossCount) => {
            window.debugLogger.debug('Race', `  ${lossCount} losses: ${participants.length} participants (${participants.map(p => p.name).join(', ')})`);
        });
        
        if (participantsByLosses.size === 0) {
            window.debugLogger.debug('Race', 'No active participants for round');
            return [];
        }
        
        await this.ensureEventRaceNumberCursor(eventId);
        
        // Coordinate race numbering to ensure it follows class order
        await this.coordinateRaceNumberingForClass(eventId, className);
        
        // Check if we should create a unified final race
        const allActiveParticipants = Array.from(participantsByLosses.values()).flat();
        const totalParticipants = allActiveParticipants.length;
        const bracketsWithOneParticipant = Array.from(participantsByLosses.values()).filter(participants => participants.length === 1).length;
        const shouldCreateUnifiedFinal = totalParticipants <= classBracket.numberOfLanes || 
                                       (bracketsWithOneParticipant >= 2 && totalParticipants <= classBracket.numberOfLanes);
        
        if (shouldCreateUnifiedFinal) {
            window.debugLogger.debug('Race', `Creating unified final race with ${totalParticipants} participants from ${participantsByLosses.size} brackets`);
            
            const finalHeat = this.pairingEngine.createFinalHeat(allActiveParticipants, classBracket.numberOfLanes, roundNumber, eventId);
            finalHeat.bracketType = 'unified_final';
            finalHeat.lossCount = 'final';
            
            const roundData = {
                roundNumber,
                heats: [finalHeat],
                isComplete: false,
                type: 'unified-final',
                bracketType: 'unified-final',
                createdAt: new Date().toISOString()
            };
            
            classBracket.rounds.push(roundData);
            classBracket.currentRound = roundNumber;
            
            await this.dataManager.saveRaceBracket(eventId, bracket);
            
            window.debugLogger.debug('Race', `Generated unified final race for round ${roundNumber}`);
            return [finalHeat];
        }
        
        const allHeats = [];
        
        // Generate heats for each loss bracket
        for (const [lossCount, participants] of participantsByLosses.entries()) {
            if (participants.length === 0) continue;
            
            window.debugLogger.debug('Race', `Generating heats for ${lossCount}-loss bracket with ${participants.length} participants`);
            
            // Check if this bracket should be a final
            const isBracketFinal = participants.length <= classBracket.numberOfLanes;
            
            const heats = isBracketFinal
                ? [this.pairingEngine.createFinalHeat(participants, classBracket.numberOfLanes, roundNumber, eventId)]
                : await this.pairingEngine.generateHeats(
                    participants,
                    classBracket.numberOfLanes,
                    roundNumber,
                    eventId,
                    freeRunEnabled,
                    className
                );
            
            if (!Array.isArray(heats)) {
                console.error('❌ generateHeats returned non-array for multi-loss bracket:', heats);
                throw new Error('Failed to generate heats for multi-loss bracket');
            }
            
            // Tag heats with their bracket type
            heats.forEach(heat => {
                heat.bracketType = lossCount === 0 ? 'upper' : `${lossCount}_loss`;
                heat.lossCount = lossCount;
            });
            
            allHeats.push(...heats);
        }
        
        // Create round data
        const roundData = {
            roundNumber,
            heats: allHeats,
            isComplete: false,
            type: 'multi-loss',
            bracketType: 'multi-loss',
            createdAt: new Date().toISOString()
        };
        
        classBracket.rounds.push(roundData);
        classBracket.currentRound = roundNumber;
        
        await this.dataManager.saveRaceBracket(eventId, bracket);
        
        // Validate race numbers to prevent duplicates and ensure proper sequencing
        const validation = await this.validateRaceNumbers(eventId);
        if (!validation.valid) {
            console.warn(`⚠️ Race number validation failed for multi-loss round ${roundNumber}:`, validation.issues);
        }
        
        window.debugLogger.debug('Race', `Generated ${allHeats.length} heats across ${participantsByLosses.size} loss brackets for round ${roundNumber}`);
        return allHeats;
    }

    /**
     * Generate single elimination round
     */
    async generateSingleEliminationRound(eventId, className, roundNumber) {
        const bracket = await this.getBracket(eventId);
        const classBracket = bracket.classes[className];
        
        // Get active participants for this round
        const activeParticipants = this.getActiveParticipants(classBracket, roundNumber);
        
        if (activeParticipants.length === 0) {
            window.debugLogger.debug('Race', 'No active participants for round');
            return [];
        }

        // Check if this should be the final round
        const isFinalRound = activeParticipants.length <= classBracket.numberOfLanes;
        
        if (isFinalRound) {
            window.debugLogger.debug('Race', 'Generating final round');
            return this.generateFinalRound(eventId, className, activeParticipants);
        }

        // Get event configuration for free run setting
        const event = this.dataManager.getEvent(eventId);
        const freeRunEnabled = event?.freeRunEnabled === true || event?.freeRunEnabled === 'true';

        // Align race numbering cursor to continue from last assigned number
        await this.ensureEventRaceNumberCursor(eventId);

        // Coordinate race numbering to ensure it follows class order
        await this.coordinateRaceNumberingForClass(eventId, className);

        // Generate regular round heats
        const heats = await this.pairingEngine.generateHeats(
            activeParticipants,
            classBracket.numberOfLanes,
            roundNumber,
            eventId,
            freeRunEnabled,
            className
        );

        if (!Array.isArray(heats)) {
            console.error('❌ generateHeats returned non-array for single elimination:', heats);
            throw new Error('Failed to generate single elimination heats - invalid response from pairing engine');
        }

        // Add round to bracket
        const roundData = {
            roundNumber,
            heats,
            isComplete: false,
            type: 'regular',
            bracketType: 'single',
            createdAt: new Date().toISOString()
        };

        classBracket.rounds.push(roundData);
        classBracket.currentRound = roundNumber;

        // Save updated bracket
        await this.dataManager.saveRaceBracket(eventId, bracket);

        // Validate race numbers to prevent duplicates and ensure proper sequencing
        const validation = await this.validateRaceNumbers(eventId);
        if (!validation.valid) {
            console.warn(`⚠️ Race number validation failed for round ${roundNumber}:`, validation.issues);
        }

        window.debugLogger.debug('Race', `Generated ${heats.length} heats for round ${roundNumber}`);
        return heats;
    }

    /**
     * Generate double elimination round
     */
    async generateDoubleEliminationRound(eventId, className, roundNumber) {
        const bracket = await this.getBracket(eventId);
        const classBracket = bracket.classes[className];

        // Get participants for upper and lower brackets
        const upperBracketParticipants = this.getActiveParticipants(classBracket, roundNumber, 'upper');
        const lowerBracketParticipants = this.getActiveParticipants(classBracket, roundNumber, 'lower');
        const totalActiveParticipants = upperBracketParticipants.length + lowerBracketParticipants.length;

        window.debugLogger.debug('Race', `Double elimination round ${roundNumber}:`);
        window.debugLogger.debug('Race', `Upper bracket participants: ${upperBracketParticipants.length}`, upperBracketParticipants.map(p => p.name));
        window.debugLogger.debug('Race', `Lower bracket participants: ${lowerBracketParticipants.length}`, lowerBracketParticipants.map(p => p.name));
        window.debugLogger.debug('Race', `Total active participants: ${totalActiveParticipants}, Max lanes: ${classBracket.numberOfLanes}`);

        // Debug: Check participant bracket assignments
        window.debugLogger.debug('Race', 'All participants and their bracket assignments:');
        classBracket.participants.forEach(p => {
            if (p.status === 'active') {
                window.debugLogger.debug('Race', `  ${p.name}: status=${p.status}, currentBracket=${p.currentBracket}, wins=${p.wins}, losses=${p.losses}`);
            }
        });
        
        // Check if we should create a final round instead of separate bracket rounds
        if (totalActiveParticipants <= classBracket.numberOfLanes && totalActiveParticipants > 1) {
            window.debugLogger.debug('Race', 'Creating final round - total participants fit in one heat');
            const allParticipants = [...upperBracketParticipants, ...lowerBracketParticipants];
            return this.generateFinalRound(eventId, className, allParticipants);
        }
        
        const allHeats = [];
        
        // Get event configuration for free run setting
        const event = this.dataManager.getEvent(eventId);
        const freeRunEnabled = event?.freeRunEnabled === true || event?.freeRunEnabled === 'true';

        // Align race numbering cursor to continue from last assigned number
        await this.ensureEventRaceNumberCursor(eventId);

        // Coordinate race numbering to ensure it follows class order
        await this.coordinateRaceNumberingForClass(eventId, className);

        // Generate upper bracket round if there are participants
        if (upperBracketParticipants.length > 1) {
            window.debugLogger.debug('Race', ` Generating upper bracket heats for ${upperBracketParticipants.length} participants`);
            const upperHeats = await this.pairingEngine.generateHeats(
                upperBracketParticipants,
                classBracket.numberOfLanes,
                roundNumber,
                eventId,
                freeRunEnabled,
                className
            );

            if (Array.isArray(upperHeats)) {
                upperHeats.forEach(heat => {
                    heat.bracketType = 'upper';
                    window.debugLogger.debug('Race', `  Upper heat ${heat.heatNumber}: ${heat.lanes?.length || 0} lanes, bracketType: ${heat.bracketType}`);
                });

                window.debugLogger.debug('Race', ` Generated ${upperHeats.length} upper bracket heats`);
                allHeats.push(...upperHeats);
            } else {
                console.error('❌ generateHeats returned non-array for upper bracket:', upperHeats);
                throw new Error('Failed to generate upper bracket heats - invalid response from pairing engine');
            }
        } else if (upperBracketParticipants.length === 1) {
            window.debugLogger.debug('Race', 'Only 1 participant in upper bracket, they advance');
        } else {
            window.debugLogger.debug('Race', 'No participants in upper bracket');
        }
        
        // Ensure cursor alignment again (safe no-op if unchanged)
        await this.ensureEventRaceNumberCursor(eventId);

        // Generate lower bracket round if there are participants
        if (lowerBracketParticipants.length > 1) {
            window.debugLogger.debug('Race', ` Generating lower bracket heats for ${lowerBracketParticipants.length} participants`);
            const lowerHeats = await this.pairingEngine.generateHeats(
                lowerBracketParticipants,
                classBracket.numberOfLanes,
                roundNumber,
                eventId,
                freeRunEnabled,
                className
            );

            if (Array.isArray(lowerHeats)) {
                lowerHeats.forEach(heat => {
                    heat.bracketType = 'lower';
                    window.debugLogger.debug('Race', `  Lower heat ${heat.heatNumber}: ${heat.lanes?.length || 0} lanes, bracketType: ${heat.bracketType}`);
                });

                window.debugLogger.debug('Race', ` Generated ${lowerHeats.length} lower bracket heats`);
                allHeats.push(...lowerHeats);
            } else {
                console.error('❌ generateHeats returned non-array for lower bracket:', lowerHeats);
                throw new Error('Failed to generate lower bracket heats - invalid response from pairing engine');
            }
        } else if (lowerBracketParticipants.length === 1) {
            window.debugLogger.debug('Race', 'Only 1 participant in lower bracket, they advance');
        } else {
            window.debugLogger.debug('Race', 'No participants in lower bracket');
        }
        
        // Check if we need a championship final (legacy condition for exactly 1 in each bracket)
        if (upperBracketParticipants.length === 1 && lowerBracketParticipants.length === 1) {
            window.debugLogger.debug('Race', 'Generating championship final');
            const finalHeat = this.pairingEngine.createFinalHeat([...upperBracketParticipants, ...lowerBracketParticipants], classBracket.numberOfLanes, roundNumber, eventId);
            finalHeat.bracketType = 'championship';
            window.debugLogger.debug('Race', `  Championship heat: ${finalHeat.lanes?.length || 0} lanes, bracketType: ${finalHeat.bracketType}`);
            allHeats.push(finalHeat);
        }

        // Debug: Log all heats before saving and ensure bracket types are set
        window.debugLogger.debug('Race', ` Final heat summary for round ${roundNumber}:`);
        allHeats.forEach((heat, index) => {
            // Ensure bracket type is set for all heats
            if (!heat.bracketType) {
                console.warn(`🔧 Heat ${heat.heatNumber} missing bracketType, defaulting to 'upper'`);
                heat.bracketType = 'upper';
            }
            window.debugLogger.debug('Race', `  Heat ${index + 1}: bracketType=${heat.bracketType}, heatNumber=${heat.heatNumber}, lanes=${heat.lanes?.length || 0}`);
        });

        if (allHeats.length === 0) {
            window.debugLogger.warn('Race', 'No heats generated for this round');
            return [];
        }

        // Add round to bracket
        const roundData = {
            roundNumber,
            heats: allHeats,
            isComplete: false,
            type: 'double-elimination',
            createdAt: new Date().toISOString()
        };

        classBracket.rounds.push(roundData);
        classBracket.currentRound = roundNumber;

        // Save updated bracket
        await this.dataManager.saveRaceBracket(eventId, bracket);

        // Validate race numbers to prevent duplicates and ensure proper sequencing
        const validation = await this.validateRaceNumbers(eventId);
        if (!validation.valid) {
            console.warn(`⚠️ Race number validation failed for double elimination round ${roundNumber}:`, validation.issues);
        }

        window.debugLogger.debug('Race', ` Generated ${allHeats.length} heats for double elimination round ${roundNumber}`);

        // Additional validation: Check for potential duplicate bracket assignments
        const upperCount = allHeats.filter(h => h.bracketType === 'upper').length;
        const lowerCount = allHeats.filter(h => h.bracketType === 'lower').length;
        const championshipCount = allHeats.filter(h => h.bracketType === 'championship').length;

        window.debugLogger.debug('Race', ` Bracket distribution: ${upperCount} upper, ${lowerCount} lower, ${championshipCount} championship`);

        // Warn if we have an unusual distribution
        if (upperCount > 0 && lowerCount === 0 && championshipCount === 0) {
            console.warn(`⚠️ Only upper bracket heats generated - this might indicate an issue with participant bracket assignments`);
        }

        return allHeats;
    }

    /**
     * Generate final round
     */
    async generateFinalRound(eventId, className, participants) {
        const bracket = await this.getBracket(eventId);
        const classBracket = bracket.classes[className];

        // Align race numbering cursor to continue from last assigned number
        await this.ensureEventRaceNumberCursor(eventId);

        // Coordinate race numbering to ensure it follows class order
        await this.coordinateRaceNumberingForClass(eventId, className);

        // Create final heat with all remaining participants
        const finalHeat = this.pairingEngine.createFinalHeat(participants, classBracket.numberOfLanes, 'final', eventId);
        
        const roundData = {
            roundNumber: 'final',
            heats: [finalHeat],
            isComplete: false,
            type: 'final',
            createdAt: new Date().toISOString()
        };

        classBracket.rounds.push(roundData);
        classBracket.currentRound = 'final';

        // Save updated bracket
        await this.dataManager.saveRaceBracket(eventId, bracket);

        // Validate race numbers to prevent duplicates and ensure proper sequencing
        const validation = await this.validateRaceNumbers(eventId);
        if (!validation.valid) {
            console.warn(`⚠️ Race number validation failed for final round:`, validation.issues);
        }

        window.debugLogger.debug('Race', 'Final round generated');
        return [finalHeat];
    }

    /**
     * OPTIMIZED: Generate next round for a class with performance improvements
     */
    async generateNextRound(eventId, className) {
        const startTime = Date.now();
        window.debugLogger.debug('Race', ` OPTIMIZED: Generating next round for class ${className}`);

        try {
            const bracket = await this.getBracket(eventId);
            if (!bracket || !bracket.classes[className]) {
                throw new Error('Bracket not found');
            }

            const classBracket = bracket.classes[className];

            // 🔧 FIX: Ensure bracket data integrity before generating new round
            // This prevents data loss and ensures proper bracket structure
            if (!classBracket.participants || !Array.isArray(classBracket.participants)) {
                console.warn(`⚠️ Class ${className} has invalid participants array, reinitializing`);
                classBracket.participants = [];
            }

            // Ensure all participants have proper status and bracket assignments
            classBracket.participants.forEach(p => {
                if (!p.status) {
                    console.warn(`⚠️ Participant ${p.name} missing status, defaulting to active`);
                    p.status = 'active';
                }
                if (!p.currentBracket && classBracket.eliminationType === 'double') {
                    console.warn(`⚠️ Participant ${p.name} missing currentBracket, defaulting to upper`);
                    p.currentBracket = 'upper';
                }
            });
            
            // Performance warning for large datasets
            const participantCount = classBracket.participants ? classBracket.participants.length : 0;
            if (participantCount > 100) {
                console.warn(`⚠️ PERFORMANCE WARNING: Generating round for ${participantCount} participants in class ${className}. This may take 10-30 seconds.`);
                
                // Show warning to user if possible
                if (window.showToast) {
                    window.showToast(`Large dataset detected (${participantCount} participants). Generation may take 10-30 seconds...`, 'warning');
                }
            } else if (participantCount > 50) {
                console.warn(`⚠️ Large dataset: ${participantCount} participants in class ${className}. Generation may take several seconds.`);
            }
            
            // Check if current round is complete
            if (!this.isRoundComplete(classBracket, classBracket.currentRound)) {
                throw new Error('Current round is not complete');
            }

            // Check if we already have a final round completed
            const hasFinalRound = classBracket.rounds.some(round => 
                round.roundNumber === 'final' && round.isComplete
            );
            
            if (hasFinalRound) {
                window.debugLogger.debug('Race', `Final round already completed for class ${className}`);
                classBracket.isComplete = true;
                
                // Find the winner from the final round
                const finalRound = classBracket.rounds.find(round => round.roundNumber === 'final');
                if (finalRound && finalRound.heats.length > 0) {
                    const finalHeat = finalRound.heats[0]; // Final should only have one heat
                    if (finalHeat.results && finalHeat.results.length > 0) {
                        const winnerResult = finalHeat.results.find(r => r.position === 1);
                        if (winnerResult) {
                            classBracket.winner = classBracket.participants.find(p => p.id === winnerResult.participantId);
                        }
                    }
                }
                
                await this.dataManager.saveRaceBracket(eventId, bracket);
                
                // Check if event is completed after this class finished
                await this.checkAndUpdateEventStatus(eventId);
                
                throw new Error('Final round already completed - tournament is finished');
            }
            
            // For double elimination tournaments, check if we need to create a final round
            if ((classBracket.eliminationType === 'double' || classBracket.eliminationType === 'double_random') && 
                !hasFinalRound) {
                const activeParticipants = this.getActiveParticipants(classBracket);
                
                // If we have exactly 2 active participants and both have 1 loss, create final round
                if (activeParticipants.length === 2) {
                    const participant1 = activeParticipants[0];
                    const participant2 = activeParticipants[1];
                    
                    if (participant1.losses === 1 && participant2.losses === 1) {
                        window.debugLogger.debug('Race', ` Double elimination tournament needs final round - creating championship final`);
                        window.debugLogger.debug('Race', `   Final participants: ${participant1.name} vs ${participant2.name}`);
                        
                        // Create championship final
                        const finalHeat = this.pairingEngine.createFinalHeat(
                            [participant1, participant2], 
                            classBracket.numberOfLanes, 
                            'final', 
                            eventId
                        );
                        finalHeat.bracketType = 'championship';
                        
                        // Add final round to bracket
                        const finalRoundData = {
                            roundNumber: 'final',
                            heats: [finalHeat],
                            isComplete: false,
                            type: 'final',
                            createdAt: new Date().toISOString()
                        };
                        
                        classBracket.rounds.push(finalRoundData);
                        classBracket.currentRound = 'final';
                        
                        await this.dataManager.saveRaceBracket(eventId, bracket);
                        
                        window.debugLogger.debug('Race', ` Championship final created for ${className}`);
                        return null; // Don't generate next round, final round is ready
                    }
                }
            }

            // OPTIMIZATION: Process current round results to update participant statuses
            // This is optimized to avoid unnecessary statistics recalculation
            await this.processRoundResultsOptimized(classBracket, classBracket.currentRound, eventId);

            // Check if tournament is complete
            const activeParticipants = this.getActiveParticipants(classBracket);
            if (activeParticipants.length <= 1) {
                classBracket.isComplete = true;
                classBracket.winner = activeParticipants[0] || null;
                await this.dataManager.saveRaceBracket(eventId, bracket);
                
                // Check if event is completed after this class finished
                await this.checkAndUpdateEventStatus(eventId);
                
                const elapsed = Date.now() - startTime;
                window.debugLogger.debug('Race', ` Tournament completed for class ${className} in ${elapsed}ms`);
                return null;
            }

            // Enforce class order for race numbering to ensure proper sequence
            this.enforceClassOrderRaceNumbering(eventId, className);
            
            // Generate next round with performance optimization
            const nextRoundNumber = typeof classBracket.currentRound === 'number' 
                ? classBracket.currentRound + 1 
                : 'final';
            
            const result = await this.generateRoundOptimized(eventId, className, nextRoundNumber);
            
            const elapsed = Date.now() - startTime;
            window.debugLogger.debug('Race', ` Generated next round for class ${className} in ${elapsed}ms`);
            
            return result;

        } catch (error) {
            console.error('Error generating next round:', error);
            throw error;
        }
    }

    /**
     * Coordinate race numbering between classes based on event class order
     * Rule: EPC17_WORKFLOW.md v1 - ensure race numbering follows class order for subsequent rounds
     */
    async coordinateRaceNumberingForClass(eventId, className) {
        try {
            const event = this.dataManager.getEvent(eventId);
            if (!event || !event.classOrder || !Array.isArray(event.classOrder)) {
                window.debugLogger.debug('Race', 'No class order defined for event, using default race numbering');
                return;
            }

            const bracket = await this.getBracket(eventId);
            if (!bracket || !bracket.classes) return;

            // Find the class ID for the given class name
            const classSetting = event.classSettings?.find(c => c.className === className);
            if (!classSetting) {
                window.debugLogger.debug('Race', `Class setting not found for ${className}, skipping race numbering coordination`);
                return;
            }

            const classOrderIndex = event.classOrder.indexOf(classSetting.classId);
            if (classOrderIndex === -1) {
                window.debugLogger.debug('Race', `Class ${className} not found in class order, skipping race numbering coordination`);
                return;
            }

            // Get the current race number cursor for this event
            const currentNextRaceNumber = this.pairingEngine.getNextRaceNumber(eventId);
            
            // Calculate the expected next race number based on class order
            let expectedNextRaceNumber = currentNextRaceNumber;
            
            // Check if we need to adjust the race number to follow class order
            const previousClasses = event.classOrder.slice(0, classOrderIndex);
            let totalRacesInPreviousClasses = 0;
            
            for (const prevClassId of previousClasses) {
                const prevClassName = event.classSettings?.find(c => c.classId === prevClassId)?.className;
                if (prevClassName && bracket.classes[prevClassName]) {
                    const prevClassData = bracket.classes[prevClassName];
                    if (prevClassData.rounds) {
                        for (const round of prevClassData.rounds) {
                            if (round.heats) {
                                totalRacesInPreviousClasses += round.heats.length;
                            }
                        }
                    }
                }
            }

            // If this class should have races but doesn't have the expected number,
            // adjust the race numbering cursor
            if (totalRacesInPreviousClasses > 0) {
                const expectedRaceNumber = totalRacesInPreviousClasses + 1;
                if (currentNextRaceNumber !== expectedRaceNumber) {
                    window.debugLogger.debug('Race', ` Adjusting race numbering cursor for ${className}: ${currentNextRaceNumber} → ${expectedRaceNumber}`);
                    this.pairingEngine.setNextRaceNumber(eventId, expectedRaceNumber);
                }
            }

            // Also check if there are any existing races in this class that need race numbers
            if (bracket.classes[className] && bracket.classes[className].rounds) {
                let needsRaceNumbers = false;
                for (const round of bracket.classes[className].rounds) {
                    if (round.heats) {
                        for (const heat of round.heats) {
                            if (!heat.raceNumber || heat.raceNumber <= 0) {
                                needsRaceNumbers = true;
                                break;
                            }
                        }
                    }
                    if (needsRaceNumbers) break;
                }
                
                if (needsRaceNumbers) {
                    window.debugLogger.debug('Race', ` Class ${className} has heats without race numbers, ensuring proper numbering`);
                    await this.ensureEventRaceNumberCursor(eventId);
                }
            }

            window.debugLogger.debug('Race', ` Race numbering coordinated for ${className} (order ${classOrderIndex + 1}/${event.classOrder.length})`);
        } catch (error) {
            console.warn('Error coordinating race numbering for class:', error);
        }
    }

    /**
     * Enforce class order for race numbering when generating subsequent rounds
     * Rule: EPC17_WORKFLOW.md v1 - ensure race numbers follow defined class sequence
     */
    enforceClassOrderRaceNumbering(eventId, className) {
        try {
            const event = this.dataManager.getEvent(eventId);
            if (!event || !event.classOrder || !Array.isArray(event.classOrder)) {
                window.debugLogger.debug('Race', 'No class order defined, cannot enforce class order race numbering');
                return;
            }

            const bracket = this.getBracket(eventId);
            if (!bracket || !bracket.classes) return;

            // Find the class ID for the given class name
            const classSetting = event.classSettings?.find(c => c.className === className);
            if (!classSetting) {
                window.debugLogger.debug('Race', `Class setting not found for ${className}, skipping class order enforcement`);
                return;
            }

            const classOrderIndex = event.classOrder.indexOf(classSetting.classId);
            if (classOrderIndex === -1) {
                window.debugLogger.debug('Race', `Class ${className} not found in class order, skipping class order enforcement`);
                return;
            }

            // Get the current race number cursor
            const currentNextRaceNumber = this.pairingEngine.getNextRaceNumber(eventId);
            
            // Calculate what the next race number should be based on class order
            let expectedNextRaceNumber = 1;
            
            // Count all races in classes that come before this one in the order
            for (let i = 0; i < classOrderIndex; i++) {
                const prevClassId = event.classOrder[i];
                const prevClassName = event.classSettings?.find(c => c.classId === prevClassId)?.className;
                if (prevClassName && bracket.classes[prevClassName]) {
                    const prevClassData = bracket.classes[prevClassName];
                    if (prevClassData.rounds) {
                        for (const round of prevClassData.rounds) {
                            if (round.heats) {
                                expectedNextRaceNumber += round.heats.length;
                            }
                        }
                    }
                }
            }

            // Add races from the current class that have already been generated
            if (bracket.classes[className] && bracket.classes[className].rounds) {
                for (const round of bracket.classes[className].rounds) {
                    if (round.heats) {
                        expectedNextRaceNumber += round.heats.length;
                    }
                }
            }

            // If the current race number doesn't match what we expect, adjust it
            if (currentNextRaceNumber !== expectedNextRaceNumber) {
                window.debugLogger.debug('Race', ` Enforcing class order race numbering for ${className}: cursor ${currentNextRaceNumber} → ${expectedNextRaceNumber}`);
                this.pairingEngine.setNextRaceNumber(eventId, expectedNextRaceNumber);
            } else {
                window.debugLogger.debug('Race', ` Race numbering already correct for ${className}: ${expectedNextRaceNumber}`);
            }
        } catch (error) {
            console.warn('Error enforcing class order race numbering:', error);
        }
    }

    /**
     * Validate race numbers to prevent duplicates and ensure proper sequencing
     * Rule: EPC17_WORKFLOW.md v1 - prevent race number conflicts and ensure proper sequence
     */
    async validateRaceNumbers(eventId) {
        try {
            const bracket = await this.getBracket(eventId);
            if (!bracket || !bracket.classes) return { valid: true, issues: [] };

            const issues = [];
            const usedRaceNumbers = new Set();
            const raceNumberDetails = [];

            // Collect all race numbers and their details
            if (!bracket || !bracket.classes || typeof bracket.classes !== 'object') {
                return { totalIssues: 0, byType: {}, issues: [] };
            }

            for (const className of Object.keys(bracket.classes)) {
                const classData = bracket.classes[className];
                if (!classData || !Array.isArray(classData.rounds)) continue;
                
                for (const round of classData.rounds) {
                    if (!round || !Array.isArray(round.heats)) continue;
                    
                    for (const heat of round.heats) {
                        if (heat && Number.isFinite(heat.raceNumber)) {
                            const raceNumber = heat.raceNumber;
                            raceNumberDetails.push({
                                raceNumber,
                                className,
                                round: round.roundNumber,
                                heatId: heat.id || `heat-${className}-${round.roundNumber}-${heat.heatNumber}`,
                                heatNumber: heat.heatNumber
                            });

                            if (usedRaceNumbers.has(raceNumber)) {
                                issues.push({
                                    type: 'duplicate',
                                    message: `Race #${raceNumber} appears multiple times`,
                                    details: raceNumberDetails.filter(r => r.raceNumber === raceNumber)
                                });
                            } else {
                                usedRaceNumbers.add(raceNumber);
                            }
                        }
                    }
                }
            }

            // Check for gaps in race numbering
            if (usedRaceNumbers.size > 0) {
                const sortedNumbers = Array.from(usedRaceNumbers).sort((a, b) => a - b);
                const expectedNumbers = Array.from({ length: sortedNumbers[sortedNumbers.length - 1] }, (_, i) => i + 1);
                
                const missingNumbers = expectedNumbers.filter(n => !usedRaceNumbers.has(n));
                if (missingNumbers.length > 0) {
                    issues.push({
                        type: 'gap',
                        message: `Missing race numbers: ${missingNumbers.join(', ')}`,
                        details: { missingNumbers, totalRaces: usedRaceNumbers.size }
                    });
                }
            }

            // Check if race numbers follow class order
            const event = this.dataManager.getEvent(eventId);
            if (event && event.classOrder && Array.isArray(event.classOrder)) {
                const classOrderIssues = this.validateClassOrderRaceNumbers(event, bracket, raceNumberDetails);
                issues.push(...classOrderIssues);
            }

            const isValid = issues.length === 0;
            
            if (!isValid) {
                // Group issues by type for better logging
                const issuesByType = {};
                issues.forEach(issue => {
                    if (!issuesByType[issue.type]) {
                        issuesByType[issue.type] = [];
                    }
                    issuesByType[issue.type].push(issue);
                });
                
                console.warn(`⚠️ Race number validation found ${issues.length} issues:`, {
                    totalIssues: issues.length,
                    byType: Object.keys(issuesByType).map(type => ({
                        type,
                        count: issuesByType[type].length,
                        examples: issuesByType[type].slice(0, 3) // Only show first 3 examples
                    }))
                });
                
                // Log detailed issues only if there are few of them
                if (issues.length <= 10) {
                    console.warn('Detailed issues:', issues);
                }
            } else {
                window.debugLogger.debug('Race', ` Race number validation passed for event ${eventId}`);
            }

            return { valid: isValid, issues, usedRaceNumbers: Array.from(usedRaceNumbers), raceNumberDetails };
        } catch (error) {
            console.error('Error validating race numbers:', error);
            return { valid: false, issues: [{ type: 'error', message: error.message }] };
        }
    }

    /**
     * Validate that race numbers follow the defined class order
     * Rule: EPC17_WORKFLOW.md v1 - realistic class order validation for race numbering
     */
    validateClassOrderRaceNumbers(event, bracket, raceNumberDetails) {
        const issues = [];
        
        if (!event.classOrder || !Array.isArray(event.classOrder)) return issues;

        // Only validate if we have enough races to make meaningful comparisons
        if (raceNumberDetails.length < 10) {
            return issues;
        }

        // Group races by class to analyze patterns
        const racesByClass = {};
        raceNumberDetails.forEach(race => {
            if (!racesByClass[race.className]) {
                racesByClass[race.className] = [];
            }
            racesByClass[race.className].push(race);
        });

        // Check for major class order violations (only flag significant issues)
        const classOrder = event.classOrder;
        const classSettings = event.classSettings || [];
        
        // Find the first race number for each class
        const firstRaceByClass = {};
        Object.keys(racesByClass).forEach(className => {
            const races = racesByClass[className];
            if (races.length > 0) {
                const firstRace = races.reduce((earliest, current) => 
                    current.raceNumber < earliest.raceNumber ? current : earliest
                );
                firstRaceByClass[className] = firstRace.raceNumber;
            }
        });

        // Only flag major violations where a later class in the order has significantly earlier race numbers
        for (let i = 0; i < classOrder.length - 1; i++) {
            const currentClassId = classOrder[i];
            const nextClassId = classOrder[i + 1];
            
            const currentClassSetting = classSettings.find(c => c.classId === currentClassId);
            const nextClassSetting = classSettings.find(c => c.classId === nextClassId);
            
            if (currentClassSetting && nextClassSetting) {
                const currentClassName = currentClassSetting.className;
                const nextClassName = nextClassSetting.className;
                
                const currentFirstRace = firstRaceByClass[currentClassName];
                const nextFirstRace = firstRaceByClass[nextClassName];
                
                // Only flag if there's a significant violation (more than 10 race numbers difference)
                if (currentFirstRace && nextFirstRace && (nextFirstRace < currentFirstRace - 10)) {
                    issues.push({
                        type: 'class_order_violation',
                        message: `Major class order violation: ${nextClassName} starts at race #${nextFirstRace} but ${currentClassName} starts at race #${currentFirstRace}`,
                        details: {
                            currentClass: currentClassName,
                            nextClass: nextClassName,
                            currentFirstRace,
                            nextFirstRace,
                            violation: `Expected ${nextClassName} to start after ${currentClassName}`
                        }
                    });
                }
            }
        }
        
        return issues;
    }

    /**
     * Auto-fix race numbering issues when possible
     * Rule: EPC17_WORKFLOW.md v1 - automatic race numbering correction
     */
    async autoFixRaceNumbering(eventId) {
        try {
            const validation = await this.validateRaceNumbers(eventId);
            if (validation.valid) {
                window.debugLogger.debug('Race', ' No race numbering issues to fix');
                return { fixed: 0, issues: [] };
            }

            const bracket = await this.getBracket(eventId);
            if (!bracket || !bracket.classes) return { fixed: 0, issues: validation.issues };

            let fixedCount = 0;
            const fixedIssues = [];

            // Fix duplicate race numbers by reassigning them
            const duplicateIssues = validation.issues.filter(issue => issue.type === 'duplicate');
            if (duplicateIssues.length > 0) {
                window.debugLogger.debug('Race', ` Attempting to fix ${duplicateIssues.length} duplicate race numbers...`);
                
                // Get the next available race number
                const nextRaceNumber = this.pairingEngine.getNextRaceNumber(eventId);
                
                duplicateIssues.forEach(issue => {
                    if (issue.details && issue.details.length > 1) {
                        // Keep the first occurrence, reassign the rest
                        for (let i = 1; i < issue.details.length; i++) {
                            const detail = issue.details[i];
                            const className = detail.className;
                            const roundNumber = detail.round;
                            const heatNumber = detail.heatNumber;
                            
                            // Find and update the heat
                            if (bracket.classes[className] && bracket.classes[className].rounds) {
                                for (const round of bracket.classes[className].rounds) {
                                    if (round.roundNumber === roundNumber && round.heats) {
                                        for (const heat of round.heats) {
                                            if (heat.heatNumber === heatNumber) {
                                                const newRaceNumber = nextRaceNumber + fixedCount;
                                                window.debugLogger.debug('Race', ` Fixed duplicate: ${className} round ${roundNumber} heat ${heatNumber}: race #${heat.raceNumber} → #${newRaceNumber}`);
                                                heat.raceNumber = newRaceNumber;
                                                fixedCount++;
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                });
            }

            // Save the fixed bracket
            if (fixedCount > 0) {
                this.dataManager.saveRaceBracket(eventId, bracket);
                window.debugLogger.debug('Race', ` Auto-fixed ${fixedCount} race numbering issues`);
            }

            return { fixed: fixedCount, issues: validation.issues };
        } catch (error) {
            console.error('Error auto-fixing race numbering:', error);
            return { fixed: 0, issues: [], error: error.message };
        }
    }

    /**
     * Record race result
     */
    async recordRaceResult(eventId, className, heatId, results) {
        window.debugLogger.debug('Race', 'Recording race result (OPTIMIZED):', { eventId, className, heatId, results });

        try {
            const bracket = await this.getBracket(eventId);
            window.debugLogger.debug('Race', 'recordRaceResult: bracket object keys:', Object.keys(bracket || {}));
            window.debugLogger.debug('Race', 'recordRaceResult: bracket.classes:', bracket?.classes);
            window.debugLogger.debug('Race', 'recordRaceResult: className:', className);
            if (!bracket || !bracket.classes || !bracket.classes[className]) {
                console.error('recordRaceResult: bracket or bracket.classes missing', { bracket: !!bracket, classes: !!bracket?.classes, className });
                throw new Error('Bracket not found');
            }

            const classBracket = bracket.classes[className];
            
            // Find the heat
            let targetHeat = null;
            let targetRound = null;
            
            for (const round of classBracket.rounds) {
                for (const heat of round.heats) {
                    if (heat.id === heatId) {
                        targetHeat = heat;
                        targetRound = round;
                        break;
                    }
                }
                if (targetHeat) break;
            }

            if (!targetHeat) {
                throw new Error('Heat not found');
            }

            // ========================================
            // PHASE 1: CRITICAL PATH (Immediate, <100ms)
            // ========================================
            window.debugLogger.debug('Race', 'Phase 1: Critical path - marking heat complete');

            // Update heat with results
            targetHeat.results = results;
            targetHeat.status = 'completed';
            targetHeat.endTime = new Date().toISOString();

            // Update participant records immediately (wins/losses/status)
            this.updateParticipantRecords(classBracket, targetHeat, results, eventId);
            
            // Mark that this heat's results have been processed
            targetHeat.resultsProcessed = true;

            // Record result in pairing engine (synchronous, fast)
            this.pairingEngine.recordRaceResult(targetHeat, results, className, eventId);

            // 🏁 CHECK CLASS/EVENT COMPLETION (synchronous logic)
            window.debugLogger.debug('Race', ` Checking if class ${className} is complete after heat ${heatId} completion`);

            // If this heat belongs to the final round, force-complete the class and set winner from this heat
            const isFinalRoundHeat = (targetRound?.roundNumber === 'final') || (targetRound?.type === 'final') || (targetHeat?.bracketType === 'championship');
            if (isFinalRoundHeat) {
                window.debugLogger.debug('Race', ` Final heat detected for class ${className}. Forcing class completion and setting winner from final results.`);
                // Mark round and class complete regardless of remaining active participants
                targetRound.isComplete = true;
                classBracket.isComplete = true;

                // Determine winner from final heat results (position === 1)
                const winnerResult = Array.isArray(results) ? results.find(r => r.position === 1) : null;
                if (winnerResult) {
                    const winnerParticipant = classBracket.participants.find(p => p.id === winnerResult.participantId) || null;
                    classBracket.winner = winnerParticipant;
                    window.debugLogger.debug('Race', ` Final winner set: ${winnerParticipant?.name || winnerResult.participantId}`);
                } else {
                    console.warn('⚠️ No position=1 found in final results; winner not set');
                }
            } else {
                // Non-final logic: class completes when only one active remains
                const isClassComplete = this.isClassComplete(classBracket, eventId);
                if (isClassComplete && !classBracket.isComplete) {
                    window.debugLogger.debug('Race', ` Class ${className} is now complete! Marking as finished.`);
                    classBracket.isComplete = true;
                    
                    // Find and set the winner if not already set
                    if (!classBracket.winner) {
                        const activeParticipants = this.getActiveParticipants(classBracket);
                        
                        // For double elimination, determine winner based on performance
                        if (classBracket.eliminationType === 'double' || classBracket.eliminationType === 'double_random') {
                            // Sort by wins (descending), then by losses (ascending)
                            const sortedParticipants = activeParticipants.sort((a, b) => {
                                if (a.wins !== b.wins) {
                                    return b.wins - a.wins;
                                }
                                return a.losses - b.losses;
                            });
                            
                            classBracket.winner = sortedParticipants[0] || null;
                            window.debugLogger.debug('Race', ` Double elimination winner determined by performance: ${classBracket.winner?.name || 'None'} (${classBracket.winner?.wins || 0}W-${classBracket.winner?.losses || 0}L)`);
                            
                            // Log other participants for debugging
                            if (sortedParticipants.length > 1) {
                                window.debugLogger.debug('Race', ` Other active participants:`);
                                sortedParticipants.slice(1).forEach((p, index) => {
                                    window.debugLogger.debug('Race', `   ${index + 2}. ${p.name} (${p.wins || 0}W-${p.losses || 0}L)`);
                                });
                            }
                        } else {
                            // For single elimination, first active participant is winner
                            classBracket.winner = activeParticipants[0] || null;
                            window.debugLogger.debug('Race', ` Single elimination winner set: ${classBracket.winner?.name || 'None'}`);
                        }
                    }
                }
            }

            // Check if round is complete (skip if already marked complete by final logic)
            if (!targetRound.isComplete && this.isRoundComplete(classBracket, targetRound.roundNumber)) {
                targetRound.isComplete = true;
            }

            // Save the updated bracket ONCE (removed duplicate save at end)
            await this.dataManager.saveRaceBracket(eventId, bracket);
            window.debugLogger.debug('Race', 'Bracket saved (Phase 1 complete)');

            // ========================================
            // PHASE 2: DEFERRED BACKGROUND (Non-blocking)
            // ========================================
            window.debugLogger.debug('Race', 'Phase 2: Scheduling background tasks (deferred)');

            // Return immediately - let background tasks complete asynchronously
            const deferredPromise = this.executeDeferredRaceCompletion(
                eventId, 
                className, 
                heatId, 
                results
            );

            window.debugLogger.debug('Race', ' Race result recorded successfully (Phase 1), background processing scheduled');
            return true;

        } catch (error) {
            console.error('Error recording race result:', error);
            throw error;
        }
    }

    /**
     * Execute deferred race completion tasks in background
     * @param {String} eventId - Event ID
     * @param {String} className - Class name
     * @param {String} heatId - Heat ID
     * @param {Array} results - Race results
     */
    async executeDeferredRaceCompletion(eventId, className, heatId, results) {
        // Use background task coordinator if available
        if (window.backgroundTasks) {
            return window.backgroundTasks.scheduleTask(async () => {
                await this.processDeferredTasks(eventId, className, heatId, results);
            }, {
                priority: 'high',
                category: 'race-completion',
                metadata: { eventId, className, heatId }
            });
        } else {
            // Fallback to setTimeout
            return new Promise((resolve) => {
                setTimeout(async () => {
                    try {
                        await this.processDeferredTasks(eventId, className, heatId, results);
                        resolve();
                    } catch (error) {
                        console.error('❌ Deferred race completion failed:', error);
                        // Don't reject - background task failure shouldn't break the race
                        resolve();
                    }
                }, 0);
            });
        }
    }

    /**
     * Process deferred tasks (statistics, event status check, events)
     * @param {String} eventId - Event ID
     * @param {String} className - Class name
     * @param {String} heatId - Heat ID
     * @param {Array} results - Race results
     */
    async processDeferredTasks(eventId, className, heatId, results) {
        window.debugLogger.debug('Race', 'Processing deferred tasks in background...');
        const bracket = this.getBracket(eventId);
        const classBracket = bracket?.classes?.[className];

        try {
            // 📊 DEFERRED: Statistics update (already deferred in StatisticsManager)
            if (this.dataManager.statisticsManager) {
                window.debugLogger.debug('Race', 'Triggering deferred statistics update for heat:', heatId);
                try {
                    // This is already non-blocking thanks to StatisticsManager optimization
                    await this.dataManager.statisticsManager.updateParticipantStatistics(results, eventId, heatId);
                } catch (statsError) {
                    console.error('📊 Statistics update failed:', statsError);
                    // Don't fail the race recording if statistics update fails
                }
            } else {
                console.warn('⚠️ StatisticsManager not available, skipping automatic statistics update');
            }

            // 🎯 DEFERRED: Event status check
            window.debugLogger.debug('Race', 'Checking event completion status (deferred)');
            await this.checkAndUpdateEventStatus(eventId);

            // 🏁 AUTO TIE-BREAKER: If this class just completed, auto-check for ties
            if (classBracket?.isComplete) {
                await this.autoCheckTieBreakers(eventId, className);
            }

            // 📡 DEFERRED: Broadcast race result recorded event
            if (this.dataManager.eventBus) {
                this.dataManager.eventBus.emit('race-result-recorded', {
                    eventId,
                    className,
                    heatId,
                    results,
                    participantIds: results.map(r => r.participantId),
                    timestamp: new Date().toISOString()
                });
            }

            window.debugLogger.debug('Race', ' Deferred race completion tasks finished');

        } catch (error) {
            console.error('❌ Error in deferred race completion:', error);
            // Log but don't throw - background task failure shouldn't break the app
        }
    }

    /**
     * Update participant records based on race results
     */
    updateParticipantRecords(classBracket, heat, results, eventId = null) {
        window.debugLogger.debug('Race', `Updating participant records for heat ${heat.id}`);
        window.debugLogger.debug('Race', 'Results:', results);
        
        const eliminationType = (classBracket.eliminationType || 'single').toLowerCase();
        const event = eventId ? this.dataManager.getEvent(eventId) : null;
        const customOutcomesRaw = Array.isArray(event?.customOutcomes) ? event.customOutcomes : [];
        const numberOfLanes = classBracket.numberOfLanes || (heat?.numberOfLanes) || customOutcomesRaw.length || 0;
        const customLossLimit = Number.isFinite(event?.customLossLimit) ? Number(event.customLossLimit) : 2;
        const customUseBrackets = event?.customUseBrackets === true;
        
        // Build per-position outcome map for custom
        const customOutcomes = (() => {
            if (eliminationType !== 'custom') return [];
            const normalized = [];
            for (let i = 0; i < numberOfLanes; i++) {
                const v = String(customOutcomesRaw[i] || '').toLowerCase();
                if (v === 'win' || v === 'lose' || v === 'eliminated') normalized[i] = v;
                else normalized[i] = i === 0 ? 'win' : 'eliminated'; // sensible default
            }
            return normalized;
        })();
        
        results.forEach(result => {
            const participant = classBracket.participants.find(p => p.id === result.participantId);
            if (!participant) {
                console.warn(`Participant ${result.participantId} not found in bracket`);
                return;
            }
            
            const position = result.position;
            const isWinner = position === 1;
            const isFalseStart = result.falseStart || position === 'FS';
            const isDisqualified = result.disqualified || position === 'DSQ';
            
            window.debugLogger.debug('Race', `Participant ${participant.name}: position ${position}, currentBracket: ${participant.currentBracket}, falseStart: ${isFalseStart}, disqualified: ${isDisqualified}`);
            
            // Handle disqualifications first (always eliminate)
            if (isDisqualified) {
                participant.status = 'eliminated';
                participant.currentBracket = null;
                window.debugLogger.debug('Race', `${participant.name} disqualified - eliminated from tournament`);
            } else if (eliminationType === 'custom') {
                // Custom elimination: use position-based outcomes
                const mapped = typeof position === 'number' ? customOutcomes[position - 1] : null;
                const action = mapped || (isWinner ? 'win' : 'eliminated');
                if (action === 'win') {
                    participant.wins++;
                    participant.status = 'active';
                    window.debugLogger.debug('Race', `${participant.name} outcome=win (position ${position})`);
                } else if (action === 'lose') {
                    participant.losses++;
                    participant.status = (participant.losses >= customLossLimit) ? 'eliminated' : 'active';
                    if (participant.status === 'eliminated') participant.currentBracket = null;
                    window.debugLogger.debug('Race', `${participant.name} outcome=lose -> ${participant.status} (${participant.losses}/${customLossLimit} losses, position ${position})`);
                } else if (action === 'eliminated') {
                    participant.losses++;
                    participant.status = 'eliminated';
                    participant.currentBracket = null;
                    window.debugLogger.debug('Race', `${participant.name} outcome=eliminated (position ${position})`);
                }
            } else if (isWinner) {
                // Standard winner handling for non-custom types
                participant.wins++;
                window.debugLogger.debug('Race', `${participant.name} wins (position 1)`);
                // Winner stays in their current bracket and advances
            } else {
                // Loser handling for non-custom types
                const logLose = () => window.debugLogger.debug('Race', `${participant.name} loses (position ${position})`);
                
                if (eliminationType === 'single') {
                    participant.losses++;
                    logLose();
                    // Single elimination: any loss eliminates (false start is treated as normal loss)
                    participant.status = 'eliminated';
                    participant.currentBracket = null;
                    window.debugLogger.debug('Race', `${participant.name} eliminated (single elimination)`);
                } else if (eliminationType === 'double') {
                    participant.losses++;
                    logLose();
                    // Double elimination logic - false starts are treated as regular losses
                    // FIX: Ensure participant has a currentBracket set (default to upper if not set)
                    if (!participant.currentBracket) {
                        console.warn(`Participant ${participant.name} has no currentBracket set, defaulting to upper`);
                        participant.currentBracket = 'upper';
                    }
                    
                    if (participant.currentBracket === 'upper') {
                        if (participant.losses === 1) {
                            // First loss in upper bracket: move to lower bracket
                            participant.currentBracket = 'lower';
                            participant.status = 'active'; // Still active, just in lower bracket
                            window.debugLogger.debug('Race', `${participant.name} moved to lower bracket (first loss)`);
                        } else {
                            // Multiple losses shouldn't happen in proper double elim, but handle it
                            participant.status = 'eliminated';
                            participant.currentBracket = null;
                            window.debugLogger.debug('Race', `${participant.name} eliminated (multiple losses in upper)`);
                        }
                    } else if (participant.currentBracket === 'lower') {
                        // Any loss in lower bracket eliminates (false start treated as normal loss)
                        participant.status = 'eliminated';
                        participant.currentBracket = null;
                        window.debugLogger.debug('Race', `${participant.name} eliminated (loss in lower bracket)`);
                    } else {
                        // FIX: Handle case where currentBracket is not properly set
                        console.warn(`Participant ${participant.name} has invalid currentBracket: ${participant.currentBracket}, treating as upper bracket`);
                        if (participant.losses === 1) {
                            participant.currentBracket = 'lower';
                            participant.status = 'active';
                            window.debugLogger.debug('Race', `${participant.name} moved to lower bracket (first loss - fixed bracket state)`);
                        } else {
                            participant.status = 'eliminated';
                            participant.currentBracket = null;
                            window.debugLogger.debug('Race', `${participant.name} eliminated (multiple losses - fixed bracket state)`);
                        }
                    }
                } else if (eliminationType === 'double_random') {
                    participant.losses++;
                    logLose();
                    // No brackets: eliminate on second loss
                    participant.status = participant.losses >= 2 ? 'eliminated' : 'active';
                    if (participant.status === 'eliminated') participant.currentBracket = null;
                    window.debugLogger.debug('Race', `${participant.name} ${participant.status === 'eliminated' ? 'eliminated (2 losses)' : 'continues with 1 loss'}`);
                }
            }
        });
        
        // Show current bracket state
        window.debugLogger.debug('Race', 'Updated participant states:');
        classBracket.participants.forEach(p => {
            window.debugLogger.debug('Race', `${p.name}: ${p.status}, bracket: ${p.currentBracket}, wins: ${p.wins}, losses: ${p.losses}`);
        });
    }

    /**
     * Process round results to update bracket state
     */
    processRoundResults(classBracket, roundNumber) {
        window.debugLogger.debug('Race', `Processing round ${roundNumber} results for double elimination`);
        const round = classBracket.rounds.find(r => r.roundNumber === roundNumber);
        if (!round) {
            window.debugLogger.debug('Race', `Round ${roundNumber} not found`);
            return;
        }

        window.debugLogger.debug('Race', `Found round ${roundNumber} with ${round.heats.length} heats`);
        
        // Update participant statuses based on results (only if not already processed)
        round.heats.forEach(heat => {
            if (heat.results && heat.results.length > 0) {
                if (heat.resultsProcessed) {
                    window.debugLogger.debug('Race', `Heat ${heat.id} results already processed, skipping`);
                } else {
                    window.debugLogger.debug('Race', `Processing heat ${heat.id} results`);
                    this.updateParticipantRecords(classBracket, heat, heat.results, eventId);
                    heat.resultsProcessed = true;
                }
            } else {
                window.debugLogger.debug('Race', `Heat ${heat.id} has no results yet`);
            }
        });
    }

    /**
     * OPTIMIZED: Process round results with deferred statistics updates
     */
    async processRoundResultsOptimized(classBracket, roundNumber, eventId) {
        window.debugLogger.debug('Race', ` OPTIMIZED: Processing round ${roundNumber} results for class ${classBracket.eliminationType || 'single'} elimination`);
        const round = classBracket.rounds.find(r => r.roundNumber === roundNumber);
        if (!round) {
            window.debugLogger.debug('Race', `Round ${roundNumber} not found`);
            return;
        }

        const heatsToProcess = round.heats.filter(heat => 
            heat.results && heat.results.length > 0 && !heat.resultsProcessed
        );

        if (heatsToProcess.length === 0) {
            window.debugLogger.debug('Race', `No new heat results to process in round ${roundNumber}`);
            return;
        }

        window.debugLogger.debug('Race', `Processing ${heatsToProcess.length} heats with new results (${round.heats.length} total heats)`);
        
        // Batch process heat results to reduce individual operations
        const statisticsUpdatesDeferred = [];
        
        heatsToProcess.forEach(heat => {
            window.debugLogger.debug('Race', `Processing heat ${heat.id} results`);
            this.updateParticipantRecords(classBracket, heat, heat.results, eventId);
            heat.resultsProcessed = true;
            
            // Collect statistics updates for batch processing later
            // Instead of updating statistics for each heat individually, we defer them
            statisticsUpdatesDeferred.push({
                heatId: heat.id,
                results: heat.results,
                eventId: eventId
            });
        });

        // OPTIMIZATION: Defer statistics updates to avoid blocking race generation
        // Statistics will be updated in background after round generation is complete
        if (statisticsUpdatesDeferred.length > 0 && this.dataManager.statisticsManager) {
            window.debugLogger.debug('Race', ` Deferring statistics updates for ${statisticsUpdatesDeferred.length} heats - will process after round generation`);
            
            // Store deferred updates for later processing
            if (!this.deferredStatisticsUpdates) {
                this.deferredStatisticsUpdates = [];
            }
            this.deferredStatisticsUpdates.push(...statisticsUpdatesDeferred.map(update => ({
                ...update,
                timestamp: Date.now(),
                processingDeferred: true
            })));
        }
        
        window.debugLogger.debug('Race', ` Processed ${heatsToProcess.length} heat results (statistics updates deferred)`);
    }

    /**
     * OPTIMIZED: Generate round with performance improvements  
     */
    async generateRoundOptimized(eventId, className, roundNumber) {
        window.debugLogger.debug('Race', ` OPTIMIZED: Generating round ${roundNumber} for class ${className}`);
        
        // Use the existing generateRound method but with optimized pairing engine
        const result = await this.generateRound(eventId, className, roundNumber);
        
        // Process any deferred statistics updates after round generation
        await this.processDeferredStatisticsUpdates();
        
        return result;
    }

    /**
     * Calculate planned total races for an event using participant counts per class
     * and event configuration. This is an estimate used for progress visualization.
     */
    calculatePlannedTotalRaces(eventId, participantsByClass, lanesPerRace, eliminationType) {
        const m = parseInt(lanesPerRace || 4, 10);
        const type = String(eliminationType || 'single').toLowerCase();
        if (!participantsByClass || typeof participantsByClass !== 'object') return 0;

        let total = 0;
        for (const [className, participants] of Object.entries(participantsByClass)) {
            const n = Array.isArray(participants) ? participants.length : 0;
            if (n <= 1) continue;
            if (type === 'single') {
                total += this.expectedRacesSingleElimination(n, m);
            } else {
                total += this.expectedRacesDoubleElimination(n, m);
            }
        }
        // Add 0 or 1 championship race edge-case if double and multiple classes end with separate finalists
        // We intentionally do not over-correct for DSQs; runtime may vary slightly.
        return total;
    }

    /**
     * Estimated races for single-elimination with up to m lanes per race
     */
    expectedRacesSingleElimination(n, m) {
        if (!Number.isFinite(n) || !Number.isFinite(m) || n <= 1 || m <= 0) return 0;
        let remaining = n;
        let total = 0;
        while (remaining > 1) {
            const winnersThisRound = Math.ceil(remaining / m);
            total += winnersThisRound;
            remaining = winnersThisRound;
        }
        return total;
    }

    /**
     * Estimated races for double-elimination using ceiling-based progression across brackets
     */
    expectedRacesDoubleElimination(n, m) {
        if (!Number.isFinite(n) || !Number.isFinite(m) || n <= 1 || m <= 0) return 0;

        let undefeated = n; // Winners bracket pool
        let losers = 0;     // Losers bracket pool
        let total = 0;

        // Initial winners round
        const firstW = Math.ceil(undefeated / m);
        total += firstW;
        let nextU = firstW;
        let nextL = undefeated - firstW; // non-winners drop to losers
        undefeated = nextU;
        losers = nextL;

        // Iterate until one in each bracket remains
        let safety = 0;
        while (!(undefeated === 1 && losers === 1)) {
            const rw = Math.ceil(undefeated / m);
            total += rw;
            const dropToLosers = undefeated - rw;
            const rl = Math.ceil((losers + dropToLosers) / m);
            total += rl;
            undefeated = rw;
            losers = rl;

            if (++safety > 10000) break; // safety guard for unexpected inputs
        }

        // Final championship
        total += 1;
        return total;
    }

    /**
     * Process deferred statistics updates in batch
     */
    async processDeferredStatisticsUpdates() {
        if (!this.deferredStatisticsUpdates || this.deferredStatisticsUpdates.length === 0) {
            return;
        }

        const updates = [...this.deferredStatisticsUpdates];
        this.deferredStatisticsUpdates = []; // Clear the queue

        window.debugLogger.debug('Race', ` Processing ${updates.length} deferred statistics updates in background...`);

        // Process statistics updates asynchronously without blocking
        setTimeout(async () => {
            try {
                // Group updates by event for more efficient processing
                const updatesByEvent = new Map();
                updates.forEach(update => {
                    if (!updatesByEvent.has(update.eventId)) {
                        updatesByEvent.set(update.eventId, []);
                    }
                    updatesByEvent.get(update.eventId).push(update);
                });

                // Process each event's updates
                for (const [eventId, eventUpdates] of updatesByEvent) {
                    window.debugLogger.debug('Race', ` Processing ${eventUpdates.length} statistics updates for event ${eventId}`);
                    
                    // Process updates in smaller batches to avoid overwhelming the statistics manager
                    const batchSize = 5;
                    for (let i = 0; i < eventUpdates.length; i += batchSize) {
                        const batch = eventUpdates.slice(i, i + batchSize);
                        
                        // Process batch
                        await Promise.all(batch.map(async (update) => {
                            try {
                                await this.dataManager.statisticsManager.updateParticipantStatistics(
                                    update.results, 
                                    update.eventId, 
                                    update.heatId
                                );
                            } catch (error) {
                                console.error(`📊 Failed to update statistics for heat ${update.heatId}:`, error);
                            }
                        }));
                        
                        // Small delay between batches to prevent overwhelming the system
                        if (i + batchSize < eventUpdates.length) {
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }
                    }
                }

                window.debugLogger.debug('Race', ` Completed processing ${updates.length} deferred statistics updates`);

            } catch (error) {
                console.error('📊 Error processing deferred statistics updates:', error);
            }
        }, 500); // Small delay to let UI updates complete first
    }

    /**
     * Get active participants for a round
     */
    getActiveParticipants(classBracket, roundNumber = null, bracketType = null) {
        const type = (classBracket.eliminationType || 'single').toLowerCase();
        let activeParticipants;

        if (type === 'single' || type === 'double_random' || type === 'custom') {
            activeParticipants = classBracket.participants.filter(p => p.status === 'active');
        } else {
            // Double elimination: filter by bracket type if specified
            activeParticipants = classBracket.participants.filter(p => p.status === 'active');

            if (bracketType === 'upper') {
                activeParticipants = activeParticipants.filter(p => p.currentBracket === 'upper');
            } else if (bracketType === 'lower') {
                activeParticipants = activeParticipants.filter(p => p.currentBracket === 'lower');
            } else {
                // Return all active participants from both brackets
                activeParticipants = activeParticipants.filter(p =>
                    p.currentBracket === 'upper' || p.currentBracket === 'lower'
                );
            }
        }

        // 🔧 FIX: Deduplicate participants by ID to prevent duplicate assignments
        const seenIds = new Set();
        const deduplicated = activeParticipants.filter(p => {
            if (seenIds.has(p.id)) {
                console.warn(`⚠️ Duplicate participant detected and removed: ${p.name} (${p.id})`);
                return false;
            }
            seenIds.add(p.id);
            return true;
        });

        if (deduplicated.length !== activeParticipants.length) {
            window.debugLogger.debug('Race', ` Deduplicated ${activeParticipants.length - deduplicated.length} duplicate participants`);
        }

        // 🔧 ADDITIONAL FIX: Ensure participants have proper bracket assignments
        // This prevents participants from being lost when transitioning between rounds
        const fixedParticipants = deduplicated.map(p => {
            // Ensure all active participants have a currentBracket set
            if (!p.currentBracket && type === 'double') {
                console.warn(`⚠️ Participant ${p.name} missing currentBracket, defaulting to upper`);
                p.currentBracket = 'upper';
            }
            return p;
        });

        return fixedParticipants;
    }

    /**
     * Check if a round is complete
     */
    isRoundComplete(classBracket, roundNumber) {
        const round = classBracket.rounds.find(r => r.roundNumber === roundNumber);
        if (!round) return false;

        return round.heats.every(heat => heat.status === 'completed' && heat.results);
    }

    /**
     * Get the current race number for an event (for debugging)
     */
    getCurrentRaceNumber(eventId) {
        return this.pairingEngine.getNextRaceNumber(eventId);
    }

    /**
     * Validate bracket integrity to ensure no participant appears in multiple heats within the same round
     */
    validateBracketIntegrity(bracket) {
        const errors = [];

        // Check for duplicates within each round (participants should only appear once per round)
        for (const [className, classBracket] of Object.entries(bracket.classes || {})) {
            for (const round of classBracket.rounds || []) {
                const roundParticipantLocations = new Map(); // participantId -> [{heatId, lane}]

                // Collect participant locations within this round
                for (const heat of round.heats || []) {
                    for (const lane of heat.lanes || []) {
                        if (lane.participant?.id) {
                            const participantId = lane.participant.id;
                            if (!roundParticipantLocations.has(participantId)) {
                                roundParticipantLocations.set(participantId, []);
                            }
                            roundParticipantLocations.get(participantId).push({
                                heatId: heat.id,
                                lane: lane.lane,
                                participant: lane.participant
                            });
                        }
                    }
                }

                // Check for duplicates within this round
                for (const [participantId, locations] of roundParticipantLocations) {
                    if (locations.length > 1) {
                        const participant = locations[0].participant;
                        const locationStrings = locations.map(loc =>
                            `Heat ${loc.heatId} (Lane ${loc.lane})`
                        ).join(', ');
                        errors.push(`Participant ${participant.name} (${participantId}) appears multiple times in Round ${round.roundNumber}: ${locationStrings}`);
                    }
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Repair bracket by removing duplicate participant assignments within each round
     * Keeps the first occurrence of each participant per round and removes subsequent duplicates
     */
    repairBracketDuplicates(bracket) {
        window.debugLogger.debug('Race', ' Starting bracket repair for duplicates within rounds...');
        let repairsMade = 0;

        // Repair duplicates within each round (not across the entire bracket)
        for (const [className, classBracket] of Object.entries(bracket.classes || {})) {
            for (const round of classBracket.rounds || []) {
                const roundParticipantLocations = new Map(); // participantId -> first lane location in this round

                // First pass: identify first occurrence of each participant in this round
                for (const heat of round.heats || []) {
                    for (const lane of heat.lanes || []) {
                        if (lane.participant?.id) {
                            const participantId = lane.participant.id;
                            if (!roundParticipantLocations.has(participantId)) {
                                roundParticipantLocations.set(participantId, {
                                    heatId: heat.id,
                                    laneIndex: heat.lanes.indexOf(lane),
                                    lane
                                });
                            }
                        }
                    }
                }

                // Second pass: remove duplicates within this round
                for (const heat of round.heats || []) {
                    for (let laneIndex = heat.lanes.length - 1; laneIndex >= 0; laneIndex--) {
                        const lane = heat.lanes[laneIndex];
                        if (lane.participant?.id) {
                            const participantId = lane.participant.id;
                            const firstLocation = roundParticipantLocations.get(participantId);

                            // If this is not the first occurrence in this round, remove it
                            if (firstLocation &&
                                !(firstLocation.heatId === heat.id &&
                                  firstLocation.laneIndex === laneIndex)) {
                                window.debugLogger.debug('Race', ` Removing duplicate participant ${lane.participant.name} (${participantId}) from Round ${round.roundNumber}, heat ${heat.id}, lane ${lane.lane}`);
                                heat.lanes[laneIndex].participant = null;
                                repairsMade++;
                            }
                        }
                    }
                }
            }
        }

        window.debugLogger.debug('Race', ` Bracket repair completed: ${repairsMade} duplicates removed within rounds`);
        return repairsMade;
    }

    /**
     * Comprehensive bracket repair - removes ALL duplicate participants across entire bracket
     * This is more aggressive than repairBracketDuplicates and should be used when there are
     * participants appearing in multiple rounds or classes.
     */
    repairBracketDuplicatesComprehensive(bracket) {
        window.debugLogger.debug('Race', ' Starting comprehensive bracket repair for ALL duplicates across entire bracket...');
        window.debugLogger.debug('Race', ' Bracket structure:', {
            classes: Object.keys(bracket.classes || {}),
            classCount: Object.keys(bracket.classes || {}).length
        });

        let totalRepairsMade = 0;

        // First, try the existing round-based repair
        const roundRepairs = this.repairBracketDuplicates(bracket);
        totalRepairsMade += roundRepairs;
        window.debugLogger.debug('Race', ` Round-based repair completed: ${roundRepairs} repairs`);

        // Now handle cross-round/cross-class duplicates (the serious ones)
        const globalParticipantLocations = new Map(); // participantId -> first location found

        // First pass: find first occurrence of each participant across ENTIRE bracket
        for (const [className, classBracket] of Object.entries(bracket.classes || {})) {
            for (const round of classBracket.rounds || []) {
                for (const heat of round.heats || []) {
                    for (let laneIndex = 0; laneIndex < (heat.lanes || []).length; laneIndex++) {
                        const lane = heat.lanes[laneIndex];
                        if (lane.participant?.id) {
                            const participantId = lane.participant.id;
                            if (!globalParticipantLocations.has(participantId)) {
                                globalParticipantLocations.set(participantId, {
                                    className,
                                    roundNumber: round.roundNumber,
                                    heatId: heat.id,
                                    laneIndex,
                                    lane
                                });
                            }
                        }
                    }
                }
            }
        }

        // Second pass: remove ALL subsequent occurrences across ENTIRE bracket
        window.debugLogger.debug('Race', ` Starting global duplicate removal phase. Found ${globalParticipantLocations.size} unique participants.`);
        let globalRepairs = 0;

        for (const [className, classBracket] of Object.entries(bracket.classes || {})) {
            for (const round of classBracket.rounds || []) {
                for (const heat of round.heats || []) {
                    for (let laneIndex = heat.lanes.length - 1; laneIndex >= 0; laneIndex--) {
                        const lane = heat.lanes[laneIndex];
                        if (lane.participant?.id) {
                            const participantId = lane.participant.id;
                            const firstLocation = globalParticipantLocations.get(participantId);

                            // If this is not the first occurrence anywhere in the bracket, remove it
                            if (firstLocation &&
                                !(firstLocation.className === className &&
                                  firstLocation.roundNumber === round.roundNumber &&
                                  firstLocation.heatId === heat.id &&
                                  firstLocation.laneIndex === laneIndex)) {

                                window.debugLogger.debug('Race', ` Removing cross-bracket duplicate participant ${lane.participant.name} (${participantId}) from Class ${className}, Round ${round.roundNumber}, Heat ${heat.id}, Lane ${lane.lane} (keeping first occurrence in Class ${firstLocation.className}, Round ${firstLocation.roundNumber}, Heat ${firstLocation.heatId})`);
                                heat.lanes[laneIndex].participant = null;
                                totalRepairsMade++;
                                globalRepairs++;
                            }
                        }
                    }
                }
            }
        }

        window.debugLogger.debug('Race', ` Global duplicate removal completed: ${globalRepairs} cross-bracket duplicates removed`);

        window.debugLogger.debug('Race', ` Comprehensive bracket repair completed: ${totalRepairsMade} total duplicates removed (${roundRepairs} within rounds, ${totalRepairsMade - roundRepairs} cross-bracket)`);
        return totalRepairsMade;
    }

    /**
     * Get ordered class names for bracket initialization based on event class order
     */
    getOrderedClassNamesForBracket(participantsByClass, event) {
        const availableClasses = Object.keys(participantsByClass);
        
        window.debugLogger.debug('Race', ' ================= CLASS ORDER DEBUG =================');
        window.debugLogger.debug('Race', ' getOrderedClassNamesForBracket called with event:', event.name || event.id);
        window.debugLogger.debug('Race', ' Available classes from participants:', availableClasses);
        window.debugLogger.debug('Race', ' Event classOrder array:', event.classOrder);
        window.debugLogger.debug('Race', ' Event classSettings count:', event.classSettings?.length || 0);
        
        if (event.classSettings) {
            window.debugLogger.debug('Race', ' Event classSettings details:');
            event.classSettings.forEach((cs, index) => {
                window.debugLogger.debug('Race', `   ${index + 1}. ID: ${cs.classId} | Name: ${cs.className}`);
            });
        }
        
        // If no class order is specified, return alphabetical order
        if (!event.classOrder || event.classOrder.length === 0) {
            window.debugLogger.debug('Race', ' ❌ No class order specified, using alphabetical order');
            const alphabeticalOrder = availableClasses.sort();
            window.debugLogger.debug('Race', ' Alphabetical order result:', alphabeticalOrder);
            window.debugLogger.debug('Race', ' ================= END CLASS ORDER DEBUG =================');
            return alphabeticalOrder;
        }
        
        window.debugLogger.debug('Race', ' ✅ Using event class order with', event.classOrder.length, 'entries');
        
        // Create ordered list based on classOrder
        const orderedClasses = [];
        const usedClasses = new Set();
        
        // First, add classes in the specified order
        event.classOrder.forEach((classId, index) => {
            window.debugLogger.debug('Race', ` Processing classOrder[${index}]: ${classId}`);
            
            // Use ClassResolver for consistent class name lookup
            const className = window.ClassResolver 
                ? window.ClassResolver.getClassName(event, classId, this.dataManager)
                : null;
            
            if (!className || className === 'Unknown') {
                window.debugLogger.debug('Race', ` ❌ Warning: Class ID ${classId} not found`);
                return;
            }
            
            window.debugLogger.debug('Race', ` Found class: ${className} (ID: ${classId})`);
            
            if (!availableClasses.includes(className)) {
                window.debugLogger.debug('Race', ` ❌ Warning: Class ${className} not available in participants`);
                return;
            }
            
            orderedClasses.push(className);
            usedClasses.add(className);
            window.debugLogger.debug('Race', ` ✅ Added class ${className} at position ${orderedClasses.length}`);
        });
        
        // Add any remaining classes not in the order (alphabetically)
        const remainingClasses = availableClasses.filter(className => !usedClasses.has(className));
        if (remainingClasses.length > 0) {
            window.debugLogger.debug('Race', ' Adding remaining classes:', remainingClasses);
            remainingClasses.sort().forEach(className => {
                orderedClasses.push(className);
                window.debugLogger.debug('Race', ` Added remaining class ${className} at end`);
            });
        }
        
        window.debugLogger.debug('Race', ' 🎯 FINAL CLASS ORDER FOR BRACKET INITIALIZATION:', orderedClasses);
        window.debugLogger.debug('Race', ' ================= END CLASS ORDER DEBUG =================');
        return orderedClasses;
    }

    /**
     * Get event participants
     */
    async getEventParticipants(eventId) {
        window.debugLogger.debug('Race', 'getEventParticipants for event:', eventId);
        
        const event = this.dataManager.getEvent(eventId);
        if (!event) {
            window.debugLogger.debug('Race', 'Event not found');
            return [];
        }

        window.debugLogger.debug('Race', 'Event data:', {
            id: event.id,
            name: event.name,
            participantsType: typeof event.participants,
            participantsIsArray: Array.isArray(event.participants),
            participantsRaw: event.participants,
            participantCount: event.participants ? event.participants.length : 0
        });

        if (!event.participants || !Array.isArray(event.participants)) {
            window.debugLogger.debug('Race', 'No participants array in event');
            window.debugLogger.debug('Race', 'Participants value:', event.participants);
            return [];
        }

        window.debugLogger.debug('Race', ` Event has ${event.participants.length} participant IDs:`, event.participants.slice(0, 3));

        // Resolve IDs to full participant objects (matching manual registration workflow)
        const allParticipants = this.dataManager.getParticipantsArray();
        window.debugLogger.debug('Race', ` DEBUG - Total participants in system: ${allParticipants.length}`);
        window.debugLogger.debug('Race', ` DEBUG - Sample participant IDs:`, allParticipants.slice(0, 3).map(p => p.id));
        
        const eventParticipants = allParticipants.filter(p => 
            event.participants.includes(p.id)
        );

        window.debugLogger.debug('Race', ` Resolved to ${eventParticipants.length} participant objects`);
        if (eventParticipants.length === 0 && event.participants.length > 0) {
            console.error('❌ CRITICAL: Event has participant IDs but none could be resolved!');
            console.error('❌ Event participant IDs:', event.participants.slice(0, 5));
            console.error('❌ All participant IDs:', allParticipants.slice(0, 5).map(p => p.id));
        }
        return eventParticipants;
    }

    /**
     * Sync event participants array with actual participant records
     */
    syncEventParticipants(eventId, participantIds) {
        try {
            const event = this.dataManager.getEvent(eventId);
            if (!event) {
                console.error('Cannot sync - event not found:', eventId);
                return false;
            }
            
            event.participants = participantIds;
            event.currentParticipants = participantIds.length;
            
            const success = this.dataManager.updateEvent(eventId, event);
            if (success) {
                window.debugLogger.debug('Race', ` Event participant sync successful for event ${eventId}:`, participantIds);
            } else {
                console.error('Failed to save event participant sync');
            }
            return success;
        } catch (error) {
            console.error('Error syncing event participants:', error);
            return false;
        }
    }

    /**
     * Group participants by class
     */
    groupParticipantsByClass(participants, event) {
        window.debugLogger.debug('Race', 'Grouping participants by class:', {
            participantCount: participants.length,
            eventSeriesId: event.seriesId,
            participants: participants.map(p => ({ name: p.name, selectedClasses: p.selectedClasses, sledClasses: p.sledClasses }))
        });

        const classByParticipant = new Map();
        const classes = new Map();

        // Use ClassResolver for consistent class resolution
        const availableClassesForDistribution = window.ClassResolver 
            ? window.ClassResolver.getEnabledEventClasses(event, this.dataManager)
            : [];
        
        window.debugLogger.debug('Race', 'Class resolution:', availableClassesForDistribution);
        window.debugLogger.debug('Race', 'Available classes for distribution:', availableClassesForDistribution);
        
        // Process each participant
        participants.forEach((participant, index) => {
            window.debugLogger.debug('Race', ` DEBUG - Processing participant: ${participant.name}, ID: ${participant.id}`);
            
            // Handle multiple formats:
            // 1. eventClasses[eventId] - event-specific class assignments (stress test & manual registration)
            // 2. sledClasses - legacy format
            // 3. selectedClasses - current format
            let participantClasses = [];
            const normalizedEventId = event && event.id != null ? String(event.id) : '';
            if (participant.eventClasses && typeof participant.eventClasses === 'object') {
                const directClasses = participant.eventClasses[normalizedEventId];
                const matchedEventKey = Object.keys(participant.eventClasses).find(
                    key => String(key) === normalizedEventId
                );
                const normalizedClasses = matchedEventKey ? participant.eventClasses[matchedEventKey] : null;
                participantClasses = Array.isArray(directClasses)
                    ? directClasses
                    : (Array.isArray(normalizedClasses) ? normalizedClasses : []);
            }

            if (participantClasses.length > 0) {
                window.debugLogger.debug('Race', ` DEBUG - Using eventClasses for event ${event.id}:`, participantClasses);
            } else {
                participantClasses = participant.sledClasses || participant.selectedClasses || [];
                window.debugLogger.debug('Race', ` DEBUG - Using sledClasses/selectedClasses:`, participantClasses);
            }
            
            let participantAssigned = false;
            
            if (participantClasses.length > 0) {
                participantClasses.forEach(classId => {
                // Find class details - handle both ID and name-based lookups
                let classDetail = availableClassesForDistribution.find(c => c.id === classId);
                if (!classDetail) {
                    // Fallback: look up by name if not found by ID
                    classDetail = availableClassesForDistribution.find(c => c.name === classId);
                }
                if (!classDetail) {
                    // Additional fallback: case-insensitive name matching
                    classDetail = availableClassesForDistribution.find(c => 
                        c.name.toLowerCase() === classId.toLowerCase()
                    );
                }
                const className = classDetail ? classDetail.name : classId;
                const actualClassId = classDetail ? classDetail.id : classId;
                window.debugLogger.debug('Race', `Processing class: ${classId} -> ${className} (ID: ${actualClassId})`);
                
                let matchedClassSetting = null;
                let finalClassName = className;
                let finalClassId = actualClassId;
                
                if (availableClassesForDistribution.length > 0) {
                    // Look up by actual class ID and class name for compatibility
                    matchedClassSetting = availableClassesForDistribution.find(cs => 
                        cs.classId === actualClassId || 
                        cs.classId === classId || 
                        cs.classId === className ||
                        cs.className === className ||
                        cs.className === classId
                    );
                    
                    if (matchedClassSetting) {
                        finalClassName = matchedClassSetting.className;
                        finalClassId = matchedClassSetting.classId;
                    } else {
                        // 🔧 ADDITIONAL FALLBACK: Try to find by name in availableClassesForDistribution
                        const foundClass = availableClassesForDistribution.find(c => 
                            c.name === classId || 
                            c.name === className ||
                            (c.name && c.name.toLowerCase() === classId.toLowerCase())
                        );
                        if (foundClass) {
                            matchedClassSetting = {
                                classId: foundClass.id,
                                className: foundClass.name,
                                enabled: true
                            };
                            finalClassName = foundClass.name;
                            finalClassId = foundClass.id;
                        }
                    }
                } else {
                    // No class settings means all classes are allowed
                    matchedClassSetting = { className: finalClassName, classId: finalClassId };
                }

                if (matchedClassSetting) {
                    if (!classes.has(finalClassName)) {
                        classes.set(finalClassName, []);
                    }

                    const classParticipants = classes.get(finalClassName);
                    // 🔧 FIX: Check for duplicates within the same class
                    const existingParticipant = classParticipants.find(p => p.id === participant.id);
                    if (!existingParticipant) {
                        classParticipants.push({
                            ...participant,
                            classId: finalClassId,
                            className: finalClassName
                        });
                        window.debugLogger.debug('Race', ` Added participant ${participant.name} to class ${finalClassName}`);
                    } else {
                        console.warn(`⚠️ Participant ${participant.name} already in class ${finalClassName}, skipping duplicate`);
                    }

                    participantAssigned = true;
                } else {
                    console.warn(`⚠️ Could not match class "${classId}" for participant ${participant.name}`);
                    window.debugLogger.debug('Race', ` DEBUG - Available classes for distribution:`, availableClassesForDistribution.map(c => ({ id: c.id, name: c.name, classId: c.classId, className: c.className })));
                }
                });
            }
            
            // 🔧 IMPROVED FALLBACK: Distribute participants evenly across all available event classes
            if (!participantAssigned) {
                if (availableClassesForDistribution.length > 0) {
                    // Distribute participants evenly across all available classes using round-robin
                    const classIndex = index % availableClassesForDistribution.length;
                    const assignedClass = availableClassesForDistribution[classIndex];
                    
                    window.debugLogger.debug('Race', ` DISTRIBUTE: Auto-assigning participant ${participant.name} to class "${assignedClass.className}" (${classIndex + 1} of ${availableClassesForDistribution.length})`);

                    if (!classes.has(assignedClass.className)) {
                        classes.set(assignedClass.className, []);
                    }

                    const classParticipants = classes.get(assignedClass.className);
                    // 🔧 FIX: Check for duplicates in fallback distribution
                    const existingParticipant = classParticipants.find(p => p.id === participant.id);
                    if (!existingParticipant) {
                        classParticipants.push({
                            ...participant,
                            classId: assignedClass.classId,
                            className: assignedClass.className
                        });
                        window.debugLogger.debug('Race', ` DISTRIBUTE: Added participant ${participant.name} to class ${assignedClass.className}`);
                    } else {
                        console.warn(`⚠️ DISTRIBUTE: Participant ${participant.name} already in class ${assignedClass.className}, skipping duplicate`);
                    }
                } else {
                    console.warn(`⚠️ Cannot assign participant ${participant.name} - no enabled classes available in event`);
                }
            }
        });

        const result = Object.fromEntries(classes);
        window.debugLogger.debug('Race', 'Final grouped participants by class:', {
            classCount: Object.keys(result).length,
            classes: Object.entries(result).map(([className, participants]) => ({
                className,
                participantCount: participants.length,
                participants: participants.map(p => p.name)
            }))
        });
        
        // 🔧 FALLBACK: If no participants were assigned to any classes, create a default class
        if (Object.keys(result).length === 0 && participants.length > 0) {
            console.warn('⚠️ No participants assigned to classes, creating default class');
            const defaultClassName = 'Default';
            result[defaultClassName] = participants.map(p => ({
                ...p,
                classId: 'default',
                className: defaultClassName
            }));
            window.debugLogger.debug('Race', ` FALLBACK: Created default class with ${participants.length} participants`);
        }
        
        return result;
    }

    /**
     * Get bracket for an event
     */
    getCachedBracket(eventId) {
        return this.eventBrackets.get(eventId) || null;
    }

    async getBracket(eventId) {
        let bracket = this.eventBrackets.get(eventId);
        let source = 'cache';
        window.debugLogger.debug('Race', 'getBracket: checking cache for eventId:', eventId, 'found:', !!bracket);

        if (!bracket) {
            // Try to load from storage
            source = 'storage';
            bracket = await this.dataManager.getRaceBracket(eventId);
            if (bracket) {
                window.debugLogger.debug('Race', 'getBracket: loaded bracket from storage, has classes:', !!bracket.classes);
                this.eventBrackets.set(eventId, bracket);

                // Ensure data manager cache is also updated
                if (bracket.id) {
                    this.dataManager.data.raceBrackets[bracket.id] = bracket;
                    this.dataManager.data.raceBracketsByEvent[eventId] = bracket;
                }

                window.debugLogger.debug('Race', ` Loaded saved bracket for event ${eventId}`);

                // Restore pairing engine history from saved bracket
                this.restorePairingEngineHistory(bracket, eventId);

                // 🔧 FIX: Ensure class brackets have correct eliminationType from event
                this.fixBracketEliminationTypes(eventId, bracket);
            }
        }

        return bracket;
    }

    /**
     * Fix elimination types in loaded brackets to ensure they match the event settings
     */
    fixBracketEliminationTypes(eventId, bracket) {
        try {
            const event = this.dataManager.getEvent(eventId);
            if (!event || !bracket.classes) {
                console.warn(`Cannot fix elimination types - missing event or bracket data`);
                return;
            }

            window.debugLogger.debug('Race', ` Fixing elimination types for loaded bracket of event ${eventId}`);
            window.debugLogger.debug('Race', `  Event eliminationType: ${event.eliminationType}`);

            let fixedCount = 0;
            Object.keys(bracket.classes).forEach(className => {
                const classBracket = bracket.classes[className];
                if (classBracket.eliminationType !== event.eliminationType) {
                    window.debugLogger.debug('Race', `Fixing ${className}: ${classBracket.eliminationType} -> ${event.eliminationType}`);
                    classBracket.eliminationType = event.eliminationType;
                    fixedCount++;
                }
            });

            if (fixedCount > 0) {
                window.debugLogger.debug('Race', ` Fixed elimination types for ${fixedCount} classes`);
                // Save the corrected bracket back to storage
                this.dataManager.saveRaceBracket(eventId, bracket);
            } else {
                window.debugLogger.debug('Race', ` All class elimination types are correct`);
            }
        } catch (error) {
            console.error(`❌ Error fixing bracket elimination types:`, error);
        }
    }

    /**
     * Restore pairing engine history from saved bracket data
     */
    restorePairingEngineHistory(bracket, eventId) {
        if (!bracket || !bracket.classes) {
            return;
        }

        window.debugLogger.debug('Race', 'Restoring pairing engine history from saved bracket...');

        // Get all participants for initialization
        const allParticipants = [];
        Object.values(bracket.classes).forEach(classBracket => {
            if (classBracket.participants) {
                allParticipants.push(...classBracket.participants);
            }
        });

        // Initialize pairing engine with participants
        if (allParticipants.length > 0) {
            this.pairingEngine.initializeEvent(bracket.eventId, allParticipants, bracket.numberOfLanes);
            
            // Method 1: Restore from saved pairing history (if available)
            if (bracket.pairingHistory) {
                window.debugLogger.debug('Race', 'Restoring from saved pairing history...');
                this.pairingEngine.importHistories(bracket.pairingHistory);
                window.debugLogger.debug('Race', ' Pairing history restored from saved data');
                return;
            }
            
            // Method 2: Fallback - Replay all completed heats to rebuild history
            window.debugLogger.debug('Race', 'Rebuilding pairing history from completed heats...');
            let restoredHeats = 0;
            Object.entries(bracket.classes).forEach(([className, classBracket]) => {
                classBracket.rounds.forEach(round => {
                    if (round.heats) {
                        round.heats.forEach(heat => {
                            if (heat.status === 'completed' && heat.results && heat.results.length > 0) {
                                this.pairingEngine.recordRaceResult(heat, heat.results, className, eventId);
                                restoredHeats++;
                            }
                        });
                    }
                });
            });
            
            window.debugLogger.debug('Race', ` Pairing history rebuilt from ${restoredHeats} completed heats`);
        }
    }

    /**
     * Get current round races for an event
     */
    async getCurrentRoundRaces(eventId, className = null) {
        const bracket = await this.getBracket(eventId);
        if (!bracket) return [];

        const races = [];
        
        const classesToProcess = className 
            ? [className] 
            : Object.keys(bracket.classes);

        classesToProcess.forEach(cls => {
            const classBracket = bracket.classes[cls];
            if (!classBracket) return;

            const currentRound = classBracket.rounds.find(r => 
                r.roundNumber === classBracket.currentRound
            );
            
            if (currentRound) {
                currentRound.heats.forEach(heat => {
                    races.push({
                        ...heat,
                        className: cls,
                        eventId
                    });
                });
            }
        });

        return races;
    }

    /**
     * Get all completed races for an event
     */
    async getCompletedRaces(eventId) {
        const bracket = await this.getBracket(eventId);
        if (!bracket) return [];

        const completedRaces = [];
        
        Object.keys(bracket.classes).forEach(className => {
            const classBracket = bracket.classes[className];
            
            classBracket.rounds.forEach(round => {
                round.heats.forEach(heat => {
                    if (heat.status === 'completed') {
                        completedRaces.push({
                            ...heat,
                            className,
                            eventId,
                            roundNumber: round.roundNumber
                        });
                    }
                });
            });
        });

        return completedRaces;
    }

    /**
     * Check if next round can be generated
     */
    canGenerateNextRound(eventId, className, bracketOverride = null) {
        const cachedBracket = this.eventBrackets.get(eventId);
        const dataManagerBracket = this.dataManager?.data?.raceBracketsByEvent?.[eventId];
        const bracket = bracketOverride || cachedBracket || dataManagerBracket;

        if (!bracket || !bracket.classes || !bracket.classes[className]) {
            return false;
        }

        const classBracket = bracket.classes[className];
        if (!classBracket || !Array.isArray(classBracket.rounds) || classBracket.rounds.length === 0) {
            return false;
        }

        const currentRound = classBracket.currentRound;
        if (!currentRound) {
            return false;
        }

        // Check if current round is complete
        if (!this.isRoundComplete(classBracket, currentRound)) {
            return false;
        }

        // Check if tournament is already complete
        if (classBracket.isComplete) {
            return false;
        }

        const rounds = Array.isArray(classBracket.rounds) ? classBracket.rounds : [];

        // Check if we already have a completed final round
        const hasFinalRound = rounds.some(round => 
            round?.roundNumber === 'final' && round?.isComplete
        );
        
        if (hasFinalRound) {
            return false;
        }

        const participants = Array.isArray(classBracket.participants) ? classBracket.participants : [];
        if (participants.length === 0) {
            return false;
        }

        // Check if there are active participants for next round
        const activeParticipants = this.getActiveParticipants(classBracket);
        return activeParticipants.length > 1;
    }

    /**
     * Get tournament statistics
     */
    async getTournamentStats(eventId) {
        const bracket = await this.getBracket(eventId);
        if (!bracket) return null;

        const stats = {
            totalClasses: Object.keys(bracket.classes).length,
            totalParticipants: 0,
            completedRaces: 0,
            pendingRaces: 0,
            completedClasses: 0,
            activeClasses: 0
        };

        Object.values(bracket.classes).forEach(classBracket => {
            stats.totalParticipants += classBracket.participants.length;
            
            if (classBracket.isComplete) {
                stats.completedClasses++;
            } else {
                stats.activeClasses++;
            }

            classBracket.rounds.forEach(round => {
                round.heats.forEach(heat => {
                    if (heat.status === 'completed') {
                        stats.completedRaces++;
                    } else {
                        stats.pendingRaces++;
                    }
                });
            });
        });

        return stats;
    }

    /**
     * Export bracket data
     */
    exportBracket(eventId) {
        const bracket = this.getBracket(eventId);
        if (!bracket) return null;

        return {
            ...bracket,
            pairingHistory: this.pairingEngine.exportHistories()
        };
    }

    /**
     * Import bracket data
     */
    async importBracket(eventId, bracketData) {
        if (bracketData.pairingHistory) {
            this.pairingEngine.importHistories(bracketData.pairingHistory);
        }

        // Update local cache first
        this.eventBrackets.set(eventId, bracketData);

        // Save to server and update data manager cache
        const savedBracket = await this.dataManager.saveRaceBracket(eventId, bracketData);

        // Ensure the data manager cache is updated with the saved bracket
        if (savedBracket && savedBracket.id) {
            this.dataManager.data.raceBrackets[savedBracket.id] = savedBracket;
            this.dataManager.data.raceBracketsByEvent[eventId] = savedBracket;
        }
    }

    /**
     * Reset bracket for an event
     */
    resetBracket(eventId) {
        this.eventBrackets.delete(eventId);
        this.pairingEngine.clearHistories();
        // TODO: Clear from persistent storage
    }

    /**
     * Get heat by ID
     */
    async getHeat(eventId, heatId) {
        const bracket = await this.getBracket(eventId);
        if (!bracket || !bracket.classes || typeof bracket.classes !== 'object') return null;

        window.debugLogger.debug('Race', 'getHeat: Looking for heat', heatId, 'in bracket classes:', Object.keys(bracket.classes));
        for (const className of Object.keys(bracket.classes)) {
            window.debugLogger.debug('Race', 'getHeat: Checking class', className);
            const classBracket = bracket.classes[className];
            for (const round of classBracket.rounds) {
                for (const heat of round.heats) {
                    if (heat.id === heatId) {
                        const heatWithClassName = {
                            ...heat,
                            className: className,
                            eventId: eventId
                        };
                        window.debugLogger.debug('Race', 'getHeat: Found heat in class', className, '- returning with className:', heatWithClassName.className);
                        return heatWithClassName;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Update heat status
     */
    async updateHeatStatus(eventId, heatId, status) {
        const heat = this.getHeat(eventId, heatId);
        if (!heat) return false;

        const bracket = this.getBracket(eventId);
        const classBracket = bracket.classes[heat.className];
        
        // Find and update the heat
        for (const round of classBracket.rounds) {
            for (const h of round.heats) {
                if (h.id === heatId) {
                    h.status = status;
                    if (status === 'active') {
                        h.startTime = new Date().toISOString();
                    }
                    break;
                }
            }
        }

        await this.dataManager.saveRaceBracket(eventId, bracket);
        return true;
    }

    /**
     * Calculate final tournament results with proper tie handling
     */
    calculateFinalResults(eventId) {
        const bracket = this.getBracket(eventId);
        if (!bracket) return null;

        const finalResults = {};

        // Calculate results for each class
        for (const [className, classBracket] of Object.entries(bracket.classes)) {
            const classResults = this.calculateClassFinalResults(classBracket, className, eventId);
            if (classResults.length > 0) {
                finalResults[className] = classResults;
            }
        }

        return finalResults;
    }

    /**
     * Calculate final results for a specific class with proper tournament ranking
     */
    calculateClassFinalResults(classBracket, className, eventId = null) {
        const participants = classBracket.participants;
        const rounds = classBracket.rounds;

        window.debugLogger.debug('Race', ` Calculating final results for class: ${className}`);
        window.debugLogger.debug('Race', `   Participants: ${participants.length}`);
        window.debugLogger.debug('Race', `   Completed rounds: ${rounds.filter(r => r.isComplete).length}`);

        // Create detailed elimination tracking
        const participantResults = new Map();
        
        // Initialize all participants with their current status
        participants.forEach(participant => {
            participantResults.set(participant.id, {
                participant,
                currentStatus: participant.status,
                eliminatedInRound: null,
                latestRacePosition: null,
                latestRaceRound: null,
                allRacePositions: [], // Track all positions for average calculation
                totalWins: 0, // Keep as stat, not for ranking
                totalRaces: 0,
                roundsCompleted: 0,
                isDisqualified: false,
                hasFalseStart: false,
                disqualifiedRound: null,
                falseStartRounds: [],
                notes: [],
                tournamentPath: [] // Track their journey through the tournament
            });
        });

        // Process each round chronologically to track race performance
        const completedRounds = rounds
            .filter(round => round.isComplete)
            .sort((a, b) => {
                // Sort by round number, handling 'final' round
                if (a.roundNumber === 'final') return 1;
                if (b.roundNumber === 'final') return -1;
                return a.roundNumber - b.roundNumber;
            });

        window.debugLogger.debug('Race', `   Processing ${completedRounds.length} completed rounds...`);

        completedRounds.forEach(round => {
            window.debugLogger.debug('Race', `   Processing round ${round.roundNumber}...`);
            
            // Track which participants raced in this round
            const participantsInRound = new Set();
            
            round.heats.forEach(heat => {
                if (!heat.results || heat.results.length === 0) return;

                window.debugLogger.debug('Race', `     Heat ${heat.id}: ${heat.results.length} results`);

                // Process each participant's result in this heat
                heat.results.forEach(result => {
                    const participantData = participantResults.get(result.participantId);
                    if (!participantData) return;

                    participantsInRound.add(result.participantId);

                    // Check for special results
                    const isFalseStart = result.falseStart || result.position === 'FS';
                    const isDisqualified = result.disqualified || result.position === 'DSQ';

                    // Update their tournament path
                    participantData.tournamentPath.push({
                        round: round.roundNumber,
                        position: result.position,
                        heatId: heat.id,
                        bracketType: round.bracketType || 'single',
                        falseStart: isFalseStart,
                        disqualified: isDisqualified
                    });

                    participantData.totalRaces++;
                    participantData.latestRaceRound = round.roundNumber;
                    
                    // Use actualPosition for ranking if available (for FS), otherwise use position
                    const rankingPosition = result.actualPosition || result.position;
                    
                    // Store latest race position (numeric only)
                    if (typeof rankingPosition === 'number') {
                        participantData.latestRacePosition = rankingPosition;
                        participantData.allRacePositions.push(rankingPosition);
                    }
                    
                    // Track special statuses
                    if (isFalseStart) {
                        participantData.hasFalseStart = true;
                        participantData.falseStartRounds.push(round.roundNumber);
                    }
                    if (isDisqualified) {
                        participantData.isDisqualified = true;
                        participantData.disqualifiedRound = round.roundNumber;
                    }
                    
                    // Count wins for statistical purposes only
                    if (rankingPosition === 1) {
                        participantData.totalWins++;
                    }

                    // Set elimination data to the LAST race they participated in
                    participantData.eliminatedInRound = round.roundNumber;
                    
                    window.debugLogger.debug('Race', `     ${participantResults.get(result.participantId).participant.name}: Round ${round.roundNumber}, Position ${result.position} (actualPos: ${rankingPosition}) Wins:${participantData.totalWins} FS:${isFalseStart} DSQ:${isDisqualified}`);
                });
            });
            
            // Count completed rounds for each participant who raced
            participantsInRound.forEach(participantId => {
                const participantData = participantResults.get(participantId);
                if (participantData) {
                    participantData.roundsCompleted++;
                }
            });
        });

        // Calculate average finish position for each participant
        participantResults.forEach((data, participantId) => {
            if (data.allRacePositions.length > 0) {
                const sum = data.allRacePositions.reduce((acc, pos) => acc + pos, 0);
                data.averageFinish = sum / data.allRacePositions.length;
            } else {
                data.averageFinish = 999; // No races completed
            }
            
            // Build notes array for display
            if (data.isDisqualified) {
                data.notes.push(`DSQ in R${data.disqualifiedRound}`);
            }
            if (data.hasFalseStart) {
                data.falseStartRounds.forEach(round => {
                    data.notes.push(`FS in R${round}`);
                });
            }
            
            window.debugLogger.debug('Race', `   ${data.participant.name}: Avg Finish ${data.averageFinish.toFixed(2)}, Latest R${data.latestRaceRound} P${data.latestRacePosition}`);
        });

        // Convert to array for sorting
        const results = Array.from(participantResults.values());

        // Check if there's a final race to handle top positions
        const hasFinalRace = completedRounds.some(round => round.roundNumber === 'final');
        const finalRaceResults = new Map(); // participantId -> final race result
        
        if (hasFinalRace) {
            window.debugLogger.debug('Race', `Final race detected - will use final race results for top positions`);
            completedRounds.forEach(round => {
                if (round.roundNumber === 'final') {
                    round.heats.forEach(heat => {
                        if (heat.results && heat.results.length > 0) {
                            heat.results.forEach(result => {
                                finalRaceResults.set(result.participantId, result);
                                window.debugLogger.debug('Race', `     Final race participant: ${participantResults.get(result.participantId).participant.name} - Position ${result.position}`);
                            });
                        }
                    });
                }
            });
        }

        // Sort by NEW tournament ranking rules
        // Priority: 1) Elimination Round, 2) Latest Race Position, 3) Average Finish, 4) Tie
        results.sort((a, b) => {
            window.debugLogger.debug('Race', `Comparing ${a.participant.name} vs ${b.participant.name}:`);
            
            // NEW RANKING LOGIC - Simplified and Fair
            
            // Rule 0: DSQ participants always go to bottom (no ordering among them)
            const aIsDisqualified = a.isDisqualified;
            const bIsDisqualified = b.isDisqualified;
            
            if (aIsDisqualified && !bIsDisqualified) {
                window.debugLogger.debug('Race', `  ${a.participant.name} is disqualified, ranks lower`);
                return 1; // a goes to bottom
            }
            if (!aIsDisqualified && bIsDisqualified) {
                window.debugLogger.debug('Race', `  ${b.participant.name} is disqualified, ranks lower`);
                return -1; // b goes to bottom
            }
            if (aIsDisqualified && bIsDisqualified) {
                window.debugLogger.debug('Race', `  Both disqualified, no ordering`);
                return 0; // All DSQ are equal
            }
            
            // Handle final race participants - final race results are decisive
            const aInFinalRace = finalRaceResults.has(a.participant.id);
            const bInFinalRace = finalRaceResults.has(b.participant.id);
            
            if (aInFinalRace && bInFinalRace) {
                // Both in final race - use final race positions directly
                const aFinalResult = finalRaceResults.get(a.participant.id);
                const bFinalResult = finalRaceResults.get(b.participant.id);
                const aActualPos = aFinalResult?.actualPosition || aFinalResult?.position;
                const bActualPos = bFinalResult?.actualPosition || bFinalResult?.position;
                window.debugLogger.debug('Race', `  Final race: ${a.participant.name} P${aActualPos} vs ${b.participant.name} P${bActualPos}`);
                return aActualPos - bActualPos;
            }
            
            // If only one in final race, they rank higher
            if (aInFinalRace && !bInFinalRace) {
                window.debugLogger.debug('Race', `  ${a.participant.name} reached final race, ranks higher`);
                return -1;
            }
            if (!aInFinalRace && bInFinalRace) {
                window.debugLogger.debug('Race', `  ${b.participant.name} reached final race, ranks higher`);
                return 1;
            }
            
            // Rule 1: Elimination Round Priority (later elimination = better rank)
            const aRound = a.eliminatedInRound === 'final' ? 999 : (a.eliminatedInRound || 0);
            const bRound = b.eliminatedInRound === 'final' ? 999 : (b.eliminatedInRound || 0);
            
            if (aRound !== bRound) {
                window.debugLogger.debug('Race', `  Different elimination rounds: ${a.participant.name} R${a.eliminatedInRound} vs ${b.participant.name} R${b.eliminatedInRound}`);
                return bRound - aRound; // Later elimination = better (higher rank)
            }
            
            // Rule 2: Within same round, compare latest race position (lower is better)
            if (a.latestRacePosition !== b.latestRacePosition) {
                // Handle null positions (shouldn't happen but safety check)
                if (a.latestRacePosition === null) return 1;
                if (b.latestRacePosition === null) return -1;
                
                window.debugLogger.debug('Race', `  Same round, different latest position: ${a.participant.name} P${a.latestRacePosition} vs ${b.participant.name} P${b.latestRacePosition}`);
                return a.latestRacePosition - b.latestRacePosition; // Lower position = better
            }
            
            // Rule 3: Average Finish Tiebreaker (lower average is better)
            if (a.averageFinish !== b.averageFinish) {
                window.debugLogger.debug('Race', `  Same latest position, different avg: ${a.participant.name} ${a.averageFinish.toFixed(2)} vs ${b.participant.name} ${b.averageFinish.toFixed(2)}`);
                return a.averageFinish - b.averageFinish; // Lower average = better
            }
            
            // Rule 4: True Tie - identical performance
            window.debugLogger.debug('Race', `  Identical performance - TRUE TIE`);
            return 0;
        });

        // Assign final rankings with proper tie handling
        let currentRank = 1;
        let dsqCount = 0;
        
        for (let i = 0; i < results.length; i++) {
            const current = results[i];
            const isDisqualified = current.isDisqualified;
            
            if (isDisqualified) {
                // DSQ participants get "DSQ" as their rank (no ordering)
                current.finalRank = 'DSQ';
                dsqCount++;
                window.debugLogger.debug('Race', `   Rank DSQ: ${current.participant.name} - DISQUALIFIED in R${current.disqualifiedRound}`);
            } else {
                // All non-DSQ participants get regular numbered ranks
                if (i > 0) {
                    const previous = results[i - 1];
                    const previousWasDisqualified = previous.isDisqualified;
                    
                    // Only check ties with other non-DSQ participants
                    if (!previousWasDisqualified) {
                        const shouldTie = this.shouldTieRankings(current, previous);
                        if (!shouldTie) {
                            currentRank = (i - dsqCount) + 1; // Adjust rank by subtracting DSQ count
                        }
                    } else {
                        // Previous was DSQ, start/continue regular ranking
                        currentRank = (i - dsqCount) + 1;
                    }
                }
                
                current.finalRank = currentRank;
                
                // Build status message showing why they have this rank
                const inFinal = finalRaceResults.has(current.participant.id);
                let statusMessage = '';
                
                if (inFinal) {
                    const finalPos = current.latestRacePosition;
                    if (finalPos === 1) {
                        statusMessage = `Champion`;
                    } else {
                        statusMessage = `Finalist P${finalPos}`;
                    }
                } else {
                    statusMessage = `Eliminated R${current.eliminatedInRound}`;
                }
                
                statusMessage += ` • Latest: P${current.latestRacePosition} • Avg: ${current.averageFinish.toFixed(1)}`;
                
                window.debugLogger.debug('Race', `   Rank ${currentRank}: ${current.participant.name} - ${statusMessage} (${current.totalWins}W, ${current.roundsCompleted}R)`);
            }
        }

        window.debugLogger.debug('Race', ` Final results calculated for ${className}: ${results.length} participants ranked`);
        return results;
    }

    /**
     * Determine if two participants should share the same ranking
     * Based on NEW ranking criteria (elimination round, latest position, average finish)
     */
    shouldTieRankings(current, previous) {
        window.debugLogger.debug('Race', `Checking tie between ${current.participant.name} and ${previous.participant.name}:`);
        
        // Rule 1: Must have same elimination round
        if (current.eliminatedInRound !== previous.eliminatedInRound) {
            window.debugLogger.debug('Race', `  Different elimination rounds: No tie`);
            return false;
        }
        
        // Rule 2: Must have same latest race position
        if (current.latestRacePosition !== previous.latestRacePosition) {
            window.debugLogger.debug('Race', `  Different latest race positions: No tie`);
            return false;
        }
        
        // Rule 3: Must have same average finish (within small tolerance for floating point)
        const avgDiff = Math.abs(current.averageFinish - previous.averageFinish);
        if (avgDiff > 0.001) {
            window.debugLogger.debug('Race', `  Different average finishes: No tie`);
            return false;
        }
        
        // If all criteria match, they should tie
        window.debugLogger.debug('Race', `  Identical performance: TRUE TIE`);
        return true;
    }

    /**
     * Check for ties at specified ranks and optionally generate tie-breaker races
     * 
     * @param {string} eventId - The event ID
     * @param {string} className - The class name
     * @param {Object} options - Options for tie-breaker handling
     * @param {number} options.tieBreakerRank - Maximum rank to run tie-breakers for (e.g., 3 = top 3)
     * @param {boolean} options.generateRaces - If true, generate tie-breaker races
     * @returns {Object} Tie detection/generation results
     */
    async checkAndHandleTies(eventId, className, options = {}) {
        const { tieBreakerRank = 3, generateRaces = false } = options;
        
        window.debugLogger.debug('Race', ` Checking for ties in ${className} (up to rank ${tieBreakerRank})`);
        
        try {
            const bracket = await this.getBracket(eventId);
            if (!bracket || !bracket.classes[className]) {
                return { success: false, error: 'Bracket or class not found' };
            }
            
            const classBracket = bracket.classes[className];
            const event = this.dataManager.getEvent(eventId);
            
            // Calculate current final results
            const results = this.calculateClassFinalResults(classBracket, className, eventId);
            
            // Find ties within the tie-breaker rank threshold
            const ties = [];
            let currentRank = 0;
            let i = 0;
            
            while (i < results.length && currentRank <= tieBreakerRank) {
                const current = results[i];
                currentRank = current.rank;
                
                if (currentRank > tieBreakerRank) break;
                
                // Find all participants sharing this rank
                const tiedGroup = [current];
                let j = i + 1;
                
                while (j < results.length && results[j].rank === currentRank) {
                    tiedGroup.push(results[j]);
                    j++;
                }
                
                if (tiedGroup.length > 1) {
                    ties.push({
                        rank: currentRank,
                        participants: tiedGroup.map(r => ({
                            id: r.participant.id,
                            name: r.participant.name,
                            wins: r.totalWins,
                            latestPosition: r.latestRacePosition,
                            averageFinish: r.averageFinish
                        }))
                    });
                }
                
                i = j;
            }
            
            window.debugLogger.debug('Race', `   Found ${ties.length} tie group(s) within rank ${tieBreakerRank}`);
            
            if (ties.length === 0) {
                return {
                    success: true,
                    hasTies: false,
                    ties: [],
                    message: 'No ties found within specified rank threshold'
                };
            }
            
            // If we should generate tie-breaker races
            if (generateRaces) {
                const generatedRaces = [];
                
                for (const tie of ties) {
                    const race = await this.generateTieBreakerRace(eventId, className, tie);
                    if (race.success) {
                        generatedRaces.push(race);
                    }
                }
                
                return {
                    success: true,
                    hasTies: true,
                    ties,
                    racesGenerated: generatedRaces.length,
                    races: generatedRaces,
                    message: `Generated ${generatedRaces.length} tie-breaker race(s)`
                };
            }
            
            return {
                success: true,
                hasTies: true,
                ties,
                message: `Found ${ties.length} tie group(s) - call with generateRaces: true to create tie-breaker races`
            };
            
        } catch (error) {
            console.error('❌ Error checking ties:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Generate a tie-breaker race for participants at the same rank
     * 
     * @param {string} eventId - The event ID
     * @param {string} className - The class name
     * @param {Object} tieGroup - Object with rank and participants array
     * @returns {Object} Result of race generation
     */
    async generateTieBreakerRace(eventId, className, tieGroup) {
        window.debugLogger.debug('Race', ` Generating tie-breaker race for rank ${tieGroup.rank}`);
        window.debugLogger.debug('Race', `   Participants: ${tieGroup.participants.map(p => p.name).join(', ')}`);
        
        try {
            const bracket = await this.getBracket(eventId);
            if (!bracket || !bracket.classes[className]) {
                return { success: false, error: 'Bracket or class not found' };
            }
            
            const classBracket = bracket.classes[className];
            const event = this.dataManager.getEvent(eventId);
            const numberOfLanes = classBracket.numberOfLanes || event?.numberOfTracks || 3;
            
            // Get full participant data
            const participants = tieGroup.participants.map(p => {
                const fullParticipant = classBracket.participants.find(bp => bp.id === p.id);
                return fullParticipant || p;
            });
            
            // Ensure race number cursor is set
            await this.ensureEventRaceNumberCursor(eventId);
            
            // Create tie-breaker heat
            const tieBreakerId = `tb_${className}_rank${tieGroup.rank}_${Date.now()}`;
            const raceNumber = this.pairingEngine.getNextRaceNumber(eventId);
            
            const heat = {
                id: tieBreakerId,
                raceNumber,
                heatNumber: 1,
                numberOfLanes,
                type: 'tie_breaker',
                bracketType: 'tie_breaker',
                forRank: tieGroup.rank,
                className,
                lanes: participants.map((p, index) => ({
                    lane: index + 1,
                    participant: {
                        id: p.id,
                        name: p.name,
                        racingNumber: p.racingNumber || '',
                        nickname: p.nickname || ''
                    }
                })),
                results: null,
                resultsProcessed: false,
                status: 'pending',
                startTime: null,
                endTime: null,
                createdAt: new Date().toISOString()
            };
            
            // Create tie-breaker round if it doesn't exist
            let tieBreakerRound = classBracket.rounds.find(r => r.type === 'tie_breaker');
            
            if (!tieBreakerRound) {
                tieBreakerRound = {
                    roundNumber: 'tie_breaker',
                    type: 'tie_breaker',
                    heats: [],
                    isComplete: false,
                    createdAt: new Date().toISOString()
                };
                classBracket.rounds.push(tieBreakerRound);
            }
            
            // Add heat to tie-breaker round
            tieBreakerRound.heats.push(heat);
            
            // Save bracket
            await this.dataManager.saveRaceBracket(eventId, bracket);
            
            window.debugLogger.debug('Race', ` Tie-breaker race created: ${heat.id} (Race #${raceNumber})`);
            
            // Emit event
            if (window.globalEventBus) {
                window.globalEventBus.emit('bracket:updated', {
                    eventId,
                    className,
                    action: 'tie_breaker_created',
                    rank: tieGroup.rank,
                    heatId: heat.id
                });
            }
            
            return {
                success: true,
                heatId: heat.id,
                raceNumber,
                rank: tieGroup.rank,
                participants: tieGroup.participants.map(p => p.name)
            };
            
        } catch (error) {
            console.error('❌ Error generating tie-breaker race:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Auto-check and generate tie-breaker races for a class that just completed.
     * Called automatically after class completion if tie-breaker is enabled.
     * Also handles re-ranking after a tie-breaker heat completes.
     */
    async autoCheckTieBreakers(eventId, className) {
        try {
            const settings = this.getTieBreakerSettings(eventId);
            if (!settings.enabled) return;

            const bracket = await this.getBracket(eventId);
            if (!bracket || !bracket.classes[className]) return;
            const classBracket = bracket.classes[className];

            // Check if there is already a pending tie-breaker round
            const existingTBRound = classBracket.rounds.find(r => r.type === 'tie_breaker');
            if (existingTBRound) {
                const hasPending = existingTBRound.heats.some(h => h.status === 'pending' || h.status === 'active');
                if (hasPending) {
                    window.debugLogger?.debug('Race', `Tie-breaker round already has pending heats for ${className}, skipping auto-generate`);
                    return;
                }
            }

            const result = await this.checkAndHandleTies(eventId, className, {
                tieBreakerRank: settings.rank,
                generateRaces: true
            });

            if (result.success && result.hasTies && result.racesGenerated > 0) {
                window.debugLogger?.debug('Race', `🏁 Auto-generated ${result.racesGenerated} tie-breaker race(s) for ${className}`);
                
                // Un-mark class as complete since there are tie-breakers to resolve
                classBracket.isComplete = false;
                await this.dataManager.saveRaceBracket(eventId, bracket);

                if (window.showToast) {
                    window.showToast(`Tie-breaker race generated for ${className}!`, 'info');
                }
            }
        } catch (error) {
            console.error('Error in autoCheckTieBreakers:', error);
        }
    }

    /**
     * Check if event has tie-breaker settings enabled
     * 
     * @param {string} eventId - The event ID
     * @returns {Object} Tie-breaker settings
     */
    getTieBreakerSettings(eventId) {
        const event = this.dataManager.getEvent(eventId);
        if (!event) {
            return { enabled: false, rank: 0 };
        }
        
        return {
            enabled: event.tieBreakerEnabled === true || event.tieBreakerEnabled === 'true',
            rank: parseInt(event.tieBreakerRank) || 3
        };
    }

    /**
     * Check all classes in an event for ties and optionally generate tie-breaker races
     * 
     * @param {string} eventId - The event ID
     * @param {boolean} generateRaces - If true, generate tie-breaker races where needed
     * @returns {Object} Results for all classes
     */
    async checkAllClassesForTies(eventId, generateRaces = false) {
        window.debugLogger.debug('Race', ` Checking all classes for ties in event ${eventId}`);
        
        const settings = this.getTieBreakerSettings(eventId);
        if (!settings.enabled) {
            return {
                success: true,
                enabled: false,
                message: 'Tie-breaker races are not enabled for this event'
            };
        }
        
        try {
            const bracket = await this.getBracket(eventId);
            if (!bracket || !bracket.classes) {
                return { success: false, error: 'Bracket not found' };
            }
            
            const results = {};
            
            for (const className of Object.keys(bracket.classes)) {
                results[className] = await this.checkAndHandleTies(eventId, className, {
                    tieBreakerRank: settings.rank,
                    generateRaces
                });
            }
            
            // Summary
            const classesWithTies = Object.entries(results)
                .filter(([_, r]) => r.hasTies)
                .map(([name, _]) => name);
            
            return {
                success: true,
                enabled: true,
                tieBreakerRank: settings.rank,
                classesChecked: Object.keys(results).length,
                classesWithTies,
                results,
                message: classesWithTies.length > 0
                    ? `Found ties in ${classesWithTies.length} class(es)`
                    : 'No ties found in any class'
            };
            
        } catch (error) {
            console.error('❌ Error checking all classes for ties:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if a class tournament is complete
     */
    isClassComplete(classBracket, eventId = null) {
        const activeParticipants = classBracket.participants.filter(p => p.status === 'active');
        
        // Standard completion: only one or no participants left
        if (activeParticipants.length <= 1) {
            return true;
        }
        
        // For double elimination tournaments, check if we have a clear winner
        if (classBracket.eliminationType === 'double' || classBracket.eliminationType === 'double_random') {
            // In double elimination, tournament is complete when:
            // 1. We have a final round with results, OR
            // 2. We have exactly 2 active participants and one has 2 losses
            
            // Check if we have a final round with results
            const finalRound = classBracket.rounds.find(r => r.roundNumber === 'final' || r.type === 'final');
            if (finalRound && finalRound.heats && finalRound.heats.length > 0) {
                const finalHeat = finalRound.heats[0];
                if (finalHeat.status === 'completed' && finalHeat.results) {
                    window.debugLogger.debug('Race', ` Double elimination tournament complete - final round has results`);
                    return true;
                }
            }
            
            // Check if we have exactly 2 active participants and one has 2 losses
            if (activeParticipants.length === 2) {
                const participant1 = activeParticipants[0];
                const participant2 = activeParticipants[1];
                
                // If one participant has 2 losses, the other is the winner
                if ((participant1.losses >= 2 && participant2.losses < 2) || 
                    (participant2.losses >= 2 && participant1.losses < 2)) {
                    window.debugLogger.debug('Race', ` Double elimination tournament complete - one participant eliminated (2+ losses)`);
                    return true;
                }
                
                // If both have 1 loss, we need a final round to determine the winner
                if (participant1.losses === 1 && participant2.losses === 1) {
                    window.debugLogger.debug('Race', ` Double elimination tournament needs final round - both participants have 1 loss`);
                    return false;
                }
            }
        }
        
        // For custom elimination with "complete" final type, check additional conditions
        if (eventId && classBracket.eliminationType === 'custom') {
            const event = this.dataManager.getEvent(eventId);
            const customFinalType = event?.customFinalType || 'unique';
            const customLossLimit = Number.isFinite(event?.customLossLimit) ? Number(event.customLossLimit) : 2;
            
            if (customFinalType === 'complete') {
                // Complete elimination: finish when only one undefeated remains
                // or all remaining participants are at the loss limit
                const undefeatedCount = activeParticipants.filter(p => p.losses === 0).length;
                const allAtLossLimit = activeParticipants.every(p => p.losses >= customLossLimit - 1);
                
                if (undefeatedCount <= 1 || allAtLossLimit) {
                    window.debugLogger.debug('Race', `Class complete via complete elimination: undefeated=${undefeatedCount}, allAtLossLimit=${allAtLossLimit}`);
                    return true;
                }
            }
        }
        
        return false;
    }

    /**
     * Check if event is completed and update status if needed
     */
    async checkAndUpdateEventStatus(eventId) {
        try {
            // Check if all classes are complete
            const hasEventDataService = !!window.eventDataService;
            const isCompleted = hasEventDataService
                ? await window.eventDataService.isEventCompleted(eventId)
                : await this.dataManager.isEventCompleted(eventId);
            
            if (isCompleted) {
                window.debugLogger.debug('Race', ` Event ${eventId} is completed - updating status to 'completed'`);
                
                // Update event status to completed
                await this.dataManager.updateEventStatus(eventId, 'completed');
                
                // Emit event for UI updates
                if (this.dataManager.eventBus) {
                    this.dataManager.eventBus.emit('eventCompleted', { 
                        eventId, 
                        status: 'completed',
                        timestamp: new Date().toISOString()
                    });
                }
                
                window.debugLogger.debug('Race', ` Event ${eventId} status updated to 'completed'`);
            } else {
                window.debugLogger.debug('Race', ` Event ${eventId} is still in progress - some classes not complete`);
            }
        } catch (error) {
            console.error('❌ Error checking/updating event status:', error);
        }
    }

    /**
     * Check if a heat can be safely reset without affecting later rounds
     */
    canSafelyResetHeat(eventId, heatId) {
        const heat = this.getHeat(eventId, heatId);
        if (!heat || !RaceManager.isHeatCompleted(heat)) {
            return { canReset: false, reason: 'Heat is not completed and cannot be reset' };
        }

        const bracket = this.getBracket(eventId);
        const classBracket = bracket.classes[heat.className];
        
        // Find the round containing this heat
        const heatRound = classBracket.rounds.find(round => 
            round.heats.some(h => h.id === heatId)
        );
        
        if (!heatRound) {
            return { canReset: false, reason: 'Heat round not found' };
        }

        const heatRoundNumber = heatRound.roundNumber;
        
        // Check if there are any later rounds that depend on this heat's results
        const laterRounds = classBracket.rounds.filter(round => {
            if (typeof round.roundNumber === 'number' && typeof heatRoundNumber === 'number') {
                return round.roundNumber > heatRoundNumber;
            }
            // If heat is in a numbered round and there's a final round, that's a later round
            if (typeof heatRoundNumber === 'number' && round.roundNumber === 'final') {
                return true;
            }
            return false;
        });

        if (laterRounds.length > 0) {
            const laterRoundNumbers = laterRounds.map(r => r.roundNumber).join(', ');
            return { 
                canReset: false, 
                reason: `Cannot reset heat from Round ${heatRoundNumber} because later rounds (${laterRoundNumbers}) have already been generated. Resetting this heat would create invalid tournament progression.`,
                affectedRounds: laterRounds.map(r => r.roundNumber)
            };
        }

        return { canReset: true, reason: 'Heat can be safely reset' };
    }

    /**
     * Reset a completed heat - clear results and reverse all changes
     */
    async resetCompletedHeat(eventId, heatId) {
        window.debugLogger.debug('Race', 'Resetting completed heat:', { eventId, heatId });
        
        try {
            // Check if heat can be safely reset
            const safetyCheck = this.canSafelyResetHeat(eventId, heatId);
            if (!safetyCheck.canReset) {
                throw new Error(safetyCheck.reason);
            }

            const bracket = this.getBracket(eventId);
            if (!bracket) {
                throw new Error('Bracket not found');
            }

            const heat = this.getHeat(eventId, heatId);
            if (!heat) {
                throw new Error('Heat not found');
            }

            if (!RaceManager.isHeatCompleted(heat)) {
                throw new Error('Heat is not completed and cannot be reset');
            }

            const className = heat.className;
            const classBracket = bracket.classes[className];
            
            // Find the heat and round
            let targetHeat = null;
            let targetRound = null;
            
            for (const round of classBracket.rounds) {
                for (const h of round.heats) {
                    if (h.id === heatId) {
                        targetHeat = h;
                        targetRound = round;
                        break;
                    }
                }
                if (targetHeat) break;
            }

            if (!targetHeat) {
                throw new Error('Heat not found in bracket');
            }

            // Store the results before clearing them for reversal
            const originalResults = [...(targetHeat.results || [])];
            
            // Clear heat results and reset status
            targetHeat.results = [];
            targetHeat.status = 'pending';
            targetHeat.endTime = null;
            targetHeat.resultsProcessed = false;

            // Reverse participant record updates
            this.reverseParticipantRecords(classBracket, targetHeat, originalResults);

            // Reverse pairing engine history
            this.pairingEngine.reverseRaceResult(targetHeat, originalResults);

            // 📊 REVERSE STATISTICS UPDATE
            if (this.dataManager.statisticsManager) {
                window.debugLogger.debug('Race', 'Reversing statistics for heat:', heatId);
                try {
                    await this.dataManager.statisticsManager.reverseParticipantStatistics(originalResults, eventId, heatId);
                } catch (statsError) {
                    console.error('📊 Statistics reversal failed:', statsError);
                    // Don't fail the heat reset if statistics reversal fails
                }
            } else {
                console.warn('⚠️ StatisticsManager not available, skipping statistics reversal');
            }

            // Check if round should be marked as incomplete again
            if (targetRound.isComplete) {
                const roundHeats = targetRound.heats.filter(h => h.status === 'completed');
                if (roundHeats.length === 0) {
                    targetRound.isComplete = false;
                }
            }

            // Save updated bracket
            await this.dataManager.saveRaceBracket(eventId, bracket);

            // 📡 Broadcast heat reset event
            if (this.dataManager.eventBus) {
                this.dataManager.eventBus.emit('heat-reset', {
                    eventId,
                    className,
                    heatId,
                    originalResults,
                    participantIds: originalResults.map(r => r.participantId),
                    timestamp: new Date().toISOString()
                });
            }

            window.debugLogger.debug('Race', ' Completed heat reset successfully');
            return true;

        } catch (error) {
            console.error('Error resetting completed heat:', error);
            throw error;
        }
    }

    /**
     * Advanced: Reset an entire round and all subsequent rounds
     * This is a destructive operation that should only be used by administrators
     */
    async resetRoundAndSubsequentRounds(eventId, className, roundNumber) {
        window.debugLogger.debug('Race', `Advanced reset: Resetting round ${roundNumber} and all subsequent rounds for class ${className}`);
        
        try {
            const bracket = this.getBracket(eventId);
            if (!bracket || !bracket.classes[className]) {
                throw new Error('Bracket not found');
            }

            const classBracket = bracket.classes[className];
            
            // Find the target round
            const targetRoundIndex = classBracket.rounds.findIndex(round => round.roundNumber === roundNumber);
            if (targetRoundIndex === -1) {
                throw new Error(`Round ${roundNumber} not found`);
            }

            // Get all rounds to be reset (target round and all subsequent rounds)
            const roundsToReset = classBracket.rounds.slice(targetRoundIndex);
            const roundNumbers = roundsToReset.map(r => r.roundNumber).join(', ');
            
            window.debugLogger.debug('Race', `Will reset rounds: ${roundNumbers}`);

            // Collect all heats to be reset for statistics reversal
            const heatsToReset = [];
            roundsToReset.forEach(round => {
                round.heats.forEach(heat => {
                    if (heat.status === 'completed' && heat.results && heat.results.length > 0) {
                        heatsToReset.push({ heat, results: heat.results });
                    }
                });
            });

            // Reverse all statistics first
            if (this.dataManager.statisticsManager) {
                window.debugLogger.debug('Race', ` Reversing statistics for ${heatsToReset.length} heats`);
                for (const { heat, results } of heatsToReset) {
                    try {
                        await this.dataManager.statisticsManager.reverseParticipantStatistics(results, eventId, heat.id);
                    } catch (statsError) {
                        console.error(`📊 Statistics reversal failed for heat ${heat.id}:`, statsError);
                    }
                }
            }

            // Reverse pairing engine history
            heatsToReset.forEach(({ heat, results }) => {
                this.pairingEngine.reverseRaceResult(heat, results);
            });

            // Remove all rounds from target round onwards
            classBracket.rounds.splice(targetRoundIndex);
            
            // Reset participant statuses to their state before the target round
            // This is a simplified approach - in a real implementation, you'd need more sophisticated state tracking
            classBracket.participants.forEach(participant => {
                // Reset to basic state - this is approximate
                participant.status = 'active';
                participant.currentBracket = 'upper';
                // Note: win/loss counts would need more sophisticated tracking to reset properly
            });

            // Update current round
            if (classBracket.rounds.length > 0) {
                classBracket.currentRound = classBracket.rounds[classBracket.rounds.length - 1].roundNumber;
            } else {
                classBracket.currentRound = 1;
            }

            // Mark class as incomplete
            classBracket.isComplete = false;
            classBracket.winner = null;

            // Save updated bracket
            await this.dataManager.saveRaceBracket(eventId, bracket);

            window.debugLogger.debug('Race', ` Successfully reset round ${roundNumber} and all subsequent rounds`);
            return {
                success: true,
                resetRounds: roundNumbers,
                resetHeats: heatsToReset.length
            };

        } catch (error) {
            console.error('Error resetting rounds:', error);
            throw error;
        }
    }

    /**
     * Reverse participant record updates from a heat result
     */
    reverseParticipantRecords(classBracket, heat, results) {
        window.debugLogger.debug('Race', `Reversing participant records for heat ${heat.id}`);
        window.debugLogger.debug('Race', 'Original results to reverse:', results);
        
        const eliminationType = classBracket.eliminationType || 'single';
        
        results.forEach(result => {
            const participant = classBracket.participants.find(p => p.id === result.participantId);
            if (!participant) {
                console.warn(`Participant ${result.participantId} not found in bracket for reversal`);
                return;
            }

            // Reverse race count
            participant.totalRaces = Math.max(0, participant.totalRaces - 1);

            // Reverse win/loss counts based on position
            if (result.position === 1) {
                participant.wins = Math.max(0, participant.wins - 1);
            } else {
                participant.losses = Math.max(0, participant.losses - 1);
            }

            // For double elimination, reverse bracket movement
            if (eliminationType === 'double' && participant.currentBracket) {
                // This is a simplified reversal - in complex scenarios, 
                // we might need more sophisticated logic to track the exact bracket path
                window.debugLogger.debug('Race', `Reversing bracket status for participant ${participant.name} (simplified)`);
            }

            window.debugLogger.debug('Race', `Reversed records for ${participant.name}: races=${participant.totalRaces}, wins=${participant.wins}, losses=${participant.losses}`);
        });
    }

    /**
     * Inject a late driver into an existing bracket
     * This method allows adding a driver who registered late or replacing a no-show
     * without restarting the entire bracket.
     * 
     * @param {string} eventId - The event ID
     * @param {string} className - The class to inject the driver into
     * @param {Object} participant - The participant data to inject
     * @param {Object} options - Additional options
     * @param {string} options.mode - 'open_slot' (default), 'no_show_replace', or 'next_round'
     * @param {string} options.replaceParticipantId - ID of participant to replace (for no_show_replace mode)
     * @returns {Object} Result with success status and details
     */
    async injectLateDriver(eventId, className, participant, options = {}) {
        const { mode = 'open_slot', replaceParticipantId = null } = options;
        
        window.debugLogger.debug('Race', ` Injecting late driver: ${participant.name} into ${className}`);
        window.debugLogger.debug('Race', `   Mode: ${mode}`);
        
        try {
            const bracket = await this.getBracket(eventId);
            if (!bracket || !bracket.classes[className]) {
                return { success: false, error: 'Bracket or class not found' };
            }
            
            const classBracket = bracket.classes[className];
            const event = this.dataManager.getEvent(eventId);
            
            // Prepare participant data
            const newParticipant = {
                ...participant,
                status: 'active',
                wins: 0,
                losses: 0,
                totalRaces: 0,
                currentBracket: classBracket.eliminationType === 'double' ? 'upper' : null,
                injectedLate: true,
                injectedAt: new Date().toISOString()
            };
            
            let result = { success: false };
            
            switch (mode) {
                case 'no_show_replace':
                    // Replace a no-show with the late driver
                    if (!replaceParticipantId) {
                        return { success: false, error: 'No participant ID specified for replacement' };
                    }
                    result = await this._replaceNoShow(bracket, classBracket, newParticipant, replaceParticipantId, eventId);
                    break;
                    
                case 'open_slot':
                    // Find an open slot (bye or incomplete heat) in the current round
                    result = await this._injectIntoOpenSlot(bracket, classBracket, newParticipant, eventId, className);
                    break;
                    
                case 'next_round':
                    // Add to participant pool for next round
                    result = await this._addForNextRound(bracket, classBracket, newParticipant, eventId);
                    break;
                    
                default:
                    return { success: false, error: `Unknown injection mode: ${mode}` };
            }
            
            if (result.success) {
                // Save the updated bracket
                await this.dataManager.saveRaceBracket(eventId, bracket);
                window.debugLogger.debug('Race', ` Late driver injection successful: ${participant.name}`);
                
                // Emit event for UI updates
                if (window.globalEventBus) {
                    window.globalEventBus.emit('bracket:updated', {
                        eventId,
                        className,
                        action: 'late_driver_injected',
                        participantId: participant.id
                    });
                }
            }
            
            return result;
            
        } catch (error) {
            console.error('❌ Error injecting late driver:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Replace a no-show participant with a late driver
     */
    async _replaceNoShow(bracket, classBracket, newParticipant, replaceParticipantId, eventId) {
        // Find the participant to replace
        const existingIndex = classBracket.participants.findIndex(p => p.id === replaceParticipantId);
        if (existingIndex === -1) {
            return { success: false, error: 'Participant to replace not found' };
        }
        
        const oldParticipant = classBracket.participants[existingIndex];
        
        // Check if the participant has already completed any races
        if ((oldParticipant.totalRaces || 0) > 0) {
            return { success: false, error: 'Cannot replace participant who has already raced' };
        }
        
        // Replace in participants array
        classBracket.participants[existingIndex] = newParticipant;
        
        // Update any heats that reference this participant
        let heatsUpdated = 0;
        for (const round of classBracket.rounds) {
            for (const heat of round.heats || []) {
                if (heat.status === 'pending' || heat.status === 'scheduled') {
                    for (let i = 0; i < heat.participants.length; i++) {
                        if (heat.participants[i]?.id === replaceParticipantId) {
                            heat.participants[i] = { ...newParticipant };
                            heatsUpdated++;
                        }
                    }
                }
            }
        }
        
        window.debugLogger.debug('Race', `   Replaced ${oldParticipant.name} with ${newParticipant.name} in ${heatsUpdated} heat(s)`);
        
        return {
            success: true,
            message: `Replaced ${oldParticipant.name} with ${newParticipant.name}`,
            heatsUpdated,
            replacedParticipant: oldParticipant
        };
    }

    /**
     * Find an open slot (bye or incomplete heat) and inject the driver
     */
    async _injectIntoOpenSlot(bracket, classBracket, newParticipant, eventId, className) {
        // First, add participant to the class participant list
        const existingParticipant = classBracket.participants.find(p => p.id === newParticipant.id);
        if (!existingParticipant) {
            classBracket.participants.push(newParticipant);
        }
        
        // Find the current round
        const currentRoundIndex = classBracket.rounds.length - 1;
        if (currentRoundIndex < 0) {
            return { success: false, error: 'No rounds exist yet - cannot inject' };
        }
        
        const currentRound = classBracket.rounds[currentRoundIndex];
        
        // Look for heats with empty slots (less than numberOfLanes participants)
        let injectedIntoHeat = null;
        let slotFound = false;
        
        for (const heat of currentRound.heats || []) {
            if (heat.status !== 'pending' && heat.status !== 'scheduled') {
                continue; // Skip completed or in-progress heats
            }
            
            // Check if heat has room
            const filledSlots = (heat.participants || []).filter(p => p && p.id).length;
            const totalSlots = classBracket.numberOfLanes || 3;
            
            if (filledSlots < totalSlots) {
                // Found an open slot
                heat.participants = heat.participants || [];
                
                // Find empty slot or add to end
                let inserted = false;
                for (let i = 0; i < totalSlots; i++) {
                    if (!heat.participants[i] || !heat.participants[i].id) {
                        heat.participants[i] = { ...newParticipant };
                        inserted = true;
                        break;
                    }
                }
                
                if (!inserted && heat.participants.length < totalSlots) {
                    heat.participants.push({ ...newParticipant });
                }
                
                injectedIntoHeat = heat;
                slotFound = true;
                window.debugLogger.debug('Race', `   Injected into heat ${heat.id} (round ${currentRound.roundNumber})`);
                break;
            }
        }
        
        if (!slotFound) {
            // No open slot in existing heats, create a new heat if enough participants are waiting
            window.debugLogger.debug('Race', '   No open slot found in existing heats');
            
            // For now, just add the participant to the pool for next round
            return {
                success: true,
                message: `${newParticipant.name} added to participant pool. Will race in next round.`,
                injectedIntoHeat: null,
                addedToPool: true
            };
        }
        
        return {
            success: true,
            message: `${newParticipant.name} injected into heat`,
            injectedIntoHeat: injectedIntoHeat?.id,
            roundNumber: currentRound.roundNumber
        };
    }

    /**
     * Add driver to participant pool for the next round
     */
    async _addForNextRound(bracket, classBracket, newParticipant, eventId) {
        // Check if already in participants list
        const existingIndex = classBracket.participants.findIndex(p => p.id === newParticipant.id);
        
        if (existingIndex === -1) {
            classBracket.participants.push(newParticipant);
        } else {
            // Update existing entry
            classBracket.participants[existingIndex] = {
                ...classBracket.participants[existingIndex],
                ...newParticipant,
                status: 'active'
            };
        }
        
        return {
            success: true,
            message: `${newParticipant.name} added to participant pool for next round`,
            addedToPool: true
        };
    }

    /**
     * Mark a participant as a no-show in the current bracket
     * This preserves their slot for potential late driver injection
     * 
     * @param {string} eventId - The event ID
     * @param {string} className - The class name
     * @param {string} participantId - The participant to mark as no-show
     */
    async markNoShow(eventId, className, participantId) {
        try {
            const bracket = await this.getBracket(eventId);
            if (!bracket || !bracket.classes[className]) {
                return { success: false, error: 'Bracket or class not found' };
            }
            
            const classBracket = bracket.classes[className];
            const participant = classBracket.participants.find(p => p.id === participantId);
            
            if (!participant) {
                return { success: false, error: 'Participant not found' };
            }
            
            // Check if they've already raced
            if ((participant.totalRaces || 0) > 0) {
                return { success: false, error: 'Cannot mark as no-show - participant has already raced' };
            }
            
            // Mark as no-show
            participant.status = 'no_show';
            participant.noShowAt = new Date().toISOString();
            
            // Save bracket
            await this.dataManager.saveRaceBracket(eventId, bracket);
            
            window.debugLogger.debug('Race', ` Marked ${participant.name} as no-show in ${className}`);
            
            // Emit event
            if (window.globalEventBus) {
                window.globalEventBus.emit('bracket:updated', {
                    eventId,
                    className,
                    action: 'participant_no_show',
                    participantId
                });
            }
            
            return {
                success: true,
                message: `${participant.name} marked as no-show`,
                participant
            };
            
        } catch (error) {
            console.error('❌ Error marking no-show:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get list of no-show participants that can be replaced
     */
    async getNoShowParticipants(eventId, className) {
        try {
            const bracket = await this.getBracket(eventId);
            if (!bracket || !bracket.classes[className]) {
                return [];
            }
            
            const classBracket = bracket.classes[className];
            return classBracket.participants.filter(p => 
                p.status === 'no_show' || 
                (p.status === 'active' && (p.totalRaces || 0) === 0)
            );
            
        } catch (error) {
            console.error('Error getting no-show participants:', error);
            return [];
        }
    }

    /**
     * Manually add a loss to a participant without creating a heat.
     * Does NOT affect stats — purely adjusts bracket status.
     * @param {string} eventId
     * @param {string} participantId
     * @param {string} className
     */
    async addManualLoss(eventId, participantId, className) {
        const bracket = await this.getBracket(eventId);
        if (!bracket || !bracket.classes[className]) throw new Error('Bracket/class not found');
        
        const classBracket = bracket.classes[className];
        const participant = classBracket.participants.find(p => p.id === participantId);
        if (!participant) throw new Error('Participant not found in class bracket');
        
        participant.losses = (participant.losses || 0) + 1;
        
        // Check elimination based on elimination type
        const event = this.dataManager.getEvent(eventId);
        const elimType = classBracket.eliminationType || event?.eliminationType || 'double';
        const lossLimit = elimType === 'single' ? 1 :
                          elimType === 'custom' ? (event?.customLossLimit || 2) : 2;
        
        if (participant.losses >= lossLimit) {
            participant.status = 'eliminated';
            if (participant.currentBracket) participant.currentBracket = null;
        } else if (elimType === 'double' && participant.losses === 1 && participant.currentBracket === 'upper') {
            participant.currentBracket = 'lower';
        }
        
        await this.dataManager.saveRaceBracket(eventId, bracket);
        window.debugLogger?.debug('Race', `Manual loss added to ${participant.name}: now ${participant.losses}L, status=${participant.status}`);
        return { success: true, losses: participant.losses, status: participant.status };
    }

    /**
     * Manually remove a loss from a participant without affecting stats.
     * May re-activate an eliminated participant.
     * @param {string} eventId
     * @param {string} participantId
     * @param {string} className
     */
    async removeManualLoss(eventId, participantId, className) {
        const bracket = await this.getBracket(eventId);
        if (!bracket || !bracket.classes[className]) throw new Error('Bracket/class not found');
        
        const classBracket = bracket.classes[className];
        const participant = classBracket.participants.find(p => p.id === participantId);
        if (!participant) throw new Error('Participant not found in class bracket');
        
        if ((participant.losses || 0) <= 0) throw new Error('Participant has no losses to remove');
        
        participant.losses = participant.losses - 1;
        
        // Re-activate if they were eliminated
        if (participant.status === 'eliminated') {
            participant.status = 'active';
            // For double elimination, if they now have 1 loss, put in lower bracket
            const elimType = classBracket.eliminationType || 'double';
            if ((elimType === 'double' || elimType === 'double_random') && participant.losses >= 1) {
                participant.currentBracket = 'lower';
            } else if ((elimType === 'double' || elimType === 'double_random') && participant.losses === 0) {
                participant.currentBracket = 'upper';
            }
        }
        
        await this.dataManager.saveRaceBracket(eventId, bracket);
        window.debugLogger?.debug('Race', `Manual loss removed from ${participant.name}: now ${participant.losses}L, status=${participant.status}`);
        return { success: true, losses: participant.losses, status: participant.status };
    }

    /**
     * Undo a disqualification — clears DSQ flag on the result and recalculates participant status.
     * @param {string} eventId
     * @param {string} participantId
     * @param {string} heatId
     */
    async undoDisqualification(eventId, participantId, heatId) {
        const bracket = await this.getBracket(eventId);
        if (!bracket) throw new Error('Bracket not found');
        
        // Find the heat across all classes
        let targetHeat = null;
        let targetClassName = null;
        for (const [cn, cb] of Object.entries(bracket.classes)) {
            for (const round of (cb.rounds || [])) {
                for (const h of (round.heats || [])) {
                    if (h.id === heatId) {
                        targetHeat = h;
                        targetClassName = cn;
                        break;
                    }
                }
                if (targetHeat) break;
            }
            if (targetHeat) break;
        }
        
        if (!targetHeat) throw new Error('Heat not found');
        
        // Clear DSQ on the result
        if (targetHeat.results && Array.isArray(targetHeat.results)) {
            const result = targetHeat.results.find(r => r.participantId === participantId);
            if (result) {
                result.disqualified = false;
                result.result = 'completed';
                // Restore a reasonable position if it was cleared
                if (!result.position || result.position === 'DSQ') {
                    result.position = targetHeat.results.length; // Last position
                }
            }
        }
        
        // Re-activate the participant in the bracket
        const classBracket = bracket.classes[targetClassName];
        if (classBracket) {
            const participant = classBracket.participants.find(p => p.id === participantId);
            if (participant && participant.status === 'eliminated') {
                participant.status = 'active';
                // Restore bracket position based on current losses
                const elimType = classBracket.eliminationType || 'double';
                if ((elimType === 'double' || elimType === 'double_random')) {
                    participant.currentBracket = (participant.losses || 0) >= 1 ? 'lower' : 'upper';
                }
            }
        }
        
        await this.dataManager.saveRaceBracket(eventId, bracket);
        window.debugLogger?.debug('Race', `Disqualification undone for participant ${participantId} in heat ${heatId}`);
        return { success: true, className: targetClassName };
    }

    /**
     * Determine whether a heat should be treated as completed.
     * Supports both legacy (isComplete) and current (status + results) schemas.
     * @param {Object} heat - Heat object from bracket data
     * @returns {boolean}
     */
    static isHeatCompleted(heat) {
        if (!heat || typeof heat !== 'object') return false;
        if (heat.isComplete === true) return true;
        if (heat.status === 'completed') {
            return Array.isArray(heat.results) && heat.results.length > 0;
        }
        return false;
    }
}

// Ensure global availability
if (typeof window !== 'undefined') {
    window.RaceManager = RaceManager;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RaceManager;
}
