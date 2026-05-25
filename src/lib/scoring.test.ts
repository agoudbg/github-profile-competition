import { describe, expect, it } from "vitest";
import { calculateComparisonMetrics, composeComparisonMetricsWithLlmScores, logScaleScore } from "@/lib/scoring";
import type { GitHubRepository, UserDataset } from "@/lib/types";

function repository(overrides: Partial<GitHubRepository>): GitHubRepository {
  return {
    id: 1,
    name: "repo",
    fullName: "user/repo",
    htmlUrl: "https://github.com/user/repo",
    description: null,
    fork: false,
    archived: false,
    language: "TypeScript",
    stargazersCount: 0,
    forksCount: 0,
    watchersCount: 0,
    openIssuesCount: 0,
    size: 1,
    pushedAt: "2026-05-01T00:00:00Z",
    updatedAt: "2026-05-01T00:00:00Z",
    createdAt: "2025-01-01T00:00:00Z",
    ...overrides
  };
}

function dataset(username: string, overrides: Partial<UserDataset>): UserDataset {
  return {
    profile: {
      login: username,
      name: username,
      avatarUrl: "https://avatars.githubusercontent.com/u/1",
      htmlUrl: `https://github.com/${username}`,
      bio: null,
      company: null,
      location: null,
      blog: null,
      followers: 10,
      following: 1,
      publicRepos: 2,
      publicGists: 0,
      createdAt: "2020-01-01T00:00:00Z",
      updatedAt: "2026-05-01T00:00:00Z"
    },
    repositories: [repository({ id: 1 })],
    contributions: {
      source: "events",
      confidence: "medium",
      totalContributions: 10,
      commits: 8,
      pullRequests: 1,
      issues: 1,
      reviews: 0,
      recentEvents: 4,
      activeDays: 2
    },
    contributionTimeline: [],
    context: {
      summary: "",
      extractedFromHtml: false,
      topRepositoryHints: []
    },
    languageDistribution: {
      TypeScript: 1
    },
    fetchedAt: "2026-05-25T00:00:00Z",
    ...overrides
  };
}

describe("logScaleScore", () => {
  it("keeps values in a 0 to 100 range", () => {
    expect(logScaleScore(0, 100)).toBe(0);
    expect(logScaleScore(100, 100)).toBe(100);
    expect(logScaleScore(10_000, 100)).toBe(100);
  });
});

describe("calculateComparisonMetrics", () => {
  it("creates scores, radar points, and a winner", () => {
    const metrics = calculateComparisonMetrics(
      [
        dataset("alpha", {
          profile: {
            ...dataset("alpha", {}).profile,
            followers: 20_000,
            publicRepos: 120
          },
          repositories: [
            repository({ id: 1, stargazersCount: 20_000, forksCount: 2_000, watchersCount: 400 }),
            repository({ id: 2, name: "tool", fullName: "alpha/tool", stargazersCount: 4_000, forksCount: 300 })
          ],
          contributions: {
            source: "graphql",
            confidence: "high",
            totalContributions: 8_000,
            commits: 6_000,
            pullRequests: 1_000,
            issues: 500,
            reviews: 500,
            recentEvents: 0,
            activeDays: 220
          }
        }),
        dataset("beta", {})
      ],
      "zh-CN",
      new Date("2026-05-25T00:00:00Z")
    );

    expect(metrics.accounts).toHaveLength(2);
    expect(metrics.radar).toHaveLength(5);
    expect(metrics.winner?.username).toBe("alpha");
    expect(metrics.accounts[0]?.totalScore).toBeGreaterThan(metrics.accounts[1]?.totalScore ?? 0);
    expect(metrics.accounts[0]?.totalScore).toBe(metrics.accounts[0]?.systemScore);
    expect(metrics.accounts[0]?.llmScore).toBeNull();
  });

  it("combines fixed system scores with LLM scores", () => {
    const metrics = calculateComparisonMetrics(
      [
        dataset("alpha", {
          profile: {
            ...dataset("alpha", {}).profile,
            followers: 20_000,
            publicRepos: 120
          },
          repositories: [
            repository({ id: 1, stargazersCount: 20_000, forksCount: 2_000, watchersCount: 400 }),
            repository({ id: 2, name: "tool", fullName: "alpha/tool", stargazersCount: 4_000, forksCount: 300 })
          ]
        }),
        dataset("beta", {})
      ],
      "zh-CN",
      new Date("2026-05-25T00:00:00Z")
    );

    const composed = composeComparisonMetricsWithLlmScores(metrics, [
      {
        username: "alpha",
        score: 40
      },
      {
        username: "beta",
        score: 100
      }
    ]);
    const alpha = composed.accounts.find((account) => account.username === "alpha");
    const beta = composed.accounts.find((account) => account.username === "beta");

    expect(alpha?.systemScore).toBe(metrics.accounts.find((account) => account.username === "alpha")?.systemScore);
    expect(alpha?.llmScore).toBe(40);
    expect(beta?.llmScore).toBe(100);
    expect(alpha?.totalScore).toBe(Math.round(((alpha?.systemScore ?? 0) + 40) / 2));
  });
});
