import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "@/components/AppHeader";

vi.mock("next/navigation", () => ({
  usePathname: () => "/leaderboard"
}));

describe("AppHeader", () => {
  it("renders navigation links and marks the current page", () => {
    render(<AppHeader />);

    expect(screen.getByRole("link", { name: /GitHub 账号比拼/ })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "账号比拼" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "排行榜" })).toHaveClass("active");
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/agoudbg/github-profile-competition"
    );
  });

  it("toggles the mobile navigation menu", () => {
    render(<AppHeader />);

    const navigation = screen.getByRole("navigation", { name: "主导航" });
    const menuButton = screen.getByRole("button", { name: "打开菜单" });

    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(navigation).not.toHaveClass("app-nav-open");

    fireEvent.click(menuButton);

    expect(screen.getByRole("button", { name: "关闭菜单" })).toHaveAttribute("aria-expanded", "true");
    expect(navigation).toHaveClass("app-nav-open");
  });
});
