"""Cursor response adapter for local script workflows."""

from __future__ import annotations

from pathlib import Path


class CursorInterface:
    """Collect response text from a configurable local source."""

    def __init__(self, mode: str = "stdin", response_file: str | None = None):
        self.mode = mode
        self.response_file = response_file

    def get_response(self, prompt: str) -> str:
        """Return an AI response using the selected mode."""
        if self.mode == "echo_prompt":
            return prompt

        if self.mode == "file":
            if not self.response_file:
                raise ValueError("CURSOR_AGENT_RESPONSE_FILE is required for file mode.")
            path = Path(self.response_file)
            if not path.exists():
                raise FileNotFoundError(f"Response file does not exist: {path}")
            return path.read_text(encoding="utf-8").strip()

        if self.mode == "stdin":
            print("\n===== PROMPT TO SEND TO CURSOR =====\n")
            print(prompt)
            print("\n===== PASTE CURSOR RESPONSE (finish with EOF) =====")
            print("Windows PowerShell: Ctrl+Z then Enter")
            print("macOS/Linux: Ctrl+D")

            lines = []
            while True:
                try:
                    lines.append(input())
                except EOFError:
                    break
            response = "\n".join(lines).strip()
            if not response:
                raise ValueError("No response provided.")
            return response

        raise ValueError(f"Unsupported CURSOR_AGENT_MODE: {self.mode}")

