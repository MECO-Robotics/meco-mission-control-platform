import { cadStepParserConfig } from "../../config/env";
import { CadImportError } from "../errors/cadImportErrors";

let activeParserProcesses = 0;
const parserWaiters: Array<{
  resolve: () => void;
  timer: ReturnType<typeof setTimeout>;
  removeAbortListener: () => void;
}> = [];

export function stepParserTimeoutError(waitingForCapacity = false) {
  return new CadImportError(
    waitingForCapacity
      ? "STEP parsing timed out while waiting for capacity."
      : "STEP parsing timed out. Export a smaller STEP file and try again.",
    408,
  );
}

export async function acquireParserSlot(deadline: number, signal: AbortSignal) {
  if (signal.aborted || Date.now() >= deadline) throw stepParserTimeoutError(true);
  if (activeParserProcesses < cadStepParserConfig.maxConcurrency) {
    activeParserProcesses += 1;
    return;
  }
  if (parserWaiters.length >= cadStepParserConfig.maxQueue) {
    throw new CadImportError(
      "STEP parsing is currently at capacity. Wait for an active import to finish and try again.",
      503,
    );
  }
  await new Promise<void>((resolve, reject) => {
    const removeWaiter = () => {
      const index = parserWaiters.indexOf(waiter);
      if (index >= 0) parserWaiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.removeAbortListener();
    };
    const onAbort = () => {
      removeWaiter();
      reject(stepParserTimeoutError(true));
    };
    const waiter = {
      resolve: () => { removeWaiter(); resolve(); },
      timer: setTimeout(() => { removeWaiter(); reject(stepParserTimeoutError(true)); }, Math.max(0, deadline - Date.now())),
      removeAbortListener: () => signal.removeEventListener("abort", onAbort),
    };
    signal.addEventListener("abort", onAbort, { once: true });
    parserWaiters.push(waiter);
  });
  activeParserProcesses += 1;
}

export function releaseParserSlot() {
  activeParserProcesses = Math.max(0, activeParserProcesses - 1);
  const next = parserWaiters.shift();
  if (next) {
    clearTimeout(next.timer);
    next.resolve();
  }
}
