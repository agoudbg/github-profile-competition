import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getAbuseRetryAfterSeconds, guardCompareRequest } from "@/lib/abuse";
import { AppError, getSafeClientMessage, logServerError } from "@/lib/errors";
import { compareGitHubProfiles } from "@/lib/compare";
import { readJsonBody } from "@/lib/requestBody";
import { parseCompareRequest } from "@/lib/validation";
import type { ApiErrorResponse, CompareResponse } from "@/lib/types";

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

export async function POST(request: Request): Promise<NextResponse<CompareResponse | ApiErrorResponse>> {
  let releaseAbuseGuard: (() => void) | undefined;

  try {
    const body = await readJsonBody(request);
    const parsedRequest = parseCompareRequest(body);

    releaseAbuseGuard = guardCompareRequest(request);

    const response = await compareGitHubProfiles(parsedRequest);
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

      return errorResponse(error.code, getSafeClientMessage(error), error.status, getAbuseRetryAfterSeconds(error));
    }

    logServerError("[api/compare] Compare request failed.", error, {
      errorCode: "internal_error",
      status: 500
    });

    return errorResponse("internal_error", getSafeClientMessage(error), 500);
  } finally {
    releaseAbuseGuard?.();
  }
}
