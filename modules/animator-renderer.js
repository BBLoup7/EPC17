/**
 * Animator Renderer Module
 * Pure rendering functions with GSAP animations
 * Part of EPC17 Animator Page Rework
 */

/**
 * Render the next races list (left panel)
 * @param {Array} nextRaces - Array of upcoming races (max 3)
 * @param {HTMLElement} container - Container element
 * @param {Array} allParticipants - Participant list for name resolution
 */
function renderNextRacesList(nextRaces, container, allParticipants = []) {
    if (!container) return;
    
    if (nextRaces.length === 0) {
        container.innerHTML = '<div class="empty-state">No upcoming races</div>';
        container.removeAttribute('data-sig');
        return;
    }
    
    const signature = nextRaces.map(r => r?.id || '').join('|');
    const prevSig = container.getAttribute('data-sig') || '';

    if (signature === prevSig && container.children.length > 0) {
        return;
    }

    container.innerHTML = nextRaces.map(race => createMiniRaceCard(race, allParticipants)).join('');
    container.setAttribute('data-sig', signature);

    // Animate list only on first paint (avoids blink on poll rebuilds)
    if (window.gsap && !prevSig && signature) {
        const cards = Array.from(container.children);
        gsap.fromTo(cards, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.25, stagger: 0.05, ease: 'power2.out' });
    }
}

/**
 * Create a mini race card HTML (for next/previous panels)
 * @param {Object} race - Race object
 * @param {Array} allParticipants - Participant list for name resolution
 * @returns {string} HTML string
 */
function createMiniRaceCard(race, allParticipants = []) {
    const className = race.className || race.class || 'Unknown';
    const classColor = window.AnimatorUtils.getClassColor(className);
    const participants = window.AnimatorUtils.getRaceParticipants(race, allParticipants);
    const raceId = race.id || '';
    const raceNo = race.raceNumber || 'TBD';
    
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
    
    return `<div class="mini-race" data-action="pin" data-race-id="${raceId}" role="button" tabindex="0" aria-label="Pin Race ${raceNo}" style="border-left: 3px solid ${classColor}">
        <div class="top">
            <div class="title">Race #${raceNo} • ${className}</div>
            <div class="meta">${(race.bracketType || 'upper').toUpperCase()}</div>
        </div>
        <div class="lanes ${participants.length <= 2 ? 'horizontal' : 'vertical'}">${lanesHtml}</div>
    </div>`;
}

/**
 * Render previous races list (right panel)
 * @param {Array} previousRaces - Array of completed races (max 3)
 * @param {HTMLElement} container - Container element
 * @param {Array} allParticipants - Participant list for name resolution
 */
function renderPreviousRacesList(previousRaces, container, allParticipants = []) {
    if (!container) return;

    if (previousRaces.length === 0) {
        container.innerHTML = '<div class="empty-state">No completed races</div>';
        container.removeAttribute('data-sig');
        return;
    }

    const signature = previousRaces.map(r => r?.id || '').join('|');
    const prevSig = container.getAttribute('data-sig') || '';
    if (signature === prevSig && container.children.length > 0) {
        return;
    }

    container.innerHTML = '';
    container.setAttribute('data-sig', signature);

    // Only stagger opacity intro on first paint; later rebuilds show immediately (no flash)
    const animateIn = !prevSig;

    previousRaces.forEach((race, index) => {
        const card = document.createElement('div');
        card.className = animateIn ? 'prev-card' : 'prev-card show';
        card.setAttribute('data-action', 'replay');
        card.setAttribute('data-race-id', race.id || '');
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `Replay results for Race ${race.raceNumber || 'TBD'}`);
        card.innerHTML = createPreviousRaceCardHTML(race, allParticipants);
        container.appendChild(card);
        
        if (animateIn) {
            setTimeout(() => {
                requestAnimationFrame(() => card.classList.add('show'));
            }, index * 100);
        }
    });
}

/**
 * Create previous race card HTML with results
 * @param {Object} race - Race object
 * @param {Array} allParticipants - Participant list for name resolution
 * @returns {string} HTML string
 */
