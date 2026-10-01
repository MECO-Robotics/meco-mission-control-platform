import type { ReadonlyData, SnapshotView, Task, TaskStatus } from "./types";
import { isTaskWaitingOnDependencies } from "./taskDependencyState";
import { partInstanceMechanismId } from "./partInstanceLocation";

export function evaluateTaskCompletion(task: ReadonlyData<Task>, snapshot: SnapshotView) {
  const workLogs = snapshot.workLogs.filter((workLog) => workLog.taskId === task.id);
  const qaReports = snapshot.qaReports.filter((report) =>
    report.reportType === "qa" && report.targetRefs.some((ref) => ref.kind === "task" && ref.id === task.id),
  );

  const missing: string[] = [];

  if (workLogs.length === 0) {
    missing.push("required work log");
  }

  if (task.requiresDocumentation && !snapshot.artifacts.some((artifact) =>
    artifact.targetRefs.some((ref) => ref.kind === "task" && ref.id === task.id),
  )) {
    missing.push("notebook or documentation evidence");
  }

  if (!hasMentorPass(qaReports)) {
    missing.push("mentor-backed QA approval");
  }

  return {
    status: task.status,
    canFinalize: missing.length === 0,
    missing,
    workLogCount: workLogs.length,
    qaReportCount: qaReports.length,
  };
}

export function buildDashboard(snapshot: SnapshotView) {
  const totalHours = snapshot.workLogs.reduce((sum, workLog) => {
    return sum + workLog.hours;
  }, 0);

  const openTasks = snapshot.tasks.filter((task) => task.status !== "complete");
  const waitingForQa = snapshot.tasks.filter(
    (task) => task.status === "waiting-for-qa",
  ).length;
  const blocked = snapshot.tasks.filter((task) => task.isBlocked).length;
  const nextTasks = snapshot.tasks
    .filter((task) => {
      if (task.status === "complete" || task.isBlocked || isTaskWaitingOnDependencies(task, snapshot)) {
        return false;
      }
      return true;
    })
    .map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
    }));

  return {
    summary: {
      openTasks: openTasks.length,
      waitingForQa,
      blocked,
      trackedHours: totalHours,
      nextMeeting: snapshot.meetings[0],
    },
    subsystemCards: snapshot.subsystems.map((subsystem) => {
      const tasks = snapshot.tasks.filter(
        (task) =>
          task.subsystemIds.includes(subsystem.id),
      );
      const done = tasks.filter((task) => task.status === "complete").length;

      return {
        id: subsystem.id,
        name: subsystem.name,
        risks: snapshot.risks.filter((risk) => risk.relatedTargets.some((target) => target.kind === "subsystem" && target.id === subsystem.id)).map((risk) => risk.title),
        completionRate:
          tasks.length === 0 ? 0 : Number((done / tasks.length).toFixed(2)),
        activeTasks: tasks.filter((task) => task.status !== "complete").length,
      };
    }),
    nextTasks,
    escalations: snapshot.escalations,
  };
}

export function buildMetrics(snapshot: SnapshotView) {
  const completedTasks = snapshot.tasks.filter((task) => task.status === "complete");
  const workHoursByTaskId = new Map<string, number>();

  snapshot.workLogs.forEach((workLog) => {
    workHoursByTaskId.set(
      workLog.taskId,
      (workHoursByTaskId.get(workLog.taskId) ?? 0) + workLog.hours,
    );
  });

  const totalHours = snapshot.workLogs.reduce((sum, workLog) => sum + workLog.hours, 0);
  const qaPasses = snapshot.qaReports.filter(
    (report) => report.result === "pass" && report.status === "reviewed" && report.reviewedById !== null,
  ).length;
  const deliveredPurchases = snapshot.purchaseItems.filter(
    (purchase) => purchase.orderStatus === "delivered",
  ).length;
  const lowStockMaterials = snapshot.materials.filter(
    (material) => material.onHandQuantity <= material.reorderPoint,
  ).length;
  const subsystemMetrics = buildSubsystemMetrics(snapshot, workHoursByTaskId);
  const mechanismMetrics = buildMechanismMetrics(snapshot, workHoursByTaskId);

  return {
    completionRate: Number(
      (completedTasks.length / Math.max(snapshot.tasks.length, 1)).toFixed(2),
    ),
    averageTrackedHoursPerTask: Number(
      (totalHours / Math.max(snapshot.tasks.length, 1)).toFixed(2),
    ),
    qaPasses,
    deliveredPurchases,
    lowStockMaterials,
    trackedMaterials: snapshot.materials.length,
    waitingForQa: snapshot.tasks.filter((task) => task.status === "waiting-for-qa")
      .length,
    blockerCount: snapshot.tasks.filter((task) => task.isBlocked).length,
    attendanceHours: snapshot.attendanceRecords.reduce((sum, record) => {
      return sum + record.totalHours;
    }, 0),
    subsystemMetrics,
    mechanismMetrics,
  };
}

export function formatTaskStatus(status: TaskStatus) {
  if (status === "not-started") {
    return "Not Started";
  }

  if (status === "in-progress") {
    return "In Progress";
  }

  if (status === "waiting-for-qa") {
    return "QA";
  }

  return "Complete";
}

