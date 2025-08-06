# 🏁 EPC17 Development Guide

## 📋 Quick Reference

### Current Version
- **Beta Code**: `25W32a09`
- **Official Version**: `0.9.2a25` (next release)
- **Last Updated**: Week 32, 2025

### Development Environment
- **Server**: Flask on port 5000
- **Frontend**: HTML5/CSS3/ES6+
- **Data**: JSON with automatic backups
- **Network**: Multi-computer accessible

## 🚀 Getting Started

### Prerequisites
```bash
# Python 3.8+
python --version

# Install dependencies
pip install -r requirements.txt

# Start development server
python server.py
```

### Access Points
- **Local**: `http://localhost:5000`
- **Network**: `http://[your-ip]:5000`

## 🧩 Module Architecture

### Core Modules Overview

#### 1. Registration (`modules/registration.js`)
```javascript
// Participant management with validation
class RegistrationManager {
    async registerParticipant(participantData) {
        // Validation
        // Data persistence
        // Event bus notification
    }
}
```

#### 2. Series Management (`modules/series.js`)
```javascript
// Championship series configuration
class SeriesManager {
    async createSeries(seriesData) {
        // Series validation
        // Event linking
        // Standings initialization
    }
}
```

#### 3. Event Management (`modules/event.js`)
```javascript
// Individual event operations
class EventManager {
    async createEvent(eventData) {
        // Track configuration
        // Participant assignment
        // Bracket generation
    }
}
```

#### 4. Pairing Engine (`modules/pairing-engine.js`)
```javascript
// Advanced bracket generation
class PairingEngine {
    async generateHeats(participants, numberOfLanes, roundNumber) {
        // Rematch avoidance
        // Lane optimization
        // Performance scaling
    }
}
```

#### 5. Race Management (`modules/race.js`)
```javascript
// Real-time race operations
class RaceManager {
    async recordResult(raceId, results) {
        // Result validation
        // Standings update
        // Event bus notification
    }
}
```

## 🔄 Pairing Logic Implementation

### Rematch Avoidance Algorithm
```javascript
// Example from pairing-engine.js
haveRacedBefore(participantId1, participantId2) {
    const history1 = this.opponentHistory.get(participantId1);
    const history2 = this.opponentHistory.get(participantId2);
    
    return history1.has(participantId2) || history2.has(participantId1);
}
```

### Lane Assignment Optimization
```javascript
// Least-used lane selection
getLeastUsedLane(laneStats) {
    let minCount = Infinity;
    let leastUsedLane = 1;
    
    for (const [lane, count] of Object.entries(laneStats)) {
        if (count < minCount) {
            minCount = count;
            leastUsedLane = parseInt(lane);
        }
    }
    
    return leastUsedLane;
}
```

### Performance Scaling
```javascript
// Large dataset handling
async generateHeatsOptimized(participants, numberOfLanes) {
    if (participants.length > 500) {
        console.warn('Large dataset detected - using optimized algorithm');
        // Implement chunked processing
        return this.generateHeatsChunked(participants, numberOfLanes);
    }
    
    return this.generateHeatsStandard(participants, numberOfLanes);
}
```

## 🧪 Testing Implementation

### Unit Test Structure
```javascript
// Example: pairing-engine-test.js
describe('PairingEngine', () => {
    test('should avoid rematches', () => {
        const engine = new PairingEngine();
        const participants = generateTestParticipants(10);
        
        const heats1 = engine.generateHeats(participants, 2, 1);
        const heats2 = engine.generateHeats(participants, 2, 2);
        
        // Verify no rematches between rounds
        expect(hasRematches(heats1, heats2)).toBe(false);
    });
});
```

### Integration Test Example
```javascript
// Example: event-completion-test.html
async function testEventCompletion() {
    // Create test event
    const event = await createTestEvent();
    
    // Generate heats
    const heats = await generateTestHeats(event);
    
    // Complete all races
    for (const heat of heats) {
        await recordTestResult(heat.id, generateTestResult(heat));
    }
    
    // Verify event status
    const updatedEvent = await getEvent(event.id);
    expect(updatedEvent.status).toBe('completed');
}
```

### Performance Test Structure
```javascript
// Example: stress-test-generator.js
async function generateLargeDataset(participantCount) {
    const participants = [];
    
    for (let i = 0; i < participantCount; i++) {
        participants.push({
            id: generateUUID(),
            name: `Driver ${i + 1}`,
            class: getRandomClass(),
            // ... other properties
        });
    }
    
    return participants;
}
```

## 🎨 UI/UX Standards

### CSS Custom Properties
```css
/* Theme consistency */
:root {
    --primary-color: #2563eb;
    --secondary-color: #64748b;
    --success-color: #10b981;
    --warning-color: #f59e0b;
    --error-color: #ef4444;
    
    --bg-primary: #ffffff;
    --bg-secondary: #f8fafc;
    --text-primary: #1e293b;
    --text-secondary: #64748b;
    
    --border-color: #e2e8f0;
    --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}
```

