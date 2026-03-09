/**
 * Purse Calculator Module
 * Calculates prize purse distribution based on:
 *   - Number of paid drivers
 *   - Payback percentage
 *   - Per-class or pool-wide pool
 *   - Fixed position payouts
 *   - Injected money
 *
 * @module purse-calculator
 * Exports: window.PurseCalculator
 *
 * Usage:
 *   const calc = new PurseCalculator();
 *   const result = calc.calculate({
 *       paidDrivers: 24,
 *       registrationFee: 50,
 *       paybackPercent: 70,
 *       injectedMoney: 200,
 *       poolMode: 'per_class',         // 'full_pool' | 'per_class'
 *       classes: [
 *           { name: 'Pro', drivers: 12 },
 *           { name: 'Sport', drivers: 12 }
 *       ],
 *       positionPayouts: [
 *           { position: 1, type: 'percent', value: 50 },
 *           { position: 2, type: 'percent', value: 30 },
 *           { position: 3, type: 'percent', value: 20 }
 *       ],
 *       fixedPayouts: [
 *           { position: 1, amount: 100 }  // fixed bonus on top
 *       ]
 *   });
 */

class PurseCalculator {
    constructor() {
        this._config = null;
    }

    /**
     * Calculate purse distribution.
     * @param {Object} config - Purse configuration
     * @returns {Object} Calculated purse breakdown
     */
    calculate(config) {
        this._config = config;
        const {
            paidDrivers = 0,
            registrationFee = 0,
            paybackPercent = 70,
            injectedMoney = 0,
            poolMode = 'full_pool',
            classes = [],
            positionPayouts = [],
            fixedPayouts = []
        } = config;

        const totalCollected = paidDrivers * registrationFee;
        const paybackPool = Math.round(totalCollected * (paybackPercent / 100) * 100) / 100;
        const totalPool = paybackPool + injectedMoney;
        const houseRevenue = totalCollected - paybackPool;

        const result = {
            totalCollected,
            paybackPool,
            injectedMoney,
            totalPool,
            houseRevenue,
            paybackPercent,
            paidDrivers,
            registrationFee,
            poolMode,
            classes: []
        };

        if (poolMode === 'per_class' && classes.length > 0) {
            // Distribute pool proportionally to class size
            const totalDrivers = classes.reduce((s, c) => s + (c.drivers || 0), 0) || 1;

            classes.forEach(cls => {
                const classShare = totalPool * ((cls.drivers || 0) / totalDrivers);
                const breakdown = this._distributePool(classShare, positionPayouts, fixedPayouts);
                result.classes.push({
                    name: cls.name,
                    drivers: cls.drivers || 0,
                    pool: Math.round(classShare * 100) / 100,
                    positions: breakdown
                });
            });
        } else {
            // Full pool mode - single distribution
            const breakdown = this._distributePool(totalPool, positionPayouts, fixedPayouts);
            result.classes.push({
                name: 'All Classes',
                drivers: paidDrivers,
                pool: totalPool,
                positions: breakdown
            });
        }

        return result;
    }

    /**
     * Distribute a pool across positions.
     * @param {number} pool - Total pool for this class/group
     * @param {Array} positionPayouts - Percentage-based payouts
     * @param {Array} fixedPayouts - Fixed amount payouts
     * @returns {Array} Position payouts
     */
    _distributePool(pool, positionPayouts, fixedPayouts) {
        const positions = [];
        let allocated = 0;

        // Sort by position
        const sorted = [...positionPayouts].sort((a, b) => a.position - b.position);

        sorted.forEach(pp => {
            let amount = 0;
            if (pp.type === 'percent') {
                amount = Math.round(pool * (pp.value / 100) * 100) / 100;
            } else if (pp.type === 'fixed') {
                amount = pp.value || 0;
            }

            // Add any fixed bonus for this position
            const fixedBonus = (fixedPayouts || []).find(f => f.position === pp.position);
            if (fixedBonus) {
                amount += fixedBonus.amount || 0;
            }

            allocated += amount;
            positions.push({
                position: pp.position,
                amount: Math.round(amount * 100) / 100,
                percentOfPool: pool > 0 ? Math.round((amount / pool) * 100 * 10) / 10 : 0
            });
        });

        // Add any fixed-only payouts not in positionPayouts
        (fixedPayouts || []).forEach(fp => {
            if (!positions.find(p => p.position === fp.position)) {
                const amount = fp.amount || 0;
                allocated += amount;
                positions.push({
                    position: fp.position,
                    amount,
                    percentOfPool: pool > 0 ? Math.round((amount / pool) * 100 * 10) / 10 : 0
                });
            }
        });

        // Sort by position
        positions.sort((a, b) => a.position - b.position);

        return positions;
    }

    /**
     * Generate a printable summary of purse distribution.
     * @param {Object} result - Output from calculate()
     * @returns {string} HTML summary
     */
    generateSummaryHtml(result) {
        let html = `
        <div class="purse-summary">
            <h3>Purse Summary</h3>
            <div class="purse-overview">
                <div class="purse-stat"><span class="label">Paid Drivers</span><span class="value">${result.paidDrivers}</span></div>
                <div class="purse-stat"><span class="label">Fee per Driver</span><span class="value">$${result.registrationFee}</span></div>
                <div class="purse-stat"><span class="label">Total Collected</span><span class="value">$${result.totalCollected.toLocaleString()}</span></div>
                <div class="purse-stat"><span class="label">Payback (${result.paybackPercent}%)</span><span class="value">$${result.paybackPool.toLocaleString()}</span></div>
                <div class="purse-stat"><span class="label">Injected</span><span class="value">$${result.injectedMoney.toLocaleString()}</span></div>
                <div class="purse-stat highlight"><span class="label">Total Prize Pool</span><span class="value">$${result.totalPool.toLocaleString()}</span></div>
                <div class="purse-stat"><span class="label">House Revenue</span><span class="value">$${result.houseRevenue.toLocaleString()}</span></div>
            </div>
        `;

        result.classes.forEach(cls => {
            html += `
            <h4>${cls.name} — $${cls.pool.toLocaleString()} Pool (${cls.drivers} drivers)</h4>
            <table class="purse-table">
                <thead><tr><th>Position</th><th>Payout</th><th>% of Pool</th></tr></thead>
                <tbody>
            `;
            cls.positions.forEach(pos => {
                html += `<tr><td>${pos.position}${pos.position === 1 ? 'st' : pos.position === 2 ? 'nd' : pos.position === 3 ? 'rd' : 'th'}</td>`;
                html += `<td>$${pos.amount.toLocaleString()}</td>`;
                html += `<td>${pos.percentOfPool}%</td></tr>`;
            });
            html += '</tbody></table>';
        });

        html += '</div>';
        return html;
    }
}

// Global export
if (typeof window !== 'undefined') {
    window.PurseCalculator = PurseCalculator;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PurseCalculator;
}
