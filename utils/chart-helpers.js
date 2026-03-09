/**
 * EPC17 Chart Helpers
 * Reusable Chart.js configuration and helper functions
 * Provides consistent theming and responsive behavior across all analytics pages
 * 
 * JSDoc Module Header:
 * Purpose: Unified chart creation and styling for analytics visualizations
 * Exports: Chart helper functions (createPieChart, createBarChart, createLineChart, etc.)
 * Inputs: Canvas IDs, data arrays, optional configuration overrides
 * Outputs: Chart.js instances with consistent styling
 * Error Modes: Returns null on errors, logs to console
 */

// ============================================================================
// COLOR THEMES
// ============================================================================

const ChartColors = {
    // Primary colors from CSS variables
    orangeWarm: 'rgba(255, 140, 66, 0.8)',
    orangeGlow: 'rgba(255, 183, 107, 0.8)',
    bluePrimary: 'rgba(74, 144, 226, 0.8)',
    blueSecondary: 'rgba(155, 89, 182, 0.8)',
    
    // Success/Win colors
    goldWin: 'rgba(255, 215, 0, 0.8)',
    silverSecond: 'rgba(192, 192, 192, 0.8)',
    bronzeThird: 'rgba(205, 127, 50, 0.8)',
    greenSuccess: 'rgba(76, 175, 80, 0.8)',
    
    // Neutral/Participation colors
    grayNeutral: 'rgba(179, 179, 179, 0.8)',
    grayLight: 'rgba(230, 230, 230, 0.8)',
    grayDark: 'rgba(100, 100, 100, 0.8)',
    
    // Text colors
    textPrimary: '#ffffff',
    textSecondary: '#b3b3b3',
    
    // Background colors
    bgPrimary: '#1a1a1a',
    bgSecondary: '#2d2d2d',
    
    // Border colors
    borderLight: 'rgba(255, 255, 255, 0.1)',
    borderMedium: 'rgba(255, 255, 255, 0.2)',
    
    // Gradient colors (for multiple data series)
    gradients: [
        'rgba(255, 140, 66, 0.8)',   // Orange
        'rgba(74, 144, 226, 0.8)',    // Blue
        'rgba(76, 175, 80, 0.8)',     // Green
        'rgba(155, 89, 182, 0.8)',    // Purple
        'rgba(255, 193, 7, 0.8)',     // Amber
        'rgba(233, 30, 99, 0.8)',     // Pink
        'rgba(0, 188, 212, 0.8)',     // Cyan
        'rgba(255, 87, 34, 0.8)',     // Deep Orange
    ],
    
    // Border variants (more opaque)
    borderGradients: [
        'rgba(255, 140, 66, 1)',
        'rgba(74, 144, 226, 1)',
        'rgba(76, 175, 80, 1)',
        'rgba(155, 89, 182, 1)',
        'rgba(255, 193, 7, 1)',
        'rgba(233, 30, 99, 1)',
        'rgba(0, 188, 212, 1)',
        'rgba(255, 87, 34, 1)',
    ]
};

// ============================================================================
// DEFAULT CHART OPTIONS
// ============================================================================

const defaultChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
        duration: 800,
        easing: 'easeInOutQuart'
    },
    plugins: {
        legend: {
            labels: {
                color: ChartColors.textPrimary,
                font: {
                    family: 'Inter, sans-serif',
                    size: 12,
                    weight: '500'
                },
                padding: 15,
                usePointStyle: true
            }
        },
        tooltip: {
            backgroundColor: ChartColors.bgSecondary,
            titleColor: ChartColors.textPrimary,
            bodyColor: ChartColors.textSecondary,
            borderColor: ChartColors.borderMedium,
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8,
            titleFont: {
                family: 'Inter, sans-serif',
                size: 14,
                weight: '600'
            },
            bodyFont: {
                family: 'Inter, sans-serif',
                size: 13,
                weight: '400'
            }
        }
    }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Destroy existing chart if it exists
 * @param {string} canvasId - Canvas element ID
 */
function destroyExistingChart(canvasId) {
    const existingChart = Chart.getChart(canvasId);
    if (existingChart) {
        existingChart.destroy();
    }
}

/**
 * Get canvas context
 * @param {string} canvasId - Canvas element ID
 * @returns {CanvasRenderingContext2D|null} Canvas context or null
 */
