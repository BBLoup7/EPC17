/**
 * Sidebar Navigation System
 * Handles collapsible sidebar navigation and top tab bars
 */
class SidebarNavigation {
    constructor() {
        this.sidebar = null;
        this.overlay = null;
        this.toggle = null;
        this.isOpen = false;
        this.isCollapsed = false;
        this.isMobile = window.innerWidth <= 768;
        
        this.init();
        this.setupEventListeners();
    }

    init() {
        // Create sidebar if it doesn't exist
        if (!document.querySelector('.sidebar')) {
            this.createSidebar();
        }
        
        // Create top navigation if it doesn't exist
        if (!document.querySelector('.top-nav')) {
            this.createTopNav();
        }
        
        // Get references
        this.sidebar = document.querySelector('.sidebar');
        this.overlay = document.querySelector('.sidebar-overlay');
        this.toggle = document.querySelector('.sidebar-toggle, .top-nav-toggle');
        
        // Set initial state
        this.updateLayout();
        
        // Set active navigation item
        this.setActiveNavItem();

        // Load version from server
        this.loadVersion();
    }

    createSidebar() {
        const sidebar = document.createElement('div');
        sidebar.className = 'sidebar';
        sidebar.innerHTML = `
            <div class="sidebar-header">
                <div class="sidebar-brand">
                    <div class="brand-text">
                        <span class="brand-main">EPC TECHNOLOGY</span>
                        <span class="brand-sub">powered by EACDQ</span>
                    </div>
                </div>
                <button class="sidebar-toggle" aria-label="Collapse sidebar">
                    <i class="fas fa-chevron-left"></i>
                </button>
            </div>
            <nav class="sidebar-nav">
                <ul class="sidebar-nav-links">
                    <li><a href="index.html" title="Home"><i class="fas fa-home"></i> <span class="nav-text">Home</span></a></li>
                    
                    <!-- Drivers Group -->
                    <li class="nav-group">
                        <div class="nav-group-header" data-group="drivers">
                            <i class="fas fa-users"></i>
                            <span class="nav-text">Drivers</span>
                            <i class="fas fa-chevron-down nav-group-toggle"></i>
                        </div>
                        <ul class="nav-group-items" data-group="drivers">
                            <li><a href="registration.html" title="Registration"><i class="fas fa-edit"></i> <span class="nav-text">Registration</span></a></li>
                            <li><a href="participants.html" title="Participants"><i class="fas fa-users"></i> <span class="nav-text">Participants</span></a></li>
                            <li><a href="existing-drivers.html" title="Existing Drivers"><i class="fas fa-user-plus"></i> <span class="nav-text">Existing Drivers</span></a></li>
                            <li><a href="driver-profile.html" title="Driver Profile"><i class="fas fa-id-card"></i> <span class="nav-text">Driver Profile</span></a></li>
                        </ul>
                    </li>
                    
                    <!-- Series Group -->
                    <li class="nav-group">
                        <div class="nav-group-header" data-group="series">
                            <i class="fas fa-trophy"></i>
                            <span class="nav-text">Series</span>
                            <i class="fas fa-chevron-down nav-group-toggle"></i>
                        </div>
                        <ul class="nav-group-items" data-group="series">
                            <li><a href="series.html" title="Series"><i class="fas fa-trophy"></i> <span class="nav-text">Series</span></a></li>
                        </ul>
                    </li>
                    
                    <!-- Events Group -->
                    <li class="nav-group">
                        <div class="nav-group-header" data-group="events">
                            <i class="fas fa-calendar-alt"></i>
                            <span class="nav-text">Events</span>
                            <i class="fas fa-chevron-down nav-group-toggle"></i>
                        </div>
                        <ul class="nav-group-items" data-group="events">
                            <li><a href="events.html" title="Events"><i class="fas fa-calendar-alt"></i> <span class="nav-text">Events</span></a></li>
                            <li><a href="races.html" title="Races"><i class="fas fa-flag-checkered"></i> <span class="nav-text">Races</span></a></li>
                            <li><a href="final-results.html" title="Final Results"><i class="fas fa-trophy"></i> <span class="nav-text">Final Results</span></a></li>
                            <li><a href="event-analytics.html" title="Event Analytics"><i class="fas fa-chart-line"></i> <span class="nav-text">Event Analytics</span></a></li>
                        </ul>
                    </li>
                    
                    <!-- Other Pages -->
                    <li><a href="analytics.html" title="Analytics"><i class="fas fa-chart-bar"></i> <span class="nav-text">Analytics</span></a></li>
                    <li><a href="live-display.html" title="Live Display"><i class="fas fa-desktop"></i> <span class="nav-text">Live Display</span></a></li>
                    <li><a href="animator.html" title="Animator"><i class="fas fa-microphone-alt"></i> <span class="nav-text">Animator</span></a></li>
                </ul>
            </nav>
            <div class="sidebar-footer">
                <div class="sidebar-footer-content">
                    <button class="sidebar-logout-btn" title="Logout" aria-label="Logout">
                        <i class="fas fa-sign-out-alt"></i>
                        <span class="logout-text">Logout</span>
                    </button>
                    <div class="sidebar-version" id="sidebar-version">Loading...</div>
                </div>
            </div>
        `;
        
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        
        document.body.appendChild(sidebar);
        document.body.appendChild(overlay);
    }

