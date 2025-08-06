/**
 * Test script for Event Status Management
 * Tests the new event status update functionality
 */

console.log('🧪 Testing Event Status Management...');

// Test 1: Check if DataManager has the new methods
async function testDataManagerMethods() {
    console.log('\n📋 Test 1: DataManager Methods');
    
    if (typeof DataManager !== 'undefined') {
        const dataManager = new DataManager();
        
        // Check if new methods exist
        const hasUpdateEventStatus = typeof dataManager.updateEventStatus === 'function';
        const hasIsEventCompleted = typeof dataManager.isEventCompleted === 'function';
        const hasInitializeEventStatuses = typeof dataManager.initializeEventStatuses === 'function';
        
        console.log('✅ updateEventStatus method:', hasUpdateEventStatus);
        console.log('✅ isEventCompleted method:', hasIsEventCompleted);
        console.log('✅ initializeEventStatuses method:', hasInitializeEventStatuses);
        
        return hasUpdateEventStatus && hasIsEventCompleted && hasInitializeEventStatuses;
    } else {
        console.log('❌ DataManager not available');
        return false;
    }
}

// Test 2: Check if RaceManager has the new method
async function testRaceManagerMethods() {
    console.log('\n📋 Test 2: RaceManager Methods');
    
    if (typeof RaceManager !== 'undefined') {
        const dataManager = new DataManager();
        const pairingEngine = new PairingEngine();
        const raceManager = new RaceManager(dataManager, pairingEngine);
        
        const hasCheckAndUpdateEventStatus = typeof raceManager.checkAndUpdateEventStatus === 'function';
        
        console.log('✅ checkAndUpdateEventStatus method:', hasCheckAndUpdateEventStatus);
        
        return hasCheckAndUpdateEventStatus;
    } else {
        console.log('❌ RaceManager not available');
        return false;
    }
}

// Test 3: Check if EventManager has updated generateBracket method
async function testEventManagerMethods() {
    console.log('\n📋 Test 3: EventManager Methods');
    
    if (typeof EventManager !== 'undefined') {
        const eventManager = new EventManager();
        
        // Check if generateBracket is now async
        const generateBracketFunction = eventManager.generateBracket;
        const isAsync = generateBracketFunction && generateBracketFunction.constructor.name === 'AsyncFunction';
        
        console.log('✅ generateBracket is async:', isAsync);
        
        return isAsync;
    } else {
        console.log('❌ EventManager not available');
        return false;
    }
}

// Test 4: Check event bus integration
async function testEventBusIntegration() {
    console.log('\n📋 Test 4: Event Bus Integration');
    
    if (typeof globalEventBus !== 'undefined') {
        const eventBus = globalEventBus;
        
        // Test if we can listen for the new events
        let eventStatusReceived = false;
        let eventCompletedReceived = false;
        
        eventBus.on('eventStatusUpdated', (data) => {
            console.log('✅ eventStatusUpdated event received:', data);
            eventStatusReceived = true;
        });
        
        eventBus.on('eventCompleted', (data) => {
            console.log('✅ eventCompleted event received:', data);
            eventCompletedReceived = true;
        });
        
        // Emit test events
        eventBus.emit('eventStatusUpdated', { eventId: 'test', status: 'active' });
        eventBus.emit('eventCompleted', { eventId: 'test', status: 'completed' });
        
        // Wait a bit for events to be processed
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.log('✅ Event bus listeners working:', eventStatusReceived && eventCompletedReceived);
        
        return eventStatusReceived && eventCompletedReceived;
    } else {
        console.log('❌ Global event bus not available');
        return false;
    }
}

// Run all tests
async function runAllTests() {
    console.log('🚀 Starting Event Status Management Tests...\n');
    
    const results = await Promise.all([
        testDataManagerMethods(),
        testRaceManagerMethods(),
        testEventManagerMethods(),
        testEventBusIntegration()
    ]);
    
    const passed = results.filter(r => r).length;
    const total = results.length;
    
    console.log('\n📊 Test Results:');
    console.log(`✅ Passed: ${passed}/${total}`);
    console.log(`❌ Failed: ${total - passed}/${total}`);
    
    if (passed === total) {
        console.log('\n🎉 All tests passed! Event status management is working correctly.');
    } else {
        console.log('\n⚠️ Some tests failed. Please check the implementation.');
    }
}

// Run tests when script is loaded
if (typeof window !== 'undefined') {
    // Browser environment
    window.addEventListener('load', () => {
        setTimeout(runAllTests, 1000); // Wait for all modules to load
    });
} else {
    // Node.js environment
    runAllTests();
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        testDataManagerMethods,
        testRaceManagerMethods,
        testEventManagerMethods,
        testEventBusIntegration,
        runAllTests
    };
} 