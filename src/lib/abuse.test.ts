import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AbuseProtectionError,
  getAbuseProtectionKeysForTests,
  guardCompareRequest,
  resetAbuseProtectionForTests
} from "@/lib/abuse";

const compareRequest = {
  users: ["alpha", "beta"],
  locale: "zh-CN"
};

function requestForIp(ip: string): Request {
  return new Request("https://example.test/api/compare", {
    method: "POST",
    headers: {
      "x-forwarded-for": ip
    },
    body: JSON.stringify(compareRequest)
  });
}

describe("guardCompareRequest", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-25T00:00:00.000Z"));
    resetAbuseProtectionForTests();
    process.env.ABUSE_PROTECTION_ENABLED = "true";
    process.env.ABUSE_RATE_LIMIT_WINDOW_SECONDS = "60";
    process.env.ABUSE_RATE_LIMIT_MAX = "2";
    process.env.ABUSE_CONCURRENT_MAX = "1";
    process.env.ABUSE_LIMIT_SALT = "test-salt";
  });

  afterEach(() => {
    vi.useRealTimers();
    resetAbuseProtectionForTests();
    delete process.env.ABUSE_PROTECTION_ENABLED;
    delete process.env.ABUSE_RATE_LIMIT_WINDOW_SECONDS;
    delete process.env.ABUSE_RATE_LIMIT_MAX;
    delete process.env.ABUSE_CONCURRENT_MAX;
    delete process.env.ABUSE_LIMIT_SALT;
  });

  it("rejects the same client after the fixed-window limit is reached", () => {
    guardCompareRequest(requestForIp("203.0.113.10"))();
    guardCompareRequest(requestForIp("203.0.113.10"))();

    expect(() => guardCompareRequest(requestForIp("203.0.113.10"))).toThrow(AbuseProtectionError);

    try {
      guardCompareRequest(requestForIp("203.0.113.10"));
    } catch (error) {
      expect(error).toMatchObject({
        code: "rate_limited",
        status: 429,
        retryAfterSeconds: 60
      });
    }
  });

  it("allows a client again after the fixed window expires", () => {
    guardCompareRequest(requestForIp("203.0.113.10"))();
    guardCompareRequest(requestForIp("203.0.113.10"))();

    vi.advanceTimersByTime(60_001);

    expect(() => guardCompareRequest(requestForIp("203.0.113.10"))()).not.toThrow();
  });

  it("releases the concurrency guard when the returned callback is called", () => {
    const release = guardCompareRequest(requestForIp("203.0.113.10"));

    expect(() => guardCompareRequest(requestForIp("203.0.113.10"))).toThrow(
      "A comparison is already running"
    );

    release();

    expect(() => guardCompareRequest(requestForIp("203.0.113.10"))()).not.toThrow();
  });

  it("tracks different clients independently", () => {
    const releaseFirst = guardCompareRequest(requestForIp("203.0.113.10"));

    expect(() => guardCompareRequest(requestForIp("198.51.100.20"))()).not.toThrow();

    releaseFirst();
  });

  it("does not expose raw client IPs in stored keys", () => {
    guardCompareRequest(requestForIp("203.0.113.10"))();

    expect(getAbuseProtectionKeysForTests()).not.toEqual(expect.arrayContaining([expect.stringContaining("203.0.113.10")]));
  });
});
