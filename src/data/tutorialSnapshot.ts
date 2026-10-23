import type { PlatformSnapshot } from "../domain/types";
import { snapshot } from "./mockData";

// Seed dates represent source records and must remain unchanged at bootstrap.
export function createTutorialSnapshot(_now = new Date()): PlatformSnapshot {
  return structuredClone(snapshot);
}
