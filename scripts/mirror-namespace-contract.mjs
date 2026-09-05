export const CANONICAL_MIRROR_NAMESPACE = 'agentic-graph'
export const LEGACY_PRODUCT_NAMESPACES = Object.freeze(['agenticgraph', 'knowgrph'])

// These roots are only lookup keys for their sealed inventories below. A root
// prefix is never deletion authority on its own.
export const LEGACY_MIRROR_DIRECTORY_ROOTS = Object.freeze([
  'content/agenticgraph',
  'agenticgraph',
  'functions/agenticgraph',
])

// These paths may be removed only with a non-recursive rmdir after the sealed
// file inventory has been reconciled. They are never a recursive deletion
// authority, so unexpected sibling content remains protected.
export const LEGACY_MIRROR_EMPTY_DIRECTORY_ROOTS = Object.freeze([
  ...LEGACY_MIRROR_DIRECTORY_ROOTS,
  'image/agenticgraph',
  'image/knowgrph',
  'content/knowgrph',
  'docs_/agenticgraph',
])

// Path and byte seals are rooted at protected mirror revision 6c6c3c73f367e2ecd9e67237da7bcf2b9ffc2f52.
export const LEGACY_MIRROR_ROOT_INVENTORIES = Object.freeze({
  'content/agenticgraph': Object.freeze({
    count: 874,
    digest: '210a4838fcbf1c9503cfc4d3cfdbed8fed5826809468378b5460841fdba52d45',
    contentDigest: '625be14adc69e23a018c66d1b84447dc9c702424048aa5d01018b38cd8ca8b76',
  }),
  agenticgraph: Object.freeze({
    count: 858,
    digest: '9a88958ceeb41da608bd91770d27bbee79d35afb0ce3c9c6159e2685de351b88',
    contentDigest: 'c51951162c79d5cd3631e3eccae09c89c0a2e63e83442efb9189d2b1d4f96dc4',
  }),
  'functions/agenticgraph': Object.freeze({
    count: 9,
    digest: '8c1d5d2e68c6c9fe74210e2f2dcd8432f117aed89b90db0eae00e1694ce6f584',
    contentDigest: '4c06314add69d2d9281b70d856b680f4ef60cc102740acc3052c03cec6df8243',
  }),
  'image/agenticgraph': Object.freeze({
    count: 440,
    digest: '235d0ac40d7ced15affdab26f0e5ba4890ba1759787abc01eb864e6ccd007394',
    contentDigest: '55f440b67515f3c9f58e4f0c9e9e0df2c274b7276cdc545a5f718221be91742c',
  }),
})

export const LEGACY_MIRROR_TRACKED_EXACT_PATHS = Object.freeze([
  'functions/agenticgraph-agent-ready-shared.mjs',
  '.well-known/mcp/apps/agenticgraph-agent-ready.html',
  'canvas/src/features/agent-ready/agenticgraphAgentReadyOutputSchemas.mjs',
  'canvas/src/features/agent-ready/agenticgraphAgentReadyPromptContract.mjs',
  'canvas/src/features/agent-ready/agenticgraphAgentReadyResourceContract.mjs',
  'canvas/src/features/agent-ready/agenticgraphAgentReadyToolContract.mjs',
  'canvas/src/features/agent-ready/agenticgraphApplicationCompositionVdeoxpln.mjs',
  'canvas/src/features/agent-ready/agenticgraphLocalMcpToolNames.mjs',
  'canvas/src/features/agent-ready/agenticgraphVdeoxplnContract.mjs',
  'canvas/src/features/agent-ready/agenticgraphVdeoxplnRegistryData.mjs',
  'canvas/src/features/agent-ready/agenticgraphVdeoxplnRoutingTools.mjs',
  'canvas/src/lib/storage/agenticgraphStorageEngineMcpContract.mjs',
  'canvas/src/lib/storage/agenticgraphStorageSyncContract.ts',
  'docs/agenticgraph-agentic-os-demo.md',
  'docs/agenticgraph-agentic-video-canvas-demo.md',
  'docs/agenticgraph-healthcare-agent-demo.md',
  'docs/agenticgraph-sme-care-agent-demo.md',
  'docs/agenticgraph-strybldr-starter-template.md',
  'docs/agenticgraph-vdeoxpln-demo.md',
  'docs_/agenticgraph/agenticgraph.md',
  'docs_/agenticgraph-rich-media-canvas-readme.pdf',
  'docs_/airvio-agenticgraph.png',
])

