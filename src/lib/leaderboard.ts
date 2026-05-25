import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { logServerError } from "@/lib/errors";
import { SYSTEM_SCORING_VERSION } from "@/lib/scoring";
import type {
  AccountScore,
  DimensionKey,
  LeaderboardDimensionScore,
  LeaderboardEntry,
  LeaderboardResponse,
  ScoreDimension,
  UserDataset
} from "@/lib/types";

const LEADERBOARD_MAX_ENTRIES = 1_000;
const LEADERBOARD_PAGE_SIZE = 100;
const CACHE_THRESHOLD = 1_000;
const DEFAULT_DATABASE_PATH = join(process.cwd(), ".data", "leaderboard.sqlite");
const DIMENSION_KEYS: ReadonlySet<string> = new Set<DimensionKey>([
  "followers",
  "repositories",
  "projectImpact",
  "openSourceContribution",
  "activityAndConsistency"
]);

type LeaderboardRow = {
  username: string;
  display_name: string | null;
  avatar_url: string;
  profile_url: string;
  total_score: number;
  dimensions_json: string;
  updated_at: string;
  scoring_version: number;
  rank: number;
};

type CountRow = {
  total: number;
};

type CacheState = {
  entries: LeaderboardEntry[];
  generatedAt: string;
};

let database: DatabaseSync | null = null;
let cachedLeaderboard: CacheState | null = null;

