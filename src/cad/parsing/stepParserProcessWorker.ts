import type { StepParseResult } from "../cadTypes";
import { parseJsonFixture } from "./stepJsonFixtureParser";
import { parseStepTextAssemblyGraph } from "./stepTextParser";
import type { StepParserInput, StepParserMode } from "./stepParserTypes";

interface ParserProcessInput extends StepParserInput {
  mode: Exclude<StepParserMode, "placeholder">;
}

type ParserProcessResult =
  | { ok: true; parsed: StepParseResult }
  | { ok: false; message: string };

function parseInProcess(input: ParserProcessInput) {
  if (input.mode === "json_fixture") {
    const parsed = parseJsonFixture(input);
    if (!parsed) {
      throw new Error("STEP parser JSON fixture input is invalid.");
    }
    return parsed;
  }

  if (input.mode === "auto") {
    const trimmed = input.fileText.trimStart();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      const parsed = parseJsonFixture(input);
      if (parsed) {
        return parsed;
      }
    }
  }

  return parseStepTextAssemblyGraph(input);
}

function sendResult(result: ParserProcessResult) {
  if (typeof process.send !== "function") {
    return;
  }
  process.send(result, () => {
    process.exit(result.ok ? 0 : 1);
  });
}

process.once("message", (input: ParserProcessInput) => {
  try {
    sendResult({ ok: true, parsed: parseInProcess(input) });
  } catch (error) {
    sendResult({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
