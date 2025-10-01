This README is concise and action-oriented. For development workflow and prompt specs consult `EPC17_WORKFLOW.md` and `EPC17_PROMPTS.md` in the repository root.

## Quick start

### Requirements
- Python 3.8+
- Node (optional, for frontend build tooling)
- Modern browser
- Local network access for multi-machine setups

### Install and run (dev)
```bash
# clone
git clone https://github.com/your-username/EPC17.git
cd EPC17

# python env (venv or pipenv recommended)
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# start server (dev)
export FLASK_ENV=development
python server.py
# or: flask --app server run --port 5000
```

Open: `http://localhost:5000` or `http://<host-ip>:5000` for network access.

## Project layout (short)

```
/app
  /client        # frontend code (components, views, styles)
  /server        # Flask app, API endpoints, services
  /llm           # Prompt specs, examples, evaluators
  /data          # JSON storage + automatic backups
  /testing       # Unit/integration/perf tests
README.md
EPC17_WORKFLOW.md
EPC17_PROMPTS.md
PATCHNOTES.txt
```
Refer to `EPC17_WORKFLOW.md` for detailed branch, CI, and testing guidance. Refer to `EPC17_PROMPTS.md` for LLM prompt standards and examples.

## Core features (concise)

- Registration: participant CRUD, validations, tech sheets
- Series & Event Management: configure series, events, and classes
- Pairing Engine: rematch avoidance, lane optimization, free-run handling
- Race Management: real-time race input, false-start handling, crash recovery
- Live Display: spectator view with live updates via WebSocket/SSE
- Analytics: standings, driver stats, exportable reports
- Persistence: UUID-based IDs, JSON-backed prototype storage with backups
- LLM Integration: prompt-driven race recap generator and future voice features (controlled via `llm/prompts`)

## API (representative endpoints)

| Path | Method | Description |
|------|--------|-------------|
| `/api/participants` | GET/POST/PUT/DELETE | Manage participants |
| `/api/series` | GET/POST | Series management |
| `/api/events` | GET/POST/PUT | Event operations |
| `/api/races` | GET/POST | Bracket generation, results |
| `/api/standings` | GET | Compute standings |
| `/api/health` | GET | Health & metrics |

All endpoints validate input server-side and return structured JSON errors when validation fails.

## Development notes & standards

- JavaScript: ES6 modules, JSDoc header required in each module
- Python: PEP8, Flask with blueprints for modular APIs
- Accessibility: semantic HTML, ARIA where applicable, keyboard focus flows
- Testing: aim for high coverage on pairing and analytics logic
- Performance targets: initial load <2s, UI actions <100ms
- Error handling: structured logging, scrub PII from logs, persist prompt version per LLM call

## Pairing engine summary (practical)

- Deterministic pairing preferred; use seeded randomness only for tie-breaking in tests
- Avoid rematches until all pairings exhausted per class
- Assign lanes by least-used + recency tie-breaker; maintain lane diversity across heats
- Persist pairing state after each operation for crash recovery and auditability

## Prompt-driven features (short)

LLM-driven features must follow the PromptSpec pattern in `EPC17_PROMPTS.md`. Key rules:

- Strict return formats (prefer JSON)
- Grounding: never invent missing data; set `needs_data: true` when required fields are absent
- Low temperature for factual generation (≤0.3)
- Log prompt version and inputs (PII redacted) for traceability

If you plan to modify prompts, update the PromptSpec and attach a gold example and evaluation score as described in `EPC17_PROMPTS.md`.

## Testing & CI

- Local test command (example):
```bash
# run unit tests
pytest -q

# run a specific test file
pytest testing/pairing_test.py::test_even_participants -q
```
- CI pipeline (recommended): lint → unit tests → integration → perf smoke → deploy staging
- Performance tests should include 1,000+ synthetic participants to validate pairing scalability

## Deployment & backups

- For production, replace JSON storage with a transactional DB (Postgres recommended) and add proper backups and migrations
- Use secrets manager for API keys (LLM or voice TTS)
- Schedule periodic backups and test restore process in staging before production

## Troubleshooting (common)

- Server fails to start: check Python version, dependencies, and port conflicts
- Data not persisting: verify filesystem permissions and backup writes in `/data/backups`
- Network access issues: ensure host uses `0.0.0.0` and firewall allows port

## Contributing

1. Fork → create feature branch `feature/<ticket>-desc`
2. Implement tests and code; update docs (PromptSpec if LLM changes)
3. Open PR with description, test plan, and screenshots/sample outputs
4. Ensure CI passes and reviewers approve

## License

MIT. See `LICENSE.txt` for details.

## Next steps & suggestions (practical)
- Add `pairing-engine` unit tests with canonical scenarios (even/odd/multi-class)
- Create a `PromptExample` directory with gold input/output pairs for race recaps
- Replace JSON storage with Postgres when moving to production
- Add a lightweight monitoring dashboard that surfaces pairing health and queue lengths

