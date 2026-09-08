# Agent guidance

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, validation and PR delivery.

- Work in a dedicated worktree based on the intended PR target. Keep the base checkout read-only and stage only task-owned files.
- This is an undeployed prototype with disposable application data. Prefer a coherent replacement over compatibility scaffolding; report breaking changes and reset commands.
- Start with relevant rows in the workspace `CODE_CLEANUP_PLAN.md` when present. Read only the source and documentation needed for the task; historical audits are not current specifications.
- Prefer one clear owner, one authoritative representation and explicit dependencies. Consolidate forwarding layers and duplication; do not split files, imports or directories to satisfy numeric limits.
- For auth, payload, schema or API changes, inspect the affected web/mobile consumers and update contracts together. Platform route validation defines accepted requests.
- Keep meaningful behavior tests. Reuse verification outputs within a revision instead of repeating suites or adding one-off frameworks.
- Report exact validation and its limits. Do not claim a running application without checking it, or an approval without an actual approving review.
- Shared skills and context engines are optional; load only those relevant to the task. Parallel agents must have disjoint write scopes.
