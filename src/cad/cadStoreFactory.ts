import { cadPersistenceConfig } from "../config/env";
import { getCadPrismaClient, disconnectCadPrismaClient } from "./cadPrismaClient";
import { createPrismaCadStore } from "./cadPrismaStore";
import { getCadRuntimeStore } from "./cadStore";
import type { CadStore } from "./cadStoreTypes";

let prismaStore: CadStore | null = null;
let runtimeFallbackStore: CadStore | null = null;
let prismaStoreHasSucceeded = false;
let runtimeFallbackActive = false;
let prismaReadinessPromise: Promise<CadStore> | null = null;
let prismaBackedStore: CadStore | null = null;

function isPrismaUnavailableError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (("code" in error && (error as { code?: unknown }).code === "P1001") ||
      ("message" in error &&
        typeof (error as { message?: unknown }).message === "string" &&
        ((error as { message: string }).message.includes("Can't reach database server") ||
          (error as { message: string }).message.includes("did not initialize yet"))))
  );
}

function canFallbackToRuntime(error: unknown) {
  return (
    cadPersistenceConfig.storeDriver === "prisma" &&
    process.env.NODE_ENV !== "production" &&
    process.env.CAD_STORE_DRIVER === undefined &&
    !prismaStoreHasSucceeded &&
    isPrismaUnavailableError(error)
  );
}

function getRuntimeFallbackStore() {
  runtimeFallbackStore ??= getCadRuntimeStore();
  return runtimeFallbackStore;
}

function activateRuntimeFallback(error: unknown) {
  runtimeFallbackActive = true;
  const message = error instanceof Error ? error.message : String(error);
  console.warn(
    `[cad] Prisma CAD store is unavailable; using runtime CAD store for this local process. ${message}`,
  );
  void disconnectCadPrismaClient().catch(() => undefined);
  return getRuntimeFallbackStore();
}

function getPrismaBackedStore() {
  prismaBackedStore ??= createPrismaCadStore(getCadPrismaClient());
  return prismaBackedStore;
}

async function resolveStoreForCall() {
  if (runtimeFallbackActive) {
    return getRuntimeFallbackStore();
  }

  if (prismaStoreHasSucceeded) {
    return getPrismaBackedStore();
  }

  prismaReadinessPromise ??= Promise.resolve()
    .then(() => getCadPrismaClient().$connect())
    .then(() => {
      prismaStoreHasSucceeded = true;
      return getPrismaBackedStore();
    })
    .catch((error: unknown) => {
      prismaReadinessPromise = null;
      prismaBackedStore = null;
      if (canFallbackToRuntime(error)) {
        return activateRuntimeFallback(error);
      }
      if (error instanceof Error && error.message.includes("did not initialize yet")) {
        throw new Error("Can't reach database at local Prisma client (run prisma generate)");
      }
      throw error;
    });

  return prismaReadinessPromise;
}

function withRuntimeFallback(): CadStore {
  return new Proxy({} as CadStore, {
    get(_target, property) {
      if (typeof property !== "string") {
        return undefined;
      }
      return async (...args: unknown[]) => {
        const activeStore = await resolveStoreForCall();
        const activeValue = Reflect.get(activeStore as object, property, activeStore as object);
        if (typeof activeValue !== "function") {
          return activeValue;
        }
        return activeValue.apply(activeStore, args);
      };
    },
  });
}

export function getCadStore(): CadStore {
  if (cadPersistenceConfig.storeDriver === "runtime") {
    return getCadRuntimeStore();
  }
  prismaStore ??= withRuntimeFallback();
  return prismaStore;
}

export async function disconnectCadStore() {
  if (cadPersistenceConfig.storeDriver === "prisma") {
    await disconnectCadPrismaClient();
    prismaStore = null;
    runtimeFallbackStore = null;
    prismaStoreHasSucceeded = false;
    runtimeFallbackActive = false;
    prismaReadinessPromise = null;
    prismaBackedStore = null;
  }
}
