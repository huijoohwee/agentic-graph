import yaml from 'js-yaml'
import { extractYamlFrontmatterBlock } from '@/lib/markdown/frontmatter'
import { photoOverlayBindings } from './semanticTwinPhotoProjection'
import { resolveSpaceObservation, type SpaceDocument } from './semanticSpaceRuntime'
import type { TwinBinding } from './semanticTwinRuntime'
import { photoDimensions, type ImmersivePhoto } from '@/features/immersive-media/immersivePhotoProjection'
import type { GlbFit } from '@/lib/three/GlbAssetModel'

export type SemanticObjectView = Readonly<{ spaceId: string; evidenceSha256: string; presentation?: 'photo' | 'layout'; context?: boolean }>
export const SEMANTIC_OBJECT_VIEW_KEY = 'kgSemanticObjectView'
/** Camera framing must refresh when asynchronous fit or presentation changes, not on selection. */
export function semanticObjectCameraKey(target: SemanticObjectView | null, fit: GlbFit | null) {
  return fit ? `semantic-space:${JSON.stringify([target, fit.cameraTarget, fit.scaledSize, fit.scale])}` : ''
}
export function parseSemanticObjectView(value: unknown): SemanticObjectView | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const target = value as Record<string, unknown>
  return typeof target.spaceId === 'string' && typeof target.evidenceSha256 === 'string'
    && /^[a-f0-9]{64}$/.test(target.evidenceSha256)
    && (target.presentation === undefined || ['photo', 'layout'].includes(String(target.presentation)))
    && (target.context === undefined || typeof target.context === 'boolean')
    ? { spaceId: target.spaceId, evidenceSha256: target.evidenceSha256,
      ...(target.presentation ? { presentation: target.presentation as 'photo' | 'layout' } : {}),
      ...(typeof target.context === 'boolean' ? { context: target.context } : {}) } : null
}
/** Per-region contour volumes are selectable objects; whole-image relief remains a separate surface. */
export function semanticObjectBindings(document: SpaceDocument, target: SemanticObjectView) {
  if (document.id !== target.spaceId) return []
  return photoOverlayBindings(document, { ...target, evidenceSha256: resolveSpaceObservation(document, target.evidenceSha256)?.sha256 || target.evidenceSha256 }, binding => binding.template !== 'relief')
}

/** Normalize display scale around visible models, never the arbitrary room floor. Saved dimensions stay intact. */
export function semanticObjectCameraFit(bindings: readonly TwinBinding[]): GlbFit | null {
  if (!bindings.length) return null
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (const binding of bindings) for (let axis = 0; axis < 3; axis++) {
    const low = binding.position[axis] - (axis === 1 ? 0 : binding.size[axis] / 2)
    min[axis] = Math.min(min[axis], low)
    max[axis] = Math.max(max[axis], low + binding.size[axis])
  }
  const size = max.map((value, axis) => value - min[axis]) as [number, number, number]
  const scale = 100 / Math.max(...size, 0.1)
  const scaledSize = size.map(value => value * scale) as [number, number, number]
  return { cameraProfile: 'spatial-capture',
    cameraTarget: min.map((value, axis) => (value + size[axis] / 2) * scale) as [number, number, number],
    position: [0, 0, 0], scale, floorY: min[1] * scale, stageSpan: Math.max(...scaledSize),
    preserveFlatFacing: false, flatAxis: null, size, scaledSize }
}


/** Read the selected document, so composed graph metadata cannot select another source's view. */
export function readSemanticObjectViewMarkdown(text: string | null): SemanticObjectView | null {
  const block = extractYamlFrontmatterBlock(text || '')
  if (!block) return null
  try {
    const meta = yaml.load(block.yamlText) as Record<string, unknown> | null
    return parseSemanticObjectView(meta?.[SEMANTIC_OBJECT_VIEW_KEY])
  } catch { return null }
}

/** Fit the full source frame; selecting a region must not enlarge a few source pixels. */
export function semanticPhotoCameraFit(photo: ImmersivePhoto): GlbFit {
  const { width, height } = photoDimensions(photo)
  const size: [number, number, number] = [width, height, 1]
  return { position: [0, 0, 0], cameraTarget: [0, 0, 0], scale: 1, floorY: -height / 2,
    stageSpan: Math.max(width, height), preserveFlatFacing: true, flatAxis: 'z', size, scaledSize: size }
}
