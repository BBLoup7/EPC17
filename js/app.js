// Initialize core systems first
if (window.debugLogger) {
    window.debugLogger.init('App', 'Initializing EPC17 Event Management System');
} else {
    console.log('🏁 Initializing EPC17 Event Management System...');
}

// Initialize performance monitor first (with fallback)
let performanceMonitor;
try {
    performanceMonitor = window.performanceMonitor || new PerformanceMonitor();
} catch (error) {
    if (window.debugLogger) {
        window.debugLogger.warn('App', 'PerformanceMonitor not available, creating fallback', error);
    } else {
        console.warn('⚠️ PerformanceMonitor not available, creating fallback:', error);
    }
    // Create a simple fallback performance monitor
    performanceMonitor = {
        trackOperation: (name, operation) => operation(),
        startMonitoring: () => {
            if (window.debugLogger) {
                window.debugLogger.performance('Performance monitoring not available');
            }
        },
        stopMonitoring: () => {
            if (window.debugLogger) {
                window.debugLogger.performance('Performance monitoring not available');
            }
        },
        getPerformanceReport: () => ({ status: 'not available' }),
        getLastOperationStats: () => null,
        logPerformanceSummary: () => {
            if (window.debugLogger) {
                window.debugLogger.performance('Performance monitoring not available');
            }
        }
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

if (window.debugLogger) {
    window.debugLogger.info('App', 'Statistics Manager: ' + (statisticsManager ? 'Ready' : 'Not Available'));
    window.debugLogger.info('App', 'Event Bus: ' + (eventBus ? 'Ready' : 'Not Available'));
    window.debugLogger.info('App', 'Performance Monitor: ' + (performanceMonitor ? 'Ready' : 'Not Available'));
} else {
    console.log('📊 Statistics Manager:', statisticsManager ? 'Ready' : 'Not Available');
    console.log('📡 Event Bus:', eventBus ? 'Ready' : 'Not Available');
    console.log('📊 Performance Monitor:', performanceMonitor ? 'Ready' : 'Not Available');
}

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

// Enhanced App class with performance monitoring
class App {
    constructor() {
        this.currentSection = 'home';
        this.loadingStack = [];
        this.performanceOptimizations = true;
        
        // Initialize performance monitoring
        this.initializePerformanceMonitoring();
        
        if (window.debugLogger) {
            window.debugLogger.success('App', 'App initialized with performance optimizations');
        } else {
            console.log('🚀 App initialized with performance optimizations');
        }
    }

    /**
     * Initialize performance monitoring system
     */
    initializePerformanceMonitoring() {
        if (window.performanceMonitor) {
            if (window.debugLogger) {
                window.debugLogger.performance('Starting performance monitoring');
            }
            window.performanceMonitor.startMonitoring();
            
            // Set up periodic performance checks
            this.setupPerformanceChecks();
            
            // Set up memory cleanup intervals
            this.setupMemoryCleanup();
        }
    }

    /**
     * Set up periodic performance checks
     */
    setupPerformanceChecks() {
        // Check performance every 30 seconds
        setInterval(() => {
            this.performPerformanceCheck();
        }, 30000);
        
        // Full performance audit every 5 minutes
        setInterval(() => {
            this.performFullPerformanceAudit();
        }, 300000);
    }

    /**
     * Set up memory cleanup intervals
     */
    setupMemoryCleanup() {
        // Light cleanup every 2 minutes
        setInterval(() => {
            this.performLightCleanup();
        }, 120000);
        
        // Deep cleanup every 10 minutes
        setInterval(() => {
            this.performDeepCleanup();
        }, 600000);
    }

    /**
     * Perform quick performance check
     */
    performPerformanceCheck() {
        if (!window.performanceMonitor) return;
        
        const health = window.performanceMonitor.checkRacingAppPerformance();
        
        if (health.overallHealth === 'poor') {
            console.warn('⚠️ Performance issues detected:', health.issues);
            this.handlePerformanceIssues(health.issues);
        } else if (health.overallHealth === 'needs_improvement') {
            console.log('💡 Performance could be improved:', health.issues);
        }
    }

    /**
     * Perform full performance audit
     */
    performFullPerformanceAudit() {
        if (!window.performanceMonitor) return;
        
        console.log('🔍 Performing full performance audit...');
        const report = window.performanceMonitor.getPerformanceReport();
        
        // Log summary for debugging
        console.log('📊 Performance Audit Results:');
        console.log(`Memory: ${(report.memory.current / 1024 / 1024).toFixed(2)}MB (${report.memory.trend})`);
        console.log(`Operations tracked: ${Object.keys(report.operations).length}`);
        
        if (report.recommendations.length > 0) {
            console.log('💡 Performance Recommendations:');
            report.recommendations.forEach((rec, index) => {
                console.log(`${index + 1}. ${rec.suggestion}`);
            });
        }
        
        // Auto-optimize if critical issues found
        this.autoOptimizeIfNeeded(report);
    }

    /**
     * Handle performance issues automatically
     */
    handlePerformanceIssues(issues) {
        issues.forEach(issue => {
            switch (issue.operation) {
                case 'participant_data_load':
                    console.log('🔧 Auto-optimizing participant data loading...');
                    this.optimizeParticipantLoading();
                    break;
                case 'bracket_render':
                    console.log('🔧 Auto-optimizing bracket rendering...');
                    this.optimizeBracketRendering();
                    break;
                case 'page_change':
                    console.log('🔧 Auto-optimizing page changes...');
                    this.optimizePageChanges();
                    break;
            }
        });
    }

    /**
     * Auto-optimize based on performance report
     */
    autoOptimizeIfNeeded(report) {
        // Check memory usage
        if (report.memory.trend === 'increasing') {
            console.log('🧹 Memory trend increasing - triggering cleanup...');
            this.performDeepCleanup();
        }
        
        // Check for excessive operations
        const operationCounts = Object.values(report.operations)
            .reduce((sum, op) => sum + op.count, 0);
            
        if (operationCounts > 1000) {
            console.log('🔧 High operation count detected - optimizing...');
            this.optimizeHighTrafficOperations();
        }
    }

    /**
     * Optimize participant loading
     */
    optimizeParticipantLoading() {
        // Increase cache TTL
        if (window.performanceCache) {
            window.performanceCache.cacheTTL = Math.min(window.performanceCache.cacheTTL * 1.5, 300000);
            console.log(`📊 Increased cache TTL to ${window.performanceCache.cacheTTL}ms`);
        }
        
        // Trigger cache rebuild
        if (typeof window.buildParticipantEventCache === 'function') {
            window.buildParticipantEventCache();
        }
    }

    /**
     * Optimize bracket rendering
     */
    optimizeBracketRendering() {
        // Clear any heavy DOM elements
        const containers = document.querySelectorAll('.bracket-container, .brackets-container');
        containers.forEach(container => {
            if (container.children.length > 100) {
                console.log('🧹 Clearing heavy bracket container...');
                const firstChild = container.firstChild;
                container.innerHTML = '';
                if (firstChild) container.appendChild(firstChild);
            }
        });
    }

    /**
     * Optimize page changes
     */
    optimizePageChanges() {
        // Preload critical resources
        this.preloadCriticalResources();
        
        // Optimize navigation
        this.optimizeNavigation();
    }

    /**
     * Optimize high traffic operations
     */
    optimizeHighTrafficOperations() {
        // Clear operation history to reset counters
        if (window.performanceMonitor) {
            console.log('🔄 Clearing performance monitoring data...');
            window.performanceMonitor.clearData();
        }
        
        // Trigger UI cleanup
        this.performLightCleanup();
    }

    /**
     * Perform light cleanup
     */
    performLightCleanup() {
        console.log('🧹 Performing light memory cleanup...');
        
        // Clear UI component cache
        if (window.UIComponents) {
            window.UIComponents.clearCache();
        }
        
        // Clear any temporary data
        if (window.tempCache) {
            window.tempCache.clear();
        }
    }

    /**
     * Perform deep cleanup
     */
    performDeepCleanup() {
        console.log('🧹 Performing deep memory cleanup...');
        
        // UI Components cleanup
        if (window.UIComponents) {
            window.UIComponents.performMemoryCleanup();
        }
        
        // Clear large data caches
        if (window.performanceCache) {
            if (window.performanceCache.participantEventMap.size > 1000) {
                console.log('🧹 Clearing large participant event cache...');
                window.performanceCache.participantEventMap.clear();
                window.performanceCache.lastCacheUpdate = 0;
            }
        }
        
        // Clear browser caches if available
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => {
                    if (name.includes('temp') || name.includes('old')) {
                        caches.delete(name);
                    }
                });
            });
        }
        
        // Force garbage collection hint
        if (window.gc && typeof window.gc === 'function') {
            setTimeout(() => window.gc(), 1000);
        }
    }

    /**
     * Preload critical resources
     */
    preloadCriticalResources() {
        // Preload critical data if not already loaded
        if (window.dataManager) {
            const criticalTypes = ['participants', 'events'];
            criticalTypes.forEach(type => {
                if (!window.dataManager.data[type] || window.dataManager.data[type].length === 0) {
                    console.log(`⏳ Preloading critical data: ${type}`);
                    window.dataManager.loadFromStorage([type]);
                }
            });
        }
    }

    /**
     * Optimize navigation
     */
    optimizeNavigation() {
        // Prefetch likely next sections based on user behavior
        const currentSection = this.currentSection;
        const likelyNext = this.getLikelyNextSection(currentSection);
        
        if (likelyNext) {
            console.log(`⏳ Prefetching likely next section: ${likelyNext}`);
            this.prefetchSection(likelyNext);
        }
    }

    /**
     * Get likely next section based on current section
     */
    getLikelyNextSection(currentSection) {
        const navigationPatterns = {
            'home': 'series',
            'series': 'events',
            'events': 'registration',
            'registration': 'races',
            'races': 'analytics'
        };
        
        return navigationPatterns[currentSection];
    }

    /**
     * Prefetch section resources
     */
    prefetchSection(sectionName) {
        // Prefetch section-specific data
        const sectionDataMap = {
            'events': ['events', 'series'],
            'registration': ['participants', 'events'],
            'races': ['race-brackets', 'events'],
            'analytics': ['participants', 'events', 'race-brackets']
        };
        
        const dataTypes = sectionDataMap[sectionName];
        if (dataTypes && window.dataManager) {
            window.dataManager.loadFromStorage(dataTypes).catch(() => {
                // Silent fail for prefetching
            });
        }
    }
}

