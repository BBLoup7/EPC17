/**
 * Common Utility Functions for Snowmobile Drag Racing Event Manager
 * Provides reusable helper functions across the application
 */

class Helpers {
    /**
     * Generate a unique ID using timestamp and random number
     * @returns {string} Unique identifier
     */
    static generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Format date for display
     * @param {Date|string} date - Date to format
     * @returns {string} Formatted date string
     */
    static formatDate(date) {
        if (!date) return 'N/A';
        const d = new Date(date);
        return d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    /**
     * Format date and time for display
     * @param {Date|string} date - Date to format
     * @returns {string} Formatted datetime string
     */
    static formatDateTime(date) {
        if (!date) return 'N/A';
        const d = new Date(date);
        return d.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Debounce function calls
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Deep clone an object
     * @param {Object} obj - Object to clone
     * @returns {Object} Cloned object
     */
    static deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => this.deepClone(item));
        
        const cloned = {};
        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = this.deepClone(obj[key]);
            }
        }
        return cloned;
    }

    /**
     * Capitalize first letter of each word
     * @param {string} str - String to capitalize
     * @returns {string} Capitalized string
     */
    static capitalize(str) {
        if (!str) return '';
        return str.replace(/\b\w/g, l => l.toUpperCase());
    }

    /**
     * Format phone number for display
     * @param {string} phone - Phone number to format
     * @returns {string} Formatted phone number
     */
    static formatPhone(phone) {
        if (!phone) return '';
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length === 10) {
            return `(${cleaned.substr(0, 3)}) ${cleaned.substr(3, 3)}-${cleaned.substr(6, 4)}`;
        }
        return phone; // Return original if not 10 digits
    }

    /**
     * Sanitize string for HTML display
     * @param {string} str - String to sanitize
     * @returns {string} Sanitized string
     */
    static sanitizeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Filter array of objects by search term
     * @param {Array} items - Array to filter
     * @param {string} searchTerm - Search term
     * @param {Array} fields - Fields to search in
     * @returns {Array} Filtered array
     */
    static filterBySearch(items, searchTerm, fields) {
        if (!searchTerm) return items;
        
        const term = searchTerm.toLowerCase();
        return items.filter(item => {
            return fields.some(field => {
                const value = this.getNestedProperty(item, field);
                return value && value.toString().toLowerCase().includes(term);
            });
        });
    }

    /**
     * Get nested property from object using dot notation
     * @param {Object} obj - Object to search
     * @param {string} path - Property path (e.g., 'user.name.first')
     * @returns {*} Property value
     */
    static getNestedProperty(obj, path) {
        return path.split('.').reduce((current, prop) => current && current[prop], obj);
    }

    /**
     * Sort array by property
     * @param {Array} items - Array to sort
     * @param {string} property - Property to sort by
     * @param {boolean} ascending - Sort direction
     * @returns {Array} Sorted array
     */
    static sortByProperty(items, property, ascending = true) {
        return [...items].sort((a, b) => {
            const aVal = this.getNestedProperty(a, property);
            const bVal = this.getNestedProperty(b, property);
            
            if (aVal < bVal) return ascending ? -1 : 1;
            if (aVal > bVal) return ascending ? 1 : -1;
            return 0;
        });
    }

    /**
     * Group array by property
     * @param {Array} items - Array to group
     * @param {string} property - Property to group by
     * @returns {Object} Grouped object
     */
    static groupBy(items, property) {
        return items.reduce((groups, item) => {
            const key = this.getNestedProperty(item, property);
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
            return groups;
        }, {});
    }

    /**
     * Show loading spinner
     */
    static showLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.add('active');
    }

    /**
     * Hide loading spinner
     */
    static hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.remove('active');
    }

    /**
     * Show modal with content
     * @param {string} title - Modal title
     * @param {string} content - Modal content (HTML)
     */
    static showModal(title, content) {
        console.log('Helpers.showModal called with title:', title);
        
        const overlay = document.getElementById('modal-overlay');
        const titleEl = document.getElementById('modal-title');
        const contentEl = document.getElementById('modal-content');
        
        console.log('Modal elements found:', {
            overlay: !!overlay,
            titleEl: !!titleEl,
            contentEl: !!contentEl
        });
        
        if (overlay && titleEl && contentEl) {
            titleEl.textContent = title;
            contentEl.innerHTML = content;
            overlay.classList.add('active');
            console.log('Modal should now be visible');
        } else {
            console.error('Missing modal elements');
        }
    }

    /**
     * Hide modal
     */
    static hideModal() {
        const overlay = document.getElementById('modal-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            // Clear modal content to prevent issues
            const titleEl = document.getElementById('modal-title');
            const contentEl = document.getElementById('modal-content');
            if (titleEl) titleEl.textContent = '';
            if (contentEl) contentEl.innerHTML = '';
        }
        
        // Also hide any other modal overlays that might be stuck
        const allOverlays = document.querySelectorAll('.overlay.active, .modal-overlay.active');
        allOverlays.forEach(overlay => {
            overlay.classList.remove('active');
        });
        
        // Remove any stuck backdrop
        const stuckBackdrops = document.querySelectorAll('.modal-backdrop, .overlay-backdrop');
        stuckBackdrops.forEach(backdrop => {
            backdrop.remove();
        });
    }

    /**
     * Show toast notification (create if doesn't exist)
     * @param {string} message - Toast message
     * @param {string} type - Toast type (success, error, warning, info)
     */
    static showToast(message, type = 'info') {
        // Create toast container if it doesn't exist
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: 10px;
            `;
            document.body.appendChild(toastContainer);
        }

        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style.cssText = `
            padding: 12px 16px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            max-width: 300px;
            word-wrap: break-word;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
            cursor: pointer;
        `;

        // Set background color based on type
        const colors = {
            success: '#28a745',
            error: '#dc3545',
            warning: '#ffc107',
            info: '#17a2b8'
        };
        toast.style.backgroundColor = colors[type] || colors.info;
        toast.textContent = message;

        // Add to container
        toastContainer.appendChild(toast);

        // Animate in
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        }, 10);

        // Remove after delay
        const removeToast = () => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        };

        // Auto remove after 5 seconds
        setTimeout(removeToast, 5000);

        // Remove on click
        toast.addEventListener('click', removeToast);
    }

    /**
     * Format currency amount
     * @param {number} amount - Amount to format
     * @returns {string} Formatted currency string
     */
    static formatCurrency(amount) {
        if (typeof amount !== 'number') return '$0.00';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    }

    /**
     * Calculate percentage
     * @param {number} part - Part value
     * @param {number} whole - Whole value
     * @returns {number} Percentage
     */
    static calculatePercentage(part, whole) {
        if (!whole || whole === 0) return 0;
        return Math.round((part / whole) * 100);
    }
}

// Make helpers available globally (remove ES6 export for compatibility)
window.Helpers = Helpers;

/**
 * Custom Confirmation Modal System
 * Replaces ugly browser confirm() dialogs with beautiful themed modals
 */
class ConfirmationModal {
    constructor() {
        this.modal = null;
        this.isShowing = false;
        this.createModal();
    }

    createModal() {
        // Only create if it doesn't exist
        if (document.getElementById('custom-confirmation-modal')) {
            this.modal = document.getElementById('custom-confirmation-modal');
            return;
        }

        const modalHTML = `
            <div id="custom-confirmation-modal" class="confirmation-modal">
                <div class="confirmation-content">
                    <div class="confirmation-header">
                        <div class="confirmation-icon danger">
                            <i class="fas fa-exclamation-triangle"></i>
                        </div>
                        <h3 class="confirmation-title">Confirm Action</h3>
                    </div>
                    <div class="confirmation-message">
                        Are you sure you want to proceed?
                    </div>
                    <div class="confirmation-warning" style="display: none;">
                        <i class="fas fa-warning"></i>
                        <span>This action cannot be undone!</span>
                    </div>
                    <div class="confirmation-input" style="display: none;">
                        <label for="confirmation-text-input">Type the required text to confirm:</label>
                        <input type="text" id="confirmation-text-input" placeholder="Type here...">
                    </div>
                    <div class="confirmation-loading" style="display: none;">
                        <div class="spinner"></div>
                        <span>Processing...</span>
                    </div>
                    <div class="confirmation-actions">
                        <button class="btn-confirm-cancel" onclick="window.confirmationModal.hide()">Cancel</button>
                        <button class="btn-confirm-danger" id="confirm-action-btn">Confirm</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.getElementById('custom-confirmation-modal');
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Close on background click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hide();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isShowing) {
                this.hide();
            }
        });

        // Text input validation
        const textInput = document.getElementById('confirmation-text-input');
        if (textInput) {
            textInput.addEventListener('input', () => {
                this.validateTextInput();
            });
        }
    }

    /**
     * Show confirmation modal
     * @param {Object} options - Configuration options
     */
    show(options = {}) {
        const {
            title = 'Confirm Action',
            message = 'Are you sure you want to proceed?',
            icon = 'danger', // 'danger' or 'warning'
            iconType = 'fas fa-exclamation-triangle',
            showWarning = false,
            warningText = 'This action cannot be undone!',
            requireText = null, // Text that must be typed to enable confirm
            confirmText = 'Confirm',
            cancelText = 'Cancel',
            onConfirm = () => {},
            onCancel = () => {}
        } = options;

        // Update modal content
        this.modal.querySelector('.confirmation-title').textContent = title;
        this.modal.querySelector('.confirmation-message').textContent = message;
        
        // Update icon
        const iconElement = this.modal.querySelector('.confirmation-icon');
        const iconI = iconElement.querySelector('i');
        iconElement.className = `confirmation-icon ${icon}`;
        iconI.className = iconType;

        // Show/hide warning
        const warningElement = this.modal.querySelector('.confirmation-warning');
        if (showWarning) {
            warningElement.style.display = 'flex';
            warningElement.querySelector('span').textContent = warningText;
        } else {
            warningElement.style.display = 'none';
        }

        // Show/hide text input requirement
        const inputElement = this.modal.querySelector('.confirmation-input');
        const textInput = document.getElementById('confirmation-text-input');
        if (requireText) {
            inputElement.style.display = 'block';
            inputElement.querySelector('label').textContent = `Type "${requireText}" to confirm:`;
            textInput.placeholder = requireText;
            textInput.value = '';
            this.requiredText = requireText;
        } else {
            inputElement.style.display = 'none';
            this.requiredText = null;
        }

        // Update button texts
        this.modal.querySelector('.btn-confirm-cancel').textContent = cancelText;
        const confirmBtn = this.modal.querySelector('.btn-confirm-danger');
        confirmBtn.textContent = confirmText;

        // Set up event handlers
        this.currentOptions = { onConfirm, onCancel };
        
        // Enable/disable confirm button
        this.validateTextInput();

        // Show modal
        this.isShowing = true;
        this.modal.classList.add('active');
        
        // Focus on text input if required
        if (requireText) {
            setTimeout(() => textInput.focus(), 300);
        }

        return new Promise((resolve) => {
            this.resolvePromise = resolve;
        });
    }

    validateTextInput() {
        const confirmBtn = document.getElementById('confirm-action-btn');
        const textInput = document.getElementById('confirmation-text-input');
        
        if (this.requiredText) {
            const isValid = textInput.value.trim() === this.requiredText;
            confirmBtn.classList.toggle('enabled', isValid);
            
            if (isValid) {
                confirmBtn.onclick = () => this.confirm();
            } else {
                confirmBtn.onclick = null;
            }
        } else {
            confirmBtn.classList.add('enabled');
            confirmBtn.onclick = () => this.confirm();
        }
    }

    showLoading(text = 'Processing...') {
        const loadingElement = this.modal.querySelector('.confirmation-loading');
        const actionsElement = this.modal.querySelector('.confirmation-actions');
        
        loadingElement.querySelector('span').textContent = text;
        loadingElement.style.display = 'flex';
        actionsElement.style.display = 'none';
    }

    hideLoading() {
        const loadingElement = this.modal.querySelector('.confirmation-loading');
        const actionsElement = this.modal.querySelector('.confirmation-actions');
        
        loadingElement.style.display = 'none';
        actionsElement.style.display = 'flex';
    }

    async confirm() {
        if (this.currentOptions.onConfirm) {
            try {
                this.showLoading('Processing...');
                await this.currentOptions.onConfirm();
                this.hide();
                if (this.resolvePromise) this.resolvePromise(true);
            } catch (error) {
                console.error('Confirmation action failed:', error);
                this.hideLoading();
                // Show error but keep modal open
                this.showError('An error occurred. Please try again.');
            }
        } else {
            this.hide();
            if (this.resolvePromise) this.resolvePromise(true);
        }
    }

    cancel() {
        if (this.currentOptions.onCancel) {
            this.currentOptions.onCancel();
        }
        this.hide();
        if (this.resolvePromise) this.resolvePromise(false);
    }

    hide() {
        this.isShowing = false;
        this.modal.classList.remove('active');
        this.hideLoading();
        
        // Clear form
        const textInput = document.getElementById('confirmation-text-input');
        if (textInput) textInput.value = '';
    }

    showError(message) {
        // You could implement a toast notification here
        alert(message); // Temporary fallback
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.confirmationModal = new ConfirmationModal();
}

