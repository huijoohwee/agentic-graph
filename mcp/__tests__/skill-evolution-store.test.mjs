import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SkillEvolutionStoreError,
  createSkillEvolutionMemoryStore,
} from "../skill-evolution-store.js";

test("put is insert-only and state is deep-cloned on every boundary", async () => {
  const store = createSkillEvolutionMemoryStore({ tokenFactory: () => "claim-1" });
  const state = { revision: 1, nested: { status: "ready" } };
  const insertion = store.put("skill-run-1", state, { ttlMs: 1000 });
  state.nested.status = "caller-mutated-before-await";
  const inserted = await insertion;
  assert.equal(inserted.created, true);
  inserted.state.nested.status = "result-mutated";
  assert.equal((await store.get("skill-run-1")).nested.status, "ready");

  const duplicate = await store.put("skill-run-1", { revision: 99 }, { ttlMs: 1000 });
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.state.revision, 1);
});

test("replay records are stored outside mutable run state and cloned independently", async () => {
  const store = createSkillEvolutionMemoryStore({ tokenFactory: () => "claim-1" });
  await store.put("skill-run-1", { revision: 1 }, {
    replayKey: "start-key",
    replay: { revision: 1, nested: { status: "ready" } },
  });
  const replay = await store.getReplay("skill-run-1", "start-key");
  replay.nested.status = "mutated";
  assert.equal((await store.getReplay("skill-run-1", "start-key")).nested.status, "ready");
  assert.deepEqual(await store.get("skill-run-1"), { revision: 1 });

  const claim = await store.claim("skill-run-1", { expectedRevision: 1, owner: "worker-a" });
  await store.replace("skill-run-1", {
    expectedRevision: 1,
    token: claim.token,
    state: { revision: 2 },
    replayKey: "step-key",
    replay: { revision: 2, status: "running" },
  });
  assert.equal((await store.getReplay("skill-run-1", "step-key")).revision, 2);
});

test("TTL evicts idle state while an active claim keeps it alive", async () => {
  let time = 0;
  const store = createSkillEvolutionMemoryStore({
    ttlMs: 10,
    claimTtlMs: 50,
    now: () => time,
    tokenFactory: () => "claim-1",
  });
  await store.put("skill-run-1", { revision: 1 });
  const claimed = await store.claim("skill-run-1", { expectedRevision: 1, owner: "worker-a" });
  assert.equal(claimed.ok, true);
  time = 20;
  assert.equal((await store.get("skill-run-1")).revision, 1);
  time = 51;
  assert.equal(await store.get("skill-run-1"), null);
});

test("concurrent claims have exactly one atomic winner and same-owner retry is idempotent", async () => {
  let tokenIndex = 0;
  const store = createSkillEvolutionMemoryStore({ tokenFactory: () => `claim-${++tokenIndex}` });
  await store.put("skill-run-1", { revision: 1 });
  const [a, b] = await Promise.all([
    store.claim("skill-run-1", { expectedRevision: 1, owner: "worker-a" }),
    store.claim("skill-run-1", { expectedRevision: 1, owner: "worker-b" }),
  ]);
  assert.equal([a, b].filter((result) => result.ok).length, 1);
  assert.equal([a, b].filter((result) => !result.ok)[0].code, "claim_conflict");
  const winnerOwner = a.ok ? "worker-a" : "worker-b";
  const winnerToken = a.ok ? a.token : b.token;
  const replay = await store.claim("skill-run-1", { expectedRevision: 1, owner: winnerOwner });
  assert.deepEqual({ ok: replay.ok, token: replay.token }, { ok: true, token: winnerToken });
});

