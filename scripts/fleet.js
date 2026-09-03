#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

export {
  FLEET_LEDGER_ENV,
  FLEET_LEDGER_SCHEMA,
  appendFleetExportEntry,
  findLatestSuccessfulExport,
  findLatestSuccessfulExportInEntries,
  readFleetLedger,
  resolveFleetLedgerPath,
  verifyFleetLedger,
} from "../mcp/export-ledger.js";

import { verifyFleetLedger } from "../mcp/export-ledger.js";

const usage = `Usage:
  node scripts/fleet.js verify [--path <ledger-path>]
  node scripts/fleet.js list [--path <ledger-path>] [--json]

The default ledger is FLEET.md. Set AGENTIC_OS_EXPORT_FLEET_PATH or --path to
verify an isolated runtime-proof ledger without writing provider identifiers to git.`;

function parseCliArgs(argv) {
  const [command = "help", ...rest] = argv;
  const options = { command, json: false, ledgerPath: undefined };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (argument === "--path") {
      const value = rest[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--path requires a value.");
      options.ledgerPath = value;
      index += 1;
      continue;
    }
    throw new Error(`Unsupported argument: ${argument}`);
  }
  return options;
}

function listRows(entries) {
  if (entries.length === 0) return "No export entries.";
  return entries.map((entry) => [
    String(entry.sequence).padStart(4),
    entry.timestamp,
    entry.status.padEnd(7),
    entry.provider.padEnd(9),
    entry.kind.padEnd(11),
    entry.artifact_id,
  ].join("  ")).join("\n");
}

export async function runFleetCli(argv = process.argv.slice(2), io = console) {
  const options = parseCliArgs(argv);
  if (options.command === "help" || options.command === "--help" || options.command === "-h") {
    io.log(usage);
    return 0;
  }
  if (options.command !== "verify" && options.command !== "list") {
    throw new Error(`Unsupported command: ${options.command}.\n${usage}`);
  }
  const ledger = await verifyFleetLedger({ ledgerPath: options.ledgerPath });
  if (options.command === "verify") {
    io.log(`Fleet ledger valid: ${ledger.entry_count} entries; head ${ledger.head_hash}`);
    return 0;
  }
  if (options.json) {
    io.log(JSON.stringify(ledger.entries, null, 2));
  } else {
    io.log(listRows(ledger.entries));
  }
  return 0;
}

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  runFleetCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
