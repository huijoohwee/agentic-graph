import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, unlink, utimes, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { createSkillEvolutionFileStore } from "../skill-evolution-file-store.js";
import { replayMembershipMayContain } from "../skill-evolution-replay-membership.js";
import {
  SkillEvolutionStoreError,
  createSkillEvolutionFilesystemMutex,
} from "../skill-evolution-store.js";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function storeFixture(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "skill-evolution-file-store-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return {
    directory,
    store: createSkillEvolutionFileStore({ directory, ...options }),
  };
}

test("state and claims survive a store restart", async (t) => {
  const { directory, store } = await storeFixture(t, { tokenFactory: () => "claim-1" });
  await store.put("skill-run-1", { revision: 1, status: "ready" });
  const claim = await store.claim("skill-run-1", {
    expectedRevision: 1,
    owner: "worker-a",
  });

  const restarted = createSkillEvolutionFileStore({
    directory,
    tokenFactory: () => "must-not-replace-persisted-token",
  });
  assert.deepEqual(await restarted.get("skill-run-1"), { revision: 1, status: "ready" });
  const renewed = await restarted.claim("skill-run-1", {
    expectedRevision: 1,
    owner: "worker-a",
  });
  assert.deepEqual(
    { ok: renewed.ok, token: renewed.token },
    { ok: true, token: claim.token },
  );
});

test("filesystem claims provide atomic token and revision fencing", async (t) => {
  const { directory, store } = await storeFixture(t, { tokenFactory: () => "claim-a" });
  await store.put("skill-run-1", { revision: 1, status: "ready" });
  const competitor = createSkillEvolutionFileStore({
    directory,
    tokenFactory: () => "claim-b",
  });
  const [left, right] = await Promise.all([
    store.claim("skill-run-1", { expectedRevision: 1, owner: "worker-a" }),
    competitor.claim("skill-run-1", { expectedRevision: 1, owner: "worker-b" }),
  ]);
  assert.equal([left, right].filter(({ ok }) => ok).length, 1);
  assert.equal([left, right].find(({ ok }) => !ok).code, "claim_conflict");
  const winner = left.ok ? { store, claim: left } : { store: competitor, claim: right };

  await assert.rejects(
    winner.store.replace("skill-run-1", {
      expectedRevision: 1,
      token: "stale-token",
      state: { revision: 2, status: "must-not-persist" },
    }),
    (error) => error instanceof SkillEvolutionStoreError && error.code === "claim_token_invalid",
  );
  await winner.store.replace("skill-run-1", {
    expectedRevision: 1,
    token: winner.claim.token,
    state: { revision: 2, status: "running" },
  });
  assert.deepEqual(await competitor.get("skill-run-1"), { revision: 2, status: "running" });
  const stale = await competitor.claim("skill-run-1", {
    expectedRevision: 1,
    owner: "worker-b",
  });
  assert.equal(stale.code, "stale_revision");
});

test("checkpoint persists transition intent without advancing revision", async (t) => {
  const { directory, store } = await storeFixture(t, { tokenFactory: () => "claim-1" });
  await store.put("skill-run-1", { revision: 1, inFlight: null });
  const claim = await store.claim("skill-run-1", {
    expectedRevision: 1,
    owner: "worker-a",
  });
  await store.checkpoint("skill-run-1", {
    expectedRevision: 1,
    token: claim.token,
    state: {
      revision: 1,
      inFlight: { transitionId: "transition-1", callIds: ["call-1"] },
    },
  });

  const restarted = createSkillEvolutionFileStore({ directory });
  assert.deepEqual((await restarted.get("skill-run-1")).inFlight, {
    transitionId: "transition-1",
    callIds: ["call-1"],
  });
  await assert.rejects(
    restarted.checkpoint("skill-run-1", {
      expectedRevision: 1,
      token: "wrong",
      state: { revision: 1, inFlight: null },
    }),
    (error) => error instanceof SkillEvolutionStoreError && error.code === "claim_token_invalid",
  );
});

