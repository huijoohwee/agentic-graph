import { runAgenticCanvasOsDocsInvokeTool } from "./agentic-canvas-os-docs-runtime.js";
import { AGENTIC_CANVAS_OS_ROUTING_SCHEMA_ID } from "./agent-graph-tool-contract.js";

const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;

const sameTokens = (left, right) => (
  Array.isArray(left)
  && Array.isArray(right)
  && left.length === right.length
  && left.every((token, index) => token === right[index])
);

const isPinnedDictionaryEntry = (entry, sourceRevision, kind) => {
  const fileName = {
    command: "DICTIONARY-COMMAND.md",
    semantic: "DICTIONARY-SEMANTIC.md",
    binding: "DICTIONARY-BINDING.md",
  }[kind];
  return entry?.kind === kind
    && typeof entry.sourcePath === "string"
    && entry.sourcePath.startsWith(`${fileName}#`)
    && typeof entry.sourceUrl === "string"
    && entry.sourceUrl.includes(`/blob/${sourceRevision}/docs/${fileName}#`);
};

const proofFromPayload = (payload) => ({
  sourceRevision: String(payload?.sourceRevision || ""),
  catalogDigest: String(payload?.catalogDigest || ""),
  routingSchema: String(payload?.routingSchema || ""),
  routingDigest: String(payload?.routingDigest || ""),
});

const proofMatches = (left, right) => (
  left.sourceRevision === right.sourceRevision
  && left.catalogDigest === right.catalogDigest
  && left.routingSchema === right.routingSchema
  && left.routingDigest === right.routingDigest
);

const defaultDocsResolver = (token, options) => runAgenticCanvasOsDocsInvokeTool(
  { token, includeContent: false },
  options,
);

export async function verifyAgentGraphInvocation(
  toolName,
  invocation,
  {
    rootDir,
    env = process.env,
    docsResolver = defaultDocsResolver,
  } = {},
) {
  if (!invocation) return "";
  const expectedProof = {
    sourceRevision: String(invocation.sourceRevision || ""),
    catalogDigest: String(invocation.catalogDigest || ""),
    routingSchema: String(invocation.routingSchema || ""),
    routingDigest: String(invocation.routingDigest || ""),
  };
  if (
    !SHA40.test(expectedProof.sourceRevision)
    || !SHA256.test(expectedProof.catalogDigest)
    || expectedProof.routingSchema !== AGENTIC_CANVAS_OS_ROUTING_SCHEMA_ID
    || !SHA256.test(expectedProof.routingDigest)
  ) {
    return "invocation routing proof is malformed";
  }

  const tokens = [
    invocation.action,
    ...invocation.semantics,
    ...invocation.bindings,
  ];
  let payloads;
  try {
    payloads = await Promise.all(tokens.map((token) => (
      docsResolver(token, { rootDir, env })
    )));
  } catch {
    return "invocation source authority could not be verified";
  }
  if (payloads.length !== tokens.length) {
    return "invocation source resolution is incomplete";
  }
  for (let index = 0; index < payloads.length; index += 1) {
    const payload = payloads[index];
    const entry = payload?.invocation;
    if (
      payload?.ok !== true
      || entry?.token !== tokens[index]
      || !proofMatches(proofFromPayload(payload), expectedProof)
    ) {
      return "invocation source revision or routing digest does not match the authoritative catalog";
    }
  }

  const [command, ...related] = payloads.map((payload) => payload.invocation);
  const commandTools = command?.mcpTools || (command?.mcpTool ? [command.mcpTool] : []);
  if (
    !isPinnedDictionaryEntry(command, expectedProof.sourceRevision, "command")
    || !commandTools.includes(toolName)
    || !sameTokens(command.semantics, invocation.semantics)
    || !sameTokens(command.bindings, invocation.bindings)
  ) {
    return "invocation command is not bound to the requested MCP tool and exact related tokens";
  }
  const semanticCount = invocation.semantics.length;
  if (
    related.slice(0, semanticCount).some((entry) => (
      !isPinnedDictionaryEntry(entry, expectedProof.sourceRevision, "semantic")
    ))
    || related.slice(semanticCount).some((entry) => (
      !isPinnedDictionaryEntry(entry, expectedProof.sourceRevision, "binding")
    ))
  ) {
    return "invocation related tokens are not source-backed dictionary entries";
  }
  return "";
}
