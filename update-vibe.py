#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.9"
# dependencies = [
#   "requests>=2.31.0",
# ]
# ///

import os
import shutil
import sys
import zipfile
from pathlib import Path, PurePosixPath
from typing import Optional

import requests

def download_private_repo_zip(
    owner: str,
    repo: str,
    ref: str = "main",
    output_dir: str = ".",
    token_env_var: str = "GITHUB_TOKEN",
    token: Optional[str] = None,
) -> list[Path]:
    """
    Download a private GitHub repository as a zip archive and update only
    the local update-vibe.py file while merging contents into .agents.

        Run:
            uv run update-vibe.py

        Auth:
      export GITHUB_TOKEN=your_token_here

    Token notes:
      - Fine-grained PAT recommended
      - Repo permission: Contents -> Read
    """
    token = token or os.getenv(token_env_var)
    if not token:
        raise RuntimeError(
            f"Missing {token_env_var}. Set it to a GitHub token with access to {owner}/{repo}."
        )

    output_path = Path(output_dir).resolve()
    output_path.mkdir(parents=True, exist_ok=True)

    zip_url = f"https://api.github.com/repos/{owner}/{repo}/zipball/{ref}"
    zip_file = output_path / f"{repo}-{ref}.zip"

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "private-repo-downloader",
    }

    with requests.get(zip_url, headers=headers, stream=True, timeout=60) as resp:
        if resp.status_code == 404:
            raise RuntimeError(
                "Repo/ref not found, or token does not have access."
            )
        if resp.status_code == 401:
            raise RuntimeError("Unauthorized. Check your token.")
        if resp.status_code == 403:
            raise RuntimeError(
                "Forbidden. Token may be missing required permissions."
            )

        resp.raise_for_status()

        with open(zip_file, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    f.write(chunk)

    updated_paths: list[Path] = []
    repo_root = output_path.resolve()
    agents_path = repo_root / ".agents"

    with zipfile.ZipFile(zip_file, "r") as zf:
        members = zf.infolist()
        root_prefix = None
        update_member = None
        agents_members = []

        for member in members:
            member_path = PurePosixPath(member.filename)
            if not member_path.parts:
                continue

            if root_prefix is None:
                root_prefix = member_path.parts[0]

            if member_path.parts[0] != root_prefix:
                continue

            relative_parts = member_path.parts[1:]
            if not relative_parts:
                continue

            if relative_parts == ("update-vibe.py",):
                update_member = member
                continue

            if relative_parts[0] == ".agents":
                agents_members.append(member)

        if update_member is None:
            raise RuntimeError("Downloaded archive does not contain update-vibe.py at the repository root.")

        if not agents_members:
            raise RuntimeError("Downloaded archive does not contain a .agents directory at the repository root.")

        if agents_path.exists() and not agents_path.is_dir():
            raise RuntimeError("Local .agents path exists but is not a directory.")

        agents_path.mkdir(parents=True, exist_ok=True)

        local_update = repo_root / "update-vibe.py"
        with zf.open(update_member, "r") as src, open(local_update, "wb") as dst:
            shutil.copyfileobj(src, dst)
        updated_paths.append(local_update)

        for member in agents_members:
            member_path = PurePosixPath(member.filename)
            relative_path = Path(*member_path.parts[1:])
            target_path = repo_root / relative_path

            if member.is_dir():
                target_path.mkdir(parents=True, exist_ok=True)
                continue

            target_path.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(member, "r") as src, open(target_path, "wb") as dst:
                shutil.copyfileobj(src, dst)

        updated_paths.append(agents_path)

    return updated_paths


if __name__ == "__main__":
    # if len(sys.argv) < 3:
    #     print("Usage: python download_repo.py <owner> <repo> [ref] [output_dir]")
    #     sys.exit(1)

    github_token = sys.argv[1]

    owner_arg = "bently0602"
    repo_arg = "catchacodevibe"
    ref_arg = "main"
    out_arg = "."


    updated = download_private_repo_zip(
        owner_arg,
        repo_arg,
        ref_arg,
        out_arg,
        token=github_token,
    )
    print("Updated:")
    for path in updated:
        print(f"- {path}")