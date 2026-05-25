import { z } from "zod";
import { AppError, logServerError, toErrorMessage } from "@/lib/errors";
import type {
  ComparisonMetrics,
  DimensionKey,
  LlmAnalysis,
  LlmResult,
  LocaleCode,
  TimelineEmitter,
  UserDataset
} from "@/lib/types";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const GITHUB_API_BASE = "https://api.github.com";
const MAX_TOOL_ROUNDS = 10;
const DEFAULT_MAX_TOTAL_TOOL_CALLS = 8;
const DEFAULT_LLM_REQUEST_TIMEOUT_MS = 300_000;
const MIN_LLM_REQUEST_TIMEOUT_MS = 30_000;
const MAX_LLM_REQUEST_TIMEOUT_MS = 900_000;
const TOOL_TEXT_LIMIT = 1_200;

type SystemScoreInput = Array<{
  username: string;
  totalScore: number;
  systemScore?: number;
}>;

const dimensionKeySchema = z.enum([
  "followers",
  "repositories",
  "projectImpact",
  "openSourceContribution",
  "activityAndConsistency"
] satisfies [DimensionKey, ...DimensionKey[]]);

const dimensionAliases: Record<string, DimensionKey> = {
  followers: "followers",
  "追随者": "followers",
  repositories: "repositories",
  "仓库建设": "repositories",
  projectImpact: "projectImpact",
  "项目影响力": "projectImpact",
  openSourceContribution: "openSourceContribution",
  "开源贡献": "openSourceContribution",
  activityAndConsistency: "activityAndConsistency",
  "活跃与稳定": "activityAndConsistency"
};

const accountInsightSchema = z.object({
  username: z.string().min(1),
  insight: z.string().min(1)
});

const sourceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  url: z.string().url(),
  note: z.string().min(1)
});

const llmAnalysisSchema = z.object({
  summary: z.string().min(1),
  winner: z
    .object({
      username: z.string().min(1),
      reason: z.string().min(1),
      confidence: z.enum(["high", "medium", "low"])
    })
    .nullable(),
  accountScores: z.array(
    z.object({
      username: z.string().min(1),
      score: z.number().int().min(0).max(100),
      reason: z.string().min(1)
    })
  ),
  dimensionInsights: z.array(
    z.object({
      dimension: dimensionKeySchema,
      title: z.string().min(1),
      accounts: z.array(accountInsightSchema).min(2),
      verdict: z.string().min(1)
    })
  ),
  accountAnalyses: z.array(
    z.object({
      username: z.string().min(1),
      strengths: z.array(z.string().min(1)),
      risks: z.array(z.string().min(1)),
      recommendations: z.array(z.string().min(1))
    })
  ),
  caveats: z.array(z.string()),
  sources: z.array(sourceSchema).min(1)
});

type ChatToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
};

type ChatCompletionMessage = {
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: ChatToolCall[];
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: ChatCompletionMessage;
  }>;
};

type ToolSource = {
  id: string;
  label: string;
  url: string;
  note: string;
};

type ToolResult = {
  summary: string;
  data: unknown;
  sources: ToolSource[];
};

const tools = [
  {
    type: "function",
    function: {
      name: "inspect_github_url",
      description:
        "Fetch and summarize a GitHub page URL when more project/profile context is needed. Only github.com URLs are allowed.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "A public https://github.com/... URL to inspect."
          }
        },
        required: ["url"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_repository_details",
      description: "Get structured GitHub repository details, language data, and README excerpt.",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" }
        },
        required: ["owner", "repo"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_repository_issue_pr_activity",
      description: "Get recently updated issues and pull requests for a repository.",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" }
        },
        required: ["owner", "repo"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_user_contribution_timeline",
      description: "Get the collected contribution timeline for one of the compared users.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string" }
        },
        required: ["username"],
        additionalProperties: false
      }
    }
  }
] as const;

