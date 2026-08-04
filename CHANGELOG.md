# EPC17 Changelog (Publication — simple view)

User-facing release notes. For full documentation and file-level trace, see `PATCHNOTES.txt`.

---
## [2.11.3] - 2026-08-04

### Series detail form uses dark filled controls instead of browser-default white inputs.

- Added `form-control` to series basics/season/class fields.

- Series page CSS now styles inputs/selects/textareas with dark surfaces, focus rings, and date-picker theming; toned-down remove buttons.



## [2.11.2] - 2026-08-04

### Fix Series page load error: use DataManager.loadFromStorage instead of nonexistent loadAllData.

- series.html init called `loadAllData`, which is not a DataManager method; switched to `loadFromStorage(['series', 'events'])` to match other pages.



## [2.11.1] - 2026-08-04

### Print bill no longer uses a popup window — prints via a hidden iframe so browsers don’t block it.

- `RegistrationBill.openBill` writes into a same-page iframe and calls `print()` there instead of `window.open` (which returned null with `noopener` / popup blockers).



## [2.11.0] - 2026-08-04

### Series page redesigned as a list + detail workspace with short names, archive/duplicate, and practical event integration.

- Rebuilt Series UI (Users-style list + persistent detail editor) with search, status filter (active/archived), and sorting.

- Extended series schema with `shortName` and `defaultSeasonId`; status simplified to active | archived (legacy completed/cancelled map to archived).

- Soft-archive is the primary retirement path; hard delete blocked when events are linked.

- Duplicate copies seasons/classes with new IDs and clears events/standings.

- Events page: series filter dropdown, short-name display on cards/details, default season preselected when creating events.

- Removed legacy inline configure UI and stubbed series.css replaced with real page styles.



## [2.10.2] - 2026-08-04

### Registration Payment panel expanded into desk helpers: mark paid, method/note, printable bill, copy fee summary.

- Payment column adds status (Pending/Paid), method, optional note — saved with create/update (`paymentMethod`, `paymentNote`, `paidAt` columns).

- Mark paid, Print bill (formal printable receipt window), and copy fee summary actions.

- New `modules/registration-bill.js` builds a print-friendly registration bill from the live form + event.



## [2.10.1] - 2026-08-04

### Fix existing-driver selection mode and fit registration on one screen with a 4-column layout.

- Selecting a search match now locks **existing** mode, hides the match panel, and no longer re-searches with a concatenated mega-query.

- Live search uses the field being typed (single primary term) instead of joining all identity fields.

- Registration form reorganized into 4 compact columns: Driver | Contact | Classes | Sponsors/Payment/Actions.

- Compact CSS tightened so submit actions stay visible without page scroll on wide screens.



## [2.10.0] - 2026-08-04

### Unified driver registration: one form finds existing drivers as you type (including license number), populates matches, and blocks accidental duplicates.

- Merged New Driver and Existing Driver into `registration.html` with live multi-field search, mode badges (new vs existing), duplicate warnings, and a session “recently registered” strip.

- Added optional `licenseNumber` on participants; SQL search now covers name, nickname, racing number, license, team, contact JSON, and `_searchText` (rebuilt on write).

- New modules: `driver-search.js` (typeahead), `duplicate-detection.js` (modern scoring incl. license/racing/DOB fix).

- `existing-drivers.html` redirects to unified registration (query params preserved); removed from sidebar and home.

- Driver edit form includes license number for parity.



## [2.9.0] - 2026-08-04

### Full RBAC redesign: modern login flow with return URL and Remember Me, roles as first-class entities, and a polished Users/Roles/Settings admin console.

- Auth: Bearer restore on `/api/auth/me`, login `?next=` return path, Remember Me (localStorage vs sessionStorage + cookie max_age), logout clears server session via Bearer, public home/login without forced redirect.

- Login UI: Carbon Velocity redesign with show/hide password, loading state, clear errors (`styles/pages/login.css`).

- RBAC: `roles` table, seeded system roles, user `roleId` + `status` (active/disabled), migration from legacy per-user permissions, `/api/roles` CRUD + clone, users API returns sanitized role-resolved data (no passwords).

