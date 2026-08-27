import {
  AGENT_RUN_OUTPUT_SCHEMA_ID,
  executeAgentRun,
} from "../../../contracts/agent-runtime.schema.js";
import { createWorkersAiRunningAgentRuntime } from "./agent-runtime-adapter";
import { readBoundedJsonResult } from "./bounded-json.mjs";
import { readRunManifestThroughNamespace } from "./run-manifest-store.mjs";

export const AGENTS_PATH = "/agenticgraph/control-plane/agents";
export const AGENT_RUNS_PATH = `${AGENTS_PATH}/runs`;

const MAX_AGENT_RUN_BODY_BYTES = 64 * 1024;

export type AgentRuntimeHttpEnv = Env & {
  AGENTICGRAPH_AGENT_RUNTIME_BEARER_TOKEN?: string;
  AGENTICGRAPH_AGENT_MODEL_ID?: string;
};

export type RuntimeAuthorization = {
  ok: boolean;
  status: number;
  code?: string;
};

export const runtimeJsonResponse = (
  body: unknown,
  init?: ResponseInit,
): Response =>
  new Response(JSON.stringify(body, null, 2), {
    status: init?.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "vary": "authorization, origin",
      ...(init?.headers ?? {}),
    },
  });

async function timingSafeTokenMatch(
  actual: string,
  expected: string,
): Promise<boolean> {
  if (!actual || !expected) return false;
  const encoder = new TextEncoder();
  const algorithm = { name: "HMAC", hash: "SHA-256" };
  const expectedKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(expected),
    algorithm,
    false,
    ["sign"],
  );
  const actualKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(actual),
    algorithm,
    false,
    ["verify"],
  );
  const message = encoder.encode("agenticgraph-agent-runtime");
  const signature = await crypto.subtle.sign(
    algorithm.name,
    expectedKey,
    message,
  );
  return crypto.subtle.verify(algorithm.name, actualKey, signature, message);
}

export async function authorizeRuntimeRequest(
  request: Request,
  env: AgentRuntimeHttpEnv,
): Promise<RuntimeAuthorization> {
  const expected = String(
    env.AGENTICGRAPH_AGENT_RUNTIME_BEARER_TOKEN || "",
  ).trim();
  if (!expected) {
    return {
      ok: false,
      status: 503,
      code: "runtime_auth_not_configured",
    };
  }
  const header = request.headers.get("authorization") || "";
  const actual = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : "";
  return (await timingSafeTokenMatch(actual, expected))
    ? { ok: true, status: 200 }
    : { ok: false, status: 401, code: "unauthorized" };
}

function authorizationFailure(
  authorization: RuntimeAuthorization,
): Response {
  return runtimeJsonResponse(
    { error: { code: authorization.code } },
    {
      status: authorization.status,
      headers:
        authorization.status === 401
          ? { "www-authenticate": "Bearer" }
          : undefined,
    },
  );
}

export async function handleAgentRun(
  request: Request,
  env: AgentRuntimeHttpEnv,
): Promise<Response> {
  const authorization = await authorizeRuntimeRequest(request, env);
  if (!authorization.ok) return authorizationFailure(authorization);

  const parsed = await readBoundedJsonResult(request, MAX_AGENT_RUN_BODY_BYTES);
  if ("reason" in parsed && parsed.reason === "too_large") {
    return runtimeJsonResponse(
      { error: { code: "request_too_large" } },
      { status: 413 },
    );
  }
  if ("reason" in parsed && parsed.reason === "read_failed") {
    return runtimeJsonResponse(
      { error: { code: "request_read_failed" } },
      { status: 400 },
    );
  }
  if (!("value" in parsed) || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return runtimeJsonResponse(
      { error: { code: "invalid_json" } },
      { status: 400 },
    );
  }
  const input = parsed.value as Record<string, unknown>;

  const result = await executeAgentRun(input, {
    ...createWorkersAiRunningAgentRuntime(env),
  });
  const payload = result.payload || {
    contractVersion: AGENT_RUN_OUTPUT_SCHEMA_ID,
    status: "blocked",
    error: result.error,
  };
  const runId =
    "runId" in payload && typeof payload.runId === "string"
      ? payload.runId
      : null;
  const agentDefinitionId =
    "agentDefinitionId" in payload &&
    typeof payload.agentDefinitionId === "string"
      ? payload.agentDefinitionId
      : null;
  const mode =
    "mode" in payload && typeof payload.mode === "string"
      ? payload.mode
      : String(input.mode || "dry-run");
  const paidProviderCalls =
    "budgetMeters" in payload &&
    payload.budgetMeters &&
    typeof payload.budgetMeters === "object" &&
    "paidProviderCalls" in payload.budgetMeters &&
    typeof payload.budgetMeters.paidProviderCalls === "number"
      ? payload.budgetMeters.paidProviderCalls
      : 0;
  console.log(
    JSON.stringify({
      event: "agenticgraph.agent.run",
      runId,
      agentDefinitionId,
      mode,
      status: payload.status,
      paidProviderCalls,
    }),
  );
  const status =
    payload.status === "approval_required" ? 403 : result.ok ? 200 : 400;
  return runtimeJsonResponse(payload, { status });
}

export async function handleRunsRead(
  request: Request,
  env: AgentRuntimeHttpEnv,
  runId: string,
): Promise<Response> {
  const authorization = await authorizeRuntimeRequest(request, env);
  if (!authorization.ok) return authorizationFailure(authorization);
  if (!env.RUN_MANIFEST_STORE) {
    return runtimeJsonResponse(
      {
        error: "run_manifest_store_unbound",
        message: "RUN_MANIFEST_STORE Durable Object binding is missing.",
      },
      { status: 500 },
    );
  }

  const trimmed = runId.trim();
  if (!trimmed) {
    return runtimeJsonResponse(
      { error: "missing_run_id", message: "runId is required." },
      { status: 400 },
    );
  }
  try {
    const record = await readRunManifestThroughNamespace(
      env.RUN_MANIFEST_STORE,
      trimmed,
    );
    if (!record) {
      return runtimeJsonResponse(
        { error: "run_not_found", runId: trimmed },
        { status: 404 },
      );
    }
    return runtimeJsonResponse(record);
  } catch (error) {
    return runtimeJsonResponse(
      {
        error: "run_manifest_read_failed",
        runId: trimmed,
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
