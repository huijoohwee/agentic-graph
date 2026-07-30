import { parseMarkdownFrontmatter, splitMarkdownLines } from '../markdown'
import { resolveCanvas2dRendererId, type Canvas2dRendererId, type Canvas3dModeId } from '@/lib/config.render'
import { isPlainObject } from '@/lib/graph/value'
import { hashStringToHexCached } from '@/lib/hash/textHashCache'
import type { BottomSurfaceTab } from '@/hooks/store/store-types/core'
import type { FloatingPanelView } from '@/hooks/store/store-types/graph-state-chat-import'

export type YamlFrontmatterBlock = {
  rawBlock: string
  yamlText: string
  bodyText: string
}

export type YamlFrontmatterHeaderBlock = Omit<YamlFrontmatterBlock, 'bodyText'>

export type CanvasWorkspaceFrontmatterPreset = {
  canvasSurfaceMode?: '2d' | '3d' | 'xr' | 'geo-xr' | 'geospatial'
  canvasRenderMode?: '2d' | '3d'
  canvas3dMode?: Canvas3dModeId
  canvas2dRenderer?: Canvas2dRendererId
  videoSequenceTimelineEnabled?: boolean
  bottomPanelOpen?: boolean
  bottomPanelTab?: BottomSurfaceTab
  floatingPanelOpen?: boolean
  floatingPanelView?: FloatingPanelView
  documentSemanticMode?: 'document' | 'keyword'
  frontmatterModeEnabled?: boolean
  multiDimTableModeEnabled?: boolean
  documentStructureBaselineLock?: boolean
}

const FRONTMATTER_PRESET_CACHE_LIMIT = 48
const frontmatterPresetCache = new Map<string, CanvasWorkspaceFrontmatterPreset | null>()

export function extractYamlFrontmatterHeaderBlock(rawText: string): YamlFrontmatterHeaderBlock | null {
  const text = String(rawText || '')
  if (!text.startsWith('---')) return null
  const end = text.indexOf('\n---')
  if (end < 0) return null
  const rawBlock = text.slice(0, end + 4)
  const yamlText = rawBlock.replace(/^---\s*\n?/, '').replace(/\n---\s*$/, '')
  return { rawBlock, yamlText }
}

export function extractYamlFrontmatterBlock(rawText: string): YamlFrontmatterBlock | null {
  const text = String(rawText || '')
  const header = extractYamlFrontmatterHeaderBlock(text)
  if (!header) return null
  const { rawBlock, yamlText } = header
  let bodyTextCache: string | null = null
  return {
    rawBlock,
    yamlText,
    get bodyText() {
      if (bodyTextCache == null) bodyTextCache = text.slice(rawBlock.length).replace(/^\s*\n/, '')
      return bodyTextCache
    },
  }
}

