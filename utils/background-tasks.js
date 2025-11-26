/**
 * Background Task Coordinator for EPC17
 * Manages deferred task execution to keep UI responsive
 * Provides centralized queue management with priority levels
 */

class BackgroundTaskCoordinator {
    constructor() {
        this.taskQueue = [];
        this.isProcessing = false;
        this.activeTasks = new Set();
        this.completedTasks = new Map();
        this.errorHandlers = new Map();
        
        // Configuration
        this.config = {
            batchSize: 5,
            processingDelay: 10, // ms between task batches
            idleCallbackTimeout: 2000, // max wait for idle callback
            retryAttempts: 3,
            retryDelay: 500
        };
        
        // Feature detection
        this.supportsIdleCallback = typeof requestIdleCallback !== 'undefined';
        
        console.log('📋 BackgroundTaskCoordinator initialized', {
            idleCallbackSupport: this.supportsIdleCallback
        });
    }

    /**
     * Schedule a task for deferred execution
     * @param {Function} taskFn - Async function to execute
     * @param {Object} options - Task options
     * @returns {Promise} - Resolves when task completes
     */
    scheduleTask(taskFn, options = {}) {
        const task = {
            id: this.generateTaskId(),
            fn: taskFn,
            priority: options.priority || 'normal', // high, normal, low
            retries: 0,
            maxRetries: options.maxRetries || this.config.retryAttempts,
            category: options.category || 'general',
            createdAt: Date.now(),
            metadata: options.metadata || {}
        };

        // Create promise for task completion
        const promise = new Promise((resolve, reject) => {
            task.resolve = resolve;
            task.reject = reject;
        });

        // Add to queue based on priority
        if (task.priority === 'high') {
            this.taskQueue.unshift(task);
        } else {
            this.taskQueue.push(task);
        }

        console.log(`📋 Task scheduled: ${task.id} (${task.category}, priority: ${task.priority})`);

        // Start processing if not already running
        if (!this.isProcessing) {
            this.startProcessing();
        }

        return promise;
    }

    /**
     * Start processing the task queue
     */
    startProcessing() {
        if (this.isProcessing) return;
        
        this.isProcessing = true;
        console.log('📋 Starting background task processing...');
        
        this.processNextBatch();
    }

    /**
     * Process next batch of tasks
     */
    processNextBatch() {
        if (this.taskQueue.length === 0) {
            this.isProcessing = false;
            console.log('📋 Background task queue empty, processing complete');
            return;
        }

        // Use requestIdleCallback if available, otherwise setTimeout
        if (this.supportsIdleCallback) {
            requestIdleCallback((deadline) => {
                this.executeBatch(deadline);
            }, { timeout: this.config.idleCallbackTimeout });
        } else {
            setTimeout(() => {
                this.executeBatch();
            }, this.config.processingDelay);
        }
    }

    /**
     * Execute a batch of tasks
     * @param {IdleDeadline} deadline - Optional idle deadline
     */
    async executeBatch(deadline = null) {
        const batchSize = Math.min(this.config.batchSize, this.taskQueue.length);
        const batch = [];

        // Extract batch from queue
        for (let i = 0; i < batchSize; i++) {
            if (this.taskQueue.length === 0) break;
            
            // Check if we have time remaining (when using idle callback)
            if (deadline && deadline.timeRemaining() < 1) {
                break;
            }
            
            batch.push(this.taskQueue.shift());
        }

        console.log(`📋 Executing batch: ${batch.length} tasks`);

        // Execute tasks in parallel
        const taskPromises = batch.map(task => this.executeTask(task));
        
        try {
            await Promise.allSettled(taskPromises);
        } catch (error) {
            console.error('📋 Batch execution error:', error);
        }

        // Schedule next batch
        this.processNextBatch();
    }

    /**
     * Execute a single task with retry logic
     * @param {Object} task - Task to execute
     */
    async executeTask(task) {
        this.activeTasks.add(task.id);
        
        try {
            console.log(`📋 Executing task: ${task.id} (attempt ${task.retries + 1})`);
            
            const startTime = performance.now();
            const result = await task.fn();
            const duration = performance.now() - startTime;
            
            console.log(`✅ Task completed: ${task.id} (${duration.toFixed(2)}ms)`);
            
            // Store completion info
            this.completedTasks.set(task.id, {
                result,
                duration,
                completedAt: Date.now()
            });
            
            // Resolve promise
            task.resolve(result);
            
        } catch (error) {
            console.error(`❌ Task failed: ${task.id}`, error);
            
            // Retry logic
            if (task.retries < task.maxRetries) {
                task.retries++;
                console.log(`🔄 Retrying task: ${task.id} (attempt ${task.retries + 1}/${task.maxRetries})`);
                
                // Re-queue with exponential backoff
                const retryDelay = this.config.retryDelay * Math.pow(2, task.retries - 1);
                setTimeout(() => {
                    this.taskQueue.unshift(task); // High priority for retries
                }, retryDelay);
                
            } else {
                console.error(`❌ Task failed permanently: ${task.id}`);
                task.reject(error);
                
                // Call error handler if registered
                const errorHandler = this.errorHandlers.get(task.category);
                if (errorHandler) {
                    try {
                        errorHandler(error, task);
                    } catch (handlerError) {
                        console.error('Error in error handler:', handlerError);
                    }
                }
            }
        } finally {
            this.activeTasks.delete(task.id);
        }
    }

    /**
     * Register an error handler for a task category
     * @param {String} category - Task category
     * @param {Function} handler - Error handler function
     */
    onError(category, handler) {
        this.errorHandlers.set(category, handler);
    }

    /**
     * Get queue status
     * @returns {Object} Queue statistics
     */
    getStatus() {
        return {
            queued: this.taskQueue.length,
            active: this.activeTasks.size,
            completed: this.completedTasks.size,
            isProcessing: this.isProcessing
        };
    }

    /**
     * Clear completed task history
     */
    clearHistory() {
        this.completedTasks.clear();
        console.log('📋 Task history cleared');
    }

    /**
     * Generate unique task ID
     * @returns {String} Unique task ID
     */
    generateTaskId() {
        return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Wait for all active tasks to complete
     * @returns {Promise} Resolves when all tasks complete
     */
    async waitForCompletion() {
        return new Promise((resolve) => {
            const checkCompletion = () => {
                if (this.taskQueue.length === 0 && this.activeTasks.size === 0) {
                    resolve();
                } else {
                    setTimeout(checkCompletion, 100);
                }
            };
            checkCompletion();
        });
    }

    /**
     * Cancel all pending tasks
     */
    cancelAll() {
        const canceledCount = this.taskQueue.length;
        
        this.taskQueue.forEach(task => {
            task.reject(new Error('Task canceled'));
        });
        
        this.taskQueue = [];
        console.log(`📋 Canceled ${canceledCount} pending tasks`);
        
        return canceledCount;
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.backgroundTasks = new BackgroundTaskCoordinator();
    console.log('✅ Global backgroundTasks coordinator available');
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BackgroundTaskCoordinator;
}


