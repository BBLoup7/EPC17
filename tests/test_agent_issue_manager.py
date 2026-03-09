import json

from agent.issue_manager import IssueManager


class FakeIssue:
    def __init__(self, number, title, body):
        self.number = number
        self.title = title
        self.body = body


class FakeGitHubClient:
    def __init__(self):
        self._issues = [FakeIssue(1, "One", "Body one")]
        self.commented = False
        self.closed = False
        self.added_label = None

    def list_open_issues(self):
        return self._issues

    def get_issue(self, number):
        return self._issues[0]

    def create_comment(self, issue_number, body):
        self.commented = issue_number == 1 and "AI-assisted" in body

    def add_label(self, issue_number, label):
        if issue_number == 1:
            self.added_label = label

    def close_issue(self, issue_number):
        if issue_number == 1:
            self.closed = True


class FakeCursorInterface:
    def get_response(self, prompt):
        assert "Issue title" in prompt
        return "Plan: Do steps."


def test_issue_manager_resolve_logs_and_applies_actions(tmp_path):
    memory_file = tmp_path / "memory.json"
    manager = IssueManager(
        github_client=FakeGitHubClient(),
        cursor_interface=FakeCursorInterface(),
        repo_name="owner/repo",
        memory_file=str(memory_file),
    )

    response = manager.resolve_issue(
        issue_number=1,
        context_files=[],
        post_comment=True,
        add_label="in-progress",
        close_issue=True,
    )

    assert response == "Plan: Do steps."

    log_data = json.loads(memory_file.read_text(encoding="utf-8"))
    assert isinstance(log_data, list)
    assert log_data[-1]["issue_number"] == 1
    assert log_data[-1]["post_comment"] is True

