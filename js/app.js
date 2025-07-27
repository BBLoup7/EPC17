// Initialize core systems first
console.log('🏁 Initializing Snowmobile Racing Event Manager (SIMPLIFIED)...');

// Initialize performance monitor first (with fallback)
let performanceMonitor;
try {
    performanceMonitor = window.performanceMonitor || new PerformanceMonitor();
} catch (error) {
    console.warn('⚠️ PerformanceMonitor not available, creating fallback:', error);
    // Create a simple fallback performance monitor
    performanceMonitor = {
        trackOperation: (name, operation) => operation(),
        startMonitoring: () => console.log('📊 Performance monitoring not available'),
        stopMonitoring: () => console.log('📊 Performance monitoring not available'),
        getPerformanceReport: () => ({ status: 'not available' }),
        logPerformanceSummary: () => console.log('📊 Performance monitoring not available')
    };
}

// Initialize managers with performance tracking
const dataManager = new DataManager();
const eventManager = new EventManager(dataManager);
const pairingEngine = new PairingEngine();
const raceManager = new RaceManager(dataManager, pairingEngine);
const raceUI = new RaceUI(raceManager, dataManager);

// Get systems from data manager (initialized automatically)
const statisticsManager = dataManager.statisticsManager;
const eventBus = dataManager.eventBus;

// Make managers globally available
window.dataManager = dataManager;
window.eventManager = eventManager;
window.pairingEngine = pairingEngine;
window.raceManager = raceManager;
window.raceUI = raceUI;
window.statisticsManager = statisticsManager;
window.eventBus = eventBus;
window.performanceMonitor = performanceMonitor;

console.log('📊 Statistics Manager:', statisticsManager ? 'Ready' : 'Not Available');
console.log('📡 Event Bus:', eventBus ? 'Ready' : 'Not Available');
console.log('📊 Performance Monitor:', performanceMonitor ? 'Ready' : 'Not Available');

// Performance monitoring functions
window.getPerformanceReport = function() {
    if (performanceMonitor) {
        return performanceMonitor.getPerformanceReport();
    }
    return null;
};

window.logPerformanceSummary = function() {
    if (performanceMonitor) {
        return performanceMonitor.logPerformanceSummary();
    }
    return null;
};

// Initialize data loading on app start with performance tracking
async function initializeApp() {
    console.log('🚀 Initializing application (SIMPLIFIED)...');
    
    try {
        // Track initialization performance
        await performanceMonitor.trackOperation('app_initialization', async () => {
            // Load essential data first (series, events, participants, and race brackets)
            await dataManager.loadFromStorage(['series', 'events', 'participants', 'race-brackets']);
            
            // Load other data types in background
            setTimeout(async () => {
                await dataManager.loadFromStorage(['races']);
            }, 100);
        });
        
        // Add manual statistics recalculation function for testing
        window.recalculateAllStats = async function() {
            if (statisticsManager) {
                console.log('📊 Manual statistics recalculation triggered...');
                try {
                    const count = await performanceMonitor.trackOperation('statistics_recalculation', async () => {
                        return await statisticsManager.recalculateAllStats();
                    });
                    console.log(`✅ Statistics recalculated for ${count} participants`);
                    if (typeof showToast === 'function') {
                        showToast(`Statistics recalculated for ${count} participants`, 'success');
                    }
                } catch (error) {
                    console.error('❌ Statistics recalculation failed:', error);
                    if (typeof showToast === 'function') {
                        showToast('Statistics recalculation failed', 'error');
                    }
                }
            } else {
                console.warn('⚠️ StatisticsManager not available');
            }
        };
        
        // Add event bus debugging function
        window.debugEventBus = function() {
            if (eventBus) {
                console.log('📡 Event Bus Debug Info:', eventBus.getDebugInfo());
                return eventBus.getDebugInfo();
            } else {
                console.warn('⚠️ Event Bus not available');
                return null;
            }
        };

        // Add UI integration testing function
        window.testUIIntegration = function() {
            console.log('🎨 Testing UI integration features...');
            
            const tests = {
                eventBus: eventBus !== null,
                statisticsManager: statisticsManager !== null,
                performanceMonitor: performanceMonitor !== null,
                dataManager: dataManager !== null
            };
            
            console.log('✅ UI Integration Test Results:', tests);
            
            return tests;
        };

        // Add performance monitoring functions
        window.startPerformanceMonitoring = function() {
            if (performanceMonitor) {
                performanceMonitor.startMonitoring();
                console.log('📊 Performance monitoring started');
            }
        };

        window.stopPerformanceMonitoring = function() {
            if (performanceMonitor) {
                performanceMonitor.stopMonitoring();
                console.log('📊 Performance monitoring stopped');
            }
        };

        // Add data manager debugging function
        window.debugDataManager = function() {
            if (dataManager) {
                return dataManager.debugDataStorage();
            } else {
                console.warn('⚠️ DataManager not available');
                return null;
            }
        };

        // Add server health check function
        window.checkServerHealth = async function() {
            if (dataManager) {
                try {
                    const health = await dataManager.getServerHealth();
                    console.log('🏥 Server health check:', health);
                    return health;
                } catch (error) {
                    console.error('❌ Server health check failed:', error);
                    return { status: 'error', message: error.message };
                }
            } else {
                console.warn('⚠️ DataManager not available');
                return null;
            }
        };

        console.log('✅ Application initialization complete (SIMPLIFIED)');
        
        // Show performance summary after initialization
        setTimeout(() => {
            if (performanceMonitor) {
                performanceMonitor.logPerformanceSummary();
            }
        }, 1000);
        
    } catch (error) {
        console.error('❌ Application initialization failed:', error);
        
        // Show error toast if available
        if (typeof showToast === 'function') {
            showToast('Application initialization failed: ' + error.message, 'error');
        }
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        dataManager,
        eventManager,
        pairingEngine,
        raceManager,
        raceUI,
        statisticsManager,
        eventBus,
        performanceMonitor
    };
} 