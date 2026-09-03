import {
  extractYamlFrontmatterHeaderBlock,
  parseCanvasWorkspaceFrontmatterPresetBlock,
} from '@/lib/markdown/frontmatter'
import { isBytePlusLuminaCanvasJson } from '@/lib/graph/io/byteplusLuminaCanvas'

export function shouldApplyImportedCanvasDocumentToGraph(args: {
  path: string
  text: string
}): boolean {
  const path = String(args.path || '').trim().toLowerCase()
  const text = String(args.text || '')
  if (!text.trim()) return false
  const isMarkdownPath = path.endsWith('.md') || path.endsWith('.mdx')
  const isJsonPath = path.endsWith('.json')
  const isModelAssetPath = path.endsWith('.glb') || path.endsWith('.gltf')
  if (isJsonPath) {
    try {
      return isBytePlusLuminaCanvasJson(JSON.parse(text))
    } catch {
      return false
    }
  }
  const header = extractYamlFrontmatterHeaderBlock(text)
  if (!header) return false
  const headerText = header.rawBlock
  if (parseCanvasWorkspaceFrontmatterPresetBlock(header)) {
    if (isMarkdownPath) return true
    return isModelAssetPath && /^kgAsset(Type|Format)\s*:\s*["']?(model|glb|gltf)["']?\s*$/im.test(headerText)
  }
  if (!isMarkdownPath) return false
  if (/^\$schema:\s*["']agentic-os-pipeline\/v1["']/m.test(headerText)) return true
  if (/^widget_bundle\s*:/m.test(headerText)) return true
  if (/^flow\s*:/m.test(headerText)) return true
  return false
}
