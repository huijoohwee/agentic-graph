import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { performance } from "node:perf_hooks";
import test from "node:test";

import {
  AgentGraphError,
  sha256,
} from "../agent-graph/contract.mjs";
import {
  runIsolatedJsonParser,
  shouldIsolateJsonSource,
} from "../agent-graph/isolated-json-parser.mjs";
import { parseKnowledgeSource } from "../agent-graph/parsers.mjs";

const jsonSource = (text, overrides = {}) => ({
  relativePath: "test-data/isolation.json",
  text,
  contentHash: sha256(text),
  byteSize: Buffer.byteLength(text),
  kind: "json-config",
  status: "ready",
  diagnostics: [],
  ...overrides,
});

const fakeChild = () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = new EventEmitter();
  child.stdin.write = () => true;
  child.stdin.end = () => {};
  child.kill = () => true;
  return child;
};

test("JSON isolation uses actual UTF-8 bytes and ignores a false declared byte size", async () => {
  const multiByteText = `"${"é".repeat(300_000)}"`;
  assert.ok(multiByteText.length < 512 * 1024);
  assert.ok(Buffer.byteLength(multiByteText, "utf8") > 512 * 1024);
  assert.equal(shouldIsolateJsonSource(
    jsonSource(multiByteText, { byteSize: 1 }),
  ), true);

  const text = `{"payload":"${"x".repeat(5 * 1024 * 1024)}"}`;
  const source = jsonSource(text, { byteSize: 1 });
  const controller = new AbortController();
  const startedAt = performance.now();
  const parsing = parseKnowledgeSource(source, { abortSignal: controller.signal });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(parsing, (error) => error?.code === "aborted");
  assert.ok(
    performance.now() - startedAt < 1_000,
    "actual source bytes did not route parsing through the abortable isolated worker",
  );
});

test("isolated JSON process failures expose only typed bounded diagnostics", async (t) => {
  const source = jsonSource('{"ok":true}');
  const rawSecret = "/private/credential/root-token";
  const assertSanitized = (error, {
    code,
    causeCategory,
    stage,
  }) => {
    assert.ok(error instanceof AgentGraphError);
    assert.equal(error.code, code);
    assert.equal(error.details.causeCategory, causeCategory);
    assert.equal(error.details.stage, stage);
    assert.ok(error.details.causeCode.length <= 64);
    assert.equal(JSON.stringify(error).includes(rawSecret), false);
    assert.equal(JSON.stringify(error).includes("root-token"), false);
    assert.equal(error.message.includes(rawSecret), false);
    return true;
  };

  await t.test("synchronous spawn failure", async () => {
    await assert.rejects(
      runIsolatedJsonParser(source, {}, {
        spawn: () => {
          const error = new Error(`spawn failed at ${rawSecret}`);
          error.code = `ENOENT:${rawSecret}`;
          throw error;
        },
      }),
      (error) => {
        assertSanitized(error, {
          code: "parser_failed",
          causeCategory: "spawn",
          stage: "json.ast-isolated-spawn",
        });
        assert.equal(error.details.causeCode, "unknown");
        return true;
      },
    );
  });

  await t.test("asynchronous spawn failure", async () => {
    const child = fakeChild();
    queueMicrotask(() => {
      const error = new Error(`spawn event failed at ${rawSecret}`);
      error.code = "ENOENT";
      child.emit("error", error);
    });
    await assert.rejects(
      runIsolatedJsonParser(source, {}, { spawn: () => child }),
      (error) => {
        assertSanitized(error, {
          code: "parser_failed",
          causeCategory: "spawn",
          stage: "json.ast-isolated-spawn",
        });
        assert.equal(error.details.causeCode, "ENOENT");
        return true;
      },
    );
  });

  await t.test("stdin failure", async () => {
    const child = fakeChild();
    child.stdin.write = () => {
      const error = new Error(`broken pipe at ${rawSecret}`);
      error.code = "EPIPE";
      queueMicrotask(() => child.stdin.emit("error", error));
      return false;
    };
    await assert.rejects(
      runIsolatedJsonParser(source, {}, { spawn: () => child }),
      (error) => assertSanitized(error, {
        code: "parser_failed",
        causeCategory: "stdin",
        stage: "json.ast-isolated-input",
      }),
    );
  });

  await t.test("nonzero exit and stderr", async () => {
    const child = fakeChild();
    queueMicrotask(() => {
      child.stderr.emit("data", Buffer.from(`fatal ${rawSecret}`));
      child.emit("close", 23, null);
    });
    await assert.rejects(
      runIsolatedJsonParser(source, {}, { spawn: () => child }),
      (error) => {
        assertSanitized(error, {
          code: "parser_resource_limit_exceeded",
          causeCategory: "nonzero-exit",
          stage: "json.ast-isolated-exit",
        });
        assert.equal(error.details.causeCode, "exit-23");
        assert.equal(error.details.exitCode, 23);
        assert.equal(error.details.stderrObserved, true);
        return true;
      },
    );
  });

  await t.test("successful process with an untrusted worker error envelope", async () => {
    const child = fakeChild();
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from(JSON.stringify({
        ok: false,
        error: {
          code: "raw-code",
          message: `worker leaked ${rawSecret}`,
          details: {
            secret: rawSecret,
            stage: "json.root-token",
          },
        },
      })));
      child.emit("close", 0, null);
    });
    await assert.rejects(
      runIsolatedJsonParser(source, {}, { spawn: () => child }),
      (error) => {
        assertSanitized(error, {
          code: "parser_failed",
          causeCategory: "worker-response",
          stage: "json.ast-isolated-worker",
        });
        assert.equal(error.details.causeCode, "unknown");
        assert.equal(error.details.secret, undefined);
        return true;
      },
    );
  });
});
