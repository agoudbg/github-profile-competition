import { beforeEach, describe, expect, it } from "vitest";
import {
  getLeaderboardPage,
  persistLeaderboardScores,
  resetLeaderboardForTests
} from "@/lib/leaderboard";
import type { AccountScore, GitHubProfile, UserDataset } from "@/lib/types";

function profile(username: string): GitHubProfile {
  return {
    login: username,
    name: `${username} name`,
    avatarUrl: "https://avatars.githubusercontent.com/u/1",
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
  };
}

function dataset(username: string): UserDataset {
  return {
    profile: profile(username),
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

function account(username: string, totalScore: number): AccountScore {
  return {
    username,
    totalScore,
    systemScore: totalScore,
    llmScore: null,
    dimensions: [
      {
        key: "followers",
        label: "追随者",
        score: totalScore,
        rawValue: totalScore,
        detail: "Test detail."
      }
    ]
  };
}

describe("leaderboard persistence", () => {
  beforeEach(() => {
    resetLeaderboardForTests();
    process.env.LEADERBOARD_DATABASE_PATH = ":memory:";
  });

  it("keeps historical snapshots but ranks users by their latest snapshot", () => {
    persistLeaderboardScores(
      [dataset("alpha"), dataset("beta")],
      [account("alpha", 20), account("beta", 80)],
      new Date("2026-05-25T00:00:00.000Z")
    );
    persistLeaderboardScores(
      [dataset("alpha")],
      [account("alpha", 90)],
      new Date("2026-05-26T00:00:00.000Z")
    );

    const page = getLeaderboardPage(1);

    expect(page.entries.map((entry) => entry.username)).toEqual(["alpha", "beta"]);
    expect(page.entries[0]).toMatchObject({
      rank: 1,
      username: "alpha",
      totalScore: 90,
      updatedAt: "2026-05-26T00:00:00.000Z"
    });
    expect(page.entries[1]).toMatchObject({
      rank: 2,
      username: "beta",
      totalScore: 80
    });
    expect(page.entries[0]?.dimensions[0]).toMatchObject({
      key: "followers",
      score: 90,
      rawValue: 90
    });
  });
});
