/**
 * UI Components for EPC17 Event Management System
 * Provides reusable UI components with performance optimizations
 */

class UIComponents {
    // Component cache for better performance
    static componentCache = new Map();
    static cacheSize = 100; // Maximum cached components
    
    /**
     * Create skeleton loading cards with caching
     * @param {number} count - Number of skeleton cards to create
     * @param {string} type - Type of skeleton (card, table, list)
     * @returns {string} HTML string of skeleton elements
     */
    static createSkeletonCards(count = 3, type = 'card') {
        const cacheKey = `skeleton_${type}_${count}`;
        
        // Check cache first
        if (this.componentCache.has(cacheKey)) {
            return this.componentCache.get(cacheKey);
        }
        
        const skeletons = [];
        
        for (let i = 0; i < count; i++) {
            if (type === 'card') {
                skeletons.push(`
                    <div class="skeleton-card">
                        <div class="skeleton skeleton-title"></div>
                        <div class="skeleton skeleton-text"></div>
                        <div class="skeleton skeleton-text short"></div>
                        <div class="skeleton skeleton-text medium"></div>
                        <div class="skeleton skeleton-button" style="margin-top: 1rem;"></div>
                    </div>
                `);
            } else if (type === 'table') {
                skeletons.push(`
                    <div class="skeleton-table-row">
                        <div class="skeleton skeleton-table-cell"></div>
                        <div class="skeleton skeleton-table-cell"></div>
                        <div class="skeleton skeleton-table-cell"></div>
                        <div class="skeleton skeleton-table-cell"></div>
                        <div class="skeleton skeleton-table-cell"></div>
                    </div>
                `);
            } else if (type === 'list') {
                skeletons.push(`
                    <div class="skeleton-card">
                        <div class="skeleton skeleton-text"></div>
                        <div class="skeleton skeleton-text short"></div>
                    </div>
                `);
            }
        }
        
        const result = skeletons.join('');
        
        // Cache the result
        this.cacheComponent(cacheKey, result);
        
        return result;
    }

    /**
     * Create pagination component with performance optimizations
     * @param {number} currentPage - Current page number
     * @param {number} totalPages - Total number of pages
     * @param {number} totalItems - Total number of items
     * @param {number} itemsPerPage - Items per page
     * @param {string} onPageChange - Callback function name for page changes
     * @returns {string} HTML string of pagination component
     */
    static createPagination(currentPage, totalPages, totalItems, itemsPerPage, onPageChange) {
        if (totalPages <= 1) return '';
        
        // Use faster template literals and minimize DOM string building
        const startItem = (currentPage - 1) * itemsPerPage + 1;
        const endItem = Math.min(currentPage * itemsPerPage, totalItems);
        
        const parts = [];
        
        // Previous button
        parts.push(`
            <button class="pagination-button" 
                    onclick="${onPageChange}(${currentPage - 1})" 
                    ${currentPage <= 1 ? 'disabled' : ''}>
                Previous
            </button>
        `);
        
        // Page number logic optimized for performance
        const maxVisiblePages = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        
        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }
        
        // First page if not in range
        if (startPage > 1) {
            parts.push(`<button class="pagination-button" onclick="${onPageChange}(1)">1</button>`);
            if (startPage > 2) {
                parts.push('<span class="pagination-info">...</span>');
            }
        }
        
        // Page number buttons (batch create for better performance)
        const pageButtons = [];
        for (let i = startPage; i <= endPage; i++) {
            pageButtons.push(`
                <button class="pagination-button ${i === currentPage ? 'active' : ''}" 
                        onclick="${onPageChange}(${i})">${i}</button>
            `);
        }
        parts.push(...pageButtons);
        
