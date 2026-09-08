#!/usr/bin/env bash
set -euo pipefail

SKILLS_REPO="${SKILLS_REPO:-https://github.com/MECO-Robotics/mission-control-skills.git}"
SKILLS_REF="${SKILLS_REF:-main}"

fail() {
  echo "Error: $*" >&2
  exit 1
}

cleanup() {
  rm -rf "$TMP_DIR"
}

require_repo_root() {
  local repo_root
  local current_dir

  repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "not a git repository. Run this script from the app repo root."
  repo_root="$(cd "$repo_root" && pwd -P)"
  current_dir="$(pwd -P)"

  if [ "$current_dir" != "$repo_root" ]; then
    fail "run this script from the repository root: $repo_root"
  fi
}

require_repo_root
TMP_DIR="$(mktemp -d)"
trap cleanup EXIT

echo "Syncing skills from: $SKILLS_REPO"

if ! git -C "$TMP_DIR" init -q ||
   ! git -C "$TMP_DIR" fetch --quiet --depth 1 "$SKILLS_REPO" "$SKILLS_REF" ||
   ! git -C "$TMP_DIR" checkout --quiet --detach FETCH_HEAD; then
  fail "failed to fetch shared skills revision: $SKILLS_REF"
fi

if [ ! -d "$TMP_DIR/skills" ]; then
  fail "shared repo does not contain a skills/ directory."
fi

rm -rf skills
cp -R "$TMP_DIR/skills" ./skills

cleanup
trap - EXIT

echo "Synced skills/ successfully."
