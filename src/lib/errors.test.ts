import { describe, expect, it } from "vitest";
import { AppError, getSafeClientMessage, serializeError } from "@/lib/errors";

describe("getSafeClientMessage", () => {
  it("hides LLM provider details from client responses", () => {
    const error = new AppError(
      "llm_response_read_failed",
      "LLM provider response ended before JSON could be read during tool-call round: terminated.",
      502
    );

    expect(getSafeClientMessage(error)).toBe("分析失败，请稍后重试。");
  });

  it("hides unexpected server details from client responses", () => {
    const error = new Error("Database password appeared in stack trace.");

    expect(getSafeClientMessage(error)).toBe("请求失败，请稍后重试。");
    expect(getSafeClientMessage(error, "en-US")).toBe("Request failed. Please try again later.");
  });

  it("keeps client-fixable errors visible", () => {
    const error = new AppError("github_user_not_found", "GitHub user was not found.", 404);

    expect(getSafeClientMessage(error)).toBe("GitHub user was not found.");
  });

  it("serializes AppError detail for backend logs", () => {
    const error = new AppError("github_request_forbidden", "GitHub API request was forbidden.", 403, {
      detail: {
        request: {
          path: "/users/octocat",
          tokenPresent: true
        },
        response: {
          status: 403,
          bodyPreview: "{\"message\":\"Resource protected by organization policy\"}"
        }
      }
    });

    expect(serializeError(error)).toMatchObject({
      code: "github_request_forbidden",
      status: 403,
      detail: {
        request: {
          path: "/users/octocat",
          tokenPresent: true
        },
        response: {
          status: 403,
          bodyPreview: "{\"message\":\"Resource protected by organization policy\"}"
        }
      }
    });
  });
});
