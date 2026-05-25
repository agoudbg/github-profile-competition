import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LeaderboardResponse } from "@/lib/types";

vi.mock("@/lib/leaderboard", () => ({
  getLeaderboardPage: vi.fn()
}));

const { getLeaderboardPage } = await import("@/lib/leaderboard");
const { GET } = await import("./route");

const getLeaderboardPageMock = vi.mocked(getLeaderboardPage);

function response(overrides: Partial<LeaderboardResponse> = {}): LeaderboardResponse {
  return {
    entries: [],
    page: 1,
    pageSize: 100,
    total: 0,
    maxEntries: 1000,
    hasNextPage: false,
    isTruncated: false,
    generatedAt: "2026-05-25T00:00:00.000Z",
    ...overrides
  };
}

describe("/api/leaderboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the requested leaderboard page", async () => {
    getLeaderboardPageMock.mockReturnValue(response({ page: 3 }));

    const result = GET(new Request("https://example.test/api/leaderboard?page=3"));
    const body = await result.json();

    expect(getLeaderboardPageMock).toHaveBeenCalledWith(3);
    expect(body).toMatchObject({
      page: 3,
      pageSize: 100
    });
  });

  it("falls back to the first page for invalid page input", async () => {
    getLeaderboardPageMock.mockReturnValue(response());

    await GET(new Request("https://example.test/api/leaderboard?page=nope")).json();

    expect(getLeaderboardPageMock).toHaveBeenCalledWith(1);
  });
});
