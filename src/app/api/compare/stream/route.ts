import { ZodError } from "zod";
import { getAbuseRetryAfterSeconds, guardCompareRequest } from "@/lib/abuse";
import { AppError, getSafeClientMessage, logServerError } from "@/lib/errors";
import { compareGitHubProfiles } from "@/lib/compare";
import { getCachedComparisonResult, saveComparisonResultToCache } from "@/lib/comparisonCache";
import { readJsonBody } from "@/lib/requestBody";
import { parseCompareRequest } from "@/lib/validation";
import type { ApiErrorResponse, CompareRequest, CompareStreamEvent } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeError(error: unknown): ApiErrorResponse["error"] {
  if (error instanceof ZodError) {
    return {
      code: "invalid_request",
      message: error.issues[0]?.message ?? "Invalid request body.",
      status: 400
    };
  }

  if (error instanceof AppError) {
    return {
      code: error.code,
      message: getSafeClientMessage(error),
      status: error.status
    };
  }

  return {
    code: "internal_error",
    message: getSafeClientMessage(error),
    status: 500
  };
}

function jsonErrorResponse(error: ApiErrorResponse["error"], retryAfterSeconds?: number): Response {
  return Response.json(
    { error } satisfies ApiErrorResponse,
    {
      status: error.status,
      headers: retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : undefined
    }
  );
}

function streamErrorResponse(error: ApiErrorResponse["error"], retryAfterSeconds?: number): Response {
  return new Response(`${JSON.stringify({ type: "error", error } satisfies CompareStreamEvent)}\n`, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      ...(retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {}),
      "X-Accel-Buffering": "no"
    }
  });
}

function streamResultResponse(result: CompareStreamEvent & { type: "result" }): Response {
  return new Response(`${JSON.stringify(result)}\n`, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no"
    }
  });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;

  try {
    body = await readJsonBody(request);
  } catch (error) {
    const normalized = normalizeError(error);
    return jsonErrorResponse(normalized, getAbuseRetryAfterSeconds(error));
  }

  let parsedRequest: CompareRequest;

  try {
    parsedRequest = parseCompareRequest(body);
  } catch (error) {
    const normalized = normalizeError(error);
    return jsonErrorResponse(normalized, getAbuseRetryAfterSeconds(error));
  }

  const cachedResult = parsedRequest.forceRefresh ? null : getCachedComparisonResult(parsedRequest);
  if (cachedResult) {
    return streamResultResponse({
      type: "result",
      result: cachedResult
    });
  }

  let releaseAbuseGuard: () => void;

  try {
    releaseAbuseGuard = guardCompareRequest(request);
  } catch (error) {
    const normalized = normalizeError(error);
    return streamErrorResponse(normalized, getAbuseRetryAfterSeconds(error));
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(event: CompareStreamEvent) {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      }

      try {
        const result = await compareGitHubProfiles(parsedRequest, (event) => {
          send({
            type: "timeline",
            event
          });
        });

        saveComparisonResultToCache(parsedRequest, result);

        send({
          type: "result",
          result
        });
      } catch (error) {
        const normalized = normalizeError(error);
        logServerError("[api/compare/stream] Compare request failed.", error, {
          errorCode: normalized.code,
          status: normalized.status,
          users: parsedRequest.users
        });

        send({
          type: "error",
          error: normalized
        });
      } finally {
        releaseAbuseGuard();
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no"
    }
  });
}