function createPreviousRaceCardHTML(race, allParticipants = []) {
    const className = race.className || race.class || 'Unknown';
    const participants = window.AnimatorUtils.getRaceParticipants(race, allParticipants);
    const results = window.AnimatorUtils.extractResults(race);
    const time = window.AnimatorUtils.formatTime(race.endTime || race.completedAt);
    
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
 * Create a DOM element for a previous race card (used for continuous-motion transitions).
 * @param {Object} race
 * @param {Array|Map} allParticipants
 * @returns {HTMLDivElement}
 */
function createPreviousRaceCardElement(race, allParticipants = []) {
    const el = document.createElement('div');
    el.className = 'prev-card show';
    el.setAttribute('data-action', 'replay');
    el.setAttribute('data-race-id', race?.id || '');
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', `Replay results for Race ${race?.raceNumber || 'TBD'}`);
    el.innerHTML = createPreviousRaceCardHTML(race, allParticipants);
    return el;
}

/**
 * Render current race in center panel
 * @param {Object} race - Current race object
 * @param {Array} allRaces - All races for stats calculation
 * @param {string} currentEventId - Current event ID
 * @param {HTMLElement} container - Container element
 * @param {Array} allParticipants - Participant list for name resolution
 */
function renderCurrentRace(race, allRaces, currentEventId, container, allParticipants = []) {
    if (!container) return;

    const prevRaceId = container.getAttribute('data-current-race-id') || '';
    const nextRaceId = race?.id || 'none';

    let newHTML = '';
    if (!race) {
        newHTML = `<div class="driver-card">
            <div class="driver-name">No Upcoming Race</div>
            <div class="driver-sub">All races may be completed</div>
        </div>`;
    } else {
        const participants = window.AnimatorUtils.getRaceParticipants(race, allParticipants);
        const enrichedParticipants = window.AnimatorUtils.enrichParticipantsWithStats(
            participants,
            allRaces,
            race,
            currentEventId,
            allParticipants
        );

        if (enrichedParticipants.length === 0) {
            const raceNo = race.raceNumber || 'TBD';
            const className = race.className || race.class || '';
            newHTML = `<div class="empty-state">Race #${raceNo}${className ? ` • ${className}` : ''} has no participants yet</div>`;
            container.setAttribute('data-content-sig', 'empty-participants');
        } else {
            newHTML = enrichedParticipants.map(driver => createDriverCard(driver, race)).join('');

            // Avoid resetting hover/animations on periodic refreshes if the displayed data is unchanged.
            const sig = enrichedParticipants
                .map(d => [
                    d.id,
                    d.lane,
                    d.dayWins,
                    d.dayRaces,
                    d.classWins,
                    d.classRaces,
                    d.lastFinish,
                    d.lastRaceNumber,
                    d.lastRaceClassName,
                    d.sponsor,
                    d.hometown,
                    d.age,
                    d.number,
                    d.vehicleYear,
                    d.vehicleMake,
                    d.vehicleModel,
                    d.statistics?.totalWins,
                    d.statistics?.totalRaces,
                    d.statistics?.winRate,
                    d.statistics?.avgPosition,
                    d.statistics?.bestStreak,
                    d.statistics?.bestPosition,
                    d.statistics?.recentWinRate,
                    d.statistics?.eventsParticipated,
                    d.statistics?.totalLosses
                ].join(':'))
                .join('|');

            const prevContentSig = container.getAttribute('data-content-sig') || '';
            if (prevRaceId && prevRaceId === nextRaceId && prevContentSig === sig) {
                return;
            }
            container.setAttribute('data-content-sig', sig);
        }
    }

    // Only animate when the displayed race changes
    if (prevRaceId && prevRaceId !== nextRaceId) {
        container.setAttribute('data-current-race-id', nextRaceId);
        animateRaceTransition(container, newHTML);
        return;
    }

    container.setAttribute('data-current-race-id', nextRaceId);
    container.innerHTML = newHTML;
}

/**
 * Create driver card HTML for center panel
 * @param {Object} driver - Driver object with stats
 * @param {Object} race - Current race
 * @returns {string} HTML string
 */
function createDriverCard(driver, race) {
    const laneClass = `lane-${driver.lane}`;
    const stats = driver?.statistics && typeof driver.statistics === 'object' ? driver.statistics : {};
    const overallWins = Number.isFinite(stats.totalWins) ? stats.totalWins : null;
    const overallRaces = Number.isFinite(stats.totalRaces) ? stats.totalRaces : null;
    const winRate = Number.isFinite(stats.winRate) ? stats.winRate : null;
    const avgPosition = Number.isFinite(stats.avgPosition) ? stats.avgPosition : null;
    const bestStreak = Number.isFinite(stats.bestStreak) ? stats.bestStreak : null;
    const bestPosition = Number.isFinite(stats.bestPosition) ? stats.bestPosition : null;
    const recentWinRate = Number.isFinite(stats.recentWinRate) ? stats.recentWinRate : null;
    const eventsParticipated = Number.isFinite(stats.eventsParticipated) ? stats.eventsParticipated : null;
    const totalLosses = Number.isFinite(stats.totalLosses) ? stats.totalLosses : null;

    const sled = [driver.vehicleYear, driver.vehicleMake, driver.vehicleModel].filter(Boolean).join(' ');
    const nickname = driver.nickname ? `"${driver.nickname}"` : '';
    const lastRaceLabel = driver.lastRaceNumber ? `Race #${driver.lastRaceNumber}` : 'Last race';
    const lastFinishLabel = driver.lastFinish ? window.AnimatorUtils.ordinal(driver.lastFinish) : '—';
    const lastClassLabel = driver.lastRaceClassName ? `Class ${driver.lastRaceClassName}` : null;
    const lastBoxLabel = [lastRaceLabel, lastClassLabel].filter(Boolean).join(' • ') || 'Last race';
    
    return `<div class="driver-card ${laneClass}" tabindex="0" data-participant-id="${String(driver.id || '')}" data-lane="${String(driver.lane || '')}">
        <div class="lane-accent"></div>
        <div class="driver-header">
            <div class="driver-name">
                ${driver.name} ${nickname ? `<span class="driver-nickname">${nickname}</span>` : ''}
                <span style="opacity: 0.6; font-weight: 600">#${driver.number || '—'}</span>
            </div>
            <div class="driver-badges">
                <div class="finish-badge" aria-hidden="true"></div>
                <div class="lane-badge">Lane ${driver.lane}</div>
            </div>
        </div>
        <div class="driver-sub">
            ${driver.sponsor || '—'} • ${driver.hometown || 'Hometown —'} • ${driver.age ? driver.age + ' yrs' : 'Age —'}
        </div>
        <div class="driver-stats">
            <div class="stat">
                <div class="v">${driver.dayWins || 0}/${driver.dayRaces || 0}</div>
                <div class="k">Today (W/R)</div>
            </div>
            <div class="stat">
                <div class="v">${driver.classWins || 0}/${driver.classRaces || 0}</div>
                <div class="k">This Class</div>
            </div>
            <div class="stat">
                <div class="v">${lastFinishLabel}</div>
                <div class="k">${lastBoxLabel}</div>
            </div>
            <div class="stat">
                <div class="v">${overallWins != null && overallRaces != null ? `${overallWins}/${overallRaces}` : '—'}</div>
                <div class="k">Career (W/R)</div>
            </div>
            <div class="stat">
                <div class="v">${winRate != null ? `${winRate}%` : '—'}</div>
                <div class="k">Career Win%</div>
            </div>
            <div class="stat">
                <div class="v">${recentWinRate != null ? `${recentWinRate}%` : '—'}</div>
                <div class="k">Recent Win%</div>
            </div>
        </div>
        <div class="driver-more" aria-hidden="true">
            <div class="more-grid">
                <div class="more-item">
                    <div class="k">Overall</div>
                    <div class="v">${overallWins != null && overallRaces != null ? `${overallWins}/${overallRaces}` : '—'}</div>
                </div>
                <div class="more-item">
                    <div class="k">Win Rate</div>
                    <div class="v">${winRate != null ? `${winRate}%` : '—'}</div>
                </div>
                <div class="more-item">
                    <div class="k">Avg Pos</div>
                    <div class="v">${avgPosition != null ? avgPosition : '—'}</div>
                </div>
                <div class="more-item">
                    <div class="k">Best Streak</div>
                    <div class="v">${bestStreak != null ? bestStreak : '—'}</div>
                </div>
                <div class="more-item">
                    <div class="k">Career Best</div>
                    <div class="v">${bestPosition != null ? window.AnimatorUtils.ordinal(bestPosition) : '—'}</div>
                </div>
                <div class="more-item">
                    <div class="k">Recent</div>
                    <div class="v">${recentWinRate != null ? `${recentWinRate}%` : '—'}</div>
                </div>
                <div class="more-item">
                    <div class="k">Events</div>
                    <div class="v">${eventsParticipated != null ? eventsParticipated : '—'}</div>
                </div>
                <div class="more-item">
                    <div class="k">Losses</div>
                    <div class="v">${totalLosses != null ? totalLosses : '—'}</div>
                </div>
                ${sled ? `<div class="more-item more-wide"><div class="k">Sled</div><div class="v">${sled}</div></div>` : ''}
            </div>
        </div>
    </div>`;
}

/**
 * Cinematic finish-order reveal in the center panel.
 * Reorders cards by finish position (FLIP) and then highlights each finisher in order.
 * @param {Object} race
 * @param {HTMLElement} container
 * @param {Array|Map} allParticipants
 * @param {Object} options
 * @returns {Promise<void>}
 */
function animateFinishReveal(race, container, allParticipants = [], options = {}) {
    return new Promise((resolve) => {
        if (!container || !race) {
            resolve();
            return;
        }

        const focusMs = typeof options.focusMs === 'number' ? options.focusMs : 900;
        const gapMs = typeof options.gapMs === 'number' ? options.gapMs : 250;
        const focusScale = typeof options.focusScale === 'number' ? options.focusScale : 1.08;

        const results = window.AnimatorUtils.extractResults(race);
        const participants = window.AnimatorUtils.getRaceParticipants(race, allParticipants);
        const ordered = [...participants].sort((a, b) => {
            const pa = results[a.id] ?? results[a.name] ?? 999;
            const pb = results[b.id] ?? results[b.name] ?? 999;
            if (pa !== pb) return pa - pb;
            return (a.lane || 999) - (b.lane || 999);
        });

        const cards = Array.from(container.querySelectorAll('.driver-card'));
        if (cards.length === 0 || ordered.length === 0 || !window.gsap) {
            resolve();
            return;
        }

        const byPid = new Map(cards.map(el => [el.getAttribute('data-participant-id') || '', el]));
        const orderedCards = ordered
            .map(p => byPid.get(String(p.id || '')) || null)
            .filter(Boolean);

        // Assign finish positions + badges for clear visual sorting
        container.classList.add('finish-mode');
        ordered.forEach((p) => {
            const pos = results[p.id] ?? results[p.name] ?? null;
            const card = byPid.get(String(p.id || ''));
            if (!card || !pos) return;
            card.setAttribute('data-finish-position', String(pos));
            const badge = card.querySelector('.finish-badge');
            if (badge) {
                badge.textContent = window.AnimatorUtils.ordinal(pos);
                badge.classList.remove('pos-1', 'pos-2', 'pos-3', 'pos-4', 'pos-5');
                badge.classList.add(`pos-${pos}`);
            }
        });

        // FLIP reorder (manual, no GSAP Flip plugin)
        const firstRects = new Map();
        cards.forEach(el => firstRects.set(el, el.getBoundingClientRect()));

        orderedCards.forEach(el => container.appendChild(el));

        const lastRects = new Map();
        orderedCards.forEach(el => lastRects.set(el, el.getBoundingClientRect()));

        orderedCards.forEach(el => {
            const first = firstRects.get(el);
            const last = lastRects.get(el);
            if (!first || !last) return;
            const dx = first.left - last.left;
            const dy = first.top - last.top;
            gsap.set(el, { x: dx, y: dy });
        });

        gsap.to(orderedCards, {
            x: 0,
            y: 0,
            duration: 0.45,
            ease: 'power2.out',
            onComplete: () => {
                // Sequential highlight (arrival order)
                const tl = gsap.timeline({
                    onComplete: () => {
                        gsap.to(cards, { opacity: 1, scale: 1, duration: 0.25, ease: 'power2.out' });
                        // Keep finish badges visible during the sequence, but clear mode afterwards
                        container.classList.remove('finish-mode');
                        resolve();
                    }
                });

                orderedCards.forEach((focusEl) => {
                    const others = cards.filter(c => c !== focusEl);
                    tl.to(
                        others,
                        { opacity: 0.25, scale: 0.98, duration: 0.15, ease: 'power2.out' },
                        '>'
                    );
                    tl.to(
                        focusEl,
                        { opacity: 1, scale: focusScale, duration: 0.18, ease: 'power2.out' },
                        '<'
                    );
                    tl.to(focusEl, { duration: focusMs / 1000 }, '>');
                    tl.to(
                        focusEl,
                        { scale: 1.0, duration: 0.18, ease: 'power2.inOut' },
                        '>'
                    );
                    tl.to({}, { duration: gapMs / 1000 });
                });
            }
        });
    });
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
    const participants = window.AnimatorUtils.getRaceParticipants(race, window.animatorController?.participantsById || window.animatorController?.participants || []);
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
    const participants = window.AnimatorUtils.getRaceParticipants(race, window.animatorController?.participantsById || window.animatorController?.participants || []);
    
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
 * @param {number|null} timeSinceLastRace - Milliseconds since last result entry, or null if idle
 * @param {number|Object} remainingInfo - Remaining heats info (number or { totalRemaining, className, classRemaining })
 */
function updateHeader(event, timeSinceLastRace, remainingInfo) {
    const eventNameEl = document.getElementById('event-name');
    const timerEl = document.querySelector('.race-timer .t');
    const racesLeftEl = document.getElementById('races-left');
    
    if (eventNameEl) {
        eventNameEl.textContent = event ? event.name : 'No Active Event';
    }
    
    if (timerEl) {
        if (timeSinceLastRace == null || !Number.isFinite(timeSinceLastRace)) {
            timerEl.textContent = '—';
        } else {
            timerEl.textContent = window.AnimatorUtils.formatDuration(timeSinceLastRace);
        }
    }
    
    if (racesLeftEl) {
        let totalRemaining = 0;
        let className = null;
        let classRemaining = null;

        if (typeof remainingInfo === 'number') {
            totalRemaining = remainingInfo;
        } else if (remainingInfo && typeof remainingInfo === 'object') {
            totalRemaining = Number(remainingInfo.totalRemaining || 0);
            className = remainingInfo.className || null;
            classRemaining = remainingInfo.classRemaining ?? null;
        }

        if (totalRemaining > 0) {
            if (className && typeof classRemaining === 'number') {
                racesLeftEl.textContent = `${totalRemaining} heats left • Class ${className}: ${classRemaining}`;
            } else {
                racesLeftEl.textContent = `${totalRemaining} heats left`;
            }
        } else {
            racesLeftEl.textContent = 'All races complete';
        }
    }
}

// Export functions
if (typeof window !== 'undefined') {
    window.AnimatorRenderer = {
        renderNextRacesList,
        renderPreviousRacesList,
        renderCurrentRace,
        animateRaceTransition,
        animateFinishReveal,
        createPreviousRaceCardElement,
        showRaceCompleteOverlay,
        showRaceResults,
        updateHeader
    };
}

