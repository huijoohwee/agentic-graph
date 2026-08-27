import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateCostLog } from "../../contracts/cost-log.schema.js";
import { SME_PROFILE_SCHEMA_ID, printSmeProfileMarkdown } from "../../contracts/sme-profile.schema.js";
import { validateSmeRiskRun } from "../../contracts/sme-risk-coverage.schema.js";
import { kgcRoundTripEquivalent } from "../../contracts/kgc-document.schema.js";
import { resolveAgentDefinition } from "../../contracts/agent-runtime.schema.js";
import {
  SME_ACTION_GATE_IDS,
  buildSmeSourceFiles,
  gateSmeAction,
  runSmeRiskCoverageMarkdown,
} from "../sme-risk-coverage/core.js";
import { writeSmeSourceFilesAtomically } from "../sme-risk-coverage/local-source-files.js";
import { runLocalAgentRuntime } from "../local-agent-runtime.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const fixture = (overrides = {}) => ({
  schema: SME_PROFILE_SCHEMA_ID,
  profile_id: "synthetic-logistics-01",
  industry: "logistics",
  size: 48,
  growth_stage: "growth",
  assets: ["warehouse equipment"],
  digital_footprint: "online booking portal and staff email",
  suppliers: ["packaging supplier", "fleet maintenance supplier"],
  declared_coverage: [{ category: "asset_physical", scope: "limited" }],
  ...overrides,
});

test("the SME kernel produces ranked, explained, provider-neutral guidance at zero spend", () => {
  const document = printSmeProfileMarkdown(fixture());
  const result = runSmeRiskCoverageMarkdown(document.markdown);
  assert.equal(result.ok, true);
  assert.equal(validateSmeRiskRun(result.run).valid, true);
  assert.deepEqual(new Set(result.run.exposureProfile.exposures.map((item) => item.domain)), new Set(["cyber", "supply_chain", "asset_physical"]));
  assert.equal(result.run.rationales.length, result.run.gaps.length + result.run.unknownRisks.length + result.run.protections.length);
  assert.ok(result.run.costLogs.every((entry) => validateCostLog(entry).valid && entry.estimated_cost_usd === 0));
  assert.equal(result.run.deployment.cloudflareMutation, false);
});

test("synthetic fixtures cover every growth stage without real-person data", async () => {
  const names = ["pre-seed", "early", "growth", "established"];
  const stages = [];
  for (const name of names) {
    const markdown = await fs.readFile(path.join(repoRoot, "sme-agent", "fixtures", `${name}.md`), "utf8");
    const result = runSmeRiskCoverageMarkdown(markdown);
    assert.equal(result.ok, true, name);
    stages.push(result.run.profile.growth_stage);
  }
  assert.deepEqual(stages, ["pre_seed", "early", "growth", "established"]);
});

