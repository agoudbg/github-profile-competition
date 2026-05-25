import type { DimensionKey, LocaleCode } from "@/lib/types";

export type Messages = {
  dimensions: Record<DimensionKey, string>;
  dimensionDescriptions: Record<DimensionKey, string>;
};

export const zhCN: Messages = {
  dimensions: {
    followers: "追随者",
    repositories: "仓库建设",
    projectImpact: "项目影响力",
    openSourceContribution: "开源贡献",
    activityAndConsistency: "活跃与稳定"
  },
  dimensionDescriptions: {
    followers: "关注者规模、社交触达与公开影响信号。",
    repositories: "公开仓库规模、维护占比与非 fork 项目占比。",
    projectImpact: "stars、forks、watchers 与代表项目表现。",
    openSourceContribution: "提交、PR、Issue、Review 与贡献活跃度。",
    activityAndConsistency: "近期事件、仓库更新频率与持续维护信号。"
  }
};

export const enUS: Messages = {
  dimensions: {
    followers: "Followers",
    repositories: "Repositories",
    projectImpact: "Project impact",
    openSourceContribution: "Open source contribution",
    activityAndConsistency: "Activity and consistency"
  },
  dimensionDescriptions: {
    followers: "Follower scale, social reach, and public influence signals.",
    repositories: "Public repository scale, maintained share, and non-fork project ratio.",
    projectImpact: "Stars, forks, watchers, and representative project performance.",
    openSourceContribution: "Commits, pull requests, issues, reviews, and contribution activity.",
    activityAndConsistency: "Recent events, repository update cadence, and sustained maintenance signals."
  }
};

export function getMessages(locale: LocaleCode | undefined): Messages {
  if (locale === "en-US") {
    return enUS;
  }

  return zhCN;
}