// Wait for authentication to complete before loading data
async function waitForAuthentication() {
    console.log('🔐 Waiting for authentication to complete...');
    
    // Wait for Auth to be available and initialized
    let attempts = 0;
    while (!window.Auth && attempts < 100) { // Max 5 seconds
        await new Promise(resolve => setTimeout(resolve, 50));
        attempts++;
    }
    
    if (!window.Auth) {
        console.warn('🔐 Auth system not available after waiting, proceeding without authentication');
        return false;
    }
    
    // Wait a bit more for session restoration to complete
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Check if we have a valid session
    if (!window.currentUser) {
        console.log('🔐 No current user, authentication failed');
        return false;
    }
    
    console.log('🔐 Authentication complete, proceeding with data load');
    return true;
}

// Initialize data loading on app start with performance tracking
async function initializeApp() {
    console.log('🚀 Initializing application (SIMPLIFIED)...');
    
    try {
        // Wait for authentication to complete before loading data
        await waitForAuthentication();
        
        // Track initialization performance
        await performanceMonitor.trackOperation('app_initialization', async () => {
            // Load essential data first (series, events, participants, and race brackets)
            await dataManager.loadFromStorage(['series', 'events', 'participants', 'race-brackets']);
            
            // Initialize RaceUI after authentication and data loading
            if (raceUI && typeof raceUI.init === 'function') {
                console.log('🔐 Initializing RaceUI after authentication...');
                await raceUI.init();
            }
            
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