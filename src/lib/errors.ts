import { zhCN } from "@/i18n/messages";

type ErrorLogDetail = Record<string, unknown>;

type AppErrorOptions = ErrorOptions & {
  detail?: ErrorLogDetail;
};

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail?: ErrorLogDetail;

  constructor(code: string, message: string, status: number, options?: AppErrorOptions) {
    const { detail, ...errorOptions } = options ?? {};

    super(message, errorOptions);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return zhCN.errors.unknown;
}

type SerializedError = {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  status?: number;
  detail?: ErrorLogDetail;
  cause?: SerializedError;
};

function getErrorField(error: Error, field: "code" | "status"): string | number | undefined {
  const value = (error as unknown as Record<string, unknown>)[field];

  if (field === "status" && typeof value === "number") {
    return value;
  }

  if (field === "code" && typeof value === "string") {
    return value;
  }

  return undefined;
}

export function serializeError(error: unknown): SerializedError | { message: string } {
  if (!(error instanceof Error)) {
    return {
      message: toErrorMessage(error)
    };
  }

  const cause = (error as { cause?: unknown }).cause;

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    code: getErrorField(error, "code") as string | undefined,
    status: getErrorField(error, "status") as number | undefined,
    ...("detail" in error && isErrorLogDetail(error.detail) ? { detail: error.detail } : {}),
    ...(cause ? { cause: serializeError(cause) as SerializedError } : {})
  };
}

function isErrorLogDetail(value: unknown): value is ErrorLogDetail {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function logServerError(message: string, error: unknown, detail: ErrorLogDetail = {}): void {
  console.error(message, {
    ...detail,
    error: serializeError(error)
  });
}

export function getSafeClientMessage(error: unknown): string {
  if (error instanceof AppError && error.status < 500) {
    return error.message;
  }

  if (error instanceof AppError && error.code.startsWith("llm_")) {
    return zhCN.errors.analysisFailed;
  }

  return zhCN.errors.requestFailed;
}
