"""CLI entry point for the EPC17 GitHub issue agent."""

from __future__ import annotations

import argparse
import sys

from agent.config import load_config
from agent.cursor_interface import CursorInterface
from agent.github_client import GitHubClient
from agent.issue_manager import IssueManager


def build_parser() -> argparse.ArgumentParser:
    """Build CLI argument parser."""
    parser = argparse.ArgumentParser(
        prog="agent",
        description="Local GitHub issue agent for Cursor-assisted workflows.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("list", help="List open issues.")

    resolve_parser = subparsers.add_parser(
        "resolve", help="Fetch issue, generate response, and optionally post back."
    )
    resolve_parser.add_argument("issue_number", type=int, help="Issue number to resolve.")
    resolve_parser.add_argument(
        "--context",
        nargs="*",
        default=[],
        help="Optional file paths to include as context.",
    )
    resolve_parser.add_argument(
        "--post", action="store_true", help="Post response as a GitHub issue comment."
    )
    resolve_parser.add_argument("--label", type=str, help="Label to add after processing.")
    resolve_parser.add_argument(
        "--close", action="store_true", help="Close issue after processing."
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    """Run CLI command."""
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        config = load_config()
        github_client = GitHubClient(config.github_token, config.github_repo)
        cursor = CursorInterface(config.cursor_mode, config.cursor_response_file)
        manager = IssueManager(
            github_client=github_client,
            cursor_interface=cursor,
            repo_name=config.github_repo,
            memory_file=config.memory_file,
        )

        if args.command == "list":
            for line in manager.list_open_issues():
                print(line)
            return 0

        if args.command == "resolve":
            response = manager.resolve_issue(
                issue_number=args.issue_number,
                context_files=args.context,
                post_comment=args.post,
                add_label=args.label,
                close_issue=args.close,
            )
            print("\n===== CURSOR RESPONSE =====\n")
            print(response)
            return 0

    except Exception as exc:  # pylint: disable=broad-exception-caught
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

