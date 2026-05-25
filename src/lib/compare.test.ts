import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import type { ComparisonMetrics, UserDataset } from "@/lib/types";

vi.mock("@/lib/github", () => ({
  collectGitHubUserDataset: vi.fn()
}));

vi.mock("@/lib/llm", () => ({
  generateLlmAnalysis: vi.fn()
}));

vi.mock("@/lib/scoring", () => ({
  calculateComparisonMetrics: vi.fn(),
  composeComparisonMetricsWithLlmScores: vi.fn((metrics: ComparisonMetrics) => metrics)
}));

vi.mock("@/lib/leaderboard", () => ({
  saveLeaderboardScores: vi.fn()
}));

const { compareGitHubProfiles } = await import("@/lib/compare");
const { collectGitHubUserDataset } = await import("@/lib/github");
const { generateLlmAnalysis } = await import("@/lib/llm");
const { calculateComparisonMetrics } = await import("@/lib/scoring");

const collectGitHubUserDatasetMock = vi.mocked(collectGitHubUserDataset);
const generateLlmAnalysisMock = vi.mocked(generateLlmAnalysis);
const calculateComparisonMetricsMock = vi.mocked(calculateComparisonMetrics);

function dataset(username: string): UserDataset {
  return {
    profile: {
      login: username,
      name: null,
      avatarUrl: `https://github.com/${username}.png`,
      htmlUrl: `https://github.com/${username}`,
      bio: null,
      company: null,
      location: null,
      blog: null,
      followers: 0,
      following: 0,
      publicRepos: 0,
      publicGists: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    repositories: [],
    contributions: {
      source: "unavailable",
      confidence: "low",
      totalContributions: 0,
      commits: 0,
      pullRequests: 0,
      issues: 0,
      reviews: 0,
      recentEvents: 0,
      activeDays: 0
    },
    contributionTimeline: [],
    context: {
      summary: "",
      extractedFromHtml: false,
      topRepositoryHints: []
    },
    languageDistribution: {},
    fetchedAt: "2026-01-01T00:00:00.000Z"
  };
}

describe("compareGitHubProfiles", () => {
  it("emits safe timeline details when LLM generation fails", async () => {
    const metrics: ComparisonMetrics = {
      accounts: [],
      radar: [],
      winner: null
    };
    const leakedProviderMessage =
      "LLM request failed with status 401. Provider response: Incorrect API key provided: sk-or-v1-secret.";
    const events: Array<{ phase: string; detail: string }> = [];

    collectGitHubUserDatasetMock.mockImplementation(async (username) => dataset(username));
    calculateComparisonMetricsMock.mockReturnValue(metrics);
    generateLlmAnalysisMock.mockRejectedValue(new AppError("llm_request_failed", leakedProviderMessage, 502));

    await expect(
      compareGitHubProfiles({ users: ["alpha", "beta"] }, (event) => {
        events.push({
          phase: event.phase,
          detail: event.detail
        });
      })
    ).rejects.toThrow(leakedProviderMessage);

    const errorEvent = events.find((event) => event.phase === "error");

    expect(errorEvent?.detail).toBe("Analysis failed. Please try again later.");
    expect(errorEvent?.detail).not.toContain("Provider response");
    expect(errorEvent?.detail).not.toContain("sk-or-v1-secret");
  });
});
