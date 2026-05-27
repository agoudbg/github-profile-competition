import type { LocaleCode } from "@/lib/types";

const zhCNMessages = {
  app: {
    title: "GitHub 账号比拼",
    tagline: "账号实力对比"
  },
  metadata: {
    title: "GitHub 账号比拼",
    description: "用公开指标和 AI 分析对比两个 GitHub 账号。"
  },
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
  },
  appHeader: {
    navigation: {
      compare: "账号比拼",
      leaderboard: "排行榜",
      github: "GitHub"
    },
    menu: {
      label: "菜单",
      open: "打开菜单",
      close: "关闭菜单"
    },
    navigationLabel: "主导航"
  },
  radarChart: {
    comparisonLabel: (left: string, right: string) => `${left} 与 ${right} 的雷达图对比`
  },
  comparison: {
    chartLoading: "雷达图加载中",
    common: {
      notAvailable: "暂无",
      unknownTime: "未知时间",
      followers: "追随者",
      repositories: "仓库",
      system: "系统",
      llm: "LLM",
      starsAndForks: (stars: string, forks: string) => `${stars} stars / ${forks} forks`
    },
    loadingSubtitles: [
      "正在读取公开资料，先把 stars、forks 和贡献时间线摆上桌。",
      "模型正在翻 README 和 Issue 线索，试图找出真正的项目含金量。",
      "系统分已经开跑，LLM 分正在慢慢热身。",
      "贡献记录正在排队称重，近期活跃度会被认真对待。",
      "如果双方很接近，我们会让证据多说两句。"
    ],
    scoreFormulaRows: [
      {
        title: "固定系统分",
        detail: "五个维度各按 0-100 计算，系统分是五项平均值。"
      },
      {
        title: "LLM 判断分",
        detail: "模型基于资料、工具返回证据和系统分，为每个账号给出 0-100 的判断分。"
      },
      {
        title: "最终总分",
        detail: "最终总分 = 固定系统分 * 50% + LLM 判断分 * 50%。"
      },
      {
        title: "赢家判定",
        detail: "页面综合结果使用最终总分；低于 2 分的差距视为接近。"
      }
    ],
    dimensionFormulaRows: [
      {
        title: "追随者",
        detail: "粉丝数使用对数缩放，50,000 粉丝作为 100 分基准。"
      },
      {
        title: "仓库建设",
        detail: "公开仓库数占 58%，近一年活跃仓库比例占 24%，非 fork 仓库比例占 18%。"
      },
      {
        title: "项目影响力",
        detail: "总 stars 占 52%，总 forks 占 28%，watchers 占 12%，代表项目最高 stars 占 8%。"
      },
      {
        title: "开源贡献",
        detail: "总贡献占 55%，PR/Issue/Review 占 25%，活跃天数占 20%。"
      },
      {
        title: "活跃与稳定",
        detail: "近一年活跃仓库占 38%，近 90 天更新占 22%，活跃天数占 22%，最近更新时间新鲜度占 18%。"
      }
    ],
    dataIssue: {
      title: (left: string, right: string) => `数据准确性问题：${left} vs ${right}`,
      body: (left: string, right: string) => [
        `对比账号：${left} vs ${right}`,
        "",
        "哪些数据看起来不准确？",
        "",
        "期望修正：",
        "",
        "证据链接（可选）："
      ]
    },
    repository: {
      empty: "暂无代表仓库"
    },
    footnotes: {
      viewSource: (id: string) => `查看来源 ${id}`,
      missingSource: "来源未列出"
    },
    empty: {
      title: "等待开赛",
      description: "输入两个 GitHub 用户名后开始比拼。"
    },
    battle: {
      ariaLabel: (matchup: string) => `${matchup} 开场动画`,
      avatarAlt: (username: string) => `${username} 头像`
    },
    loading: {
      fallbackMatchup: "GitHub 账号对比",
      title: "正在对比"
    },
    error: {
      title: "分析失败",
      requestFailed: "请求失败。",
      streamUnsupported: "浏览器不支持流式响应。"
    },
    timeline: {
      ariaLabel: "模型行动时间线",
      title: "模型行动时间线",
      subtitle: "展示模型可观察的资料读取、工具调用和证据摘要。",
      streaming: "流式生成中",
      done: "已完成",
      hideTitle: "隐藏模型思考",
      showTitle: "展开模型思考",
      collapse: "收起",
      expand: "展开",
      sourceLabel: (sourceId: string) => `来源 ${sourceId}`
    },
    comparisonRows: {
      itemColumn: "项目"
    },
    account: {
      profileLinkTitle: "打开 GitHub 主页",
      avatarAlt: (username: string) => `${username} 头像`,
      finalScore: "最终总分",
      confidence: (confidence: string) => `置信度 ${confidence}`,
      systemScore: (score: number) => `系统 ${score}`,
      llmScore: (score: number | string) => `LLM ${score}`,
      followers: (count: string) => `${count} 追随者`,
      repositories: (count: string) => `${count} 仓库`,
      scoreBreakdownLabel: (username: string) => `${username} 得分构成`
    },
    share: {
      copied: "链接已复制",
      failed: "复制失败，请手动复制地址栏链接",
      ariaLabel: "分享比拼结果",
      title: "分享结果",
      validDays: (days: number) => `比拼信息 ${days} 天内有效。`,
      copyTitle: "复制结果链接",
      copy: "复制链接",
      imageTitle: "打开保存图片弹窗",
      image: "保存图片"
    },
    scoreInfo: {
      title: "总分构成",
      description: "最终总分由固定系统分和 LLM 判断分各占一半。",
      close: "关闭",
      dimensionTitle: "固定系统分维度"
    },
    overview: {
      publicImpact: "公开影响",
      followersFollowing: (followers: string, following: string) => `${followers} 追随者 / ${following} 关注`,
      repositoryScale: "仓库规模",
      repositoryScaleValue: (repos: string, active: string) => `${repos} 个公开仓库 / 近一年活跃 ${active} 个`,
      reposGists: (repos: string, gists: string) => `${repos} 个仓库 / ${gists} 个 Gist`,
      projectImpact: "项目影响",
      contributionSignals: "贡献信号",
      contributionSignalsValue: (total: string, activeDays: string) => `${total} 次贡献 / ${activeDays} 个活跃日`,
      topLanguages: "主要语言",
      profileUpdated: "资料更新",
      featuredRepositories: "代表仓库",
      title: "资料概览"
    },
    metrics: {
      ariaLabel: "维度对比表格",
      dimension: "维度",
      reportIssue: "[数据不准确？]"
    },
    analysis: {
      summaryTitle: "大模型评价",
      winnerLabel: (username: string) => `模型观点：${username}`,
      closeResult: "模型认为双方接近",
      scoringTitle: "模型评分",
      dimensionInsightsTitle: "维度洞察",
      missingAccountInsight: "模型未提供该账号洞察。",
      accountAnalysisTitle: "账号分析",
      strengths: "优势",
      risks: "风险",
      recommendations: "建议",
      caveatsTitle: "评估边界",
      sourcesTitle: "信息来源"
    },
    cache: {
      title: "已显示缓存结果",
      cachedAtLabel: "缓存时间：",
      regenerateTitle: "重新生成比拼结果",
      regenerate: "重新生成"
    },
    results: {
      title: "综合结果",
      scoreInfoTitle: "查看总分构成",
      scoreInfo: "总分说明",
      winner: (username: string) => `最终总分赢家：${username}`,
      close: "势均力敌"
    },
    form: {
      leftAccount: "账号 A",
      rightAccount: "账号 B",
      language: "语言",
      zhCN: "中文",
      enUS: "英文",
      submitTitle: "开始比拼",
      loading: "分析中",
      submit: "开始比拼",
      sourceNote: "GitHub API 和公开页面提供上下文，评价内容始终由已配置的大模型生成。"
    }
  },
  leaderboard: {
    row: {
      avatarAlt: (username: string) => `${username} 头像`,
      systemTotal: "系统总分",
      dimensionScoresLabel: (username: string) => `${username} 维度分数`
    },
    error: {
      loadFailed: "排行榜加载失败。"
    },
    ariaLabel: "排行榜",
    title: "排行榜",
    subtitle: "系统分榜单，不包含 LLM 判断分；历史记录保留，排名按每个用户最新一次计算。",
    refreshTitle: "刷新排行榜",
    loading: "排行榜加载中",
    empty: "暂无排行榜记录",
    count: (total: string, max: string) => `${total} / ${max} 名`,
    truncated: (max: string) => `仅展示前 ${max} 名`,
    previousTitle: "上一页",
    previous: "上一页",
    page: (page: string, totalPages: string) => `第 ${page} / ${totalPages} 页`,
    nextTitle: "下一页",
    next: "下一页"
  },
  shareImage: {
    unknownDate: "未知日期",
    winnerBadge: "胜出",
    finalScore: "最终总分",
    systemScore: (score: number) => `系统 ${score}`,
    llmScore: (score: number | string) => `LLM ${score}`,
    radarTitle: "维度分析图",
    radarSubtitle: "与页面展示一致，五个维度按 0-100 分展开。",
    winnerText: (winner: string) => `${winner} 胜出`,
    closeWinnerText: "势均力敌",
    leadText: (margin: number) => `总分领先 ${margin} 分`,
    closeLeadText: "双方总分非常接近",
    qrTitle: "扫码打开比拼页面",
    validity: (days: number, expiresAt: string) => `比拼信息 ${days} 天内有效，截止 ${expiresAt}。`,
    canvasUnsupported: "当前浏览器不支持 Canvas。",
    modalTitle: "保存结果图片",
    modalDescription: (days: number) => `比拼信息 ${days} 天内有效。`,
    download: "下载 PNG",
    close: "关闭",
    previewLabel: "分享图片预览"
  },
  validation: {
    githubUsername: {
      required: "GitHub 用户名不能为空。",
      tooLong: "GitHub 用户名不能超过 39 个字符。",
      invalidCharacters: "GitHub 用户名只能包含字母、数字和连字符。",
      edgeHyphen: "GitHub 用户名不能以连字符开头或结尾。",
      consecutiveHyphens: "GitHub 用户名不能包含连续连字符。"
    },
    compareDifferentUsers: "请对比两个不同的 GitHub 用户名。"
  },
  errors: {
    unknown: "未知错误",
    analysisFailed: "分析失败，请稍后重试。",
    requestFailed: "请求失败，请稍后重试。"
  },
  githubErrors: {
    userNotFound: "未找到 GitHub 用户。",
    badCredentials: "GitHub 拒绝了当前 token，请检查 GITHUB_TOKEN 和后端日志。",
    rateLimited: "GitHub API 已达到速率限制，请在后端日志中查看原始 GitHub 响应。",
    forbidden: "GitHub API 请求被拒绝，请检查 GITHUB_TOKEN 权限和后端日志。",
    requestFailed: (status: number) => `GitHub 请求失败，状态码 ${status}。`,
    graphQlUnusableResponse: "GitHub GraphQL 贡献数据响应不可用。"
  },
  scoring: {
    followersDetail: (followers: string, following: string) => `${followers} 位追随者，关注 ${following} 人。`,
    repositoriesDetail: (total: string, active: string, ownedRatioPercent: number) =>
      `${total} 个公开仓库，近一年活跃 ${active} 个，非 fork 占比 ${ownedRatioPercent}%。`,
    projectImpactDetail: (stars: string, forks: string, topRepoStars: string) =>
      `${stars} stars、${forks} forks，代表项目最高 ${topRepoStars} stars。`,
    contributionDetail: (total: string, pullRequests: string, issues: string, reviews: string, confidence: string) =>
      `${total} 次贡献，PR ${pullRequests}、Issue ${issues}、Review ${reviews}，置信度 ${confidence}。`,
    activityDetail: (active: string, updatedRecently: string, activeDays: string) =>
      `近一年活跃仓库 ${active} 个，近 90 天更新 ${updatedRecently} 个，活跃天数 ${activeDays}。`,
    winnerReason: (username: string, margin: number) => `${username} 综合分高出 ${margin} 分，优势主要来自得分更高的维度组合。`
  },
  compareTimeline: {
    collectStartTitle: "开始收集 GitHub 数据",
    collectStartDetail: (left: string, right: string) =>
      `准备比较 ${left} 与 ${right}，同时收集个人资料、仓库、贡献时间线和公开页面上下文。`,
    collectDoneTitle: "GitHub 数据收集完成",
    collectDoneDetail: (leftRepositories: number, rightRepositories: number, leftTimeline: number, rightTimeline: number) =>
      `已收集 ${leftRepositories} + ${rightRepositories} 个仓库，以及 ${leftTimeline} + ${rightTimeline} 条近期贡献时间线。`,
    metricsDoneTitle: "本地指标计算完成",
    metricsDoneDetail: "已生成追随者、仓库建设、项目影响力、开源贡献、活跃与稳定五个维度的评分，作为模型评估输入。",
    modelFailedTitle: "模型生成失败"
  },
  llm: {
    errors: {
      apiKeyRequired: "账号评估需要配置 LLM API key。",
      emptyResponse: "LLM 响应为空。",
      toolRoundLimit: "LLM 未能在工具调用次数限制内完成。",
      invalidResponse: (issueSummary: string) => `LLM 响应不符合预期分析结构。${issueSummary}`,
      generationFailed: (message: string) => `LLM 生成失败：${message}`
    },
    timeline: {
      continueEvidenceTitle: "模型继续整合证据",
      startReadingTitle: "模型开始阅读资料",
      finalGenerationTitle: "模型进入最终生成",
      continueEvidenceDetail: "模型正在根据工具返回的项目、Issue/PR 与时间线资料生成下一步。",
      startReadingDetail: "模型正在阅读账号资料、项目列表、贡献时间线和可用工具说明。",
      finalGenerationDetail: "工具预算已完成，模型正在生成带脚注来源的最终评价。",
      toolCallTitle: (toolName: string) => `模型调用工具：${toolName}`,
      toolResultTitle: (toolName: string) => `工具返回：${toolName}`,
      repairOutputTitle: "模型修正输出结构",
      repairOutputDetail: (issueSummary: string) => `模型最终输出需要修正为结构化 JSON：${issueSummary}`,
      finalTitle: "模型生成最终评价",
      finalDetail: "模型已基于基础资料和工具返回内容生成带脚注来源的最终 JSON 评价。"
    }
  }
};

