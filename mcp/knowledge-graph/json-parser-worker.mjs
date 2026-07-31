import { KnowledgeGraphError } from "./contract.mjs";
import { parseKnowledgeSource } from "./parsers.mjs";

const MAX_INPUT_BYTES = 128 * 1024 * 1024;
const MAX_HEADER_BYTES = 1024 * 1024;
const chunks = [];
let inputBytes = 0;

try {
  for await (const chunk of process.stdin) {
    inputBytes += chunk.length;
    if (inputBytes > MAX_INPUT_BYTES) {
      throw new KnowledgeGraphError(
        "parser_record_limit_exceeded",
        "Isolated JSON parser input exceeds its byte bound.",
        { complete: false, maxInputBytes: MAX_INPUT_BYTES },
      );
    }
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks, inputBytes);
  if (input.length < 4) {
    throw new KnowledgeGraphError(
      "parser_failed",
      "Isolated JSON parser input is missing its metadata header.",
      { complete: false },
    );
  }
  const headerBytes = input.readUInt32BE(0);
  if (headerBytes < 2 || headerBytes > MAX_HEADER_BYTES || input.length < 4 + headerBytes) {
    throw new KnowledgeGraphError(
      "parser_record_limit_exceeded",
      "Isolated JSON parser metadata header is invalid or exceeds its byte bound.",
      { complete: false, maxHeaderBytes: MAX_HEADER_BYTES },
    );
  }
  const payload = JSON.parse(input.subarray(4, 4 + headerBytes).toString("utf8"));
  payload.source.text = input.subarray(4 + headerBytes).toString("utf8");
  const fragment = await parseKnowledgeSource(payload.source, {
    ...payload.options,
    isolatedJsonChild: true,
  });
  process.stdout.write(JSON.stringify({ ok: true, fragment }));
} catch (error) {
  process.stdout.write(JSON.stringify({
    ok: false,
    error: {
      code: String(error?.code || "parser_failed"),
      message: String(error?.message || error),
      details: error?.details && typeof error.details === "object"
        ? error.details
        : { complete: false },
    },
  }));
}
