#!/usr/bin/env bash
set -euo pipefail

SKILLS_REPO="${SKILLS_REPO:-https://github.com/MECO-Robotics/mission-control-skills.git}"
SKILLS_REF="${SKILLS_REF:-main}"
# Resolve local sources before Git changes its working directory.
if [ -d "$SKILLS_REPO" ]; then
  SKILLS_REPO="$(cd "$SKILLS_REPO" && pwd -P)"
fi
REPO_ROOT="$(git rev-parse --show-toplevel)"
if [ "$(pwd -P)" != "$(cd "$REPO_ROOT" && pwd -P)" ]; then
  echo "Run this script from the repository root." >&2
  exit 1
fi
if [ ! -d skills ]; then
  echo "Missing optional skills/ import; run scripts/sync-skills.sh first." >&2
  exit 1
fi
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

git -C "$TMP_DIR" init -q
git -C "$TMP_DIR" fetch --quiet --depth 1 "$SKILLS_REPO" "$SKILLS_REF"
git -C "$TMP_DIR" checkout --quiet --detach FETCH_HEAD
if [ ! -d "$TMP_DIR/skills" ]; then
  echo "Selected source revision has no skills/ directory." >&2
  exit 1
fi
if ! diff -qr "$TMP_DIR/skills" skills; then
  echo "skills/ differs from $SKILLS_REF; sync explicitly to update it." >&2
  exit 1
fi
echo "skills/ matches $SKILLS_REF."
