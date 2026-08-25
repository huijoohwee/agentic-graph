import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { boundaryReport, evaluateDeployOperation } from "../../src/runtime/deploy-boundary.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PROD_MIRROR = resolve(REPOSITORY_ROOT, "../huijoohwee/content/knowgrph");

test("deploy boundary register stays closed and rejects boundary crossing", () => {
  assert.deepEqual(boundaryReport().boundaryRegister.map((row) => row.state), ["closed", "closed", "closed"]);
  assert.equal(evaluateDeployOperation({ capability: "local execute", targetBoundary: "Prod_Mirror" }).ok, false);
});

test("local process sweep preserves closed boundaries, mirror bytes, and repository hygiene", () => {
  const beforeBoundary = boundaryReport();
  const beforeMirror = directoryDigest(PROD_MIRROR);
  let externalRouteRequests = 0;
  const decision = evaluateDeployOperation({
    capability: "environment mutate",
    component: "travel-commerce-process-check",
    targetBoundary: "Cloudflare_Routes",
  });
  if (decision.ok) externalRouteRequests += 1;

  const authoredFiles = sourceFiles([
    "src/archive",
    "src/bundle",
    "src/cache",
    "src/gate",
    "src/ledger",
    "src/commission",
    "src/marketplace",
    "src/payout",
    "src/runtime",
    "cloudflare/workers/knowgrph-travel-commerce/test",
    "scripts/travel-commerce",
  ]);
  const findings = authoredFiles.flatMap((file) => scanFile(file));
  assert.deepEqual(findings, []);
  assert.equal(externalRouteRequests, 0);
  assert.equal(directoryDigest(PROD_MIRROR), beforeMirror);
  assert.deepEqual(boundaryReport(), beforeBoundary);
  assert.deepEqual(beforeBoundary.boundaryRegister.map((row) => row.state), ["closed", "closed", "closed"]);
});

test("native marketplace keeps four documented boundaries closed and one outward-call seam", () => {
  const marketplaceFiles = sourceFiles(["src/commission", "src/marketplace", "src/payout"])
    .concat([
      resolve(REPOSITORY_ROOT, "src/ledger/vendor-split-projector.mjs"),
      resolve(REPOSITORY_ROOT, "src/ledger/vendor-split-records.mjs"),
      resolve(REPOSITORY_ROOT, "src/travel-commerce/marketplace.mjs"),
    ]);
  const outwardCallFiles = marketplaceFiles.filter(file => /\.fetch\s*\(/u.test(readFileSync(file, "utf8")));
  assert.deepEqual(outwardCallFiles.map(file => relative(REPOSITORY_ROOT, file)), ["src/payout/payout-rail-port.mjs"]);
  for (const file of marketplaceFiles) {
    const source = readFileSync(file, "utf8");
    assert.equal(source.includes("airvio.co"), false);
    assert.equal(source.includes("huijoohwee/content/knowgrph"), false);
  }
  const specification = readFileSync(resolve(
    REPOSITORY_ROOT,
    "docs/documents/knowgrph-agentic-commerce-platform-prd-tad-adr.md",
  ), "utf8");
  const section = specification.split("### Deploy Boundary Register — v0.3.0 additions")[1].split("\n---")[0];
  const rows = section.split("\n").filter(line => /^\| (?:Vendor lifecycle|Split projection|Payout dispatch|Marketplace settlement)/u.test(line));
  assert.equal(rows.length, 4);
  assert.equal(rows.every(row => row.endsWith("| `closed` |")), true);
});

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".mjs", ".js", ".json", ".html", ".css"]);
const DEVELOPER_ABSOLUTE_PATH = /(?:\/Users\/[A-Za-z0-9._-]+\/|\/home\/[A-Za-z0-9._-]+\/|[A-Za-z]:\\Users\\)/;
const CREDENTIAL_VALUE = /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk_live|rk_live|ghp|github_pat|xox[baprs])_[A-Za-z0-9_-]{16,})/;
const ACCOUNT_IDENTIFIER = /(?:account_id\s*[=:]\s*["']?[a-f0-9]{32}["']?|"accountId"\s*:\s*"[a-f0-9]{32}")/i;

function sourceFiles(relativeRoots) {
  return relativeRoots.flatMap((root) => walk(resolve(REPOSITORY_ROOT, root))).sort();
}

function walk(path) {
  if (!existsSync(path)) return [];
  const metadata = statSync(path);
  if (metadata.isFile()) return SOURCE_EXTENSIONS.has(extname(path)) ? [path] : [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => (
    entry.name === "node_modules" || entry.name.startsWith(".")
      ? []
      : walk(join(path, entry.name))
  ));
}

function scanFile(file) {
  const source = readFileSync(file, "utf8");
  const fileName = relative(REPOSITORY_ROOT, file);
  const lineCount = source.split(/\r?\n/).length;
  const findings = [];
  if (lineCount > 600) findings.push(`${fileName}: authored-file-line-limit:${lineCount}`);
  if (DEVELOPER_ABSOLUTE_PATH.test(source)) findings.push(`${fileName}: developer-absolute-path`);
  if (CREDENTIAL_VALUE.test(source)) findings.push(`${fileName}: credential-value`);
  if (ACCOUNT_IDENTIFIER.test(source)) findings.push(`${fileName}: account-identifier`);
  return findings;
}

function directoryDigest(path) {
  const hash = createHash("sha256");
  if (!existsSync(path)) return hash.update("absent").digest("hex");
  const files = walkAll(path);
  for (const file of files) {
    hash.update(relative(path, file));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function walkAll(path) {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => (
    walkAll(join(path, entry.name))
  )).sort();
}
