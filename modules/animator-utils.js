/**
 * Animator Utilities Module
 * Helper functions for data extraction, formatting, and calculations
 * Part of EPC17 Animator Page Rework
 */

/**
 * Extract races from race brackets
 * @param {Object} brackets - Race bracket data
 * @param {string} eventIdOverride - Override event ID
 * @returns {Array} Array of race objects
 */
function extractRacesFromBrackets(brackets, eventIdOverride = null) {
    const races = [];
    
    if (!brackets || typeof brackets !== 'object') {
        return races;
    }
    
    if (brackets.classes) {
        Object.entries(brackets.classes).forEach(([className, classData]) => {
            if (classData.rounds && Array.isArray(classData.rounds)) {
                classData.rounds.forEach((round, roundIndex) => {
                    let bracketType = round.bracketType;
                    
                    // Try to infer bracketType if missing
                    if (!bracketType) {
                        if (round.name && typeof round.name === 'string') {
                            if (round.name.toLowerCase().includes('lower')) bracketType = 'lower';
                            else if (round.name.toLowerCase().includes('final')) bracketType = 'final';
                            else if (round.name.toLowerCase().includes('upper')) bracketType = 'upper';
                        }
                        if (!bracketType && round.type && typeof round.type === 'string') {
                            bracketType = round.type.toLowerCase();
                        }
                    }
                    
                    if (!bracketType && round.heats && round.heats.length > 0) {
                        const heatBracket = round.heats[0].bracketType || round.heats[0].bracket;
                        if (heatBracket) bracketType = heatBracket;
                    }
                    
                    if (!bracketType) bracketType = 'unknown';
                    
                    if (round.heats && Array.isArray(round.heats)) {
                        round.heats.forEach((heat, heatIndex) => {
                            const finalBracketType = heat.bracketType || heat.bracket || bracketType;
                            
                            const race = {
                                id: heat.id || `heat_${className}_${roundIndex}_${heatIndex}`,
                                className: className,
                                round: roundIndex + 1,
                                heatNumber: heat.heatNumber || (heatIndex + 1),
                                raceNumber: heat.raceNumber || null,
                                numberOfLanes: heat.numberOfLanes || classData.numberOfLanes || 4,
                                status: heat.status === 'completed' ? 'completed' : 
                                       heat.status === 'in_progress' ? 'in_progress' : 'scheduled',
                                participants: heat.participants || [],
                                lanes: heat.lanes || [],
                                results: heat.results || heat.finishOrder || {},
                                scheduledTime: heat.scheduledTime || heat.startTime,
                                completedAt: heat.completedAt || heat.endTime,
                                createdAt: heat.createdAt || new Date().toISOString(),
                                eliminationType: classData.eliminationType || 'single',
                                bracketType: finalBracketType,
                                isComplete: heat.status === 'completed' || heat.isComplete || false,
                                eventId: eventIdOverride || brackets.eventId || null
                            };
                            
                            races.push(race);
                        });
                    }
                });
            }
        });
    }
    
    return races;
}

/**
 * Get participants for a race
 * @param {Object} race - Race object
 * @param {Array} allParticipants - All participants array
 * @returns {Array} Array of participant objects with lane info
 */
function getRaceParticipants(race, allParticipants = []) {
    let list = [];
    
    if (Array.isArray(race.lanes)) {
        list = race.lanes
            .filter(l => l && l.participant)
            .map((l, idx) => ({
                id: l.participant.id,
                lane: l.lane || (idx + 1),
                name: l.participant.name,
                number: l.participant.number,
                sponsor: l.participant.sponsor,
                age: l.participant.age,
                hometown: l.participant.hometown
            }));
    } else if (Array.isArray(race.participants)) {
        list = race.participants.map((pid, idx) => {
            const p = allParticipants.find(pp => pp.id === pid) || {};
            return {
                id: pid,
                lane: idx + 1,
                name: p.name || `Driver ${String(pid).slice(-4)}`,
                number: p.number,
                sponsor: p.sponsor,
                age: p.age,
                hometown: p.hometown
            };
        });
    }
    
    return list;
}

/**
 * Extract results from race data
 * @param {Object} race - Race object
 * @returns {Object} Map of participantId/name to position
 */
function extractResults(race) {
    const results = race.results || race.raceResults || race.finishOrder || {};
    
    if (Array.isArray(results)) {
        const map = {};
        results.forEach((rr, i) => {
            const id = rr.participantId || rr.participant;
            if (id) map[id] = rr.position || (i + 1);
        });
        return map;
    }
    
    if (Array.isArray(results.finishOrder)) {
        const map = {};
        results.finishOrder.forEach((id, i) => map[id] = i + 1);
        return map;
    }
    
    return results || {};
}

/**
 * Calculate driver statistics across races
 * @param {string} driverId - Driver ID
 * @param {Array} allRaces - All races array
 * @param {string} currentEventId - Current event ID filter
 * @returns {Object} Statistics object
 */
function calculateDriverStats(driverId, allRaces, currentEventId = null) {
    const stats = {
        dayWins: 0,
        dayRaces: 0,
        classWins: 0,
        classRaces: 0
    };
    
    const relevantRaces = currentEventId 
        ? allRaces.filter(r => r.eventId === currentEventId)
        : allRaces;
    
    relevantRaces.forEach(race => {
        if (!race.isComplete && race.status !== 'completed') return;
        
        const results = extractResults(race);
        const participants = getRaceParticipants(race);
        const driverInRace = participants.find(p => p.id === driverId);
        
        if (driverInRace) {
            stats.dayRaces += 1;
            const position = results[driverId] || results[driverInRace.name];
            
            if (position === 1) {
                stats.dayWins += 1;
            }
        }
    });
    
    return stats;
}

