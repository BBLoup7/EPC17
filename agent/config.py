"""Configuration helpers for the local GitHub issue agent."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class AgentConfig:
    """Runtime configuration loaded from environment variables."""

    github_token: str
    github_repo: str
    cursor_mode: str = "stdin"
    cursor_response_file: str | None = None
    memory_file: str = "agent/memory.json"


def load_config() -> AgentConfig:
    """Load and validate required environment variables."""
    token = os.getenv("GITHUB_TOKEN", "").strip()
    repo = os.getenv("GITHUB_REPO", "").strip()
    cursor_mode = os.getenv("CURSOR_AGENT_MODE", "stdin").strip().lower()
    response_file = os.getenv("CURSOR_AGENT_RESPONSE_FILE", "").strip() or None
    memory_file = os.getenv("AGENT_MEMORY_FILE", "agent/memory.json").strip()

    if not token:
        raise ValueError("Missing GITHUB_TOKEN environment variable.")
    if not repo:
        raise ValueError("Missing GITHUB_REPO environment variable (owner/repo).")

    return AgentConfig(
        github_token=token,
        github_repo=repo,
        cursor_mode=cursor_mode,
        cursor_response_file=response_file,
        memory_file=memory_file,
    )

