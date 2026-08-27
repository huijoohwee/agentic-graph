#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const demoPath = path.resolve(root, "..", "huijoohwee", "docs", "agenticgraph-sme-care-agent-demo.md");

const commands = [
  [process.execPath, ["--test", "mcp/__tests__/probe-tree-runtime.test.mjs", "mcp/__tests__/sme-risk-copilot-runtime.test.mjs", "mcp/__pbt__/sme-risk-copilot.pbt.test.mjs", "mcp/__tests__/sme-risk-copilot-stdio-e2e.test.mjs", "mcp/__tests__/sme-risk-coverage-runtime.test.mjs", "mcp/__pbt__/sme-risk-coverage.pbt.test.mjs"]],
  ["npm", ["run", "sme-care-agent:canvas-demo:check"]],
  ["npm", ["-C", "canvas", "run", "test:ci:unit", "--", "docs.riskCopilotDemo.runtimeReady"]],
  ["npm", ["-C", "canvas", "run", "test:ci:unit", "--", "docs.riskCopilotDemo.runReadyMode"]],
  ["npm", ["-C", "canvas", "run", "test:ci:unit", "--", "probeTree.select.frontmatterFlowCanvasSync"]],
  ["npm", ["-C", "canvas", "run", "test:ci:unit", "--", "smeCareAgent.canvasEvidence.runtimeReady"]],
];

const run = ([command, args]) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: root, stdio: "inherit", shell: false });
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`${command} ${args.join(" ")} failed with ${signal || `exit ${code}`}`));
  });
});

const main = async () => {
  const source = await fs.readFile(demoPath, "utf8");
  const expected = [
    'source_path: "../huijoohwee/docs/agenticgraph-sme-care-agent-demo.md"',
    'validation_seed_path: "/agenticgraph-sme-care-agent-demo.md"',
    'validation_commands:',
    '    - "npm run sme-risk-copilot:check"',
  ];
  for (const fragment of expected) {
    if (!source.includes(fragment)) throw new Error(`SME risk-copilot demo contract is missing ${fragment}`);
  }
  for (const command of commands) await run(command);
  console.log(JSON.stringify({ status: "verified", scope: "sme-risk-copilot-dev", paid_call_count: 0, prod_mirror_mutated: false, cloudflare_deploy_mutated: false }));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
