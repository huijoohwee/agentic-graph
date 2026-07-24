import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import {
  adapterRecord,
  createFixture,
  delegateResponse,
  exactReferenceVerifier,
  planAndStart,
  runtimeFor,
} from "./agent-team-test-kit.mjs";

const startInput = (planned, idempotencyKey) => ({
  planId: planned.result.planId,
  planDigest: planned.planDigest,
  teamRevision: planned.teamRevision,
  expectedStateVersion: 1,
  idempotencyKey,
});

const reviewInput = (started, team, decision, key) => ({
  runId: started.runId,
  expectedStateVersion: started.stateVersion,
  action: "record_review",
  idempotencyKey: key,
  reason: `Record exact ${decision} review decision.`,
  reviewReceipt: {
    policyId: team.reviewPolicy.policyId,
    policyRevision: team.reviewPolicy.policyRevision,
    decision,
    receiptId: `receipt-${decision}-0001`,
  },
});

test("start revalidates source, invocation revision, and exact references before any effect", async (t) => {
  await t.test("source drift", async (subtest) => {
    const fixture = await createFixture(subtest);
    let effects = 0;
    const adapter = adapterRecord({ execute: async () => { effects += 1; return delegateResponse; } });
    const runtime = runtimeFor({
      rootDir: fixture.rootDir,
      docsResolver: fixture.docs.resolver,
      adapter,
    });
    const planned = await runtime.plan(fixture.planInput);
    const source = JSON.parse(await fs.readFile(fixture.sourcePath, "utf8"));
    source.manager.role = "Drifted role";
    await fs.writeFile(fixture.sourcePath, `${JSON.stringify(source)}\n`);
    const started = await runtime.start(startInput(planned, "drift-source-start"));
    assert.equal(started.error.code, "team_source_digest_mismatch");
    assert.equal(effects, 0);
    assert.deepEqual((await runtime.list({})).result.runs, []);
  });

  await t.test("invocation catalog drift", async (subtest) => {
    const fixture = await createFixture(subtest);
    let effects = 0;
    const runtime = runtimeFor({
      rootDir: fixture.rootDir,
      docsResolver: fixture.docs.resolver,
      adapter: adapterRecord({ execute: async () => { effects += 1; return delegateResponse; } }),
    });
    const planned = await runtime.plan(fixture.planInput);
    fixture.docs.state.revision = "d".repeat(40);
    const started = await runtime.start(startInput(planned, "drift-invocation-start"));
    assert.equal(started.error.code, "invocation_source_revision_mismatch");
    assert.equal(effects, 0);
  });

  await t.test("reference projection drift", async (subtest) => {
    const fixture = await createFixture(subtest);
    let valid = true;
    let effects = 0;
    const runtime = runtimeFor({
      rootDir: fixture.rootDir,
      docsResolver: fixture.docs.resolver,
      referenceVerifier: async (document) => (
        valid ? exactReferenceVerifier(document) : { ok: false }
      ),
      adapter: adapterRecord({ execute: async () => { effects += 1; return delegateResponse; } }),
    });
    const planned = await runtime.plan(fixture.planInput);
    valid = false;
    const started = await runtime.start(startInput(planned, "drift-reference-start"));
    assert.equal(started.error.code, "team_reference_verification_failed");
    assert.equal(effects, 0);
  });
});

test("recovery revalidates the persisted plan before a resumed adapter effect", async (t) => {
  const fixture = await createFixture(t);
  const adapterId = "test.revalidation-recovery";
  const blockedAdapter = adapterRecord({
    id: adapterId,
    estimate: async () => ({ inputTokens: 120_001, outputTokens: 0, costUsd: 0, timeMs: 1 }),
    execute: async () => { throw new Error("must not execute"); },
  });
  const first = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter: blockedAdapter,
  });
  const { started } = await planAndStart(first, fixture.planInput, "revalidation-recovery");
  const queued = await first.store.update(started.runId, {
    expectedStateVersion: started.stateVersion,
    eventType: "test.queued",
  }, (state) => {
    state.state = "queued";
    state.error = null;
    return state;
  });
  let effects = 0;
  const restarted = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    referenceVerifier: async () => ({ ok: false }),
    adapter: adapterRecord({
      id: adapterId,
      execute: async () => { effects += 1; return delegateResponse; },
    }),
  });
  const recovered = await restarted.recover();
  const durable = await restarted.store.read(started.runId);
  assert.equal(recovered.recovered, 0);
  assert.equal(durable.stateVersion, queued.stateVersion + 1);
  assert.equal(durable.state, "blocked");
  assert.equal(durable.error.code, "continuation_revalidation_failed");
  assert.equal(effects, 0);
});

