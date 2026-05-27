"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Check,
  Copy,
  ExternalLink,
  ImageDown,
  Info,
  LoaderCircle,
  RefreshCw,
  Search,
  Swords,
  Trophy,
  X
} from "lucide-react";
import {
  createContext,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  AccountScore,
  ApiErrorResponse,
  CompareResponse,
  CompareStreamEvent,
  GitHubRepository,
  LocaleCode,
  ModelTimelineEvent,
  UserDataset
} from "@/lib/types";
import { getMessages, normalizeLocaleCode, type Messages } from "@/i18n/messages";
import { createSharePayload, SHARE_VALID_DAYS } from "@/lib/share";
import { ShareImageModal } from "@/components/ShareImageModal";

type ComparisonMessages = Messages["comparison"];
type ComparisonI18nContextValue = {
  appMessages: Messages["app"];
  locale: LocaleCode;
  messages: ComparisonMessages;
};

const fallbackMessages = getMessages("zh-CN").comparison;
const ComparisonI18nContext = createContext<ComparisonI18nContextValue | null>(null);

function useComparisonI18n(): ComparisonI18nContextValue {
  const context = useContext(ComparisonI18nContext);
  if (!context) {
    throw new Error("Comparison i18n context is missing.");
  }

  return context;
}

const RadarComparisonChart = dynamic(
  () => import("@/components/RadarComparisonChart").then((module) => module.RadarComparisonChart),
  {
    ssr: false,
    loading: () => <div className="chart-loading">{fallbackMessages.chartLoading}</div>
  }
);

const repositoryIssueUrl = "https://github.com/agoudbg/github-profile-competition/issues/new";

type FormState = {
  left: string;
  right: string;
  locale: LocaleCode;
};

type InitialUsers = {
  left?: string;
  right?: string;
  locale?: LocaleCode;
  autoStart?: boolean;
};

type ComparisonRow = {
  label: string;
  left: ReactNode;
  right: ReactNode;
};

type ShareStatus = "idle" | "copied" | "failed";

type AvatarLoadState = {
  left: boolean;
  right: boolean;
};

type AccountOutcome = "winner" | "loser" | "neutral";
type DuelDirection = "left" | "right";

type BattleOverlayState = {
  id: number;
  users: [string, string];
};

type DuelPath = {
  key: string;
  runId: number;
  x: number;
  y: number;
  length: number;
  impactX: number;
  angle: number;
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

function formatNumber(value: number, locale: LocaleCode): string {
  return new Intl.NumberFormat(locale).format(value);
}

function formatDate(value: string | null, messages: ComparisonMessages, locale: LocaleCode): string {
  if (!value) {
    return messages.common.notAvailable;
  }

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function formatDateTime(value: string, messages: ComparisonMessages, locale: LocaleCode): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return messages.common.unknownTime;
  }

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function sumRepositories(repositories: GitHubRepository[], selector: (repository: GitHubRepository) => number): number {
  return repositories.reduce((total, repository) => total + selector(repository), 0);
}

function getTopRepositories(repositories: GitHubRepository[]): GitHubRepository[] {
  return [...repositories]
    .sort((left, right) => right.stargazersCount + right.forksCount - (left.stargazersCount + left.forksCount))
    .slice(0, 3);
}

function getTopLanguages(dataset: UserDataset, messages: ComparisonMessages): string {
  const languages = Object.entries(dataset.languageDistribution)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([language]) => language);

  return languages.length > 0 ? languages.join(" / ") : messages.common.notAvailable;
}

function buildComparisonUrl(left: string, right: string, locale: LocaleCode): string {
  const query = new URLSearchParams({
    a: left,
    b: right,
    locale
  });

  return `?${query.toString()}`;
}

function buildShareComparisonUrl(left: string, right: string, locale: LocaleCode): string {
  const query = new URLSearchParams({
    a: left,
    b: right,
    locale,
    share: "1"
  });

  return `?${query.toString()}`;
}

function getAbsoluteUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

function buildGitHubAvatarUrl(username: string): string {
  return `https://github.com/${encodeURIComponent(username)}.png?size=180`;
}

function buildDataIssueUrl(usernames: [string, string], messages: ComparisonMessages): string {
  const query = new URLSearchParams({
    title: messages.dataIssue.title(usernames[0], usernames[1]),
    body: messages.dataIssue.body(usernames[0], usernames[1]).join("\n")
  });

  return `${repositoryIssueUrl}?${query.toString()}`;
}

function renderRepositoryList(repositories: GitHubRepository[], messages: ComparisonMessages, locale: LocaleCode): ReactNode {
  const topRepositories = getTopRepositories(repositories);

  if (topRepositories.length === 0) {
    return <span className="muted">{messages.repository.empty}</span>;
  }

  return (
    <ul className="top-repo-list compact">
      {topRepositories.map((repository) => (
        <li key={repository.id}>
          <a href={repository.htmlUrl} target="_blank" rel="noreferrer">
            {repository.name}
          </a>
          <span className="repo-meta">
            {messages.common.starsAndForks(formatNumber(repository.stargazersCount, locale), formatNumber(repository.forksCount, locale))}
          </span>
        </li>
      ))}
    </ul>
  );
}