test("successor state and multiple replay records commit atomically", async (t) => {
  const { directory, store } = await storeFixture(t, { tokenFactory: () => "claim-1" });
  await store.put("skill-run-1", { revision: 1, status: "ready" }, {
    replayKey: "start-key",
    replay: { revision: 1, status: "ready" },
  });
  const claim = await store.claim("skill-run-1", {
    expectedRevision: 1,
    owner: "worker-a",
  });
  await store.replace("skill-run-1", {
    expectedRevision: 1,
    token: claim.token,
    state: { revision: 2, status: "cancelled" },
    replayKey: "step-key",
    replay: { revision: 2, status: "cancelled", source: "step" },
    replayRecords: [
      { key: "cancel-key", replay: { revision: 2, status: "cancelled" } },
      { key: "status-key", replay: { revision: 2, status: "cancelled" } },
    ],
  });

  const restarted = createSkillEvolutionFileStore({
    directory,
    tokenFactory: () => "claim-2",
  });
  assert.equal((await restarted.getReplay("skill-run-1", "start-key")).revision, 1);
  assert.equal((await restarted.getReplay("skill-run-1", "step-key")).source, "step");
  assert.equal((await restarted.getReplay("skill-run-1", "cancel-key")).revision, 2);
  assert.equal((await restarted.getReplay("skill-run-1", "status-key")).revision, 2);
  assert.deepEqual(await restarted.get("skill-run-1"), {
    revision: 2,
    status: "cancelled",
  });
  const successorClaim = await restarted.claim("skill-run-1", {
    expectedRevision: 2,
    owner: "worker-b",
  });
  assert.deepEqual(
    { ok: successorClaim.ok, token: successorClaim.token },
    { ok: true, token: "claim-2" },
  );
  assert.equal((await store.release("skill-run-1", { token: claim.token })).released, false);
  assert.equal((await restarted.claim("skill-run-1", {
    expectedRevision: 2,
    owner: "worker-c",
  })).code, "claim_conflict");

  const [recordName] = await readdir(path.join(directory, "records"));
  const envelopeText = await readFile(path.join(directory, "records", recordName), "utf8");
  const envelope = JSON.parse(envelopeText);
  assert.equal(envelope.state.replays, undefined);
  assert.equal(envelope.replays, undefined);
  assert.deepEqual(
    { entries: envelope.replayIndex.entries, depth: envelope.replayIndex.depth },
    { entries: 4, depth: 2 },
  );
  assert.equal(envelopeText.includes('"source":"step"'), false);
  const runDigest = recordName.slice(0, -5);
  const indexFiles = await readdir(path.join(directory, "replay-indexes", runDigest));
  const replayFiles = await readdir(path.join(directory, "replays", runDigest));
  assert.equal(indexFiles.length, 2);
  assert.equal(replayFiles.length, 4);
  const pages = await Promise.all(indexFiles.map(async (name) => JSON.parse(
    await readFile(path.join(directory, "replay-indexes", runDigest, name), "utf8"),
  )));
  assert.deepEqual(pages.map(({ entries }) => entries.length).sort(), [1, 3]);
  assert.equal((await restarted.release("skill-run-1", {
    token: successorClaim.token,
  })).released, true);
});

test("uncommitted replay sidecars stay invisible across revision commits and restarts", async (t) => {
  const { directory, store } = await storeFixture(t, { tokenFactory: () => "claim-1" });
  await store.put("skill-run-1", { revision: 1 }, {
    replayKey: "start-key",
    replay: { revision: 1 },
  });
  const runDigest = createHash("sha256").update("skill-run-1").digest("hex");
  const record = JSON.parse(
    await readFile(path.join(directory, "records", `${runDigest}.json`), "utf8"),
  );
  const payload = {
    version: 1,
    runId: "skill-run-1",
    key: "orphan-key",
    replay: { revision: 2, marker: "must-stay-hidden" },
  };
  const blob = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const page = {
    version: 1,
    runId: "skill-run-1",
    parent: record.replayIndex.head,
    entries: [{ key: "orphan-key", blob }],
  };
  const pageDigest = createHash("sha256").update(JSON.stringify(page)).digest("hex");
  await writeFile(path.join(directory, "replays", runDigest, `${blob}.json`), `${JSON.stringify(payload)}\n`);
  await writeFile(
    path.join(directory, "replay-indexes", runDigest, `${pageDigest}.json`),
    `${JSON.stringify(page)}\n`,
  );

  let restarted = createSkillEvolutionFileStore({ directory, tokenFactory: () => "claim-2" });
  assert.equal(await restarted.getReplay("skill-run-1", "orphan-key"), null);
  const claim = await restarted.claim("skill-run-1", { expectedRevision: 1, owner: "worker-a" });
  await restarted.replace("skill-run-1", {
    expectedRevision: 1,
    token: claim.token,
    state: { revision: 2 },
    replayKey: "committed-key",
    replay: { revision: 2, marker: "visible" },
  });
  restarted = createSkillEvolutionFileStore({ directory });
  assert.equal(await restarted.getReplay("skill-run-1", "orphan-key"), null);
  assert.equal((await restarted.getReplay("skill-run-1", "committed-key")).marker, "visible");
  assert.deepEqual(await restarted.get("skill-run-1"), { revision: 2 });
});

