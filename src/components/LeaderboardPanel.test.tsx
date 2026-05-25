import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeaderboardPanel } from "@/components/LeaderboardPanel";

function mockLeaderboardResponse(): Response {
  return Response.json({
    entries: [],
    page: 1,
    pageSize: 100,
    total: 0,
    maxEntries: 1000,
    hasNextPage: false,
    isTruncated: false,
    generatedAt: "2026-05-25T00:00:00.000Z"
  });
}

describe("LeaderboardPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads and renders the empty leaderboard state", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockLeaderboardResponse());

    render(<LeaderboardPanel />);

    expect(screen.getByRole("heading", { name: "排行榜" })).toBeInTheDocument();
    expect(await screen.findByText("暂无排行榜记录")).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/leaderboard?page=1");
  });
});