function getDatabasePath(): string {
  return process.env.LEADERBOARD_DATABASE_PATH?.trim() || DEFAULT_DATABASE_PATH;
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

    CREATE TABLE IF NOT EXISTS leaderboard_score_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      username_key TEXT NOT NULL,
      display_name TEXT,
      avatar_url TEXT NOT NULL,
      profile_url TEXT NOT NULL,
      total_score INTEGER NOT NULL CHECK (total_score >= 0 AND total_score <= 100),
      dimensions_json TEXT NOT NULL,
      scoring_version INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_leaderboard_latest_user
      ON leaderboard_score_snapshots(username_key, updated_at DESC, id DESC);

    CREATE INDEX IF NOT EXISTS idx_leaderboard_rank
      ON leaderboard_score_snapshots(scoring_version, total_score DESC, updated_at DESC);
  `);

  return database;
}

function toScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function toStoredDimension(dimension: ScoreDimension): LeaderboardDimensionScore {
  return {
    key: dimension.key,
    label: dimension.label,
    score: toScore(dimension.score),
    rawValue: Number.isFinite(dimension.rawValue) ? dimension.rawValue : 0
  };
}

function parseDimensionScores(value: string): LeaderboardDimensionScore[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter((item): item is LeaderboardDimensionScore => {
      return (
        typeof item === "object" &&
        item !== null &&
        "key" in item &&
        "label" in item &&
        "score" in item &&
        "rawValue" in item &&
        typeof item.key === "string" &&
        DIMENSION_KEYS.has(item.key) &&
        typeof item.label === "string" &&
        typeof item.score === "number" &&
        typeof item.rawValue === "number"
      );
    })
    .map((item) => ({
      key: item.key,
      label: item.label,
      score: toScore(item.score),
      rawValue: item.rawValue
    }));
}

function rowToEntry(row: LeaderboardRow): LeaderboardEntry {
  return {
    rank: row.rank,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    profileUrl: row.profile_url,
    totalScore: toScore(row.total_score),
    dimensions: parseDimensionScores(row.dimensions_json),
    updatedAt: row.updated_at,
    scoringVersion: row.scoring_version
  };
}

function getLatestRowsSql(): string {
  return `
    WITH ranked_snapshots AS (
      SELECT
        username,
        display_name,
        avatar_url,
        profile_url,
        total_score,
        dimensions_json,
        updated_at,
        scoring_version,
        ROW_NUMBER() OVER (
          PARTITION BY username_key
          ORDER BY updated_at DESC, id DESC
        ) AS latest_rank
      FROM leaderboard_score_snapshots
    ),
    latest_scores AS (
      SELECT
        username,
        display_name,
        avatar_url,
        profile_url,
        total_score,
        dimensions_json,
        updated_at,
        scoring_version
      FROM ranked_snapshots
      WHERE latest_rank = 1
    )
    SELECT
      username,
      display_name,
      avatar_url,
      profile_url,
      total_score,
      dimensions_json,
      updated_at,
      scoring_version,
      ROW_NUMBER() OVER (
        ORDER BY total_score DESC, updated_at DESC, lower(username) ASC
      ) AS rank
    FROM latest_scores
    ORDER BY rank ASC
  `;
}

function readLatestEntryCount(db: DatabaseSync): number {
  const row = db
    .prepare(
      `
        SELECT COUNT(*) AS total
        FROM (
          SELECT username_key
          FROM leaderboard_score_snapshots
          GROUP BY username_key
        )
      `
    )
    .get() as CountRow | undefined;

  return row?.total ?? 0;
}

function readTopEntriesFromDatabase(db: DatabaseSync, limit: number, offset: number): LeaderboardEntry[] {
  const rows = db
    .prepare(
      `
        SELECT *
        FROM (${getLatestRowsSql()})
        LIMIT ? OFFSET ?
      `
    )
    .all(limit, offset) as LeaderboardRow[];

  return rows.map(rowToEntry);
}

function getCachedTopEntries(db: DatabaseSync): CacheState {
  if (cachedLeaderboard) {
    return cachedLeaderboard;
  }

  cachedLeaderboard = {
    entries: readTopEntriesFromDatabase(db, LEADERBOARD_MAX_ENTRIES, 0),
    generatedAt: new Date().toISOString()
  };

  return cachedLeaderboard;
}

export function persistLeaderboardScores(datasets: UserDataset[], accounts: AccountScore[], now = new Date()): void {
  const db = getDatabase();
  const accountByUsername = new Map(accounts.map((account) => [account.username.toLowerCase(), account]));
  const updatedAt = now.toISOString();
  const insert = db.prepare(`
    INSERT INTO leaderboard_score_snapshots (
      username,
      username_key,
      display_name,
      avatar_url,
      profile_url,
      total_score,
      dimensions_json,
      scoring_version,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.prepare("BEGIN IMMEDIATE");
  const commit = db.prepare("COMMIT");
  const rollback = db.prepare("ROLLBACK");

  try {
    transaction.run();

    for (const dataset of datasets) {
      const account = accountByUsername.get(dataset.profile.login.toLowerCase());
      if (!account) {
        continue;
      }

      insert.run(
        dataset.profile.login,
        dataset.profile.login.toLowerCase(),
        dataset.profile.name,
        dataset.profile.avatarUrl,
        dataset.profile.htmlUrl,
        toScore(account.systemScore),
        JSON.stringify(account.dimensions.map(toStoredDimension)),
        SYSTEM_SCORING_VERSION,
        updatedAt
      );
    }

    commit.run();
    cachedLeaderboard = null;
  } catch (error) {
    try {
      rollback.run();
    } catch (rollbackError) {
      logServerError("[leaderboard] Failed to roll back score persistence.", rollbackError);
    }

    throw error;
  }
}

export function saveLeaderboardScores(datasets: UserDataset[], accounts: AccountScore[], now = new Date()): void {
  try {
    persistLeaderboardScores(datasets, accounts, now);
  } catch (error) {
    logServerError("[leaderboard] Failed to persist score snapshots.", error, {
      users: datasets.map((dataset) => dataset.profile.login)
    });
  }
}

export function getLeaderboardPage(page: number, pageSize = LEADERBOARD_PAGE_SIZE): LeaderboardResponse {
  const sanitizedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const sanitizedPageSize = Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, LEADERBOARD_PAGE_SIZE) : LEADERBOARD_PAGE_SIZE;
  const offset = (sanitizedPage - 1) * sanitizedPageSize;
  const db = getDatabase();
  const total = readLatestEntryCount(db);
  const cappedTotal = Math.min(total, LEADERBOARD_MAX_ENTRIES);
  const generatedAt = new Date().toISOString();

  if (offset >= LEADERBOARD_MAX_ENTRIES) {
    return {
      entries: [],
      page: sanitizedPage,
      pageSize: sanitizedPageSize,
      total: cappedTotal,
      maxEntries: LEADERBOARD_MAX_ENTRIES,
      hasNextPage: false,
      isTruncated: total > LEADERBOARD_MAX_ENTRIES,
      generatedAt
    };
  }

  const limit = Math.min(sanitizedPageSize, LEADERBOARD_MAX_ENTRIES - offset);
  const cache = total > CACHE_THRESHOLD ? getCachedTopEntries(db) : null;
  const entries = cache ? cache.entries.slice(offset, offset + limit) : readTopEntriesFromDatabase(db, limit, offset);
  const responseGeneratedAt = cache?.generatedAt ?? generatedAt;

  return {
    entries,
    page: sanitizedPage,
    pageSize: sanitizedPageSize,
    total: cappedTotal,
    maxEntries: LEADERBOARD_MAX_ENTRIES,
    hasNextPage: offset + limit < cappedTotal,
    isTruncated: total > LEADERBOARD_MAX_ENTRIES,
    generatedAt: responseGeneratedAt
  };
}

export function resetLeaderboardForTests(): void {
  cachedLeaderboard = null;
  database?.close();
  database = null;
}
