import { resolve } from "node:path";

import { archivePlatformSnapshotFile } from "../src/data/platformSnapshotFile";

const snapshotPath = resolve(process.cwd(), process.env.PLATFORM_SNAPSHOT_PATH ?? "data/platform-snapshot.json");
const archivedPath = archivePlatformSnapshotFile(snapshotPath, "reset");

if (archivedPath) {
  process.stdout.write(`Archived platform snapshot at ${snapshotPath} to ${archivedPath}. The next startup will create the canonical seed.\n`);
} else {
  process.stdout.write(`No platform snapshot exists at ${snapshotPath}. The next startup will create the canonical seed.\n`);
}