export type Messages = typeof zhCNMessages;

export const zhCN: Messages = zhCNMessages;

export const enUS: Messages = {
  app: {
    title: "GitHub Profile Competition",
    tagline: "profile competition"
  },
  metadata: {
    title: "GitHub Profile Competition",
    description: "Compare two GitHub profiles with public metrics and AI analysis."
  },
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
  },
  appHeader: {
    navigation: {
      compare: "Compare",
      leaderboard: "Leaderboard",
      github: "GitHub"
    },
    menu: {
      label: "Menu",
      open: "Open menu",
      close: "Close menu"
    },
    navigationLabel: "Primary navigation"
  },
  radarChart: {
    comparisonLabel: (left: string, right: string) => `Radar chart comparison for ${left} and ${right}`
  },
  comparison: {
    chartLoading: "Loading radar chart",
    common: {
      notAvailable: "N/A",
      unknownTime: "Unknown time",
      followers: "Followers",
      repositories: "Repositories",
      system: "System",
      llm: "LLM",
      starsAndForks: (stars: string, forks: string) => `${stars} stars / ${forks} forks`
    },
    loadingSubtitles: [
      "Reading public data and laying out stars, forks, and contribution timelines.",
      "The model is checking README and issue signals for real project quality.",
      "System scoring is underway while the LLM score warms up.",
      "Contribution history is being weighed, with recent activity treated carefully.",
      "If the matchup is close, the evidence gets the final word."
    ],
    scoreFormulaRows: [
      {
        title: "Fixed system score",
        detail: "Each of the five dimensions is scored from 0 to 100, and the system score is their average."
      },
      {
        title: "LLM judgment score",
        detail: "The model assigns each account a 0-100 judgment score based on profile data, tool evidence, and system scores."
      },
      {
        title: "Final total score",
        detail: "Final total score = fixed system score * 50% + LLM judgment score * 50%."
      },
      {
        title: "Winner decision",
        detail: "The page uses the final total score; margins below 2 points are treated as close."
      }
    ],
    dimensionFormulaRows: [
      {
        title: "Followers",
        detail: "Follower count uses logarithmic scaling, with 50,000 followers as the 100-point benchmark."
      },
      {
        title: "Repositories",
        detail: "Public repository count contributes 58%, active repositories in the past year 24%, and non-fork ratio 18%."
      },
      {
        title: "Project impact",
        detail: "Total stars contribute 52%, forks 28%, watchers 12%, and the top repository's stars 8%."
      },
      {
        title: "Open source contribution",
        detail: "Total contributions contribute 55%, PRs/issues/reviews 25%, and active days 20%."
      },
      {
        title: "Activity and consistency",
        detail: "Active repositories in the past year contribute 38%, updates in the past 90 days 22%, active days 22%, and recent freshness 18%."
      }
    ],
    dataIssue: {
      title: (left: string, right: string) => `Data accuracy issue: ${left} vs ${right}`,
      body: (left: string, right: string) => [
        `Compared users: ${left} vs ${right}`,
        "",
        "What seems inaccurate?",
        "",
        "Expected correction:",
        "",
        "Evidence URL (optional):"
      ]
    },
    repository: {
      empty: "No representative repositories"
    },
    footnotes: {
      viewSource: (id: string) => `View source ${id}`,
      missingSource: "Source not listed"
    },
    empty: {
      title: "Waiting for a matchup",
      description: "Enter two GitHub usernames to start the comparison."
    },
    battle: {
      ariaLabel: (matchup: string) => `${matchup} opening animation`,
      avatarAlt: (username: string) => `${username} avatar`
    },
    loading: {
      fallbackMatchup: "GitHub account comparison",
      title: "Comparing"
    },
    error: {
      title: "Analysis failed",
      requestFailed: "Request failed.",
      streamUnsupported: "This browser does not support streaming responses."
    },
    timeline: {
      ariaLabel: "Model action timeline",
      title: "Model action timeline",
      subtitle: "Shows observable data reads, tool calls, and evidence summaries from the model.",
      streaming: "Streaming",
      done: "Completed",
      hideTitle: "Hide model reasoning",
      showTitle: "Show model reasoning",
      collapse: "Collapse",
      expand: "Expand",
      sourceLabel: (sourceId: string) => `Source ${sourceId}`
    },
    comparisonRows: {
      itemColumn: "Item"
    },
    account: {
      profileLinkTitle: "Open GitHub profile",
      avatarAlt: (username: string) => `${username} avatar`,
      finalScore: "Final total score",
      confidence: (confidence: string) => `${confidence} confidence`,
      systemScore: (score: number) => `System ${score}`,
      llmScore: (score: number | string) => `LLM ${score}`,
      followers: (count: string) => `${count} followers`,
      repositories: (count: string) => `${count} repositories`,
      scoreBreakdownLabel: (username: string) => `${username} score breakdown`
    },
    share: {
      copied: "Link copied",
      failed: "Copy failed. Please copy the address bar link manually.",
      ariaLabel: "Share comparison result",
      title: "Share result",
      validDays: (days: number) => `Comparison information is valid for ${days} days.`,
      copyTitle: "Copy result link",
      copy: "Copy link",
      imageTitle: "Open save image dialog",
      image: "Save image"
    },
    scoreInfo: {
      title: "Score composition",
      description: "The final total score is half fixed system score and half LLM judgment score.",
      close: "Close",
      dimensionTitle: "Fixed system score dimensions"
    },
    overview: {
      publicImpact: "Public impact",
      followersFollowing: (followers: string, following: string) => `${followers} followers / ${following} following`,
      repositoryScale: "Repository scale",
      repositoryScaleValue: (repos: string, active: string) => `${repos} public repositories / ${active} active in the past year`,
      reposGists: (repos: string, gists: string) => `${repos} repos / ${gists} gists`,
      projectImpact: "Project impact",
      contributionSignals: "Contribution signals",
      contributionSignalsValue: (total: string, activeDays: string) => `${total} contributions / ${activeDays} active days`,
      topLanguages: "Top languages",
      profileUpdated: "Profile updated",
      featuredRepositories: "Featured repositories",
      title: "Profile overview"
    },
    metrics: {
      ariaLabel: "Dimension comparison table",
      dimension: "Dimension",
      reportIssue: "[Data inaccurate?]"
    },
    analysis: {
      summaryTitle: "LLM evaluation",
      winnerLabel: (username: string) => `Model view: ${username}`,
      closeResult: "The model considers this matchup close",
      scoringTitle: "Model scoring",
      dimensionInsightsTitle: "Dimension insights",
      missingAccountInsight: "The model did not provide insight for this account.",
      accountAnalysisTitle: "Account analysis",
      strengths: "Strengths",
      risks: "Risks",
      recommendations: "Recommendations",
      caveatsTitle: "Evaluation limits",
      sourcesTitle: "Sources"
    },
    cache: {
      title: "Showing cached result",
      cachedAtLabel: "Cached at: ",
      regenerateTitle: "Regenerate comparison result",
      regenerate: "Regenerate"
    },
    results: {
      title: "Overall result",
      scoreInfoTitle: "View score composition",
      scoreInfo: "Score info",
      winner: (username: string) => `Final total score winner: ${username}`,
      close: "Too close to call"
    },
    form: {
      leftAccount: "Account A",
      rightAccount: "Account B",
      language: "Language",
      zhCN: "Chinese",
      enUS: "English",
      submitTitle: "Start comparison",
      loading: "Analyzing",
      submit: "Start comparison",
      sourceNote: "GitHub API and public pages provide context; evaluation content is always generated by the configured LLM."
    }
  },
  leaderboard: {
    row: {
      avatarAlt: (username: string) => `${username} avatar`,
      systemTotal: "System total",
      dimensionScoresLabel: (username: string) => `${username} dimension scores`
    },
    error: {
      loadFailed: "Failed to load leaderboard."
    },
    ariaLabel: "Leaderboard",
    title: "Leaderboard",
    subtitle: "System-score leaderboard, excluding LLM judgment scores; history is retained, and ranking uses each user's latest calculation.",
    refreshTitle: "Refresh leaderboard",
    loading: "Loading leaderboard",
    empty: "No leaderboard records",
    count: (total: string, max: string) => `${total} / ${max} users`,
    truncated: (max: string) => `Showing only the top ${max}`,
    previousTitle: "Previous page",
    previous: "Previous",
    page: (page: string, totalPages: string) => `Page ${page} / ${totalPages}`,
    nextTitle: "Next page",
    next: "Next"
  },
  shareImage: {
    unknownDate: "Unknown date",
    winnerBadge: "Winner",
    finalScore: "Final total score",
    systemScore: (score: number) => `System ${score}`,
    llmScore: (score: number | string) => `LLM ${score}`,
    radarTitle: "Dimension radar chart",
    radarSubtitle: "Matches the page display, expanding five dimensions on a 0-100 scale.",
    winnerText: (winner: string) => `${winner} wins`,
    closeWinnerText: "Too close to call",
    leadText: (margin: number) => `Leads by ${margin} points`,
    closeLeadText: "The total scores are very close",
    qrTitle: "Scan to open comparison page",
    validity: (days: number, expiresAt: string) => `Comparison information is valid for ${days} days, until ${expiresAt}.`,
    canvasUnsupported: "This browser does not support Canvas.",
    modalTitle: "Save result image",
    modalDescription: (days: number) => `Comparison information is valid for ${days} days.`,
    download: "Download PNG",
    close: "Close",
    previewLabel: "Share image preview"
  },
  validation: {
    githubUsername: {
      required: "GitHub username is required.",
      tooLong: "GitHub username must be 39 characters or fewer.",
      invalidCharacters: "GitHub username can only contain letters, numbers, and hyphens.",
      edgeHyphen: "GitHub username cannot start or end with a hyphen.",
      consecutiveHyphens: "GitHub username cannot contain consecutive hyphens."
    },
    compareDifferentUsers: "Please compare two different GitHub usernames."
  },
  errors: {
    unknown: "Unknown error",
    analysisFailed: "Analysis failed. Please try again later.",
    requestFailed: "Request failed. Please try again later."
  },
  githubErrors: {
    userNotFound: "GitHub user was not found.",
    badCredentials: "GitHub token was rejected by GitHub. Check GITHUB_TOKEN and backend logs.",
    rateLimited: "GitHub API rate limit was reached. Check the backend logs for the raw GitHub response.",
    forbidden: "GitHub API request was forbidden. Check GITHUB_TOKEN permissions and backend logs.",
    requestFailed: (status: number) => `GitHub request failed with status ${status}.`,
    graphQlUnusableResponse: "GitHub GraphQL contribution response was not usable."
  },
  scoring: {
    followersDetail: (followers: string, following: string) => `${followers} followers, following ${following}.`,
    repositoriesDetail: (total: string, active: string, ownedRatioPercent: number) =>
      `${total} public repositories, ${active} active in the past year, ${ownedRatioPercent}% non-fork repositories.`,
    projectImpactDetail: (stars: string, forks: string, topRepoStars: string) =>
      `${stars} stars, ${forks} forks, with the top repository at ${topRepoStars} stars.`,
    contributionDetail: (total: string, pullRequests: string, issues: string, reviews: string, confidence: string) =>
      `${total} contributions, ${pullRequests} PRs, ${issues} issues, ${reviews} reviews, ${confidence} confidence.`,
    activityDetail: (active: string, updatedRecently: string, activeDays: string) =>
      `${active} repositories active in the past year, ${updatedRecently} updated in the past 90 days, ${activeDays} active days.`,
    winnerReason: (username: string, margin: number) =>
      `${username} leads by ${margin} points overall, mainly due to a stronger combination of dimension scores.`
  },
  compareTimeline: {
    collectStartTitle: "Start collecting GitHub data",
    collectStartDetail: (left: string, right: string) =>
      `Preparing to compare ${left} and ${right}, collecting profile, repository, contribution timeline, and public page context.`,
    collectDoneTitle: "GitHub data collection completed",
    collectDoneDetail: (leftRepositories: number, rightRepositories: number, leftTimeline: number, rightTimeline: number) =>
      `Collected ${leftRepositories} + ${rightRepositories} repositories and ${leftTimeline} + ${rightTimeline} recent contribution timeline entries.`,
    metricsDoneTitle: "Local metrics calculated",
    metricsDoneDetail:
      "Generated scores for followers, repositories, project impact, open source contribution, and activity/consistency as model inputs.",
    modelFailedTitle: "Model generation failed"
  },
  llm: {
    errors: {
      apiKeyRequired: "LLM API key is required for profile evaluation.",
      emptyResponse: "LLM response was empty.",
      toolRoundLimit: "LLM did not finish within the tool call limit.",
      invalidResponse: (issueSummary: string) => `LLM response did not match the expected analysis schema. ${issueSummary}`,
      generationFailed: (message: string) => `LLM generation failed: ${message}`
    },
    timeline: {
      continueEvidenceTitle: "Model continues integrating evidence",
      startReadingTitle: "Model starts reading data",
      finalGenerationTitle: "Model enters final generation",
      continueEvidenceDetail: "The model is generating the next step from returned repository, issue/PR, and timeline evidence.",
      startReadingDetail: "The model is reading account profiles, repository lists, contribution timelines, and available tool instructions.",
      finalGenerationDetail: "Tool budget is complete, and the model is generating the final evaluation with footnoted sources.",
      toolCallTitle: (toolName: string) => `Model calls tool: ${toolName}`,
      toolResultTitle: (toolName: string) => `Tool returned: ${toolName}`,
      repairOutputTitle: "Model repairs output structure",
      repairOutputDetail: (issueSummary: string) => `The final model output must be repaired into structured JSON: ${issueSummary}`,
      finalTitle: "Model generated final evaluation",
      finalDetail: "The model generated final JSON evaluation with footnoted sources from base data and returned tool content."
    }
  }
};

export function getMessages(locale: LocaleCode | undefined): Messages {
  if (locale === "en-US") {
    return enUS;
  }

  return zhCN;
}

export function normalizeLocaleCode(locale: string | null | undefined): LocaleCode {
  return locale === "en-US" ? "en-US" : "zh-CN";
}
