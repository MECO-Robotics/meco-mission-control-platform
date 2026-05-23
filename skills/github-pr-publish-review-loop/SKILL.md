---
name: github-pr-publish-review-loop
description: Use when creating, publishing, updating, or repairing GitHub pull requests for MECO Mission Control, especially when PRs need linked issues, GitHub Project progress updates, connector review comments, @codex review loops, or repeated fix and re-review cycles.
---

# GitHub PR Publish Review Loop

Treat PR publishing as an end-to-end workflow: scoped branch, related issue, project status, validation evidence, PR, connector review, fixes, and a clean final state.

## Preflight

- Confirm repo, base branch, current branch, dirty files, and auth with `git status --short --branch`, `git remote -v`, and `gh auth status`.
- Use the user's newest wording as scope. Stage only in-scope files and keep unrelated dirty work untouched.
- Prefer a feature or fix branch off the requested base branch. Default Mission Control PR target is `development` unless the user asks for `main` or another branch.
- Run relevant validation before publishing or after each fix pass. Use targeted checks first, then broader repo checks when the touched surface is shared.
- If connector or `gh` commands fail, try one practical fallback and continue. Do not repeat the same broken path.

## Issues And Project Progress

- Search for an existing related issue before creating a new one. Check title, repo, labels, project items, and nearby feature wording.
- If no suitable issue exists and the work is more than a tiny maintenance patch, create one with problem, desired outcome, scope, acceptance criteria, implementation notes, QA, and related items.
- Link the PR to the issue in the PR body. Use closing keywords only when merge should close the issue.
- Add or update the issue in the relevant GitHub Project when project access is available. Default Mission Control context is `MECO-Robotics`, Project `1`.
- Discover ProjectV2 fields and options at runtime. Do not hardcode field IDs, option IDs, or item IDs.
- Keep progress current:
  - Set active implementation items to `In progress` or the closest available status.
  - Set waiting-on-review items to `In review` or leave a clear issue comment if that status does not exist.
  - Set externally blocked items to `Blocked` with the blocker.
  - Mark complete only after merge or explicit user direction.
- Use `github-project-management` as a companion skill for duplicate cleanup, backlog staging, or complex ProjectV2 field work.

## Publish The PR

- Commit logical units separately when changes are separable.
- Push with upstream tracking: `git push -u origin <branch>`.
- Create or update the PR with a concise title and a body containing:

```markdown
## Summary
- ...

## Validation
- `command`

## Related
- Closes #123
- Project: MECO-Robotics Project 1

## Connector Review
- Requested with `@codex review`.
```

- Prefer GitHub connector PR tools when they are healthy. Use `gh pr create`, `gh pr edit`, `gh pr comment`, and `gh api graphql` as the practical fallback.
- After the PR exists, post `@codex review` unless a connector review was already triggered by the platform.

## Connector Review Loop

Do not stop after one review request when the user asked for connector feedback or review cleanup.

1. Wait for connector feedback after posting `@codex review`.
2. Inspect review threads, top-level comments, review submissions, and the latest connector body. Use thread-aware APIs where possible.
3. If there are actionable comments, implement the smallest correct fixes, run relevant validation, commit, push, resolve addressed threads when supported, and post a fresh `@codex review`.
4. Repeat until the connector explicitly reports no further comments, no actionable findings, or equivalent clean-review language and there are no unresolved actionable threads.
5. If the connector never responds within the user's waiting budget or a branch-protection/policy blocker is external, update the issue/project status to `Blocked` or leave an issue/PR comment with the blocker, then report the exact state.

Approval-like reactions are not enough. A connector `eyes` reaction, zero flat comments, or a mergeable status does not by itself prove review completion; check the latest review/comment text and unresolved thread state.

## Common Mistakes

| Mistake | Correct behavior |
| --- | --- |
| Creating a PR without an issue for substantial work | Search first, create or link the issue, then publish |
| Hardcoding ProjectV2 field IDs | Query fields/options at runtime |
| Treating resolved threads as final approval | Also inspect latest connector review/comment text |
| Stopping after one fix push | Trigger a new connector review and repeat |
| Marking the issue done before merge | Keep it in review or in progress until merge or explicit direction |
| Staging unrelated dirty files | Stage only the files in scope |

## Completion Report

Report the PR URL, issue URL, project progress updates, commits pushed, validation commands run, connector review state, and any remaining blocker. If no issue or project update was made, say why.