- Users page: tabs for Users / Roles / Settings; search, sort, status filter, avatars, modals, confirmation dialogs (`modules/users-admin.js`, `styles/pages/users.css`).

- Aligned client/server page gates including `animator.html`; updated GUIDE.md RBAC docs.



## [2.8.4] - 2026-06-09

### Repository cleanup: remove tests, DB backups, dead migration scripts, and outdated docs; align README and rules with Flask + HTML stack.

- Deleted entire `tests/` directory (pytest + vitest) and `vitest.config.js`; removed vitest/jsdom from `package.json`.

- Deleted 6 tracked `data/backups/*.db` files; gitignored `data/backups/` and `agent/memory.json`.

- Removed unwired migration utilities: `migration_runner.py`, `migrate_schema.py`, `migrate_sessions.py`, `migrate_tie_breaker.py`.

- Replaced outdated root `EPC17_WORKFLOW.md` with accurate `docs/EPC17_WORKFLOW.md`; added `docs/EPC17_PROMPTS.md`.

- Deleted superseded `docs/HISTORY.md` and `docs/TESTING.md`.

- Updated `README.md` (directory tree, license badge, removed test/migration sections).

- Updated `.cursor/rules/EPC17_RULES.mdc` for actual `js/`/`modules/`/`utils/` layout.

- Fixed `requirements.txt` (removed invalid `uuid` pip entry); synced `package.json` version to 2.8.4.



## [2.8.3] - 2026-05-30

### UI polish: sidebar scroll, shared loading skeletons, registration/participants UX, modal behavior, events cleanup, analytics podium fix, final-results picker.

- Registration inline existing-driver panel scroll fix; sidebar flex scroll + FA 6.5.1 sitewide; nav group visual hierarchy.

- Shared `UIComponents.showListSkeleton` + cv-skeleton-grid on participants, existing-drivers, final-results, driver-profile.

- Registration: short event labels, first/last name, optional DOB, split emergency contact, compact vehicle inline animation.

- Participants: collapsible events/classes on cards; edit modal single-event picker dropdown; backdrop close with dirty confirm.

- High-contrast `.cv-select`; centered tech inspection header.

- `Helpers.showModal` backdrop close + dirty confirm; series modal Close button + scrollable modal body.

- Events: removed dual class drag UI section, maxParticipants, driverMeeting; unlimited registration in db.js.

- Analytics podiums count class final top-3 per event (not heat finishes); test in test_stats_counts.py.

- Final results hero event jump dropdown synced with card grid.



## [2.8.2] - 2026-05-30

### Fix completed heat stats, Carbon Velocity sidebar, inline duplicate registration, and unified participant event-class editing.

- **Stats fix:** `count_completed_heats_from_brackets()` walks `race_brackets` JSON heats; `/api/stats/overall` returns `totalRaces` and `completedRaces`; home page reads corrected field. Unit tests in `tests/test_stats_counts.py`.

- **Sidebar:** Carbon Velocity styling (accent bar, icon wells, group headers); FA 6.5-aligned icons in `js/sidebar-nav.js`.

- **Registration duplicate flow:** New `modules/existing-driver-registration.js`; duplicate banner opens inline panel with class picker — no redirect to existing-drivers (optional link retained).

- **Participants edit modal:** Replaced separate Racing Classes + Event Assignments with unified Event Registrations cards driven by `eventClasses`; computed total fee from class prices; clearer status labels; styles moved to `styles/pages/participants.css`.



## [2.8.1] - 2026-05-30

### Refined Carbon Velocity visuals: replaced harsh WebGL streak background, rebuilt home landing page, toned down panel/animation excess.

- Replaced WebGL speed-streak shader with subtle CSS mesh grid + optional soft orb canvas (home only).

- `init.js` / `motion.js`: page-aware motion; hover lift only on tiles/cards, not every panel.

- `hud-panel` simplified (no laser line on all panels); `hud-panel-accent` for highlights only.

