export const SEARCH_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: true,
  required: ['ids', 'results'],
  properties: {
    ids: {
      type: 'array',
      items: { type: 'string' },
    },
    results: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        required: ['id', 'title', 'url'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          url: { type: 'string' },
          snippet: { type: 'string' },
          workspaceId: { type: 'string' },
          canonicalPath: { type: 'string' },
        },
      },
    },
  },
})

export const FETCH_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: true,
  required: ['id', 'title', 'content', 'text', 'url'],
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    content: { type: 'string' },
    text: { type: 'string' },
    url: { type: 'string' },
    metadata: {
      type: 'object',
      additionalProperties: true,
    },
  },
})

export const RUNTIME_IDENTITY_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['identity', 'gate'],
  properties: {
    identity: {
      type: 'object',
      additionalProperties: true,
      required: [
        'schema', 'device', 'branch', 'agenticgraphRevision', 'agenticCanvasOsRevision',
        'catalogRevision', 'catalogDigest', 'catalogHydration', 'catalogCounts', 'agentLiveProviderProof',
        'progressiveAgentsReadiness',
      ],
    },
    gate: {
      type: 'object',
      additionalProperties: true,
      required: [
        'schema', 'status', 'transportStatus', 'requiredDeviceCount',
        'observedDeviceCount', 'expiresAtMs', 'verificationDigest', 'message', 'differences',
      ],
    },
  },
})
