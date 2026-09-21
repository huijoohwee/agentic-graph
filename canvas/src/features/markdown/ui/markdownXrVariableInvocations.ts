import type { MarkdownVariablePreview } from './MarkdownRendererTypes'
import { XR_MOTION_REFERENCE_STAGE_PRESETS, XR_SCENE_LIBRARY_ASSETS, XR_SCENE_LIBRARY_CATEGORY_LABELS } from '@/features/three/xrSceneLibrary'
import { buildXrStageInvocation, buildXrTransformInvocation } from '@/features/three/xrSceneMcpContract.mjs'

export type MarkdownXrVariableTarget = { kind: 'stage' } | { kind: 'subject'; subjectId: string }

/** Resolve existing frontmatter references to stable runtime targets, never to a second mutation schema. */
export function getMarkdownXrVariableTarget(previews: Record<string, MarkdownVariablePreview>, key: string): MarkdownXrVariableTarget | null {
  const normalized = key.toLowerCase()
  if (previews[normalized]?.source !== 'frontmatter') return null
  if (normalized === 'kgxrmotionreference.stageid') return { kind: 'stage' }
  const match = /^kgxrmotionreference\.subjects\.(\d+)\.assetid$/.exec(normalized)
  if (!match) return null
  const subjectId = previews[`kgxrmotionreference.subjects.${match[1]}.id`]?.value
  return subjectId ? { kind: 'subject', subjectId } : null
}

export function getMarkdownXrVariableLabel(target: MarkdownXrVariableTarget, value: string | null): string {
  if (target.kind === 'stage') return XR_MOTION_REFERENCE_STAGE_PRESETS.find(stage => stage.id === value)?.label ?? value ?? ''
  const asset = XR_SCENE_LIBRARY_ASSETS.find(asset => asset.id === value)
  return asset?.referenceLabel ?? asset?.label ?? value ?? ''
}

/** A view of the same catalog and builders exposed by inspect_local_xr_scene_assets. */
export function getMarkdownXrVariableInvocations(target: MarkdownXrVariableTarget) {
  return target.kind === 'stage'
    ? XR_MOTION_REFERENCE_STAGE_PRESETS.map(stage => ({
      id: stage.id, label: stage.label, group: 'Terrain / Environment kits', keywords: [stage.description],
      invocation: buildXrStageInvocation(stage.id),
    }))
    : XR_SCENE_LIBRARY_ASSETS.map(asset => ({
      id: asset.id, label: asset.label, group: XR_SCENE_LIBRARY_CATEGORY_LABELS[asset.category], keywords: [asset.description, ...asset.keywords],
      invocation: buildXrTransformInvocation(target.subjectId, { assetId: asset.id }),
    }))
}
