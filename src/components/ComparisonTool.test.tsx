import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComparisonTool } from "@/components/ComparisonTool";
import type { CompareResponse, UserDataset } from "@/lib/types";

vi.mock("next/dynamic", () => ({
  default: () => function MockDynamicChart() {
    return <div>雷达图加载中</div>;
  }
}));

function dataset(username: string): UserDataset {
  return {
    profile: {
      login: username,
      name: username,
      avatarUrl: `https://github.com/${username}.png`,
      htmlUrl: `https://github.com/${username}`,
      bio: null,
      company: null,
      location: null,
      blog: null,
      followers: 1,
      following: 0,
      publicRepos: 1,
      publicGists: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    repositories: [],
    contributions: {
      source: "unavailable",
      confidence: "low",
      totalContributions: 0,
      commits: 0,
      pullRequests: 0,
      issues: 0,
      reviews: 0,
      recentEvents: 0,
      activeDays: 0
    },
    contributionTimeline: [],
    context: {
      summary: "",
      extractedFromHtml: false,
      topRepositoryHints: []
    },
    languageDistribution: {},
    fetchedAt: "2026-01-01T00:00:00.000Z"
  };
}

function resultResponse(cache?: CompareResponse["cache"]): CompareResponse {
  return {
    users: [dataset("alpha"), dataset("beta")],
    metrics: {
      accounts: [
        {
          username: "alpha",
          totalScore: 80,
          systemScore: 70,
          llmScore: 90,
          dimensions: []
        },
        {
          username: "beta",
          totalScore: 72,
          systemScore: 70,
          llmScore: 74,
          dimensions: []
        }
      ],
      radar: [],
      winner: {
        username: "alpha",
        margin: 8,
        reason: "alpha leads"
      }
    },
    llm: {
      status: "generated",
      analysis: {
        summary: "cached summary",
        winner: null,
        accountScores: [],
        dimensionInsights: [],
        accountAnalyses: [],
        caveats: [],
        sources: []
      }
    },
    timeline: [],
    locale: "zh-CN",
    requestedAt: "2026-05-25T00:00:00.000Z",
    ...(cache ? { cache } : {})
  };
}

function streamResult(result: CompareResponse): Response {
  return new Response(`${JSON.stringify({ type: "result", result })}\n`, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8"
    }
  });
}

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

  it("auto-starts a shared comparison only once", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(streamResult(resultResponse()));

    render(<ComparisonTool initialUsers={{ left: "alpha", right: "beta", autoStart: true }} />);

    expect(await screen.findByText("分享结果")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it("shows cached result metadata and sends forceRefresh when regenerating", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(streamResult(resultResponse({ hit: true, cachedAt: "2026-05-25T08:00:00.000Z" })))
      .mockReturnValueOnce(new Promise(() => undefined) as Promise<Response>);

    render(<ComparisonTool />);

    fireEvent.change(screen.getByLabelText("账号 A"), { target: { value: "alpha" } });
    fireEvent.change(screen.getByLabelText("账号 B"), { target: { value: "beta" } });
    fireEvent.click(screen.getByRole("button", { name: "开始比拼" }));

    expect(await screen.findByText("已显示缓存结果")).toBeInTheDocument();
    expect(screen.getByText(/缓存时间：/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重新生成" }));

    const [, regenerateInit] = fetchMock.mock.calls[1] ?? [];
    const regenerateBody = JSON.parse(String(regenerateInit?.body)) as { forceRefresh?: boolean };

    expect(regenerateBody.forceRefresh).toBe(true);
  });

  it("copies a result share link that auto-opens the cached comparison", async () => {
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: clipboardWrite
      }
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(streamResult(resultResponse()));

    render(<ComparisonTool />);

    fireEvent.change(screen.getByLabelText("账号 A"), { target: { value: "alpha" } });
    fireEvent.change(screen.getByLabelText("账号 B"), { target: { value: "beta" } });
    fireEvent.click(screen.getByRole("button", { name: "开始比拼" }));

    expect(await screen.findByText("分享结果")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "复制链接" }));

    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledTimes(1));
    const shareUrl = new URL(String(clipboardWrite.mock.calls[0]?.[0]));
    expect(shareUrl.searchParams.get("a")).toBe("alpha");
    expect(shareUrl.searchParams.get("b")).toBe("beta");
    expect(shareUrl.searchParams.get("share")).toBe("1");
    expect(await screen.findByText("链接已复制")).toBeInTheDocument();
  });

  it("opens the canvas share image modal", async () => {
    const openMock = vi.spyOn(window, "open");
    const canvasContext = {
      arc: vi.fn(),
      arcTo: vi.fn(),
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      clip: vi.fn(),
      closePath: vi.fn(),
      createLinearGradient: vi.fn(() => ({
        addColorStop: vi.fn()
      })),
      drawImage: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      lineTo: vi.fn(),
      moveTo: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
      stroke: vi.fn()
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(streamResult(resultResponse()));

    render(<ComparisonTool />);

    fireEvent.change(screen.getByLabelText("账号 A"), { target: { value: "alpha" } });
    fireEvent.change(screen.getByLabelText("账号 B"), { target: { value: "beta" } });
    fireEvent.click(screen.getByRole("button", { name: "开始比拼" }));

    expect(await screen.findByText("分享结果")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存图片" }));

    expect(await screen.findByRole("dialog", { name: "保存结果图片" })).toBeInTheDocument();
    expect(screen.getByText("下载 PNG")).toBeInTheDocument();
    expect(openMock).not.toHaveBeenCalled();
  });
});
