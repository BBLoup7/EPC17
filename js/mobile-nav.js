/**
 * Mobile Navigation System for EPC17
 * Handles hamburger menu functionality across all pages
 */

// Hide mobile navigation on desktop immediately
function hideMobileNavOnDesktop() {
    if (window.innerWidth > 768) {
        const mobileElements = document.querySelectorAll('.mobile-nav-toggle, .mobile-nav-menu, .mobile-nav-overlay');
        mobileElements.forEach(element => {
            if (element) {
                element.style.display = 'none';
                element.style.visibility = 'hidden';
                element.style.opacity = '0';
                element.style.pointerEvents = 'none';
            }
        });
    }
}

// Show mobile navigation on mobile devices
function showMobileNavOnMobile() {
    if (window.innerWidth <= 768) {
        const mobileToggle = document.querySelector('.mobile-nav-toggle');
        if (mobileToggle) {
            mobileToggle.style.display = 'flex';
            mobileToggle.style.visibility = 'visible';
            mobileToggle.style.opacity = '1';
            mobileToggle.style.pointerEvents = 'auto';
            console.log('Mobile navigation shown on mobile device');
        } else {
            console.warn('Mobile navigation toggle not found');
        }
    }
}

// Run immediately when script loads
hideMobileNavOnDesktop();
showMobileNavOnMobile();

// Also run on window resize
window.addEventListener('resize', () => {
    hideMobileNavOnDesktop();
    showMobileNavOnMobile();
});

class MobileNavigation {
    constructor() {
        // Only initialize on mobile devices
        if (window.innerWidth <= 768) {
            this.mobileNavToggle = document.querySelector('.mobile-nav-toggle');
            this.mobileNavMenu = document.querySelector('.mobile-nav-menu');
            this.mobileNavClose = document.querySelector('.mobile-nav-close');
            this.mobileNavOverlay = document.querySelector('.mobile-nav-overlay');
            this.mobileNavLinks = document.querySelectorAll('.mobile-nav-links li a');
            
            this.init();
        }
    }
    
    init() {
        if (!this.mobileNavToggle) {
            console.warn('Mobile navigation elements not found');
            return;
        }
        
        console.log('Mobile navigation initialized successfully');
        console.log('Mobile toggle found:', this.mobileNavToggle);
        console.log('Mobile menu found:', this.mobileNavMenu);
        
        this.bindEvents();
        this.setActivePage();
    }
    
    bindEvents() {
        // Toggle mobile menu
        this.mobileNavToggle.addEventListener('click', () => this.toggleMobileMenu());
        
        // Close mobile menu
        this.mobileNavClose.addEventListener('click', () => this.closeMobileMenu());
        this.mobileNavOverlay.addEventListener('click', () => this.closeMobileMenu());
        
        // Close menu when clicking on a link
        this.mobileNavLinks.forEach(link => {
            link.addEventListener('click', (e) => this.handleLinkClick(e));
        });
        
        // Close menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.mobileNavMenu.classList.contains('active')) {
                this.closeMobileMenu();
            }
        });
        
        // Close menu on window resize (if switching to desktop)
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768 && this.mobileNavMenu.classList.contains('active')) {
                this.closeMobileMenu();
            }
        });
        
        // Handle swipe to close (optional enhancement)
        this.handleSwipeToClose();
    }
    
    toggleMobileMenu() {
        this.mobileNavMenu.classList.toggle('active');
        this.mobileNavOverlay.classList.toggle('active');
        document.body.classList.toggle('nav-open');
        this.mobileNavToggle.classList.toggle('active');
        
        // Announce to screen readers
        const isOpen = this.mobileNavMenu.classList.contains('active');
        this.announceToScreenReader(isOpen ? 'Navigation menu opened' : 'Navigation menu closed');
    }
    
    closeMobileMenu() {
        this.mobileNavMenu.classList.remove('active');
        this.mobileNavOverlay.classList.remove('active');
        document.body.classList.remove('nav-open');
        this.mobileNavToggle.classList.remove('active');
        
        this.announceToScreenReader('Navigation menu closed');
    }
    
    handleLinkClick(e) {
        const link = e.currentTarget;
        
        // Don't close if it's the current page
        if (link.classList.contains('active')) {
            this.closeMobileMenu();
            return;
        }
        
        // Close menu and navigate
        this.closeMobileMenu();
        
        // Add a small delay to allow the menu to close before navigation
        setTimeout(() => {
            // Navigation will happen naturally via href
        }, 300);
    }
    
    setActivePage() {
        const currentPath = window.location.pathname;
        const currentPage = currentPath.split('/').pop() || 'index.html';
        
        // Remove active class from all links
        this.mobileNavLinks.forEach(link => {
            link.classList.remove('active');
        });
        
        // Add active class to current page
        this.mobileNavLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (href === currentPage || (currentPage === 'index.html' && href === 'index.html')) {
                link.classList.add('active');
            }
        });
    }
    
    handleSwipeToClose() {
        let startX = 0;
        let startY = 0;
        let isDragging = false;
        
        this.mobileNavMenu.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            isDragging = false;
        });
        
        this.mobileNavMenu.addEventListener('touchmove', (e) => {
            if (!isDragging) {
                const deltaX = Math.abs(e.touches[0].clientX - startX);
                const deltaY = Math.abs(e.touches[0].clientY - startY);
                
                if (deltaX > deltaY && deltaX > 10) {
                    isDragging = true;
                }
            }
        });
        
        this.mobileNavMenu.addEventListener('touchend', (e) => {
            if (isDragging) {
                const deltaX = e.changedTouches[0].clientX - startX;
                
                // If swiped left (negative deltaX) and menu is open, close it
                if (deltaX < -50 && this.mobileNavMenu.classList.contains('active')) {
                    this.closeMobileMenu();
                }
            }
        });
    }
    
    announceToScreenReader(message) {
        // Create a temporary element for screen reader announcements
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.style.position = 'absolute';
        announcement.style.left = '-10000px';
        announcement.style.width = '1px';
        announcement.style.height = '1px';
        announcement.style.overflow = 'hidden';
        announcement.textContent = message;
        
        document.body.appendChild(announcement);
        
        // Remove the element after a short delay
        setTimeout(() => {
            document.body.removeChild(announcement);
        }, 1000);
    }
}

// Initialize mobile navigation when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Run the desktop hiding function again after DOM loads
    hideMobileNavOnDesktop();
    showMobileNavOnMobile();
    
    // Only initialize mobile navigation on mobile devices
    if (window.innerWidth <= 768) {
        new MobileNavigation();
    }
});

// Export for potential use in other scripts
window.MobileNavigation = MobileNavigation; 