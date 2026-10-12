import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Hard constraint (spec 1.2): only Gemini is used; fails if the other vendor appears anywhere in the repo.
const ROOT = join(__dirname, "..");
const SKIP = new Set(["node_modules", ".next", ".git", ".vercel"]);
// Patterns are assembled at runtime so this file itself never contains the banned strings.
const NAME = ["anth", "ropic"].join("");
const BANNED = [new RegExp(`@${NAME}-ai/`, "i"), new RegExp(`api\\.${NAME}\\.com`, "i"), new RegExp(NAME, "i")];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs|cjs|json|sql|md|yml|yaml|sh|py)$/.test(name)) out.push(p);
  }
  return out;
}

describe("no banned AI vendor SDK in the product", () => {
  it("has no references to the banned vendor SDK, API host or name", () => {
    const hits = walk(ROOT).filter((f) =>
      BANNED.some((re) => re.test(readFileSync(f, "utf8"))),
    );
    expect(hits).toEqual([]);
  });
});