function TextWithFootnotes({
  text,
  sourceIndexById
}: {
  text: string;
  sourceIndexById: Map<string, number>;
}) {
  const { messages } = useComparisonI18n();
  const parts = text.split(/(\[\^[^\]]+\])/g);

  return (
    <>
      {parts.map((part, index) => {
        const match = part.match(/^\[\^([^\]]+)\]$/);
        if (!match) {
          return <span key={`${part}-${index}`}>{part}</span>;
        }

        const id = match[1] ?? "";
        const footnoteNumber = sourceIndexById.get(id);
        return (
          <a
            className={footnoteNumber ? "footnote-ref" : "footnote-ref missing"}
            href={`#source-${id}`}
            key={`${part}-${index}`}
            title={footnoteNumber ? messages.footnotes.viewSource(id) : messages.footnotes.missingSource}
          >
            [{footnoteNumber ?? "?"}]
          </a>
        );
      })}
    </>
  );
}

function EmptyState() {
  const { messages } = useComparisonI18n();

  return (
    <section className="empty-panel" aria-live="polite">
      <div>
        <BarChart3 size={42} aria-hidden="true" />
        <h2>{messages.empty.title}</h2>
        <p>{messages.empty.description}</p>
      </div>
    </section>
  );
}

function BattleOverlay({
  animation,
  onComplete
}: {
  animation: BattleOverlayState;
  onComplete: (id: number) => void;
}) {
  const { messages } = useComparisonI18n();
  const matchup = `${animation.users[0]} vs ${animation.users[1]}`;
  const [avatarLoadState, setAvatarLoadState] = useState<AvatarLoadState>({ left: false, right: false });
  const battleAvatars = useMemo(() => {
    return [
      { side: "left" as const, username: animation.users[0], avatarUrl: buildGitHubAvatarUrl(animation.users[0]) },
      { side: "right" as const, username: animation.users[1], avatarUrl: buildGitHubAvatarUrl(animation.users[1]) }
    ];
  }, [animation.users]);
  const areAvatarsReady = avatarLoadState.left && avatarLoadState.right;

  useEffect(() => {
    if (!areAvatarsReady) {
      return;
    }

    const timeoutId = window.setTimeout(() => onComplete(animation.id), 5_200);

    return () => window.clearTimeout(timeoutId);
  }, [animation.id, areAvatarsReady, onComplete]);

  const markAvatarLoaded = useCallback((side: keyof AvatarLoadState) => {
    setAvatarLoadState((current) => ({ ...current, [side]: true }));
  }, []);

  return (
    <div
      className={areAvatarsReady ? "battle-stage ready" : "battle-stage"}
      aria-label={messages.battle.ariaLabel(matchup)}
      onAnimationEnd={(event) => {
        if (event.currentTarget === event.target) {
          onComplete(animation.id);
        }
      }}
    >
      {battleAvatars.map((avatar) => (
        <div className={`battle-avatar battle-avatar-${avatar.side}`} key={avatar.side}>
          <Image
            src={avatar.avatarUrl}
            alt={messages.battle.avatarAlt(avatar.username)}
            width={92}
            height={92}
            priority
            onLoad={() => markAvatarLoaded(avatar.side)}
            onError={() => markAvatarLoaded(avatar.side)}
          />
          <span>@{avatar.username}</span>
        </div>
      ))}
      {areAvatarsReady ? (
        <div className="battle-vs" aria-hidden="true">
          <span>VS</span>
        </div>
      ) : (
        <div className="battle-avatar-loader" aria-hidden="true">
          <LoaderCircle className="spin" size={28} />
        </div>
      )}
    </div>
  );
}

function LoadingState({
  users,
  subtitle
}: {
  users: [string, string] | null;
  subtitle: string;
}) {
  const { messages } = useComparisonI18n();
  const matchup = users ? `${users[0]} vs ${users[1]}` : messages.loading.fallbackMatchup;

  return (
    <section className="loading-panel" aria-live="polite" aria-busy="true">
      <div>
        <div className="loading-mark" aria-hidden="true">
          <LoaderCircle className="spin" size={34} />
        </div>
        <p className="loading-kicker">{matchup}</p>
        <h2>{messages.loading.title}</h2>
        <p>{subtitle}</p>
      </div>
    </section>
  );
}

function ErrorState({ message }: { message: string }) {
  const { messages } = useComparisonI18n();

  return (
    <section className="error-panel" role="alert">
      <div>
        <AlertTriangle className="error-icon" size={42} aria-hidden="true" />
        <h2>{messages.error.title}</h2>
        <p>{message}</p>
      </div>
    </section>
  );
}

