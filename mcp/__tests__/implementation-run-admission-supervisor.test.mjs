import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import test from "node:test";

import { bindImplementationRunAdmissionObservation } from "../implementation-run-admission-evidence.js";
import { createImplementationRunSupervisor } from "../implementation-run-supervisor.js";
import {
  createHappyLifecycle,
  createReviewControlLifecycle,
  fixture,
  git,
  machinePayload,
  own,
  provisionLane,
  retryOwned,
} from "./implementation-run-supervisor-fixture.mjs";

function assertObservationInternalsHidden(value) {
  const serialized = JSON.stringify(value);
  for (const privateField of [
    '"agenticSdlcAdmissionObservationPending"',
    '"content":',
    '"operations":',
    '"sourceFacts":',
  ]) {
    assert.equal(serialized.includes(privateField), false, privateField);
  }
}

test("conformance-requesting runs persist admission evidence and stop before Implementer execution", async (t) => {
  const fx = await fixture(t, {
    agenticSdlcLedgerPath: "src/evidence/agentic-sdlc-run.json",
    maxAttempts: 1,
  });
  let state = fx.created.state;
  const lifecycle = createHappyLifecycle(fx, state);
  const token = crypto.randomUUID();
  state = await own(fx.runtime.store, state, token);
  await createImplementationRunSupervisor({
    rootDir: state.spec.repoRoot,
    runId: state.runId,
    token,
    env: fx.env,
    acosInvoker: lifecycle.invoke,
  }).run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, "blocked");
  assert.equal(state.error.code, "agentic_sdlc_admission_unavailable");
  assert.equal(
    state.result.agenticSdlcAdmissionObservation.status,
    "unevaluated",
  );
  assert.deepEqual(
    state.result.agenticSdlcAdmissionObservation.enforcedStages,
    [],
  );
  assert.equal(
    state.result.agenticSdlcAdmissionObservation.artifactStatus,
    "bound",
  );
  const listed = await fx.runtime.list({});
  assert.equal(
    listed.runs[0].result.agenticSdlcAdmissionObservation.digest,
    state.result.agenticSdlcAdmissionObservation.digest,
  );
  const exact = await fx.runtime.list({ runId: state.runId });
  const withEvents = await fx.runtime.list({
    runId: state.runId,
    includeEvents: true,
  });
  for (const projection of [listed, exact, withEvents]) {
    assertObservationInternalsHidden(projection);
  }
  assert.match(listed.runs[0].nextAction, /lane is parked/);
  assert.deepEqual(lifecycle.actions, ["start", "park"]);
  assert.equal(state.coordination.status, "parked");
  assert.deepEqual(state.activeProcesses, {});
  assert.equal(
    (await git(state.plan.derivedWorktreePath, ["rev-parse", "HEAD"]))
      .stdout.trim(),
    fx.sourceRevision,
  );
  assert.equal(
    state.coordination.lease.parkSourceFenceSha,
    state.coordination.lease.parkBranchHeadSha,
  );
  const artifacts = await fs.readdir(fx.runtime.store.runDir(state.runId));
  assert.equal(
    artifacts.filter((name) => name.startsWith("agentic-sdlc-admission."))
      .length,
    1,
  );
  assert.equal(
    artifacts.some((name) => name.includes("runner-request")),
    false,
  );
  const firstEvents = await fx.runtime.store.events(state.runId);
  const firstTypes = firstEvents.map((event) => event.type);
  assert.equal(
    firstEvents.find((event) => event.type === "agentic_sdlc.admission_observed")
      .data.evaluationTime,
    firstEvents.find((event) => event.type === "run.provisioned").at,
  );
  assert.ok(
    firstTypes.indexOf("run.provisioned")
      < firstTypes.indexOf("agentic_sdlc.admission_observation_pending"),
  );
  assert.ok(
    firstTypes.indexOf("agentic_sdlc.admission_observation_pending")
      < firstTypes.indexOf("agentic_sdlc.admission_observed"),
  );
  assert.ok(
    firstTypes.indexOf("agentic_sdlc.admission_observed")
      < firstTypes.indexOf("run.failed"),
  );
  assert.equal(firstTypes.includes("run.running"), false);
  assert.equal(firstTypes.includes("runner.evidence"), false);
  state = await fx.runtime.store.update(
    state.runId,
    {
      expectedRevision: state.revision,
      eventType: "test.supervisor_exited",
    },
    (current) => {
      current.supervisor.pid = 99999999;
      current.supervisor.processMarker = "dead";
      return current;
    },
  );
  const retry = await fx.runtime.control({
    runId: state.runId,
    action: "retry",
    expectedRevision: state.revision,
  });
  assert.equal(retry.ok, false);
  assert.equal(retry.error.code, "NEW_RUN_REQUIRED");
});

