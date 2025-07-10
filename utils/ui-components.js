/**
 * UI Components for Snowmobile Drag Racing Event Manager
 * Provides reusable UI components like skeleton screens, pagination, and combo boxes
 */

class UIComponents {
    /**
     * Create skeleton loading cards
     * @param {number} count - Number of skeleton cards to create
     * @param {string} type - Type of skeleton (card, table, list)
     * @returns {string} HTML string of skeleton elements
     */
    static createSkeletonCards(count = 3, type = 'card') {
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
        
        return skeletons.join('');
    }

    /**
     * Create pagination component
     * @param {number} currentPage - Current page number
     * @param {number} totalPages - Total number of pages
     * @param {number} totalItems - Total number of items
     * @param {number} itemsPerPage - Items per page
     * @param {Function} onPageChange - Callback function for page changes
     * @returns {string} HTML string of pagination component
     */
    static createPagination(currentPage, totalPages, totalItems, itemsPerPage, onPageChange) {
        if (totalPages <= 1) return '';
        
        const startItem = (currentPage - 1) * itemsPerPage + 1;
        const endItem = Math.min(currentPage * itemsPerPage, totalItems);
        
        let paginationHTML = `
            <div class="pagination">
                <button class="pagination-button" 
                        onclick="${onPageChange}(${currentPage - 1})" 
                        ${currentPage <= 1 ? 'disabled' : ''}>
                    Previous
                </button>
        `;
        
        // Show page numbers
        const maxVisiblePages = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        
        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }
        
        // First page
        if (startPage > 1) {
            paginationHTML += `
                <button class="pagination-button" onclick="${onPageChange}(1)">1</button>
                ${startPage > 2 ? '<span class="pagination-info">...</span>' : ''}
            `;
        }
        
        // Page numbers
        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `
                <button class="pagination-button ${i === currentPage ? 'active' : ''}" 
                        onclick="${onPageChange}(${i})">${i}</button>
            `;
        }
        
        // Last page
        if (endPage < totalPages) {
            paginationHTML += `
                ${endPage < totalPages - 1 ? '<span class="pagination-info">...</span>' : ''}
                <button class="pagination-button" onclick="${onPageChange}(${totalPages})">${totalPages}</button>
            `;
        }
        
        paginationHTML += `
                <button class="pagination-button" 
                        onclick="${onPageChange}(${currentPage + 1})" 
                        ${currentPage >= totalPages ? 'disabled' : ''}>
                    Next
                </button>
                <div class="pagination-info">
                    Showing ${startItem}-${endItem} of ${totalItems} items
                </div>
            </div>
        `;
        
        return paginationHTML;
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
        
        this.hideComboBoxDropdown(id);
        
        if (typeof window[onSelect] === 'function') {
            window[onSelect](value, label);
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
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                this.hideComboBoxDropdown(id);
            }
        });
        
        // Handle keyboard navigation
        const input = document.getElementById(`${id}-input`);
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.hideComboBoxDropdown(id);
                }
            });
        }
    }
}

// Make UIComponents available globally
window.UIComponents = UIComponents; 