function githubHeaders(accept = "application/vnd.github+json"): HeadersInit {
  const headers: HeadersInit = {
    Accept: accept,
    "User-Agent": "github-profile-competition",
    "X-GitHub-Api-Version": "2022-11-28"
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

async function fetchGitHubJson<T>(path: string): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    headers: githubHeaders(),
    next: { revalidate: 180 }
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

function sourceId(...parts: string[]): string {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function getMaxToolCalls(): number {
  const parsed = Number.parseInt(process.env.LLM_MAX_TOOL_CALLS ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MAX_TOTAL_TOOL_CALLS;
  }

  return Math.max(4, Math.min(parsed, 20));
}

function getLlmRequestTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.LLM_REQUEST_TIMEOUT_MS ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_LLM_REQUEST_TIMEOUT_MS;
  }

  return Math.max(MIN_LLM_REQUEST_TIMEOUT_MS, Math.min(parsed, MAX_LLM_REQUEST_TIMEOUT_MS));
}

function isDeepSeekProvider(baseUrl: string, model: string): boolean {
  return /deepseek/i.test(`${baseUrl} ${model}`);
}

function isDeepSeekReasonerModel(model: string): boolean {
  return /deepseek-reasoner/i.test(model);
}

function buildAssistantHistoryMessage(
  message: ChatCompletionMessage | undefined,
  includeReasoningContent: boolean
): ChatMessage {
  const historyMessage: ChatMessage = {
    role: "assistant",
    content: message?.content ?? null
  };

  // DeepSeek thinking-mode tool calls require this field to be preserved in later requests.
  if (includeReasoningContent && message?.reasoning_content) {
    historyMessage.reasoning_content = message.reasoning_content;
  }

  const toolCalls = message?.tool_calls ?? [];
  if (toolCalls.length > 0) {
    historyMessage.tool_calls = toolCalls;
  }

  return historyMessage;
}

function cleanText(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TOOL_TEXT_LIMIT);
}

function assertGitHubName(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_.-]+$/.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }

  return value;
}

function parseArguments(raw: string): Record<string, unknown> {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Tool arguments must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

function extractJsonObject(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("LLM response did not include a JSON object.");
  }

  return match[0];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value
      .split(/\n|；|;|。/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeDimensionKey(value: string): DimensionKey | null {
  return dimensionAliases[value] ?? null;
}

function normalizeWinner(value: unknown, usernames: string[]): unknown {
  if (value === null || typeof value === "undefined") {
    return null;
  }

  if (typeof value === "string") {
    const matchedUsername = usernames.find((username) => value.toLowerCase().includes(username.toLowerCase()));
    return {
      username: matchedUsername ?? value.trim(),
      reason: value.trim(),
      confidence: "medium"
    };
  }

  return value;
}

function normalizeAccountInsights(value: unknown, usernames: string[]): Array<{ username: string; insight: string }> {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const record = asRecord(item);
      if (typeof record.username !== "string") {
        return [];
      }

      const insight = typeof record.insight === "string" ? record.insight.trim() : "";
      return insight ? [{ username: record.username, insight }] : [];
    });
  }

  if (isPlainObject(value)) {
    return usernames.flatMap((username) => {
      const insightValue = value[username];
      const insight = typeof insightValue === "string" ? insightValue.trim() : "";
      return insight ? [{ username, insight }] : [];
    });
  }

  return [];
}

function normalizeDimensionInsights(value: unknown, usernames: string[]): unknown {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = asRecord(item);
    const rawDimension = typeof record.dimension === "string" ? record.dimension : "";
    const dimension = normalizeDimensionKey(rawDimension);
    if (!dimension) {
      return [];
    }

    const accounts = normalizeAccountInsights(record.accounts, usernames);
    return [
      {
        ...record,
        dimension,
        title: typeof record.title === "string" && record.title.trim() ? record.title : rawDimension,
        accounts,
        verdict: typeof record.verdict === "string" ? record.verdict : ""
      }
    ];
  });
}

