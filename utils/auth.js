// Rule: EPC17_WORKFLOW.md - simple local auth overlay; no external libs
(function() {
	const TOKEN_KEY = 'epc17_auth_token';
	const USER_KEY = 'epc17_user';
	let session = null;

	function setToken(token) {
		try {
			if (token) {
				localStorage.setItem(TOKEN_KEY, token);
			} else {
				localStorage.removeItem(TOKEN_KEY);
			}
		} catch {}
	}

	function getToken() {
		try {
			return localStorage.getItem(TOKEN_KEY) || '';
		} catch {
			return '';
		}
	}

	function redirectToLogin(message) {
		const q = message ? `?msg=${encodeURIComponent(message)}` : '';
		window.location.href = `/login.html${q}`;
	}

	async function authFetch(url, options = {}) {
		const headers = options.headers || {};
		const token = getToken();
		console.log('🔐 authFetch called for:', url, 'token exists:', !!token);
		if (token) {
			headers['Authorization'] = 'Bearer ' + token;
			console.log('🔐 Authorization header set');
		} else {
			console.log('🔐 No token available for request');
		}
		const response = await fetch(url, { ...options, headers });
		console.log('🔐 Response status for', url, ':', response.status);
		if (response.status === 401) {
			redirectToLogin('expired');
		}
		return response;
	}

	function userHasPermission(permission) {
		if (!session) return false;
		if (session.username === 'Admin') return true; // Admin has all access
		const perms = session.permissions || [];
		return perms.includes(permission);
	}

	function userHasAnyPermission(permissionOrList) {
		if (!session) return false;
		if (session.username === 'Admin') return true; // Admin has all access
		const perms = session.permissions || [];
		if (Array.isArray(permissionOrList)) {
			return permissionOrList.some(p => perms.includes(p));
		}
		return perms.includes(permissionOrList);
	}

	function applyPermissionGates() {
		const gated = document.querySelectorAll('[data-permission]');
		gated.forEach(el => {
			const perm = el.getAttribute('data-permission');
			if (!userHasPermission(perm)) {
				el.addEventListener('click', (e) => {
					e.preventDefault();
					showAccessDenied();
				});
				el.setAttribute('disabled', 'true');
				el.classList.add('disabled');
			}
		});
		// Hide nav links the user cannot access
		const navLinks = document.querySelectorAll('.nav-links a[href$=".html"]');
		navLinks.forEach(a => {
			const href = a.getAttribute('href');
			const pagePerm = {
				'registration.html': 'registration',
				'series.html': 'series',
				'events.html': 'events',
				'races.html': 'races',
				'analytics.html': 'analytics',
				// Allow driver profiles for registration workflows (and keep legacy permission)
				'driver-profile.html': ['drivers profile', 'registration'],
				'live-display.html': 'live display',
				'users.html': 'admin_power'
			}[href];
			const allowed = userHasAnyPermission(pagePerm);
			if (pagePerm && !allowed) {
				a.parentElement.style.display = 'none';
			}
		});
	}

	function showAccessDenied() {
		// Show a more informative access denied message using a styled toast/notification
		showAccessDeniedNotification('You do not have permission to access this feature.');
	}

	function showAccessDeniedNotification(message, redirectTo = null) {
		// Create a styled notification instead of ugly alert
		let notification = document.getElementById('access-denied-notification');
		if (!notification) {
			notification = document.createElement('div');
			notification.id = 'access-denied-notification';
			notification.style.cssText = `
				position: fixed;
				top: 20px;
				left: 50%;
				transform: translateX(-50%);
				background: linear-gradient(135deg, #dc3545, #c82333);
				color: white;
				padding: 16px 24px;
				border-radius: 8px;
				box-shadow: 0 4px 20px rgba(220, 53, 69, 0.4);
				z-index: 10000;
				font-family: inherit;
				font-size: 14px;
				font-weight: 500;
				display: flex;
				align-items: center;
				gap: 12px;
				max-width: 90%;
				animation: slideDown 0.3s ease-out;
			`;
			// Add animation keyframes
			const style = document.createElement('style');
			style.textContent = `
				@keyframes slideDown {
					from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
					to { opacity: 1; transform: translateX(-50%) translateY(0); }
				}
				@keyframes slideUp {
					from { opacity: 1; transform: translateX(-50%) translateY(0); }
					to { opacity: 0; transform: translateX(-50%) translateY(-20px); }
				}
			`;
			document.head.appendChild(style);
			document.body.appendChild(notification);
		}
		
		notification.innerHTML = `
			<span style="font-size: 18px;">🚫</span>
			<span>Access Denied: ${message}</span>
		`;
		notification.style.display = 'flex';
		notification.style.animation = 'slideDown 0.3s ease-out';
		
		// Auto-hide after 3 seconds and optionally redirect
		setTimeout(() => {
			notification.style.animation = 'slideUp 0.3s ease-out';
			setTimeout(() => {
				notification.style.display = 'none';
				if (redirectTo) {
					window.location.href = redirectTo;
				}
			}, 300);
		}, 2500);
	}

	function ensureAdminLink() {
		// Show Users link if user has admin_power permission
		if (!session || !userHasPermission('admin_power')) return;
		const nav = document.querySelector('.nav-links');
		if (!nav) return;
		if (nav.querySelector('[data-admin-link]')) return;
		const li = document.createElement('li');
		li.setAttribute('data-admin-link', 'true');
		const a = document.createElement('a');
		a.href = 'users.html';
		a.textContent = 'Users';
		a.title = 'Users & Permissions';
		li.appendChild(a);
		nav.appendChild(li);
	}

	function ensureLogoutButton() {
		const nav = document.querySelector('.nav-links');
		if (!nav) return;
		let li = nav.querySelector('[data-logout-link]');
		if (!session) {
			if (li) li.remove();
			return;
		}
		if (!li) {
			li = document.createElement('li');
			li.setAttribute('data-logout-link', 'true');
			const btn = document.createElement('button');
			btn.className = 'btn btn-secondary';
			btn.textContent = 'Logout';
			btn.style.marginLeft = 'auto';
			btn.onclick = () => logout();
			li.appendChild(btn);
			nav.appendChild(li);
		}
	}

	function buildLoginOverlay(message) {
		let overlay = document.getElementById('auth-login-overlay');
		if (overlay) return overlay;
		overlay = document.createElement('div');
		overlay.id = 'auth-login-overlay';
		overlay.className = 'overlay active';
		overlay.innerHTML = `
			<div class="modal" role="dialog" aria-modal="true">
				<div class="modal-header">
					<h2>Sign In</h2>
				</div>
				<div class="modal-body">
					<p id="auth-login-message" style="margin-bottom: 1rem; color: var(--text-secondary);">${message || ''}</p>
					<div class="form-group">
						<label class="form-label" for="auth-username">Username</label>
						<input id="auth-username" class="form-control" type="text" placeholder="Username" autocomplete="username" />
					</div>
					<div class="form-group">
						<label class="form-label" for="auth-password">Password</label>
						<input id="auth-password" class="form-control" type="password" placeholder="Password" autocomplete="current-password" />
					</div>
					<div style="display:flex; gap:0.5rem; justify-content:flex-end;">
						<button id="auth-login-btn" class="btn btn-primary">Login</button>
					</div>
				</div>
			</div>
		`;
		document.body.appendChild(overlay);
		return overlay;
	}

function showLoginOverlay(message) {
		redirectToLogin(message || '');
	}

	async function login(username, password) {
		try {
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, password })
			});
			if (!res.ok) return false;
			const data = await res.json();
			setToken(data.token);
			session = { username: data.username, permissions: data.permissions, allowedEvents: data.allowedEvents || [] };
			setCurrentUser();
			return true;
		} catch (e) {
			return false;
		}
	}

