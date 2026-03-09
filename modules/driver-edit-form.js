/**
 * Unified Driver Edit Form Module
 * 
 * Provides a consistent way to edit driver information across all pages.
 * Emits events via globalEventBus when driver data is updated.
 * 
 * Usage:
 * 1. Include this script in your page
 * 2. Call DriverEditForm.show(driverId) to open the modal
 * 3. Listen for 'driver:updated' event on globalEventBus for changes
 * 
 * Events emitted:
 * - 'driver:updated' - when driver data is successfully saved
 * - 'driver:edit:opened' - when edit modal is opened
 * - 'driver:edit:closed' - when edit modal is closed
 */

class DriverEditFormManager {
    constructor() {
        this.modalElement = null;
        this.formElement = null;
        this.currentDriverId = null;
        this.currentDriverData = null;
        this.sponsors = [];
        this.isInitialized = false;
    }

    /**
     * Generate the HTML template for the driver edit modal
     */
    getTemplate() {
        return `
            <div class="driver-edit-modal modal-overlay" id="driverEditFormModal" style="display: none;">
                <div class="modal-content driver-edit-modal-content">
                    <div class="modal-header">
                        <h3><i class="fas fa-user-edit"></i> Edit Driver Information</h3>
                        <button type="button" class="modal-close" data-action="close">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <form id="driverEditForm" class="driver-edit-form">
                            <input type="hidden" id="driverEditId" name="driverId">
                            
                            <!-- Personal Information Section -->
                            <div class="form-section">
                                <h4 class="section-title"><i class="fas fa-user"></i> Personal Information</h4>
                                <div class="edit-form-grid">
                                    <div class="form-group">
                                        <label class="form-label">Full Name <span class="required">*</span></label>
                                        <input type="text" class="form-control" id="driverEditName" name="name" required>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">Nickname</label>
                                        <input type="text" class="form-control" id="driverEditNickname" name="nickname" placeholder="Optional display name">
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">Racing Number</label>
                                        <input type="text" class="form-control" id="driverEditRacingNumber" name="racingNumber" pattern="[A-Za-z0-9]+" placeholder="e.g., 42, ABC123">
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">Date of Birth</label>
                                        <input type="date" class="form-control" id="driverEditDob" name="dob">
                                    </div>
                                </div>
                            </div>

                            <!-- Contact Information Section -->
                            <div class="form-section">
                                <h4 class="section-title"><i class="fas fa-address-book"></i> Contact Information</h4>
                                <div class="edit-form-grid">
                                    <div class="form-group">
                                        <label class="form-label">Email</label>
                                        <input type="email" class="form-control" id="driverEditEmail" name="email" placeholder="driver@example.com">
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">Phone</label>
                                        <input type="tel" class="form-control" id="driverEditPhone" name="phone" placeholder="(555) 123-4567">
                                    </div>
                                    <div class="form-group full-width">
                                        <label class="form-label">Emergency Contact</label>
                                        <input type="text" class="form-control" id="driverEditEmergency" name="emergencyContact" placeholder="Name and phone number">
                                    </div>
                                </div>
                            </div>

                            <!-- Team/Sponsors Section -->
                            <div class="form-section">
                                <h4 class="section-title"><i class="fas fa-users"></i> Team & Sponsors</h4>
                                <div class="edit-form-grid">
                                    <div class="form-group">
                                        <label class="form-label">Team</label>
                                        <input type="text" class="form-control" id="driverEditTeam" name="team" placeholder="Team name">
                                    </div>
                                    <div class="form-group full-width">
                                        <label class="form-label">Sponsors</label>
                                        <div id="driverEditSponsorsContainer" class="sponsors-input-container">
                                            <div class="sponsor-tags" id="driverEditSponsorTags"></div>
                                            <div class="sponsor-input-wrapper">
                                                <input type="text" class="form-control sponsor-input" id="driverEditSponsorInput" placeholder="Type sponsor name and press Enter">
                                                <button type="button" class="btn btn-sm btn-secondary add-sponsor-btn" data-action="add-sponsor">
                                                    <i class="fas fa-plus"></i>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Notes Section -->
                            <div class="form-section">
                                <h4 class="section-title"><i class="fas fa-sticky-note"></i> Notes</h4>
                                <div class="form-group full-width">
                                    <textarea class="form-control" id="driverEditNotes" name="notes" rows="3" placeholder="Additional notes about the driver..."></textarea>
                                </div>
                            </div>

                            <!-- Info Message -->
                            <div class="info-message driver-edit-info">
                                <i class="fas fa-info-circle"></i>
                                <span>Event registrations, classes, and fees are managed separately on the event and registration pages.</span>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="close">
                            <i class="fas fa-times"></i> Cancel
                        </button>
                        <button type="button" class="btn btn-primary" data-action="save">
                            <i class="fas fa-save"></i> Save Changes
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Get CSS styles for the component
     */
    getStyles() {
        return `
            <style id="driver-edit-form-styles">
                /* Driver Edit Form Specific Styles */
                .driver-edit-modal-content {
                    max-width: 700px;
                    max-height: 90vh;
                    overflow-y: auto;
                }

                .driver-edit-form .form-section {
                    margin-bottom: 1.5rem;
                    padding-bottom: 1rem;
                    border-bottom: 1px solid var(--border-color);
                }

                .driver-edit-form .form-section:last-of-type {
                    border-bottom: none;
                    margin-bottom: 1rem;
                }

                .driver-edit-form .section-title {
                    color: var(--accent-primary);
                    font-size: 1rem;
                    margin-bottom: 1rem;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }

                .driver-edit-form .section-title i {
                    font-size: 0.9rem;
                }

                .driver-edit-form .edit-form-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 1rem;
                }

