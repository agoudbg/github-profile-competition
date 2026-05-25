"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, LoaderCircle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { LeaderboardEntry, LeaderboardResponse } from "@/lib/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLeaderboardResponse(value: unknown): value is LeaderboardResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.entries) &&
    typeof value.page === "number" &&
    typeof value.pageSize === "number" &&
    typeof value.total === "number" &&
    typeof value.hasNextPage === "boolean"
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  return (
    <article className="leaderboard-row">
      <div className="leaderboard-rank">#{entry.rank}</div>
      <div className="leaderboard-profile">
        <Image
          className="leaderboard-avatar"
          src={entry.avatarUrl}
          alt={`${entry.username} avatar`}
          width={36}
          height={36}
        />
        <div>
          <a href={entry.profileUrl} target="_blank" rel="noreferrer">
            {entry.displayName ?? entry.username}
          </a>
          <span>@{entry.username}</span>
        </div>
      </div>
      <div className="leaderboard-total">
        <strong>{entry.totalScore}</strong>
        <span>系统总分</span>
      </div>
      <div className="leaderboard-dimensions" aria-label={`${entry.username} dimension scores`}>
        {entry.dimensions.map((dimension) => (
          <span key={dimension.key}>
            <b>{dimension.label}</b>
            {dimension.score}
          </span>
        ))}
      </div>
      <time className="leaderboard-updated" dateTime={entry.updatedAt}>
        {formatDateTime(entry.updatedAt)}
      </time>
    </article>
  );
}

export function LeaderboardPanel() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(true);

  const entries = leaderboard?.entries ?? [];
  const page = leaderboard?.page ?? 1;
  const pageSize = leaderboard?.pageSize ?? 100;
  const total = leaderboard?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canGoPrevious = page > 1 && !isLeaderboardLoading;
  const canGoNext = Boolean(leaderboard?.hasNextPage) && !isLeaderboardLoading;

  const fetchLeaderboardPage = useCallback(async (pageToLoad: number): Promise<LeaderboardResponse> => {
    try {
      const response = await fetch(`/api/leaderboard?page=${pageToLoad}`);
      const payload = (await response.json()) as unknown;

      if (!response.ok || !isLeaderboardResponse(payload)) {
        throw new Error("排行榜加载失败。");
      }

      return payload;
    } catch (error) {
      throw error instanceof Error ? error : new Error("排行榜加载失败。");
    }
  }, []);

  const loadLeaderboardPage = useCallback(
    async (pageToLoad: number) => {
      setIsLeaderboardLoading(true);
      setLeaderboardError(null);

      try {
        setLeaderboard(await fetchLeaderboardPage(pageToLoad));
      } catch (loadError) {
        setLeaderboardError(loadError instanceof Error ? loadError.message : "排行榜加载失败。");
      } finally {
        setIsLeaderboardLoading(false);
      }
    },
    [fetchLeaderboardPage]
  );

  useEffect(() => {
    let isActive = true;

    fetchLeaderboardPage(1)
      .then((nextLeaderboard) => {
        if (isActive) {
          setLeaderboard(nextLeaderboard);
        }
      })
      .catch((loadError: unknown) => {
        if (isActive) {
          setLeaderboardError(loadError instanceof Error ? loadError.message : "排行榜加载失败。");
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLeaderboardLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [fetchLeaderboardPage]);

  function handlePageChange(pageToLoad: number) {
    setLeaderboardPage(pageToLoad);
    void loadLeaderboardPage(pageToLoad);
  }

  return (
    <section className="leaderboard-panel" aria-label="排行榜">
      <div className="panel-heading leaderboard-heading">
        <div>
          <h1 className="panel-title">排行榜</h1>
          <p className="panel-subtitle">系统分榜单，不包含 LLM 判断分；历史记录保留，排名按每个用户最新一次计算。</p>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={() => void loadLeaderboardPage(leaderboardPage)}
          disabled={isLeaderboardLoading}
          title="刷新排行榜"
        >
          {isLeaderboardLoading ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <RefreshCw size={18} aria-hidden="true" />}
        </button>
      </div>

      {leaderboardError ? <div className="leaderboard-error">{leaderboardError}</div> : null}

      {entries.length > 0 ? (
        <div className="leaderboard-list">
          {entries.map((entry) => (
            <LeaderboardRow entry={entry} key={`${entry.rank}-${entry.username}-${entry.updatedAt}`} />
          ))}
        </div>
      ) : (
        <div className="leaderboard-empty">{isLeaderboardLoading ? "排行榜加载中" : "暂无排行榜记录"}</div>
      )}

      <div className="leaderboard-footer">
        <div className="leaderboard-meta">
          <span>
            {formatNumber(total)} / {formatNumber(leaderboard?.maxEntries ?? 1000)} 名
          </span>
          {leaderboard?.isTruncated ? <span>仅展示前 {formatNumber(leaderboard.maxEntries)} 名</span> : null}
        </div>
        <div className="leaderboard-pagination">
          <button
            className="icon-text-button"
            type="button"
            onClick={() => handlePageChange(page - 1)}
            disabled={!canGoPrevious}
            title="上一页"
          >
            <ChevronLeft size={16} aria-hidden="true" />
            上一页
          </button>
          <span>
            第 {formatNumber(page)} / {formatNumber(totalPages)} 页
          </span>
          <button
            className="icon-text-button"
            type="button"
            onClick={() => handlePageChange(page + 1)}
            disabled={!canGoNext}
            title="下一页"
          >
            下一页
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
