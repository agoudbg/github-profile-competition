import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetAbuseProtectionForTests } from "@/lib/abuse";

vi.mock("@/lib/compare", () => ({
  compareGitHubProfiles: vi.fn()
}));

const { compareGitHubProfiles } = await import("@/lib/compare");
const { POST } = await import("./route");

const compareGitHubProfilesMock = vi.mocked(compareGitHubProfiles);

function compareRequest(ip = "203.0.113.10", body: unknown = { users: ["alpha", "beta"], locale: "zh-CN" }): Request {
  return new Request("https://example.test/api/compare", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip
    },
    body: JSON.stringify(body)
  });
}

function mockCompareResponse() {
  return {
    users: [],
    metrics: {
      accounts: [],
      radar: [],
      winner: null
    },
    llm: {
      status: "generated" as const,
      analysis: {
        summary: "",
        winner: null,
        accountScores: [],
        dimensionInsights: [],
        accountAnalyses: [],
        caveats: [],
        sources: []
      }
    },
    timeline: [],
    locale: "zh-CN" as const,
    requestedAt: "2026-05-25T00:00:00.000Z"
  };
}

describe("/api/compare", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAbuseProtectionForTests();
    process.env.ABUSE_PROTECTION_ENABLED = "true";
    process.env.ABUSE_RATE_LIMIT_WINDOW_SECONDS = "900";
    process.env.ABUSE_RATE_LIMIT_MAX = "1";
    process.env.ABUSE_CONCURRENT_MAX = "1";
    process.env.ABUSE_LIMIT_SALT = "route-test-salt";
    compareGitHubProfilesMock.mockResolvedValue(mockCompareResponse());
  });

  it("returns a rate limit error with Retry-After after the client limit is reached", async () => {
    expect((await POST(compareRequest())).status).toBe(200);

    const response = await POST(compareRequest());
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");
    expect(body).toEqual({
      error: {
        code: "rate_limited",
        message: "Too many comparison requests. Please try again later.",
        status: 429
      }
    });
    expect(compareGitHubProfilesMock).toHaveBeenCalledTimes(1);
  });

  it("does not consume rate limit capacity for invalid requests", async () => {
    const invalidResponse = await POST(compareRequest("203.0.113.10", { users: ["same", "SAME"], locale: "zh-CN" }));

    expect(invalidResponse.status).toBe(400);

    const validResponse = await POST(compareRequest());

    expect(validResponse.status).toBe(200);
    expect(compareGitHubProfilesMock).toHaveBeenCalledTimes(1);
  });
});
