import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { snapshot } from "../src/data/mockData";

function runReceiptProcess(snapshotPath: string, retry: boolean) {
  const script = `
    const imported = await import("./src/data/store.ts");
    const store = imported.default ?? imported;
    const owner = store.createPlatformStore({ durability: "durable", snapshotPath: process.env.PLATFORM_SNAPSHOT_PATH });
    await owner.run(async () => {
      const mutation = await store.acquireSnapshotMutation();
      mutation.enter();
      try {
        ${retry ? "" : `
        store.updateMaterial("mat-onyx-filament", { onHandQuantity: 0 });
        store.updatePurchaseItem("ferrule-kit", { kind: "cots-goods", partDefinitionId: null, materialId: "mat-onyx-filament", quantity: 1.3, approvalStatus: "approved", orderStatus: "ordered" });
        `}
        const beforeAuditCount = store.getSnapshot().actions.length;
        const result = store.receivePurchaseItem("ferrule-kit", { operationId: "durable-receipt-1", quantity: 0.1, location: "Onyx shelf" });
        if ("error" in result) throw new Error("Receipt failed: " + result.error);
        await mutation.commit();
        const saved = store.getSnapshot();
        const output = JSON.stringify({
          replayed: result.replayed,
          receiptId: result.receipt.id,
          receiptCount: saved.purchaseItems.find((item) => item.id === "ferrule-kit").receipts.length,
          operationReceipts: saved.purchaseItems.find((item) => item.id === "ferrule-kit").receipts.filter((receipt) => receipt.operationId === "durable-receipt-1").length,
          stock: saved.materials.find((material) => material.id === "mat-onyx-filament").onHandQuantity,
          auditDelta: saved.actions.length - beforeAuditCount,
          legacyReceipts: saved.purchaseItems.find((item) => item.id === "outsourced-swerve-bracket").receipts,
        });
        (await import("node:fs")).writeFileSync(process.env.RECEIPT_RESULT_PATH, output, "utf8");
      } finally {
        mutation.release();
      }
    });
  `;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, PLATFORM_SNAPSHOT_PATH: snapshotPath, RECEIPT_RESULT_PATH: `${snapshotPath}.${retry ? "retry" : "first"}.result`, NODE_ENV: "test" },
  });
  assert.equal(result.status, 0, JSON.stringify({ status: result.status, signal: result.signal, error: result.error?.message, stderr: result.stderr, stdout: result.stdout }));
  return JSON.parse(readFileSync(`${snapshotPath}.${retry ? "retry" : "first"}.result`, "utf8")) as {
    replayed: boolean;
    receiptId: string;
    receiptCount: number;
    operationReceipts: number;
    stock: number;
    auditDelta: number;
    legacyReceipts: Array<{ id: string; quantity: number; location: string; receivedAt: string; partInstanceIds: string[] }>;
  };
}

test("durable receipt operation IDs replay after restart without repeating stock, receipt, or audit effects", () => {
  const directory = mkdtempSync(join(tmpdir(), "meco-receipt-restart-"));
  const snapshotPath = join(directory, "platform-snapshot.json");
  const legacyReceipt = {
    id: "legacy-receipt-without-operation-id",
    quantity: 1,
    location: "Legacy receiving shelf",
    receivedAt: "2026-01-01T00:00:00.000Z",
    partInstanceIds: [],
  };
  const seeded = structuredClone(snapshot);
  const legacyPurchase = seeded.purchaseItems.find((item) => item.id === "outsourced-swerve-bracket");
  assert.ok(legacyPurchase);
  legacyPurchase.receipts = [legacyReceipt];
  writeFileSync(snapshotPath, JSON.stringify(seeded), "utf8");

  try {
    const first = runReceiptProcess(snapshotPath, false);
    const afterRestart = runReceiptProcess(snapshotPath, true);

    assert.equal(first.replayed, false);
    assert.equal(first.auditDelta, 1);
    assert.equal(afterRestart.replayed, true);
    assert.equal(afterRestart.receiptId, first.receiptId);
    assert.equal(afterRestart.receiptCount, 1);
    assert.equal(afterRestart.operationReceipts, 1);
    assert.equal(afterRestart.stock, 0.1);
    assert.equal(afterRestart.auditDelta, 0);
    assert.deepEqual(afterRestart.legacyReceipts, [legacyReceipt]);
    const persisted = JSON.parse(readFileSync(snapshotPath, "utf8"));
    assert.equal(persisted.purchaseItems.find((item: { id: string }) => item.id === "ferrule-kit").receipts.length, 1);
    assert.deepEqual(persisted.purchaseItems.find((item: { id: string }) => item.id === "outsourced-swerve-bracket").receipts, [legacyReceipt]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
