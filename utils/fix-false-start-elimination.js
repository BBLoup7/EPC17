/**
 * Utility to fix false start elimination issues in double elimination brackets
 * This fixes cases where drivers with false starts were incorrectly eliminated
 * instead of being moved to the lower bracket
 */

export class FalseStartFixer {
    constructor(dataManager, raceManager) {
        this.dataManager = dataManager;
        this.raceManager = raceManager;
    }

    /**
     * Fix false start elimination issues for a specific event
     */
    async fixEventFalseStartIssues(eventId) {
        console.log(`🔧 Fixing false start elimination issues for event ${eventId}`);
        
        const bracket = this.raceManager.getBracket(eventId);
        if (!bracket) {
            throw new Error('Bracket not found for event');
        }

        const event = this.dataManager.getEvent(eventId);
        if (!event) {
            throw new Error('Event not found');
        }

        if (event.eliminationType !== 'double') {
            console.log('Event is not double elimination, no fix needed');
            return { fixed: 0, total: 0 };
        }

        let totalFixed = 0;
        const fixes = [];

        // Check each class in the bracket
        for (const [className, classBracket] of Object.entries(bracket.classes)) {
            console.log(`Checking class ${className} for false start issues...`);
            
            const classFixes = this.fixClassFalseStartIssues(classBracket, className);
            fixes.push(...classFixes);
            totalFixed += classFixes.length;
        }

        if (totalFixed > 0) {
            // Save the fixed bracket
            await this.dataManager.saveRaceBracket(eventId, bracket);
            this.raceManager.eventBrackets.set(eventId, bracket);
            
            console.log(`✅ Fixed ${totalFixed} false start elimination issues`);
            console.log('Fixes applied:', fixes);
        } else {
            console.log('No false start elimination issues found');
        }

        return { fixed: totalFixed, total: fixes.length, fixes };
    }

    /**
     * Fix false start elimination issues for a specific class
     */
    fixClassFalseStartIssues(classBracket, className) {
        const fixes = [];

        classBracket.participants.forEach(participant => {
            // Check if participant was incorrectly eliminated due to false start
            if (this.isIncorrectlyEliminated(participant)) {
                const fix = this.fixParticipantElimination(participant, className);
                if (fix) {
                    fixes.push(fix);
                }
            }

            // Ensure participant has proper bracket state
            if (this.hasInvalidBracketState(participant)) {
                const fix = this.fixParticipantBracketState(participant, className);
                if (fix) {
                    fixes.push(fix);
                }
            }
        });

        return fixes;
    }

    /**
     * Check if a participant was incorrectly eliminated
     */
    isIncorrectlyEliminated(participant) {
        // Participant is eliminated but has only 1 loss and should be in lower bracket
        return participant.status === 'eliminated' && 
               participant.losses === 1 && 
               (!participant.currentBracket || participant.currentBracket === 'upper');
    }

    /**
     * Check if a participant has invalid bracket state
     */
    hasInvalidBracketState(participant) {
        // Participant is active but has no bracket set, or has invalid bracket value
        return participant.status === 'active' && 
               (!participant.currentBracket || 
                (participant.currentBracket !== 'upper' && participant.currentBracket !== 'lower'));
    }

    /**
     * Fix a participant's elimination status
     */
    fixParticipantElimination(participant, className) {
        console.log(`🔧 Fixing elimination for ${participant.name} in ${className}`);
        
        // Move to lower bracket instead of being eliminated
        participant.status = 'active';
        participant.currentBracket = 'lower';
        
        return {
            type: 'elimination_fix',
            participant: participant.name,
            className: className,
            action: 'moved_to_lower_bracket',
            previousStatus: 'eliminated',
            newStatus: 'active',
            previousBracket: null,
            newBracket: 'lower'
        };
    }

    /**
     * Fix a participant's bracket state
     */
    fixParticipantBracketState(participant, className) {
        console.log(`🔧 Fixing bracket state for ${participant.name} in ${className}`);
        
        // Determine correct bracket based on losses
        let correctBracket = 'upper';
        if (participant.losses > 0) {
            correctBracket = 'lower';
        }
        
        const previousBracket = participant.currentBracket;
        participant.currentBracket = correctBracket;
        
        return {
            type: 'bracket_state_fix',
            participant: participant.name,
            className: className,
            action: 'corrected_bracket_state',
            previousBracket: previousBracket,
            newBracket: correctBracket,
            losses: participant.losses
        };
    }

    /**
     * Fix all events with false start issues
     */
    async fixAllEventsFalseStartIssues() {
        console.log('🔧 Scanning all events for false start elimination issues...');
        
        const events = this.dataManager.getEvents();
        const doubleEliminationEvents = events.filter(event => event.eliminationType === 'double');
        
        console.log(`Found ${doubleEliminationEvents.length} double elimination events to check`);
        
        const results = [];
        
        for (const event of doubleEliminationEvents) {
            try {
                const result = await this.fixEventFalseStartIssues(event.id);
                if (result.fixed > 0) {
                    results.push({
                        eventId: event.id,
                        eventName: event.name,
                        ...result
                    });
                }
            } catch (error) {
                console.error(`Error fixing event ${event.id}:`, error);
                results.push({
                    eventId: event.id,
                    eventName: event.name,
                    error: error.message
                });
            }
        }
        
        console.log(`✅ Completed false start fix scan. Results:`, results);
        return results;
    }

    /**
     * Get a summary of false start issues in an event
     */
    getFalseStartIssuesSummary(eventId) {
        const bracket = this.raceManager.getBracket(eventId);
        if (!bracket) {
            return { error: 'Bracket not found' };
        }

        const issues = [];
        
        for (const [className, classBracket] of Object.entries(bracket.classes)) {
            const classIssues = classBracket.participants
                .filter(p => this.isIncorrectlyEliminated(p) || this.hasInvalidBracketState(p))
                .map(p => ({
                    participant: p.name,
                    className: className,
                    status: p.status,
                    currentBracket: p.currentBracket,
                    wins: p.wins,
                    losses: p.losses,
                    issues: []
                }));

            classIssues.forEach(issue => {
                if (this.isIncorrectlyEliminated(issue)) {
                    issue.issues.push('incorrectly_eliminated');
                }
                if (this.hasInvalidBracketState(issue)) {
                    issue.issues.push('invalid_bracket_state');
                }
            });

            issues.push(...classIssues);
        }

        return {
            eventId: eventId,
            totalIssues: issues.length,
            issues: issues
        };
    }
} 