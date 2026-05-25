import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { collectGitHubUserDataset, deriveContributionStatsFromEvents } from "@/lib/github";

const originalFetch = globalThis.fetch;
const originalGitHubToken = process.env.GITHUB_TOKEN;

function githubJsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Forbidden",
    headers: {
      "content-type": "application/json",
      ...headers
    }
  });
}

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

describe("collectGitHubUserDataset", () => {
  beforeEach(() => {
    process.env.GITHUB_TOKEN = "test-token";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.GITHUB_TOKEN = originalGitHubToken;
    vi.restoreAllMocks();
  });

  it("preserves raw GitHub 403 details instead of classifying every 403 as rate limited", async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.includes("/users/octocat/repos")) {
        return githubJsonResponse(
          {
            message: "Resource protected by organization policy",
            documentation_url: "https://docs.github.com/rest"
          },
          403,
          {
            "x-github-request-id": "ABC:123",
            "x-ratelimit-limit": "5000",
            "x-ratelimit-remaining": "4999",
            "x-ratelimit-reset": "1780000000",
            "x-ratelimit-resource": "core"
          }
        );
      }

      if (url.includes("/users/octocat/events/public")) {
        return githubJsonResponse([]);
      }

      if (url.includes("/users/octocat")) {
        return githubJsonResponse({
          login: "octocat",
          name: "The Octocat",
          avatar_url: "https://github.com/images/error/octocat_happy.gif",
          html_url: "https://github.com/octocat",
          bio: null,
          company: null,
          location: null,
          blog: "",
          followers: 1,
          following: 0,
          public_repos: 1,
          public_gists: 0,
          created_at: "2011-01-25T18:44:36Z",
          updated_at: "2026-05-25T00:00:00Z"
        });
      }

      if (url.includes("/graphql")) {
        return githubJsonResponse({
          data: {
            user: {
              contributionsCollection: {
                contributionCalendar: {
                  totalContributions: 1,
                  weeks: [
                    {
                      contributionDays: [
                        {
                          date: "2026-05-25",
                          contributionCount: 1
                        }
                      ]
                    }
                  ]
                },
                pullRequestContributionsByRepository: {
                  contributions: {
                    totalCount: 0
                  }
                },
                issueContributionsByRepository: {
                  contributions: {
                    totalCount: 0
                  }
                },
                commitContributionsByRepository: {
                  contributions: {
                    totalCount: 1
                  }
                },
                pullRequestReviewContributionsByRepository: {
                  contributions: {
                    totalCount: 0
                  }
                }
              }
            }
          }
        });
      }

      return new Response("", { status: 200 });
    }) as typeof fetch;

    await expect(collectGitHubUserDataset("octocat")).rejects.toMatchObject({
      code: "github_request_forbidden",
      status: 403,
      detail: {
        request: {
          method: "GET",
          tokenPresent: true
        },
        response: {
          status: 403,
          githubMessage: "Resource protected by organization policy",
          documentationUrl: "https://docs.github.com/rest",
          headers: {
            "x-github-request-id": "ABC:123",
            "x-ratelimit-remaining": "4999"
          }
        }
      }
    } satisfies Partial<AppError>);
  });
});