function hasMentorPass(qaReports: SnapshotView["qaReports"]) {
  return qaReports.some((report) => {
    return report.result === "pass" && report.status === "reviewed" && report.reviewedById !== null;
  });
}

function buildTaskMetrics(
  snapshot: SnapshotView,
  tasks: ReadonlyData<Task[]>,
  workHoursByTaskId: Map<string, number>,
) {
  const taskIds = new Set(tasks.map((task) => task.id));
  const completeTaskCount = tasks.filter((task) => task.status === "complete").length;
  const waitingForQaCount = tasks.filter((task) => task.status === "waiting-for-qa").length;
  const blockerCount = tasks.filter((task) => task.isBlocked).length;
  const plannedHours = tasks.reduce((sum, task) => sum + task.estimatedHours, 0);
  const loggedHours = tasks.reduce(
    (sum, task) => sum + (workHoursByTaskId.get(task.id) ?? 0),
    0,
  );
  const qaPassCount = snapshot.qaReports.filter((report) =>
    report.result === "pass" && report.status === "reviewed" && report.reviewedById !== null &&
    report.targetRefs.some((ref) => ref.kind === "task" && taskIds.has(ref.id)),
  ).length;

  return { completeTaskCount, waitingForQaCount, blockerCount, plannedHours, loggedHours, qaPassCount };
}

function buildSubsystemMetrics(
  snapshot: SnapshotView,
  workHoursByTaskId: Map<string, number>,
) {
  return snapshot.subsystems
    .map((subsystem) => {
      const tasks = snapshot.tasks.filter((task) =>
        task.subsystemIds.includes(subsystem.id),
      );
      const taskMetrics = buildTaskMetrics(snapshot, tasks, workHoursByTaskId);
      const mechanismCount = snapshot.mechanisms.filter((mechanism) => {
        return mechanism.subsystemId === subsystem.id;
      }).length;

      return {
        id: subsystem.id,
        name: subsystem.name,
        projectId: subsystem.projectId,
        taskCount: tasks.length,
        activeTaskCount: tasks.length - taskMetrics.completeTaskCount,
        completeTaskCount: taskMetrics.completeTaskCount,
        waitingForQaCount: taskMetrics.waitingForQaCount,
        blockerCount: taskMetrics.blockerCount,
        plannedHours: Number(taskMetrics.plannedHours.toFixed(1)),
        loggedHours: Number(taskMetrics.loggedHours.toFixed(1)),
        completionRate: Number(
          (taskMetrics.completeTaskCount / Math.max(tasks.length, 1)).toFixed(2),
        ),
        qaPassCount: taskMetrics.qaPassCount,
        mechanismCount,
      };
    })
    .sort((left, right) => {
      const activeOrder = right.activeTaskCount - left.activeTaskCount;
      if (activeOrder !== 0) {
        return activeOrder;
      }

      const blockerOrder = right.blockerCount - left.blockerCount;
      if (blockerOrder !== 0) {
        return blockerOrder;
      }

      const completionOrder = left.completionRate - right.completionRate;
      if (completionOrder !== 0) {
        return completionOrder;
      }

      return left.name.localeCompare(right.name);
    });
}

function buildMechanismMetrics(
  snapshot: SnapshotView,
  workHoursByTaskId: Map<string, number>,
) {
  return snapshot.mechanisms
    .map((mechanism) => {
      const tasks = snapshot.tasks.filter((task) =>
        task.mechanismIds.includes(mechanism.id),
      );
      const subsystemName = snapshot.subsystems.find(
        (subsystem) => subsystem.id === mechanism.subsystemId,
      )?.name ?? "Unknown subsystem";
      const taskMetrics = buildTaskMetrics(snapshot, tasks, workHoursByTaskId);
      const partInstanceCount = snapshot.partInstances.filter((partInstance) => {
        return partInstanceMechanismId(partInstance) === mechanism.id;
      }).length;

      return {
        id: mechanism.id,
        name: mechanism.name,
        subsystemId: mechanism.subsystemId,
        subsystemName,
        taskCount: tasks.length,
        activeTaskCount: tasks.length - taskMetrics.completeTaskCount,
        completeTaskCount: taskMetrics.completeTaskCount,
        waitingForQaCount: taskMetrics.waitingForQaCount,
        blockerCount: taskMetrics.blockerCount,
        plannedHours: Number(taskMetrics.plannedHours.toFixed(1)),
        loggedHours: Number(taskMetrics.loggedHours.toFixed(1)),
        completionRate: Number(
          (taskMetrics.completeTaskCount / Math.max(tasks.length, 1)).toFixed(2),
        ),
        qaPassCount: taskMetrics.qaPassCount,
        partInstanceCount,
      };
    })
    .sort((left, right) => {
      const activeOrder = right.activeTaskCount - left.activeTaskCount;
      if (activeOrder !== 0) {
        return activeOrder;
      }

      const blockerOrder = right.blockerCount - left.blockerCount;
      if (blockerOrder !== 0) {
        return blockerOrder;
      }

      const completionOrder = left.completionRate - right.completionRate;
      if (completionOrder !== 0) {
        return completionOrder;
      }

      return left.name.localeCompare(right.name);
    });
}