function normalizeAccountAnalyses(value: unknown, usernames: string[]): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => {
      const record = asRecord(item);
      return {
        ...record,
        strengths: normalizeStringList(record.strengths),
        risks: normalizeStringList(record.risks),
        recommendations: normalizeStringList(record.recommendations)
      };
    });
  }

  if (isPlainObject(value)) {
    return usernames.flatMap((username) => {
      const record = asRecord(value[username]);
      if (Object.keys(record).length === 0) {
        return [];
      }

      return [
        {
          username,
          strengths: normalizeStringList(record.strengths),
          risks: normalizeStringList(record.risks),
          recommendations: normalizeStringList(record.recommendations)
        }
      ];
    });
  }

  return [];
}

function normalizeAccountScores(value: unknown, usernames: string[]): unknown {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const record = asRecord(item);
      const username = typeof record.username === "string" ? record.username : "";
      const score = typeof record.score === "number" ? record.score : Number(record.score);
      const reason = typeof record.reason === "string" ? record.reason.trim() : "";

      if (!usernames.includes(username) || !Number.isFinite(score)) {
        return [];
      }

      return [
        {
          username,
          score: Math.round(score),
          reason
        }
      ];
    });
  }

  if (isPlainObject(value)) {
    return usernames.flatMap((username) => {
      const record = asRecord(value[username]);
      const score = typeof record.score === "number" ? record.score : Number(record.score);
      const reason = typeof record.reason === "string" ? record.reason.trim() : "";

      if (!Number.isFinite(score)) {
        return [];
      }

      return [
        {
          username,
          score: Math.round(score),
          reason
        }
      ];
    });
  }

  return [];
}

function normalizeSources(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const record = asRecord(item);
    return {
      id: String(record.id ?? ""),
      label: String(record.label ?? record.id ?? ""),
      url: String(record.url ?? ""),
      note: String(record.note ?? "")
    };
  });
}

function normalizeLlmPayload(value: unknown, usernames: string[]): unknown {
  const record = asRecord(value);
  return {
    ...record,
    winner: normalizeWinner(record.winner, usernames),
    accountScores: normalizeAccountScores(record.accountScores, usernames),
    dimensionInsights: normalizeDimensionInsights(record.dimensionInsights, usernames),
    accountAnalyses: normalizeAccountAnalyses(record.accountAnalyses, usernames),
    caveats: normalizeStringList(record.caveats),
    sources: normalizeSources(record.sources)
  };
}

function summarizeZodIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ");
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function composeFinalScore(systemScore: number, llmScore: number): number {
  return clampScore(systemScore * 0.5 + llmScore * 0.5);
}

function assertLlmScoreConsistency(analysis: LlmAnalysis, usernames: string[], systemScores: SystemScoreInput = []): void {
  const expectedUsernames = new Set(usernames);
  const seenUsernames = new Set<string>();

  for (const item of analysis.accountScores) {
    if (!expectedUsernames.has(item.username)) {
      throw new Error(`LLM account score included an unexpected username: ${item.username}.`);
    }

    seenUsernames.add(item.username);
  }

  for (const username of usernames) {
    if (!seenUsernames.has(username)) {
      throw new Error(`LLM account score is missing for ${username}.`);
    }
  }

  if (!analysis.winner) {
    return;
  }

  const winnerScore = analysis.accountScores.find((item) => item.username === analysis.winner?.username)?.score;
  if (typeof winnerScore !== "number") {
    throw new Error("LLM winner must have a matching account score.");
  }

  if (systemScores.length === 0) {
    return;
  }

  const llmScoreByUsername = new Map(analysis.accountScores.map((item) => [item.username, item.score]));
  const finalScores = systemScores.map((item) => ({
    username: item.username,
    score: composeFinalScore(item.systemScore ?? item.totalScore, llmScoreByUsername.get(item.username) ?? 0)
  }));
  const winnerFinalScore = finalScores.find((item) => item.username === analysis.winner?.username)?.score;
  if (typeof winnerFinalScore !== "number") {
    throw new Error("LLM winner must have a matching final score.");
  }

  const highestFinalScore = Math.max(...finalScores.map((item) => item.score));
  if (winnerFinalScore < highestFinalScore) {
    throw new Error("LLM winner must have the highest final combined score or be tied for it.");
  }
}

