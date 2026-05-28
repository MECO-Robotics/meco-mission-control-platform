import { readFile } from "node:fs/promises";
import { deepStrictEqual } from "node:assert";
import path from "node:path";
import { toBootstrapContractDocument } from "../../src/contracts/bootstrap";

async function readJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as T;
}

async function main() {
  const contractPath = path.resolve(
    process.cwd(),
    "contracts/platform/bootstrap/v1/contract.json",
  );
  const committed = await readJson<unknown>(contractPath);
  const generated = toBootstrapContractDocument();
  deepStrictEqual(committed, generated);
  console.log(`Bootstrap contract artifact matches generated source: ${contractPath}`);
}

main().catch((error) => {
  console.error("Bootstrap contract verification failed.", error.message ?? error);
  process.exit(1);
});
