"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, GitCompareArrows, Swords } from "lucide-react";

const navigationItems = [
  {
    href: "/",
    label: "账号比拼",
    icon: GitCompareArrows
  },
  {
    href: "/leaderboard",
    label: "排行榜",
    icon: BarChart3
  }
] as const;

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link className="app-logo" href="/">
          <span className="app-logo-mark">
            <Swords size={20} aria-hidden="true" />
          </span>
          <span>
            <strong>GitHub 账号比拼</strong>
            <small>profile competition</small>
          </span>
        </Link>

        <nav className="app-nav" aria-label="主导航">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

            return (
              <Link className={isActive ? "app-nav-link active" : "app-nav-link"} href={item.href} key={item.href}>
                <Icon size={17} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
