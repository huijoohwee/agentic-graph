import yaml from 'js-yaml'
import { extractYamlFrontmatterBlock } from '@/lib/markdown/frontmatter'
import { photoOverlayBindings } from './semanticTwinPhotoProjection'
import type { SpaceDocument } from './semanticSpaceRuntime'

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


/** Read the selected document, so composed graph metadata cannot select another source's view. */
export function readSemanticObjectViewMarkdown(text: string | null): SemanticObjectView | null {
  const block = extractYamlFrontmatterBlock(text || '')
  if (!block) return null
  try {
    const meta = yaml.load(block.yamlText) as Record<string, unknown> | null
    return parseSemanticObjectView(meta?.[SEMANTIC_OBJECT_VIEW_KEY])
  } catch { return null }
}
