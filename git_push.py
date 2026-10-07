#!/usr/bin/env python3
"""Commit all changes and push to GitHub using the token in .env."""
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
NAME = "chordy"
EMAIL = "chordymyanmar@gmail.com"
MESSAGE = "update"


def git(*args, check=True):
    return subprocess.run(["git", *args], cwd=ROOT, text=True, check=check)


def read_token():
    env = ROOT / ".env"
    if not env.exists():
        sys.exit("Missing .env (copy .env.example and set GITHUB_TOKEN).")
    for line in env.read_text().splitlines():
        line = line.strip()
        if line.startswith("GITHUB_TOKEN="):
            token = line.split("=", 1)[1].strip().strip("\"'")
            if token:
                return token
    sys.exit("GITHUB_TOKEN not set in .env")


def push_url(token):
    remote = subprocess.run(
        ["git", "remote", "get-url", "origin"],
        cwd=ROOT, text=True, capture_output=True, check=True,
    ).stdout.strip()
    p = urlparse(remote)
    if p.scheme != "https":
        sys.exit(f"origin must be an https URL, got: {remote}")
    return f"https://x-access-token:{token}@{p.netloc}{p.path}"


def main():
    token = read_token()
    git("status", "--short")
    if input("Commit and push these changes? [y/N] ").strip().lower() != "y":
        sys.exit("Cancelled.")

    git("add", "-A")
    staged = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=ROOT)
    if staged.returncode != 0:
        git("-c", f"user.name={NAME}", "-c", f"user.email={EMAIL}",
            "commit", "-m", MESSAGE)
    else:
        print("Nothing new to commit; pushing existing commits.")

    branch = subprocess.run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        cwd=ROOT, text=True, capture_output=True, check=True,
    ).stdout.strip()
    # Token is only used for this push; it is never written to .git/config.
    result = subprocess.run(
        ["git", "push", push_url(token), f"HEAD:{branch}"],
        cwd=ROOT, text=True, capture_output=True,
    )
    out = (result.stdout + result.stderr).replace(token, "***")
    print(out)
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
