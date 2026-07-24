import {
  saturatingAgentTeamCostAdd,
  saturatingAgentTeamCounterAdd,
} from "./agent-team-time.js";

export const agentTeamUsageWouldExceed = (usage, envelope, bounds) => (
  usage.totalTokens + envelope.totalTokens > bounds.maxTokens
  || usage.costStatus !== "reported"
  || usage.costUsd + envelope.costUsd > bounds.maxCostUsd
);

export const accumulateAgentTeamUsage = (usage, reported) => ({
  turns: usage.turns,
  inputTokens: saturatingAgentTeamCounterAdd(usage.inputTokens, reported.inputTokens),
  outputTokens: saturatingAgentTeamCounterAdd(usage.outputTokens, reported.outputTokens),
  totalTokens: saturatingAgentTeamCounterAdd(usage.totalTokens, reported.totalTokens),
  costUsd: saturatingAgentTeamCostAdd(usage.costUsd, reported.costUsd),
  costStatus: "reported",
});

export const unreportedAgentTeamUsage = (usage) => ({
  ...usage,
  costUsd: null,
  costStatus: "unreported",
});

export const agentTeamPrivateContextBytes = (messages) => messages.reduce(
  (total, message) => total + Buffer.byteLength(String(message?.content || ""), "utf8"),
  0,
);
