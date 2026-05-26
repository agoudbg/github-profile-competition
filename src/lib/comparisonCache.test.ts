import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  COMPARISON_CACHE_SYSTEM_VERSION,
  persistComparisonResultToCache,
  readCachedComparisonResult,
  resetComparisonCacheForTests
} from "@/lib/comparisonCache";
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

function mockCompareResponse(): CompareResponse {
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
              score: 80,
              rawValue: 1,
              detail: "alpha followers"
            }
          ]
        },
        {
          username: "beta",
          totalScore: 70,
          systemScore: 68,
          llmScore: 72,
          dimensions: [
            {
              key: "followers",
              label: "追随者",
              score: 70,
              rawValue: 1,
              detail: "beta followers"
            }
          ]
        }
      ],
      radar: [
        {
          dimension: "追随者",
          key: "followers",
          alpha: 80,
          beta: 70
        }
      ],
      winner: {
        username: "alpha",
        margin: 10,
        reason: "alpha wins"
      }
    },
    llm: {
      status: "generated",
      analysis: {
        summary: "cached summary",
        winner: {
          username: "alpha",
          reason: "alpha wins",
          confidence: "high"
        },
        accountScores: [
          {
            username: "alpha",
            score: 90,
            reason: "alpha score"
          },
          {
            username: "beta",
            score: 72,
            reason: "beta score"
          }
        ],
        dimensionInsights: [
          {
            dimension: "followers",
            title: "追随者",
            accounts: [
              {
                username: "alpha",
                insight: "alpha insight"
              },
              {
                username: "beta",
                insight: "beta insight"
              }
            ],
            verdict: "alpha leads"
          }
        ],
        accountAnalyses: [
          {
            username: "alpha",
            strengths: ["alpha strength"],
            risks: [],
            recommendations: []
          },
          {
            username: "beta",
            strengths: ["beta strength"],
            risks: [],
            recommendations: []
          }
        ],
        caveats: [],
        sources: []
      }
    },
    timeline: [],
    locale: "zh-CN",
    requestedAt: "2026-05-25T00:00:00.000Z"
  };
}

describe("comparisonCache", () => {
  beforeEach(() => {
    process.env.COMPARISON_CACHE_DATABASE_PATH = ":memory:";
    resetComparisonCacheForTests();
  });

  afterEach(() => {
    resetComparisonCacheForTests();
    delete process.env.COMPARISON_CACHE_DATABASE_PATH;
  });

  it("reads a saved comparison as an unordered username pair", () => {
    const cachedAt = new Date("2026-05-25T08:00:00.000Z");

    persistComparisonResultToCache({ users: ["Alpha", "beta"], locale: "zh-CN" }, mockCompareResponse(), cachedAt);

    const cachedResult = readCachedComparisonResult(
      { users: ["BETA", "alpha"], locale: "zh-CN" },
      new Date("2026-05-26T08:00:00.000Z")
    );

    expect(cachedResult?.llm.analysis.summary).toBe("cached summary");
    expect(cachedResult?.users.map((user) => user.profile.login)).toEqual(["beta", "alpha"]);
    expect(cachedResult?.metrics.accounts.map((account) => account.username)).toEqual(["beta", "alpha"]);
    expect(cachedResult?.metrics.radar[0]).toEqual({
      dimension: "追随者",
      key: "followers",
      beta: 70,
      alpha: 80
    });
    expect(cachedResult?.llm.analysis.accountScores.map((account) => account.username)).toEqual(["beta", "alpha"]);
    expect(cachedResult?.llm.analysis.dimensionInsights[0]?.accounts.map((account) => account.username)).toEqual([
      "beta",
      "alpha"
    ]);
    expect(cachedResult?.llm.analysis.accountAnalyses.map((account) => account.username)).toEqual(["beta", "alpha"]);
    expect(cachedResult?.cache).toEqual({
      hit: true,
      cachedAt: "2026-05-25T08:00:00.000Z"
    });
  });

  it("expires saved comparisons after 30 days", () => {
    persistComparisonResultToCache(
      { users: ["alpha", "beta"], locale: "zh-CN" },
      mockCompareResponse(),
      new Date("2026-05-01T00:00:00.000Z")
    );

    expect(
      readCachedComparisonResult(
        { users: ["alpha", "beta"], locale: "zh-CN" },
        new Date("2026-05-31T00:00:00.001Z")
      )
    ).toBeNull();
  });

  it("ignores cached comparisons from older system versions", () => {
    const databaseDirectory = mkdtempSync(join(tmpdir(), "comparison-cache-test-"));
    const databasePath = join(databaseDirectory, "cache.sqlite");
    process.env.COMPARISON_CACHE_DATABASE_PATH = databasePath;
    resetComparisonCacheForTests();

    persistComparisonResultToCache(
      { users: ["alpha", "beta"], locale: "zh-CN" },
      mockCompareResponse(),
      new Date("2026-05-25T08:00:00.000Z")
    );

    resetComparisonCacheForTests();

    const database = new DatabaseSync(databasePath);
    try {
      database
        .prepare("UPDATE comparison_result_cache SET comparison_system_version = ?")
        .run(COMPARISON_CACHE_SYSTEM_VERSION - 1);
    } finally {
      database.close();
    }

    expect(
      readCachedComparisonResult(
        { users: ["alpha", "beta"], locale: "zh-CN" },
        new Date("2026-05-26T08:00:00.000Z")
      )
    ).toBeNull();

    resetComparisonCacheForTests();
    rmSync(databaseDirectory, { recursive: true, force: true });
  });
});
