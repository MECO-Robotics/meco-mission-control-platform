import type {
  ManufacturingItem,
  ManufacturingStatus,
  MemberRole,
  PurchaseItem,
  PurchaseStatus,
} from "../domain/types";

export type WorkflowPolicyFailure = {
  message: string;
  statusCode: 403 | 409;
};

const purchaseTransitions: Partial<Record<PurchaseStatus, PurchaseStatus>> = {
  approved: "purchased",
  purchased: "shipped",
  shipped: "delivered",
};

const manufacturingTransitions: Partial<Record<ManufacturingStatus, ManufacturingStatus>> = {
  approved: "in-progress",
  "in-progress": "qa",
  qa: "complete",
};

export function isWorkflowApproverRole(role: MemberRole | undefined) {
  return role === "mentor" || role === "admin";
}

function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function isNoopPatch(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
) {
  return Object.entries(patch).every(([field, value]) => valuesEqual(current[field], value));
}

export function assessGenericPatch(args: {
  current: Record<string, unknown>;
  patch: Record<string, unknown>;
  protectedFields: readonly string[];
  isApprover: boolean;
  isPending: boolean;
  entityLabel: string;
}): WorkflowPolicyFailure | null {
  const changedFields = Object.entries(args.patch)
    .filter(([field, value]) => !valuesEqual(args.current[field], value))
    .map(([field]) => field);

  if (changedFields.length === 0) {
    return null;
  }

  if (changedFields.some((field) => args.protectedFields.includes(field))) {
    return args.isApprover
      ? {
          statusCode: 409,
          message: `${args.entityLabel} workflow fields must use the dedicated approval or transition endpoint.`,
        }
      : {
          statusCode: 403,
          message: `Only mentors and admins can change ${args.entityLabel.toLowerCase()} workflow fields.`,
        };
  }

  if (!args.isPending) {
    return {
      statusCode: 409,
      message: `${args.entityLabel} details can only be edited while the item is requested.`,
    };
  }

  return null;
}

export function validatePurchaseApproval(
  item: PurchaseItem,
  approved: boolean,
): WorkflowPolicyFailure | null {
  if (approved) {
    return item.status === "requested"
      ? null
      : { statusCode: 409, message: "Only requested purchases can be approved." };
  }

  return item.status === "requested" || item.status === "approved"
    ? null
    : { statusCode: 409, message: "Purchase approval cannot be revoked after purchasing begins." };
}

export function validatePurchaseTransition(
  current: PurchaseStatus,
  next: PurchaseStatus,
): WorkflowPolicyFailure | null {
  return purchaseTransitions[current] === next
    ? null
    : { statusCode: 409, message: `Purchase cannot transition from ${current} to ${next}.` };
}

export function validateManufacturingReview(
  item: ManufacturingItem,
  reviewed: boolean,
): WorkflowPolicyFailure | null {
  if (reviewed) {
    return item.status === "requested"
      ? null
      : { statusCode: 409, message: "Only requested manufacturing items can be reviewed." };
  }

  return item.status === "requested" || item.status === "approved"
    ? null
    : { statusCode: 409, message: "Manufacturing review cannot be revoked after work begins." };
}

export function validateManufacturingTransition(
  item: ManufacturingItem,
  next: ManufacturingStatus,
): WorkflowPolicyFailure | null {
  if (!item.mentorReviewed) {
    return { statusCode: 409, message: "Manufacturing work requires active mentor review." };
  }

  return manufacturingTransitions[item.status] === next
    ? null
    : {
        statusCode: 409,
        message: `Manufacturing cannot transition from ${item.status} to ${next}.`,
      };
}