function getCanvasContext(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas element with ID "${canvasId}" not found`);
        return null;
    }
    return canvas.getContext('2d');
}

/**
 * Merge default options with custom options
 * @param {Object} customOptions - Custom chart options
 * @returns {Object} Merged options
 */
function mergeOptions(customOptions = {}) {
    return {
        ...defaultChartOptions,
        ...customOptions,
        plugins: {
            ...defaultChartOptions.plugins,
            ...(customOptions.plugins || {})
        },
        animation: {
            ...defaultChartOptions.animation,
            ...(customOptions.animation || {})
        }
    };
}

// ============================================================================
// PIE CHART
// ============================================================================

/**
 * Create a pie or donut chart
 * @param {string} canvasId - Canvas element ID
 * @param {Array} labels - Data labels
 * @param {Array} data - Data values
 * @param {Object} options - Custom options
 * @returns {Chart|null} Chart instance or null
 */
function createPieChart(canvasId, labels, data, options = {}) {
    try {
        destroyExistingChart(canvasId);
        const ctx = getCanvasContext(canvasId);
        if (!ctx) return null;

        const isDonut = options.cutout !== undefined;
        const chartData = {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: options.colors || ChartColors.gradients.slice(0, data.length),
                borderColor: options.borderColors || ChartColors.borderGradients.slice(0, data.length),
                borderWidth: 2,
                hoverOffset: 10
            }]
        };

        const chartOptions = mergeOptions({
            ...options,
            plugins: {
                ...defaultChartOptions.plugins,
                ...options.plugins,
                tooltip: {
                    ...defaultChartOptions.plugins.tooltip,
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        });

        return new Chart(ctx, {
            type: isDonut ? 'doughnut' : 'pie',
            data: chartData,
            options: chartOptions
        });
    } catch (error) {
        console.error(`Error creating pie chart for ${canvasId}:`, error);
        return null;
    }
}

// ============================================================================
// BAR CHART
// ============================================================================

/**
 * Create a bar chart
 * @param {string} canvasId - Canvas element ID
 * @param {Array} labels - X-axis labels
 * @param {Array|Object} datasets - Single data array or datasets object
 * @param {Object} options - Custom options
 * @returns {Chart|null} Chart instance or null
 */
function createBarChart(canvasId, labels, datasets, options = {}) {
    try {
        destroyExistingChart(canvasId);
        const ctx = getCanvasContext(canvasId);
        if (!ctx) return null;

        // Handle single dataset or multiple datasets
        let chartDatasets;
        if (Array.isArray(datasets) && !Array.isArray(datasets[0])) {
            // Single dataset
            chartDatasets = [{
                label: options.label || 'Data',
                data: datasets,
                backgroundColor: options.color || ChartColors.orangeWarm,
                borderColor: options.borderColor || ChartColors.borderGradients[0],
                borderWidth: 2,
                borderRadius: 6,
                borderSkipped: false
            }];
        } else {
            // Multiple datasets
            chartDatasets = datasets.map((dataset, index) => ({
                label: dataset.label || `Dataset ${index + 1}`,
                data: dataset.data,
                backgroundColor: dataset.backgroundColor || ChartColors.gradients[index % ChartColors.gradients.length],
                borderColor: dataset.borderColor || ChartColors.borderGradients[index % ChartColors.borderGradients.length],
                borderWidth: 2,
                borderRadius: 6,
                borderSkipped: false
            }));
        }

        const chartOptions = mergeOptions({
            ...options,
            scales: {
                x: {
                    ticks: {
                        color: ChartColors.textSecondary,
                        font: {
                            family: 'Inter, sans-serif',
                            size: 11
                        }
                    },
                    grid: {
                        color: ChartColors.borderLight,
                        drawBorder: false
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: ChartColors.textSecondary,
                        font: {
                            family: 'Inter, sans-serif',
                            size: 11
                        }
                    },
                    grid: {
                        color: ChartColors.borderLight,
                        drawBorder: false
                    }
                },
                ...(options.scales || {})
            }
        });

        return new Chart(ctx, {
            type: options.horizontal ? 'bar' : 'bar',
            data: {
                labels: labels,
                datasets: chartDatasets
            },
            options: {
                ...chartOptions,
                indexAxis: options.horizontal ? 'y' : 'x'
            }
        });
    } catch (error) {
        console.error(`Error creating bar chart for ${canvasId}:`, error);
        return null;
    }
}

// ============================================================================
// LINE CHART
// ============================================================================

/**
 * Create a line chart
 * @param {string} canvasId - Canvas element ID
 * @param {Array} labels - X-axis labels
 * @param {Array|Object} datasets - Single data array or datasets object
 * @param {Object} options - Custom options
 * @returns {Chart|null} Chart instance or null
 */
function createLineChart(canvasId, labels, datasets, options = {}) {
    try {
        destroyExistingChart(canvasId);
        const ctx = getCanvasContext(canvasId);
        if (!ctx) return null;

        // Handle single dataset or multiple datasets
        let chartDatasets;
        if (Array.isArray(datasets) && !Array.isArray(datasets[0])) {
            // Single dataset
            chartDatasets = [{
                label: options.label || 'Data',
                data: datasets,
                backgroundColor: options.fill ? ChartColors.orangeWarm : 'transparent',
                borderColor: options.borderColor || ChartColors.borderGradients[0],
                borderWidth: 3,
                tension: 0.4,
                fill: options.fill || false,
                pointBackgroundColor: ChartColors.borderGradients[0],
                pointBorderColor: ChartColors.textPrimary,
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }];
        } else {
            // Multiple datasets
            chartDatasets = datasets.map((dataset, index) => ({
                label: dataset.label || `Dataset ${index + 1}`,
                data: dataset.data,
                backgroundColor: dataset.fill ? ChartColors.gradients[index % ChartColors.gradients.length] : 'transparent',
                borderColor: dataset.borderColor || ChartColors.borderGradients[index % ChartColors.borderGradients.length],
                borderWidth: 3,
                tension: 0.4,
                fill: dataset.fill || false,
                pointBackgroundColor: ChartColors.borderGradients[index % ChartColors.borderGradients.length],
                pointBorderColor: ChartColors.textPrimary,
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }));
        }

        const chartOptions = mergeOptions({
            ...options,
            scales: {
                x: {
                    ticks: {
                        color: ChartColors.textSecondary,
                        font: {
                            family: 'Inter, sans-serif',
                            size: 11
                        }
                    },
                    grid: {
                        color: ChartColors.borderLight,
                        drawBorder: false
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: ChartColors.textSecondary,
                        font: {
                            family: 'Inter, sans-serif',
                            size: 11
                        }
                    },
                    grid: {
                        color: ChartColors.borderLight,
                        drawBorder: false
                    }
                },
                ...(options.scales || {})
            }
        });

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: chartDatasets
            },
            options: chartOptions
        });
    } catch (error) {
        console.error(`Error creating line chart for ${canvasId}:`, error);
        return null;
    }
}

// ============================================================================
// RADAR CHART
// ============================================================================

/**
 * Create a radar chart (useful for performance metrics)
 * @param {string} canvasId - Canvas element ID
 * @param {Array} labels - Radar labels
 * @param {Array|Object} datasets - Single data array or datasets object
 * @param {Object} options - Custom options
 * @returns {Chart|null} Chart instance or null
 */
function createRadarChart(canvasId, labels, datasets, options = {}) {
    try {
        destroyExistingChart(canvasId);
        const ctx = getCanvasContext(canvasId);
        if (!ctx) return null;

        // Handle single dataset or multiple datasets
        let chartDatasets;
        if (Array.isArray(datasets) && !Array.isArray(datasets[0])) {
            chartDatasets = [{
                label: options.label || 'Performance',
                data: datasets,
                backgroundColor: ChartColors.orangeWarm,
                borderColor: ChartColors.borderGradients[0],
                borderWidth: 2,
                pointBackgroundColor: ChartColors.borderGradients[0],
                pointBorderColor: ChartColors.textPrimary,
                pointRadius: 4
            }];
        } else {
            chartDatasets = datasets.map((dataset, index) => ({
                label: dataset.label || `Dataset ${index + 1}`,
                data: dataset.data,
                backgroundColor: ChartColors.gradients[index % ChartColors.gradients.length],
                borderColor: ChartColors.borderGradients[index % ChartColors.borderGradients.length],
                borderWidth: 2,
                pointBackgroundColor: ChartColors.borderGradients[index % ChartColors.borderGradients.length],
                pointBorderColor: ChartColors.textPrimary,
                pointRadius: 4
            }));
        }

        const chartOptions = mergeOptions({
            ...options,
            scales: {
                r: {
                    beginAtZero: true,
                    ticks: {
                        color: ChartColors.textSecondary,
                        backdropColor: 'transparent'
                    },
                    grid: {
                        color: ChartColors.borderLight
                    },
                    pointLabels: {
                        color: ChartColors.textPrimary,
                        font: {
                            family: 'Inter, sans-serif',
                            size: 12,
                            weight: '500'
                        }
                    }
                }
            }
        });

        return new Chart(ctx, {
            type: 'radar',
            data: {
                labels: labels,
                datasets: chartDatasets
            },
            options: chartOptions
        });
    } catch (error) {
        console.error(`Error creating radar chart for ${canvasId}:`, error);
        return null;
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format number with commas
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
function formatNumber(num) {
    return num.toLocaleString();
}

/**
 * Format percentage
 * @param {number} value - Value to format
 * @param {number} total - Total value
 * @param {number} decimals - Decimal places (default: 1)
 * @returns {string} Formatted percentage
 */
function formatPercentage(value, total, decimals = 1) {
    if (total === 0) return '0%';
    return ((value / total) * 100).toFixed(decimals) + '%';
}

/**
 * Get color by position (1st, 2nd, 3rd, etc.)
 * @param {number} position - Position number
 * @returns {string} Color code
 */
function getPositionColor(position) {
    switch (position) {
        case 1:
            return ChartColors.goldWin;
        case 2:
            return ChartColors.silverSecond;
        case 3:
            return ChartColors.bronzeThird;
        default:
            return ChartColors.grayNeutral;
    }
}

/**
 * Generate gradient colors for large datasets
 * @param {number} count - Number of colors needed
 * @returns {Array} Array of color codes
 */
function generateColors(count) {
    const colors = [];
    for (let i = 0; i < count; i++) {
        colors.push(ChartColors.gradients[i % ChartColors.gradients.length]);
    }
    return colors;
}

/**
 * Generate border colors for large datasets
 * @param {number} count - Number of colors needed
 * @returns {Array} Array of border color codes
 */
function generateBorderColors(count) {
    const colors = [];
    for (let i = 0; i < count; i++) {
        colors.push(ChartColors.borderGradients[i % ChartColors.borderGradients.length]);
    }
    return colors;
}

// ============================================================================
// LAZY CHART OBSERVER
// ============================================================================

/**
 * Lazy-loads chart creation using IntersectionObserver.
 * Defers expensive Chart.js instantiation until the canvas scrolls into view.
 *
 * @param {string} canvasId    – ID of the <canvas> element
 * @param {Function} createFn  – Zero-arg function that creates the Chart.js instance
 * @param {Object} [opts]
 * @param {string} [opts.rootMargin='200px'] – Pre-load margin (trigger slightly before visible)
 * @param {number} [opts.threshold=0]        – Visibility fraction to trigger
 * @returns {{ cancel: Function }} Handle to cancel the pending observation
 */
function lazyChart(canvasId, createFn, opts = {}) {
    const canvas = typeof canvasId === 'string'
        ? document.getElementById(canvasId)
        : canvasId;

    if (!canvas) {
        console.warn(`[LazyChart] Canvas "${canvasId}" not found`);
        return { cancel() {} };
    }

    // If IntersectionObserver is unavailable (old browsers), fall back to immediate
    if (typeof IntersectionObserver === 'undefined') {
        createFn();
        return { cancel() {} };
    }

    let fired = false;
    const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting && !fired) {
                fired = true;
                observer.disconnect();
                // Use requestAnimationFrame so the paint isn't jank
                requestAnimationFrame(() => {
                    try {
                        createFn();
                    } catch (err) {
                        console.error(`[LazyChart] Error creating chart "${canvasId}":`, err);
                    }
                });
            }
        }
    }, {
        rootMargin: opts.rootMargin || '200px',
        threshold: opts.threshold || 0,
    });

    observer.observe(canvas);

    return {
        cancel() {
            if (!fired) observer.disconnect();
        },
    };
}

// ============================================================================
// EXPORT
// ============================================================================

// Export as global object for use in HTML pages
window.ChartHelpers = {
    // Chart creation functions
    createPieChart,
    createBarChart,
    createLineChart,
    createRadarChart,
    
    // Lazy loading
    lazyChart,
    
    // Utility functions
    formatNumber,
    formatPercentage,
    getPositionColor,
    generateColors,
    generateBorderColors,
    destroyExistingChart,
    
    // Color constants
    Colors: ChartColors
};

// Also export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.ChartHelpers;
}

