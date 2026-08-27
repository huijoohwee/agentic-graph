import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const fixturePath = new URL("./fixtures/knowledge-graph-ingest-lock-child.mjs", import.meta.url);
const delay = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
const markerExists = (markerPath) => fs.access(markerPath).then(() => true, () => false);

async function waitForMarker(markerPath, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await markerExists(markerPath)) return;
    await delay(10);
  }
  throw new Error(`marker timeout: ${path.basename(markerPath)}`);
}

function runChild(environment) {
  const child = spawn(process.execPath, [fixturePath.pathname], {
    env: { ...process.env, ...environment },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const completed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`lock child failed (${code ?? signal}): ${stderr}`));
    });
  });
  return { child, completed };
}

test("filesystem ingest lock serializes processes and recovers a dead owner", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-kg-lock-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const pointer = path.join(root, "graphs", "fixture.json");
  const ready = path.join(root, "holder-ready");
  const release = path.join(root, "holder-release");
  const started = path.join(root, "waiter-started");
  const acquired = path.join(root, "waiter-acquired");
  const shared = {
    AG_LOCK_POINTER: pointer,
    AG_LOCK_ROOT: root,
  };
  const holder = runChild({
    ...shared,
    AG_LOCK_MODE: "holder",
    AG_LOCK_READY: ready,
    AG_LOCK_RELEASE: release,
  });
  t.after(() => holder.child.kill("SIGKILL"));
  await waitForMarker(ready);
  const waiter = runChild({
    ...shared,
    AG_LOCK_ACQUIRED: acquired,
    AG_LOCK_MODE: "waiter",
    AG_LOCK_STARTED: started,
  });
  t.after(() => waiter.child.kill("SIGKILL"));
  await waitForMarker(started);
  await delay(100);
  assert.equal(await fs.access(acquired).then(() => true, () => false), false);
  await fs.writeFile(release, "release\n");
  await Promise.all([holder.completed, waiter.completed]);
  await waitForMarker(acquired);

  await fs.rm(acquired);
  const abandoned = runChild({
    ...shared,
    AG_LOCK_ACQUIRED: acquired,
    AG_LOCK_MODE: "abandon",
  });
  await abandoned.completed;
  const readyA = path.join(root, "reclaimer-a-ready");
  const readyB = path.join(root, "reclaimer-b-ready");
  const releaseA = path.join(root, "reclaimer-a-release");
  const releaseB = path.join(root, "reclaimer-b-release");
  const reclaimerA = runChild({
    ...shared,
    AG_LOCK_MODE: "holder",
    AG_LOCK_READY: readyA,
    AG_LOCK_RELEASE: releaseA,
  });
  const reclaimerB = runChild({
    ...shared,
    AG_LOCK_MODE: "holder",
    AG_LOCK_READY: readyB,
    AG_LOCK_RELEASE: releaseB,
  });
  t.after(() => reclaimerA.child.kill("SIGKILL"));
  t.after(() => reclaimerB.child.kill("SIGKILL"));
  await Promise.race([waitForMarker(readyA), waitForMarker(readyB)]);
  await delay(100);
  const acquiredA = await markerExists(readyA);
  const acquiredB = await markerExists(readyB);
  assert.notEqual(acquiredA, acquiredB);
  await fs.writeFile(acquiredA ? releaseA : releaseB, "release\n");
  await waitForMarker(acquiredA ? readyB : readyA);
  await fs.writeFile(acquiredA ? releaseB : releaseA, "release\n");
  await Promise.all([reclaimerA.completed, reclaimerB.completed]);
});
