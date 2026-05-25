import { NextResponse } from "next/server";
import { getLeaderboardPage } from "@/lib/leaderboard";
import type { LeaderboardResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parsePage(value: string | null): number {
  if (!value) {
    return 1;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function GET(request: Request): NextResponse<LeaderboardResponse> {
  const url = new URL(request.url);
  return NextResponse.json(getLeaderboardPage(parsePage(url.searchParams.get("page"))));
}
