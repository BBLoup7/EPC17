/**
 * Animator Renderer Module
 * Pure rendering functions with GSAP animations
 * Part of EPC17 Animator Page Rework
 */

/**
 * Render the next races list (left panel)
 * @param {Array} nextRaces - Array of upcoming races (max 3)
 * @param {HTMLElement} container - Container element
 */
function renderNextRacesList(nextRaces, container) {
    if (!container) return;
    
    if (nextRaces.length === 0) {
        container.innerHTML = '<div class="empty-state">No upcoming races</div>';
        return;
    }
    
    container.innerHTML = nextRaces.map(race => createMiniRaceCard(race)).join('');
}

/**
 * Create a mini race card HTML (for next/previous panels)
 * @param {Object} race - Race object
 * @returns {string} HTML string
 */
function createMiniRaceCard(race) {
    const className = race.className || race.class || 'Unknown';
    const classColor = window.AnimatorUtils.getClassColor(className);
    const participants = window.AnimatorUtils.getRaceParticipants(race);
    
    let lanesHtml = '';
    if (participants.length === 0) {
        lanesHtml = '<span class="meta">No participants</span>';
    } else if (participants.length <= 2) {
        // Side by side for 2 or fewer
        lanesHtml = participants.map(p => 
            `<div class="lane-horizontal">
                <span class="lane-number">L${p.lane}</span>
                <span class="driver-name">${p.name}</span>
            </div>`
        ).join('');
    } else {
        // Stacked for 3+
        lanesHtml = participants.map(p => 
            `<div class="lane-vertical">
                <span class="lane-number">L${p.lane}</span>
                <span class="driver-name">${p.name}</span>
            </div>`
        ).join('');
    }
    
    return `<div class="mini-race" style="border-left: 3px solid ${classColor}">
        <div class="top">
            <div class="title">Race #${race.raceNumber || 'TBD'} • ${className}</div>
            <div class="meta">${(race.bracketType || 'upper').toUpperCase()}</div>
        </div>
        <div class="lanes ${participants.length <= 2 ? 'horizontal' : 'vertical'}">${lanesHtml}</div>
    </div>`;
}

/**
 * Render previous races list (right panel)
 * @param {Array} previousRaces - Array of completed races (max 3)
 * @param {HTMLElement} container - Container element
 */
function renderPreviousRacesList(previousRaces, container) {
    if (!container) return;
    
    container.innerHTML = '';
    
    if (previousRaces.length === 0) {
        container.innerHTML = '<div class="empty-state">No completed races</div>';
        return;
    }
    
    previousRaces.forEach((race, index) => {
        const card = document.createElement('div');
        card.className = 'prev-card';
        card.innerHTML = createPreviousRaceCardHTML(race);
        container.appendChild(card);
        
        // Stagger animation
        setTimeout(() => {
            requestAnimationFrame(() => card.classList.add('show'));
        }, index * 100);
    });
}

/**
 * Create previous race card HTML with results
 * @param {Object} race - Race object
 * @returns {string} HTML string
 */
function createPreviousRaceCardHTML(race) {
    const className = race.className || race.class || 'Unknown';
    const participants = window.AnimatorUtils.getRaceParticipants(race);
    const results = window.AnimatorUtils.extractResults(race);
    const time = window.AnimatorUtils.formatTime(race.completedAt || race.updatedAt || race.createdAt);
    
    // Sort by position
    const sortedParticipants = participants.sort((a, b) => {
        const posA = results[a.id] || results[a.name] || a.position || 999;
        const posB = results[b.id] || results[b.name] || b.position || 999;
        return posA - posB;
    });
    
    const lanesHtml = sortedParticipants.map(p => {
        const pos = results[p.id] || results[p.name] || p.position || null;
        const posTxt = pos ? window.AnimatorUtils.ordinal(pos) : '';
        const isWinner = pos === 1;
        const positionClass = isWinner ? 'winner' : pos === 2 ? 'second' : pos === 3 ? 'third' : '';
        
        return `<div class="p ${positionClass}">
            <span class="position">${posTxt || '—'}</span>
            <span class="driver-info">L${p.lane} • ${p.name}</span>
            ${isWinner ? '<span class="trophy">🏆</span>' : ''}
        </div>`;
    }).join('');
    
    return `<div class="head">
        <div class="title">Race #${race.raceNumber || 'TBD'} • ${className}</div>
        <div class="time">${time}</div>
    </div>
    <div class="lanes">${lanesHtml || '<span class="meta">No participants</span>'}</div>`;
}

/**
 * Render current race in center panel
 * @param {Object} race - Current race object
 * @param {Array} allRaces - All races for stats calculation
 * @param {string} currentEventId - Current event ID
 * @param {HTMLElement} container - Container element
 */
