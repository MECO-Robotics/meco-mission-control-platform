import type { OnshapeAssemblyBomResponse, OnshapeReference } from "../onshapeTypes";
import { asRecord } from "./fields";
import { normalizeBomTable } from "./bomTable";
import { normalizeRootAssemblyBom } from "./rootAssembly";

function alreadyNormalized(raw: unknown): OnshapeAssemblyBomResponse | null {
  const bom = asRecord(raw) as Partial<OnshapeAssemblyBomResponse> | null;
  return bom &&
    Array.isArray(bom.assemblyNodes) &&
    Array.isArray(bom.partDefinitions) &&
    Array.isArray(bom.partInstances)
    ? {
        assemblyNodes: bom.assemblyNodes,
        partDefinitions: bom.partDefinitions,
        partInstances: bom.partInstances,
        raw: bom.raw ?? { payload: raw },
      }
    : null;
}

export function normalizeOnshapeBom(raw: unknown, reference: OnshapeReference): OnshapeAssemblyBomResponse {
  const normalized = alreadyNormalized(raw);
  if (normalized) {
    return normalized;
  }

  const record = asRecord(raw);
  const native = record
    ? normalizeRootAssemblyBom(record, reference) ?? normalizeBomTable(record, reference)
    : null;
  if (native) {
    return native;
  }

  throw new Error("Onshape BOM payload was not recognized.");
}
