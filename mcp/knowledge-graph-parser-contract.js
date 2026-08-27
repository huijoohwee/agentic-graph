export const KNOWLEDGE_GRAPH_PARSER_REGISTRY_SCHEMA_ID =
  "agenticgraph-knowledge-graph-parser-registry/v2";

export const KNOWLEDGE_GRAPH_DECLARATIVE_GRAMMAR_SCHEMA_ID =
  "agenticgraph-declarative-grammar/v1";

export const KNOWLEDGE_GRAPH_DEFAULT_PARSER_PROFILE = "default-source";

export const NATIVE_KNOWLEDGE_GRAPH_PARSER_ADAPTERS = Object.freeze({
  "brace-code": "structural-parser",
  "declarative-grammar": "ast",
  inventory: "inventory-only",
  "json-config": "ast",
  markdown: "structural-parser",
  pdf: "native-converted-structure",
  python: "ast",
  sql: "structural-parser",
  "structural-config": "structural-parser",
  typescript: "ast",
});

export const NATIVE_KNOWLEDGE_GRAPH_PARSER_ADAPTER_IDENTITIES = Object.freeze(
  Object.keys(NATIVE_KNOWLEDGE_GRAPH_PARSER_ADAPTERS).sort(),
);

const SAFE_TOKEN_PATTERN = "^[a-z0-9][a-z0-9._-]{0,127}$";
const SAFE_EXTENSION_PATTERN = "^\\.[a-z0-9][a-z0-9.+_-]{0,31}$";
const SAFE_BASENAME_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$";
const SAFE_BASENAME_FAMILY_PATTERN = "^\\.[A-Za-z0-9][A-Za-z0-9_-]{1,63}$";

const KNOWLEDGE_GRAPH_GRAMMAR_TERM_SCHEMA = Object.freeze({
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["token"],
      properties: {
        token: { type: "string", pattern: SAFE_TOKEN_PATTERN },
        capture: { type: "string", pattern: SAFE_TOKEN_PATTERN },
        min: { type: "integer", minimum: 0, maximum: 256 },
        max: { type: "integer", minimum: 1, maximum: 256 },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["rule"],
      properties: {
        rule: { type: "string", pattern: SAFE_TOKEN_PATTERN },
        capture: { type: "string", pattern: SAFE_TOKEN_PATTERN },
        min: { type: "integer", minimum: 0, maximum: 256 },
        max: { type: "integer", minimum: 1, maximum: 256 },
      },
    },
  ],
});

export const KNOWLEDGE_GRAPH_DECLARATIVE_GRAMMAR_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["schema", "start", "tokens", "rules"],
  properties: {
    schema: { const: KNOWLEDGE_GRAPH_DECLARATIVE_GRAMMAR_SCHEMA_ID },
    start: { type: "string", pattern: SAFE_TOKEN_PATTERN },
    tokens: {
      type: "array",
      minItems: 1,
      maxItems: 64,
      items: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["id", "literal"],
            properties: {
              id: { type: "string", pattern: SAFE_TOKEN_PATTERN },
              literal: { type: "string", minLength: 1, maxLength: 64 },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["id", "kind"],
            properties: {
              id: { type: "string", pattern: SAFE_TOKEN_PATTERN },
              kind: {
                type: "string",
                enum: ["identifier", "newline", "number", "string", "whitespace"],
              },
              skip: { type: "boolean" },
            },
          },
        ],
      },
    },
    rules: {
      type: "array",
      minItems: 1,
      maxItems: 128,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "alternatives"],
        properties: {
          id: { type: "string", pattern: SAFE_TOKEN_PATTERN },
          alternatives: {
            type: "array",
            minItems: 1,
            maxItems: 32,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["sequence"],
              properties: {
                sequence: {
                  type: "array",
                  minItems: 1,
                  maxItems: 64,
                  items: KNOWLEDGE_GRAPH_GRAMMAR_TERM_SCHEMA,
                },
              },
            },
          },
        },
      },
    },
  },
});

