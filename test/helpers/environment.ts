export function saveEnv(keys: readonly string[]) {
  return new Map(keys.map((key) => [key, process.env[key]] as const));
}

export function restoreEnv(saved: ReadonlyMap<string, string | undefined>) {
  for (const [key, value] of saved) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
