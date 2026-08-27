import {
  buildAgenticGraphVdeoxplnMarkdown,
  buildAgenticGraphVdeoxplnRegistry,
  buildAgenticGraphVdeoxplnRoutingPlan,
  validateAgenticGraphVdeoxplnRegistry,
} from "../canvas/src/features/agent-ready/agenticgraphVdeoxplnContract.mjs";

export const runVdeoxplnLocalTool = (args = {}) => {
  const includeMarkdown = args.includeMarkdown === true;
  const vdeoxplnId = typeof args.vdeoxplnId === "string" ? args.vdeoxplnId.trim() : "";
  const registry = buildAgenticGraphVdeoxplnRegistry();
  const validation = validateAgenticGraphVdeoxplnRegistry(registry);
  const vdeoxplnEntries = vdeoxplnId
    ? registry.filter((vdeoxpln) => vdeoxpln.id === vdeoxplnId)
    : registry;
  if (vdeoxplnId && vdeoxplnEntries.length === 0) {
    throw new Error(`Unknown AgenticGraph vdeoxpln id: ${vdeoxplnId}`);
  }
  return {
    contractVersion: vdeoxplnEntries[0]?.version || "agenticgraph-vdeoxpln/v0.1",
    validation,
    vdeoxplnEntries: vdeoxplnEntries.map((vdeoxpln) => ({
      id: vdeoxpln.id,
      title: vdeoxpln.title,
      purpose: vdeoxpln.purpose,
      scope: vdeoxpln.scope,
      mutation: vdeoxpln.mutation,
      semanticKey: vdeoxpln.semanticKey,
      triggers: vdeoxpln.triggers,
      owners: vdeoxpln.owners,
      tools: vdeoxpln.tools,
      inputs: vdeoxpln.inputs,
      outputs: vdeoxpln.outputs,
      workflow: vdeoxpln.workflow,
      artifactPolicy: vdeoxpln.artifactPolicy,
      aiPolicy: vdeoxpln.aiPolicy,
      publish: vdeoxpln.publish,
      validation: vdeoxpln.validation,
      markdown: includeMarkdown ? buildAgenticGraphVdeoxplnMarkdown(vdeoxpln) : undefined,
    })),
    routingPlan: buildAgenticGraphVdeoxplnRoutingPlan({
      intentText: typeof args.intentText === "string" ? args.intentText : "",
      contentTypes: Array.isArray(args.contentTypes) ? args.contentTypes : [],
      requestedOutputs: Array.isArray(args.requestedOutputs) ? args.requestedOutputs : [],
      stateSignals: Array.isArray(args.stateSignals) ? args.stateSignals : [],
      chatStorageTarget: typeof args.chatStorageTarget === "string" ? args.chatStorageTarget : "",
      sourceFileCount: Number(args.sourceFileCount || 0),
      hasSourceFiles: Number(args.sourceFileCount || 0) > 0,
      hasGraphData: args.hasGraphData === true,
      hasSelection: args.hasSelection === true,
      hasWorkspaceDocument: args.hasWorkspaceDocument === true,
      registry: vdeoxplnEntries,
    }),
  };
};