test("review controls require exact authorization and verification before approval", async (t) => {
  const fixture = await createFixture(t, {
    bounds: { maxStageTimeMs: 100, maxRunTimeMs: 2_000 },
  });
  const reviewingAdapter = adapterRecord({
    estimate: async () => ({ inputTokens: 10, outputTokens: 10, costUsd: 0.1, timeMs: 100 }),
    execute: async () => ({ ...delegateResponse, requiresReview: true }),
  });
  const first = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter: reviewingAdapter,
  });
  const { started } = await planAndStart(first, fixture.planInput, "review-lifecycle-start");
  assert.equal(started.state, "review_pending");
  const approval = reviewInput(started, fixture.team, "approve", "review-approve-control");

  const missingAuthorizer = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter: reviewingAdapter,
    authorizer: null,
  });
  assert.equal((await missingAuthorizer.control(approval)).error.code, "control_authorizer_unavailable");
  const forgedAuthorizer = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter: reviewingAdapter,
    authorizer: async (authorization) => ({
      ok: true,
      authorization: { ...authorization, forged: true },
    }),
  });
  assert.equal((await forgedAuthorizer.control(approval)).error.code, "control_not_authorized");
  const timedAuthorizer = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter: reviewingAdapter,
    authorizer: async () => new Promise(() => {}),
  });
  assert.equal((await timedAuthorizer.control(approval)).error.code, "control_authorization_timeout");

  const missingVerifier = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter: reviewingAdapter,
    reviewVerifier: null,
  });
  assert.equal((await missingVerifier.control(approval)).error.code, "review_receipt_verifier_unavailable");
  const forgedVerifier = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter: reviewingAdapter,
    reviewVerifier: async (receipt) => ({ ok: true, receipt: { ...receipt, forged: true } }),
  });
  assert.equal((await forgedVerifier.control(approval)).error.code, "review_receipt_rejected");
  const timedVerifier = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter: reviewingAdapter,
    reviewVerifier: async () => new Promise(() => {}),
  });
  assert.equal((await timedVerifier.control(approval)).error.code, "review_receipt_verification_timeout");

  const approved = await first.control(approval);
  assert.equal(approved.state, "running");
  const durable = await first.store.read(started.runId);
  assert.equal(durable.state, "completed");
  const retrieved = await first.list({ runId: started.runId });
  assert.equal(retrieved.result.runs[0].finalAnswer, delegateResponse.output);
  assert.equal(JSON.stringify(retrieved).includes(delegateResponse.privateOutput), false);
});

test("rejected and revision-required review outcomes cannot be retried", async (t) => {
  for (const decision of ["reject", "revise"]) {
    await t.test(decision, async (subtest) => {
      const fixture = await createFixture(subtest);
      const adapter = adapterRecord({
        execute: async () => ({ ...delegateResponse, requiresReview: true }),
      });
      const runtime = runtimeFor({
        rootDir: fixture.rootDir,
        docsResolver: fixture.docs.resolver,
        adapter,
      });
      const { started } = await planAndStart(runtime, fixture.planInput, `review-${decision}-start`);
      const recorded = await runtime.control(
        reviewInput(started, fixture.team, decision, `review-${decision}-control`),
      );
      assert.equal(recorded.state, "failed");
      const retried = await runtime.control({
        runId: started.runId,
        expectedStateVersion: recorded.stateVersion,
        action: "retry",
        idempotencyKey: `review-${decision}-retry`,
        reason: "A terminal review outcome must not be bypassed.",
      });
      assert.equal(retried.error.code, "review_decision_terminal");
      assert.equal((await runtime.store.read(started.runId)).state, "failed");
    });
  }
});

