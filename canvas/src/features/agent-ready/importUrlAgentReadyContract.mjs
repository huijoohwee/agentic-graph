export const IMPORT_URL_AGENT_READY_TOOL_IDS = Object.freeze({
  controlLocalImportUrl: 'control_local_import_url',
})

export const IMPORT_URL_AGENT_READY_MCP_TOOL_NAME = 'agenticgraph.control_local_import_url'

const IMPORT_URL_MUTATION_TOOL_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: true,
  idempotentHint: false,
})

export const buildImportUrlAgentReadyToolContracts = ({ buildWebName }) => [{
  name: IMPORT_URL_AGENT_READY_TOOL_IDS.controlLocalImportUrl,
  webName: buildWebName(IMPORT_URL_AGENT_READY_TOOL_IDS.controlLocalImportUrl),
  title: 'Import URL into Local Workspace',
  description: 'Import one HTTP(S) URL into the active browser-local Editor Workspace through the same canonical runtime as Launch → Import URL. Accepts structured fields or the strict /ingest-url @url:https://example.com @reference-policy #canvas invocation. Failed calls that partially changed the workspace return typed mutation evidence and must be inspected before retry.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      invocation: {
        type: 'string',
        minLength: 1,
        maxLength: 8192,
        pattern: '\\S',
        description: 'Strict native invocation: /ingest-url @url:https://example.com @reference-policy #canvas.',
      },
      url: {
        type: 'string',
        minLength: 1,
        maxLength: 4096,
        pattern: '^[Hh][Tt][Tt][Pp][Ss]?://',
        description: 'HTTP(S) source URL without embedded credentials.',
      },
      canvas2dRenderer: {
        type: 'string',
        enum: ['d3', 'design', 'storyboard'],
      },
      documentSemanticMode: {
        type: 'string',
        enum: ['document', 'keyword'],
        description: 'Requires canvas2dRenderer when supplied.',
      },
    },
    oneOf: [
      {
        required: ['invocation'],
        not: {
          anyOf: [
            { required: ['url'] },
            { required: ['canvas2dRenderer'] },
            { required: ['documentSemanticMode'] },
          ],
        },
      },
      {
        required: ['url'],
        not: { required: ['invocation'] },
        anyOf: [
          { not: { required: ['documentSemanticMode'] } },
          { required: ['canvas2dRenderer'] },
        ],
      },
    ],
  },
  outputSchema: {
    oneOf: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          source: { type: 'string', minLength: 1, pattern: '^https?://' },
          invocation: { type: 'string', minLength: 1, pattern: '^/ingest-url\\s+@url:' },
          createdPaths: {
            type: 'array',
            minItems: 1,
            uniqueItems: true,
            items: { type: 'string', minLength: 1 },
          },
          removedPaths: {
            type: 'array',
            uniqueItems: true,
            items: { type: 'string', minLength: 1 },
          },
          renderer: {
            oneOf: [
              { type: 'string', enum: ['d3', 'design', 'storyboard'] },
              { type: 'null' },
            ],
          },
          documentSemanticMode: {
            oneOf: [
              { type: 'string', enum: ['document', 'keyword'] },
              { type: 'null' },
            ],
          },
          outputText: { type: 'string', minLength: 1 },
        },
        required: ['source', 'invocation', 'createdPaths', 'removedPaths', 'renderer', 'documentSemanticMode', 'outputText'],
      },
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { const: 'knowledge-graph' },
          source: { type: 'string', minLength: 1, pattern: '^https?://' },
          invocation: { type: 'string', minLength: 1, pattern: '^/ingest-url\\s+@url:' },
          renderer: {
            oneOf: [
              { type: 'string', enum: ['d3', 'design', 'storyboard'] },
              { type: 'null' },
            ],
          },
          documentSemanticMode: {
            oneOf: [
              { type: 'string', enum: ['document', 'keyword'] },
              { type: 'null' },
            ],
          },
          graphId: { type: 'string', pattern: '^kg:graph:[0-9a-f]{32}$' },
          snapshotDigest: { type: 'string', pattern: '^[0-9a-f]{64}$' },
          complete: { const: true },
          counts: {
            type: 'object',
            additionalProperties: false,
            properties: {
              sources: { type: 'integer', minimum: 0 },
              nodes: { type: 'integer', minimum: 0 },
              edges: { type: 'integer', minimum: 0 },
            },
            required: ['sources', 'nodes', 'edges'],
          },
          projectionToken: { type: 'string', pattern: '^kg:projection:[0-9a-f]{24}$' },
          projectionComplete: { type: 'boolean' },
          projectionTruncated: { type: 'boolean' },
          projectionLimit: { type: 'integer', minimum: 1, maximum: 1000 },
          projectionReason: { type: 'string', minLength: 1, maxLength: 1024 },
          projectionCounts: {
            type: 'object',
            additionalProperties: false,
            properties: {
              nodes: { type: 'integer', minimum: 0, maximum: 2000 },
              edges: { type: 'integer', minimum: 0, maximum: 5000 },
            },
            required: ['nodes', 'edges'],
          },
          outputText: { type: 'string', minLength: 1 },
        },
        required: [
          'kind',
          'source',
          'invocation',
          'renderer',
          'documentSemanticMode',
          'graphId',
          'snapshotDigest',
          'complete',
          'counts',
          'projectionToken',
          'projectionComplete',
          'projectionTruncated',
          'projectionLimit',
          'projectionCounts',
          'outputText',
        ],
      },
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { const: 'error' },
          source: { type: 'string', minLength: 1, pattern: '^https?://' },
          invocation: { type: 'string', minLength: 1, pattern: '^/ingest-url\\s+@url:' },
          createdPaths: {
            type: 'array',
            uniqueItems: true,
            items: { type: 'string', minLength: 1 },
          },
          removedPaths: {
            type: 'array',
            uniqueItems: true,
            items: { type: 'string', minLength: 1 },
          },
          renderer: {
            oneOf: [
              { type: 'string', enum: ['d3', 'design', 'storyboard'] },
              { type: 'null' },
            ],
          },
          documentSemanticMode: {
            oneOf: [
              { type: 'string', enum: ['document', 'keyword'] },
              { type: 'null' },
            ],
          },
          mutationState: { type: 'string', enum: ['partial', 'unknown'] },
          error: { type: 'string', minLength: 1 },
          outputText: { type: 'string', minLength: 1 },
        },
        required: [
          'status',
          'source',
          'invocation',
          'createdPaths',
          'removedPaths',
          'renderer',
          'documentSemanticMode',
          'mutationState',
          'error',
          'outputText',
        ],
      },
    ],
  },
  annotations: IMPORT_URL_MUTATION_TOOL_ANNOTATIONS,
}]