export function parseLlmAnalysis(content: string, usernames: string[] = [], systemScores: SystemScoreInput = []): LlmAnalysis {
  const json = JSON.parse(extractJsonObject(content)) as unknown;
  const analysis = llmAnalysisSchema.parse(normalizeLlmPayload(json, usernames));
  assertLlmScoreConsistency(analysis, usernames, systemScores);
  return analysis;
}

function topRepositories(dataset: UserDataset) {
  return [...dataset.repositories]
    .sort((left, right) => right.stargazersCount + right.forksCount - (left.stargazersCount + left.forksCount))
    .slice(0, 12)
    .map((repository) => ({
      name: repository.fullName,
      url: repository.htmlUrl,
      description: repository.description,
      stars: repository.stargazersCount,
      forks: repository.forksCount,
      watchers: repository.watchersCount,
      openIssues: repository.openIssuesCount,
      language: repository.language,
      pushedAt: repository.pushedAt,
      updatedAt: repository.updatedAt,
      isFork: repository.fork,
      archived: repository.archived
    }));
}

function sourceCatalog(datasets: [UserDataset, UserDataset]): ToolSource[] {
  return datasets.flatMap((dataset) => [
    {
      id: sourceId("profile", dataset.profile.login),
      label: `${dataset.profile.login} GitHub profile`,
      url: dataset.profile.htmlUrl,
      note: "GitHub profile page and user API fields."
    },
    {
      id: sourceId("repositories", dataset.profile.login),
      label: `${dataset.profile.login} repositories`,
      url: `${dataset.profile.htmlUrl}?tab=repositories`,
      note: "Repository list collected from GitHub REST API."
    },
    {
      id: sourceId("timeline", dataset.profile.login),
      label: `${dataset.profile.login} contribution timeline`,
      url: `${dataset.profile.htmlUrl}?tab=overview`,
      note: "Recent public GitHub events and contribution timeline collected for this comparison."
    }
  ]);
}

function buildPromptPayload(datasets: [UserDataset, UserDataset], metrics: ComparisonMetrics, locale: LocaleCode) {
  return {
    locale,
    expectedUsernames: datasets.map((dataset) => dataset.profile.login),
    sourceCatalog: sourceCatalog(datasets),
    accounts: datasets.map((dataset) => ({
      profile: dataset.profile,
      contributions: dataset.contributions,
      contributionTimeline: dataset.contributionTimeline.slice(0, 45),
      languageDistribution: dataset.languageDistribution,
      profileContext: {
        ...dataset.context,
        summary: dataset.context.summary.slice(0, 700)
      },
      repositoryCountProvided: dataset.repositories.length,
      repositories: dataset.repositories.map((repository) => ({
        name: repository.fullName,
        url: repository.htmlUrl,
        description: repository.description,
        stars: repository.stargazersCount,
        forks: repository.forksCount,
        openIssues: repository.openIssuesCount,
        language: repository.language,
        updatedAt: repository.updatedAt,
        isFork: repository.fork,
        archived: repository.archived
      })),
      notableRepositories: topRepositories(dataset),
      scores: metrics.accounts.find((account) => account.username === dataset.profile.login)
    })),
    winnerByScore: metrics.winner
  };
}

