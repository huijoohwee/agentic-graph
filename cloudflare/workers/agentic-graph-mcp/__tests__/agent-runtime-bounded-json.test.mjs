import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { readBoundedJsonResult } from "../bounded-json.mjs";

const encoder = new TextEncoder();
const chunkedRequest = (bytes, options = {}) => {
  let offset = 0;
  return new Request("https://mcp.internal/agentic-os/control-plane/agents/runs", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8", ...(options.headers ?? {}) },
    body: new ReadableStream({
      pull(controller) {
        if (offset >= bytes.byteLength) return controller.close();
        const end = Math.min(offset + (options.chunkBytes ?? 7), bytes.byteLength);
        controller.enqueue(bytes.slice(offset, end));
        offset = end;
      },
      cancel() { options.onCancel?.(); },
    }),
    duplex: "half",
  });
};

test("agent runtime accepts bounded chunked JSON without Content-Length", async () => {
  const value = { agentDefinitionId: "agent-flight", mode: "dry-run" };
  const result = await readBoundedJsonResult(
    chunkedRequest(encoder.encode(JSON.stringify(value))),
    64 * 1024,
  );
  assert.deepEqual(result, { ok: true, value });
});

test("agent runtime cancels an oversized chunked body before complete buffering", async () => {
  let cancelled = false;
  const result = await readBoundedJsonResult(
    chunkedRequest(new Uint8Array(128 * 1024).fill(0x20), {
      chunkBytes: 1024,
      onCancel: () => { cancelled = true; },
    }),
    64 * 1024,
  );
  assert.deepEqual(result, { ok: false, reason: "too_large" });
  assert.equal(cancelled, true);
});

test("agent runtime rejects malformed declarations, JSON, and UTF-8", async () => {
  for (const [request, reason] of [
    [chunkedRequest(encoder.encode("{}"), { headers: { "content-length": "invalid" } }), "invalid_length"],
    [chunkedRequest(encoder.encode("{}"), { headers: { "content-type": "application/json-evil" } }), "invalid_media"],
    [chunkedRequest(encoder.encode("{\"mode\":")), "invalid_json"],
    [chunkedRequest(new Uint8Array([0x7b, 0x22, 0xff, 0x22, 0x7d])), "invalid_json"],
  ]) {
    assert.deepEqual(await readBoundedJsonResult(request, 64 * 1024), { ok: false, reason });
  }
});

test("public agent-run handler uses the bounded reader and never request.text", async () => {
  const source = await readFile(new URL("../agent-runtime-http.ts", import.meta.url), "utf8");
  assert.match(source, /readBoundedJsonResult\(request, MAX_AGENT_RUN_BODY_BYTES\)/);
  assert.doesNotMatch(source, /request\.text\(\)/);
});
