---
name: documentation-check
description: End-of-request documentation audit for coding work. Use at the end of any request that changes, adds, removes, renames, or meaningfully reconfigures code, APIs, scripts, commands, tests, features, workflows, dependencies, environment variables, routes, schemas, or user-facing behavior. Check whether project documentation should be updated to match the latest code changes, update stale documentation when necessary, and leave documentation untouched when it already matches the changes.
---

# Documentation Check

## Purpose

Run this as a final pass after completing the user's requested work and before the final response. The goal is to keep documentation aligned with real code behavior without creating unnecessary documentation churn.

## Workflow

1. Identify the change scope.
   - Inspect the files changed during the request with `git diff --name-only` and, when useful, `git diff --stat`.
   - Review the actual diff for behavior, public interfaces, setup steps, commands, dependencies, data contracts, routes, screens, or workflows that changed.
   - Ignore generated files, lockfile-only noise, formatting-only changes, and internal refactors that do not affect documented behavior.

2. Find relevant documentation.
   - Prefer project docs such as `README*`, `docs/`, `AGENTS.md`, `CONTRIBUTING*`, architecture notes, setup guides, API docs, changelogs, release notes, and feature-specific docs.
   - Use `rg` to search for names of changed commands, components, routes, environment variables, APIs, feature flags, and user-facing labels.
   - Include inline documentation only when the repo already treats it as user or developer documentation.

3. Decide whether docs are stale.
   - Update docs when code changes make existing documentation wrong, incomplete, misleading, or missing an expected setup or usage step.
   - Update docs when a new public workflow, command, environment variable, dependency, integration, API contract, screen, or user-facing capability was added.
   - Do not update docs for purely private implementation changes unless existing docs describe those internals.
   - Do not add speculative docs, aspirational behavior, or broad documentation rewrites outside the change scope.

4. Make only necessary documentation edits.
   - Keep edits small, factual, and scoped to the code changes.
   - Match the existing documentation voice, structure, headings, and formatting.
   - Prefer updating nearby existing docs over creating new files.
   - Create a new doc only when no suitable documentation location exists and the changed behavior genuinely needs durable documentation.
   - Do not touch documentation timestamps, badges, or formatting unless needed for accuracy.

5. Verify the result.
   - Re-read the edited documentation and compare it with the final code behavior.
   - If documentation was changed, include it in the normal validation or final summary.
   - If no documentation change is needed, continue with the request and do not mention a no-op doc audit unless it is useful context for the final response.

## Documentation Triggers

Treat these changes as strong signals that documentation may need updates:

- Public commands, scripts, package manager tasks, CI jobs, or release processes.
- Installation, setup, configuration, or environment variable changes.
- Dependencies that users or contributors must know about.
- API request or response shapes, database schemas, permissions, auth flows, or integration behavior.
- User-facing screens, navigation, labels, feature behavior, or supported platforms.
- Test instructions, fixture workflows, snapshot processes, or validation requirements.
- File moves or renames that make documented paths stale.

## Non-Goals

- Do not invent documentation requirements unrelated to the current request.
- Do not update docs just because docs could be improved.
- Do not reformat documentation broadly.
- Do not block the final answer when the audit finds no stale documentation.
