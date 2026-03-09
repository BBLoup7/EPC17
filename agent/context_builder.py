"""Prompt and context builders for GitHub issue resolution."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable


def read_context_files(paths: Iterable[str], max_chars_per_file: int = 4000) -> str:
    """Read selected files and return a compact context block."""
    blocks: list[str] = []
    for raw_path in paths:
        path = Path(raw_path)
        if not path.exists() or not path.is_file():
            blocks.append(f"File: {raw_path}\n[missing or not a file]\n")
            continue

        content = path.read_text(encoding="utf-8", errors="replace")
        if len(content) > max_chars_per_file:
            content = content[:max_chars_per_file] + "\n...[truncated]"

        blocks.append(f"File: {path.as_posix()}\n{content}\n")

    return "\n".join(blocks).strip()


def build_issue_prompt(
    issue_title: str,
    issue_body: str,
    repo_name: str,
    extra_context: str | None = None,
) -> str:
    """Build a practical prompt for Cursor based on a GitHub issue."""
    body = (issue_body or "").strip() or "[No issue body provided]"
    context_block = extra_context.strip() if extra_context else "[No additional context provided]"

    return f"""You are helping resolve a GitHub issue for repository: {repo_name}

Issue title:
{issue_title}

Issue description:
{body}

Additional repository context:
{context_block}

Return:
1) A concise step-by-step implementation plan.
2) Any code-level recommendations tied to this issue.
3) A ready-to-post GitHub comment summary I can paste as-is.
"""

