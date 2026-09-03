import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  FLEET_LEDGER_GENESIS_HASH,
  FLEET_LEDGER_TEMPLATE,
  acquireFleetLedgerLock,
  appendFleetExportEntry,
  findLatestSuccessfulExport,
  parseAndVerifyFleetLedger,
  readFleetLedger,
  resolveFleetLedgerLockRoot,
  resolveFleetLedgerPath,
} from "../export-ledger.js";
import { runFleetCli } from "../../scripts/fleet.js";

const sourceSha = "b".repeat(64);
const identity = { artifact_id: "docs/model.md", provider: "google", kind: "spreadsheet" };
const execFileAsync = promisify(execFile);

const withTempLedger = async (callback) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-export-ledger-"));
  const ledgerPath = path.join(directory, "FLEET.md");
  try {
    return await callback({ directory, ledgerPath });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
};

const successEntry = (overrides = {}) => ({
  ...identity,
  status: "success",
  fallback_used: false,
  source_sha256: sourceSha,
  api_calls: 2,
  estimated_cost_usd: 0,
  doc_id: "sheet-123",
  url: "https://docs.google.com/spreadsheets/d/sheet-123/edit",
  ...overrides,
});

test("empty Fleet ledger verifies from the repository-owned Markdown template", () => {
  const verified = parseAndVerifyFleetLedger(FLEET_LEDGER_TEMPLATE);
  assert.equal(verified.entry_count, 0);
  assert.equal(verified.head_hash, FLEET_LEDGER_GENESIS_HASH);
});

test("ledger appends a hash chain and returns the latest success for the exact identity", async () => {
  await withTempLedger(async ({ ledgerPath }) => {
    const first = await appendFleetExportEntry(successEntry(), {
      ledgerPath,
      timestamp: "2026-07-19T01:00:00.000Z",
    });
    await appendFleetExportEntry({
      ...identity,
      status: "failure",
      fallback_used: false,
      source_sha256: sourceSha,
      api_calls: 1,
      estimated_cost_usd: 0,
      error_code: "EXPORT_FAILED",
    }, { ledgerPath, timestamp: "2026-07-19T01:01:00.000Z" });
    const latest = await appendFleetExportEntry(successEntry({ doc_id: "sheet-123", url: "https://docs.google.com/spreadsheets/d/sheet-123/edit?usp=sharing" }), {
      ledgerPath,
      timestamp: "2026-07-19T01:02:00.000Z",
    });
    const ledger = await readFleetLedger({ ledgerPath });
    assert.equal(ledger.entry_count, 3);
    assert.equal(first.previous_hash, FLEET_LEDGER_GENESIS_HASH);
    assert.equal(ledger.entries[1].previous_hash, first.entry_hash);
    assert.equal(ledger.entries[1].doc_id, undefined);
    assert.equal(ledger.entries[1].url, undefined);
    assert.equal(ledger.head_hash, latest.entry_hash);
    assert.equal((await findLatestSuccessfulExport(identity, { ledgerPath })).sequence, 3);
    assert.equal(await findLatestSuccessfulExport({ ...identity, kind: "slides" }, { ledgerPath }), null);
  });
});

