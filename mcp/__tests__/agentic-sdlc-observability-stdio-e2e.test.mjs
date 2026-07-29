import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import Ajv2020 from "ajv/dist/2020.js";

import { createAgenticSdlcLedgerReceipt } from "../agentic-sdlc-ledger-runtime.js";
import { ImplementationRunStore } from "../implementation-run-store.js";
import { KNOWGRPH_LOCAL_MCP_TOOL_NAMES } from "../local-tool-contract.js";

const execFileAsync = promisify(execFile);
const sourceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const EVALUATOR_DEPENDENCIES = Object.freeze([
  "ajv",
  "fast-deep-equal",
  "fast-uri",
  "json-schema-traverse",
  "require-from-string",
]);

test("local stdio MCP exposes the read-only Agentic SDLC observer and fails closed without a canonical ledger", async (t) => {
  const runtimeRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "knowgrph-sdlc-observe-stdio-"),
  );
  t.after(() => fs.rm(runtimeRoot, { recursive: true, force: true }));

  const client = new Client({
    name: "agentic-sdlc-observability-stdio-e2e",
    version: "0.0.0",
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(sourceRoot, "mcp", "server.js")],
    cwd: sourceRoot,
    env: {
      PATH: String(process.env.PATH || ""),
      HOME: String(process.env.HOME || ""),
      NODE_ENV: "test",
      KNOWGRPH_ROOT: runtimeRoot,
      KNOWGRPH_EXTERNAL_MCP_PROFILES_JSON: "",
    },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });

  try {
    await client.connect(transport, {
      timeout: 10_000,
      maxTotalTimeout: 10_000,
    });
    const listed = await client.listTools(undefined, {
      timeout: 10_000,
      maxTotalTimeout: 10_000,
    });
    const descriptor = listed.tools.find(
      (entry) =>
        entry.name === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.agenticSdlcObserve,
    );
    assert.ok(descriptor, stderr);
    assert.deepEqual(descriptor.annotations, {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    });
    const validateOutput = new Ajv2020({ strict: false }).compile(
      descriptor.outputSchema,
    );

    const called = await client.callTool(
      {
        name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.agenticSdlcObserve,
        arguments: {
          invocation: {
            action: "/sdlc.observe",
            semantic: "#agentic-sdlc-observability",
            bindings: [
              "@implementation-run",
              "@canvas",
              "@runtime-proof",
            ],
          },
          runId: "ir_0123456789abcdef01234567",
          view: "overview",
          expectedRevision: 1,
          expectedLedgerDigest: `sha256:${"a".repeat(64)}`,
        },
      },
      undefined,
      { timeout: 10_000, maxTotalTimeout: 10_000 },
    );
    assert.equal(called.isError, true, stderr);
    assert.equal(
      validateOutput(called.structuredContent),
      true,
      new Ajv2020().errorsText(validateOutput.errors),
    );
    assert.equal(called.structuredContent.ok, false);
    assert.equal(
      called.structuredContent.error.code,
      "run_not_found",
    );
    assert.deepEqual(called.structuredContent.economics, {
      modelCalls: 0,
      networkCalls: 0,
      promptTokens: 0,
      completionTokens: 0,
      estimatedCostUsd: 0,
      providerSpendUsd: 0,
    });
  } finally {
    await client.close().catch(() => undefined);
  }
});

