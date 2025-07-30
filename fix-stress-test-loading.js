/**
 * Fix for Stress Test Data Loading Issues
 * Ensures participants are properly loaded and accessible to the race system
 */

// Wait for the page to load
if (typeof window !== 'undefined') {
    // Function to fix data loading
    async function fixStressTestDataLoading() {
        console.log('🔧 Fixing stress test data loading...');
        
        if (!window.dataManager) {
            console.error('❌ DataManager not found');
            return;
        }
        
        try {
            // Force reload all data with cache busting
            console.log('🔄 Forcing complete data reload...');
            await window.dataManager.loadFromStorage(null, true);
            
            // Wait a moment for data to settle
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Verify participants are loaded
            const participants = window.dataManager.getParticipantsArray();
            console.log(`📊 Loaded ${participants.length} participants`);
            
            if (participants.length < 1000) {
                console.error('❌ Not enough participants loaded - stress test data may not be loaded');
                return;
            }
            
            // Test participant lookup
            const testParticipant = participants[0];
            if (testParticipant) {
                const foundParticipant = window.dataManager.getParticipant(testParticipant.id);
                if (foundParticipant) {
                    console.log(`✅ Participant lookup works: ${foundParticipant.name}`);
                } else {
                    console.error(`❌ Participant lookup failed for: ${testParticipant.id}`);
                }
            }
            
            // Check events
            const events = window.dataManager.getEventsArray();
            console.log(`🏁 Loaded ${events.length} events`);
            
            // Test event participant relationships
            if (events.length > 0) {
                const testEvent = events[0];
                if (testEvent.participants && testEvent.participants.length > 0) {
                    const testParticipantId = testEvent.participants[0];
                    const foundParticipant = window.dataManager.getParticipant(testParticipantId);
                    if (foundParticipant) {
                        console.log(`✅ Event participant relationship valid: ${foundParticipant.name} in ${testEvent.name}`);
                    } else {
                        console.error(`❌ Event references non-existent participant: ${testParticipantId}`);
                    }
                }
            }
            
            console.log('✅ Stress test data loading fix complete');
            
        } catch (error) {
            console.error('❌ Error fixing data loading:', error);
        }
    }
    
    // Run the fix when the page is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fixStressTestDataLoading);
    } else {
        fixStressTestDataLoading();
    }
    
    // Also provide a manual trigger
    window.fixStressTestData = fixStressTestDataLoading;
    
    console.log('🔧 Stress test data loading fix script loaded');
    console.log('💡 Run window.fixStressTestData() in console to manually fix data loading');
}

// Node.js version for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { fixStressTestDataLoading };
} 