test("replace atomically consumes the claim and exposes the successor", async () => {
  let tokenIndex = 0;
  const store = createSkillEvolutionMemoryStore({ tokenFactory: () => `claim-${++tokenIndex}` });
  await store.put("skill-run-1", { revision: 1, status: "ready" });
  const claim = await store.claim("skill-run-1", { expectedRevision: 1, owner: "worker-a" });

  await assert.rejects(
    store.replace("skill-run-1", {
      expectedRevision: 1,
      token: "wrong",
      state: { revision: 2, status: "running" },
    }),
    (error) => error instanceof SkillEvolutionStoreError && error.code === "claim_token_invalid",
  );
  await assert.rejects(store.replace("skill-run-1", {
    expectedRevision: 1,
    token: claim.token,
    state: { revision: 2, status: "must-not-persist" },
    ttlMs: 0,
  }), TypeError);
  assert.deepEqual(await store.get("skill-run-1"), { revision: 1, status: "ready" });
  const stored = await store.replace("skill-run-1", {
    expectedRevision: 1,
    token: claim.token,
    state: { revision: 2, status: "running" },
    ttlMs: 1000,
  });
  assert.deepEqual(stored, { revision: 2, status: "running" });
  const stale = await store.claim("skill-run-1", { expectedRevision: 1, owner: "worker-a" });
  assert.equal(stale.code, "stale_revision");
  const successor = await store.claim("skill-run-1", {
    expectedRevision: 2,
    owner: "worker-b",
  });
  assert.deepEqual({ ok: successor.ok, token: successor.token }, { ok: true, token: "claim-2" });
  const released = await store.release("skill-run-1", { token: claim.token });
  assert.deepEqual(released, {
    released: false,
    code: "claim_token_invalid",
    state: { revision: 2, status: "running" },
  });
  assert.equal((await store.claim("skill-run-1", {
    expectedRevision: 2,
    owner: "worker-c",
  })).code, "claim_conflict");
  assert.equal((await store.release("skill-run-1", { token: successor.token })).released, true);
  assert.deepEqual(await store.get("skill-run-1"), { revision: 2, status: "running" });
});

test("replay keys and replay capacity are bounded before state mutation", async () => {
  const store = createSkillEvolutionMemoryStore({
    maxReplayEntries: 1,
    tokenFactory: () => "claim-1",
  });
  await assert.rejects(
    store.put("skill-run-1", { revision: 1 }, {
      replayKey: "x".repeat(513),
      replay: { revision: 1 },
    }),
    (error) => error instanceof SkillEvolutionStoreError && error.code === "invalid_argument",
  );
  await store.put("skill-run-1", { revision: 1 }, {
    replayKey: "start-key",
    replay: { revision: 1 },
  });
  const claim = await store.claim("skill-run-1", { expectedRevision: 1, owner: "worker-a" });
  await assert.rejects(
    store.replace("skill-run-1", {
      expectedRevision: 1,
      token: claim.token,
      state: { revision: 2 },
      replayKey: "step-key",
      replay: { revision: 2 },
    }),
    (error) => error instanceof SkillEvolutionStoreError && error.code === "capacity_reached",
  );
  assert.deepEqual(await store.get("skill-run-1"), { revision: 1 });
});

test("checkpoint durably records transition intent without advancing revision", async () => {
  const store = createSkillEvolutionMemoryStore({ tokenFactory: () => "claim-1" });
  await store.put("skill-run-1", { revision: 1, inFlight: null });
  const claim = await store.claim("skill-run-1", { expectedRevision: 1, owner: "worker-a" });
  const checkpoint = await store.checkpoint("skill-run-1", {
    expectedRevision: 1,
    token: claim.token,
    state: { revision: 1, inFlight: { transitionId: "transition-1" } },
  });
  assert.equal(checkpoint.revision, 1);
  assert.equal((await store.get("skill-run-1")).inFlight.transitionId, "transition-1");
  await assert.rejects(
    store.checkpoint("skill-run-1", {
      expectedRevision: 1,
      token: "wrong",
      state: { revision: 1, inFlight: null },
    }),
    (error) => error instanceof SkillEvolutionStoreError && error.code === "claim_token_invalid",
  );
});

test("capacity is reclaimed by TTL eviction", async () => {
  let time = 0;
  const store = createSkillEvolutionMemoryStore({ maxEntries: 1, ttlMs: 10, now: () => time });
  await store.put("skill-run-1", { revision: 1 });
  await assert.rejects(
    store.put("skill-run-2", { revision: 1 }),
    (error) => error instanceof SkillEvolutionStoreError && error.code === "capacity_reached",
  );
  time = 11;
  assert.equal((await store.put("skill-run-2", { revision: 1 })).created, true);
  assert.equal(await store.size(), 1);
});
