import { LeaderboardPanel } from "@/components/LeaderboardPanel";

export const dynamic = "force-dynamic";

export default function LeaderboardPage() {
  return (
    <main className="page-shell">
      <div className="workspace">
        <LeaderboardPanel />
      </div>
    </main>
  );
}