                .driver-edit-form .edit-form-grid .full-width {
                    grid-column: 1 / -1;
                }

                .driver-edit-form .required {
                    color: var(--error);
                }

                /* Sponsors Input */
                .sponsors-input-container {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }

                .sponsor-tags {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                    min-height: 32px;
                }

                .sponsor-tag {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.5rem;
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: 16px;
                    padding: 0.25rem 0.75rem;
                    font-size: 0.875rem;
                }

                .sponsor-tag .remove-sponsor {
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    padding: 0;
                    font-size: 0.75rem;
                    line-height: 1;
                    transition: color 0.2s;
                }

                .sponsor-tag .remove-sponsor:hover {
                    color: var(--error);
                }

                .sponsor-input-wrapper {
                    display: flex;
                    gap: 0.5rem;
                }

                .sponsor-input-wrapper .sponsor-input {
                    flex: 1;
                }

                .sponsor-input-wrapper .add-sponsor-btn {
                    flex-shrink: 0;
                    padding: 0.5rem 0.75rem;
                }

                /* Info Message */
                .driver-edit-info {
                    display: flex;
                    align-items: flex-start;
                    gap: 0.75rem;
                    padding: 0.75rem 1rem;
                    background: rgba(255, 96, 56, 0.1);
                    border-left: 3px solid var(--accent-primary);
                    border-radius: 4px;
                    margin-top: 1rem;
                }

                .driver-edit-info i {
                    color: var(--accent-primary);
                    flex-shrink: 0;
                    margin-top: 0.125rem;
                }

                .driver-edit-info span {
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                    line-height: 1.4;
                }

