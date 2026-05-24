const results = [];
let hasFailure = false;

export async function runCheck(name, fn) {
  try {
    return await fn();
  } catch (error) {
    logResult(
      "FAIL",
      name,
      (error instanceof Error ? error.message : `${error}`) || "unknown failure",
    );
    return null;
  }
}

export function logResult(status, check, details) {
  results.push({ status, check, details });
  if (status === "FAIL") {
    hasFailure = true;
  }
}

export function finalizeSmokeResults() {
  if (hasFailure) {
    console.log("\nSmoke checks failed.");
    printResults();
    process.exit(1);
  }

  console.log("\nSmoke checks passed.");
  printResults();
}

function printResults() {
  for (const result of results) {
    console.log(`[${result.status}] ${result.check.padEnd(30)} ${result.details}`);
  }
}
