# Optional shared skills

The [shared skills repository](https://github.com/MECO-Robotics/mission-control-skills) owns agent workflows. Imported `skills/` files are ignored local copies, not application dependencies. No import is required to build, test or contribute.

From the repository root, explicitly replace the local import with:

```sh
bash scripts/sync-skills.sh
```

PowerShell users can run `./scripts/sync-skills.ps1`. Both entrypoints accept `SKILLS_REPO` (Git URL or local repository path) and `SKILLS_REF` (branch, tag or commit), defaulting to the shared repository and `main`. Select a reviewed commit for reproducibility. Synchronization replaces local edits in `skills/`; make shared changes in the canonical repository through a PR.

Check without changing the import:

```sh
bash scripts/check-skills-current.sh
```

Use the same `SKILLS_REPO` and `SKILLS_REF` for sync and check. The check fetches into a disposable system temporary directory and compares file contents recursively. Missing imports, differences, unavailable revisions and missing source directories exit nonzero. It never hydrates or repairs the import. CI checks shell syntax without importing skills or requiring shared-repository credentials.
