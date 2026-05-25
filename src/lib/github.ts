import { AppError } from "@/lib/errors";
import type {
  ContributionTimelineEntry,
  ContributionStats,
  GitHubProfile,
  GitHubRepository,
  ProfileContext,
  UserDataset
} from "@/lib/types";

const GITHUB_API_BASE = "https://api.github.com";
const MAX_REPO_PAGES = 3;
const PER_PAGE = 100;
const PUBLIC_CONTEXT_LIMIT = 1800;

type GitHubUserApiResponse = {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
  followers: number;
  following: number;
  public_repos: number;
  public_gists: number;
  created_at: string;
  updated_at: string;
};

type GitHubRepoApiResponse = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  fork: boolean;
  archived: boolean;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  size: number;
  pushed_at: string | null;
  updated_at: string;
  created_at: string;
};

type GitHubEventApiResponse = {
  id: string;
  type: string;
  created_at: string;
  repo?: {
    name?: string;
    url?: string;
  };
  payload: unknown;
};

type GraphQlContributionResponse = {
  data?: {
    user?: {
      contributionsCollection?: {
        contributionCalendar?: {
          totalContributions?: number;
          weeks?: Array<{
            contributionDays?: Array<{
              date?: string;
              contributionCount?: number;
            }>;
          }>;
        };
        pullRequestContributionsByRepository?: ContributionRepositoryConnection;
        issueContributionsByRepository?: ContributionRepositoryConnection;
        commitContributionsByRepository?: ContributionRepositoryConnection;
        pullRequestReviewContributionsByRepository?: ContributionRepositoryConnection;
      };
    };
  };
  errors?: Array<{ message?: string }>;
};

type ContributionRepositoryConnection = {
  contributions?: {
    totalCount?: number;
  };
};

type FetchOptions = {
  token?: string;
  accept?: string;
};

function githubHeaders({ token, accept = "application/vnd.github+json" }: FetchOptions): HeadersInit {
  const headers: HeadersInit = {
    Accept: accept,
    "User-Agent": "github-profile-competition",
    "X-GitHub-Api-Version": "2022-11-28"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function fetchGitHubJson<T>(path: string, token?: string): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    headers: githubHeaders({ token }),
    next: { revalidate: 300 }
  });

  if (response.ok) {
    return (await response.json()) as T;
  }

  if (response.status === 404) {
    throw new AppError("github_user_not_found", "GitHub user was not found.", 404);
  }

  if (response.status === 403 || response.status === 429) {
    throw new AppError(
      "github_rate_limited",
      "GitHub API rate limit was reached. Add GITHUB_TOKEN and try again.",
      429
    );
  }

  throw new AppError("github_request_failed", `GitHub request failed with status ${response.status}.`, 502);
}

function mapProfile(input: GitHubUserApiResponse): GitHubProfile {
  return {
    login: input.login,
    name: input.name,
    avatarUrl: input.avatar_url,
    htmlUrl: input.html_url,
    bio: input.bio,
    company: input.company,
    location: input.location,
    blog: input.blog,
    followers: input.followers,
    following: input.following,
    publicRepos: input.public_repos,
    publicGists: input.public_gists,
    createdAt: input.created_at,
    updatedAt: input.updated_at
  };
}

function mapRepository(input: GitHubRepoApiResponse): GitHubRepository {
  return {
    id: input.id,
    name: input.name,
    fullName: input.full_name,
    htmlUrl: input.html_url,
    description: input.description,
    fork: input.fork,
    archived: input.archived,
    language: input.language,
    stargazersCount: input.stargazers_count,
    forksCount: input.forks_count,
    watchersCount: input.watchers_count,
    openIssuesCount: input.open_issues_count,
    size: input.size,
    pushedAt: input.pushed_at,
    updatedAt: input.updated_at,
    createdAt: input.created_at
  };
}

async function fetchRepositories(username: string, token?: string): Promise<GitHubRepository[]> {
  const pages = Array.from({ length: MAX_REPO_PAGES }, (_, index) => index + 1);
  const repositories: GitHubRepository[] = [];

  for (const page of pages) {
    const items = await fetchGitHubJson<GitHubRepoApiResponse[]>(
      `/users/${encodeURIComponent(username)}/repos?per_page=${PER_PAGE}&page=${page}&sort=updated&type=owner`,
      token
    );

    repositories.push(...items.map(mapRepository));

    if (items.length < PER_PAGE) {
      break;
    }
  }

  return repositories;
}