// Helper function for easy confirmation
window.showConfirmation = function(options) {
    return window.confirmationModal.show(options);
};

// Easy presets for common confirmations
window.confirmDelete = function(itemName, onConfirm) {
    return window.confirmationModal.show({
        title: 'Delete Confirmation',
        message: `Are you sure you want to delete "${itemName}"? This action cannot be undone.`,
        showWarning: true,
        warningText: 'This will permanently remove all associated data!',
        confirmText: 'Delete',
        onConfirm
    });
};

window.confirmClearAllData = function(onConfirm) {
    return window.confirmationModal.show({
        title: 'Clear All Data',
        message: 'This will permanently delete ALL participants, events, series, races, and bracket data from both the application and server files.',
        icon: 'danger',
        iconType: 'fas fa-exclamation-triangle',
        showWarning: true,
        warningText: 'This is IRREVERSIBLE and will affect all users!',
        requireText: 'DELETE',
        confirmText: 'Clear All Data',
        onConfirm
    });
};

// Debug function for testing delete functionality
window.debugDeleteFunctions = function() {
    console.log('🔍 DEBUG DELETE FUNCTIONS:');
    console.log('confirmDelete exists:', typeof window.confirmDelete);
    console.log('confirmationModal exists:', !!window.confirmationModal);
    console.log('deleteEvent exists:', typeof window.deleteEvent);
    console.log('deleteSeries exists:', typeof window.deleteSeries);
    
    if (window.confirmationModal) {
        console.log('✅ ConfirmationModal ready');
        // Test modal
        window.confirmDelete('Test Item', () => {
            console.log('✅ Test confirmation worked!');
        });
    } else {
        console.log('❌ ConfirmationModal not available');
    }
};

