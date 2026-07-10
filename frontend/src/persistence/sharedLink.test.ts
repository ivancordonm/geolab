import { describe, expect, it } from "vitest";

import { readShareTokenFromLocation } from "./sharedLink";

describe("readShareTokenFromLocation", () => {
  it("returns the token when present", () => {
    expect(readShareTokenFromLocation({ search: "?share=abc123" })).toBe("abc123");
  });

  it("returns null when absent", () => {
    expect(readShareTokenFromLocation({ search: "" })).toBeNull();
    expect(readShareTokenFromLocation({ search: "?foo=1" })).toBeNull();
  });
});