### Loading States
```javascript
// Skeleton loading implementation
function showSkeletonLoading(containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = `
        <div class="skeleton-card">
            <div class="skeleton-header"></div>
            <div class="skeleton-content">
                <div class="skeleton-line"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line"></div>
            </div>
        </div>
    `;
}
```

### Error Handling
```javascript
// Comprehensive error handling
async function handleApiCall(apiFunction, errorContext) {
    try {
        showLoadingState();
        const result = await apiFunction();
        showSuccessState();
        return result;
    } catch (error) {
        console.error(`Error in ${errorContext}:`, error);
        showErrorState(getUserFriendlyMessage(error));
        throw error;
    } finally {
        hideLoadingState();
    }
}
```

## 📊 Performance Monitoring

### Built-in Performance Tracking
```javascript
// Performance monitoring usage
const performanceMonitor = new PerformanceMonitor();

// Track operation performance
const result = await performanceMonitor.trackOperation('generateHeats', async () => {
    return await pairingEngine.generateHeats(participants, numberOfLanes);
});

// Get performance report
const report = performanceMonitor.getPerformanceReport();
console.log('Performance Report:', report);
```

### Memory Management
```javascript
// Automatic cleanup
class MemoryManager {
    performLightCleanup() {
        // Clear temporary data
        // Reset caches
        // Garbage collection hints
    }
    
    performDeepCleanup() {
        // Clear all caches
        // Reset state
        // Force garbage collection
    }
}
```

## 🔧 Development Tools

### Debug Logging
```javascript
// Configurable logging
const debugLogger = new DebugLogger({
    level: 'info',
    categories: ['App', 'Pairing', 'Race'],
    performanceMode: true
});

debugLogger.info('App', 'Application initialized');
debugLogger.warn('Pairing', 'Large dataset detected');
debugLogger.error('Race', 'Failed to record result', error);
```

### Event Bus System
```javascript
// Centralized communication
const eventBus = new EventBus();

// Subscribe to events
eventBus.subscribe('race:result:recorded', (data) => {
    updateStandings(data);
    updateLiveDisplay(data);
});

// Publish events
eventBus.publish('race:result:recorded', {
    raceId: 'uuid',
    results: raceResults
});
```

## 📝 Documentation Standards

### JSDoc Comments
```javascript
/**
 * Advanced Pairing Engine for EPC17 Event Management System
 * 
 * Handles multi-lane race generation, lane assignment optimization, 
 * and opponent tracking with performance scaling for large datasets.
 * 
 * @class PairingEngine
 * @description Core pairing logic for racing event management
 * 
 * @example
 * const engine = new PairingEngine();
 * const heats = await engine.generateHeats(participants, 2, 1);
 */
class PairingEngine {
    /**
     * Generate heats for a round with optimized pairing logic
     * 
     * @param {Array} participants - Array of participant objects
     * @param {number} numberOfLanes - Number of available lanes
     * @param {number} roundNumber - Current round number
     * @param {string} eventId - Event identifier
     * @returns {Promise<Array>} Array of heat objects
     * 
     * @throws {Error} When participants array is empty
     */
    async generateHeats(participants, numberOfLanes, roundNumber = 1, eventId = null) {
        // Implementation
    }
}
```

### Commit Message Format
```bash
# Format: [Module] Brief description - files changed
[Pairing] Optimize lane assignment for large datasets - pairing-engine.js, tests/
[UI] Add skeleton loading for participant list - registration.html, styles.css
[API] Add event completion endpoint - server.py, modules/event.js
```

## 🚨 Common Issues & Solutions

### Performance Issues
**Problem**: Slow pairing generation with large datasets
**Solution**: 
```javascript
// Use optimized algorithms for datasets > 500 participants
if (participants.length > 500) {
    return this.generateHeatsOptimized(participants, numberOfLanes);
}
```

### Memory Leaks
**Problem**: Memory usage increases over time
**Solution**:
```javascript
// Implement automatic cleanup
setInterval(() => {
    memoryManager.performLightCleanup();
}, 30000); // Every 30 seconds
```

### Network Issues
**Problem**: Data not syncing between computers
**Solution**:
```javascript
// Implement retry logic with exponential backoff
async function retryApiCall(apiFunction, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await apiFunction();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
    }
}
```

## 📈 Best Practices

### Code Organization
1. **Separation of Concerns**: Keep UI, business logic, and data access separate
2. **Modular Design**: Each module should have a single responsibility
3. **Error Boundaries**: Implement comprehensive error handling at each layer
4. **Performance First**: Consider performance implications of all decisions

### Testing Strategy
1. **Unit Tests**: Test individual functions and methods
2. **Integration Tests**: Test module interactions
3. **Performance Tests**: Validate large dataset handling
4. **UI Tests**: Verify user interactions and accessibility

### Documentation
1. **Code Comments**: Explain complex logic and business rules
2. **API Documentation**: Document all public interfaces
3. **User Guides**: Provide clear instructions for end users
4. **Change Logs**: Track all user-facing changes

---

**EPC Technology - Project 17**  
*Professional Racing Event Management System* 