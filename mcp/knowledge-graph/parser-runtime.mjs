import { KnowledgeGraphError, knowledgeGraphFailure } from "./contract.mjs";
import {
  SOURCE_PARSER_REGISTRY,
  compileSourceParserRegistry,
  portableSourceParserRegistry,
  verifyPortableSourceParserRegistry,
} from "./source-parser-registry.mjs";

const PARSER_RESULT_SCHEMA = "knowgrph-knowledge-graph-parser-generate/v1";

export function generateKnowledgeGraphParser(args = {}) {
  try {
    const descriptors = args && typeof args === "object" && !Array.isArray(args)
      ? args.descriptors
      : null;
    const parserRegistry = compileSourceParserRegistry(descriptors);
    return {
      schema: PARSER_RESULT_SCHEMA,
      ok: true,
      operation: "parser_generate",
      parserRegistryDigest: parserRegistry.digest,
      parserRegistry: portableSourceParserRegistry(parserRegistry),
    };
  } catch (error) {
    return {
      schema: PARSER_RESULT_SCHEMA,
      operation: "parser_generate",
      ...knowledgeGraphFailure(error),
    };
  }
}

export function parserRegistryForIngest(args) {
  const hasRegistry = Object.hasOwn(args, "parserRegistry");
  const expectedDigest = String(args.expectedParserRegistryDigest || "").trim();
  if (!hasRegistry) {
    if (expectedDigest) {
      throw new KnowledgeGraphError(
        "parser_registry_required",
        "expectedParserRegistryDigest requires its generated parserRegistry.",
      );
    }
    return SOURCE_PARSER_REGISTRY;
  }
  if (!expectedDigest) {
    throw new KnowledgeGraphError(
      "parser_registry_digest_required",
      "expectedParserRegistryDigest is required with parserRegistry.",
    );
  }
  return verifyPortableSourceParserRegistry(args.parserRegistry, expectedDigest);
}