test("supervisor recovery binds a post-write observation without a new attempt", async (t) => {
  const fx = await fixture(t, {
    agenticSdlcLedgerPath: "src/evidence/agentic-sdlc-run.json",
    maxAttempts: 1,
  });
  let state = fx.created.state;
  const lifecycle = createHappyLifecycle(fx, state);
  let token = crypto.randomUUID();
  state = await own(fx.runtime.store, state, token);
  let interruptBoundReceipt = true;
  const admissionBinder = async (options) => {
    const updateOwned = async (...args) => {
      if (
        interruptBoundReceipt
        && args[0] === "agentic_sdlc.admission_observed"
      ) {
        interruptBoundReceipt = false;
        throw new Error("simulated interruption after artifact write");
      }
      return options.updateOwned(...args);
    };
    return bindImplementationRunAdmissionObservation({
      ...options,
      updateOwned,
    });
  };
  await createImplementationRunSupervisor({
    rootDir: state.spec.repoRoot,
    runId: state.runId,
    token,
    env: fx.env,
    acosInvoker: lifecycle.invoke,
    admissionBinder,
  }).run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, "blocked");
  assert.equal(state.error.code, "supervisor_failed");
  assert.equal(
    state.result.agenticSdlcAdmissionObservation.artifactStatus,
    "pending",
  );
  assertObservationInternalsHidden(await fx.runtime.list({
    runId: state.runId,
    includeEvents: true,
  }));
  let artifacts = await fs.readdir(fx.runtime.store.runDir(state.runId));
  assert.equal(
    artifacts.filter((name) => name.startsWith("agentic-sdlc-admission."))
      .length,
    1,
  );

  ({ state, token } = await retryOwned(fx.runtime.store, state));
  await createImplementationRunSupervisor({
    rootDir: state.spec.repoRoot,
    runId: state.runId,
    token,
    env: fx.env,
    acosInvoker: lifecycle.invoke,
  }).run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, "blocked");
  assert.equal(state.error.code, "agentic_sdlc_admission_unavailable");
  assert.equal(state.attempt, 1);
  assert.equal(
    state.result.agenticSdlcAdmissionObservation.artifactStatus,
    "bound",
  );
  assert.deepEqual(lifecycle.actions, ["start", "park"]);
  artifacts = await fs.readdir(fx.runtime.store.runDir(state.runId));
  assert.equal(
    artifacts.filter((name) => name.startsWith("agentic-sdlc-admission."))
      .length,
    1,
  );
});

test("supervisor recovery parks a bound final-attempt observation", async (t) => {
  const fx = await fixture(t, {
    agenticSdlcLedgerPath: "src/evidence/agentic-sdlc-run.json",
    maxAttempts: 1,
  });
  let state = fx.created.state;
  const lifecycle = createHappyLifecycle(fx, state);
  let token = crypto.randomUUID();
  state = await own(fx.runtime.store, state, token);
  const admissionBinder = async (options) => {
    try {
      return await bindImplementationRunAdmissionObservation(options);
    } catch (error) {
      if (error.code === "AGENTIC_SDLC_EVIDENCE_ADAPTER_UNAVAILABLE") {
        throw new Error("simulated interruption before admission parking");
      }
      throw error;
    }
  };
  await createImplementationRunSupervisor({
    rootDir: state.spec.repoRoot,
    runId: state.runId,
    token,
    env: fx.env,
    acosInvoker: lifecycle.invoke,
    admissionBinder,
  }).run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.error.code, "supervisor_failed");
  assert.equal(
    state.result.agenticSdlcAdmissionObservation.artifactStatus,
    "bound",
  );
  assert.equal(state.coordination.status, "active");

  ({ state, token } = await retryOwned(fx.runtime.store, state));
  await createImplementationRunSupervisor({
    rootDir: state.spec.repoRoot,
    runId: state.runId,
    token,
    env: fx.env,
    acosInvoker: lifecycle.invoke,
  }).run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, "blocked");
  assert.equal(state.error.code, "agentic_sdlc_admission_unavailable");
  assert.equal(state.attempt, 1);
  assert.equal(state.coordination.status, "parked");
  assert.deepEqual(lifecycle.actions, ["start", "park"]);
});

