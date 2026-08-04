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

                            // Normalize results so empty objects/arrays don't masquerade as completed
                            const rawResults = heat.results ?? heat.finishOrder ?? heat.finish_order ?? heat.raceResults ?? null;
                            let normalizedResults = rawResults;
                            if (Array.isArray(rawResults)) {
                                normalizedResults = rawResults.length > 0 ? rawResults : null;
                            } else if (rawResults && typeof rawResults === 'object') {
                                if (Array.isArray(rawResults.finishOrder)) {
                                    normalizedResults = rawResults.finishOrder.length > 0 ? rawResults : null;
                                } else {
                                    normalizedResults = Object.keys(rawResults).length > 0 ? rawResults : null;
                                }
                            } else if (!rawResults) {
                                normalizedResults = null;
                            }
                            
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
                                results: normalizedResults,
                                scheduledTime: heat.scheduledTime || heat.startTime,
                                // Result-entry timestamp (race.js sets endTime on record)
                                endTime: heat.endTime || heat.completedAt || null,
                                completedAt: heat.completedAt || heat.endTime || null,
                                // Avoid using "now" here; it breaks sorting and timers on refresh.
                                createdAt: heat.createdAt || heat.scheduledTime || heat.startTime || heat.completedAt || heat.endTime || null,
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
    const isMap = allParticipants instanceof Map;
    const safeParticipants = Array.isArray(allParticipants) ? allParticipants : (isMap ? Array.from(allParticipants.values()) : []);
    const byId = isMap ? allParticipants : new Map(safeParticipants.map(p => [p?.id, p]));

    // Helper to normalize a participant-ish object
    const normalize = (p, fallbackId, lane) => {
        const resolved = (p && typeof p === 'object') ? p : (byId.get(fallbackId) || {});
        const provisionalId = resolved.id || fallbackId || null;
        const name = resolved.name || resolved.fullName || resolved.driverName || (provisionalId ? `Driver ${String(provisionalId).slice(-4)}` : 'Driver');
        const id = resolved.id || fallbackId || name || null;
        return {
            id,
            lane,
            name,
            number: resolved.number ?? resolved.racingNumber ?? resolved.bibNumber,
            sponsor: resolved.sponsor || resolved.team || resolved.club,
            age: resolved.age,
            hometown: resolved.hometown || resolved.city || resolved.location,
            nickname: resolved.nickname,
            vehicleMake: resolved.vehicleMake,
            vehicleModel: resolved.vehicleModel,
            vehicleYear: resolved.vehicleYear,
            statistics: resolved.statistics || null
        };
    };

    // Prefer lanes, then participants fallback
    if (Array.isArray(race.lanes) && race.lanes.length > 0) {
        return race.lanes
            .map((l, idx) => {
                const lane = l?.lane || idx + 1;
                const participantObj = l?.participant && typeof l.participant === 'object' ? l.participant : null;
                const participantId = participantObj?.id || l?.participantId || l?.participant_id || l?.participant || null;
                const participantFromId = participantId ? byId.get(participantId) : null;
                return normalize(participantObj || participantFromId, participantId, lane);
            })
            .filter(p => p && (p.id || p.name));
    }

    if (Array.isArray(race.participants) && race.participants.length > 0) {
        return race.participants
            .map((entry, idx) => {
                const lane = entry?.lane || idx + 1;
                if (entry && typeof entry === 'object') {
                    const id = entry.id || entry.participantId || entry.participant || null;
                    const participantFromId = id ? byId.get(id) : null;
                    return normalize(entry.name ? entry : participantFromId, id, lane);
                }
                const id = entry;
                const participantFromId = byId.get(id);
                return normalize(participantFromId, id, lane);
            })
            .filter(p => p && (p.id || p.name));
    }

    return [];
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
function enrichParticipantsWithStats(participants, allRaces, currentRace, currentEventId, allParticipants = []) {
    const eventRaces = allRaces.filter(r => !r.eventId || r.eventId === currentEventId);
    const currentClass = currentRace.className || currentRace.class;
    const isMap = allParticipants instanceof Map;
    const safeAllParticipants = Array.isArray(allParticipants) ? allParticipants : (isMap ? Array.from(allParticipants.values()) : []);
    const byId = isMap ? allParticipants : new Map(safeAllParticipants.map(p => [p?.id, p]));
    
    return participants.map(participant => {
        const stats = {
            dayWins: 0,
            dayRaces: 0,
            classWins: 0,
            classRaces: 0,
            lastFinish: null,
            lastRaceNumber: null,
            lastRaceClassName: null
        };

        let lastCompletedAt = -1;
        
        eventRaces.forEach(race => {
            if (!race.isComplete && race.status !== 'completed') return;
            
            const results = extractResults(race);
            const raceParticipants = getRaceParticipants(race, byId);
            const isInRace = raceParticipants.find(p => p.id === participant.id);
            
            if (isInRace) {
                const position = results[participant.id] || results[participant.name];
                const completedAt = new Date(race.completedAt || race.endTime || race.updatedAt || race.createdAt || 0).getTime();
                
                // Day stats
                stats.dayRaces += 1;
                if (position === 1) stats.dayWins += 1;
                
                // Class stats
                if ((race.className || race.class) === currentClass) {
                    stats.classRaces += 1;
                    if (position === 1) stats.classWins += 1;
                }

                // Last finish
                if (completedAt > lastCompletedAt && position) {
                    lastCompletedAt = completedAt;
                    stats.lastFinish = position;
                    stats.lastRaceNumber = race.raceNumber || race.heatNumber || null;
                    stats.lastRaceClassName = race.className || race.class || null;
                }
            }
        });

        const full = byId.get(participant.id) || {};
        
        return {
            ...participant,
            ...stats,
            // Prefer full participant record fields if present
            sponsor: participant.sponsor || full.sponsor,
            hometown: participant.hometown || full.hometown,
            age: participant.age || full.age,
            number: participant.number || full.number || full.racingNumber,
            statistics: participant.statistics || full.statistics || null
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
 * Infer last result-entry time from races array.
 * Uses only endTime / completedAt (never createdAt / scheduled / page-load).
 * @param {Array} races - Array of races
 * @returns {number|null} Timestamp of latest result entry, or null if none
 */
function inferLastRaceTime(races) {
    const completedRaces = (races || [])
        .filter(r => {
            if (r?.status === 'completed' || r?.isComplete) return true;
            if (r?.endTime || r?.completedAt) return true;
            const results = r?.results || r?.raceResults || r?.finishOrder;
            if (Array.isArray(results)) return results.length > 0;
            if (results && typeof results === 'object') {
                if (Array.isArray(results.finishOrder)) return results.finishOrder.length > 0;
                return Object.keys(results).length > 0;
            }
            return false;
        })
        .map(r => new Date(r.endTime || r.completedAt || 0).getTime())
        .filter(t => Number.isFinite(t) && t > 0)
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

