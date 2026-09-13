import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

export type ThemePreference = "light" | "dark";
export type TaskSubteamPreference =
  | "programming"
  | "mechanical"
  | "electrical"
  | "media-marketing"
  | "business"
  | "scouting";

export interface UserPreferences {
  taskSubteamIds: TaskSubteamPreference[];
  themeMode: ThemePreference | null;
}

type StoredUserPreferences = Partial<UserPreferences>;

const taskSubteamIds = new Set([
  "programming",
  "mechanical",
  "electrical",
  "media-marketing",
  "business",
  "scouting",
]);
const defaultPreferences: UserPreferences = {
  taskSubteamIds: [],
  themeMode: null,
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

const storedPreferencesSchema = z.record(z.string(), z.object({
  taskSubteamIds: z.array(z.enum(["programming", "mechanical", "electrical", "media-marketing", "business", "scouting"])).optional(),
  themeMode: z.enum(["light", "dark"]).nullable().optional(),
}).strict());

function normalizePreferences(value: StoredUserPreferences | undefined): UserPreferences {
  return {
    ...defaultPreferences,
    ...value,
    taskSubteamIds: Array.isArray(value?.taskSubteamIds)
      ? value.taskSubteamIds.filter((subteamId) => taskSubteamIds.has(subteamId))
      : [],
    themeMode: value?.themeMode === "dark" || value?.themeMode === "light" ? value.themeMode : null,
  };
}

function hasPreferenceField(
  value: StoredUserPreferences | undefined,
  field: keyof UserPreferences,
) {
  return value !== undefined && Object.prototype.hasOwnProperty.call(value, field);
}

function normalizeStoredPreferences(value: StoredUserPreferences | undefined): StoredUserPreferences {
  const normalizedPreferences = normalizePreferences(value);

  return {
    ...(hasPreferenceField(value, "taskSubteamIds")
      ? { taskSubteamIds: normalizedPreferences.taskSubteamIds }
      : {}),
    themeMode: normalizedPreferences.themeMode,
  };
}

function loadPreferences(preferencesPath: string) {
  try {
    const parsed = storedPreferencesSchema.parse(JSON.parse(readFileSync(preferencesPath, "utf8")));

    return Object.fromEntries(
      Object.entries(parsed).map(([email, preferences]) => [
        normalizeEmail(email),
        normalizeStoredPreferences(preferences),
      ]),
    ) as Record<string, StoredUserPreferences>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export function createUserPreferencesStore(
  preferencesPath = join(process.cwd(), "data", "user-preferences.json"),
) {
  let preferencesByEmail = loadPreferences(preferencesPath);

  return {
    get(email: string): UserPreferences {
      return normalizePreferences(preferencesByEmail[normalizeEmail(email)]);
    },
    getTaskSubteamIds(email: string) {
      const preferences = preferencesByEmail[normalizeEmail(email)];
      return hasPreferenceField(preferences, "taskSubteamIds")
        ? normalizePreferences(preferences).taskSubteamIds
        : null;
    },
    update(email: string, patch: Partial<UserPreferences>): UserPreferences {
      const normalizedEmail = normalizeEmail(email);
      const storedPreferences = normalizeStoredPreferences({
        ...preferencesByEmail[normalizedEmail],
        ...patch,
      });
      const next = { ...preferencesByEmail, [normalizedEmail]: storedPreferences };
      mkdirSync(dirname(preferencesPath), { recursive: true });
      const temporaryPath = `${preferencesPath}.${randomUUID()}.tmp`;
      try {
        writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
        renameSync(temporaryPath, preferencesPath);
      } finally {
        rmSync(temporaryPath, { force: true });
      }
      preferencesByEmail = next;
      return normalizePreferences(storedPreferences);
    },
  };
}

export type UserPreferencesStore = ReturnType<typeof createUserPreferencesStore>;