/**
 * Enrich race participants with statistics
 * @param {Array} participants - Array of participants
 * @param {Array} allRaces - All races array
 * @param {Object} currentRace - Current race being displayed
 * @param {string} currentEventId - Current event ID
 * @returns {Array} Enriched participants with stats
 */
function enrichParticipantsWithStats(participants, allRaces, currentRace, currentEventId) {
    const eventRaces = allRaces.filter(r => !r.eventId || r.eventId === currentEventId);
    const currentClass = currentRace.className || currentRace.class;
    
    return participants.map(participant => {
        const stats = {
            dayWins: 0,
            dayRaces: 0,
            classWins: 0,
            classRaces: 0
        };
        
        eventRaces.forEach(race => {
            if (!race.isComplete && race.status !== 'completed') return;
            
            const results = extractResults(race);
            const raceParticipants = getRaceParticipants(race);
            const isInRace = raceParticipants.find(p => p.id === participant.id);
            
            if (isInRace) {
                const position = results[participant.id] || results[participant.name];
                
                // Day stats
                stats.dayRaces += 1;
                if (position === 1) stats.dayWins += 1;
                
                // Class stats
                if ((race.className || race.class) === currentClass) {
                    stats.classRaces += 1;
                    if (position === 1) stats.classWins += 1;
                }
            }
        });
        
        return {
            ...participant,
            ...stats
        };
    });
}

/**
 * Format ordinal number (1st, 2nd, 3rd, etc.)
 * @param {number} n - Number to format
 * @returns {string} Formatted ordinal string
 */
function ordinal(n) {
    if (!n) return '';
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Format time to HH:MM
 * @param {string} timestamp - ISO timestamp
 * @returns {string} Formatted time string
 */
function formatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
}

/**
 * Format duration from milliseconds to HH:MM:SS
 * @param {number} milliseconds - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
function formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

/**
 * Infer last race completion time from races array
 * @param {Array} races - Array of races
 * @returns {number|null} Timestamp of last completed race
 */
function inferLastRaceTime(races) {
    const completedRaces = (races || [])
        .filter(r => r.status === 'completed' || r.results || r.endTime || r.completedAt)
        .map(r => new Date(r.endTime || r.completedAt || r.updatedAt || r.createdAt || 0).getTime())
        .sort((a, b) => b - a);
    
    return completedRaces[0] || null;
}

/**
 * Find active event from race activity
 * @param {Array} events - Array of events
 * @param {Array} allRaces - Array of all races
 * @returns {Object|null} Most active event
 */
function findEventFromRaceActivity(events, allRaces) {
    if (!events || events.length === 0) return null;
    
    const byEvent = new Map();
    (allRaces || []).forEach(r => {
        const id = r.eventId || r.event || (r.metadata && r.metadata.eventId);
        if (!id) return;
        const t = new Date(r.completedAt || r.updatedAt || r.createdAt || 0).getTime();
        const prev = byEvent.get(id) || 0;
        if (t > prev) byEvent.set(id, t);
    });
    
    let chosen = null;
    let best = -1;
    events.forEach(ev => {
        const score = byEvent.get(ev.id) || new Date(ev.updatedAt || ev.createdAt || 0).getTime();
        if (score > best) {
            best = score;
            chosen = ev;
        }
    });
    
    return chosen;
}

/**
 * Get lane color for visualization
 * @param {number} laneNumber - Lane number (1-5)
 * @returns {string} CSS color value
 */
function getLaneColor(laneNumber) {
    const colors = {
        1: '#4a90e2', // Blue
        2: '#ef4444', // Red
        3: '#fbbf24', // Yellow
        4: '#9b59b6', // Purple
        5: '#10b981'  // Green
    };
    return colors[laneNumber] || '#95a5a6';
}

/**
 * Get class color for visualization
 * @param {string} className - Class name
 * @returns {string} CSS color value
 */
function getClassColor(className) {
    const colors = {
        '1': '#4a90e2',
        '2': '#e74c3c',
        '3': '#f39c12',
        '4': '#9b59b6',
        '5': '#2ecc71',
        'Unknown': '#95a5a6'
    };
    return colors[className] || colors['Unknown'];
}

/**
 * Count remaining races in current class
 * @param {Array} races - All races array
 * @param {string} className - Current class name
 * @returns {number} Count of remaining races
 */
function countRemainingRacesInClass(races, className) {
    return races.filter(r => 
        (r.className === className || r.class === className) &&
        (r.status === 'scheduled' || r.status === 'pending' || r.status === 'upcoming' || !r.status)
    ).length;
}

// Export functions for use in other modules
if (typeof window !== 'undefined') {
    window.AnimatorUtils = {
        extractRacesFromBrackets,
        getRaceParticipants,
        extractResults,
        calculateDriverStats,
        enrichParticipantsWithStats,
        ordinal,
        formatTime,
        formatDuration,
        inferLastRaceTime,
        findEventFromRaceActivity,
        getLaneColor,
        getClassColor,
        countRemainingRacesInClass
    };
}

