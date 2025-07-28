const fs = require('fs');
const path = require('path');

function validateStressTestData() {
    console.log('🔍 Validating stress test data integrity...');
    
    try {
        // Load data files
        const participantsPath = path.join(__dirname, 'data', 'participants.json');
        const eventsPath = path.join(__dirname, 'data', 'events.json');
        
        if (!fs.existsSync(participantsPath) || !fs.existsSync(eventsPath)) {
            console.error('❌ Data files not found');
            return;
        }
        
        const participants = JSON.parse(fs.readFileSync(participantsPath, 'utf8'));
        const events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
        
        console.log(`📊 Loaded ${participants.length} participants`);
        console.log(`🏁 Loaded ${events.length} events`);
        
        // Create set of all participant IDs
        const participantIds = new Set(participants.map(p => p.id));
        console.log(`✅ Found ${participantIds.size} unique participant IDs`);
        
        // Check each event's participants
        let totalEventParticipants = 0;
        let missingParticipants = 0;
        let validParticipants = 0;
        
        events.forEach((event, eventIndex) => {
            if (event.participants && Array.isArray(event.participants)) {
                totalEventParticipants += event.participants.length;
                
                event.participants.forEach(participantId => {
                    if (participantIds.has(participantId)) {
                        validParticipants++;
                    } else {
                        missingParticipants++;
                        console.warn(`⚠️ Event ${event.name} (${eventIndex + 1}) references missing participant: ${participantId}`);
                    }
                });
            }
        });
        
        console.log('\n📋 Validation Results:');
        console.log(`   Total participants in events: ${totalEventParticipants}`);
        console.log(`   Valid participant references: ${validParticipants}`);
        console.log(`   Missing participant references: ${missingParticipants}`);
        
        if (missingParticipants > 0) {
            console.log('\n❌ DATA INTEGRITY ISSUE DETECTED!');
            console.log('   This explains the "Participant not found" errors.');
            console.log('   The race system cannot find participants referenced in events.');
            
            // Check if this is a timing issue (participants generated after events)
            const participantTimestamps = participants.map(p => parseInt(p.id.split('_')[1]));
            const eventTimestamps = events.map(e => parseInt(e.id.split('_')[1]));
            
            const avgParticipantTime = participantTimestamps.reduce((a, b) => a + b, 0) / participantTimestamps.length;
            const avgEventTime = eventTimestamps.reduce((a, b) => a + b, 0) / eventTimestamps.length;
            
            console.log(`\n🔍 Timestamp Analysis:`);
            console.log(`   Average participant timestamp: ${avgParticipantTime}`);
            console.log(`   Average event timestamp: ${avgEventTime}`);
            
            if (avgParticipantTime > avgEventTime) {
                console.log('   ⚠️ Participants were generated AFTER events - this is the problem!');
                console.log('   The generator needs to create events AFTER participants.');
            }
            
        } else {
            console.log('\n✅ All participant references are valid!');
        }
        
        // Check participant eventId assignments
        let participantsWithEventId = 0;
        let participantsWithoutEventId = 0;
        
        participants.forEach(participant => {
            if (participant.eventId) {
                participantsWithEventId++;
            } else {
                participantsWithoutEventId++;
            }
        });
        
        console.log(`\n📊 Participant Event Assignment:`);
        console.log(`   With eventId: ${participantsWithEventId}`);
        console.log(`   Without eventId: ${participantsWithoutEventId}`);
        
    } catch (error) {
        console.error('❌ Error validating data:', error);
    }
}

// Run validation
validateStressTestData(); 