import {
  AGENT_TEAM_INVOCATION,
} from "../contracts/agent-team.schema.js";
import { runAgenticCanvasOsDocsInvokeTool } from "./agentic-canvas-os-docs-runtime.js";

const EXPECTED = Object.freeze([
  { token: AGENT_TEAM_INVOCATION.command, kind: "command" },
  { token: AGENT_TEAM_INVOCATION.semantic, kind: "semantic" },
  { token: AGENT_TEAM_INVOCATION.binding, kind: "binding" },
]);

export async function resolveAgentTeamInvocation(
  invocation,
  {
    rootDir,
    env = process.env,
    docsResolver = (args) => runAgenticCanvasOsDocsInvokeTool(args, { rootDir, env }),
  } = {},
) {
  const requestedRevision = String(invocation?.sourceRevision || "");
  let payload;
  try {
    payload = await docsResolver({ limit: 500, includeContent: false });
  } catch (error) {
    throw Object.assign(new Error("Agentic Canvas OS invocation catalog is unavailable."), {
      code: "invocation_catalog_unavailable",
      details: { reason: error instanceof Error ? error.message : String(error) },
    });
  }
  if (!payload?.ok || payload.sourceRevision !== requestedRevision) {
    throw Object.assign(new Error("Agentic Canvas OS invocation source revision does not match the requested fence."), {
      code: "invocation_source_revision_mismatch",
      details: { expected: requestedRevision, actual: payload?.sourceRevision || null },
    });
  }
  const catalog = Array.isArray(payload.catalog) ? payload.catalog : [];
  const resolved = EXPECTED.map((expected) => {
    const entry = catalog.find((candidate) => candidate?.token === expected.token);
    if (!entry || entry.kind !== expected.kind) {
      throw Object.assign(new Error(`Canonical agent-team token is unavailable: ${expected.token}`), {
        code: "invocation_contract_unavailable",
        details: { token: expected.token, expectedKind: expected.kind },
      });
    }
    return {
      token: entry.token,
      kind: entry.kind,
      sourcePath: String(entry.sourcePath || ""),
      sourceUrl: String(entry.sourceUrl || ""),
    };
  });
  return Object.freeze({
    sourceRevision: requestedRevision,
    invocation: AGENT_TEAM_INVOCATION.text,
    entries: Object.freeze(resolved),
  });
}
