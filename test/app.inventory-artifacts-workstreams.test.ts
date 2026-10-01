import { resetStore } from "../src/data/store";
import assert from "node:assert/strict";
import { test } from "node:test";

import { getSnapshot } from "../src/data/store";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";

test("bootstrap exposes canonical task, manufacturing and evidence ownership", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const response = await app.inject({ method: "GET", url: "/api/bootstrap" });
    assert.equal(response.statusCode, 200);
    const body = response.json() as Record<string, unknown> & {
      tasks: Array<{ id: string; manufacturingDetails: unknown }>;
      purchaseItems: Array<{ id: string; taskId: string; kind: string }>;
      artifacts: Array<{ id: string; targetRefs: Array<{ kind: string; id: string }> }>;
    };

    assert.equal("manufacturingItems" in body, false);
    assert.equal("taskBlockers" in body, false);
    assert.equal(body.tasks.find((task) => task.id === "swerve-sensor-bundle")?.manufacturingDetails !== null, true);
    const purchase = body.purchaseItems.find((item) => item.id === "ferrule-kit");
    assert.equal(purchase?.kind, "cots-goods");
    assert.equal(body.tasks.find((task) => task.id === purchase?.taskId)?.manufacturingDetails, null);

    resetLimits();

    const artifactResponse = await app.inject({
      method: "POST",
      url: "/api/artifacts",
      payload: {
        projectId: "project-robot-2026",
        targetRefs: [{ kind: "task", id: "swerve-sensor-bundle" }],
        kind: "document",
        title: "Robot build evidence",
        summary: "Build verification evidence.",
        status: "draft",
        uri: "https://example.org/build-evidence",
      },
    });
    assert.equal(artifactResponse.statusCode, 201);
    assert.deepEqual(artifactResponse.json().item.targetRefs, [{ kind: "task", id: "swerve-sensor-bundle" }]);

    const manufacturingResponse = await app.inject({ method: "GET", url: "/api/manufacturing" });
    const blockerResponse = await app.inject({ method: "GET", url: "/api/task-blockers" });
    assert.equal(manufacturingResponse.statusCode, 404);
    assert.equal(blockerResponse.statusCode, 404);
  });
});

test("media upload endpoint returns a presigned image upload contract", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const presignResponse = await app.inject({
      method: "POST",
      url: "/api/media/presign-upload",
      payload: {
        projectId: "project-media-2026",
        fileName: "Robot Reveal Photo.png",
        contentType: "image/png",
        sizeBytes: 1024,
      },
    });

    assert.equal(presignResponse.statusCode, 200);
    const presignBody = presignResponse.json() as {
      expiresInSeconds: number;
      headers: {
        "Content-Type": string;
      };
      key: string;
      method: string;
      publicUrl: string;
      uploadUrl: string;
    };

    assert.equal(presignBody.method, "PUT");
    assert.equal(presignBody.expiresInSeconds, 300);
    assert.equal(presignBody.headers["Content-Type"], "image/png");
    assert.match(
      presignBody.key,
      /^projects\/project-media-2026\/images\/\d{4}\/\d{2}\/\d+-[a-f0-9]{12}-robot-reveal-photo\.png$/,
    );
    assert.ok(
      presignBody.publicUrl.startsWith("https://cdn.example.test/meco-pm-meco-robotics/projects/project-media-2026/images/"),
    );

    const uploadUrl = new URL(presignBody.uploadUrl);
    assert.equal(uploadUrl.origin, "https://s3.example.test");
    assert.ok(uploadUrl.pathname.startsWith("/meco-pm-meco-robotics/projects/project-media-2026/images/"));
    assert.equal(uploadUrl.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
    assert.match(
      uploadUrl.searchParams.get("X-Amz-SignedHeaders") ?? "",
      /content-length/,
    );

    resetLimits();

    const invalidTypeResponse = await app.inject({
      method: "POST",
      url: "/api/media/presign-upload",
      payload: {
        projectId: "project-media-2026",
        fileName: "not-an-image.pdf",
        contentType: "application/pdf",
        sizeBytes: 1024,
      },
    });

    assert.equal(invalidTypeResponse.statusCode, 400);
    assert.equal(
      invalidTypeResponse.json().message,
      "Only image uploads are supported by the media bucket.",
    );

    resetLimits();

    const oversizedResponse = await app.inject({
      method: "POST",
      url: "/api/media/presign-upload",
      payload: {
        projectId: "project-media-2026",
        fileName: "oversized.png",
        contentType: "image/png",
        sizeBytes: 15 * 1024 * 1024 + 1,
      },
    });
    assert.equal(oversizedResponse.statusCode, 413);
  });
});

