import { describe, expect, it } from "vitest";
import { checkGrounded } from "../src/lib/writer";

const facts = (o: unknown) => {
  const s = JSON.stringify(o);
  return { corpus: s.toLowerCase(), numbers: new Set(s.match(/\d+(?:\.\d+)?/g) ?? []) };
};

describe("brief writer grounding check", () => {
  const f = facts({ name: "Asha Rao", company: "Zepto", india_shows: 3, shows: ["The Neon Show", "Founder Thesis", "Paisa Vaisa"] });

  it("accepts lines that only use the item's names and counts", () => {
    expect(checkGrounded("Asha Rao of Zepto hit 3 India shows in a month — book before rivals do.", f)).toBeNull();
  });
  it("rejects an invented person or company", () => {
    expect(checkGrounded("Asha Rao, ex-Swiggy, is everywhere this week.", f)).toMatch(/Swiggy/);
  });
  it("rejects a number that is not in the facts", () => {
    expect(checkGrounded("On 5 shows this month.", f)).toMatch(/5/);
    expect(checkGrounded("On five shows this month.", f)).toMatch(/five/);
  });
});
