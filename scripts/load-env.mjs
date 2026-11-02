import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Minimal .env.local loader for the Node scripts (the Next.js app loads these
 * itself). Existing process.env values win, so a shell override still works.
 */
export function loadEnv(file = ".env.local") {
  const path = join(process.cwd(), file);
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
