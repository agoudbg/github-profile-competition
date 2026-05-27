import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getAbuseRetryAfterSeconds, guardCompareRequest } from "@/lib/abuse";
import { AppError, getSafeClientMessage, logServerError } from "@/lib/errors";
import { compareGitHubProfiles } from "@/lib/compare";
import { getCachedComparisonResult, saveComparisonResultToCache } from "@/lib/comparisonCache";
import { normalizeLocaleCode } from "@/i18n/messages";
import { readJsonBody } from "@/lib/requestBody";
import { parseCompareRequest } from "@/lib/validation";
import type { ApiErrorResponse, CompareResponse, LocaleCode } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(
  code: string,
  message: string,
  status: number,
  retryAfterSeconds?: number
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        status
      }
    },
    {
      status,
      headers: retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : undefined
    }
  );
}

function getRequestLocale(input: unknown): LocaleCode {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return "zh-CN";
  }

  const locale = (input as { locale?: unknown }).locale;
  return typeof locale === "string" ? normalizeLocaleCode(locale) : "zh-CN";
}

export async function POST(request: Request): Promise<NextResponse<CompareResponse | ApiErrorResponse>> {
  let releaseAbuseGuard: (() => void) | undefined;
  let locale: LocaleCode = "zh-CN";

  try {
    const body = await readJsonBody(request);
    locale = getRequestLocale(body);
    const parsedRequest = parseCompareRequest(body);
    locale = parsedRequest.locale ?? "zh-CN";
    const cachedResult = parsedRequest.forceRefresh ? null : getCachedComparisonResult(parsedRequest);

    if (cachedResult) {
      return NextResponse.json(cachedResult);
    }

    releaseAbuseGuard = guardCompareRequest(request);

    const response = await compareGitHubProfiles(parsedRequest);
    saveComparisonResultToCache(parsedRequest, response);
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse("invalid_request", error.issues[0]?.message ?? "Invalid request body.", 400);
    }

    if (error instanceof AppError) {
      logServerError("[api/compare] Compare request failed.", error, {
        errorCode: error.code,
        status: error.status
      });

      return errorResponse(error.code, getSafeClientMessage(error, locale), error.status, getAbuseRetryAfterSeconds(error));
    }

    logServerError("[api/compare] Compare request failed.", error, {
      errorCode: "internal_error",
      status: 500
    });

    return errorResponse("internal_error", getSafeClientMessage(error, locale), 500);
  } finally {
    releaseAbuseGuard?.();
  }
}