export function restoreMissingOpeningYamlFrontmatterFence(rawText: string): string {
  const text = String(rawText || '')
  if (!text) return text
  if (text.startsWith('---')) {
    if (text.indexOf('\n---', 3) >= 0) return text
    const headingIndex = text.search(/\n#{1,6}\s+/)
    if (headingIndex < 0) return text
    const yamlText = text.slice(4, headingIndex).trimEnd()
    if (!/^[A-Za-z0-9_-]+:\s*/.test(yamlText)) return text
    const parsed = parseMarkdownFrontmatter(splitMarkdownLines(`---\n${yamlText}\n---`))
    if (!parsed.meta || Object.keys(parsed.meta).length === 0) return text
    return `${text.slice(0, headingIndex).trimEnd()}\n---${text.slice(headingIndex)}`
  }
  const end = text.indexOf('\n---')
  if (end < 0) return text
  const yamlText = text.slice(0, end).trimEnd()
  if (!/^[A-Za-z0-9_-]+:\s*/.test(yamlText)) return text
  const parsed = parseMarkdownFrontmatter(splitMarkdownLines(`---\n${yamlText}\n---`))
  if (!parsed.meta || Object.keys(parsed.meta).length === 0) return text
  return `---\n${text}`
}

function normalizeFrontmatterFenceComparisonText(rawText: string): string {
  return String(rawText || '').replace(/\r\n?/g, '\n').replace(/\s+$/, '')
}

function stripYamlFrontmatterFencesForComparison(rawText: string): string | null {
  const text = String(rawText || '')
  const block = extractYamlFrontmatterBlock(text)
  if (!block) return null
  return `${block.yamlText}${text.slice(block.rawBlock.length)}`
}

export function preferCanonicalYamlFrontmatterFencedText(args: {
  candidateText: string
  canonicalText: string
}): string {
  const candidateText = String(args.candidateText || '')
  const canonicalText = String(args.canonicalText || '')
  if (!candidateText || candidateText === canonicalText) return candidateText
  const repairedCandidateText = restoreMissingOpeningYamlFrontmatterFence(candidateText)
  if (repairedCandidateText !== candidateText) return repairedCandidateText
  if (!canonicalText || extractYamlFrontmatterHeaderBlock(candidateText)) return candidateText

  const canonicalWithoutFences = stripYamlFrontmatterFencesForComparison(canonicalText)
  if (canonicalWithoutFences == null) return candidateText
  return normalizeFrontmatterFenceComparisonText(candidateText) === normalizeFrontmatterFenceComparisonText(canonicalWithoutFences)
    ? canonicalText
    : candidateText
}

export function isFrontmatterOnlyDoc(rawText: string): boolean {
  const block = extractYamlFrontmatterBlock(rawText)
  if (!block) return false
  return String(block.bodyText || '').trim().length === 0
}

export function readYamlFrontmatterValue(fmBlock: string, key: string): string {
  const fm = String(fmBlock || '')
  const k = String(key || '').trim()
  if (!fm || !k) return ''
  const m = fm.match(new RegExp(`^${k}:\\s*(.+)\\s*$`, 'm'))
  const v = m ? String(m[1] || '').trim() : ''
  if (!v) return ''
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1)
  return v
}

function normalizePresetToken(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_+-]+/g, '')
}

function readCanvasSurfaceModePreset(value: unknown): '2d' | '3d' | 'xr' | 'geo-xr' | 'geospatial' | undefined {
  const raw = String(value || '').trim()
  if (!raw) return undefined
  if (raw === '2d' || raw === '3d' || raw === 'xr' || raw === 'geo-xr' || raw === 'geospatial') return raw
  const normalized = normalizePresetToken(raw)
  if (normalized === '2d' || normalized === 'mode2d' || normalized === 'surface2d') return '2d'
  if (normalized === '3d' || normalized === 'mode3d' || normalized === 'surface3d') return '3d'
  if (normalized === 'xr' || normalized === 'xrmode' || normalized === 'surfacexr') return 'xr'
  if (normalized === 'geoxr' || normalized === 'geoxrmode' || normalized === 'surfacegeoxr') return 'geo-xr'
  if (normalized === 'geospatial' || normalized === 'geomode' || normalized === 'geospatialmode' || normalized === 'surfacegeospatial') return 'geospatial'
  return undefined
}

function readCanvasRenderModePreset(value: unknown): '2d' | '3d' | undefined {
  const raw = String(value || '').trim()
  if (!raw) return undefined
  if (raw === '2d' || raw === '3d') return raw
  const normalized = normalizePresetToken(raw)
  if (normalized === '2d' || normalized === 'mode2d' || normalized === 'surface2d') return '2d'
  if (normalized === '3d' || normalized === 'mode3d' || normalized === 'surface3d' || normalized === 'xr' || normalized === 'xrmode') return '3d'
  return undefined
}

function readCanvas3dModePreset(value: unknown): Canvas3dModeId | undefined {
  const raw = String(value || '').trim()
  if (!raw) return undefined
  if (raw === '3d' || raw === 'xr' || raw === 'voxel') return raw
  const normalized = normalizePresetToken(raw)
  if (normalized === '3d' || normalized === 'free3d') return '3d'
  if (normalized === 'xr' || normalized === 'xrmode') return 'xr'
  if (normalized === 'voxel' || normalized === 'voxelmode') return 'voxel'
  return undefined
}

