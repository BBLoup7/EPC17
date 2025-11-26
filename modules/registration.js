/**
 * Registration Module for EPC17 Event Management System
 * Handles both season-level and event-specific registration
 */

class RegistrationManager {
    constructor() {
        this.registrations = new Map();
        this.currentEvent = null;
        this.currentEventId = null;
        this.initialized = false;
        // Don't initialize immediately - wait for authentication
        this.initAfterAuth();
    }

    /**
     * Initialize after authentication is complete
     */
    async initAfterAuth() {
        window.debugLogger?.debug('Registration', 'Waiting for authentication...');
        
        // Wait for authentication to complete
        await this.waitForAuthentication();
        
        // Now initialize normally
        this.init();
        this.initialized = true;
        window.debugLogger?.debug('Registration', 'Initialized after authentication');
    }

    /**
     * Wait for authentication to complete
     */
    async waitForAuthentication() {
        // Wait for Auth to be available and initialized
        let attempts = 0;
        while (!window.Auth && attempts < 100) { // Max 5 seconds
            await new Promise(resolve => setTimeout(resolve, 50));
            attempts++;
        }
        
        if (!window.Auth) {
            console.warn('🔐 RegistrationManager: Auth system not available after waiting');
            return false;
        }
        
        // Wait a bit more for session restoration to complete
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Check if we have a valid session
        if (!window.currentUser) {
            window.debugLogger?.debug('Registration', 'No current user, authentication failed');
            return false;
        }
        
        window.debugLogger?.debug('Registration', 'Authentication complete');
        return true;
    }

