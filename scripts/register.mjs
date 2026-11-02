import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Lets Node run the TypeScript sources in lib/ directly (type stripping plus the
// extensionless-import resolver). Used by scripts, seeds and tests.
register("./ts-loader.mjs", pathToFileURL(import.meta.filename));
