/**
 * Visual Tournament Bracket Tree Renderer
 * Renders an SVG-based bracket visualization with connection lines and advancement paths.
 * Toggle between "tree view" and "list view" on the races page.
 *
 * @module race-ui/bracket-tree
 *
 * Exports: window.BracketTreeRenderer
 *
 * Usage:
 *   const renderer = new BracketTreeRenderer(containerElement);
 *   renderer.render(bracketData, className);
 */

class BracketTreeRenderer {
    constructor(container) {
        this.container = container;
        // Layout constants
        this.HEAT_WIDTH = 200;
        this.HEAT_HEIGHT = 80;
        this.H_GAP = 60;       // horizontal gap between rounds
        this.V_GAP = 16;       // vertical gap between heats in a round
        this.PADDING = 24;
        this.LANE_ROW_HEIGHT = 22;
    }

    /**
     * Render a bracket tree for a single class.
     * @param {Object} classBracket - Class bracket data (rounds, participants, eliminationType)
     * @param {string} className - Display name
     */
    render(classBracket, className) {
        if (!classBracket || !classBracket.rounds || classBracket.rounds.length === 0) {
            this.container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem;">No bracket data to visualize.</p>';
            return;
        }

        const elimType = classBracket.eliminationType || 'single';
        const isDouble = elimType === 'double' || elimType === 'double_random';

        // Separate rounds by type
        const regularRounds = classBracket.rounds
            .filter(r => typeof r.roundNumber === 'number')
            .sort((a, b) => a.roundNumber - b.roundNumber);
        const finalRound = classBracket.rounds.find(r => r.roundNumber === 'final');
        const tieBreakerRound = classBracket.rounds.find(r => r.type === 'tie_breaker');

        const allRounds = [...regularRounds];
        if (finalRound) allRounds.push(finalRound);
        if (tieBreakerRound) allRounds.push(tieBreakerRound);

        if (isDouble) {
            this._renderDoubleBracket(allRounds, className);
        } else {
            this._renderSingleBracket(allRounds, className);
        }
    }

    // ---- Single Elimination Tree ----

    _renderSingleBracket(rounds, className) {
        const cols = rounds.length;
        if (cols === 0) { this.container.innerHTML = ''; return; }

        // Compute layout dimensions
        const maxHeats = Math.max(...rounds.map(r => (r.heats || []).length), 1);
        const svgW = this.PADDING * 2 + cols * (this.HEAT_WIDTH + this.H_GAP) - this.H_GAP;
        const svgH = this.PADDING * 2 + maxHeats * (this.HEAT_HEIGHT + this.V_GAP) - this.V_GAP + 40;

        let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${svgW} ${svgH}" style="min-width:${Math.min(svgW, 900)}px;">`;

        // Title
        svg += `<text x="${svgW / 2}" y="20" text-anchor="middle" fill="var(--text-primary)" font-size="14" font-weight="600">${this._esc(className)} — Tournament Bracket</text>`;

        // Store heat positions for connection lines
        const heatPositions = []; // [roundIndex][heatIndex] = {cx, cy}

        rounds.forEach((round, ri) => {
            const heats = round.heats || [];
            const roundHeats = heats.length || 1;
            const roundHeight = roundHeats * (this.HEAT_HEIGHT + this.V_GAP) - this.V_GAP;
            const offsetY = this.PADDING + 30 + (svgH - 70 - roundHeight) / 2;
            const x = this.PADDING + ri * (this.HEAT_WIDTH + this.H_GAP);

            const positions = [];

            // Round label
            const label = round.roundNumber === 'final' ? 'Final' :
                          round.type === 'tie_breaker' ? 'Tie-Breaker' :
                          `Round ${round.roundNumber}`;
            svg += `<text x="${x + this.HEAT_WIDTH / 2}" y="${this.PADDING + 28}" text-anchor="middle" fill="var(--text-secondary)" font-size="11" font-weight="500">${label}</text>`;

            heats.forEach((heat, hi) => {
                const y = offsetY + hi * (this.HEAT_HEIGHT + this.V_GAP);
                const cx = x + this.HEAT_WIDTH / 2;
                const cy = y + this.HEAT_HEIGHT / 2;
                positions.push({ cx, cy, x, y });

                svg += this._renderHeatBox(heat, x, y);
            });

            heatPositions.push(positions);
        });

        // Draw connection lines between rounds
        for (let ri = 0; ri < heatPositions.length - 1; ri++) {
            const currentRound = heatPositions[ri];
            const nextRound = heatPositions[ri + 1];
            if (!currentRound.length || !nextRound.length) continue;

            // Connect pairs of heats from current round to single heat in next round
            const ratio = Math.ceil(currentRound.length / Math.max(nextRound.length, 1));
            nextRound.forEach((target, ni) => {
                const sources = currentRound.slice(ni * ratio, (ni + 1) * ratio);
                sources.forEach(src => {
                    const x1 = src.x + this.HEAT_WIDTH;
                    const y1 = src.cy;
                    const x2 = target.x;
                    const y2 = target.cy;
                    const midX = (x1 + x2) / 2;
                    svg += `<path d="M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}" fill="none" stroke="var(--border-strong)" stroke-width="1.5" opacity="0.6"/>`;
                });
            });
        }

        svg += '</svg>';
        this.container.innerHTML = svg;
    }

