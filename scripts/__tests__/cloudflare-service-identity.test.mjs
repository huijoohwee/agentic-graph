import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const workersRoot = path.join(repositoryRoot, "cloudflare", "workers");

const listWranglerConfigs = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const target = path.join(directory, entry.name);
  if (entry.isDirectory()) return listWranglerConfigs(target);
  // Release/bootstrap tests materialize short-lived route-free configs in the
  // Worker folders. They are not source configurations and can disappear while
  // this observer runs, so never treat them as deployable identities.
  if (/^(?:wrangler\.release-|agentic-graph-bootstrap-)/.test(entry.name)) return [];
  return /^wrangler(?:\..+)?\.(?:toml|jsonc)$/.test(entry.name) ? [target] : [];
});

const valuesFor = (source, property) => [...source.matchAll(
  new RegExp(`(?:^|\\n)\\s*(?:"${property}"\\s*:\\s*|${property}\\s*=\\s*)"([^"]+)"`, "g"),
)].map(([, value]) => value);

test("Cloudflare deployable identities use the agentic-* namespace", () => {
  const configs = listWranglerConfigs(workersRoot).sort();
  assert(configs.length > 0, "expected Cloudflare worker configs");

  const identities = new Set();
  for (const config of configs) {
    const source = readFileSync(config, "utf8");
    const workerNames = valuesFor(source, "name").filter(value => /^agentic-/.test(value));
    const values = [
      ...workerNames,
      ...valuesFor(source, "service"),
      ...valuesFor(source, "database_name"),
      ...valuesFor(source, "bucket_name"),
      ...valuesFor(source, "queue_name"),
    ].filter(value => /^agentic-/.test(value));
    assert(workerNames.length > 0, `${path.relative(repositoryRoot, config)} has no Worker name`);
    for (const value of values) {
      assert.match(value, /^agentic-[a-z0-9-]+$/, `${path.relative(repositoryRoot, config)} has a non-agentic Worker identity: ${value}`);
      assert.doesNotMatch(value, /^agentic-graph-/, `${path.relative(repositoryRoot, config)} retains a retired Worker identity: ${value}`);
      identities.add(value);
    }
  }

  for (const required of ["agentic-mcp", "agentic-storage", "agentic-payment"]) {
    assert(identities.has(required), `missing ${required} Worker identity`);
  }
});

test("stateful Cloudflare migration identifiers retain their historical bytes", () => {
  const mcpConfig = readFileSync(path.join(workersRoot, "agentic-graph-mcp", "wrangler.toml"), "utf8");
  const storageConfig = readFileSync(path.join(workersRoot, "agentic-graph-storage", "wrangler.toml"), "utf8");

  assert.equal(
    (mcpConfig.match(/tag = "v1_knowgrph_mcp_agent"/g) || []).length,
    3,
    "MCP Durable Object history must retain its original tag in every environment",
  );
  assert.equal(
    (mcpConfig.match(/tag = "v3_rename_knowgrph_mcp_agent"/g) || []).length,
    3,
    "MCP Durable Object history must rename the legacy class in every environment",
  );
  assert.match(
    storageConfig,
    /tag = "v1_knowgrph_canvas_sync_room"/,
    "storage Durable Object history must retain its original tag",
  );
  assert.match(
    storageConfig,
    /tag = "v2_rename_knowgrph_canvas_sync_room"/,
    "storage Durable Object history must rename the legacy class",
  );
});
