# Shared Skills Workflow

Mission Control app repos import `skills/` as local ignored files. The shared source of truth is the separate `mission-control-skills` repo, and each app repo hydrates a local copy from that source when needed.

In this workspace the app repos are `meco-mission-control-web`, `meco-mission-control-platform`, and `meco-mission-control-mobile`. Older shorthand may call them `mission-control-web`, `mission-control-api`, and `mission-control-mobile`.

## Why Ignored Imports Instead of Submodules

Git submodules embed another repository with separate history and a pinned commit. That adds extra clone, checkout, update, and CI handling. GitHub Actions also needs explicit submodule checkout configuration. For students, mentors, and Codex agents, a script-managed local import is simpler to refresh and keeps app repo diffs focused.

This repo intentionally does not use `.gitmodules`, `git submodule add`, or a nested Git repository under `skills/`.

The app repos track the sync scripts and documentation, not the imported skill files. `skills/` is intentionally ignored by Git.

## Shared Source Layout

The shared `mission-control-skills` repo should contain:

```text
skills/
  app-architecture/
  ui-review/
  api-review/
  frc-domain/
  github-project-management/
  meco-writing-style/
```

## Update Shared Source

```bash
cd mission-control-skills
git add skills
git commit -m "Update shared skills"
git push
```

## Import Into an App Repo

```bash
cd meco-mission-control-web
bash scripts/sync-skills.sh
```

Do not `git add skills`. The imported directory is intentionally ignored and should stay out of app repo commits.

## Override the Shared Repo

The scripts default to:

```text
https://github.com/MECO-Robotics/mission-control-skills.git
```

Use `SKILLS_REPO` to point at a fork, local test repo, or alternate remote.

```bash
SKILLS_REPO=git@github.com:MECO-Robotics/mission-control-skills.git bash scripts/sync-skills.sh
```

```powershell
$env:SKILLS_REPO = "git@github.com:MECO-Robotics/mission-control-skills.git"
.\scripts\sync-skills.ps1
```

## Import Check

```bash
bash scripts/check-skills-current.sh
```

The check delegates to `scripts/sync-skills.sh`, imports the shared skills into ignored local state, and exits nonzero if the import fails.

## Review Imported Files Locally

Inspect the local imported files when changing shared skill behavior:

```bash
find skills -maxdepth 2 -type f | sort
```

CI runs the same import check on pull requests and pushes. Configure the source URL with a `SKILLS_REPO` repository variable or secret when the default is not correct. If the shared repo is private, configure access with a deploy key or token through GitHub secrets; do not hardcode credentials in scripts or workflow files.
