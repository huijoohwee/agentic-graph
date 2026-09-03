import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { compileParserRegistry } from "../knowledge-graph/parser-generator.mjs";
import { verifyRepositoryCacheEntry } from "../knowledge-graph/repository-acquisition.mjs";
import { SOURCE_PARSER_REGISTRY } from "../knowledge-graph/source-parser-registry.mjs";

const execFileAsync = promisify(execFile);

async function git(cwd, args) {
  const { stdout } = await execFileAsync("git", [
    "-c", "user.name=Knowledge Graph Fixture",
    "-c", "user.email=fixture@invalid.example",
    "-c", "core.hooksPath=/dev/null",
    ...args,
  ], {
    cwd,
    encoding: "utf8",
    env: {
      PATH: String(process.env.PATH || ""),
      HOME: String(process.env.HOME || ""),
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
    },
  });
  return stdout.trim();
}

async function assertDirtyCacheRejected(repository, expectedSha) {
  await assert.rejects(
    verifyRepositoryCacheEntry(repository, expectedSha),
    (error) => error?.code === "repository_cache_dirty"
      && !String(error?.message || "").includes(repository),
  );
}

test("repository cache reuse rejects tracked, staged, untracked, and ignored content", async (t) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-cache-verification-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const repository = path.join(base, "cache-entry");
  await fs.mkdir(repository);
  await git(repository, ["init", "--quiet"]);
  await fs.writeFile(path.join(repository, ".gitignore"), "ignored.cache\n");
  await fs.writeFile(path.join(repository, "tracked.ts"), "export const clean = true;\n");
  await git(repository, ["add", ".gitignore", "tracked.ts"]);
  await git(repository, ["commit", "--quiet", "-m", "fixture"]);
  const expectedSha = await git(repository, ["rev-parse", "HEAD"]);

  assert.equal(await verifyRepositoryCacheEntry(repository, expectedSha), true);

  await fs.writeFile(path.join(repository, "tracked.ts"), "export const modified = true;\n");
  await assertDirtyCacheRejected(repository, expectedSha);
  await git(repository, ["reset", "--hard", "--quiet", "HEAD"]);

  await fs.writeFile(path.join(repository, "staged.ts"), "export const staged = true;\n");
  await git(repository, ["add", "staged.ts"]);
  await assertDirtyCacheRejected(repository, expectedSha);
  await git(repository, ["reset", "--hard", "--quiet", "HEAD"]);

  await fs.writeFile(path.join(repository, "untracked.ts"), "export const untracked = true;\n");
  await assertDirtyCacheRejected(repository, expectedSha);
  await fs.unlink(path.join(repository, "untracked.ts"));

  await fs.writeFile(path.join(repository, "ignored.cache"), "must not enter the graph\n");
  await assertDirtyCacheRejected(repository, expectedSha);
  await fs.unlink(path.join(repository, "ignored.cache"));

  assert.equal(await verifyRepositoryCacheEntry(repository, expectedSha), true);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    verifyRepositoryCacheEntry(repository, expectedSha, "", {
      abortSignal: controller.signal,
    }),
    (error) => error?.code === "aborted",
  );
  await assert.rejects(
    verifyRepositoryCacheEntry(repository, "0".repeat(40)),
    (error) => error?.code === "repository_cache_invalid",
  );
  assert.equal(
    await verifyRepositoryCacheEntry(path.join(base, "missing"), expectedSha),
    false,
  );
});

test("repository cache verification rejects symlinked entries", async (t) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-cache-symlink-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const outside = path.join(base, "outside");
  const link = path.join(base, "entry");
  await fs.mkdir(outside);
  await fs.symlink(outside, link, "dir");
  await assert.rejects(
    verifyRepositoryCacheEntry(link, "0".repeat(40), base),
    (error) => error?.code === "repository_cache_invalid",
  );
});

test("parser registry recognizes only exact .env basename families", () => {
  for (const sourcePath of [
    ".env",
    ".ENV",
    ".env.local",
    ".env.production.local",
    "config/.env.example",
  ]) {
    assert.equal(
      SOURCE_PARSER_REGISTRY.match(sourcePath)?.kind,
      "structural-config",
      sourcePath,
    );
  }
  for (const sourcePath of [
    ".env.",
    ".environment",
    ".envrc",
    "config.env.local",
    "env.local",
    `.env.${"x".repeat(128)}`,
  ]) {
    assert.equal(SOURCE_PARSER_REGISTRY.match(sourcePath), null, sourcePath);
  }
  assert.equal(SOURCE_PARSER_REGISTRY.match("production.env")?.kind, "structural-config");
});

test("basename-family parser matchers are inert, bounded, and deterministic", () => {
  const descriptor = {
    id: "environment-fixture",
    kind: "environment-fixture",
    adapter: "environment-fixture",
    fidelity: "structural-parser",
    extensions: [],
    basenames: [],
    basenameFamilies: [".env"],
    priority: 1,
  };
  const registry = compileParserRegistry([descriptor]);
  assert.equal(registry.match(".env.test")?.id, descriptor.id);
  assert.equal(registry.match(".envrc"), null);
  assert.throws(
    () => compileParserRegistry([{ ...descriptor, basenameFamilies: [".env*"] }]),
    (error) => error?.code === "parser_descriptor_invalid",
  );
  assert.throws(
    () => compileParserRegistry([{
      ...descriptor,
      basenameFamilies: Array.from({ length: 65 }, (_, index) => `.env${index}`),
    }]),
    (error) => error?.code === "parser_descriptor_invalid",
  );
});
