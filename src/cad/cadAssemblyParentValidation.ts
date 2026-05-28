import type { CadAssemblyCreateInput } from "./cadStoreTypes";

function describeCycle(sourceIds: string[]) {
  return sourceIds.length > 0 ? sourceIds.join(" -> ") : "unknown assembly";
}

export function assertAcyclicAssemblyParents(input: CadAssemblyCreateInput[]) {
  const parentsBySourceId = new Map(input.map((node) => [node.sourceId, node.parentSourceId ?? null] as const));

  for (const node of input) {
    const path: string[] = [];
    const visited = new Set<string>();
    let sourceId: string | null = node.sourceId;

    while (sourceId) {
      if (visited.has(sourceId)) {
        const cycleStart = path.indexOf(sourceId);
        const cycle = cycleStart >= 0 ? path.slice(cycleStart).concat(sourceId) : [sourceId];
        throw new Error(`CAD assembly hierarchy contains a parent cycle: ${describeCycle(cycle)}.`);
      }

      visited.add(sourceId);
      path.push(sourceId);
      const parentSourceId = parentsBySourceId.get(sourceId);
      sourceId = parentSourceId && parentsBySourceId.has(parentSourceId) ? parentSourceId : null;
    }
  }
}
