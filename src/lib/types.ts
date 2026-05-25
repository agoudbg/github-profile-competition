export type LocaleCode = "zh-CN" | "en-US";

export type CompareRequest = {
  users: [string, string];
  locale?: LocaleCode;
};

export type GitHubProfile = {
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
  followers: number;
  following: number;
  publicRepos: number;
  publicGists: number;
  createdAt: string;
  updatedAt: string;
};

export type GitHubRepository = {
  id: number;
  name: string;
  fullName: string;
  htmlUrl: string;
  description: string | null;
  fork: boolean;
  archived: boolean;
  language: string | null;
  stargazersCount: number;
  forksCount: number;
  watchersCount: number;
  openIssuesCount: number;
  size: number;
  pushedAt: string | null;
  updatedAt: string;
  createdAt: string;
};

export type ContributionTimelineEntry = {
  id: string;
  date: string;
  type: "commit" | "pull_request" | "issue" | "review" | "event";
  title: string;
  repository: string | null;
  url: string | null;
  summary: string;
};

export type ContributionStats = {
  source: "graphql" | "events" | "unavailable";
  confidence: "high" | "medium" | "low";
  totalContributions: number;
  commits: number;
  pullRequests: number;
  issues: number;
  reviews: number;
  recentEvents: number;
  activeDays: number;
};

export type ProfileContext = {
  summary: string;
  extractedFromHtml: boolean;
  topRepositoryHints: string[];
};

export type UserDataset = {
  profile: GitHubProfile;
  repositories: GitHubRepository[];
  contributions: ContributionStats;
  contributionTimeline: ContributionTimelineEntry[];
  context: ProfileContext;
  languageDistribution: Record<string, number>;
  fetchedAt: string;
};

export type DimensionKey =
  | "followers"
  | "repositories"
  | "projectImpact"
  | "openSourceContribution"
  | "activityAndConsistency";

export type ScoreDimension = {
  key: DimensionKey;
  label: string;
  score: number;
  rawValue: number;
  detail: string;
};

export type AccountScore = {
  username: string;
  totalScore: number;
  systemScore: number;
  llmScore: number | null;
  dimensions: ScoreDimension[];
};

export type WinnerResult = {
  username: string;
  margin: number;
  reason: string;
} | null;

export type RadarPoint = {
  dimension: string;
  key: DimensionKey;
  [username: string]: string | number;
};

export type ComparisonMetrics = {
  accounts: AccountScore[];
  radar: RadarPoint[];
  winner: WinnerResult;
};

export type LlmAnalysis = {
  summary: string;
  winner: {
    username: string;
    reason: string;
    confidence: "high" | "medium" | "low";
  } | null;
  accountScores: Array<{
    username: string;
    score: number;
    reason: string;
  }>;
  dimensionInsights: Array<{
    dimension: DimensionKey;
    title: string;
    accounts: Array<{
      username: string;
      insight: string;
    }>;
    verdict: string;
  }>;
  accountAnalyses: Array<{
    username: string;
    strengths: string[];
    risks: string[];
    recommendations: string[];
  }>;
  caveats: string[];
  sources: Array<{
    id: string;
    label: string;
    url: string;
    note: string;
  }>;
};

export type LlmStatus = "generated";

export type LlmResult = {
  status: LlmStatus;
  analysis: LlmAnalysis;
};

export type CompareResponse = {
  users: UserDataset[];
  metrics: ComparisonMetrics;
  llm: LlmResult;
  timeline: ModelTimelineEvent[];
  locale: LocaleCode;
  requestedAt: string;
};

export type ModelTimelineEvent = {
  id: string;
  at: string;
  phase: "data" | "model" | "tool_call" | "tool_result" | "final" | "error";
  title: string;
  detail: string;
  status: "running" | "completed" | "error";
  toolName?: string;
  url?: string;
  sourceIds?: string[];
};

export type ModelTimelineEventInput = Omit<ModelTimelineEvent, "id" | "at">;

export type TimelineEmitter = (event: ModelTimelineEventInput) => void | Promise<void>;

export type CompareStreamEvent =
  | {
      type: "timeline";
      event: ModelTimelineEvent;
    }
  | {
      type: "result";
      result: CompareResponse;
    }
  | {
      type: "error";
      error: ApiErrorResponse["error"];
    };

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
    status: number;
  };
};