function TimelinePanel({ timeline, isLoading }: { timeline: ModelTimelineEvent[]; isLoading: boolean }) {
  const { locale, messages } = useComparisonI18n();
  const [isExpanded, setIsExpanded] = useState(false);
  const listWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    const listWrapElement = listWrapRef.current;
    if (!listWrapElement) {
      return;
    }

    listWrapElement.scrollTop = listWrapElement.scrollHeight;
  }, [isLoading, timeline.length]);

  if (timeline.length === 0) {
    return null;
  }

  const shouldShowTimeline = isLoading || isExpanded;

  return (
    <section className="timeline-panel" aria-label={messages.timeline.ariaLabel}>
      <div className={shouldShowTimeline ? "panel-heading" : "panel-heading timeline-heading-collapsed"}>
        <div>
          <h2 className="panel-title">{messages.timeline.title}</h2>
          <p className="panel-subtitle">{messages.timeline.subtitle}</p>
        </div>
        <div className="timeline-actions">
          {isLoading ? (
            <span className="live-badge">{messages.timeline.streaming}</span>
          ) : (
            <span className="live-badge done">{messages.timeline.done}</span>
          )}
          {!isLoading ? (
            <button
              aria-expanded={isExpanded}
              className="icon-text-button"
              type="button"
              onClick={() => setIsExpanded((current) => !current)}
              title={isExpanded ? messages.timeline.hideTitle : messages.timeline.showTitle}
            >
              {isExpanded ? <ChevronUp size={17} aria-hidden="true" /> : <ChevronDown size={17} aria-hidden="true" />}
              {isExpanded ? messages.timeline.collapse : messages.timeline.expand}
            </button>
          ) : null}
        </div>
      </div>
      {shouldShowTimeline ? (
        <div className={isLoading ? "timeline-list-wrap live" : "timeline-list-wrap"} ref={listWrapRef}>
          <ol className="timeline-list">
            {timeline.map((event) => (
              <li className={`timeline-item ${event.status}`} key={event.id}>
                <div className="timeline-dot" aria-hidden="true" />
                <div className="timeline-content">
                  <div className="timeline-head">
                    <span>{event.title}</span>
                    <time>{new Date(event.at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
                  </div>
                  <p>{event.detail}</p>
                  {event.sourceIds?.length ? (
                    <div className="timeline-sources">
                      {event.sourceIds.map((sourceId) => (
                        <span key={sourceId}>{messages.timeline.sourceLabel(sourceId)}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
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
  const { messages } = useComparisonI18n();

  return (
    <section className="comparison-panel">
      <div className="panel-heading">
        <h2 className="panel-title">{title}</h2>
      </div>
      <div className="comparison-table" role="table" aria-label={title}>
        <div className="comparison-row comparison-head" role="row">
          <div role="columnheader">{messages.comparisonRows.itemColumn}</div>
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

function AccountSummary({
  dataset,
  score,
  outcome,
  avatarRef,
  isOutcomeEffectActive,
  effectDirection
}: {
  dataset: UserDataset;
  score: AccountScore;
  outcome: AccountOutcome;
  avatarRef?: (element: HTMLDivElement | null) => void;
  isOutcomeEffectActive: boolean;
  effectDirection: DuelDirection;
}) {
  const { locale, messages } = useComparisonI18n();
  const outcomeClass = outcome === "neutral" ? "" : `account-card-${outcome}`;
  const actionClass = isOutcomeEffectActive && outcome !== "neutral" ? "account-card-duel-active" : "";
  const avatarActionStyle = {
    "--avatar-action-direction": effectDirection === "left" ? "-1" : "1"
  } as CSSProperties;

  return (
    <article className={`account-card ${outcomeClass} ${actionClass}`}>
      <div className="account-heading">
        <div className="avatar-frame" ref={avatarRef} style={avatarActionStyle}>
          {outcome === "winner" && isOutcomeEffectActive ? <span className="winner-hat" aria-hidden="true" /> : null}
          {outcome === "winner" && isOutcomeEffectActive ? <span className="attack-arc" aria-hidden="true" /> : null}
          {outcome === "loser" && isOutcomeEffectActive ? <span className="hit-burst" aria-hidden="true" /> : null}
          <Image
            className="avatar"
            src={dataset.profile.avatarUrl}
            alt={messages.account.avatarAlt(dataset.profile.login)}
            width={58}
            height={58}
          />
        </div>
        <div className="account-name">
          <h3>{dataset.profile.name ?? dataset.profile.login}</h3>
          <p>@{dataset.profile.login}</p>
        </div>
        <a className="profile-link" href={dataset.profile.htmlUrl} target="_blank" rel="noreferrer" title={messages.account.profileLinkTitle}>
          <ExternalLink size={19} aria-hidden="true" />
        </a>
      </div>

      <div className="score-line">
        <div>
          <div className="score-number">{score.totalScore}</div>
          <div className="score-label">{messages.account.finalScore}</div>
        </div>
        <div className="score-caption">{messages.account.confidence(dataset.contributions.confidence)}</div>
      </div>
      <div className="score-bar" aria-hidden="true">
        <div className="score-fill" style={{ width: `${score.totalScore}%` }} />
      </div>

      <div className="score-breakdown" aria-label={messages.account.scoreBreakdownLabel(dataset.profile.login)}>
        <span>{messages.account.systemScore(score.systemScore)}</span>
        <span>{messages.account.llmScore(score.llmScore ?? messages.common.notAvailable)}</span>
      </div>

      <div className="pill-row">
        <span className="pill">{messages.account.followers(formatNumber(dataset.profile.followers, locale))}</span>
        <span className="pill">{messages.account.repositories(formatNumber(dataset.profile.publicRepos, locale))}</span>
        <span className="pill">{getTopLanguages(dataset, messages)}</span>
      </div>
    </article>
  );
}

function ResultShareActions({
  result,
  usernames
}: {
  result: CompareResponse;
  usernames: [string, string];
}) {
  const { locale, messages } = useComparisonI18n();
  const [shareStatus, setShareStatus] = useState<ShareStatus>("idle");
  const [isShareImageOpen, setIsShareImageOpen] = useState(false);
  const resetTimerRef = useRef<number | null>(null);
  const [leftUsername, rightUsername] = usernames;
  const sharePath = buildShareComparisonUrl(leftUsername, rightUsername, locale);
  const sharePayload = useMemo(() => {
    return createSharePayload(result, getAbsoluteUrl(sharePath));
  }, [result, sharePath]);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const queueStatusReset = useCallback(() => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }

    resetTimerRef.current = window.setTimeout(() => {
      setShareStatus("idle");
      resetTimerRef.current = null;
    }, 2_400);
  }, []);

  const copyShareLink = useCallback(async () => {
    const shareUrl = getAbsoluteUrl(sharePath);

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus("copied");
    } catch {
      setShareStatus("failed");
    } finally {
      queueStatusReset();
    }
  }, [queueStatusReset, sharePath]);

  const statusText = shareStatus === "copied" ? messages.share.copied : shareStatus === "failed" ? messages.share.failed : null;

  return (
    <>
      <div className="share-panel" aria-label={messages.share.ariaLabel}>
        <div>
          <h3>{messages.share.title}</h3>
          <p>{messages.share.validDays(SHARE_VALID_DAYS)}</p>
        </div>
        <div className="share-actions">
          <button className="icon-text-button" type="button" onClick={copyShareLink} title={messages.share.copyTitle}>
            {shareStatus === "copied" ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
            {messages.share.copy}
          </button>
          <button className="icon-text-button" type="button" onClick={() => setIsShareImageOpen(true)} title={messages.share.imageTitle}>
            <ImageDown size={17} aria-hidden="true" />
            {messages.share.image}
          </button>
        </div>
        {statusText ? <span className="share-status">{statusText}</span> : null}
      </div>
      {isShareImageOpen ? <ShareImageModal locale={locale} payload={sharePayload} onClose={() => setIsShareImageOpen(false)} /> : null}
    </>
  );
}

function ScoreInfoModal({ onClose }: { onClose: () => void }) {
  const { messages } = useComparisonI18n();
  const scoreFormulaRows = messages.scoreFormulaRows;
  const dimensionFormulaRows = messages.dimensionFormulaRows;

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
            <h2 id="score-modal-title">{messages.scoreInfo.title}</h2>
            <p>{messages.scoreInfo.description}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title={messages.scoreInfo.close}>
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
          <h3>{messages.scoreInfo.dimensionTitle}</h3>
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
  const { locale, messages } = useComparisonI18n();
  const [left, right] = datasets;
  const rows: ComparisonRow[] = [
    {
      label: messages.overview.publicImpact,
      left: messages.overview.followersFollowing(formatNumber(left.profile.followers, locale), formatNumber(left.profile.following, locale)),
      right: messages.overview.followersFollowing(formatNumber(right.profile.followers, locale), formatNumber(right.profile.following, locale))
    },
    {
      label: messages.overview.repositoryScale,
      left: messages.overview.reposGists(formatNumber(left.profile.publicRepos, locale), formatNumber(left.profile.publicGists, locale)),
      right: messages.overview.reposGists(formatNumber(right.profile.publicRepos, locale), formatNumber(right.profile.publicGists, locale))
    },
    {
      label: messages.overview.projectImpact,
      left: messages.common.starsAndForks(
        formatNumber(sumRepositories(left.repositories, (repository) => repository.stargazersCount), locale),
        formatNumber(sumRepositories(left.repositories, (repository) => repository.forksCount), locale)
      ),
      right: messages.common.starsAndForks(
        formatNumber(sumRepositories(right.repositories, (repository) => repository.stargazersCount), locale),
        formatNumber(sumRepositories(right.repositories, (repository) => repository.forksCount), locale)
      )
    },
    {
      label: messages.overview.contributionSignals,
      left: messages.overview.contributionSignalsValue(
        formatNumber(left.contributions.totalContributions, locale),
        formatNumber(left.contributions.activeDays, locale)
      ),
      right: messages.overview.contributionSignalsValue(
        formatNumber(right.contributions.totalContributions, locale),
        formatNumber(right.contributions.activeDays, locale)
      )
    },
    {
      label: messages.overview.topLanguages,
      left: getTopLanguages(left, messages),
      right: getTopLanguages(right, messages)
    },
    {
      label: messages.overview.profileUpdated,
      left: formatDate(left.profile.updatedAt, messages, locale),
      right: formatDate(right.profile.updatedAt, messages, locale)
    },
    {
      label: messages.overview.featuredRepositories,
      left: renderRepositoryList(left.repositories, messages, locale),
      right: renderRepositoryList(right.repositories, messages, locale)
    }
  ];

  return (
    <ComparisonRows title={messages.overview.title} leftUsername={left.profile.login} rightUsername={right.profile.login} rows={rows} />
  );
}

function MetricTable({ accounts }: { accounts: [AccountScore, AccountScore] }) {
  const { messages } = useComparisonI18n();
  const [left, right] = accounts;
  const usernames = [left.username, right.username] as [string, string];

  return (
    <section className="metric-table-wrap" aria-label={messages.metrics.ariaLabel}>
      <table className="metric-table">
        <thead>
          <tr>
            <th>{messages.metrics.dimension}</th>
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
                  <span className="dimension-detail">{rightDimension?.detail ?? messages.common.notAvailable}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="metric-table-footer">
        <a className="dimension-issue-link" href={buildDataIssueUrl(usernames, messages)} target="_blank" rel="noreferrer">
          {messages.metrics.reportIssue}
        </a>
      </div>
    </section>
  );
}

function getSourceIndexById(result: CompareResponse): Map<string, number> {
  return new Map(result.llm.analysis.sources.map((source, index) => [source.id, index + 1]));
}

function AnalysisSummaryCard({ result }: { result: CompareResponse }) {
  const { messages } = useComparisonI18n();
  const sourceIndexById = getSourceIndexById(result);

  return (
    <section className="analysis-panel">
      <div className="panel-heading">
        <div>
          <h2 className="panel-title">{messages.analysis.summaryTitle}</h2>
          <p className="analysis-summary">
            <TextWithFootnotes text={result.llm.analysis.summary} sourceIndexById={sourceIndexById} />
          </p>
        </div>
        {result.llm.analysis.winner ? (
          <div className="winner-row">
            <Trophy size={20} aria-hidden="true" />
            {messages.analysis.winnerLabel(result.llm.analysis.winner.username)}
          </div>
        ) : (
          <div className="muted">{messages.analysis.closeResult}</div>
        )}
      </div>

      {result.llm.analysis.winner ? (
        <p className="winner-reason">
          <TextWithFootnotes text={result.llm.analysis.winner.reason} sourceIndexById={sourceIndexById} />
        </p>
      ) : null}
    </section>
  );
}

function AnalysisDetailCards({
  result,
  usernames,
  finalWinner
}: {
  result: CompareResponse;
  usernames: [string, string];
  finalWinner: string | null;
}) {
  const { messages } = useComparisonI18n();
  const [leftUsername, rightUsername] = usernames;
  const analysisByUsername = new Map(result.llm.analysis.accountAnalyses.map((analysis) => [analysis.username, analysis]));
  const accountAnalysisCards = usernames.flatMap((username) => {
    const accountAnalysis = analysisByUsername.get(username);

    return accountAnalysis ? [{ username, accountAnalysis }] : [];
  });
  const sourceIndexById = getSourceIndexById(result);

  return (
    <>
      {result.llm.analysis.accountScores.length > 0 ? (
        <section className="analysis-panel">
          <div className="panel-heading">
            <h2 className="panel-title">{messages.analysis.scoringTitle}</h2>
          </div>
          <div className="llm-score-grid">
            {result.llm.analysis.accountScores.map((item) => (
              <article className={item.username === finalWinner ? "llm-score-card winner" : "llm-score-card"} key={item.username}>
                <div>
                  <h3>{item.username}</h3>
                  <p>
                    <TextWithFootnotes text={item.reason} sourceIndexById={sourceIndexById} />
                  </p>
                </div>
                <span>{item.score}</span>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {result.llm.analysis.dimensionInsights.length > 0 ? (
        <section className="analysis-panel">
          <div className="panel-heading">
            <h2 className="panel-title">{messages.analysis.dimensionInsightsTitle}</h2>
          </div>
          <div className="llm-dimension-stack">
            {result.llm.analysis.dimensionInsights.map((item) => {
              const leftInsight =
                item.accounts.find((account) => account.username === leftUsername)?.insight ?? messages.analysis.missingAccountInsight;
              const rightInsight =
                item.accounts.find((account) => account.username === rightUsername)?.insight ?? messages.analysis.missingAccountInsight;

              return (
                <article className="llm-dimension" key={item.dimension}>
                  <div className="llm-dimension-head">
                    <h3>{item.title}</h3>
                    <span>
                      <TextWithFootnotes text={item.verdict} sourceIndexById={sourceIndexById} />
                    </span>
                  </div>
                  <div className="two-column-copy">
                    <div>
                      <h4>{leftUsername}</h4>
                      <p>
                        <TextWithFootnotes text={leftInsight} sourceIndexById={sourceIndexById} />
                      </p>
                    </div>
                    <div>
                      <h4>{rightUsername}</h4>
                      <p>
                        <TextWithFootnotes text={rightInsight} sourceIndexById={sourceIndexById} />
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {accountAnalysisCards.length > 0 ? (
        <section className="analysis-panel">
          <div className="panel-heading">
            <h2 className="panel-title">{messages.analysis.accountAnalysisTitle}</h2>
          </div>
          <div className="account-analysis-grid">
            {accountAnalysisCards.map(({ username, accountAnalysis }) => (
              <article className="account-analysis" key={username}>
                <h3>{username}</h3>
                <AnalysisList title={messages.analysis.strengths} items={accountAnalysis.strengths} sourceIndexById={sourceIndexById} />
                <AnalysisList title={messages.analysis.risks} items={accountAnalysis.risks} sourceIndexById={sourceIndexById} />
                <AnalysisList
                  title={messages.analysis.recommendations}
                  items={accountAnalysis.recommendations}
                  sourceIndexById={sourceIndexById}
                />
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {result.llm.analysis.caveats.length > 0 || result.llm.analysis.sources.length > 0 ? (
        <section className="analysis-panel">
          {result.llm.analysis.caveats.length > 0 ? (
            <div>
              <h2 className="panel-title">{messages.analysis.caveatsTitle}</h2>
              <ul className="caveat-list">
                {result.llm.analysis.caveats.map((item) => (
                  <li key={item}>
                    <TextWithFootnotes text={item} sourceIndexById={sourceIndexById} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.llm.analysis.sources.length > 0 ? (
            <div className="source-footnotes">
              <h3>{messages.analysis.sourcesTitle}</h3>
              <ol>
                {result.llm.analysis.sources.map((source, index) => (
                  <li id={`source-${source.id}`} key={source.id}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      <strong>[{index + 1}] {source.id}</strong> {source.label}
                    </a>
                    <span className="source-footnote-note">{source.note}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

function AnalysisList({
  title,
  items,
  sourceIndexById
}: {
  title: string;
  items: string[];
  sourceIndexById: Map<string, number>;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="analysis-list-block">
      <h4>{title}</h4>
      <ul className="recommendation-list">
        {items.map((item) => (
          <li key={item}>
            <TextWithFootnotes text={item} sourceIndexById={sourceIndexById} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CacheNotice({
  cachedAt,
  isLoading,
  onRegenerate
}: {
  cachedAt: string;
  isLoading: boolean;
  onRegenerate: () => void;
}) {
  const { locale, messages } = useComparisonI18n();

  return (
    <section className="cache-panel" aria-live="polite">
      <div>
        <h2>{messages.cache.title}</h2>
        <p>
          {messages.cache.cachedAtLabel}
          <time dateTime={cachedAt}>{formatDateTime(cachedAt, messages, locale)}</time>
        </p>
      </div>
      <button
        className="icon-text-button"
        type="button"
        onClick={onRegenerate}
        disabled={isLoading}
        title={messages.cache.regenerateTitle}
      >
        {isLoading ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <RefreshCw size={17} aria-hidden="true" />}
        {messages.cache.regenerate}
      </button>
    </section>
  );
}

function Results({
  result,
  isLoading,
  onRegenerate
}: {
  result: CompareResponse;
  isLoading: boolean;
  onRegenerate: () => void;
}) {
  const { locale, messages } = useComparisonI18n();
  const [isScoreInfoOpen, setIsScoreInfoOpen] = useState(false);
  const resultPanelRef = useRef<HTMLElement | null>(null);
  const avatarRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const duelRunIdRef = useRef(0);
  const [activeDuelKey, setActiveDuelKey] = useState<string | null>(null);
  const [duelPath, setDuelPath] = useState<DuelPath | null>(null);
  const accounts = result.metrics.accounts as [AccountScore, AccountScore];
  const datasets = result.users as [UserDataset, UserDataset];
  const usernames = [accounts[0].username, accounts[1].username] as [string, string];
  const scoreByUsername = new Map(accounts.map((account) => [account.username, account]));
  const winner = result.metrics.winner?.username ?? null;
  const winnerKey = winner?.toLowerCase() ?? null;
  const loser = winner
    ? datasets.find((dataset) => dataset.profile.login.toLowerCase() !== winner.toLowerCase())?.profile.login ?? null
    : null;
  const loserKey = loser?.toLowerCase() ?? null;
  const winnerIndex = winnerKey ? datasets.findIndex((dataset) => dataset.profile.login.toLowerCase() === winnerKey) : -1;
  const loserIndex = loserKey ? datasets.findIndex((dataset) => dataset.profile.login.toLowerCase() === loserKey) : -1;
  const duelDirection: DuelDirection = winnerIndex >= 0 && loserIndex >= 0 && winnerIndex > loserIndex ? "left" : "right";
  const duelKey = winnerKey && loserKey ? `${result.requestedAt}-${winnerKey}-${loserKey}` : null;
  const activeDuelPath = duelPath?.key === activeDuelKey ? duelPath : null;
  const duelStyle = activeDuelPath
    ? ({
        "--duel-x": `${activeDuelPath.x}px`,
        "--duel-y": `${activeDuelPath.y}px`,
        "--duel-length": `${activeDuelPath.length}px`,
        "--duel-impact-x": `${activeDuelPath.impactX}px`,
        "--duel-angle": `${activeDuelPath.angle}deg`
      } as CSSProperties)
    : undefined;

  const setAvatarRef = useCallback((username: string, element: HTMLDivElement | null) => {
    avatarRefs.current[username.toLowerCase()] = element;
  }, []);

  const updateDuelPath = useCallback(() => {
    if (!activeDuelKey || !duelKey || !winnerKey || !loserKey) {
      return;
    }

    const winnerAvatarElement = avatarRefs.current[winnerKey];
    const loserAvatarElement = avatarRefs.current[loserKey];

    if (!winnerAvatarElement || !loserAvatarElement) {
      return;
    }

    const winnerRect = winnerAvatarElement.getBoundingClientRect();
    const loserRect = loserAvatarElement.getBoundingClientRect();
    const startViewportX = winnerRect.left + winnerRect.width / 2;
    const startViewportY = winnerRect.top + winnerRect.height / 2;
    const endViewportX = loserRect.left + loserRect.width / 2;
    const endViewportY = loserRect.top + loserRect.height / 2;
    const deltaX = endViewportX - startViewportX;
    const deltaY = endViewportY - startViewportY;
    const distanceToLoser = Math.hypot(deltaX, deltaY);
    const rayLength = Math.max(distanceToLoser, 1);
    const unitX = deltaX / rayLength;
    const unitY = deltaY / rayLength;
    const edgeDistances = [
      unitX > 0 ? (window.innerWidth - startViewportX) / unitX : null,
      unitX < 0 ? -startViewportX / unitX : null,
      unitY > 0 ? (window.innerHeight - startViewportY) / unitY : null,
      unitY < 0 ? -startViewportY / unitY : null
    ].filter((distance): distance is number => typeof distance === "number" && Number.isFinite(distance) && distance > 0);
    const distanceToViewportEdge = edgeDistances.length > 0 ? Math.min(...edgeDistances) : distanceToLoser;

    setDuelPath({
      key: activeDuelKey,
      runId: duelRunIdRef.current,
      x: startViewportX,
      y: startViewportY,
      length: Math.max(distanceToViewportEdge + 260, distanceToLoser + 260, window.innerWidth * 0.6),
      impactX: distanceToLoser,
      angle: Math.atan2(deltaY, deltaX) * (180 / Math.PI)
    });
  }, [activeDuelKey, duelKey, loserKey, winnerKey]);

  useEffect(() => {
    const panelElement = resultPanelRef.current;

    if (isLoading || !winnerKey || !loserKey || !duelKey || !panelElement) {
      return;
    }

    const IntersectionObserverConstructor = globalThis.IntersectionObserver;
    let delayTimeoutId = 0;

    const queueDuelRun = () => {
      window.clearTimeout(delayTimeoutId);
      delayTimeoutId = window.setTimeout(() => {
        duelRunIdRef.current += 1;
        setActiveDuelKey(`${duelKey}:${duelRunIdRef.current}`);
      }, 500);
    };

    const resetDuelRun = () => {
      window.clearTimeout(delayTimeoutId);
      setActiveDuelKey(null);
      setDuelPath(null);
    };

    if (typeof IntersectionObserverConstructor !== "function") {
      const animationFrameId = globalThis.requestAnimationFrame(() => {
        queueDuelRun();
      });

      return () => {
        window.clearTimeout(delayTimeoutId);
        globalThis.cancelAnimationFrame(animationFrameId);
      };
    }

    const observer = new IntersectionObserverConstructor(
      ([entry]) => {
        if (entry?.isIntersecting) {
          queueDuelRun();
        } else {
          resetDuelRun();
        }
      },
      {
        threshold: 0.42
      }
    );

    observer.observe(panelElement);

    return () => {
      window.clearTimeout(delayTimeoutId);
      observer.disconnect();
    };
  }, [duelKey, isLoading, loserKey, winnerKey]);

  useEffect(() => {
    if (!activeDuelKey || !duelKey || !activeDuelKey.startsWith(`${duelKey}:`)) {
      return;
    }

    if (isLoading) {
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      updateDuelPath();
    });

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [activeDuelKey, duelKey, isLoading, updateDuelPath]);

  useEffect(() => {
    if (!activeDuelPath) {
      return;
    }

    let animationFrameId = 0;
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = window.requestAnimationFrame(updateDuelPath);
    };

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [activeDuelPath, updateDuelPath]);

  return (
    <div className="results-stack">
      {result.cache ? <CacheNotice cachedAt={result.cache.cachedAt} isLoading={isLoading} onRegenerate={onRegenerate} /> : null}

      {duelStyle && activeDuelPath ? (
        <div className="duel-viewport" aria-hidden="true" key={activeDuelPath.key}>
          <div className="duel-effect" style={duelStyle}>
            <span className="lightsaber-core" />
            <span className="lightsaber-impact-point" />
            <span className="lightsaber-speed speed-a" />
            <span className="lightsaber-speed speed-b" />
            <span className="lightsaber-speed speed-c" />
            <span className="lightsaber-spark spark-a" />
            <span className="lightsaber-spark spark-b" />
            <span className="lightsaber-spark spark-c" />
            <span className="lightsaber-spark spark-d" />
          </div>
        </div>
      ) : null}

      <section className="result-panel" ref={resultPanelRef}>
        <div className="panel-heading">
          <div className="title-with-action">
            <h2 className="panel-title">{messages.results.title}</h2>
            <button className="icon-text-button" type="button" onClick={() => setIsScoreInfoOpen(true)} title={messages.results.scoreInfoTitle}>
              <Info size={17} aria-hidden="true" />
              {messages.results.scoreInfo}
            </button>
          </div>
          {winner ? (
            <div className="winner-row">
              <Trophy size={20} aria-hidden="true" />
              {messages.results.winner(winner)}
            </div>
          ) : (
            <div className="muted">{messages.results.close}</div>
          )}
        </div>
        <div className="account-grid">
          {datasets.map((dataset) => {
            const score = scoreByUsername.get(dataset.profile.login);
            if (!score) {
              return null;
            }

            const datasetKey = dataset.profile.login.toLowerCase();
            const outcome: AccountOutcome = datasetKey === winnerKey ? "winner" : datasetKey === loserKey ? "loser" : "neutral";

            return (
              <AccountSummary
                key={dataset.profile.login}
                dataset={dataset}
                score={score}
                outcome={outcome}
                avatarRef={(element) => setAvatarRef(dataset.profile.login, element)}
                isOutcomeEffectActive={Boolean(duelStyle)}
                effectDirection={duelDirection}
              />
            );
          })}
        </div>
        <ResultShareActions result={result} usernames={usernames} />
      </section>

      <AnalysisSummaryCard result={result} />

      <OverviewComparison datasets={datasets} />

      <div className="content-grid">
        <MetricTable accounts={accounts} />
        <section className="chart-panel">
          <RadarComparisonChart data={result.metrics.radar} locale={locale} usernames={usernames} />
        </section>
      </div>

      <AnalysisDetailCards result={result} usernames={usernames} finalWinner={winner} />

      {isScoreInfoOpen ? <ScoreInfoModal onClose={() => setIsScoreInfoOpen(false)} /> : null}
    </div>
  );
}

export function ComparisonTool({ initialUsers = {} }: { initialUsers?: InitialUsers }) {
  const [form, setForm] = useState<FormState>({
    left: initialUsers.left ?? "",
    right: initialUsers.right ?? "",
    locale: initialUsers.locale ?? "zh-CN"
  });
  const localeMessages = getMessages(form.locale);
  const appMessages = localeMessages.app;
  const messages = localeMessages.comparison;
  const loadingSubtitles = messages.loadingSubtitles;
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [timeline, setTimeline] = useState<ModelTimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingSubtitleIndex, setLoadingSubtitleIndex] = useState(0);
  const [activeComparisonUsers, setActiveComparisonUsers] = useState<[string, string] | null>(null);
  const battleOverlayIdRef = useRef(0);
  const autoStartedComparisonKeyRef = useRef<string | null>(null);
  const [battleOverlay, setBattleOverlay] = useState<BattleOverlayState | null>(null);

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
  }, [isLoading, loadingSubtitles.length]);

  const submitComparison = useCallback(async (options: { forceRefresh?: boolean } = {}) => {
    if (!canSubmit) {
      return;
    }

    const left = form.left.trim();
    const right = form.right.trim();

    window.history.replaceState(null, "", buildComparisonUrl(left, right, form.locale));
    setIsLoading(true);
    setError(null);
    setResult(null);
    setTimeline([]);
    setLoadingSubtitleIndex(0);
    setActiveComparisonUsers([left, right]);
    battleOverlayIdRef.current += 1;
    setBattleOverlay({ id: battleOverlayIdRef.current, users: [left, right] });

    try {
      const response = await fetch("/api/compare/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          users: [left, right],
          locale: form.locale,
          ...(options.forceRefresh ? { forceRefresh: true } : {})
        })
      });

      if (!response.ok) {
        const payload = (await response.json()) as unknown;
        const message = isApiErrorResponse(payload) ? payload.error.message : messages.error.requestFailed;
        throw new Error(message);
      }

      if (!response.body) {
        throw new Error(messages.error.streamUnsupported);
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
      setError(submitError instanceof Error ? submitError.message : messages.error.requestFailed);
      setResult(null);
    } finally {
      setIsLoading(false);
      setActiveComparisonUsers(null);
      setLoadingSubtitleIndex(0);
    }
  }, [canSubmit, form.left, form.locale, form.right, messages.error.requestFailed, messages.error.streamUnsupported]);

  const regenerateComparison = useCallback(() => {
    void submitComparison({ forceRefresh: true });
  }, [submitComparison]);

  const completeBattleOverlay = useCallback((id: number) => {
    setBattleOverlay((current) => (current?.id === id ? null : current));
  }, []);

  const updateLocale = useCallback((locale: LocaleCode) => {
    setForm((current) => ({ ...current, locale }));
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("app-locale-change", { detail: { locale: form.locale } }));
  }, [form.locale]);

  useEffect(() => {
    if (!initialUsers.autoStart || !initialUsers.left || !initialUsers.right) {
      return;
    }

    const autoStartKey = `${initialUsers.left.trim()}\u0000${initialUsers.right.trim()}\u0000${initialUsers.locale ?? "zh-CN"}`;
    if (autoStartedComparisonKeyRef.current === autoStartKey) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      autoStartedComparisonKeyRef.current = autoStartKey;
      void submitComparison();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [initialUsers.autoStart, initialUsers.left, initialUsers.locale, initialUsers.right, submitComparison]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitComparison();
  }

  return (
    <ComparisonI18nContext.Provider value={{ appMessages, locale: form.locale, messages }}>
      {battleOverlay ? <BattleOverlay animation={battleOverlay} onComplete={completeBattleOverlay} key={battleOverlay.id} /> : null}
      <div className="workspace">
      <section className="control-panel">
        <div className="brand-row">
          <div className="brand-mark">
            <Swords size={24} aria-hidden="true" />
          </div>
          <div>
            <h1 className="brand-title">{appMessages.title}</h1>
            <p className="brand-kicker">{appMessages.tagline}</p>
          </div>
        </div>

        <form className="compare-form" onSubmit={handleSubmit}>
          <label className="field-group">
            <span className="field-label">{messages.form.leftAccount}</span>
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
            <span className="field-label">{messages.form.rightAccount}</span>
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
            <span className="field-label">{messages.form.language}</span>
            <select
              className="select-input"
              value={form.locale}
              onChange={(event) => updateLocale(normalizeLocaleCode(event.target.value))}
            >
              <option value="zh-CN">{messages.form.zhCN}</option>
              <option value="en-US">{messages.form.enUS}</option>
            </select>
          </label>

          <button className="submit-button" type="submit" disabled={!canSubmit} title={messages.form.submitTitle}>
            {isLoading ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
            {isLoading ? messages.form.loading : messages.form.submit}
          </button>
        </form>

        <p className="source-note">{messages.form.sourceNote}</p>
      </section>

      <section className="results-stack">
        <TimelinePanel
          timeline={timeline}
          isLoading={isLoading}
          key={isLoading ? "active-timeline" : result?.requestedAt ?? "idle-timeline"}
        />
        {error ? (
          <ErrorState message={error} />
        ) : result ? (
          <Results result={result} isLoading={isLoading} onRegenerate={regenerateComparison} />
        ) : isLoading ? (
          <LoadingState users={activeComparisonUsers} subtitle={loadingSubtitles[loadingSubtitleIndex]} />
        ) : (
          <EmptyState />
        )}
      </section>
      </div>
    </ComparisonI18nContext.Provider>
  );
}