function readCanvas2dRendererPreset(value: unknown): Canvas2dRendererId | undefined {
  return resolveCanvas2dRendererId(value)
}

function readDocumentSemanticModePreset(value: unknown): 'document' | 'keyword' | undefined {
  const raw = String(value || '').trim()
  if (!raw) return undefined
  if (raw === 'document' || raw === 'keyword') return raw
  const normalized = normalizePresetToken(raw)
  if (normalized === 'document' || normalized === 'documentstructure' || normalized === 'documentstructuremode') {
    return 'document'
  }
  if (normalized === 'keyword' || normalized === 'keywordmode') return 'keyword'
  return undefined
}

function readBooleanPreset(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  const normalized = normalizePresetToken(value)
  if (!normalized) return undefined
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false
  return undefined
}

export function readBottomSurfaceTabPreset(value: unknown): BottomSurfaceTab | undefined {
  const raw = String(value || '').trim()
  if (
    raw === 'stats' ||
    raw === 'history' ||
    raw === 'documentVersionGraph' ||
    raw === 'flowchart' ||
    raw === 'gitGraph' ||
    raw === 'gantt' ||
    raw === 'timeline' ||
    raw === 'architecture' ||
    raw === 'eventModeling'
  ) {
    return raw
  }
  return undefined
}

export function readFloatingPanelViewPreset(value: unknown): FloatingPanelView | undefined {
  const raw = String(value || '').trim()
  if (
    raw === 'propsPanel' ||
    raw === 'skillsCommands' ||
    raw === 'promptPresets' ||
    raw === 'view' ||
    raw === 'media' ||
    raw === 'animation' ||
    raw === 'motionControl' ||
    raw === 'gameMode' ||
    raw === 'flightSim' ||
    raw === 'cityBuilder' ||
    raw === 'camera' ||
    raw === 'design' ||
    raw === 'chat' ||
    raw === 'geo' ||
    raw === 'renderer' ||
    raw === 'storyboardWidget' ||
    raw === 'flowchart' ||
    raw === 'gitGraph' ||
    raw === 'gantt' ||
    raw === 'timeline' ||
    raw === 'architecture' ||
    raw === 'eventModeling' ||
    raw === 'graphTraversal'
  ) {
    return raw
  }
  return undefined
}

function coerceCanvasWorkspaceFrontmatterPreset(meta: Record<string, unknown> | null | undefined): CanvasWorkspaceFrontmatterPreset | null {
  if (!meta) return null

  const canvasSurfaceMode = readCanvasSurfaceModePreset(meta.kgCanvasSurfaceMode)
  const canvasRenderMode = readCanvasRenderModePreset(meta.kgCanvasRenderMode)
  const canvasRenderSurfaceAlias = readCanvasSurfaceModePreset(meta.kgCanvasRenderMode)
  const canvas3dMode = readCanvas3dModePreset(meta.kgCanvas3dMode)
    ?? (canvasSurfaceMode === 'xr' || canvasSurfaceMode === 'geo-xr' || canvasRenderSurfaceAlias === 'xr' ? 'xr' : undefined)
  const canvas2dRendererRaw = readCanvas2dRendererPreset(meta.kgCanvas2dRenderer)
  const videoSequenceTimelineEnabled = readBooleanPreset(meta.kgVideoSequenceTimeline) === true
  const canvas2dRenderer = videoSequenceTimelineEnabled && canvas2dRendererRaw === 'gantt'
    ? 'media'
    : canvas2dRendererRaw
  const bottomPanelOpen = readBooleanPreset(meta.kgBottomPanelOpen)
  const bottomPanelTab = readBottomSurfaceTabPreset(meta.kgBottomPanelTab)
  const floatingPanelOpen = readBooleanPreset(meta.kgFloatingPanelOpen)
  const floatingPanelView = readFloatingPanelViewPreset(meta.kgFloatingPanelView)
  const documentSemanticMode = readDocumentSemanticModePreset(meta.kgDocumentSemanticMode)
  const frontmatterModeEnabled = readBooleanPreset(meta.kgFrontmatterModeEnabled)
  const multiDimTableModeEnabled = readBooleanPreset(meta.kgMultiDimTableModeEnabled)
  const documentStructureBaselineLock = readBooleanPreset(meta.kgDocumentStructureBaselineLock)

  if (
    canvasSurfaceMode === undefined &&
    canvasRenderMode === undefined &&
    canvas3dMode === undefined &&
    canvas2dRenderer === undefined &&
    videoSequenceTimelineEnabled === false &&
    bottomPanelOpen === undefined &&
    bottomPanelTab === undefined &&
    floatingPanelOpen === undefined &&
    floatingPanelView === undefined &&
    documentSemanticMode === undefined &&
    frontmatterModeEnabled === undefined &&
    multiDimTableModeEnabled === undefined &&
    documentStructureBaselineLock === undefined
  ) {
    return null
  }

  return {
    canvasSurfaceMode,
    canvasRenderMode,
    canvas3dMode,
    canvas2dRenderer,
    videoSequenceTimelineEnabled,
    bottomPanelOpen,
    bottomPanelTab,
    floatingPanelOpen,
    floatingPanelView,
    documentSemanticMode,
    frontmatterModeEnabled,
    multiDimTableModeEnabled,
    documentStructureBaselineLock,
  }
}