function buildUserPrompt(
  datasets: [UserDataset, UserDataset],
  metrics: ComparisonMetrics,
  locale: LocaleCode,
  maxToolCalls: number
): string {
  const payload = buildPromptPayload(datasets, metrics, locale);
  const [left, right] = payload.expectedUsernames;

  return `Evaluate these two GitHub profiles in ${locale}. Use Chinese for zh-CN.
Return one JSON object only. Do not use markdown outside JSON.
You have GitHub tools. Use them when they materially improve the evaluation, especially for notable repositories, Issue/PR activity, and contribution timeline evidence.
You may use up to ${maxToolCalls} tool calls total; prefer a balanced set across both accounts instead of spending all calls on one side.
Use the contributionTimeline arrays as the users' recent one-year timeline signal. If you need more detail, call get_user_contribution_timeline.
Every material claim in generated text should include footnote markers like [^profile-${left}] or [^repo-owner-name]. Include matching source objects in "sources".
Do not expose hidden chain-of-thought. Produce concise, evidence-grounded conclusions only.
Use exactly these usernames in account-specific arrays: ${left}, ${right}.
Return this shape:
{
  "summary": "string with footnote markers",
  "winner": {"username": "${left}|${right}", "reason": "string with footnote markers", "confidence": "high|medium|low"} | null,
  "accountScores": [
    {"username": "${left}", "score": 0-100 integer, "reason": "string with footnote markers explaining the LLM score"},
    {"username": "${right}", "score": 0-100 integer, "reason": "string with footnote markers explaining the LLM score"}
  ],
  "dimensionInsights": [
    {
      "dimension": "followers|repositories|projectImpact|openSourceContribution|activityAndConsistency",
      "title": "string",
      "accounts": [
        {"username": "${left}", "insight": "string with footnote markers"},
        {"username": "${right}", "insight": "string with footnote markers"}
      ],
      "verdict": "string with footnote markers"
    }
  ],
  "accountAnalyses": [
    {"username": "${left}", "strengths": ["string with footnote markers"], "risks": ["string with footnote markers"], "recommendations": ["string with footnote markers"]},
    {"username": "${right}", "strengths": ["string with footnote markers"], "risks": ["string with footnote markers"], "recommendations": ["string with footnote markers"]}
  ],
  "caveats": ["string with footnote markers"],
  "sources": [{"id": "source-id-without-brackets", "label": "string", "url": "https://...", "note": "string"}]
}
Scoring rule: accountScores are the model judgment component only. The app will combine each model score 50/50 with the fixed system score in each account's scores.systemScore field. If winner is not null, the winner's final combined score (systemScore * 0.5 + model score * 0.5) must be greater than or equal to every other final combined score. If the model scores do not support your winner under this formula, adjust the model scores or return winner as null.
Payload: ${JSON.stringify(payload)}`;
}

async function inspectGitHubUrl(args: Record<string, unknown>): Promise<ToolResult> {
  if (typeof args.url !== "string") {
    throw new Error("url is required.");
  }

  const url = new URL(args.url);
  if (url.protocol !== "https:" || url.hostname !== "github.com") {
    throw new Error("Only https://github.com URLs are allowed.");
  }

  const response = await fetch(url.toString(), {
    headers: githubHeaders("text/html"),
    next: { revalidate: 180 }
  });

  if (!response.ok) {
    throw new Error(`GitHub page request failed with status ${response.status}.`);
  }

  const text = cleanText(await response.text());
  const id = sourceId("page", url.pathname);

  return {
    summary: `Inspected ${url.toString()} and extracted ${text.length} characters of visible text.`,
    data: {
      url: url.toString(),
      text
    },
    sources: [
      {
        id,
        label: `GitHub page ${url.pathname}`,
        url: url.toString(),
        note: "Visible text extracted from the public GitHub page."
      }
    ]
  };
}

async function getRepositoryDetails(args: Record<string, unknown>): Promise<ToolResult> {
  const owner = assertGitHubName(args.owner, "owner");
  const repo = assertGitHubName(args.repo, "repo");
  const repository = asRecord(
    await fetchGitHubJson<unknown>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`)
  );
  const languages = await fetchGitHubJson<unknown>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/languages`);

  let readme = "";
  try {
    const response = await fetch(`${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`, {
      headers: githubHeaders("application/vnd.github.raw+json"),
      next: { revalidate: 180 }
    });
    if (response.ok) {
      readme = (await response.text()).slice(0, TOOL_TEXT_LIMIT);
    }
  } catch {
    readme = "";
  }

  const repoUrl = `https://github.com/${owner}/${repo}`;
  const repoSourceId = sourceId("repo", owner, repo);
  const readmeSourceId = sourceId("readme", owner, repo);

  return {
    summary: `Loaded repository metadata and README excerpt for ${owner}/${repo}.`,
    data: {
      repository: {
        fullName: repository.full_name,
        description: repository.description,
        stars: repository.stargazers_count,
        forks: repository.forks_count,
        watchers: repository.watchers_count,
        openIssues: repository.open_issues_count,
        language: repository.language,
        archived: repository.archived,
        fork: repository.fork,
        pushedAt: repository.pushed_at,
        updatedAt: repository.updated_at,
        homepage: repository.homepage,
        topics: repository.topics
      },
      languages,
      readmeExcerpt: readme
    },
    sources: [
      {
        id: repoSourceId,
        label: `${owner}/${repo}`,
        url: repoUrl,
        note: "Repository metadata from GitHub REST API."
      },
      {
        id: readmeSourceId,
        label: `${owner}/${repo} README`,
        url: `${repoUrl}#readme`,
        note: "README excerpt from GitHub REST API."
      }
    ]
  };
}