        // Last page if not in range
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                parts.push('<span class="pagination-info">...</span>');
            }
            parts.push(`<button class="pagination-button" onclick="${onPageChange}(${totalPages})">${totalPages}</button>`);
        }
        
        // Next button
        parts.push(`
            <button class="pagination-button" 
                    onclick="${onPageChange}(${currentPage + 1})" 
                    ${currentPage >= totalPages ? 'disabled' : ''}>
                Next
            </button>
        `);
        
        // Info section
        parts.push(`
            <div class="pagination-info">
                Showing ${startItem}-${endItem} of ${totalItems} results
            </div>
        `);
        
        return `<div class="pagination">${parts.join('')}</div>`;
    }

    /**
     * Cache component HTML with size management
     */
    static cacheComponent(key, html) {
        // Manage cache size to prevent memory leaks
        if (this.componentCache.size >= this.cacheSize) {
            // Remove oldest entries (FIFO)
            const firstKey = this.componentCache.keys().next().value;
            this.componentCache.delete(firstKey);
        }
        
        this.componentCache.set(key, html);
    }

    /**
     * Clear component cache to free memory
     */
    static clearCache() {
        this.componentCache.clear();
        console.log('🧹 UI component cache cleared');
    }

    /**
     * Clean up combo box before recreating
     * @param {string} id - Combo box ID
     */
    static cleanupComboBox(id) {
        const container = document.getElementById(`${id}-container`);
        if (container) {
            // Remove initialization marker
            container.removeAttribute('data-combo-initialized');
            container.removeAttribute('data-combo-id');
        }
        
        const input = document.getElementById(`${id}-input`);
        if (input) {
            input.removeAttribute('data-keydown-listener');
        }
    }

    /**
     * Memory cleanup utility for large datasets
     */
    static performMemoryCleanup() {
        console.log('🧹 Performing UI memory cleanup...');
        
        // Clear component cache
        this.clearCache();
        
        // Remove unused event listeners
        this.cleanupEventListeners();
        
        // Force garbage collection hint
        if (window.gc && typeof window.gc === 'function') {
            setTimeout(() => window.gc(), 1000);
        }
        
        console.log('✅ UI memory cleanup completed');
    }

    /**
     * Clean up orphaned event listeners
     */
    static cleanupEventListeners() {
        // Remove event listeners from removed DOM elements
        const orphanedElements = document.querySelectorAll('[data-cleanup-listeners]');
        
        orphanedElements.forEach(element => {
            // Clone and replace element to remove all event listeners
            const newElement = element.cloneNode(true);
            element.parentNode.replaceChild(newElement, element);
        });
        
        console.log(`🧹 Cleaned up ${orphanedElements.length} orphaned event listeners`);
    }

    /**
     * Create optimized table row with memory efficiency
     */
    static createTableRow(data, columns, actions = []) {
        const row = document.createElement('tr');
        
        // Use document fragment for better performance
        const fragment = document.createDocumentFragment();
        
        columns.forEach(column => {
            const cell = document.createElement('td');
            
            if (typeof column.render === 'function') {
                cell.innerHTML = column.render(data);
            } else {
                cell.textContent = data[column.key] || '';
            }
            
            fragment.appendChild(cell);
        });
        
        // Actions column if provided
        if (actions.length > 0) {
            const actionsCell = document.createElement('td');
            const actionButtons = actions.map(action => 
                `<button class="btn btn-sm ${action.class}" onclick="${action.onClick}('${data.id}')">${action.label}</button>`
            ).join(' ');
            actionsCell.innerHTML = actionButtons;
            fragment.appendChild(actionsCell);
        }
        
        row.appendChild(fragment);
        return row;
    }

    /**
     * Create combo box component
     * @param {string} id - Unique ID for the combo box
     * @param {Array} options - Array of options {value, label}
     * @param {string} placeholder - Placeholder text
     * @param {string} onSelect - Callback function name when option is selected
     * @param {string} selectedValue - Currently selected value
     * @returns {string} HTML string of combo box component
     */
    static createComboBox(id, options, placeholder = 'Select an option', onSelect, selectedValue = '') {
        const selectedOption = options.find(opt => opt.value === selectedValue);
        const selectedLabel = selectedOption ? selectedOption.label : '';
        
        return `
            <div class="combo-box-container" id="${id}-container">
                <input type="text" 
                       class="combo-box-input" 
                       id="${id}-input"
                       placeholder="${placeholder}"
                       value="${selectedLabel}"
                       data-selected-value="${selectedValue}"
                       autocomplete="off"
                       onfocus="UIComponents.showComboBoxDropdown('${id}')"
                       oninput="UIComponents.filterComboBoxOptions('${id}', this.value)">
                <div class="combo-box-dropdown" id="${id}-dropdown">
                    ${options.map(option => `
                        <div class="combo-box-option ${option.value === selectedValue ? 'selected' : ''}" 
                             data-value="${option.value}"
                             onclick="UIComponents.selectComboBoxOption('${id}', '${option.value}', '${option.label}', '${onSelect}')">
                            ${option.label}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Show combo box dropdown
     * @param {string} id - Combo box ID
     */
    static showComboBoxDropdown(id) {
        const dropdown = document.getElementById(`${id}-dropdown`);
        if (dropdown) {
            // Close all other dropdowns first
            document.querySelectorAll('.combo-box-dropdown.active').forEach(d => {
                if (d !== dropdown) {
                    d.classList.remove('active');
                }
            });
            
            dropdown.classList.add('active');
        }
    }

    /**
     * Hide combo box dropdown
     * @param {string} id - Combo box ID
     */
    static hideComboBoxDropdown(id) {
        const dropdown = document.getElementById(`${id}-dropdown`);
        if (dropdown) {
            dropdown.classList.remove('active');
        }
    }

    /**
     * Filter combo box options
     * @param {string} id - Combo box ID
     * @param {string} searchTerm - Search term
     */
    static filterComboBoxOptions(id, searchTerm) {
        const dropdown = document.getElementById(`${id}-dropdown`);
        const options = dropdown.querySelectorAll('.combo-box-option');
        const term = searchTerm.toLowerCase();
        
        let hasVisibleOptions = false;
        
        options.forEach(option => {
            const label = option.textContent.toLowerCase();
            if (label.includes(term)) {
                option.style.display = 'block';
                hasVisibleOptions = true;
            } else {
                option.style.display = 'none';
            }
        });
        
        // Show/hide no results message
        let noResults = dropdown.querySelector('.combo-box-no-results');
        if (!hasVisibleOptions) {
            if (!noResults) {
                noResults = document.createElement('div');
                noResults.className = 'combo-box-no-results';
                noResults.textContent = 'No results found';
                dropdown.appendChild(noResults);
            }
            noResults.style.display = 'block';
        } else if (noResults) {
            noResults.style.display = 'none';
        }
        
        dropdown.classList.add('active');
    }

    /**
     * Select combo box option
     * @param {string} id - Combo box ID
     * @param {string} value - Selected value
     * @param {string} label - Selected label
     * @param {string} onSelect - Callback function name
     */
    static selectComboBoxOption(id, value, label, onSelect) {
        const input = document.getElementById(`${id}-input`);
        if (input) {
            input.value = label;
            input.setAttribute('data-selected-value', value);
        }
        
        // Update the selected state of options
        const dropdown = document.getElementById(`${id}-dropdown`);
        if (dropdown) {
            dropdown.querySelectorAll('.combo-box-option').forEach(option => {
                option.classList.remove('selected');
                if (option.getAttribute('data-value') === value) {
                    option.classList.add('selected');
                }
            });
        }
        
        this.hideComboBoxDropdown(id);
        
        // Call the callback function
        if (typeof window[onSelect] === 'function') {
            try {
                window[onSelect](value, label);
            } catch (error) {
                console.error('Error in combo box callback:', error);
            }
        }
    }

    /**
     * Show loading overlay
     * @param {string} message - Loading message
     */
    static showLoadingOverlay(message = 'Loading...') {
        let overlay = document.getElementById('loading-overlay');
        
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'loading-overlay';
            overlay.className = 'loading-overlay';
            overlay.innerHTML = `
                <div style="text-align: center;">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">${message}</div>
                </div>
            `;
            document.body.appendChild(overlay);
        } else {
            const textElement = overlay.querySelector('.loading-text');
            if (textElement) {
                textElement.textContent = message;
            }
        }
        
        overlay.classList.add('active');
    }

    /**
     * Hide loading overlay
     */
    static hideLoadingOverlay() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.remove('active');
        }
    }

    /**
     * Initialize combo box event listeners
     * @param {string} id - Combo box ID
     */
    static initComboBox(id) {
        const container = document.getElementById(`${id}-container`);
        if (!container) return;
        
        // Remove existing event listeners to prevent duplicates
        const existingListener = container.getAttribute('data-combo-initialized');
        if (existingListener === 'true') {
            return; // Already initialized
        }
        
        // Mark as initialized
        container.setAttribute('data-combo-initialized', 'true');
        
        // Handle keyboard navigation
        const input = document.getElementById(`${id}-input`);
        if (input) {
            const keydownListener = (e) => {
                if (e.key === 'Escape') {
                    this.hideComboBoxDropdown(id);
                }
            };
            input.addEventListener('keydown', keydownListener);
            
            // Store reference for cleanup
            input.setAttribute('data-keydown-listener', 'true');
        }
        
        // Store references for cleanup
        container.setAttribute('data-combo-id', id);
    }
}

// Global click handler for closing dropdowns
document.addEventListener('click', (e) => {
    // Check if click is outside any combo box container
    const comboContainers = document.querySelectorAll('.combo-box-container');
    let clickedInsideCombo = false;
    
    comboContainers.forEach(container => {
        if (container.contains(e.target)) {
            clickedInsideCombo = true;
        }
    });
    
    // If clicked outside all combo boxes, close all dropdowns
    if (!clickedInsideCombo) {
        document.querySelectorAll('.combo-box-dropdown.active').forEach(dropdown => {
            dropdown.classList.remove('active');
        });
    }
});

// Make UIComponents available globally
window.UIComponents = UIComponents; 