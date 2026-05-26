import type { AccountScore, CompareResponse, DimensionKey } from "@/lib/types";

export const SHARE_VALID_DAYS = 30;

export type ShareDimension = {
  key: DimensionKey;
  label: string;
  score: number;
};

export type ShareAccount = {
  username: string;
  avatarUrl: string;
  totalScore: number;
  systemScore: number;
  llmScore: number | null;
  dimensions: ShareDimension[];
};

export type SharePayload = {
  version: 1;
  pageUrl: string;
  createdAt: string;
  expiresAt: string;
  winner: string | null;
  accounts: [ShareAccount, ShareAccount];
};

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getSafeDate(value: string): Date {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function toShareAccount(account: AccountScore, avatarUrl: string): ShareAccount {
  return {
    username: account.username,
    avatarUrl,
    totalScore: account.totalScore,
    systemScore: account.systemScore,
    llmScore: account.llmScore,
    dimensions: account.dimensions.map((dimension) => ({
      key: dimension.key,
      label: dimension.label,
      score: dimension.score
    }))
  };
}

export function createSharePayload(result: CompareResponse, pageUrl: string): SharePayload {
  const createdAt = getSafeDate(result.cache?.cachedAt ?? result.requestedAt);
  const accounts = result.metrics.accounts as [AccountScore, AccountScore];
  const avatarByUsername = new Map(result.users.map((user) => [user.profile.login, user.profile.avatarUrl]));

  return {
    version: 1,
    pageUrl,
    createdAt: createdAt.toISOString(),
    expiresAt: addDays(createdAt, SHARE_VALID_DAYS).toISOString(),
    winner: result.metrics.winner?.username ?? null,
    accounts: [
      toShareAccount(accounts[0], avatarByUsername.get(accounts[0].username) ?? ""),
      toShareAccount(accounts[1], avatarByUsername.get(accounts[1].username) ?? "")
    ]
  };
}