async function getRepositoryIssuePrActivity(args: Record<string, unknown>): Promise<ToolResult> {
  const owner = assertGitHubName(args.owner, "owner");
  const repo = assertGitHubName(args.repo, "repo");
  const [issues, pulls] = await Promise.all([
    fetchGitHubJson<unknown[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=all&sort=updated&direction=desc&per_page=12`
    ),
    fetchGitHubJson<unknown[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=all&sort=updated&direction=desc&per_page=12`
    )
  ]);
  const repoUrl = `https://github.com/${owner}/${repo}`;
  const source = {
    id: sourceId("issues-prs", owner, repo),
    label: `${owner}/${repo} issues and pull requests`,
    url: `${repoUrl}/issues`,
    note: "Recently updated issues and pull requests from GitHub REST API."
  };

  return {
    summary: `Loaded ${issues.length} recent issue-like items and ${pulls.length} pull requests for ${owner}/${repo}.`,
    data: {
      issues: issues.map((item) => summarizeIssueLike(item)).slice(0, 12),
      pullRequests: pulls.map((item) => summarizeIssueLike(item)).slice(0, 12)
    },
    sources: [source]
  };
}

function summarizeIssueLike(item: unknown): Record<string, unknown> {
  const record = asRecord(item);
  const user = asRecord(record.user);
  return {
    title: record.title,
    state: record.state,
    url: record.html_url,
    updatedAt: record.updated_at,
    createdAt: record.created_at,
    author: user.login,
    comments: record.comments
  };
}

function getUserContributionTimeline(args: Record<string, unknown>, datasets: [UserDataset, UserDataset]): ToolResult {
  const username = assertGitHubName(args.username, "username");
  const dataset = datasets.find((item) => item.profile.login.toLowerCase() === username.toLowerCase());

  if (!dataset) {
    throw new Error("username must be one of the compared accounts.");
  }

  return {
    summary: `Returned ${dataset.contributionTimeline.length} timeline entries for ${dataset.profile.login}.`,
    data: {
      username: dataset.profile.login,
      timeline: dataset.contributionTimeline
    },
    sources: [
      {
        id: sourceId("timeline", dataset.profile.login),
        label: `${dataset.profile.login} contribution timeline`,
        url: `${dataset.profile.htmlUrl}?tab=overview`,
        note: "Recent public events and collected contribution timeline."
      }
    ]
  };
}

async function executeToolCall(toolCall: ChatToolCall, datasets: [UserDataset, UserDataset]): Promise<ToolResult> {
  const args = parseArguments(toolCall.function.arguments || "{}");

  if (toolCall.function.name === "inspect_github_url") {
    return inspectGitHubUrl(args);
  }

  if (toolCall.function.name === "get_repository_details") {
    return getRepositoryDetails(args);
  }

  if (toolCall.function.name === "get_repository_issue_pr_activity") {
    return getRepositoryIssuePrActivity(args);
  }

  if (toolCall.function.name === "get_user_contribution_timeline") {
    return getUserContributionTimeline(args, datasets);
  }

  throw new Error(`Unknown tool: ${toolCall.function.name}`);
}

