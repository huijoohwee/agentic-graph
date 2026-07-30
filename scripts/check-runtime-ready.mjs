#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { repoRoot } from "./collaboration-contract.mjs";
import { readRuntimeReadinessContract } from "./runtime-readiness-contract.mjs";
import {
  resolveAgenticCanvasOsDocsRoot,
  runAgenticCanvasOsDocsInvokeTool,
} from "../mcp/agentic-canvas-os-docs-runtime.js";
import { runVideoRemix } from "../mcp/video-remix-runtime.js";
import { VIDEO_REMIX_STAGE_ORDER } from "../mcp/video-remix/stage-contract.js";
import { listAgentDefinitions } from "../contracts/agent-runtime.schema.js";
import { kgcRoundTripEquivalent } from "../contracts/kgc-document.schema.js";
import { buildSmeCanvasEvidence } from "../mcp/sme-risk-coverage/canvas-evidence.js";
import { runSmeRiskCoverageMarkdown } from "../mcp/sme-risk-coverage/core.js";

const execFileAsync = promisify(execFile);
const fail = (message) => {
  throw new Error(`runtime-ready check failed: ${message}`);
};

const equalJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const readFrontmatterStringArray = (frontmatter, key) => {
  const lines = String(frontmatter || "").split(/\r?\n/);
  const keyIndex = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (keyIndex < 0) return [];
  const inline = lines[keyIndex].slice(`${key}:`.length).trim();
  if (inline) {
    const parsed = JSON.parse(inline);
    return Array.isArray(parsed) && parsed.every((value) => typeof value === "string") ? parsed : [];
  }
  const values = [];
  for (const line of lines.slice(keyIndex + 1)) {
    const match = line.match(/^\s{2}-\s+["']?([^"']+?)["']?\s*$/);
    if (!match) break;
    values.push(match[1]);
  }
  return values;
};

async function readContract() {
  const contract = await readRuntimeReadinessContract();
  if (!equalJson(contract.stage_contract?.order, VIDEO_REMIX_STAGE_ORDER)) {
    fail("frontmatter stage order does not match the executable stage contract");
  }
  return contract;
}

async function verifyDocs(contract) {
  const dependency = contract.docs_dependency;
  const explicitRoot = String(process.env[dependency.root_env] || "").trim();
  const docsRoot = explicitRoot
    ? path.resolve(explicitRoot)
    : resolveAgenticCanvasOsDocsRoot({ rootDir: repoRoot, env: process.env });

  for (const fileName of dependency.required_files) {
    await fs.access(path.join(docsRoot, fileName)).catch(() => fail(`missing docs dependency: ${path.join(docsRoot, fileName)}`));
  }
  const { stdout: docsCommit } = await execFileAsync("git", ["-C", docsRoot, "rev-parse", "HEAD"])
    .catch(() => fail(`docs dependency is not a Git checkout: ${docsRoot}`));
  if (docsCommit.trim() !== dependency.ref) {
    fail(`docs dependency ref mismatch: expected ${dependency.ref}, received ${docsCommit.trim()}`);
  }

  const env = { [dependency.root_env]: docsRoot };
  for (const token of dependency.proof_tokens) {
    const result = await runAgenticCanvasOsDocsInvokeTool({ token, includeContent: true }, { rootDir: repoRoot, env });
    if (!result.ok || result.invocation?.token !== token || !result.invocation?.content?.includes(token)) {
      fail(`docs SSOT did not resolve ${token}`);
    }
  }
  const skillsSource = await fs.readFile(path.join(docsRoot, "SKILLS.md"), "utf8");
  const skillsFrontmatter = skillsSource.match(/^---\n([\s\S]*?)\n---/)?.[1] || "";
  let catalogVariants = [];
  try {
    catalogVariants = readFrontmatterStringArray(skillsFrontmatter, "skill_variants");
  } catch {
    fail("Agentic Canvas OS SKILLS.md skill_variants is not a valid string array");
  }
  const agentVariants = listAgentDefinitions().map((definition) => {
    if (!catalogVariants.includes(definition.id)) {
      fail(`Agentic Canvas OS SKILLS.md did not catalog ${definition.id}`);
    }
    return { id: definition.id, invocation: definition.invocation };
  });
  return { root: docsRoot, ref: docsCommit.trim(), tokens: dependency.proof_tokens, agentVariants };
}

const mockArgs = Object.freeze({
  referenceUrl: "https://example.com/runtime-ready-reference.mp4",
  brief: "Deterministic zero-spend runtime readiness proof.",
  mode: "dry-run",
  runId: "runtime-ready-local-proof",
  shotCount: 2,
  sourceCards: [
    { sourceId: "proof-a", url: "https://example.com/a", evidenceLevel: "A" },
    { sourceId: "proof-b", url: "https://example.com/b", evidenceLevel: "B" },
    { sourceId: "proof-c", url: "https://example.com/c", evidenceLevel: "B" },
  ],
});

