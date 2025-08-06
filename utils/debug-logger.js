/**
 * Debug Logger Utility
 * Centralized console logging with configurable verbosity levels
 */

class DebugLogger {
    constructor() {
        this.enabled = true;
        this.levels = {
            ERROR: 0,    // Always show
            WARN: 1,     // Warnings and important info
            INFO: 2,     // General information
            DEBUG: 3,    // Detailed debugging
            VERBOSE: 4   // Very detailed debugging
        };
        this.currentLevel = this.levels.INFO; // Default to INFO level
        this.suppressedCategories = new Set();
        this.performanceMode = false;
    }

    /**
     * Set the logging level
     * @param {string} level - 'ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE'
     */
    setLevel(level) {
        if (this.levels[level] !== undefined) {
            this.currentLevel = this.levels[level];
            this.log('INFO', 'DebugLogger', `Log level set to: ${level}`);
        }
    }

    /**
     * Enable/disable logging
     * @param {boolean} enabled 
     */
    setEnabled(enabled) {
        this.enabled = enabled;
    }

    /**
     * Suppress specific categories of logs
     * @param {string|Array} categories 
     */
    suppressCategories(categories) {
        if (Array.isArray(categories)) {
            categories.forEach(cat => this.suppressedCategories.add(cat));
        } else {
            this.suppressedCategories.add(categories);
        }
    }

    /**
     * Enable specific categories
     * @param {string|Array} categories 
     */
    enableCategories(categories) {
        if (Array.isArray(categories)) {
            categories.forEach(cat => this.suppressedCategories.delete(cat));
        } else {
            this.suppressedCategories.delete(categories);
        }
    }

    /**
     * Enable performance mode (reduces logging)
     */
    enablePerformanceMode() {
        this.performanceMode = true;
        this.currentLevel = this.levels.WARN;
        this.suppressCategories(['performance', 'initialization', 'loading']);
    }

    /**
     * Disable performance mode
     */
    disablePerformanceMode() {
        this.performanceMode = false;
        this.currentLevel = this.levels.INFO;
    }

    /**
     * Main logging method
     * @param {string} level - Log level
     * @param {string} category - Category for filtering
     * @param {string} message - Log message
     * @param {*} data - Optional data to log
     */
    log(level, category, message, data = null) {
        if (!this.enabled) return;
        if (this.suppressedCategories.has(category)) return;
        if (this.levels[level] > this.currentLevel) return;

        const timestamp = new Date().toLocaleTimeString();
        const prefix = `[${timestamp}] [${level}] [${category}]`;
        
        if (data) {
            console.log(`${prefix} ${message}`, data);
        } else {
            console.log(`${prefix} ${message}`);
        }
    }

    /**
     * Error logging (always shown)
     */
    error(category, message, error = null) {
        if (error) {
            console.error(`[ERROR] [${category}] ${message}`, error);
        } else {
            console.error(`[ERROR] [${category}] ${message}`);
        }
    }

    /**
     * Warning logging
     */
    warn(category, message, data = null) {
        this.log('WARN', category, message, data);
    }

    /**
     * Info logging
     */
    info(category, message, data = null) {
        this.log('INFO', category, message, data);
    }

    /**
     * Debug logging
     */
    debug(category, message, data = null) {
        this.log('DEBUG', category, message, data);
    }

    /**
     * Verbose logging
     */
    verbose(category, message, data = null) {
        this.log('VERBOSE', category, message, data);
    }

    /**
     * Performance-specific logging
     */
    performance(message, data = null) {
        if (!this.performanceMode) {
            this.log('INFO', 'performance', message, data);
        }
    }

    /**
     * Initialization logging
     */
    init(category, message, data = null) {
        this.log('INFO', 'initialization', `[${category}] ${message}`, data);
    }

    /**
     * Loading logging
     */
    loading(category, message, data = null) {
        this.log('INFO', 'loading', `[${category}] ${message}`, data);
    }

    /**
     * Success logging
     */
    success(category, message, data = null) {
        this.log('INFO', category, `✅ ${message}`, data);
    }

    /**
     * Failure logging
     */
    failure(category, message, data = null) {
        this.log('WARN', category, `❌ ${message}`, data);
    }
}

// Create global instance
const debugLogger = new DebugLogger();

// Make it globally available
window.debugLogger = debugLogger;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DebugLogger;
}

// Add global debug control functions
window.setDebugLevel = function(level) {
    if (window.debugLogger) {
        window.debugLogger.setLevel(level);
    }
};

window.enableDebugMode = function() {
    if (window.debugLogger) {
        window.debugLogger.setEnabled(true);
        window.debugLogger.setLevel('DEBUG');
    }
};

window.enablePerformanceMode = function() {
    if (window.debugLogger) {
        window.debugLogger.enablePerformanceMode();
    }
};

window.disableDebugLogging = function() {
    if (window.debugLogger) {
        window.debugLogger.setEnabled(false);
    }
};

// Log available debug commands
if (window.debugLogger) {
    window.debugLogger.info('DebugLogger', 'Debug control functions available:');
    window.debugLogger.info('DebugLogger', '- setDebugLevel("ERROR|WARN|INFO|DEBUG|VERBOSE")');
    window.debugLogger.info('DebugLogger', '- enableDebugMode() - Enable detailed debugging');
    window.debugLogger.info('DebugLogger', '- enablePerformanceMode() - Reduce logging for performance');
    window.debugLogger.info('DebugLogger', '- disableDebugLogging() - Turn off all logging');
} 