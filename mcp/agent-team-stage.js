export const composeAgentTeamStageSignal = (outerSignal, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("Agent-team stage timed out.")),
    timeoutMs,
  );
  const abort = () => controller.abort(
    outerSignal?.reason || new Error("Agent-team execution was canceled."),
  );
  if (outerSignal?.aborted) abort();
  else outerSignal?.addEventListener?.("abort", abort, { once: true });
  return {
    signal: controller.signal,
    abort(reason) {
      controller.abort(reason || new Error("Agent-team execution was canceled."));
    },
    dispose() {
      clearTimeout(timeout);
      outerSignal?.removeEventListener?.("abort", abort);
    },
  };
};

export async function settleAgentTeamAdapterCall(execute, signal) {
  if (signal.aborted) return { kind: "aborted", reason: signal.reason };
  let onAbort;
  const aborted = new Promise((resolve) => {
    onAbort = () => resolve({ kind: "aborted", reason: signal.reason });
    signal.addEventListener("abort", onAbort, { once: true });
  });
  const effect = Promise.resolve()
    .then(execute)
    .then(
      (value) => ({ kind: "value", value }),
      (error) => ({ kind: "error", error }),
    );
  const outcome = await Promise.race([effect, aborted]);
  signal.removeEventListener("abort", onAbort);
  return outcome;
}
