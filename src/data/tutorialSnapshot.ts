import type { PlatformSnapshot } from "../domain/types";
import { snapshot } from "./mockData";

const DAY = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/;

// Keep two months of team history and the next seven months of season work.
export function createTutorialSnapshot(now = new Date()): PlatformSnapshot {
  const seasonStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1);
  const seasonEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 8, 1);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = seasonStart;
  const end = seasonEnd - 1;
  const copy = structuredClone(snapshot);
  const dates: Array<{ record: Record<string, unknown>; key: string; value: string; time: number }> = [];
  function collect(value: unknown): void {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === "string" && ISO_DATE.test(child)) {
        dates.push({ record: value as Record<string, unknown>, key, value: child, time: Date.parse(child) });
      } else collect(child);
    }
  }
  // Seasons frame the activity rather than contributing to its date range.
  for (const [key, value] of Object.entries(copy)) if (key !== "seasons") collect(value);
  const historicalDates: number[] = [];
  const recordedCollections = [copy.workLogs, copy.qaReports, copy.attendanceRecords, copy.testResults, copy.actions];
  function recordDates(value: unknown): void {
    if (typeof value === "string" && ISO_DATE.test(value)) historicalDates.push(Date.parse(value));
    else if (value && typeof value === "object") Object.values(value).forEach(recordDates);
  }
  recordedCollections.forEach(recordDates);
  for (const date of dates) if (["createdAt", "updatedAt", "resolvedAt", "reviewedAt", "completedAt"].includes(date.key)) historicalDates.push(date.time);
  const anchor = Math.max(...historicalDates);
  const present = Math.min(now.getTime(), end);
  const first = Math.min(...dates.map((date) => date.time));
  const last = Math.max(...dates.map((date) => date.time));
  for (const date of dates) {
    const before = date.time <= anchor;
    const sourceStart = before ? first : anchor;
    const sourceEnd = before ? anchor : last;
    const targetStart = before ? start : present;
    const targetEnd = before ? present : end;
    const fraction = sourceEnd === sourceStart ? 0 : (date.time - sourceStart) / (sourceEnd - sourceStart);
    const shifted = new Date(targetStart + Math.floor(fraction * (targetEnd - targetStart))).toISOString();
    date.record[date.key] = date.value.length === 10 ? shifted.slice(0, 10) : shifted;
  }
  for (const season of copy.seasons) {
    season.startDate = new Date(seasonStart).toISOString().slice(0, 10);
    season.endDate = new Date(seasonEnd - DAY).toISOString().slice(0, 10);
  }
  for (const task of copy.tasks) {
    task.actualHours = copy.workLogs.filter((log) => log.taskId === task.id).reduce((sum, log) => sum + log.hours, 0);
  }
  // Keep a few assigned examples overdue after tutorial dates roll forward.
  // Otherwise the compressed historical timeline can place every due date on
  // today, hiding overdue workload from the demo views.
  for (const task of copy.tasks.filter((candidate) => ["travel-pack-finalize", "intake-guard", "auto-safety-review"].includes(candidate.id))) {
    const yesterday = new Date(today - DAY).toISOString().slice(0, 10);
    task.startDate = yesterday;
    task.dueDate = yesterday;
  }
  // The availability view requires attendance today, not just roster membership.
  for (const member of copy.members.filter((member) => member.id.startsWith("demo-"))) {
    copy.attendanceRecords.push({
      id: `attendance-${member.id}`,
      memberId: member.id,
      date: now.toISOString().slice(0, 10),
      totalHours: 1,
    });
  }
  return copy;
}
