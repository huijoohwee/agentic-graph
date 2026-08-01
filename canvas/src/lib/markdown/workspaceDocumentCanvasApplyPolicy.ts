import {
  extractYamlFrontmatterHeaderBlock,
  readYamlFrontmatterValue,
} from './frontmatter'

export const WORKSPACE_DOCUMENT_CANVAS_GRAPH_APPLY_FRONTMATTER_KEY = 'kgCanvasGraphApply'

const FALSE_LIKE_VALUES = new Set(['false', '0', 'no', 'off'])

/**
 * Documents may opt out of becoming the active canvas graph while remaining
 * selectable and editable in Source Files. This keeps receipts, manifests, and
 * other explanatory records from replacing their authoritative graph.
 */
export function isWorkspaceDocumentCanvasGraphApplyDisabled(rawText: string): boolean {
  const frontmatter = extractYamlFrontmatterHeaderBlock(String(rawText || ''))
  if (!frontmatter) return false
  const value = readYamlFrontmatterValue(
    frontmatter.rawBlock,
    WORKSPACE_DOCUMENT_CANVAS_GRAPH_APPLY_FRONTMATTER_KEY,
  ).trim().toLowerCase()
  return FALSE_LIKE_VALUES.has(value)
}