const boundedMatcherArray = (pattern) => ({
  type: "array",
  items: { type: "string", pattern },
  maxItems: 64,
  uniqueItems: true,
});

const NATIVE_ADAPTER_FIDELITY_SCHEMA = Object.freeze({
  oneOf: Object.entries(NATIVE_KNOWLEDGE_GRAPH_PARSER_ADAPTERS)
    .map(([adapter, fidelity]) => ({
      required: ["adapter", "fidelity"],
      properties: {
        adapter: { const: adapter },
        fidelity: { const: fidelity },
      },
    })),
});

const INERT_MATCHER_REQUIRED_SCHEMA = Object.freeze({
  anyOf: [
    {
      required: ["extensions"],
      properties: { extensions: { minItems: 1 } },
    },
    {
      required: ["basenames"],
      properties: { basenames: { minItems: 1 } },
    },
    {
      required: ["basenameFamilies"],
      properties: { basenameFamilies: { minItems: 1 } },
    },
  ],
});

export const KNOWLEDGE_GRAPH_PARSER_DESCRIPTOR_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "kind",
    "adapter",
    "fidelity",
    "extensions",
    "basenames",
    "basenameFamilies",
    "priority",
  ],
  properties: {
    id: { type: "string", pattern: SAFE_TOKEN_PATTERN },
    kind: { type: "string", pattern: SAFE_TOKEN_PATTERN },
    adapter: {
      type: "string",
      enum: NATIVE_KNOWLEDGE_GRAPH_PARSER_ADAPTER_IDENTITIES,
    },
    fidelity: {
      type: "string",
      enum: [...new Set(Object.values(NATIVE_KNOWLEDGE_GRAPH_PARSER_ADAPTERS))].sort(),
    },
    extensions: boundedMatcherArray(SAFE_EXTENSION_PATTERN),
    basenames: boundedMatcherArray(SAFE_BASENAME_PATTERN),
    basenameFamilies: boundedMatcherArray(SAFE_BASENAME_FAMILY_PATTERN),
    priority: { type: "integer", minimum: -1000, maximum: 1000 },
    grammar: KNOWLEDGE_GRAPH_DECLARATIVE_GRAMMAR_SCHEMA,
  },
  allOf: [
    NATIVE_ADAPTER_FIDELITY_SCHEMA,
    INERT_MATCHER_REQUIRED_SCHEMA,
    {
      if: {
        properties: { adapter: { const: "declarative-grammar" } },
        required: ["adapter"],
      },
      then: { required: ["grammar"] },
      else: { not: { required: ["grammar"] } },
    },
  ],
});

export const KNOWLEDGE_GRAPH_PARSER_REGISTRY_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["schema", "digest", "descriptors"],
  properties: {
    schema: { const: KNOWLEDGE_GRAPH_PARSER_REGISTRY_SCHEMA_ID },
    digest: { type: "string", pattern: "^[0-9a-f]{64}$" },
    descriptors: {
      type: "array",
      minItems: 1,
      maxItems: 128,
      items: KNOWLEDGE_GRAPH_PARSER_DESCRIPTOR_SCHEMA,
    },
  },
});

export const KNOWLEDGE_GRAPH_PARSER_GENERATE_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  oneOf: [
    { required: ["profile"], not: { required: ["descriptors"] } },
    { required: ["descriptors"], not: { required: ["profile"] } },
  ],
  properties: {
    profile: {
      const: KNOWLEDGE_GRAPH_DEFAULT_PARSER_PROFILE,
      description:
        "Return the digest-pinned built-in source parser registry without copying its descriptors into the request.",
    },
    descriptors: {
      type: "array",
      minItems: 1,
      maxItems: 128,
      items: {
        ...KNOWLEDGE_GRAPH_PARSER_DESCRIPTOR_SCHEMA,
        required: ["id", "kind", "adapter", "fidelity"],
      },
    },
  },
});
