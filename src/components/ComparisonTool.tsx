"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import {
  AlertTriangle,
  BarChart3,
  ExternalLink,
  Info,
  LoaderCircle,
  Search,
  Swords,
  Trophy,
  X
} from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type {
  AccountScore,
  ApiErrorResponse,
  CompareResponse,
  CompareStreamEvent,
  GitHubRepository,
  ModelTimelineEvent,
  UserDataset
} from "@/lib/types";

const RadarComparisonChart = dynamic(
  () => import("@/components/RadarComparisonChart").then((module) => module.RadarComparisonChart),
  {
    ssr: false,
    loading: () => <div className="chart-loading">雷达图加载中</div>
  }
);

const loadingSubtitles = [
  "正在读取公开资料，先把 stars、forks 和贡献时间线摆上桌。",
  "模型正在翻 README 和 Issue 线索，试图找出真正的项目含金量。",
  "系统分已经开跑，LLM 分正在慢慢热身。",
  "贡献记录正在排队称重，近期活跃度会被认真对待。",
  "如果双方很接近，我们会让证据多说两句。"
] as const;

const scoreFormulaRows = [
  {
    title: "固定系统分",
    detail: "五个维度各按 0-100 计算，系统分是五项平均值。"
  },
  {
    title: "LLM 判断分",
    detail: "模型基于资料、工具返回证据和系统分，为每个账号给出 0-100 的判断分。"
  },
  {
    title: "最终总分",
    detail: "最终总分 = 固定系统分 * 50% + LLM 判断分 * 50%。"
  },
  {
    title: "赢家判定",
    detail: "页面综合结果使用最终总分；低于 2 分的差距视为接近。"
  }
] as const;

const dimensionFormulaRows = [
  {
    title: "追随者",
    detail: "粉丝数使用对数缩放，50,000 粉丝作为 100 分基准。"
  },
  {
    title: "仓库建设",
    detail: "公开仓库数占 58%，近一年活跃仓库比例占 24%，非 fork 仓库比例占 18%。"
  },
  {
    title: "项目影响力",
    detail: "总 stars 占 52%，总 forks 占 28%，watchers 占 12%，代表项目最高 stars 占 8%。"
  },
  {
    title: "开源贡献",
    detail: "总贡献占 55%，PR/Issue/Review 占 25%，活跃天数占 20%。"
  },
  {
    title: "活跃与稳定",
    detail: "近一年活跃仓库占 38%，近 90 天更新占 22%，活跃天数占 22%，最近更新时间新鲜度占 18%。"
  }
] as const;

type FormState = {
  left: string;
  right: string;
  locale: string;
};

type InitialUsers = {
  left?: string;
  right?: string;
};

type ComparisonRow = {
  label: string;
  left: ReactNode;
  right: ReactNode;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return isRecord(value) && isRecord(value.error) && typeof value.error.message === "string";
}

function isCompareStreamEvent(value: unknown): value is CompareStreamEvent {
  return isRecord(value) && typeof value.type === "string";
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "暂无";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function sumRepositories(repositories: GitHubRepository[], selector: (repository: GitHubRepository) => number): number {
  return repositories.reduce((total, repository) => total + selector(repository), 0);
}

function getTopRepositories(repositories: GitHubRepository[]): GitHubRepository[] {
  return [...repositories]
    .sort((left, right) => right.stargazersCount + right.forksCount - (left.stargazersCount + left.forksCount))
    .slice(0, 3);
}

function getTopLanguages(dataset: UserDataset): string {
  const languages = Object.entries(dataset.languageDistribution)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([language]) => language);

  return languages.length > 0 ? languages.join(" / ") : "暂无";
}

function buildComparisonUrl(left: string, right: string): string {
  const query = new URLSearchParams({
    a: left,
    b: right
  });

  return `?${query.toString()}`;
}

