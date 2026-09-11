import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync } from 'node:child_process';

import { runAgentGraphTool } from "../agent-graph-host.js";
import {
  parseRepositoryUrl,
  repositoryCacheEntryName,
  resolveRepositoryNetworkPin,
  acquireRepositoryUrl,
  assertRepositoryCacheCapacity,
} from "../agent-graph/repository-acquisition.mjs";
import { AGENT_GRAPH_TOOL_NAMES } from "../agent-graph/runtime.mjs";

test('verified immutable acquisitions reuse offline while mutable refs and dirty copies stay fresh', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'graph-offline-cache-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const cacheRoot = path.join(root, 'acquisitions'), seed = path.join(root, 'seed');
  await fs.mkdir(cacheRoot, { mode: 0o700 }); await fs.mkdir(seed);
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: seed, encoding: 'utf8' }).trim();
  git('init', '--quiet'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  await fs.writeFile(path.join(seed, 'source.txt'), 'source');
  git('add', '.'); git('commit', '--quiet', '-m', 'source');
  const sha = git('rev-parse', 'HEAD'), repositoryUrl = 'https://code.example.test/team/repository';
  const target = path.join(cacheRoot, repositoryCacheEntryName({ ...parseRepositoryUrl(repositoryUrl), sha }));
  await fs.rename(seed, target);
  // Full cache still permits reuse; it cannot silently evict an offline copy to admit growth.
  for (let n = 0; n < 15; n++) await fs.mkdir(path.join(cacheRoot, `retained-${n}`));
  await assert.rejects(assertRepositoryCacheCapacity(cacheRoot), error => error.code === 'repository_cache_capacity');
  let lookups = 0;
  const options = { repositoryUrl, repositoryRef: sha, cacheRoot, allowedRoot: root,
    lookupHost: async () => { lookups++; throw new Error('offline fixture'); } };
  const result = await acquireRepositoryUrl(options);
  assert.equal(result.rootPath, target); assert.equal(result.identity.networkRequests, 0);
  assert.equal(result.identity.cacheReused, true); assert.equal(lookups, 0);
  await assert.rejects(acquireRepositoryUrl({ ...options, repositoryRef: 'main' }));
  assert.equal(lookups, 1);
  await fs.writeFile(path.join(target, 'source.txt'), 'tampered');
  await assert.rejects(acquireRepositoryUrl(options), error => error.code === 'repository_cache_dirty');
  assert.equal(lookups, 1);
});

test('cache admission counts retained and incomplete entries without deleting them', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'graph-cache-capacity-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, '.acquire.lock'));
  for (let n = 0; n < 15; n++) await fs.mkdir(path.join(root, `retained-${n}`));
  await assertRepositoryCacheCapacity(root);
  await fs.mkdir(path.join(root, '.acquire-interrupted'));
  await assert.rejects(assertRepositoryCacheCapacity(root), error => error.code === 'repository_cache_capacity');
  assert.equal((await fs.readdir(root)).length, 17);
});

test("repository identity is host-neutral, canonical, and digest stable", () => {
  const first = parseRepositoryUrl("https://code.example.test/group/project");
  const repeated = parseRepositoryUrl("https://code.example.test/group/project.git/");
  const nested = parseRepositoryUrl("https://forge.example.test/org/team/project.git");

  assert.equal(first.displayUrl, repeated.displayUrl);
  assert.equal(first.cacheKey, repeated.cacheKey);
  assert.equal(first.hostname, "code.example.test");
  assert.equal(first.repositoryPath, "group/project");
  assert.equal(first.displayUrl, "https://code.example.test/group/project");
  assert.equal(first.remoteUrl, "https://code.example.test/group/project");
  assert.equal(repeated.remoteUrl, "https://code.example.test/group/project.git");
  assert.match(first.cacheKey, /^[a-f0-9]{24}$/);
  assert.equal(nested.repositoryPath, "org/team/project");
  assert.notEqual(nested.cacheKey, first.cacheKey);
});

test("repository host policy is injected rather than provider-coded", () => {
  assert.throws(
    () => parseRepositoryUrl("https://127.0.0.1/group/project"),
    (error) => error.code === "repository_host_not_allowed",
  );
  assert.throws(
    () => parseRepositoryUrl(
      "https://127.0.0.1/group/project",
      { allowedHosts: ["127.0.0.1"] },
    ),
    (error) => error.code === "repository_host_not_allowed",
  );
  const explicitlyAllowed = parseRepositoryUrl(
    "https://127.0.0.1/group/project",
    { allowedHosts: ["127.0.0.1"], allowPrivateNetwork: true },
  );
  assert.equal(explicitlyAllowed.hostname, "127.0.0.1");
  assert.throws(
    () => parseRepositoryUrl(
      "https://code.example.test/group/project",
      { allowedHosts: ["forge.example.test"] },
    ),
    (error) => error.code === "repository_host_not_allowed",
  );
});