    createTopNav() {
        const topNav = document.createElement('div');
        topNav.className = 'top-nav';
        topNav.innerHTML = `
            <div class="top-nav-brand">
                <div class="brand-text">
                    <span class="brand-main">EPC TECHNOLOGY</span>
                    <span class="brand-sub">powered by EACDQ</span>
                </div>
            </div>
            <button class="top-nav-toggle" aria-label="Toggle navigation menu">
                <span class="hamburger-line"></span>
                <span class="hamburger-line"></span>
                <span class="hamburger-line"></span>
            </button>
        `;
        
        document.body.insertBefore(topNav, document.body.firstChild);
    }

    setupEventListeners() {
        // Toggle button events
        document.addEventListener('click', (e) => {
            if (e.target.closest('.sidebar-toggle')) {
                e.preventDefault();
                this.toggleCollapse();
            }
            
            if (e.target.closest('.top-nav-toggle')) {
                e.preventDefault();
                this.toggleSidebar();
            }
            
            // Handle nav group toggles
            if (e.target.closest('.nav-group-header')) {
                e.preventDefault();
                this.toggleNavGroup(e.target.closest('.nav-group-header'));
            }

            // Handle logout button
            if (e.target.closest('.sidebar-logout-btn')) {
                e.preventDefault();
                if (window.Auth && window.Auth.logout) {
                    window.Auth.logout();
                }
            }
            
            // Close sidebar when clicking overlay
            if (e.target.classList.contains('sidebar-overlay')) {
                this.closeSidebar();
            }
            
            // Close sidebar when clicking outside on mobile
            if (this.isMobile && this.isOpen && !e.target.closest('.sidebar')) {
                this.closeSidebar();
            }
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            const wasMobile = this.isMobile;
            this.isMobile = window.innerWidth <= 768;
            
            if (wasMobile !== this.isMobile) {
                this.updateLayout();
            }
        });

        // Handle escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.closeSidebar();
            }
        });
    }

    toggleSidebar() {
        if (this.isOpen) {
            this.closeSidebar();
        } else {
            this.openSidebar();
        }
    }

    toggleCollapse() {
        if (this.isMobile) {
            // On mobile, just close the sidebar
            this.closeSidebar();
        } else {
            // On desktop, toggle collapsed state
            this.isCollapsed = !this.isCollapsed;
            this.updateSidebarState();
        }
    }

    openSidebar() {
        if (this.sidebar) {
            this.sidebar.classList.add('open');
            if (this.overlay) {
                this.overlay.classList.add('active');
            }
            document.body.classList.add('sidebar-open');
            this.isOpen = true;
            
            // Update toggle button state
            const toggle = document.querySelector('.sidebar-toggle, .top-nav-toggle');
            if (toggle) {
                toggle.classList.add('active');
            }
        }
    }

    closeSidebar() {
        if (this.sidebar) {
            this.sidebar.classList.remove('open');
            if (this.overlay) {
                this.overlay.classList.remove('active');
            }
            document.body.classList.remove('sidebar-open');
            this.isOpen = false;
            
            // Update toggle button state
            const toggle = document.querySelector('.sidebar-toggle, .top-nav-toggle');
            if (toggle) {
                toggle.classList.remove('active');
            }
        }
    }

    updateSidebarState() {
        if (this.sidebar) {
            if (this.isCollapsed) {
                this.sidebar.classList.add('collapsed');
                document.body.classList.add('sidebar-collapsed');
                // Hide overlay when collapsed
                if (this.overlay) {
                    this.overlay.classList.remove('active');
                }
                // Update toggle button icon
                const toggleIcon = this.sidebar.querySelector('.sidebar-toggle i');
                if (toggleIcon) {
                    toggleIcon.className = 'fas fa-chevron-right';
                }
            } else {
                this.sidebar.classList.remove('collapsed');
                document.body.classList.remove('sidebar-collapsed');
                // Show overlay when expanded (if sidebar is open)
                if (this.overlay && this.isOpen) {
                    this.overlay.classList.add('active');
                }
                // Update toggle button icon
                const toggleIcon = this.sidebar.querySelector('.sidebar-toggle i');
                if (toggleIcon) {
                    toggleIcon.className = 'fas fa-chevron-left';
                }
            }
        }
    }

    updateLayout() {
        if (this.isMobile) {
            // Mobile: hide sidebar by default, show top nav
            this.closeSidebar();
            this.isCollapsed = false;
        } else {
            // Desktop: show sidebar by default, hide top nav
            this.openSidebar();
            this.updateSidebarState();
        }
    }

    toggleNavGroup(groupHeader) {
        const groupName = groupHeader.getAttribute('data-group');
        const groupItems = document.querySelector(`.nav-group-items[data-group="${groupName}"]`);
        const toggleIcon = groupHeader.querySelector('.nav-group-toggle');
        const navGroup = groupHeader.closest('.nav-group');
        
        if (groupItems && toggleIcon && navGroup) {
            const isExpanded = navGroup.classList.contains('expanded');
            
            if (isExpanded) {
                // Collapse the group
                navGroup.classList.remove('expanded');
                groupItems.style.maxHeight = '0';
                toggleIcon.style.transform = 'rotate(0deg)';
            } else {
                // Expand the group
                navGroup.classList.add('expanded');
                groupItems.style.maxHeight = groupItems.scrollHeight + 'px';
                toggleIcon.style.transform = 'rotate(180deg)';
            }
        }
    }

    setActiveNavItem() {
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        const navLinks = document.querySelectorAll('.sidebar-nav-links a, .mobile-nav-links a');
        
        // Remove active class from all links
        navLinks.forEach(link => {
            link.classList.remove('active');
        });
        
        // Find and activate the current page link
        navLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (href === currentPage || (currentPage === '' && href === 'index.html')) {
                link.classList.add('active');
                
                // If this link is inside a nav group, expand that group
                const navGroup = link.closest('.nav-group');
                if (navGroup) {
                    const groupName = navGroup.querySelector('.nav-group-header').getAttribute('data-group');
                    const groupItems = navGroup.querySelector('.nav-group-items');
                    const toggleIcon = navGroup.querySelector('.nav-group-toggle');
                    
                    if (groupItems && toggleIcon) {
                        navGroup.classList.add('expanded');
                        groupItems.style.maxHeight = groupItems.scrollHeight + 'px';
                        toggleIcon.style.transform = 'rotate(180deg)';
                    }
                }
            }
        });
    }

    // Method to create top tabs for specific pages
    createTopTabs(tabs) {
        // Wait for DOM to be ready if needed
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.createTopTabs(tabs));
            return;
        }

        const existingTopTabs = document.querySelector('.top-tabs');
        if (existingTopTabs) {
            existingTopTabs.remove();
        }

        const topTabs = document.createElement('div');
        topTabs.className = 'top-tabs';
        
        const tabsHtml = tabs.map(tab => `
            <button class="tab-btn ${tab.active ? 'active' : ''}" 
                    data-tab="${tab.id}" 
                    onclick="${tab.onclick || ''}">
                ${tab.icon ? `<i class="${tab.icon}"></i>` : ''}
                <span>${tab.label}</span>
            </button>
        `).join('');
        
        topTabs.innerHTML = tabsHtml;
        
        // Insert after top nav or at the beginning of body if top nav doesn't exist
        const topNav = document.querySelector('.top-nav');
        if (topNav) {
            topNav.insertAdjacentElement('afterend', topTabs);
        } else {
            // Fallback: insert at the beginning of body
            document.body.insertBefore(topTabs, document.body.firstChild);
        }
        
        // Add class to main content
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.classList.add('with-top-tabs');
        }
        
        // Update layout to ensure proper positioning
        this.updateLayout();

        return topTabs;
    }

    // Method to load and display version from server
    async loadVersion() {
        try {
            const response = await fetch('/api/version');
            if (response.ok) {
                const data = await response.json();
                const versionElement = document.getElementById('sidebar-version');
                if (versionElement) {
                    versionElement.textContent = data.version;
                }
            } else {
                // Fallback to unknown version
                const versionElement = document.getElementById('sidebar-version');
                if (versionElement) {
                    versionElement.textContent = 'unknown';
                }
            }
        } catch (error) {
            console.warn('Failed to load version from server:', error);
            // Fallback to unknown version
            const versionElement = document.getElementById('sidebar-version');
            if (versionElement) {
                versionElement.textContent = 'unknown';
            }
        }
    }

    // Method to remove top tabs
    removeTopTabs() {
        const topTabs = document.querySelector('.top-tabs');
        if (topTabs) {
            topTabs.remove();
        }
        
        // Remove class from main content
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.classList.remove('with-top-tabs');
        }
    }
}

// Initialize sidebar navigation immediately
window.sidebarNav = new SidebarNavigation();

// Also initialize when DOM is loaded as backup
document.addEventListener('DOMContentLoaded', () => {
    if (!window.sidebarNav) {
        window.sidebarNav = new SidebarNavigation();
    }
});

// Export for use in other scripts
window.SidebarNavigation = SidebarNavigation;
