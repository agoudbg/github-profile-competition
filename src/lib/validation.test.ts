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
    expect(() => parseCompareRequest({ users: ["agou", "AGOU"] })).toThrow("请对比两个不同的");
  });

  it("localizes validation messages from the requested locale", () => {
    expect(() => parseCompareRequest({ users: ["agou", "AGOU"], locale: "en-US" })).toThrow(
      "Please compare two different GitHub usernames."
    );
  });

  it("rejects invalid GitHub usernames", () => {
    expect(() => parseCompareRequest({ users: ["-bad", "valid-user"] })).toThrow("不能以连字符开头或结尾");
    expect(() => parseCompareRequest({ users: ["bad_user", "valid-user"] })).toThrow("只能包含字母");
  });
});
