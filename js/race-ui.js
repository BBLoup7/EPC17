/**
 * Enhanced Race UI Module for EPC17 Event Management System
 * Handles race management interface, bracket visualization, and result entry
 */

class RaceUI {
    constructor(raceManager, dataManager) {
        window.debugLogger?.init('RaceUI', 'Initializing Enhanced RaceUI');
        this.raceManager = raceManager;
        this.dataManager = dataManager;
        // Achievements removed
        this.selectedEventId = null;
        this.selectedClass = null;
        this.pendingResults = new Map(); // Store pending race results
        this.lastKnownHeatCount = 0; // Track heat count to detect new rounds
        this.lastClickTime = 0; // Track last click time for minimal debouncing
        this.clickDebounceDelay = 50; // Very short delay to prevent race conditions
        
        
        // Scroll anchor tracking
        this.scrollAnchor = null; // Current scroll anchor element
        this.scrollAnchorIndicator = null; // The floating indicator
        this.lastScrollPosition = 0;
        this.scrollThreshold = 100; // Pixels to scroll past before showing indicator
        
        // Queue for serializing background save operations
        this.saveQueue = Promise.resolve();

        // Don't initialize immediately - wait for explicit call after authentication
    }

    /**
     * Initialize the race UI
     */
    async init() {
        this.bindEventListeners();

        // Wait for authentication before loading data
        await this.waitForAuthentication();

        // Restore previous session state if available
        const sessionState = window.SessionPersistence?.Races?.load?.();
        let shouldRestoreState = false;

        if (sessionState && sessionState.eventId) {
            window.debugLogger?.debug('RaceUI', 'Restoring previous session state:', sessionState);
            shouldRestoreState = true;
        }

        // Restore filter state if available
        if (sessionState && sessionState.filters) {
            window.debugLogger?.debug('RaceUI', 'Restoring filter state:', sessionState.filters);
            // Restore filters after a short delay to ensure DOM is ready
            setTimeout(() => {
                if (sessionState.filters.searchTerm && document.getElementById('racesSearch')) {
                    document.getElementById('racesSearch').value = sessionState.filters.searchTerm;
                    window.currentRacesSearchTerm = sessionState.filters.searchTerm;
                }
                if (sessionState.filters.statusFilter && document.getElementById('racesStatusFilter')) {
                    document.getElementById('racesStatusFilter').value = sessionState.filters.statusFilter;
                    window.currentRacesStatusFilter = sessionState.filters.statusFilter;
                }
                if (sessionState.filters.sortOption && document.getElementById('racesSort')) {
                    document.getElementById('racesSort').value = sessionState.filters.sortOption;
                    window.currentRacesSortOption = sessionState.filters.sortOption;
                }
                if (sessionState.filters.currentPage) {
                    window.currentRacesPage = sessionState.filters.currentPage;
                }
            }, 100);
        }

        // Use modern rendering system if available, otherwise fall back to loadEvents
        if (typeof window.renderRacesEventsGrid === 'function' &&
            typeof window.allRacesEventsData !== 'undefined') {
            window.debugLogger?.debug('RaceUI', 'Using modern rendering system for initialization');
            await this.refreshEventsForModernInterface();

            // Restore previous state after loading events
            if (shouldRestoreState && sessionState.eventId) {
                setTimeout(async () => {
                    try {
                        const eventExists = this.dataManager.getEvent(sessionState.eventId);
                        if (eventExists) {
                            window.debugLogger?.debug('RaceUI', 'Auto-selecting previous event:', sessionState.eventId);
                            await this.selectEvent(sessionState.eventId);
                        } else {
                            window.debugLogger?.debug('RaceUI', 'Previous event no longer exists, clearing session state');
                            window.SessionPersistence?.clearState?.();
                        }
                    } catch (error) {
                        console.warn('Failed to restore session state:', error);
                        window.SessionPersistence?.clearState?.();
                    }
                }, 500);
            }
        } else {
            window.debugLogger?.debug('RaceUI', 'Using fallback rendering system for initialization');
            this.loadEvents();
        }

        // Refresh events when page becomes visible (user returns from another tab/page)
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && !this.selectedEventId) {
                // Use modern rendering system if available
                if (typeof window.renderRacesEventsGrid === 'function' &&
                    typeof window.allRacesEventsData !== 'undefined') {
                    this.refreshEventsForModernInterface();
                } else {
                    this.loadEvents();
                }
            }
        });
    }

    /**
     * Show processing indicator overlay
     * @param {String} message - Message to display
     * @param {String} heatId - Optional heat ID to position indicator
     */
    showProcessingIndicator(message = 'Processing race results...', heatId = null) {
        // Remove any existing indicators
        this.hideProcessingIndicator();

        const indicator = document.createElement('div');
        indicator.className = 'race-processing-indicator';
        indicator.id = 'race-processing-indicator';
        
        indicator.innerHTML = `
            <div class="processing-indicator-content">
                <div class="processing-spinner"></div>
                <div class="processing-message">${message}</div>
            </div>
        `;

        // Add styles if not already added
        if (!document.getElementById('race-processing-styles')) {
            const style = document.createElement('style');
            style.id = 'race-processing-styles';
            style.textContent = `
                .race-processing-indicator {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.6);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 100;
                    border-radius: 8px;
                }
                .processing-indicator-content {
                    background: var(--bg-primary);
                    padding: 1.5rem 2rem;
                    border-radius: 12px;
                    border: 1px solid var(--border-color);
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }
                .processing-spinner {
                    width: 24px;
                    height: 24px;
                    border: 3px solid var(--border-color);
                    border-top-color: var(--accent-primary);
                    border-radius: 50%;
                    animation: processing-spin 0.8s linear infinite;
                }
                .processing-message {
                    color: var(--text-primary);
                    font-weight: 500;
                    font-size: 0.95rem;
                }
                @keyframes processing-spin {
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }

        // Position indicator
        if (heatId) {
            // Position over specific heat card
            const heatCard = document.querySelector(`[data-heat-id="${heatId}"]`);
            if (heatCard) {
                heatCard.style.position = 'relative';
                heatCard.appendChild(indicator);
            } else {
                // Fallback to brackets container
                const bracketsContainer = document.getElementById('brackets-container');
                if (bracketsContainer) {
                    bracketsContainer.style.position = 'relative';
                    bracketsContainer.appendChild(indicator);
                } else {
                    document.body.appendChild(indicator);
                }
            }
        } else {
            // Position over brackets container
            const bracketsContainer = document.getElementById('brackets-container');
            if (bracketsContainer) {
                bracketsContainer.style.position = 'relative';
                bracketsContainer.appendChild(indicator);
            } else {
                document.body.appendChild(indicator);
            }
        }

        window.debugLogger?.debug('RaceUI', 'Processing indicator shown:', message);
    }

    /**
     * Hide processing indicator overlay
     */
    hideProcessingIndicator() {
        const indicator = document.getElementById('race-processing-indicator');
        if (indicator) {
            indicator.remove();
            window.debugLogger?.debug('RaceUI', 'Processing indicator hidden');
        }
    }

    /**
     * Wait for authentication to complete before loading data
     */
    async waitForAuthentication() {
        window.debugLogger?.debug('RaceUI', 'RaceUI: Waiting for authentication to complete...');
        
        // Wait for Auth to be available and initialized
        let attempts = 0;
        while (!window.Auth && attempts < 100) { // Max 5 seconds
            await new Promise(resolve => setTimeout(resolve, 50));
            attempts++;
        }
        
        if (!window.Auth) {
            console.warn('?? RaceUI: Auth system not available after waiting, proceeding without authentication');
            return false;
        }
        
        // Wait a bit more for session restoration to complete
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Check if we have a valid session
        if (!window.currentUser) {
            window.debugLogger?.debug('RaceUI', 'RaceUI: No current user, authentication failed');
            return false;
        }
        
        window.debugLogger?.debug('RaceUI', 'RaceUI: Authentication complete, proceeding with data load');
        return true;
    }

    /**
     * Show toast message
     */
    showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof Helpers !== 'undefined' && Helpers.showToast) {
            Helpers.showToast(message, type);
        } else {
            if (window.debugLogger) {
                window.debugLogger.debug('RaceUI', `Toast (${type}): ${message}`);
            } else {
                window.debugLogger?.debug('RaceUI', `Toast (${type}): ${message}`);
            }
        }
    }

    /**
     * Bind all event listeners
     */
    bindEventListeners() {
        if (this.listenersBound) {
            window.debugLogger?.debug('RaceUI', 'RaceUI: Event listeners already bound, skipping');
            return;
        }

        if (window.debugLogger) {
            window.debugLogger.debug('RaceUI', 'Binding event listeners');
        } else {
            window.debugLogger?.debug('RaceUI', 'Binding event listeners');
        }

        // Mark as bound to prevent duplication
        this.listenersBound = true;

        // Event selection
        const eventsGrid = document.getElementById('events-grid');
        if (eventsGrid) {
            eventsGrid.addEventListener('click', (e) => {
                // Ignore clicks on interactive controls inside event cards so their handlers win.
                // This prevents double-selecting when the card contains action buttons/links.
                const interactiveEl = e.target.closest('button, a, input, select, textarea, label');
                if (interactiveEl) {
                    return;
                }

                const eventCard = e.target.closest('.event-card');
                if (eventCard) {
                    const eventId = eventCard.dataset.eventId;
                    window.debugLogger?.debug('RaceUI', 'Event card clicked:', eventCard);
                    window.debugLogger?.debug('RaceUI', 'Event ID from dataset:', eventId);
                    
                    if (!eventId) {
                        console.error('? Event ID is undefined or empty');
                        console.error('? Event card dataset:', eventCard.dataset);
                        console.error('? Event card HTML:', eventCard.outerHTML);
                        return;
                    }
                    
                    this.selectEvent(eventId);
                }
            });
        }

        // Back to events button - use event delegation since it's in a hidden section initially
        document.addEventListener('click', (e) => {
            const backButton = e.target.closest('#back-to-events');
            if (backButton) {
                window.debugLogger?.debug('RaceUI', 'Back to events button clicked');
                this.showEventSelection();
            }
        });
        
        window.debugLogger?.debug('RaceUI', 'RaceUI: Event listeners set up successfully');
    }

    /**
     * Bind context menu event listener for participant elements
     * This is called separately when race management interface is shown
     */
    bindContextMenuListener() {
        if (this.contextMenuBound) {
            return;
        }

        if (window.debugLogger) {
            window.debugLogger.debug('RaceUI', 'Binding context menu event listener');
        } else {
            window.debugLogger?.debug('RaceUI', 'RaceUI: Binding context menu event listener');
        }

        // Mark as bound
        this.contextMenuBound = true;

        // Right-click context menu for participants
        document.addEventListener('contextmenu', async (e) => {
            // Only intercept context menu if race management interface is visible
            const raceManagementSection = document.getElementById('race-management');
            if (!raceManagementSection || raceManagementSection.style.display === 'none') {
                window.debugLogger?.debug('RaceUI', 'RaceUI: Race management not visible, allowing default context menu');
                return;
            }

            window.debugLogger?.debug('RaceUI', 'RaceUI: contextmenu event triggered on:', e.target);
            window.debugLogger?.debug('RaceUI', 'RaceUI: Target element:', e.target.tagName, e.target.className, e.target.id);
            window.debugLogger?.debug('RaceUI', 'RaceUI: Target data attributes:', e.target.dataset);

            // Check if clicking on a participant element (clickable or info)
            const clickableElement = e.target.closest('.clickable-participant, .participant-info, .lane-participant, .participant-horizontal, .lane');

            if (clickableElement) {
                window.debugLogger?.debug('RaceUI', 'RaceUI: Found clickable element:', clickableElement);
                window.debugLogger?.debug('RaceUI', 'RaceUI: Element classes:', clickableElement.className);
                window.debugLogger?.debug('RaceUI', 'RaceUI: Element data attributes:', clickableElement.dataset);

                // Only show context menu if the element has the required data attributes
                const participantId = clickableElement.dataset.participantId;
                const heatId = clickableElement.dataset.heatId;

                window.debugLogger?.debug('RaceUI', 'RaceUI: participantId:', participantId, 'heatId:', heatId);

                if (participantId && heatId) {
                    window.debugLogger?.debug('RaceUI', 'RaceUI: Showing context menu and preventing default');
                    e.preventDefault();
                    e.stopPropagation();
                    await this.showParticipantContextMenu(e, clickableElement);
                    return;
                } else {
                    window.debugLogger?.debug('RaceUI', 'RaceUI: Missing participantId or heatId - cannot show context menu');
                    window.debugLogger?.debug('RaceUI', 'RaceUI: Available data attributes:', Object.keys(clickableElement.dataset));
                }
            }

            // Also check parent participant-horizontal or lane containers
            if (!clickableElement) {
                const participantElement = e.target.closest('.participant-horizontal, .lane');
                if (participantElement) {
                    window.debugLogger?.debug('RaceUI', 'RaceUI: Found parent participant element:', participantElement);
                    const innerClickable = participantElement.querySelector('.clickable-participant, .participant-info[data-participant-id], .lane-participant[data-participant-id]');
                    window.debugLogger?.debug('RaceUI', 'RaceUI: Looking for inner clickable elements...');

                    if (innerClickable) {
                        window.debugLogger?.debug('RaceUI', 'RaceUI: Found inner clickable:', innerClickable);
                        window.debugLogger?.debug('RaceUI', 'RaceUI: Inner element data:', innerClickable.dataset);

                        if (innerClickable.dataset.participantId && innerClickable.dataset.heatId) {
                            window.debugLogger?.debug('RaceUI', 'RaceUI: Showing context menu (from parent) and preventing default');
                            e.preventDefault();
                            e.stopPropagation();
                            await this.showParticipantContextMenu(e, innerClickable);
                            return;
                        }
                    }
                }
            }

            // If we get here, no participant element was found - let the default context menu show
            window.debugLogger?.debug('RaceUI', 'RaceUI: No participant element found, allowing default context menu');
        });

        // Complete event button - use event delegation since it's in a hidden section initially
        document.addEventListener('click', (e) => {
            const completeBtn = e.target.closest('#complete-event');
            if (completeBtn) {
                window.debugLogger?.debug('RaceUI', 'Complete event button clicked');
                this.manuallyCompleteEvent();
            }
        });


        // Initialize brackets button - use event delegation since it's in a hidden section initially
        document.addEventListener('click', (e) => {
            if (e.target.closest('#initialize-brackets')) {
                window.debugLogger?.debug('RaceUI', 'Initialize brackets button clicked');
                this.initializeBrackets();
            }

            if (e.target.closest('#repair-bracket')) {
                window.debugLogger?.debug('RaceUI', 'Repair bracket button clicked');
                this.repairCorruptedBracket(this.selectedEventId);
            }

            if (e.target.closest('#debug-rounds')) {
                window.debugLogger?.debug('RaceUI', 'Debug rounds button clicked');
                this.debugRoundInformation();
            }
        });

        // Generate next round buttons (both top and bottom)
        document.addEventListener('click', (e) => {
            if (e.target.closest('.generate-next-round-btn')) {
                this.generateNextRound();
            }
        });

        // Keyboard event listener for closing modals with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // Check if any modals are open and close them
                const analysisDialog = document.querySelector('.pairing-analysis-dialog');
                
                if (analysisDialog) {
                    this.closePairingAnalysisDialog();
                }
            }
        });
        
        // Scroll event listener for context-aware scroll anchor
        window.addEventListener('scroll', (e) => {
            this.handleScrollForAnchor();
        }, { passive: true });

        // Pairing statistics button
        document.addEventListener('click', async (e) => {
            if (e.target.classList.contains('show-pairing-stats-btn')) {
                await this.showFullPairingStats();
            }
        });

        // Delegate click on icon within the button
        document.addEventListener('click', async (e) => {
            const iconBtn = e.target.closest('.show-pairing-stats-btn');
            if (iconBtn) {
                await this.showFullPairingStats();
            }
        });

        // Result entry handling (legacy button-based)
        document.addEventListener('click', async (e) => {
            if (e.target.classList.contains('result-position')) {
                await this.handleResultClick(e.target);
            }
        });

        // Participant click handling (expanded to full box) - Minimal debouncing for race condition prevention
        document.addEventListener('click', (e) => {
            const participantElement = e.target.closest('.participant-horizontal, .lane');
            if (participantElement && participantElement.querySelector('.clickable-participant')) {
                const clickableElement = participantElement.querySelector('.clickable-participant');
                this.handleParticipantClickWithDebounce(clickableElement);
            }
        });

        // Heat management
        document.addEventListener('click', async (e) => {
            // Start heat button - use closest() to handle clicks on child elements
            const startBtn = e.target.closest('.start-heat-btn');
            if (startBtn) {
                window.debugLogger?.debug('RaceUI', 'RaceUI: Start heat button clicked, heatId:', startBtn.dataset.heatId);
                const heatId = startBtn.dataset.heatId;
                if (heatId) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.startHeat(heatId);
                }
                return;
            }

            // Complete heat button - use closest() to handle clicks on child elements (icons, etc.)
            const completeBtn = e.target.closest('.complete-heat-btn');
            if (completeBtn) {
                window.debugLogger?.debug('RaceUI', 'RaceUI: Complete heat button clicked, heatId:', completeBtn.dataset.heatId);
                const heatId = completeBtn.dataset.heatId;
                if (heatId) {
                    e.preventDefault();
                    e.stopPropagation();
                    await this.manualCompleteHeat(heatId);
                }
                return;
            }
            
            // Reset heat button - use closest() to handle clicks on child elements
            const resetBtn = e.target.closest('.reset-heat-btn');
            if (resetBtn) {
                window.debugLogger?.debug('RaceUI', 'RaceUI: Reset heat button clicked, heatId:', resetBtn.dataset.heatId);
                // Handle disabled reset buttons (show advanced options)
                if (resetBtn.disabled || resetBtn.classList.contains('disabled')) {
                    const heatId = resetBtn.dataset.heatId;
                    if (heatId) {
                        e.preventDefault();
                        e.stopPropagation();
                        await this.showAdvancedResetOptions(heatId);
                    }
                    return;
                }
                
                const heatId = resetBtn.dataset.heatId;
                if (heatId) {
                    e.preventDefault();
                    e.stopPropagation();
                    await this.resetHeat(heatId);
                }
            }
        });
    }

    /**
     * Load and display events with performance optimizations
     */
    async loadEvents() {
        try {
            if (window.debugLogger) {
                window.debugLogger.loading('RaceUI', 'Loading events with performance optimizations');
            } else {
                window.debugLogger?.debug('RaceUI', 'Loading events with performance optimizations...');
            }
            
            // Use performance monitoring if available
            if (window.performanceMonitor) {
                await window.performanceMonitor.trackOperation('race_events_load', async () => {
                    await this.loadEventsOptimized();
                });
            } else {
                await this.loadEventsOptimized();
            }
        } catch (error) {
            if (window.debugLogger) {
                window.debugLogger.error('RaceUI', 'Error loading events', error);
            } else {
                console.error('Error loading events:', error);
            }
            if (typeof window.showToast === 'function') {
                window.showToast('Error loading events', 'error');
            } else {
                if (window.debugLogger) {
                    window.debugLogger.error('RaceUI', 'Toast: Error loading events');
                } else {
                    console.error('Toast: Error loading events');
                }
            }
        }
    }

    /**
     * Optimized events loading implementation
     */
    async loadEventsOptimized() {
        const result = await this.dataManager.getEvents({}, 1, 1000);
        const events = result.events || result; // Handle both paginated and direct array responses
        
        if (window.debugLogger) {
            window.debugLogger.loading('RaceUI', `Events loaded: ${events.length}`);
        } else {
            window.debugLogger?.debug('RaceUI', 'Events loaded:', events.length);
        }
        
        const eventsGrid = document.getElementById('events-grid');
        
        if (!eventsGrid) {
            // This is expected on pages that don't have an events grid (like live display)
            return;
        }

        // Store events data for search/sort functionality
        if (typeof window.allRacesEventsData !== 'undefined') {
            window.allRacesEventsData = events;
            window.filteredRacesEventsData = [...events];
            
            // Apply initial sort
            if (typeof window.sortRacesEventsData === 'function') {
                window.sortRacesEventsData();
            }
            
            // Always use the modern rendering system if available
            if (typeof window.renderRacesEventsGrid === 'function') {
                window.renderRacesEventsGrid(window.filteredRacesEventsData);
            } else {
                this.renderEventsGrid(events);
            }
            
            // Update results count
            if (typeof window.updateRacesResultsCount === 'function') {
                window.updateRacesResultsCount();
            }
        } else {
            // Initialize global variables if they don't exist
            window.allRacesEventsData = events;
            window.filteredRacesEventsData = [...events];
            window.currentRacesSortOption = 'date-desc';
            window.currentRacesSearchTerm = '';
            window.currentRacesStatusFilter = '';
            window.currentRacesPage = 1;
            window.racesPerPage = 12;
            
            // Apply initial sort if function exists
            if (typeof window.sortRacesEventsData === 'function') {
                window.sortRacesEventsData();
            }
            
            // Always use the modern rendering system if available
            if (typeof window.renderRacesEventsGrid === 'function') {
                window.renderRacesEventsGrid(window.filteredRacesEventsData);
            } else {
                this.renderEventsGrid(events);
            }
            
            // Update results count
            if (typeof window.updateRacesResultsCount === 'function') {
                window.updateRacesResultsCount();
            }
        }
        
        // Fallback to original rendering if search/sort not available
        if (events.length === 0) {
            if (window.debugLogger) {
                window.debugLogger.loading('RaceUI', 'No events found, showing empty state');
            } else {
                window.debugLogger?.debug('RaceUI', 'No events found, showing empty state');
            }
            this.showEmptyEventsState(eventsGrid);
            return;
        }

        if (window.debugLogger) {
            window.debugLogger.loading('RaceUI', `Rendering ${events.length} event cards with optimization`);
        } else {
            window.debugLogger?.debug('RaceUI', 'Rendering', events.length, 'event cards with optimization');
        }
        
        // Use DocumentFragment for efficient DOM manipulation
        const fragment = document.createDocumentFragment();
        
        // Create event cards in batches to prevent UI blocking
        const batchSize = 10;
        for (let i = 0; i < events.length; i += batchSize) {
            const batch = events.slice(i, i + batchSize);
            
            batch.forEach(event => {
                const eventCard = this.createEventCardOptimized(event);
                fragment.appendChild(eventCard);
            });
            
            // Yield control to prevent blocking UI for large datasets
            if (i + batchSize < events.length) {
                await new Promise(resolve => setTimeout(resolve, 1));
            }
        }
        
        // Single DOM update
        eventsGrid.innerHTML = '';
        eventsGrid.appendChild(fragment);
        
        if (window.debugLogger) {
            window.debugLogger.success('RaceUI', `Rendered ${events.length} event cards efficiently`);
        } else {
            window.debugLogger?.debug('RaceUI', `? Rendered ${events.length} event cards efficiently`);
        }
    }

    /**
     * Render events grid (fallback method)
     */
    renderEventsGrid(events) {
        const eventsGrid = document.getElementById('events-grid');
        
        if (!eventsGrid) {
            return;
        }

        if (events.length === 0) {
            this.showEmptyEventsState(eventsGrid);
            return;
        }
        
        // Use the modern event rendering system if available
        if (typeof window.renderRacesEventsGrid === 'function') {
            // Store events data for search/sort functionality
            window.allRacesEventsData = events;
            window.filteredRacesEventsData = [...events];
            
            // Apply initial sort
            if (typeof window.sortRacesEventsData === 'function') {
                window.sortRacesEventsData();
            }
            
            // Render events grid with filtered data
            window.renderRacesEventsGrid(window.filteredRacesEventsData);
            
            // Update results count
            if (typeof window.updateRacesResultsCount === 'function') {
                window.updateRacesResultsCount();
            }
            return;
        }
        
        // Fallback to old rendering method if modern system not available
        const fragment = document.createDocumentFragment();
        
        events.forEach(event => {
            const eventCard = this.createEventCardOptimized(event);
            fragment.appendChild(eventCard);
        });
        
        // Single DOM update
        eventsGrid.innerHTML = '';
        eventsGrid.appendChild(fragment);
    }

    /**
     * Show empty events state efficiently
     */
    showEmptyEventsState(container) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        
        const icon = document.createElement('div');
        icon.className = 'empty-icon';
        icon.innerHTML = '<i class="fas fa-calendar-plus"></i>';
        
        const title = document.createElement('h3');
        title.textContent = 'No Events Available';
        
        const description = document.createElement('p');
        description.textContent = 'Create an event first to manage races.';
        
        const createButton = document.createElement('a');
        createButton.href = 'events.html';
        createButton.className = 'btn btn-primary';
        createButton.innerHTML = '<i class="fas fa-plus"></i> Create Event';
        
        emptyState.appendChild(icon);
        emptyState.appendChild(title);
        emptyState.appendChild(description);
        emptyState.appendChild(createButton);
        
        container.innerHTML = '';
        container.appendChild(emptyState);
    }

    /**
     * Create event card DOM element with performance optimization
     */
    createEventCardOptimized(event) {
        const participantCount = event.participants ? event.participants.length : 0;
        const statusClass = this.getEventStatusClass(event);
        const statusText = this.getEventStatusText(event);
        
        // Create main card element
        const card = document.createElement('div');
        card.className = `event-card ${statusClass}`;
        card.dataset.eventId = event.id;
        
        // Create header
        const header = document.createElement('div');
        header.className = 'event-header';
        
        const title = document.createElement('h3');
        title.textContent = event.name;
        
        const status = document.createElement('span');
        status.className = `event-status ${statusClass}`;
        status.textContent = statusText;
        
        header.appendChild(title);
        header.appendChild(status);
        
        // Create details section efficiently
        const details = document.createElement('div');
        details.className = 'event-details';
        
        const detailsData = [
            { icon: 'fas fa-calendar', text: new Date(event.date).toLocaleDateString() },
            { icon: 'fas fa-map-marker-alt', text: event.location },
            { icon: 'fas fa-users', text: `${participantCount} Participants` },
            { icon: 'fas fa-road', text: `${event.numberOfTracks} Lanes` },
            { icon: 'fas fa-trophy', text: `${event.eliminationType} Elimination` }
        ];
        
        // Use document fragment for details
        const detailsFragment = document.createDocumentFragment();
        detailsData.forEach(detail => {
            const row = document.createElement('div');
            row.className = 'detail-row';
            
            const icon = document.createElement('i');
            icon.className = detail.icon;
            
            const text = document.createElement('span');
            text.textContent = detail.text;
            
            row.appendChild(icon);
            row.appendChild(text);
            detailsFragment.appendChild(row);
        });
        
        details.appendChild(detailsFragment);
        
        // Create actions section
        const actions = document.createElement('div');
        actions.className = 'event-actions';
        
        const manageButton = document.createElement('button');
        manageButton.className = 'btn btn-primary';
        manageButton.innerHTML = '<i class="fas fa-flag-checkered"></i> Manage Races';
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'btn btn-sm btn-danger';
        deleteButton.title = 'Delete Event';
        deleteButton.onclick = () => deleteEventFromRacePage(event.id);
        deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
        
        actions.appendChild(manageButton);
        actions.appendChild(deleteButton);
        
        // Assemble card
        card.appendChild(header);
        card.appendChild(details);
        card.appendChild(actions);
        
        return card;
    }

    /**
     * Update event information display with performance optimization
     */
    updateEventInfo(event) {
        const eventNameEl = document.getElementById('selected-event-name');
        const eventDetailsEl = document.getElementById('selected-event-details');
        
        if (eventNameEl) {
            eventNameEl.textContent = event.name;
        }
        
        if (eventDetailsEl) {
            // Use DocumentFragment instead of innerHTML
            const fragment = document.createDocumentFragment();
            
            const detailsData = [
                { icon: 'fas fa-calendar', text: new Date(event.date).toLocaleDateString() },
                { icon: 'fas fa-map-marker-alt', text: event.location },
                { icon: 'fas fa-road', text: `${event.numberOfTracks} Lanes` },
                { icon: 'fas fa-trophy', text: `${event.eliminationType} Elimination` }
            ];
            
            detailsData.forEach((detail, index) => {
                if (index > 0) {
                    // Add spacing between items
                    const spacer = document.createTextNode(' ');
                    fragment.appendChild(spacer);
                }
                
                const icon = document.createElement('i');
                icon.className = detail.icon;
                
                const text = document.createTextNode(` ${detail.text}`);
                
                fragment.appendChild(icon);
                fragment.appendChild(text);
            });
            
            // Single DOM update
            eventDetailsEl.innerHTML = '';
            eventDetailsEl.appendChild(fragment);
        }
    }

    /**
     * Get event status class
     */
    getEventStatusClass(event) {
        // Trust persisted status first (upcoming, active, completed)
        if (event && typeof event.status === 'string') {
            return event.status.toLowerCase();
        }

        // Fallback to date-based heuristic only if status is missing
        const now = new Date();
        const eventDate = new Date(event.date);
        if (eventDate < now) return 'completed';
        if (eventDate.toDateString() === now.toDateString()) return 'active';
        return 'upcoming';
    }

    /**
     * Get event status text
     */
    getEventStatusText(event) {
        const statusClass = this.getEventStatusClass(event);
        return {
            'completed': 'Completed',
            'active': 'Active',
            'upcoming': 'Upcoming'
        }[statusClass] || 'Unknown';
    }

    /**
     * Select an event for race management
     */
    async selectEvent(eventId) {
        window.debugLogger?.debug('RaceUI', 'RaceUI.selectEvent called with eventId:', eventId);

        try {
            // Check if eventId is valid
            if (!eventId || eventId === 'undefined' || eventId === 'null') {
                console.error('? Invalid eventId provided:', eventId);
                throw new Error('Invalid event ID provided');
            }

            // Check if dataManager is available
            if (!this.dataManager) {
                console.error('? DataManager not available in RaceUI');
                throw new Error('DataManager not available');
            }

            // ?? FIX: Force refresh event data to ensure we have the latest classOrder
            window.debugLogger?.debug('RaceUI', 'Force refreshing event data in selectEvent...');
            this.dataManager.loadedDataTypes.delete('events');
            await this.dataManager.loadFromStorage(['events']);

            this.selectedEventId = eventId;
            const event = this.dataManager.getEvent(eventId);

            if (!event) {
                console.error(`? Event ${eventId} not found in DataManager`);
                throw new Error('Event not found');
            }

            window.debugLogger?.debug('RaceUI', 'Event data loaded:', {
                id: event.id,
                name: event.name,
                classOrder: event.classOrder,
                classSettings: event.classSettings?.length || 0
            });

            // Update UI
        this.showRaceManagement();
        this.updateEventInfo(event);
        await this.updateEventStats(event);
        this.updateCompleteEventButton();

            // Load bracket if exists
            const bracket = await this.raceManager.getBracket(eventId);
            if (bracket) {
                await this.renderBrackets(bracket);
                this.updateGenerateButton(bracket);
            } else {
                this.showBracketInitialization();
            }

            // Save session state
            window.SessionPersistence?.Races?.save?.(eventId);

        } catch (error) {
            console.error('Error selecting event:', error);
            if (typeof window.showToast === 'function') {
                window.showToast('Error loading event', 'error');
            } else {
                console.error('Toast: Error loading event');
            }
        }
    }

    /**
     * Show event selection
     */
    showEventSelection() {
        document.getElementById('event-selection').style.display = 'block';
        document.getElementById('race-management').style.display = 'none';
        this.selectedEventId = null;
        
        // Remove top tabs when going back to event selection
        if (window.sidebarNav) {
            window.sidebarNav.removeTopTabs();
        }
        
        // Use modern rendering system if available, otherwise fall back to loadEvents
        if (typeof window.renderRacesEventsGrid === 'function' && 
            typeof window.allRacesEventsData !== 'undefined') {
            window.debugLogger?.debug('RaceUI', 'Using modern rendering system for event selection');
            
            // Refresh events data and re-render with modern interface
            this.refreshEventsForModernInterface();
        } else {
            window.debugLogger?.debug('RaceUI', 'Using fallback rendering system for event selection');
            // Refresh events list to show any changes made on other pages
            this.loadEvents();
        }
    }

    /**
     * Refresh events data and render with modern interface
     */
    async refreshEventsForModernInterface() {
        try {
            // Reload fresh event data
            const result = await this.dataManager.getEvents({}, 1, 1000);
            const events = result.events || result;
            
            // Update global data arrays
            window.allRacesEventsData = events;
            window.filteredRacesEventsData = [...events];
            
            // Reset to first page
            window.currentRacesPage = 1;
            
            // Apply current sort if function exists
            if (typeof window.sortRacesEventsData === 'function') {
                window.sortRacesEventsData();
            }
            
            // Render with modern interface
            window.renderRacesEventsGrid(window.filteredRacesEventsData);
            
            // Update results count if function exists
            if (typeof window.updateRacesResultsCount === 'function') {
                window.updateRacesResultsCount();
            }
            
            window.debugLogger?.debug('RaceUI', 'Events refreshed with modern interface');
        } catch (error) {
            console.error('Error refreshing events with modern interface:', error);
            // Fallback to old method
            this.loadEvents();
        }
    }

    /**
     * Show race management interface
     */
    showRaceManagement() {
        document.getElementById('event-selection').style.display = 'none';
        document.getElementById('race-management').style.display = 'block';

        // Show/hide complete event button based on current event status
        this.updateCompleteEventButton();

        // Ensure context menu event listener is attached when race management is shown
        this.bindContextMenuListener();
    }

    /**
     * Update event statistics
     */
    async updateEventStats(event) {
        const statsContainer = document.getElementById('event-stats');
        if (!statsContainer) return;

        // Get proper participant statistics from data manager
        const participantStats = this.dataManager.getEventParticipantStats(event.id);
        const participantCount = participantStats ? participantStats.uniqueDrivers : 0;

        const bracket = await this.raceManager.getBracket(event.id);
        const stats = bracket ? await this.raceManager.getTournamentStats(event.id) : null;

        statsContainer.innerHTML = `
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-users"></i>
                </div>
                <div class="stat-content">
                    <div class="stat-value">${participantCount}</div>
                    <div class="stat-label">Participants</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-layer-group"></i>
                </div>
                <div class="stat-content">
                    <div class="stat-value">${stats ? stats.totalClasses : 0}</div>
                    <div class="stat-label">Classes</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-flag-checkered"></i>
                </div>
                <div class="stat-content">
                    <div class="stat-value">${stats ? stats.completedRaces : 0}</div>
                    <div class="stat-label">Completed</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-clock"></i>
                </div>
                <div class="stat-content">
                    <div class="stat-value">${stats ? stats.pendingRaces : 0}</div>
                    <div class="stat-label">Pending</div>
                </div>
            </div>
        `;
        
        // Add pairing statistics button if brackets are initialized
        if (bracket) {
            statsContainer.innerHTML += `
                <div style="grid-column: 1 / -1; text-align: center; margin-top: 1rem;">
                    <button class="btn btn-outline show-pairing-stats-btn">
                        <i class="fas fa-chart-bar"></i>
                        View Pairing Statistics
                    </button>
                </div>
            `;
        }
    }







    /**
     * Show bracket initialization interface
     */
    showBracketInitialization() {
        const bracketsContainer = document.getElementById('brackets-container');
        if (!bracketsContainer) return;

        const event = this.dataManager.getEvent(this.selectedEventId);
        const participantCount = event.participants ? event.participants.length : 0;

        bracketsContainer.innerHTML = `
            <div class="bracket-initialization">
                <div class="init-icon">
                    <i class="fas fa-rocket"></i>
                </div>
                <h3>Initialize Tournament Brackets</h3>
                <p>Set up tournament brackets for all registered participants.</p>
                <div class="init-stats">
                    <div class="init-stat">
                        <strong>${participantCount}</strong>
                        <span>Participants</span>
                    </div>
                    <div class="init-stat">
                        <strong>${event.numberOfTracks}</strong>
                        <span>Lanes</span>
                    </div>
                    <div class="init-stat">
                        <strong>${event.eliminationType}</strong>
                        <span>Elimination</span>
                    </div>
                </div>
                ${participantCount > 0 ? `
                    <button class="btn btn-primary btn-lg" onclick="raceUI.initializeBrackets()">
                        <i class="fas fa-rocket"></i>
                        Initialize Brackets
                    </button>
                    <button class="btn btn-warning btn-lg" onclick="raceUI.repairBracketDuplicates()" style="margin-left: 10px;">
                        <i class="fas fa-wrench"></i>
                        Repair Duplicates
                    </button>
                ` : `
                    <p class="warning">
                        <i class="fas fa-exclamation-triangle"></i>
                        No participants registered for this event.
                    </p>
                    <a href="registration.html" class="btn btn-secondary">
                        <i class="fas fa-user-plus"></i>
                        Register Participants
                    </a>
                `}
            </div>
        `;

        // Hide generate next round button
        const generateBtn = document.getElementById('generate-next-round');
        if (generateBtn) {
            generateBtn.style.display = 'none';
        }
    }

    /**
     * Initialize brackets for the selected event with performance monitoring
     */
    async initializeBrackets() {
        window.debugLogger?.debug('RaceUI', 'Initializing brackets for event:', this.selectedEventId);
        
        try {
            // Check if event can have brackets initialized
            const currentEvent = this.dataManager.getEvent(this.selectedEventId);
            if (!currentEvent) {
                this.showToast('Event not found', 'error');
                return;
            }
            
            // Block completed/finished events
            if (currentEvent.status === 'completed' || currentEvent.status === 'finished') {
                this.showToast(`Event is already ${currentEvent.status} and cannot be re-initialized`, 'warning');
                return;
            }
            
            // Check if active event already has races
            if (currentEvent.status === 'active') {
                const existingBracket = await this.dataManager.getRaceBracket(this.selectedEventId);
                const hasExistingRaces = existingBracket && existingBracket.classes && 
                    Object.values(existingBracket.classes).some(classBracket => 
                        classBracket.rounds && classBracket.rounds.length > 0
                    );
                
                if (hasExistingRaces) {
                    this.showToast('Event is active and already has races. Brackets cannot be initialized again.', 'warning');
                    return;
                }
                // Allow initialization for active events without races
                window.debugLogger?.debug('RaceUI', 'Active event without races - allowing bracket initialization');
            }

            // ?? FIX: Force refresh event data to get latest classOrder
            window.debugLogger?.debug('RaceUI', 'Force refreshing event data to get latest classOrder...');
            this.dataManager.loadedDataTypes.delete('events');
            await this.dataManager.loadFromStorage(['events']);
            
            // Get event info for performance warnings (now with fresh data)
            const event = this.dataManager.getEvent(this.selectedEventId);
            if (!event) {
                throw new Error('Event not found after refresh');
            }
            
            window.debugLogger?.debug('RaceUI', 'Event data after refresh:', {
                id: event.id,
                name: event.name,
                classOrder: event.classOrder,
                classSettings: event.classSettings?.length || 0
            });
            
            const participantCount = event.participants ? event.participants.length : 0;
            
            // Show performance warning for large datasets
            if (participantCount > 100) {
                this.showPerformanceWarning('initialization', participantCount);
            }
            
            // Show loading state
            this.showInitializationProgress(participantCount);
            this.disableGenerationButtons();
            
            // ?? FIX: Ensure participants are loaded before initializing brackets
            window.debugLogger?.debug('RaceUI', 'Ensuring participants are loaded...');
            // Force reload participants to get fresh data from server
            this.dataManager.loadedDataTypes.delete('participants');
            await this.dataManager.loadFromStorage(['participants']);
            
            // Initialize with performance monitoring
            let bracket;
            if (window.performanceMonitor) {
                bracket = await window.performanceMonitor.trackOperation('bracket_initialization', async () => {
                    return await this.raceManager.initializeBrackets(this.selectedEventId);
                });
            } else {
                bracket = await this.raceManager.initializeBrackets(this.selectedEventId);
            }
            
            if (bracket) {
                await this.renderBracketsOptimized(bracket);
                this.updateGenerateButton(bracket);
                
                // Show success with performance stats
                const perfStats = window.performanceMonitor ? 
                    window.performanceMonitor.getLastOperationStats() : null;
                const timeStr = perfStats ? ` (${perfStats.duration}ms)` : '';
                this.showToast(`Brackets initialized successfully${timeStr}!`, 'success');
            }
            
        } catch (error) {
            console.error('Error initializing brackets:', error);
            this.showToast(`${error.message || 'Error initializing brackets'}`, 'error');
        } finally {
            this.hideInitializationProgress();
            this.enableGenerationButtons();
        }
    }

    /**
     * Show initialization progress
     */
    showInitializationProgress(participantCount) {
        const progressHtml = `
            <div class="initialization-progress-overlay" id="initialization-progress-overlay">
                <div class="initialization-progress-modal">
                    <div class="progress-header">
                        <i class="fas fa-rocket fa-spin"></i>
                        <h3>Initializing Tournament Brackets</h3>
                        <p>Setting up races for ${participantCount} participants...</p>
                    </div>
                    <div class="progress-body">
                        <div class="progress-spinner">
                            <div class="spinner"></div>
                        </div>
                        <div class="progress-text">
                            Creating bracket structure and pairing participants...
                        </div>
                        ${participantCount > 50 ? `
                            <div class="progress-warning">
                                <i class="fas fa-info-circle"></i>
                                Processing ${participantCount} participants. This may take a moment...
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', progressHtml);
        this.addProgressStyles();
    }

    /**
     * Hide initialization progress
     */
    hideInitializationProgress() {
        const overlay = document.getElementById('initialization-progress-overlay');
        if (overlay) {
            overlay.remove();
        }
    }

    /**
     * Show performance warning for large datasets
     */
    showPerformanceWarning(operation, participantCount) {
        const warningMessages = {
            initialization: `Large tournament detected with ${participantCount} participants. Initial setup may take longer.`,
            generation: `Generating races for ${participantCount} participants. This may take several seconds.`
        };
        
        const warningHtml = `
            <div class="performance-warning-toast" id="performance-warning-toast">
                <div class="warning-content">
                    <div class="warning-icon">
                        <i class="fas fa-clock"></i>
                    </div>
                    <div class="warning-text">
                        <strong>Performance Notice</strong><br>
                        ${warningMessages[operation] || 'Large dataset processing may take longer than usual.'}
                    </div>
                    <button class="warning-close" onclick="this.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', warningHtml);
        
        // Auto-remove after 8 seconds
        setTimeout(() => {
            const warning = document.getElementById('performance-warning-toast');
            if (warning) {
                warning.remove();
            }
        }, 8000);
        
        // Add warning styles
        this.addWarningStyles();
    }

    /**
     * Add warning toast styles
     */
    addWarningStyles() {
        if (document.getElementById('performance-warning-styles')) return;
        
        const styles = document.createElement('style');
        styles.id = 'performance-warning-styles';
        styles.textContent = `
            .performance-warning-toast {
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, #f59e0b, #d97706);
                color: white;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
                z-index: 9999;
                animation: slideInRight 0.3s ease-out;
                max-width: 400px;
            }
            
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            .warning-content {
                display: flex;
                align-items: flex-start;
                padding: 1rem;
                gap: 0.75rem;
            }
            
            .warning-icon {
                font-size: 1.25rem;
                margin-top: 0.125rem;
            }
            
            .warning-text {
                flex: 1;
                font-size: 0.875rem;
                line-height: 1.4;
            }
            
            .warning-close {
                background: none;
                border: none;
                color: white;
                font-size: 1rem;
                cursor: pointer;
                padding: 0.25rem;
                border-radius: 4px;
                transition: background-color 0.2s;
            }
            
            .warning-close:hover {
                background: rgba(255, 255, 255, 0.2);
            }
            
            .spinner {
                width: 40px;
                height: 40px;
                border: 4px solid var(--bg-secondary);
                border-top: 4px solid var(--accent-primary);
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 0 auto;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            .progress-spinner {
                text-align: center;
                margin: 1rem 0;
            }
        `;
        
        document.head.appendChild(styles);
    }

    /**
     * Generate next round for all classes with loading states and progress tracking
     */
    async generateNextRound() {
        window.debugLogger?.debug('RaceUI', 'Generating next round for event:', this.selectedEventId);

        try {
            const bracket = await this.raceManager.getBracket(this.selectedEventId);
            if (!bracket) {
                throw new Error('No bracket found');
            }

            // Get classes that can advance
            const classesToGenerate = Object.keys(bracket.classes).filter(className => 
                this.raceManager.canGenerateNextRound(this.selectedEventId, className, bracket)
            );

            if (classesToGenerate.length === 0) {
                this.showToast('No classes ready for next round', 'warning');
                return;
            }

            // Show loading state with progress
            this.showGenerationProgress(classesToGenerate.length);
            
            // Disable generation buttons during processing
            this.disableGenerationButtons();

            let generatedAny = false;
            let currentClassIndex = 0;
            
            // Generate next round for each class with progress updates
            for (const className of classesToGenerate) {
                try {
                    // Update progress
                    this.updateGenerationProgress(currentClassIndex, classesToGenerate.length, className);
                    
                    // Generate round with performance monitoring
                    if (window.performanceMonitor) {
                        await window.performanceMonitor.trackOperation(`generate_round_${className}`, async () => {
                            await this.raceManager.generateNextRound(this.selectedEventId, className);
                        });
                    } else {
                        await this.raceManager.generateNextRound(this.selectedEventId, className);
                    }
                    
                    generatedAny = true;
                    currentClassIndex++;
                    
                    // Add small delay to prevent UI blocking
                    await new Promise(resolve => setTimeout(resolve, 50));
                    
                } catch (classError) {
                    console.error(`Error generating round for class ${className}:`, classError);
                    this.showToast(`Error in class ${className}: ${classError.message}`, 'warning');
                    currentClassIndex++;
                }
            }

            // Hide loading state
            this.hideGenerationProgress();
            
            // Re-enable buttons
            this.enableGenerationButtons();

            if (generatedAny) {
                // Update UI
                const updatedBracket = await this.raceManager.getBracket(this.selectedEventId);
                await this.renderBracketsOptimized(updatedBracket);
                this.updateGenerateButton(updatedBracket);
                
                // Show success with performance stats
                const perfStats = window.performanceMonitor ? 
                    window.performanceMonitor.getLastOperationStats() : null;
                const timeStr = perfStats ? ` (${perfStats.duration}ms)` : '';
                this.showToast(`Next round generated for ${currentClassIndex} classes${timeStr}!`, 'success');
            } else {
                this.showToast('Failed to generate rounds for any class', 'error');
            }
            
        } catch (error) {
            console.error('Error generating next round:', error);
            this.showToast(`Error generating next round: ${error.message}`, 'error');
            
            // Ensure UI is cleaned up on error
            this.hideGenerationProgress();
            this.enableGenerationButtons();
        }
    }

    /**
     * Update generate next round button visibility
     */
    updateGenerateButton(bracket) {
        const generateBtns = document.querySelectorAll('.generate-next-round-btn');
        const repairBtn = document.getElementById('repair-bracket');

        // Check if any class can generate next round
        let canGenerate = false;
        if (bracket && bracket.classes && typeof bracket.classes === 'object') {
            for (const className of Object.keys(bracket.classes)) {
                if (this.raceManager.canGenerateNextRound(this.selectedEventId, className, bracket)) {
                    canGenerate = true;
                    break;
                }
            }
        }

        // Check for duplicates in the bracket
        const validationResult = this.validateNoDuplicateParticipants(bracket, []);
        const hasDuplicates = !validationResult.isValid;

        // Show repair button if there are duplicates, otherwise show generate button
        const debugBtn = document.getElementById('debug-rounds');
        if (hasDuplicates) {
            window.debugLogger?.debug('RaceUI', 'Bracket has duplicates - showing repair button');
            generateBtns.forEach(generateBtn => {
                generateBtn.style.display = 'none';
            });
            if (repairBtn) repairBtn.style.display = 'inline-block';
            if (debugBtn) debugBtn.style.display = 'none';
        } else {
            generateBtns.forEach(generateBtn => {
                generateBtn.style.display = canGenerate ? 'inline-block' : 'none';
            });
            if (repairBtn) repairBtn.style.display = 'none';
            // Show debug button for troubleshooting round issues
            if (debugBtn) debugBtn.style.display = 'inline-block';
        }
    }

    /**
     * Show generation progress with loading indicator
     */
    showGenerationProgress(totalClasses) {
        // Remove any existing progress indicators
        this.hideGenerationProgress();
        
        const progressHtml = `
            <div class="generation-progress-overlay" id="generation-progress-overlay">
                <div class="generation-progress-modal">
                    <div class="progress-header">
                        <i class="fas fa-cog fa-spin"></i>
                        <h3>Generating Next Round</h3>
                        <p>Processing race brackets and updating statistics...</p>
                    </div>
                    <div class="progress-body">
                        <div class="progress-bar-container">
                            <div class="progress-bar" id="generation-progress-bar"></div>
                        </div>
                        <div class="progress-text" id="generation-progress-text">
                            Preparing to generate rounds for ${totalClasses} class${totalClasses > 1 ? 'es' : ''}...
                        </div>
                        <div class="progress-details" id="generation-progress-details">
                            <div class="progress-warning">
                                <i class="fas fa-info-circle"></i>
                                Large datasets may take longer to process. Please wait...
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', progressHtml);
        
        // Add styles if not already present
        this.addProgressStyles();
    }

    /**
     * Update generation progress
     */
    updateGenerationProgress(currentIndex, totalClasses, currentClassName) {
        const progressBar = document.getElementById('generation-progress-bar');
        const progressText = document.getElementById('generation-progress-text');
        const progressDetails = document.getElementById('generation-progress-details');
        
        if (!progressBar) return;
        
        const percentage = Math.round((currentIndex / totalClasses) * 100);
        progressBar.style.width = `${percentage}%`;
        
        if (progressText) {
            progressText.textContent = `Processing class "${currentClassName}" (${currentIndex + 1}/${totalClasses})`;
        }
        
        if (progressDetails && currentIndex > 0) {
            const estimatedTimePerClass = 2000; // Rough estimate in ms
            const remainingTime = (totalClasses - currentIndex) * estimatedTimePerClass;
            const timeStr = remainingTime > 5000 ? 
                `~${Math.ceil(remainingTime / 1000)}s remaining` : 
                'Almost done...';
                
            progressDetails.innerHTML = `
                <div class="progress-stats">
                    <span><i class="fas fa-clock"></i> ${timeStr}</span>
                    <span><i class="fas fa-check"></i> ${currentIndex} completed</span>
                </div>
            `;
        }
    }

    /**
     * Hide generation progress
     */
    hideGenerationProgress() {
        const overlay = document.getElementById('generation-progress-overlay');
        if (overlay) {
            overlay.remove();
        }
    }

    /**
     * Disable generation buttons during processing
     */
    disableGenerationButtons() {
        const generateBtns = document.querySelectorAll('.generate-next-round-btn, #initialize-brackets');
        generateBtns.forEach(btn => {
            btn.disabled = true;
            btn.classList.add('btn-disabled');
            if (btn.innerHTML.includes('Generate Next Round')) {
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
            } else if (btn.innerHTML.includes('Initialize Brackets')) {
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Initializing...';
            }
        });
    }

    /**
     * Re-enable generation buttons after processing
     */
    enableGenerationButtons() {
        const generateBtns = document.querySelectorAll('.generate-next-round-btn, #initialize-brackets');
        generateBtns.forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('btn-disabled');
            if (btn.innerHTML.includes('Generating...')) {
                btn.innerHTML = '<i class="fas fa-forward"></i> Generate Next Round';
            } else if (btn.innerHTML.includes('Initializing...')) {
                btn.innerHTML = '<i class="fas fa-rocket"></i> Initialize Brackets';
            }
        });
    }

    /**
     * Add progress indicator styles
     */
    addProgressStyles() {
        if (document.getElementById('generation-progress-styles')) return;
        
        const styles = document.createElement('style');
        styles.id = 'generation-progress-styles';
        styles.textContent = `
            .generation-progress-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                backdrop-filter: blur(3px);
            }
            
            .generation-progress-modal {
                background: var(--bg-primary);
                border-radius: 12px;
                padding: 2rem;
                max-width: 500px;
                width: 90%;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                border: 1px solid var(--border-color);
                animation: fadeInScale 0.3s ease-out;
            }
            
            @keyframes fadeInScale {
                from {
                    opacity: 0;
                    transform: scale(0.9) translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: scale(1) translateY(0);
                }
            }
            
            .progress-header {
                text-align: center;
                margin-bottom: 2rem;
            }
            
            .progress-header i {
                font-size: 2rem;
                color: var(--accent-primary);
                margin-bottom: 1rem;
            }
            
            .progress-header h3 {
                color: var(--text-primary);
                margin: 0 0 0.5rem 0;
                font-size: 1.5rem;
            }
            
            .progress-header p {
                color: var(--text-secondary);
                margin: 0;
                font-size: 0.9rem;
            }
            
            .progress-bar-container {
                width: 100%;
                height: 8px;
                background: var(--bg-secondary);
                border-radius: 4px;
                overflow: hidden;
                margin-bottom: 1rem;
            }
            
            .progress-bar {
                height: 100%;
                background: linear-gradient(90deg, var(--accent-primary), #10b981);
                border-radius: 4px;
                width: 0%;
                transition: width 0.5s ease;
                position: relative;
            }
            
            .progress-bar::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(
                    90deg,
                    transparent,
                    rgba(255, 255, 255, 0.3),
                    transparent
                );
                animation: shimmer 1.5s infinite;
            }
            
            @keyframes shimmer {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }
            
            .progress-text {
                color: var(--text-primary);
                font-weight: 500;
                margin-bottom: 1rem;
                text-align: center;
            }
            
            .progress-details {
                border-top: 1px solid var(--border-color);
                padding-top: 1rem;
                font-size: 0.85rem;
            }
            
            .progress-warning {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                color: var(--text-secondary);
                background: var(--bg-secondary);
                padding: 0.75rem;
                border-radius: 6px;
                margin-bottom: 0.5rem;
            }
            
            .progress-warning i {
                color: #f59e0b;
            }
            
            .progress-stats {
                display: flex;
                justify-content: space-between;
                color: var(--text-secondary);
            }
            
            .progress-stats span {
                display: flex;
                align-items: center;
                gap: 0.25rem;
            }
            
            .btn-disabled {
                opacity: 0.6 !important;
                cursor: not-allowed !important;
                pointer-events: none !important;
            }
        `;
        
        document.head.appendChild(styles);
    }

    /**
     * Optimized bracket rendering with performance monitoring
     */
    async renderBracketsOptimized(bracket) {
        if (window.performanceMonitor) {
            return await window.performanceMonitor.trackOperation('render_brackets_optimized', async () => {
                return this.renderBrackets(bracket);
            });
        } else {
            return this.renderBrackets(bracket);
        }
    }

    /**
     * Restore pending results from incomplete heats to enable result selection functionality
     * Optimized to preserve existing pending results if they exist locally
     */
    restorePendingResultsFromHeats(bracket) {
        window.debugLogger?.debug('RaceUI', 'Restoring pending results from incomplete heats...');
        window.debugLogger?.debug('RaceUI', 'Bracket data:', { hasBracket: !!bracket, hasClasses: !!(bracket && bracket.classes), classKeys: bracket?.classes ? Object.keys(bracket.classes) : [] });

        // DO NOT clear pending results blindly - merge them instead
        // this.pendingResults.clear(); 

        if (!bracket || !bracket.classes) {
            window.debugLogger?.debug('RaceUI', 'No bracket or classes found, skipping restoration');
            return;
        }

        // Iterate through all classes and rounds to find incomplete heats
        Object.values(bracket.classes).forEach(classBracket => {
            if (!classBracket.rounds) return;

            classBracket.rounds.forEach(round => {
                if (!round.heats) return;

                round.heats.forEach(heat => {
                    // Only restore results for active heats (not completed)
                    // AND only if we don't already have pending results for this heat locally
                    if (heat.status === 'active' && heat.results && heat.results.length > 0) {
                        if (!this.pendingResults.has(heat.id)) {
                            window.debugLogger?.debug('RaceUI', `Restoring pending results for active heat ${heat.id} with ${heat.results.length} results`);

                            // Create pending results from existing heat results
                            const pendingResults = heat.results.map(result => ({
                                participantId: result.participantId,
                                position: result.position,
                                timestamp: result.timestamp || new Date().toISOString()
                            }));

                            this.pendingResults.set(heat.id, pendingResults);
                            window.debugLogger?.debug('RaceUI', `Set pending results for heat ${heat.id}:`, pendingResults);
                        } else {
                            window.debugLogger?.debug('RaceUI', `Skipping restore for heat ${heat.id} - local pending results exist`);
                        }
                    }
                });
            });
        });

        window.debugLogger?.debug('RaceUI', `Pending results managed for ${this.pendingResults.size} heats`);
    }

    /**
     * Render tournament brackets
     */
    async renderBrackets(bracket) {
        window.debugLogger?.debug('RaceUI', 'Rendering brackets...', bracket);
        const bracketsContainer = document.getElementById('brackets-container');
        if (!bracketsContainer) {
            window.debugLogger?.debug('RaceUI', 'Brackets container not found');
            return;
        }

        if (!bracket || !bracket.classes || Object.keys(bracket.classes).length === 0) {
            window.debugLogger?.debug('RaceUI', 'No bracket data, showing initialization');
            this.showBracketInitialization();
            return;
        }

        window.debugLogger?.debug('RaceUI', 'Rendering brackets for classes:', Object.keys(bracket.classes));

        // Restore pending results for incomplete heats to enable result selection
        this.restorePendingResultsFromHeats(bracket);

        // Organize heats by round number across all classes (now async)
        const roundsData = await this.organizeHeatsByRound(bracket);
        
        // View mode toggle (list vs tree)
        const viewMode = this._bracketViewMode || 'list';
        let html = `
            <div class="bracket-view-toggle" style="display:flex;gap:0.5rem;justify-content:flex-end;margin-bottom:1rem;">
                <button class="btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}" onclick="window.raceUI.setBracketViewMode('list')">
                    <i class="fas fa-list"></i> List View
                </button>
                <button class="btn btn-sm ${viewMode === 'tree' ? 'btn-primary' : 'btn-secondary'}" onclick="window.raceUI.setBracketViewMode('tree')">
                    <i class="fas fa-project-diagram"></i> Tree View
                </button>
            </div>
        `;

        if (viewMode === 'tree') {
            // SVG bracket tree mode
            html += '<div id="bracket-tree-container"></div>';
            html += this.renderGenerateNextRoundButton(bracket);
            bracketsContainer.innerHTML = html;

            // Render SVG trees per class
            const treeContainer = document.getElementById('bracket-tree-container');
            if (treeContainer && window.BracketTreeRenderer) {
                const renderer = new window.BracketTreeRenderer(treeContainer);
                let treeSvg = '';
                for (const [className, classBracket] of Object.entries(bracket.classes)) {
                    const tempDiv = document.createElement('div');
                    tempDiv.style.marginBottom = '2rem';
                    const classRenderer = new window.BracketTreeRenderer(tempDiv);
                    classRenderer.render(classBracket, className);
                    treeSvg += `<div style="margin-bottom:2rem;overflow-x:auto;">${tempDiv.innerHTML}</div>`;
                }
                treeContainer.innerHTML = treeSvg;
            }
        } else {
            // Default list view
            roundsData.forEach(roundData => {
                html += this.renderRoundAcrossClasses(roundData);
            });
            html += this.renderGenerateNextRoundButton(bracket);
            bracketsContainer.innerHTML = html;
        }
        window.debugLogger?.debug('RaceUI', 'Brackets rendered successfully');
        
        // Update heat count tracking
        this.lastKnownHeatCount = this.getCurrentHeatCount();
        
        // Update scroll anchor tracking after rendering
        this.updateScrollAnchor();
    }

    /**
     * Organize heats by round number across all classes, respecting class order
     */
    async organizeHeatsByRound(bracket) {
        const roundsMap = new Map();
        
        // ?? FIX: Force refresh event data to get latest classOrder for rendering
        window.debugLogger?.debug('RaceUI', 'Force refreshing event data for bracket rendering...');
        this.dataManager.loadedDataTypes.delete('events');
        try {
            await this.dataManager.loadFromStorage(['events']);
            window.debugLogger?.debug('RaceUI', 'Event data refreshed for rendering');
        } catch (error) {
            console.error('?? Error refreshing event data for rendering:', error);
        }
        
        // Get event data to access class order (now with fresh data)
        const event = this.dataManager.getEvent(this.selectedEventId);
        const classOrder = event?.classOrder || [];
        
        window.debugLogger?.debug('RaceUI', 'organizeHeatsByRound using classOrder:', classOrder);
        
        // Create ordered array of class names
        const orderedClassNames = this.getOrderedClassNames(bracket, classOrder);
        
        // Process classes in the specified order
        orderedClassNames.forEach(className => {
            const classBracket = bracket.classes[className];
            if (!classBracket) return;

            classBracket.rounds.forEach(round => {
                const roundKey = round.roundNumber;

                if (!roundsMap.has(roundKey)) {
                    roundsMap.set(roundKey, {
                        roundNumber: roundKey,
                        classes: []
                    });
                }

                const roundClasses = roundsMap.get(roundKey).classes;

                // ?? FIX: Prevent duplicate classes in the same round
                const classAlreadyInRound = roundClasses.some(classData => classData.className === className);
                if (!classAlreadyInRound) {
                    roundClasses.push({
                        className,
                        classBracket,
                        round
                    });
                } else {
                    console.warn(`?? Prevented duplicate class ${className} in round ${roundKey}`);
                }
            });
        });
        
        // Sort rounds by number (handle 'final' round)
        const sortedRounds = Array.from(roundsMap.values()).sort((a, b) => {
            if (a.roundNumber === 'final') return 1;
            if (b.roundNumber === 'final') return -1;
            return a.roundNumber - b.roundNumber;
        });
        
        return sortedRounds;
    }

    /**
     * Get ordered class names based on event configuration
     */
    getOrderedClassNames(bracket, classOrder) {
        const availableClasses = Object.keys(bracket.classes);
        
        window.debugLogger?.debug('RaceUI', 'getOrderedClassNames called with:', {
            availableClasses,
            classOrder,
            selectedEventId: this.selectedEventId
        });
        
        if (!classOrder || classOrder.length === 0) {
            // No order specified, return alphabetical order
            window.debugLogger?.debug('RaceUI', 'No class order specified, using alphabetical order');
            return availableClasses.sort();
        }
        
        // Create ordered list based on classOrder
        const orderedClasses = [];
        const usedClasses = new Set();
        
        // First, add classes in the specified order
        classOrder.forEach(classId => {
            // Find class name by ID in event's classSettings
            const event = this.dataManager.getEvent(this.selectedEventId);
            const classSetting = event?.classSettings?.find(cs => cs.classId === classId);
            
            if (classSetting && availableClasses.includes(classSetting.className)) {
                orderedClasses.push(classSetting.className);
                usedClasses.add(classSetting.className);
                window.debugLogger?.debug('RaceUI', `?? Added class ${classSetting.className} in order position ${orderedClasses.length}`);
            } else {
                window.debugLogger?.debug('RaceUI', `?? Warning: Class ID ${classId} not found in classSettings or not available in bracket`);
            }
        });
        
        // Add any remaining classes not in the order (alphabetically)
        availableClasses.forEach(className => {
            if (!usedClasses.has(className)) {
                orderedClasses.push(className);
                window.debugLogger?.debug('RaceUI', `?? Added remaining class ${className} at end`);
            }
        });
        
        window.debugLogger?.debug('RaceUI', 'Final ordered class names for rendering:', orderedClasses);
        return orderedClasses;
    }

    /**
     * Render a round across all classes
     */
    renderRoundAcrossClasses(roundData) {
        const { roundNumber, classes } = roundData;
        
        return `
            <div class="cross-class-round">
                <div class="round-header-main">
                    <h3>${roundNumber === 'final' ? 'Final Round' : `Round ${roundNumber}`}</h3>
                </div>
                <div class="classes-in-round">
                    ${classes.map(classData => this.renderClassInRound(classData)).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Render a class within a round
     */
    renderClassInRound(classData) {
        const { className, classBracket, round } = classData;
        const isComplete = round.isComplete;
        const isDoubleElimination = round.type === 'double-elimination';
        const isMultiLoss = round.type === 'multi-loss';
        const isUnifiedFinal = round.type === 'unified-final';
        
        return `
            <div class="class-in-round">
                <div class="class-round-header">
                    <h4>${className} Class</h4>
                    <span class="round-status ${isComplete ? 'complete' : 'pending'}">
                        ${isComplete ? 'Complete' : 'Pending'}
                    </span>
                </div>
                
                ${isUnifiedFinal ? this.renderUnifiedFinalHeats(round, className) :
                  isMultiLoss ? this.renderMultiLossBracketHeats(round, className) : 
                  isDoubleElimination ? this.renderDoubleEliminationHeats(round, className) : 
                  this.renderSingleEliminationHeats(round, className)}
            </div>
        `;
    }

    /**
     * Render unified final heats
     */
    renderUnifiedFinalHeats(round, className) {
        const sortedHeats = round.heats.slice().sort((a, b) => (a.raceNumber || 0) - (b.raceNumber || 0));
        return `
            <div class="bracket-section unified-final">
                <h5><i class="fas fa-trophy"></i> Unified Final</h5>
                <div class="heats-horizontal">
                    ${sortedHeats.map(heat => this.renderHeatHorizontal(heat, className)).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Render multi-loss bracket heats
     */
    renderMultiLossBracketHeats(round, className) {
        // Group heats by loss count
        const heatsByLoss = new Map();
        round.heats.forEach(heat => {
            const lossCount = heat.lossCount || 0;
            if (!heatsByLoss.has(lossCount)) {
                heatsByLoss.set(lossCount, []);
            }
            heatsByLoss.get(lossCount).push(heat);
        });
        
        // Sort by loss count (0 losses first, then 1, 2, etc.)
        const sortedLossCounts = Array.from(heatsByLoss.keys()).sort((a, b) => a - b);
        
        let html = '';
        
        sortedLossCounts.forEach(lossCount => {
            const heats = heatsByLoss.get(lossCount);
            const bracketName = lossCount === 0 ? 'Upper Bracket (0 losses)' : `${lossCount}-Loss Bracket`;
            const bracketClass = lossCount === 0 ? 'upper-bracket' : `loss-bracket-${lossCount}`;
            
            html += `
                <div class="bracket-section ${bracketClass}">
                    <h5><i class="fas fa-layer-group"></i> ${bracketName}</h5>
                    <div class="heats-horizontal">
                        ${heats.slice().sort((a, b) => (a.raceNumber || 0) - (b.raceNumber || 0)).map(heat => this.renderHeatHorizontal(heat, className)).join('')}
                    </div>
                </div>
            `;
        });
        
        return html;
    }

    /**
     * Render double elimination heats
     */
    renderDoubleEliminationHeats(round, className) {
        const sortByRaceNumber = (a, b) => (a.raceNumber || 0) - (b.raceNumber || 0);
        const upperBracketHeats = round.heats.filter(h => h.bracketType === 'upper').sort(sortByRaceNumber);
        const lowerBracketHeats = round.heats.filter(h => h.bracketType === 'lower').sort(sortByRaceNumber);
        const championshipHeats = round.heats.filter(h => h.bracketType === 'championship').sort(sortByRaceNumber);

        window.debugLogger?.debug('RaceUI', `?? Rendering double elimination heats for ${className}:`);
        window.debugLogger?.debug('RaceUI', `  Total heats: ${round.heats.length}`);
        window.debugLogger?.debug('RaceUI', `  Upper bracket heats: ${upperBracketHeats.length}`);
        window.debugLogger?.debug('RaceUI', `  Lower bracket heats: ${lowerBracketHeats.length}`);
        window.debugLogger?.debug('RaceUI', `  Championship heats: ${championshipHeats.length}`);

        // Debug: Log each heat's bracket type
        round.heats.forEach((heat, index) => {
            window.debugLogger?.debug('RaceUI', `    Heat ${index + 1}: bracketType=${heat.bracketType}, heatNumber=${heat.heatNumber}`);
        });

        let html = '';
        
        if (upperBracketHeats.length > 0) {
            html += `
                <div class="bracket-section upper-bracket">
                    <h5><i class="fas fa-arrow-up"></i> Upper Bracket</h5>
                    <div class="heats-horizontal">
                        ${upperBracketHeats.map(heat => this.renderHeatHorizontal(heat, className)).join('')}
                    </div>
                </div>
            `;
        }
        
        if (lowerBracketHeats.length > 0) {
            html += `
                <div class="bracket-section lower-bracket">
                    <h5><i class="fas fa-arrow-down"></i> Lower Bracket</h5>
                    <div class="heats-horizontal">
                        ${lowerBracketHeats.map(heat => this.renderHeatHorizontal(heat, className)).join('')}
                    </div>
                </div>
            `;
        }
        
        if (championshipHeats.length > 0) {
            html += `
                <div class="bracket-section championship">
                    <h5><i class="fas fa-trophy"></i> Championship Final</h5>
                    <div class="heats-horizontal">
                        ${championshipHeats.map(heat => this.renderHeatHorizontal(heat, className)).join('')}
                    </div>
                </div>
            `;
        }
        
        return html;
    }

    /**
     * Render single elimination heats
     */
    renderSingleEliminationHeats(round, className) {
        const sortedHeats = round.heats.slice().sort((a, b) => (a.raceNumber || 0) - (b.raceNumber || 0));
        return `
            <div class="heats-horizontal">
                ${sortedHeats.map(heat => this.renderHeatHorizontal(heat, className)).join('')}
            </div>
        `;
    }

    /**
     * Render generate next round button
     */
    renderGenerateNextRoundButton(bracket) {
        // Check if all classes are complete
        const allClassesComplete = bracket && bracket.classes && 
            Object.values(bracket.classes).every(classBracket => classBracket.isComplete);
        
        if (allClassesComplete) {
            return `
                <div class="bottom-actions tournament-complete">
                    <div class="completion-banner">
                        <i class="fas fa-trophy"></i>
                        <h3>Tournament Complete!</h3>
                        <p>All classes have finished their final rounds</p>
                    </div>
                    <div class="tournament-winners">
                        ${Object.entries(bracket.classes).map(([className, classBracket]) => `
                            <div class="class-winner">
                                <span class="class-name">${className}</span>
                                <span class="winner-name">
                                    <i class="fas fa-crown"></i>
                                    ${classBracket.winner ? classBracket.winner.name : 'No Winner'}
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        return `
            <div class="bottom-actions">
                <button class="btn btn-primary btn-lg generate-next-round-btn">
                    <i class="fas fa-forward"></i>
                    Generate Next Round
                </button>
            </div>
        `;
    }

    /**
     * Render a tournament round
     */
    renderRound(round, roundIndex, className) {
        const roundNumber = round.roundNumber;
        const isComplete = round.isComplete;
        const isDoubleElimination = round.type === 'double-elimination';
        
        if (isDoubleElimination) {
            // Group heats by bracket type for double elimination
            const upperBracketHeats = round.heats.filter(h => h.bracketType === 'upper');
            const lowerBracketHeats = round.heats.filter(h => h.bracketType === 'lower');
            const championshipHeats = round.heats.filter(h => h.bracketType === 'championship');
            
            return `
                <div class="tournament-round double-elimination ${isComplete ? 'complete' : 'pending'}">
                    <div class="round-header">
                        <h4>${roundNumber === 'final' ? 'Championship' : `Round ${roundNumber}`}</h4>
                        <span class="round-status ${isComplete ? 'complete' : 'pending'}">
                            ${isComplete ? 'Complete' : 'Pending'}
                        </span>
                    </div>
                    ${upperBracketHeats.length > 0 ? `
                        <div class="bracket-section upper-bracket">
                            <h5><i class="fas fa-arrow-up"></i> Upper Bracket</h5>
                            <div class="round-heats">
                                ${upperBracketHeats.map(heat => this.renderHeat(heat, className)).join('')}
                            </div>
                        </div>
                    ` : ''}
                    ${lowerBracketHeats.length > 0 ? `
                        <div class="bracket-section lower-bracket">
                            <h5><i class="fas fa-arrow-down"></i> Lower Bracket</h5>
                            <div class="round-heats">
                                ${lowerBracketHeats.map(heat => this.renderHeat(heat, className)).join('')}
                            </div>
                        </div>
                    ` : ''}
                    ${championshipHeats.length > 0 ? `
                        <div class="bracket-section championship">
                            <h5><i class="fas fa-trophy"></i> Championship Final</h5>
                            <div class="round-heats">
                                ${championshipHeats.map(heat => this.renderHeat(heat, className)).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        } else {
            // Single elimination or regular round
            return `
                <div class="tournament-round ${isComplete ? 'complete' : 'pending'}">
                    <div class="round-header">
                        <h4>${roundNumber === 'final' ? 'Final' : `Round ${roundNumber}`}</h4>
                        <span class="round-status ${isComplete ? 'complete' : 'pending'}">
                            ${isComplete ? 'Complete' : 'Pending'}
                        </span>
                    </div>
                    <div class="round-heats">
                        ${round.heats.map(heat => this.renderHeat(heat, className)).join('')}
                    </div>
                </div>
            `;
        }
    }

    /**
     * Render a heat (race) - horizontal layout
     */
    renderHeatHorizontal(heat, className) {
        const isCompleted = heat.status === 'completed';
        const isActive = heat.status === 'active';
        
        return `
            <div class="heat-horizontal ${heat.status}" data-heat-id="${heat.id}">
                <div class="heat-header-horizontal">
                    <span class="heat-number">Race #${heat.raceNumber || heat.heatNumber}</span>
                    <div class="heat-actions-horizontal">
                        ${!isCompleted ? `
                            ${heat.lanes.filter(lane => lane.participant).length === 1 ? `
                                <button class="btn btn-xs btn-primary complete-heat-btn" data-heat-id="${heat.id}" style="background: linear-gradient(135deg, #28a745, #20c997);">
                                    <i class="fas fa-trophy"></i>
                                    Auto Complete
                                </button>
                            ` : `
                                <button class="btn btn-xs btn-success complete-heat-btn" data-heat-id="${heat.id}">
                                    <i class="fas fa-flag-checkered"></i>
                                    Complete
                                </button>
                            `}
                        ` : ``}
                        ${(() => {
                            if (isCompleted) {
                                const safetyCheck = this.raceManager.canSafelyResetHeat(this.selectedEventId, heat.id);
                                if (!safetyCheck.canReset) {
                                    return `<button class="btn btn-xs btn-secondary reset-heat-btn disabled" data-heat-id="${heat.id}" title="${safetyCheck.reason}" disabled>
                                        <i class="fas fa-lock"></i>
                                    </button>`;
                                }
                            }
                            return `<button class="btn btn-xs btn-secondary reset-heat-btn" data-heat-id="${heat.id}" title="${isCompleted ? 'Reset completed heat' : 'Reset pending heat'}">
                                <i class="fas fa-undo"></i>
                            </button>`;
                        })()}
                    </div>
                    <span class="heat-status ${heat.status}">${heat.status}</span>
                </div>
                <div class="participants-horizontal">
                    ${heat.lanes.map(lane => this.renderParticipantHorizontal(lane, heat, isCompleted)).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Render a participant horizontally
     */
    renderParticipantHorizontal(lane, heat, isCompleted) {
        const participant = lane.participant;
        const result = heat.results ? heat.results.find(r => r.participantId === participant?.id) : null;
        const position = result ? result.position : null;

        // Get pending result for this participant
        const heatResults = this.pendingResults.get(heat.id) || [];
        const pendingResult = heatResults.find(r => r.participantId === participant?.id);

        // Prioritize pending results over heat.results to prevent visual glitches during completion
        // Only use heat.results if there are no pending results for this participant
        const currentPosition = pendingResult ? pendingResult.position : position;

        // Heat is truly completed only if it has both completed status AND actual results
        const actuallyCompleted = isCompleted && heat.results && heat.results.length > 0;

        if (!participant) {
            return `
                <div class="participant-horizontal empty">
                    <div class="lane-label">Lane ${lane.lane}</div>
                    <div class="participant-info">Empty</div>
                </div>
            `;
        }

        return `
            <div class="participant-horizontal ${currentPosition ? `position-${currentPosition}` : ''}" data-participant-id="${participant.id}">
                <div class="lane-label">Lane ${lane.lane}</div>
                <div class="participant-info ${!actuallyCompleted ? 'clickable-participant' : ''}"
                     data-participant-id="${participant.id}" data-heat-id="${heat.id}" data-max-lanes="${heat.numberOfLanes}">
                    <div class="participant-name">${participant.name}</div>
                    ${participant.team ? `<div class="participant-team">${participant.team}</div>` : ''}
                    ${!actuallyCompleted ? `
                        ${currentPosition ? `
                            <div class="position-display">
                                <span class="current-position">${this.getOrdinal(currentPosition)}</span>
                            </div>
                        ` : ''}
                    ` : `
                        <div class="position-badge position-${currentPosition || 'unassigned'}">
                            ${currentPosition ? this.getOrdinal(currentPosition) : 'N/A'}
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    /**
     * Render a heat (race) - legacy vertical layout (kept for compatibility)
     */
    renderHeat(heat, className) {
        const isCompleted = heat.status === 'completed';
        const isActive = heat.status === 'active';
        
        return `
            <div class="heat ${heat.status}" data-heat-id="${heat.id}">
                <div class="heat-header">
                    <span class="heat-number">Race #${heat.raceNumber || heat.heatNumber}</span>
                    <span class="heat-status ${heat.status}">${heat.status}</span>
                </div>
                <div class="heat-lanes">
                    ${heat.lanes.map(lane => this.renderLane(lane, heat, isCompleted)).join('')}
                </div>
                ${!isCompleted ? `
                    <div class="heat-actions">
                        <div class="heat-instruction">
                            <i class="fas fa-mouse-pointer"></i>
                            ${heat.lanes.filter(lane => lane.participant).length === 1 ? 
                                'Single participant heat - use Auto Complete button' : 
                                'Click participant names to set finishing positions'
                            }
                        </div>
                        <div class="heat-buttons">
                            ${heat.lanes.filter(lane => lane.participant).length === 1 ? `
                                <button class="btn btn-sm btn-primary complete-heat-btn" data-heat-id="${heat.id}" style="background: linear-gradient(135deg, #28a745, #20c997);">
                                    <i class="fas fa-trophy"></i>
                                    Auto Complete
                                </button>
                            ` : `
                                <button class="btn btn-sm btn-success complete-heat-btn" data-heat-id="${heat.id}">
                                    <i class="fas fa-flag-checkered"></i>
                                    Complete Heat
                                </button>
                            `}
                            <button class="btn btn-sm btn-secondary reset-heat-btn" data-heat-id="${heat.id}">
                                <i class="fas fa-undo"></i>
                                Reset
                            </button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Render a lane assignment
     */
    renderLane(lane, heat, isCompleted) {
        const participant = lane.participant;
        const result = heat.results ? heat.results.find(r => r.participantId === participant?.id) : null;
        const position = result ? result.position : null;

        // Get pending result for this participant
        const heatResults = this.pendingResults.get(heat.id) || [];
        const pendingResult = heatResults.find(r => r.participantId === participant?.id);

        // Prioritize pending results over heat.results to prevent visual glitches during completion
        // Only use heat.results if there are no pending results for this participant
        const currentPosition = pendingResult ? pendingResult.position : position;

        // Heat is truly completed only if it has both completed status AND actual results
        const actuallyCompleted = isCompleted && heat.results && heat.results.length > 0;

        if (!participant) {
            return `
                <div class="lane empty">
                    <div class="lane-number">Lane ${lane.lane}</div>
                    <div class="lane-participant">Empty</div>
                </div>
            `;
        }

        // Check for special statuses
        const isDisqualified = participant.status === 'disqualified' || result?.disqualified || currentPosition === 'DSQ';
        const hasFalseStart = participant.hasFalseStart || result?.falseStart;
        
        // Determine visual classes for special statuses
        let statusClasses = '';
        let statusIndicator = '';
        
        if (isDisqualified) {
            statusClasses += ' participant-disqualified';
            statusIndicator = '<span class="status-indicator dsq-indicator">DSQ</span>';
        } else if (hasFalseStart) {
            statusClasses += ' participant-false-start';
            statusIndicator = '<span class="status-indicator fs-indicator">FS</span>';
        }

        return `
            <div class="lane ${currentPosition ? `position-${currentPosition}` : ''}${statusClasses}" data-participant-id="${participant.id}">
                <div class="lane-number">Lane ${lane.lane}</div>
                <div class="lane-participant ${!actuallyCompleted ? 'clickable-participant' : ''}"
                     data-participant-id="${participant.id}" data-heat-id="${heat.id}" data-max-lanes="${heat.numberOfLanes}">
                    <span class="participant-name">${participant.name}</span>
                    ${participant.team ? `<span class="participant-team">${participant.team}</span>` : ''}
                    ${statusIndicator}
                    ${!actuallyCompleted ? `
                        <div class="position-display">
                            ${currentPosition ? `
                                <span class="current-position ${isDisqualified ? 'dsq-position' : hasFalseStart ? 'fs-position' : ''}">${this.getOrdinal(currentPosition)}</span>
                            ` : `
                                <span class="no-position">Click to set position</span>
                            `}
                        </div>
                    ` : `
                        <div class="final-position">
                            <span class="position-badge position-${currentPosition} ${isDisqualified ? 'dsq-badge' : hasFalseStart ? 'fs-badge' : ''}">${this.getOrdinal(currentPosition)}</span>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    /**
     * Get ordinal number (1st, 2nd, 3rd, etc.) or special status (DSQ, FS)
     */
    getOrdinal(num) {
        // Handle special race statuses
        if (num === 'DSQ') return 'DSQ';
        if (num === 'FS') return 'FS';
        if (num === 'DNF') return 'DNF';
        
        // Handle null, undefined, or invalid numbers
        if (num == null || isNaN(num) || num <= 0) {
            return 'N/A';
        }
        
        const suffixes = ['th', 'st', 'nd', 'rd'];
        const value = num % 100;
        return num + (suffixes[(value - 20) % 10] || suffixes[value] || suffixes[0]);
    }

    /**
     * Find the next available position in a heat
     */
    findNextAvailablePosition(heatResults, maxPosition, startFrom = 1) {
        // Get all taken positions from pending results
        const takenPositions = new Set(heatResults.map(r => r.position));
        
        // Also check for special results (FS/DSQ) in the current heat
        // We need to get the heatId from the context - this is a bit tricky since we don't have it directly
        // For now, we'll handle this in the calling function by passing the heat data
        
        // Find first available position starting from startFrom
        for (let pos = startFrom; pos <= maxPosition; pos++) {
            if (!takenPositions.has(pos)) {
                return pos;
            }
        }
        
        // If no position available from startFrom onwards, check from beginning
        if (startFrom > 1) {
            for (let pos = 1; pos < startFrom; pos++) {
                if (!takenPositions.has(pos)) {
                    return pos;
                }
            }
        }
        
        // If all positions are taken, return 0 (unassigned)
        return 0;
    }

    /**
     * Handle participant click with minimal debouncing to prevent race conditions
     */
    async handleParticipantClickWithDebounce(participantElement) {
        const now = Date.now();
        if (now - this.lastClickTime < this.clickDebounceDelay) {
            window.debugLogger?.debug('RaceUI', 'Click debounced - too soon after last click (race condition prevention)');
            return;
        }
        this.lastClickTime = now;

        await this.handleParticipantClick(participantElement);
    }

    /**
     * Handle participant name click (new simplified method)
     */
    async handleParticipantClick(participantElement) {
        const participantId = participantElement.dataset.participantId;
        const heatId = participantElement.dataset.heatId;
        const maxLanes = parseInt(participantElement.dataset.maxLanes);

        window.debugLogger?.debug('RaceUI', 'Participant click:', { participantId, heatId, maxLanes, selectedEventId: this.selectedEventId });
        window.debugLogger?.debug('RaceUI', 'Participant element dataset:', participantElement.dataset);

        // Validate required data
        if (!this.selectedEventId) {
            console.error('No selected event - cannot handle participant click');
            this.showToast('No event selected - please select an event first', 'error');
            return;
        }

        if (!participantId || !heatId) {
            console.error('Missing participant or heat ID', { participantId, heatId });
            this.showToast('Missing participant or heat data - please refresh the page', 'error');
            return;
        }

        // Get or create pending result for this heat
        if (!this.pendingResults.has(heatId)) {
            this.pendingResults.set(heatId, []);
        }
        
        const heatResults = this.pendingResults.get(heatId);
        
        // Get current heat data
        const currentHeat = await this.raceManager.getHeat(this.selectedEventId, heatId);
        if (!currentHeat) {
            console.error(`Heat ${heatId} not found for event ${this.selectedEventId}`);
            this.showToast('Heat data not found - please refresh the page', 'error');
            return;
        }

        // Try to get participant count from lanes, or fall back to numberOfLanes or results
        let actualParticipantCount = 0;

        if (currentHeat.lanes) {
            actualParticipantCount = currentHeat.lanes.filter(lane => lane.participant).length;
        } else if (currentHeat.numberOfLanes) {
            actualParticipantCount = currentHeat.numberOfLanes;
            window.debugLogger?.debug('RaceUI', `Using participant count from numberOfLanes: ${actualParticipantCount}`);
        } else {
            console.warn(`Heat ${heatId} has no lanes data, trying to determine participant count from other sources`);

            // Try to get count from existing results
            if (currentHeat.results && Array.isArray(currentHeat.results)) {
                const uniqueParticipantIds = new Set(currentHeat.results.map(r => r.participantId));
                actualParticipantCount = uniqueParticipantIds.size;
                window.debugLogger?.debug('RaceUI', `Using participant count from results: ${actualParticipantCount}`);
            } else {
                // Last resort: use the maxLanes from the dataset, or default to 4
                actualParticipantCount = maxLanes || 4; // Default to 4 lanes if nothing else works
                console.warn(`Using default participant count: ${actualParticipantCount}`);
            }
        }
        
        // Check if this participant has a false start or disqualification result
        const heatResult = currentHeat.results ? currentHeat.results.find(r => r.participantId === participantId) : null;
        const hasDisqualification = heatResult && (heatResult.disqualified || heatResult.position === 'DSQ');
        const hasFalseStart = heatResult && (heatResult.falseStart || heatResult.position === 'FS');
        
        if (hasDisqualification || hasFalseStart) {
            window.debugLogger?.debug('RaceUI', `Participant ${participantId} is disqualified or has false start, cannot change position`);
            this.showToast('Cannot change position for disqualified or false started participants', 'warning');
            return;
        }
        
        // Note: False Start participants can now have their positions changed
        // since False Start is treated as a regular loss, not a special restriction
        
        // Find current position for this participant
        const existingResult = heatResults.find(r => r.participantId === participantId);
        let currentPosition = existingResult ? existingResult.position : 0;
        
        const maxPosition = actualParticipantCount; // Only assign positions up to participant count
        
        window.debugLogger?.debug('RaceUI', `Heat has ${actualParticipantCount} participants, max position: ${maxPosition}`);
        window.debugLogger?.debug('RaceUI', 'Heat lanes:', currentHeat.lanes || 'No lanes data available');
        if (currentHeat.lanes) {
            window.debugLogger?.debug('RaceUI', 'Participants in lanes:', currentHeat.lanes.map(lane => ({
                lane: lane.lane,
                hasParticipant: !!lane.participant,
                participantId: lane.participant?.id,
                participantName: lane.participant?.name
            })));
        } else {
            window.debugLogger?.debug('RaceUI', 'Cannot display lane participants - lanes data missing');
        }
        
        // Remove existing result for this participant first
        if (existingResult) {
            const existingIndex = heatResults.findIndex(r => r.participantId === participantId);
            heatResults.splice(existingIndex, 1);
        }
        
        // Check for special results (false start or DSQ) that should be treated as last position
        const disqualificationResults = currentHeat.results ? currentHeat.results.filter(r => 
            r.disqualified || r.position === 'DSQ'
        ) : [];
        const hasDisqualificationResults = disqualificationResults.length > 0;
        
        // If there are disqualification results, those positions are taken, so adjust max position for other participants
        // Note: False Start participants can now have regular positions assigned
        const effectiveMaxPosition = hasDisqualificationResults ? maxPosition - disqualificationResults.length : maxPosition;
        
        // Assign positions based on click order: first click = 1st, second click = 2nd, etc.
        let nextPosition;

        if (currentPosition === 0) {
            // If unassigned, find the next available position
            const takenPositions = new Set(heatResults.filter(r => r.position > 0).map(r => r.position));
            window.debugLogger?.debug('RaceUI', 'Taken positions:', Array.from(takenPositions));

            // Find the smallest available position
            for (let pos = 1; pos <= effectiveMaxPosition; pos++) {
                if (!takenPositions.has(pos)) {
                    nextPosition = pos;
                    window.debugLogger?.debug('RaceUI', `Assigning position ${nextPosition} (next available from ${Array.from(takenPositions)})`);
                    break;
                }
            }

            if (nextPosition === undefined) {
                nextPosition = 0; // No more positions available
                window.debugLogger?.debug('RaceUI', `No more positions available: taken=${Array.from(takenPositions)}, max=${effectiveMaxPosition}`);
            }
        } else {
            // If already assigned, clicking again removes the position (unassign)
            nextPosition = 0; // Unassign this participant
            window.debugLogger?.debug('RaceUI', `Unassigning position ${currentPosition} (clicking assigned participant)`);
        }
        
        // Add new result if position is valid
        if (nextPosition > 0) {
            heatResults.push({
                participantId,
                position: nextPosition,
                timestamp: new Date().toISOString()
            });
        }
        
        // Update UI - simple approach to avoid duplication
        await this.updateParticipantPositionDisplay(heatId);

        // Check if heat should be automatically completed (consistent with false start/disqualification logic)
        // But don't update UI again if completion is triggered - let completeHeat handle it
        const shouldAutoComplete = await this.shouldAutoCompleteHeat(heatId);
        if (shouldAutoComplete) {
            await this.checkAndAutoCompleteHeat(heatId);
        }

        // Update scroll anchor tracking after position change
        await this.updateScrollAnchor();
    }

    /**
     * Create the floating scroll anchor indicator
     */
    createScrollAnchorIndicator() {
        if (this.scrollAnchorIndicator) return;
        
        window.debugLogger?.debug('RaceUI', 'Creating scroll anchor indicator...');
        
        this.scrollAnchorIndicator = document.createElement('div');
        this.scrollAnchorIndicator.className = 'scroll-anchor-indicator';
        this.scrollAnchorIndicator.innerHTML = `
            <button class="scroll-anchor-btn" title="Jump to most recent uncompleted race">
                <i class="fas fa-chevron-up"></i>
                <span class="scroll-anchor-text">Missed Race</span>
            </button>
        `;
        
        // Add click handler
        this.scrollAnchorIndicator.querySelector('.scroll-anchor-btn').addEventListener('click', () => {
            this.jumpToScrollAnchor();
        });
        
        document.body.appendChild(this.scrollAnchorIndicator);
        window.debugLogger?.debug('RaceUI', 'Scroll anchor indicator created and added to DOM');
    }

    /**
     * Switch between list and tree bracket view modes.
     * @param {'list'|'tree'} mode
     */
    async setBracketViewMode(mode) {
        this._bracketViewMode = mode;
        const bracket = await this.raceManager.getBracket(this.selectedEventId);
        if (bracket) await this.renderBrackets(bracket);
    }

    /**
     * Update the scroll anchor based on current incomplete races
     */
    async updateScrollAnchor() {
        if (!this.selectedEventId) return;

        window.debugLogger?.debug('RaceUI', 'Updating scroll anchor...');

        const bracket = this.raceManager.getCachedBracket(this.selectedEventId);
        if (!bracket || !bracket.classes) {
            window.debugLogger?.debug('RaceUI', 'No bracket data available');
            return;
        }
        
        // Find the highest incomplete race (lowest position in document, highest race number)
        let highestIncomplete = null;
        let lowestPosition = Infinity;
        let incompleteCount = 0;
        
        Object.entries(bracket.classes).forEach(([className, classData]) => {
            if (classData.rounds) {
                classData.rounds.forEach((round, roundIndex) => {
                    if (round.heats) {
                        round.heats.forEach(heat => {
                            if (heat.status !== 'completed') {
                                incompleteCount++;
                                const heatElement = document.querySelector(`[data-heat-id="${heat.id}"]`);
                                if (heatElement) {
                                    const rect = heatElement.getBoundingClientRect();
                                    const position = rect.top + window.scrollY;
                                    
                                    window.debugLogger?.debug('RaceUI', `Found incomplete heat ${heat.id} (Race #${heat.raceNumber || heat.heatNumber}) at position ${position}`);
                                    
                                    // Find the highest race number (lowest position in document)
                                    if (position < lowestPosition) {
                                        lowestPosition = position;
                                        highestIncomplete = {
                                            heatId: heat.id,
                                            className: className,
                                            roundNumber: round.roundNumber || roundIndex + 1,
                                            heatNumber: heat.heatNumber,
                                            raceNumber: heat.raceNumber,
                                            element: heatElement
                                        };
                                    }
                                } else {
                                    window.debugLogger?.debug('RaceUI', `Heat element not found for heat ${heat.id}`);
                                }
                            }
                        });
                    }
                });
            }
        });
        
        window.debugLogger?.debug('RaceUI', `Found ${incompleteCount} incomplete races, highest race at position ${lowestPosition}`);
        
        this.scrollAnchor = highestIncomplete;
        
        // Create indicator if we have incomplete races
        if (this.scrollAnchor) {
            window.debugLogger?.debug('RaceUI', `Creating scroll anchor indicator for highest incomplete race: ${this.scrollAnchor.className} - Race #${this.scrollAnchor.raceNumber || this.scrollAnchor.heatNumber}`);
            this.createScrollAnchorIndicator();
        } else if (this.scrollAnchorIndicator) {
            window.debugLogger?.debug('RaceUI', 'Removing scroll anchor indicator - no incomplete races');
            this.scrollAnchorIndicator.remove();
            this.scrollAnchorIndicator = null;
        }
    }

    /**
     * Handle scroll events to show/hide the scroll anchor indicator
     */
    handleScrollForAnchor() {
        if (!this.scrollAnchor || !this.scrollAnchorIndicator) return;
        
        const currentScrollY = window.scrollY;
        const anchorElement = this.scrollAnchor.element;
        
        if (!anchorElement) return;
        
        const anchorRect = anchorElement.getBoundingClientRect();
        const anchorTop = anchorRect.top + currentScrollY;
        
        window.debugLogger?.debug('RaceUI', `Scroll: ${currentScrollY}, Anchor: ${anchorTop}, Threshold: ${this.scrollThreshold}`);
        
        // Show indicator if we've scrolled past the anchor (anchor is above viewport)
        if (anchorTop < currentScrollY - this.scrollThreshold) {
            if (!this.scrollAnchorIndicator.classList.contains('visible')) {
                window.debugLogger?.debug('RaceUI', 'Showing scroll anchor indicator - scrolled past anchor');
                this.scrollAnchorIndicator.classList.add('visible');
            }
        } else {
            if (this.scrollAnchorIndicator.classList.contains('visible')) {
                window.debugLogger?.debug('RaceUI', 'Hiding scroll anchor indicator - anchor in view');
                this.scrollAnchorIndicator.classList.remove('visible');
            }
        }
        
        this.lastScrollPosition = currentScrollY;
    }

    /**
     * Jump to the scroll anchor (most recent incomplete race)
     */
    jumpToScrollAnchor() {
        if (!this.scrollAnchor || !this.scrollAnchor.element) return;
        
        const element = this.scrollAnchor.element;
        
        // Highlight the race temporarily
        element.style.boxShadow = '0 0 0 3px #f59e0b, 0 4px 12px rgba(245, 158, 11, 0.3)';
        element.style.borderRadius = '8px';
        
        // Scroll to the element
        element.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
            inline: 'center'
        });
        
        // Remove highlight after 3 seconds
        setTimeout(() => {
            element.style.boxShadow = '';
            element.style.borderRadius = '';
        }, 3000);
        
        // Hide the indicator after jumping
        this.scrollAnchorIndicator.classList.remove('visible');
        
        // Show toast with race info
        this.showToast(`Jumped to ${this.scrollAnchor.className} - Round ${this.scrollAnchor.roundNumber} - Race #${this.scrollAnchor.raceNumber || this.scrollAnchor.heatNumber}`, 'info');
    }

    /**
     * Handle result position click (legacy method for numbered buttons)
     */
    async handleResultClick(button) {
        const position = parseInt(button.dataset.position);
        const participantId = button.dataset.participantId;
        const heatId = button.dataset.heatId;
        
        window.debugLogger?.debug('RaceUI', 'Result click:', { position, participantId, heatId });
        
        // Get or create pending result for this heat
        if (!this.pendingResults.has(heatId)) {
            this.pendingResults.set(heatId, []);
        }
        
        const heatResults = this.pendingResults.get(heatId);
        
        // Remove any existing result for this participant
        const existingIndex = heatResults.findIndex(r => r.participantId === participantId);
        if (existingIndex !== -1) {
            heatResults.splice(existingIndex, 1);
        }
        
        // Remove any existing result for this position
        const positionIndex = heatResults.findIndex(r => r.position === position);
        if (positionIndex !== -1) {
            heatResults.splice(positionIndex, 1);
        }
        
        // Add new result
        heatResults.push({
            participantId,
            position,
            timestamp: new Date().toISOString()
        });
        
        // Update UI
        this.updateResultButtons(heatId);
        
        // Check if heat should be automatically completed
        this.checkAndAutoCompleteHeat(heatId);
    }

    /**
     * Update participant position display for horizontal layout
     */
    async updateParticipantPositionDisplay(heatId) {
        window.debugLogger?.debug('RaceUI', 'Updating participant position display for heat:', heatId);
        const heatResults = this.pendingResults.get(heatId) || [];
        
        // Get current heat data to check for special results
        const currentHeat = await this.raceManager.getHeat(this.selectedEventId, heatId);
        
        // Find all heat elements with this ID (works for both horizontal and vertical layouts)
        const allHeatElements = document.querySelectorAll(`[data-heat-id="${heatId}"]`);
        
        allHeatElements.forEach(heatElement => {
            // Try both horizontal and vertical layout selectors
            const horizontalParticipants = heatElement.querySelectorAll('.participant-info.clickable-participant');
            const verticalParticipants = heatElement.querySelectorAll('.lane-participant.clickable-participant');
            const allParticipants = [...horizontalParticipants, ...verticalParticipants];
            
            window.debugLogger?.debug('RaceUI', `Found ${horizontalParticipants.length} horizontal participants and ${verticalParticipants.length} vertical participants`);
            
            allParticipants.forEach(participant => {
                const participantId = participant.dataset.participantId;
                const existingResult = heatResults.find(r => r.participantId === participantId);
                
                // Check for special results (FS/DSQ) in the heat
                const heatResult = currentHeat.results ? currentHeat.results.find(r => r.participantId === participantId) : null;
                const hasDisqualification = heatResult && (heatResult.disqualified || heatResult.position === 'DSQ');
                const hasFalseStart = heatResult && (heatResult.falseStart || heatResult.position === 'FS');
                
                let currentPosition = existingResult ? existingResult.position : 0;
                
                // If participant has a disqualification result, show it instead of pending position
                if (hasDisqualification) {
                    currentPosition = heatResult.position;
                } else if (hasFalseStart) {
                    // False start participants show 'FS' visually but are ranked by actualPosition
                    currentPosition = heatResult.position; // This will be 'FS' for display
                }
                // Note: False Start participants can now have regular positions assigned
                // and will be treated like regular participants for position display
                
                window.debugLogger?.debug('RaceUI', `Updating participant ${participantId}: position ${currentPosition} (DSQ: ${hasDisqualification}, FS: ${hasFalseStart})`);
                
                // Update position display (for uncompleted heats)
                let positionDisplay = participant.querySelector('.position-display');
                if (positionDisplay) {
                    if (currentPosition > 0 || hasDisqualification || hasFalseStart) {
                        // Show current position, disqualification, or false start status
                        let displayText, displayClass;
                        if (hasDisqualification) {
                            displayText = currentPosition;
                            displayClass = 'dsq-position';
                        } else if (hasFalseStart) {
                            displayText = currentPosition; // Will be 'FS'
                            displayClass = 'fs-position';
                        } else {
                            displayText = this.getOrdinal(currentPosition);
                            displayClass = 'current-position';
                        }

                        positionDisplay.innerHTML = `<span class="${displayClass}">${displayText}</span>`;
                        window.debugLogger?.debug('RaceUI', `Set position to ${displayText} for participant ${participantId}`);
                    } else {
                        // Update to show "Click to set position" for unassigned participants
                        positionDisplay.innerHTML = `<span class="no-position">Click to set position</span>`;
                        window.debugLogger?.debug('RaceUI', `Set "Click to set position" for participant ${participantId}`);
                    }
                } else {
                    // Create position display for all participants (assigned or not)
                    const newPositionDisplay = document.createElement('div');
                    newPositionDisplay.className = 'position-display';
                    let displayText, displayClass;

                    if (currentPosition > 0 || hasDisqualification || hasFalseStart) {
                        if (hasDisqualification) {
                            displayText = currentPosition;
                            displayClass = 'dsq-position';
                        } else if (hasFalseStart) {
                            displayText = currentPosition; // Will be 'FS'
                            displayClass = 'fs-position';
                        } else {
                            displayText = this.getOrdinal(currentPosition);
                            displayClass = 'current-position';
                        }
                    } else {
                        displayText = 'Click to set position';
                        displayClass = 'no-position';
                    }

                    newPositionDisplay.innerHTML = `<span class="${displayClass}">${displayText}</span>`;
                    participant.appendChild(newPositionDisplay);
                    window.debugLogger?.debug('RaceUI', `Created position display for participant ${participantId}: ${displayText}`);
                }
                
                // Update position badge (for completed heats)
                const positionBadge = participant.querySelector('.position-badge');
                if (positionBadge) {
                    if (currentPosition > 0 || hasDisqualification || hasFalseStart) {
                        let badgeText, badgeClass;
                        if (hasDisqualification) {
                            badgeText = currentPosition; // Will be 'DSQ'
                            badgeClass = 'dsq-badge';
                        } else if (hasFalseStart) {
                            badgeText = currentPosition; // Will be 'FS'
                            badgeClass = 'fs-badge';
                        } else {
                            badgeText = this.getOrdinal(currentPosition);
                            badgeClass = `position-${currentPosition}`;
                        }
                        positionBadge.textContent = badgeText;
                        positionBadge.className = `position-badge ${badgeClass}`;
                    } else {
                        positionBadge.textContent = 'N/A';
                        positionBadge.className = 'position-badge position-unassigned';
                    }
                }
                
                // Update visual styling for the participant container
                const participantContainer = participant.closest('.participant-horizontal') || participant.closest('.lane');
                if (participantContainer) {
                    // Remove old position classes
                    participantContainer.className = participantContainer.className.replace(/position-\d+/g, '');
                    participantContainer.className = participantContainer.className.replace(/participant-false-start|participant-disqualified/g, '');
                    
                    // Add appropriate class based on status
                    if (hasDisqualification) {
                        participantContainer.classList.add('participant-disqualified');
                        window.debugLogger?.debug('RaceUI', `Added disqualified class for participant ${participantId}`);
                    } else if (hasFalseStart) {
                        participantContainer.classList.add('participant-false-start');
                        window.debugLogger?.debug('RaceUI', `Added false start class for participant ${participantId}`);
                    } else if (currentPosition > 0) {
                        participantContainer.classList.add(`position-${currentPosition}`);
                        window.debugLogger?.debug('RaceUI', `Added position-${currentPosition} class to participant container`);
                    }
                }
            });
        });
        
        window.debugLogger?.debug('RaceUI', `Updated position display for ${allHeatElements.length} heat elements`);
    }

    /**
     * Show lane usage analysis for a specific driver
     */
    async showPairingAnalysis(heatId, participantId) {
        const heat = await this.raceManager.getHeat(this.selectedEventId, heatId);
        if (!heat || !this.raceManager.pairingEngine) {
            window.debugLogger?.debug('RaceUI', 'Heat or pairing engine not found');
            return;
        }

        // Get participant info
        const participant = heat.lanes.find(lane => lane.participant?.id === participantId)?.participant;
        if (!participant) {
            window.debugLogger?.debug('RaceUI', 'Participant not found in heat');
            return;
        }

        // Get lane usage statistics for this participant
        const participantStats = this.raceManager.pairingEngine.getParticipantStats(participantId);
        window.debugLogger?.debug('RaceUI', 'Participant Lane Usage:', participantStats);

        // Get all events this participant is in
        const allEvents = this.dataManager.getEventsArray();
        const participantEvents = [];
        
        // Find all events where this participant appears
        for (const event of allEvents) {
            if (event.participants && event.participants.includes(participantId)) {
                participantEvents.push(event);
            }
        }

        // Create lane usage analysis
        const laneUsage = participantStats.laneHistory || {};
        const totalRaces = Object.values(laneUsage).reduce((sum, count) => sum + count, 0);
        
        // Create lane usage breakdown
        const laneBreakdown = [];
        const maxLanes = Math.max(...Object.keys(laneUsage).map(Number), 0);
        
        for (let lane = 1; lane <= maxLanes; lane++) {
            const count = laneUsage[lane] || 0;
            const percentage = totalRaces > 0 ? Math.round((count / totalRaces) * 100) : 0;
            laneBreakdown.push({
                lane,
                count,
                percentage,
                barWidth: percentage
            });
        }

        // Sort by lane number
        laneBreakdown.sort((a, b) => a.lane - b.lane);

        // Create analysis dialog
        const analysisHtml = `
            <div class="pairing-analysis-dialog" style="
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background: var(--bg-primary); border: 2px solid var(--border-color);
                border-radius: 8px; padding: 2rem; max-width: 700px; width: 95%;
                z-index: 1000; box-shadow: 0 4px 20px rgba(0,0,0,0.3); max-height: 80vh; overflow-y: auto;
            ">
                <h3 style="color: var(--accent-primary); margin-bottom: 1rem;">
                    <i class="fas fa-chart-bar"></i> Lane Usage Analysis
                </h3>
                
                <div style="margin-bottom: 1.5rem;">
                    <h4 style="color: var(--text-primary); margin-bottom: 0.5rem;">
                        ${participant.name}
                        ${participant.team ? `<span style="color: var(--text-secondary); font-weight: normal;">(${participant.team})</span>` : ''}
                    </h4>
                    <p style="color: var(--text-secondary); margin: 0;">
                        Total Races: <strong>${totalRaces}</strong> | 
                        Events Participated: <strong>${participantEvents.length}</strong>
                    </p>
                </div>

                <div style="margin-bottom: 2rem;">
                    <h4 style="color: var(--text-primary); margin-bottom: 1rem;">Lane Usage Distribution</h4>
                    ${laneBreakdown.length > 0 ? `
                        <div style="display: grid; gap: 0.75rem;">
                            ${laneBreakdown.map(lane => `
                                <div style="display: flex; align-items: center; gap: 1rem; padding: 0.5rem; background: var(--bg-secondary); border-radius: 4px;">
                                    <div style="min-width: 60px; text-align: center;">
                                        <strong style="color: var(--text-primary);">Lane ${lane.lane}</strong>
                                    </div>
                                    <div style="flex: 1; background: var(--border-color); border-radius: 4px; height: 20px; position: relative;">
                                        <div style="
                                            background: ${lane.percentage > 50 ? '#ef4444' : lane.percentage > 30 ? '#f59e0b' : '#10b981'};
                                            width: ${lane.barWidth}%;
                                            height: 100%;
                                            border-radius: 4px;
                                            transition: width 0.3s ease;
                                        "></div>
                                    </div>
                                    <div style="min-width: 80px; text-align: right;">
                                        <span style="color: var(--text-primary); font-weight: 600;">${lane.count}</span>
                                        <span style="color: var(--text-secondary); font-size: 0.875rem;"> (${lane.percentage}%)</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <p style="color: var(--text-secondary); text-align: center; font-style: italic;">
                            No lane usage data available yet
                        </p>
                    `}
                </div>

                ${participantStats.opponents && participantStats.opponents.length > 0 ? `
                    <div style="margin-bottom: 1.5rem;">
                        <h4 style="color: var(--text-primary); margin-bottom: 0.5rem;">Recent Opponents</h4>
                        <p style="color: var(--text-secondary); font-size: 0.875rem;">
                            Faced <strong>${participantStats.opponents.length}</strong> unique opponents
                        </p>
                    </div>
                ` : ''}

                <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
                    <button onclick="closePairingAnalysisDialog()" 
                            class="btn btn-secondary">Close</button>
                </div>
            </div>
            <div class="dialog-overlay" onclick="closePairingAnalysisDialog()" 
                 style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 999;"></div>
        `;

        // Remove existing dialogs
        this.cleanupModals(['.pairing-analysis-dialog']);
        
        // Add new dialog
        document.body.insertAdjacentHTML('beforeend', analysisHtml);
        
        // Make close function globally available
        window.closePairingAnalysisDialog = this.closePairingAnalysisDialog.bind(this);
    }



    /**
     * Close pairing analysis dialog
     */
    closePairingAnalysisDialog() {
        this.cleanupModals(['.pairing-analysis-dialog']);
    }



    /**
     * Clean up modal dialogs and overlays
     */
    cleanupModals(dialogSelectors = []) {
        // Remove specific dialogs
        dialogSelectors.forEach(selector => {
            const dialogs = document.querySelectorAll(selector);
            dialogs.forEach(dialog => dialog.remove());
        });
        
        // Remove all overlays (in case there are multiple)
        const overlays = document.querySelectorAll('.dialog-overlay');
        overlays.forEach(overlay => overlay.remove());
        
        // Also remove any orphaned overlays
        const orphanedOverlays = document.querySelectorAll('div[style*="position: fixed"][style*="background: rgba(0,0,0,0.5)"]');
        orphanedOverlays.forEach(overlay => {
            if (overlay.style.zIndex === '999') {
                overlay.remove();
            }
        });
    }

    /**
     * Close pairing statistics dialog
     */
    closePairingStatsDialog() {
        const dialog = document.querySelector('.pairing-stats-dialog');
        const overlay = document.querySelector('.dialog-overlay');
        
        if (dialog) {
            dialog.remove();
        }
        if (overlay) {
            overlay.remove();
        }
    }

    /**
     * Show per-heat matching logic and outcomes
     */
    async showHeatLogic(heatId) {
        const heat = await this.raceManager.getHeat(this.selectedEventId, heatId);
        if (!heat) {
            this.showToast('Heat not found', 'error');
            return;
        }

        // Participants in this heat
        const lanes = (heat.lanes || []).filter(l => !!l);
        const participants = lanes
            .map(l => l.participant)
            .filter(Boolean);

        // Build a simple rationale overview
        const roundText = heat.round === 'final' || heat.roundNumber === 'final' ? 'Final' : `Round ${heat.round || heat.roundNumber}`;
        const rationale = [
            'Balanced lane distribution across heats',
            'Minimize repeat matchups when possible',
            'Fill heats to capacity when Free Run is enabled'
        ];

        // Results and lane win tally
        const results = Array.isArray(heat.results) ? heat.results : [];
        const laneWins = new Map();
        results.forEach(r => {
            if (r.position === 1) {
                const laneEntry = lanes.find(l => l.participant && l.participant.id === r.participantId);
                if (laneEntry && laneEntry.lane) {
                    laneWins.set(laneEntry.lane, (laneWins.get(laneEntry.lane) || 0) + 1);
                }
            }
        });

        const participantsHtml = participants.length ? `
            <ul style="margin: 0.25rem 0 0 1rem; color: var(--text-secondary);">
                ${participants.map(p => `<li>${this.escapeHtml(p.name)}${p.team ? ` <span style='opacity:0.8'>(${this.escapeHtml(p.team)})</span>` : ''}</li>`).join('')}
            </ul>
        ` : '<p style="color: var(--text-secondary);">No participants assigned.</p>';

        const rationaleHtml = `
            <ul style="margin: 0.25rem 0 0 1rem; color: var(--text-secondary);">
                ${rationale.map(item => `<li>${this.escapeHtml(item)}</li>`).join('')}
            </ul>
        `;

        const winHtml = laneWins.size ? `
            <ul style="margin: 0.25rem 0 0 1rem; color: var(--text-secondary);">
                ${Array.from(laneWins.entries()).sort((a,b)=>a[0]-b[0]).map(([lane, wins]) => `<li>Lane ${lane}: ${wins} win${wins>1?'s':''}</li>`).join('')}
            </ul>
        ` : '<p style="color: var(--text-secondary);">No winner recorded yet.</p>';

        const html = `
            <div class="pairing-stats-dialog" style="
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background: var(--bg-primary); border: 2px solid var(--border-color);
                border-radius: 8px; padding: 1.5rem; max-width: 720px; width: 95%;
                z-index: 1000; box-shadow: 0 4px 20px rgba(0,0,0,0.3); max-height: 80vh; overflow-y: auto;
            ">
                <h3 style="color: var(--accent-primary); margin-bottom: 0.25rem;">
                    <i class="fas fa-eye"></i> Race #${heat.raceNumber || heat.heatNumber} � ${roundText}
                </h3>
                <p style="color: var(--text-secondary); margin: 0 0 0.75rem;">Class: <strong style="color: var(--text-primary);">${this.escapeHtml(heat.className || '')}</strong></p>

                <h4 style="color: var(--text-primary); margin: 0.5rem 0 0.25rem;">Participants</h4>
                ${participantsHtml}

                <h4 style="color: var(--text-primary); margin: 0.75rem 0 0.25rem;">Matching Logic Applied</h4>
                ${rationaleHtml}

                <h4 style="color: var(--text-primary); margin: 0.75rem 0 0.25rem;">Result Summary</h4>
                ${winHtml}

                <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1rem;">
                    <button class="btn btn-secondary" onclick=\"(function(){ const dlg=document.querySelector('.pairing-stats-dialog'); const ov=document.querySelector('.dialog-overlay'); if(dlg) dlg.remove(); if(ov) ov.remove(); })()\">Close</button>
                </div>
            </div>
            <div class="dialog-overlay" style="position: fixed; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.5); z-index: 999;"></div>
        `;

        this.closePairingStatsDialog();
        document.body.insertAdjacentHTML('beforeend', html);
    }

    /**
     * Show overall pairing statistics for current event (lane usage and opponents)
     */
    async showFullPairingStats() {
        if (!this.selectedEventId || !this.raceManager || !this.raceManager.pairingEngine) {
            this.showToast('Statistics not available yet', 'warning');
            return;
        }

        const bracket = await this.raceManager.getBracket(this.selectedEventId);
        if (!bracket) {
            this.showToast('No bracket data available', 'warning');
            return;
        }

        // Aggregate lane usage across participants in this event
        const classes = Object.keys(bracket.classes || {});
        const laneUsageTotals = {};
        let maxLane = 0;
        let totalLaneAssignments = 0;

        classes.forEach(className => {
            const classData = bracket.classes[className];
            (classData.rounds || []).forEach(round => {
                (round.heats || []).forEach(heat => {
                    (heat.lanes || []).forEach(lane => {
                        if (lane && lane.lane) {
                            maxLane = Math.max(maxLane, lane.lane);
                            if (lane.participant) {
                                laneUsageTotals[lane.lane] = (laneUsageTotals[lane.lane] || 0) + 1;
                                totalLaneAssignments++;
                            }
                        }
                    });
                    // Count wins per lane
                    if (Array.isArray(heat.results) && heat.results.length > 0) {
                        const winner = heat.results.find(r => r.position === 1);
                        if (winner) {
                            const winnerLane = (heat.lanes || []).find(l => l.participant && l.participant.id === winner.participantId);
                            if (winnerLane && winnerLane.lane) {
                                laneUsageTotals[`win_${winnerLane.lane}`] = (laneUsageTotals[`win_${winnerLane.lane}`] || 0) + 1;
                            }
                        }
                    }
                });
            });
        });

        // Event config and per-class stats
        const event = this.dataManager.getEvent(this.selectedEventId) || {};
        const eliminationType = (event.eliminationType || 'single').toString();
        const lanes = event.numberOfTracks || bracket.numberOfLanes || 2;
        const freeRunEnabled = event?.freeRunEnabled === true || event?.freeRunEnabled === 'true';

        const perClassStats = classes.map(className => {
            const classData = bracket.classes[className];
            const rounds = classData.rounds || [];
            const roundsCount = rounds.length;
            let heatsCount = 0;
            rounds.forEach(r => heatsCount += (r.heats || []).length);
            const participantsCount = (classData.participants || []).length;
            return { className, participantsCount, roundsCount, heatsCount };
        });

        const totalHeats = perClassStats.reduce((sum, c) => sum + c.heatsCount, 0);

        // Pair repeat analysis (how many driver pairs have raced more than once)
        const pairCounts = new Map();
        classes.forEach(className => {
            const classData = bracket.classes[className];
            (classData.rounds || []).forEach(round => {
                (round.heats || []).forEach(heat => {
                    const ids = (heat.lanes || [])
                        .map(l => l && l.participant && l.participant.id)
                        .filter(Boolean);
                    for (let i = 0; i < ids.length; i++) {
                        for (let j = i + 1; j < ids.length; j++) {
                            const a = ids[i] < ids[j] ? ids[i] : ids[j];
                            const b = ids[i] < ids[j] ? ids[j] : ids[i];
                            const key = `${a}__${b}`;
                            pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
                        }
                    }
                });
            });
        });
        let uniquePairs = 0;
        let repeatPairs = 0;
        pairCounts.forEach(count => {
            uniquePairs += 1;
            if (count > 1) repeatPairs += 1;
        });

        const laneRows = [];
        for (let lane = 1; lane <= maxLane; lane++) {
            const count = laneUsageTotals[lane] || 0;
            const wins = laneUsageTotals[`win_${lane}`] || 0;
            const pct = totalLaneAssignments > 0 ? Math.round((count / totalLaneAssignments) * 100) : 0;
            const winPct = count > 0 ? Math.round((wins / count) * 100) : 0;
            laneRows.push({ lane, count, pct, wins, winPct });
        }

        const perClassRowsHtml = perClassStats.length ? `
            <table style="width:100%; border-collapse: collapse;">
                <thead>
                    <tr>
                        <th style="text-align:left; padding: 6px; border-bottom: 1px solid var(--border-color);">Class</th>
                        <th style="text-align:right; padding: 6px; border-bottom: 1px solid var(--border-color);">Participants</th>
                        <th style="text-align:right; padding: 6px; border-bottom: 1px solid var(--border-color);">Rounds</th>
                        <th style="text-align:right; padding: 6px; border-bottom: 1px solid var(--border-color);">Heats</th>
                    </tr>
                </thead>
                <tbody>
                    ${perClassStats.map(s => `
                        <tr>
                            <td style=\"padding: 6px;\">${this.escapeHtml(s.className)}</td>
                            <td style=\"padding: 6px; text-align:right;\">${s.participantsCount}</td>
                            <td style=\"padding: 6px; text-align:right;\">${s.roundsCount}</td>
                            <td style=\"padding: 6px; text-align:right;\">${s.heatsCount}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        ` : '<p style="color: var(--text-secondary);">No class data.</p>';

        const contentHtml = `
            <div class="pairing-stats-dialog" style="
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background: var(--bg-primary); border: 2px solid var(--border-color);
                border-radius: 8px; padding: 1.5rem; max-width: 800px; width: 95%;
                z-index: 1000; box-shadow: 0 4px 20px rgba(0,0,0,0.3); max-height: 80vh; overflow-y: auto;
            ">
                <h3 style="color: var(--accent-primary); margin-bottom: 1rem;">
                    <i class="fas fa-chart-bar"></i> Event Pairing Statistics
                </h3>

                <div style="margin-bottom: 1rem;">
                    <h4 style="color: var(--text-primary); margin-bottom: 0.25rem;">Matching Logic Overview</h4>
                    <ul style="margin: 0 0 0.5rem 1.25rem; color: var(--text-secondary);">
                <li>Elimination: <strong style="color: var(--text-primary);">${this.escapeHtml(eliminationType)}</strong></li>
                        <li>Lanes per race: <strong style="color: var(--text-primary);">${lanes}</strong></li>
                        <li>Free Run mode: <strong style="color: var(--text-primary);">${freeRunEnabled ? 'Enabled' : 'Disabled'}</strong></li>
                        <li>Total classes: <strong style="color: var(--text-primary);">${classes.length}</strong>, Total heats: <strong style="color: var(--text-primary);">${totalHeats}</strong></li>
                        <li>Unique driver pairs: <strong style="color: var(--text-primary);">${uniquePairs}</strong> (${repeatPairs} repeated)</li>
                    </ul>
                    <p style="color: var(--text-secondary); font-size: 0.9rem; margin: 0.25rem 0 0;">
                        Balanced mode aims to spread participants evenly across final heats; Free Run fills heats to capacity first. Opponent repeats are minimized by design.
                    </p>
                </div>

                <div style="margin-bottom: 1.25rem;">
                    <h4 style="color: var(--text-primary); margin-bottom: 0.5rem;">Per-Class Summary</h4>
                    ${perClassRowsHtml}
                </div>

                <div style="margin-bottom: 1.5rem;">
                    <h4 style="color: var(--text-primary); margin-bottom: 0.5rem;">Lane Usage (All Heats)</h4>
                    ${laneRows.length ? `
                        <div style="display: grid; gap: 0.75rem;">
                            ${laneRows.map(row => `
                                <div style=\"display: flex; align-items: center; gap: 1rem; padding: 0.5rem; background: var(--bg-secondary); border-radius: 4px;\">
                                    <div style=\"min-width: 60px; text-align: center;\"><strong style=\"color: var(--text-primary);\">Lane ${row.lane}</strong></div>
                                    <div style=\"flex: 1; background: var(--border-color); border-radius: 4px; height: 18px; position: relative;\">
                                        <div style=\"background: #f59e0b; width: ${row.pct}%; height: 100%; border-radius: 4px; position: absolute; left: 0; top: 0;\"></div>
                                        <div style=\"background: #ef4444; width: ${Math.round(row.pct * (row.winPct || 0) / 100)}%; height: 100%; border-radius: 4px; position: absolute; left: 0; top: 0;\"></div>
                                    </div>
                                    <div style=\"min-width: 90px; text-align: right;\">
                                        <span style=\"color: var(--text-primary); font-weight: 600;\">${row.count}</span>
                                        <span style=\"color: var(--text-secondary); font-size: 0.875rem;\"> (${row.pct}% used, ${row.winPct || 0}% wins)</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <p style="color: var(--text-secondary); font-style: italic;">No lane usage data yet.</p>
                    `}
                </div>

                <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1rem;">
                    <button class="btn btn-secondary" onclick=\"(function(){ const dlg=document.querySelector('.pairing-stats-dialog'); const ov=document.querySelector('.dialog-overlay'); if(dlg) dlg.remove(); if(ov) ov.remove(); })()\">Close</button>
                </div>
            </div>
            <div class="dialog-overlay" style="position: fixed; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.5); z-index: 999;"></div>
        `;

        // Remove existing stats dialog if present
        this.closePairingStatsDialog();
        document.body.insertAdjacentHTML('beforeend', contentHtml);
    }

    /**
     * Get participant name by ID
     */
    async getParticipantName(participantId) {
        // Try to find participant name from current event data
        if (this.selectedEventId) {
            const bracket = await this.raceManager.getBracket(this.selectedEventId);
            if (bracket) {
                for (const className in bracket.classes) {
                    const participant = bracket.classes[className].participants.find(p => p.id === participantId);
                    if (participant) {
                        return participant.name;
                    }
                }
            }
        }
        return `Participant ${participantId}`;
    }

    /**
     * Show context menu for participant actions
     */
    async showParticipantContextMenu(event, participantElement) {
        const participantId = participantElement.dataset.participantId;
        const heatId = participantElement.dataset.heatId;

        // Remove existing context menu
        const existingMenu = document.querySelector('.participant-context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        // Get participant info
        const currentHeat = await this.raceManager.getHeat(this.selectedEventId, heatId);
        if (!currentHeat || !currentHeat.lanes) return;

        const laneWithParticipant = currentHeat.lanes.find(lane => lane.participant?.id === participantId);
        const participant = laneWithParticipant?.participant;

        if (!participant) return;
        
        // Create context menu
        const menu = document.createElement('div');
        menu.className = 'participant-context-menu';
        menu.style.position = 'fixed';
        menu.style.zIndex = '1000';
        
        // Check if heat is completed to show appropriate actions
        const isHeatCompleted = currentHeat.status === 'completed';

        menu.innerHTML = `
            <div class="context-menu-header">
                <strong>${participant.name}</strong>
                ${participant.team ? `<span class="team">(${participant.team})</span>` : ''}
                <div class="context-menu-subtitle">${isHeatCompleted ? 'Heat Completed' : 'Lane ' + (laneWithParticipant?.lane || 'N/A')}</div>
            </div>
            ${!isHeatCompleted ? `
                <div class="context-menu-item" data-action="swap-participant">
                    <i class="fas fa-exchange-alt"></i>
                    Swap with Another Driver
                </div>
                <div class="context-menu-item" data-action="swap-same-heat">
                    <i class="fas fa-sync-alt"></i>
                    Swap Within Same Heat
                </div>
                <div class="context-menu-item" data-action="move-to-empty">
                    <i class="fas fa-arrow-right"></i>
                    Move to Empty Lane
                </div>
                <div class="context-menu-item" data-action="move-to-other-heat">
                    <i class="fas fa-external-link-alt"></i>
                    Move to Other Heat
                </div>
                <div class="context-menu-separator"></div>
                <div class="context-menu-item" data-action="false-start">
                    <i class="fas fa-exclamation-triangle"></i>
                    Mark False Start (FS - Last Place)
                </div>
                <div class="context-menu-item danger" data-action="disqualify">
                    <i class="fas fa-ban"></i>
                    Disqualify (Eliminate)
                </div>
            ` : `
                <div class="context-menu-item" data-action="view-results">
                    <i class="fas fa-eye"></i>
                    View Race Results
                </div>
                <div class="context-menu-item" data-action="reset-heat" ${currentHeat.status !== 'completed' ? 'style="display: none;"' : ''}>
                    <i class="fas fa-undo"></i>
                    Reset Heat Results
                </div>
                <div class="context-menu-separator"></div>
                <div class="context-menu-item danger" data-action="disqualify-retroactive">
                    <i class="fas fa-ban"></i>
                    Retroactive Disqualification
                </div>
            `}
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" data-action="add-manual-loss">
                <i class="fas fa-plus-circle"></i>
                Add Manual Loss
            </div>
            <div class="context-menu-item" data-action="remove-manual-loss">
                <i class="fas fa-minus-circle"></i>
                Remove Manual Loss
            </div>
            <div class="context-menu-item" data-action="undo-disqualification">
                <i class="fas fa-undo-alt"></i>
                Undo Disqualification
            </div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" data-action="pairing-analysis">
                <i class="fas fa-chart-line"></i>
                View Pairing Analysis
            </div>
        `;
        
        // Add event listeners
        menu.addEventListener('click', (e) => {
            const action = e.target.closest('.context-menu-item')?.dataset.action;
            if (action) {
                // Pass lane metadata to downstream handlers so swaps/moves are lane-accurate
                this.handleParticipantAction(action, participantId, heatId, currentHeat, laneWithParticipant?.lane);
                menu.remove();
            }
        });
        
        // Close menu when clicking outside
        setTimeout(() => {
            document.addEventListener('click', () => {
                menu.remove();
            }, { once: true });
        }, 100);
        
        document.body.appendChild(menu);
        
        // Smart positioning to prevent menu from going outside viewport
        this.positionContextMenu(menu, event.clientX, event.clientY);
    }

    /**
     * Smart positioning for context menu to prevent it from going outside viewport
     * Rule: EPC17_WORKFLOW.md v1 - improved UX for context menu positioning
     */
    positionContextMenu(menu, cursorX, cursorY) {
        // Get viewport dimensions
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Get menu dimensions (after it's been added to DOM)
        const menuRect = menu.getBoundingClientRect();
        const menuWidth = menuRect.width;
        const menuHeight = menuRect.height;
        
        // Calculate initial position
        let left = cursorX;
        let top = cursorY;
        
        // Check if menu would go off the right edge
        if (left + menuWidth > viewportWidth) {
            left = cursorX - menuWidth;
        }
        
        // Check if menu would go off the bottom edge
        if (top + menuHeight > viewportHeight) {
            top = cursorY - menuHeight;
        }
        
        // Ensure menu doesn't go off the left edge
        if (left < 0) {
            left = 0;
        }
        
        // Ensure menu doesn't go off the top edge
        if (top < 0) {
            top = 0;
        }
        
        // Apply the calculated position
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
    }

    /**
     * Handle participant context menu actions
     */
    async handleParticipantAction(action, participantId, heatId, currentHeat, laneNumber = null) {
        try {
            switch (action) {
                case 'swap-participant':
                    await this.handleSwapParticipant(participantId, heatId, currentHeat, laneNumber);
                    break;
                case 'swap-same-heat':
                    await this.handleSwapSameHeat(participantId, heatId, currentHeat, laneNumber);
                    break;
                case 'move-to-empty':
                    await this.handleMoveToEmpty(participantId, heatId, currentHeat, laneNumber);
                    break;
                case 'move-to-other-heat':
                    await this.handleMoveToOtherHeat(participantId, heatId, currentHeat, laneNumber);
                    break;
                case 'false-start':
                    await this.handleFalseStart(participantId, heatId, currentHeat);
                    break;
                case 'disqualify':
                    await this.handleDisqualify(participantId, heatId, currentHeat);
                    break;
                case 'view-results':
                    await this.showHeatResults(heatId);
                    break;
                case 'reset-heat':
                    await this.resetCompletedHeat(heatId);
                    break;
                case 'disqualify-retroactive':
                    await this.handleRetroactiveDisqualify(participantId, heatId, currentHeat);
                    break;
                case 'pairing-analysis':
                    this.showPairingAnalysis(heatId, participantId);
                    break;
                case 'add-manual-loss': {
                    const bracket = await this.raceManager.getBracket(this.selectedEventId);
                    const cn = currentHeat.className || this.determineHeatClass(heatId, bracket);
                    const result = await this.raceManager.addManualLoss(this.selectedEventId, participantId, cn);
                    this.showToast(`Manual loss added (now ${result.losses}L, ${result.status})`, 'info');
                    await this.renderBrackets(await this.raceManager.getBracket(this.selectedEventId));
                    break;
                }
                case 'remove-manual-loss': {
                    const bracket2 = await this.raceManager.getBracket(this.selectedEventId);
                    const cn2 = currentHeat.className || this.determineHeatClass(heatId, bracket2);
                    const result2 = await this.raceManager.removeManualLoss(this.selectedEventId, participantId, cn2);
                    this.showToast(`Loss removed (now ${result2.losses}L, ${result2.status})`, 'success');
                    await this.renderBrackets(await this.raceManager.getBracket(this.selectedEventId));
                    break;
                }
                case 'undo-disqualification': {
                    const result3 = await this.raceManager.undoDisqualification(this.selectedEventId, participantId, heatId);
                    this.showToast('Disqualification undone', 'success');
                    await this.renderBrackets(await this.raceManager.getBracket(this.selectedEventId));
                    break;
                }
            }
        } catch (error) {
            console.error('Error handling participant action:', error);
            this.showToast(`Error: ${error.message}`, 'error');
        }
    }

    /**
     * Handle swapping participant with another driver
     */
    async handleSwapParticipant(participantId, heatId, currentHeat, laneNumber = null) {
        try {
            window.debugLogger?.debug('RaceUI', 'Starting participant swap for:', participantId, 'in heat:', heatId);
            
            // Get all participants in the same class for this event
            const bracket = await this.raceManager.getBracket(this.selectedEventId);
            if (!bracket) {
                throw new Error('No bracket found for this event');
            }
            
            const className = currentHeat.className || this.determineHeatClass(heatId, bracket);
            window.debugLogger?.debug('RaceUI', 'Determined class:', className);
            
            const classBracket = bracket.classes[className];
            if (!classBracket) {
                throw new Error(`Class "${className}" not found in bracket`);
            }
            
            // Get available participants to swap with (same class, not in current heat)
            const currentHeatParticipantIds = currentHeat.lanes
                .filter(lane => lane.participant)
                .map(lane => lane.participant.id);
            
            window.debugLogger?.debug('RaceUI', 'Current heat participants:', currentHeatParticipantIds);
            window.debugLogger?.debug('RaceUI', 'All class participants:', classBracket.participants.map(p => ({ id: p.id, name: p.name, status: p.status })));
            
            // Get all participants in the same class and round, excluding those in completed heats
            const availableParticipants = [];
            const currentRound = classBracket.currentRound || 1;
            
            for (const round of classBracket.rounds || []) {
                // Only look at the current round
                if (round.roundNumber !== currentRound) {
                    continue;
                }
                
                for (const heat of round.heats || []) {
                    // Skip completed heats
                    if (heat.status === 'completed') {
                        window.debugLogger?.debug('RaceUI', 'Skipping completed heat:', heat.heatNumber || heat.id);
                        continue;
                    }
                    
                    // Skip the current heat
                    if (heat.id === heatId) {
                        continue;
                    }
                    
                    // Add participants from this heat
                    for (const lane of heat.lanes) {
                        if (lane.participant && 
                            !currentHeatParticipantIds.includes(lane.participant.id) &&
                            (lane.participant.status === 'active' || lane.participant.status === 'eliminated' || !lane.participant.status)) {
                            availableParticipants.push(lane.participant);
                        }
                    }
                }
            }
            
            window.debugLogger?.debug('RaceUI', 'Available participants for swap:', availableParticipants.map(p => ({ id: p.id, name: p.name, status: p.status })));
            
            if (availableParticipants.length === 0) {
                this.showToast('No available participants to swap with in this class', 'warning');
                return;
            }
            
            // Show selection dialog
            const selectedParticipant = await this.showParticipantSelectionDialog(
                availableParticipants, 
                'Select participant to swap with:'
            );
            
            if (selectedParticipant) {
                window.debugLogger?.debug('RaceUI', 'User selected participant:', selectedParticipant.name, 'ID:', selectedParticipant.id);
                // Find which heat the selected participant is in
                const targetHeatId = this.findParticipantHeat(selectedParticipant.id, bracket);
                window.debugLogger?.debug('RaceUI', 'Target heat ID for selected participant:', targetHeatId);
                
                if (!targetHeatId) {
                    this.showToast(`Could not find heat for participant ${selectedParticipant.name}`, 'error');
                    return;
                }
                
                // Check the status of both heats before attempting swap
                const sourceHeat = await this.raceManager.getHeat(this.selectedEventId, heatId);
                const targetHeat = await this.raceManager.getHeat(this.selectedEventId, targetHeatId);
                window.debugLogger?.debug('RaceUI', 'Source heat status:', sourceHeat?.status, 'Target heat status:', targetHeat?.status);
                
                // Perform cross-heat swap
                await this.performCrossHeatSwap(participantId, heatId, selectedParticipant.id, targetHeatId, {
                    laneNumber1: laneNumber,
                    laneNumber2: null
                });
                this.showToast(`Swapped ${await this.getParticipantName(participantId)} with ${selectedParticipant.name}`, 'success');
            }
        } catch (error) {
            console.error('? Error in handleSwapParticipant:', error);
            this.showToast(`Swap failed: ${error.message}`, 'error');
        }
    }

    /**
     * Handle moving participant to empty lane in the same heat
     */
    async handleMoveToEmpty(participantId, heatId, currentHeat, laneNumber = null) {
        // Find empty lanes in the current heat
        const emptyLanes = currentHeat.lanes.filter(lane => !lane.participant);
        
        if (emptyLanes.length === 0) {
            this.showToast('No empty lanes available in this heat', 'warning');
            return;
        }
        
        // If only one empty lane, use it directly
        let targetLane;
        if (emptyLanes.length === 1) {
            targetLane = emptyLanes[0];
        } else {
            // Show lane selection dialog
            const laneNumbers = emptyLanes.map(lane => lane.lane);
            const selectedLane = await this.showLaneSelectionDialog(laneNumbers);
            if (selectedLane) {
                targetLane = emptyLanes.find(lane => lane.lane === selectedLane);
            }
        }
        
        if (targetLane) {
            await this.moveParticipantToLane(participantId, heatId, targetLane.lane, laneNumber);
            this.showToast('Participant moved to empty lane', 'success');
        }
    }

    /**
     * Handle swapping participants within the same heat
     */
    async handleSwapSameHeat(participantId, heatId, currentHeat, laneNumber = null) {
        try {
            window.debugLogger?.debug('RaceUI', 'Starting same-heat swap for:', participantId, 'in heat:', heatId);
            
            // Check if heat is completed
            if (currentHeat.status === 'completed') {
                this.showToast('Cannot swap participants in completed heats', 'error');
                return;
            }
            
            // Get other participants in the same heat
            const otherParticipants = currentHeat.lanes
                .filter(lane => lane.participant && lane.participant.id !== participantId)
                .map(lane => ({ ...lane.participant, laneNumber: lane.lane }));
            
            if (otherParticipants.length === 0) {
                this.showToast('No other participants in this heat to swap with', 'warning');
                return;
            }
            
            // Show selection dialog
            const selectedParticipant = await this.showParticipantSelectionDialog(
                otherParticipants, 
                'Select participant to swap with:'
            );
            
            if (selectedParticipant) {
                window.debugLogger?.debug('RaceUI', 'User selected participant for same-heat swap:', selectedParticipant.name);
                // Perform the swap
                await this.performParticipantSwap(participantId, selectedParticipant.id, heatId, {
                    laneNumber1: laneNumber,
                    laneNumber2: selectedParticipant.laneNumber
                });
                this.showToast(`Swapped ${await this.getParticipantName(participantId)} with ${selectedParticipant.name}`, 'success');
            }
        } catch (error) {
            console.error('? Error in handleSwapSameHeat:', error);
            this.showToast(`Same-heat swap failed: ${error.message}`, 'error');
        }
    }

    /**
     * Handle moving participant to empty lane in other heats
     */
    async handleMoveToOtherHeat(participantId, heatId, currentHeat, laneNumber = null) {
        try {
            window.debugLogger?.debug('RaceUI', 'Starting move to other heat for:', participantId, 'from heat:', heatId);
            
            // Check if source heat is completed
            if (currentHeat.status === 'completed') {
                this.showToast('Cannot move participants from completed heats', 'error');
                return;
            }
            
            // Get bracket and class info
            const bracket = await this.raceManager.getBracket(this.selectedEventId);
            if (!bracket) {
                throw new Error('No bracket found for this event');
            }
            
            const className = currentHeat.className || this.determineHeatClass(heatId, bracket);
            const classBracket = bracket.classes[className];
            if (!classBracket) {
                throw new Error(`Class "${className}" not found in bracket`);
            }
            
            // Get current round
            const currentRound = classBracket.currentRound || 1;
            
            // Find all heats in the same class and round with empty lanes (excluding completed heats)
            const heatsWithEmptyLanes = [];
            
            for (const round of classBracket.rounds || []) {
                if (round.roundNumber === currentRound) {
                    for (const heat of round.heats || []) {
                        if (heat.id !== heatId && heat.status !== 'completed') { // Exclude current heat and completed heats
                            const emptyLanes = heat.lanes.filter(lane => !lane.participant);
                            if (emptyLanes.length > 0) {
                                heatsWithEmptyLanes.push({
                                    heat,
                                    emptyLanes,
                                    heatNumber: heat.heatNumber || 'Unknown'
                                });
                            }
                        }
                    }
                }
            }
            
            if (heatsWithEmptyLanes.length === 0) {
                this.showToast('No other heats with empty lanes available in this class and round (completed heats are excluded)', 'warning');
                return;
            }
            
            // Create selection options
            const heatOptions = heatsWithEmptyLanes.map(heatInfo => ({
                id: heatInfo.heat.id,
                name: `Heat ${heatInfo.heatNumber} (${heatInfo.emptyLanes.length} empty lane${heatInfo.emptyLanes.length > 1 ? 's' : ''})`,
                heat: heatInfo.heat,
                emptyLanes: heatInfo.emptyLanes
            }));
            
            // Show heat selection dialog
            const selectedHeatOption = await this.showHeatSelectionDialog(heatOptions);
            
            if (selectedHeatOption) {
                // Show lane selection dialog for the selected heat
                const laneNumbers = selectedHeatOption.emptyLanes.map(lane => lane.lane);
                const selectedLane = await this.showLaneSelectionDialog(laneNumbers);
                
                if (selectedLane) {
                    // Move participant to the selected heat and lane
                    await this.moveParticipantToOtherHeat(participantId, heatId, selectedHeatOption.heat.id, selectedLane, laneNumber);
                    this.showToast(`Moved ${await this.getParticipantName(participantId)} to Heat ${selectedHeatOption.heatNumber}, Lane ${selectedLane}`, 'success');
                }
            }
        } catch (error) {
            console.error('? Error in handleMoveToOtherHeat:', error);
            this.showToast(`Move to other heat failed: ${error.message}`, 'error');
        }
    }

    /**
     * Handle false start (add one loss)
     */
    async handleFalseStart(participantId, heatId, currentHeat) {
        const participant = currentHeat.lanes.find(lane => lane.participant?.id === participantId)?.participant;
        if (!participant) return;
        
        // Add false start penalty immediately
        await this.addFalseStartPenalty(participantId, heatId);
        this.showToast(`False start recorded for ${participant.name} - FS marked, last place assigned`, 'warning');
    }

    /**
     * Handle disqualification (full elimination)
     */
    async handleDisqualify(participantId, heatId, currentHeat) {
        const participant = currentHeat.lanes.find(lane => lane.participant?.id === participantId)?.participant;
        if (!participant) return;
        
        // Disqualify participant immediately
        await this.disqualifyParticipant(participantId, heatId);
        this.showToast(`${participant.name} has been disqualified`, 'error');
    }

    /**
     * Show participant selection dialog
     */
    async showParticipantSelectionDialog(participants, title) {
        return new Promise((resolve) => {
            const dialog = document.createElement('div');
            dialog.className = 'selection-dialog-overlay';
            dialog.innerHTML = `
                <div class="selection-dialog">
                    <div class="dialog-header">
                        <h3>${title}</h3>
                    </div>
                    <div class="search-container" style="margin-bottom: 1rem;">
                        <input type="text" 
                               class="search-input" 
                               placeholder="Search drivers..." 
                               style="
                                   width: 100%; 
                                   padding: 0.5rem; 
                                   border: 1px solid var(--border-color); 
                                   border-radius: 4px; 
                                   background: var(--bg-primary); 
                                   color: var(--text-primary);
                                   font-size: 0.875rem;
                               "
                        >
                    </div>
                    <div class="dialog-content" style="max-height: 300px; overflow-y: auto;">
                        ${participants.map(p => `
                            <div class="participant-option" data-participant-id="${p.id}" data-name="${p.name.toLowerCase()}" data-team="${(p.team || '').toLowerCase()}">
                                <span class="name">${p.name}</span>
                                ${p.team ? `<span class="team">(${p.team})</span>` : ''}
                            </div>
                        `).join('')}
                    </div>
                    <div class="dialog-actions">
                        <button class="btn btn-secondary cancel-btn">Cancel</button>
                    </div>
                </div>
            `;
            
            // Get references to elements
            const searchInput = dialog.querySelector('.search-input');
            const participantOptions = dialog.querySelectorAll('.participant-option');
            const dialogContent = dialog.querySelector('.dialog-content');
            
            // Add search functionality
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase().trim();
                
                participantOptions.forEach(option => {
                    const name = option.dataset.name;
                    const team = option.dataset.team;
                    const matchesSearch = searchTerm === '' || 
                                        name.includes(searchTerm) || 
                                        team.includes(searchTerm);
                    
                    if (matchesSearch) {
                        option.style.display = 'block';
                        // Highlight matching text
                        if (searchTerm !== '') {
                            option.style.backgroundColor = 'var(--bg-secondary)';
                        } else {
                            option.style.backgroundColor = '';
                        }
                    } else {
                        option.style.display = 'none';
                    }
                });
                
                // Show "no results" message if no matches
                const visibleOptions = Array.from(participantOptions).filter(option => 
                    option.style.display !== 'none'
                );
                
                let noResultsMsg = dialog.querySelector('.no-results');
                if (visibleOptions.length === 0 && searchTerm !== '') {
                    if (!noResultsMsg) {
                        noResultsMsg = document.createElement('div');
                        noResultsMsg.className = 'no-results';
                        noResultsMsg.style.cssText = `
                            text-align: center; 
                            padding: 1rem; 
                            color: var(--text-secondary); 
                            font-style: italic;
                        `;
                        noResultsMsg.textContent = 'No drivers found matching your search';
                        dialogContent.appendChild(noResultsMsg);
                    }
                } else if (noResultsMsg) {
                    noResultsMsg.remove();
                }
            });
            
            // Add keyboard navigation
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const visibleOptions = Array.from(participantOptions).filter(option => 
                        option.style.display !== 'none'
                    );
                    if (visibleOptions.length === 1) {
                        // Auto-select if only one result
                        const participantId = visibleOptions[0].dataset.participantId;
                        const participant = participants.find(p => p.id === participantId);
                        dialog.remove();
                        resolve(participant);
                    } else if (visibleOptions.length > 1) {
                        // Focus first visible option
                        visibleOptions[0].focus();
                    }
                }
            });
            
            // Add click handlers
            dialog.addEventListener('click', (e) => {
                if (e.target.classList.contains('participant-option') || e.target.closest('.participant-option')) {
                    const participantId = e.target.closest('.participant-option').dataset.participantId;
                    const participant = participants.find(p => p.id === participantId);
                    dialog.remove();
                    resolve(participant);
                } else if (e.target.classList.contains('cancel-btn') || e.target === dialog) {
                    dialog.remove();
                    resolve(null);
                }
            });
            
            // Focus search input on dialog open
            setTimeout(() => {
                searchInput.focus();
            }, 100);
            
            document.body.appendChild(dialog);
        });
    }

    /**
     * Show lane selection dialog
     */
    async showLaneSelectionDialog(laneNumbers) {
        return new Promise((resolve) => {
            const dialog = document.createElement('div');
            dialog.className = 'selection-dialog-overlay';
            dialog.innerHTML = `
                <div class="selection-dialog">
                    <div class="dialog-header">
                        <h3>Select Empty Lane:</h3>
                    </div>
                    <div class="dialog-content">
                        ${laneNumbers.map(lane => `
                            <div class="lane-option" data-lane="${lane}">
                                Lane ${lane}
                            </div>
                        `).join('')}
                    </div>
                    <div class="dialog-actions">
                        <button class="btn btn-secondary cancel-btn">Cancel</button>
                    </div>
                </div>
            `;
            
            dialog.addEventListener('click', (e) => {
                if (e.target.classList.contains('lane-option')) {
                    const lane = parseInt(e.target.dataset.lane);
                    dialog.remove();
                    resolve(lane);
                } else if (e.target.classList.contains('cancel-btn') || e.target === dialog) {
                    dialog.remove();
                    resolve(null);
                }
            });
            
            document.body.appendChild(dialog);
        });
    }

    /**
     * Show heat selection dialog
     */
    async showHeatSelectionDialog(heatOptions) {
        return new Promise((resolve) => {
            const dialog = document.createElement('div');
            dialog.className = 'selection-dialog-overlay';
            dialog.innerHTML = `
                <div class="selection-dialog">
                    <div class="dialog-header">
                        <h3>Select Heat:</h3>
                    </div>
                    <div class="dialog-content">
                        ${heatOptions.map(heat => `
                            <div class="heat-option" data-heat-id="${heat.id}">
                                ${heat.name}
                            </div>
                        `).join('')}
                    </div>
                    <div class="dialog-actions">
                        <button class="btn btn-secondary cancel-btn">Cancel</button>
                    </div>
                </div>
            `;
            
            dialog.addEventListener('click', (e) => {
                if (e.target.classList.contains('heat-option')) {
                    const heatId = e.target.dataset.heatId;
                    const selectedHeat = heatOptions.find(h => h.id === heatId);
                    dialog.remove();
                    resolve(selectedHeat);
                } else if (e.target.classList.contains('cancel-btn') || e.target === dialog) {
                    dialog.remove();
                    resolve(null);
                }
            });
            
            document.body.appendChild(dialog);
        });
    }

    /**
     * Determine which class a heat belongs to
     */
    determineHeatClass(heatId, bracket) {
        if (!bracket.classes || typeof bracket.classes !== 'object') {
            return null;
        }

        for (const [className, classBracket] of Object.entries(bracket.classes)) {
            for (const round of classBracket.rounds) {
                for (const heat of round.heats) {
                    if (heat.id === heatId) {
                        return className;
                    }
                }
            }
        }
        return null;
    }

    /**
     * Placeholder methods for actual functionality (to be implemented)
     */
    async performParticipantSwap(participantId1, participantId2, heatId, laneHints = null) {
        window.debugLogger?.debug('RaceUI', 'Swapping participants:', participantId1, participantId2, 'in heat:', heatId);

        try {
            const bracket = await this.raceManager.getBracket(this.selectedEventId);
            if (!bracket) {
                throw new Error('No bracket found for event');
            }

            // Ensure bracket has classes property
            if (!bracket.classes || typeof bracket.classes !== 'object') {
                throw new Error('Bracket does not have valid classes structure');
            }

            // Find the specific heat first
            let targetHeat = null;
            let className = null;

            // Search for the specific heat
            for (const [classKey, classBracket] of Object.entries(bracket.classes)) {
                for (const round of classBracket.rounds) {
                    for (const heat of round.heats) {
                        if (heat.id === heatId) {
                            targetHeat = heat;
                            className = classKey;
                            break;
                        }
                    }
                    if (targetHeat) break;
                }
                if (targetHeat) break;
            }

            if (!targetHeat) {
                throw new Error(`Heat ${heatId} not found`);
            }

            // Check if heat is completed (cannot swap in completed heats)
            if (targetHeat.status === 'completed') {
                throw new Error('Cannot swap participants in completed heats');
            }

            // Find both participants in the specific heat only (prefer lane hints)
            let lane1 = null, lane2 = null;
            if (laneHints?.laneNumber1 != null) {
                const hinted = targetHeat.lanes.find(l => l.lane === laneHints.laneNumber1);
                if (hinted?.participant?.id === participantId1) lane1 = hinted;
            }
            if (laneHints?.laneNumber2 != null) {
                const hinted2 = targetHeat.lanes.find(l => l.lane === laneHints.laneNumber2);
                if (hinted2?.participant?.id === participantId2) lane2 = hinted2;
            }
            if (!lane1 || !lane2) {
                for (const lane of targetHeat.lanes) {
                    if (!lane1 && lane.participant?.id === participantId1) lane1 = lane;
                    if (!lane2 && lane.participant?.id === participantId2) lane2 = lane;
                }
            }

            if (!lane1) {
                throw new Error(`Participant ${participantId1} not found in heat ${heatId}`);
            }
            if (!lane2) {
                throw new Error(`Participant ${participantId2} not found in heat ${heatId}`);
            }

            // Perform the swap
            const temp = lane1.participant;
            lane1.participant = lane2.participant;
            lane2.participant = temp;

            // Validate that no heat contains duplicate participants
            const validationResult = this.validateNoDuplicateParticipants(bracket, [heatId], { scope: 'heats-only' });
            if (!validationResult.isValid) {
                throw new Error(`Swap would create duplicate participants: ${validationResult.errors.join(', ')}`);
            }

            window.debugLogger?.debug('RaceUI', 'Duplicate participant validation passed');

            // Save the updated bracket
            await this.dataManager.saveRaceBracket(this.selectedEventId, bracket);

            // Update both local caches with the modified bracket
            this.raceManager.eventBrackets.set(this.selectedEventId, bracket);
            this.dataManager.data.raceBrackets[this.selectedEventId] = bracket;

            // Force synchronization between caches to prevent race conditions
            this.synchronizeBracketCaches(this.selectedEventId);

            // Refresh the affected heat
            await this.refreshHeatDisplay(heatId);

            window.debugLogger?.debug('RaceUI', 'Participant swap completed successfully');

        } catch (error) {
            console.error('? Error swapping participants:', error);
            this.showToast(`Error swapping participants: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Validate that specified heats don't contain duplicate participants
     * Also checks for cross-bracket duplicates to prevent the swap bug
     */
    validateNoDuplicateParticipants(bracket, heatIds, options = {}) {
        const scope = options.scope || 'global'; // 'global' | 'heats-only'
        const errors = [];
        const checkedParticipantIds = new Set();
        const allParticipantLocations = new Map(); // participantId -> [{heatId, lane, participant}]

        if (!bracket || !bracket.classes || typeof bracket.classes !== 'object') {
            return { isValid: true, errors: [] };
        }

        // Global duplicate scan only if scope === 'global'
        if (scope === 'global') {
            for (const [className, classBracket] of Object.entries(bracket.classes)) {
                for (const round of classBracket.rounds) {
                    for (const heat of round.heats) {
                        for (const lane of heat.lanes) {
                            if (lane.participant?.id) {
                                if (!allParticipantLocations.has(lane.participant.id)) {
                                    allParticipantLocations.set(lane.participant.id, []);
                                }
                                allParticipantLocations.get(lane.participant.id).push({
                                    heatId: heat.id,
                                    lane: lane.lane,
                                    participant: lane.participant,
                                    className: className
                                });
                            }
                        }
                    }
                }
            }

            // Check for any participant appearing in multiple locations (duplicates)
            for (const [participantId, locations] of allParticipantLocations) {
                if (locations.length > 1) {
                    const participant = locations[0].participant;
                    const heatList = locations.map(loc => `Heat ${loc.heatId} (Lane ${loc.lane})`).join(', ');
                    errors.push(`Participant ${participant.name} (${participantId}) appears in multiple locations: ${heatList}`);
                }
            }
        }

        // For the specified heats, also do detailed validation
        for (const heatId of heatIds) {
            // Find the heat
            let targetHeat = null;
            for (const [className, classBracket] of Object.entries(bracket.classes)) {
                for (const round of classBracket.rounds) {
                    for (const heat of round.heats) {
                        if (heat.id === heatId) {
                            targetHeat = heat;
                            break;
                        }
                    }
                    if (targetHeat) break;
                }
                if (targetHeat) break;
            }

            if (!targetHeat) {
                errors.push(`Heat ${heatId} not found`);
                continue;
            }

            // Check for duplicates within this specific heat
            const heatParticipantIds = new Set();
            for (const lane of targetHeat.lanes) {
                if (lane.participant?.id) {
                    if (heatParticipantIds.has(lane.participant.id)) {
                        errors.push(`Heat ${heatId} contains duplicate participant ${lane.participant.name} (${lane.participant.id})`);
                    }
                    heatParticipantIds.add(lane.participant.id);
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Repair bracket duplicates for the current event
     */
    async repairBracketDuplicates() {
        try {
            window.debugLogger?.debug('RaceUI', 'Starting bracket repair operation...');

            const bracket = await this.raceManager.getBracket(this.selectedEventId);
            if (!bracket) {
                this.showToast('No bracket found for current event', 'error');
                return false;
            }

            // Run monitoring first to log current state
            await this.monitorForDuplicates();

            // Validate current state
            const validationResult = this.validateNoDuplicateParticipants(bracket, []);
            if (validationResult.isValid) {
                this.showToast('Bracket is already valid - no repairs needed', 'info');
                return true;
            }

            window.debugLogger?.debug('RaceUI', `?? Found ${validationResult.errors.length} duplicate issues in current event. Starting comprehensive repair...`);

            // Attempt comprehensive repair (handles cross-round/cross-class duplicates)
            const repairsMade = this.raceManager.repairBracketDuplicatesComprehensive(bracket);

            if (repairsMade > 0) {
                // Save the repaired bracket
                await this.dataManager.saveRaceBracket(this.selectedEventId, bracket);

                // Update local caches
                this.raceManager.eventBrackets.set(this.selectedEventId, bracket);
                this.dataManager.data.raceBrackets[this.selectedEventId] = bracket;

                this.showToast(`Successfully repaired ${repairsMade} duplicate participant assignments`, 'success');

                // Refresh the display
                this.refreshAllDisplays();

                // Run final monitoring to confirm everything is clean
                await this.monitorForDuplicates();

                return true;
            } else {
                this.showToast('No duplicates found to repair', 'info');

                // Run monitoring to confirm everything is clean
                await this.monitorForDuplicates();

                return true;
            }

        } catch (error) {
            console.error('? Error repairing bracket:', error);
            this.showToast(`Failed to repair bracket: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Repair heat round assignments by checking if heats are in the correct rounds based on their IDs
     */
    repairHeatRoundAssignments(bracket) {
        window.debugLogger?.debug('RaceUI', 'Checking heat round assignments...');
        let fixes = 0;

        for (const [className, classBracket] of Object.entries(bracket.classes)) {
            window.debugLogger?.debug('RaceUI', `?? Checking class: ${className}`);

            // Create a map of heats by ID for easy lookup
            const heatsById = new Map();

            for (const round of classBracket.rounds) {
                for (const heat of round.heats) {
                    heatsById.set(heat.id, {
                        heat,
                        currentRound: round.roundNumber,
                        roundObj: round
                    });
                }
            }

            // Check each heat's round assignment
            for (const [heatId, heatInfo] of heatsById) {
                const expectedRound = this.extractRoundFromHeatId(heatId);

                if (expectedRound !== null && expectedRound !== heatInfo.currentRound) {
                    window.debugLogger?.debug('RaceUI', `?? Heat ${heatId} is in round ${heatInfo.currentRound} but should be in round ${expectedRound}`);

                    // Find the correct round
                    let correctRound = null;
                    for (const round of classBracket.rounds) {
                        if (round.roundNumber === expectedRound) {
                            correctRound = round;
                            break;
                        }
                    }

                    // Create the correct round if it doesn't exist
                    if (!correctRound) {
                        correctRound = {
                            roundNumber: expectedRound,
                            heats: []
                        };
                        classBracket.rounds.push(correctRound);
                        window.debugLogger?.debug('RaceUI', `?? Created missing round ${expectedRound} for class ${className}`);
                    }

                    // Move the heat to the correct round
                    heatInfo.roundObj.heats = heatInfo.roundObj.heats.filter(h => h.id !== heatId);
                    correctRound.heats.push(heatInfo.heat);

                    window.debugLogger?.debug('RaceUI', `?? Moved heat ${heatId} from round ${heatInfo.currentRound} to round ${expectedRound}`);
                    fixes++;
                }
            }
        }

        window.debugLogger?.debug('RaceUI', `?? Round assignment repair completed - ${fixes} fixes applied`);
        return fixes;
    }

    /**
     * Extract round number from heat ID (e.g., 'heat-r2-h3-...' -> 2)
     */
    extractRoundFromHeatId(heatId) {
        if (!heatId || typeof heatId !== 'string') {
            return null;
        }

        // Match pattern: heat-r{round}-h{heat}...
        const match = heatId.match(/^heat-r(\d+)-h\d+/);
        if (match) {
            return parseInt(match[1], 10);
        }

        return null;
    }

    /**
     * Repair corrupted bracket data by removing duplicate participants and fixing round assignments
     * - Removes duplicate participants (keeps first valid instance)
     * - Moves heats to correct rounds based on their IDs
     * - Ensures data integrity across the entire bracket
     */
    async repairCorruptedBracket(eventId) {
        try {
            window.debugLogger?.debug('RaceUI', 'Starting bracket repair for event:', eventId);

            const bracket = await this.raceManager.getBracket(eventId);
            if (!bracket) {
                throw new Error('No bracket found for event');
            }

            let totalDuplicates = 0;
            const repairedParticipants = new Map(); // participantId -> first valid location

            // First pass: identify all participant locations and find duplicates
            for (const [className, classBracket] of Object.entries(bracket.classes)) {
                for (const round of classBracket.rounds) {
                    for (const heat of round.heats) {
                        for (const lane of heat.lanes) {
                            if (lane.participant?.id) {
                                const participantId = lane.participant.id;

                                if (!repairedParticipants.has(participantId)) {
                                    // First occurrence - keep it
                                    repairedParticipants.set(participantId, {
                                        className,
                                        roundNumber: round.roundNumber,
                                        heatId: heat.id,
                                        lane: lane.lane,
                                        participant: lane.participant
                                    });
                                } else {
                                    // Duplicate found - mark for removal
                                    window.debugLogger?.debug('RaceUI', `?? Found duplicate: ${lane.participant.name} in ${className} Round ${round.roundNumber} Heat ${heat.id} Lane ${lane.lane}`);
                                    totalDuplicates++;
                                }
                            }
                        }
                    }
                }
            }

            if (totalDuplicates === 0) {
                this.showToast('No duplicates found - bracket data appears valid', 'info');
                return;
            }

            window.debugLogger?.debug('RaceUI', `?? Found ${totalDuplicates} duplicate participants to remove`);

            // Check and fix round structure issues
            const roundFixes = this.repairHeatRoundAssignments(bracket);
            if (roundFixes > 0) {
                window.debugLogger?.debug('RaceUI', `?? Fixed ${roundFixes} heat round assignment issues`);
                totalDuplicates += roundFixes; // Count round fixes as issues fixed
            }

            // Second pass: remove duplicates, keeping only first occurrence
            for (const [className, classBracket] of Object.entries(bracket.classes)) {
                for (const round of classBracket.rounds) {
                    for (const heat of round.heats) {
                        // Filter out duplicate participants
                        heat.lanes = heat.lanes.filter(lane => {
                            if (!lane.participant?.id) return true; // Keep empty lanes

                            const participantId = lane.participant.id;
                            const firstLocation = repairedParticipants.get(participantId);

                            // Keep only if this is the first valid location
                            if (firstLocation.className === className &&
                                firstLocation.roundNumber === round.roundNumber &&
                                firstLocation.heatId === heat.id &&
                                firstLocation.lane === lane.lane) {
                                return true;
                            }

                            // Remove duplicate
                            return false;
                        });
                    }
                }
            }

            window.debugLogger?.debug('RaceUI', 'Bracket repair completed, saving...');

            // Save the repaired bracket
            await this.dataManager.saveRaceBracket(eventId, bracket);

            // Update caches
            this.raceManager.eventBrackets.set(eventId, bracket);
            this.dataManager.data.raceBrackets[eventId] = bracket;

            // Force refresh UI
            this.forceRefresh();

            this.showToast(`Bracket repaired! Fixed ${totalDuplicates} data integrity issues`, 'success');
            window.debugLogger?.debug('RaceUI', `? Bracket repair successful - fixed ${totalDuplicates} data integrity issues`);

        } catch (error) {
            console.error('? Error repairing bracket:', error);
            this.showToast(`Error repairing bracket: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Debug function to show round information for all heats
     */
    debugRoundInformation() {
        try {
            const bracket = this.raceManager.getCachedBracket(this.selectedEventId);
            if (!bracket) {
                this.showToast('No bracket found for debugging', 'error');
                return;
            }

            window.debugLogger?.debug('RaceUI', 'ROUND DEBUG INFORMATION:');
            window.debugLogger?.debug('RaceUI', '==============================');

            let debugInfo = 'Round Debug Information:\n\n';

            for (const [className, classBracket] of Object.entries(bracket.classes)) {
                debugInfo += `CLASS: ${className}\n`;
                debugInfo += '='.repeat(50) + '\n';

                for (const round of classBracket.rounds || []) {
                    debugInfo += `ROUND ${round.roundNumber}:\n`;

                    if (!round.heats || round.heats.length === 0) {
                        debugInfo += '  (No heats in this round)\n';
                        continue;
                    }

                    for (const heat of round.heats) {
                        const participantCount = heat.lanes?.filter(l => l.participant)?.length || 0;
                        const totalLanes = heat.lanes?.length || 0;
                        debugInfo += `  Heat ${heat.heatNumber || 'N/A'} (${heat.id}): ${participantCount}/${totalLanes} participants\n`;
                    }
                    debugInfo += '\n';
                }
                debugInfo += '\n';
            }

            window.debugLogger?.debug('RaceUI', debugInfo);

            // Also show a modal with the information
            if (typeof Helpers !== 'undefined' && Helpers.showModal) {
                Helpers.showModal('Round Debug Information',
                    `<pre style="font-size: 12px; line-height: 1.4; white-space: pre-wrap;">${debugInfo}</pre>` +
                    '<p><strong>How to use this info:</strong></p>' +
                    '<ul>' +
                    '<li>Each heat shows: Heat Number (Heat ID): participants/total lanes</li>' +
                    '<li>You can only swap between heats in the SAME ROUND</li>' +
                    '<li>If you want to swap Round 2 Heat 3 with Round 2 Heat 5, both must show Round 2</li>' +
                    '<li>If one shows Round 1 and the other Round 2, the swap is blocked by design</li>' +
                    '</ul>'
                );
            }

            this.showToast('Round debug info logged to console and shown in modal', 'info');

        } catch (error) {
            console.error('? Error in debug round information:', error);
            this.showToast(`Debug error: ${error.message}`, 'error');
        }
    }

    /**
     * Synchronize bracket caches to prevent race conditions during rapid operations
     */
    synchronizeBracketCaches(eventId) {
        try {
            window.debugLogger?.debug('RaceUI', 'Synchronizing bracket caches for event:', eventId);

            // Get the most current bracket from dataManager (source of truth)
            const dataManagerBracket = this.dataManager.data.raceBrackets[eventId];
            const raceManagerBracket = this.raceManager.eventBrackets.get(eventId);

            if (!dataManagerBracket) {
                console.warn('?? No bracket found in dataManager cache');
                return;
            }

            // Ensure raceManager cache matches dataManager cache
            if (JSON.stringify(dataManagerBracket) !== JSON.stringify(raceManagerBracket)) {
                window.debugLogger?.debug('RaceUI', 'Cache mismatch detected, synchronizing...');
                this.raceManager.eventBrackets.set(eventId, JSON.parse(JSON.stringify(dataManagerBracket)));
                window.debugLogger?.debug('RaceUI', 'Bracket caches synchronized');
            } else {
                window.debugLogger?.debug('RaceUI', 'Bracket caches already synchronized');
            }
        } catch (error) {
            console.error('? Error synchronizing bracket caches:', error);
        }
    }

    /**
     * Find which heat a participant is in
     */
    findParticipantHeat(participantId, bracket) {
        for (const [className, classBracket] of Object.entries(bracket.classes)) {
            for (const round of classBracket.rounds) {
                for (const heat of round.heats) {
                    for (const lane of heat.lanes) {
                        if (lane.participant?.id === participantId) {
                            return heat.id;
                        }
                    }
                }
            }
        }
        return null;
    }

    /**
     * Perform cross-heat participant swap
     */
    async performCrossHeatSwap(participantId1, heatId1, participantId2, heatId2, laneHints = null) {
        window.debugLogger?.debug('RaceUI', 'Performing cross-heat swap:', participantId1, 'from', heatId1, 'with', participantId2, 'from', heatId2);

        // Initialize variables outside try block to ensure they're always defined
        let heat1 = null, heat2 = null;
        let lane1 = null, lane2 = null;
        let className1 = null, className2 = null;

        try {
            const bracket = await this.raceManager.getBracket(this.selectedEventId);
            if (!bracket) {
                throw new Error('No bracket found for event');
            }

            // Note: Do not auto-repair here. We will proceed using lane hints and local validation only.

            // Search through all classes and heats to find both heats and participants
            let foundHeat1 = false, foundHeat2 = false;

            for (const [className, classBracket] of Object.entries(bracket.classes)) {
                if (foundHeat1 && foundHeat2) break; // Both heats found, no need to search further

                for (const round of classBracket.rounds || []) {
                    if (foundHeat1 && foundHeat2) break; // Both heats found, no need to search further

                    for (const heat of round.heats || []) {
                        if (foundHeat1 && foundHeat2) break; // Both heats found, no need to search further

                        if (heat.id === heatId1 && !foundHeat1) {
                            heat1 = heat;
                            className1 = className;
                            foundHeat1 = true;

                            // Debug: Log all participants in this heat
                            window.debugLogger?.debug('RaceUI', `?? Heat ${heatId1} participants:`, heat.lanes?.map(lane => ({
                                lane: lane.lane,
                                hasParticipant: !!lane.participant,
                                participantId: lane.participant?.id,
                                participantName: lane.participant?.name,
                                participantStatus: lane.participant?.status
                            })) || []);

                            // Prefer lane hints if provided
                            if (laneHints?.laneNumber1 != null) {
                                const hinted = heat.lanes?.find(l => l.lane === laneHints.laneNumber1);
                                if (hinted && hinted.participant?.id === participantId1) {
                                    lane1 = hinted;
                                    window.debugLogger?.debug('RaceUI', `? Found participant ${participantId1} via lane hint in heat ${heatId1}, lane ${hinted.lane}`);
                                }
                            }

                            // Fallback: search by participant id
                            if (!lane1) {
                                for (const lane of heat.lanes || []) {
                                    window.debugLogger?.debug('RaceUI', `?? Checking lane ${lane.lane}: participant ID = ${lane.participant?.id}, looking for ${participantId1}`);
                                    if (lane.participant?.id === participantId1) {
                                        lane1 = lane;
                                        window.debugLogger?.debug('RaceUI', `? Found participant ${participantId1} in heat ${heatId1}, lane ${lane.lane}`);
                                        break;
                                    }
                                }
                            }

                            // If participant not found in lanes, try alternative lookup methods
                            if (!lane1 && heat.lanes?.length > 0) {
                                window.debugLogger?.debug('RaceUI', `?? Participant ${participantId1} not found in lanes, trying alternative lookup...`);

                                // Try more robust lookup with string comparison and null checks
                                for (const lane of heat.lanes || []) {
                                    if (lane.participant && lane.participant.id) {
                                        const laneParticipantId = String(lane.participant.id);
                                        const targetParticipantId = String(participantId1);
                                        window.debugLogger?.debug('RaceUI', `?? Robust lookup - lane ${lane.lane}: comparing '${laneParticipantId}' with '${targetParticipantId}'`);

                                        if (laneParticipantId === targetParticipantId) {
                                            lane1 = lane;
                                            window.debugLogger?.debug('RaceUI', `? Found participant ${participantId1} using robust lookup in heat ${heatId1}, lane ${lane.lane}`);
                                            break;
                                        }
                                    } else {
                                        window.debugLogger?.debug('RaceUI', `?? Lane ${lane.lane} has no valid participant data:`, lane.participant);
                                    }
                                }

                                // If still not found, log all participants for debugging
                                if (!lane1) {
                                    window.debugLogger?.debug('RaceUI', `?? All participants in heat ${heatId1}:`, heat.lanes?.map(lane => ({
                                        lane: lane.lane,
                                        participant: lane.participant,
                                        participantId: lane.participant?.id,
                                        participantName: lane.participant?.name
                                    })) || []);
                                }
                            }
                        }

                        if (heat.id === heatId2 && !foundHeat2) {
                            heat2 = heat;
                            className2 = className;
                            foundHeat2 = true;

                            // Debug: Log all participants in this heat
                            window.debugLogger?.debug('RaceUI', `?? Heat ${heatId2} participants:`, heat.lanes?.map(lane => ({
                                lane: lane.lane,
                                hasParticipant: !!lane.participant,
                                participantId: lane.participant?.id,
                                participantName: lane.participant?.name,
                                participantStatus: lane.participant?.status
                            })) || []);

                            // Prefer lane hints if provided
                            if (laneHints?.laneNumber2 != null) {
                                const hinted = heat.lanes?.find(l => l.lane === laneHints.laneNumber2);
                                if (hinted && hinted.participant?.id === participantId2) {
                                    lane2 = hinted;
                                    window.debugLogger?.debug('RaceUI', `? Found participant ${participantId2} via lane hint in heat ${heatId2}, lane ${hinted.lane}`);
                                }
                            }

                            // Fallback: search by participant id
                            if (!lane2) {
                                for (const lane of heat.lanes || []) {
                                    window.debugLogger?.debug('RaceUI', `?? Checking lane ${lane.lane}: participant ID = ${lane.participant?.id}, looking for ${participantId2}`);
                                    if (lane.participant?.id === participantId2) {
                                        lane2 = lane;
                                        window.debugLogger?.debug('RaceUI', `? Found participant ${participantId2} in heat ${heatId2}, lane ${lane.lane}`);
                                        break;
                                    }
                                }
                            }

                            // If participant not found in lanes, try alternative lookup methods
                            if (!lane2 && heat.lanes?.length > 0) {
                                window.debugLogger?.debug('RaceUI', `?? Participant ${participantId2} not found in lanes, trying alternative lookup...`);

                                // Try more robust lookup with string comparison and null checks
                                for (const lane of heat.lanes || []) {
                                    if (lane.participant && lane.participant.id) {
                                        const laneParticipantId = String(lane.participant.id);
                                        const targetParticipantId = String(participantId2);
                                        window.debugLogger?.debug('RaceUI', `?? Robust lookup - lane ${lane.lane}: comparing '${laneParticipantId}' with '${targetParticipantId}'`);

                                        if (laneParticipantId === targetParticipantId) {
                                            lane2 = lane;
                                            window.debugLogger?.debug('RaceUI', `? Found participant ${participantId2} using robust lookup in heat ${heatId2}, lane ${lane.lane}`);
                                            break;
                                        }
                                    } else {
                                        window.debugLogger?.debug('RaceUI', `?? Lane ${lane.lane} has no valid participant data:`, lane.participant);
                                    }
                                }

                                // If still not found, log all participants for debugging
                                if (!lane2) {
                                    window.debugLogger?.debug('RaceUI', `?? All participants in heat ${heatId2}:`, heat.lanes?.map(lane => ({
                                        lane: lane.lane,
                                        participant: lane.participant,
                                        participantId: lane.participant?.id,
                                        participantName: lane.participant?.name
                                    })) || []);
                                }
                            }
                        }
                    }
                }
            }

            window.debugLogger?.debug('RaceUI', 'Search completed:', {
                heat1Found: !!heat1,
                heat2Found: !!heat2,
                lane1Found: !!lane1,
                lane2Found: !!lane2,
                className1,
                className2
            });

            if (!heat1 || !lane1) {
                // Enhanced error reporting with detailed debugging info
                const heat1Participants = heat1?.lanes?.map(lane => ({
                    lane: lane.lane,
                    participantId: lane.participant?.id,
                    participantName: lane.participant?.name,
                    participantStatus: lane.participant?.status
                })) || [];

                console.error('? Participant lookup failed with detailed diagnostics:', {
                    participantId1,
                    heatId1,
                    heat1Found: !!heat1,
                    lane1Found: !!lane1,
                    heat1Participants,
                    heat1Structure: heat1 ? {
                        id: heat1.id,
                        lanesCount: heat1.lanes?.length || 0,
                        status: heat1.status
                    } : null,
                    availableHeats: Object.keys(bracket.classes).map(className => ({
                        className,
                        heats: bracket.classes[className].rounds?.flatMap(r => r.heats?.map(h => h.id) || []) || []
                    }))
                });

                // Provide more specific error message based on what we found
                if (!heat1) {
                    throw new Error(`Heat ${heatId1} not found in bracket`);
                } else if (!lane1) {
                    const participantNames = heat1Participants.filter(p => p.participantName).map(p => p.participantName);
                    throw new Error(`Participant ${participantId1} not found in heat ${heatId1}. Available participants: ${participantNames.join(', ') || 'none'}`);
                }
            }
            if (!heat2 || !lane2) {
                // Enhanced error reporting with detailed debugging info
                const heat2Participants = heat2?.lanes?.map(lane => ({
                    lane: lane.lane,
                    participantId: lane.participant?.id,
                    participantName: lane.participant?.name,
                    participantStatus: lane.participant?.status
                })) || [];

                console.error('? Participant lookup failed with detailed diagnostics:', {
                    participantId2,
                    heatId2,
                    heat2Found: !!heat2,
                    lane2Found: !!lane2,
                    heat2Participants,
                    heat2Structure: heat2 ? {
                        id: heat2.id,
                        lanesCount: heat2.lanes?.length || 0,
                        status: heat2.status
                    } : null,
                    availableHeats: Object.keys(bracket.classes).map(className => ({
                        className,
                        heats: bracket.classes[className].rounds?.flatMap(r => r.heats?.map(h => h.id) || []) || []
                    }))
                });

                // Provide more specific error message based on what we found
                if (!heat2) {
                    throw new Error(`Heat ${heatId2} not found in bracket`);
                } else if (!lane2) {
                    const participantNames = heat2Participants.filter(p => p.participantName).map(p => p.participantName);
                    throw new Error(`Participant ${participantId2} not found in heat ${heatId2}. Available participants: ${participantNames.join(', ') || 'none'}`);
                }
            }

            // Check if heats are completed and handle appropriately
            window.debugLogger?.debug('RaceUI', 'Heat 1 status:', heat1.status, 'Heat 1 ID:', heatId1, 'Heat 1 number:', heat1.heatNumber);
            window.debugLogger?.debug('RaceUI', 'Heat 2 status:', heat2.status, 'Heat 2 ID:', heatId2, 'Heat 2 number:', heat2.heatNumber);

            // TEMPORARY: Allow override for debugging (remove this in production)
            const allowCompletedHeatSwap = window.location.search.includes('debug=swap');

            // Check if either heat is completed
            const heat1Completed = heat1.status === 'completed';
            const heat2Completed = heat2.status === 'completed';

            if ((heat1Completed || heat2Completed) && !allowCompletedHeatSwap) {
                // For now, allow swaps if at least one heat is active (not completed)
                // This handles cases where one heat might be completed but the other is still active
                if (heat1Completed && heat2Completed) {
                    throw new Error(`Cannot swap participants: both heats are completed (${heat1.heatNumber || heatId1} and ${heat2.heatNumber || heatId2})`);
                } else if (heat1Completed) {
                    console.warn(`?? WARNING: Swapping from completed heat ${heat1.heatNumber || heatId1} to active heat ${heat2.heatNumber || heatId2}`);
                } else if (heat2Completed) {
                    console.warn(`?? WARNING: Swapping from active heat ${heat1.heatNumber || heatId1} to completed heat ${heat2.heatNumber || heatId2}`);
                }
            }

            if (allowCompletedHeatSwap) {
                window.debugLogger?.debug('RaceUI', 'DEBUG MODE: Allowing swap despite completed heat status');
            }

            // Check if participants are the same driver (shouldn't happen in normal swaps)
            if (participantId1 === participantId2) {
                throw new Error('Cannot swap a participant with themselves');
            }

            // Check if the swap is within the same class context
            // Look for both participants in the same class to determine if this is a valid same-class swap
            let sameClassContext = false;
            for (const [className, classBracket] of Object.entries(bracket.classes)) {
                const participant1InClass = classBracket.participants?.some(p => p.id === participantId1);
                const participant2InClass = classBracket.participants?.some(p => p.id === participantId2);

                if (participant1InClass && participant2InClass) {
                    sameClassContext = true;
                    window.debugLogger?.debug('RaceUI', `?? Both participants found in same class: ${className}`);
                    break;
                }
            }

            if (!sameClassContext && className1 !== className2) {
                console.warn('?? WARNING: Cross-class participant swap detected:', {
                    participant1: participantId1,
                    class1: className1,
                    participant2: participantId2,
                    class2: className2
                });

                // Show confirmation dialog for cross-class swaps
                const confirmed = confirm(
                    `WARNING: You are about to swap participants between different racing classes:\n\n` +
                    `� ${await this.getParticipantName(participantId1)} (Heat Class: ${className1})\n` +
                    `� ${await this.getParticipantName(participantId2)} (Heat Class: ${className2})\n\n` +
                    `This action may affect race results and class standings. Are you sure you want to proceed?`
                );

                if (!confirmed) {
                    throw new Error('Cross-class swap cancelled by user');
                }

                window.debugLogger?.debug('RaceUI', 'User confirmed cross-class swap');
            }

            const sourceRound = this.getHeatRound(heatId1, bracket);
            const targetRound = this.getHeatRound(heatId2, bracket);

            window.debugLogger?.debug('RaceUI', 'Round check:', {
                heatId1,
                heatId2,
                sourceRound,
                targetRound,
                roundsMatch: sourceRound === targetRound
            });

            if (sourceRound !== targetRound) {
                throw new Error(`Cannot swap participants between different rounds (Round ${sourceRound} vs Round ${targetRound})`);
            }

            // Perform the cross-heat swap with validation
            window.debugLogger?.debug('RaceUI', 'Before swap:', {
                lane1: { id: lane1.lane, participant: lane1.participant?.name },
                lane2: { id: lane2.lane, participant: lane2.participant?.name }
            });

            // Validate that lanes are different objects
            if (lane1 === lane2) {
                throw new Error('Cannot swap participant with itself - lanes are the same object');
            }

            // Validate that participants are different
            if (lane1.participant?.id === lane2.participant?.id) {
                throw new Error('Cannot swap participant with itself - participants are the same');
            }

            // Validate that both lanes have participants
            if (!lane1.participant) {
                throw new Error(`Lane ${lane1.lane} in heat ${heatId1} is empty`);
            }
            if (!lane2.participant) {
                throw new Error(`Lane ${lane2.lane} in heat ${heatId2} is empty`);
            }

            // Create a backup of the original state for rollback if needed
            const originalLane1Participant = lane1.participant;
            const originalLane2Participant = lane2.participant;

            try {
                // Perform the swap
                lane1.participant = originalLane2Participant;
                lane2.participant = originalLane1Participant;

                window.debugLogger?.debug('RaceUI', 'Swap performed, validating...');

            // Validate that the swap was successful
                if (lane1.participant?.id !== originalLane2Participant?.id) {
                    throw new Error(`Swap validation failed: lane1 should contain participant ${originalLane2Participant?.id}, but contains ${lane1.participant?.id}`);
                }
                if (lane2.participant?.id !== originalLane1Participant?.id) {
                    throw new Error(`Swap validation failed: lane2 should contain participant ${originalLane1Participant?.id}, but contains ${lane2.participant?.id}`);
                }

                window.debugLogger?.debug('RaceUI', 'Swap validation passed');

            // Lightweight post-swap validation without destructive repair
            const validationResult = this.validateNoDuplicateParticipants(bracket, [heatId1, heatId2], { scope: 'heats-only' });
            if (!validationResult.isValid) {
                console.warn('?? Duplicate detected post-swap:', validationResult.errors);
                // Roll back and inform user without mutating bracket globally
                lane1.participant = originalLane1Participant;
                lane2.participant = originalLane2Participant;
                throw new Error(`Swap would create duplicate participants: ${validationResult.errors.join(', ')}`);
            }

                window.debugLogger?.debug('RaceUI', 'Duplicate participant validation passed');

                // Save the updated bracket (ensure this completes before proceeding)
                window.debugLogger?.debug('RaceUI', 'Saving bracket data...');
                await this.dataManager.saveRaceBracket(this.selectedEventId, bracket);

                // Verify the save was successful by checking if data can be retrieved
                const savedBracket = await this.dataManager.getRaceBracket(this.selectedEventId);
                if (!savedBracket) {
                    throw new Error('Failed to save bracket data - data not found after save');
                }

                // Additional verification: check if our swapped participants are in the saved data
                const savedHeat1 = savedBracket.classes?.[className1]?.rounds?.flatMap(r => r.heats)?.find(h => h.id === heatId1);
                const savedHeat2 = savedBracket.classes?.[className2]?.rounds?.flatMap(r => r.heats)?.find(h => h.id === heatId2);

                if (!savedHeat1 || !savedHeat2) {
                    throw new Error('Failed to save bracket data - heats not found after save');
                }

                window.debugLogger?.debug('RaceUI', 'Bracket data saved and verified successfully');

                // Update both local caches with the modified bracket (ensure consistency)
                window.debugLogger?.debug('RaceUI', 'Updating local caches...');
                this.raceManager.eventBrackets.set(this.selectedEventId, bracket);
                this.dataManager.data.raceBrackets[this.selectedEventId] = bracket;

                // Force synchronization between caches to prevent race conditions
                this.synchronizeBracketCaches(this.selectedEventId);

                // Refresh both heats (do this after data is saved to avoid race conditions)
                window.debugLogger?.debug('RaceUI', 'Refreshing heat displays...');
                await this.refreshHeatDisplay(heatId1);
                await this.refreshHeatDisplay(heatId2);

                window.debugLogger?.debug('RaceUI', 'Cross-heat participant swap completed successfully');

            } catch (swapError) {
                // Rollback the swap if it failed
                console.error('? Swap operation failed, rolling back:', swapError);
                lane1.participant = originalLane1Participant;
                lane2.participant = originalLane2Participant;
                throw swapError;
            }

        } catch (error) {
            console.error('? Error performing cross-heat swap:', error);

            // Log available debugging information safely
            const debugInfo = {
                participantId1,
                heatId1,
                participantId2,
                heatId2,
                heat1Found: !!heat1,
                heat2Found: !!heat2,
                lane1Found: !!lane1,
                lane2Found: !!lane2,
                className1,
                className2
            };

            if (heat1 || heat2 || lane1 || lane2) {
                debugInfo.partialState = {
                    heat1: heat1?.id,
                    heat2: heat2?.id,
                    lane1: lane1 ? { id: lane1.lane, participant: lane1.participant?.name } : null,
                    lane2: lane2 ? { id: lane2.lane, participant: lane2.participant?.name } : null
                };
            }

            console.error('? Debug info:', debugInfo);
            this.showToast(`Error performing cross-heat swap: ${error.message}`, 'error');
            throw error;
        }
    }

    async moveParticipantToLane(participantId, heatId, targetLane, sourceLaneNumber = null) {
        window.debugLogger?.debug('RaceUI', 'Moving participant:', participantId, 'to lane:', targetLane, 'in heat:', heatId);

        try {
            const bracket = await this.raceManager.getBracket(this.selectedEventId);
            if (!bracket) {
                throw new Error('No bracket found for event');
            }

            // Ensure bracket has classes property
            if (!bracket.classes || typeof bracket.classes !== 'object') {
                throw new Error('Bracket does not have valid classes structure');
            }

            // Find the heat and participant
            let currentHeat = null;
            let currentLane = null;
            let targetLaneObj = null;
            let className = null;

            // Search through all classes and heats to find the current heat
            for (const [classKey, classBracket] of Object.entries(bracket.classes)) {
                for (const round of classBracket.rounds) {
                    for (const heat of round.heats) {
                        if (heat.id === heatId) {
                            currentHeat = heat;
                            className = classKey;
                            
                            // Prefer source lane hint to avoid lookup ambiguity
                            if (sourceLaneNumber != null) {
                                currentLane = heat.lanes.find(l => l.lane === sourceLaneNumber && l.participant?.id === participantId) || null;
                            }
                            if (!currentLane) {
                                for (const lane of heat.lanes) {
                                    if (lane.participant?.id === participantId) {
                                        currentLane = lane;
                                    }
                                }
                            }
                            // Find target lane
                            targetLaneObj = heat.lanes.find(l => l.lane === targetLane) || null;
                            break;
                        }
                    }
                    if (currentHeat) break;
                }
                if (currentHeat) break;
            }

            if (!currentHeat) {
                throw new Error(`Heat ${heatId} not found`);
            }
            if (!currentLane) {
                throw new Error(`Participant ${participantId} not found in heat ${heatId}`);
            }
            if (!targetLaneObj) {
                throw new Error(`Target lane ${targetLane} not found in heat ${heatId}`);
            }

            // Check if heat is completed (cannot move in completed heats)
            if (currentHeat.status === 'completed') {
                throw new Error('Cannot move participants in completed heats');
            }

            // Check if target lane is empty
            if (targetLaneObj.participant) {
                throw new Error(`Target lane ${targetLane} is not empty`);
            }

            // Perform the move
            targetLaneObj.participant = currentLane.participant;
            currentLane.participant = null;

            // Save the updated bracket
            await this.dataManager.saveRaceBracket(this.selectedEventId, bracket);

            // Update both local caches with the modified bracket
            this.raceManager.eventBrackets.set(this.selectedEventId, bracket);
            this.dataManager.data.raceBrackets[this.selectedEventId] = bracket;

            // Force synchronization between caches to prevent race conditions
            this.synchronizeBracketCaches(this.selectedEventId);

            // Refresh the heat display
            await this.refreshHeatDisplay(heatId);

            window.debugLogger?.debug('RaceUI', 'Participant move completed successfully');

        } catch (error) {
            console.error('? Error moving participant:', error);
            this.showToast(`Error moving participant: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Move participant from one heat to another heat
     */
    async moveParticipantToOtherHeat(participantId, sourceHeatId, targetHeatId, targetLane, sourceLaneNumber = null) {
        window.debugLogger?.debug('RaceUI', 'Moving participant:', participantId, 'from heat:', sourceHeatId, 'to heat:', targetHeatId, 'lane:', targetLane);

        try {
            const bracket = await this.raceManager.getBracket(this.selectedEventId);
            if (!bracket) {
                throw new Error('No bracket found for event');
            }

            // Ensure bracket has classes property
            if (!bracket.classes || typeof bracket.classes !== 'object') {
                throw new Error('Bracket does not have valid classes structure');
            }

            // Pre-validation: Check for existing duplicates before performing move
            const preValidationResult = this.validateNoDuplicateParticipants(bracket, []);
            if (!preValidationResult.isValid) {
                console.warn('?? Bracket already contains duplicates before move. This should not happen.');
                console.warn('Pre-move validation errors:', preValidationResult.errors.slice(0, 3));
            }

            // Find source and target heats
            let sourceHeat = null;
            let targetHeat = null;
            let sourceLane = null;
            let targetLaneObj = null;
            let sourceClassName = null;
            let targetClassName = null;

            // Search through all classes and heats
            for (const [classKey, classBracket] of Object.entries(bracket.classes)) {
                for (const round of classBracket.rounds) {
                    for (const heat of round.heats) {
                        if (heat.id === sourceHeatId) {
                            sourceHeat = heat;
                            sourceClassName = classKey;
                            
                            // Prefer source lane hint for exact match
                            if (sourceLaneNumber != null) {
                                const hinted = heat.lanes.find(l => l.lane === sourceLaneNumber);
                                if (hinted?.participant?.id === participantId) sourceLane = hinted;
                            }
                            if (!sourceLane) {
                                for (const lane of heat.lanes) {
                                    if (lane.participant?.id === participantId) {
                                        sourceLane = lane;
                                    }
                                }
                            }
                        }
                        if (heat.id === targetHeatId) {
                            targetHeat = heat;
                            targetClassName = classKey;
                            
                            // Find target lane
                            for (const lane of heat.lanes) {
                                if (lane.lane === targetLane) {
                                    targetLaneObj = lane;
                                }
                            }
                        }
                    }
                }
            }

            if (!sourceHeat || !sourceLane) {
                throw new Error(`Participant ${participantId} not found in source heat ${sourceHeatId}`);
            }
            if (!targetHeat || !targetLaneObj) {
                throw new Error(`Target heat ${targetHeatId} or lane ${targetLane} not found`);
            }

            // Check if heats are completed (cannot move in completed heats)
            if (sourceHeat.status === 'completed') {
                throw new Error(`Cannot move participants from completed heat ${sourceHeat.heatNumber || sourceHeatId}`);
            }
            if (targetHeat.status === 'completed') {
                throw new Error(`Cannot move participants to completed heat ${targetHeat.heatNumber || targetHeatId}`);
            }

            // Check if target lane is empty
            if (targetLaneObj.participant) {
                throw new Error(`Target lane ${targetLane} is not empty`);
            }

            // Check if the move is within the same class context or if participant exists in target class
            let validClassContext = false;

            // Check if participant exists in source class
            const sourceClassBracket = bracket.classes[sourceClassName];
            const participantInSourceClass = sourceClassBracket?.participants?.some(p => p.id === participantId);

            // Check if participant exists in target class
            const targetClassBracket = bracket.classes[targetClassName];
            const participantInTargetClass = targetClassBracket?.participants?.some(p => p.id === participantId);

            if (sourceClassName === targetClassName) {
                // Same class move - always valid if participant exists in the class
                validClassContext = participantInSourceClass;
            } else {
                // Cross-class move - valid if participant exists in target class
                validClassContext = participantInTargetClass;
            }

            if (!validClassContext) {
                console.warn('?? WARNING: Invalid class context for participant move:', {
                    participant: participantId,
                    sourceClass: sourceClassName,
                    targetClass: targetClassName,
                    participantInSource: participantInSourceClass,
                    participantInTarget: participantInTargetClass
                });

                // Show confirmation dialog for cross-class moves
                const confirmed = confirm(
                    `WARNING: You are about to move a participant between different racing classes:\n\n` +
                    `� Participant will move from Class: ${sourceClassName} to Class: ${targetClassName}\n` +
                    `� Participant exists in source class: ${participantInSourceClass ? 'Yes' : 'No'}\n` +
                    `� Participant exists in target class: ${participantInTargetClass ? 'Yes' : 'No'}\n\n` +
                    `This action may affect race results and class standings. Are you sure you want to proceed?`
                );

                if (!confirmed) {
                    throw new Error('Cross-class move cancelled by user');
                }

                window.debugLogger?.debug('RaceUI', 'User confirmed cross-class move');
            }

            const sourceRound = this.getHeatRound(sourceHeatId, bracket);
            const targetRound = this.getHeatRound(targetHeatId, bracket);
            if (sourceRound !== targetRound) {
                throw new Error('Cannot move participants between different rounds');
            }

            // Perform the move
            const participant = sourceLane.participant;
            sourceLane.participant = null; // Remove from source
            targetLaneObj.participant = participant; // Add to target

            // Save the updated bracket
            await this.dataManager.saveRaceBracket(this.selectedEventId, bracket);

            // Update both local caches with the modified bracket
            this.raceManager.eventBrackets.set(this.selectedEventId, bracket);
            this.dataManager.data.raceBrackets[this.selectedEventId] = bracket;

            // Force synchronization between caches to prevent race conditions
            this.synchronizeBracketCaches(this.selectedEventId);

            // Refresh both heats
            await this.refreshHeatDisplay(sourceHeatId);
            await this.refreshHeatDisplay(targetHeatId);

            window.debugLogger?.debug('RaceUI', 'Participant moved to other heat successfully');

        } catch (error) {
            console.error('? Error moving participant to other heat:', error);
            this.showToast(`Error moving participant: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Monitor for duplicate participants across all brackets
     * This function can be called periodically to detect data corruption early
     */
    async monitorForDuplicates() {
        try {
            const brackets = this.dataManager.data.raceBrackets || {};
            let totalIssues = 0;
            let eventsWithIssues = 0;

            for (const [eventId, bracket] of Object.entries(brackets)) {
                if (!bracket || !bracket.classes) continue;

                const validationResult = this.validateNoDuplicateParticipants(bracket, []);
                if (!validationResult.isValid) {
                    eventsWithIssues++;
                    totalIssues += validationResult.errors.length;

                    console.error(`?? DUPLICATE PARTICIPANTS DETECTED in event ${eventId}:`);
                    console.error(`   Issues found: ${validationResult.errors.length}`);
                    validationResult.errors.slice(0, 5).forEach(error => console.error(`   ${error}`));

                    // Show user notification for critical issues
                    if (validationResult.errors.length > 10) {
                        this.showToast(`Critical: Event ${eventId} has ${validationResult.errors.length} duplicate participant issues. Please run repair.`, 'error');
                    }
                }
            }

            if (totalIssues > 0) {
                console.warn(`?? Duplicate monitoring found ${totalIssues} issues across ${eventsWithIssues} events`);
            } else {
                window.debugLogger?.debug('RaceUI', 'Duplicate monitoring: All brackets are clean');
            }

            return { totalIssues, eventsWithIssues };
        } catch (error) {
            console.error('? Error in duplicate monitoring:', error);
            return { totalIssues: -1, eventsWithIssues: -1 };
        }
    }

    /**
     * Get the round number for a heat
     */
    getHeatRound(heatId, bracket) {
        window.debugLogger?.debug('RaceUI', 'Looking up round for heat:', heatId);

        for (const [className, classBracket] of Object.entries(bracket.classes)) {
            window.debugLogger?.debug('RaceUI', 'Checking class:', className);
            for (const round of classBracket.rounds) {
                window.debugLogger?.debug('RaceUI', 'Checking round:', round.roundNumber, 'with', round.heats?.length || 0, 'heats');
                for (const heat of round.heats) {
                    if (heat.id === heatId) {
                        window.debugLogger?.debug('RaceUI', 'Found heat', heatId, 'in round', round.roundNumber, 'class', className);
                        return round.roundNumber;
                    }
                }
            }
        }

        window.debugLogger?.debug('RaceUI', 'Heat', heatId, 'not found in any round');
        return null;
    }

    async addFalseStartPenalty(participantId, heatId) {
        window.debugLogger?.debug('RaceUI', 'Adding false start penalty for participant:', participantId, 'in heat:', heatId);

        try {
            const bracket = await this.raceManager.getBracket(this.selectedEventId);
            if (!bracket) {
                throw new Error('No bracket found for event');
            }

            // Find which class this heat belongs to
            const heatClassName = this.determineHeatClass(heatId, bracket);
            if (!heatClassName) {
                throw new Error(`Heat ${heatId} not found in any class`);
            }

            window.debugLogger?.debug('RaceUI', `Heat ${heatId} belongs to class: ${heatClassName}`);

            // Find the participant in the specific class only
            const classBracket = bracket.classes[heatClassName];
            if (!classBracket) {
                throw new Error(`Class ${heatClassName} not found in bracket`);
            }

            const participant = classBracket.participants.find(p => p.id === participantId);
            if (!participant) {
                throw new Error(`Participant ${participantId} not found in class ${heatClassName}`);
            }

            // Mark false start status
            participant.falseStartCount = (participant.falseStartCount || 0) + 1;
            
            window.debugLogger?.debug('RaceUI', `?? Added false start penalty to ${participant.name} in class ${heatClassName} only (${participant.falseStartCount} total FS in this class)`);

            // Note: participant can still be active in other classes they're participating in

            // Find and update the current heat to show False Start result
            for (const [className, classBracket] of Object.entries(bracket.classes)) {
                for (const round of classBracket.rounds) {
                    for (const heat of round.heats) {
                        if (heat.id === heatId) {
                            // Add False Start result to heat results if not already there
                            if (!heat.results) heat.results = [];
                            
                            // Remove any existing result for this participant
                            heat.results = heat.results.filter(r => r.participantId !== participantId);
                            
                            // Calculate the last position in this race (number of participants)
                            const lastPosition = heat.lanes.filter(lane => lane.participant).length;
                            
                            // Add False Start result with 'FS' position for visual display
                            // but store the actual last position for ranking purposes
                            heat.results.push({
                                participantId: participantId,
                                position: 'FS', // Keep 'FS' for visual display
                                actualPosition: lastPosition, // Store actual position for ranking
                                result: 'false_start',
                                time: null,
                                falseStart: true, // Keep this flag for tracking
                                timestamp: new Date().toISOString()
                            });
                            
                            // Mark participant in lane for visual display
                            for (const lane of heat.lanes) {
                                if (lane.participant?.id === participantId) {
                                    lane.participant.hasFalseStart = true;
                                    // Do not increment falseStartCount here to avoid double-counting
                                    window.debugLogger?.debug('RaceUI', `?? Updated lane display for False Start participant`);
                                    break;
                                }
                            }
                            
                            // Defer bracket updates to heat completion to avoid double-counting losses
                            
                            break;
                        }
                    }
                }
            }

            // Save the updated bracket
            await this.dataManager.saveRaceBracket(this.selectedEventId, bracket);

            // Update both local caches with the modified bracket
            this.raceManager.eventBrackets.set(this.selectedEventId, bracket);
            this.dataManager.data.raceBrackets[this.selectedEventId] = bracket;

            // Force synchronization between caches to prevent race conditions
            this.synchronizeBracketCaches(this.selectedEventId);

            // Refresh the heat display to show FS marking
            await this.refreshHeatDisplay(heatId);

            // Check if heat should be automatically completed
            await this.checkAndAutoCompleteHeat(heatId);

            window.debugLogger?.debug('RaceUI', 'False start penalty added successfully with FS marking');

        } catch (error) {
            console.error('? Error adding false start penalty:', error);
            this.showToast(`Error adding false start penalty: ${error.message}`, 'error');
            throw error;
        }
    }

    async disqualifyParticipant(participantId, heatId) {
        window.debugLogger?.debug('RaceUI', 'Disqualifying participant:', participantId, 'in heat:', heatId);

        try {
            const bracket = await this.raceManager.getBracket(this.selectedEventId);
            if (!bracket) {
                throw new Error('No bracket found for event');
            }

            // Find which class this heat belongs to
            const heatClassName = this.determineHeatClass(heatId, bracket);
            if (!heatClassName) {
                throw new Error(`Heat ${heatId} not found in any class`);
            }

            window.debugLogger?.debug('RaceUI', `Heat ${heatId} belongs to class: ${heatClassName}`);

            // Find the participant in the specific class only
            const classBracket = bracket.classes[heatClassName];
            if (!classBracket) {
                throw new Error(`Class ${heatClassName} not found in bracket`);
            }

            const participant = classBracket.participants.find(p => p.id === participantId);
            if (!participant) {
                throw new Error(`Participant ${participantId} not found in class ${heatClassName}`);
            }

            // Mark participant as disqualified (DSQ) only in this specific class
            participant.status = 'disqualified';
            participant.disqualificationReason = 'DSQ';
            participant.disqualifiedInHeat = heatId;
            participant.currentBracket = null;
            
            window.debugLogger?.debug('RaceUI', `?? Marked ${participant.name} as disqualified (DSQ) in class ${heatClassName} only`);

            // Note: participant can still be active in other classes they're participating in

            // Find and update the current heat to show DSQ result
            for (const [className, classBracket] of Object.entries(bracket.classes)) {
                for (const round of classBracket.rounds) {
                    for (const heat of round.heats) {
                        if (heat.id === heatId) {
                            // Add DSQ result to heat results if not already there
                            if (!heat.results) heat.results = [];
                            
                            // Remove any existing result for this participant
                            heat.results = heat.results.filter(r => r.participantId !== participantId);
                            
                            // Add DSQ result
                            heat.results.push({
                                participantId: participantId,
                                position: 'DSQ',
                                result: 'disqualified',
                                time: null,
                                disqualified: true,
                                timestamp: new Date().toISOString()
                            });
                            
                            // Keep participant in lane but mark as DSQ for visual display
                            for (const lane of heat.lanes) {
                                if (lane.participant?.id === participantId) {
                                    lane.participant.status = 'disqualified';
                                    lane.participant.disqualificationReason = 'DSQ';
                                    window.debugLogger?.debug('RaceUI', `?? Updated lane display for DSQ participant`);
                                    break;
                                }
                            }
                            break;
                        }
                    }
                }
            }

            // Save the updated bracket
            await this.dataManager.saveRaceBracket(this.selectedEventId, bracket);

            // Update both local caches with the modified bracket
            this.raceManager.eventBrackets.set(this.selectedEventId, bracket);
            this.dataManager.data.raceBrackets[this.selectedEventId] = bracket;

            // Force synchronization between caches to prevent race conditions
            this.synchronizeBracketCaches(this.selectedEventId);

            // Refresh the heat display to show DSQ marking
            await this.refreshHeatDisplay(heatId);

            // Check if heat should be automatically completed
            await this.checkAndAutoCompleteHeat(heatId);

            window.debugLogger?.debug('RaceUI', 'Participant disqualified successfully with DSQ marking');

        } catch (error) {
            console.error('? Error disqualifying participant:', error);
            this.showToast(`Error disqualifying participant: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Check if a heat should be automatically completed (without completing it)
     */
    async shouldAutoCompleteHeat(heatId) {
        const heat = await this.raceManager.getHeat(this.selectedEventId, heatId);
        if (!heat) {
            return false;
        }

        // Get all participants in this heat (handle missing lanes data)
        let participantCount = 0;
        if (heat.lanes) {
            const participants = heat.lanes.filter(lane => lane.participant).map(lane => lane.participant);
            participantCount = participants.length;
        } else if (heat.numberOfLanes) {
            participantCount = heat.numberOfLanes;
            window.debugLogger?.debug('RaceUI', `Using participant count from numberOfLanes: ${participantCount}`);
        } else {
            window.debugLogger?.debug('RaceUI', `shouldAutoCompleteHeat: Heat ${heatId} has no lanes data, determining participant count from other sources`);

            // Try to get count from existing results
            if (heat.results && Array.isArray(heat.results)) {
                const uniqueParticipantIds = new Set(heat.results.map(r => r.participantId));
                participantCount = uniqueParticipantIds.size;
                window.debugLogger?.debug('RaceUI', `Using participant count from results: ${participantCount}`);
            } else {
                // Last resort: assume 4 lanes (common default)
                participantCount = 4;
                console.warn(`Using default participant count: ${participantCount}`);
            }
        }

        // Get all results for this heat (including False Start and DSQ results)
        const heatResults = heat.results || [];
        const pendingResults = this.pendingResults.get(heatId) || [];

        // Combine all results (heat results + pending results)
        const allResults = [...heatResults];

        // Add pending results that aren't already in heat results
        pendingResults.forEach(pendingResult => {
            const exists = allResults.some(result => result.participantId === pendingResult.participantId);
            if (!exists) {
                allResults.push(pendingResult);
            }
        });

        // Count participants with valid positions (exclude FS/DSQ that don't have regular positions)
        const participantsWithValidPositions = allResults.filter(result =>
            result.position > 0 &&
            result.position !== 'FS' &&
            result.position !== 'DSQ' &&
            !result.disqualified &&
            !result.falseStart
        ).length;

        // Count special results (FS/DSQ) that should also count as completion
        const specialResults = allResults.filter(result =>
            (result.position === 'FS' || result.position === 'DSQ') ||
            result.disqualified ||
            result.falseStart
        ).length;

        const totalCompletedParticipants = participantsWithValidPositions + specialResults;

        window.debugLogger?.debug('RaceUI', `shouldAutoCompleteHeat: ${totalCompletedParticipants}/${participantCount} participants have results (valid: ${participantsWithValidPositions}, special: ${specialResults})`);

        return totalCompletedParticipants >= participantCount;
    }

    /**
     * Check if a heat should be automatically completed and complete it if so
     */
    async checkAndAutoCompleteHeat(heatId) {
        window.debugLogger?.debug('RaceUI', 'Checking if heat should be auto-completed:', heatId);

        if (await this.shouldAutoCompleteHeat(heatId)) {
            window.debugLogger?.debug('RaceUI', `? Auto-completing heat ${heatId} - all participants have results`);
            const heat = await this.raceManager.getHeat(this.selectedEventId, heatId);
            const heatResults = heat.results || [];
            const pendingResults = this.pendingResults.get(heatId) || [];
            const allResults = [...heatResults];

            // Add pending results that aren't already in heat results
            pendingResults.forEach(pendingResult => {
                const exists = allResults.some(result => result.participantId === pendingResult.participantId);
                if (!exists) {
                    allResults.push(pendingResult);
                }
            });

            await this.completeHeat(heatId, allResults, heat);
        }
    }

    /**
     * Refresh heat display to show updated positions (FIXED - no more duplication)
     */
    async refreshHeatDisplay(heatId) {
        window.debugLogger?.debug('RaceUI', 'Refreshing heat display for:', heatId);
        const heat = await this.raceManager.getHeat(this.selectedEventId, heatId);
        if (!heat) {
            window.debugLogger?.debug('RaceUI', 'Heat not found:', heatId);
            return;
        }

        window.debugLogger?.debug('RaceUI', 'Heat found:', heat);

        // Find the heat element (could be .heat or .heat-horizontal)
        const heatElement = document.querySelector(`[data-heat-id="${heatId}"]`);

        if (heatElement) {
            window.debugLogger?.debug('RaceUI', 'Updating heat element:', heatElement.className);

            // Check if this is a horizontal heat layout
            const isHorizontal = heatElement.classList.contains('heat-horizontal');

            if (isHorizontal) {
                // Update horizontal heat layout
                const participantsContainer = heatElement.querySelector('.participants-horizontal');
                if (participantsContainer) {
                    const isCompleted = heat.status === 'completed';
                    const updatedParticipantsHTML = heat.lanes.map(lane => this.renderParticipantHorizontal(lane, heat, isCompleted)).join('');
                    participantsContainer.innerHTML = updatedParticipantsHTML;
                    window.debugLogger?.debug('RaceUI', 'Updated horizontal participants container successfully');

                    // Re-bind event listeners for just this heat
                    this.rebindEventListenersForHeat(heatId);
                } else {
                    window.debugLogger?.debug('RaceUI', 'No participants container found in horizontal heat, doing full element refresh');
                    this.forceRefresh();
                }
            } else {
                // Update vertical heat layout (original logic)
                const lanesContainer = heatElement.querySelector('.heat-lanes');
                if (lanesContainer) {
                    // Check if heat truly has results or just pending results
                    const hasActualResults = heat.results && heat.results.length > 0;
                    const updatedLanesHTML = heat.lanes.map(lane => this.renderLane(lane, heat, hasActualResults)).join('');
                    lanesContainer.innerHTML = updatedLanesHTML;
                    window.debugLogger?.debug('RaceUI', 'Updated lanes container successfully');

                    // Re-bind event listeners for just this heat
                    this.rebindEventListenersForHeat(heatId);
                } else {
                    window.debugLogger?.debug('RaceUI', 'No lanes container found, doing full element refresh');
                    this.forceRefresh();
                }
            }
        } else {
            window.debugLogger?.debug('RaceUI', 'Heat element not found, doing full refresh');
            // Force full refresh if heat element not found
            await this.forceRefresh();
        }
    }

    /**
     * Force refresh the entire race interface (for debugging)
     */
    async forceRefresh() {
        window.debugLogger?.debug('RaceUI', 'Force refreshing race interface...');
        if (this.selectedEventId) {
            // Get the most current bracket data from local storage first
            const bracket = this.raceManager.getCachedBracket(this.selectedEventId);
            if (bracket) {
                this.renderBrackets(bracket);
                this.updateGenerateButton(bracket);
                await this.updateEventStats(this.dataManager.getEvent(this.selectedEventId));
                window.debugLogger?.debug('RaceUI', 'Force refresh completed');
            } else {
                window.debugLogger?.debug('RaceUI', 'No bracket found for force refresh');
            }
        }
    }

    /**
     * Rebind event listeners for a specific heat after DOM update (FIXED - no duplicates)
     */
    rebindEventListenersForHeat(heatId) {
        window.debugLogger?.debug('RaceUI', 'Rebinding event listeners for heat:', heatId);

        // Find the heat element (could be .heat or .heat-horizontal)
        const heatElement = document.querySelector(`[data-heat-id="${heatId}"]`);
        if (!heatElement) {
            window.debugLogger?.debug('RaceUI', 'No heat element found for rebinding');
            return;
        }

        window.debugLogger?.debug('RaceUI', 'Rebinding listeners for heat element:', heatElement.className);

        // Add event listeners for participants - handle both horizontal and vertical layouts
        const clickableSelectors = ['.clickable-participant', '.participant-info[data-participant-id]', '.lane-participant[data-participant-id]'];
        const participants = heatElement.querySelectorAll(clickableSelectors.join(', '));

        participants.forEach(participant => {
            // Check if this element already has our listener by checking a data attribute
            if (!participant.dataset.listenerBound) {
                participant.addEventListener('click', (e) => {
                    this.handleParticipantClick(e.currentTarget);
                });
                participant.dataset.listenerBound = 'true';
            }
        });

        // Note: Button event listeners are handled by document-level delegation in bindEventListeners()
        // No need to bind individual button listeners here to avoid duplicates

        window.debugLogger?.debug('RaceUI', `? Rebound listeners for ${participants.length} participants and buttons`);
    }

    /**
     * Debug lower bracket functionality
     */
    debugLowerBracket() {
        if (!this.selectedEventId) {
            window.debugLogger?.debug('RaceUI', 'No event selected');
            return;
        }

        const bracket = this.raceManager.getCachedBracket(this.selectedEventId);
        if (!bracket) {
            window.debugLogger?.debug('RaceUI', 'No bracket found');
            return;
        }
        
        window.debugLogger?.debug('RaceUI', '=== LOWER BRACKET DEBUG ===');
        Object.entries(bracket.classes).forEach(([className, classBracket]) => {
            window.debugLogger?.debug('RaceUI', `\nClass: ${className}`);
            window.debugLogger?.debug('RaceUI', 'Elimination Type:', classBracket.eliminationType);
            window.debugLogger?.debug('RaceUI', 'Current Round:', classBracket.currentRound);
            
            window.debugLogger?.debug('RaceUI', '\nParticipants:');
            classBracket.participants.forEach(p => {
                window.debugLogger?.debug('RaceUI', `  ${p.name}: status=${p.status}, bracket=${p.currentBracket}, wins=${p.wins}, losses=${p.losses}`);
            });
            
            window.debugLogger?.debug('RaceUI', '\nRounds:');
            classBracket.rounds.forEach((round, index) => {
                window.debugLogger?.debug('RaceUI', `  Round ${round.roundNumber} (${round.type}):`);
                round.heats.forEach(heat => {
                    window.debugLogger?.debug('RaceUI', `    Heat ${heat.heatNumber} (${heat.bracketType || 'no bracket type'}): ${heat.status}`);
                    heat.lanes.forEach(lane => {
                        if (lane.participant) {
                            window.debugLogger?.debug('RaceUI', `      Lane ${lane.lane}: ${lane.participant.name}`);
                        }
                    });
                });
            });
        });
        window.debugLogger?.debug('RaceUI', '=== END DEBUG ===');
    }

    /**
     * Reset participant stats (for debugging double counting issues)
     */
    resetParticipantStats() {
        if (!this.selectedEventId) {
            window.debugLogger?.debug('RaceUI', 'No event selected');
            return;
        }

        const bracket = this.raceManager.getCachedBracket(this.selectedEventId);
        if (!bracket) {
            window.debugLogger?.debug('RaceUI', 'No bracket found');
            return;
        }
        
        window.debugLogger?.debug('RaceUI', 'Resetting participant stats...');
        Object.entries(bracket.classes).forEach(([className, classBracket]) => {
            classBracket.participants.forEach(p => {
                p.wins = 0;
                p.losses = 0;
                p.status = 'active';
                p.currentBracket = 'upper';
            });
            
            // Reset heat processing flags
            classBracket.rounds.forEach(round => {
                round.heats.forEach(heat => {
                    heat.resultsProcessed = false;
                });
            });
        });
        
        window.debugLogger?.debug('RaceUI', 'Participant stats reset. Run raceUI.debugLowerBracket() to verify.');
    }

    /**
     * Update result buttons for a heat (legacy method for numbered buttons)
     */
    updateResultButtons(heatId) {
        const heatResults = this.pendingResults.get(heatId) || [];
        const heatElement = document.querySelector(`[data-heat-id="${heatId}"]`);
        
        if (!heatElement) return;
        
        // Update all position buttons
        heatElement.querySelectorAll('.result-position').forEach(button => {
            const position = parseInt(button.dataset.position);
            const participantId = button.dataset.participantId;
            
            // Check if this participant has this position
            const hasPosition = heatResults.some(r => 
                r.participantId === participantId && r.position === position
            );
            
            // Check if this position is taken by someone else
            const positionTaken = heatResults.some(r => 
                r.position === position && r.participantId !== participantId
            );
            
            button.classList.toggle('selected', hasPosition);
            button.classList.toggle('disabled', positionTaken);
        });
    }

    /**
     * Complete a heat with results
     */
    async completeHeat(heatId, results, heat = null) {
        window.debugLogger?.debug('RaceUI', 'Completing heat:', heatId, results);
        
        try {
            const currentHeat = heat || await this.raceManager.getHeat(this.selectedEventId, heatId);
            if (!currentHeat) {
                throw new Error('Heat not found');
            }
            
            // Merge manual results with existing special results (FS/DSQ)
            let finalResults = [...results];
            
            // Add any existing false start or disqualification results
            if (currentHeat.results) {
                const specialResults = currentHeat.results.filter(r => r.falseStart || r.disqualified || r.position === 'FS' || r.position === 'DSQ');
                specialResults.forEach(specialResult => {
                    // Only add if not already in manual results
                    const exists = finalResults.some(r => r.participantId === specialResult.participantId);
                    if (!exists) {
                        finalResults.push(specialResult);
                    }
                });
            }
            
            // Sort results by position (special results like FS/DSQ will be handled by the race manager)
            const sortedResults = finalResults.sort((a, b) => {
                // Handle special positions
                if (a.position === 'FS' || a.position === 'DSQ') return 1; // Put at end
                if (b.position === 'FS' || b.position === 'DSQ') return -1; // Put at end
                return a.position - b.position;
            });
            
            window.debugLogger?.debug('RaceUI', 'Final results for heat completion:', sortedResults);
            
            // Clear pending results BEFORE starting any async operations to prevent race conditions
            // This prevents the UI from showing stale pending data during the completion process
            this.pendingResults.delete(heatId);

            // Update UI immediately after clearing pending results to prevent visual glitches
            // The UI should show no positions until the race completion finishes
            // REMOVED: This caused a "Click to set position" flash before the completed state was rendered
            // await this.updateParticipantPositionDisplay(heatId);

            // ? OPTIMISTIC UI UPDATE: Mark as completed immediately
            // Clone the heat object to avoid mutating the source before save
            const optimisticHeat = JSON.parse(JSON.stringify(currentHeat));
            optimisticHeat.results = sortedResults;
            optimisticHeat.status = 'completed';
            
            // Update the specific heat card visually to "Completed" state immediately
            this.updateCompletedHeat(heatId, optimisticHeat);

            // Queue background processing to prevent race conditions but don't block UI
            this.saveQueue = this.saveQueue.then(async () => {
                try {
                    // Record the result (OPTIMIZED: Returns immediately, defers heavy work)
                    window.debugLogger?.debug('RaceUI', 'completeHeat: Calling recordRaceResult with className:', currentHeat.className, 'heat object:', currentHeat);
                    await this.raceManager.recordRaceResult(
                        this.selectedEventId,
                        currentHeat.className,
                        heatId,
                        sortedResults
                    );
                    
                    // Update scroll anchor tracking after completing a heat
                    await this.updateScrollAnchor();
                    
                    // Update UI - targeted update to preserve other heat states
                    window.debugLogger?.debug('RaceUI', 'Heat completed, updating UI...');
                    const bracket = await this.raceManager.getBracket(this.selectedEventId);
                    
                    // Update generate button based on new state
                    this.updateGenerateButton(bracket);
                    
                    // Update stats
                    await this.updateEventStats(this.dataManager.getEvent(this.selectedEventId));

                    // Check if there are new heats that weren't there before (new rounds generated)
                    const currentHeatCount = this.getCurrentHeatCount();
                    if (this.lastKnownHeatCount !== currentHeatCount) {
                        window.debugLogger?.debug('RaceUI', 'New heats detected, doing full re-render...');
                        this.renderBrackets(bracket);
                        this.lastKnownHeatCount = currentHeatCount;
                    }
                    
                    window.debugLogger?.debug('RaceUI', 'UI update completed (background tasks still processing)');
                    
                    // Check if event is completed and calculate achievements
                    if (this.checkEventCompletionAndCalculateAchievements) {
                        await this.checkEventCompletionAndCalculateAchievements();
                    } else {
                        // Fallback if method doesn't exist or was renamed
                        const event = this.dataManager.getEvent(this.selectedEventId);
                        if (event && event.status === 'completed') {
                            // handle completion
                        }
                    }
                    
                    this.showToast('Heat saved successfully!', 'success');

                } catch (error) {
                    console.error('Error in background processing:', error);
                    this.showToast(`Error saving heat: ${error.message}`, 'error');
                    // TODO: Revert UI state if save fails?
                }
            });
            
        } catch (error) {
            console.error('Error completing heat:', error);
            this.showToast(`Error completing heat: ${error.message}`, 'error');
        }
    }

    /**
     * Update a specific completed heat without full re-render
     */
    updateCompletedHeat(heatId, heat) {
        window.debugLogger?.debug('RaceUI', 'Updating completed heat:', heatId);
        
        // Find all heat elements with this ID
        const heatElements = document.querySelectorAll(`[data-heat-id="${heatId}"]`);
        
        heatElements.forEach(heatElement => {
            // Update heat status
            heatElement.classList.remove('pending', 'active');
            heatElement.classList.add('completed');
            
            // Update heat status text
            const statusElement = heatElement.querySelector('.heat-status');
            if (statusElement) {
                statusElement.textContent = 'completed';
                statusElement.className = 'heat-status completed';
            }
            
            // Update lanes to show final results
            const lanesContainer = heatElement.querySelector('.heat-lanes');
            if (lanesContainer && heat.results) {
                const updatedLanesHTML = heat.lanes.map(lane => this.renderLane(lane, heat, true)).join('');
                lanesContainer.innerHTML = updatedLanesHTML;
            }
            
            // Remove heat actions (start/reset buttons)
            const actionsContainer = heatElement.querySelector('.heat-actions');
            if (actionsContainer) {
                actionsContainer.remove();
            }
        });
        
        window.debugLogger?.debug('RaceUI', `Updated ${heatElements.length} heat elements for completed heat ${heatId}`);
    }

    /**
     * Get current total heat count across all classes and rounds
     */
    getCurrentHeatCount() {
        if (!this.selectedEventId) return 0;

        const bracket = this.raceManager.getCachedBracket(this.selectedEventId);
        if (!bracket) return 0;

        // Ensure bracket has classes property
        if (!bracket.classes || typeof bracket.classes !== 'object') return 0;

        let totalHeats = 0;
        Object.values(bracket.classes).forEach(classBracket => {
            if (classBracket && classBracket.rounds && Array.isArray(classBracket.rounds)) {
                classBracket.rounds.forEach(round => {
                    if (round && round.heats && Array.isArray(round.heats)) {
                        totalHeats += round.heats.length;
                    }
                });
            }
        });

        return totalHeats;
    }

    /**
     * Manual heat completion triggered by button
     */
    async manualCompleteHeat(heatId) {
        const heatResults = this.pendingResults.get(heatId) || [];
        const currentHeat = await this.raceManager.getHeat(this.selectedEventId, heatId);

        if (!currentHeat || !currentHeat.lanes) {
            this.showToast('Unable to load heat data. Please try again.', 'error');
            return;
        }

        // Count actual participants (non-empty lanes)
        const actualParticipants = currentHeat.lanes.filter(lane => lane.participant && lane.participant.id).length;
        
        if (actualParticipants === 0) {
            // Allow completing empty races with confirmation for safety
            window.confirmationModal.show({
                title: 'Empty Heat Detected',
                message: 'This heat has no participants.\n\nThis could happen if all participants were eliminated or moved.\n\nComplete this empty heat to continue the tournament?',
                icon: 'warning',
                iconType: 'fas fa-exclamation-triangle',
                showWarning: true,
                warningText: 'This will complete the heat with no results',
                confirmText: 'Complete Heat',
                cancelText: 'Cancel',
                onConfirm: async () => {
                    window.debugLogger?.debug('RaceUI', `Completing empty heat ${heatId} for tournament continuity`);
                    try {
                        await this.completeHeat(heatId, []); // Complete with empty results
                    } catch (error) {
                        console.error('Error completing empty heat:', error);
                        this.showToast(`Error completing heat: ${error.message}`, 'error');
                    }
                }
            });
            return;
        }
        
        // For heats with only 1 participant, auto-assign them 1st place
        if (actualParticipants === 1 && heatResults.length === 0) {
            const singleParticipant = currentHeat.lanes.find(lane => lane.participant && lane.participant.id);
            if (singleParticipant) {
                const autoResult = [{
                    participantId: singleParticipant.participant.id,
                    position: 1,
                    result: 'finished'
                }];
                
                const confirmMessage = `This heat has only one participant: ${singleParticipant.participant.name}\n\nThey will automatically be assigned 1st place. Continue?`;
                window.confirmationModal.show({
                    title: 'Single Participant Heat',
                    message: confirmMessage,
                    icon: 'info',
                    iconType: 'fas fa-info-circle',
                    confirmText: 'Continue',
                    cancelText: 'Cancel',
                    onConfirm: async () => {
                        try {
                            await this.completeHeat(heatId, autoResult);
                        } catch (error) {
                            console.error('Error auto-completing single participant heat:', error);
                            this.showToast(`Error completing heat: ${error.message}`, 'error');
                        }
                    }
                });
                return;
            }
        }
        
        if (heatResults.length === 0) {
            this.showToast('No positions assigned yet. Click on participant names to set positions.', 'warning');
            return;
        }
        
        // Check for special results (false start or DSQ) that don't need manual positioning
        const specialResults = currentHeat.results ? currentHeat.results.filter(r => 
            r.falseStart || r.position === 'FS' || r.disqualified || r.position === 'DSQ'
        ) : [];
        const participantsNeedingPositions = actualParticipants - specialResults.length;
        
        // Check if all participants that need positions have been positioned
        if (heatResults.length < participantsNeedingPositions) {
            this.showToast(`All ${participantsNeedingPositions} participants must be assigned positions to complete the heat.`, 'warning');
            return;
        }
        
        // Show confirmation with current results
        const assignedParticipants = heatResults.length;
        const emptyLanes = currentHeat.lanes.length - actualParticipants;
        
        let confirmationMessage = `Complete this heat with the following results?\n\n`;
        
        // Add manually assigned positions
        if (heatResults.length > 0) {
            confirmationMessage += heatResults
                .sort((a, b) => a.position - b.position)
                .map(r => {
                    const participant = currentHeat.lanes
                        .find(lane => lane.participant?.id === r.participantId)?.participant;
                    return `${this.getOrdinal(r.position)}: ${participant?.name || 'Unknown'}`;
                })
                .join('\n');
        }
        
        // Add special result participants (false start and DSQ)
        if (specialResults.length > 0) {
            if (heatResults.length > 0) confirmationMessage += '\n';
            confirmationMessage += specialResults
                .map(r => {
                    const participant = currentHeat.lanes
                        .find(lane => lane.participant?.id === r.participantId)?.participant;
                    if (r.falseStart || r.position === 'FS') {
                        return `FS: ${participant?.name || 'Unknown'} (False Start)`;
                    } else if (r.disqualified || r.position === 'DSQ') {
                        return `DSQ: ${participant?.name || 'Unknown'} (Disqualified)`;
                    }
                    return `${r.position}: ${participant?.name || 'Unknown'}`;
                })
                .join('\n');
        }
        
        if (emptyLanes > 0) {
            confirmationMessage += `\n\nNote: This heat has ${emptyLanes} empty lane${emptyLanes > 1 ? 's' : ''}.`;
        }
        
        if (assignedParticipants < actualParticipants) {
            confirmationMessage += `\n\nUnassigned participants will be marked as eliminated.`;
        }
        
        window.confirmationModal.show({
            title: 'Complete Heat',
            message: confirmationMessage,
            icon: 'warning',
            iconType: 'fas fa-flag-checkered',
            showWarning: true,
            warningText: 'This will finalize the heat results',
            confirmText: 'Complete Heat',
            cancelText: 'Cancel',
            onConfirm: async () => {
                try {
                    await this.completeHeat(heatId, heatResults);
                } catch (error) {
                    console.error('Error completing heat:', error);
                    this.showToast(`Error completing heat: ${error.message}`, 'error');
                }
            }
        });
    }

    /**
     * Start a heat
     */
    startHeat(heatId) {
        try {
            // Guard: do not allow starting heats for completed events
            const event = this.dataManager.getEvent(this.selectedEventId);
            if (event && event.status === 'completed') {
                this.showToast('Event is completed. Cannot start new heats.', 'warning');
                return;
            }
            this.raceManager.updateHeatStatus(this.selectedEventId, heatId, 'active');
            
            // Update UI
            const bracket = this.raceManager.getCachedBracket(this.selectedEventId);
            this.renderBrackets(bracket);
            
            this.showToast('Heat started!', 'success');
            
        } catch (error) {
            console.error('Error starting heat:', error);
            this.showToast('Error starting heat', 'error');
        }
    }

    /**
     * Reset a heat (works for both pending and completed heats)
     */
    async resetHeat(heatId) {
        const heat = await this.raceManager.getHeat(this.selectedEventId, heatId);
        if (!heat) {
            this.showToast('Heat not found', 'error');
            return;
        }

        if (heat.status === 'completed') {
            this.resetCompletedHeat(heatId);
        } else {
            this.resetPendingHeat(heatId);
        }
    }

    /**
     * Reset a pending heat (original functionality)
     */
    resetPendingHeat(heatId) {
        window.confirmationModal.show({
            title: 'Reset Heat',
            message: 'Are you sure you want to reset this heat? All results will be lost.',
            icon: 'danger',
            iconType: 'fas fa-undo',
            showWarning: true,
            warningText: 'This action cannot be undone',
            confirmText: 'Reset Heat',
            cancelText: 'Cancel',
                onConfirm: async () => {
                try {
                    this.raceManager.updateHeatStatus(this.selectedEventId, heatId, 'pending');
                    this.pendingResults.delete(heatId);

                    // Update UI
                    const bracket = await this.raceManager.getBracket(this.selectedEventId);
                    this.renderBrackets(bracket);

                    // Update scroll anchor tracking after resetting a heat
                    await this.updateScrollAnchor();
                    
                    this.showToast('Heat reset successfully!', 'success');
                    
                } catch (error) {
                    console.error('Error resetting heat:', error);
                    this.showToast('Error resetting heat', 'error');
                }
            }
        });
    }

    /**
     * Reset a completed heat - clear results and reverse all changes
     */
    async resetCompletedHeat(heatId) {
        const heat = await this.raceManager.getHeat(this.selectedEventId, heatId);
        if (!heat) {
            this.showToast('Heat not found', 'error');
            return;
        }

        // Check if heat can be safely reset
        const safetyCheck = this.raceManager.canSafelyResetHeat(this.selectedEventId, heatId);
        if (!safetyCheck.canReset) {
            // Show detailed warning about why reset is not allowed
            const warningMessage = `?? Cannot Reset Heat\n\n${safetyCheck.reason}\n\n` +
                `To reset this heat, you would need to:\n` +
                `1. Reset all later rounds first\n` +
                `2. Then reset this heat\n` +
                `3. Regenerate the tournament from this point\n\n` +
                `This is a safety feature to maintain tournament integrity.`;
            
            alert(warningMessage);
            return;
        }

        const participantNames = heat.lanes
            .filter(lane => lane.participant)
            .map(lane => lane.participant.name)
            .join(', ');

        const confirmMessage = `Are you sure you want to reset this completed heat?\n\n` +
            `Heat: ${heat.heatNumber || heat.raceNumber}\n` +
            `Participants: ${participantNames}\n\n` +
            `This will:\n` +
            `� Clear all race results\n` +
            `� Reverse participant statistics\n` +
            `� Reset heat status to pending\n` +
            `� Allow re-entry of results\n\n` +
            `This action cannot be undone. Continue?`;

        window.confirmationModal.show({
            title: 'Reset Completed Heat',
            message: confirmMessage,
            icon: 'danger',
            iconType: 'fas fa-undo',
            showWarning: true,
            warningText: 'This will reverse all race results and statistics',
            confirmText: 'Reset Heat',
            cancelText: 'Cancel',
            onConfirm: async () => {
                try {
                    this.showToast('Resetting completed heat...', 'info');
                    
                    await this.raceManager.resetCompletedHeat(this.selectedEventId, heatId);
                    
                    // Clear any pending results for this heat
                    this.pendingResults.delete(heatId);
                    
                    // Update UI
                    const bracket = await this.raceManager.getBracket(this.selectedEventId);
                    this.renderBrackets(bracket);

                    // Update scroll anchor tracking after resetting a completed heat
                    await this.updateScrollAnchor();
                    
                    this.showToast('Completed heat reset successfully! You can now re-enter results.', 'success');
                    
                } catch (error) {
                    console.error('Error resetting completed heat:', error);
                    this.showToast(`Error resetting heat: ${error.message}`, 'error');
                }
            }
        });
    }

    /**
     * Render current round tab
     */
    renderCurrentRound(races) {
        const container = document.getElementById('current-races-container');
        const roundInfo = document.getElementById('round-info');
        
        if (!container || !roundInfo) return;

        if (races.length === 0) {
            roundInfo.innerHTML = '<p>No races in current round</p>';
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i class="fas fa-flag-checkered"></i>
                    </div>
                    <h3>No Current Races</h3>
                    <p>All races in the current round have been completed, or no races have been generated yet.</p>
                </div>
            `;
            return;
        }

        // Group races by class
        const racesByClass = {};
        races.forEach(race => {
            if (!racesByClass[race.className]) {
                racesByClass[race.className] = [];
            }
            racesByClass[race.className].push(race);
        });

        roundInfo.innerHTML = `
            <div class="round-summary">
                <span><strong>${races.length}</strong> races across <strong>${Object.keys(racesByClass).length}</strong> classes</span>
            </div>
        `;

        let html = '';
        Object.entries(racesByClass).forEach(([className, classRaces]) => {
            html += `
                <div class="class-races">
                    <h4>${className} Class</h4>
                    <div class="races-grid">
                        ${classRaces.map(race => this.renderCurrentRaceCard(race)).join('')}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    /**
     * Render current race card
     */
    renderCurrentRaceCard(race) {
        const participantCount = race.lanes.filter(lane => lane.participant).length;
        const isCompleted = race.status === 'completed';
        
        return `
            <div class="race-card ${race.status}">
                <div class="race-header">
                    <h5>Race #${race.raceNumber || race.heatNumber}</h5>
                    <span class="race-status ${race.status}">${race.status}</span>
                </div>
                <div class="race-info">
                    <div class="race-stat">
                        <i class="fas fa-users"></i>
                        <span>${participantCount} participants</span>
                    </div>
                    <div class="race-stat">
                        <i class="fas fa-road"></i>
                        <span>${race.numberOfLanes} lanes</span>
                    </div>
                </div>
                <div class="race-participants">
                    ${race.lanes.filter(lane => lane.participant).map(lane => `
                        <div class="participant-item">
                            <span class="lane-number">L${lane.lane}</span>
                            <span class="participant-name">${lane.participant.name}</span>
                            ${isCompleted && race.results ? `
                                <span class="result-position">
                                    ${this.getResultPosition(race.results, lane.participant.id)}
                                </span>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
                ${!isCompleted ? `
                    <div class="race-actions">
                        ${race.status === 'pending' ? `
                            <button class="btn btn-sm btn-primary start-heat-btn" data-heat-id="${race.id}">
                                <i class="fas fa-play"></i>
                                Start
                            </button>
                        ` : ''}
                        ${race.status === 'active' ? `
                            <span class="active-indicator">
                                <i class="fas fa-circle"></i>
                                In Progress
                            </span>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Get result position for a participant
     */
    getResultPosition(results, participantId) {
        const result = results.find(r => r.participantId === participantId);
        return result ? this.getOrdinal(result.position) : 'N/A';
    }


    /**
     * Escape HTML utility for safe label rendering
     */
    escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }






    /**
     * Check if event is completed and calculate achievements
     */
    async checkEventCompletionAndCalculateAchievements() {
        if (!this.selectedEventId) return;

        try {
            const bracket = await this.raceManager.getBracket(this.selectedEventId);
            if (!bracket) return;

            // Check if all classes are complete (directly check bracket completion status)
            // This is more reliable than checking pendingRaces stats
            window.debugLogger?.debug('RaceUI', 'Checking if event is complete...');
            await this.raceManager.checkAndUpdateEventStatus(this.selectedEventId);
        } catch (error) {
            console.error('Error checking event completion:', error);
            // Don't show error toast for completion check failures
            // as they shouldn't interrupt the main race flow
        }
    }

    /**
     * Manually trigger achievement calculation (for testing/admin use)
     */
    async manuallyCalculateAchievements() { /* Achievements disabled */ }

    /**
     * Update the complete event button visibility based on current event status
     */
    updateCompleteEventButton() {
        const completeEventBtn = document.getElementById('complete-event');
        if (!completeEventBtn || !this.selectedEventId) return;

        const event = this.dataManager.getEvent(this.selectedEventId);
        if (!event) return;

        // Show button only for active events (not completed or upcoming)
        if (event.status === 'active') {
            completeEventBtn.style.display = 'block';
        } else {
            completeEventBtn.style.display = 'none';
        }
    }

    /**
     * Manually complete an event (for admin use when automatic detection fails)
     */
    async manuallyCompleteEvent() {
        if (!this.selectedEventId) {
            this.showToast('Please select an event first', 'warning');
            return;
        }

        const event = this.dataManager.getEvent(this.selectedEventId);
        if (!event) {
            this.showToast('Event not found', 'error');
            return;
        }

        if (event.status === 'completed') {
            this.showToast('Event is already completed', 'info');
            return;
        }

        // Determine readiness by inspecting heats (more reliable than status flags)
        const bracket = await this.raceManager.getBracket(this.selectedEventId);
        if (bracket && bracket.classes) {
            let incompleteRaces = 0;
            Object.values(bracket.classes).forEach(classData => {
                if (classData.rounds) {
                    Object.values(classData.rounds).forEach(round => {
                        if (round.heats) {
                            Object.values(round.heats).forEach(heat => {
                                const isCompleted = heat.status === 'completed' && Array.isArray(heat.results) && heat.results.length > 0;
                                if (!isCompleted) {
                                    incompleteRaces++;
                                }
                            });
                        }
                    });
                }
            });

            if (incompleteRaces > 0) {
                this.showToast(`Cannot complete event: ${incompleteRaces} races are still incomplete. Please finish all races first.`, 'warning');
                return;
            }

            // Ensure class completion flags and winners are set before finalizing the event
            let bracketMutated = false;
            Object.entries(bracket.classes).forEach(([className, classData]) => {
                // If all heats completed, mark class complete and set winner if missing
                const allHeatsCompleted = (classData.rounds || []).every(r => (r.heats || []).every(h => h.status === 'completed' && h.results && h.results.length > 0));
                if (allHeatsCompleted && !classData.isComplete) {
                    classData.isComplete = true;
                    // Attempt to set winner from remaining active participants
                    try {
                        const active = this.raceManager.getActiveParticipants(classData);
                        if (!classData.winner && active && active.length > 0) {
                            classData.winner = active[0];
                        }
                    } catch (e) {
                        // Ignore winner resolution errors; not critical for marking event complete
                    }
                    bracketMutated = true;
                }
            });

            if (bracketMutated) {
                // Persist bracket updates and refresh caches
                await this.dataManager.saveRaceBracket(this.selectedEventId, bracket);
                this.raceManager.eventBrackets.set(this.selectedEventId, bracket);
                this.dataManager.data.raceBrackets[this.selectedEventId] = bracket;
            }
        }

        try {
            window.debugLogger?.debug('RaceUI', 'Manually completing event...');
            this.showToast('Completing event...', 'info');
            
            // Update event status to completed
            await this.dataManager.updateEventStatus(this.selectedEventId, 'completed');
            
            // Achievements disabled
            
            // Update UI
            this.updateCompleteEventButton();
            await this.updateEventStats(event);
            
        } catch (error) {
            console.error('Error manually completing event:', error);
            this.showToast('Error completing event', 'error');
        }
    }

    /**
     * Debug bracket initialization - call this from console
     */
    debugBracketInitialization() {
        window.debugLogger?.debug('RaceUI', 'DEBUG: Starting bracket initialization debug...');
        
        if (!this.selectedEventId) {
            window.debugLogger?.debug('RaceUI', 'No event selected');
            return;
        }
        
        const event = this.dataManager.getEvent(this.selectedEventId);
        window.debugLogger?.debug('RaceUI', 'Event:', event);
        window.debugLogger?.debug('RaceUI', 'Event classes:', event?.classSettings);
        
        const participants = this.raceManager.getEventParticipants(this.selectedEventId);
        window.debugLogger?.debug('RaceUI', 'Event participants:', participants);
        
        participants.forEach(p => {
            window.debugLogger?.debug('RaceUI', `  ?? ${p.name}:`, {
                selectedClasses: p.selectedClasses,
                sledClasses: p.sledClasses,
                eventId: p.eventId
            });
        });
        
        // Try grouping participants by class manually
        window.debugLogger?.debug('RaceUI', 'Testing participant grouping...');
        try {
            const grouped = this.raceManager.groupParticipantsByClass(participants, event);
            window.debugLogger?.debug('RaceUI', 'Grouped participants by class:', grouped);
            
            Object.entries(grouped).forEach(([className, classParticipants]) => {
                window.debugLogger?.debug('RaceUI', `  ?? ${className}: ${classParticipants.length} participants`);
                classParticipants.forEach(p => {
                    window.debugLogger?.debug('RaceUI', `    ?? ${p.name} (was: ${p.selectedClasses || p.sledClasses})`);
                });
            });
        } catch (error) {
            console.error('? Error grouping participants:', error);
        }
        
        // Check existing bracket
        const bracket = this.raceManager.getCachedBracket(this.selectedEventId);
        if (bracket) {
            window.debugLogger?.debug('RaceUI', 'Existing bracket:', bracket);
            window.debugLogger?.debug('RaceUI', 'Bracket classes:', Object.keys(bracket.classes));
            Object.entries(bracket.classes).forEach(([className, classBracket]) => {
                window.debugLogger?.debug('RaceUI', `  ?? ${className}: ${classBracket.participants.length} participants`);
            });
        } else {
            window.debugLogger?.debug('RaceUI', 'No existing bracket found');
        }
    }

    /**
     * Quick fix - distribute participants evenly across all event classes
     */
    quickFixClassDistribution() {
        window.debugLogger?.debug('RaceUI', 'Quick fix: Distributing participants across classes...');
        
        if (!this.selectedEventId) {
            window.debugLogger?.debug('RaceUI', 'No event selected');
            return;
        }
        
        const event = this.dataManager.getEvent(this.selectedEventId);
        if (!event || !event.classSettings) {
            window.debugLogger?.debug('RaceUI', 'Event has no class settings');
            return;
        }
        
        const eventClasses = event.classSettings.filter(cs => cs.enabled !== false);
        const participants = this.raceManager.getEventParticipants(this.selectedEventId);
        
        window.debugLogger?.debug('RaceUI', `?? Event has ${eventClasses.length} classes:`, eventClasses.map(c => c.className));
        window.debugLogger?.debug('RaceUI', `?? Event has ${participants.length} participants`);
        
        if (eventClasses.length === 0) {
            window.debugLogger?.debug('RaceUI', 'No enabled classes in event');
            return;
        }
        
        // Distribute participants evenly across classes
        participants.forEach((participant, index) => {
            const classIndex = index % eventClasses.length;
            const assignedClass = eventClasses[classIndex];
            
            window.debugLogger?.debug('RaceUI', `?? Assigning ${participant.name} to ${assignedClass.className}`);
            
            // Update participant's selected classes
            this.dataManager.updateParticipant(participant.id, {
                selectedClasses: [assignedClass.className]
            });
        });
        
        window.debugLogger?.debug('RaceUI', 'Quick fix complete! Try initializing brackets again.');
        alert(`Fixed! Distributed ${participants.length} participants across ${eventClasses.length} classes. Try initializing brackets again.`);
    }

    /**
     * Show heat results in a modal
     */
    async showHeatResults(heatId) {
        const heat = await this.raceManager.getHeat(this.selectedEventId, heatId);
        if (!heat || !heat.results || heat.results.length === 0) {
            this.showToast('No results found for this heat', 'info');
            return;
        }

        // Sort results by position
        const sortedResults = [...heat.results].sort((a, b) => a.position - b.position);
        
        let resultsHtml = `
            <div class="heat-results-modal">
                <h3>Heat ${heat.heatNumber || heat.raceNumber} Results</h3>
                <div class="results-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Position</th>
                                <th>Participant</th>
                                <th>Team</th>
                                <th>Lane</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        sortedResults.forEach(result => {
            const participant = heat.lanes.find(lane => lane.participant?.id === result.participantId)?.participant;
            const lane = heat.lanes.find(lane => lane.participant?.id === result.participantId)?.lane;
            
            if (participant) {
                resultsHtml += `
                    <tr>
                        <td><strong>${this.getOrdinal(result.position)}</strong></td>
                        <td>${participant.name}</td>
                        <td>${participant.team || '-'}</td>
                        <td>Lane ${lane}</td>
                    </tr>
                `;
            }
        });

        resultsHtml += `
                        </tbody>
                    </table>
                </div>
                <div class="modal-actions">
                    <button class="btn btn-secondary" onclick="closeHeatResultsModal()">Close</button>
                    <button class="btn btn-warning" onclick="resetCompletedHeatFromModal('${heatId}')">
                        <i class="fas fa-undo"></i> Reset Heat
                    </button>
                </div>
            </div>
        `;

        // Show modal
        const modal = document.getElementById('race-result-modal');
        const content = document.getElementById('race-result-content');
        if (modal && content) {
            content.innerHTML = resultsHtml;
            modal.style.display = 'block';
        }
    }

    /**
     * Show advanced reset options for tournament administrators
     */
    async showAdvancedResetOptions(heatId) {
        const heat = await this.raceManager.getHeat(this.selectedEventId, heatId);
        if (!heat) {
            this.showToast('Heat not found', 'error');
            return;
        }

        const safetyCheck = this.raceManager.canSafelyResetHeat(this.selectedEventId, heatId);
        if (safetyCheck.canReset) {
            // If heat can be reset normally, just do that
            this.resetCompletedHeat(heatId);
            return;
        }

        // Show advanced options for heats that cannot be reset normally
        const advancedMessage = `?? Advanced Reset Required\n\n${safetyCheck.reason}\n\n` +
            `Advanced Options:\n\n` +
            `1. Reset Round ${heat.roundNumber} and all subsequent rounds\n` +
            `   - This will reset the entire tournament from this point\n` +
            `   - All later rounds will be deleted\n` +
            `   - You can then regenerate the tournament\n\n` +
            `2. Cancel and keep current results\n\n` +
            `?? WARNING: Option 1 is a destructive operation that will delete tournament progress.\n` +
            `Only use this if you are certain you want to restart the tournament from this point.`;

        window.confirmationModal.show({
            title: 'Advanced Reset Required',
            message: advancedMessage,
            icon: 'danger',
            iconType: 'fas fa-exclamation-triangle',
            showWarning: true,
            warningText: 'This is a destructive operation that will delete tournament progress',
            confirmText: 'Proceed with Advanced Reset',
            cancelText: 'Keep Current Results',
            onConfirm: () => {
                this.performAdvancedReset(heat.className, heat.roundNumber);
            }
        });
    }

    /**
     * Perform advanced reset of round and subsequent rounds
     */
    async performAdvancedReset(className, roundNumber) {
        window.confirmationModal.show({
            title: '?? FINAL CONFIRMATION',
            message: `You are about to reset Round ${roundNumber} and ALL subsequent rounds for ${className}.\n\n` +
                `This will:\n` +
                `� Delete all heats in Round ${roundNumber} and later rounds\n` +
                `� Reset participant statuses\n` +
                `� Reverse all statistics from these rounds\n` +
                `� Allow you to regenerate the tournament from this point\n\n` +
                `?? This action cannot be undone!\n\n` +
                `Are you absolutely sure you want to proceed?`,
            icon: 'danger',
            iconType: 'fas fa-exclamation-triangle',
            showWarning: true,
            warningText: 'This will permanently delete tournament progress',
            confirmText: 'Yes, Reset Everything',
            cancelText: 'Cancel',
            onConfirm: async () => {
                try {
                    this.showToast('Performing advanced reset...', 'info');
                    
                    const result = await this.raceManager.resetRoundAndSubsequentRounds(
                        this.selectedEventId, 
                        className, 
                        roundNumber
                    );
                    
                    // Refresh the UI
                    const bracket = await this.raceManager.getBracket(this.selectedEventId);
                    this.renderBrackets(bracket);
                    
                    this.showToast(
                        `Advanced reset completed! Reset ${result.resetHeats} heats from rounds: ${result.resetRounds}`, 
                        'success'
                    );
                    
                } catch (error) {
                    console.error('Error performing advanced reset:', error);
                    this.showToast(`Advanced reset failed: ${error.message}`, 'error');
                }
            }
        });
    }
}

// Ensure global availability
if (typeof window !== 'undefined') {
    window.RaceUI = RaceUI;
    
    // Expose debug functions globally when race UI is available
    if (window.raceUI) {
        window.debugBracketInit = () => window.raceUI.debugBracketInitialization();
        window.quickFixClasses = () => window.raceUI.quickFixClassDistribution();
    }
    
    // Initialize search and sort functionality
    if (typeof window.allRacesEventsData !== 'undefined') {
        window.debugLogger?.debug('RaceUI', 'Search and sort functionality initialized for races page');
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RaceUI;
}