// Fix participant-event sync issue
window.fixParticipantEventSync = async function() {
    try {
        if (!window.dataManager) {
            console.error('❌ DataManager not available');
            return;
        }
        
        console.log('🔄 Refreshing data from server...');
        const result = await window.dataManager.syncParticipantEventData();
        
        console.log(`✅ DATA REFRESHED!`);
        console.log('🔄 Refresh the events page to see the updated participant counts!');
        
        return result;
    } catch (error) {
        console.error('❌ Failed to refresh data from server:', error);
        throw error;
    }
};

// Clean up duplicate events created by the bug
window.cleanupDuplicateEvents = async function() {
    try {
        if (!window.dataManager) {
            console.error('❌ DataManager not available');
            return;
        }
        
        console.log('🧹 Starting duplicate event cleanup...');
        
        const result = await window.dataManager.getEvents();
        const events = result.events || result; // Handle both paginated and direct array responses
        const seen = new Map();
        const duplicates = [];
        
        // Find duplicates based on name and similar creation times
        events.forEach(event => {
            const key = (event.name || '').toLowerCase().trim();
            if (seen.has(key)) {
                const existingEvent = seen.get(key);
                const timeDiff = Math.abs(new Date(event.createdDate) - new Date(existingEvent.createdDate));
                
                // If created within 10 seconds and same location, likely duplicate
                if (timeDiff < 10000 && event.location === existingEvent.location) {
                    duplicates.push(event);
                    console.log(`Found duplicate event: "${event.name}" (ID: ${event.id})`);
                }
            } else {
                seen.set(key, event);
            }
        });
        
        console.log(`Found ${duplicates.length} duplicate events to clean up`);
        
        if (duplicates.length === 0) {
            console.log('✅ No duplicate events found!');
            return { removed: 0 };
        }
        
        // Remove duplicates
        for (const duplicateEvent of duplicates) {
            try {
                await window.dataManager.deleteEvent(duplicateEvent.id);
                console.log(`✅ Removed duplicate event: "${duplicateEvent.name}"`);
            } catch (error) {
                console.error(`❌ Failed to remove duplicate event ${duplicateEvent.id}:`, error);
            }
        }
        
        console.log(`✅ Cleanup complete! Removed ${duplicates.length} duplicate events`);
        return { removed: duplicates.length };
        
    } catch (error) {
        console.error('❌ Failed to cleanup duplicate events:', error);
        throw error;
    }
}; 