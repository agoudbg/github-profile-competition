import { describe, expect, it } from "vitest";
import { createSharePayload } from "@/lib/share";
import type { CompareResponse, UserDataset } from "@/lib/types";

function dataset(username: string): UserDataset {
  return {
    profile: {
      login: username,
      name: username,
      avatarUrl: `https://github.com/${username}.png`,
      htmlUrl: `https://github.com/${username}`,
      bio: null,
      company: null,
      location: null,
      blog: null,
      followers: 1,
      following: 0,
      publicRepos: 1,
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

function resultResponse(): CompareResponse {
  return {
    users: [dataset("alpha"), dataset("beta")],
    metrics: {
      accounts: [
        {
          username: "alpha",
          totalScore: 80,
          systemScore: 70,
          llmScore: 90,
          dimensions: [
            {
              key: "followers",
              label: "追随者",
              score: 72,
              rawValue: 12,
              detail: "detail"
            }
          ]
        },
        {
          username: "beta",
          totalScore: 72,
          systemScore: 70,
          llmScore: 74,
          dimensions: [
            {
              key: "followers",
              label: "追随者",
              score: 60,
              rawValue: 8,
              detail: "detail"
            }
          ]
        }
      ],
      radar: [],
      winner: {
        username: "alpha",
        margin: 8,
        reason: "alpha leads"
      }
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
    requestedAt: "2026-05-01T00:00:00.000Z"
  };
}

describe("share payload helpers", () => {
  it("creates a compact result payload with 30 day validity", () => {
    const payload = createSharePayload(resultResponse(), "https://example.com/?a=alpha&b=beta&share=1");

    expect(payload.pageUrl).toBe("https://example.com/?a=alpha&b=beta&share=1");
    expect(payload.expiresAt).toBe("2026-05-31T00:00:00.000Z");
    expect(payload.accounts[0]).toEqual({
      username: "alpha",
      avatarUrl: "https://github.com/alpha.png",
      totalScore: 80,
      systemScore: 70,
      llmScore: 90,
      dimensions: [
        {
          key: "followers",
          label: "追随者",
          score: 72
        }
      ]
    });
  });
});
