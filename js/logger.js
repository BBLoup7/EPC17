/**
 * Conditional Logging Utility for EPC17
 * Provides a centralized logger that can be toggled via localStorage or URL parameter.
 * 
 * Usage:
 *   window.debugLogger.debug('Category', 'Verbose debug message', data);  // Only in debug mode
 *   window.debugLogger.log('Category', 'General log message', data);      // Only in debug mode
 *   window.debugLogger.info('Category', 'Info message', data);            // Only in debug mode
 *   window.debugLogger.critical('Category', 'Important info', data);      // Always visible
 *   window.debugLogger.warn('Category', 'Warning message', data);         // Always visible
 *   window.debugLogger.error('Category', 'Error message', data);          // Always visible
 * 
 * To enable debug mode:
 *   - Set localStorage: localStorage.setItem('epc17_debug', 'true')
 *   - Or add ?debug to URL
 * 
 * Log Levels (from least to most verbose):
 *   ERROR (0)    - Always shown - Actual errors that need attention
 *   WARN (1)     - Always shown - Important warnings
 *   CRITICAL (2) - Always shown - Important info messages
 *   INFO (3)     - Debug only - General informational messages
 *   DEBUG (4)    - Debug only - Verbose debug information
 */

// Log level constants
const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    CRITICAL: 2,
    INFO: 3,
    DEBUG: 4
};

class DebugLogger {
    constructor() {
        // Check for debug flag in localStorage or URL
        this.isDebug = localStorage.getItem('epc17_debug') === 'true' || 
                       new URLSearchParams(window.location.search).has('debug');
        
        // Current log level - in debug mode show everything, otherwise only critical and below
        this.logLevel = this.isDebug ? LOG_LEVELS.DEBUG : LOG_LEVELS.CRITICAL;
        
        // Only announce debug mode if enabled
        if (this.isDebug) {
            console.log('%c🔧 Debug Mode Enabled', 'color: #00bcd4; font-weight: bold;');
        }
    }

    /**
     * Format message with category prefix
     */
    formatMessage(category, message) {
        return `[${category}] ${message}`;
    }

    /**
     * Check if a log level should be displayed
     */
    shouldLog(level) {
        return level <= this.logLevel;
    }

    /**
     * Enable or disable debug mode programmatically
     */
    setDebugMode(enabled) {
        this.isDebug = enabled;
        this.logLevel = enabled ? LOG_LEVELS.DEBUG : LOG_LEVELS.CRITICAL;
        localStorage.setItem('epc17_debug', enabled ? 'true' : 'false');
        console.log(`%c🔧 Debug Mode ${enabled ? 'Enabled' : 'Disabled'}`, 'color: #00bcd4; font-weight: bold;');
    }

    /**
     * DEBUG level - Verbose debug information (only in debug mode)
     * Use for: detailed state dumps, iteration logs, bracket details, etc.
     */
    debug(category, message, ...args) {
        if (!this.shouldLog(LOG_LEVELS.DEBUG)) return;
        console.debug(this.formatMessage(category, message), ...args);
    }

    /**
     * LOG level - General logging (only in debug mode)
     * Use for: flow tracking, method entry/exit, general progress
     */
    log(category, message, ...args) {
        if (!this.shouldLog(LOG_LEVELS.DEBUG)) return;
        console.log(this.formatMessage(category, message), ...args);
    }

    /**
     * INFO level - Informational messages (only in debug mode)
     * Use for: operation summaries, configuration info
     */
    info(category, message, ...args) {
        if (!this.shouldLog(LOG_LEVELS.INFO)) return;
        console.info(this.formatMessage(category, message), ...args);
    }

    /**
     * CRITICAL level - Important info that should always be visible
     * Use for: successful operations users should know about, important state changes
     */
    critical(category, message, ...args) {
        if (!this.shouldLog(LOG_LEVELS.CRITICAL)) return;
        console.info(`%c${this.formatMessage(category, message)}`, 'color: #2196f3; font-weight: bold;', ...args);
    }

    /**
     * WARN level - Warnings (always visible)
     * Use for: non-critical issues, deprecation notices, recoverable errors
     */
    warn(category, message, ...args) {
        if (!this.shouldLog(LOG_LEVELS.WARN)) return;
        console.warn(this.formatMessage(category, message), ...args);
    }

    /**
     * ERROR level - Errors (always visible)
     * Use for: actual errors that need attention, failed operations
     */
    error(category, message, ...args) {
        // Errors are always shown
        console.error(this.formatMessage(category, message), ...args);
    }

    /**
     * SUCCESS - Visual success indicator (only in debug mode)
     * Use for: completed operations, successful validations
     */
    success(category, message, ...args) {
        if (!this.shouldLog(LOG_LEVELS.DEBUG)) return;
        console.log(`%c✓ ${this.formatMessage(category, message)}`, 'color: #4caf50; font-weight: bold;', ...args);
    }

    /**
     * PERFORMANCE - Performance timing logs (only in debug mode)
     * Use for: operation timing, performance metrics
     */
    performance(message, ...args) {
        if (!this.shouldLog(LOG_LEVELS.DEBUG)) return;
        console.log(`%c⚡ [Performance] ${message}`, 'color: #9c27b0;', ...args);
    }

    /**
     * INIT - Initialization logs (only in debug mode)
     * Use for: module/component initialization
     */
    init(category, message, ...args) {
        if (!this.shouldLog(LOG_LEVELS.DEBUG)) return;
        console.log(`%c🏁 ${this.formatMessage(category, message)}`, 'color: #2196f3; font-weight: bold;', ...args);
    }

    /**
     * GROUP - Start a collapsed console group (only in debug mode)
     * Use for: grouping related log messages
     */
    group(category, label) {
        if (!this.shouldLog(LOG_LEVELS.DEBUG)) return;
        console.groupCollapsed(this.formatMessage(category, label));
    }

    /**
     * GROUP END - End a console group
     */
    groupEnd() {
        if (!this.shouldLog(LOG_LEVELS.DEBUG)) return;
        console.groupEnd();
    }

    /**
     * TABLE - Display data as a table (only in debug mode)
     * Use for: displaying arrays/objects in table format
     */
    table(category, data, columns) {
        if (!this.shouldLog(LOG_LEVELS.DEBUG)) return;
        console.log(this.formatMessage(category, 'Table data:'));
        console.table(data, columns);
    }
}

// Initialize global logger immediately
window.debugLogger = new DebugLogger();

// Export log levels for reference
window.LOG_LEVELS = LOG_LEVELS;
