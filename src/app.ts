import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import { createPrismaCadStore } from "./cad/cadPrismaStore";
import { getCadRuntimeStore } from "./cad/cadStore";
import type { CadStore } from "./cad/cadStoreTypes";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";

import { registerMobileSessionSupport } from "./auth/mobileSessionPlugin";
import {
  createPrismaMobileSessionStore,
} from "./auth/mobileSessionPrismaStore";
import { MobileSessionService } from "./auth/mobileSessionService";
import type { MobileSessionStore } from "./auth/mobileSessionStoreTypes";
import { registerWebSessionSupport } from "./auth/webSessionPlugin";
import { getSessionFromRequest, isAuthEnabled } from "./auth/authService";
import { WebSessionService } from "./auth/webSessionService";
import {
  createPrismaWebSessionStore,
  type WebSessionStore,
} from "./auth/webSessionStore";
import { resetCadRuntimeStore } from "./cad/cadStore";
import { cadPersistenceConfig, cadStepUploadConfig, corsConfig, env } from "./config/env";
import {
  acquireGlobalSnapshotMutation,
  hasInteractiveTutorialSession,
  resetStore,
  runWithInteractiveTutorialSession,
} from "./data/store";
import { resetOnshapeRuntimeStore } from "./onshape/cadStore";
import { registerRoutes } from "./routes/registerRoutes";

import { createUserPreferencesStore, type UserPreferencesStore } from "./data/userPreferencesStore";

declare module "fastify" {
  interface FastifyContextConfig {
    snapshotMutation?: boolean;
  }
  interface FastifyInstance {
    userPreferences: UserPreferencesStore;
    cadStore: CadStore;
  }
}

export interface BuildAppOptions {
  userPreferencesPath?: string;
  prisma?: PrismaClient;
  cadStore?: CadStore;
  mobileSessionStore?: MobileSessionStore;
  webSessionStore?: WebSessionStore;
}

export async function buildApp(options: BuildAppOptions = {}) {
  if (env.NODE_ENV !== "production") {
    resetStore();
    resetCadRuntimeStore();
    resetOnshapeRuntimeStore();
  }

  const prisma = options.prisma ?? new PrismaClient();
  const app = Fastify({
    logger: true,
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: env.TRUST_PROXY_IPS ? env.TRUST_PROXY_IPS.split(",").map((ip) => ip.trim()) : false,
  });

  app.decorate("cadStore", options.cadStore ?? (cadPersistenceConfig.storeDriver === "runtime" ? getCadRuntimeStore() : createPrismaCadStore(prisma)));
  app.decorate("userPreferences", createUserPreferencesStore(options.userPreferencesPath));

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
    options.mobileSessionStore ?? createPrismaMobileSessionStore(prisma),
  );
  registerMobileSessionSupport(app, mobileSessionService);
  const webSessionService = new WebSessionService(
    options.webSessionStore ?? createPrismaWebSessionStore(prisma),
  );
  registerWebSessionSupport(app, webSessionService);
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

    if (!request.routeOptions.config.snapshotMutation) {
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

  const releaseMutationTransaction = (request: object) => {
    const transaction = mutationTransactions.get(request);
    mutationTransactions.delete(request);
    transaction?.release();
  };

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
    try {
      if (reply.statusCode < 400 && transaction?.hasChanges()) {
        await transaction.commit();
      }
    } finally {
      releaseMutationTransaction(request);
    }

    return payload;
  });

  app.addHook("onError", async (request) => releaseMutationTransaction(request));
  app.addHook("onResponse", async (request) => releaseMutationTransaction(request));

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  await registerRoutes(app, { mobileSessionService, webSessionService });

  return app;
}