test("Source Files persist under the required paths as one atomic batch", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-sme-"));
  try {
    const result = runSmeRiskCoverageMarkdown(printSmeProfileMarkdown(fixture()).markdown);
    const artifacts = buildSmeSourceFiles(result.run);
    const written = await writeSmeSourceFilesAtomically(root, artifacts);
    assert.equal(written.count, 7);
    assert.ok(written.paths.includes("sme-agent/profiles/synthetic-logistics-01/profile.md"));
    assert.ok(written.paths.includes(`sme-agent/runs/${result.run.runId}/exposures.md`));
    const canvasPath = `sme-agent/runs/${result.run.runId}/canvas-evidence.md`;
    assert.ok(written.paths.includes(canvasPath));
    const canvasDocumentMarkdown = await fs.readFile(path.join(root, canvasPath), "utf8");
    assert.equal(kgcRoundTripEquivalent({ canvasDocumentMarkdown }), true);
    assert.match(canvasDocumentMarkdown, /kgCanvas2dRenderer: "storyboard"/);
    assert.match(canvasDocumentMarkdown, /invocation":"\/sme-care-agent"/);
    await Promise.all(written.paths.map((relativePath) => fs.access(path.join(root, relativePath))));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("a Source Files write failure rolls back the whole batch", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-sme-rollback-"));
  try {
    const result = runSmeRiskCoverageMarkdown(printSmeProfileMarkdown(fixture()).markdown);
    const artifacts = buildSmeSourceFiles(result.run);
    let renames = 0;
    const fsApi = {
      ...fs,
      rename: async (...args) => {
        renames += 1;
        if (renames === 2) throw Object.assign(new Error("injected write failure"), { code: "EIO" });
        return fs.rename(...args);
      },
    };
    await assert.rejects(writeSmeSourceFilesAtomically(root, artifacts, { fsApi }), /injected write failure/);
    for (const relativePath of Object.keys(artifacts)) {
      await assert.rejects(fs.access(path.join(root, relativePath)), { code: "ENOENT" });
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("binding and third-party actions remain blocked without exact unexpired approval", () => {
  for (const action of ["purchase", "bind", "apply", "contact_third_party", "paid_model_call"]) {
    const result = gateSmeAction(action, null);
    assert.equal(result.status, "blocked");
    assert.equal(result.mutationPerformed, false);
    assert.equal(result.costLog.estimated_cost_usd, 0);
  }
  const now = Date.UTC(2026, 6, 14, 6, 0, 0);
  const token = { gateId: SME_ACTION_GATE_IDS.bind, issuedAt: now, consumed: false, verified: true, tokenId: "synthetic-bind-approval" };
  assert.equal(gateSmeAction("bind", token, now).status, "approved");
  assert.equal(token.consumed, true);
  assert.equal(gateSmeAction("bind", token, now).reason, "consumed");
});

test("public identity remains /sme-care-agent while spec metadata is internal", () => {
  const definition = resolveAgentDefinition("/sme-care-agent");
  assert.equal(definition.skillVariant, "agent.sme");
  assert.equal(definition.skillId, "sme.risk.profile");
  assert.equal(definition.runtimeKernel, "sme.risk.profile");
  assert.equal(resolveAgentDefinition("/sme-agent"), null);
});

test("/sme-care-agent invokes the specialized kernel through the shared local runtime", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-sme-local-"));
  try {
    const inputPath = path.join(root, "profile.md");
    const outputDir = path.join(root, "output");
    await fs.writeFile(inputPath, printSmeProfileMarkdown(fixture()).markdown, "utf8");
    const result = await runLocalAgentRuntime({
      invocation: "/sme-care-agent",
      inputPath,
      outputDir,
      mode: "live",
      runId: "sme-care-demo-01",
    }, {
      rootDir: root,
      pythonBin: "python3",
      resolvePath: (candidate) => path.resolve(candidate),
      runCommand: async () => { throw new Error("generic Python harness must not run"); },
      summarizeArtifacts: async () => [],
      formatCommand: () => "",
      truncate: (value) => value,
      jsonToolResult: (payload, isError = false) => ({ structuredContent: payload, isError }),
    });
    assert.equal(result.isError, false);
    assert.equal(result.structuredContent.status, "completed");
    assert.equal(result.structuredContent.runId, "sme-care-demo-01");
    assert.equal(result.structuredContent.invocation, "/sme-care-agent");
    assert.equal(result.structuredContent.result.persistence.status, "persisted");
    assert.equal(result.structuredContent.budgetMeters.paidProviderCalls, 0);
    await fs.access(path.join(outputDir, "sme-agent", "profiles", fixture().profile_id, "profile.md"));

    await fs.writeFile(inputPath, printSmeProfileMarkdown(fixture({ growth_stage: "established", size: 80 })).markdown, "utf8");
    const changed = await runLocalAgentRuntime({ invocation: "/sme-care-agent", inputPath, outputDir, mode: "live", runId: "sme-care-demo-02" }, {
      rootDir: root,
      pythonBin: "python3",
      resolvePath: (candidate) => path.resolve(candidate),
      runCommand: async () => { throw new Error("generic Python harness must not run"); },
      summarizeArtifacts: async () => [],
      formatCommand: () => "",
      truncate: (value) => value,
      jsonToolResult: (payload, isError = false) => ({ structuredContent: payload, isError }),
    });
    assert.equal(changed.isError, false);
    assert.equal(changed.structuredContent.runId, "sme-care-demo-02");
    assert.equal(changed.structuredContent.result.delta.reason, "growth_stage_or_size_changed");
    assert.equal(changed.structuredContent.result.delta.changed, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