- Typography: display headings use Plus Jakarta Sans; racing font reserved for stats/hero accents.

- Font Awesome upgraded to 6.5.1 via `cv-load.js`.

- Home page fully rebuilt: cinematic hero + live preview card, quick-action grid, workflow steps, rich event list, feature grid, CTA.

- New `styles/pages/home.css` for home-specific layout.



## [2.8.0] - 2026-05-30

### Rebuilt Tech Inspection into a hybrid event-first page with per-driver history across events.

- Replaced Hyper-Tech design tokens with **Carbon Velocity** palette (carbon black surfaces, electric blue, magenta, ignition orange) in `styles.css`.

- Added shared HUD components: `.hud-panel`, `.cv-hero`, `.cv-stats-grid`, `.cv-feature-grid`, `.cv-tabs`, series cards, registration compact layout, tech inspection, final-results podium rows.

- New visual FX layer: `js/fx/velocity-bg.js` (WebGL speed-line shader + CSS fallback), `js/fx/motion.js` (GSAP reveals), `js/fx/counters.js`, `js/fx/init.js`, `js/cv-load.js` (GSAP CDN loader).

- Rebuilt `index.html` home dashboard with live KPI stats from `/api/stats/overall` and upcoming events strip.

- Modernized page heroes: registration, existing-drivers, participants, driver-profile, series, events, analytics, final-results, tech-inspection, users, login.

- Registration: single-screen HUD console, inline per-class vehicle fields (no scroll overflow), link to existing-drivers, `sledConfigurations` fix.

- Participants: View Profile action linking to `driver-profile.html?driver=`.

- Driver profile: deep-link via `?driver=` URL param.

- Series: removed dev Clear/Debug buttons, fixed `.series-card` CSS, cv-stat header.

- Chart.js theme updated in `utils/chart-helpers.js` for Carbon Velocity colors.

- Permission fixes: `participants.html`, `existing-drivers.html`, `final-results.html` added to server and auth nav maps.

- DB: `team` and `notes` columns on participants; `vehicleConfigurations` normalized to `sledConfigurations` in DataManager.

- Races page structure unchanged; colors inherit from new tokens + existing `styles/race.css`.

- Out of scope (deferred): live-display, animator.

- Replaced `tech-inspection.html` with a minimal, stable shell and no inline controller logic.



## [2.7.22] - 2026-05-27

### Tech Inspection: Flask now serves HTML from disk so a long-running server no longer keeps a stale Jinja-cached page.

- Root cause: server ran with `debug=off`; `render_template('tech-inspection.html')` kept the pre-fix template (with `dataManager.initialize()`) in memory while disk had the fixed file.

- `tech_inspection_page` uses `_read_html_page()` + no-cache headers instead of `render_template`.

- Enabled `TEMPLATES_AUTO_RELOAD` by default for local dev (`EPC17_DEV` not `0`).



## [2.7.21] - 2026-05-27

### Tech Inspection: external JS bundle and no-cache HTML so browsers stop running the old `initialize()` inline script.

- Moved page controller to `js/tech-inspection.js?v=2.7.21` (fixes stale cached inline script still calling `dataManager.initialize()`).

- Event dropdown uses `getEventsArray()` after `loadFromStorage`, with API fallback (limit 500).

- Flask route: `registration` permission, no-cache headers, `/tech-inspection` alias; added to static HTML permission map.



## [2.7.20] - 2026-05-27

### Fixed Tech Inspection page: event dropdown and driver list now load after correct DataManager initialization.

- Replaced invalid `dataManager.initialize()` with `waitForAuthentication()` and `loadFromStorage(['participants', 'events'])` (root cause of empty event dropdown).

- Event select: sorted by date, empty/error states, duplicate-safe repopulation.

- Driver list: `loadParticipantsForEvent` fallback when event participant IDs are missing; ID-normalized event lookup; sanitized display names.

- Inspection data scoped per event in localStorage (`epc17_inspection_{eventId}`) with one-time migration from legacy global key.

- Summary stats: separate passed, failed, and pending counts; added Failed column.

