export const CANONICAL_MIRROR_NAMESPACE = 'agentic-graph'
export const LEGACY_PRODUCT_NAMESPACES = Object.freeze(['agenticgraph', 'knowgrph'])

// These roots were emitted by the pre-canonical Pages projection. They are
// generated release output, never an authorization to remove an arbitrary
// mirror path.
export const LEGACY_MIRROR_DIRECTORY_ROOTS = Object.freeze([
  'content/agenticgraph',
  'agenticgraph',
  'functions/agenticgraph',
])

export const LEGACY_MIRROR_EXACT_PATHS = Object.freeze([
  'functions/agenticgraph-agent-ready-shared.mjs',
  '.well-known/mcp/apps/agenticgraph-agent-ready.html',
  'image/knowgrph/.DS_Store',
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

export const LEGACY_MIRROR_NAMED_FILE_PREFIXES = Object.freeze([
  '.well-known/agent-skills/agenticgraph-',
  '.well-known/agent-skills/knowgrph-',
])

export const LEGACY_MIRROR_NAMED_FILE_SCAN_ROOTS = Object.freeze([
  '.well-known/agent-skills',
])

// Media is deliberately narrower than an image-directory wildcard: only the
// known generated video-frame and XR payloads can be copied or retired.
export const LEGACY_IMAGE_PREFIXES = Object.freeze([
  'image/agenticgraph/video-frame/',
  'image/agenticgraph/xr/',
])
export const CANONICAL_IMAGE_ROOT = 'image/agentic-graph'

const isDescendant = (relativePath, root) => relativePath === root || relativePath.startsWith(`${root}/`)

export const isLegacyMirrorManagedRemovalPath = relativePath => (
  LEGACY_MIRROR_EXACT_PATHS.includes(relativePath)
  || LEGACY_MIRROR_DIRECTORY_ROOTS.some(root => isDescendant(relativePath, root))
  || LEGACY_MIRROR_NAMED_FILE_PREFIXES.some(prefix => relativePath.startsWith(prefix))
  || LEGACY_IMAGE_PREFIXES.some(prefix => relativePath.startsWith(prefix))
)

export const canonicalImageDestinationForLegacyPath = relativePath => {
  for (const prefix of LEGACY_IMAGE_PREFIXES) {
    if (relativePath.startsWith(prefix)) {
      return `${CANONICAL_IMAGE_ROOT}/${relativePath.slice('image/agenticgraph/'.length)}`
    }
  }
  return null
}
