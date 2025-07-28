/**
 * Test script to verify participant loading
 * Run this in the browser console to test if all participants are loaded
 */

async function testParticipantLoading() {
    console.log('🧪 Testing participant loading...');
    
    if (!window.dataManager) {
        console.error('❌ DataManager not found');
        return;
    }
    
    try {
        // Force reload participants with higher limit
        console.log('🔄 Loading participants from server...');
        await window.dataManager.loadFromStorage(['participants'], true);
        
        // Check how many participants were loaded
        const participants = window.dataManager.getParticipantsArray();
        console.log(`📊 Loaded ${participants.length} participants`);
        
        if (participants.length >= 12000) {
            console.log('✅ Successfully loaded all stress test participants!');
        } else if (participants.length >= 1000) {
            console.log('⚠️ Loaded some participants but not all. This might be a server limit issue.');
        } else {
            console.error('❌ Very few participants loaded. Check server configuration.');
        }
        
        // Test participant lookup
        if (participants.length > 0) {
            const testParticipant = participants[0];
            const foundParticipant = window.dataManager.getParticipant(testParticipant.id);
            if (foundParticipant) {
                console.log(`✅ Participant lookup works: ${foundParticipant.name}`);
            } else {
                console.error(`❌ Participant lookup failed for: ${testParticipant.id}`);
            }
        }
        
        // Check for any participants with the old ID format
        const oldFormatParticipants = participants.filter(p => p.id.includes('id_175372'));
        if (oldFormatParticipants.length > 0) {
            console.warn(`⚠️ Found ${oldFormatParticipants.length} participants with old ID format`);
        } else {
            console.log('✅ All participants have correct UUID format');
        }
        
    } catch (error) {
        console.error('❌ Error testing participant loading:', error);
    }
}

// Auto-run if in browser
if (typeof window !== 'undefined') {
    // Wait for page to load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', testParticipantLoading);
    } else {
        testParticipantLoading();
    }
    
    // Also provide manual trigger
    window.testParticipantLoading = testParticipantLoading;
    console.log('🧪 Test script loaded. Run window.testParticipantLoading() to test manually.');
}

// Node.js export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { testParticipantLoading };
} 