- `Helpers.parseSelectedClasses` and `Helpers.computeInspectionSummary` for shared logic; Vitest coverage.

- Tech Inspection nav gated to `registration` permission (same as Registration).



## [2.7.19] - 2026-05-27

### Fixed lower-bracket reset/re-score leaving the new winner out of the next generated round.

- `reverseParticipantRecords` did not restore `status` or `currentBracket`, so a driver eliminated before a reset stayed eliminated when they won on re-entry.

- Added `rebuildParticipantStateFromCompletedHeats` to recompute all participant records from completed heats (used on reset, regenerate later rounds, and generate next round).

- Winners in double elimination now explicitly stay `active` and keep the correct bracket (`upper`/`lower`) from the heat they won.

- Tests cover rebuild after reset and lower-bracket winner inclusion.



## [2.7.18] - 2026-05-27

### Later rounds refresh when an earlier race is reset and re-scored; stale pending rounds are removed on reset.

- Resetting a completed heat now removes later rounds that have no completed races yet (avoids outdated pairings).

- Recording a result in an earlier round regenerates pending later rounds (e.g. Round 4 pairings update after a Round 3 correction).

- Toasts inform operators when later rounds were removed or refreshed.

- Added tests for `removeLaterPendingRounds`.



## [2.7.17] - 2026-05-27

### Fixed completed race heats falsely showing a lock icon; reset stays available until a later round has completed races.

- `canSafelyResetHeat` called async `getHeat`/`getBracket` without `await`, so every completed heat failed the safety check and appeared locked immediately after completion.

- Added sync bracket resolution (`resolveSyncBracket`, `findHeatInBracket`) for render-time safety checks.

- Later-round lock now applies only when a later round has at least one completed heat (pending Round 4 no longer blocks Round 3 resets).

- `resetCompletedHeat` and `resetRoundAndSubsequentRounds` now await bracket/heat loading correctly.

- Legacy vertical `renderHeat` shows reset/lock on completed heats (aligned with horizontal layout).

- Races page re-renders brackets after each heat save so reset controls update promptly.

- Added `tests/race-reset-safety.test.js`.



## [2.7.16] - 2026-05-27

### Smaller toast notifications app-wide with 1.5× longer display time.

- `TOAST_DURATION_MS` set to 7500 (was 3000 unused; runtime was 5000 ms).

- `Helpers.showToast` uses the constant (fallback 7500), compact padding (8px 12px), max-width 220px, font-size 0.7rem; theme `.toast-*` classes apply (removed legacy inline background colors).

- Global `.toast` / `#toast-container` styles updated to match.

- Registration and driver-profile page-local toasts aligned (4500 ms, same compact sizing).



## [2.7.15] - 2026-05-27

### Fixed cross-heat participant swap failing with false "different rounds" errors when drivers still appeared in completed earlier-round heats.

