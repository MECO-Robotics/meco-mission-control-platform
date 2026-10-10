import type {
  ReadonlyData,
  MemberRole,
  PurchaseItem,
  PurchaseOrderStatus,
} from "../domain/types";

export type WorkflowPolicyFailure = {
  message: string;
  statusCode: 403 | 409;
};

const purchaseTransitions: Partial<Record<PurchaseOrderStatus, PurchaseOrderStatus>> = {
  "not-ordered": "ordered",
  ordered: "shipped",
  shipped: "delivered",
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
  item: ReadonlyData<PurchaseItem>,
  approvalStatus: "approved" | "rejected",
): WorkflowPolicyFailure | null {
  if (!item.selectedQuoteId || !item.quotes.some((quote) => quote.id === item.selectedQuoteId)) return { statusCode: 409, message: "Select a quote before approving or rejecting a purchase." };
  if (item.orderStatus !== "not-ordered") return { statusCode: 409, message: "Approval can only change before ordering." };
  if (item.approvalStatus === approvalStatus) return null;
  if (item.approvalStatus !== "pending") return { statusCode: 409, message: "A decision can only change while approval is pending." };
  return null;
}

export function validatePurchaseTransition(
  current: PurchaseOrderStatus,
  next: PurchaseOrderStatus,
): WorkflowPolicyFailure | null {
  return current === next || purchaseTransitions[current] === next || (next === "cancelled" && current !== "delivered" && current !== "cancelled")
    ? null
    : { statusCode: 409, message: `Purchase cannot transition from ${current} to ${next}.` };
}
