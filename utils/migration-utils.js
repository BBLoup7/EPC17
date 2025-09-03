/**
 * Migration and Troubleshooting Utilities for EPC17 Racing System
 * Run these commands in the browser console to fix data issues
 */

window.MigrationUtils = {
    
    /**
     * Fix existing participants with missing eventId fields
     */
    async fixParticipantEventIds() {
        if (window.debugLogger) {
            window.debugLogger.info('MigrationUtils', 'Starting participant eventId migration');
        } else {
            console.log('🔄 Starting participant eventId migration...');
        }
        
        if (!window.dataManager) {
            if (window.debugLogger) {
                window.debugLogger.error('MigrationUtils', 'DataManager not available. Please ensure you\'re on a page with dataManager loaded.');
            } else {
                console.error('❌ DataManager not available. Please ensure you\'re on a page with dataManager loaded.');
            }
            return;
        }
        
        try {
            const fixedCount = await window.dataManager.migrateParticipantEventIds();
            if (window.debugLogger) {
                window.debugLogger.success('MigrationUtils', `Migration complete: Fixed ${fixedCount} participants`);
            } else {
                console.log(`✅ Migration complete: Fixed ${fixedCount} participants`);
            }
            
            // Show results
            this.showParticipantEventMapping();
            
            return fixedCount;
        } catch (error) {
            if (window.debugLogger) {
                window.debugLogger.error('MigrationUtils', 'Migration failed', error);
            } else {
                console.error('❌ Migration failed:', error);
            }
            throw error;
        }
    },
    
    /**
     * Show current participant-event mapping for debugging
     */
    showParticipantEventMapping() {
        console.log('📊 Current Participant-Event Mapping:');
        console.log('=====================================');
        
        if (!window.dataManager) {
            console.error('❌ DataManager not available');
            return;
        }
        
        const participants = window.dataManager.getParticipantsArray();
        const events = window.dataManager.getEventsArray();
        
        console.log(`Total Participants: ${participants.length}`);
        console.log(`Total Events: ${events.length}`);
        console.log('');
        
        // Show participants by event
        events.forEach(event => {
            console.log(`📅 Event: ${event.name} (ID: ${event.id})`);
            console.log(`   Event.participants array: [${(event.participants || []).join(', ')}]`);
            
            // Find participants with this eventId
            const participantsByEventId = participants.filter(p => p.eventId === event.id);
            console.log(`   Participants with eventId=${event.id}: ${participantsByEventId.length}`);
            
            participantsByEventId.forEach(p => {
                console.log(`   - ${p.name} (ID: ${p.id})`);
            });
            
            // Find participants in event's participants array
            const participantsInArray = (event.participants || []).map(id => {
                const p = participants.find(participant => participant.id === id);
                return p ? `${p.name} (ID: ${p.id})` : `Unknown participant (ID: ${id})`;
            });
            
            if (participantsInArray.length > 0) {
                console.log(`   Participants in event.participants: ${participantsInArray.join(', ')}`);
            }
            
            console.log('');
        });
        
        // Show participants without eventId
        const participantsWithoutEventId = participants.filter(p => !p.eventId);
        if (participantsWithoutEventId.length > 0) {
            console.log('⚠️ Participants without eventId:');
            participantsWithoutEventId.forEach(p => {
                console.log(`   - ${p.name} (ID: ${p.id})`);
            });
        }
    },
    
    /**
     * Test add existing driver functionality
     */
    async testAddExistingDriver(participantId, eventId) {
        console.log(`🧪 Testing add existing driver: ${participantId} -> ${eventId}`);
        
        if (!window.dataManager) {
            console.error('❌ DataManager not available');
            return;
        }
        
        try {
            // Show before state
            const participant = window.dataManager.getParticipant(participantId);
            const event = window.dataManager.getEvent(eventId);
            
            console.log('📊 BEFORE:');
            console.log(`   Participant: ${participant?.name} (eventId: ${participant?.eventId})`);
            console.log(`   Event: ${event?.name} (participants: [${(event?.participants || []).join(', ')}])`);
            
            // Register participant
            const success = await window.dataManager.registerParticipantForEvent(eventId, participantId);
            
            if (success) {
                // Show after state
                const updatedParticipant = window.dataManager.getParticipant(participantId);
                const updatedEvent = window.dataManager.getEvent(eventId);
                
                console.log('📊 AFTER:');
                console.log(`   Participant: ${updatedParticipant?.name} (eventId: ${updatedParticipant?.eventId})`);
                console.log(`   Event: ${updatedEvent?.name} (participants: [${(updatedEvent?.participants || []).join(', ')}])`);
                
                // Test race system compatibility
                console.log('🏁 Testing race system compatibility...');
                if (window.raceManager) {
                    const eventParticipants = window.raceManager.getEventParticipants(eventId);
                    const foundParticipant = eventParticipants.find(p => p.id === participantId);
                    
                    if (foundParticipant) {
                        console.log('✅ Race system can find participant');
                    } else {
                        console.log('❌ Race system cannot find participant');
                    }
                } else {
                    console.log('⚠️ Race manager not available for testing');
                }
                
                console.log('✅ Test completed successfully');
            } else {
                console.log('❌ Registration failed');
            }
            
            return success;
        } catch (error) {
            console.error('❌ Test failed:', error);
            throw error;
        }
    },
    
    /**
     * Quick diagnostic for add existing driver issues
     */
    diagnoseAddExistingDriver() {
        console.log('🔍 Diagnosing Add Existing Driver Issues');
        console.log('========================================');
        
        if (!window.dataManager) {
            console.error('❌ DataManager not available');
            return;
        }
        
        const participants = window.dataManager.getParticipantsArray();
        const events = window.dataManager.getEventsArray();
        
        console.log(`📊 System Overview:`);
        console.log(`   Total Participants: ${participants.length}`);
        console.log(`   Total Events: ${events.length}`);
        console.log('');
        
        // Check for common issues
        let issuesFound = 0;
        
        // Issue 1: Participants without eventId
        const participantsWithoutEventId = participants.filter(p => !p.eventId);
        if (participantsWithoutEventId.length > 0) {
            console.log('🔴 Issue 1: Participants without eventId');
            console.log(`   ${participantsWithoutEventId.length} participants are missing eventId field`);
            console.log(`   This will cause them to not appear in race brackets`);
            console.log(`   Fix: Run MigrationUtils.fixParticipantEventIds()`);
            issuesFound++;
        }
        
        // Issue 2: Event participants array out of sync
        events.forEach(event => {
            if (!event.participants || event.participants.length === 0) return;
            
            const participantsWithEventId = participants.filter(p => p.eventId === event.id);
            const participantsInArray = event.participants.length;
            
            if (participantsWithEventId.length !== participantsInArray) {
                console.log(`🔴 Issue 2: Event ${event.name} has sync issue`);
                console.log(`   event.participants array: ${participantsInArray} participants`);
                console.log(`   participants with eventId: ${participantsWithEventId.length} participants`);
                console.log(`   Fix: Run MigrationUtils.fixParticipantEventIds()`);
                issuesFound++;
            }
        });
        
        // Issue 3: Race system availability
        if (!window.raceManager) {
            console.log('🔴 Issue 3: Race manager not available');
            console.log(`   Race manager is required for bracket generation`);
            console.log(`   This is normal on non-race pages`);
        }
        
        console.log('');
        if (issuesFound === 0) {
            console.log('✅ No issues found! System appears to be working correctly.');
        } else {
            console.log(`🔴 Found ${issuesFound} issues that need attention.`);
            console.log('');
            console.log('💡 Recommended Actions:');
            console.log('1. Run MigrationUtils.fixParticipantEventIds() to fix participant eventId fields');
            console.log('2. Test add existing driver functionality with MigrationUtils.testAddExistingDriver(participantId, eventId)');
            console.log('3. Check participant-event mapping with MigrationUtils.showParticipantEventMapping()');
        }
    }
};

// Auto-run diagnostic when loaded
console.log('🔧 Migration Utils loaded. Available commands:');
console.log('- MigrationUtils.diagnoseAddExistingDriver() - Quick diagnostic');
console.log('- MigrationUtils.fixParticipantEventIds() - Fix missing eventId fields');
console.log('- MigrationUtils.showParticipantEventMapping() - Show current mapping');
console.log('- MigrationUtils.testAddExistingDriver(participantId, eventId) - Test functionality'); 