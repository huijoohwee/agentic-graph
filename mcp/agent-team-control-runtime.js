import crypto from "node:crypto";

import {
  agentTeamError,
  publicAgentTeamControlSnapshot,
  snapshotAgentTeamRun,
  ZERO_AGENT_TEAM_USAGE,
} from "./agent-team-result.js";
import {
  authorizeAgentTeamControl,
  verifyAgentTeamReviewReceipt,
} from "./agent-team-review.js";
import {
  AGENT_TEAM_MAX_CHECKPOINTS,
  agentTeamCheckpointId,
  digestAgentTeamValue,
} from "./agent-team-store.js";
import {
  foldAgentTeamActiveInterval,
  normalizeAgentTeamTimestamp,
} from "./agent-team-time.js";

const TERMINAL_STATES = new Set(["completed", "canceled"]);
const RESUMABLE_STATES = new Set(["paused", "blocked"]);
const RETRYABLE_STATES = new Set(["failed", "blocked"]);
const receiptKeyFor = (key) => crypto.createHash("sha256").update(String(key)).digest("hex");

const contextForState = (state) => ({
  teamId: state?.plan?.teamId || null,
  teamRevision: state?.plan?.teamRevision || null,
  runId: state?.runId || null,
  state: state?.state || null,
  stateVersion: state?.stateVersion ?? null,
  planDigest: state?.planDigest || null,
  evidence: state?.plan?.evidence || [],
  usage: state?.usage || ZERO_AGENT_TEAM_USAGE,
});

const controlFingerprint = (input) => digestAgentTeamValue({
  runId: input.runId,
  expectedStateVersion: input.expectedStateVersion,
  action: input.action,
  reason: input.reason,
  reviewReceipt: input.reviewReceipt || null,
});

const snapshotFor = (state, action, authorizationDigest) => {
  const stateVersion = state.stateVersion + 1;
  return {
    action,
    authorizationDigest,
    state: state.state,
    stateVersion,
    checkpointId: agentTeamCheckpointId(state.runId, stateVersion),
    transitionSequence: state.transitionSequence + 1,
    currentBranchId: state.currentBranchId,
    currentConversationOwnerParticipantId: state.currentConversationOwnerParticipantId,
    finalAnswerOwnerParticipantId: state.finalAnswerOwnerParticipantId,
    completedBranchIds: [...state.completedBranchIds],
    review: structuredClone(state.review),
    usage: structuredClone(state.usage),
    error: state.error ? {
      code: String(state.error.code || "agent_team_runtime_error").slice(0, 120),
      message: String(state.error.message || "Agent-team control failed.").slice(0, 2_000),
    } : null,
  };
};

