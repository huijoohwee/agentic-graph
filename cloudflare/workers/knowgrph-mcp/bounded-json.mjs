export async function readBoundedJson(message, maxBytes) {
  const result = await readBoundedJsonResult(message, maxBytes);
  return result.ok ? result.value : null;
}

export async function readBoundedJsonResult(message, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) return failure("invalid_limit");
  if (!isJsonContentType(message.headers.get("content-type"))) {
    await cancelBody(message.body);
    return failure("invalid_media");
  }
  const contentLength = message.headers.get("content-length");
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (!/^\d+$/.test(contentLength) || !Number.isSafeInteger(declared)) {
      await cancelBody(message.body);
      return failure("invalid_length");
    }
    if (declared > maxBytes) {
      await cancelBody(message.body);
      return failure("too_large");
    }
  }
  if (!message.body) return failure("invalid_json");

  const reader = message.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return failure("too_large");
      }
      chunks.push(value);
    }
  } catch {
    try { await reader.cancel(); } catch { /* already closed */ }
    return failure("read_failed");
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return failure("invalid_json");
  }
}

const isJsonContentType = (value) => value?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
const failure = (reason) => ({ ok: false, reason });

async function cancelBody(body) {
  if (!body) return;
  try { await body.cancel(); } catch { /* body may already be locked */ }
}