async function fetchPublicEvents(username: string, token?: string): Promise<GitHubEventApiResponse[]> {
  try {
    return await fetchGitHubJson<GitHubEventApiResponse[]>(
      `/users/${encodeURIComponent(username)}/events/public?per_page=${PER_PAGE}`,
      token
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "github_rate_limited") {
      throw error;
    }

    return [];
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function countPushCommits(payload: unknown): number {
  const commits = asRecord(payload).commits;
  return Array.isArray(commits) ? commits.length : 0;
}

function eventTypeToTimelineType(type: string): ContributionTimelineEntry["type"] {
  if (type === "PushEvent") {
    return "commit";
  }

  if (type === "PullRequestEvent") {
    return "pull_request";
  }

  if (type === "IssuesEvent") {
    return "issue";
  }

  if (type === "PullRequestReviewEvent") {
    return "review";
  }

  return "event";
}

function eventTitle(event: GitHubEventApiResponse): string {
  const payload = asRecord(event.payload);
  const action = typeof payload.action === "string" ? payload.action : "updated";

  if (event.type === "PushEvent") {
    return `Pushed ${countPushCommits(event.payload)} commit(s)`;
  }

  if (event.type === "PullRequestEvent") {
    const pullRequest = asRecord(payload.pull_request);
    return `${action} PR: ${String(pullRequest.title ?? "Untitled pull request")}`;
  }

  if (event.type === "IssuesEvent") {
    const issue = asRecord(payload.issue);
    return `${action} issue: ${String(issue.title ?? "Untitled issue")}`;
  }

  if (event.type === "PullRequestReviewEvent") {
    const review = asRecord(payload.review);
    return `${action} review: ${String(review.state ?? "reviewed")}`;
  }

  return event.type;
}

function eventUrl(event: GitHubEventApiResponse): string | null {
  const payload = asRecord(event.payload);
  const pullRequest = asRecord(payload.pull_request);
  const issue = asRecord(payload.issue);
  const review = asRecord(payload.review);
  const htmlUrl = pullRequest.html_url ?? issue.html_url ?? review.html_url;

  return typeof htmlUrl === "string" ? htmlUrl : null;
}

export function buildContributionTimelineFromEvents(events: GitHubEventApiResponse[]): ContributionTimelineEntry[] {
  return events.slice(0, 80).map((event) => ({
    id: event.id,
    date: event.created_at,
    type: eventTypeToTimelineType(event.type),
    title: eventTitle(event),
    repository: event.repo?.name ?? null,
    url: eventUrl(event),
    summary: `${event.type}${event.repo?.name ? ` in ${event.repo.name}` : ""}`
  }));
}

export function deriveContributionStatsFromEvents(events: GitHubEventApiResponse[]): ContributionStats {
  const activeDays = new Set(events.map((event) => event.created_at.slice(0, 10))).size;
  const commits = events.reduce((total, event) => {
    if (event.type !== "PushEvent") {
      return total;
    }

    return total + countPushCommits(event.payload);
  }, 0);
  const pullRequests = events.filter((event) => event.type === "PullRequestEvent").length;
  const issues = events.filter((event) => event.type === "IssuesEvent").length;
  const reviews = events.filter((event) => event.type === "PullRequestReviewEvent").length;

  return {
    source: events.length > 0 ? "events" : "unavailable",
    confidence: events.length > 0 ? "medium" : "low",
    totalContributions: commits + pullRequests + issues + reviews,
    commits,
    pullRequests,
    issues,
    reviews,
    recentEvents: events.length,
    activeDays
  };
}

async function fetchGraphQlContributionStats(username: string, token: string | undefined): Promise<ContributionStats | null> {
  if (!token) {
    return null;
  }

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      ...githubHeaders({ token }),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: `
        query ProfileCompetitionContributions($login: String!) {
          user(login: $login) {
            contributionsCollection {
              contributionCalendar {
                totalContributions
                weeks {
                  contributionDays {
                    date
                    contributionCount
                  }
                }
              }
              pullRequestContributionsByRepository(maxRepositories: 20) {
                contributions {
                  totalCount
                }
              }
              issueContributionsByRepository(maxRepositories: 20) {
                contributions {
                  totalCount
                }
              }
              commitContributionsByRepository(maxRepositories: 20) {
                contributions {
                  totalCount
                }
              }
              pullRequestReviewContributionsByRepository(maxRepositories: 20) {
                contributions {
                  totalCount
                }
              }
            }
          }
        }
      `,
      variables: { login: username }
    }),
    next: { revalidate: 900 }
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as GraphQlContributionResponse;
  const collection = payload.data?.user?.contributionsCollection;

  if (!collection || payload.errors?.length) {
    return null;
  }

  const calendar = collection.contributionCalendar;
  const activeDays =
    calendar?.weeks?.reduce((total, week) => {
      const activeInWeek =
        week.contributionDays?.filter((day) => Number(day.contributionCount ?? 0) > 0).length ?? 0;
      return total + activeInWeek;
    }, 0) ?? 0;

  const commits = collection.commitContributionsByRepository?.contributions?.totalCount ?? 0;
  const pullRequests = collection.pullRequestContributionsByRepository?.contributions?.totalCount ?? 0;
  const issues = collection.issueContributionsByRepository?.contributions?.totalCount ?? 0;
  const reviews = collection.pullRequestReviewContributionsByRepository?.contributions?.totalCount ?? 0;

  return {
    source: "graphql",
    confidence: "high",
    totalContributions: calendar?.totalContributions ?? commits + pullRequests + issues + reviews,
    commits,
    pullRequests,
    issues,
    reviews,
    recentEvents: 0,
    activeDays
  };
}

