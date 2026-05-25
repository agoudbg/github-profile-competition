import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetAbuseProtectionForTests } from "@/lib/abuse";
import type { CompareResponse, CompareStreamEvent } from "@/lib/types";

vi.mock("@/lib/compare", () => ({
  compareGitHubProfiles: vi.fn()
}));

const { compareGitHubProfiles } = await import("@/lib/compare");
const { POST } = await import("./route");

const compareGitHubProfilesMock = vi.mocked(compareGitHubProfiles);

function compareRequest(ip = "203.0.113.10", body: unknown = { users: ["alpha", "beta"], locale: "zh-CN" }): Request {
  return new Request("https://example.test/api/compare/stream", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip
    },
    body: JSON.stringify(body)
  });
}

function mockCompareResponse(): CompareResponse {
  return {
    users: [],
    metrics: {
      accounts: [],
      radar: [],
      winner: null
    },
    llm: {
      status: "generated",
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
    locale: "zh-CN",
    requestedAt: "2026-05-25T00:00:00.000Z"
  };
}

async function readStreamEvents(response: Response): Promise<CompareStreamEvent[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CompareStreamEvent);
}

describe("/api/compare/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAbuseProtectionForTests();
    process.env.ABUSE_PROTECTION_ENABLED = "true";
    process.env.ABUSE_RATE_LIMIT_WINDOW_SECONDS = "900";
    process.env.ABUSE_RATE_LIMIT_MAX = "5";
    process.env.ABUSE_CONCURRENT_MAX = "1";
    process.env.ABUSE_LIMIT_SALT = "stream-route-test-salt";
  });

  it("returns a stream error event when the client already has a running comparison", async () => {
    let resolveCompare: (() => void) | undefined;

    compareGitHubProfilesMock.mockReturnValue(
      new Promise((resolve) => {
        resolveCompare = () => resolve(mockCompareResponse());
      })
    );

    const runningResponse = await POST(compareRequest());
    const blockedResponse = await POST(compareRequest());
    const blockedEvents = await readStreamEvents(blockedResponse);

    expect(blockedResponse.status).toBe(200);
    expect(blockedEvents).toEqual([
      {
        type: "error",
        error: {
          code: "too_many_concurrent_requests",
          message: "A comparison is already running. Please wait for it to finish.",
          status: 429
        }
      }
    ]);

    resolveCompare?.();
    await runningResponse.text();
  });
});
