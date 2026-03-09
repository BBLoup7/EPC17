/**
 * Driver Achievements System
 * Tracks and awards fun achievements based on race history.
 * Achievements are calculated on the fly from bracket data (no extra storage).
 *
 * @module achievements
 * Exports: window.AchievementsEngine
 *
 * Usage:
 *   const engine = new AchievementsEngine();
 *   const achievements = engine.calculate(participantId, allBrackets);
 */

class AchievementsEngine {
    constructor() {
        /**
         * Achievement definitions — each has:
         *   id, name, description, icon, rarity ('common'|'rare'|'epic'|'legendary')
         *   check(stats) — returns true if earned
         */
        this.definitions = [
            {
                id: 'first_win',
                name: 'First Blood',
                description: 'Win your very first race',
                icon: '🏆',
                rarity: 'common',
                check: (s) => s.totalWins >= 1
            },
            {
                id: 'win_streak_3',
                name: 'Hot Streak',
                description: 'Win 3 races in a row',
                icon: '🔥',
                rarity: 'rare',
                check: (s) => s.bestWinStreak >= 3
            },
            {
                id: 'win_streak_5',
                name: 'Unstoppable',
                description: 'Win 5 races in a row',
                icon: '⚡',
                rarity: 'epic',
                check: (s) => s.bestWinStreak >= 5
            },
            {
                id: 'race_10',
                name: 'Veteran',
                description: 'Complete 10 races',
                icon: '🎖️',
                rarity: 'common',
                check: (s) => s.totalRaces >= 10
            },
            {
                id: 'race_50',
                name: 'Road Warrior',
                description: 'Complete 50 races',
                icon: '🛡️',
                rarity: 'rare',
                check: (s) => s.totalRaces >= 50
            },
            {
                id: 'event_winner',
                name: 'Champion',
                description: 'Win a class in an event',
                icon: '👑',
                rarity: 'epic',
                check: (s) => s.classWins >= 1
            },
            {
                id: 'multi_class',
                name: 'Jack of All Trades',
                description: 'Race in 3 or more different classes',
                icon: '🃏',
                rarity: 'rare',
                check: (s) => s.uniqueClasses >= 3
            },
            {
                id: 'comeback_king',
                name: 'Comeback King',
                description: 'Win a race after being in the lower bracket',
                icon: '💪',
                rarity: 'rare',
                check: (s) => s.comebackWins >= 1
            },
            {
                id: 'perfect_event',
                name: 'Flawless Victory',
                description: 'Win every race in a class with no losses',
                icon: '💎',
                rarity: 'legendary',
                check: (s) => s.perfectEvents >= 1
            },
            {
                id: 'lane_master',
                name: 'Lane Master',
                description: 'Win from every lane position (1-4)',
                icon: '🎯',
                rarity: 'epic',
                check: (s) => s.uniqueWinLanes >= 4
            }
        ];
    }

    /**
     * Calculate all achievements for a participant.
     * @param {string} participantId
     * @param {Object} allBrackets - All event brackets (eventId -> bracket)
     * @returns {Object} { earned: [...], stats: {...} }
     */
    calculate(participantId, allBrackets) {
        const stats = this._computeStats(participantId, allBrackets);
        const earned = this.definitions
            .filter(def => def.check(stats))
            .map(def => ({
                id: def.id,
                name: def.name,
                description: def.description,
                icon: def.icon,
                rarity: def.rarity
            }));

        return { earned, stats, total: this.definitions.length };
    }

    /**
     * Compute aggregate stats needed for achievement checks.
     */
    _computeStats(participantId, allBrackets) {
        const stats = {
            totalRaces: 0,
            totalWins: 0,
            totalLosses: 0,
            bestWinStreak: 0,
            classWins: 0,
            uniqueClasses: 0,
            comebackWins: 0,
            perfectEvents: 0,
            uniqueWinLanes: 0,
            _winLanes: new Set(),
            _classes: new Set()
        };

        let currentStreak = 0;
        const raceResults = []; // chronological

        for (const [eventId, bracket] of Object.entries(allBrackets || {})) {
            if (!bracket || !bracket.classes) continue;

            for (const [className, classBracket] of Object.entries(bracket.classes)) {
                const participant = (classBracket.participants || []).find(p => p.id === participantId);
                if (!participant) continue;

                stats._classes.add(className);

                // Track if this is a class win
                if (classBracket.winner && classBracket.winner.id === participantId) {
                    stats.classWins++;

                    // Check for perfect event (0 losses)
                    if ((participant.losses || 0) === 0) {
                        stats.perfectEvents++;
                    }
                }

                // Check for comeback wins (won from lower bracket)
                if (classBracket.winner && classBracket.winner.id === participantId && 
                    participant.currentBracket === 'lower') {
                    stats.comebackWins++;
                }

                // Process heats
                for (const round of (classBracket.rounds || [])) {
                    for (const heat of (round.heats || [])) {
                        if (!heat.results || !Array.isArray(heat.results)) continue;
                        if (heat.status !== 'completed' && !heat.isComplete) continue;

                        const result = heat.results.find(r => r.participantId === participantId);
                        if (!result) continue;

                        stats.totalRaces++;
                        const isWin = result.position === 1;

                        if (isWin) {
                            stats.totalWins++;
                            currentStreak++;
                            stats.bestWinStreak = Math.max(stats.bestWinStreak, currentStreak);

                            // Track win lane
                            const lane = (heat.lanes || []).find(l => 
                                (l.participant?.id || l.participantId) === participantId
                            );
                            if (lane) stats._winLanes.add(lane.lane);
                        } else {
                            stats.totalLosses++;
                            currentStreak = 0;
                        }
                    }
                }
            }
        }

        stats.uniqueClasses = stats._classes.size;
        stats.uniqueWinLanes = stats._winLanes.size;
        delete stats._classes;
        delete stats._winLanes;

        return stats;
    }

    /**
     * Render achievements as HTML badges.
     * @param {Array} earned - Array of earned achievements
     * @returns {string} HTML
     */
    renderBadges(earned) {
        if (!earned || earned.length === 0) {
            return '<p style="color:var(--text-secondary);font-size:0.9rem;">No achievements yet — keep racing!</p>';
        }

        return `<div class="achievements-grid" style="display:flex;flex-wrap:wrap;gap:0.5rem;">
            ${earned.map(a => `
                <div class="achievement-badge achievement-${a.rarity}" title="${a.description}" style="
                    display:inline-flex;align-items:center;gap:0.4rem;
                    padding:0.35rem 0.65rem;border-radius:6px;font-size:0.8rem;font-weight:600;
                    border:1px solid ${a.rarity === 'legendary' ? '#ffd700' : a.rarity === 'epic' ? '#a855f7' : a.rarity === 'rare' ? '#3b82f6' : '#6b7280'};
                    background:${a.rarity === 'legendary' ? 'rgba(255,215,0,0.1)' : a.rarity === 'epic' ? 'rgba(168,85,247,0.1)' : a.rarity === 'rare' ? 'rgba(59,130,246,0.1)' : 'rgba(107,114,128,0.1)'};
                    color:var(--text-primary);
                ">
                    <span>${a.icon}</span>
                    <span>${a.name}</span>
                </div>
            `).join('')}
        </div>`;
    }
}

// Global export
if (typeof window !== 'undefined') {
    window.AchievementsEngine = AchievementsEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AchievementsEngine;
}