test("repository URL envelope rejects credentials and mutable URL state", () => {
  for (const repositoryUrl of [
    "http://code.example.test/group/project",
    "https://user@code.example.test/group/project",
    "https://user:secret@code.example.test/group/project",
    "https://code.example.test:8443/group/project",
    "https://code.example.test/group/project?ref=main",
    "https://code.example.test/group/project#main",
    "https://code.example.test/",
    "https://localhost/group/project",
    "https://10.0.0.1/group/project",
    "https://code.example.test/group/project%2Fother",
  ]) {
    assert.throws(
      () => parseRepositoryUrl(repositoryUrl),
      (error) => ["repository_url_invalid", "repository_host_not_allowed"].includes(error.code),
      repositoryUrl,
    );
  }
});

test("repository DNS is public-only by default and pinned without redirects", async () => {
  const parsed = parseRepositoryUrl("https://code.example.test/group/project");
  const publicPin = await resolveRepositoryNetworkPin(parsed, {
    lookupHost: async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ],
  });
  assert.deepEqual(publicPin, {
    hostname: "code.example.test",
    address: "93.184.216.34",
    curlResolve: "code.example.test:443:93.184.216.34",
  });
  await assert.rejects(
    resolveRepositoryNetworkPin(parsed, {
      lookupHost: async () => [{ address: "127.0.0.1", family: 4 }],
    }),
    (error) => error.code === "repository_host_not_allowed",
  );
  const privateRepository = parseRepositoryUrl(
    "https://source.internal.test/group/project",
    { allowedHosts: ["source.internal.test"] },
  );
  await assert.rejects(
    resolveRepositoryNetworkPin(privateRepository, {
      allowedHosts: ["source.internal.test"],
      lookupHost: async () => [{ address: "10.2.3.4", family: 4 }],
    }),
    (error) => error.code === "repository_host_not_allowed",
  );
  await assert.rejects(
    resolveRepositoryNetworkPin(privateRepository, {
      allowPrivateNetwork: true,
      lookupHost: async () => [{ address: "10.2.3.4", family: 4 }],
    }),
    (error) => error.code === "repository_host_not_allowed",
  );
  const privatePin = await resolveRepositoryNetworkPin(privateRepository, {
    allowedHosts: ["source.internal.test"],
    allowPrivateNetwork: true,
    lookupHost: async () => [{ address: "10.2.3.4", family: 4 }],
  });
  assert.equal(privatePin.curlResolve, "source.internal.test:443:10.2.3.4");
});

test("repository cache entry names hash untrusted labels within one bounded path component", () => {
  const repository = `r${"x".repeat(198)}z`;
  const parsed = parseRepositoryUrl(`https://code.example.test/group/${repository}`);
  const entryName = repositoryCacheEntryName({
    ...parsed,
    sha: "a".repeat(40),
  });
  assert.match(entryName, /^[a-f0-9]{24}-[a-f0-9]{16}-[a-f0-9]{40}$/);
  assert.ok(Buffer.byteLength(entryName) < 128);
  assert.equal(entryName.includes(repository), false);
  assert.throws(
    () => repositoryCacheEntryName({ ...parsed, sha: "../not-a-commit" }),
    (error) => error.code === "repository_cache_invalid",
  );
});

test("host private-network capability is distinct from its repository provider allowlist", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-repository-host-policy-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const baseEnv = {
    PATH: String(process.env.PATH || ""),
    HOME: String(process.env.HOME || ""),
    AGENTIC_OS_AGENT_GRAPH_REPOSITORY_HOSTS: "127.0.0.1",
    AGENTIC_OS_AGENT_GRAPH_OUTPUT_ROOT: "blocked-output",
  };
  const args = {
    repositoryUrl: "https://127.0.0.1/group/project",
    acquisitionTimeoutMs: 1_000,
    strict: true,
  };
  const blocked = await runAgentGraphTool(
    AGENT_GRAPH_TOOL_NAMES.ingest,
    args,
    { rootDir, env: baseEnv },
  );
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error.code, "repository_host_not_allowed");

  const optedIn = await runAgentGraphTool(
    AGENT_GRAPH_TOOL_NAMES.ingest,
    args,
    {
      rootDir,
      env: {
        ...baseEnv,
        AGENTIC_OS_AGENT_GRAPH_OUTPUT_ROOT: "opted-in-output",
        AGENTIC_OS_AGENT_GRAPH_ALLOW_PRIVATE_REPOSITORY_NETWORK: "1",
      },
    },
  );
  assert.equal(optedIn.ok, false);
  assert.notEqual(optedIn.error.code, "repository_host_not_allowed");
  assert.ok([
    "repository_acquisition_failed",
    "repository_acquisition_timeout",
  ].includes(optedIn.error.code), JSON.stringify(optedIn));
});
