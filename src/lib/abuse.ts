import { createHash } from "node:crypto";
import { AppError } from "@/lib/errors";
const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 900;
const DEFAULT_RATE_LIMIT_MAX = 5;
const DEFAULT_CONCURRENT_MAX = 1;
const DEVELOPMENT_SALT = "github-profile-competition-development-salt";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type AbuseProtectionConfig = {
  enabled: boolean;
  windowMs: number;
  maxRequests: number;
  maxConcurrentRequests: number;
  salt: string;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();
const activeRequests = new Map<string, number>();
let warnedAboutMissingSalt = false;

export class AbuseProtectionError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(code: "rate_limited" | "too_many_concurrent_requests", message: string, retryAfterSeconds: number) {
    super(code, message, 429);
    this.name = "AbuseProtectionError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function isDisabled(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ["0", "false", "off", "no"].includes(value.trim().toLowerCase());
}

function readPositiveInteger(name: string, fallback: number): number {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readConfig(): AbuseProtectionConfig {
  const salt = process.env.ABUSE_LIMIT_SALT?.trim();

  if (!salt && process.env.NODE_ENV === "production" && !warnedAboutMissingSalt) {
    warnedAboutMissingSalt = true;
    console.warn("[abuse] ABUSE_LIMIT_SALT is not configured. Configure a stable secret salt for production.");
  }

  return {
    enabled: !isDisabled(process.env.ABUSE_PROTECTION_ENABLED),
    windowMs: readPositiveInteger("ABUSE_RATE_LIMIT_WINDOW_SECONDS", DEFAULT_RATE_LIMIT_WINDOW_SECONDS) * 1_000,
    maxRequests: readPositiveInteger("ABUSE_RATE_LIMIT_MAX", DEFAULT_RATE_LIMIT_MAX),
    maxConcurrentRequests: readPositiveInteger("ABUSE_CONCURRENT_MAX", DEFAULT_CONCURRENT_MAX),
    salt: salt || DEVELOPMENT_SALT
  };
}

function firstHeaderValue(headers: Headers, name: string): string | null {
  const value = headers.get(name);

  if (!value) {
    return null;
  }

  return value
    .split(",")
    .map((part) => part.trim())
    .find(Boolean) ?? null;
}

function forwardedHeaderValue(headers: Headers): string | null {
  const value = headers.get("forwarded");

  if (!value) {
    return null;
  }

  const match = /(?:^|[,;])\s*for=(?:"?)([^;,"]+)/i.exec(value);
  return match?.[1]?.replace(/^\[/, "").replace(/\]$/, "").trim() || null;
}

function getClientIdentifier(headers: Headers): string {
  const identifier =
    firstHeaderValue(headers, "cf-connecting-ip") ??
    firstHeaderValue(headers, "x-real-ip") ??
    firstHeaderValue(headers, "x-forwarded-for") ??
    forwardedHeaderValue(headers) ??
    "unknown-client";

  return identifier.slice(0, 200);
}

function hashIdentifier(identifier: string, salt: string): string {
  return createHash("sha256").update(salt).update(":").update(identifier).digest("hex");
}

function clientKeyForRequest(request: Request, salt: string): string {
  return `client:${hashIdentifier(getClientIdentifier(request.headers), salt)}`;
}

function retryAfterSeconds(resetAt: number, now: number): number {
  return Math.max(1, Math.ceil((resetAt - now) / 1_000));
}

function releaseActiveRequest(key: string): void {
  const current = activeRequests.get(key) ?? 0;

  if (current <= 1) {
    activeRequests.delete(key);
    return;
  }

  activeRequests.set(key, current - 1);
}

export function getAbuseRetryAfterSeconds(error: unknown): number | undefined {
  return error instanceof AbuseProtectionError ? error.retryAfterSeconds : undefined;
}

export function guardCompareRequest(request: Request): () => void {
  const config = readConfig();

  if (!config.enabled) {
    return () => undefined;
  }

  const now = Date.now();
  const clientKey = clientKeyForRequest(request, config.salt);
  const activeCount = activeRequests.get(clientKey) ?? 0;

  if (activeCount >= config.maxConcurrentRequests) {
    throw new AbuseProtectionError(
      "too_many_concurrent_requests",
      "A comparison is already running. Please wait for it to finish.",
      1
    );
  }

  const currentBucket = rateLimitBuckets.get(clientKey);
  const bucket =
    currentBucket && currentBucket.resetAt > now
      ? currentBucket
      : {
          count: 0,
          resetAt: now + config.windowMs
        };

  if (bucket.count >= config.maxRequests) {
    throw new AbuseProtectionError(
      "rate_limited",
      "Too many comparison requests. Please try again later.",
      retryAfterSeconds(bucket.resetAt, now)
    );
  }

  bucket.count += 1;
  rateLimitBuckets.set(clientKey, bucket);
  activeRequests.set(clientKey, activeCount + 1);

  let released = false;

  return () => {
    if (released) {
      return;
    }

    released = true;
    releaseActiveRequest(clientKey);
  };
}

export function resetAbuseProtectionForTests(): void {
  rateLimitBuckets.clear();
  activeRequests.clear();
  warnedAboutMissingSalt = false;
}

export function getAbuseProtectionKeysForTests(): string[] {
  return [...rateLimitBuckets.keys(), ...activeRequests.keys()];
}
