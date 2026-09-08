import assert from "node:assert/strict";
import { test } from "node:test";
import nodemailer from "nodemailer";

test("uncertain SMTP delivery retains a usable code and resend cooldown", async (context) => {
  process.env.NODE_ENV = "development";
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/meco_platform";
  process.env.AUTH_JWT_SECRET = "a".repeat(32);
  process.env.AUTH_EMAIL_SMTP_HOST = "127.0.0.1";
  process.env.AUTH_EMAIL_FROM = "no-reply@mecorobotics.org";
  let deliveredText = "";
  let completeDelivery!: () => void;
  const pending = new Promise<void>((resolve) => { completeDelivery = resolve; });
  context.mock.method(nodemailer, "createTransport", (() => ({
    sendMail: (mail: { text: string }) => { deliveredText = mail.text; return pending; },
  })) as unknown as typeof nodemailer.createTransport);
  const { requestEmailSignInCode, verifyEmailSignInCode } = await import("../src/auth/authService");
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const request = requestEmailSignInCode("late@mecorobotics.org");
  const rejection = assert.rejects(request, /delivery is still pending/);
  context.mock.timers.tick(12_000);
  await rejection;
  await assert.rejects(requestEmailSignInCode("late@mecorobotics.org"), /already sent/);
  completeDelivery();
  await pending;
  const code = deliveredText.match(/\b\d{6}\b/)?.[0];
  assert.ok(code, "SMTP message contains the sign-in code");
  assert.equal(verifyEmailSignInCode("late@mecorobotics.org", code).email, "late@mecorobotics.org");
});
