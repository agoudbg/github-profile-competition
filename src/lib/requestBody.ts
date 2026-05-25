import { AppError } from "@/lib/errors";

const DEFAULT_MAX_JSON_BODY_BYTES = 4_096;

function contentLengthTooLarge(headers: Headers, maxBytes: number): boolean {
  const rawValue = headers.get("content-length");

  if (!rawValue) {
    return false;
  }

  const contentLength = Number.parseInt(rawValue, 10);
  return Number.isFinite(contentLength) && contentLength > maxBytes;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export async function readJsonBody(request: Request, maxBytes = DEFAULT_MAX_JSON_BODY_BYTES): Promise<unknown> {
  if (contentLengthTooLarge(request.headers, maxBytes)) {
    throw new AppError("request_body_too_large", "Request body is too large.", 413);
  }

  const text = await request.text();

  if (byteLength(text) > maxBytes) {
    throw new AppError("request_body_too_large", "Request body is too large.", 413);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError("invalid_json", "Request body must be valid JSON.", 400);
  }
}