function renderCurrentRace(race, allRaces, currentEventId, container) {
    if (!container) return;
    
    if (!race) {
        container.innerHTML = `<div class="driver-card">
            <div class="driver-name">No Upcoming Race</div>
            <div class="driver-sub">All races may be completed</div>
        </div>`;
        return;
    }
    
    const participants = window.AnimatorUtils.getRaceParticipants(race);
    const enrichedParticipants = window.AnimatorUtils.enrichParticipantsWithStats(
        participants, 
        allRaces, 
        race, 
        currentEventId
    );
    
    container.innerHTML = enrichedParticipants.map(driver => 
        createDriverCard(driver, race)
    ).join('');
}

/**
 * Create driver card HTML for center panel
 * @param {Object} driver - Driver object with stats
 * @param {Object} race - Current race
 * @returns {string} HTML string
 */
function createDriverCard(driver, race) {
    const laneClass = `lane-${driver.lane}`;
    
    return `<div class="driver-card ${laneClass}">
        <div class="lane-accent"></div>
        <div class="driver-header">
            <div class="driver-name">
                ${driver.name} 
                <span style="opacity: 0.6; font-weight: 600">#${driver.number || '—'}</span>
            </div>
            <div class="lane-badge">Lane ${driver.lane}</div>
        </div>
        <div class="driver-sub">
            ${driver.sponsor || '—'} • ${driver.age ? driver.age + ' yrs' : 'Age —'}
        </div>
        <div class="driver-stats">
            <div class="stat">
                <div class="v">${driver.dayWins || 0}</div>
                <div class="k">Wins</div>
            </div>
            <div class="stat">
                <div class="v">${driver.dayRaces || 0}</div>
                <div class="k">Races</div>
            </div>
            <div class="stat">
                <div class="v">${driver.classWins || 0}/${driver.classRaces || 0}</div>
                <div class="k">Class</div>
            </div>
        </div>
    </div>`;
}

/**
 * Animate race transition (slide out old, slide in new)
 * @param {HTMLElement} container - Container element
 * @param {string} newHTML - New HTML content
 * @param {Function} callback - Callback after animation completes
 */
function animateRaceTransition(container, newHTML, callback) {
    if (!window.gsap) {
        // Fallback to instant update if GSAP not loaded
        container.innerHTML = newHTML;
        if (callback) callback();
        return;
    }
    
    const exitingContent = container.innerHTML;
    
    if (!exitingContent.trim()) {
        // No existing content, just animate in
        container.innerHTML = newHTML;
        const children = Array.from(container.children);
        
        gsap.fromTo(children, 
            { opacity: 0, y: 40, scale: 0.95 },
            { 
                opacity: 1, 
                y: 0, 
                scale: 1, 
                duration: 0.6,
                stagger: 0.1,
                ease: 'power2.out',
                onComplete: callback
            }
        );
        return;
    }
    
    // Animate out existing content
    const children = Array.from(container.children);
    gsap.to(children, {
        opacity: 0,
        y: -40,
        scale: 0.95,
        duration: 0.5,
        stagger: 0.05,
        ease: 'power2.in',
        onComplete: () => {
            // Replace content
            container.innerHTML = newHTML;
            
            // Animate in new content
            const newChildren = Array.from(container.children);
            gsap.fromTo(newChildren,
                { opacity: 0, y: 40, scale: 0.95 },
                {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    duration: 0.6,
                    stagger: 0.1,
                    ease: 'power2.out',
                    onComplete: callback
                }
            );
        }
    });
}

/**
 * Show race complete overlay
 * @param {Object} race - Completed race
 * @param {HTMLElement} container - Container element
 * @param {number} duration - Display duration in ms
 * @param {Function} callback - Callback after overlay dismisses
 */
function showRaceCompleteOverlay(race, container, duration = 2000, callback) {
    if (!container) return;
    
    const results = window.AnimatorUtils.extractResults(race);
    const participants = window.AnimatorUtils.getRaceParticipants(race);
    const winner = participants.find(p => results[p.id] === 1 || results[p.name] === 1);
    
    const overlay = document.createElement('div');
    overlay.className = 'race-complete-overlay';
    overlay.innerHTML = `
        <div class="overlay-content">
            <div class="overlay-title">RACE COMPLETE!</div>
            <div class="overlay-subtitle">
                Race #${race.raceNumber || 'TBD'} • ${race.className || race.class || 'Unknown'}
            </div>
            ${winner ? `<div class="overlay-winner">Winner: ${winner.name}</div>` : ''}
        </div>
    `;
    
    container.style.position = 'relative';
    container.appendChild(overlay);
    
    // Animate in
    if (window.gsap) {
        gsap.fromTo(overlay,
            { opacity: 0, scale: 0.8 },
            {
                opacity: 1,
                scale: 1,
                duration: 0.5,
                ease: 'back.out(1.7)'
            }
        );
        
        // Animate out after duration
        setTimeout(() => {
            gsap.to(overlay, {
                opacity: 0,
                scale: 0.8,
                duration: 0.5,
                ease: 'power2.in',
                onComplete: () => {
                    if (container.contains(overlay)) {
                        container.removeChild(overlay);
                    }
                    if (callback) callback();
                }
            });
        }, duration);
    } else {
        // Fallback without animation
        setTimeout(() => {
            if (container.contains(overlay)) {
                container.removeChild(overlay);
            }
            if (callback) callback();
        }, duration);
    }
}

