---
name: github-blueprint
description: GitHub platform integration. Manage pull requests, issues, repository settings, and CI/CD status directly from the server.
metadata: {"requires":{"bins":["gh"],"env":["GITHUB_TOKEN"]}}
---

# GitHub Skill 🐙

GitHub platform integration using the `gh` CLI. Use this blueprint when a user asks to manage the repository, check CI status, or handle PRs.

## Features

- **Issue Management**: List, view, and create issues.
- **Pull Requests**: Create, merge, list, and review PRs.
- **Actions/CI**: Check run status, view logs, and trigger workflows.
- **Repo Management**: Clone, settings, and release management.

## Setup

The `gh` CLI must be authenticated.
```bash
export GITHUB_TOKEN="your_personal_access_token"
# Or run
gh auth login
```

## Usage Examples

- "List open PRs for this repo"
- "Create an issue titled 'Fix nginx config' with body 'The port 80 is blocked'"
- "What is the status of the last GitHub action run?"
- "Merge PR #45"

## Reference Commands

- **Issues**: `gh issue list`, `gh issue view`, `gh issue create`
- **PRs**: `gh pr list`, `gh pr create`, `gh pr merge`, `gh pr status`
- **Actions**: `gh run list --limit 5`, `gh run view [id]`
- **Auto-Detection**: `gh repo view` (checks if the current directory is a GH repo)

## Guidance

1. **Detection**: Always run `gh repo view` first to ensure the current directory is a valid GitHub repository.
2. **Context**: When creating issues or PRs, use `git log` or `git status` to gather context about recent changes to make the description helpful.
3. **Safety**: Always ask for approval before merging a PR or creating a release.

## Approval Required

Yes (for state-changing actions like merge, create, or delete).
No (for list, view, and status checks).
