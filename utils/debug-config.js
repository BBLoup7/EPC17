/**
 * Debug Configuration for EPC17 Event Management System
 * Modify these settings to control console logging behavior
 */

window.DebugConfig = {
    // Main logging level: 'ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE'
    // ERROR: Only errors are shown
    // WARN: Errors and warnings
    // INFO: Errors, warnings, and general information
    // DEBUG: All above plus detailed debugging
    // VERBOSE: All logging including very detailed information
    logLevel: 'INFO',
    
    // Enable/disable logging entirely
    enabled: true,
    
    // Suppress specific categories of logs
    // Add categories here to completely suppress them
    suppressedCategories: [
        // 'performance',     // Uncomment to suppress performance logs
        // 'initialization',  // Uncomment to suppress initialization logs
        // 'loading',        // Uncomment to suppress loading logs
        // 'migration',      // Uncomment to suppress migration logs
    ],
    
    // Performance mode settings
    performanceMode: {
        enabled: false,  // Set to true to reduce logging for better performance
        suppressCategories: ['performance', 'initialization', 'loading'],
        logLevel: 'WARN'
    },
    
    // Module-specific settings
    modules: {
        raceUI: {
            enabled: true,
            level: 'INFO'  // Override global level for this module
        },
        eventBus: {
            enabled: true,
            level: 'WARN'  // Reduce event bus logging
        },
        performanceMonitor: {
            enabled: true,
            level: 'WARN'  // Reduce performance monitoring logs
        },
        migrationUtils: {
            enabled: true,
            level: 'INFO'
        },
        statisticsManager: {
            enabled: true,
            level: 'INFO'
        }
    }
};

// Auto-configure debug logger when this file loads
if (window.debugLogger && window.DebugConfig) {
    const config = window.DebugConfig;
    
    // Set main configuration
    window.debugLogger.setEnabled(config.enabled);
    window.debugLogger.setLevel(config.logLevel);
    
    // Suppress categories
    if (config.suppressedCategories && config.suppressedCategories.length > 0) {
        window.debugLogger.suppressCategories(config.suppressedCategories);
    }
    
    // Enable performance mode if configured
    if (config.performanceMode && config.performanceMode.enabled) {
        window.debugLogger.enablePerformanceMode();
    }
    
    // Log configuration status
    window.debugLogger.info('DebugConfig', `Debug logging configured: Level=${config.logLevel}, Enabled=${config.enabled}`);
} 