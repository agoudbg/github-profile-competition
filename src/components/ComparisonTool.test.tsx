import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComparisonTool } from "@/components/ComparisonTool";

describe("ComparisonTool", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the initial comparison form", () => {
    render(<ComparisonTool />);

    expect(screen.getByRole("heading", { name: "GitHub 账号比拼" })).toBeInTheDocument();
    expect(screen.getByLabelText("账号 A")).toBeInTheDocument();
    expect(screen.getByLabelText("账号 B")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始比拼" })).toBeDisabled();
    expect(screen.getByText("等待开赛")).toBeInTheDocument();
  });

  it("shows an active comparison state while a request is running", async () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => undefined) as Promise<Response>);
    render(<ComparisonTool />);

    fireEvent.change(screen.getByLabelText("账号 A"), { target: { value: "alpha" } });
    fireEvent.change(screen.getByLabelText("账号 B"), { target: { value: "beta" } });
    fireEvent.click(screen.getByRole("button", { name: "开始比拼" }));

    expect(await screen.findByText("正在对比")).toBeInTheDocument();
    expect(screen.getByText("alpha vs beta")).toBeInTheDocument();
    expect(screen.queryByText("等待开赛")).not.toBeInTheDocument();
  });

  it("prefills users from URL-derived initial users without starting automatically", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => undefined) as Promise<Response>);

    render(<ComparisonTool initialUsers={{ left: "username_1", right: "username2" }} />);

    expect(screen.getByLabelText("账号 A")).toHaveValue("username_1");
    expect(screen.getByLabelText("账号 B")).toHaveValue("username2");
    expect(screen.getByText("等待开赛")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the browser URL in sync after manual submission", async () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => undefined) as Promise<Response>);
    render(<ComparisonTool />);

    fireEvent.change(screen.getByLabelText("账号 A"), { target: { value: "alpha-user" } });
    fireEvent.change(screen.getByLabelText("账号 B"), { target: { value: "beta user" } });
    fireEvent.click(screen.getByRole("button", { name: "开始比拼" }));

    expect(await screen.findByText("正在对比")).toBeInTheDocument();
    expect(window.location.search).toBe("?a=alpha-user&b=beta+user");
  });
});