export function readCanvasWorkspaceFrontmatterPresetFromMeta(
  meta: Record<string, unknown> | null | undefined,
): CanvasWorkspaceFrontmatterPreset | null {
  return coerceCanvasWorkspaceFrontmatterPreset(meta)
}

export function parseCanvasWorkspaceFrontmatterPresetBlock(block: YamlFrontmatterHeaderBlock): CanvasWorkspaceFrontmatterPreset | null {
  const cacheKey = hashStringToHexCached('markdown-frontmatter:preset', block.rawBlock)
  if (frontmatterPresetCache.has(cacheKey)) {
    return frontmatterPresetCache.get(cacheKey) || null
  }
  // Parse only the YAML block so large markdown bodies do not incur full-document line splitting on file switches.
  const parsed = parseMarkdownFrontmatter(splitMarkdownLines(block.rawBlock))
  if (isPlainObject(parsed.meta)) {
    const preset = coerceCanvasWorkspaceFrontmatterPreset(parsed.meta)
    frontmatterPresetCache.set(cacheKey, preset)
    if (frontmatterPresetCache.size > FRONTMATTER_PRESET_CACHE_LIMIT) {
      const oldestKey = frontmatterPresetCache.keys().next().value
      if (typeof oldestKey === 'string') frontmatterPresetCache.delete(oldestKey)
    }
    return preset
  }
  const canvasSurfaceModeRaw = readYamlFrontmatterValue(block.rawBlock, 'kgCanvasSurfaceMode')
  const canvasRenderModeRaw = readYamlFrontmatterValue(block.rawBlock, 'kgCanvasRenderMode')
  const canvas3dModeRaw = readYamlFrontmatterValue(block.rawBlock, 'kgCanvas3dMode')
  const canvas2dRendererRaw = readYamlFrontmatterValue(block.rawBlock, 'kgCanvas2dRenderer')
  const videoSequenceTimelineRaw = readYamlFrontmatterValue(block.rawBlock, 'kgVideoSequenceTimeline')
  const bottomPanelOpenRaw = readYamlFrontmatterValue(block.rawBlock, 'kgBottomPanelOpen')
  const bottomPanelTabRaw = readYamlFrontmatterValue(block.rawBlock, 'kgBottomPanelTab')
  const floatingPanelOpenRaw = readYamlFrontmatterValue(block.rawBlock, 'kgFloatingPanelOpen')
  const floatingPanelViewRaw = readYamlFrontmatterValue(block.rawBlock, 'kgFloatingPanelView')
  const documentSemanticModeRaw = readYamlFrontmatterValue(block.rawBlock, 'kgDocumentSemanticMode')
  const frontmatterModeEnabledRaw = readYamlFrontmatterValue(block.rawBlock, 'kgFrontmatterModeEnabled')
  const multiDimTableModeEnabledRaw = readYamlFrontmatterValue(block.rawBlock, 'kgMultiDimTableModeEnabled')
  const documentStructureBaselineLockRaw = readYamlFrontmatterValue(block.rawBlock, 'kgDocumentStructureBaselineLock')
  const preset = coerceCanvasWorkspaceFrontmatterPreset({
    kgCanvasSurfaceMode: canvasSurfaceModeRaw || undefined,
    kgCanvasRenderMode: canvasRenderModeRaw || undefined,
    kgCanvas3dMode: canvas3dModeRaw || undefined,
    kgCanvas2dRenderer: canvas2dRendererRaw || undefined,
    kgVideoSequenceTimeline: readBooleanPreset(videoSequenceTimelineRaw),
    kgBottomPanelOpen: readBooleanPreset(bottomPanelOpenRaw),
    kgBottomPanelTab: bottomPanelTabRaw || undefined,
    kgFloatingPanelOpen: readBooleanPreset(floatingPanelOpenRaw),
    kgFloatingPanelView: floatingPanelViewRaw || undefined,
    kgDocumentSemanticMode: documentSemanticModeRaw || undefined,
    kgFrontmatterModeEnabled: readBooleanPreset(frontmatterModeEnabledRaw),
    kgMultiDimTableModeEnabled: readBooleanPreset(multiDimTableModeEnabledRaw),
    kgDocumentStructureBaselineLock: readBooleanPreset(documentStructureBaselineLockRaw),
  })
  frontmatterPresetCache.set(cacheKey, preset)
  if (frontmatterPresetCache.size > FRONTMATTER_PRESET_CACHE_LIMIT) {
    const oldestKey = frontmatterPresetCache.keys().next().value
    if (typeof oldestKey === 'string') frontmatterPresetCache.delete(oldestKey)
  }
  return preset
}

