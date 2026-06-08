# Shared Skills Workflow

Mission Control repo-specific Codex skills are stored in a separate canonical repository:

```text
https://github.com/MECO-Robotics/mission-control-skills.git
```

The app repos `meco-mission-control-web`, `meco-mission-control-platform`, and `meco-mission-control-mobile` import `skills/` as local ignored files. The shared repo is the only place the skill files themselves should be versioned.

## Storage Decision

Use a separate shared Git repo plus script-managed ignored imports.

Do not use Git submodules. Submodules add separate checkout, update, and CI handling, and they make student, mentor, and Codex workflows more fragile.

Do not publish these skills as an npm package. Codex skills are repository files, not runtime application dependencies, and package installation would mix contributor tooling with app dependency management.

Do not copy and commit `skills/` into app repos. Copied tracked skills drift across web, platform, and mobile. App repos track only the sync scripts, CI workflow, and this documentation.

## Shared Source Layout

The shared `mission-control-skills` repo uses this canonical layout:

```text
skills/
  <skill-name>/
    SKILL.md
```

## Versioning And Releases

Shared skill releases use SemVer tags:

```text
vMAJOR.MINOR.PATCH
```

- Major: breaking workflow or skill contract changes that require coordinated app repo updates.
- Minor: new skills or compatible behavior changes.
- Patch: wording fixes, clarifications, and non-breaking instruction updates.

`main` in `mission-control-skills` is the integration branch. App repos should pin stable releases with `SKILLS_REF=vX.Y.Z` once a release tag exists. Local testing may use `SKILLS_REF=main`, a feature branch, or a commit SHA.

Release workflow:

```bash
cd mission-control-skills
git checkout -b feature/update-shared-skills origin/main
git add skills README.md
git commit -m "Update shared skills"
git push -u origin feature/update-shared-skills
```

Open a pull request into `main`, review it, and merge it. Then tag the merged release:

```bash
git checkout main
git pull
git tag vX.Y.Z
git push origin vX.Y.Z
```

After tagging a release, announce the new tag and update the `SKILLS_REF` repository variable in web, platform, and mobile.

## Import Into An App Repo

From an app repo root:

```bash
SKILLS_REF=vX.Y.Z bash scripts/sync-skills.sh
```

On PowerShell:

```powershell
$env:SKILLS_REF = "vX.Y.Z"
.\scripts\sync-skills.ps1
```

Do not `git add skills`. The imported directory is intentionally ignored and should stay out of app repo commits.

## Configuration

The scripts default to:

```text
SKILLS_REPO=https://github.com/MECO-Robotics/mission-control-skills.git
SKILLS_REF=<shared repo default branch>
```

Use `SKILLS_REPO` to point at a fork, local test repo, or alternate remote. Use `SKILLS_REF` to pin a release tag, branch, or commit SHA.

```bash
SKILLS_REPO=git@github.com:MECO-Robotics/mission-control-skills.git SKILLS_REF=vX.Y.Z bash scripts/sync-skills.sh
```

```powershell
$env:SKILLS_REPO = "git@github.com:MECO-Robotics/mission-control-skills.git"
$env:SKILLS_REF = "vX.Y.Z"
.\scripts\sync-skills.ps1
```

## Import Check

```bash
bash scripts/check-skills-current.sh
```

The check uses the configured `SKILLS_REPO` and `SKILLS_REF`, imports or compares the shared skills depending on the repo script, and exits nonzero when the import fails.

CI runs the same import check on pull requests and pushes. Configure:

- `SKILLS_REPO` as an optional repository variable or secret when the default repo is not correct.
- `SKILLS_REF` as a repository variable pinned to the approved release tag.
- `SKILLS_REPO_DEPLOY_KEY` or `SKILLS_REPO_TOKEN` as a secret if the shared repo is private.

Do not hardcode credentials in scripts or workflow files.

## Review Imported Files Locally

Inspect the local imported files when changing shared skill behavior:

```bash
find skills -maxdepth 2 -type f | sort
```