test("media upload endpoint selects buckets from server-owned project team ids", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const snapshot = getSnapshot();
    const mediaProject = snapshot.projects.find((project) => project.projectType === "media" && project.seasonId === "default-season");
    assert.ok(mediaProject);
    const otherTeamProject = { ...mediaProject, teamId: "team-2468" };
    resetStore({ ...snapshot, projects: snapshot.projects.map((project) => project.id === mediaProject.id ? otherTeamProject : project) });

    const presignResponse = await app.inject({
      method: "POST",
      url: "/api/media/presign-upload",
      payload: {
        teamId: "meco-robotics",
        projectId: otherTeamProject.id,
        fileName: "Sponsor banner.png",
        contentType: "image/png",
        sizeBytes: 2048,
      },
    });

    assert.equal(presignResponse.statusCode, 200);
    const presignBody = presignResponse.json() as {
      key: string;
      publicUrl: string;
      uploadUrl: string;
    };

    assert.match(
      presignBody.key,
      new RegExp(`^projects/${otherTeamProject.id}/images/\\d{4}/\\d{2}/\\d+-[a-f0-9]{12}-sponsor-banner\\.png$`),
    );
    assert.ok(
      presignBody.publicUrl.startsWith(
        `https://cdn.example.test/meco-pm-team-2468/projects/${otherTeamProject.id}/images/`,
      ),
    );
    assert.ok(new URL(presignBody.uploadUrl).pathname.startsWith(`/meco-pm-team-2468/projects/${otherTeamProject.id}/images/`));

    resetLimits();

    resetLimits();

    const apiProjectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: {
        teamId: "Team 1357",
        seasonId: "default-season",
        name: "Media",
        projectType: "media",
      },
    });

    assert.equal(apiProjectResponse.statusCode, 409);
  });
});

test("video upload endpoint returns a presigned video upload contract", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const presignResponse = await app.inject({
      method: "POST",
      url: "/api/media/presign-video-upload",
      payload: {
        projectId: "project-media-2026",
        fileName: "QA review clip.mp4",
        contentType: "video/mp4",
        sizeBytes: 4096,
      },
    });

    assert.equal(presignResponse.statusCode, 200);
    const presignBody = presignResponse.json() as {
      expiresInSeconds: number;
      headers: {
        "Content-Type": string;
      };
      key: string;
      method: string;
      publicUrl: string;
      uploadUrl: string;
    };

    assert.equal(presignBody.method, "PUT");
    assert.equal(presignBody.headers["Content-Type"], "video/mp4");
    assert.match(
      presignBody.key,
      /^projects\/project-media-2026\/videos\/\d{4}\/\d{2}\/\d+-[a-f0-9]{12}-qa-review-clip\.mp4$/,
    );
    assert.ok(
      presignBody.publicUrl.startsWith("https://cdn.example.test/meco-pm-meco-robotics/projects/project-media-2026/videos/"),
    );

    resetLimits();

    const invalidTypeResponse = await app.inject({
      method: "POST",
      url: "/api/media/presign-video-upload",
      payload: {
        projectId: "project-media-2026",
        fileName: "not-a-video.png",
        contentType: "image/png",
        sizeBytes: 4096,
      },
    });

    assert.equal(invalidTypeResponse.statusCode, 400);
    assert.equal(
      invalidTypeResponse.json().message,
      "Only video uploads are supported by the media bucket.",
    );
  });
});

test("media signing enforces an identity-scoped hourly byte quota", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const first = await app.inject({
      method: "POST",
      url: "/api/media/presign-upload",
      payload: {
        projectId: "project-media-2026",
        fileName: "first.png",
        contentType: "image/png",
        sizeBytes: 800,
      },
    });
    assert.equal(first.statusCode, 200);

    resetLimits();
    const overQuota = await app.inject({
      method: "POST",
      url: "/api/media/presign-upload",
      payload: {
        projectId: "project-media-2026",
        fileName: "second.png",
        contentType: "image/png",
        sizeBytes: 800,
      },
    });
    assert.equal(overQuota.statusCode, 429);
  }, {
    env: { MEDIA_UPLOAD_QUOTA_BYTES_PER_HOUR: "1500" },
  });
});
