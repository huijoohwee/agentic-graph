import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { discoverKnowledgeSources } from "../agent-graph/discovery.mjs";
import { createAgentGraphRuntime } from "../agent-graph/runtime.mjs";

const execFileAsync = promisify(execFile);

async function write(rootPath, relativePath, content) {
  const absolutePath = path.join(rootPath, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
}

async function git(repositoryPath, args) {
  const { stdout } = await execFileAsync("git", ["-C", repositoryPath, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  });
  return stdout;
}

async function initializeRepository(repositoryPath) {
  await fs.mkdir(repositoryPath, { recursive: true });
  await git(repositoryPath, ["init", "--quiet"]);
}

async function repositorySnapshot(repositoryPath) {
  const [index, status] = await Promise.all([
    git(repositoryPath, ["ls-files", "--stage", "-z"]),
    git(repositoryPath, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
  ]);
  return { index, status };
}

test("discovery composes workspace, repository, and caller excludes without dropping tracked sources", async (t) => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-discovery-ignore-"));
  t.after(() => fs.rm(rootPath, { recursive: true, force: true }));
  const outerPath = path.join(rootPath, "outer");
  const innerPath = path.join(outerPath, "modules", "inner");

  await write(rootPath, ".gitignore", "workspace-muted/\n");
  await write(rootPath, "visible.md", "# workspace\n");
  await write(rootPath, "workspace-muted/hidden.md", "# hidden\n");
  await initializeRepository(outerPath);
  await write(outerPath, ".gitignore", [
    "generated/*",
    "!generated/keep.md",
    "dist/",
    "",
  ].join("\n"));
  await write(outerPath, "README.md", "# outer\n");
  await write(outerPath, "generated/drop.md", "# generated\n");
  await write(outerPath, "generated/keep.md", "# retained by negation\n");
  await write(outerPath, "dist/kept.md", "# tracked despite ignore and soft default\n");
  await write(outerPath, "dist/drop.md", "# untracked output\n");
  await write(outerPath, "docs/.gitignore", "private/*\n!private/keep.md\n");
  await write(outerPath, "docs/private/drop.md", "# nested ignored\n");
  await write(outerPath, "docs/private/keep.md", "# nested retained\n");
  await write(outerPath, "caller-excluded.md", "# caller excluded\n");
  await git(outerPath, ["add", "--force", "dist/kept.md"]);

  await initializeRepository(innerPath);
  await write(innerPath, ".gitignore", [
    "artifacts/*",
    "!artifacts/keep.md",
    "dist/",
    "",
  ].join("\n"));
  await write(innerPath, "README.md", "# inner\n");
  await write(innerPath, "artifacts/drop.md", "# generated\n");
  await write(innerPath, "artifacts/keep.md", "# retained by negation\n");
  await write(innerPath, "dist/kept.md", "# tracked despite ignore and soft default\n");
  await write(innerPath, "dist/drop.md", "# untracked output\n");
  await git(innerPath, ["add", "--force", "dist/kept.md"]);

  const before = {
    inner: await repositorySnapshot(innerPath),
    outer: await repositorySnapshot(outerPath),
  };
  const args = {
    rootPath,
    include: ["*.md"],
    exclude: ["outer/caller-excluded.md"],
    respectGitignore: true,
  };
  const first = await discoverKnowledgeSources(args);
  const second = await discoverKnowledgeSources(args);
  const paths = first.sources.map((source) => source.relativePath);

  assert.deepEqual(paths, [
    "outer/README.md",
    "outer/dist/kept.md",
    "outer/docs/private/keep.md",
    "outer/generated/keep.md",
    "outer/modules/inner/README.md",
    "outer/modules/inner/artifacts/keep.md",
    "outer/modules/inner/dist/kept.md",
    "visible.md",
  ]);
  assert.deepEqual(
    first.repositories.map((repository) => repository.repositoryPath),
    [".", "outer", "outer/modules/inner"],
  );
  assert.deepEqual(
    second.sources.map((source) => ({
      relativePath: source.relativePath,
      repositoryPath: source.repositoryPath,
    })),
    first.sources.map((source) => ({
      relativePath: source.relativePath,
      repositoryPath: source.repositoryPath,
    })),
  );
  assert.deepEqual(second.admission.counts, first.admission.counts);
  assert.deepEqual({
    inner: await repositorySnapshot(innerPath),
    outer: await repositorySnapshot(outerPath),
  }, before);
  const explicit = await discoverKnowledgeSources({
    ...args,
    exclude: [...args.exclude, "outer/dist/kept.md"],
  });
  assert.equal(
    explicit.sources.some((source) => source.relativePath === "outer/dist/kept.md"),
    false,
  );
});

test("invalid repository markers cannot create repository or ignore-policy domains", async (t) => {
  const basePath = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-discovery-fake-repo-"));
  t.after(() => fs.rm(basePath, { recursive: true, force: true }));
  const rootPath = path.join(basePath, "corpus");
  const unrelatedRepository = path.join(basePath, "unrelated-repository");
  await fs.mkdir(rootPath);
  await initializeRepository(unrelatedRepository);
  await write(rootPath, "fixture/.git", `gitdir: ${path.join(unrelatedRepository, ".git")}\n`);
  await write(rootPath, "fixture/.gitignore", "generated/*\n!generated/keep.md\n");
  await write(rootPath, "fixture/generated/drop.md", "# ignored\n");
  await write(rootPath, "fixture/generated/keep.md", "# retained\n");
  await write(rootPath, "fixture/visible.md", "# visible\n");

  const first = await discoverKnowledgeSources({ rootPath, include: ["*.md"] });
  const second = await discoverKnowledgeSources({ rootPath, include: ["*.md"] });

  assert.deepEqual(first.sources.map((source) => source.relativePath), [
    "fixture/generated/drop.md",
    "fixture/generated/keep.md",
    "fixture/visible.md",
  ]);
  assert.deepEqual(first.repositories.map((repository) => repository.repositoryPath), ["."]);
  assert.deepEqual(
    second.sources.map((source) => [source.relativePath, source.repositoryPath]),
    first.sources.map((source) => [source.relativePath, source.repositoryPath]),
  );

  const oversizedGitDirectory = path.join(basePath, "oversized-git-directory");
  await write(oversizedGitDirectory, "HEAD", "ref: refs/heads/main\n");
  await write(
    oversizedGitDirectory,
    "commondir",
    "x".repeat((64 * 1024) + 1),
  );
  await write(
    rootPath,
    "oversized/.git",
    `gitdir: ${oversizedGitDirectory}\n`,
  );
  await assert.rejects(
    discoverKnowledgeSources({ rootPath, include: ["*.md"] }),
    (error) => error?.code === "repository_marker_invalid",
  );
});

test("discovery ignores ambient Git authority, skips symlinks, and revalidates admission", async (t) => {
  const basePath = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-discovery-boundary-"));
  t.after(() => fs.rm(basePath, { recursive: true, force: true }));
  const rootPath = path.join(basePath, "corpus");
  const repositoryPath = path.join(rootPath, "repository");
  const outsidePath = path.join(basePath, "outside");
  await fs.mkdir(rootPath);
  await initializeRepository(repositoryPath);
  await write(repositoryPath, ".gitignore", "ignored/\n");
  await write(repositoryPath, "visible.md", "# visible\n");
  await write(repositoryPath, "ignored/drop.md", "# ignored\n");
  await write(outsidePath, "outside.md", "# must not follow\n");
  await fs.symlink(outsidePath, path.join(repositoryPath, "linked-directory"), "dir");

  const previous = {
    GIT_DIR: process.env.GIT_DIR,
    GIT_INDEX_FILE: process.env.GIT_INDEX_FILE,
    GIT_WORK_TREE: process.env.GIT_WORK_TREE,
    GIT_CONFIG_COUNT: process.env.GIT_CONFIG_COUNT,
    GIT_CONFIG_KEY_0: process.env.GIT_CONFIG_KEY_0,
    GIT_CONFIG_VALUE_0: process.env.GIT_CONFIG_VALUE_0,
  };
  Object.assign(process.env, {
    GIT_DIR: path.join(outsidePath, ".git"),
    GIT_INDEX_FILE: path.join(outsidePath, "index"),
    GIT_WORK_TREE: outsidePath,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.fsmonitor",
    GIT_CONFIG_VALUE_0: "malicious-command",
  });
  let discovered;
  try {
    discovered = await discoverKnowledgeSources({ rootPath, include: ["*.md"] });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.deepEqual(discovered.sources.map((source) => source.relativePath), [
    "repository/visible.md",
  ]);
  assert.ok(discovered.diagnostics.some((item) => (
    item.code === "symlink_skipped" && item.sourcePath === "repository/linked-directory"
  )));
  await write(repositoryPath, "new.md", "# changed admission\n");
  await assert.rejects(
    discovered.revalidateAdmission(),
    (error) => error?.code === "source_admission_changed",
  );
});

test("tracked symlinks and gitlinks are explicit incomplete omissions and fail strict ingest", async (t) => {
  const basePath = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-discovery-tracked-omissions-"));
  t.after(() => fs.rm(basePath, { recursive: true, force: true }));
  const repositoryPath = path.join(basePath, "repository");
  const gitlinkPath = path.join(repositoryPath, "modules", "dependency");
  const outputRoot = path.join(basePath, "output");
  await initializeRepository(repositoryPath);
  await write(repositoryPath, "ok.md", "# OK\n");
  await fs.symlink("ok.md", path.join(repositoryPath, "linked.md"));
  await git(repositoryPath, ["add", "ok.md", "linked.md"]);

  await initializeRepository(gitlinkPath);
  await write(gitlinkPath, "README.md", "# Nested dependency\n");
  await git(gitlinkPath, ["add", "README.md"]);
  await git(gitlinkPath, [
    "-c", "user.name=Fixture",
    "-c", "user.email=fixture@example.test",
    "commit", "--quiet", "-m", "fixture",
  ]);
  const gitlinkCommit = (await git(gitlinkPath, ["rev-parse", "HEAD"])).trim();
  await git(repositoryPath, [
    "update-index", "--add", "--cacheinfo", "160000", gitlinkCommit, "modules/dependency",
  ]);

  const discovered = await discoverKnowledgeSources({ rootPath: repositoryPath });
  assert.deepEqual(discovered.sources.map((source) => source.relativePath), ["ok.md"]);
  assert.equal(discovered.admission.complete, false);
  assert.deepEqual(discovered.admission.incompleteSources, ["linked.md", "modules/dependency"]);
  assert.deepEqual(
    discovered.admission.reasons,
    ["tracked_symlink_omitted", "tracked_gitlink_omitted"],
  );
  assert.equal(discovered.admission.counts.trackedSymlinksOmitted, 1);
  assert.equal(discovered.admission.counts.trackedGitlinksOmitted, 1);
  assert.ok(discovered.diagnostics.some((item) => (
    item.code === "tracked_symlink_omitted" && item.sourcePath === "linked.md"
  )));
  assert.ok(discovered.diagnostics.some((item) => (
    item.code === "tracked_gitlink_omitted" && item.sourcePath === "modules/dependency"
  )));
  const markdownScoped = await discoverKnowledgeSources({
    rootPath: repositoryPath,
    include: ["*.md"],
  });
  assert.equal(markdownScoped.admission.complete, false);
  assert.deepEqual(
    markdownScoped.admission.incompleteSources,
    ["linked.md", "modules/dependency"],
  );

  const runtime = createAgentGraphRuntime({
    agenticGraphRoot: basePath,
    allowedRoots: [repositoryPath],
    outputRoot,
  });
  const nonStrict = await runtime.ingest({ rootPath: repositoryPath, strict: false });
  assert.equal(nonStrict.ok, true, JSON.stringify(nonStrict));
  assert.equal(nonStrict.complete, false);
  assert.deepEqual(nonStrict.completeness.incompleteSources, ["linked.md", "modules/dependency"]);
  const strict = await runtime.ingest({ rootPath: repositoryPath, strict: true });
  assert.equal(strict.ok, false);
  assert.equal(strict.error.code, "strict_ingest_incomplete");
  assert.deepEqual(strict.error.details.sources, ["linked.md", "modules/dependency"]);
  assert.deepEqual(
    strict.error.details.reasons,
    ["tracked_gitlink_omitted", "tracked_symlink_omitted"],
  );
});
