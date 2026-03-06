/**
 * CI guard: ensures every non-English locale file contains
 * exactly the same set of keys as en.json.
 *
 * Usage: npx tsx scripts/check-translations.ts
 * Exit code 1 if any locale has missing or extra keys.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const LOCALES_DIR = join(import.meta.dirname, "../src/locales");
const REF_FILE = "en.json";

const refPath = join(LOCALES_DIR, REF_FILE);
const refKeys = new Set(Object.keys(JSON.parse(readFileSync(refPath, "utf-8"))));

const files = readdirSync(LOCALES_DIR).filter((f) => f.endsWith(".json") && f !== REF_FILE);

let failed = false;

for (const file of files) {
  const keys = new Set(Object.keys(JSON.parse(readFileSync(join(LOCALES_DIR, file), "utf-8"))));

  const missing = [...refKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !refKeys.has(k));

  if (missing.length > 0) {
    console.error(`${file}: missing ${missing.length} key(s):`);
    for (const k of missing) console.error(`  - ${k}`);
    failed = true;
  }

  if (extra.length > 0) {
    console.error(`${file}: extra ${extra.length} key(s):`);
    for (const k of extra) console.error(`  + ${k}`);
    failed = true;
  }

  if (missing.length === 0 && extra.length === 0) {
    console.log(`${file}: OK (${keys.size} keys)`);
  }
}

if (failed) {
  console.error("\nTranslation check failed. Fix the above issues.");
  process.exit(1);
} else {
  console.log(`\nAll ${files.length} locale(s) match ${REF_FILE} (${refKeys.size} keys).`);
}