test("start replays its exact persisted terminal snapshot without live host dependencies", async (t) => {
  const completedFixture = await createFixture(t);
  const completedRuntime = runtimeFor({
    rootDir: completedFixture.rootDir,
    docsResolver: completedFixture.docs.resolver,
    adapter: adapterRecord({ execute: async () => delegateResponse }),
  });
  const completedPlan = await completedRuntime.plan(completedFixture.planInput);
  const completedInput = startInput(completedPlan, "exact-completed-replay");
  const completed = await completedRuntime.start(completedInput);
  const dependencyFree = runtimeFor({
    rootDir: completedFixture.rootDir,
    docsResolver: completedFixture.docs.resolver,
    referenceVerifier: null,
  });
  assert.deepEqual(await dependencyFree.start(completedInput), completed);

  const blockedFixture = await createFixture(t);
  const blockedRuntime = runtimeFor({
    rootDir: blockedFixture.rootDir,
    docsResolver: blockedFixture.docs.resolver,
    adapter: adapterRecord({
      estimate: async () => ({ inputTokens: 120_001, outputTokens: 0, costUsd: 0, timeMs: 1 }),
      execute: async () => { throw new Error("must not execute"); },
    }),
  });
  const blockedPlan = await blockedRuntime.plan(blockedFixture.planInput);
  const blockedInput = startInput(blockedPlan, "exact-blocked-replay");
  const blocked = await blockedRuntime.start(blockedInput);
  await blockedRuntime.control({
    runId: blocked.runId,
    expectedStateVersion: blocked.stateVersion,
    action: "cancel",
    idempotencyKey: "advance-after-blocked-start",
    reason: "Advance current state after the original start settled.",
  });
  const replayRuntime = runtimeFor({
    rootDir: blockedFixture.rootDir,
    docsResolver: blockedFixture.docs.resolver,
    referenceVerifier: null,
  });
  assert.deepEqual(await replayRuntime.start(blockedInput), blocked);
});

test("only the durable claim owner records a cross-runtime start receipt", async (t) => {
  const fixture = await createFixture(t);
  let created;
  let releaseCreate;
  let effectStarted;
  let settleEffect;
  const createdGate = new Promise((resolve) => { created = resolve; });
  const createRelease = new Promise((resolve) => { releaseCreate = resolve; });
  const effectGate = new Promise((resolve) => { effectStarted = resolve; });
  const effectResult = new Promise((resolve) => { settleEffect = resolve; });
  let effects = 0;
  const adapter = adapterRecord({
    execute: async () => {
      effects += 1;
      effectStarted();
      return effectResult;
    },
  });
  const runtimeA = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
    supervisorId: "supervisor-a",
  });
  const runtimeB = runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    adapter,
    supervisorId: "supervisor-b",
  });
  const planned = await runtimeA.plan(fixture.planInput);
  const input = startInput(planned, "two-runtime-start-race");
  const originalCreate = runtimeA.store.create.bind(runtimeA.store);
  runtimeA.store.create = async (args) => {
    const result = await originalCreate(args);
    created();
    await createRelease;
    return result;
  };
  const startA = runtimeA.start(input);
  await createdGate;
  const startB = runtimeB.start(input);
  await effectGate;
  releaseCreate();
  const nonOwner = await startA;
  assert.equal(nonOwner.error.code, "start_in_progress");
  assert.equal((await runtimeA.store.read(nonOwner.runId)).startReceipt.snapshot, null);
  settleEffect(delegateResponse);
  const owner = await startB;
  assert.equal(owner.state, "completed");
  assert.equal(effects, 1);
  const replay = await runtimeFor({
    rootDir: fixture.rootDir,
    docsResolver: fixture.docs.resolver,
    referenceVerifier: null,
  }).start(input);
  assert.deepEqual(replay, owner);
});