export const LEGACY_MIRROR_LIVE_ONLY_EXACT_PATHS = Object.freeze([
  'image/knowgrph/.DS_Store',
])

export const LEGACY_MIRROR_EXACT_PATHS = Object.freeze([
  ...LEGACY_MIRROR_TRACKED_EXACT_PATHS,
  ...LEGACY_MIRROR_LIVE_ONLY_EXACT_PATHS,
])

export const LEGACY_MIRROR_NAMED_FILE_PATHS = Object.freeze([
  '.well-known/agent-skills/agenticgraph-agent-ready.md',
  '.well-known/agent-skills/agenticgraph-ai-showrunner.md',
  '.well-known/agent-skills/agenticgraph-ai-voice-studio.md',
  '.well-known/agent-skills/agenticgraph-application-composition.md',
  '.well-known/agent-skills/agenticgraph-chat-to-canvas.md',
  '.well-known/agent-skills/agenticgraph-commerce-readiness.md',
  '.well-known/agent-skills/agenticgraph-html-video-renderer.md',
  '.well-known/agent-skills/agenticgraph-mcp-local.md',
  '.well-known/agent-skills/agenticgraph-memory-layer.md',
  '.well-known/agent-skills/agenticgraph-research-visual.md',
  '.well-known/agent-skills/agenticgraph-source-files.md',
  '.well-known/agent-skills/agenticgraph-strybldr.md',
  '.well-known/agent-skills/agenticgraph-video-agent.md',
  '.well-known/agent-skills/agenticgraph-visual-annotation-engine.md',
  '.well-known/agent-skills/agenticgraph-webmcp-readiness.md',
])

export const LEGACY_MIRROR_EXACT_FILE_INVENTORY = Object.freeze({
  count: 23,
  contentDigest: '74c8327b0f202e113f18de103691d639c24b994575e2021d340574ac22c62c2f',
})

// Git inventories exclude ignored live-only files while preserving the live
// 23-file seal above for filesystem cleanup.
export const LEGACY_MIRROR_TRACKED_EXACT_FILE_INVENTORY = Object.freeze({
  count: 22,
  contentDigest: '047c6fa93138261ec94020cdf032414442feaa128cdd42c3e7c25dea823945b8',
})

export const LEGACY_MIRROR_NAMED_FILE_INVENTORY = Object.freeze({
  count: 15,
  contentDigest: '002c88bc6643ad72adde99f9ae7aa7337435d85980fc0190187f514d9df712f8',
})

export const LEGACY_MIRROR_NAMED_FILE_SCAN_ROOTS = Object.freeze([
  '.well-known/agent-skills',
])

// These prefixes only map a sealed legacy image inventory to canonical paths;
// they never authorize a wildcard cleanup.
export const LEGACY_IMAGE_PREFIXES = Object.freeze([
  'image/agenticgraph/video-frame/',
  'image/agenticgraph/xr/',
])
export const CANONICAL_IMAGE_ROOT = 'image/agentic-graph'

export const isExplicitLegacyMirrorRemovalPath = relativePath => (
  LEGACY_MIRROR_EXACT_PATHS.includes(relativePath)
  || LEGACY_MIRROR_NAMED_FILE_PATHS.includes(relativePath)
)

export const isLegacyMirrorInventoryPath = relativePath => [
  ...LEGACY_MIRROR_DIRECTORY_ROOTS,
  'image/agenticgraph',
].some(root => relativePath === root || relativePath.startsWith(`${root}/`))

export const canonicalImageDestinationForLegacyPath = relativePath => {
  for (const prefix of LEGACY_IMAGE_PREFIXES) {
    if (relativePath.startsWith(prefix)) {
      return `${CANONICAL_IMAGE_ROOT}/${relativePath.slice('image/agenticgraph/'.length)}`
    }
  }
  return null
}
