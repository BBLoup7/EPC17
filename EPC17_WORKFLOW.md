# EPC17 - Development Workflow (ENHANCED for Cursor solo dev)

## High-level Flow
1. **Plan (in-Repo)** - Add/Update `docs/feature-<name>/plan.md`. Include 3–8 tasks.
2. **Spec/Prompt** - Create/Update `llm/prompts/<feature>/v1/PromptSpec.md` and examples.
3. **Implement (chunked)** - Ask Cursor to implement the first task only (one file + one test). Review & run tests.
4. **Iterate** - Fix, refactor, add next task.
5. **Verify** - Run unit/integration tests, accessibility checks, performance smoke.
6. **Release** - Tag, update PATCHNOTES, merge only after checklist passes.

## Commit Standards
- `[Module] Short description - files changed`
- Small, focused commits. Every change has a test or TODO.

## Repo Layout (cursor-optimized)
/app
/client
/components
/pages
/styles
/server
/llm/prompts
/llm/examples
/data
/testing
/docs
EPC17_RULES.mdc
README.md
.patchnotes.txt
.cursorignore

markdown
Copy code

## Testing Strategy
- Unit tests for every business function.
- Integration tests for lifecycle + API.
- UI tests with React Testing Library.
- Deterministic seeds for pairing engine.
- Tests in `/testing/<type>/`.

## CI / Local Pipeline
- Optional script: lint → unit → integration → smoke.
- Performance smoke: snapshot timings for pairing engine.

## Release Checklist
- [ ] Tests passing
- [ ] PromptSpec updated + examples attached
- [ ] Performance tests OK
- [ ] PATCHNOTES updated

## Observability
- Structured JSON logs (scrub PII).
- `/health` and `/metrics` endpoints.
- Save `debug_snapshots/` for deterministic debugging.

## Practical Notes
- Break work into multiple prompts: plan → file patch → tests.
- Treat Cursor like a colleague: ask for short analysis first.
- When flaky: lower temperature, tighten schema, add failing test.
- Keep `/templates/` with reusable patterns.
