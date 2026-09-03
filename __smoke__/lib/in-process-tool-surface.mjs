// In-process MCP Streamable HTTP tool-surface seam — agentic-graph-acos-mcp-connector
// spec, task 9.3 (R14.1; design Mcp_Agent "Tool surface (R14.1, R14.4)" +
// "expose ... tools to remote clients over MCP Streamable HTTP transport").
//
// PURPOSE: prove the MCP tool surface is REACHABLE and ENUMERABLE through the
// Streamable HTTP transport WITHOUT any live network/socket. The deployed
// Worker entry (`cloudflare/workers/agentic-graph-mcp/index.ts`) speaks MCP
// Streamable HTTP: a client POSTs JSON-RPC envelopes (`tools/list`,
// `tools/call`) to `airvio.co/agentic-graph/mcp`. This seam hands those SAME
// JSON-RPC envelopes DIRECTLY to the Worker's real code paths in-process:
//
//   tools/list -> buildAgenticGraphMcpToolDefinitions()      (the canonical surface
//                                                          the Worker lists)
//   tools/call -> dispatchAgenticGraphMcpToolCall(...)        (the shared dispatch
//                                                          path index.ts runs)
//
// It builds an in-memory `RUN_MANIFEST_STORE` namespace from the real
// `RunManifestStore` Durable Object class (the worker's own persistence layer)
// — no fork, no live network. The transport is injectable so the same seam can
// later be pointed at a real `fetch` against the live endpoint with no caller
// changes.

import { dispatchAgenticGraphMcpToolCall } from "../../cloudflare/workers/agentic-graph-mcp/run-manifest/dispatch.mjs";
import { RunManifestStore } from "../../cloudflare/workers/agentic-graph-mcp/run-manifest/persistence.mjs";
import {
  buildAgenticGraphMcpToolDefinitions,
  AGENTIC_OS_MCP_CONTRACT_VERSION,
} from "../../cloudflare/workers/agentic-graph-mcp/tool-registry.mjs";

/** The MCP Streamable HTTP endpoint the deployed Worker serves (R14.1). */
export const MCP_STREAMABLE_HTTP_URL = "https://airvio.co/agentic-graph/mcp";

/**
 * Build an in-memory `RUN_MANIFEST_STORE` Durable Object namespace from the
 * real `RunManifestStore` class. Each `idFromName` -> `get` pair returns a
 * persistent DO stub backed by a `Map` storage shim implementing the async
 * `get(key)` / `put(batch)` surface the persistence layer expects. Pure and
 * network-free.
 *
 * @returns {{ idFromName: (name: string) => { name: string }, get: (id: { name: string }) => RunManifestStore }}
 */
export function createInMemoryRunManifestNamespace() {
  const stores = new Map();
  const makeStorage = () => {
    const map = new Map();
    return {
      async get(key) {
        return map.get(key);
      },
      async put(keyOrBatch, value) {
        if (keyOrBatch && typeof keyOrBatch === "object" && value === undefined) {
          for (const [k, v] of Object.entries(keyOrBatch)) map.set(k, v);
          return;
        }
        map.set(keyOrBatch, value);
      },
    };
  };
  return {
    idFromName(name) {
      return { name: String(name) };
    },
    get(id) {
      const name = id && typeof id === "object" ? String(id.name) : String(id);
      if (!stores.has(name)) {
        stores.set(name, new RunManifestStore({ storage: makeStorage() }, {}));
      }
      return stores.get(name);
    },
  };
}

const JSON_RPC_INVALID_REQUEST = -32600;
const JSON_RPC_METHOD_NOT_FOUND = -32601;

/**
 * Create an injectable in-process MCP Streamable HTTP transport. The returned
 * `transport(httpRequest)` accepts the `{ url, method, headers, body }` request
 * descriptor an MCP Streamable HTTP client builds (where `body` is a JSON-RPC
 * envelope) and returns a JSON-RPC response envelope `{ jsonrpc, id, result }`
 * the client unwraps — mirroring the deployed Worker's transport.
 *
 * @param {object} [opts]
 * @param {object} [opts.namespace] RUN_MANIFEST_STORE namespace (defaults to a
 *   fresh in-memory namespace built from the real DO class)
 * @returns {{ transport: (req: object) => Promise<object>, calls: object[], namespace: object }}
 */
export function createInProcessStreamableHttpTransport(opts = {}) {
  const namespace = opts.namespace ?? createInMemoryRunManifestNamespace();
  const calls = [];

  const transport = async (httpRequest) => {
    calls.push(httpRequest);
    const rpc = httpRequest && httpRequest.body;
    const id = rpc && rpc.id != null ? rpc.id : null;

    if (!rpc || typeof rpc.method !== "string") {
      return jsonRpcError(id, JSON_RPC_INVALID_REQUEST, "Invalid JSON-RPC request");
    }

    if (rpc.method === "tools/list") {
      // Enumerate the tool surface exactly as the Worker lists it (R14.1/R14.4).
      return {
        jsonrpc: "2.0",
        id,
        result: {
          contractVersion: AGENTIC_OS_MCP_CONTRACT_VERSION,
          tools: buildAgenticGraphMcpToolDefinitions(),
        },
      };
    }

    if (rpc.method === "tools/call") {
      if (!rpc.params || typeof rpc.params.name !== "string") {
        return jsonRpcError(id, JSON_RPC_INVALID_REQUEST, "Invalid MCP tools/call request");
      }
      const dispatched = await dispatchAgenticGraphMcpToolCall({
        toolName: rpc.params.name,
        args: rpc.params.arguments ?? {},
        namespace,
      });
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: dispatched.text }],
          structuredContent: dispatched.structuredContent,
          isError: dispatched.ok === false,
        },
      };
    }

    return jsonRpcError(id, JSON_RPC_METHOD_NOT_FOUND, `Unknown method: ${rpc.method}`);
  };

  return { transport, calls, namespace };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/**
 * Minimal MCP Streamable HTTP client bound to a transport seam. Builds the
 * JSON-RPC envelopes a real remote client would POST to the endpoint and
 * unwraps the responses. Used by the connectivity smoke test so the assertion
 * exercises the same request/response shape the deployed transport uses.
 *
 * @param {(req: object) => Promise<object>} transport
 * @param {string} [endpointUrl]
 */
export function createStreamableHttpClient(transport, endpointUrl = MCP_STREAMABLE_HTTP_URL) {
  let nextId = 1;

  async function send(method, params) {
    const id = nextId++;
    const response = await transport({
      url: endpointUrl,
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: { jsonrpc: "2.0", id, method, params },
    });
    if (response && response.error) {
      const err = new Error(response.error.message || "MCP transport error");
      err.code = response.error.code;
      throw err;
    }
    return response ? response.result : undefined;
  }

  return {
    /** Enumerate the reachable tool surface (R14.1). */
    listTools: () => send("tools/list", {}),
    /** Invoke a tool by name over the transport. */
    callTool: (name, args = {}) => send("tools/call", { name, arguments: args }),
  };
}
