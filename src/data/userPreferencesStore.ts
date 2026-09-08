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

function loadPreferences(preferencesPath: string) {
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
      writeFileSync(preferencesPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
      preferencesByEmail = next;
      return normalizePreferences(storedPreferences);
    },
  };
}

export type UserPreferencesStore = ReturnType<typeof createUserPreferencesStore>;
