// Unit tests for gated-tool execution at the McpAgent dispatch boundary
// (knowgrph-acos-mcp-connector spec, task 1.6 — R14.6 / Property 1, boundary
// slice).
//
//   R14.6: WHERE a stage tool is configured as approval-gated, IF a remote
//   client invokes that tool before approval for the invocation has been
//   granted, THEN THE Mcp_Agent SHALL withhold execution of the tool, leave
//   the Run_Manifest state unchanged, and return a response indicating that
//   approval is required.
//
// These tests drive `dispatchKnowgrphMcpToolCall` — the single dispatch path
// shared by the Worker entry (`index.ts`) and these tests — with a SPY
// `RUN_MANIFEST_STORE` namespace that fails the test if it is ever touched.
// A withheld stage invocation must therefore:
//   (a) perform no Director/provider execution (paidProviderCalls === 0),
//   (b) cause NO write to the RUN_MANIFEST_STORE namespace (state unchanged),
//   (c) return an "approval required" response (ok === false, status
//       "approval_required", runManifestStateChanged === false).
//
// Full property-based coverage of Property 1 lives in spec task 9.1
// (fast-check). These are example-based boundary checks for task 1.6.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  KNOWGRPH_MCP_DIRECTOR_TOOL_NAME,
  KNOWGRPH_MCP_STAGE_GATES,
  KNOWGRPH_MCP_STAGE_TOOL_NAMES,
} from "../tool-registry.mjs";
import { dispatchKnowgrphMcpToolCall } from "../run-manifest-store.mjs";

/**
 * A `RUN_MANIFEST_STORE` namespace spy. Any access to `idFromName` or `get`
 * records the call; tests assert these counters stay at zero for withheld
 * stage invocations (R14.6: Run_Manifest state left unchanged).
 */
function createSpyNamespace() {
  const calls = { idFromName: 0, get: 0, fetch: 0 };
  const namespace = {
    idFromName(name) {
      calls.idFromName += 1;
      return { name: String(name) };
    },
    get() {
      calls.get += 1;
      return {
        fetch() {
          calls.fetch += 1;
          throw new Error(
            "RUN_MANIFEST_STORE was written on a withheld stage call (R14.6 violation)",
          );
        },
      };
    },
  };
  return { namespace, calls };
}

const STAGE_TOOL_NAMES = Object.values(KNOWGRPH_MCP_STAGE_TOOL_NAMES);

for (const stageName of STAGE_TOOL_NAMES) {
  const gateId = KNOWGRPH_MCP_STAGE_GATES[stageName];

  test(`R14.6: withheld ${stageName} returns approval_required and never writes RUN_MANIFEST_STORE`, async () => {
    const { namespace, calls } = createSpyNamespace();
    let stageTransitionEmits = 0;
    let persistenceEmits = 0;

    const result = await dispatchKnowgrphMcpToolCall({
      toolName: stageName,
      args: { approvals: [] },
      namespace,
      emitStageTransitionDiagnostic: () => {
        stageTransitionEmits += 1;
      },
      emitPersistenceDiagnostic: () => {
        persistenceEmits += 1;
      },
    });

    // (c) approval-required response surfaced.
    assert.equal(result.ok, false, "withheld stage call must not be ok");
    const envelope = result.structuredContent;
    assert.ok(envelope, "structuredContent must be present");
    assert.equal(envelope.status, "approval_required");
    assert.equal(envelope.gateId, gateId);
    assert.equal(envelope.error?.code, "approval_required");
    assert.match(result.text, /approval/i);

    // (a) no Director/provider execution.
    assert.equal(envelope.paidProviderCalls, 0);

    // (b) Run_Manifest state left unchanged: the persisted-state namespace was
    // never touched, and the envelope advertises no state change.
    assert.equal(envelope.runManifestStateChanged, false);
    assert.equal(calls.idFromName, 0, "namespace.idFromName must not be called");
    assert.equal(calls.get, 0, "namespace.get must not be called");
    assert.equal(calls.fetch, 0, "namespace.fetch must not be called");

    // A withheld stage call is not a Director run: no stage-transition or
    // persistence diagnostics are emitted.
    assert.equal(stageTransitionEmits, 0);
    assert.equal(persistenceEmits, 0);

    // No persistence metadata is attached to a withheld stage envelope.
    assert.equal(envelope.persistence, undefined);
    assert.equal(envelope.stageTransitions, undefined);
  });
}

test("R14.6: an approved stage call still does not write RUN_MANIFEST_STORE at the boundary", async () => {
  // Boundary check passes (deferred_to_director); the stage harness wiring
  // lands in tasks 3.1+, so no Director run and no persistence occur here.
  const { namespace, calls } = createSpyNamespace();
  const result = await dispatchKnowgrphMcpToolCall({
    toolName: KNOWGRPH_MCP_STAGE_TOOL_NAMES.research,
    args: {
      approvals: ["paid-model-call"],
      referenceUrl: "https://example.com/clip",
    },
    namespace,
  });

  assert.equal(result.ok, true);
  assert.equal(result.structuredContent.status, "deferred_to_director");
  assert.equal(result.structuredContent.paidProviderCalls, 0);
  assert.equal(result.structuredContent.runManifestStateChanged, false);
  // Stage tools never reach the persisted-state namespace.
  assert.equal(calls.idFromName, 0);
  assert.equal(calls.get, 0);
});

test("R14.6 contrast: a Director run DOES write RUN_MANIFEST_STORE (gated persistence is Director-only)", async () => {
  // This asserts the gate is specific to stage tools: the Director path is the
  // only one that reaches the namespace, proving the no-write guarantee above
  // is meaningful rather than vacuous (the spy CAN be triggered).
  const writes = [];
  const namespace = {
    idFromName(name) {
      return { name: String(name) };
    },
    get() {
      return {
        async fetch(request) {
          writes.push(request.method);
          // Echo a minimal persistence record so dispatch treats it as success.
          const body = await request.json().catch(() => ({}));
          return new Response(
            JSON.stringify({
              runId: body.runId ?? "director-dispatch-001",
              persistedAt: new Date().toISOString(),
              manifest: body,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        },
      };
    },
  };

  const result = await dispatchKnowgrphMcpToolCall({
    toolName: KNOWGRPH_MCP_DIRECTOR_TOOL_NAME,
    args: {
      referenceUrl: "https://example.com/reference.mp4",
      brief: "Director dispatch persists the Run_Manifest.",
      mode: "dry-run",
      shotCount: 2,
      runId: "director-dispatch-001",
    },
    namespace,
    emitStageTransitionDiagnostic: () => {},
    emitPersistenceDiagnostic: () => {},
  });

  assert.equal(result.ok, true);
  assert.ok(writes.includes("PUT"), "Director run must PUT the Run_Manifest");
  assert.equal(result.structuredContent.persistence.status, "persisted");
  assert.equal(result.structuredContent.persistence.persisted, true);
});
