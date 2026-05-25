import { describe, expect, it } from "vitest";
import { deriveContributionStatsFromEvents } from "@/lib/github";

describe("deriveContributionStatsFromEvents", () => {
  it("counts public event contribution signals", () => {
    const stats = deriveContributionStatsFromEvents([
      {
        id: "1",
        type: "PushEvent",
        created_at: "2026-05-24T10:00:00Z",
        repo: { name: "alpha/project" },
        payload: {
          commits: [{ sha: "1" }, { sha: "2" }]
        }
      },
      {
        id: "2",
        type: "PullRequestEvent",
        created_at: "2026-05-24T11:00:00Z",
        payload: {}
      },
      {
        id: "3",
        type: "IssuesEvent",
        created_at: "2026-05-25T11:00:00Z",
        payload: {}
      },
      {
        id: "4",
        type: "PullRequestReviewEvent",
        created_at: "2026-05-25T12:00:00Z",
        payload: {}
      }
    ]);

    expect(stats).toMatchObject({
      source: "events",
      confidence: "medium",
      totalContributions: 5,
      commits: 2,
      pullRequests: 1,
      issues: 1,
      reviews: 1,
      recentEvents: 4,
      activeDays: 2
    });
  });

  it("returns a low-confidence result when public events are unavailable", () => {
    expect(deriveContributionStatsFromEvents([])).toMatchObject({
      source: "unavailable",
      confidence: "low",
      totalContributions: 0
    });
  });
});
