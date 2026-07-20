import { describe, expect, it } from "vitest";
import { titleFromPrompt } from "@/lib/utils";

describe("titleFromPrompt", () => {
  it("normalizes and truncates long prompts", () => {
    expect(titleFromPrompt(`  ${"a".repeat(70)}  `)).toHaveLength(52);
  });
  it("returns a useful default", () =>
    expect(titleFromPrompt("   ")).toBe("New conversation"));
});
