#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  VOICE_STUDIO_INPUT_SCHEMA,
  VOICE_STUDIO_INVOCATIONS,
  VOICE_STUDIO_OPERATIONS,
  VOICE_STUDIO_OUTPUT_SCHEMA,
  VOICE_STUDIO_REQUEST_SCHEMA_VERSION,
  VOICE_STUDIO_RESULT_SCHEMA_VERSION,
  VOICE_STUDIO_TOOL_NAME,
  voiceStudioRequestDigest,
} from "../contracts/voice-studio.schema.js";
import { buildKnowgrphLocalMcpToolDefinitions } from "../mcp/local-tool-contract.js";
import { readRuntimeReadinessContract } from "./runtime-readiness-contract.mjs";

const root = process.cwd();
const failures = [];
const fail = (message) => failures.push(message);
const read = (relativePath) => fs.readFile(path.join(root, relativePath), "utf8");
const includesEvery = (source, tokens) => tokens.every(token => source.includes(token));
const sameArray = (left, right) =>
  left.length === right.length && left.every((value, index) => value === right[index]);
const requireSourceEvidence = (source, label, requirements) => {
  for (const [name, pattern] of requirements) {
    if (!pattern.test(source)) fail(`${label} missing ${name} evidence`);
  }
};
const ACOS_DOCS_REVISION = "a1324ee9149d49ebffe65cbb28b2e4464d6baeda";
const VOICEBOX_REVIEWED_REVISION = "52f8d8dd387e4049c81ee97079d5f54e2e399b94";
const requiredPaths = [
  "contracts/voice-studio.schema.js",
  "contracts/__tests__/voice-studio.schema.test.mjs",
  "mcp/voice-studio-tool-contract.js",
  "mcp/voice-studio-runtime.js",
  "mcp/voice-studio-runtime-evidence.js",
  "mcp/__tests__/voice-studio-runtime.test.mjs",
  "mcp/__tests__/voice-studio-cost-policy.test.mjs",
  "mcp/__tests__/voice-studio-stdio-e2e.test.mjs",
  "canvas/src/features/voice-studio/voiceStudioContract.ts",
  "canvas/src/features/voice-studio/voiceStudioBrowserRuntime.ts",
  "canvas/src/features/voice-studio/voiceStudioInvocation.ts",
  "canvas/src/features/voice-studio/VoiceStudioPanel.tsx",
  "canvas/src/__tests__/voiceStudioPanelLifecycle.test.tsx",
  "canvas/src/__tests__/voiceStudioRuntime.test.ts",
  "docs/documents/knowgrph-ai-voice-studio-prd-tad.md",
];

for (const relativePath of requiredPaths) {
  const source = await read(relativePath).catch(() => "");
  if (!source) fail(`missing ${relativePath}`);
  if (source.split(/\r?\n/).length > 600) fail(`${relativePath} exceeds 600 lines`);
}

const packageSources = await Promise.all(
  ["package.json", "package-lock.json", "canvas/package.json", "mcp/package.json"]
    .map(relativePath => read(relativePath)),
);
if (packageSources.some(source => /["/]voicebox(?:["/@]|$)/i.test(source))) fail("Voicebox must not be a package, workspace, script, or dependency");

