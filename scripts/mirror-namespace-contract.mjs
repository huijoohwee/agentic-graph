// A completed cutover has one publish namespace. Empty collections retain the
// bounded cleanup API without keeping a route, path, or alias for a retired name.
export const CANONICAL_MIRROR_NAMESPACE = 'agentic-graph'
export const LEGACY_PRODUCT_NAMESPACES = Object.freeze([])
export const LEGACY_MIRROR_DIRECTORY_ROOTS = Object.freeze([])
export const LEGACY_MIRROR_EMPTY_DIRECTORY_ROOTS = Object.freeze([])
export const LEGACY_MIRROR_ROOT_INVENTORIES = Object.freeze({})
export const LEGACY_MIRROR_EXACT_PATHS = Object.freeze([])
export const LEGACY_MIRROR_NAMED_FILE_PATHS = Object.freeze([])
export const LEGACY_MIRROR_NAMED_FILE_SCAN_ROOTS = Object.freeze([])
export const LEGACY_IMAGE_PREFIXES = Object.freeze([])
export const CANONICAL_IMAGE_ROOT = 'image/agentic-graph'

export const isExplicitLegacyMirrorRemovalPath = () => false
export const isLegacyMirrorInventoryPath = () => false
export const canonicalImageDestinationForLegacyPath = () => null