function renderRepositoryList(repositories: GitHubRepository[]): ReactNode {
  const topRepositories = getTopRepositories(repositories);

  if (topRepositories.length === 0) {
    return <span className="muted">暂无代表仓库</span>;
  }

  return (
    <ul className="top-repo-list compact">
      {topRepositories.map((repository) => (
        <li key={repository.id}>
          <a href={repository.htmlUrl} target="_blank" rel="noreferrer">
            {repository.name}
          </a>
          <span className="repo-meta">
            {formatNumber(repository.stargazersCount)} stars / {formatNumber(repository.forksCount)} forks
          </span>
        </li>
      ))}
    </ul>
  );
}

function TextWithFootnotes({
  text,
  sourceIds
}: {
  text: string;
  sourceIds: Set<string>;
}) {
  const parts = text.split(/(\[\^[^\]]+\])/g);

  return (
    <>
      {parts.map((part, index) => {
        const match = part.match(/^\[\^([^\]]+)\]$/);
        if (!match) {
          return <span key={`${part}-${index}`}>{part}</span>;
        }

        const id = match[1] ?? "";
        return (
          <a
            className={sourceIds.has(id) ? "footnote-ref" : "footnote-ref missing"}
            href={`#source-${id}`}
            key={`${part}-${index}`}
            title={sourceIds.has(id) ? "查看来源" : "来源未列出"}
          >
            [{id}]
          </a>
        );
      })}
    </>
  );
}

function EmptyState() {
  return (
    <section className="empty-panel" aria-live="polite">
      <div>
        <BarChart3 size={42} aria-hidden="true" />
        <h2>等待开赛</h2>
        <p>输入两个 GitHub 用户名后开始比拼。</p>
      </div>
    </section>
  );
}

function LoadingState({
  users,
  subtitle
}: {
  users: [string, string] | null;
  subtitle: string;
}) {
  const matchup = users ? `${users[0]} vs ${users[1]}` : "GitHub 账号对比";

  return (
    <section className="loading-panel" aria-live="polite" aria-busy="true">
      <div>
        <div className="loading-mark" aria-hidden="true">
          <LoaderCircle className="spin" size={34} />
        </div>
        <p className="loading-kicker">{matchup}</p>
        <h2>正在对比</h2>
        <p>{subtitle}</p>
      </div>
    </section>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <section className="error-panel" role="alert">
      <div>
        <AlertTriangle className="error-icon" size={42} aria-hidden="true" />
        <h2>分析失败</h2>
        <p>{message}</p>
      </div>
    </section>
  );
}