async function restoreSession() {
		try {
			const res = await fetch('/api/auth/me');
			console.log('🔐 Auth /me response status:', res.status);
			if (!res.ok) {
				console.log('🔐 Auth /me failed, status:', res.status);
				return false;
			}
			const data = await res.json();
			console.log('🔐 Auth /me data:', data);
			if (!data.authenticated) {
				console.log('🔐 Not authenticated according to server');
				return false;
			}
			session = { username: data.username, permissions: data.permissions, allowedEvents: data.allowedEvents || [] };
			setCurrentUser();
			try { localStorage.setItem(USER_KEY, JSON.stringify(window.currentUser)); } catch {}
			console.log('🔐 Session restored successfully');
			return true;
		} catch (e) {
			console.log('🔐 Error restoring session:', e);
			return false;
		}
	}

	function logout() {
		setToken('');
		session = null;
		setCurrentUser();
		try { localStorage.removeItem(USER_KEY); } catch {}
		fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
			redirectToLogin();
		});
		ensureLogoutButton();
	}

	function setCurrentUser() {
		const user = session ? {
			username: session.username,
			permissions: session.permissions,
			allowedEvents: session.allowedEvents || [],
			hasPermission: (perm) => userHasPermission(perm)
		} : null;
		window.currentUser = user;
	}

	async function initAuth() {
		console.log('🔐 Initializing authentication...');
		// Migrate any legacy sessionStorage token
		try {
			const ssToken = sessionStorage.getItem(TOKEN_KEY);
			if (ssToken && !getToken()) {
				localStorage.setItem(TOKEN_KEY, ssToken);
			}
			sessionStorage.removeItem(TOKEN_KEY);
		} catch {}
		const ok = await restoreSession();
		if (!ok) {
			console.log('🔐 No valid session found, redirecting to login');
			redirectToLogin();
			return;
		}
		console.log('🔐 Session restored successfully:', { username: session?.username, permissions: session?.permissions });
		console.log('🔐 User permissions:', session?.permissions);
		console.log('🔐 Has events permission:', session?.permissions?.includes('events'));
		console.log('🔐 Has registration permission:', session?.permissions?.includes('registration'));
		applyPermissionGates();
		ensureAdminLink();
		ensureLogoutButton();

		// Page-level access gating on the client for UX (server also enforces)
		const pagePermMap = {
			'/registration.html': ['registration'],
			'/series.html': ['series'],
			'/events.html': ['events'],
			'/races.html': ['races'],
			'/analytics.html': ['analytics'],
			// Allow driver profiles for registration workflows (and keep legacy permission)
			'/driver-profile.html': ['drivers profile', 'registration'],
			'/live-display.html': ['live display'],
			// Rule: EPC17_WORKFLOW.md - add animator page gating
			'/animator.html': ['animator'],
			'/users.html': ['admin_power']
		};
		const path = window.location.pathname;
		if (pagePermMap[path]) {
			const perms = session.permissions || [];
			// Admin username has access to all pages
			const isAdmin = !!(session && session.username === 'Admin');
			const allowed = isAdmin || pagePermMap[path].some(p => perms.includes(p));
			console.log('🔐 Page access check:', { path, perms, isAdmin, allowed });
			if (!allowed) {
				console.log('🔐 Access denied for page:', path);
				// Show notification and redirect to home page instead of logging out
				showAccessDeniedNotification('You do not have permission to access this page.', '/index.html');
				return;
			}
		}
		console.log('🔐 Authentication initialization complete');
	}

	window.Auth = {
		init: initAuth,
		login,
		logout,
		getToken,
		hasPermission: userHasPermission,
		fetch: authFetch,
		showAccessDenied
	};

	document.addEventListener('DOMContentLoaded', () => {
		initAuth();
	});
})();