export function parseCanvasWorkspaceFrontmatterPreset(rawText: string): CanvasWorkspaceFrontmatterPreset | null {
  const block = extractYamlFrontmatterHeaderBlock(rawText)
  if (!block) return null
  return parseCanvasWorkspaceFrontmatterPresetBlock(block)
}

export function readYamlFrontmatterMermaidCode(rawText: string): string {
  const block = extractYamlFrontmatterHeaderBlock(rawText)
  if (!block) return ''
  const parsed = parseMarkdownFrontmatter(splitMarkdownLines(block.rawBlock))
  const meta = isPlainObject(parsed.meta) ? parsed.meta : null
  return typeof meta?.mermaid === 'string' ? String(meta.mermaid || '').trim() : ''
}

export type WebpageViewMode = 'markdown' | 'json' | 'html'
export type WebpageScriptPolicy = 'strip' | 'allow'
export type WebpageFidelityLevel = 1 | 2 | 3 | 4
export type WebpageFrontmatterMeta = {
  url: string
  view: WebpageViewMode
  siteRootRel?: string
  scriptPolicy?: WebpageScriptPolicy
  fidelityLevel?: WebpageFidelityLevel
  includeImages?: boolean
  hydrate?: boolean
}

export function parseWebpageFrontmatterMeta(rawText: string): WebpageFrontmatterMeta | null {
  const block = extractYamlFrontmatterHeaderBlock(rawText)
  if (!block) return null
  const url = readYamlFrontmatterValue(block.rawBlock, 'kgWebpageUrl')
  const viewRaw = readYamlFrontmatterValue(block.rawBlock, 'kgWebpageView')
  if (!url) return null
  const view: WebpageViewMode =
    viewRaw === 'markdown'
      ? 'markdown'
      : viewRaw === 'json'
        ? 'json'
        : 'html'
  const siteRootRelRaw = readYamlFrontmatterValue(block.rawBlock, 'kgWebpageSiteRootRel')
  const siteRootRel = siteRootRelRaw && siteRootRelRaw.trim() ? siteRootRelRaw.trim() : undefined
  const scriptRaw = readYamlFrontmatterValue(block.rawBlock, 'kgWebpageScriptPolicy')
  const scriptPolicy: WebpageScriptPolicy | undefined = scriptRaw === 'allow' ? 'allow' : scriptRaw === 'strip' ? 'strip' : undefined

  const fidelityRaw = readYamlFrontmatterValue(block.rawBlock, 'kgWebpageFidelityLevel')
  const fidelityParsed = fidelityRaw ? Number.parseInt(fidelityRaw, 10) : NaN
  const fidelityLevel: WebpageFidelityLevel | undefined =
    fidelityParsed === 1 || fidelityParsed === 2 || fidelityParsed === 3 || fidelityParsed === 4 ? fidelityParsed : undefined

  const includeImagesRaw = readYamlFrontmatterValue(block.rawBlock, 'kgWebpageIncludeImages')
  const includeImages: boolean | undefined =
    includeImagesRaw === 'true' ? true : includeImagesRaw === 'false' ? false : undefined

  const hydrateRaw = readYamlFrontmatterValue(block.rawBlock, 'kgWebpageHydrate')
  const hydrate: boolean | undefined = hydrateRaw === 'false' ? false : hydrateRaw === 'true' ? true : undefined

  return { url, view, siteRootRel, scriptPolicy, fidelityLevel, includeImages, hydrate }
}

