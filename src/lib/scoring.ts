import { getMessages } from "@/i18n/messages";
import type {
  AccountScore,
  ComparisonMetrics,
  DimensionKey,
  LocaleCode,
  ScoreDimension,
  UserDataset,
  WinnerResult
} from "@/lib/types";

const RECENT_WINDOW_DAYS = 365;

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

export function logScaleScore(value: number, benchmark: number): number {
  if (value <= 0) {
    return 0;
  }

  return clampScore((Math.log1p(value) / Math.log1p(benchmark)) * 100);
}

function daysSince(date: string | null, now: Date): number {
  if (!date) {
    return Number.POSITIVE_INFINITY;
  }

  const timestamp = Date.parse(date);
  if (!Number.isFinite(timestamp)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, (now.getTime() - timestamp) / 86_400_000);
}

function activeRepositories(dataset: UserDataset, now: Date): number {
  return dataset.repositories.filter((repository) => {
    return !repository.archived && daysSince(repository.pushedAt ?? repository.updatedAt, now) <= RECENT_WINDOW_DAYS;
  }).length;
}

function sumByRepository(dataset: UserDataset, selector: (repository: UserDataset["repositories"][number]) => number): number {
  return dataset.repositories.reduce((total, repository) => total + selector(repository), 0);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function scoreFollowers(dataset: UserDataset): Pick<ScoreDimension, "score" | "rawValue" | "detail"> {
  const followers = dataset.profile.followers;
  return {
    score: logScaleScore(followers, 50_000),
    rawValue: followers,
    detail: `${formatNumber(followers)} 位追随者，关注 ${formatNumber(dataset.profile.following)} 人。`
  };
}

function scoreRepositories(dataset: UserDataset, now: Date): Pick<ScoreDimension, "score" | "rawValue" | "detail"> {
  const total = dataset.profile.publicRepos;
  const fetched = dataset.repositories.length;
  const active = activeRepositories(dataset, now);
  const owned = dataset.repositories.filter((repository) => !repository.fork).length;
  const activeRatio = fetched > 0 ? active / fetched : 0;
  const ownedRatio = fetched > 0 ? owned / fetched : 0;
  const score = logScaleScore(total, 300) * 0.58 + activeRatio * 24 + ownedRatio * 18;

  return {
    score: clampScore(score),
    rawValue: total,
    detail: `${formatNumber(total)} 个公开仓库，近一年活跃 ${formatNumber(active)} 个，非 fork 占比 ${Math.round(
      ownedRatio * 100
    )}%。`
  };
}

function scoreProjectImpact(dataset: UserDataset): Pick<ScoreDimension, "score" | "rawValue" | "detail"> {
  const stars = sumByRepository(dataset, (repository) => repository.stargazersCount);
  const forks = sumByRepository(dataset, (repository) => repository.forksCount);
  const watchers = sumByRepository(dataset, (repository) => repository.watchersCount);
  const topRepoStars = Math.max(0, ...dataset.repositories.map((repository) => repository.stargazersCount));
  const score =
    logScaleScore(stars, 100_000) * 0.52 +
    logScaleScore(forks, 30_000) * 0.28 +
    logScaleScore(watchers, 40_000) * 0.12 +
    logScaleScore(topRepoStars, 50_000) * 0.08;

  return {
    score: clampScore(score),
    rawValue: stars + forks,
    detail: `${formatNumber(stars)} stars、${formatNumber(forks)} forks，代表项目最高 ${formatNumber(
      topRepoStars
    )} stars。`
  };
}

function scoreOpenSourceContribution(dataset: UserDataset): Pick<ScoreDimension, "score" | "rawValue" | "detail"> {
  const stats = dataset.contributions;
  const contributionScore =
    logScaleScore(stats.totalContributions, 10_000) * 0.55 +
    logScaleScore(stats.pullRequests + stats.issues + stats.reviews, 1_000) * 0.25 +
    clampScore((stats.activeDays / 260) * 100) * 0.2;

  return {
    score: clampScore(contributionScore),
    rawValue: stats.totalContributions,
    detail: `${formatNumber(stats.totalContributions)} 次贡献，PR ${formatNumber(stats.pullRequests)}、Issue ${formatNumber(
      stats.issues
    )}、Review ${formatNumber(stats.reviews)}，置信度 ${stats.confidence}。`
  };
}

function scoreActivity(dataset: UserDataset, now: Date): Pick<ScoreDimension, "score" | "rawValue" | "detail"> {
  const active = activeRepositories(dataset, now);
  const updatedRecently = dataset.repositories.filter(
    (repository) => daysSince(repository.updatedAt, now) <= 90 || daysSince(repository.pushedAt, now) <= 90
  ).length;
  const newestUpdateDays = Math.min(
    ...dataset.repositories.map((repository) => daysSince(repository.pushedAt ?? repository.updatedAt, now)),
    daysSince(dataset.profile.updatedAt, now)
  );
  const freshness = newestUpdateDays === Number.POSITIVE_INFINITY ? 0 : Math.max(0, 100 - newestUpdateDays * 1.6);
  const score =
    clampScore((active / Math.max(dataset.repositories.length, 1)) * 100) * 0.38 +
    clampScore((updatedRecently / Math.max(dataset.repositories.length, 1)) * 100) * 0.22 +
    clampScore((dataset.contributions.activeDays / 90) * 100) * 0.22 +
    clampScore(freshness) * 0.18;

  return {
    score: clampScore(score),
    rawValue: active + dataset.contributions.recentEvents,
    detail: `近一年活跃仓库 ${formatNumber(active)} 个，近 90 天更新 ${formatNumber(updatedRecently)} 个，活跃天数 ${formatNumber(
      dataset.contributions.activeDays
    )}。`
  };
}

function buildDimensions(dataset: UserDataset, locale: LocaleCode, now: Date): ScoreDimension[] {
  const messages = getMessages(locale);
  const dimensions: Array<[DimensionKey, Pick<ScoreDimension, "score" | "rawValue" | "detail">]> = [
    ["followers", scoreFollowers(dataset)],
    ["repositories", scoreRepositories(dataset, now)],
    ["projectImpact", scoreProjectImpact(dataset)],
    ["openSourceContribution", scoreOpenSourceContribution(dataset)],
    ["activityAndConsistency", scoreActivity(dataset, now)]
  ];

  return dimensions.map(([key, values]) => ({
    key,
    label: messages.dimensions[key],
    ...values
  }));
}

function buildWinner(accounts: AccountScore[]): WinnerResult {
  const [first, second] = [...accounts].sort((left, right) => right.totalScore - left.totalScore);
  if (!first || !second) {
    return null;
  }

  const margin = first.totalScore - second.totalScore;
  if (margin < 2) {
    return null;
  }

  return {
    username: first.username,
    margin,
    reason: `${first.username} 综合分高出 ${margin} 分，优势主要来自得分更高的维度组合。`
  };
}

export function calculateComparisonMetrics(
  datasets: [UserDataset, UserDataset],
  locale: LocaleCode = "zh-CN",
  now = new Date()
): ComparisonMetrics {
  const accounts = datasets.map<AccountScore>((dataset) => {
    const dimensions = buildDimensions(dataset, locale, now);
    const totalScore = clampScore(
      dimensions.reduce((total, dimension) => total + dimension.score, 0) / Math.max(dimensions.length, 1)
    );

    return {
      username: dataset.profile.login,
      totalScore,
      systemScore: totalScore,
      llmScore: null,
      dimensions
    };
  });

  const radar = accounts[0].dimensions.map((dimension) => {
    const point: Record<string, string | number> = {
      dimension: dimension.label,
      key: dimension.key
    };

    for (const account of accounts) {
      const accountDimension = account.dimensions.find((item) => item.key === dimension.key);
      point[account.username] = accountDimension?.score ?? 0;
    }

    return point as ComparisonMetrics["radar"][number];
  });

  return {
    accounts,
    radar,
    winner: buildWinner(accounts)
  };
}

export function composeComparisonMetricsWithLlmScores(
  metrics: ComparisonMetrics,
  llmScores: Array<{ username: string; score: number }>
): ComparisonMetrics {
  const llmScoreByUsername = new Map(llmScores.map((item) => [item.username, clampScore(item.score)]));
  const accounts = metrics.accounts.map<AccountScore>((account) => {
    const llmScore = llmScoreByUsername.get(account.username) ?? null;
    const systemScore = account.systemScore;

    return {
      ...account,
      systemScore,
      llmScore,
      totalScore: llmScore === null ? systemScore : clampScore(systemScore * 0.5 + llmScore * 0.5)
    };
  });

  return {
    ...metrics,
    accounts,
    winner: buildWinner(accounts)
  };
}
