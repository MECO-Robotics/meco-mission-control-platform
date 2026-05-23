import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { toBootstrapContractDocument } from "../../src/contracts/bootstrap";

async function main() {
  const contractPath = path.resolve(
    process.cwd(),
    "contracts/platform/bootstrap/v1/contract.json",
  );
  const payload = JSON.stringify(
    toBootstrapContractDocument(),
    null,
    2,
  );
  await mkdir(path.dirname(contractPath), { recursive: true });
  await writeFile(contractPath, `${payload}\n`, "utf8");
  console.log(`Wrote bootstrap contract artifact to ${contractPath}`);
}

main().catch((error) => {
  console.error("Failed to generate bootstrap contract artifact.", error);
  process.exit(1);
});
