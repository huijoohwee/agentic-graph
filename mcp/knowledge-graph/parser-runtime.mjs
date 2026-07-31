import { KnowledgeGraphError, knowledgeGraphFailure } from "./contract.mjs";
import { KNOWLEDGE_GRAPH_DEFAULT_PARSER_PROFILE } from "../knowledge-graph-parser-contract.js";
import {
  PORTABLE_SOURCE_PARSER_REGISTRY,
  SOURCE_PARSER_REGISTRY,
  compileSourceParserRegistry,
  portableSourceParserRegistry,
  verifyPortableSourceParserRegistry,
} from "./source-parser-registry.mjs";

const PARSER_RESULT_SCHEMA = "knowgrph-knowledge-graph-parser-generate/v1";

function parserRegistryForGeneration(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new KnowledgeGraphError(
      "parser_generate_invalid",
      "parser_generate requires one built-in profile or one descriptor array.",
    );
  }
  const unsupportedKeys = Object.keys(args)
    .filter((key) => key !== "profile" && key !== "descriptors");
  if (unsupportedKeys.length) {
    throw new KnowledgeGraphError(
      "parser_generate_invalid",
      "parser_generate accepts only profile or descriptors.",
      { keys: unsupportedKeys.sort() },
    );
  }
  const hasProfile = Object.hasOwn(args, "profile");
  const hasDescriptors = Object.hasOwn(args, "descriptors");
  if (hasProfile === hasDescriptors) {
    throw new KnowledgeGraphError(
      "parser_generate_invalid",
      "parser_generate requires exactly one of profile or descriptors.",
    );
  }
  if (hasProfile) {
    if (args.profile !== KNOWLEDGE_GRAPH_DEFAULT_PARSER_PROFILE) {
      throw new KnowledgeGraphError(
        "parser_profile_unsupported",
        "parser_generate profile is not supported by the local runtime.",
        { profile: String(args.profile || "") },
      );
    }
    return SOURCE_PARSER_REGISTRY;
  }
  return compileSourceParserRegistry(args.descriptors);
}

export function generateKnowledgeGraphParser(args = {}) {
  try {
    const parserRegistry = parserRegistryForGeneration(args);
    return {
      schema: PARSER_RESULT_SCHEMA,
      ok: true,
      operation: "parser_generate",
      parserRegistryDigest: parserRegistry.digest,
      parserRegistry: parserRegistry === SOURCE_PARSER_REGISTRY
        ? PORTABLE_SOURCE_PARSER_REGISTRY
        : portableSourceParserRegistry(parserRegistry),
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
