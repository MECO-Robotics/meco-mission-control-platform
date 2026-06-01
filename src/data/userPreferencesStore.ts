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

function loadPreferences() {
  if (!existsSync(preferencesPath)) {
    return {} as Record<string, StoredUserPreferences>;
  }

  try {
    const parsed = JSON.parse(readFileSync(preferencesPath, "utf8")) as unknown;
    if (!isPreferencesRecord(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([email, preferences]) => [
        normalizeEmail(email),
        normalizeStoredPreferences(preferences),
      ]),
    ) as Record<string, StoredUserPreferences>;
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
  if (
    !hasPreferenceField(preferences, "taskSubteamIds") ||
    !Array.isArray(preferences.taskSubteamIds)
  ) {
    return null;
  }

  return normalizePreferences(preferences).taskSubteamIds;
}

export function updateUserPreferences(
  email: string,
  patch: Partial<UserPreferences>,
): UserPreferences {
  const normalizedEmail = normalizeEmail(email);
  const storedPreferences = normalizeStoredPreferences({
    ...preferencesByEmail[normalizedEmail],
    ...patch,
  });
  const nextPreferences = normalizePreferences(storedPreferences);

  preferencesByEmail = {
    ...preferencesByEmail,
    [normalizedEmail]: storedPreferences,
  };
  savePreferences();

  return nextPreferences;
}

export function resetUserPreferencesStoreForTests() {
  preferencesByEmail = {};
}
