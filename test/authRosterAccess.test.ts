import { saveEnv, restoreEnv } from "./helpers/environment";
import assert from "node:assert/strict";
import { test } from "node:test";

test("external roster role whitelists non-team email for email sign-in", async () => {
  const saved = saveEnv([
    "NODE_ENV",
    "DATABASE_URL",
    "GOOGLE_CLIENT_ID",
    "AUTH_EMAIL_SMTP_HOST",
    "AUTH_EMAIL_FROM",
  ]);

  try {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/meco_platform?schema=public";
    delete process.env.GOOGLE_CLIENT_ID;
    process.env.AUTH_EMAIL_SMTP_HOST = "127.0.0.1";
    process.env.AUTH_EMAIL_FROM = "MECO Robotics <no-reply@mecorobotics.org>";

    const { createMember, resetStore } = await import("../src/data/store");
    const {
      AuthError,
      requestEmailSignInCode,
      verifyEmailSignInCode,
      refreshSessionUser,
    } = await import("../src/auth/authService");

    resetStore();
    createMember({
      name: "Sponsor Viewer",
      email: "viewer@sponsor.example",
      role: "external",
      seasonId: "default-season",
    });
    createMember({
      name: "Sponsor Invitee",
      email: "invitee@sponsor.example",
      role: "external",
      seasonId: "default-season",
    });
    createMember({
      name: "Sponsor Mentor",
      email: "mentor@sponsor.example",
      role: "mentor",
      seasonId: "default-season",
    });

    try {
      await requestEmailSignInCode(" INVITEE@SPONSOR.EXAMPLE ");
    } catch (error) {
      assert.ok(error instanceof AuthError);
      assert.notEqual(error.statusCode, 403);
    }

    await assert.rejects(
      () => requestEmailSignInCode("unlisted@sponsor.example"),
      (error) => {
        assert.ok(error instanceof AuthError);
        assert.equal(error.statusCode, 403);
        assert.match(error.message, /mecorobotics\.org/i);
        return true;
      },
    );

    try {
      await requestEmailSignInCode(" MENTOR@SPONSOR.EXAMPLE ");
    } catch (error) {
      assert.ok(error instanceof AuthError);
      assert.notEqual(error.statusCode, 403);
    }

    const mentorUser: import("../src/auth/authService").SessionUser = {
      accountId: "mentor@sponsor.example",
      authProvider: "email",
      email: "mentor@sponsor.example",
      hostedDomain: "sponsor.example",
      name: "Sponsor Mentor",
      picture: null,
      role: "student",
      taskSubteamIds: [],
    };
    assert.equal(refreshSessionUser(mentorUser).role, "mentor");

    assert.throws(
      () => verifyEmailSignInCode("VIEWER@sponsor.example", "123456"),
      (error) => {
        assert.ok(error instanceof AuthError);
        assert.equal(error.statusCode, 401);
        assert.match(error.message, /expired|no longer valid/i);
        return true;
      },
    );

    assert.throws(
      () => verifyEmailSignInCode("unlisted@sponsor.example", "123456"),
      (error) => {
        assert.ok(error instanceof AuthError);
        assert.equal(error.statusCode, 403);
        assert.match(error.message, /mecorobotics\.org/i);
        return true;
      },
    );
  } finally {
    restoreEnv(saved);
  }
});