- `handleSwapParticipant` now carries `heatId`, `laneNumber`, and `bracketType` from the swap picker so the target heat matches what the user selected (e.g. lower-bracket Race #26 in Round 2).

- Swap candidates are limited to the same `bracketType` as the source heat in double elimination.

- Participant selection dialog shows race number in labels when available (`Race #26 – Driver Name`).

- `findParticipantHeat` accepts optional filters: class, round, exclude completed, bracket type; prefers current round first.

- `getHeatRound` prefers round encoded in heat id (`heat-r{n}-h{m}-...`); `resolveHeatRound` uses heat metadata before bracket container lookup.

- `performCrossHeatSwap` and `moveParticipantToOtherHeat` use `resolveHeatRound` on resolved heat objects.

- Added unit tests for duplicate participant across Round 1 (completed) vs Round 2 (active).



## [2.7.14] - 2026-05-27

### Fixed desktop first click being swallowed by an invisible sidebar overlay.

- `openSidebar()` now activates the backdrop overlay only on mobile (≤768px); desktop no longer gets a full-screen transparent layer with `pointer-events: auto` on load.

- `updateLayout()` on desktop calls `closeSidebar()` instead of `openSidebar()` so overlay and `sidebar-open` body state are cleared on init and resize.

- `updateSidebarState()` re-applies overlay only when mobile drawer is open.

- CSS: `pointer-events: auto` on `.sidebar-overlay.active` limited to mobile; desktop and collapsed sidebar force `pointer-events: none`.



## [2.7.13] - 2026-05-27

### Fixed finish-position click toggling after False Start/DSQ and show event race numbers in Move to Other Heat.

- Removed duplicate per-participant click listeners added on heat refresh; document-level delegation now handles position clicks exclusively (fixes assign/unassign firing twice after FS or DSQ).

- FS/DSQ results stay on heat.results only; pendingResults seeding and slot math use manual positions only.

- effectiveMaxPosition and shouldAutoCompleteHeat account for FS and DSQ when counting finish slots.

- Move to Other Heat dialog and toasts use event-wide Race #N (raceNumber) instead of per-class heatNumber.



## [2.7.12] - 2026-05-26

### Retuned the API data simulator for a cleaner 30-event / 2-series dataset with realistic per-event scale and stronger analytics validation.

- Added `GenerationConfig` as the single source of truth for scale (30 events, 2 series, 180-driver pool, 40-80 drivers and 50-120 registrations per event, 3-6 classes).

- Rewrote event class selection for bounded class counts per archetype; pre-flight eligibility against the driver pool before specs are finalized.

- Orchestrates two series (Northern/Southern) with a shared global driver pool and cumulative `eventClasses` across events.

- Expanded post-generation validation: per-event bounds, multi-event driver overlap, and analytics smoke checks (overall, event, series, driver, lane).

- Improved `--dry-run` summary table; removed hardcoded 40-event guard; fixed nondeterministic `rng` usage in event payloads.

- Rewrote `tests/test_generate_data.py` and updated `tests/test_generate_data_issue123.py` for new rules.



## [2.7.11] - 2026-05-26

### Improved collapsed (icon-rail) sidebar: click-open flyouts, compact footer, clearer tooltips and active states.

- Collapsed groups open on click with fixed-position flyout panels (no hover-only); close on outside click or Escape; reposition on resize.

- Icon rail uses 48px targets, lime active/hover accents, and title tooltips for Home and group headers.

- Footer stays visible when collapsed (icon logout, admin Users icon, version hidden).

- Flyouts use rounded panel styling and scroll when tall; expanding sidebar clears open flyouts.



## [2.7.10] - 2026-05-26

### Sidebar navigation uses acid-lime accent (Visual group style) across all groups and links.

- Group header icons, chevrons, nested link hovers/active states, and flyouts use `--secondary` / `--laser-secondary` instead of cyan primary accents.

- Removed Visual-only icon override; nested flyout links share group item styling.



## [2.7.9] - 2026-05-26

### Fix duplicate sidebar links caused by collapsed-mode flyout menus showing while sidebar is expanded.

- `.nav-group-flyout` is now `display: none` by default; flyouts only appear when `.sidebar.collapsed` (hover/focus).



## [2.7.8] - 2026-05-26

### Retired event-analytics page; reorganized sidebar (Analytics under Events, new Visual group) with modernized navigation UX.

- Removed `event-analytics.html`; `/event-analytics.html` redirects to `analytics.html` (analytics permission).

- Sidebar: Analytics link moved into Events dropdown; new Visual group for Live Display and Animator.

- Sidebar UX: multi-expand groups with localStorage persistence, ARIA on group headers, active-parent styling, collapsed flyout submenus, flex scroll layout.

- Auth: permission gates apply to sidebar and flyout links; admin Users link in sidebar footer; animator permission on nav map.

- Removed Vite entry for event-analytics.



## [2.7.7] - 2026-05-26

### Remove temporary debug-session instrumentation after race-brackets 500 fix verified.

- Removed `_agent_debug_log` and NDJSON writes from `utils/db_manager.py`.

- Removed debug logging block from `get_race_brackets` in `server.py`.

- Kept `race_brackets` corruption repair and retry logic.



## [2.7.6] - 2026-05-26

### Auto-repair corrupt `race_brackets` table so `GET /api/race-brackets` no longer returns 500.

- Same pattern as series: corrupt SQLite pages made `SELECT id, eventId` / `COUNT(*)` fail with `database disk image is malformed`.

- On startup and on first failed read: `ALTER TABLE … RENAME`, recreate table, restore placeholder rows from salvaged ids and `races.bracketId`/`eventId` pairs.

- `get_race_bracket_metadata` and `get_race_brackets` retry once after repair.



## [2.7.5] - 2026-05-26

### Remove temporary debug-session instrumentation (`_agent_debug_log`, `_agent_debug_log_api`, NDJSON log files).

- Stripped agent debug logging from `utils/db_manager.py` and `server.py` after series 500 fix was verified.

- Kept SQLite corruption prevention and series-table repair logic; errors use standard `logger` / `print` + traceback.



## [2.7.4] - 2026-05-26

### Prevent SQLite corruption (safe backups, WAL cleanup, no dev reloader); auto-rebuild corrupt/missing `series` table so `/api/series` stays up.

- **Root cause (runtime):** `series` table row storage was corrupt (`database disk image is malformed`); `DROP TABLE` failed; `ALTER TABLE … RENAME` + fresh `CREATE` works.

- **Prevention:** Backups use `connection.backup()` after `PRAGMA wal_checkpoint(TRUNCATE)` instead of `shutil.copy2` on a live WAL database. Clear-database removes `.db`, `-wal`, and `-shm`. `busy_timeout`, `wal_autocheckpoint`, checkpoint on `close()`, `atexit` shutdown hook. Flask/SocketIO `use_reloader=False` to avoid two processes opening the same DB.

- **Recovery:** On startup, create `series` if missing; if unreadable, rename corrupt table and recreate (placeholder rows from event `seriesId` when possible).



## [2.7.3] - 2026-03-20

### Add targeted runtime instrumentation for `/api/series` so authenticated 500s can be narrowed to SQL, row transformation, or response serialization using live evidence.

- `DatabaseManager.get_series()` now logs `db_get_series_start`, row count, row-level failures, and query-level failures to `debug-be91c4.log` with hypotheses `H5`/`H6`.

- `/api/series` keeps existing traceback logging and now returns a temporary `debug` payload when called with `?debug=be91c4`, allowing direct authenticated repro from the terminal without relying on locked log file reads.



## [2.7.2] - 2026-03-20

### Harden SQLite startup after index repair (`quick_check` + optional `REINDEX`); log tracebacks for `/api/series`, `/api/race-brackets`, and stats routes into `debug-be91c4.log`; safer pagination query parsing on series and brackets.

- After successful DB init loop: run `PRAGMA quick_check`; if not `ok` or any index repair ran (`repairs_done > 0`), run `REINDEX` (errors logged to NDJSON, hypothesis H2).

- `handle_series` GET, `get_race_brackets`, `get_overall_analytics`, `get_driver_analytics`: on exception append full traceback via `_agent_debug_log_api` (H3/H4) for LAN diagnosis without console access.

- Series GET and race-brackets GET: `page` / `limit` tolerate non-numeric query params (avoid uncaught `ValueError` → 500).



## [2.7.1] - 2026-03-20

### Fix API 500 errors when SQLite reports corrupt indexes (`malformed database schema` / invalid rootpage) by repairing schema entries and recreating indexes on startup.

- Observed: `GET /api/participants`, `/api/events`, `/api/series` returned 500 because `DatabaseManager` failed during `PRAGMA journal_mode=WAL` with errors such as `malformed database schema (idx_participants_status) - invalid rootpage`.

- `DROP INDEX` on a corrupt index often fails with the same error; recovery now uses `PRAGMA writable_schema=ON`, deletes the bad row from `sqlite_master`, reconnects, and retries (up to 20 indexes) until init succeeds, then `_ensure_indexes()` rebuilds indexes.

- Optional NDJSON lines append to `debug-be91c4.log` when repair runs (session `be91c4`) for field diagnosis.



## [2.7.0] - 2026-03-20

### Hyper-Tech Precision UI rework: new design system (obsidian surfaces, electric cyan + acid lime, zero radius, laser edges, data typography) across global CSS, navigation shell, race styles, and HTML pages.

- Replaced legacy orange/glass/rounded tokens in styles.css with Hyper-Tech palette, Plus Jakarta Sans / Inter / Space Grotesk variables, tonal surfaces, 50ms control transitions, LCD-style aura shadows, and utility classes (laser-top, scanlines, module headers, font-data).

- Restyled shared primitives: sidebar/top-nav, buttons (primary lime, outline laser), form controls (bottom stroke), cards, tables, tabs, modals, toasts, badges, pagination, combo-box inputs, skeletons, page/hero patterns.

- styles/race.css aligned to the same system (event cards, section headers, zero radius bulk pass).

- index.html and login.html: replaced large inline marketing/glass styles with dense instrument-style layouts; home hero readout + left-aligned grids.

- live-display.html: flat surface background, content panels use laser-edge modules; bulk cyan/radius normalization.

- Other HTML: Google Fonts link unified to Inter + Plus Jakarta Sans + Space Grotesk; legacy orange RGBA swapped where present.

- js/sidebar-nav.js: body class ht-precision-shell for shell hooks; ui-components.js loading block uses loading-state-ht (left-aligned).



## [2.6.5] - 2026-03-08

### Home page mobile: add visible top bar with hamburger and fix sidebar not opening when hamburger is tapped (GitHub #124).

- On the home page (index.html) the top bar and hamburger were only injected by sidebar-nav.js; the bar could be missing or hard to discover on mobile. The top bar markup is now included in index.html so it is always in the DOM before the script runs.

- Added mobile-only CSS on the home page to force .top-nav and .top-nav-toggle to display on viewports ≤768px so the hamburger is visible and tappable. sidebar-nav.js skips creating a duplicate top-nav when one already exists and still binds the toggle handler.

- Fixed sidebar not opening on mobile: in styles.css the sidebar was display: none in the mobile block with no override for .sidebar.open, so the menu never appeared. Added .sidebar.open { display: block; } in the same mobile block so the drawer shows when the hamburger is tapped.



## [2.6.4] - 2026-03-08

### Mobile interaction improvements (GitHub #124): fix header overlap, safe areas, touch targets, and consolidate responsive padding for easier mobile navigation.

- Top bar and top-tabs no longer overlap on mobile: top-tabs are positioned below the top-nav using --app-top-height and --app-top-tabs-height; main content padding accounts for both when .with-top-tabs is present.

- Added CSS variables --app-top-height (60px) and --app-top-tabs-height (52px) and safe-area insets: .top-nav uses padding-top: max(0.5rem, env(safe-area-inset-top)); main-content padding-top uses calc(var(--app-top-height) + env(safe-area-inset-top)); optional padding-bottom: env(safe-area-inset-bottom) for main-content.

- Mobile navigation clarity: sidebar overlay shows a dimmed backdrop (rgba(0,0,0,0.45)) when open for clear tap-to-close affordance; sidebar nav links and nav-group headers/items have min-height 44px on mobile for touch targets.

- Consolidated all mobile .main-content padding-top to a single approach (calc with variables and safe-area); removed conflicting 65px/70px values in other @media blocks.

- Optional: table-wrapper on mobile has a subtle right-edge inset shadow as a scroll hint for horizontal scroll.

- Cleanup: removed unused mobile-nav.js script from all pages (navigation is handled by sidebar-nav.js); legacy .main-nav / .mobile-nav-* CSS remains but is unused.



## [2.6.3] - 2026-02-22

### Refresh the app UI into a lighter racing dashboard theme with non-modal navigation, cleaner controls, and preserved race/event layouts.

- Updated global design tokens in `styles.css` to align with the new palette direction (`#0F0F0F`, `#1A1A1A`, `#222222`), brighter content text hierarchy, softer structural shadows, and dedicated fast interaction tokens (`120ms` controls, `200ms` sidebar).

- Reworked sidebar styling to remove heavy modal feel: transparent non-dimming overlay behavior, cleaner active/hover states (left orange indicator instead of full gradient fill), and synchronized slide/panel transitions for smoother navigation feedback.

- Refined global button system for a more mechanical and responsive feel: 8px radius controls, simplified interactions (removed shimmer/ripple effects), orange primary actions, and dark outline-style secondary actions.

- Restyled global cards/panels to use darker grey dashboard surfaces with subtle lift, reduced visual noise, and token-driven hover/focus feedback.

- Updated race/event presentation styles while preserving layout structure: `styles/race.css` now uses the new token system for event cards and race cards without changing event/race DOM organization.

- Updated inline hero/button overrides across core pages (`index.html`, `registration.html`, `existing-drivers.html`, `participants.html`, `series.html`, `races.html`, `events.html`, `final-results.html`) so primary/secondary actions and spacing feel consistent while preserving existing layouts.



## [2.6.2] - 2026-02-17

### Fix remaining participant edit lookup failures by adding participant-by-id API retrieval and wiring edit pages to use server fallback when cache misses.

- Added `GET /api/participants/<participant_id>` support in `server.py` so edit UIs can reliably fetch a participant record by ID.

- Added `getParticipantById()` to `utils/data-manager.js` with server fallback and cache refresh, and warmed cache from paginated participant fetches.

- Updated `modules/driver-edit-form.js` to use `dataManager.getParticipantById()` and corrected auth fetch wrapper usage (`Auth.fetch`) for secure participant lookup.

- Updated `participants.html` edit flow to fetch participant by ID when not in local cache and to keep the registration-focused edit modal path active.

- Updated `existing-drivers.html` driver/edit URL-parameter and selection flows to use participant-by-id fallback so valid drivers no longer trip false `Driver not found`.



## [2.6.1] - 2026-02-17

### Fix issue #111 existing-event registration editing by correcting participant lookup, event-specific class handling, and edit-flow persistence.

- Fixed `existing-drivers.html` runtime bootstrapping failure by guarding optional global handler exports that were previously referencing undefined symbols (`closeDriverEditModal`, `saveDriverEdit`).

- Normalized participant/event ID comparisons across frontend and backend participant lookup paths to prevent false `Driver not found` / `Participant not found` outcomes when IDs differ by type (string vs number).

- Corrected race class grouping to resolve `eventClasses` using normalized event IDs before falling back to aggregate classes, preventing event-specific class edits from being interpreted as global/all-class assignments.

- Updated registration edit-mode submission to persist event-scoped class changes under `eventClasses[eventId]` and recompute aggregate `selectedClasses` without overwriting other event mappings.

- Hardened DB update semantics so unchanged participant updates still return success when the record exists, avoiding false failure responses on no-op saves.

- Added regression coverage for:

- participant registration endpoint ID normalization,

- participant DB unchanged-vs-changed update behavior,

- race event-class resolution normalization,

- registration edit-mode event-specific class persistence.



## [2.6.0] - 2025-02-17

### Version system rework: automatic MAJOR.MINOR.PATCH versioning, organised patch notes (detailed + simple publication view), and trace for all changes/LLM input.

- Replaced custom version scheme (D0L12R*) with simple semantic versioning: MAJOR.MINOR.PATCH (e.g. 2.6.0). Single source of truth: version.json.

- Added scripts/version_bump.py to bump patch (default), minor, or major automatically.

- Restructured patch notes: PATCHNOTES.txt = detailed (documentation) with Summary/Details/Files/Meta; CHANGELOG.md = simple view for publication (user-facing bullets). All changes and LLM input must leave a trace in PATCHNOTES with Meta/Source.

- Added scripts/generate_changelog.py to build CHANGELOG.md from PATCHNOTES (new-format entries only).

- Server /api/version now reads from version.json instead of parsing PATCHNOTES.

- EPC17_RULES.mdc updated with new versioning and patchnote rules. Legacy entries (pre-2.6) kept below for history.



*Older releases (pre-2.6) are documented in PATCHNOTES.txt under "Legacy entries".*
