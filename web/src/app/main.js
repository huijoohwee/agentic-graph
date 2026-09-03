// Entry point for the agentic-graph Cloudflare Pages frontend.
//
// Spec: agentic-graph-widget-canvas-media (Cloudflare Pages frontend;
// R1, R13, R11.3). This is the THIN glue layer: it wires the DOM form + run
// surfaces to the REUSED pure builders/clients in `web/src/lib/*`. It owns NO
// view logic — validation, the forward decision, the error/timeout UX, the
// approval transmission, the 503 poll fallback, and every view-model are all
// delegated to the lib modules. This file only:
//   1. reads form input and live HTTP wiring (the one place network happens —
//      at RUNTIME in the browser, never at build time);
//   2. calls the lib builders;
//   3. hands their output to the thin `components.js` renderers.
//
// STACK BOUNDARY (R11/R15.7): the bundle holds no model provider key and no auth
// signing secret. The only credential attached is a caller-supplied Auth_Token
// read from `window.__AGENT_AUTH_TOKEN__` (opaque bearer), never embedded here.

import { AGENT_API_BASE_URL, CANVAS_BASE_URL } from "./config.js";
import { validateSubmission } from "./lib/submission-validation.js";
import { submitRun } from "./lib/run-submission-client.js";
import { resolveSubmissionOutcome } from "./lib/submission-error-ux.js";
import { buildRunInitiationView } from "./lib/run-initiation-view.js";
import { buildEvidencePackView } from "./lib/evidence-pack-view.js";
import { buildShotPlanView } from "./lib/shot-plan-view.js";
import { buildCanvasEmbedView } from "./lib/canvas-embed-view.js";
import { buildApprovalPromptView } from "./lib/approval-prompt-view.js";
import { buildRunManifestView } from "./lib/run-manifest-view.js";
import { buildCheckoutEntryView } from "./lib/checkout-entry-view.js";
import { pollRunStatusFallback } from "./lib/run-poll-fallback.js";
import {
  mount,
  renderRunState,
  renderInitiation,
  renderEvidence,
  renderShotPlan,
  renderCanvasEmbed,
  renderApprovals,
  renderBudgetMeters,
  renderCheckout,
  paintFieldErrors,
} from "./components.js";

// --- Runtime HTTP wiring (the ONLY network seam; runtime-only, never at build) ---

const runtimeState = {
  authToken: null,
  lastSubmission: null,
  approvedGateIds: new Set(),
};

/** Read the caller-supplied Auth_Token (opaque bearer) if the host set one. */
function authToken() {
  const explicit = runtimeState.authToken;
  if (typeof explicit === "string" && explicit) return explicit;
  const injected = typeof window !== "undefined" ? window.__AGENT_AUTH_TOKEN__ : undefined;
  return typeof injected === "string" && injected ? injected : undefined;
}

/** Resolve an Agent_Api URL: env-injected base (or same origin) + request path. */
function resolveUrl(pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = AGENT_API_BASE_URL.replace(/\/+$/, "");
  return `${base}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

/**
 * Live transport seam handed to the lib clients. Performs the real fetch at
 * runtime and returns parsed JSON on success; throws on a non-2xx so the lib
 * error/timeout UX treats it as a failed initiation.
 * @param {{ url: string, method: string, headers: object, body?: object }} req
 */
async function httpTransport(req) {
  const res = await fetch(resolveUrl(req.url), {
    method: req.method,
    headers: req.headers,
    body: req.body === undefined ? undefined : JSON.stringify(req.body),
  });
  if (!res.ok) {
    const err = new Error(`Agent_Api responded ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json().catch(() => ({}));
}

