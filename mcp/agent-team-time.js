const MAX_COUNTER = Number.MAX_SAFE_INTEGER;

const safeCounter = (value) => (
  Number.isSafeInteger(value) && value >= 0 ? value : MAX_COUNTER
);

export const saturatingAgentTeamCounterAdd = (left, right) => {
  const first = safeCounter(left);
  const second = safeCounter(right);
  return first > MAX_COUNTER - second ? MAX_COUNTER : first + second;
};

export const saturatingAgentTeamCostAdd = (left, right) => {
  const sum = Number(left) + Number(right);
  return Number.isFinite(sum) && sum >= 0 ? sum : Number.MAX_VALUE;
};

export const normalizeAgentTeamTimestamp = (value) => (
  Number.isSafeInteger(value) && value >= 0 ? value : MAX_COUNTER
);

export const agentTeamActiveIntervalMs = (state, atMs) => {
  if (!Number.isSafeInteger(state?.activeSince) || state.activeSince < 0) return 0;
  const at = normalizeAgentTeamTimestamp(atMs);
  return at >= state.activeSince ? at - state.activeSince : 0;
};

export const projectedAgentTeamActiveMs = (state, atMs, minimumIntervalMs = 0) => (
  saturatingAgentTeamCounterAdd(
    state?.activeExecutionMs,
    Math.max(agentTeamActiveIntervalMs(state, atMs), safeCounter(minimumIntervalMs)),
  )
);

export function foldAgentTeamActiveInterval(
  state,
  atMs,
  { minimumIntervalMs = 0, continueActive = false } = {},
) {
  const at = normalizeAgentTeamTimestamp(atMs);
  const intervalMs = Math.max(
    agentTeamActiveIntervalMs(state, at),
    safeCounter(minimumIntervalMs),
  );
  state.activeExecutionMs = saturatingAgentTeamCounterAdd(state.activeExecutionMs, intervalMs);
  state.activeSince = continueActive ? at : null;
  return intervalMs;
}

export const remainingAgentTeamActiveMs = (state, atMs, maximumMs) => (
  Math.max(0, Number(maximumMs) - projectedAgentTeamActiveMs(state, atMs))
);
