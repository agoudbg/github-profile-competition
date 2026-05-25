import { render, screen } from "@testing-library/react";
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
  });
});