for (const controlAction of ["cancel", "pause"]) {
test(`${controlAction} racing the admission observation parks the owned lane`, async (t) => {
  const fx = await fixture(t, {
    agenticSdlcLedgerPath: "src/evidence/agentic-sdlc-run.json",
  });
  let state = fx.created.state;
  const sessionId = `knowgrph-${state.runId}`;
  const { lease, pullRequest } = await provisionLane(
    fx,
    state,
    sessionId,
  );
  state = await fx.runtime.store.update(
    state.runId,
    {
      expectedRevision: state.revision,
      eventType: "test.active_coordination",
    },
    (current) => {
      current.coordination = machinePayload(
        state,
        lease,
        pullRequest,
        "heartbeat",
        "active",
      );
      return current;
    },
  );
  const lifecycle = createReviewControlLifecycle(state, lease, pullRequest);
  const token = crypto.randomUUID();
  state = await own(fx.runtime.store, state, token);
  const admissionBinder = async ({ updateOwned }) => {
    await updateOwned(
      "agentic_sdlc.admission_observed",
      { status: "unevaluated" },
      (current) => {
        current.result = {
          ...(current.result || {}),
          agenticSdlcAdmissionObservation: { status: "unevaluated" },
        };
        current.control = {
          action: controlAction,
          requestedAt: "2026-07-30T02:00:00.000Z",
          requestId: `admission-race-${controlAction}`,
        };
        return current;
      },
    );
    throw Object.assign(new Error("admission unavailable"), {
      code: "AGENTIC_SDLC_EVIDENCE_ADAPTER_UNAVAILABLE",
    });
  };
  await createImplementationRunSupervisor({
    rootDir: state.spec.repoRoot,
    runId: state.runId,
    token,
    env: fx.env,
    acosInvoker: lifecycle.invoke,
    admissionBinder,
  }).run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, controlAction === "cancel" ? "canceled" : "paused");
  assert.equal(state.error.code, `operator_${controlAction}`);
  assert.equal(state.coordination.status, "parked");
  assert.deepEqual(lifecycle.actions, ["heartbeat", "park"]);
});
}

test("a missing owned worktree cannot be reported as parked", async (t) => {
  const fx = await fixture(t, {
    agenticSdlcLedgerPath: "src/evidence/agentic-sdlc-run.json",
  });
  let state = fx.created.state;
  const lifecycle = createHappyLifecycle(fx, state);
  const token = crypto.randomUUID();
  state = await own(fx.runtime.store, state, token);
  const admissionBinder = async (options) => {
    try {
      return await bindImplementationRunAdmissionObservation(options);
    } catch (error) {
      await fs.rm(state.plan.derivedWorktreePath, {
        recursive: true,
        force: true,
      });
      throw error;
    }
  };
  await createImplementationRunSupervisor({
    rootDir: state.spec.repoRoot,
    runId: state.runId,
    token,
    env: fx.env,
    acosInvoker: lifecycle.invoke,
    admissionBinder,
  }).run();
  state = await fx.runtime.store.read(state.runId);
  assert.equal(state.state, "blocked");
  assert.equal(state.error.code, "coordination_cleanup_failed");
  assert.match(state.error.message, /owned task worktree disappeared/);
  assert.equal(state.coordination.status, "active");
  assert.equal(state.result.parked.ok, false);
  assert.deepEqual(lifecycle.actions, ["start"]);
});
