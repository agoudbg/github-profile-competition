import { collectGitHubUserDataset } from "@/lib/github";
import { generateLlmAnalysis } from "@/lib/llm";
import { calculateComparisonMetrics, composeComparisonMetricsWithLlmScores } from "@/lib/scoring";
import { getSafeClientMessage } from "@/lib/errors";
import type {
  CompareRequest,
  CompareResponse,
  LlmResult,
  ModelTimelineEvent,
  ModelTimelineEventInput,
  UserDataset
} from "@/lib/types";

type TimelineForwarder = (event: ModelTimelineEvent) => void | Promise<void>;

function createTimelineRecorder(forward?: TimelineForwarder) {
  const timeline: ModelTimelineEvent[] = [];
  let counter = 0;

  async function emit(input: ModelTimelineEventInput): Promise<void> {
    counter += 1;
    const event: ModelTimelineEvent = {
      id: `event-${counter}`,
      at: new Date().toISOString(),
      ...input
    };

    timeline.push(event);
    await forward?.(event);
  }

  return {
    timeline,
    emit
  };
}

export async function compareGitHubProfiles(request: CompareRequest, forwardTimeline?: TimelineForwarder): Promise<CompareResponse> {
  const locale = request.locale ?? "zh-CN";
  const recorder = createTimelineRecorder(forwardTimeline);

  await recorder.emit({
    phase: "data",
    title: "开始收集 GitHub 数据",
    detail: `准备比较 ${request.users[0]} 与 ${request.users[1]}，同时收集 profile、仓库、贡献时间线和公开页面上下文。`,
    status: "running"
  });

  const datasets = (await Promise.all(
    request.users.map((username) => collectGitHubUserDataset(username))
  )) as [UserDataset, UserDataset];

  await recorder.emit({
    phase: "data",
    title: "GitHub 数据收集完成",
    detail: `已收集 ${datasets[0].repositories.length} + ${datasets[1].repositories.length} 个仓库，以及 ${datasets[0].contributionTimeline.length} + ${datasets[1].contributionTimeline.length} 条近期贡献时间线。`,
    status: "completed",
    sourceIds: datasets.flatMap((dataset) => [`profile-${dataset.profile.login}`, `repositories-${dataset.profile.login}`, `timeline-${dataset.profile.login}`])
  });

  let metrics = calculateComparisonMetrics(datasets, locale);

  await recorder.emit({
    phase: "data",
    title: "本地指标计算完成",
    detail: "已生成追随者、仓库建设、项目影响力、开源贡献、活跃与稳定五个维度的评分，作为模型评估输入。",
    status: "completed"
  });

  let llm: LlmResult;

  try {
    llm = await generateLlmAnalysis(datasets, metrics, locale, recorder.emit);
    metrics = composeComparisonMetricsWithLlmScores(metrics, llm.analysis.accountScores);
  } catch (error) {
    await recorder.emit({
      phase: "error",
      title: "模型生成失败",
      detail: getSafeClientMessage(error),
      status: "error"
    });
    throw error;
  }

  return {
    users: datasets,
    metrics,
    llm,
    timeline: recorder.timeline,
    locale,
    requestedAt: new Date().toISOString()
  };
}
