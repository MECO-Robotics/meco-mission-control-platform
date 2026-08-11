import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

function readRepoFile(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("production deployment accepts only protected-main source revisions", () => {
  const workflow = readRepoFile(".github/workflows/deploy-vps.yml");

  assert.doesNotMatch(workflow, /release_manifest/i);
  assert.doesNotMatch(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /tags:/);
  assert.match(workflow, /test "\$\{GITHUB_REF\}" = "refs\/heads\/main"/);
  assert.match(workflow, /test "\$\{GITHUB_SHA\}" = "\$\(git rev-parse origin\/main\)"/);
  assert.match(workflow, /environment:\s*\n\s*name: production/);
});

test("security-sensitive workflows use immutable Actions and pinned SSH host keys", () => {
  const workflowDirectory = new URL("../.github/workflows/", import.meta.url);
  for (const name of readdirSync(workflowDirectory).filter((entry) => entry.endsWith(".yml"))) {
    const workflow = readFileSync(new URL(name, workflowDirectory), "utf8");
    for (const match of workflow.matchAll(/^\s*uses:\s*([^\s#]+)@([^\s#]+)/gm)) {
      const [, action, reference] = match;
      if (action.startsWith("./")) continue;
      assert.match(reference, /^[0-9a-f]{40}$/, `${name} must pin ${action} to a full commit SHA`);
    }
  }

  const deploy = readRepoFile(".github/workflows/deploy-vps.yml");
  assert.doesNotMatch(deploy, /ssh-keyscan/);
  assert.match(deploy, /VPS_SSH_KNOWN_HOSTS/);
  assert.match(deploy, /StrictHostKeyChecking|known_hosts/);
});

test("production deployment fails closed on backups and avoids automatic destructive schema pushes", () => {
  const workflow = readRepoFile(".github/workflows/deploy-vps.yml");
  const compose = readRepoFile("docker-compose.prod.yml");
  const packageJson = readRepoFile("package.json");

  assert.match(workflow, /Database backup failed; aborting deployment/);
  assert.match(compose, /127\.0\.0\.1:\$\{PUBLIC_PORT:-8080\}:8080/);
  assert.doesNotMatch(compose, /accept-data-loss/);
  assert.doesNotMatch(packageJson, /accept-data-loss/);
});
