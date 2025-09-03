
# EPC17 - Development Workflow

## Purpose
This document defines the recommended development workflow for EPC17 — Professional Racing Event Management System. It's focused, practical, and designed for a small engineering team building a robust, testable, and scalable product.

## Versioning & Release Tags
- Beta code format: `YYWwwrVV` (example: `25W32a09`)
  - `YY` year (two digits)
  - `Www` ISO week (W01..W53)
  - `r` weekly revision (a, b, c...)
  - `VV` base-version tie (e.g., `09` -> 0.9.X)
- Update `PATCHNOTES.txt` and increment package version in one commit per release.
- Tag releases in VCS using the beta string (for pre-release) and semver on official releases.

## Branching Strategy
- `main` — stable releases only; protected branch
- `develop` — daily integration branch
- `feature/<ticket>-short-desc` — feature work
- `hotfix/<issue>` — critical fixes off `main`
- `release/<version>` — release stabilization

## Commit & PR Standards
- Commit message format: `[Module] Short description - files changed`
- Each PR must include:
  - Purpose & scope
  - Files changed
  - Test plan for verification
  - Relevant screenshots or sample outputs (for UI/LLM changes)
- Self-review checklist before PR:
  - Code compiles and lint passes
  - Unit tests added/updated
  - Basic performance check run for changed paths
  - PromptSpec updated if prompts changed

## Repo Layout (recommended)
```
/app
  /client
  /server
  /llm
  /data
  /testing
README.md
PATCHNOTES.txt
```

## Coding Standards
- JavaScript: ES6+ modules, async/await, JSDoc header for every module
- Python (server): PEP 8, Flask blueprint-based API
- HTML/CSS: semantic HTML5, ARIA attributes, CSS custom properties
- Avoid global state; prefer injected dependencies for testability

## JSDoc / Module Header Requirements
Every JS module starts with a JSDoc block including:
- Module purpose
- Exports and types
- Expected inputs/outputs
- Failure modes & error codes
- Version tag (beta format)

## Local Development Setup
- Flask server on port 5000
- Client served via local dev server with hot reload
- Mock API endpoint set under `/mock` for dev-only scenarios
- `npm run dev` starts client; `pipenv run flask run` starts backend

## Testing Strategy
- Unit tests for all business logic (target 90% coverage for pairing/analytics)
- Integration tests for event lifecycle and API contracts
- End-to-end tests for critical flows (registration → race → results)
- Performance regression tests for pairing engine with synthetic datasets
- UI tests for core interactive components (form validation, error states)
- Test files organized under `/testing` grouped by feature

## Pairing Engine Testing
- Maintain a set of canonical pairing scenarios:
  - Even number participants
  - Odd number participants (free run)
  - Multi-class overlaps
  - Rematch avoidance exhaustion
- Use deterministic seed for pseudo-random elements during tests

## CI / Pipeline
Example stages:
1. Lint
2. Unit tests
3. Integration tests
4. Build
5. Performance tests (smoke)
6. Deploy to staging (if passing)
- Keep pipeline times short; fail fast on lint/test.

## Performance & Monitoring
- Targets:
  - Initial load < 2s (critical assets)
  - Interaction < 100ms for live UI actions
- Expose health and metrics endpoints on server:
  - `/health` — basic status
  - `/metrics` — timings, memory, event loop lag
- Use lightweight profiling during test runs

## Error Handling & Observability
- Centralized logging with structured JSON logs
- Error levels (DEBUG / INFO / WARN / ERROR)
- Capture stack, inputs (scrub PII), and prompt version (if LLM used)
- Integrate alerting on high error rates or long-tail latency

## Data Management
- Use UUIDs for primary entities
- Local JSON persistence for prototypes with scheduled backups
- Define migration scripts for schema changes
- Snapshot pairing state frequently for crash recovery

## Release Checklist (pre-merge)
- [ ] Tests passing (unit & integration)
- [ ] Pairing logic validated on sample dataset
- [ ] PromptSpec updated & example outputs attached (if applicable)
- [ ] Performance smoke tests OK
- [ ] README & PATCHNOTES updated

## Post-Release Verification
- Sanity tests in production (smoke)
- Verify backups and recovery mechanisms
- Monitor metrics for at least 24 hours for regressions

## Practical Tips & "Tell it like it is" Notes
- Keep pairing deterministic where possible — randomness hurts reproducibility.
- Ship small, verifiable increments. Big refactors are expensive; split them.
- If a prompt-driven feature fails nondeterministically, lower the temperature and tighten the schema — not a better narrative.
- Prioritize correctness of race results and state persistence over flashy UI features.

