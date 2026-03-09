from agent.context_builder import build_issue_prompt


def test_build_issue_prompt_includes_required_sections():
    prompt = build_issue_prompt(
        issue_title="Fix lane stats crash",
        issue_body="Stack trace appears when lane is null.",
        repo_name="owner/repo",
        extra_context="File: server.py\n# some code",
    )

    assert "Fix lane stats crash" in prompt
    assert "Stack trace appears when lane is null." in prompt
    assert "owner/repo" in prompt
    assert "ready-to-post GitHub comment summary" in prompt

