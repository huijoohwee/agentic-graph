import { XR_MOTION_REFERENCE_STAGE_PRESETS, XR_SCENE_LIBRARY_ASSETS, XR_SCENE_LIBRARY_CATEGORY_LABELS } from '@/features/three/xrSceneLibrary'
import { buildXrPlaceInvocation, buildXrStageInvocation } from '@/features/three/xrSceneMcpContract.mjs'
import type { ChatInvocationCatalogEntry } from '@/features/chat/chatInvocationRegistry'

// Catalog projections only. Inserting a chip never places or starts an XR object.
export const NATIVE_XR_MEDIA_INVOCATIONS: readonly ChatInvocationCatalogEntry[] = [
  ...XR_MOTION_REFERENCE_STAGE_PRESETS.map(stage => ({
    id: `xr:stage:${stage.id}`, token: `@${stage.id}`, label: stage.label,
    summary: stage.description, group: 'Terrain / Environment kits', kind: 'binding' as const,
    sourcePath: 'canvas/src/features/three/xrSceneLibrary.ts',
    keywords: ['3d', 'xr', 'media', 'environment', 'terrain', stage.id],
    insertionText: buildXrStageInvocation(stage.id), mcpTool: 'agentic-graph.control_local_xr_scene',
  })),
  ...XR_SCENE_LIBRARY_ASSETS.map(asset => ({
    id: `xr:asset:${asset.id}`, token: `@${asset.id}`, label: asset.label,
    summary: asset.description, group: `3D Subjects & Props / ${XR_SCENE_LIBRARY_CATEGORY_LABELS[asset.category]}`, kind: 'binding' as const,
    sourcePath: 'canvas/src/features/three/xrSceneLibrary.ts',
    keywords: ['3d', 'xr', 'media', 'asset', 'subject', 'prop', asset.id, ...asset.keywords],
    insertionText: buildXrPlaceInvocation(asset.id, asset.mobile ? 'linear' : 'hold'), mcpTool: 'agentic-graph.control_local_xr_scene',
  })),
]
