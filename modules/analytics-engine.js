/**
 * EPC17 Analytics Engine
 * Centralized analytics and statistics calculation engine
 * Single source of truth for all analytics data across the application
 * 
 * JSDoc Module Header:
 * Purpose: Unified analytics computation and caching layer
 * Exports: AnalyticsEngine class
 * Inputs: DataManager instance (for backward compatibility), API endpoints
 * Outputs: Comprehensive statistics objects with caching
 * Error Modes: Graceful fallbacks, console logging, returns empty/zero values on failure
 */

class AnalyticsEngine {
    constructor(dataManager = null) {
        this.dataManager = dataManager; // Optional for backward compatibility
        this.cache = new Map(); // Cache storage: key -> {data, timestamp, ttl}
        this.defaultTTL = 120000; // 2 minutes default cache TTL
        this.apiBaseUrl = '/api/stats';
        
        window.debugLogger?.init('Analytics', 'AnalyticsEngine initialized');
    }

    /**
     * Clear cache for specific key or all cache
     * @param {string|null} key - Cache key to clear, null clears all
     */
    clearCache(key = null) {
        if (key) {
            this.cache.delete(key);
            window.debugLogger?.debug('Analytics', `Cache cleared for key: ${key}`);
        } else {
            this.cache.clear();
            window.debugLogger?.debug('Analytics', 'All cache cleared');
        }
    }

    /**
     * Get cached data or fetch new data
     * @param {string} key - Cache key
     * @param {Function} fetchFn - Async function to fetch data if cache miss
     * @param {number} ttl - Time-to-live in milliseconds
     * @returns {Promise<any>} Cached or fresh data
     */
    async getCached(key, fetchFn, ttl = this.defaultTTL) {
        const cached = this.cache.get(key);
        const now = Date.now();

        if (cached && (now - cached.timestamp) < cached.ttl) {
            window.debugLogger?.debug('Analytics', `Cache hit: ${key}`);
            return cached.data;
        }

        window.debugLogger?.debug('Analytics', `Cache miss: ${key}, fetching...`);
        try {
            const data = await fetchFn();
            this.cache.set(key, {
                data,
                timestamp: now,
                ttl
            });
            return data;
        } catch (error) {
            console.error(`❌ Error fetching data for ${key}:`, error);
            // Return cached data even if expired, better than nothing
            if (cached) {
                console.warn(`⚠️ Returning expired cache for ${key}`);
                return cached.data;
            }
            throw error;
        }
    }

    /**
     * Fetch from API with error handling
     * @param {string} endpoint - API endpoint path
     * @returns {Promise<any>} API response data
     */
    async fetchFromAPI(endpoint) {
        try {
            const response = await fetch(endpoint);
            if (!response.ok) {
                // Try to parse error JSON if available
                try {
                    const errorData = await response.json();
                    throw new Error(errorData.message || errorData.error || `API error: ${response.status} ${response.statusText}`);
                } catch (e) {
                     throw new Error(`API error: ${response.status} ${response.statusText}`);
                }
            }
            return await response.json();
        } catch (error) {
            console.error(`❌ API fetch failed for ${endpoint}:`, error);
            
            // Provide helpful error message for blocked requests
            if (error.message && error.message.includes('Failed to fetch')) {
                console.warn(`
⚠️ REQUEST BLOCKED - This is usually caused by:
1. Browser extension (ad blocker, privacy tool) blocking the request
2. CORS policy (should be resolved now)
3. Network connectivity issue

SOLUTION:
- Disable browser extensions temporarily
- Check browser console for "ERR_BLOCKED_BY_CLIENT"
- Try in an incognito/private window
- Check if server is running on ${window.location.origin}
                `);
            }
            
            throw error;
        }
    }

    /**
     * Get overall system statistics
     * @returns {Promise<Object>} Overall statistics
     */
    async getOverallStats() {
        return this.getCached('overall_stats', async () => {
            return await this.fetchFromAPI(`${this.apiBaseUrl}/overall`);
        }, 30000); // 30 second cache for overall stats
    }

