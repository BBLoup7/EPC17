/**
 * Form Validation Utilities for EPC17 Event Management System
 * Provides comprehensive validation functions for all forms
 */

class Validator {
    /**
     * Validate required field
     * @param {string} value - Value to validate
     * @param {string} fieldName - Field name for error message
     * @returns {Object} Validation result
     */
    static required(value, fieldName = 'Field') {
        const isValid = value && value.toString().trim().length > 0;
        return {
            isValid,
            message: isValid ? '' : `${fieldName} is required`
        };
    }

    /**
     * Validate email address
     * @param {string} email - Email to validate
     * @returns {Object} Validation result
     */
    static email(email) {
        if (!email || email.trim() === '') {
            return { isValid: true, message: '' }; // Empty is valid (use required separately)
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const isValid = emailRegex.test(email.trim());
        return {
            isValid,
            message: isValid ? '' : 'Please enter a valid email address'
        };
    }

    /**
     * Validate phone number
     * @param {string} phone - Phone number to validate
     * @returns {Object} Validation result
     */
    static phone(phone) {
        if (!phone || phone.trim() === '') {
            return { isValid: true, message: '' }; // Empty is valid (use required separately)
        }
        
        const cleaned = phone.replace(/\D/g, '');
        const isValid = cleaned.length === 10;
        return {
            isValid,
            message: isValid ? '' : 'Please enter a valid 10-digit phone number'
        };
    }

    /**
     * Validate minimum length
     * @param {string} value - Value to validate
     * @param {number} minLength - Minimum length required
     * @param {string} fieldName - Field name for error message
     * @returns {Object} Validation result
     */
    static minLength(value, minLength, fieldName = 'Field') {
        if (!value || value.toString().trim() === '') {
            return { isValid: true, message: '' }; // Empty is valid (use required separately)
        }
        
        const isValid = value.toString().trim().length >= minLength;
        return {
            isValid,
            message: isValid ? '' : `${fieldName} must be at least ${minLength} characters long`
        };
    }

    /**
     * Validate maximum length
     * @param {string} value - Value to validate
     * @param {number} maxLength - Maximum length allowed
     * @param {string} fieldName - Field name for error message
     * @returns {Object} Validation result
     */
    static maxLength(value, maxLength, fieldName = 'Field') {
        if (!value || value.toString().trim() === '') {
            return { isValid: true, message: '' }; // Empty is valid
        }
        
        const isValid = value.toString().trim().length <= maxLength;
        return {
            isValid,
            message: isValid ? '' : `${fieldName} must be no more than ${maxLength} characters long`
        };
    }

    /**
     * Validate numeric value
     * @param {string|number} value - Value to validate
     * @param {string} fieldName - Field name for error message
     * @returns {Object} Validation result
     */
    static numeric(value, fieldName = 'Field') {
        if (!value || value.toString().trim() === '') {
            return { isValid: true, message: '' }; // Empty is valid (use required separately)
        }
        
        const isValid = !isNaN(parseFloat(value)) && isFinite(value);
        return {
            isValid,
            message: isValid ? '' : `${fieldName} must be a valid number`
        };
    }

    /**
     * Validate positive number
     * @param {string|number} value - Value to validate
     * @param {string} fieldName - Field name for error message
     * @returns {Object} Validation result
     */
    static positiveNumber(value, fieldName = 'Field') {
        if (!value || value.toString().trim() === '') {
            return { isValid: true, message: '' }; // Empty is valid (use required separately)
        }
        
        const num = parseFloat(value);
        const isValid = !isNaN(num) && isFinite(num) && num > 0;
        return {
            isValid,
            message: isValid ? '' : `${fieldName} must be a positive number`
        };
    }

    /**
     * Validate date
     * @param {string} dateStr - Date string to validate
     * @param {string} fieldName - Field name for error message
     * @returns {Object} Validation result
     */
    static date(dateStr, fieldName = 'Date') {
        if (!dateStr || dateStr.trim() === '') {
            return { isValid: true, message: '' }; // Empty is valid (use required separately)
        }
        
        const date = new Date(dateStr);
        const isValid = date instanceof Date && !isNaN(date);
        return {
            isValid,
            message: isValid ? '' : `Please enter a valid ${fieldName.toLowerCase()}`
        };
    }

    /**
     * Validate date is in the future
     * @param {string} dateStr - Date string to validate
     * @param {string} fieldName - Field name for error message
     * @returns {Object} Validation result
     */
    static futureDate(dateStr, fieldName = 'Date') {
        if (!dateStr || dateStr.trim() === '') {
            return { isValid: true, message: '' }; // Empty is valid (use required separately)
        }
        
        const date = new Date(dateStr);
        const now = new Date();
        now.setHours(0, 0, 0, 0); // Reset time for date comparison
        
        if (!(date instanceof Date) || isNaN(date)) {
            return { isValid: false, message: `Please enter a valid ${fieldName.toLowerCase()}` };
        }
        
        const isValid = date >= now;
        return {
            isValid,
            message: isValid ? '' : `${fieldName} must be in the future`
        };
    }

    /**
     * Validate date range (end date after start date)
     * @param {string} startDate - Start date string
     * @param {string} endDate - End date string
     * @returns {Object} Validation result
     */
    static dateRange(startDate, endDate) {
        if (!startDate || !endDate || startDate.trim() === '' || endDate.trim() === '') {
            return { isValid: true, message: '' }; // Empty is valid (use required separately)
        }
        
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        if (!(start instanceof Date) || isNaN(start) || !(end instanceof Date) || isNaN(end)) {
            return { isValid: false, message: 'Please enter valid dates' };
        }
        
        const isValid = end >= start;
        return {
            isValid,
            message: isValid ? '' : 'End date must be after start date'
        };
    }

    /**
     * Validate one of allowed values
     * @param {string} value - Value to validate
     * @param {Array} allowedValues - Array of allowed values
     * @param {string} fieldName - Field name for error message
     * @returns {Object} Validation result
     */
    static oneOf(value, allowedValues, fieldName = 'Field') {
        if (!value || value.toString().trim() === '') {
            return { isValid: true, message: '' }; // Empty is valid (use required separately)
        }
        
        const isValid = allowedValues.includes(value);
        return {
            isValid,
            message: isValid ? '' : `${fieldName} must be one of: ${allowedValues.join(', ')}`
        };
    }

    /**
     * Validate form using validation rules
     * @param {HTMLFormElement} form - Form element to validate
     * @param {Object} rules - Validation rules object
     * @returns {Object} Validation result with errors
     */
    static validateForm(form, rules) {
        const errors = {};
        let isValid = true;

        // Clear existing error displays
        form.querySelectorAll('.error-message').forEach(el => el.remove());
        form.querySelectorAll('.form-group input, .form-group select, .form-group textarea')
            .forEach(el => el.classList.remove('error'));

        for (const fieldName in rules) {
            const field = form.querySelector(`[name="${fieldName}"]`);
            if (!field) continue;

            const fieldRules = rules[fieldName];
            const value = field.type === 'checkbox' ? field.checked : field.value;
            const fieldErrors = [];

            // Apply each validation rule for this field
            for (const rule of fieldRules) {
                let result;
                
                if (typeof rule === 'function') {
                    result = rule(value);
                } else if (typeof rule === 'object' && rule.validator) {
                    result = rule.validator(value, ...(rule.params || []));
                }

                if (result && !result.isValid) {
                    fieldErrors.push(result.message);
                }
            }

            if (fieldErrors.length > 0) {
                errors[fieldName] = fieldErrors;
                isValid = false;
                
                // Add visual error indicators
                field.classList.add('error');
                
                // Add error message
                const errorDiv = document.createElement('div');
                errorDiv.className = 'error-message';
                errorDiv.textContent = fieldErrors[0]; // Show first error
                field.parentNode.appendChild(errorDiv);
            }
        }

        return { isValid, errors };
    }

    /**
     * Registration form validation rules
     */
    static getRegistrationRules() {
        return {
            participantName: [
                (value) => this.required(value, 'Participant name'),
                (value) => this.minLength(value, 2, 'Participant name'),
                (value) => this.maxLength(value, 50, 'Participant name')
            ],
                    vehicleClass: [
            (value) => this.required(value, 'Vehicle class'),
            (value) => this.oneOf(value, ['pro', 'sport', 'stock', 'modified'], 'Vehicle class')
        ],
            teamName: [
                (value) => this.maxLength(value, 50, 'Team name')
            ],
            contactEmail: [
                (value) => this.required(value, 'Email address'),
                (value) => this.email(value)
            ],
            contactPhone: [
                (value) => this.required(value, 'Phone number'),
                (value) => this.phone(value)
            ],
            emergencyContact: [
                (value) => this.required(value, 'Emergency contact'),
                (value) => this.minLength(value, 2, 'Emergency contact')
            ],
            emergencyPhone: [
                (value) => this.required(value, 'Emergency phone'),
                (value) => this.phone(value)
            ],

        };
    }

    /**
     * Series creation validation rules
     */
    static getSeriesRules() {
        return {
            seriesName: [
                (value) => this.required(value, 'Series name'),
                (value) => this.minLength(value, 3, 'Series name'),
                (value) => this.maxLength(value, 100, 'Series name')
            ]
        };
    }

    /**
     * Event creation validation rules
     */
    static getEventRules() {
        return {
            eventName: [
                (value) => this.required(value, 'Event name'),
                (value) => this.minLength(value, 3, 'Event name'),
                (value) => this.maxLength(value, 100, 'Event name')
            ],
            eventDate: [
                (value) => this.required(value, 'Event date'),
                (value) => this.date(value, 'Event date'),
                (value) => this.futureDate(value, 'Event date')
            ],
            location: [
                (value) => this.required(value, 'Location'),
                (value) => this.minLength(value, 3, 'Location')
            ],
            numberOfTracks: [
                (value) => this.required(value, 'Number of tracks'),
                (value) => this.numeric(value, 'Number of tracks'),
                (value) => {
                    const num = parseInt(value);
                    const isValid = num >= 1 && num <= 10;
                    return {
                        isValid,
                        message: isValid ? '' : 'Number of tracks must be between 1 and 10'
                    };
                }
            ],
            eliminationType: [
                (value) => this.required(value, 'Elimination type'),
                (value) => this.oneOf(value, ['single', 'double'], 'Elimination type')
            ],
            entryFee: [
                (value) => this.positiveNumber(value, 'Entry fee')
            ],
            maxParticipants: [
                (value) => this.numeric(value, 'Maximum participants'),
                (value) => {
                    if (!value || value.toString().trim() === '') return { isValid: true, message: '' };
                    const num = parseInt(value);
                    const isValid = num >= 8 && num <= 128;
                    return {
                        isValid,
                        message: isValid ? '' : 'Maximum participants must be between 8 and 128'
                    };
                }
            ]
        };
    }

    /**
     * Show validation summary for a form
     * @param {Object} validationResult - Result from validateForm
     * @param {string} containerId - ID of container to show summary
     */
    static showValidationSummary(validationResult, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (validationResult.isValid) {
            container.style.display = 'none';
            return;
        }

        const errorList = Object.keys(validationResult.errors).map(field => {
            const errors = validationResult.errors[field];
            return `<li><strong>${Helpers.capitalize(field)}:</strong> ${errors[0]}</li>`;
        }).join('');

        container.innerHTML = `
            <div class="alert alert-error">
                <h4>Please correct the following errors:</h4>
                <ul>${errorList}</ul>
            </div>
        `;
        container.style.display = 'block';
    }
}

// Make validator available globally
window.Validator = Validator; 