/**
 * Performance Monitor for Snowmobile Drag Racing Event Manager
 * Tracks and optimizes application performance for large datasets
 */

class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
        this.operations = new Map();
        this.memoryUsage = [];
        this.loadTimes = [];
        this.maxMemorySamples = 100;
        this.maxLoadTimeSamples = 50;
        
        this.startTime = Date.now();
        this.isMonitoring = false;
        
        console.log('📊 PerformanceMonitor initialized');
    }

    /**
     * Start monitoring performance
     */
    startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        this.monitorMemory();
        this.monitorNetwork();
        this.monitorUI();
        
        console.log('📊 Performance monitoring started');
    }

    /**
     * Stop monitoring performance
     */
    stopMonitoring() {
        this.isMonitoring = false;
        console.log('📊 Performance monitoring stopped');
    }

    /**
     * Track operation performance
     */
    trackOperation(operationName, operation) {
        const startTime = performance.now();
        const startMemory = this.getMemoryUsage();
        
        return operation().finally(() => {
            const endTime = performance.now();
            const endMemory = this.getMemoryUsage();
            
            const duration = endTime - startTime;
            const memoryDelta = endMemory - startMemory;
            
            this.recordOperation(operationName, duration, memoryDelta);
        });
    }

    /**
     * Record operation metrics
     */
    recordOperation(operationName, duration, memoryDelta) {
        if (!this.operations.has(operationName)) {
            this.operations.set(operationName, {
                count: 0,
                totalDuration: 0,
                avgDuration: 0,
                minDuration: Infinity,
                maxDuration: 0,
                totalMemoryDelta: 0,
                avgMemoryDelta: 0
            });
        }
        
        const stats = this.operations.get(operationName);
        stats.count++;
        stats.totalDuration += duration;
        stats.avgDuration = stats.totalDuration / stats.count;
        stats.minDuration = Math.min(stats.minDuration, duration);
        stats.maxDuration = Math.max(stats.maxDuration, duration);
        stats.totalMemoryDelta += memoryDelta;
        stats.avgMemoryDelta = stats.totalMemoryDelta / stats.count;
        
        // Log slow operations
        if (duration > 1000) { // 1 second threshold
            console.warn(`🐌 Slow operation detected: ${operationName} took ${duration.toFixed(2)}ms`);
        }
    }

    /**
     * Monitor memory usage
     */
    monitorMemory() {
        if (!this.isMonitoring) return;
        
        const memory = this.getMemoryUsage();
        this.memoryUsage.push({
            timestamp: Date.now(),
            memory: memory
        });
        
        // Keep only recent samples
        if (this.memoryUsage.length > this.maxMemorySamples) {
            this.memoryUsage.shift();
        }
        
        // Check for memory leaks
        if (this.memoryUsage.length >= 10) {
            const recent = this.memoryUsage.slice(-10);
            const older = this.memoryUsage.slice(-20, -10);
            
            const recentAvg = recent.reduce((sum, sample) => sum + sample.memory, 0) / recent.length;
            const olderAvg = older.reduce((sum, sample) => sum + sample.memory, 0) / older.length;
            
            if (recentAvg > olderAvg * 1.5) { // 50% increase
                console.warn('⚠️ Potential memory leak detected');
            }
        }
        
        setTimeout(() => this.monitorMemory(), 5000); // Check every 5 seconds
    }

    /**
     * Monitor network performance
     */
    monitorNetwork() {
        if (!this.isMonitoring) return;
        
        // Override fetch to track network performance
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const startTime = performance.now();
            const url = args[0];
            
            try {
                const response = await originalFetch(...args);
                const endTime = performance.now();
                const duration = endTime - startTime;
                
                this.recordOperation(`network_${url}`, duration, 0);
                
                return response;
            } catch (error) {
                const endTime = performance.now();
                const duration = endTime - startTime;
                
                this.recordOperation(`network_error_${url}`, duration, 0);
                throw error;
            }
        };
    }

    /**
     * Monitor UI performance with improved thresholds
     */
    monitorUI() {
        if (!this.isMonitoring) return;
        
        // Monitor DOM mutations with improved thresholds
        const observer = new MutationObserver((mutations) => {
            const startTime = performance.now();
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    const nodeCount = mutation.addedNodes.length;
                    
                    // Adjusted thresholds for different operation types
                    let threshold = 15; // Default threshold
                    
                    // Get operation context from stack trace
                    const stack = new Error().stack;
                    
                    // More lenient thresholds for specific operations
                    if (stack.includes('skeleton') || stack.includes('Skeleton')) {
                        threshold = 20; // Skeleton loading can have more nodes
                    } else if (stack.includes('participant') || stack.includes('Participant')) {
                        threshold = 25; // Participant operations optimized but may need more nodes
                    } else if (stack.includes('event') || stack.includes('Event')) {
                        threshold = 12; // Event cards should be smaller
                    } else if (stack.includes('bracket') || stack.includes('Bracket')) {
                        threshold = 30; // Bracket rendering is complex
                    }
                    
                    if (nodeCount > threshold) {
                        console.warn(`🐌 Large DOM update detected: ${nodeCount} nodes added (threshold: ${threshold})`);
                        
                        // Provide specific recommendations
                        if (nodeCount > threshold * 2) {
                            console.warn('💡 Consider using DocumentFragment or virtual scrolling for this operation');
                        }
                    } else if (nodeCount > 8) {
                        // Informational logging for medium updates
                        console.log(`📊 DOM update: ${nodeCount} nodes added (acceptable)`);
                    }
                }
            });
            
            const endTime = performance.now();
            this.recordOperation('dom_mutation', endTime - startTime, 0);
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Get current memory usage
     */
    getMemoryUsage() {
        if (performance.memory) {
            return performance.memory.usedJSHeapSize;
        }
        return 0;
    }

    /**
     * Track data loading performance
     */
    trackDataLoad(dataType, loadPromise) {
        const startTime = performance.now();
        
        return loadPromise.then((data) => {
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            this.loadTimes.push({
                dataType,
                duration,
                timestamp: Date.now(),
                itemCount: Array.isArray(data) ? data.length : 1
            });
            
            // Keep only recent samples
            if (this.loadTimes.length > this.maxLoadTimeSamples) {
                this.loadTimes.shift();
            }
            
            this.recordOperation(`data_load_${dataType}`, duration, 0);
            
            return data;
        });
    }

    /**
     * Get performance report
     */
    getPerformanceReport() {
        const report = {
            uptime: Date.now() - this.startTime,
            operations: Object.fromEntries(this.operations),
            memory: {
                current: this.getMemoryUsage(),
                samples: this.memoryUsage.length,
                trend: this.getMemoryTrend()
            },
            loadTimes: this.getLoadTimeStats(),
            recommendations: this.getRecommendations()
        };
        
        return report;
    }

    /**
     * Get memory trend
     */
    getMemoryTrend() {
        if (this.memoryUsage.length < 2) return 'stable';
        
        const recent = this.memoryUsage.slice(-5);
        const older = this.memoryUsage.slice(-10, -5);
        
        const recentAvg = recent.reduce((sum, sample) => sum + sample.memory, 0) / recent.length;
        const olderAvg = older.reduce((sum, sample) => sum + sample.memory, 0) / older.length;
        
        if (recentAvg > olderAvg * 1.2) return 'increasing';
        if (recentAvg < olderAvg * 0.8) return 'decreasing';
        return 'stable';
    }

    /**
     * Get load time statistics
     */
    getLoadTimeStats() {
        const stats = {};
        
        this.loadTimes.forEach((load) => {
            if (!stats[load.dataType]) {
                stats[load.dataType] = {
                    count: 0,
                    totalDuration: 0,
                    avgDuration: 0,
                    totalItems: 0,
                    avgItemsPerLoad: 0
                };
            }
            
            const stat = stats[load.dataType];
            stat.count++;
            stat.totalDuration += load.duration;
            stat.avgDuration = stat.totalDuration / stat.count;
            stat.totalItems += load.itemCount;
            stat.avgItemsPerLoad = stat.totalItems / stat.count;
        });
        
        return stats;
    }

    /**
     * Enhanced performance recommendations with more specific guidance
     */
    getRecommendations() {
        const recommendations = [];
        
        // Check for slow operations with racing-specific thresholds
        for (const [operation, stats] of this.operations) {
            // More nuanced thresholds
            let threshold = 500; // Default 500ms
            
            // Specific thresholds for racing operations
            if (operation.includes('bracket') || operation.includes('pairing')) {
                threshold = 800; // Bracket operations - reduced from 1000ms
            } else if (operation.includes('participant') || operation.includes('data_load')) {
                threshold = 250; // Data loading should be faster - reduced from 300ms
            } else if (operation.includes('page_change') || operation.includes('filter')) {
                threshold = 100; // UI operations should be very fast
            } else if (operation.includes('skeleton') || operation.includes('render')) {
                threshold = 200; // Rendering operations should be quick
            } else if (operation.includes('network')) {
                threshold = 1500; // Network operations can be slower but track them
            }
            
            if (stats.avgDuration > threshold) {
                recommendations.push({
                    type: 'slow_operation',
                    operation,
                    avgDuration: stats.avgDuration,
                    threshold,
                    suggestion: this.getOperationSpecificSuggestion(operation, stats.avgDuration, threshold)
                });
            }
        }
        
        // Check for memory issues
        if (this.getMemoryTrend() === 'increasing') {
            recommendations.push({
                type: 'memory_leak',
                suggestion: 'Memory usage is increasing. Check for memory leaks in participant/event data caching.'
            });
        }
        
        // Check for large data loads with racing-specific recommendations
        const loadStats = this.getLoadTimeStats();
        for (const [dataType, stats] of Object.entries(loadStats)) {
            if (dataType === 'participants' && stats.avgItemsPerLoad > 300) {
                recommendations.push({
                    type: 'large_data_load',
                    dataType,
                    avgItems: stats.avgItemsPerLoad,
                    suggestion: `Virtual scrolling recommended for ${dataType} - current: ${stats.avgItemsPerLoad} items`
                });
            } else if (dataType === 'events' && stats.avgItemsPerLoad > 50) {
                recommendations.push({
                    type: 'large_data_load',
                    dataType,
                    avgItems: stats.avgItemsPerLoad,
                    suggestion: `Consider pagination for ${dataType} - current: ${stats.avgItemsPerLoad} items`
                });
            } else if (dataType.includes('bracket') && stats.avgItemsPerLoad > 25) {
                recommendations.push({
                    type: 'large_data_load',
                    dataType,
                    avgItems: stats.avgItemsPerLoad,
                    suggestion: `Progressive bracket rendering recommended - current: ${stats.avgItemsPerLoad} brackets`
                });
            }
        }
        
        // Check for excessive DOM operations with improved detection
        const domOperations = Array.from(this.operations.entries())
            .filter(([op]) => op.includes('dom') || op.includes('render') || op.includes('skeleton'))
            .reduce((sum, [_, stats]) => sum + stats.count, 0);
            
        if (domOperations > 50) {
            recommendations.push({
                type: 'excessive_dom',
                count: domOperations,
                suggestion: `${domOperations} DOM operations detected. Consider batching updates and using document fragments.`
            });
        }
        
        return recommendations;
    }

    /**
     * Enhanced operation-specific performance suggestions
     */
    getOperationSpecificSuggestion(operation, avgDuration, threshold) {
        const overThresholdPercent = ((avgDuration - threshold) / threshold * 100).toFixed(0);
        
        if (operation.includes('participant_data_load')) {
            return `Participant loading took ${avgDuration.toFixed(0)}ms (${overThresholdPercent}% over threshold). Consider caching and virtual scrolling.`;
        } else if (operation.includes('bracket_render')) {
            return `Bracket rendering took ${avgDuration.toFixed(0)}ms (${overThresholdPercent}% over threshold). Consider lazy loading and progressive rendering.`;
        } else if (operation.includes('race_events_load')) {
            return `Event loading took ${avgDuration.toFixed(0)}ms (${overThresholdPercent}% over threshold). Consider using DocumentFragment for DOM updates.`;
        } else if (operation.includes('skeleton_render')) {
            return `Skeleton rendering took ${avgDuration.toFixed(0)}ms (${overThresholdPercent}% over threshold). Consider reducing skeleton complexity.`;
        } else if (operation.includes('page_change')) {
            return `Page changes took ${avgDuration.toFixed(0)}ms (${overThresholdPercent}% over threshold). This should be under 100ms for good UX.`;
        } else if (operation.includes('filter')) {
            return `Filtering took ${avgDuration.toFixed(0)}ms (${overThresholdPercent}% over threshold). Consider debouncing and indexed search.`;
        } else if (operation.includes('network')) {
            return `Network request took ${avgDuration.toFixed(0)}ms (${overThresholdPercent}% over threshold). Consider request optimization, caching, or server performance.`;
        } else {
            return `${operation} took ${avgDuration.toFixed(0)}ms (${overThresholdPercent}% over threshold). Consider optimization.`;
        }
    }

    /**
     * Racing app specific performance check
     */
    checkRacingAppPerformance() {
        const issues = [];
        
        // Check critical racing operations
        const criticalOps = [
            'participant_data_load',
            'bracket_render', 
            'page_change',
            'app_initialization'
        ];
        
        criticalOps.forEach(op => {
            const stats = this.operations.get(op);
            if (stats) {
                let maxAcceptable = 500;
                if (op === 'page_change') maxAcceptable = 100;
                if (op === 'app_initialization') maxAcceptable = 2000;
                
                if (stats.avgDuration > maxAcceptable) {
                    issues.push({
                        operation: op,
                        avgDuration: stats.avgDuration,
                        maxAcceptable,
                        severity: stats.avgDuration > maxAcceptable * 2 ? 'critical' : 'warning'
                    });
                }
            }
        });
        
        return {
            issues,
            overallHealth: issues.length === 0 ? 'good' : 
                          issues.some(i => i.severity === 'critical') ? 'poor' : 'needs_improvement'
        };
    }

    /**
     * Log performance summary
     */
    logPerformanceSummary() {
        const report = this.getPerformanceReport();
        
        console.log('📊 Performance Summary:');
        console.log(`⏱️  Uptime: ${(report.uptime / 1000 / 60).toFixed(1)} minutes`);
        console.log(`💾 Memory: ${(report.memory.current / 1024 / 1024).toFixed(2)} MB (${report.memory.trend})`);
        console.log(`🔄 Operations tracked: ${Object.keys(report.operations).length}`);
        
        if (report.recommendations.length > 0) {
            console.log('💡 Recommendations:');
            report.recommendations.forEach(rec => {
                console.log(`   - ${rec.suggestion}`);
            });
        }
        
        return report;
    }

    /**
     * Clear performance data
     */
    clearData() {
        this.metrics.clear();
        this.operations.clear();
        this.memoryUsage = [];
        this.loadTimes = [];
        console.log('🧹 Performance data cleared');
    }
}

// Create global instance
window.performanceMonitor = new PerformanceMonitor();

// Auto-start monitoring in development
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.performanceMonitor.startMonitoring();
} 