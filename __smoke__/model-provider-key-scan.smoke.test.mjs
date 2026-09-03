// STATIC-SCAN SMOKE — no model provider keys in the Cloudflare McpAgent control
// plane (agentic-graph-acos-mcp-connector spec, task 9.3 / R11.1, R11.3, R11.5 /
// design Tech Stack "Hard boundary rule (R11.1-11.5)": the McpAgent tool surface
// never holds model keys; all model calls route through the Cloudflare AI
// Gateway control plane).
//
// WHAT THIS ASSERTS (pure logic + filesystem reads, ZERO live network):
//   1. For EACH Cloudflare control-plane tier root (the agentic-graph-mcp Worker and
//      the mcp/ Director runtime it reuses) the composed scan finds ZERO
//      model-provider keys — covering inlined key SHAPES (sk-/sk_live_/AIza/
//      ark-...) AND model-provider-key ENV-NAME references (OPENAI_API_KEY,
//      ANTHROPIC_API_KEY, GEMINI/GOOGLE, REPLICATE, FAL, ELEVENLABS, ...).
//   2. The scan is MEANINGFUL — it is NOT vacuously passing: a PLANTED key of
//      every named provider is caught by the detectors, and at least one real
//      source file is scanned per present tier.
//
// REUSE-NOT-REBUILD: the detectors come from the Cloudflare AI Gateway client
// scanner (`web/src/lib/ai-gateway.js`); this suite only wires them across the
// Cloudflare control-plane tier roots.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  listSourceFiles,
  scanSourceTreeForModelKeys,
  findModelProviderKeyLiterals,
} from "../web/src/lib/ai-gateway.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Repo root: `agentic-graph/` (this file lives at `agentic-graph/__smoke__`). */
const REPO_ROOT = path.resolve(HERE, "..");

/**
 * Cloudflare control-plane tier roots that MUST hold no model provider keys:
 * the agentic-graph-mcp Worker and the mcp/ Director runtime it reuses. Model keys
 * live in the AI Gateway / worker config and are reached via bindings (R11.5).
 */
const MODEL_KEY_SCAN_TIERS = Object.freeze([
  {
    label: "McpAgent worker (cloudflare/workers/agentic-graph-mcp)",
    root: path.join(REPO_ROOT, "cloudflare", "workers", "agentic-graph-mcp"),
  },
  { label: "McpAgent runtime (mcp/)", root: path.join(REPO_ROOT, "mcp") },
]);

/** Directories never walked (deps, VCS, build caches, AND test/harness dirs). */
const EXCLUDED_DIRS = Object.freeze([
  "node_modules", ".git", ".wrangler", "dist", "build", "coverage",
  ".next", "out", ".turbo", ".cache",
  "__tests__", "__pbt__", "__smoke__",
]);

/**
 * Model-provider-key ENV-NAME tokens. R11.1 forbids the McpAgent tiers from
 * storing OR REFERENCING model provider keys: every model call routes through
 * the Cloudflare AI Gateway, so a provider key env name has no business
 * appearing in their source at all.
 */
const MODEL_PROVIDER_KEY_ENV_NAMES = Object.freeze([
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_GENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "REPLICATE_API_TOKEN",
  "REPLICATE_API_KEY",
  "FAL_KEY",
  "FAL_API_KEY",
  "ELEVENLABS_API_KEY",
  "ELEVEN_API_KEY",
  "XI_API_KEY",
  "DEEPSEEK_API_KEY",
  "MISTRAL_API_KEY",
  "COHERE_API_KEY",
  "GROQ_API_KEY",
  "TOGETHER_API_KEY",
  "PERPLEXITY_API_KEY",
  "ARK_API_KEY",
  "BYTEPLUS_API_KEY",
  "VOLC_API_KEY",
]);

/** Find model-provider-key ENV-NAME tokens in source text. */
function findModelProviderKeyEnvNames(sourceText) {
  if (typeof sourceText !== "string" || sourceText.length === 0) return [];
  const findings = [];
  for (const name of MODEL_PROVIDER_KEY_ENV_NAMES) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, "g");
    let m;
    while ((m = re.exec(sourceText)) !== null) findings.push({ name, index: m.index });
  }
  return findings;
}

function scanTier(tier) {
  const scanOpts = { excludeDirs: EXCLUDED_DIRS };
  const keyShapes = scanSourceTreeForModelKeys(tier.root, scanOpts);
  const files = listSourceFiles(tier.root, scanOpts);
  const envFindings = [];
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const f of findModelProviderKeyEnvNames(text)) envFindings.push({ file, name: f.name });
  }
  const findings = [
    ...keyShapes.findings.map((f) => ({ file: f.file, detail: `model-key-shape:${f.kind}` })),
    ...envFindings.map((f) => ({ file: f.file, detail: `model-key-env-name:${f.name}` })),
  ];
  return { label: tier.label, scanned: keyShapes.scanned, fileCount: keyShapes.files.length, findings };
}

// --- 1. Each Cloudflare control-plane tier holds NO model provider keys ------

for (const tier of MODEL_KEY_SCAN_TIERS) {
  test(`no model provider keys in tier: ${tier.label} (R11.1/R11.3/R11.5)`, () => {
    const report = scanTier(tier);
    assert.equal(report.scanned, true, `${tier.label} must be present and scanned`);
    assert.ok(report.fileCount > 0, `${tier.label} must scan at least one source file`);
    assert.deepEqual(
      report.findings,
      [],
      `${tier.label} must hold no model provider key; found: ${JSON.stringify(report.findings, null, 2)}`,
    );
  });
}

// --- 2. The scan is MEANINGFUL (catches a planted key per named provider) ----

test("detector catches a PLANTED inlined key for every named provider shape", () => {
  const plantedShapes = [
    'const a = "sk-ABCDEF0123456789ABCDEF0123456789";',          // OpenAI/Anthropic
    'const b = "sk-ant-api03-ABCDEF0123456789ABCDEF0123456789";', // Anthropic
    'const c = "AIzaABCDEF0123456789ABCDEF0123456789-xyz";',      // Gemini/Google
  ].join("\n");
  const kinds = new Set(findModelProviderKeyLiterals(plantedShapes).map((h) => h.kind));
  assert.ok(kinds.has("openai/anthropic-sk"), "OpenAI/Anthropic key shape caught");
  assert.ok(kinds.has("google-aistudio"), "Gemini/Google key shape caught");
});

test("detector catches a PLANTED model-provider-key ENV-NAME reference", () => {
  for (const name of MODEL_PROVIDER_KEY_ENV_NAMES) {
    const planted = `const v = process.env.${name};`;
    const hits = findModelProviderKeyEnvNames(planted).map((h) => h.name);
    assert.ok(hits.includes(name), `env name ${name} must be caught when present`);
  }
});

test("env-name detector does NOT flag unrelated identifiers (no false positives)", () => {
  const clean = [
    "const AI_GATEWAY_ID = process.env.AI_GATEWAY_ID;",
    "const MY_OPENAI_API_KEYRING = 1;", // longer identifier, not the exact token
    "const COgroq = 2;",
  ].join("\n");
  assert.deepEqual(findModelProviderKeyEnvNames(clean), []);
});