async function createChatCompletion(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  allowTools: boolean
): Promise<ChatCompletionResponse> {
  const phase = allowTools ? "tool-call" : "final-json";
  const timeoutMs = getLlmRequestTimeoutMs();
  const body = {
    model,
    temperature: 0.35,
    ...(allowTools
      ? {
          tools,
          tool_choice: "auto"
        }
      : {
          response_format: { type: "json_object" }
        }),
    messages
  };

  let response: Response;

  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    logServerError("[llm] Provider transport failed.", error, {
      phase,
      model,
      baseUrl,
      timeoutMs
    });

    throw new AppError(
      "llm_transport_failed",
      `LLM provider connection failed during ${phase} round for model ${model}: ${toErrorMessage(error)}.`,
      502,
      { cause: error }
    );
  }

  if (!response.ok) {
    let providerMessage = "";

    try {
      const responseText = await response.text();
      providerMessage = responseText ? ` Provider response: ${responseText.slice(0, 700)}` : "";

      logServerError("[llm] Provider returned non-2xx response.", new Error(providerMessage || "No provider body."), {
        phase,
        model,
        baseUrl,
        status: response.status,
        statusText: response.statusText,
        providerResponsePreview: responseText.slice(0, 1_500)
      });
    } catch {
      providerMessage = "";

      logServerError("[llm] Provider returned non-2xx response, but the response body could not be read.", undefined, {
        phase,
        model,
        baseUrl,
        status: response.status,
        statusText: response.statusText
      });
    }

    throw new AppError(
      "llm_request_failed",
      `LLM request failed during ${phase} round for model ${model} with status ${response.status}.${providerMessage}`,
      502
    );
  }

  try {
    return (await response.json()) as ChatCompletionResponse;
  } catch (error) {
    logServerError("[llm] Provider response body could not be parsed as JSON.", error, {
      phase,
      model,
      baseUrl,
      status: response.status,
      statusText: response.statusText
    });

    throw new AppError(
      "llm_response_read_failed",
      `LLM provider response ended before JSON could be read during ${phase} round for model ${model}: ${toErrorMessage(error)}.`,
      502,
      { cause: error }
    );
  }
}

