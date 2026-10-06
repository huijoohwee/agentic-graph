import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { createWorkspaceProjectRuntime } from "../workspace-project-runtime.js";

const execFileAsync = promisify(execFile);
const zero = { networkCalls: 0, modelCalls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 };
const digest = content => createHash("sha256").update(content).digest("hex");
const fixture = async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "workspace-project-")));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, runtime: createWorkspaceProjectRuntime({ rootDir: root }) };
};
const write = async (runtime, root, files, expectedVersion = "", extra = {}) => {
  const request = { operation: "project-checkpoint", workspaceRoot: root, path: "demo", files, expectedVersion, ...extra };
  const plan = await runtime.plan(request);
  return runtime.apply({ ...plan.request, planDigest: plan.planDigest, operatorAuthorized: true });
};
const read = (runtime, root, operation = "project-inspect", extra = {}) => runtime.plan({ operation, workspaceRoot: root, path: "demo", ...extra });
const native = (root, args) => execFileAsync("git", ["-c", "protocol.allow=never", "-c", "core.hooksPath=/dev/null", "-C", path.join(root, ".workspace-project", "repos", "demo.git"), ...args], { timeout: 10000 });

test("planning is read-only, closed, local-only and requires exact authority", async t => {
  const { root, runtime } = await fixture(t);
  const discover = await runtime.plan({ operation: "project-discover", workspaceRoot: root, path: "_" });
  assert.equal(discover.store.surface, "localhost-host-git");
  assert.equal(discover.capabilities.remoteEnabled, false);
  assert.deepEqual(discover.economics, zero);
  const listing = await runtime.plan({ operation: "project-list", workspaceRoot: root, path: "_" });
  assert.deepEqual(listing.data.projects, []);
  const request = { operation: "project-checkpoint", workspaceRoot: root, path: "demo", expectedVersion: "", files: [{ path: "readme.md", content: "draft\n" }] };
  const plan = await runtime.plan(request);
  assert.deepEqual(await fs.readdir(root), []);
  assert.deepEqual(Object.keys(plan.request.files[0]).sort(), ["content", "digest", "path"]);
  await assert.rejects(runtime.apply({ ...request, planDigest: plan.planDigest }), { code: "FORBIDDEN" });
  await assert.rejects(runtime.apply({ ...request, planDigest: "0".repeat(64), operatorAuthorized: true }), { code: "PLAN_STALE" });
  await assert.rejects(runtime.plan({ ...request, operation: "project-push" }), { code: "INVALID_INPUT" });
  await assert.rejects(runtime.plan({ ...request, remoteUrl: "https://unavailable.invalid/repo.git" }), { code: "INVALID_INPUT" });
  await assert.rejects(runtime.plan({ ...request, workspaceRoot: path.dirname(root) }), { code: "FORBIDDEN" });
  assert.deepEqual(await fs.readdir(root), []);
});

test("native checkpoints survive restart and immutable inspection never changes the project head", async t => {
  const { root, runtime } = await fixture(t);
  const original = [{ path: "docs/notes.md", content: "# Notes\r\nCafé 🌱\n" }, { path: "data/config.json", content: '{"enabled":false}\n' }];
  const first = await write(runtime, root, original, "", { message: "First checkpoint" });
  assert.match(first.version, /^[0-9a-f]{40}$/u);
  assert.deepEqual(first.economics, zero);
  const changed = [{ path: "docs/notes.md", content: "Second version\n" }, { path: "plain.txt", content: "inert: $(never execute)\n" }];
  const second = await write(runtime, root, changed, first.version, { message: "Second checkpoint" });
  assert.notEqual(first.version, second.version);
  const restarted = createWorkspaceProjectRuntime({ rootDir: root });
  const old = await read(restarted, root, "project-inspect", { version: first.version });
  assert.deepEqual(old.data.files.map(({ path: name, content }) => ({ path: name, content })), original.sort((a, b) => a.path.localeCompare(b.path)));
  const current = await read(restarted, root);
  assert.equal(current.data.version, second.version);
  assert.equal(current.data.history.length, 2);
  assert.equal(current.data.history[0].parent, first.version);
  const nativeHead = await native(root, ["rev-parse", "refs/heads/project"]);
  assert.equal(nativeHead.stdout.trim(), second.version);
  assert.equal((await native(root, ["rev-parse", "--is-bare-repository"])).stdout.trim(), "true");
  if (process.platform !== "win32") {
    assert.equal((await fs.stat(path.join(root, ".workspace-project"))).mode & 0o777, 0o700);
    assert.equal((await fs.stat(path.join(root, ".workspace-project", "repos", "demo.git"))).mode & 0o777, 0o700);
  }
  assert.equal((await native(root, ["fsck", "--strict", "--no-reflogs"])).stderr.includes("error"), false);
});

