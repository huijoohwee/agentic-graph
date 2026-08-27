// LIVE Exa research client for the Research_Harness
// (agenticgraph-acos-mcp-connector runtime-readiness path, step 3 / R6.1).
//
// This is the drop-in that replaces the deterministic in-memory Exa mock in
// `research-harness.js` for deployed use. It performs a real `web_search_exa`
// MCP `tools/call` over MCP Streamable HTTP to the Exa remote endpoint and maps
// the results into the RAW Source_Card candidate shape that
// `evidence.js#normalizeSourceCards` accepts (`{ sourceId, url, platform,
// title, evidenceLevel, observedFields }`). Source routing through the
// Cloudflare AI Gateway happens at the Director / worker tier; this client only
// performs the Exa retrieval given an injectable `fetch`.
//
// Network-free testability: `fetchImpl` is injectable so the suite passes a
// fake `fetch` and asserts request shaping + result mapping with ZERO live
// calls. The harness keeps its deterministic default; a deployment wires this
// client via `runResearchHarness(input, { exaClient: createExaMcpClient(...) })`.

import { cleanString } from "./helpers.js";

// Exa MCP Streamable HTTP endpoint. Mirrors `EXA_MCP_REMOTE_URL` in
// `grph-shared/src/search/exaMcpSsot.ts` — kept as a local constant so this JS
// module imports nothing from the TS SSOT bundle at runtime (same discipline
// the Agent_Api forwarder uses for the control-plane endpoint).
export const EXA_MCP_REMOTE_URL = "https://mcp.exa.ai/mcp";
export const EXA_MCP_SEARCH_TOOL = "web_search_exa";
export const EXA_MCP_API_KEY_HEADER = "x-api-key";
const MCP_ACCEPT = "application/json, text/event-stream";

/** Typed error so the harness degraded path (R6.4) can detect a live failure. */
export class ExaClientError extends Error {
  constructor(message, code = "exa_request_failed") {
    super(message);
    this.name = "ExaClientError";
    this.code = code;
  }
}

/** Parse a JSON-RPC frame out of an SSE (`text/event-stream`) body. */
function parseSseJsonRpc(text) {
  if (typeof text !== "string" || text.length === 0) return null;
  let last = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimStart();
    if (!line.startsWith("data:")) continue;
    const payload = line.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      last = JSON.parse(payload);
    } catch {
      /* ignore keep-alive / comment frames */
    }
  }
  return last;
}

/**
 * Pull a results array out of the several shapes Exa's `web_search_exa`
 * `tools/call` reply may carry:
 *   - `result.structuredContent.results` (preferred structured form)
 *   - `result.structuredContent` already an array
 *   - the first `result.content[].text` parsed as JSON `{ results: [...] }`
 *
 * @param {object|null} rpc the parsed JSON-RPC reply
 * @returns {Array<object>}
 */
export function extractExaResults(rpc) {
  const result = rpc && typeof rpc === "object" ? rpc.result ?? rpc : null;
  if (!result || typeof result !== "object") return [];
  const sc = result.structuredContent;
  if (Array.isArray(sc)) return sc;
  if (sc && Array.isArray(sc.results)) return sc.results;
  const content = Array.isArray(result.content) ? result.content : [];
  for (const part of content) {
    const text = part && typeof part.text === "string" ? part.text : "";
    if (!text) continue;
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.results)) return parsed.results;
    } catch {
      /* not JSON content */
    }
  }
  return [];
}

/**
 * Map a single Exa search result to the RAW Source_Card candidate shape
 * `normalizeSourceCards` accepts. Defensive about field names Exa may use
 * (`url`, `title`, `author`/`publishedDate`); `normalizeSourceCards` fills the
 * rest and `assignUniqueSourceIds` guarantees id uniqueness, so this never has
 * to fabricate ids.
 */
function mapExaResultToCard(result, index) {
  const url = cleanString(result?.url || result?.link || result?.id, "");
  let platform = "";
  try {
    if (url) platform = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    platform = "";
  }
  return {
    sourceId: cleanString(result?.id, `exa-${index + 1}`),
    url,
    platform: cleanString(result?.platform || platform, "exa"),
    title: cleanString(result?.title || result?.text, `Exa evidence ${index + 1}`),
    evidenceLevel: index % 3 === 0 ? "A" : "B",
    observedFields: ["url", "title_or_snippet"],
  };
}

/**
 * Build a LIVE Exa MCP client exposing `search({ referenceUrl, query,
 * maxResults })` (the same surface the deterministic mock exposes), performing
 * one real `web_search_exa` MCP `tools/call`. Throws `ExaClientError` on a
 * transport/HTTP failure so the harness routes to its degraded `weak_signal`
 * path (R6.4) WITHOUT fabricating sources.
 *
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetchImpl] fetch implementation (default global `fetch`)
 * @param {string} [opts.endpoint] Exa MCP endpoint (default `EXA_MCP_REMOTE_URL`)
 * @param {string} [opts.apiKey] optional Exa API key (api-key-header mode); when
 *   omitted the client uses Exa's hosted-free mode (no key header).
 * @param {string|number} [opts.requestId] JSON-RPC id (default 1)
 * @returns {{ isDeterministicMock: false, search: Function }}
 */
export function createExaMcpClient(opts = {}) {
  const fetchImpl =
    typeof opts.fetchImpl === "function" ? opts.fetchImpl : globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new ExaClientError("no fetch implementation available for the live Exa client");
  }
  const endpoint =
    typeof opts.endpoint === "string" && opts.endpoint ? opts.endpoint : EXA_MCP_REMOTE_URL;

  return {
    isDeterministicMock: false,
    async search({ referenceUrl, query, maxResults }) {
      const headers = { "content-type": "application/json", accept: MCP_ACCEPT };
      if (typeof opts.apiKey === "string" && opts.apiKey) {
        headers[EXA_MCP_API_KEY_HEADER] = opts.apiKey;
      }
      const rpcRequest = {
        jsonrpc: "2.0",
        id: opts.requestId ?? 1,
        method: "tools/call",
        params: {
          name: EXA_MCP_SEARCH_TOOL,
          arguments: {
            query: cleanString(query, cleanString(referenceUrl, "reference video remix")),
            numResults: Number.isFinite(maxResults) ? maxResults : 10,
          },
        },
      };

      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(rpcRequest),
        });
      } catch (err) {
        throw new ExaClientError(
          `Exa MCP request failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      const status = typeof response?.status === "number" ? response.status : 0;
      if (status && (status < 200 || status >= 300)) {
        throw new ExaClientError(`Exa MCP returned HTTP ${status}`);
      }

      const contentType =
        (typeof response?.headers?.get === "function"
          ? response.headers.get("content-type")
          : "") || "";
      let rpc;
      if (contentType.includes("text/event-stream")) {
        rpc = parseSseJsonRpc(await response.text());
      } else {
        try {
          rpc = await response.json();
        } catch {
          rpc = parseSseJsonRpc(typeof response.text === "function" ? await response.text() : "");
        }
      }

      if (rpc && rpc.error) {
        throw new ExaClientError(
          `Exa MCP error: ${cleanString(rpc.error?.message, "unknown")}`,
        );
      }

      return extractExaResults(rpc).map(mapExaResultToCard);
    },
  };
}