export function upsertWebpageFrontmatterMeta(rawText: string, meta: WebpageFrontmatterMeta): string {
  const text = String(rawText || '')
  const url = String(meta?.url || '').trim()
  const view: WebpageViewMode = meta?.view === 'html' ? 'html' : meta?.view === 'json' ? 'json' : 'markdown'
  const siteRootRel = String(meta?.siteRootRel || '').trim()
  const scriptPolicy: WebpageScriptPolicy | '' = meta?.scriptPolicy === 'allow' ? 'allow' : meta?.scriptPolicy === 'strip' ? 'strip' : ''
  const fidelityLevel: WebpageFidelityLevel | 0 =
    meta?.fidelityLevel === 1 || meta?.fidelityLevel === 2 || meta?.fidelityLevel === 3 || meta?.fidelityLevel === 4
      ? meta.fidelityLevel
      : 0
  const includeImages: boolean | null =
    meta?.includeImages === true ? true : meta?.includeImages === false ? false : null
  const block = extractYamlFrontmatterHeaderBlock(text)
  if (!block) {
    const lines: string[] = []
    lines.push('---')
    lines.push(`kgWebpageUrl: "${url}"`)
    lines.push(`kgWebpageView: "${view}"`)
    if (scriptPolicy) lines.push(`kgWebpageScriptPolicy: "${scriptPolicy}"`)
    if (fidelityLevel) lines.push(`kgWebpageFidelityLevel: "${fidelityLevel}"`)
    if (includeImages != null) lines.push(`kgWebpageIncludeImages: "${includeImages ? 'true' : 'false'}"`)
    if (siteRootRel) lines.push(`kgWebpageSiteRootRel: "${siteRootRel}"`)
    lines.push('---')
    lines.push('')
    return `${lines.join('\n')}${text}`
  }

  const lines = block.rawBlock.split('\n')
  let urlReplaced = false
  let viewReplaced = false
  let scriptPolicyReplaced = false
  let fidelityLevelReplaced = false
  let includeImagesReplaced = false
  let siteRootRelReplaced = false
  const nextLines = lines.map(line => {
    if (/^\s*kgWebpageUrl\s*:/.test(line)) {
      urlReplaced = true
      return `kgWebpageUrl: "${url}"`
    }
    if (/^\s*kgWebpageView\s*:/.test(line)) {
      viewReplaced = true
      return `kgWebpageView: "${view}"`
    }
    if (/^\s*kgWebpageScriptPolicy\s*:/.test(line)) {
      scriptPolicyReplaced = true
      return scriptPolicy ? `kgWebpageScriptPolicy: "${scriptPolicy}"` : ''
    }
    if (/^\s*kgWebpageFidelityLevel\s*:/.test(line)) {
      fidelityLevelReplaced = true
      return fidelityLevel ? `kgWebpageFidelityLevel: "${fidelityLevel}"` : ''
    }
    if (/^\s*kgWebpageIncludeImages\s*:/.test(line)) {
      includeImagesReplaced = true
      return includeImages != null ? `kgWebpageIncludeImages: "${includeImages ? 'true' : 'false'}"` : ''
    }
    if (/^\s*kgWebpageSiteRootRel\s*:/.test(line)) {
      siteRootRelReplaced = true
      return siteRootRel ? `kgWebpageSiteRootRel: "${siteRootRel}"` : ''
    }
    return line
  })

  const endIdx = nextLines.lastIndexOf('---')
  if (endIdx > 0) {
    if (!urlReplaced) nextLines.splice(endIdx, 0, `kgWebpageUrl: "${url}"`)
    if (!viewReplaced) nextLines.splice(endIdx, 0, `kgWebpageView: "${view}"`)
    if (scriptPolicy && !scriptPolicyReplaced) nextLines.splice(endIdx, 0, `kgWebpageScriptPolicy: "${scriptPolicy}"`)
    if (fidelityLevel && !fidelityLevelReplaced) nextLines.splice(endIdx, 0, `kgWebpageFidelityLevel: "${fidelityLevel}"`)
    if (includeImages != null && !includeImagesReplaced) {
      nextLines.splice(endIdx, 0, `kgWebpageIncludeImages: "${includeImages ? 'true' : 'false'}"`)
    }
    if (siteRootRel && !siteRootRelReplaced) nextLines.splice(endIdx, 0, `kgWebpageSiteRootRel: "${siteRootRel}"`)
  }

  const cleaned = nextLines.filter(l => l.trim() !== '')
  const nextBlock = cleaned.join('\n')
  const suffix = text.slice(block.rawBlock.length)
  return `${nextBlock}${suffix}`

}

