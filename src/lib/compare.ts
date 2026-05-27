import { zhCN } from "@/i18n/messages";
import { collectGitHubUserDataset } from "@/lib/github";
import { generateLlmAnalysis } from "@/lib/llm";
import { calculateComparisonMetrics, composeComparisonMetricsWithLlmScores } from "@/lib/scoring";
import { saveLeaderboardScores } from "@/lib/leaderboard";
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
    title: zhCN.compareTimeline.collectStartTitle,
    detail: zhCN.compareTimeline.collectStartDetail(request.users[0], request.users[1]),
    status: "running"
  });

  const datasets = (await Promise.all(
    request.users.map((username) => collectGitHubUserDataset(username))
  )) as [UserDataset, UserDataset];

  await recorder.emit({
    phase: "data",
    title: zhCN.compareTimeline.collectDoneTitle,
    detail: zhCN.compareTimeline.collectDoneDetail(
      datasets[0].repositories.length,
      datasets[1].repositories.length,
      datasets[0].contributionTimeline.length,
      datasets[1].contributionTimeline.length
    ),
    status: "completed",
    sourceIds: datasets.flatMap((dataset) => [`profile-${dataset.profile.login}`, `repositories-${dataset.profile.login}`, `timeline-${dataset.profile.login}`])
  });

  let metrics = calculateComparisonMetrics(datasets, locale);

  await recorder.emit({
    phase: "data",
    title: zhCN.compareTimeline.metricsDoneTitle,
    detail: zhCN.compareTimeline.metricsDoneDetail,
    status: "completed"
  });

  let llm: LlmResult;

  try {
    llm = await generateLlmAnalysis(datasets, metrics, locale, recorder.emit);
    metrics = composeComparisonMetricsWithLlmScores(metrics, llm.analysis.accountScores);
    saveLeaderboardScores(datasets, metrics.accounts);
  } catch (error) {
    await recorder.emit({
      phase: "error",
      title: zhCN.compareTimeline.modelFailedTitle,
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
