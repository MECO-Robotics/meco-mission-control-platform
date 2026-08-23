import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";

import { registerMobileSessionSupport } from "./auth/mobileSessionPlugin";
import {
  disconnectMobileSessionStore,
  getPrismaMobileSessionStore,
} from "./auth/mobileSessionPrismaStore";
import { MobileSessionService } from "./auth/mobileSessionService";
import type { MobileSessionStore } from "./auth/mobileSessionStoreTypes";
import { registerWebSessionSupport } from "./auth/webSessionPlugin";
import { getSessionFromRequest, isAuthEnabled } from "./auth/authService";
import { WebSessionService } from "./auth/webSessionService";
import {
  disconnectWebSessionStore,
  getPrismaWebSessionStore,
  type WebSessionStore,
} from "./auth/webSessionStore";
import { resetCadRuntimeStore } from "./cad/cadStore";
import { disconnectCadStore } from "./cad/cadStoreFactory";
import { cadStepUploadConfig, corsConfig, env } from "./config/env";
import {
  acquireGlobalSnapshotMutation,
  hasInteractiveTutorialSession,
  resetStore,
  runWithInteractiveTutorialSession,
} from "./data/store";
import { resetOnshapeRuntimeStore } from "./onshape/cadStore";
import { registerRoutes } from "./routes/registerRoutes";

export interface BuildAppOptions {
  mobileSessionStore?: MobileSessionStore;
  webSessionStore?: WebSessionStore;
}

export async function buildApp(options: BuildAppOptions = {}) {
  if (env.NODE_ENV !== "production") {
    resetStore();
    resetCadRuntimeStore();
    resetOnshapeRuntimeStore();
  }

  const app = Fastify({
    logger: true,
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(cors, {
    origin: corsConfig.allowsAnyOrigin ? true : corsConfig.origins,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(multipart, {
    limits: {
      fileSize: cadStepUploadConfig.maxBytes,
      files: 1,
    },
  });

  const mobileSessionService = new MobileSessionService(
    options.mobileSessionStore ?? getPrismaMobileSessionStore(),
  );
  registerMobileSessionSupport(app, mobileSessionService);
  const webSessionService = new WebSessionService(
    options.webSessionStore ?? getPrismaWebSessionStore(),
  );
  registerWebSessionSupport(app, webSessionService);
  const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  const mutationTransactions = new WeakMap<
    object,
    Awaited<ReturnType<typeof acquireGlobalSnapshotMutation>>
  >();

  app.addHook("preHandler", (request, _reply, done) => {
    const session = isAuthEnabled() ? getSessionFromRequest(request) : null;
    const userKey = session?.email?.trim().toLowerCase() || session?.accountId;
    if (userKey && hasInteractiveTutorialSession(userKey)) {
      runWithInteractiveTutorialSession(userKey, done);
      return;
    }

    if (!mutationMethods.has(request.method)) {
      done();
      return;
    }

    acquireGlobalSnapshotMutation().then(
      (transaction) => {
        mutationTransactions.set(request, transaction);
        transaction.enter();
        done();
      },
      done,
    );
  });

  app.addHook("onSend", async (request, reply, payload) => {
    if (request.url.startsWith("/api/")) {
      reply.header("Cache-Control", "no-store");
      reply.header("Pragma", "no-cache");
    }

    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

    if (env.NODE_ENV === "production") {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    const transaction = mutationTransactions.get(request);
    if (transaction?.hasChanges()) {
      await transaction.commit();
    }

    return payload;
  });

  app.addHook("onResponse", async (request) => {
    const transaction = mutationTransactions.get(request);
    mutationTransactions.delete(request);
    transaction?.release();
  });

  app.addHook("onClose", async () => {
    await Promise.all([
      disconnectCadStore(),
      disconnectMobileSessionStore(),
      disconnectWebSessionStore(),
    ]);
  });

  await registerRoutes(app, { mobileSessionService, webSessionService });

  return app;
}
