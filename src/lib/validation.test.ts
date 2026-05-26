import { describe, expect, it } from "vitest";
import { parseCompareRequest } from "@/lib/validation";

describe("parseCompareRequest", () => {
  it("normalizes a valid two-user request", () => {
    expect(parseCompareRequest({ users: [" torvalds ", "gaearon"], locale: "zh-CN" })).toEqual({
      users: ["torvalds", "gaearon"],
      locale: "zh-CN",
      forceRefresh: false
    });
  });

  it("accepts an explicit cache bypass flag", () => {
    expect(parseCompareRequest({ users: ["torvalds", "gaearon"], locale: "zh-CN", forceRefresh: true })).toEqual({
      users: ["torvalds", "gaearon"],
      locale: "zh-CN",
      forceRefresh: true
    });
  });

  it("rejects unsupported locales", () => {
    expect(() => parseCompareRequest({ users: ["torvalds", "gaearon"], locale: "fr-FR" })).toThrow();
  });

  it("rejects duplicate users", () => {
    expect(() => parseCompareRequest({ users: ["agou", "AGOU"] })).toThrow("Please compare two different");
  });

  it("rejects invalid GitHub usernames", () => {
    expect(() => parseCompareRequest({ users: ["-bad", "valid-user"] })).toThrow("cannot start or end");
    expect(() => parseCompareRequest({ users: ["bad_user", "valid-user"] })).toThrow("can only contain");
  });
});
