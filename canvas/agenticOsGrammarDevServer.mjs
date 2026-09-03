import { randomUUID } from "node:crypto";

import {
  AGENTIC_CANVAS_OS_DOCS_CONTROL_PLANE_PATH,
  AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME,
} from "../mcp/agentic-canvas-os-docs-contract.mjs";
import { runAgenticCanvasOsDocsInvokeTool } from "../mcp/agentic-canvas-os-docs-runtime.js";

const MAX_REQUEST_BYTES = 64 * 1024;
const PROTOCOL_VERSION = "2024-11-05";

const readJsonBody = async (request) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) throw new Error("Agentic OS grammar request exceeds the 64 KiB limit");
    chunks.push(chunk);
  }
  const source = Buffer.concat(chunks).toString("utf8");
  return source ? JSON.parse(source) : {};
};

const writeJson = (response, statusCode, body, headers = {}) => {
  response.statusCode = statusCode;
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-type", "application/json; charset=utf-8");
  Object.entries(headers).forEach(([name, value]) => response.setHeader(name, value));
  response.end(JSON.stringify(body));
};

const rpcError = (id, code, message) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

export async function handleAgenticOsGrammarDevRpc(request, {
  rootDir,
  env = process.env,
  sessionId = "",
} = {}) {
  const id = request?.id ?? null;
  if (request?.method === "initialize") {
    const nextSessionId = `agentic-os-docs-${randomUUID()}`;
    return {
      statusCode: 200,
      headers: { "mcp-session-id": nextSessionId },
      body: {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "agentic-graph-local-agentic-os-docs", version: "1" },
        },
      },
    };
  }
  if (request?.method !== "tools/call") {
    return { statusCode: 404, body: rpcError(id, -32601, "Method not found") };
  }
  if (!sessionId) {
    return { statusCode: 400, body: rpcError(id, -32000, "Missing mcp-session-id") };
  }
  const params = request.params && typeof request.params === "object" ? request.params : {};
  if (params.name !== AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME) {
    return { statusCode: 404, body: rpcError(id, -32602, "Unknown Agentic OS docs tool") };
  }
  const args = params.arguments && typeof params.arguments === "object" ? params.arguments : {};
  const payload = await runAgenticCanvasOsDocsInvokeTool(args, { rootDir, env });
  const { absoluteDocsRoot: _privateLocalPath, ...publicPayload } = payload;
  return {
    statusCode: publicPayload.ok ? 200 : 500,
    body: {
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: JSON.stringify(publicPayload) }],
        structuredContent: publicPayload,
        isError: !publicPayload.ok,
      },
    },
  };
}

const createAgenticOsGrammarDevHandler = ({ rootDir, env }) => async (request, response, next) => {
  if (request.method !== "POST") {
    next();
    return;
  }
  try {
    const result = await handleAgenticOsGrammarDevRpc(await readJsonBody(request), {
      rootDir,
      env,
      sessionId: String(request.headers["mcp-session-id"] || "").trim(),
    });
    writeJson(response, result.statusCode, result.body, result.headers);
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "Agentic OS grammar request failed";
    writeJson(response, 400, rpcError(null, -32700, message));
  }
};

export function createAgenticOsGrammarDevPlugin({ rootDir, env = process.env }) {
  const install = (server) => {
    server.middlewares.use(
      AGENTIC_CANVAS_OS_DOCS_CONTROL_PLANE_PATH,
      createAgenticOsGrammarDevHandler({ rootDir, env }),
    );
  };
  return {
    name: "agentic-graph-agentic-os-grammar-dev",
    configureServer: install,
    configurePreviewServer: install,
  };
}