    // ---- Double Elimination Tree ----

    _renderDoubleBracket(rounds, className) {
        // Split heats by bracket type
        const upperRounds = [];
        const lowerRounds = [];
        const championshipHeats = [];

        rounds.forEach(round => {
            const upper = (round.heats || []).filter(h => h.bracketType === 'upper' || (!h.bracketType && round.roundNumber !== 'final'));
            const lower = (round.heats || []).filter(h => h.bracketType === 'lower');
            const champ = (round.heats || []).filter(h => h.bracketType === 'championship');

            if (upper.length > 0) upperRounds.push({ ...round, heats: upper });
            if (lower.length > 0) lowerRounds.push({ ...round, heats: lower });
            champ.forEach(h => championshipHeats.push(h));
        });

        // Render upper and lower as separate sections
        const totalCols = Math.max(upperRounds.length, lowerRounds.length) + (championshipHeats.length > 0 ? 1 : 0);
        const maxUpper = Math.max(...upperRounds.map(r => r.heats.length), 1);
        const maxLower = Math.max(...lowerRounds.map(r => r.heats.length), 1);

        const upperHeight = maxUpper * (this.HEAT_HEIGHT + this.V_GAP);
        const lowerHeight = maxLower * (this.HEAT_HEIGHT + this.V_GAP);
        const sectionGap = 40;
        const svgW = this.PADDING * 2 + totalCols * (this.HEAT_WIDTH + this.H_GAP);
        const svgH = this.PADDING * 2 + upperHeight + sectionGap + lowerHeight + 60;

        let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${svgW} ${svgH}" style="min-width:${Math.min(svgW, 900)}px;">`;

        // Title
        svg += `<text x="${svgW / 2}" y="20" text-anchor="middle" fill="var(--text-primary)" font-size="14" font-weight="600">${this._esc(className)} — Double Elimination</text>`;

        // Upper bracket label
        svg += `<text x="${this.PADDING}" y="${this.PADDING + 40}" fill="var(--info)" font-size="12" font-weight="600">UPPER BRACKET</text>`;

        const upperBase = this.PADDING + 50;
        upperRounds.forEach((round, ri) => {
            const x = this.PADDING + ri * (this.HEAT_WIDTH + this.H_GAP);
            round.heats.forEach((heat, hi) => {
                const y = upperBase + hi * (this.HEAT_HEIGHT + this.V_GAP);
                svg += this._renderHeatBox(heat, x, y);
            });
        });

        // Lower bracket label
        const lowerBase = upperBase + upperHeight + sectionGap;
        svg += `<text x="${this.PADDING}" y="${lowerBase - 10}" fill="var(--warning)" font-size="12" font-weight="600">LOWER BRACKET</text>`;

        lowerRounds.forEach((round, ri) => {
            const x = this.PADDING + ri * (this.HEAT_WIDTH + this.H_GAP);
            round.heats.forEach((heat, hi) => {
                const y = lowerBase + hi * (this.HEAT_HEIGHT + this.V_GAP);
                svg += this._renderHeatBox(heat, x, y);
            });
        });

        // Championship final
        if (championshipHeats.length > 0) {
            const champX = this.PADDING + (totalCols - 1) * (this.HEAT_WIDTH + this.H_GAP);
            const champY = upperBase + (upperHeight + sectionGap) / 2 - this.HEAT_HEIGHT / 2;
            svg += `<text x="${champX + this.HEAT_WIDTH / 2}" y="${champY - 8}" text-anchor="middle" fill="var(--success)" font-size="11" font-weight="600">CHAMPIONSHIP</text>`;
            championshipHeats.forEach((heat, i) => {
                svg += this._renderHeatBox(heat, champX, champY + i * (this.HEAT_HEIGHT + this.V_GAP));
            });
        }

        svg += '</svg>';
        this.container.innerHTML = svg;
    }