function decodeEntities(input: string): string {
  return input
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

function extractProfileContext(html: string): ProfileContext {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const text = decodeEntities(withoutScripts.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  const topRepositoryHints = Array.from(html.matchAll(/data-hovercard-url="\/([^/"]+\/[^/"]+)\/hovercard"/g))
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value))
    .slice(0, 8);

  return {
    summary: text.slice(0, PUBLIC_CONTEXT_LIMIT),
    extractedFromHtml: true,
    topRepositoryHints: Array.from(new Set(topRepositoryHints))
  };
}

async function fetchProfileContext(username: string): Promise<ProfileContext> {
  try {
    const response = await fetch(`https://github.com/${encodeURIComponent(username)}`, {
      headers: githubHeaders({ accept: "text/html" }),
      next: { revalidate: 900 }
    });

    if (!response.ok) {
      return {
        summary: "",
        extractedFromHtml: false,
        topRepositoryHints: []
      };
    }

    return extractProfileContext(await response.text());
  } catch {
    return {
      summary: "",
      extractedFromHtml: false,
      topRepositoryHints: []
    };
  }
}

function buildLanguageDistribution(repositories: GitHubRepository[]): Record<string, number> {
  return repositories.reduce<Record<string, number>>((distribution, repository) => {
    if (!repository.language) {
      return distribution;
    }

    const weight = Math.max(1, repository.stargazersCount + repository.forksCount + 1);
    distribution[repository.language] = (distribution[repository.language] ?? 0) + weight;
    return distribution;
  }, {});
}

export async function collectGitHubUserDataset(username: string): Promise<UserDataset> {
  const token = process.env.GITHUB_TOKEN;
  const profilePromise = fetchGitHubJson<GitHubUserApiResponse>(`/users/${encodeURIComponent(username)}`, token);
  const repositoriesPromise = fetchRepositories(username, token);
  const eventsPromise = fetchPublicEvents(username, token);
  const graphQlContributionPromise = fetchGraphQlContributionStats(username, token);
  const profileContextPromise = fetchProfileContext(username);

  const [profileResponse, repositories, events, graphQlContribution, context] = await Promise.all([
    profilePromise,
    repositoriesPromise,
    eventsPromise,
    graphQlContributionPromise,
    profileContextPromise
  ]);

  return {
    profile: mapProfile(profileResponse),
    repositories,
    contributions: graphQlContribution ?? deriveContributionStatsFromEvents(events),
    contributionTimeline: buildContributionTimelineFromEvents(events),
    context,
    languageDistribution: buildLanguageDistribution(repositories),
    fetchedAt: new Date().toISOString()
  };
}
