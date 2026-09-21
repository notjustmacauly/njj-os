// Writes src/lib/build-id.ts with a per-build id. Runs automatically before
// `next build` (npm "prebuild" hook). On Netlify COMMIT_REF is the deploy's
// git SHA; locally we fall back to a timestamp. Both the client bundle and the
// /api/version route import this same constant, so a stale client (old bundle)
// will see a different id from the live deployment and refresh itself.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const id = (process.env.COMMIT_REF || "").slice(0, 12) || `dev-${Date.now()}`;
const out = join(here, "..", "src", "lib", "build-id.ts");
writeFileSync(out, `// AUTO-GENERATED at build time by scripts/gen-build-id.mjs. Do not edit.\nexport const BUILD_ID = ${JSON.stringify(id)};\n`);
console.log("[build] BUILD_ID =", id);
