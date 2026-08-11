import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/meco_platform?schema=public";

async function loadMediaUploadService() {
  return import("../src/storage/mediaUploadService");
}

test("legacy S3_BUCKET remains an exact media bucket name", async () => {
  const { createTeamBucketName } = await loadMediaUploadService();

  assert.equal(
    createTeamBucketName("Team 2468", {
      bucket: "meco-production-media",
    }),
    "meco-production-media",
  );
});

test("S3_BUCKET_PREFIX creates team-scoped media bucket names", async () => {
  const { createTeamBucketName } = await loadMediaUploadService();

  assert.equal(
    createTeamBucketName("Team 2468", {
      bucket: "meco-production-media",
      bucketPrefix: "meco-media",
    }),
    "meco-media-team-2468",
  );
});
