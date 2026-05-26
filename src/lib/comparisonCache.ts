import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { logServerError } from "@/lib/errors";
import type { CompareRequest, CompareResponse, LocaleCode, RadarPoint } from "@/lib/types";

const CACHE_RETENTION_DAYS = 30;
const CACHE_RETENTION_MS = CACHE_RETENTION_DAYS * 24 * 60 * 60 * 1_000;
const DEFAULT_DATABASE_PATH = join(process.cwd(), ".data", "comparison-cache.sqlite");
const LOCALES: ReadonlySet<string> = new Set<LocaleCode>(["zh-CN", "en-US"]);

export const COMPARISON_CACHE_SYSTEM_VERSION = 1;

type ComparisonCacheKey = {
  userAKey: string;
  userBKey: string;
  locale: LocaleCode;
};

type ComparisonCacheRow = {
  result_json: string;
  cached_at: string;
};

let database: DatabaseSync | null = null;

function getDatabasePath(): string {
  return process.env.COMPARISON_CACHE_DATABASE_PATH?.trim() || DEFAULT_DATABASE_PATH;
}

function getDatabase(): DatabaseSync {
  if (database) {
    return database;
  }

  const databasePath = getDatabasePath();
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  database = new DatabaseSync(databasePath, {
    timeout: 5_000
  });
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS comparison_result_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_a_key TEXT NOT NULL,
      user_b_key TEXT NOT NULL,
      locale TEXT NOT NULL,
      comparison_system_version INTEGER NOT NULL,
      result_json TEXT NOT NULL,
      cached_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      UNIQUE(user_a_key, user_b_key, locale, comparison_system_version)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_comparison_result_cache_expires_at
      ON comparison_result_cache(expires_at);
  `);
  migrateComparisonCacheSchema(database);

  return database;
}

function hasComparisonSystemVersionColumn(db: DatabaseSync): boolean {
  const columns = db.prepare("PRAGMA table_info(comparison_result_cache)").all() as Array<{ name: string }>;
  return columns.some((column) => column.name === "comparison_system_version");
}

function migrateComparisonCacheSchema(db: DatabaseSync): void {
  if (hasComparisonSystemVersionColumn(db)) {
    return;
  }

  db.exec(`
    ALTER TABLE comparison_result_cache RENAME TO comparison_result_cache_legacy;

    CREATE TABLE comparison_result_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_a_key TEXT NOT NULL,
      user_b_key TEXT NOT NULL,
      locale TEXT NOT NULL,
      comparison_system_version INTEGER NOT NULL,
      result_json TEXT NOT NULL,
      cached_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      UNIQUE(user_a_key, user_b_key, locale, comparison_system_version)
    ) STRICT;

    INSERT INTO comparison_result_cache (
      id,
      user_a_key,
      user_b_key,
      locale,
      comparison_system_version,
      result_json,
      cached_at,
      expires_at
    )
    SELECT
      id,
      user_a_key,
      user_b_key,
      locale,
      ${COMPARISON_CACHE_SYSTEM_VERSION},
      result_json,
      cached_at,
      expires_at
    FROM comparison_result_cache_legacy;

    DROP TABLE comparison_result_cache_legacy;

    CREATE INDEX IF NOT EXISTS idx_comparison_result_cache_expires_at
      ON comparison_result_cache(expires_at);
  `);
}

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

function getComparisonCacheKey(request: CompareRequest): ComparisonCacheKey {
  const [userAKey, userBKey] = request.users.map(normalizeUsername).sort((left, right) => left.localeCompare(right));

  return {
    userAKey,
    userBKey,
    locale: request.locale ?? "zh-CN"
  };
}

function deleteExpiredRows(db: DatabaseSync, now: Date): void {
  db.prepare("DELETE FROM comparison_result_cache WHERE expires_at <= ?").run(now.toISOString());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCompareResponse(value: unknown): value is CompareResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.users) &&
    isRecord(value.metrics) &&
    isRecord(value.llm) &&
    Array.isArray(value.timeline) &&
    typeof value.requestedAt === "string" &&
    typeof value.locale === "string" &&
    LOCALES.has(value.locale)
  );
}

function parseCachedResult(value: string): CompareResponse | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    return null;
  }

  if (!isCompareResponse(parsed)) {
    return null;
  }

  return parsed;
}

function getExpiresAt(now: Date): string {
  return new Date(now.getTime() + CACHE_RETENTION_MS).toISOString();
}

function withoutCacheMetadata(result: CompareResponse): CompareResponse {
  const storedResult: CompareResponse = { ...result };
  delete storedResult.cache;
  return storedResult;
}

function orderByRequestUsers<T>(items: T[], request: CompareRequest, getUsername: (item: T) => string): T[] {
  const itemByUsername = new Map(items.map((item) => [normalizeUsername(getUsername(item)), item]));
  const orderedItems = request.users
    .map((username) => itemByUsername.get(normalizeUsername(username)))
    .filter((item): item is T => item !== undefined);

  return orderedItems.length === items.length ? orderedItems : items;
}

function reorderRadarPoint(point: RadarPoint, orderedUsernames: string[]): RadarPoint {
  const nextPoint: Record<string, string | number> = {
    dimension: point.dimension,
    key: point.key
  };
  const orderedUsernameSet = new Set(orderedUsernames);

  for (const username of orderedUsernames) {
    const value = point[username];
    if (value !== undefined) {
      nextPoint[username] = value;
    }
  }

  for (const [key, value] of Object.entries(point)) {
    if (key !== "dimension" && key !== "key" && !orderedUsernameSet.has(key)) {
      nextPoint[key] = value;
    }
  }

  return nextPoint as RadarPoint;
}

function orderCachedResultForRequest(result: CompareResponse, request: CompareRequest): CompareResponse {
  const users = orderByRequestUsers(result.users, request, (user) => user.profile.login);
  const accounts = orderByRequestUsers(result.metrics.accounts, request, (account) => account.username);
  const accountScores = orderByRequestUsers(result.llm.analysis.accountScores, request, (account) => account.username);
  const accountAnalyses = orderByRequestUsers(result.llm.analysis.accountAnalyses, request, (account) => account.username);
  const orderedUsernames = accounts.length > 0 ? accounts.map((account) => account.username) : users.map((user) => user.profile.login);

  return {
    ...result,
    users,
    metrics: {
      ...result.metrics,
      accounts,
      radar: result.metrics.radar.map((point) => reorderRadarPoint(point, orderedUsernames))
    },
    llm: {
      ...result.llm,
      analysis: {
        ...result.llm.analysis,
        accountScores,
        dimensionInsights: result.llm.analysis.dimensionInsights.map((insight) => ({
          ...insight,
          accounts: orderByRequestUsers(insight.accounts, request, (account) => account.username)
        })),
        accountAnalyses
      }
    }
  };
}

export function readCachedComparisonResult(request: CompareRequest, now = new Date()): CompareResponse | null {
  const db = getDatabase();
  const key = getComparisonCacheKey(request);

  deleteExpiredRows(db, now);

  const row = db
    .prepare(
      `
        SELECT result_json, cached_at
        FROM comparison_result_cache
        WHERE user_a_key = ? AND user_b_key = ? AND locale = ? AND comparison_system_version = ? AND expires_at > ?
        LIMIT 1
      `
    )
    .get(key.userAKey, key.userBKey, key.locale, COMPARISON_CACHE_SYSTEM_VERSION, now.toISOString()) as ComparisonCacheRow | undefined;

  if (!row) {
    return null;
  }

  const result = parseCachedResult(row.result_json);
  if (!result) {
    db.prepare(
      "DELETE FROM comparison_result_cache WHERE user_a_key = ? AND user_b_key = ? AND locale = ? AND comparison_system_version = ?"
    ).run(
      key.userAKey,
      key.userBKey,
      key.locale,
      COMPARISON_CACHE_SYSTEM_VERSION
    );
    return null;
  }

  const orderedResult = orderCachedResultForRequest(result, request);

  return {
    ...orderedResult,
    cache: {
      hit: true,
      cachedAt: row.cached_at
    }
  };
}

export function persistComparisonResultToCache(request: CompareRequest, result: CompareResponse, now = new Date()): void {
  const db = getDatabase();
  const key = getComparisonCacheKey(request);
  const cachedAt = now.toISOString();

  deleteExpiredRows(db, now);

  db.prepare(
    `
      INSERT INTO comparison_result_cache (
        user_a_key,
        user_b_key,
        locale,
        comparison_system_version,
        result_json,
        cached_at,
        expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_a_key, user_b_key, locale, comparison_system_version) DO UPDATE SET
        result_json = excluded.result_json,
        cached_at = excluded.cached_at,
        expires_at = excluded.expires_at
    `
  ).run(
    key.userAKey,
    key.userBKey,
    key.locale,
    COMPARISON_CACHE_SYSTEM_VERSION,
    JSON.stringify(withoutCacheMetadata(result)),
    cachedAt,
    getExpiresAt(now)
  );
}

export function getCachedComparisonResult(request: CompareRequest): CompareResponse | null {
  try {
    return readCachedComparisonResult(request);
  } catch (error) {
    logServerError("[comparison-cache] Failed to read cached comparison result.", error, {
      users: request.users
    });
    return null;
  }
}

export function saveComparisonResultToCache(request: CompareRequest, result: CompareResponse): void {
  try {
    persistComparisonResultToCache(request, result);
  } catch (error) {
    logServerError("[comparison-cache] Failed to persist comparison result.", error, {
      users: request.users
    });
  }
}

export function resetComparisonCacheForTests(): void {
  database?.close();
  database = null;
}