const implementationPaths = requiredPaths.filter(relativePath => !relativePath.startsWith("docs/"));
const implementationSources = await Promise.all(implementationPaths.map(relativePath => read(relativePath)));
if (implementationSources.some(source => /(?:from\s+|import\s*\(|require\s*\()\s*["'][^"']*voicebox/i.test(source))) {
  fail("Voice Studio implementation must not import Voicebox");
}
if (implementationSources.some(source => /github\.com\/jamiepine|docs\.voicebox\.sh/i.test(source))) {
  fail("Voice Studio implementation must not contain a Voicebox runtime or source reference");
}

const prd = await read("docs/documents/knowgrph-ai-voice-studio-prd-tad.md");
const prdNormalized = prd.replace(/\s+/g, " ");
for (const required of [
  `https://github.com/jamiepine/voicebox/tree/${VOICEBOX_REVIEWED_REVISION}`,
  "https://docs.voicebox.sh/overview/voice-cloning",
  "https://docs.voicebox.sh/overview/dictation",
  "Manual clean-room review",
  "no identical contiguous 12-token window",
  "not an automated similarity detector",
  "FORBIDDEN reuse",
  "runtime-ready-dev",
  "provider-unconfigured",
]) {
  if (!prdNormalized.includes(required)) fail(`PRD/TAD missing clean-room proof token: ${required}`);
}
if (/github\.com\/jamiepine\/voicebox\/blob\/main\//i.test(prd)) {
  fail("PRD/TAD Voicebox blob links must use the reviewed immutable revision");
}
for (const reviewedUrl of [
  `https://github.com/jamiepine/voicebox/blob/${VOICEBOX_REVIEWED_REVISION}/RESPONSIBLE_USE.md`,
  `https://github.com/jamiepine/voicebox/blob/${VOICEBOX_REVIEWED_REVISION}/LICENSE`,
]) {
  if (!prd.includes(reviewedUrl)) fail(`PRD/TAD missing revision-qualified reference: ${reviewedUrl}`);
}

const definitions = buildKnowgrphLocalMcpToolDefinitions().filter(tool => tool.name === VOICE_STUDIO_TOOL_NAME);
if (definitions.length !== 1) fail(`expected exactly one ${VOICE_STUDIO_TOOL_NAME} definition`);
const definition = definitions[0];
const operationBranches = definition?.inputSchema?.oneOf || [];
if (definition?.inputSchema !== VOICE_STUDIO_INPUT_SCHEMA
  || definition?.outputSchema !== VOICE_STUDIO_OUTPUT_SCHEMA
  || !includesEvery(definition?.description || "", [
    "source-resolution",
    "output read-back",
    "provider-unconfigured",
  ])
  || definition?.outputSchema?.additionalProperties !== false
  || operationBranches.length !== 3
  || operationBranches.some(branch => branch.additionalProperties !== false)
  || !sameArray(operationBranches.map(branch => branch.properties?.operation?.const), VOICE_STUDIO_OPERATIONS)) {
  fail("voice studio must expose one closed three-operation input/output facade");
}
const routes = Object.values(VOICE_STUDIO_INVOCATIONS).map(route => route.text);
const browserContract = await read("canvas/src/features/voice-studio/voiceStudioContract.ts");
const browserRoutes = [...browserContract.matchAll(/\btext:\s*'([^']+)'/g)].map(match => match[1]);
if (!sameArray(Object.keys(VOICE_STUDIO_INVOCATIONS), VOICE_STUDIO_OPERATIONS)
  || new Set(routes).size !== 3
  || !sameArray(browserRoutes, routes)) {
  fail("shared and browser voice contracts must contain the same three exact ordered routes");
}
const browserTests = await read("canvas/src/__tests__/voiceStudioRuntime.test.ts");
if (!includesEvery(browserTests, [
  "for (const route of Object.values(VOICE_STUDIO_ROUTES))",
  "parseVoiceStudioInvocation(route.text)",
  "/voice.studio #text-to-speech @audio @text @voice-profile @approval-gate @cost-log @runtime-proof",
])) {
  fail("browser parser tests must own execution-order proof and reject a reordered route");
}
const browserLifecycleTests = await read("canvas/src/__tests__/voiceStudioPanelLifecycle.test.tsx");
requireSourceEvidence(browserLifecycleTests, "browser lifecycle tests", [
  ["recording-rights fail-before-capture", /RequiresRecordingEvidence/],
  ["recognition off by default", /recognitionApproval\.checked,\s*false/],
  ["recognition opt-in start", /MockVoiceSpeechRecognition\.startCalls,\s*1/],
  ["workflow-switch recorder teardown", /recorder\.stopCalls,\s*1/],
  ["workflow-switch track teardown", /track\.stopCalls,\s*1/],
  ["single-stop unmount behavior", /must not stop the recorder twice/],
  ["late recorder callback fence", /detached recorder callback must not create a capture URL/],
  ["capture URL creation", /objectUrls/],
  ["capture URL revocation", /revokedObjectUrls/],
  ["recognition opt-out teardown", /recognition\?\.onresult,\s*null/],
  ["late recognition callback fence", /late private transcript/],
]);

const digest = voiceStudioRequestDigest({ boundary: "voice-studio-readiness" });
const requestDigestPattern = VOICE_STUDIO_OUTPUT_SCHEMA.properties?.proof?.properties?.requestDigest?.pattern;
const artifactDigestPattern = VOICE_STUDIO_OUTPUT_SCHEMA.properties?.artifacts?.items?.properties?.sha256?.pattern;
if (VOICE_STUDIO_REQUEST_SCHEMA_VERSION !== "knowgrph-voice-studio-request/v1"
  || VOICE_STUDIO_RESULT_SCHEMA_VERSION !== "knowgrph-voice-studio-result/v1"
  || !/^[a-f0-9]{64}$/.test(digest)
  || requestDigestPattern !== "^[a-f0-9]{64}$"
  || artifactDigestPattern !== "^[a-f0-9]{64}$") {
  fail("voice studio schema and proof must use exact v1 tokens and full 64-hex SHA-256 identities");
}

const runtimeSource = await read("mcp/voice-studio-runtime.js");
const evidenceSource = await read("mcp/voice-studio-runtime-evidence.js");
const runtimeTests = await read("mcp/__tests__/voice-studio-runtime.test.mjs");
const costPolicyTests = await read("mcp/__tests__/voice-studio-cost-policy.test.mjs");
const stdioTests = await read("mcp/__tests__/voice-studio-stdio-e2e.test.mjs");
requireSourceEvidence(`${runtimeSource}\n${evidenceSource}`, "MCP runtime", [
  ["cryptographic SHA-256", /crypto\.createHash\(["']sha256["']\)/],
  ["atomic in-flight idempotency", /in[- ]?flight/i],
  ["host-owned source resolver", /resolveSourceArtifact/],
  ["host-owned output read-back verifier", /verifyOutputArtifact/],
  ["post-dispatch reconciliation", /reconciliationRequired/],
  ["incomplete cost", /incomplete:\s*true/],
  ["single adapter attempt", /adapterAttempts/],
  ["zero-spend adapter estimate", /verifyAdapterEstimate/],
  ["independent cost evidence", /verifyCostEvidence/],
  ["pre-dispatch cost policy", /costExceedsPolicy/],
  ["settled cost policy", /settledCostExceedsPolicy/],
  ["cost estimate proof", /costEstimateVerified/],
  ["cost evidence proof", /costEvidenceVerified/],
]);
requireSourceEvidence(runtimeTests, "MCP runtime tests", [
  ["concurrent identical-call fencing", /concurr/i],
  ["changed-request idempotency conflict", /idempotency[_ -]conflict/i],
  ["source resolver mismatch rejection", /source resolution|source resolver|source artifact/i],
  ["read-back mismatch rejection", /read-back|read back|output verifier/i],
  ["revoked or expired rights rejection", /revoked[\s\S]*expired|expired[\s\S]*revoked/i],
  ["mid-dispatch reconciliation", /(?:mid[- ]?dispatch|after-dispatch)[\s\S]*reconciliationRequired/i],
  ["incomplete post-dispatch cost", /cost\.incomplete,\s*true/],
  ["injected clone, dictate, and create", /all operations[\s\S]*cloneInput[\s\S]*dictateInput[\s\S]*createInput/i],
]);
requireSourceEvidence(stdioTests, "canonical stdio tests", [
  ["one listed voice tool", /listTools[\s\S]*voiceStudio/],
  ["provider-unconfigured live failure", /approval_verifier_unavailable/],
  ["pre-egress fail-closed proof", /externalCallAttempted,\s*false/],
]);
requireSourceEvidence(costPolicyTests, "MCP cost policy tests", [
  ["over-estimate pre-dispatch block", /zero-spend estimate blocks over-budget execution before dispatch/],
  ["exact cap acceptance", /exact cost cap completes/],
  ["settled overage reconciliation", /settled overage[\s\S]*reconciliation-required/],
  ["overage replay fence", /replay-safe/],
]);

const panelSource = await read("canvas/src/features/voice-studio/VoiceStudioPanel.tsx");
const browserRuntimeSource = await read("canvas/src/features/voice-studio/voiceStudioBrowserRuntime.ts");
const browserInvocationSource = await read("canvas/src/features/voice-studio/voiceStudioInvocation.ts");
const voiceBrowserSources = `${browserContract}\n${browserRuntimeSource}\n${browserInvocationSource}\n${panelSource}`;
if (/\b(?:localStorage|sessionStorage|indexedDB)\b/.test(voiceBrowserSources)) {
  fail("voice-specific browser profile state must not use a durable storage registry");
}
requireSourceEvidence(voiceBrowserSources, "browser Voice Studio", [
  ["consent expiry", /expiresAt/],
  ["revocation block", /revoked/],
  ["recording-rights receipt", /recordingRightsReceiptId/],
  ["participant-notice attestation", /participantNoticeAttested/],
  ["capture byte bound", /captureBytes/],
  ["capture duration bound", /captureDurationMs/],
  ["injected-adapter Dev qualification", /injected-adapter Dev/],
  ["provider-unconfigured boundary", /provider unconfigured/],
  ["recognition explicit opt-in", /browserRecognitionApproved\s*\?\s*createSpeechRecognition/],
  ["visible dictation Stop", /data-kg-voice-stop="dictation"/],
  ["visible speech Stop", /data-kg-voice-stop="speech"/],
  ["media-track teardown", /getTracks\(\)\.forEach\(track => track\.stop\(\)\)/],
  ["recognition teardown", /recognition\.stop\(\)/],
  ["timer teardown", /clearTimeout\(captureTimerRef\.current\)/],
  ["speech teardown", /stopBrowserSpeech\(\)/],
  ["object-URL teardown", /URL\.revokeObjectURL/],
]);

const readinessContract = await readRuntimeReadinessContract();
const proofTokens = readinessContract.docs_dependency?.proof_tokens || [];
const routeTokens = [...new Set(routes.flatMap(route => route.split(/\s+/)))];
if (readinessContract.docs_dependency?.ref !== ACOS_DOCS_REVISION
  || !readinessContract.docs_dependency?.required_files?.includes("VOICE-STUDIO.md")
  || routeTokens.some(token => !proofTokens.includes(token))
  || readinessContract.voice_studio_proof?.status !== "runtime-ready-dev"
  || readinessContract.voice_studio_proof?.readiness_scope !== "injected-adapter Dev runtime only"
  || readinessContract.voice_studio_proof?.canonical_stdio_provider_status !== "unconfigured"
  || readinessContract.voice_studio_proof?.provider_backed_cloning_verified !== false
  || readinessContract.voice_studio_proof?.production_ready !== false
  || readinessContract.voice_studio_proof?.cloudflare_ready !== false) {
  fail("runtime readiness must pin the exact Agentic Canvas OS Voice Studio proof and Dev-only provider-unconfigured boundary");
}

const mediaContract = await read("contracts/media-artifact.schema.js");
if (!mediaContract.includes('["text", "image", "audio", "video"]')) fail("media artifact kinds must include audio");
const serverLines = (await read("mcp/server.js")).split(/\r?\n/).length;
if (serverLines > 600) fail(`mcp/server.js exceeds 600 lines (${serverLines})`);

if (failures.length) {
  console.error("[knowgrph] voice studio readiness failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`[knowgrph] voice studio source-readiness passed: ${routes.join(" | ")}; authoritative gate=npm run voice-studio:check; provider=unconfigured; scope=injected-adapter-dev`);