export async function generateLlmAnalysis(
  datasets: [UserDataset, UserDataset],
  metrics: ComparisonMetrics,
  locale: LocaleCode,
  emitTimeline?: TimelineEmitter
): Promise<LlmResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new AppError("llm_not_configured", "LLM API key is required for profile evaluation.", 500);
  }

  const baseUrl = (process.env.OPENAI_BASE_URL ?? DEFAULT_OPENAI_BASE_URL).replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
  const shouldPreserveReasoningContent = isDeepSeekProvider(baseUrl, model);
  const maxToolCalls = getMaxToolCalls();
  const usernames = datasets.map((dataset) => dataset.profile.login);
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are an expert open-source engineering evaluator. Use the provided GitHub tools when deeper evidence is needed. Return valid JSON only and never invent unavailable facts."
    },
    {
      role: "user",
      content: buildUserPrompt(datasets, metrics, locale, maxToolCalls)
    }
  ];
  let usedTool = false;
  let toolCallCount = 0;

  try {
    if (isDeepSeekReasonerModel(model)) {
      throw new AppError(
        "llm_model_incompatible",
        "DeepSeek reasoner models are not compatible with this tool-calling evaluation workflow. Configure a DeepSeek chat/V3 model or another OpenAI-compatible model with function calling support.",
        500
      );
    }

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const allowTools = toolCallCount < maxToolCalls;
      await emitTimeline?.({
        phase: "model",
        title: allowTools ? (usedTool ? "模型继续整合证据" : "模型开始阅读资料") : "模型进入最终生成",
        detail: allowTools
          ? usedTool
            ? "模型正在根据工具返回的项目、Issue/PR 与时间线资料生成下一步。"
            : "模型正在阅读账号资料、项目列表、贡献时间线和可用工具说明。"
          : "工具预算已完成，模型正在生成带脚注来源的最终评价。",
        status: "running"
      });

      const completion = await createChatCompletion(baseUrl, apiKey, model, messages, allowTools);
      const message = completion.choices?.[0]?.message;
      const toolCalls = message?.tool_calls ?? [];

      if (toolCalls.length > 0) {
        usedTool = true;
        messages.push(buildAssistantHistoryMessage(message, shouldPreserveReasoningContent));

        for (const toolCall of toolCalls) {
          if (toolCallCount >= maxToolCalls) {
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                summary: "Tool budget exhausted. Use the evidence already collected and produce final JSON.",
                data: null,
                sources: []
              } satisfies ToolResult)
            });
            continue;
          }

          toolCallCount += 1;
          await emitTimeline?.({
            phase: "tool_call",
            title: `模型调用工具：${toolCall.function.name}`,
            detail: toolCall.function.arguments || "{}",
            status: "running",
            toolName: toolCall.function.name
          });

          let result: ToolResult;
          let toolStatus: "completed" | "error" = "completed";

          try {
            result = await executeToolCall(toolCall, datasets);
          } catch (toolError) {
            toolStatus = "error";
            result = {
              summary: `Tool failed: ${toErrorMessage(toolError)}`,
              data: null,
              sources: []
            };
          }

          const sourceIds = result.sources.map((source) => source.id);

          await emitTimeline?.({
            phase: "tool_result",
            title: `工具返回：${toolCall.function.name}`,
            detail: result.summary,
            status: toolStatus,
            toolName: toolCall.function.name,
            sourceIds
          });

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          });
        }

        if (toolCallCount >= maxToolCalls) {
          messages.push({
            role: "user",
            content:
              "The tool budget is complete. Use the evidence already collected and produce the final JSON now with source footnotes."
          });
        }

        continue;
      }

      const content = message?.content;
      if (!content) {
        throw new AppError("llm_empty_response", "LLM response was empty.", 502);
      }

      if (!usedTool && round < MAX_TOOL_ROUNDS - 1) {
        messages.push(buildAssistantHistoryMessage(message, shouldPreserveReasoningContent));
        messages.push({
          role: "user",
          content:
            "You must use the provided tools before final evaluation. Inspect at least one notable repository for each account and at least one issue/PR activity source."
        });
        continue;
      }

      let analysis: LlmAnalysis;

      try {
        analysis = parseLlmAnalysis(content, usernames, metrics.accounts);
      } catch (parseError) {
        if (round < MAX_TOOL_ROUNDS - 1) {
          const issueSummary =
            parseError instanceof z.ZodError ? summarizeZodIssues(parseError) : toErrorMessage(parseError);
          await emitTimeline?.({
            phase: "model",
            title: "模型修正输出结构",
            detail: `模型最终输出需要修正为结构化 JSON：${issueSummary}`,
            status: "running"
          });
          toolCallCount = maxToolCalls;
          messages.push(buildAssistantHistoryMessage(message, shouldPreserveReasoningContent));
          messages.push({
            role: "user",
            content: `Your previous final response could not be accepted as the required JSON: ${issueSummary}. Re-output the final JSON only. Do not call tools again. Keep the same evidence and footnote sources, but conform exactly to the required shape.`
          });
          continue;
        }

        throw parseError;
      }

      await emitTimeline?.({
        phase: "final",
        title: "模型生成最终评价",
        detail: "模型已基于基础资料和工具返回内容生成带脚注来源的最终 JSON 评价。",
        status: "completed",
        sourceIds: analysis.sources.map((source) => source.id)
      });

      return {
        status: "generated",
        analysis
      };
    }

    throw new AppError("llm_tool_round_limit", "LLM did not finish within the tool call limit.", 502);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof z.ZodError) {
      const issueSummary = summarizeZodIssues(error);
      throw new AppError(
        "llm_invalid_response",
        `LLM response did not match the expected analysis schema. ${issueSummary}`,
        502
      );
    }

    throw new AppError("llm_generation_failed", `LLM generation failed: ${toErrorMessage(error)}`, 502);
  }
}
