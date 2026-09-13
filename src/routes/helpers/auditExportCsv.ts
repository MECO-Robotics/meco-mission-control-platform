import type { AuditAction } from "../../domain/types";

const CSV_COLUMNS = [
  "id",
  "timestamp",
  "operation",
  "entityType",
  "entityId",
  "entityLabel",
  "message",
  "changedFields",
  "projectId",
  "projectIds",
  "taskId",
  "subsystemId",
  "actorMemberId",
  "memberIds",
  "requestId",
] as const;

function csvValue(value: unknown) {
  if (Array.isArray(value)) {
    return csvValue(value.join(";"));
  }
  if (value === null || value === undefined) {
    return "";
  }

  const rawText = String(value);
  const text = /^[=+\-@\t\r\n]/.test(rawText) ? `'${rawText}` : rawText;
  if (!/[",\r\n]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function actionCsvRow(action: AuditAction) {
  const values: Record<(typeof CSV_COLUMNS)[number], unknown> = {
    id: action.id,
    timestamp: action.timestamp,
    operation: action.operation,
    entityType: action.entityType,
    entityId: action.entityId,
    entityLabel: action.entityLabel,
    message: action.message,
    changedFields: action.changedFields,
    projectId: action.projectId,
    projectIds: action.projectIds ?? [],
    taskId: action.taskId,
    subsystemId: action.subsystemId,
    actorMemberId: action.actorMemberId,
    memberIds: action.memberIds,
    requestId: action.requestId,
  };

  return CSV_COLUMNS.map((column) => csvValue(values[column])).join(",");
}

export function formatAuditActionsCsv(actions: AuditAction[]) {
  return [CSV_COLUMNS.join(","), ...actions.map(actionCsvRow)].join("\r\n");
}
