"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import { BarChart3, ExternalLink, GitCompareArrows, Menu, Swords, X } from "lucide-react";
import { zhCN } from "@/i18n/messages";

const repositoryUrl = "https://github.com/agoudbg/github-profile-competition";
const messages = zhCN.appHeader;

const navigationItems = [
  {
    kind: "internal",
    href: "/",
    label: messages.navigation.compare,
    icon: GitCompareArrows
  },
  {
    kind: "internal",
    href: "/leaderboard",
    label: messages.navigation.leaderboard,
    icon: BarChart3
  },
  {
    kind: "external",
    href: repositoryUrl,
    label: messages.navigation.github,
    icon: ExternalLink
  }
] as const;

export function AppHeader() {
  const pathname = usePathname();
  const navigationId = useId();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="app-header-top">
          <Link className="app-logo" href="/" onClick={() => setIsMenuOpen(false)}>
            <span className="app-logo-mark">
              <Swords size={20} aria-hidden="true" />
            </span>
            <span>
              <strong>{zhCN.app.title}</strong>
              <small>{zhCN.app.tagline}</small>
            </span>
          </Link>

          <button
            aria-controls={navigationId}
            aria-expanded={isMenuOpen}
            aria-label={isMenuOpen ? messages.menu.close : messages.menu.open}
            className="app-menu-button"
            onClick={() => setIsMenuOpen((open) => !open)}
            type="button"
          >
            {isMenuOpen ? <X size={17} aria-hidden="true" /> : <Menu size={17} aria-hidden="true" />}
            <span>{messages.menu.label}</span>
          </button>
        </div>

        <nav className={isMenuOpen ? "app-nav app-nav-open" : "app-nav"} id={navigationId} aria-label={messages.navigationLabel}>
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.kind === "internal" && (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={isActive ? "app-nav-link active" : "app-nav-link"}
                href={item.href}
                key={item.href}
                onClick={() => setIsMenuOpen(false)}
                rel={item.kind === "external" ? "noreferrer" : undefined}
                target={item.kind === "external" ? "_blank" : undefined}
              >
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
