import { fork } from "child_process";
import { dirname, extname, join } from "path";

import type { StepParseResult } from "../cadTypes";
import { CadImportError } from "../errors/cadImportErrors";
import type { StepParserClient, StepParserMode } from "./stepParserTypes";

const defaultStepParserTimeoutMs = 30_000;
const builtInWorkerParserModes = new Set<StepParserMode>(["auto", "step_text", "json_fixture"]);

function resolveStepParserTimeoutMs() {
  const requestedTimeout = process.env.CAD_STEP_PARSER_TIMEOUT_MS;
  if (requestedTimeout) {
    const parsed = Number(requestedTimeout);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return defaultStepParserTimeoutMs;
}

function resolveParserProcessPath() {
  const extension = extname(__filename) === ".ts" ? ".ts" : ".js";
  return join(dirname(__filename), `stepParserProcessWorker${extension}`);
}

function resolveParserProcessExecArgv(workerPath: string) {
  if (extname(workerPath) !== ".ts") {
    return [];
  }

  const execArgv: string[] = [];
  for (let index = 0; index < process.execArgv.length; index += 1) {
    const arg = process.execArgv[index];
    const nextArg = process.execArgv[index + 1];
    if ((arg === "--import" || arg === "--require" || arg === "-r") && nextArg?.includes("tsx")) {
      execArgv.push(arg, nextArg);
      index += 1;
      continue;
    }
    if ((arg.startsWith("--import=") || arg.startsWith("--require=")) && arg.includes("tsx")) {
      execArgv.push(arg);
    }
  }

  return execArgv.length > 0 ? execArgv : ["--import", "tsx"];
}

function parseStepFileInParserProcess(args: {
  fileText: string;
  importRunId: string;
  mode: Exclude<StepParserMode, "placeholder">;
  originalFilename: string;
  timeoutMs: number;
}) {
  const workerPath = resolveParserProcessPath();
  const child = fork(workerPath, [], {
    execArgv: resolveParserProcessExecArgv(workerPath),
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  const stderrChunks: Buffer[] = [];
  let didFinish = false;

  return new Promise<StepParseResult>((resolve, reject) => {
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    const settle = (callback: () => void) => {
      if (didFinish) {
        return;
      }
      didFinish = true;
      clearTimeout(timeout);
      callback();
    };

    const timeout = setTimeout(() => {
      settle(() => {
        child.kill();
        reject(new CadImportError("STEP parsing timed out. Export a smaller STEP file and try again.", 408));
      });
    }, args.timeoutMs);

    child.once("message", (message: { ok: true; parsed: StepParseResult } | { ok: false; message: string }) => {
      settle(() => {
        child.disconnect();
        if (message.ok) {
          resolve(message.parsed);
          return;
        }
        reject(new Error(message.message));
      });
    });

    child.once("error", (error) => {
      settle(() => {
        reject(error);
      });
    });

    child.once("exit", (code, signal) => {
      settle(() => {
        const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
        const reason = stderr || `STEP parser process exited before returning a result (${signal ?? code ?? "unknown"}).`;
        reject(new Error(reason));
      });
    });

    child.send({
      fileText: args.fileText,
      importRunId: args.importRunId,
      mode: args.mode,
      originalFilename: args.originalFilename,
    });
  });
}

export async function parseStepFileWithTimeout(args: {
  parserClient?: StepParserClient;
  fileText: string;
  originalFilename: string;
  importRunId: string;
  parserMode?: StepParserMode;
  runInWorker?: boolean;
}) {
  const timeoutMs = resolveStepParserTimeoutMs();
  const parsePromise = args.runInWorker && args.parserMode && builtInWorkerParserModes.has(args.parserMode)
    ? parseStepFileInParserProcess({
        fileText: args.fileText,
        importRunId: args.importRunId,
        mode: args.parserMode as Exclude<StepParserMode, "placeholder">,
        originalFilename: args.originalFilename,
        timeoutMs,
      })
    : args.parserClient?.parseStepFile({
        fileText: args.fileText,
        originalFilename: args.originalFilename,
        importRunId: args.importRunId,
      });

  if (!parsePromise) {
    throw new CadImportError("STEP parser is not configured.", 500);
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      parsePromise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new CadImportError("STEP parsing timed out. Export a smaller STEP file and try again.", 408));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