const proofProjection = (payload) => ({
  state: payload.state,
  mode: payload.mode,
  stages: payload.stages.map(({ id, status, executed }) => ({ id, status, executed: executed === true })),
  paidProviderCalls: payload.budgetMeters.paidProviderCalls,
  actualCostUsd: payload.budgetMeters.actualCostUsd,
  providerSpendCents: payload.budgetMeters.providerSpendCents,
  artifactCount: payload.render.assets.length,
});

function verifyMockRuntime(contract) {
  const replayCount = contract.local_proof.deterministic_replays;
  const projections = Array.from({ length: replayCount }, () => proofProjection(runVideoRemix(mockArgs).payload));
  const first = projections[0];
  if (!projections.every((projection) => equalJson(projection, first))) fail("mock replays are not deterministic");
  if (!equalJson(first.stages.map(({ id }) => id), VIDEO_REMIX_STAGE_ORDER)) fail("manifest stage order drifted");
  if (first.paidProviderCalls !== contract.local_proof.paid_call_count) fail("paid call count is not zero");
  if (first.actualCostUsd !== contract.local_proof.actual_cost_usd || first.providerSpendCents !== 0) {
    fail("actual provider cost is not zero");
  }
  return first;
}

async function verifySmeCanvasEvidence(contract) {
  const evidenceContract = contract.sme_canvas_evidence;
  const fixturePath = path.resolve(repoRoot, evidenceContract.fixture);
  const artifactPath = path.resolve(repoRoot, evidenceContract.artifact);
  const fixture = await fs.readFile(fixturePath, "utf8");
  const result = runSmeRiskCoverageMarkdown(fixture);
  if (!result.ok) fail(`SME Canvas fixture failed: ${JSON.stringify(result.error)}`);
  const document = buildSmeCanvasEvidence(result.run);
  const artifact = await fs.readFile(artifactPath, "utf8");
  if (artifact !== document.canvasDocumentMarkdown) fail("SME Canvas evidence artifact is stale");
  if (!kgcRoundTripEquivalent(document)) fail("SME Canvas evidence did not round-trip through Kgc_Document");
  if (document.schema !== evidenceContract.kgc_schema || document.proof.invocation !== evidenceContract.invocation) {
    fail("SME Canvas evidence schema or invocation drifted");
  }
  if (document.proof.runtime_status !== "runtime-ready" || document.proof.estimated_cost_usd !== 0 || document.proof.paid_provider_calls !== 0) {
    fail("SME Canvas evidence is not a zero-cost runtime-ready proof");
  }
  if (document.proof.deployment.prodMirrorMutation !== false || document.proof.deployment.cloudflareMutation !== false) {
    fail("SME Canvas evidence crossed the Dev deployment boundary");
  }
  return {
    runId: result.run.runId,
    artifact: evidenceContract.artifact,
    sourceFilesPath: document.proof.source_path,
    schema: document.schema,
    renderer: evidenceContract.renderer,
    nodes: document.flow.nodes.length,
    edges: document.flow.edges.length,
    exposures: document.proof.exposure_count,
    gaps: document.proof.gap_count,
    unknownRisks: document.proof.unknown_risk_count,
    protections: document.proof.protection_count,
    rationales: document.proof.rationale_count,
    paidProviderCalls: document.proof.paid_provider_calls,
    actualCostUsd: document.proof.estimated_cost_usd,
  };
}

async function gitSourceState() {
  const [{ stdout: sha }, { stdout: status }] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoRoot }),
    execFileAsync("git", ["status", "--porcelain=v1"], { cwd: repoRoot }),
  ]);
  const normalizedStatus = status.trim().split("\n").filter(Boolean).sort();
  return {
    commitSha: sha.trim(),
    clean: normalizedStatus.length === 0,
    stateHash: crypto.createHash("sha256").update(normalizedStatus.join("\n")).digest("hex"),
    changedPathCount: normalizedStatus.length,
  };
}

async function main() {
  const contract = await readContract();
  const [docs, source, smeCanvas] = await Promise.all([verifyDocs(contract), gitSourceState(), verifySmeCanvasEvidence(contract)]);
  const runtime = verifyMockRuntime(contract);
  const proof = {
    status: "runtime-ready",
    contractVersion: contract.contract_version,
    invocation: contract.invocation,
    source,
    docs,
    runtime,
    smeCanvas,
  };
  console.log(JSON.stringify(proof, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
