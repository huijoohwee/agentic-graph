import { createAgentRegistry } from "./agent-registry.mjs";
import { validateAgentDefinition } from "./definition-validator.mjs";
import { handleMcpCommand } from "./mcp-surface.mjs";
import { projectRegistryCanvas, renderRegistryCanvas } from "./registry-canvas.mjs";
import { validateStartupConfig } from "../runtime/startup-config.mjs";
import { boundaryReport } from "../runtime/deploy-boundary.mjs";

export function createAgenticCommerceRuntime(options = {}) {
  const registry = createAgentRegistry();
  const validator = (definition) => validateAgentDefinition(definition, { schemaProvider: options.schemaProvider });
  return {
    registry,
    validator,
    startup: validateStartupConfig(options.env ?? {}),
    boundary: boundaryReport(),
    mcp(command, args) {
      return handleMcpCommand(command, args, { registry, validator });
    },
    registryCanvas(canvasOptions = {}) {
      return renderRegistryCanvas(projectRegistryCanvas(registry.listDefinitions(), canvasOptions), canvasOptions);
    },
  };
}
