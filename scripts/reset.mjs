import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const path = process.env.ORDERPILOT_DB_PATH ?? join(process.cwd(), "data", "orderpilot.db");

for (const suffix of ["", "-wal", "-shm"]) {
  const target = `${path}${suffix}`;
  if (existsSync(target)) rmSync(target, { force: true });
}

console.log(`Removed local database at ${path}`);
console.log("It will be recreated automatically the next time the app starts.");
