#!/usr/bin/env python3
"""
EPC17 Version Bump Script

Reads version.json, bumps major/minor/patch, writes back and prints new version.
Usage:
  python scripts/version_bump.py           → bump patch (default)
  python scripts/version_bump.py patch     → bump patch
  python scripts/version_bump.py minor     → bump minor, reset patch to 0
  python scripts/version_bump.py major     → bump major, reset minor and patch to 0

Version is MAJOR.MINOR.PATCH (e.g. 2.6.1). Single source of truth: version.json.
"""

import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
VERSION_FILE = os.path.join(ROOT_DIR, "version.json")


def load_version():
    with open(VERSION_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("major", 0), data.get("minor", 0), data.get("patch", 0)


def save_version(major, minor, patch):
    data = {
        "major": major,
        "minor": minor,
        "patch": patch,
        "_comment": "Single source of truth for app version. Use scripts/version_bump.py to bump (patch|minor|major).",
    }
    with open(VERSION_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    return f"{major}.{minor}.{patch}"


def main():
    kind = (sys.argv[1].strip().lower() if len(sys.argv) > 1 else "patch")
    if kind not in ("patch", "minor", "major"):
        print(f"Usage: {os.path.basename(__file__)} [patch|minor|major]", file=sys.stderr)
        sys.exit(1)

    major, minor, patch = load_version()

    if kind == "major":
        major += 1
        minor = 0
        patch = 0
    elif kind == "minor":
        minor += 1
        patch = 0
    else:
        patch += 1

    new_version = save_version(major, minor, patch)
    print(new_version)


if __name__ == "__main__":
    main()
