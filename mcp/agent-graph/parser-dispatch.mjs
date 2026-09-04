import { checkAgentGraphBudget, AgentGraphError } from "./contract.mjs";
import { compileParserDispatch } from "./parser-generator.mjs";
import { SOURCE_PARSER_REGISTRY } from "./source-parser-registry.mjs";

export const createParserDispatch = (parserRegistry, adapters) => (
  compileParserDispatch(parserRegistry, adapters)
);

export async function parseSourceWithDispatch(source, options, {
  adapters,
  assertParserFragmentBounds,
  boundedParserOptions,
  defaultDispatch,
  parserDescriptorForSource,
  sourceOnlyFragment,
}) {
  const boundedOptions = boundedParserOptions(source, options);
  const parserRegistry = boundedOptions.parserRegistry || SOURCE_PARSER_REGISTRY;
  const parserDispatch = boundedOptions.parserDispatch || (
    parserRegistry === SOURCE_PARSER_REGISTRY
      ? defaultDispatch
      : createParserDispatch(parserRegistry, adapters)
  );
  if (parserDispatch.registryDigest !== parserRegistry.digest) {
    throw new AgentGraphError(
      "parser_registry_digest_mismatch",
      "Parser dispatch does not match the verified parser registry.",
    );
  }
  checkAgentGraphBudget({ ...boundedOptions, stage: "source-parser-start" });
  if (source.status === "skipped" || source.status === "unsupported") {
    return assertParserFragmentBounds(
      source,
      sourceOnlyFragment(source, parserDescriptorForSource(source, boundedOptions)),
      boundedOptions,
    );
  }
  const matchedDescriptor = parserRegistry.match(source.relativePath);
  if (!matchedDescriptor) {
    const verifiedInventoryFallback = source.status === "ready"
      && source.kind === "inventory"
      && source.parserAdapter === "inventory"
      && source.parserDescriptorId === "inventory-fallback"
      && source.parserRegistryDigest === parserRegistry.digest;
    if (!verifiedInventoryFallback) {
      throw new AgentGraphError(
        "parser_registry_route_mismatch",
        `Unregistered source did not carry the verified inventory fallback route: ${source.relativePath}.`,
      );
    }
    return assertParserFragmentBounds(
      source,
      sourceOnlyFragment(source, parserDescriptorForSource(source, boundedOptions), []),
      boundedOptions,
    );
  }
  const fragment = await parserDispatch.parse(source, boundedOptions);
  checkAgentGraphBudget({ ...boundedOptions, stage: "source-parser-complete" });
  return assertParserFragmentBounds(source, fragment, boundedOptions);
}
