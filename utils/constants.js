/**
 * Shared Constants for EPC17
 * Centralizes magic numbers and configuration values used across modules.
 *
 * @module utils/constants
 * Exports: window.EPC17_CONSTANTS (or import as ES module)
 */

const EPC17_CONSTANTS = {
    // Responsive breakpoints (px)
    MOBILE_BREAKPOINT: 768,
    TABLET_BREAKPOINT: 1024,

    // Cache and timing (ms)
    CACHE_TTL_MS: 30_000,
    AUTO_SAVE_INTERVAL_MS: 300_000,
    STATS_CACHE_TTL_MS: 120_000,        // 2 minutes for stats cache
    DEBOUNCE_MS: 300,
    TOAST_DURATION_MS: 3000,

    // Event Bus
    MAX_EVENT_BUS_HISTORY: 100,

    // Data limits
    MAX_LANE_STAT_ROWS: 12,
    BATCH_SIZE: 50,
    MAX_PARTICIPANTS_PER_PAGE: 50,
    MAX_EVENTS_PER_PAGE: 20,

    // Race engine
    DEFAULT_LANES_PER_RACE: 3,
    MIN_PARTICIPANTS_FOR_BRACKET: 2,
    DEFAULT_LOSS_LIMIT: 2,
    DEFAULT_TIE_BREAKER_RANK: 3,

    // UI
    SCROLL_ANCHOR_OFFSET: 100,
    CONTEXT_MENU_MAX_HEIGHT: 400,

    // Session
    SESSION_CHECK_INTERVAL_MS: 60_000,
    SESSION_EXPIRY_MS: 24 * 60 * 60 * 1000,  // 24 hours
};

// Global export
if (typeof window !== 'undefined') {
    window.EPC17_CONSTANTS = EPC17_CONSTANTS;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = EPC17_CONSTANTS;
}