                /* Modal Footer */
                .driver-edit-modal .modal-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: 0.75rem;
                    padding-top: 1rem;
                    border-top: 1px solid var(--border-color);
                    margin-top: 1rem;
                }

                /* Responsive */
                @media (max-width: 600px) {
                    .driver-edit-form .edit-form-grid {
                        grid-template-columns: 1fr;
                    }
                    
                    .driver-edit-modal-content {
                        margin: 0.5rem;
                        max-width: calc(100vw - 1rem);
                    }
                }
            </style>
        `;
    }

    /**
     * Initialize the form by injecting template into DOM
     */
    init() {
        if (this.isInitialized) return;

        // Check if modal already exists
        if (document.getElementById('driverEditFormModal')) {
            this.modalElement = document.getElementById('driverEditFormModal');
            this.formElement = document.getElementById('driverEditForm');
            this.isInitialized = true;
            return;
        }

        // Add styles if not already added
        if (!document.getElementById('driver-edit-form-styles')) {
            document.head.insertAdjacentHTML('beforeend', this.getStyles());
        }

        // Create container and add template
        const container = document.createElement('div');
        container.innerHTML = this.getTemplate();
        document.body.appendChild(container.firstElementChild);

        // Get references
        this.modalElement = document.getElementById('driverEditFormModal');
        this.formElement = document.getElementById('driverEditForm');

        // Bind event handlers
        this.bindEvents();
        
        this.isInitialized = true;
        window.debugLogger?.init('DriverEdit', 'DriverEditForm initialized');
    }

    /**
     * Bind event handlers
     */
    bindEvents() {
        if (!this.modalElement) return;

        // Close button, cancel button, and save button
        this.modalElement.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            
            if (action === 'close') {
                this.close();
            } else if (action === 'save') {
                this.save();
            } else if (action === 'add-sponsor') {
                this.addSponsorFromInput();
            }

            // Close on overlay click
            if (e.target === this.modalElement) {
                this.close();
            }
        });

        // Sponsor input - add on Enter
        const sponsorInput = document.getElementById('driverEditSponsorInput');
        if (sponsorInput) {
            sponsorInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.addSponsorFromInput();
                }
            });
        }

        // Phone formatting
        const phoneInput = document.getElementById('driverEditPhone');
        if (phoneInput) {
            phoneInput.addEventListener('input', (e) => {
                this.formatPhoneNumber(e.target);
            });
        }

        // Escape key to close
        this._escapeHandler = (e) => {
            if (e.key === 'Escape' && this.modalElement?.style.display !== 'none') {
                this.close();
            }
        };
        document.addEventListener('keydown', this._escapeHandler);
    }

    /**
     * Format phone number as user types
     */
    formatPhoneNumber(input) {
        let value = input.value.replace(/\D/g, '');
        if (value.length > 10) value = value.slice(0, 10);
        
        if (value.length >= 6) {
            value = `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6)}`;
        } else if (value.length >= 3) {
            value = `(${value.slice(0, 3)}) ${value.slice(3)}`;
        } else if (value.length > 0) {
            value = `(${value}`;
        }
        
        input.value = value;
    }

    /**
     * Show the edit form for a driver
     * @param {string} driverId - The ID of the driver to edit
     */
    async show(driverId) {
        if (!this.isInitialized) {
            this.init();
        }

        if (!driverId) {
            console.error('DriverEditForm: No driver ID provided');
            return;
        }

        // Get driver data
        const driver = await this.getDriverData(driverId);
        if (!driver) {
            if (window.Helpers) {
                Helpers.showToast('Driver not found', 'error');
            } else {
                alert('Driver not found');
            }
            return;
        }

        this.currentDriverId = driverId;
        this.currentDriverData = driver;

        // Populate form
        this.populateForm(driver);

        // Show modal
        this.modalElement.style.display = 'flex';
        
        // Focus first input
        setTimeout(() => {
            document.getElementById('driverEditName')?.focus();
        }, 100);

        // Emit event
        if (window.globalEventBus) {
            window.globalEventBus.emit('driver:edit:opened', { driverId, driver });
        }
    }

    /**
     * Get driver data from DataManager
     */
    async getDriverData(driverId) {
        if (window.dataManager) {
            if (typeof window.dataManager.getParticipantById === 'function') {
                const participant = await window.dataManager.getParticipantById(driverId);
                if (participant) {
                    return participant;
                }
            }

            // Try getParticipant first (synchronous)
            let driver = window.dataManager.getParticipant(driverId);
            
            // If not found, try fetching from server
            if (!driver) {
                try {
                    const fetchFn = window.Auth?.fetch || window.Auth?.authFetch || fetch;
                    const response = await fetchFn(`/api/participants/${encodeURIComponent(driverId)}`);
                    if (response.ok) {
                        driver = await response.json();
                    }
                } catch (error) {
                    console.error('Error fetching driver:', error);
                }
            }
            
            return driver;
        }
        return null;
    }

    /**
     * Populate form with driver data
     */
    populateForm(driver) {
        // Personal info
        document.getElementById('driverEditId').value = driver.id || '';
        document.getElementById('driverEditName').value = driver.name || '';
        document.getElementById('driverEditNickname').value = driver.nickname || '';
        document.getElementById('driverEditRacingNumber').value = driver.racingNumber || '';
        document.getElementById('driverEditDob').value = driver.dob || '';

        // Contact info
        const contact = driver.contact || {};
        document.getElementById('driverEditEmail').value = contact.email || driver.email || '';
        document.getElementById('driverEditPhone').value = contact.phone || driver.phone || '';
        document.getElementById('driverEditEmergency').value = contact.emergency || driver.emergencyContact || '';

        // Team
        document.getElementById('driverEditTeam').value = driver.team || '';

        // Sponsors
        this.sponsors = Array.isArray(driver.sponsors) ? [...driver.sponsors] : [];
        this.renderSponsors();

        // Notes
        document.getElementById('driverEditNotes').value = driver.notes || '';
    }

    /**
     * Render sponsor tags
     */
    renderSponsors() {
        const container = document.getElementById('driverEditSponsorTags');
        if (!container) return;

        container.innerHTML = this.sponsors.map((sponsor, index) => `
            <span class="sponsor-tag">
                <span>${this.escapeHtml(sponsor)}</span>
                <button type="button" class="remove-sponsor" data-index="${index}" aria-label="Remove ${sponsor}">
                    <i class="fas fa-times"></i>
                </button>
            </span>
        `).join('');

        // Bind remove handlers
        container.querySelectorAll('.remove-sponsor').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.dataset.index, 10);
                this.removeSponsor(index);
            });
        });
    }

    /**
     * Add sponsor from input field
     */
    addSponsorFromInput() {
        const input = document.getElementById('driverEditSponsorInput');
        if (!input) return;

        const sponsor = input.value.trim();
        if (sponsor && !this.sponsors.includes(sponsor)) {
            this.sponsors.push(sponsor);
            this.renderSponsors();
            input.value = '';
        }
        input.focus();
    }

    /**
     * Remove sponsor by index
     */
    removeSponsor(index) {
        if (index >= 0 && index < this.sponsors.length) {
            this.sponsors.splice(index, 1);
            this.renderSponsors();
        }
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Close the edit form
     */
    close() {
        if (this.modalElement) {
            this.modalElement.style.display = 'none';
        }

        // Reset state
        this.currentDriverId = null;
        this.currentDriverData = null;
        this.sponsors = [];

        // Emit event
        if (window.globalEventBus) {
            window.globalEventBus.emit('driver:edit:closed', {});
        }
    }

    /**
     * Save driver changes
     */
    async save() {
        if (!this.currentDriverId || !this.currentDriverData) {
            if (window.Helpers) {
                Helpers.showToast('No driver selected', 'error');
            }
            return;
        }

        // Validate form
        const name = document.getElementById('driverEditName').value.trim();
        if (!name) {
            if (window.Helpers) {
                Helpers.showToast('Driver name is required', 'error');
            }
            document.getElementById('driverEditName').focus();
            return;
        }

        // Validate racing number format if provided
        const racingNumber = document.getElementById('driverEditRacingNumber').value.trim();
        if (racingNumber && !/^[A-Za-z0-9]+$/.test(racingNumber)) {
            if (window.Helpers) {
                Helpers.showToast('Racing number can only contain letters and numbers', 'error');
            }
            document.getElementById('driverEditRacingNumber').focus();
            return;
        }

        // Collect form data - merge with existing data to preserve event-related fields
        const updatedData = {
            ...this.currentDriverData,
            name: name,
            nickname: document.getElementById('driverEditNickname').value.trim(),
            racingNumber: racingNumber || null,
            dob: document.getElementById('driverEditDob').value || null,
            contact: {
                ...this.currentDriverData.contact,
                email: document.getElementById('driverEditEmail').value.trim(),
                phone: document.getElementById('driverEditPhone').value.trim(),
                emergency: document.getElementById('driverEditEmergency').value.trim()
            },
            team: document.getElementById('driverEditTeam').value.trim(),
            sponsors: [...this.sponsors],
            notes: document.getElementById('driverEditNotes').value.trim(),
            updatedAt: new Date().toISOString()
        };

        try {
            // Save using DataManager
            let success = false;
            
            if (window.dataManager) {
                success = await window.dataManager.updateParticipant(this.currentDriverId, updatedData);
            }

            if (success) {
                if (window.Helpers) {
                    Helpers.showToast('Driver information updated successfully', 'success');
                }

                // Emit event so other pages can refresh
                if (window.globalEventBus) {
                    window.globalEventBus.emit('driver:updated', {
                        driverId: this.currentDriverId,
                        driver: updatedData,
                        source: window.location.pathname
                    });
                }

                // Close modal
                this.close();
            } else {
                if (window.Helpers) {
                    Helpers.showToast('Failed to update driver information', 'error');
                }
            }
        } catch (error) {
            console.error('Error saving driver:', error);
            if (window.Helpers) {
                Helpers.showToast('Error saving driver information. Please try again.', 'error');
            }
        }
    }
}

// Create global instance
window.DriverEditForm = new DriverEditFormManager();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.DriverEditForm.init();
    });
} else {
    // DOM already ready
    window.DriverEditForm.init();
}



