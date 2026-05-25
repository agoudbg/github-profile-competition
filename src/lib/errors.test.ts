import { describe, expect, it } from "vitest";
import { AppError, getSafeClientMessage } from "@/lib/errors";

describe("getSafeClientMessage", () => {
  it("hides LLM provider details from client responses", () => {
    const error = new AppError(
      "llm_response_read_failed",
      "LLM provider response ended before JSON could be read during tool-call round: terminated.",
      502
    );

    expect(getSafeClientMessage(error)).toBe("Analysis failed. Please try again later.");
  });

  it("hides unexpected server details from client responses", () => {
    const error = new Error("Database password appeared in stack trace.");

    expect(getSafeClientMessage(error)).toBe("Request failed. Please try again later.");
  });

  it("keeps client-fixable errors visible", () => {
    const error = new AppError("github_user_not_found", "GitHub user was not found.", 404);

    expect(getSafeClientMessage(error)).toBe("GitHub user was not found.");
  });
});
