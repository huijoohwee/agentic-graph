import { resolve } from "node:path";

function cleanString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function requireEnv(env, name) {
  const value = cleanString(env?.[name]);
  if (!value) throw new Error(`hosted submission flow requires ${name}`);
  return value;
}

function optionalEnv(env, name, fallback = "") {
  return cleanString(env?.[name]) || fallback;
}

export function resolveHostedSubmissionFlowConfig(env = process.env) {
  const outputDir = resolve(optionalEnv(env, "ARTIFACTS_DIR", "./artifacts"));
  return Object.freeze({
    frontendUrl:    requireEnv(env, "FRONTEND_URL"),
    mcpEndpoint:    optionalEnv(env, "MCP_ENDPOINT", "https://airvio.co/agenticgraph/control-plane/mcp"),
    referenceUrl:   optionalEnv(env, "REFERENCE_URL", "https://example.com/reference-video.mp4"),
    brief:          optionalEnv(env, "BRIEF", "Hosted proof run: blocked path plus same-session persisted read-back."),
    budgetUsd:      optionalEnv(env, "BUDGET_USD", "10"),
    submissionTitle: optionalEnv(env, "SUBMISSION_TITLE", "AgenticGraph Hackathon Submission Brief"),
    outputDir,
    proofOutputPath:            resolve(outputDir, "runtime-proof.json"),
    demoPackOutputPath:         resolve(outputDir, "runtime-demo-pack.json"),
    submissionBriefOutputPath:  resolve(outputDir, "runtime-submission-brief.md"),
    submissionBundleDir:        resolve(outputDir, "submission-bundle"),
  });
}

export function buildHostedSubmissionFlowSteps(config) {
  return [
    {
      id: "verify",
      label: "Verify deployed runtime reachability",
      script: "./scripts/verify-deployed-runtime.mjs",
      env: {
        FRONTEND_URL:  config.frontendUrl,
        MCP_ENDPOINT:  config.mcpEndpoint,
      },
    },
    {
      id: "proof",
      label: "Capture hosted runtime proof",
      script: "./scripts/capture-runtime-proof.mjs",
      env: {
        FRONTEND_URL:  config.frontendUrl,
        MCP_ENDPOINT:  config.mcpEndpoint,
        REFERENCE_URL: config.referenceUrl,
        BRIEF:         config.brief,
        BUDGET_USD:    config.budgetUsd,
        PROOF_OUTPUT_PATH: config.proofOutputPath,
      },
    },
    {
      id: "demo-pack",
      label: "Build Demo_Pack artifact from proof",
      script: "./scripts/build-demo-pack-from-proof.mjs",
      args: [config.proofOutputPath],
      env: {
        PROOF_INPUT_PATH:       config.proofOutputPath,
        DEMO_PACK_OUTPUT_PATH:  config.demoPackOutputPath,
        FRONTEND_URL:           config.frontendUrl,
        MCP_ENDPOINT:           config.mcpEndpoint,
      },
    },
    {
      id: "submission-brief",
      label: "Export markdown submission brief",
      script: "./scripts/export-submission-brief.mjs",
      args: [config.demoPackOutputPath],
      env: {
        DEMO_PACK_INPUT_PATH:           config.demoPackOutputPath,
        SUBMISSION_BRIEF_OUTPUT_PATH:   config.submissionBriefOutputPath,
        SUBMISSION_TITLE:               config.submissionTitle,
      },
    },
    {
      id: "bundle",
      label: "Assemble final submission bundle",
      script: "./scripts/package-submission-bundle.mjs",
      args: [config.proofOutputPath, config.demoPackOutputPath, config.submissionBriefOutputPath],
      env: {
        PROOF_INPUT_PATH:               config.proofOutputPath,
        DEMO_PACK_INPUT_PATH:           config.demoPackOutputPath,
        SUBMISSION_BRIEF_INPUT_PATH:    config.submissionBriefOutputPath,
        SUBMISSION_BUNDLE_DIR:          config.submissionBundleDir,
      },
    },
  ];
}