/**
 * Show race results display
 * @param {Object} race - Completed race
 * @param {HTMLElement} container - Container element
 * @param {number} duration - Display duration in ms
 * @param {Function} callback - Callback after results dismiss
 */
function showRaceResults(race, container, duration = 6000, callback) {
    if (!container) return;
    
    const results = window.AnimatorUtils.extractResults(race);
    const participants = window.AnimatorUtils.getRaceParticipants(race);
    
    // Sort by position
    const sortedParticipants = participants.sort((a, b) => {
        const posA = results[a.id] || results[a.name] || a.position || 999;
        const posB = results[b.id] || results[b.name] || b.position || 999;
        return posA - posB;
    });
    
    const resultsHTML = sortedParticipants.map(p => {
        const pos = results[p.id] || results[p.name] || p.position || null;
        const posTxt = pos ? window.AnimatorUtils.ordinal(pos) : '';
        const isWinner = pos === 1;
        const positionClass = isWinner ? 'winner' : pos === 2 ? 'second' : pos === 3 ? 'third' : '';
        
        return `<div class="result-row ${positionClass}">
            <div class="result-info">
                <span class="result-position">${posTxt || '—'}</span>
                <span class="result-driver">L${p.lane} • ${p.name}</span>
            </div>
            ${isWinner ? '<span class="result-trophy">🏆</span>' : ''}
        </div>`;
    }).join('');
    
    const resultsDisplay = document.createElement('div');
    resultsDisplay.className = 'race-results-display';
    resultsDisplay.innerHTML = `
        <div class="results-header">
            <div class="results-title">RACE RESULTS</div>
            <div class="results-subtitle">
                Race #${race.raceNumber || 'TBD'} • ${race.className || race.class || 'Unknown'}
            </div>
        </div>
        <div class="results-list">${resultsHTML}</div>
    `;
    
    container.style.position = 'relative';
    container.appendChild(resultsDisplay);
    
    // Animate in
    if (window.gsap) {
        gsap.fromTo(resultsDisplay,
            { opacity: 0, y: 20, scale: 0.95 },
            {
                opacity: 1,
                y: 0,
                scale: 1,
                duration: 0.6,
                ease: 'power2.out'
            }
        );
        
        // Slide to right after duration
        setTimeout(() => {
            gsap.to(resultsDisplay, {
                opacity: 0,
                x: window.innerWidth,
                scale: 0.9,
                duration: 0.8,
                ease: 'power2.in',
                onComplete: () => {
                    if (container.contains(resultsDisplay)) {
                        container.removeChild(resultsDisplay);
                    }
                    if (callback) callback();
                }
            });
        }, duration);
    } else {
        // Fallback
        setTimeout(() => {
            if (container.contains(resultsDisplay)) {
                container.removeChild(resultsDisplay);
            }
            if (callback) callback();
        }, duration);
    }
}

/**
 * Update header information
 * @param {Object} event - Current event
 * @param {number} timeSinceLastRace - Milliseconds since last race
 * @param {number} racesRemaining - Races remaining in current class
 */
function updateHeader(event, timeSinceLastRace, racesRemaining) {
    const eventNameEl = document.getElementById('event-name');
    const timerEl = document.querySelector('.race-timer .t');
    const racesLeftEl = document.getElementById('races-left');
    
    if (eventNameEl) {
        eventNameEl.textContent = event ? event.name : 'No Active Event';
    }
    
    if (timerEl) {
        timerEl.textContent = window.AnimatorUtils.formatDuration(timeSinceLastRace);
    }
    
    if (racesLeftEl) {
        racesLeftEl.textContent = racesRemaining > 0 ? `${racesRemaining} heats left` : 'All races complete';
    }
}

// Export functions
if (typeof window !== 'undefined') {
    window.AnimatorRenderer = {
        renderNextRacesList,
        renderPreviousRacesList,
        renderCurrentRace,
        animateRaceTransition,
        showRaceCompleteOverlay,
        showRaceResults,
        updateHeader
    };
}