    // ---- Heat Box Rendering ----

    _renderHeatBox(heat, x, y) {
        const isCompleted = heat.status === 'completed' || heat.isComplete === true;
        const isPending = heat.status === 'pending';
        const isTieBreaker = heat.type === 'tie_breaker';

        const borderColor = isCompleted ? 'var(--success)' :
                           isTieBreaker ? 'var(--warning)' :
                           isPending ? 'var(--border-color)' : 'var(--info)';
        const bgColor = 'var(--bg-secondary)';

        let svg = '';
        svg += `<rect x="${x}" y="${y}" width="${this.HEAT_WIDTH}" height="${this.HEAT_HEIGHT}" rx="6" ry="6" fill="${bgColor}" stroke="${borderColor}" stroke-width="1.5"/>`;

        // Race number label
        const raceLabel = heat.raceNumber ? `Race ${heat.raceNumber}` : heat.id?.substring(0, 8) || '?';
        svg += `<text x="${x + 6}" y="${y + 14}" fill="var(--text-muted)" font-size="9" font-weight="500">${this._esc(raceLabel)}</text>`;

        // Status indicator
        const statusIcon = isCompleted ? '✓' : isPending ? '○' : '▶';
        svg += `<text x="${x + this.HEAT_WIDTH - 16}" y="${y + 14}" fill="${borderColor}" font-size="10">${statusIcon}</text>`;

        // Lanes / participants
        const lanes = heat.lanes || [];
        lanes.forEach((lane, li) => {
            if (li >= 3) return; // Max 3 visible in compact view
            const ly = y + 24 + li * this.LANE_ROW_HEIGHT;
            const name = lane.participant?.name || lane.participantName || '—';
            const shortName = name.length > 20 ? name.substring(0, 18) + '…' : name;

            // Position badge for completed heats
            if (isCompleted && heat.results) {
                const result = heat.results.find(r => r.participantId === (lane.participant?.id || lane.participantId));
                if (result) {
                    const pos = result.position;
                    const posColor = pos === 1 ? '#ffd700' : pos === 2 ? '#c0c0c0' : pos === 3 ? '#cd7f32' : 'var(--text-muted)';
                    svg += `<circle cx="${x + 14}" cy="${ly + 4}" r="7" fill="${posColor}" opacity="0.3"/>`;
                    svg += `<text x="${x + 14}" y="${ly + 8}" text-anchor="middle" fill="${posColor}" font-size="9" font-weight="700">${pos}</text>`;
                }
            }

            svg += `<text x="${x + 26}" y="${ly + 8}" fill="var(--text-primary)" font-size="10">${this._esc(shortName)}</text>`;
        });

        if (lanes.length > 3) {
            svg += `<text x="${x + 6}" y="${y + this.HEAT_HEIGHT - 6}" fill="var(--text-muted)" font-size="9">+${lanes.length - 3} more</text>`;
        }

        return svg;
    }

    // ---- Utility ----

    _esc(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}

// Global export
if (typeof window !== 'undefined') {
    window.BracketTreeRenderer = BracketTreeRenderer;
}
