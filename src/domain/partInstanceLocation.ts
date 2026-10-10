import type { PartInstance } from "./types";

export function partInstanceSubsystemId(part: Pick<PartInstance, "location" | "intendedSubsystemId">) {
  return part.location.kind === "installed" ? part.location.subsystemId : part.intendedSubsystemId;
}

export function partInstanceMechanismId(part: Pick<PartInstance, "location" | "intendedMechanismId">) {
  return part.location.kind === "installed" ? part.location.mechanismId : part.intendedMechanismId;
}