async function ensureAuthToken() {
  const existing = authToken();
  if (existing) {
    runtimeState.authToken = existing;
    return existing;
  }
  const res = await fetch(resolveUrl("/auth/session"), {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: "{}",
  });
  if (!res.ok) {
    const err = new Error(`Agent_Api auth/session responded ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const payload = await res.json().catch(() => ({}));
  if (typeof payload?.token !== "string" || payload.token.length === 0) {
    throw new Error("Agent_Api auth/session returned no token");
  }
  runtimeState.authToken = payload.token;
  return payload.token;
}

function currentApprovals() {
  return Array.from(runtimeState.approvedGateIds);
}

// --- Run rendering: build every view-model, mount every panel ----------------

const panels = {
  runState: () => document.getElementById("run-state"),
  initiation: () => document.getElementById("run-initiation"),
  evidence: () => document.getElementById("evidence-pack"),
  shotPlan: () => document.getElementById("shot-plan"),
  canvasEmbed: () => document.getElementById("canvas-embed"),
  approvals: () => document.getElementById("approval-prompts"),
  budget: () => document.getElementById("budget-meters"),
  checkout: () => document.getElementById("checkout-entry"),
};

/** Transmit an approval decision, then re-render whatever manifest comes back. */
async function onApprovalDecision(gateId, decision) {
  if (decision !== "approved") {
    setStatus(`Gate '${gateId}' remains blocked until you approve and re-submit.`, "error");
    return;
  }
  if (!runtimeState.lastSubmission) {
    setStatus("Re-submit unavailable: no prior run submission is cached in this session.", "error");
    return;
  }
  runtimeState.approvedGateIds.add(gateId);
  await submitManifestRun(runtimeState.lastSubmission, `Approved '${gateId}'. Re-submitting run…`);
}

async function submitManifestRun(submission, pendingText = "Submitting run…") {
  setStatus(pendingText);
  const token = await ensureAuthToken();
  const submitResult = await submitRun(
    {
      submission,
      approvals: currentApprovals(),
      authToken: token,
    },
    { transport: httpTransport },
  );
  return submitResult.result;
}

function rememberSubmission(submission) {
  runtimeState.lastSubmission = {
    referenceUrl: submission.referenceUrl,
    brief: submission.brief,
    budgetUsd: submission.budgetUsd,
  };
}

function resetApprovalState() {
  runtimeState.approvedGateIds = new Set();
}

function clearAuthToken() {
  runtimeState.authToken = null;
}

async function submitWithOneAuthRefresh(submission, pendingText) {
  try {
    return await submitManifestRun(submission, pendingText);
  } catch (err) {
    if (err?.status === 401) {
      clearAuthToken();
      return submitManifestRun(submission, pendingText);
    }
    throw err;
  }
}

/**
 * Render a Run_Manifest across every surface using the reused view builders.
 * @param {object} manifest Run_Manifest (or manifest-bearing envelope)
 */
export function renderRun(manifest) {
  document.getElementById("run-output").hidden = false;

  const manifestView = buildRunManifestView(manifest);
  mount(panels.runState(), ...renderRunState(manifestView));
  mount(panels.initiation(), ...renderInitiation(buildRunInitiationView(manifest)));
  mount(panels.evidence(), ...renderEvidence(buildEvidencePackView(manifest.evidencePack ?? manifest)));
  mount(panels.shotPlan(), ...renderShotPlan(buildShotPlanView(manifest.agenticOsDocument ?? manifest)));
  mount(panels.canvasEmbed(), ...renderCanvasEmbed(buildCanvasEmbedView(manifest, { canvasBaseUrl: CANVAS_BASE_URL })));
  mount(panels.approvals(), ...renderApprovals(buildApprovalPromptView(manifest), onApprovalDecision));
  mount(panels.budget(), ...renderBudgetMeters(manifestView));
  mount(panels.checkout(), ...renderCheckout(buildCheckoutEntryView(manifest)));
}

// --- Submission flow (R1.1, R1.2, R1.8) -------------------------------------

function readSubmission(form) {
  const data = new FormData(form);
  const budgetRaw = String(data.get("budgetUsd") ?? "").trim();
  return {
    referenceUrl: String(data.get("referenceUrl") ?? "").trim(),
    brief: String(data.get("brief") ?? ""),
    // Empty budget -> NaN so the validator reports the field (never silently 0).
    budgetUsd: budgetRaw === "" ? Number.NaN : Number(budgetRaw),
  };
}

function setStatus(text, tone) {
  const status = document.getElementById("form-status");
  status.textContent = text;
  if (tone) status.setAttribute("data-tone", tone);
  else status.removeAttribute("data-tone");
}

async function onSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitBtn = document.getElementById("submit-btn");
  const submission = readSubmission(form);

  // First gate (R1.2): client-side validation via the reused validator.
  const { valid, errors } = validateSubmission(submission);
  paintFieldErrors(errors);
  if (!valid) {
    setStatus("Please fix the highlighted fields.", "error");
    return;
  }

  submitBtn.disabled = true;
  const startedAt = Date.now();
  rememberSubmission(submission);
  resetApprovalState();

  let result;
  let error;
  try {
    result = await submitWithOneAuthRefresh(submission, "Submitting run…");
  } catch (err) {
    error = err;
  } finally {
    submitBtn.disabled = false;
  }

  // Error/timeout UX (R1.8): reused builder decides success vs error and whether
  // to retain inputs. Inputs live in the form, so we never clear them on error.
  const outcome = resolveSubmissionOutcome({
    submission,
    result,
    error,
    responseElapsedMs: Date.now() - startedAt,
  });

  if (outcome.ok && result && typeof result === "object") {
    setStatus("Run initiated.", "ok");
    renderRun(result);
  } else {
    setStatus(outcome.errorIndication?.message ?? "The run could not be initiated.", "error");
  }
}

// --- Bootstrap --------------------------------------------------------------

function init() {
  const form = document.getElementById("run-form");
  if (form) form.addEventListener("submit", onSubmit);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}

// Exported for the 503 polling fallback wiring (R13.5) and for tests.
export { pollRunStatusFallback, httpTransport };
