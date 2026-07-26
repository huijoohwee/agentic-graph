import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import Ajv2020 from "ajv/dist/2020.js";

import {
  REPOSITORY_PACK_HARD_BOUNDS,
  REPOSITORY_PACK_OUTPUT_SCHEMA,
} from "../repository-pack-contract.js";
import { runRepositoryPackTool } from "../repository-pack-runtime.js";

const execFileAsync = promisify(execFile);
const validateOutput = new Ajv2020({ strict: false }).compile(REPOSITORY_PACK_OUTPUT_SCHEMA);
const write = async (root, relativePath, value) => {
  const target = path.join(root, ...relativePath.split("/"));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, value);
};
const stageAll = (root) => execFileAsync("git", ["-C", root, "add", "-A"]);
const makeDirectory = async (t, prefix = "knowgrph-repository-pack-") => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
};
const makeRepository = async (t) => {
  const root = await makeDirectory(t);
  await execFileAsync("git", ["init", "-q", root]);
  return root;
};
const assertSchemaValid = (payload) => {
  assert.equal(validateOutput(payload), true, new Ajv2020().errorsText(validateOutput.errors));
};
const recoverSourceBytes = (artifact, relativePath, expected) => {
  const digest = createHash("sha256").update(expected).digest("hex");
  const marker = [
    `- Path: ${JSON.stringify(relativePath)}`,
    `- Bytes: ${expected.length}`,
    `- SHA-256: ${digest}`,
    "",
    "",
  ].join("\n");
  const text = artifact.toString("utf8");
  const markerOffset = text.indexOf(marker);
  assert.notEqual(markerOffset, -1, `missing source record for ${relativePath}`);
  const fenceOffset = markerOffset + marker.length;
  const openingFence = text.slice(fenceOffset).match(/^(`{4,})text\n/u);
  assert.ok(openingFence, `missing source fence for ${relativePath}`);
  const contentOffset = Buffer.byteLength(
    text.slice(0, fenceOffset + openingFence[0].length),
    "utf8",
  );
  return artifact.subarray(contentOffset, contentOffset + expected.length);
};

test("repository pack deterministically renders the ACOS grammar and reuses <sha256>.md", async (t) => {
  const root = await makeRepository(t);
  const withFinalNewline = Buffer.from("# Demo\n");
  const withoutFinalNewline = Buffer.from("no final newline");
  await write(root, ".gitignore", "ignored.txt\n");
  await write(root, "README.md", withFinalNewline);
  await write(root, "src/fenced.js", "export const marker = '`````';\n");
  await write(root, "src/no-final.txt", withoutFinalNewline);
  await write(root, "assets/pixel.bin", Buffer.from([0, 1, 2, 3, 255]));
  await fs.symlink("README.md", path.join(root, "inside-link"));
  await stageAll(root);
  await execFileAsync("git", [
    "-C", root,
    "-c", "user.name=Knowgrph Test",
    "-c", "user.email=knowgrph-test@example.invalid",
    "commit", "-qm", "fixture",
  ]);
  await write(root, "notes/untracked.md", "untracked context\n");
  await write(root, "ignored.txt", "must not be packed\n");

  const first = await runRepositoryPackTool({ maxFiles: 7 }, { rootDir: root });
  assertSchemaValid(first);
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.status, "completed");
  assert.equal(first.reused, false);
  assert.match(first.gitRevision, /^[0-9a-f]{40,64}$/u);
  assert.deepEqual(first.counts, {
    discoveredFiles: 7,
    embeddedFiles: 5,
    binaryFiles: 1,
    omittedFiles: 2,
    fileCount: 7,
    sourceBytes: first.counts.sourceBytes,
    outputBytes: first.counts.outputBytes,
  });
  assert.deepEqual(first.bounds, {
    maxFiles: 7,
    maxFileBytes: 2_097_152,
    maxTotalBytes: 134_217_728,
    maxOutputBytes: 268_435_456,
    maxRuntimeMs: 60_000,
    maxResponseBytes: 65_536,
    maxPolicyPaths: 256,
    maxPathBytes: 1_024,
  });
  assert.equal(first.omissions.binary, 1);
  assert.equal(first.omissions.symlink, 1);
  assert.equal(first.networkCalls, 0);
  assert.equal(first.modelCalls, 0);
  assert.equal(first.inputTokens, 0);
  assert.equal(first.outputTokens, 0);
  assert.equal(first.costUsd, 0);
  assert.equal(JSON.stringify(first).includes(root), false);
  assert.match(first.artifactPath, /^data\/outputs\/repository-packs\/[0-9a-f]{64}\.md$/u);
  assert.equal(path.basename(first.artifactPath), `${first.artifactSha256}.md`);

  const artifactPath = path.join(root, ...first.artifactPath.split("/"));
  const bytes = await fs.readFile(artifactPath);
  const artifact = bytes.toString("utf8");
  assert.equal((await fs.stat(artifactPath)).mode & 0o077, 0);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), first.artifactSha256);
  assert.equal(bytes.length, first.counts.outputBytes);
  assert.match(artifact, /^# Repository Pack Manifest/u);
  assert.match(artifact, /# Path Index/u);
  assert.match(artifact, /# Source Records/u);
  assert.match(artifact, /notes\/untracked\.md/u);
  assert.match(artifact, /binary-omitted/u);
  assert.match(artifact, /symlink-omitted/u);
  assert.match(artifact, /``````text\nexport const marker/u);
  assert.doesNotMatch(artifact, /must not be packed/u);
  assert.deepEqual(recoverSourceBytes(bytes, "README.md", withFinalNewline), withFinalNewline);
  assert.deepEqual(recoverSourceBytes(bytes, "src/no-final.txt", withoutFinalNewline), withoutFinalNewline);

  const second = await runRepositoryPackTool({ maxFiles: 7 }, { rootDir: root });
  assertSchemaValid(second);
  assert.equal(second.ok, true);
  assert.equal(second.reused, true);
  assert.equal(second.artifactSha256, first.artifactSha256);
  assert.equal(second.sourceSetSha256, first.sourceSetSha256);
});

test("repositoryPath, outputDirectory, includePaths, and excludePaths are normalized under the host root", async (t) => {
  const hostRoot = await makeDirectory(t, "knowgrph-pack-host-");
  const repositoryRoot = path.join(hostRoot, "nested");
  await execFileAsync("git", ["init", "-q", repositoryRoot]);
  await write(repositoryRoot, "tracked.txt", "tracked\n");
  await write(repositoryRoot, "generated/skip.txt", "skip\n");
  await stageAll(repositoryRoot);
  await write(repositoryRoot, "untracked.txt", "untracked\n");

  const result = await runRepositoryPackTool({
    repositoryPath: "nested",
    outputDirectory: "artifacts/packs",
    includePaths: ["generated", "tracked.txt"],
    excludePaths: ["generated/skip.txt"],
  }, { rootDir: hostRoot });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.match(result.artifactPath, /^artifacts\/packs\/[0-9a-f]{64}\.md$/u);
  assert.equal(result.omissions.policyExcluded, 2);
  assert.equal(result.counts.fileCount, 1);
  const artifact = await fs.readFile(path.join(repositoryRoot, ...result.artifactPath.split("/")), "utf8");
  assert.match(artifact, /tracked\.txt/u);
  assert.match(artifact, /"policyExcluded":2/u);
  assert.match(artifact, /Include path count: 2/u);
  assert.match(artifact, /Exclude path count: 1/u);
  assert.doesNotMatch(artifact, /generated\/skip\.txt/u);
  assert.doesNotMatch(artifact, /untracked\.txt/u);
  assert.equal(JSON.stringify(result).includes("generated/skip.txt"), false);

  for (const invalid of [
    { includeUntracked: false },
    { repositoryPath: "../escape" },
    { outputDirectory: "https://example.invalid/output" },
    { includePaths: ["src", "src"] },
  ]) {
    const rejected = await runRepositoryPackTool(invalid, { rootDir: hostRoot });
    assertSchemaValid(rejected);
    assert.equal(rejected.error.code, "INVALID_ARGUMENTS");
  }
});

test("Git inventory preserves empty and Unicode text in canonical byte order without source mutation", async (t) => {
  const root = await makeRepository(t);
  const sources = new Map([
    [".gitignore", Buffer.from("nested/\n")],
    ["empty.txt", Buffer.alloc(0)],
    ["z-last.txt", Buffer.from("last\n")],
    ["éclair.txt", Buffer.from("accented\n")],
    ["漢字.txt", Buffer.from("unicode\n")],
  ]);
  for (const [relativePath, content] of sources) await write(root, relativePath, content);
  await write(root, "nested/ignored.txt", "ignored\n");
  await stageAll(root);

  const before = new Map();
  for (const relativePath of sources.keys()) {
    before.set(relativePath, await fs.readFile(path.join(root, relativePath)));
  }
  const result = await runRepositoryPackTool({}, { rootDir: root });
  assert.equal(result.ok, true, JSON.stringify(result));
  const artifactBytes = await fs.readFile(path.join(root, ...result.artifactPath.split("/")));
  const artifact = artifactBytes.toString("utf8");
  const pathIndex = artifact
    .slice(artifact.indexOf("# Path Index"), artifact.indexOf("# Source Records"))
    .split("\n")
    .filter((line) => /^\d+\. /u.test(line))
    .map((line) => JSON.parse(line.replace(/^\d+\. /u, "")).path);
  const expectedPaths = [...sources.keys()]
    .sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
  assert.deepEqual(pathIndex, expectedPaths);
  assert.doesNotMatch(artifact, /nested\/ignored\.txt/u);
  assert.deepEqual(recoverSourceBytes(artifactBytes, "empty.txt", sources.get("empty.txt")), Buffer.alloc(0));
  assert.deepEqual(
    recoverSourceBytes(artifactBytes, "漢字.txt", sources.get("漢字.txt")),
    sources.get("漢字.txt"),
  );
  for (const [relativePath, content] of before) {
    assert.deepEqual(await fs.readFile(path.join(root, relativePath)), content);
  }
});

test("repository Git configuration and inherited Git variables cannot execute fsmonitor hooks", async (t) => {
  const root = await makeRepository(t);
  const hookDirectory = await makeDirectory(t, "knowgrph-pack-git-hook-");
  const hookPath = path.join(hookDirectory, "fsmonitor.cjs");
  const markerPath = path.join(hookDirectory, "executed");
  await write(root, "source.txt", "inert configuration\n");
  await stageAll(root);
  await fs.writeFile(hookPath, [
    "#!/usr/bin/env node",
    'const fs = require("node:fs");',
    `fs.writeFileSync(${JSON.stringify(markerPath)}, "executed");`,
    'process.stdout.write("0\\n");',
    "",
  ].join("\n"));
  await fs.chmod(hookPath, 0o700);
  await execFileAsync("git", ["-C", root, "config", "core.fsmonitor", hookPath]);
  await execFileAsync("git", ["-C", root, "ls-files", "--cached", "--others", "--exclude-standard"]);
  assert.equal(await fs.readFile(markerPath, "utf8"), "executed");
  await fs.unlink(markerPath);

  const result = await runRepositoryPackTool({}, {
    rootDir: root,
    env: {
      ...process.env,
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.fsmonitor",
      GIT_CONFIG_VALUE_0: hookPath,
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  await assert.rejects(fs.access(markerPath), { code: "ENOENT" });
  assert.equal(result.networkCalls, 0);
});

test("uninitialized mode-160000 Gitlinks receive a typed submodule omission", async (t) => {
  const root = await makeRepository(t);
  await write(root, "source.txt", "source\n");
  await stageAll(root);
  await execFileAsync("git", [
    "-C", root,
    "-c", "user.name=Knowgrph Test",
    "-c", "user.email=knowgrph-test@example.invalid",
    "commit", "-qm", "fixture",
  ]);
  const revision = (await execFileAsync("git", ["-C", root, "rev-parse", "HEAD"])).stdout.trim();
  await execFileAsync("git", [
    "-C", root,
    "update-index", "--add", "--cacheinfo",
    `160000,${revision},vendor/sub`,
  ]);

  const result = await runRepositoryPackTool({}, { rootDir: root });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.omissions.submodule, 1);
  assert.equal(result.counts.fileCount, 2);
  const artifact = await fs.readFile(path.join(root, ...result.artifactPath.split("/")), "utf8");
  assert.match(artifact, /"path":"vendor\/sub","state":"submodule-omitted"/u);
});

test("repository pack blocks file, inventory, aggregate, output, and host bound overflow", async (t) => {
  const root = await makeRepository(t);
  await write(root, "a.txt", "12345");
  await write(root, "b.txt", "67890");
  await stageAll(root);
  const selected = await runRepositoryPackTool(
    { includePaths: ["a.txt"], maxFiles: 1 },
    { rootDir: root },
  );
  assert.equal(selected.ok, true, JSON.stringify(selected));
  assert.equal(selected.counts.discoveredFiles, 2);
  assert.equal(selected.counts.fileCount, 1);
  const cases = [
    [{ maxFiles: 1 }, {}, "INVENTORY_LIMIT_EXCEEDED"],
    [{ maxFileBytes: 4 }, {}, "FILE_LIMIT_EXCEEDED"],
    [{ maxTotalBytes: 9 }, {}, "SOURCE_TOTAL_LIMIT_EXCEEDED"],
    [{}, { maxOutputBytes: 1 }, "OUTPUT_LIMIT_EXCEEDED"],
    [{}, { maxOutputBytes: REPOSITORY_PACK_HARD_BOUNDS.hardMaxOutputBytes + 1 }, "INVALID_HOST_BOUNDS"],
    [{}, { maxRuntimeMs: REPOSITORY_PACK_HARD_BOUNDS.hardRuntimeMs + 1 }, "INVALID_HOST_BOUNDS"],
  ];
  for (const [args, options, code] of cases) {
    const result = await runRepositoryPackTool(args, { rootDir: root, ...options });
    assertSchemaValid(result);
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.error.code, code);
    assert.equal(result.artifactPath, null);
  }
});

test("repository pack enforces its host-only runtime deadline", async (t) => {
  const root = await makeRepository(t);
  await write(root, "source.txt", "source\n");
  await stageAll(root);
  let clock = 0;
  const result = await runRepositoryPackTool({}, {
    rootDir: root,
    maxRuntimeMs: 1,
    now: () => clock++,
  });
  assertSchemaValid(result);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "RUNTIME_LIMIT_EXCEEDED");
  assert.equal(result.bounds.maxRuntimeMs, 1);
});

test("repository pack detects file and inventory drift before publication", async (t) => {
  const root = await makeRepository(t);
  const outputDir = path.join(root, "data/outputs/repository-packs");
  await write(root, "source.txt", "version one\n");
  await stageAll(root);
  const changed = await runRepositoryPackTool({}, {
    rootDir: root,
    hooks: { beforeSourceRevalidation: () => write(root, "source.txt", "version two\n") },
  });
  assert.equal(changed.ok, false);
  assert.equal(changed.error.code, "SOURCE_CHANGED");
  assert.deepEqual(await fs.readdir(outputDir), []);

  await write(root, "source.txt", "stable\n");
  const added = await runRepositoryPackTool({}, {
    rootDir: root,
    hooks: { beforeSourceRevalidation: () => write(root, "late.txt", "late\n") },
  });
  assert.equal(added.ok, false);
  assert.equal(added.error.code, "SOURCE_CHANGED");
  assert.deepEqual(await fs.readdir(outputDir), []);

  await write(root, "source.txt", "staged stable\n");
  const afterStaging = await runRepositoryPackTool({}, {
    rootDir: root,
    hooks: { afterArtifactStaged: () => write(root, "source.txt", "staged changed\n") },
  });
  assert.equal(afterStaging.ok, false);
  assert.equal(afterStaging.error.code, "SOURCE_CHANGED");
  assert.deepEqual(await fs.readdir(outputDir), []);
});

test("repository pack revalidates excluded inventory and root identity before staging", async (t) => {
  const excludedRoot = await makeRepository(t);
  await write(excludedRoot, "source.txt", "stable\n");
  await stageAll(excludedRoot);
  const excluded = await runRepositoryPackTool({ excludePaths: ["excluded"] }, {
    rootDir: excludedRoot,
    hooks: { beforeSourceRevalidation: () => write(excludedRoot, "excluded/late.txt", "late\n") },
  });
  assert.equal(excluded.ok, false);
  assert.equal(excluded.error.code, "SOURCE_CHANGED");
  assert.deepEqual(await fs.readdir(path.join(excludedRoot, "data/outputs/repository-packs")), []);

  const root = await makeRepository(t);
  const holder = await makeDirectory(t, "knowgrph-pack-root-swap-");
  const movedRoot = path.join(holder, "moved");
  await write(root, "source.txt", "stable\n");
  await stageAll(root);
  const swapped = await runRepositoryPackTool({}, {
    rootDir: root,
    hooks: {
      beforeSourceRevalidation: async () => {
        await fs.rename(root, movedRoot);
        await fs.mkdir(root);
      },
    },
  });
  assert.equal(swapped.ok, false);
  assert.equal(swapped.error.code, "SOURCE_CHANGED");
  assert.deepEqual(await fs.readdir(path.join(movedRoot, "data/outputs/repository-packs")), []);
});

test("repository pack blocks a concurrent HEAD revision change before staging", async (t) => {
  const root = await makeRepository(t);
  await write(root, "source.txt", "stable\n");
  await stageAll(root);
  await execFileAsync("git", [
    "-C", root,
    "-c", "user.name=Knowgrph Test",
    "-c", "user.email=knowgrph-test@example.invalid",
    "commit", "-qm", "fixture",
  ]);
  const result = await runRepositoryPackTool({}, {
    rootDir: root,
    hooks: {
      beforeSourceRevalidation: () => execFileAsync("git", [
        "-C", root,
        "-c", "user.name=Knowgrph Test",
        "-c", "user.email=knowgrph-test@example.invalid",
        "commit", "--allow-empty", "-qm", "concurrent revision",
      ]),
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "SOURCE_CHANGED");
  assert.deepEqual(await fs.readdir(path.join(root, "data/outputs/repository-packs")), []);
});

test("concurrent repository packs converge on one artifact", async (t) => {
  const root = await makeRepository(t);
  await write(root, "source.txt", "concurrent\n");
  await stageAll(root);
  const results = await Promise.all([
    runRepositoryPackTool({}, { rootDir: root }),
    runRepositoryPackTool({}, { rootDir: root }),
  ]);
  assert.equal(results.every((entry) => entry.ok), true, JSON.stringify(results));
  assert.equal(new Set(results.map((entry) => entry.artifactSha256)).size, 1);
  assert.deepEqual(results.map((entry) => entry.reused).sort(), [false, true]);
  const outputDir = path.join(root, "data/outputs/repository-packs");
  assert.equal((await fs.readdir(outputDir)).filter((entry) => !entry.startsWith(".")).length, 1);
});

test("the no-replace link is the publication commit point for deadline precedence", async (t) => {
  const root = await makeRepository(t);
  await write(root, "source.txt", "commit point\n");
  await stageAll(root);
  let commitReady = false;
  let commitClockReads = 0;
  const result = await runRepositoryPackTool({}, {
    rootDir: root,
    maxRuntimeMs: 120_000,
    now: () => {
      if (!commitReady) return 0;
      commitClockReads += 1;
      return commitClockReads === 1 ? 0 : 120_000;
    },
    hooks: { beforeArtifactCommit: () => { commitReady = true; } },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(commitClockReads, 1);
  const output = await fs.readdir(path.join(root, "data/outputs/repository-packs"));
  assert.deepEqual(output, [`${result.artifactSha256}.md`]);
});

test("repository pack blocks output symlinks and staging-directory swaps", async (t) => {
  const root = await makeRepository(t);
  const external = await makeDirectory(t, "knowgrph-pack-output-external-");
  await write(root, "source.txt", "safe\n");
  await stageAll(root);
  await fs.symlink(external, path.join(root, "data"));
  const symlinked = await runRepositoryPackTool({}, { rootDir: root });
  assert.equal(symlinked.ok, false);
  assert.equal(symlinked.error.code, "OUTPUT_PATH_UNSAFE");
  assert.deepEqual(await fs.readdir(external), []);

  await fs.unlink(path.join(root, "data"));
  const escapedDirectory = path.join(external, "moved");
  const swapped = await runRepositoryPackTool({}, {
    rootDir: root,
    hooks: {
      afterArtifactStaged: async ({ outputDir }) => {
        await fs.rename(outputDir, escapedDirectory);
        await fs.symlink(escapedDirectory, outputDir);
      },
    },
  });
  assert.equal(swapped.ok, false);
  assert.equal(swapped.error.code, "OUTPUT_PATH_UNSAFE");
  assert.deepEqual(await fs.readdir(escapedDirectory), []);

  const pureRoot = await makeRepository(t);
  const pureExternal = await makeDirectory(t, "knowgrph-pack-output-pure-rename-");
  const pureMoved = path.join(pureExternal, "moved");
  await write(pureRoot, "source.txt", "safe\n");
  await stageAll(pureRoot);
  const pureRename = await runRepositoryPackTool({}, {
    rootDir: pureRoot,
    hooks: {
      afterArtifactStaged: async ({ outputDir }) => {
        await fs.rename(outputDir, pureMoved);
        await fs.mkdir(outputDir, { mode: 0o700 });
      },
    },
  });
  assert.equal(pureRename.ok, false);
  assert.equal(pureRename.error.code, "OUTPUT_PATH_UNSAFE");
  assert.deepEqual(await fs.readdir(pureMoved), []);
  assert.deepEqual(await fs.readdir(path.join(pureRoot, "data/outputs/repository-packs")), []);

  const lateRoot = await makeRepository(t);
  const lateExternal = await makeDirectory(t, "knowgrph-pack-output-late-swap-");
  const lateMoved = path.join(lateExternal, "moved");
  const lateTarget = path.join(lateExternal, "target");
  await fs.mkdir(lateTarget);
  await write(lateRoot, "source.txt", "safe\n");
  await stageAll(lateRoot);
  const lateSwap = await runRepositoryPackTool({}, {
    rootDir: lateRoot,
    hooks: {
      beforeArtifactCommit: async () => {
        const outputDir = path.join(lateRoot, "data/outputs/repository-packs");
        await fs.rename(outputDir, lateMoved);
        await fs.symlink(lateTarget, outputDir);
      },
    },
  });
  assert.equal(lateSwap.ok, false);
  assert.equal(lateSwap.error.code, "OUTPUT_PATH_UNSAFE");
  assert.deepEqual(await fs.readdir(lateMoved), []);
  assert.deepEqual(await fs.readdir(lateTarget), []);
});

test("repository pack blocks escaping symlinks, sensitive paths, and high-confidence credentials", async (t) => {
  const external = await makeDirectory(t, "knowgrph-pack-external-");
  await write(external, "outside.txt", "outside\n");
  const symlinkRoot = await makeRepository(t);
  await write(symlinkRoot, "source.txt", "safe\n");
  await fs.symlink(path.join(external, "outside.txt"), path.join(symlinkRoot, "outside-link"));
  await stageAll(symlinkRoot);
  const symlinked = await runRepositoryPackTool({}, { rootDir: symlinkRoot });
  assert.equal(symlinked.ok, false);
  assert.equal(symlinked.error.code, "SOURCE_PATH_UNSAFE");

  const pathRoot = await makeRepository(t);
  await write(pathRoot, ".env", "SAFE_NAME=value\n");
  await stageAll(pathRoot);
  const sensitivePath = await runRepositoryPackTool({}, { rootDir: pathRoot });
  assert.equal(sensitivePath.ok, false);
  assert.equal(sensitivePath.error.code, "SENSITIVE_CONTENT");

  const credentialRoot = await makeRepository(t);
  await write(credentialRoot, "config.txt", "api_key=Abcdefghijklmnopqrstuvwxyz123456\n");
  await stageAll(credentialRoot);
  const credential = await runRepositoryPackTool({}, { rootDir: credentialRoot });
  assert.equal(credential.ok, false);
  assert.equal(credential.error.code, "SENSITIVE_CONTENT");
  assert.equal(JSON.stringify(credential).includes("Abcdef"), false);

  const sourceRoot = await makeRepository(t);
  await write(
    sourceRoot,
    "security-source.js",
    [
      "const apiKey = readServerManagedApiKey(process.env);",
      "const fixture = \"sk-ABCDEF0123456789ABCDEF0123456789\";",
      "export { apiKey, fixture };",
      "",
    ].join("\n"),
  );
  await stageAll(sourceRoot);
  const securitySource = await runRepositoryPackTool({}, { rootDir: sourceRoot });
  assert.equal(securitySource.ok, true);
});

test("repository pack returns a schema-valid private failure outside a Git worktree", async (t) => {
  const root = await makeDirectory(t, "knowgrph-pack-no-git-");
  const result = await runRepositoryPackTool({}, { rootDir: root });
  assertSchemaValid(result);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "NOT_GIT_WORKTREE");
  assert.equal(JSON.stringify(result).includes(root), false);
});