test("restoring historical files appends a fenced checkpoint and preserves both previous versions", async t => {
  const { root, runtime } = await fixture(t);
  const first = await write(runtime, root, [{ path: "notes.md", content: "original\n" }]);
  const second = await write(runtime, root, [{ path: "notes.md", content: "later\n" }], first.version);
  const historical = (await read(runtime, root, "project-inspect", { version: first.version })).data.files.map(({ path, content }) => ({ path, content }));
  const restored = await write(runtime, root, historical, second.version, { message: "Restore original" });
  assert.notEqual(restored.version, first.version);
  const current = (await read(runtime, root)).data;
  assert.equal(current.version, restored.version);
  assert.deepEqual(current.files.map(({ path, content }) => ({ path, content })), historical);
  assert.equal(current.history[0].parent, second.version);
  assert.equal(current.history.length, 3);
  assert.equal((await read(runtime, root, "project-inspect", { version: second.version })).data.files[0].content, "later\n");
  await assert.rejects(write(runtime, root, historical, second.version), { code: "VERSION_CONFLICT" });
  assert.equal((await read(runtime, root)).data.version, restored.version);
});

test("portable export imports exact bytes and digests into a clean configured store", async t => {
  const { root, runtime } = await fixture(t);
  const first = await write(runtime, root, [{ path: "README.md", content: "No network or model needed.\n" }, { path: "unicode/日本語.txt", content: "exact\r\n" }]);
  const exported = (await read(runtime, root, "project-export", { version: first.version })).data;
  assert.equal(exported.schemaVersion, "agentic-graph-project-export/v1");
  for (const file of exported.files) assert.equal(file.digest, digest(file.content));
  const target = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "workspace-project-import-")));
  t.after(() => fs.rm(target, { recursive: true, force: true }));
  const importedRuntime = createWorkspaceProjectRuntime({ rootDir: target });
  const request = { operation: "project-import", workspaceRoot: target, path: "copy", expectedVersion: "", files: exported.files };
  await assert.rejects(importedRuntime.plan({ ...request, files: exported.files.map(({ digest: _, ...file }) => file) }), { code: "INVALID_INPUT" });
  const plan = await importedRuntime.plan(request);
  const imported = await importedRuntime.apply({ ...request, planDigest: plan.planDigest, operatorAuthorized: true });
  const copy = (await importedRuntime.plan({ operation: "project-export", workspaceRoot: target, path: "copy", version: imported.version })).data;
  assert.deepEqual(copy.files, exported.files);
  await assert.rejects(importedRuntime.plan({ ...request, files: [{ ...exported.files[0], digest: "0".repeat(64) }] }), { code: "INVALID_INPUT" });
  await assert.rejects(importedRuntime.plan(request), { code: "VERSION_CONFLICT" });
});

