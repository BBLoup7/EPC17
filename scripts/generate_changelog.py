#!/usr/bin/env python3
"""
EPC17 Changelog Generator

Reads PATCHNOTES.txt, parses new-format entries (## [X.Y.Z] - DATE - type),
extracts Summary and optional Details bullets, writes CHANGELOG.md (simple view).

Run after adding new entries to PATCHNOTES to refresh the publication changelog:
  python scripts/generate_changelog.py
"""

import os
import re

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
PATCHNOTES_PATH = os.path.join(ROOT_DIR, "PATCHNOTES.txt")
CHANGELOG_PATH = os.path.join(ROOT_DIR, "CHANGELOG.md")

# Match: ## [X.Y.Z] - YYYY-MM-DD - type
ENTRY_HEADER = re.compile(r"^##\s+\[(\d+\.\d+\.\d+)\]\s+-\s+(\d{4}-\d{2}-\d{2})\s+-\s+(\w+)", re.MULTILINE)


def parse_patchnotes(content):
    """Extract new-format entries (version, date, type, summary, bullets)."""
    entries = []
    pos = 0
    while True:
        m = ENTRY_HEADER.search(content, pos)
        if not m:
            break
        version, date, typ = m.group(1), m.group(2), m.group(3)
        start = m.end()
        next_m = ENTRY_HEADER.search(content, start)
        end = next_m.start() if next_m else len(content)
        block = content[start:end]

        summary = ""
        bullets = []
        in_summary = False
        in_details = False
        for line in block.split("\n"):
            s = line.strip()
            if s == "### Summary":
                in_summary = True
                in_details = False
                continue
            if s == "### Details":
                in_summary = False
                in_details = True
                continue
            if s.startswith("### ") or s == "---":
                in_summary = False
                in_details = False
                continue
            if in_summary and s:
                summary = s
                in_summary = False
            if in_details and s and (s.startswith("- ") or s.startswith("* ")):
                bullets.append(s[2:].strip())
        entries.append({"version": version, "date": date, "type": typ, "summary": summary, "bullets": bullets})
        pos = end
    return entries


def build_changelog(entries):
    header = """# EPC17 Changelog (Publication — simple view)

User-facing release notes. For full documentation and file-level trace, see `PATCHNOTES.txt`.

---
"""
    sections = []
    for e in entries:
        title = e["summary"] or e["version"]
        sections.append(f"## [{e['version']}] - {e['date']}\n\n### {title}\n")
        for b in e["bullets"][:15]:  # limit bullets for "simple" view
            sections.append(f"- {b}\n")
        if not e["bullets"] and e["summary"]:
            sections.append(f"- {e['summary']}\n")
        sections.append("\n")
    footer = "\n*Older releases (pre-2.6) are documented in PATCHNOTES.txt under \"Legacy entries\".*\n"
    return header + "\n".join(sections) + footer


def main():
    with open(PATCHNOTES_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    entries = parse_patchnotes(content)
    if not entries:
        return
    out = build_changelog(entries)
    with open(CHANGELOG_PATH, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"Wrote {len(entries)} version(s) to CHANGELOG.md")


if __name__ == "__main__":
    main()