test("replay membership provides a constant-time absent-key path", async (t) => {
  const { directory, store } = await storeFixture(t);
  await store.put("skill-run-1", { revision: 1 }, {
    replayKey: "present-key",
    replay: { revision: 1 },
  });
  const runDigest = createHash("sha256").update("skill-run-1").digest("hex");
  const record = JSON.parse(
    await readFile(path.join(directory, "records", `${runDigest}.json`), "utf8"),
  );
  assert.equal(replayMembershipMayContain(record.replayIndex.membership, "present-key"), true);
  let absentKey = "absent-0";
  while (replayMembershipMayContain(record.replayIndex.membership, absentKey)) {
    absentKey = `absent-${Number(absentKey.slice(7)) + 1}`;
  }
  await unlink(path.join(
    directory,
    "replay-indexes",
    runDigest,
    `${record.replayIndex.head}.json`,
  ));
  assert.equal(await store.getReplay("skill-run-1", absentKey), null);
});

test("TTL eviction survives restarts and active claims keep runs alive", async (t) => {
  let time = 0;
  const clock = () => time;
  const { directory, store } = await storeFixture(t, {
    ttlMs: 10,
    claimTtlMs: 50,
    now: clock,
    tokenFactory: () => "claim-1",
  });
  await store.put("skill-run-1", { revision: 1 });
  await store.claim("skill-run-1", { expectedRevision: 1, owner: "worker-a" });

  time = 20;
  const restarted = createSkillEvolutionFileStore({
    directory,
    ttlMs: 10,
    claimTtlMs: 50,
    now: clock,
  });
  assert.equal((await restarted.get("skill-run-1")).revision, 1);
  time = 51;
  assert.equal(await restarted.get("skill-run-1"), null);
  assert.equal(await restarted.size(), 0);
});

test("stale locks recover and hostile run IDs cannot control paths", async (t) => {
  let time = 100;
  const { directory, store } = await storeFixture(t, {
    now: () => time,
    lockTtlMs: 10,
    lockWaitMs: 100,
    lockRetryMs: 1,
  });
  const runId = "../../outside/skill-run";
  await store.put(runId, { revision: 1 });
  const digest = createHash("sha256").update(runId).digest("hex");
  const lockFile = path.join(directory, "locks", `${digest}.lock`);
  await writeFile(lockFile, JSON.stringify({
    token: "orphan",
    pid: 2_147_483_647,
    hostname: hostname(),
  }), {
    flag: "wx",
    mode: 0o600,
  });
  await utimes(lockFile, new Date(0), new Date(0));
  assert.equal((await store.get(runId)).revision, 1);
  assert.deepEqual((await readdir(path.join(directory, "records"))), [`${digest}.json`]);

  await assert.rejects(
    store.get("x".repeat(161)),
    (error) => error instanceof SkillEvolutionStoreError && error.code === "invalid_argument",
  );
  time += 1;
});

test("filesystem mutex never steals from a live local holder after one TTL", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "skill-evolution-mutex-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const locksDirectory = path.join(directory, "locks");
  const ready = mkdir(locksDirectory, { recursive: true, mode: 0o700 });
  const withLock = createSkillEvolutionFilesystemMutex({
    locksDirectory,
    ready,
    lockTtlMs: 30,
    lockWaitMs: 500,
    lockRetryMs: 3,
  });
  let releaseHolder;
  let holderEntered;
  const entered = new Promise((resolve) => { holderEntered = resolve; });
  const hold = new Promise((resolve) => { releaseHolder = resolve; });
  const first = withLock("shared", async () => {
    holderEntered();
    await hold;
  });
  await entered;
  await wait(45);
  let competitorEntered = false;
  const second = withLock("shared", async () => { competitorEntered = true; });
  await wait(45);
  assert.equal(competitorEntered, false);
  releaseHolder();
  await Promise.all([first, second]);
  assert.equal(competitorEntered, true);
});

test("filesystem mutex fences a displaced holder before its commit", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "skill-evolution-mutex-fence-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const locksDirectory = path.join(directory, "locks");
  const ready = mkdir(locksDirectory, { recursive: true, mode: 0o700 });
  const withLock = createSkillEvolutionFilesystemMutex({
    locksDirectory,
    ready,
    lockTtlMs: 30,
    lockWaitMs: 500,
    lockRetryMs: 3,
  });
  let resumeHolder;
  let holderEntered;
  const resume = new Promise((resolve) => { resumeHolder = resolve; });
  const entered = new Promise((resolve) => { holderEntered = resolve; });
  const commits = [];
  const staleHolder = withLock("shared", async ({ assertOwned }) => {
    holderEntered();
    await resume;
    await assertOwned();
    commits.push("stale");
  });
  await entered;
  const lockFile = path.join(locksDirectory, "shared.lock");
  await rename(lockFile, `${lockFile}.displaced`);
  await withLock("shared", async ({ assertOwned }) => {
    await assertOwned();
    commits.push("successor");
  });
  resumeHolder();
  await assert.rejects(
    staleHolder,
    (error) => error instanceof SkillEvolutionStoreError && error.code === "claim_conflict",
  );
  assert.deepEqual(commits, ["successor"]);
});
