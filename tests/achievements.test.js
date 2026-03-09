/**
 * Tests for AchievementsEngine module
 * Pure function — no DOM or network dependencies.
 */

globalThis.window = globalThis;
globalThis.module = undefined;

await import('../modules/achievements.js');
const AchievementsEngine = globalThis.AchievementsEngine;

describe('AchievementsEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new AchievementsEngine();
    });

    function makeBracket(classData) {
        return { classes: classData };
    }

    function makeHeat(participantId, position, status = 'completed', lane = 1) {
        return {
            status,
            lanes: [{ lane, participant: { id: participantId } }],
            results: [{ participantId, position }]
        };
    }

    it('should return no achievements for empty data', () => {
        const result = engine.calculate('driver1', {});
        expect(result.earned).toHaveLength(0);
        expect(result.stats.totalRaces).toBe(0);
    });

    it('should award First Blood for 1 win', () => {
        const brackets = {
            event1: makeBracket({
                'Pro': {
                    participants: [{ id: 'driver1' }],
                    rounds: [{ heats: [makeHeat('driver1', 1)] }]
                }
            })
        };

        const result = engine.calculate('driver1', brackets);
        expect(result.earned.find(a => a.id === 'first_win')).toBeTruthy();
        expect(result.stats.totalWins).toBe(1);
    });

    it('should award Veteran for 10 races', () => {
        const heats = [];
        for (let i = 0; i < 10; i++) {
            heats.push(makeHeat('driver1', i < 5 ? 1 : 2));
        }

        const brackets = {
            event1: makeBracket({
                'Pro': {
                    participants: [{ id: 'driver1' }],
                    rounds: [{ heats }]
                }
            })
        };

        const result = engine.calculate('driver1', brackets);
        expect(result.earned.find(a => a.id === 'race_10')).toBeTruthy();
    });

    it('should award Champion for class win', () => {
        const brackets = {
            event1: makeBracket({
                'Pro': {
                    participants: [{ id: 'driver1', losses: 1 }],
                    winner: { id: 'driver1' },
                    rounds: [{ heats: [makeHeat('driver1', 1)] }]
                }
            })
        };

        const result = engine.calculate('driver1', brackets);
        expect(result.earned.find(a => a.id === 'event_winner')).toBeTruthy();
    });

    it('should award Jack of All Trades for 3+ classes', () => {
        const brackets = {
            event1: makeBracket({
                'Pro': { participants: [{ id: 'driver1' }], rounds: [{ heats: [makeHeat('driver1', 1)] }] },
                'Sport': { participants: [{ id: 'driver1' }], rounds: [{ heats: [makeHeat('driver1', 2)] }] },
                'Stock': { participants: [{ id: 'driver1' }], rounds: [{ heats: [makeHeat('driver1', 1)] }] }
            })
        };

        const result = engine.calculate('driver1', brackets);
        expect(result.earned.find(a => a.id === 'multi_class')).toBeTruthy();
        expect(result.stats.uniqueClasses).toBe(3);
    });

    it('should count win streak correctly', () => {
        const heats = [];
        for (let i = 0; i < 5; i++) heats.push(makeHeat('driver1', 1));
        heats.push(makeHeat('driver1', 2)); // break streak

        const brackets = {
            event1: makeBracket({
                'Pro': {
                    participants: [{ id: 'driver1' }],
                    rounds: [{ heats }]
                }
            })
        };

        const result = engine.calculate('driver1', brackets);
        expect(result.stats.bestWinStreak).toBe(5);
        expect(result.earned.find(a => a.id === 'win_streak_5')).toBeTruthy();
    });
});
