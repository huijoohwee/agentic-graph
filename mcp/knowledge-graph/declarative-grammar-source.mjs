import { KnowledgeGraphError } from "./contract.mjs";
import { parseDeclarativeGrammarGraph } from "./declarative-grammar-graph.mjs";
import { compileDeclarativeGrammar } from "./declarative-grammar-parser.mjs";

export function createDeclarativeGrammarSourceParser({
  parserDescriptorForSource,
  sourceNodeFor,
  sourceOnlyFragment,
}) {
  return function parseDeclarativeGrammarSource(source, options) {
    const descriptor = options.parserRegistry?.match(source.relativePath);
    const parserDescriptor = parserDescriptorForSource(source, options);
    const sourceNode = sourceNodeFor(
      source,
      parserDescriptor.parserId,
      parserDescriptor.parserVersion,
      parserDescriptor.fidelity,
      {
        "syntax:grammarDigest": compileDeclarativeGrammar(descriptor?.grammar).digest,
      },
    );
    try {
      return parseDeclarativeGrammarGraph({
        descriptor,
        options,
        parserId: parserDescriptor.parserId,
        parserVersion: parserDescriptor.parserVersion,
        source,
        sourceNode,
      });
    } catch (error) {
      if (!(error instanceof KnowledgeGraphError)
        || ![
          "declarative_grammar_syntax_error",
          "declarative_grammar_tokenize_failed",
        ].includes(error.code)) throw error;
      return {
        ...sourceOnlyFragment(source, parserDescriptor, [{
          code: error.code,
          sourcePath: source.relativePath,
          message: error.message,
          ...(error.details && typeof error.details === "object" ? error.details : {}),
        }]),
        nodes: [sourceNode],
        status: "error",
      };
    }
  };
}
