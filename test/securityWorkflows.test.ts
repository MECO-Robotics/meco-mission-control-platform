import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { spawnSync } from "node:child_process";

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

test("protected branches publish an immutable attested bootstrap contract", () => {
  const workflow = readRepoFile(".github/workflows/publish-bootstrap-contract.yml");
  const dockerfile = readRepoFile("deploy/bootstrap-contract.Dockerfile");

  assert.match(workflow, /branches:\s*\n\s*- development\s*\n\s*- main/);
  assert.match(workflow, /packages: write/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /attestations: write/);
  assert.match(workflow, /v1-\$\{\{ github\.ref_name \}\}-sha-\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /actions\/attest-build-provenance@[0-9a-f]{40}/);
  assert.match(workflow, /test "\$\{channel_digest\}" = "\$\{immutable_digest\}"/);
  assert.match(dockerfile, /^FROM busybox:[^@\s]+@sha256:[0-9a-f]{64}$/m);
});


test("contract publication drains inspect output under pipefail before verifying attestation", () => {
  const workflow = readRepoFile(".github/workflows/publish-bootstrap-contract.yml");
  const body = workflow.split("      - name: Verify immutable and channel artifacts")[1]
    .split("        run: |\n")[1].replace(/^          /gm, "");
  const mockCommands = `
    docker() {
      node -e 'process.stdout.on("error", () => process.exit(255)); process.stdout.write("Digest: sha256:verified\\n" + "metadata\\n".repeat(100000));'
    }
    gh() { test "$1" = attestation && test "$2" = verify && test "$3" = oci://example/contract@sha256:verified; }
    export CONTRACT_IMAGE=example/contract GITHUB_REF_NAME=development GITHUB_SHA=abc
  `;
  const result = spawnSync("bash", ["-c", mockCommands + body], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const failedInspect = spawnSync("bash", ["-c", mockCommands + "docker() { return 42; }\n" + body], { encoding: "utf8" });
  assert.equal(failedInspect.status, 42, "real inspect failures must still fail closed");
});
