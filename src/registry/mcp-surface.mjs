export const MCP_COMMANDS = Object.freeze([
  "registerAgent",
  "deregisterAgent",
  "listRegistry",
  "routeIntent",
]);

export async function handleMcpCommand(command, args, runtime) {
  if (!MCP_COMMANDS.includes(command)) {
    return { status: "rejected", reason: "unsupported-command" };
  }

  if (command === "registerAgent") {
    const validation = await runtime.validator(args.definition);
    return runtime.registry.register(args.definition, validation);
  }

  if (command === "deregisterAgent") {
    return runtime.registry.remove(args.agentId);
  }

  if (command === "listRegistry") {
    return { status: "ok", definitions: runtime.registry.listDefinitions() };
  }

  return runtime.registry.route(args.intent, { sessionId: args.sessionId });
}