    /**
     * Get event-specific statistics
     * @param {string} eventId - Event ID
     * @returns {Promise<Object>} Event statistics
     */
    async getEventStats(eventId) {
        if (!eventId) {
            throw new Error('Event ID is required');
        }

        return this.getCached(`event_${eventId}`, async () => {
            return await this.fetchFromAPI(`${this.apiBaseUrl}/event/${eventId}`);
        });
    }

    /**
     * Get driver-specific statistics
     * @param {string} driverId - Driver/Participant ID
     * @param {string|null} eventId - Optional event ID to filter stats
     * @returns {Promise<Object>} Driver statistics
     */
    async getDriverStats(driverId, eventId = null) {
        if (!driverId) {
            throw new Error('Driver ID is required');
        }

        const cacheKey = eventId ? `driver_${driverId}_event_${eventId}` : `driver_${driverId}`;
        const endpoint = eventId 
            ? `${this.apiBaseUrl}/driver/${driverId}?eventId=${eventId}`
            : `${this.apiBaseUrl}/driver/${driverId}`;

        return this.getCached(cacheKey, async () => {
            return await this.fetchFromAPI(endpoint);
        });
    }

    /**
     * Get class breakdown for an event
     * @param {string} eventId - Event ID
     * @param {string|null} className - Optional specific class name
     * @returns {Promise<Object>} Class breakdown statistics
     */
    async getClassBreakdown(eventId, className = null) {
        if (!eventId) {
            throw new Error('Event ID is required');
        }

        const cacheKey = className 
            ? `class_${eventId}_${className}` 
            : `class_breakdown_${eventId}`;
        
        const endpoint = className
            ? `${this.apiBaseUrl}/class/${eventId}/${encodeURIComponent(className)}`
            : `${this.apiBaseUrl}/class/${eventId}`;

        return this.getCached(cacheKey, async () => {
            return await this.fetchFromAPI(endpoint);
        });
    }

    /**
     * Get lane performance statistics
     * @param {string|null} eventId - Optional event ID to filter by
     * @returns {Promise<Object>} Lane performance statistics
     */
    async getLanePerformance(eventId = null) {
        const cacheKey = eventId ? `lane_performance_${eventId}` : 'lane_performance_all';
        const endpoint = eventId 
            ? `${this.apiBaseUrl}/lane/${eventId}`
            : `${this.apiBaseUrl}/lane`;

        return this.getCached(cacheKey, async () => {
            return await this.fetchFromAPI(endpoint);
        });
    }

    /**
     * Get time-based analytics (races over time, participation trends)
     * @param {string|null} eventId - Optional event ID to filter by
     * @returns {Promise<Object>} Time analytics data
     */
    async getTimeAnalytics(eventId = null) {
        const cacheKey = eventId ? `time_analytics_${eventId}` : 'time_analytics_all';
        const endpoint = eventId 
            ? `${this.apiBaseUrl}/time/${eventId}`
            : `${this.apiBaseUrl}/time`;

        return this.getCached(cacheKey, async () => {
            return await this.fetchFromAPI(endpoint);
        });
    }

    /**
     * Get series-level statistics
     * @param {string} seriesId - Series ID
     * @returns {Promise<Object>} Series statistics
     */
    async getSeriesStats(seriesId) {
        if (!seriesId) {
            throw new Error('Series ID is required');
        }

        return this.getCached(`series_${seriesId}`, async () => {
            return await this.fetchFromAPI(`${this.apiBaseUrl}/series/${seriesId}`);
        });
    }

    /**
     * Get top performers across all events or specific event
     * @param {number} limit - Number of top performers to return
     * @param {string|null} eventId - Optional event ID to filter by
     * @returns {Promise<Array>} Array of top performers with stats
     */
    async getTopPerformers(limit = 10, eventId = null) {
        const cacheKey = eventId 
            ? `top_performers_${eventId}_${limit}` 
            : `top_performers_all_${limit}`;
        
        const endpoint = eventId 
            ? `${this.apiBaseUrl}/top-performers?limit=${limit}&eventId=${eventId}`
            : `${this.apiBaseUrl}/top-performers?limit=${limit}`;

        return this.getCached(cacheKey, async () => {
            return await this.fetchFromAPI(endpoint);
        }, 60000); // 1 minute cache for leaderboards
    }

    /**
     * Get cache statistics for debugging
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys()),
            defaultTTL: this.defaultTTL
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnalyticsEngine;
}

