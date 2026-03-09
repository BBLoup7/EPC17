"""Thin GitHub API wrapper used by the local issue agent."""

from __future__ import annotations

from github import Github


class GitHubClient:
    """Wrapper around PyGithub for issue-focused operations."""

    def __init__(self, token: str, repo_name: str):
        self._gh = Github(token)
        self._repo = self._gh.get_repo(repo_name)

    def list_open_issues(self):
        """Return all open issues."""
        return self._repo.get_issues(state="open")

    def get_issue(self, number: int):
        """Return a single issue by number."""
        return self._repo.get_issue(number=number)

    def create_comment(self, issue_number: int, body: str):
        """Create a comment on an issue."""
        issue = self.get_issue(issue_number)
        return issue.create_comment(body)

    def add_label(self, issue_number: int, label: str):
        """Attach a label to an issue."""
        issue = self.get_issue(issue_number)
        issue.add_to_labels(label)

    def close_issue(self, issue_number: int):
        """Close an issue."""
        issue = self.get_issue(issue_number)
        issue.edit(state="closed")