export function normalizeWebpageFrontmatterView(rawText: string, view: WebpageViewMode = 'markdown'): string {
  const text = String(rawText || '')
  const block = extractYamlFrontmatterHeaderBlock(text)
  if (!block) return text
  const url = readYamlFrontmatterValue(block.rawBlock, 'kgWebpageUrl')
  if (!url) return text

  const nextView: WebpageViewMode = view === 'html' ? 'html' : view === 'json' ? 'json' : 'markdown'
  const lines = block.rawBlock.split('\n')
  let replaced = false
  const nextLines = lines.map(line => {
    if (/^\s*kgWebpageView\s*:/.test(line)) {
      replaced = true
      return `kgWebpageView: "${nextView}"`
    }
    return line
  })
  if (!replaced) {
    const endIdx = nextLines.lastIndexOf('---')
    if (endIdx > 0) nextLines.splice(endIdx, 0, `kgWebpageView: "${nextView}"`)
  }
  const nextBlock = nextLines.join('\n')
  const suffix = text.slice(block.rawBlock.length)
  return `${nextBlock}${suffix}`
}

export type WebsiteImportFrontmatterMeta = { importId: string; nodeId: string; outputDirRel?: string }

export function parseWebsiteImportFrontmatterMeta(rawText: string): WebsiteImportFrontmatterMeta | null {
  const block = extractYamlFrontmatterHeaderBlock(rawText)
  if (!block) return null
  const importId = readYamlFrontmatterValue(block.rawBlock, 'kgWebsiteImportId')
  const nodeId = readYamlFrontmatterValue(block.rawBlock, 'kgWebsiteNodeId')
  if (!importId || !nodeId) return null
  const outputDirRelRaw = readYamlFrontmatterValue(block.rawBlock, 'kgWebsiteOutputDirRel')
  const outputDirRel = outputDirRelRaw && outputDirRelRaw.trim() ? outputDirRelRaw.trim() : undefined
  return { importId, nodeId, outputDirRel }
}