function TimelinePanel({ timeline, isLoading }: { timeline: ModelTimelineEvent[]; isLoading: boolean }) {
  if (timeline.length === 0) {
    return null;
  }

  return (
    <section className="timeline-panel" aria-label="模型行动时间线">
      <div className="panel-heading">
        <div>
          <h2 className="panel-title">模型行动时间线</h2>
          <p className="panel-subtitle">展示模型可观察的资料读取、工具调用和证据摘要。</p>
        </div>
        {isLoading ? <span className="live-badge">流式生成中</span> : <span className="live-badge done">已完成</span>}
      </div>
      <ol className="timeline-list">
        {timeline.map((event) => (
          <li className={`timeline-item ${event.status}`} key={event.id}>
            <div className="timeline-dot" aria-hidden="true" />
            <div className="timeline-content">
              <div className="timeline-head">
                <span>{event.title}</span>
                <time>{new Date(event.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
              </div>
              <p>{event.detail}</p>
              {event.sourceIds?.length ? (
                <div className="timeline-sources">
                  {event.sourceIds.map((sourceId) => (
                    <span key={sourceId}>来源 {sourceId}</span>
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ComparisonRows({
  title,
  leftUsername,
  rightUsername,
  rows
}: {
  title: string;
  leftUsername: string;
  rightUsername: string;
  rows: ComparisonRow[];
}) {
  return (
    <section className="comparison-panel">
      <div className="panel-heading">
        <h2 className="panel-title">{title}</h2>
      </div>
      <div className="comparison-table" role="table" aria-label={title}>
        <div className="comparison-row comparison-head" role="row">
          <div role="columnheader">项目</div>
          <div role="columnheader">{leftUsername}</div>
          <div role="columnheader">{rightUsername}</div>
        </div>
        {rows.map((row) => (
          <div className="comparison-row" role="row" key={row.label}>
            <div className="comparison-label" role="cell">
              {row.label}
            </div>
            <div role="cell">{row.left}</div>
            <div role="cell">{row.right}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AccountSummary({ dataset, score }: { dataset: UserDataset; score: AccountScore }) {
  return (
    <article className="account-card">
      <div className="account-heading">
        <Image
          className="avatar"
          src={dataset.profile.avatarUrl}
          alt={`${dataset.profile.login} avatar`}
          width={58}
          height={58}
        />
        <div className="account-name">
          <h3>{dataset.profile.name ?? dataset.profile.login}</h3>
          <p>@{dataset.profile.login}</p>
        </div>
        <a className="profile-link" href={dataset.profile.htmlUrl} target="_blank" rel="noreferrer" title="Open GitHub profile">
          <ExternalLink size={19} aria-hidden="true" />
        </a>
      </div>

      <div className="score-line">
        <div>
          <div className="score-number">{score.totalScore}</div>
          <div className="score-label">最终总分</div>
        </div>
        <div className="score-caption">{dataset.contributions.confidence} confidence</div>
      </div>
      <div className="score-bar" aria-hidden="true">
        <div className="score-fill" style={{ width: `${score.totalScore}%` }} />
      </div>

      <div className="score-breakdown" aria-label={`${dataset.profile.login} score breakdown`}>
        <span>系统 {score.systemScore}</span>
        <span>LLM {score.llmScore ?? "暂无"}</span>
      </div>

      <div className="pill-row">
        <span className="pill">{formatNumber(dataset.profile.followers)} 追随者</span>
        <span className="pill">{formatNumber(dataset.profile.publicRepos)} 仓库</span>
        <span className="pill">{getTopLanguages(dataset)}</span>
      </div>
    </article>
  );
}

function ScoreInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-modal="true"
        className="score-modal"
        role="dialog"
        aria-labelledby="score-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <h2 id="score-modal-title">总分构成</h2>
            <p>最终总分由固定系统分和 LLM 判断分各占一半。</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="关闭">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="formula-grid">
          {scoreFormulaRows.map((row) => (
            <article className="formula-card" key={row.title}>
              <h3>{row.title}</h3>
              <p>{row.detail}</p>
            </article>
          ))}
        </div>

        <div className="formula-section">
          <h3>固定系统分维度</h3>
          <div className="formula-list">
            {dimensionFormulaRows.map((row) => (
              <div className="formula-row" key={row.title}>
                <span>{row.title}</span>
                <p>{row.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function OverviewComparison({ datasets }: { datasets: [UserDataset, UserDataset] }) {
  const [left, right] = datasets;
  const rows: ComparisonRow[] = [
    {
      label: "公开影响",
      left: `${formatNumber(left.profile.followers)} 追随者 / ${formatNumber(left.profile.following)} 关注`,
      right: `${formatNumber(right.profile.followers)} 追随者 / ${formatNumber(right.profile.following)} 关注`
    },
    {
      label: "仓库规模",
      left: `${formatNumber(left.profile.publicRepos)} repos / ${formatNumber(left.profile.publicGists)} gists`,
      right: `${formatNumber(right.profile.publicRepos)} repos / ${formatNumber(right.profile.publicGists)} gists`
    },
    {
      label: "项目影响",
      left: `${formatNumber(sumRepositories(left.repositories, (repository) => repository.stargazersCount))} stars / ${formatNumber(
        sumRepositories(left.repositories, (repository) => repository.forksCount)
      )} forks`,
      right: `${formatNumber(sumRepositories(right.repositories, (repository) => repository.stargazersCount))} stars / ${formatNumber(
        sumRepositories(right.repositories, (repository) => repository.forksCount)
      )} forks`
    },
    {
      label: "贡献信号",
      left: `${formatNumber(left.contributions.totalContributions)} contributions / ${formatNumber(
        left.contributions.activeDays
      )} active days`,
      right: `${formatNumber(right.contributions.totalContributions)} contributions / ${formatNumber(
        right.contributions.activeDays
      )} active days`
    },
    {
      label: "主要语言",
      left: getTopLanguages(left),
      right: getTopLanguages(right)
    },
    {
      label: "资料更新",
      left: formatDate(left.profile.updatedAt),
      right: formatDate(right.profile.updatedAt)
    },
    {
      label: "代表仓库",
      left: renderRepositoryList(left.repositories),
      right: renderRepositoryList(right.repositories)
    }
  ];

  return (
    <ComparisonRows title="资料概览" leftUsername={left.profile.login} rightUsername={right.profile.login} rows={rows} />
  );
}

function MetricTable({ accounts }: { accounts: [AccountScore, AccountScore] }) {
  const [left, right] = accounts;

  return (
    <section className="metric-table-wrap" aria-label="维度对比表格">
      <table className="metric-table">
        <thead>
          <tr>
            <th>维度</th>
            <th>{left.username}</th>
            <th>{right.username}</th>
          </tr>
        </thead>
        <tbody>
          {left.dimensions.map((leftDimension) => {
            const rightDimension = right.dimensions.find((dimension) => dimension.key === leftDimension.key);

            return (
              <tr key={leftDimension.key}>
                <td>
                  <span className="dimension-name">
                    <span className="dimension-dot" aria-hidden="true" />
                    {leftDimension.label}
                  </span>
                </td>
                <td>
                  <span className="metric-score">{leftDimension.score}</span>
                  <span className="dimension-detail">{leftDimension.detail}</span>
                </td>
                <td>
                  <span className="metric-score">{rightDimension?.score ?? 0}</span>
                  <span className="dimension-detail">{rightDimension?.detail ?? "暂无"}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function AnalysisPanel({ result, usernames, finalWinner }: { result: CompareResponse; usernames: [string, string]; finalWinner: string | null }) {
  const [leftUsername, rightUsername] = usernames;
  const analysisByUsername = new Map(result.llm.analysis.accountAnalyses.map((analysis) => [analysis.username, analysis]));
  const sourceIds = new Set(result.llm.analysis.sources.map((source) => source.id));

  return (
    <section className="analysis-panel">
      <div className="panel-heading">
        <div>
          <h2 className="panel-title">大模型评价</h2>
          <p className="analysis-summary">
            <TextWithFootnotes text={result.llm.analysis.summary} sourceIds={sourceIds} />
          </p>
        </div>
        {result.llm.analysis.winner ? (
          <div className="winner-row">
            <Trophy size={20} aria-hidden="true" />
            模型观点：{result.llm.analysis.winner.username}
          </div>
        ) : (
          <div className="muted">模型认为双方接近</div>
        )}
      </div>

      {result.llm.analysis.winner ? (
        <p className="winner-reason">
          <TextWithFootnotes text={result.llm.analysis.winner.reason} sourceIds={sourceIds} />
        </p>
      ) : null}

      <div className="llm-score-grid">
        {result.llm.analysis.accountScores.map((item) => (
          <article className={item.username === finalWinner ? "llm-score-card winner" : "llm-score-card"} key={item.username}>
            <div>
              <h3>{item.username}</h3>
              <p>
                <TextWithFootnotes text={item.reason} sourceIds={sourceIds} />
              </p>
            </div>
            <span>{item.score}</span>
          </article>
        ))}
      </div>

      <div className="llm-dimension-stack">
        {result.llm.analysis.dimensionInsights.map((item) => {
          const leftInsight = item.accounts.find((account) => account.username === leftUsername)?.insight ?? "模型未提供该账号洞察。";
          const rightInsight = item.accounts.find((account) => account.username === rightUsername)?.insight ?? "模型未提供该账号洞察。";

          return (
            <article className="llm-dimension" key={item.dimension}>
              <div className="llm-dimension-head">
                <h3>{item.title}</h3>
                <span>
                  <TextWithFootnotes text={item.verdict} sourceIds={sourceIds} />
                </span>
              </div>
              <div className="two-column-copy">
                <div>
                <h4>{leftUsername}</h4>
                  <p>
                    <TextWithFootnotes text={leftInsight} sourceIds={sourceIds} />
                  </p>
                </div>
                <div>
                  <h4>{rightUsername}</h4>
                  <p>
                    <TextWithFootnotes text={rightInsight} sourceIds={sourceIds} />
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="account-analysis-grid">
        {usernames.map((username) => {
          const accountAnalysis = analysisByUsername.get(username);

          return (
            <article className="account-analysis" key={username}>
              <h3>{username}</h3>
              <AnalysisList title="优势" items={accountAnalysis?.strengths ?? []} sourceIds={sourceIds} />
              <AnalysisList title="风险" items={accountAnalysis?.risks ?? []} sourceIds={sourceIds} />
              <AnalysisList title="建议" items={accountAnalysis?.recommendations ?? []} sourceIds={sourceIds} />
            </article>
          );
        })}
      </div>

      {result.llm.analysis.caveats.length > 0 ? (
        <div className="caveat-block">
          <h3>评估边界</h3>
          <ul className="caveat-list">
            {result.llm.analysis.caveats.map((item) => (
              <li key={item}>
                <TextWithFootnotes text={item} sourceIds={sourceIds} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="source-footnotes">
        <h3>信息来源</h3>
        <ol>
          {result.llm.analysis.sources.map((source) => (
            <li id={`source-${source.id}`} key={source.id}>
              <a href={source.url} target="_blank" rel="noreferrer">
                [{source.id}] {source.label}
              </a>
              <span>{source.note}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function AnalysisList({ title, items, sourceIds }: { title: string; items: string[]; sourceIds: Set<string> }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="analysis-list-block">
      <h4>{title}</h4>
      <ul className="recommendation-list">
        {items.map((item) => (
          <li key={item}>
            <TextWithFootnotes text={item} sourceIds={sourceIds} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Results({ result }: { result: CompareResponse }) {
  const [isScoreInfoOpen, setIsScoreInfoOpen] = useState(false);
  const accounts = result.metrics.accounts as [AccountScore, AccountScore];
  const datasets = result.users as [UserDataset, UserDataset];
  const usernames = [accounts[0].username, accounts[1].username] as [string, string];
  const scoreByUsername = new Map(accounts.map((account) => [account.username, account]));
  const winner = result.metrics.winner?.username ?? null;

  return (
    <div className="results-stack">
      <section className="result-panel">
        <div className="panel-heading">
          <div className="title-with-action">
            <h2 className="panel-title">综合结果</h2>
            <button className="icon-text-button" type="button" onClick={() => setIsScoreInfoOpen(true)} title="查看总分构成">
              <Info size={17} aria-hidden="true" />
              总分说明
            </button>
          </div>
          {winner ? (
            <div className="winner-row">
              <Trophy size={20} aria-hidden="true" />
              最终总分赢家：{winner}
            </div>
          ) : (
            <div className="muted">势均力敌</div>
          )}
        </div>
        <div className="account-grid">
          {datasets.map((dataset) => {
            const score = scoreByUsername.get(dataset.profile.login);
            if (!score) {
              return null;
            }

            return <AccountSummary key={dataset.profile.login} dataset={dataset} score={score} />;
          })}
        </div>
      </section>

      <OverviewComparison datasets={datasets} />

      <div className="content-grid">
        <MetricTable accounts={accounts} />
        <section className="chart-panel">
          <RadarComparisonChart data={result.metrics.radar} usernames={usernames} />
        </section>
      </div>

      <AnalysisPanel result={result} usernames={usernames} finalWinner={winner} />
      {isScoreInfoOpen ? <ScoreInfoModal onClose={() => setIsScoreInfoOpen(false)} /> : null}
    </div>
  );
}

export function ComparisonTool({ initialUsers = {} }: { initialUsers?: InitialUsers }) {
  const [form, setForm] = useState<FormState>({
    left: initialUsers.left ?? "",
    right: initialUsers.right ?? "",
    locale: "zh-CN"
  });
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [timeline, setTimeline] = useState<ModelTimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingSubtitleIndex, setLoadingSubtitleIndex] = useState(0);
  const [activeComparisonUsers, setActiveComparisonUsers] = useState<[string, string] | null>(null);

  const canSubmit = useMemo(() => {
    return form.left.trim().length > 0 && form.right.trim().length > 0 && !isLoading;
  }, [form.left, form.right, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setLoadingSubtitleIndex((current) => (current + 1) % loadingSubtitles.length);
    }, 3_600);

    return () => window.clearInterval(intervalId);
  }, [isLoading]);

  const submitComparison = useCallback(async () => {
    if (!canSubmit) {
      return;
    }

    const left = form.left.trim();
    const right = form.right.trim();

    window.history.replaceState(null, "", buildComparisonUrl(left, right));
    setIsLoading(true);
    setError(null);
    setResult(null);
    setTimeline([]);
    setLoadingSubtitleIndex(0);
    setActiveComparisonUsers([left, right]);

    try {
      const response = await fetch("/api/compare/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          users: [left, right],
          locale: form.locale
        })
      });

      if (!response.ok) {
        const payload = (await response.json()) as unknown;
        const message = isApiErrorResponse(payload) ? payload.error.message : "请求失败。";
        throw new Error(message);
      }

      if (!response.body) {
        throw new Error("浏览器不支持流式响应。");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          const streamEvent = JSON.parse(line) as unknown;
          if (!isCompareStreamEvent(streamEvent)) {
            continue;
          }

          if (streamEvent.type === "timeline") {
            setTimeline((current) => [...current, streamEvent.event]);
          }

          if (streamEvent.type === "result") {
            setResult(streamEvent.result);
            setTimeline(streamEvent.result.timeline);
          }

          if (streamEvent.type === "error") {
            throw new Error(streamEvent.error.message);
          }
        }
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "请求失败。");
      setResult(null);
    } finally {
      setIsLoading(false);
      setActiveComparisonUsers(null);
      setLoadingSubtitleIndex(0);
    }
  }, [canSubmit, form.left, form.locale, form.right]);

  // Auto-starting from query parameters is paused for now.
  // useEffect(() => {
  //   if (!initialUsers.left || !initialUsers.right) {
  //     return;
  //   }
  //
  //   const timeoutId = window.setTimeout(() => {
  //     void submitComparison();
  //   }, 0);
  //
  //   return () => window.clearTimeout(timeoutId);
  // }, [initialUsers.left, initialUsers.right, submitComparison]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitComparison();
  }

  return (
    <div className="workspace">
      <section className="control-panel">
        <div className="brand-row">
          <div className="brand-mark">
            <Swords size={24} aria-hidden="true" />
          </div>
          <div>
            <h1 className="brand-title">GitHub 账号比拼</h1>
            <p className="brand-kicker">profile competition</p>
          </div>
        </div>

        <form className="compare-form" onSubmit={handleSubmit}>
          <label className="field-group">
            <span className="field-label">账号 A</span>
            <input
              className="text-input"
              value={form.left}
              onChange={(event) => setForm((current) => ({ ...current, left: event.target.value }))}
              placeholder="torvalds"
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <label className="field-group">
            <span className="field-label">账号 B</span>
            <input
              className="text-input"
              value={form.right}
              onChange={(event) => setForm((current) => ({ ...current, right: event.target.value }))}
              placeholder="gaearon"
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <label className="field-group">
            <span className="field-label">语言</span>
            <select
              className="select-input"
              value={form.locale}
              onChange={(event) => setForm((current) => ({ ...current, locale: event.target.value }))}
            >
              <option value="zh-CN">中文</option>
            </select>
          </label>

          <button className="submit-button" type="submit" disabled={!canSubmit} title="Start comparison">
            {isLoading ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
            {isLoading ? "分析中" : "开始比拼"}
          </button>
        </form>

        <p className="source-note">GitHub API 和公开页面提供上下文，评价内容始终由已配置的大模型生成。</p>
      </section>

      <section className="results-stack">
        <TimelinePanel timeline={timeline} isLoading={isLoading} />
        {error ? (
          <ErrorState message={error} />
        ) : result ? (
          <Results result={result} />
        ) : isLoading ? (
          <LoadingState users={activeComparisonUsers} subtitle={loadingSubtitles[loadingSubtitleIndex]} />
        ) : (
          <EmptyState />
        )}
      </section>
    </div>
  );
}
