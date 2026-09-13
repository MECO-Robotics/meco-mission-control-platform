import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { PlatformSnapshot } from "../domain/types";

function looksLikePlatformSnapshot(value: unknown): value is PlatformSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const snapshot = value as Partial<Record<keyof PlatformSnapshot, unknown>>;
  return Array.isArray(snapshot.seasons) &&
    Array.isArray(snapshot.projects) &&
    Array.isArray(snapshot.members) &&
    Array.isArray(snapshot.tasks);
}

export function loadPlatformSnapshotFile(path: string) {
  if (!existsSync(path)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`Platform snapshot at ${path} could not be read.`, { cause: error });
  }

  if (!looksLikePlatformSnapshot(parsed)) {
    throw new Error(`Platform snapshot at ${path} is not a valid platform snapshot.`);
  }

  return parsed;
}

export async function savePlatformSnapshotFile(path: string, snapshot: PlatformSnapshot) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(snapshot)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, path);
}
