/**
 * EPC17 Stress Test Helper
 * Provides stress test utilities while maintaining performance for normal operation
 */
class StressTestHelper {
    constructor() {
        this.dataManager = window.dataManager;
        this.eventBus = window.globalEventBus;
    }

    /**
     * Load all participants for stress testing (use sparingly)
     */
    async loadAllParticipantsForStressTest() {
        console.log('🔧 Loading all participants for stress testing...');
        
        try {
            // Force load all participants with high limit
            const response = await fetch(`${this.dataManager.baseUrl}/participants?limit=15000`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            const participants = data.participants || data;
            
            // Store in data manager
            this.dataManager.data.participants = this.dataManager.optimizeParticipantData(participants);
            this.dataManager.loadedDataTypes.add('participants');
            
            console.log(`✅ Loaded ${participants.length} participants for stress testing`);
            return participants;
            
        } catch (error) {
            console.error('❌ Failed to load all participants for stress testing:', error);
            throw error;
        }
    }

    /**
     * Load participants for a specific event (recommended approach)
     */
    async loadEventParticipants(eventId) {
        console.log(`🔧 Loading participants for event: ${eventId}`);
        
        try {
            const participants = await this.dataManager.loadParticipantsForEvent(eventId);
            console.log(`✅ Loaded ${participants.length} participants for event ${eventId}`);
            return participants;
        } catch (error) {
            console.error(`❌ Failed to load participants for event ${eventId}:`, error);
            throw error;
        }
    }

    /**
     * Validate stress test data integrity
     */
    async validateStressTestData() {
        console.log('🔍 Validating stress test data...');
        
        try {
            // Force reload all data
            await this.dataManager.loadFromStorage(null, true);
            
            const participants = this.dataManager.getParticipantsArray();
            const events = this.dataManager.getEventsArray();
            const series = this.dataManager.getAllSeries();
            
            console.log(`📊 Data loaded:`);
            console.log(`   - Participants: ${participants.length}`);
            console.log(`   - Events: ${events.length}`);
            console.log(`   - Series: ${series.length}`);
            
            // Check if we have stress test data
            if (participants.length >= 10000) {
                console.log('✅ Stress test data detected');
                return true;
            } else {
                console.log('⚠️ Normal data detected (not stress test)');
                return false;
            }
            
        } catch (error) {
            console.error('❌ Error validating stress test data:', error);
            return false;
        }
    }

    /**
     * Test participant lookup functionality
     */
    async testParticipantLookup() {
        console.log('🧪 Testing participant lookup...');
        
        const participants = this.dataManager.getParticipantsArray();
        if (participants.length === 0) {
            console.log('⚠️ No participants loaded, loading event participants...');
            const events = this.dataManager.getEventsArray();
            if (events.length > 0) {
                await this.loadEventParticipants(events[0].id);
            }
        }
        
        const testParticipant = this.dataManager.getParticipantsArray()[0];
        if (testParticipant) {
            const found = this.dataManager.getParticipant(testParticipant.id);
            if (found) {
                console.log(`✅ Participant lookup works: ${found.name}`);
                return true;
            } else {
                console.error(`❌ Participant lookup failed for: ${testParticipant.id}`);
                return false;
            }
        } else {
            console.error('❌ No participants available for testing');
            return false;
        }
    }

    /**
     * Generate stress test report
     */
    async generateStressTestReport() {
        console.log('📋 Generating stress test report...');
        
        const participants = this.dataManager.getParticipantsArray();
        const events = this.dataManager.getEventsArray();
        const series = this.dataManager.getAllSeries();
        
        const report = {
            timestamp: new Date().toISOString(),
            participants: {
                total: participants.length,
                withEventId: participants.filter(p => p.eventId).length,
                withoutEventId: participants.filter(p => !p.eventId).length
            },
            events: {
                total: events.length,
                withParticipants: events.filter(e => e.participants && e.participants.length > 0).length,
                averageParticipants: events.reduce((sum, e) => sum + (e.participants?.length || 0), 0) / events.length
            },
            series: {
                total: series.length
            },
            recommendations: []
        };
        
        // Add recommendations
        if (participants.length > 10000) {
            report.recommendations.push('Use event-specific participant loading for better performance');
        }
        if (participants.filter(p => !p.eventId).length > 0) {
            report.recommendations.push('Some participants are not assigned to events');
        }
        
        console.log('📋 Stress Test Report:', report);
        return report;
    }

    /**
     * Run full validation suite
     */
    async runFullValidation() {
        console.log('🚀 Running full stress test validation...');
        
        try {
            // 1. Validate data integrity
            const isStressTest = await this.validateStressTestData();
            
            // 2. Test participant lookup
            const lookupWorks = await this.testParticipantLookup();
            
            // 3. Generate report
            const report = await this.generateStressTestReport();
            
            console.log('✅ Full validation complete');
            return {
                isStressTest,
                lookupWorks,
                report
            };
            
        } catch (error) {
            console.error('❌ Full validation failed:', error);
            throw error;
        }
    }

    /**
     * Load participants for current event (if any)
     */
    async loadCurrentEventParticipants() {
        // Try to find current event from URL or active state
        const currentEventId = this.getCurrentEventId();
        if (currentEventId) {
            return await this.loadEventParticipants(currentEventId);
        } else {
            console.log('⚠️ No current event detected');
            return [];
        }
    }

    /**
     * Get current event ID from various sources
     */
    getCurrentEventId() {
        // Check URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const eventId = urlParams.get('eventId');
        if (eventId) return eventId;
        
        // Check if we're on a specific event page
        const path = window.location.pathname;
        if (path.includes('events.html')) {
            // Try to extract from page state
            if (window.currentEvent && window.currentEvent.id) {
                return window.currentEvent.id;
            }
        }
        
        return null;
    }
}

// Auto-initialize if in browser
if (typeof window !== 'undefined') {
    // Wait for data manager to be available
    const initHelper = () => {
        if (window.dataManager) {
            window.stressTestHelper = new StressTestHelper();
            console.log('🔧 Stress Test Helper initialized');
            
            // Auto-run validation if this is a stress test
            if (window.location.search.includes('stress-test')) {
                console.log('🔍 Auto-running stress test validation...');
                window.stressTestHelper.runFullValidation().catch(console.error);
            }
        } else {
            setTimeout(initHelper, 100);
        }
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHelper);
    } else {
        initHelper();
    }
}

// Node.js export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StressTestHelper;
} 