import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const configUrl = new URL("../wrangler.toml", import.meta.url);

test("Dev Worker is isolated from production routes and repeats required bindings", async () => {
  const config = await readFile(configUrl, "utf8");
  const dev = config.slice(config.indexOf("[env.dev]"));
  assert.match(dev, /name = "knowgrph-mcp-dev"/);
  assert.match(dev, /workers_dev = true/);
  assert.match(dev, /routes = \[\]/);
  assert.match(dev, /KNOWGRPH_LIVE_CLIENTS = "0"/);
  assert.match(dev, /\[\[env\.dev\.durable_objects\.bindings\]\][\s\S]*name = "MCP_AGENT"/);
  assert.match(dev, /\[\[env\.dev\.durable_objects\.bindings\]\][\s\S]*name = "RUN_MANIFEST_STORE"/);
  assert.match(dev, /\[\[env\.dev\.migrations\]\][\s\S]*tag = "v2_run_manifest_store"/);
  assert.doesNotMatch(dev, /airvio\.co\/knowgrph\/control-plane/);
});
