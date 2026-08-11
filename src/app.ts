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
import { WebSessionService } from "./auth/webSessionService";
import {
  disconnectWebSessionStore,
  getPrismaWebSessionStore,
  type WebSessionStore,
} from "./auth/webSessionStore";
import { resetCadRuntimeStore } from "./cad/cadStore";
import { disconnectCadStore } from "./cad/cadStoreFactory";
import { cadStepUploadConfig, corsConfig, env } from "./config/env";
import { resetStore } from "./data/store";
import { resetOnshapeRuntimeStore } from "./onshape/cadStore";
import { registerRoutes } from "./routes/registerRoutes";

export interface BuildAppOptions {
  mobileSessionStore?: MobileSessionStore;
  webSessionStore?: WebSessionStore;
}

export async function buildApp(options: BuildAppOptions = {}) {
  // Always start from the checked-in seed snapshot so deploys regenerate tutorial state.
  resetStore();
  resetCadRuntimeStore();
  resetOnshapeRuntimeStore();

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

    return payload;
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
