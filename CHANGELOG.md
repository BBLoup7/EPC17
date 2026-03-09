# EPC17 Changelog (Publication — simple view)

User-facing release notes. For full documentation and file-level trace, see `PATCHNOTES.txt`.

---
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