export function createAgentTeamControlHandler({
  store,
  controlAuthorizer,
  reviewReceiptVerifier,
  executionAdapter,
  configuredAdapterId,
  planResolver,
  activeControllers,
  execute,
  nowMs,
}) {
  return async function control(input, { signal } = {}) {
    let state;
    try {
      state = await store.read(input.runId);
    } catch (error) {
      return agentTeamError("control", error);
    }
    const receiptKey = receiptKeyFor(input.idempotencyKey);
    const fingerprint = controlFingerprint(input);
    const prior = state.controlReceipts[receiptKey];
    if (prior) {
      if (prior.fingerprint !== fingerprint) {
        return agentTeamError("control", {
          code: "idempotency_conflict",
          message: "Control idempotency key is already bound to a different transition.",
        }, contextForState(state));
      }
      if (!prior.snapshot) {
        return agentTeamError("control", {
          code: "control_replay_snapshot_unavailable",
          message: "The exact recorded control result is unavailable; current state will not be substituted.",
        }, contextForState(state));
      }
      return publicAgentTeamControlSnapshot(state, prior.snapshot);
    }
    if (state.stateVersion !== input.expectedStateVersion) {
      return agentTeamError("control", {
        code: "state_version_conflict",
        message: `Run state version is ${state.stateVersion}, not ${input.expectedStateVersion}.`,
      }, contextForState(state));
    }
    if (Object.keys(state.controlReceipts).length >= 64) {
      return agentTeamError("control", {
        code: "control_receipt_ledger_full",
        message: "The bounded control receipt ledger is full.",
      }, contextForState(state));
    }
    if (state.stateVersion >= AGENT_TEAM_MAX_CHECKPOINTS) {
      return agentTeamError("control", {
        code: "checkpoint_limit_exceeded",
        message: "The durable agent-team checkpoint limit is exhausted.",
      }, contextForState(state));
    }
    let authorizationDigest;
    try {
      authorizationDigest = await authorizeAgentTeamControl({ authorizer: controlAuthorizer, state, input });
    } catch (error) {
      return agentTeamError("control", error, contextForState(state));
    }
    const continues = ["resume", "retry"].includes(input.action)
      || (input.action === "record_review" && input.reviewReceipt?.decision === "approve");
    if (continues && state.stateVersion > AGENT_TEAM_MAX_CHECKPOINTS - 5) {
      return agentTeamError("control", {
        code: "checkpoint_budget_insufficient",
        message: "Continuation cannot reserve enough checkpoints for a fenced branch settlement.",
      }, contextForState(state));
    }
    let reviewVerification;
    if (input.action === "record_review") {
      try {
        reviewVerification = await verifyAgentTeamReviewReceipt({
          verifier: reviewReceiptVerifier,
          state,
          input,
        });
      } catch (error) {
        return agentTeamError("control", error, contextForState(state));
      }
    }
    if (continues) {
      if (state.usage.costStatus !== "reported") {
        return agentTeamError("control", {
          code: "continuation_budget_unreported",
          message: "Continuation is blocked because remaining token and cost budget cannot be proven.",
        }, contextForState(state));
      }
      if (state.error?.code === "adapter_envelope_exceeded") {
        return agentTeamError("control", {
          code: "execution_adapter_trust_fence_failed",
          message: "The adapter exceeded its exact envelope and cannot be retried for this run.",
        }, contextForState(state));
      }
      if (
        state.review?.status === "recorded"
        && ["reject", "revise"].includes(state.review.decision)
      ) {
        return agentTeamError("control", {
          code: "review_decision_terminal",
          message: "A rejected review is terminal and a revision requires a new exact plan.",
        }, contextForState(state));
      }
      const adapter = executionAdapter();
      if (!adapter || configuredAdapterId !== state.adapterId || adapter.revision !== state.adapterRevision) {
        return agentTeamError("control", {
          code: "execution_adapter_fence_mismatch",
          message: "The exact persisted host-owned execution adapter is unavailable.",
        }, contextForState(state));
      }
      try {
        await planResolver.revalidate(state.plan);
      } catch (error) {
        return agentTeamError("control", error, contextForState(state));
      }
    }
    try {
      const transitionAtMs = normalizeAgentTeamTimestamp(nowMs());
      const next = await store.update(state.runId, {
        expectedStateVersion: input.expectedStateVersion,
        eventType: `control.${input.action}`,
        eventData: { reasonDigest: crypto.createHash("sha256").update(input.reason).digest("hex") },
      }, (current) => {
        const action = input.action;
        if (current.state === "running") {
          foldAgentTeamActiveInterval(current, transitionAtMs);
        }
        if (TERMINAL_STATES.has(current.state)) {
          throw Object.assign(new Error(`State ${current.state} is terminal.`), { code: "invalid_control_transition" });
        }
        if (["pause", "cancel", "request_review"].includes(action) && current.currentBranchId && current.executionClaim) {
          current.usage = { ...current.usage, costUsd: null, costStatus: "unreported" };
        }
        if (action === "pause") {
          if (!["queued", "running"].includes(current.state)) throw Object.assign(new Error("Pause requires queued or running state."), { code: "invalid_control_transition" });
          current.state = "paused";
        } else if (action === "resume") {
          if (!RESUMABLE_STATES.has(current.state)) throw Object.assign(new Error("Resume requires paused or blocked state."), { code: "invalid_control_transition" });
          current.state = "queued";
          current.error = null;
        } else if (action === "cancel") {
          current.state = "canceled";
          current.currentBranchId = null;
          current.executionClaim = null;
          current.error = null;
        } else if (action === "retry") {
          if (!RETRYABLE_STATES.has(current.state)) throw Object.assign(new Error("Retry requires failed or blocked state."), { code: "invalid_control_transition" });
          current.state = "queued";
          current.error = null;
        } else if (action === "request_review") {
          if (current.state !== "running") throw Object.assign(new Error("Review request requires a running state."), { code: "invalid_control_transition" });
          current.state = "review_pending";
          current.review = {
            status: "pending",
            policyId: current.plan.reviewPolicy.policyId,
            policyRevision: current.plan.reviewPolicy.policyRevision,
            question: input.reason,
            allowedDecisions: ["approve", "revise", "reject"],
            evidenceReferences: [
              { kind: "plan_digest", digest: current.planDigest },
              { kind: "checkpoint", checkpointId: current.checkpointId },
            ],
            receiptId: null,
            decision: null,
            verificationDigest: null,
          };
        } else if (action === "record_review") {
          const receipt = input.reviewReceipt;
          if (
            current.state !== "review_pending"
            || !receipt
            || receipt.policyId !== current.plan.reviewPolicy.policyId
            || receipt.policyRevision !== current.plan.reviewPolicy.policyRevision
          ) throw Object.assign(new Error("Review receipt does not match the pending exact review policy."), { code: "review_receipt_mismatch" });
          current.review = { ...current.review, status: "recorded", ...receipt, verificationDigest: reviewVerification.digest };
          current.publicEvidence = [...(current.publicEvidence || []), reviewVerification.evidence].slice(-32);
          if (receipt.decision === "approve") {
            current.state = "running";
            current.activeSince = transitionAtMs;
          }
          else {
            current.state = "failed";
            current.error = {
              code: receipt.decision === "reject" ? "review_rejected" : "review_revision_requires_new_plan",
              message: input.reason,
            };
          }
        }
        if (!current.startReceipt?.snapshot) {
          const resultStateVersion = current.stateVersion + 1;
          current.startReceipt = {
            snapshot: snapshotAgentTeamRun(current, {
              stateVersion: resultStateVersion,
              checkpointId: agentTeamCheckpointId(current.runId, resultStateVersion),
              transitionSequence: current.transitionSequence + 1,
            }),
          };
        }
        current.controlReceipts[receiptKey] = {
          fingerprint,
          action,
          authorizationDigest,
          resultStateVersion: current.stateVersion + 1,
          snapshot: snapshotFor(current, action, authorizationDigest),
        };
        return current;
      });
      if (["pause", "cancel", "request_review"].includes(input.action)) {
        activeControllers.get(state.runId)?.abort(new Error(`Control action ${input.action} won the state fence.`));
      }
      const recorded = publicAgentTeamControlSnapshot(next, next.controlReceipts[receiptKey].snapshot);
      if (continues && ["queued", "running"].includes(next.state)) await execute(next.runId, signal).catch(() => undefined);
      return recorded;
    } catch (error) {
      return agentTeamError("control", error, contextForState(await store.read(state.runId).catch(() => state)));
    }
  };
}
