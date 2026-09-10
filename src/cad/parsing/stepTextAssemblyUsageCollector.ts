import type { StepEntity } from "./stepTextEntityParser";
import { stepStringValue } from "./stepTextEntityParser";
import type { StepAssemblyUsage, StepProductDefinition } from "./stepTextParserTypes";

const assemblyUsageEntityTypes = new Set([
  "NEXT_ASSEMBLY_USAGE_OCCURRENCE",
  "ASSEMBLY_COMPONENT_USAGE",
  "QUANTIFIED_ASSEMBLY_COMPONENT_USAGE",
  "PROMISSORY_USAGE_OCCURRENCE",
]);

function stepNumberValue(arg: string) {
  const value = arg.trim();
  if (!value || value === "$" || value === "*" || value.startsWith("#")) {
    return null;
  }
  const match = value.match(/[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][-+]?\d+)?/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function quantityFromMeasureEntity(entity: StepEntity | undefined) {
  if (!entity) {
    return null;
  }
  for (const arg of entity.args) {
    const parsed = stepNumberValue(arg);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

function assemblyUsageQuantity(entity: StepEntity, entitiesById: Map<string, StepEntity>) {
  if (entity.type !== "QUANTIFIED_ASSEMBLY_COMPONENT_USAGE") {
    return 1;
  }
  for (let index = entity.args.length - 1; index >= 0; index -= 1) {
    const arg = entity.args[index]?.trim() ?? "";
    const referencedQuantity = arg.startsWith("#") ? quantityFromMeasureEntity(entitiesById.get(arg.toUpperCase())) : null;
    const parsedQuantity = referencedQuantity ?? stepNumberValue(arg);
    if (parsedQuantity !== null) {
      return parsedQuantity;
    }
  }
  return 1;
}

export function collectAssemblyUsages(args: {
  entities: StepEntity[];
  productDefinitions: Map<string, StepProductDefinition>;
}) {
  const assemblyUsages: StepAssemblyUsage[] = [];
  const entitiesById = new Map(args.entities.map((entity) => [entity.id, entity]));
  let partialReferenceCount = 0;
  let nextAssemblyUsageOccurrenceCount = 0;
  for (const entity of args.entities) {
    if (!assemblyUsageEntityTypes.has(entity.type)) {
      continue;
    }
    if (entity.type === "NEXT_ASSEMBLY_USAGE_OCCURRENCE") {
      nextAssemblyUsageOccurrenceCount += 1;
    }
    const productDefinitionRefs = entity.refs.filter((ref) => args.productDefinitions.has(ref));
    if (productDefinitionRefs.length < 2) {
      partialReferenceCount += 1;
      continue;
    }
    const stringArgs = entity.args.map(stepStringValue).filter((value): value is string => value !== null);
    assemblyUsages.push({
      id: entity.id,
      occurrenceName: stringArgs[1]?.trim() || stringArgs[0]?.trim() || "",
      parentProductDefinitionId: productDefinitionRefs[0]!,
      childProductDefinitionId: productDefinitionRefs[1]!,
      quantity: assemblyUsageQuantity(entity, entitiesById),
    });
  }
  return { assemblyUsages, nextAssemblyUsageOccurrenceCount, partialReferenceCount };
}
