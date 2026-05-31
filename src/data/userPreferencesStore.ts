import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

const preferencesPath = join(process.cwd(), "data", "user-preferences.json");
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

let preferencesByEmail = loadPreferences();

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isPreferencesRecord(value: unknown): value is Record<string, StoredUserPreferences> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

function loadPreferences() {
  if (!existsSync(preferencesPath)) {
    return {} as Record<string, UserPreferences>;
  }

  try {
    const parsed = JSON.parse(readFileSync(preferencesPath, "utf8")) as unknown;
    if (!isPreferencesRecord(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([email, preferences]) => [
        normalizeEmail(email),
        normalizePreferences(preferences),
      ]),
    ) as Record<string, UserPreferences>;
  } catch {
    return {};
  }
}

function savePreferences() {
  mkdirSync(dirname(preferencesPath), { recursive: true });
  writeFileSync(
    preferencesPath,
    `${JSON.stringify(preferencesByEmail, null, 2)}\n`,
    "utf8",
  );
}

export function getUserPreferences(email: string): UserPreferences {
  return normalizePreferences(preferencesByEmail[normalizeEmail(email)]);
}

export function getUserTaskSubteamIdsPreference(email: string) {
  const preferences = preferencesByEmail[normalizeEmail(email)];
  if (!preferences || !Array.isArray(preferences.taskSubteamIds)) {
    return null;
  }

  return normalizePreferences(preferences).taskSubteamIds;
}

export function updateUserPreferences(
  email: string,
  patch: Partial<UserPreferences>,
): UserPreferences {
  const normalizedEmail = normalizeEmail(email);
  const nextPreferences = normalizePreferences({
    ...preferencesByEmail[normalizedEmail],
    ...patch,
  });

  preferencesByEmail = {
    ...preferencesByEmail,
    [normalizedEmail]: nextPreferences,
  };
  savePreferences();

  return nextPreferences;
}

export function resetUserPreferencesStoreForTests() {
  preferencesByEmail = {};
}
