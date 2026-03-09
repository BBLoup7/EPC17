# EPC17 Local Issue Agent

Local bridge script for GitHub issue workflows with Cursor.

## Setup

1. Set environment variables:

   - `GITHUB_TOKEN` = fine-grained PAT with issues read/write
   - `GITHUB_REPO` = `owner/repo` (example: `BBLoup7/EPC17`)

2. Choose Cursor response mode:

   - `CURSOR_AGENT_MODE=stdin` (default): script prints prompt, you paste Cursor response
   - `CURSOR_AGENT_MODE=file`: read response from `CURSOR_AGENT_RESPONSE_FILE`
   - `CURSOR_AGENT_MODE=echo_prompt`: debug mode

## Usage

List open issues:

```powershell
python -m agent.cli list
```

Resolve issue and print generated response:

```powershell
python -m agent.cli resolve 14 --context server.py modules/race.js
```

Resolve issue and post comment + label:

```powershell
python -m agent.cli resolve 14 --context server.py --post --label in-progress
```

Resolve issue and close it:

```powershell
python -m agent.cli resolve 14 --post --close
```

## Local Memory Log

Actions are appended to `agent/memory.json` for traceability.

