const DEFAULT_SEALION_MCP_URL = "https://api.sea-lion.ai/mcp/sealion";
export const AGENTIC_OS_SEALION_MCP_API_KEY_ENV = "AGENTIC_OS_MCP_SEALION_API_KEY";
export const AGENTIC_OS_SEALION_MCP_URL_ENV = "AGENTIC_OS_MCP_SEALION_URL";
export const AGENTIC_OS_SEALION_MCP_TOOL_NAMES = Object.freeze({
  detectLanguageVariant: "sealion.detect_language_variant",
  translateLocalize: "sealion.translate_localize",
  safetyCheck: "sealion.safety_check",
});

const UPSTREAM_TOOL_BY_LOCAL_TOOL = Object.freeze({
  [AGENTIC_OS_SEALION_MCP_TOOL_NAMES.detectLanguageVariant]: "detect_language_variant",
  [AGENTIC_OS_SEALION_MCP_TOOL_NAMES.translateLocalize]: "translate_localize",
  [AGENTIC_OS_SEALION_MCP_TOOL_NAMES.safetyCheck]: "safety_check",
});

const parseJsonMaybe = (value) => {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const parseMcpResponseText = (text) => {
  const direct = parseJsonMaybe(text);
  if (direct) return direct;
  const ssePayloads = String(text || "")
    .split(/\r?\n\r?\n/)
    .flatMap((event) => {
      const dataLines = event.split(/\r?\n/).filter((line) => line.startsWith("data:"));
      return dataLines.length ? [dataLines.map((line) => line.slice(5).trimStart()).join("\n")] : [];
    })
    .map(parseJsonMaybe)
    .filter(Boolean);
  return ssePayloads[ssePayloads.length - 1] || null;
};

const normalizeMcpUrl = (env) =>
  String(env?.[AGENTIC_OS_SEALION_MCP_URL_ENV] || DEFAULT_SEALION_MCP_URL).trim().replace(/\/+$/, "");

const postMcpJson = async ({ fetchImpl, url, apiKey, sessionId, body }) => {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`SEA-LION MCP upstream ${response.status}: ${text.slice(0, 300)}`);
  }
  return {
    message: parseMcpResponseText(text),
    sessionId: response.headers.get("mcp-session-id") || sessionId || "",
  };
};

const buildRpc = (id, method, params = {}) => ({ jsonrpc: "2.0", id, method, params });

export async function callSealionSidecarTool(toolName, args = {}, options = {}) {
  const upstreamTool = UPSTREAM_TOOL_BY_LOCAL_TOOL[toolName];
  if (!upstreamTool) throw new Error(`Unknown SEA-LION sidecar tool: ${toolName}`);
  const env = options.env || process.env;
  const apiKey = String(env[AGENTIC_OS_SEALION_MCP_API_KEY_ENV] || "").trim();
  if (!apiKey) {
    throw new Error(`Missing SEA-LION MCP API key. Export ${AGENTIC_OS_SEALION_MCP_API_KEY_ENV} and restart the local MCP server.`);
  }
  const fetchImpl = options.fetchImpl || fetch;
  const url = normalizeMcpUrl(env);
  const initialized = await postMcpJson({
    fetchImpl,
    url,
    apiKey,
    body: buildRpc(1, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "agentic-graph-mcp", version: "0.1.0" },
    }),
  });
  if (initialized.message?.error) throw new Error(String(initialized.message.error.message || "SEA-LION MCP initialize failed."));
  await postMcpJson({
    fetchImpl,
    url,
    apiKey,
    sessionId: initialized.sessionId,
    body: { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
  }).catch(() => undefined);
  const called = await postMcpJson({
    fetchImpl,
    url,
    apiKey,
    sessionId: initialized.sessionId,
    body: buildRpc(2, "tools/call", { name: upstreamTool, arguments: args }),
  });
  if (called.message?.error) throw new Error(String(called.message.error.message || `SEA-LION MCP ${upstreamTool} failed.`));
  const result = called.message?.result || {};
  const structured = result.structuredContent || parseJsonMaybe(result.content?.[0]?.text) || result;
  return { ok: true, tool: upstreamTool, upstreamUrl: url, result: structured };
}