test("separate native Git processes race one expected-old ref and exactly one wins", async t => {
  const { root, runtime } = await fixture(t);
  const base = await write(runtime, root, [{ path: "draft.md", content: "base\n" }]);
  const a = await write(runtime, root, [{ path: "draft.md", content: "writer a\n" }], base.version);
  await native(root, ["update-ref", "refs/heads/project", base.version, a.version]);
  const b = await write(runtime, root, [{ path: "draft.md", content: "writer b\n" }], base.version);
  await native(root, ["update-ref", "refs/heads/project", base.version, b.version]);
  const results = await Promise.allSettled([
    native(root, ["update-ref", "refs/heads/project", a.version, base.version]),
    native(root, ["update-ref", "refs/heads/project", b.version, base.version]),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const winner = (await read(runtime, root)).data.version;
  assert.ok([a.version, b.version].includes(winner));
  assert.equal((await read(runtime, root, "project-inspect", { version: a.version })).data.files[0].content, "writer a\n");
  assert.equal((await read(runtime, root, "project-inspect", { version: b.version })).data.files[0].content, "writer b\n");
  await assert.rejects(write(runtime, root, [{ path: "draft.md", content: "retained caller draft\n" }], base.version), { code: "VERSION_CONFLICT" });
});

test("separate runtime processes preserve the losing draft and never silently overwrite", async t => {
  const { root, runtime } = await fixture(t);
  const base = await write(runtime, root, [{ path: "draft.md", content: "base\n" }]);
  const requests = await Promise.all(["writer a\n", "writer b\n"].map(async content => {
    const request = { operation: "project-checkpoint", workspaceRoot: root, path: "demo", expectedVersion: base.version, files: [{ path: "draft.md", content }] };
    return { ...request, planDigest: (await runtime.plan(request)).planDigest, operatorAuthorized: true };
  }));
  const moduleUrl = new URL("../workspace-project-runtime.js", import.meta.url).href;
  const script = `import {createWorkspaceProjectRuntime} from ${JSON.stringify(moduleUrl)};const q=JSON.parse(process.argv[1]);try{const r=await createWorkspaceProjectRuntime({rootDir:q.workspaceRoot}).apply(q);console.log(JSON.stringify({ok:true,version:r.version}));}catch(e){console.log(JSON.stringify({ok:false,code:e.code,draft:q.files}));}`;
  const output = await Promise.all(requests.map(request => execFileAsync(process.execPath, ["--input-type=module", "-e", script, JSON.stringify(request)], { timeout: 15000 })));
  const results = output.map(item => JSON.parse(item.stdout));
  assert.equal(results.filter(result => result.ok).length, 1);
  const loser = results.find(result => !result.ok);
  assert.ok(["RESOURCE_BUSY", "VERSION_CONFLICT"].includes(loser.code));
  assert.equal(loser.draft.length, 1);
  assert.ok(["writer a\n", "writer b\n"].includes(loser.draft[0].content));
  assert.equal((await read(runtime, root)).data.version, results.find(result => result.ok).version);
  const stale = requests[results.findIndex(result => !result.ok)];
  await assert.rejects(runtime.apply(stale), { code: "VERSION_CONFLICT" });
});

test("apply returns typed contention while another writer owns a changing store", async t => {
  const { root, runtime } = await fixture(t);
  const base = await write(runtime, root, [{ path: "draft.md", content: "base\n" }]);
  const request = { operation: "project-checkpoint", workspaceRoot: root, path: "demo",
    expectedVersion: base.version, files: [{ path: "draft.md", content: "keep this draft\n" }] };
  const planned = await runtime.plan(request);
  const lock = path.join(root, ".workspace-project", ".writer.lock");
  await fs.mkdir(lock);
  await fs.writeFile(path.join(lock, "in-flight-object"), Buffer.alloc(500000));
  await assert.rejects(runtime.apply({ ...planned.request, planDigest: planned.planDigest, operatorAuthorized: true }),
    { code: "RESOURCE_BUSY" });
  assert.equal((await native(root, ["rev-parse", "refs/heads/project"])).stdout.trim(), base.version);
});

test("file, project and retained-store quotas fail before a ref can advance", async t => {
  const { root, runtime } = await fixture(t);
  const request = { operation: "project-checkpoint", workspaceRoot: root, path: "demo", expectedVersion: "" };
  await assert.rejects(runtime.plan({ ...request, files: [{ path: "large.txt", content: "a".repeat(262145) }] }), { code: "QUOTA_EXCEEDED" });
  await assert.rejects(runtime.plan({ ...request, files: Array.from({ length: 101 }, (_, i) => ({ path: `${i}.txt`, content: "" })) }), { code: "QUOTA_EXCEEDED" });
  await assert.rejects(runtime.plan({ ...request, files: Array.from({ length: 9 }, (_, i) => ({ path: `${i}.txt`, content: "a".repeat(262144) })) }), { code: "QUOTA_EXCEEDED" });
  assert.deepEqual(await fs.readdir(root), []);
  const first = await write(runtime, root, [{ path: "small.txt", content: "retained\n" }]);
  const store = path.join(root, ".workspace-project");
  for (let i = 0; i < 21; i += 1) await fs.writeFile(path.join(store, `quota-${i}`), Buffer.alloc(499999));
  await assert.rejects(runtime.plan({ ...request, expectedVersion: first.version, files: [{ path: "small.txt", content: "must not overwrite\n" }] }), { code: "QUOTA_EXCEEDED" });
  assert.equal((await native(root, ["rev-parse", "refs/heads/project"])).stdout.trim(), first.version);
});

test("traversal, symlinks, reserved paths, collisions and invalid UTF-8 fail closed", async t => {
  const { root, runtime } = await fixture(t);
  const request = { operation: "project-checkpoint", workspaceRoot: root, path: "demo", expectedVersion: "" };
  for (const name of ["../escape", "/absolute", "dir/../escape", ".git/config", "safe/.GiT/config", "back\\slash", "x\u0000y", "e\u0301.txt", "file.", "CON", "nested/aux.md", "COM9.txt", "lpt1.json"]) {
    await assert.rejects(runtime.plan({ ...request, files: [{ path: name, content: "data\n" }] }), { code: "INVALID_INPUT" });
  }
  for (const files of [
    [{ path: "same.txt", content: "a" }, { path: "SAME.txt", content: "b" }],
    [{ path: "folder", content: "a" }, { path: "folder/file.md", content: "b" }],
    [{ path: "docs/a.md", content: "a" }, { path: "DOCS/b.md", content: "b" }],
    [{ path: "invalid.txt", content: "\ud800" }],
  ]) await assert.rejects(runtime.plan({ ...request, files }), { code: "INVALID_INPUT" });
  await assert.rejects(runtime.plan({ ...request, path: "../escape", files: [{ path: "a.md", content: "a" }] }), { code: "INVALID_INPUT" });
  const outside = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "workspace-project-outside-")));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.symlink(outside, path.join(root, ".workspace-project"));
  await assert.rejects(runtime.plan({ ...request, files: [{ path: "safe.txt", content: "safe" }] }), { code: "STORAGE_UNAVAILABLE" });
  assert.deepEqual(await fs.readdir(outside), []);
});