    /**
     * Initialize the registration module
     */
    init() {
        this.bindEvents();
        this.loadRegistrationForm();
        this.loadParticipantList();
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Registration type toggle
        const toggleBtn = document.getElementById('toggle-registration-type');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleRegistrationType());
        }

        // New registration button
        const newRegistrationBtn = document.getElementById('new-registration');
        if (newRegistrationBtn) {
            newRegistrationBtn.addEventListener('click', () => this.showRegistrationForm());
        }

        // Filter controls
        const classFilter = document.getElementById('class-filter');
        if (classFilter) {
            classFilter.addEventListener('change', () => this.filterParticipants());
        }

        const searchInput = document.getElementById('search-participants');
        if (searchInput) {
            const debouncedSearch = Helpers.debounce(() => this.filterParticipants(), 300);
            searchInput.addEventListener('input', debouncedSearch);
        }
    }

    /**
     * Toggle between season and event registration
     */
    toggleRegistrationType() {
        this.isSeasonRegistration = !this.isSeasonRegistration;
        
        const toggleBtn = document.getElementById('toggle-registration-type');
        if (toggleBtn) {
            toggleBtn.textContent = this.isSeasonRegistration 
                ? 'Switch to Event Registration' 
                : 'Switch to Season Registration';
        }

        // Update section header
        const header = document.querySelector('#registration .section-header h2');
        if (header) {
            header.textContent = this.isSeasonRegistration 
                ? 'Season Registration Management' 
                : 'Event Registration Management';
        }

        this.loadRegistrationForm();
        this.loadParticipantList();
    }

    /**
     * Load the registration form
     */
    loadRegistrationForm() {
        const container = document.getElementById('registration-form-content');
        if (!container) return;

        const formHtml = this.generateRegistrationFormHtml();
        container.innerHTML = formHtml;

        // Bind form events
        const form = container.querySelector('#registration-form');
        if (form) {
            form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }

        // Load events for event registration
            this.loadEventSelect();
    }

    /**
     * UNIFIED: Generate registration form HTML with mode support
     * @param {Object} options - Form options
     * @param {string} options.mode - 'new', 'existing', or 'edit'
     * @param {string} options.eventId - Event ID (required for new/existing)
     * @param {Object} options.participant - Participant data (for edit/existing modes)
     * @returns {string} Form HTML
     */
    generateUnifiedRegistrationForm(options = {}) {
        const { mode = 'new', eventId = '', participant = null } = options;
        
        const isNewMode = mode === 'new';
        const isExistingMode = mode === 'existing';
        const isEditMode = mode === 'edit';
        
        const formTitle = isEditMode ? 'Edit Participant' : 
                         isExistingMode ? 'Add Existing Driver to Event' : 
                         'New Event Registration';
        
        const submitButtonText = isEditMode ? 'Save Changes' : 
                                isExistingMode ? 'Add to Event' : 
                                'Register for Event';
        
        // Pre-fill values if participant provided
        const name = participant?.name || '';
        const racingNumber = participant?.racingNumber || '';
        const teamName = participant?.teamName || '';
        const email = participant?.contact?.email || participant?.contactEmail || '';
        const phone = participant?.contact?.phone || participant?.contactPhone || '';
        const emergency = participant?.contact?.emergency || participant?.emergencyContact || '';
        const emergencyPhone = participant?.emergencyPhone || '';
        
        return `
            <h3>${formTitle}</h3>
            <form id="unified-registration-form" class="registration-form" data-mode="${mode}">
                ${participant ? `<input type="hidden" name="participantId" value="${participant.id}">` : ''}
                
                ${!isEditMode ? `
                <div class="form-group">
                    <label for="eventId">Event *</label>
                    <select name="eventId" id="eventId" required ${isExistingMode ? 'readonly' : ''}>
                        <option value="">Select an event...</option>
                    </select>
                </div>
                ` : ''}
                
                <div class="form-group">
                    <label for="participantName">Participant Name *</label>
                    <input type="text" name="participantName" id="participantName" required 
                           placeholder="Enter full name" value="${name}"
                           ${isExistingMode ? 'readonly' : ''}>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="teamName">Team/Organization</label>
                        <input type="text" name="teamName" id="teamName" 
                               placeholder="Team or organization name" value="${teamName}">
                    </div>
                    <div class="form-group">
                        <label for="racingNumber">Racing Number *</label>
                        <input type="text" name="racingNumber" id="racingNumber" 
                               placeholder="e.g., 1, 1A, 99B" required pattern="[A-Za-z0-9]+" 
                               title="Racing number can contain numbers and letters" value="${racingNumber}">
                        <small class="form-text">Required. Can contain numbers and letters. Must be unique per class in this event.</small>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="contactEmail">Email *</label>
                        <input type="email" name="contactEmail" id="contactEmail" required 
                               placeholder="Email address" value="${email}">
                    </div>
                    <div class="form-group">
                        <label for="contactPhone">Phone *</label>
                        <input type="tel" name="contactPhone" id="contactPhone" required 
                               placeholder="Phone number" value="${phone}">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="emergencyContact">Emergency Contact *</label>
                        <input type="text" name="emergencyContact" id="emergencyContact" required 
                               placeholder="Emergency contact name" value="${emergency}">
                    </div>
                    <div class="form-group">
                        <label for="emergencyPhone">Emergency Phone *</label>
                        <input type="tel" name="emergencyPhone" id="emergencyPhone" required 
                               placeholder="Emergency contact phone" value="${emergencyPhone}">
                    </div>
                </div>

                <div class="form-group">
                    <label>Racing Classes * (Select all that apply)</label>
                    <div class="checkbox-group" id="sledClasses">
                        ${this.generateEventClassesForRegistration(eventId, participant)}
                    </div>
                    <div class="payment-summary" id="paymentSummary" style="display: none;">
                        <strong>Total Registration Fee: $<span id="totalFee">0</span></strong>
                    </div>
                </div>

                <div class="form-group">
                    <div class="form-checkbox">
                        <input type="checkbox" name="paymentComplete" id="paymentComplete" 
                               ${participant?.paymentComplete ? 'checked' : ''}>
                        <label for="paymentComplete">
                            Payment completed
                        </label>
                    </div>
                </div>

                <div class="form-group">
                    <button type="submit" class="btn btn-primary">
                        ${submitButtonText}
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="this.closest('form').reset()">
                        Clear Form
                    </button>
                    ${isEditMode || isExistingMode ? `
                    <button type="button" class="btn btn-secondary" onclick="window.closeModal && window.closeModal()">
                        Cancel
                    </button>
                    ` : ''}
                </div>

                <div id="form-errors" style="display: none;"></div>
            </form>
        `;
    }

    /**
     * LEGACY: Generate registration form HTML for event registration only
     * @deprecated Use generateUnifiedRegistrationForm() instead
     * @returns {string} Form HTML
     */
    generateRegistrationFormHtml() {
        return this.generateUnifiedRegistrationForm({ mode: 'new' });
    }

    /**
     * Load event select dropdown
     */
    async loadEventSelect() {
        const select = document.getElementById('eventId');
        if (!select) return;

        try {
            const result = await dataManager.getEvents({}, 1, 1000);
            const events = result.events || result; // Handle both paginated and direct array responses
            select.innerHTML = '<option value="">Select an event...</option>';
            
            events.forEach(event => {
                const option = document.createElement('option');
                option.value = event.id;
                option.textContent = `${event.name} - ${new Date(event.date).toLocaleDateString()}`;
                select.appendChild(option);
            });

            // Add change event listener to refresh classes when event changes
            select.addEventListener('change', () => {
                this.refreshEventClasses();
            });
        } catch (error) {
            console.error('Failed to load events for dropdown:', error);
            select.innerHTML = '<option value="">Error loading events...</option>';
        }
    }

    /**
     * Refresh event classes when event selection changes
     */
    refreshEventClasses() {
        const container = document.getElementById('sledClasses');
        if (container) {
            container.innerHTML = this.generateEventClassesForRegistration();
        }
        
        // Reset payment summary
        const summaryDiv = document.getElementById('paymentSummary');
        if (summaryDiv) {
            summaryDiv.style.display = 'none';
        }
    }

    /**
     * Handle form submission for event registration
     * @param {Event} event - Form submit event
     */
    async handleFormSubmit(event) {
        event.preventDefault();
        
        const form = event.target;
        const formData = new FormData(form);
        
        // Check if this is editing an existing participant
        const editParticipantId = formData.get('editParticipantId');
        const isEditingExisting = !!editParticipantId;
        
        // Validate form
        const validationRules = Validator.getRegistrationRules();
        const validation = Validator.validateForm(form, validationRules);
        
        if (!validation.isValid) {
            Validator.showValidationSummary(validation, 'form-errors');
            return;
        }

        // Event registration - requires classes and payment
        const selectedClasses = Array.from(form.querySelectorAll('input[name="sledClasses"]:checked'))
            .map(input => input.value);
            
        if (selectedClasses.length === 0) {
            Helpers.showToast('Please select at least one racing class', 'error');
            return;
        }

        // Calculate total fee
        const totalFee = this.calculateTotalFee(selectedClasses);
        const eventId = formData.get('eventId');

        try {
            if (isEditingExisting) {
                // 🔧 EXISTING PARTICIPANT: Update their classes and register for event
                window.debugLogger?.debug('Registration', `Adding existing participant ${editParticipantId} to event ${eventId}`);
                
                const existingParticipant = dataManager.getParticipant(editParticipantId);
                if (!existingParticipant) {
                    throw new Error('Participant not found');
                }
                
                // Update participant's selected classes for this event
                const updatedParticipant = {
                    ...existingParticipant,
                    selectedClasses: selectedClasses,
                    // Add payment info if not already complete
                    paymentStatus: formData.get('paymentComplete') === 'on' ? 'complete' : existingParticipant.paymentStatus || 'pending'
                };
                
                // Update the participant record
                await dataManager.updateParticipant(editParticipantId, updatedParticipant);
                
                // Register participant for the selected event
                await dataManager.registerParticipantForEvent(eventId, editParticipantId);
                
                Helpers.showToast(`${existingParticipant.name} added to event successfully!`, 'success');
                
            } else {
                // 🔧 NEW PARTICIPANT: Create new participant as usual
                window.debugLogger?.debug('Registration', `Creating new participant for event ${eventId}`);
                
                // Validate racing number
                const racingNumber = formData.get('racingNumber');
                if (!racingNumber || racingNumber.trim() === '') {
                    Helpers.showToast('Racing number is required', 'error');
                    return;
                }
                
                // Validate racing number format
                const racingNumberRegex = /^[A-Za-z0-9]+$/;
                if (!racingNumberRegex.test(racingNumber.trim())) {
                    Helpers.showToast('Racing number can only contain letters and numbers', 'error');
                    return;
                }
                
                // Initialize event-specific class tracking
                const eventClasses = {};
                eventClasses[eventId] = selectedClasses;
                
                const participantData = {
                    name: formData.get('participantName'),
                    selectedClasses: selectedClasses, // All classes (for new participant, same as first event)
                    eventClasses: eventClasses, // Event-specific class mapping: { eventId: [classes] }
                    team: formData.get('teamName') || '',
                    racingNumber: racingNumber.trim(),
                    contact: {
                        email: formData.get('contactEmail'),
                        phone: formData.get('contactPhone'),
                        emergency: formData.get('emergencyContact')
                    },
                    contactEmail: formData.get('contactEmail'),
                    contactPhone: formData.get('contactPhone'),
                    emergencyContact: formData.get('emergencyContact'),
                    emergencyPhone: formData.get('emergencyPhone'),

                    eventId: eventId,
                    paymentStatus: formData.get('paymentComplete') === 'on' ? 'complete' : 'pending',
                    totalRegistrationFee: totalFee,
                    paymentBreakdown: this.getPaymentBreakdown(selectedClasses),
                    registrationType: 'event'
                };

                // Add participant using DataManager
                const savedParticipant = await dataManager.addParticipant(participantData);

                // Register participant for the selected event
                await dataManager.registerParticipantForEvent(eventId, savedParticipant.id);
                
                Helpers.showToast('Registration successful!', 'success');
            }
            
            // Close modal and reset form
            Helpers.hideModal();
            form.reset();
            this.refreshEventClasses();
            
            // Refresh participant list if visible
            if (document.getElementById('listView').classList.contains('active')) {
                this.loadParticipantList();
            }

        } catch (error) {
            console.error('Registration error:', error);
            Helpers.showToast('Registration failed: ' + error.message, 'error');
        }
    }

    /**
     * UNIFIED: Show registration form with mode support
     * @param {Object} options - Form options
     * @param {string} options.mode - 'new', 'existing', or 'edit'
     * @param {string} options.eventId - Event ID (required for new/existing)
     * @param {string} options.participantId - Participant ID (for edit/existing modes)
     * @param {string} options.containerId - Container ID (default: modal)
     */
    async showUnifiedForm(options = {}) {
        const { mode = 'new', eventId = '', participantId = null, containerId = null } = options;
        
        window.debugLogger?.debug('Registration', `Showing unified registration form (mode: ${mode})`);
        
        // Get participant data if ID provided
        let participant = null;
        if (participantId) {
            participant = dataManager.getParticipant(participantId);
            if (!participant) {
                Helpers.showToast('Participant not found', 'error');
                return;
            }
        }
        
        // Generate unified form
        const formHtml = this.generateUnifiedRegistrationForm({
            mode,
            eventId,
            participant
        });
        
        // Show in modal or container
        if (containerId) {
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = formHtml;
                this.bindUnifiedFormEvents(mode, eventId, participant);
            }
        } else {
            const title = mode === 'edit' ? 'Edit Participant' : 
                         mode === 'existing' ? 'Add Existing Driver' : 
                         'New Registration';
            Helpers.showModal(title, formHtml);
            this.bindUnifiedFormEvents(mode, eventId, participant);
        }
    }

    /**
     * Bind events for unified registration form
     */
    bindUnifiedFormEvents(mode, eventId, participant) {
        const form = document.getElementById('unified-registration-form');
        if (!form) return;
        
        // Bind submit event
        form.addEventListener('submit', (e) => this.handleUnifiedFormSubmit(e, mode, participant));
        
        // Load events dropdown if needed
        if (mode !== 'edit') {
            this.loadEventSelect();
            if (eventId) {
                setTimeout(() => {
                    const select = document.getElementById('eventId');
                    if (select) select.value = eventId;
                }, 100);
            }
        }
        
        // Bind class change events for fee calculation
        const classCheckboxes = form.querySelectorAll('input[type="checkbox"][name="sledClasses"]');
        classCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => this.updateRegistrationFee());
        });
    }

    /**
     * Handle unified form submission
     */
    async handleUnifiedFormSubmit(e, mode, participant) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        
        try {
            const eventId = formData.get('eventId') || participant?.eventId;
            const participantId = formData.get('participantId') || participant?.id;
            
            // Collect selected classes
            const selectedClasses = [];
            const classCheckboxes = form.querySelectorAll('input[type="checkbox"][name="sledClasses"]:checked');
            classCheckboxes.forEach(checkbox => selectedClasses.push(checkbox.value));
            
            if (selectedClasses.length === 0) {
                Helpers.showToast('Please select at least one racing class', 'error');
                return;
            }
            
            // Build participant data with nested structure
            const participantData = {
                name: formData.get('participantName'),
                racingNumber: formData.get('racingNumber'),
                team: formData.get('teamName') || '',
                contact: {
                    email: formData.get('contactEmail'),
                    phone: formData.get('contactPhone'),
                    emergency: formData.get('emergencyContact')
                },
                emergencyPhone: formData.get('emergencyPhone'),
                paymentComplete: formData.get('paymentComplete') === 'on',
                paymentStatus: formData.get('paymentComplete') === 'on' ? 'complete' : 'pending',
            };
            
            // Handle based on mode
            if (mode === 'edit') {
                // Update existing participant
                await dataManager.updateParticipant(participantId, participantData);
                Helpers.showToast('Participant updated successfully', 'success');
            } else if (mode === 'existing') {
                // Add existing participant to event
                const eventClasses = participant.eventClasses || {};
                eventClasses[eventId] = selectedClasses;
                
                await dataManager.updateParticipant(participantId, {
                    eventClasses,
                    selectedClasses: this.computeSelectedClasses(eventClasses)
                });
                await dataManager.registerParticipantForEvent(eventId, participantId);
                Helpers.showToast('Driver added to event successfully', 'success');
            } else {
                // New registration
                const eventClasses = {};
                eventClasses[eventId] = selectedClasses;
                
                participantData.eventClasses = eventClasses;
                participantData.selectedClasses = selectedClasses;
                participantData.eventId = eventId;
                participantData.registrationType = 'event';
                
                const savedParticipant = await dataManager.addParticipant(participantData);
                await dataManager.registerParticipantForEvent(eventId, savedParticipant.id);
                Helpers.showToast('Registration successful', 'success');
            }
            
            // Close and refresh
            Helpers.hideModal();
            form.reset();
            if (this.loadParticipantList) this.loadParticipantList();
            
        } catch (error) {
            console.error('Form submission error:', error);
            Helpers.showToast('Error: ' + error.message, 'error');
        }
    }

    /**
     * Compute selectedClasses from eventClasses
     */
    computeSelectedClasses(eventClasses) {
        const allClasses = new Set();
        Object.values(eventClasses).forEach(classes => {
            if (Array.isArray(classes)) {
                classes.forEach(cls => allClasses.add(cls));
            }
        });
        return Array.from(allClasses);
    }

    /**
     * LEGACY: Show registration form in modal for editing
     * @deprecated Use showUnifiedForm() instead
     * @param {string} participantId - Optional participant ID for editing
     */
    showRegistrationForm(participantId = null) {
        const isEdit = participantId !== null;
        const title = isEdit ? 'Add Existing Driver to Event' : 'New Registration';
        
        let formHtml = this.generateRegistrationFormHtml();
        
        if (isEdit) {
            const participant = dataManager.getParticipant(participantId);
            if (participant) {
                // Add hidden field to track participant ID for editing
                formHtml = formHtml.replace(/(<form[^>]*>)/, `$1<input type="hidden" name="editParticipantId" value="${participantId}">`);
                
                // Pre-fill form with participant data
                formHtml = formHtml.replace(/(<input[^>]*name="participantName"[^>]*)/g, 
                    `$1 value="${Helpers.sanitizeHtml(participant.name)}" readonly`);
                formHtml = formHtml.replace(/(<input[^>]*name="contactEmail"[^>]*)/g, 
                    `$1 value="${Helpers.sanitizeHtml(participant.contact?.email || participant.contactEmail || '')}" readonly`);
                formHtml = formHtml.replace(/(<input[^>]*name="contactPhone"[^>]*)/g, 
                    `$1 value="${Helpers.sanitizeHtml(participant.contact?.phone || participant.contactPhone || '')}" readonly`);
                formHtml = formHtml.replace(/(<input[^>]*name="emergencyContact"[^>]*)/g, 
                    `$1 value="${Helpers.sanitizeHtml(participant.contact?.emergency || participant.emergencyContact || '')}" readonly`);
                formHtml = formHtml.replace(/(<input[^>]*name="emergencyPhone"[^>]*)/g, 
                    `$1 value="${Helpers.sanitizeHtml(participant.emergencyPhone || '')}" readonly`);
                formHtml = formHtml.replace(/(<input[^>]*name="teamName"[^>]*)/g, 
                    `$1 value="${Helpers.sanitizeHtml(participant.team || participant.teamName || '')}" readonly`);
                formHtml = formHtml.replace(/(<input[^>]*name="racingNumber"[^>]*)/g, 
                    `$1 value="${participant.racingNumber || ''}" readonly`);
                
                // Update button text
                formHtml = formHtml.replace(/(Register for Event)/, 'Add to Event');
                
                // Add notice about editing existing driver
                formHtml = formHtml.replace(/(<h3>Event Registration Form<\/h3>)/, 
                    `$1<div class="info-message" style="margin-bottom: 1rem; padding: 1rem; background: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 4px;">
                        <strong>Adding Existing Driver:</strong> ${Helpers.sanitizeHtml(participant.name)}<br>
                        <small>Personal details are locked. Only select classes for this event.</small>
                    </div>`);
            }
        }
        
        Helpers.showModal(title, formHtml);
        
        // Rebind form events in modal
        const modalForm = document.querySelector('#modal-content #registration-form');
        if (modalForm) {
            modalForm.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }
    }

    /**
     * Load and display participant list
     */
    loadParticipantList() {
        const container = document.getElementById('participant-list-content');
        if (!container) return;

        const filters = this.getActiveFilters();
        const participants = dataManager.getParticipants(filters);

        // Sort participants alphabetically by name
        const sortedParticipants = participants.sort((a, b) => 
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        );

        if (sortedParticipants.length === 0) {
            container.innerHTML = `
                <div class="no-data">
                    <p>No participants found${this.isSeasonRegistration ? ' for season registration' : ''}.</p>
                    <button class="btn btn-primary" onclick="registrationManager.showRegistrationForm()">
                        Add First Participant
                    </button>
                </div>
            `;
            return;
        }

        const participantHtml = sortedParticipants.map(participant => 
            this.generateParticipantItemHtml(participant)
        ).join('');

        container.innerHTML = `
            <div class="participant-count">
                <p><strong>${sortedParticipants.length}</strong> participant${sortedParticipants.length !== 1 ? 's' : ''} found</p>
            </div>
            ${participantHtml}
        `;
    }

    /**
     * Generate HTML for a single participant item
     * @param {Object} participant - Participant data
     * @returns {string} Participant item HTML
     */
    generateParticipantItemHtml(participant) {

        const paymentStatus = participant.paymentStatus === 'complete' ? 'payment-complete' : 'payment-pending';
        
        return `
            <div class="participant-item" data-participant-id="${participant.id}">
                <div class="participant-header">
                    <div class="participant-name">${Helpers.sanitizeHtml(participant.name)}</div>
                    <div class="participant-classes">
                        ${participant.sledClasses ? 
                            participant.sledClasses.map(cls => `<span class="participant-class">${cls.toUpperCase()}</span>`).join(' ') :
                            `<span class="participant-class">${participant.sledClass?.toUpperCase() || 'NO CLASS'}</span>`
                        }
                    </div>
                </div>
                
                <div class="participant-details">
                    <div><strong>Team:</strong> ${participant.team || 'No team'}</div>
                    <div><strong>Email:</strong> ${participant.contactEmail}</div>
                    <div><strong>Phone:</strong> ${Helpers.formatPhone(participant.contactPhone)}</div>
                    <div><strong>Registered:</strong> ${Helpers.formatDate(participant.registrationDate)}</div>
                    ${participant.totalRegistrationFee ? 
                        `<div><strong>Total Fee:</strong> $${participant.totalRegistrationFee}</div>` : ''
                    }
                </div>
                
                <div class="participant-status">
                    
                    <span class="status-badge status-${paymentStatus}">
                        ${participant.paymentStatus === 'complete' ? 'Payment Complete' : 'Payment Pending'}
                    </span>
                    ${participant.seasonRegistered ? 
                                        '<span class="status-badge status-season">Season Registered</span>' :
                '<span class="status-badge status-event">Event Only</span>'
                    }
                </div>
                
                <div class="participant-actions" style="margin-top: 0.5rem;">
                    <button class="btn btn-secondary" onclick="registrationManager.editParticipant('${participant.id}')">
                        Edit
                    </button>
                    <button class="btn btn-secondary" onclick="registrationManager.viewParticipantDetails('${participant.id}')">
                        Details
                    </button>

                </div>
            </div>
        `;
    }

    /**
     * Get active filter values for event registration
     * @returns {Object} Filter object
     */
    getActiveFilters() {
        const filters = {};
        
        const classFilter = document.getElementById('class-filter');
        if (classFilter && classFilter.value) {
            filters.sledClass = classFilter.value;
        }
        
        const searchInput = document.getElementById('search-participants');
        if (searchInput && searchInput.value.trim()) {
            filters.search = searchInput.value.trim();
        }
        
        return filters;
    }

    /**
     * Filter participants based on current filter settings
     */
    filterParticipants() {
        this.loadParticipantList();
    }

    /**
     * Edit participant
     * @param {string} participantId - Participant ID
     */
    editParticipant(participantId) {
        this.showRegistrationForm(participantId);
    }

    /**
     * View participant details
     * @param {string} participantId - Participant ID
     */
    viewParticipantDetails(participantId) {
        const participant = dataManager.getParticipant(participantId);
        if (!participant) {
            Helpers.showToast('Participant not found', 'error');
            return;
        }

        const detailsHtml = `
            <div class="participant-details-modal">
                <div class="detail-row">
                    <strong>Name:</strong> ${Helpers.sanitizeHtml(participant.name)}
                </div>
                <div class="detail-row">
                                    <strong>Racing Classes:</strong>
                ${participant.sledClasses ?
                participant.sledClasses.map(cls => cls.toUpperCase()).join(', ') :
                participant.sledClass?.toUpperCase() || 'NO CLASS'
                    }
                </div>
                ${participant.totalRegistrationFee ? `
                    <div class="detail-row">
                        <strong>Total Registration Fee:</strong> $${participant.totalRegistrationFee}
                    </div>
                ` : ''}
                ${participant.paymentBreakdown && participant.paymentBreakdown.length > 0 ? `
                    <div class="detail-row">
                        <strong>Payment Breakdown:</strong>
                        <ul style="margin: 0.5rem 0; padding-left: 1.5rem;">
                            ${participant.paymentBreakdown.map(item => 
                                `<li>${item.description}: $${item.fee}</li>`
                            ).join('')}
                        </ul>
                    </div>
                ` : ''}
                <div class="detail-row">
                    <strong>Team:</strong> ${participant.team || 'No team'}
                </div>
                <div class="detail-row">
                    <strong>Email:</strong> ${participant.contactEmail}
                </div>
                <div class="detail-row">
                    <strong>Phone:</strong> ${Helpers.formatPhone(participant.contactPhone)}
                </div>
                <div class="detail-row">
                    <strong>Emergency Contact:</strong> ${participant.emergencyContact}
                </div>
                <div class="detail-row">
                    <strong>Emergency Phone:</strong> ${Helpers.formatPhone(participant.emergencyPhone)}
                </div>
                <div class="detail-row">
                    <strong>Registration Date:</strong> ${Helpers.formatDateTime(participant.registrationDate)}
                </div>
                <div class="detail-row">
    
                </div>
                <div class="detail-row">
                    <strong>Payment Status:</strong> ${participant.paymentStatus === 'complete' ? 'Complete ✓' : 'Pending ⏳'}
                </div>
                <div class="detail-row">
                    <strong>Registration Type:</strong> Event Registration
                </div>
                
                <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #eee;">
                    <button class="btn btn-primary" onclick="registrationManager.editParticipant('${participant.id}'); Helpers.hideModal();">
                        Edit Participant
                    </button>
                    <button class="btn btn-secondary" onclick="Helpers.hideModal()">
                        Close
                    </button>
                </div>
            </div>
        `;

        Helpers.showModal('Participant Details', detailsHtml);
    }



    /**
     * Update payment summary based on selected classes
     */
    updatePaymentSummary() {
        const checkboxes = document.querySelectorAll('input[name="sledClasses"]:checked');
        const selectedClasses = Array.from(checkboxes).map(cb => cb.value);
        
        const summaryDiv = document.getElementById('paymentSummary');
        const totalFeeSpan = document.getElementById('totalFee');
        
        if (selectedClasses.length === 0) {
            summaryDiv.style.display = 'none';
            return;
        }
        
        const totalFee = this.calculateTotalFee(selectedClasses);
        totalFeeSpan.textContent = totalFee;
        summaryDiv.style.display = 'block';
    }

    /**
     * Calculate total registration fee for selected classes
     * @param {Array} selectedClasses - Array of selected class IDs
     * @returns {number} Total fee
     */
    calculateTotalFee(selectedClasses) {
        const currentEvent = this.getCurrentEvent();
        if (!currentEvent || !currentEvent.classSettings) {
            // Fallback to default pricing
            const classFees = {
                'pro': 50,
                'sport': 50,
                'stock': 50,
                'modified': 50,
                'youth': 30
            };
            
            return selectedClasses.reduce((total, className) => {
                return total + (classFees[className] || 0);
            }, 0);
        }

        return selectedClasses.reduce((total, classId) => {
            const classSetting = currentEvent.classSettings.find(cs => cs.classId === classId);
            return total + (classSetting?.price || 0);
        }, 0);
    }

    /**
     * Get payment breakdown for selected classes
     * @param {Array} selectedClasses - Array of selected class names
     * @returns {Array} Payment breakdown
     */
    getPaymentBreakdown(selectedClasses) {
        const currentEvent = this.getCurrentEvent();
        if (!currentEvent || !currentEvent.classSettings) {
            // Fallback to default pricing
            const classFees = {
                'pro': 50,
                'sport': 50,
                'stock': 50,
                'modified': 50,
                'youth': 30
            };
            
            return selectedClasses.map(className => ({
                class: className,
                fee: classFees[className] || 0,
                description: `${className.charAt(0).toUpperCase() + className.slice(1)} Class Registration`
            }));
        }

        return selectedClasses.map(classId => {
            const classSetting = currentEvent.classSettings.find(cs => cs.classId === classId);
            const series = dataManager.getSeries(currentEvent.seriesId);
            const seriesClass = series?.sledClasses?.find(sc => sc.id === classId);
            
            return {
                class: seriesClass?.name || classId,
                fee: classSetting?.price || 0,
                description: `${seriesClass?.name || classId} Class Registration`
            };
        });
    }

    /**
     * Generate event classes for registration form
     */
    generateEventClassesForRegistration() {
        const currentEvent = this.getCurrentEvent();
        if (!currentEvent) {
            return '<p><em>Please select an event first.</em></p>';
        }

        const series = dataManager.getSeries(currentEvent.seriesId);
        if (!series || !series.sledClasses) {
            return `
                <div class="registration-error">
                    <p><strong>⚠️ Configuration Issue</strong></p>
                    <p>This event is not properly associated with a series that has classes defined.</p>
                    <p>Please contact the event organizer to configure the event properly.</p>
                </div>
            `;
        }

        // Check if event has class settings configured
        const availableClasses = currentEvent.classSettings?.filter(cs => cs.enabled) || [];
        
        if (availableClasses.length === 0) {
            // Fallback: If no class settings, show all series classes with warning
            const fallbackHtml = series.sledClasses.map(seriesClass => {
                return `
                    <label class="checkbox-label">
                        <input type="checkbox" name="sledClasses" value="${seriesClass.id}" 
                               onchange="registrationManager.updatePaymentSummary()">
                        <span class="checkmark"></span>
                        ${seriesClass.name} - $${seriesClass.defaultFee || 0}/class
                    </label>
                `;
            }).join('');

            return `
                <div class="registration-warning">
                    <p><strong>⚠️ Event Configuration Incomplete</strong></p>
                    <p>This event hasn't been configured with specific class settings. Showing all classes from the series "${series.name}" with default pricing.</p>
                    <p><em>Event organizers should configure specific classes and pricing for this event.</em></p>
                </div>
                ${fallbackHtml}
            `;
        }

        // Normal case: Show configured classes
        return availableClasses.map(classSetting => {
            const seriesClass = series.sledClasses.find(sc => sc.id === classSetting.classId);
            if (!seriesClass) return '';

            return `
                <label class="checkbox-label">
                    <input type="checkbox" name="sledClasses" value="${classSetting.classId}" 
                           onchange="registrationManager.updatePaymentSummary()">
                    <span class="checkmark"></span>
                    ${seriesClass.name} - $${classSetting.price}/class
                </label>
            `;
        }).join('');
    }

    /**
     * Get current event for event registration
     */
    getCurrentEvent() {
        const eventSelect = document.getElementById('eventId');
        if (!eventSelect || !eventSelect.value) return null;
        
        return dataManager.getEvent(eventSelect.value);
    }
}

// Make RegistrationManager available globally
window.RegistrationManager = RegistrationManager;

// Initialize registration manager when DOM is loaded (if not already initialized)
document.addEventListener('DOMContentLoaded', () => {
    if (!window.registrationManager) {
    window.registrationManager = new RegistrationManager();
    }
}); 