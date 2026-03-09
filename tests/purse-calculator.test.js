/**
 * Tests for PurseCalculator module
 * Pure function — no DOM or network dependencies.
 */

// Simulate browser environment for the module
globalThis.window = globalThis;
globalThis.module = undefined;

// Load the module
const { PurseCalculator } = await import('../modules/purse-calculator.js');

describe('PurseCalculator', () => {
    let calc;

    beforeEach(() => {
        calc = new PurseCalculator();
    });

    it('should calculate basic purse with full pool', () => {
        const result = calc.calculate({
            paidDrivers: 20,
            registrationFee: 50,
            paybackPercent: 70,
            injectedMoney: 0,
            poolMode: 'full_pool',
            positionPayouts: [
                { position: 1, type: 'percent', value: 50 },
                { position: 2, type: 'percent', value: 30 },
                { position: 3, type: 'percent', value: 20 }
            ]
        });

        expect(result.totalCollected).toBe(1000);
        expect(result.paybackPool).toBe(700);
        expect(result.houseRevenue).toBe(300);
        expect(result.totalPool).toBe(700);
        expect(result.classes).toHaveLength(1);
        expect(result.classes[0].positions).toHaveLength(3);
        expect(result.classes[0].positions[0].amount).toBe(350); // 50% of 700
    });

    it('should distribute proportionally in per_class mode', () => {
        const result = calc.calculate({
            paidDrivers: 24,
            registrationFee: 50,
            paybackPercent: 100,
            injectedMoney: 0,
            poolMode: 'per_class',
            classes: [
                { name: 'Pro', drivers: 12 },
                { name: 'Sport', drivers: 12 }
            ],
            positionPayouts: [
                { position: 1, type: 'percent', value: 100 }
            ]
        });

        expect(result.classes).toHaveLength(2);
        expect(result.classes[0].pool).toBe(600); // 12/24 * 1200
        expect(result.classes[1].pool).toBe(600);
    });

    it('should add injected money to pool', () => {
        const result = calc.calculate({
            paidDrivers: 10,
            registrationFee: 100,
            paybackPercent: 50,
            injectedMoney: 200,
            poolMode: 'full_pool',
            positionPayouts: [
                { position: 1, type: 'percent', value: 100 }
            ]
        });

        expect(result.paybackPool).toBe(500);
        expect(result.totalPool).toBe(700); // 500 + 200
    });

    it('should handle fixed payouts', () => {
        const result = calc.calculate({
            paidDrivers: 10,
            registrationFee: 100,
            paybackPercent: 100,
            poolMode: 'full_pool',
            positionPayouts: [
                { position: 1, type: 'percent', value: 50 }
            ],
            fixedPayouts: [
                { position: 1, amount: 100 }
            ]
        });

        // 50% of 1000 = 500 + 100 fixed = 600
        expect(result.classes[0].positions[0].amount).toBe(600);
    });

    it('should handle zero drivers gracefully', () => {
        const result = calc.calculate({
            paidDrivers: 0,
            registrationFee: 50,
            paybackPercent: 70
        });

        expect(result.totalCollected).toBe(0);
        expect(result.totalPool).toBe(0);
    });
});
