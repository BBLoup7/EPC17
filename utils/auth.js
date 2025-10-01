// Rule: EPC17_WORKFLOW.md - simple local auth overlay; no external libs
(function() {
	const TOKEN_KEY = 'epc17_auth_token';
	let session = null;

	function setToken(token) {
		if (token) {
			sessionStorage.setItem(TOKEN_KEY, token);
		} else {
			sessionStorage.removeItem(TOKEN_KEY);
		}
	}

	function getToken() {
		return sessionStorage.getItem(TOKEN_KEY) || '';
	}

	async function authFetch(url, options = {}) {
		const headers = options.headers || {};
		const token = getToken();
		if (token) headers['Authorization'] = 'Bearer ' + token;
		const response = await fetch(url, { ...options, headers });
		if (response.status === 401) {
			showLoginOverlay('Your session expired. Please log in.');
		}
		return response;
	}

	function userHasPermission(permission) {
		if (!session) return false;
		if (session.username === 'Admin') return true; // Admin has all access
		const perms = session.permissions || [];
		return perms.includes(permission);
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
				'driver-profile.html': 'drivers profile',
				'live-display.html': 'live display',
				'users.html': '__admin__'
			}[href];
			const allowed = pagePerm === '__admin__' ? (session && session.username === 'Admin') : userHasPermission(pagePerm);
			if (pagePerm && !allowed) {
				a.parentElement.style.display = 'none';
			}
		});
	}

	function showAccessDenied() {
		alert('Access Denied');
	}

	function ensureAdminLink() {
		if (!session || session.username !== 'Admin') return;
		const nav = document.querySelector('.nav-links');
		if (!nav) return;
		if (nav.querySelector('[data-admin-link]')) return;
		const li = document.createElement('li');
		li.setAttribute('data-admin-link', 'true');
		const a = document.createElement('a');
		const token = getToken();
		a.href = token ? `users.html?token=${encodeURIComponent(token)}` : 'users.html';
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
		const overlay = buildLoginOverlay(message);
		overlay.classList.add('active');
		const loginBtn = overlay.querySelector('#auth-login-btn');
		const usernameEl = overlay.querySelector('#auth-username');
		const passwordEl = overlay.querySelector('#auth-password');
		const msgEl = overlay.querySelector('#auth-login-message');
		function doLogin() {
			msgEl.textContent = 'Signing in...';
			login(usernameEl.value.trim(), passwordEl.value).then(ok => {
				if (ok) {
					overlay.classList.remove('active');
					document.body.removeChild(overlay);
					// Refresh page and redirect to home after login to ensure proper UI state
					window.location.href = '/';
				} else {
					msgEl.textContent = 'Invalid credentials. Try again.';
				}
			});
		}
		loginBtn.onclick = doLogin;
		passwordEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
		usernameEl.focus();
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
		const token = getToken();
		if (!token) return false;
		try {
			const res = await authFetch('/api/auth/me');
			if (!res.ok) return false;
			const data = await res.json();
			if (!data.authenticated) return false;
			session = { username: data.username, permissions: data.permissions, allowedEvents: data.allowedEvents || [] };
			setCurrentUser();
			return true;
		} catch (e) {
			return false;
		}
	}

	function logout() {
		setToken('');
		session = null;
		setCurrentUser();
		fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
			showLoginOverlay();
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
		const ok = await restoreSession();
		if (!ok) {
			showLoginOverlay();
			return;
		}
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
			'/driver-profile.html': ['drivers profile'],
			'/live-display.html': ['live display'],
			'/users.html': ['__admin__']
		};
		const path = window.location.pathname;
		if (pagePermMap[path]) {
			const perms = session.permissions || [];
			const allowed = pagePermMap[path].some(p => p === '__admin__' ? (session && session.username === 'Admin') : perms.includes(p));
			if (!allowed) {
				alert('Access Denied');
				showLoginOverlay('Access Denied');
			}
		}
	}

	window.Auth = {
		init: initAuth,
		login,
		logout,
		hasPermission: userHasPermission,
		fetch: authFetch,
		showAccessDenied
	};

	document.addEventListener('DOMContentLoaded', () => {
		initAuth();
	});
})();