test("missing immutable versions and abandoned reservations fail loudly without deleting drafts", async t => {
  const { root, runtime } = await fixture(t);
  await assert.rejects(read(runtime, root), { code: "NOT_FOUND" });
  const first = await write(runtime, root, [{ path: "readme.md", content: "one\n" }]);
  await assert.rejects(read(runtime, root, "project-inspect", { version: "f".repeat(40) }), { code: "NOT_FOUND" });
  const request = { operation: "project-checkpoint", workspaceRoot: root, path: "demo", expectedVersion: first.version, files: [{ path: "readme.md", content: "preserved draft\n" }] };
  const plan = await runtime.plan(request);
  const lock = path.join(root, ".workspace-project", ".writer.lock");
  await fs.mkdir(lock);
  await assert.rejects(runtime.apply({ ...request, planDigest: plan.planDigest, operatorAuthorized: true }), { code: "RESOURCE_BUSY" });
  assert.equal((await fs.stat(lock)).isDirectory(), true);
  assert.equal(request.files[0].content, "preserved draft\n");
  assert.equal((await read(runtime, root)).data.version, first.version);
});

test("Git alternate stores and configured transports are never admitted", async t => {
  const { root, runtime } = await fixture(t);
  await write(runtime, root, [{ path: "readme.md", content: "local only\n" }]);
  const repo = path.join(root, ".workspace-project", "repos", "demo.git");
  const alternates = path.join(repo, "objects", "info", "alternates");
  await fs.writeFile(alternates, "/outside/objects\n");
  await assert.rejects(read(runtime, root), { code: "STORAGE_UNAVAILABLE" });
  await fs.unlink(alternates);
  await fs.appendFile(path.join(repo, "config"), '[remote "paid"]\n url = https://unavailable.invalid/repo.git\n');
  await assert.rejects(read(runtime, root), { code: "STORAGE_UNAVAILABLE" });
});

test("direct runtime calls cannot adopt an existing working or bare Git root", async t => {
  const { root, runtime } = await fixture(t);
  const request = { operation: "project-checkpoint", workspaceRoot: root, path: "demo", expectedVersion: "", files: [{ path: "safe.md", content: "draft" }] };
  for (const name of [".git", "HEAD", "objects"]) {
    const marker = path.join(root, name);
    await fs.writeFile(marker, "existing repository metadata\n");
    await assert.rejects(runtime.plan(request), { code: "FORBIDDEN" });
    await fs.unlink(marker);
  }
  assert.deepEqual(await fs.readdir(root), []);
});
