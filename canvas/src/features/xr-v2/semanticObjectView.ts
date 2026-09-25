import yaml from 'js-yaml'
import { extractYamlFrontmatterBlock } from '@/lib/markdown/frontmatter'
import { photoOverlayBindings } from './semanticTwinPhotoProjection'
import type { SpaceDocument } from './semanticSpaceRuntime'
import type { TwinBinding } from './semanticTwinRuntime'
import type { GlbFit } from '@/lib/three/GlbAssetModel'

export type SemanticObjectView = Readonly<{ spaceId: string; evidenceSha256: string }>
export const SEMANTIC_OBJECT_VIEW_KEY = 'kgSemanticObjectView'
export function parseSemanticObjectView(value: unknown): SemanticObjectView | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const target = value as Record<string, unknown>
  return typeof target.spaceId === 'string' && typeof target.evidenceSha256 === 'string'
    && /^[a-f0-9]{64}$/.test(target.evidenceSha256)
    ? { spaceId: target.spaceId, evidenceSha256: target.evidenceSha256 } : null
}
/** Image relief and extracted silhouettes remain separate from explicit object models. */
export function semanticObjectBindings(document: SpaceDocument, target: SemanticObjectView) {
  if (document.id !== target.spaceId) return []
  return photoOverlayBindings(document, target, binding => !['relief', 'contour'].includes(binding.template))
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