test("local stdio MCP observes a receipt-bound ledger through the real store, evaluator loader, and projector", async (t) => {
  const runtimeRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "knowgrph-sdlc-observe-stdio-success-"),
  );
  t.after(() => fs.rm(runtimeRoot, { recursive: true, force: true }));
  const evaluatorRoot = path.join(runtimeRoot, "agentic-canvas-os");
  const evaluatorPath = path.join(evaluatorRoot, "scripts", "agentic-sdlc", "index.mjs");
  await fs.mkdir(path.dirname(evaluatorPath), { recursive: true });
  await fs.mkdir(path.join(evaluatorRoot, "node_modules"), { recursive: true });
  const sourceLock = JSON.parse(
    await fs.readFile(path.join(sourceRoot, "package-lock.json"), "utf8"),
  );
  const dependencyLocks = Object.fromEntries(
    EVALUATOR_DEPENDENCIES.map((name) => {
      const lockKey = `node_modules/${name}`;
      assert.ok(sourceLock.packages?.[lockKey]);
      return [lockKey, sourceLock.packages[lockKey]];
    }),
  );
  await fs.writeFile(evaluatorPath, [
    "export const assertCanonicalRunSchema = value => {",
    "  if (value?.schema !== 'agentic-sdlc-run/v1') throw new Error('schema');",
    "};",
    "export const normalizeCanonicalRun = value => ({",
    "  schema: value.schema, runId: value.runId, vccs: [],",
    "  tasks: [{ id: '1', text: 'Observe', state: 'verified', transitions: [{",
    "    to: 'verified', role: 'evaluator', mechanismId: 'stdio-evaluator' }] }],",
    "  evidenceReferences: [{ id: 'e1', taskId: '1', namedCheck: 'observer',",
    "    checkRunId: 'stdio-check', checkRanInTask: true,",
    "    recordedResult: { status: 'passed' } }],",
    "  recoveryEvents: [], humanGateEvents: [], operatorDecisions: [],",
    "});",
    "export const validateExecutionRun = value => ({",
    "  schema: 'agentic-sdlc-execution-conformance/v1', runId: value.runId,",
    "  runtimeReady: true, admissionReady: true,",
    "  readiness: { localRung: 'runtime-ready', deliveredRung: 'undocumented' },",
    "  controlFailures: [], findings: [],",
    "  findingCounts: { 'self-graded-verdict': 0 },",
    "  severityCounts: { blocker: 0, major: 0, minor: 0 },",
    "  metrics: { taskCount: 1, vccCount: 0, coveredVccCount: 0,",
    "    verifiedTaskCount: 1, evidenceReferenceCount: 1, bridgeCoverageRatio: 1,",
    "    boundaryClosed: true, persistenceComplete: true, humanGatesClosed: true,",
    "    economicsWithinEstimate: true, totalTokenConsumption: 0 },",
    "});",
    "export const stableJson = JSON.stringify;",
    "",
  ].join("\n"), "utf8");
  await Promise.all([
    fs.writeFile(path.join(evaluatorRoot, ".gitignore"), "node_modules/\n", "utf8"),
    fs.writeFile(path.join(evaluatorRoot, "package.json"), `${JSON.stringify({
      name: "agentic-canvas-os-test",
      private: true,
      type: "module",
      devDependencies: { ajv: "8.17.1" },
    }, null, 2)}\n`, "utf8"),
    fs.writeFile(path.join(evaluatorRoot, "package-lock.json"), `${JSON.stringify({
      name: "agentic-canvas-os-test",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": {
          name: "agentic-canvas-os-test",
          devDependencies: { ajv: "8.17.1" },
        },
        ...dependencyLocks,
      },
    }, null, 2)}\n`, "utf8"),
    ...EVALUATOR_DEPENDENCIES.map((name) => fs.cp(
      path.join(sourceRoot, "node_modules", name),
      path.join(evaluatorRoot, "node_modules", name),
      { errorOnExist: true, recursive: true },
    )),
  ]);
  await execFileAsync("git", ["init", "--quiet"], { cwd: evaluatorRoot });
  await execFileAsync("git", [
    "add",
    ".gitignore",
    "package.json",
    "package-lock.json",
    "scripts/agentic-sdlc/index.mjs",
  ], {
    cwd: evaluatorRoot,
  });
  await execFileAsync("git", [
    "-c", "user.name=Knowgrph Test",
    "-c", "user.email=knowgrph-test@example.invalid",
    "commit", "--quiet", "-m", "fixture",
  ], { cwd: evaluatorRoot });
  const { stdout: revisionText } = await execFileAsync(
    "git",
    ["rev-parse", "HEAD"],
    { cwd: evaluatorRoot, encoding: "utf8" },
  );
  const acosRevision = revisionText.trim();
  const ledger = { schema: "agentic-sdlc-run/v1", runId: "stdio-success-run" };
  const ledgerText = `${JSON.stringify(ledger)}\n`;
  const ledgerDigest =
    `sha256:${crypto.createHash("sha256").update(ledgerText).digest("hex")}`;
  const store = new ImplementationRunStore({ rootDir: runtimeRoot });
  const created = await store.create({
    spec: {
      idempotencyKey: "stdio-success",
      agenticCanvasOsRoot: evaluatorRoot,
    },
    plan: {
      acosRevision,
      supportedAcosRevision: acosRevision,
    },
  });
  const artifact = "agentic-sdlc-run.a0001.stdio.json";
  await store.writeArtifact(created.state.runId, artifact, ledgerText);
  const receipt = createAgenticSdlcLedgerReceipt({
    artifact,
    digest: ledgerDigest,
    bytes: Buffer.byteLength(ledgerText),
    canonicalRunId: ledger.runId,
    ledgerRevision: created.state.revision,
    acosRevision,
  });
  const state = await store.update(
    created.state.runId,
    {
      expectedRevision: created.state.revision,
      eventType: "agentic_sdlc.ledger_bound",
      eventData: {
        artifact: receipt.artifact,
        digest: receipt.digest,
        bytes: receipt.bytes,
        canonicalRunId: receipt.canonicalRunId,
        ledgerRevision: receipt.ledgerRevision,
        acosRevision: receipt.acosRevision,
        runtimeReady: true,
      },
    },
    (current) => {
      current.state = "delivery_ready";
      current.result = { agenticSdlcLedger: receipt };
      return current;
    },
  );

  const client = new Client({
    name: "agentic-sdlc-observability-stdio-success",
    version: "0.0.0",
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(sourceRoot, "mcp", "server.js")],
    cwd: sourceRoot,
    env: {
      PATH: String(process.env.PATH || ""),
      HOME: String(process.env.HOME || ""),
      NODE_ENV: "test",
      KNOWGRPH_ROOT: runtimeRoot,
      KNOWGRPH_EXTERNAL_MCP_PROFILES_JSON: "",
    },
    stderr: "pipe",
  });
  try {
    await client.connect(transport, { timeout: 10_000, maxTotalTimeout: 10_000 });
    const called = await client.callTool({
      name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.agenticSdlcObserve,
      arguments: {
        invocation: {
          action: "/sdlc.observe",
          semantic: "#agentic-sdlc-observability",
          bindings: ["@implementation-run", "@canvas", "@runtime-proof"],
        },
        runId: state.runId,
        view: "full",
        expectedRevision: state.revision,
        expectedLedgerDigest: receipt.digest,
      },
    }, undefined, { timeout: 10_000, maxTotalTimeout: 10_000 });
    const validate = new Ajv2020({ strict: false }).compile(
      (await client.listTools()).tools.find((tool) =>
        tool.name === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.agenticSdlcObserve).outputSchema,
    );
    assert.equal(called.isError, false);
    assert.equal(validate(called.structuredContent), true, JSON.stringify(validate.errors));
    assert.equal(called.structuredContent.ok, true);
    assert.equal(called.structuredContent.source.ledgerDigest, receipt.digest);
    assert.equal(called.structuredContent.status.runtimeReady, true);
    assert.equal(called.structuredContent.status.verified, true);
    assert.equal(called.structuredContent.projection.graphData.metadata.status.verified, true);
    assert.equal(called.structuredContent.projection.graphData.metadata.status.deployed, false);
  } finally {
    await client.close().catch(() => undefined);
  }
});
