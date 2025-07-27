// Debug script to test participant loading
// Run this in the browser console on the races page

function debugParticipants() {
    console.log('🔍 DEBUG: Testing participant loading...');
    
    // Check if dataManager is available
    if (typeof dataManager === 'undefined') {
        console.error('❌ dataManager not available');
        return;
    }
    
    // Get the event ID for "Drag Beauceville"
    const eventId = "1bc842ac-1a2d-4858-b83e-589a645f491b";
    
    console.log('🔍 DEBUG: Testing event ID:', eventId);
    
    // Get the event
    const event = dataManager.getEvent(eventId);
    console.log('🔍 DEBUG: Event found:', event ? 'YES' : 'NO');
    if (event) {
        console.log('🔍 DEBUG: Event details:', {
            id: event.id,
            name: event.name,
            participants: event.participants,
            participantCount: event.participants ? event.participants.length : 0,
            seriesId: event.seriesId
        });
    }
    
    // Get all participants
    const allParticipants = dataManager.getParticipantsArray();
    console.log('🔍 DEBUG: Total participants in system:', allParticipants.length);
    
    // Find participants for this event
    const eventParticipants = allParticipants.filter(p => p.eventId === eventId);
    console.log('🔍 DEBUG: Participants for event:', eventParticipants.length);
    
    if (eventParticipants.length > 0) {
        console.log('🔍 DEBUG: Participant details:', eventParticipants.map(p => ({
            id: p.id,
            name: p.name,
            eventId: p.eventId,
            selectedClasses: p.selectedClasses,
            sledClasses: p.sledClasses
        })));
    }
    
    // Test the race manager if available
    if (typeof raceManager !== 'undefined') {
        console.log('🔍 DEBUG: Testing raceManager.getEventParticipants...');
        const raceParticipants = raceManager.getEventParticipants(eventId);
        console.log('🔍 DEBUG: Race manager found participants:', raceParticipants.length);
    } else {
        console.log('❌ raceManager not available');
    }
}

// Run the debug function
debugParticipants(); 