test("ledger serializes concurrent writers through its bounded file lock", async () => {
  await withTempLedger(async ({ ledgerPath }) => {
    const entries = await Promise.all(Array.from({ length: 8 }, (_, index) => appendFleetExportEntry(
      successEntry({ doc_id: `sheet-${index}`, url: `https://example.test/sheet-${index}` }),
      { ledgerPath },
    )));
    const ledger = await readFleetLedger({ ledgerPath });
    assert.equal(entries.length, 8);
    assert.deepEqual(ledger.entries.map((entry) => entry.sequence), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(new Set(ledger.entries.map((entry) => entry.entry_hash)).size, 8);
  });
});

test("ledger lock serializes independent Node processes", async () => {
  await withTempLedger(async ({ ledgerPath }) => {
    const ledgerModuleUrl = new URL("../export-ledger.js", import.meta.url).href;
    const processes = Array.from({ length: 4 }, (_, index) => {
      const input = successEntry({ doc_id: `process-${index}`, url: `https://example.test/process-${index}` });
      const source = `
        import { appendFleetExportEntry } from ${JSON.stringify(ledgerModuleUrl)};
        await appendFleetExportEntry(${JSON.stringify(input)}, { ledgerPath: ${JSON.stringify(ledgerPath)} });
      `;
      return execFileAsync(process.execPath, ["--input-type=module", "--eval", source]);
    });
    await Promise.all(processes);
    const ledger = await readFleetLedger({ ledgerPath });
    assert.equal(ledger.entry_count, 4);
    assert.deepEqual(ledger.entries.map((entry) => entry.sequence), [1, 2, 3, 4]);
  });
});

test("ledger fails closed on entry mutation and trailing clutter", async () => {
  await withTempLedger(async ({ ledgerPath }) => {
    await appendFleetExportEntry(successEntry(), { ledgerPath });
    const original = await fs.readFile(ledgerPath, "utf8");
    await fs.writeFile(ledgerPath, original.replace("sheet-123", "sheet-999"), "utf8");
    await assert.rejects(readFleetLedger({ ledgerPath }), (error) => error.code === "LEDGER_CORRUPT");
    await fs.writeFile(ledgerPath, `${original}unexpected clutter\n`, "utf8");
    await assert.rejects(readFleetLedger({ ledgerPath }), (error) => error.code === "LEDGER_CORRUPT");
    await fs.writeFile(ledgerPath, original.replace("External Export Fleet Ledger", "Edited Fleet Ledger"), "utf8");
    await assert.rejects(readFleetLedger({ ledgerPath }), (error) => error.code === "LEDGER_CORRUPT");
  });
});

test("ledger lock remains fail closed for live, foreign, and malformed owners", async () => {
  await withTempLedger(async ({ ledgerPath }) => {
    const liveRelease = await acquireFleetLedgerLock(ledgerPath);
    try {
      await assert.rejects(
        appendFleetExportEntry(successEntry(), {
          ledgerPath,
          lockTimeoutMs: 30,
          lockRetryMs: 5,
          lockStaleMs: 1,
        }),
        (error) => error.code === "LEDGER_LOCK_TIMEOUT",
      );
    } finally {
      await liveRelease();
    }

    const oldNow = Date.parse("2026-07-18T00:00:00.000Z");
    const foreignRelease = await acquireFleetLedgerLock(ledgerPath, {
      lockHostname: "foreign-host.invalid",
      lockPid: 2_147_483_647,
      lockNow: () => oldNow,
    });
    try {
      await assert.rejects(
        appendFleetExportEntry(successEntry(), {
          ledgerPath,
          lockTimeoutMs: 30,
          lockRetryMs: 5,
          lockStaleMs: 1,
        }),
        (error) => error.code === "LEDGER_LOCK_TIMEOUT",
      );
    } finally {
      await foreignRelease();
    }

    const malformedRelease = await acquireFleetLedgerLock(ledgerPath);
    try {
      const lockRoot = resolveFleetLedgerLockRoot(ledgerPath);
      const ownerDirectory = (await fs.readdir(lockRoot, { withFileTypes: true }))
        .find((entry) => entry.isDirectory() && entry.name.endsWith(".owner"));
      assert.ok(ownerDirectory, "expected ledger lock owner directory");
      await fs.writeFile(path.join(lockRoot, ownerDirectory.name, "owner.json"), "malformed\n", "utf8");
      await assert.rejects(
        appendFleetExportEntry(successEntry(), {
          ledgerPath,
          lockTimeoutMs: 30,
          lockRetryMs: 5,
          lockStaleMs: 1,
        }),
        (error) => error.code === "LEDGER_LOCK_TIMEOUT",
      );
    } finally {
      await malformedRelease();
    }
  });
});

test("ledger lock recovers a stale same-host owner after its process is killed", async () => {
  await withTempLedger(async ({ ledgerPath }) => {
    const ledgerModuleUrl = new URL("../export-ledger.js", import.meta.url).href;
    const source = `
      import { acquireFleetLedgerLock } from ${JSON.stringify(ledgerModuleUrl)};
      await acquireFleetLedgerLock(${JSON.stringify(ledgerPath)});
      process.stdout.write("locked\\n");
      await new Promise(() => {});
    `;
    const child = spawn(process.execPath, ["--input-type=module", "--eval", source], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    try {
      child.stdout.setEncoding("utf8");
      await Promise.race([
        new Promise((resolve) => {
          child.stdout.on("data", (chunk) => {
            if (chunk.includes("locked")) resolve();
          });
        }),
        once(child, "exit").then(([code, signal]) => {
          throw new Error(`lock owner exited before readiness: code=${code} signal=${signal} stderr=${stderr}`);
        }),
      ]);
      child.kill("SIGKILL");
      await once(child, "exit");
      await new Promise((resolve) => setTimeout(resolve, 40));

      await appendFleetExportEntry(successEntry(), {
        ledgerPath,
        lockTimeoutMs: 500,
        lockRetryMs: 5,
        lockStaleMs: 20,
      });
      assert.equal((await readFleetLedger({ ledgerPath })).entry_count, 1);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await once(child, "exit").catch(() => undefined);
      }
    }
  });
});

test("ledger path honors isolated environment selection and CLI verifies/lists it", async () => {
  await withTempLedger(async ({ ledgerPath }) => {
    const env = { AGENTIC_OS_EXPORT_FLEET_PATH: ledgerPath };
    assert.equal(resolveFleetLedgerPath({ env }), ledgerPath);
    await appendFleetExportEntry(successEntry(), { env });
    const messages = [];
    assert.equal(await runFleetCli(["verify", "--path", ledgerPath], { log: (message) => messages.push(message) }), 0);
    assert.equal(await runFleetCli(["list", "--path", ledgerPath, "--json"], { log: (message) => messages.push(message) }), 0);
    assert.match(messages[0], /Fleet ledger valid: 1 entries/);
    assert.match(messages[1], /"doc_id": "sheet-123"/);
  });
});
