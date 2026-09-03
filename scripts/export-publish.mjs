#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { runExportPublish } from "../mcp/export-publish-runtime.js";
import { sanitizeProviderMessage } from "../mcp/export-provider-http.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowedKinds = new Set(["spreadsheet", "slides"]);
const allowedProviders = new Set(["google", "microsoft"]);

export const EXPORT_PUBLISH_USAGE = `Usage:
  npm run export:publish -- --artifact <repo-relative.md> --kind <spreadsheet|slides> [options]

Options:
  --provider <google|microsoft>  Select one provider. Google with configured
                                 Microsoft fallback is used when omitted.
  --json                         Emit the complete machine-readable receipt.
  --help                         Show this help text.`;

const optionValue = (argv, index, label) => {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${label} requires a value.`);
  return value;
};

export function parseExportPublishArgs(argv) {
  const options = { artifact: "", kind: "", provider: "", json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (argument === "--artifact") {
      options.artifact = optionValue(argv, index, argument);
      index += 1;
      continue;
    }
    if (argument === "--kind") {
      options.kind = optionValue(argv, index, argument);
      index += 1;
      continue;
    }
    if (argument === "--provider") {
      options.provider = optionValue(argv, index, argument);
      index += 1;
      continue;
    }
    throw new Error(`Unsupported argument: ${argument}.`);
  }
  if (options.help) return Object.freeze(options);
  if (!options.artifact) throw new Error("--artifact is required.");
  if (!allowedKinds.has(options.kind)) {
    throw new Error("--kind must be spreadsheet or slides.");
  }
  if (options.provider && !allowedProviders.has(options.provider)) {
    throw new Error("--provider must be google or microsoft.");
  }
  return Object.freeze(options);
}

const safeErrorMessage = (error) => sanitizeProviderMessage(
  error instanceof Error ? error.message : error,
  "Export publication failed",
);

export function formatExportCliFailure(error) {
  return {
    schema: "agentic-graph-export-cli-error/v1",
    status: "failed",
    error: {
      code: String(error?.code || "EXPORT_CLI_FAILED").slice(0, 128),
      message: safeErrorMessage(error),
      ...(error?.provider ? { provider: String(error.provider).slice(0, 64) } : {}),
    },
  };
}

export async function runExportPublishCli(argv, dependencies = {}) {
  const options = parseExportPublishArgs(argv);
  const io = dependencies.io ?? console;
  if (options.help) {
    io.log(EXPORT_PUBLISH_USAGE);
    return Object.freeze({ exitCode: 0, result: null });
  }
  const publish = dependencies.publish ?? runExportPublish;
  const input = {
    artifact_id: options.artifact,
    kind: options.kind,
    ...(options.provider ? { target_provider: options.provider } : {}),
  };
  const result = await publish(input, { repoRoot: dependencies.repoRoot ?? repoRoot });
  if (options.json) {
    io.log(JSON.stringify(result));
  } else {
    io.log(`Published ${result.kind} to ${result.provider}: ${result.url}`);
    io.log(`Document ID: ${result.doc_id}`);
  }
  return Object.freeze({ exitCode: 0, result });
}

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  runExportPublishCli(process.argv.slice(2)).then(({ exitCode }) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    console.error(JSON.stringify(formatExportCliFailure(error)));
    process.exitCode = error?.code === "PROVIDER_NOT_CONFIGURED" ? 2 : 1;
  });
}
