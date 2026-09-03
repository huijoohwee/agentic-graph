import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'
import type { UserSubgraph } from '@/lib/graph/subgraphs'
import { splitMarkdownLines, parseMarkdownFrontmatter } from '@/lib/markdown'
import { hashText } from '@/features/parsers/hash'
import {
  FRONTMATTER_FLOW_WARNINGS_KEY,
  FRONTMATTER_FLOW_HANDLES_VALUE_KEY,
  FRONTMATTER_FLOW_WIDGET_FIELDS_KEY,
  normalizeMetaWithFlowBlock,
  repairFlowInlineEnvelopeBlockScalars,
  tryParseFlowBlockFromFrontmatterLines,
  tryParseFlowBlockFromMarkdownBodyLines,
} from '@/features/parsers/markdownFrontmatterFlowGraph.flowBlock'
import { countYamlIndent as countIndent, findLeadingUnfencedYamlMetadataEnd, repairWrappedQuotedFrontmatterKeys } from '@/lib/markdown/frontmatterYamlRepair'
import { buildFrontmatterFlowSourceLayerHash } from '@/features/parsers/markdownFrontmatterFlowGraph.sourceKey'
import { readFrontmatterFlowRenderSettings } from '@/lib/graph/frontmatterFlowSettings'
import { FLOW_WIDGET_FORM_ID_KEY } from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
import {
  FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
  FLOW_OPENAI_VIDEO_SCRIPT_FORM_ID,
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
  FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID,
  FLOW_VIDEO_SCRIPT_FORM_ID,
  FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
} from '@/lib/config.storyboard-widget'
import {
  buildConnectionWarnings,
  ensureAugmentedPortsFromDeclaredConnections,
  extractConnectionsAndSocketTypesFromMarkdownTables,
  normalizeEdgesFromNodeInputs,
  parseConnections,
} from '@/features/parsers/markdownFrontmatterFlowGraph.connections'
import {
  extractEdgesFromFrontmatterMermaidWiring,
  extractFrontmatterBodyAnnotations,
  normalizeEdgesFromSigilSpecs,
  tryParseMergedFrontmatterMetaWithNodes,
  tryParseSigilFrontmatter,
} from '@/features/parsers/markdownFrontmatterFlowGraph.sigil'
import {
  collectNodePositionWarnings,
  normalizeClusters,
  normalizeNodes,
  normalizeSubgraphsFromFrontmatter,
} from '@/features/parsers/markdownFrontmatterFlowGraph.nodes'
import {
  appendAnnotationNodes,
  buildFrontmatterFlowMetadata,
  mergeEdges,
  mergeSubgraphs,
  readSocketTypes,
} from '@/features/parsers/markdownFrontmatterFlowGraph.compose'
import { WIDGET_BASE_SIZE, WIDGET_LAYOUT_BASE_HEIGHT_PX } from '@/lib/canvas/overlayWidgetZoom'
import { buildTextWidgetOutputSrcDoc } from '@/lib/render/widgetOutputSrcDoc'
import { computeBalancedSpreadLayout } from '@/lib/ui/overlayBalancedSpread'
import { appendFrontmatterBalancedConnection, withFrontmatterCollectiveRoleProperties } from '@/lib/storyboardWidget/frontmatterCollectiveLayout'
import { mergeWidgetRegistryEntries, readAuthoredWidgetRegistryEntries } from '@/features/parsers/markdownFrontmatterFlowGraph.widgetRegistry'
import {
  deriveFlowDiagramsWidgets,
  hasOnlyRoutedFlowDiagramSpecs,
  registerFlowDiagramSocketType,
} from '@/features/parsers/markdownFrontmatterFlowGraph.flowDiagrams'

function guessJsonTypeLabel(value: unknown): string {
  if (value == null) return 'null'
  if (Array.isArray(value)) return 'array'
  const t = typeof value
  if (t === 'string') return 'string'
  if (t === 'number') return 'number'
  if (t === 'boolean') return 'boolean'
  if (t === 'object') return 'object'
  return 'unknown'
}

function parseDurationSeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  const raw = String(value || '').trim()
  if (!raw) return null
  const s = raw.match(/^([0-9]+(?:\.[0-9]+)?)\s*s$/i)
  if (s) {
    const n = Number(s[1])
    return Number.isFinite(n) && n > 0 ? n : null
  }
  return null
}

function pickFirstNodeDefaults(args: {
  rawNodes: unknown[]
  nodeTypeId: string
  keys: string[]
}): Record<string, unknown> {
  const rawNodes = Array.isArray(args.rawNodes) ? args.rawNodes : []
  const typeId = String(args.nodeTypeId || '').trim()
  const keys = Array.isArray(args.keys) ? args.keys : []
  for (let i = 0; i < rawNodes.length; i += 1) {
    const row = rawNodes[i]
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const rec = row as Record<string, unknown>
    if (String(rec.type || '').trim() !== typeId) continue
    const props = rec.properties
    if (!props || typeof props !== 'object' || Array.isArray(props)) continue
    const out: Record<string, unknown> = {}
    for (let k = 0; k < keys.length; k += 1) {
      const key = String(keys[k] || '').trim()
      if (!key) continue
      const v = (props as Record<string, unknown>)[key]
      if (typeof v !== 'undefined') out[key] = v
    }
    return out
  }
  return {}
}

function buildShotMarkdown(shot: Record<string, unknown>): string {
  const lines: string[] = []
  const shotId = String(shot.shot || '').trim()
  lines.push(`# Shot ${shotId || ''}`.trim())
  const timecode = String(shot.timecode || '').trim()
  const epoch = String(shot.epoch || '').trim()
  const frameLabel = String(shot.frame_label || '').trim()
  if (timecode || epoch || frameLabel) {
    lines.push('')
    if (timecode) lines.push(`- Timecode: ${timecode}`)
    if (epoch) lines.push(`- Epoch: ${epoch}`)
    if (frameLabel) lines.push(`- Frame: ${frameLabel}`)
  }
  const description = String(shot.description || '').trim()
  if (description) {
    lines.push('')
    lines.push('## Description')
    lines.push('')
    lines.push(description)
  }
  const duration = String(shot.duration || '').trim()
  if (duration) {
    lines.push('')
    lines.push(`- Duration: ${duration}`)
  }
  const imagePrompt = String(shot.image_prompt || '').trim()
  if (imagePrompt) {
    lines.push('')
    lines.push('## Image Prompt')
    lines.push('')
    lines.push(imagePrompt)
  }
  const videoPrompt = String(shot.video_prompt || '').trim()
  if (videoPrompt) {
    lines.push('')
    lines.push('## Video Prompt')
    lines.push('')
    lines.push(videoPrompt)
  }
  const camera = shot.camera
  if (camera && typeof camera === 'object') {
    lines.push('')
    lines.push('## Camera')
    lines.push('')
    try {
      lines.push('```json')
      lines.push(JSON.stringify(camera, null, 2))
      lines.push('```')
    } catch {
      lines.push(String(camera))
    }
  }
  return lines.join('\n').trim() + '\n'
}

function deriveDirectorBriefShotWidgets(meta: Record<string, unknown>): void {
  const directorBrief = isRecord(meta.director_brief) ? (meta.director_brief as Record<string, unknown>) : null
  if (!directorBrief) return
  const shots = Array.isArray(directorBrief.shots) ? directorBrief.shots : []
  if (shots.length === 0) return

  const rawNodes = Array.isArray(meta.nodes) ? meta.nodes : []
  const connections = Array.isArray(meta.connections) ? meta.connections.slice() : []
  const seenNodeIds = new Set<string>(rawNodes.map(n => (n && typeof n === 'object' && !Array.isArray(n) ? String((n as Record<string, unknown>).id || '').trim() : '')).filter(Boolean))
  const rawNodeIndexById = new Map<string, number>()
  for (let i = 0; i < rawNodes.length; i += 1) {
    const row = rawNodes[i]
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const id = String((row as Record<string, unknown>).id || '').trim()
    if (!id || rawNodeIndexById.has(id)) continue
    rawNodeIndexById.set(id, i)
  }

  const bounds = (() => {
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (let i = 0; i < rawNodes.length; i += 1) {
      const row = rawNodes[i]
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue
      const rec = row as Record<string, unknown>
      const pos = (rec.pos && typeof rec.pos === 'object' && !Array.isArray(rec.pos)) ? (rec.pos as Record<string, unknown>) : null
      const x = typeof pos?.x === 'number' && Number.isFinite(pos.x) ? pos.x : null
      const y = typeof pos?.y === 'number' && Number.isFinite(pos.y) ? pos.y : null
      if (x == null || y == null) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    const ok = Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minY) && Number.isFinite(maxY)
    return ok
      ? { minX, maxX, minY, maxY, hasPositionedNodes: true }
      : { minX: 0, maxX: 0, minY: 0, maxY: 0, hasPositionedNodes: false }
  })()

  const SHOT_WIDGET_COL_GAP_X = WIDGET_BASE_SIZE.width + 160
  const SHOT_PANEL_OFFSET_Y = WIDGET_LAYOUT_BASE_HEIGHT_PX + 140
  const SHOT_ROW_GAP_Y = SHOT_PANEL_OFFSET_Y + WIDGET_LAYOUT_BASE_HEIGHT_PX + 160
  const authoredCenterX = (bounds.minX + bounds.maxX) / 2
  const authoredCenterY = bounds.hasPositionedNodes ? (bounds.minY + bounds.maxY) / 2 : 0
  const GRID_START_X = authoredCenterX
  const GRID_START_Y = authoredCenterY
  const frontmatterSettings = readFrontmatterFlowRenderSettings(
    { metadata: { kind: 'frontmatter-flow', frontmatterFlowSettings: meta.frontmatterFlowSettings } } as unknown as GraphData,
  )
  const shotLayout = buildDirectorBriefShotLayoutConfig({
    shotCount: shots.length,
    startX: GRID_START_X,
    startY: GRID_START_Y,
    widgetBaseWidth: WIDGET_BASE_SIZE.width,
    widgetBaseHeight: WIDGET_LAYOUT_BASE_HEIGHT_PX,
    widgetColGapX: SHOT_WIDGET_COL_GAP_X,
    panelOffsetYBase: SHOT_PANEL_OFFSET_Y,
    rowGapYBase: SHOT_ROW_GAP_Y,
    balancedHeroRowCount: frontmatterSettings?.balancedHeroRowCount,
    balancedHeroRowGapScale: frontmatterSettings?.balancedHeroRowGapScale,
    balancedPanelOffsetScale: frontmatterSettings?.balancedPanelOffsetScale,
  })

  const textDefaults = pickFirstNodeDefaults({
    rawNodes,
    nodeTypeId: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
    keys: ['chatProvider', 'chatAuthMode', 'chatEndpointUrl', 'chatModel', 'chatThinkingType', 'chatReasoningEffort', 'chatStream'],
  })
  const imageDefaults = pickFirstNodeDefaults({
    rawNodes,
    nodeTypeId: FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
    keys: ['model', 'size', 'output_format', 'response_format', 'optimize_prompt_options', 'aspect_ratio', 'stream', 'watermark', 'seed', 'guidance_scale'],
  })
  const videoDefaults = pickFirstNodeDefaults({
    rawNodes,
    nodeTypeId: FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
    keys: ['model', 'ratio', 'resolution', 'duration', 'generate_audio', 'draft', 'camera_fixed', 'image_url_url'],
  })

  const appendConnection = (from: string, to: string, label: string, layoutLane: number) => appendFrontmatterBalancedConnection(connections, from, to, label, layoutLane)

  const appendNode = (node: Record<string, unknown>) => {
    const id = String(node.id || '').trim()
    if (!id) return
    const existingIndex = rawNodeIndexById.get(id)
    if (typeof existingIndex === 'number' && Number.isFinite(existingIndex)) {
      // Derived shot nodes are SSOT from director_brief.shots and should be refreshed.
      if (id.startsWith('db-shot-')) {
        rawNodes[existingIndex] = node
      }
      return
    }
    if (seenNodeIds.has(id)) return
    seenNodeIds.add(id)
    rawNodeIndexById.set(id, rawNodes.length)
    rawNodes.push(node)
  }

  for (let i = 0; i < shots.length; i += 1) {
    const shotRaw = shots[i]
    if (!isRecord(shotRaw)) continue
    const shot = shotRaw as Record<string, unknown>
    const shotId = String(shot.shot || '').trim() || `S${String(i + 1).padStart(2, '0')}`
    const shotKey = cleanIdPart(shotId) || `S${String(i + 1).padStart(2, '0')}`

    const textNodeId = `db-shot-${shotKey}-text`
    const textPanelId = `db-shot-${shotKey}-text-panel`
    const imageNodeId = `db-shot-${shotKey}-image`
    const imagePanelId = `db-shot-${shotKey}-image-panel`
    const videoNodeId = `db-shot-${shotKey}-video`
    const videoPanelId = `db-shot-${shotKey}-video-panel`

    const placement = readDirectorBriefShotPlacement({ index: i, layout: shotLayout })
    const x0 = placement.x0
    const y0 = placement.y0
    const colX = {
      text: x0 + 0 * shotLayout.gridColGapX,
      image: x0 + 1 * shotLayout.gridColGapX,
      video: x0 + 2 * shotLayout.gridColGapX,
    } as const

    const fieldSpecs: Array<{ fieldKey: string; fieldType: string; schemaPath: string }> = []
    const fieldValues: Record<string, unknown> = {}
    const addField = (k: string, v: unknown) => {
      const key = String(k || '').trim()
      if (!key) return
      fieldValues[key] = v
      fieldSpecs.push({ fieldKey: key, fieldType: guessJsonTypeLabel(v), schemaPath: `properties.${key}` })
    }

    const canonicalShotFieldKeys = ['shot', 'timecode', 'epoch', 'description', 'image_prompt', 'video_prompt']
    for (const key of canonicalShotFieldKeys) {
      addField(key, key === 'shot' ? shotId : (Object.prototype.hasOwnProperty.call(shot, key) ? shot[key] : ''))
    }
    for (const [k, v] of Object.entries(shot)) {
      const key = String(k || '').trim()
      if (!key || canonicalShotFieldKeys.includes(key)) continue
      addField(key, v)
    }
    addField('shot_index', i + 1)
    const durationSeconds = parseDurationSeconds(shot.duration)
    if (durationSeconds != null) addField('duration_seconds', durationSeconds)

    const appendCollectiveNode = (role: string, roleIndex: number, node: Record<string, unknown>) => appendNode(withFrontmatterCollectiveRoleProperties(node, { itemKey: shotId, itemIndex: i, role, roleIndex }))
    appendCollectiveNode('text', 0, {
      id: textNodeId,
      type: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
      label: `Shot ${shotId} · Text`,
      pos: { x: colX.text, y: y0 },
      properties: {
        ...textDefaults,
        ...fieldValues,
        [FRONTMATTER_FLOW_WIDGET_FIELDS_KEY]: fieldSpecs,
        output: buildShotMarkdown({ ...shot, shot: shotId }),
        'visual:zIndex': 0,
      },
    })
    appendCollectiveNode('textPanel', 0, {
      id: textPanelId,
      type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
      label: `Shot ${shotId} · Panel (Text)`,
      pos: { x: colX.text, y: y0 + shotLayout.panelOffsetY },
      properties: {
        richMediaActiveTab: 'text',
        media_interactive: true,
        'visual:zIndex': 1,
      },
    })

    const imagePrompt = String(shot.image_prompt || '').trim()
    appendCollectiveNode('image', 1, {
      id: imageNodeId,
      type: FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
      label: `Shot ${shotId} · Image`,
      pos: { x: colX.image, y: y0 },
      properties: {
        ...imageDefaults,
        ...(imagePrompt ? { prompt: imagePrompt } : null),
        shot: shotId,
        'visual:zIndex': 0,
      },
    })
    appendCollectiveNode('imagePanel', 1, {
      id: imagePanelId,
      type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
      label: `Shot ${shotId} · Panel (Image)`,
      pos: { x: colX.image, y: y0 + shotLayout.panelOffsetY },
      properties: {
        richMediaActiveTab: 'image',
        media_interactive: true,
        'visual:zIndex': 1,
      },
    })

    const videoPrompt = String(shot.video_prompt || '').trim()
    const durationOverride = durationSeconds != null ? { duration: durationSeconds } : null
    appendCollectiveNode('video', 2, {
      id: videoNodeId,
      type: FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
      label: `Shot ${shotId} · Video`,
      pos: { x: colX.video, y: y0 },
      properties: {
        ...videoDefaults,
        ...(videoPrompt ? { prompt: videoPrompt } : null),
        ...(durationOverride || null),
        shot: shotId,
        'visual:zIndex': 0,
      },
    })
    appendCollectiveNode('videoPanel', 2, {
      id: videoPanelId,
      type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
      label: `Shot ${shotId} · Panel (Video)`,
      pos: { x: colX.video, y: y0 + shotLayout.panelOffsetY },
      properties: {
        richMediaActiveTab: 'video',
        media_interactive: true,
        'visual:zIndex': 1,
      },
    })

    const laneSign = i % 2 === 0 ? 1 : -1
    appendConnection(`${textNodeId}.text_out`, `${textPanelId}.output`, 'text_out → output', laneSign)
    appendConnection(`${textNodeId}.outputSrcDoc`, `${textPanelId}.outputSrcDoc`, 'outputSrcDoc → outputSrcDoc', -laneSign)
    appendConnection(`${imageNodeId}.imageUrl`, `${imagePanelId}.imageUrl`, 'imageUrl → imageUrl', laneSign)
    appendConnection(`${imageNodeId}.imageUrl`, `${videoNodeId}.reference_image`, 'imageUrl → reference_image', 0)
    appendConnection(`${videoNodeId}.videoUrl`, `${videoPanelId}.videoUrl`, 'videoUrl → videoUrl', -laneSign)
  }

  meta.nodes = rawNodes
  meta.connections = connections
}

type DirectorBriefShotLayoutConfig = {
  shotGridCols: number
  shotCellWidth: number
  shotCellHeight: number
  gridStartX: number
  gridStartY: number
  gridColGapX: number
  panelOffsetY: number
  balancedHeroRowCount: number
  balancedHeroRowGapScale: number
  shotOrigins: Array<{ x0: number; y0: number }>
}

function buildDirectorBriefShotLayoutConfig(args: {
  shotCount: number
  startX: number
  startY: number
  widgetBaseWidth: number
  widgetBaseHeight: number
  widgetColGapX: number
  panelOffsetYBase: number
  rowGapYBase: number
  balancedHeroRowCount?: number
  balancedHeroRowGapScale?: number
  balancedPanelOffsetScale?: number
}): DirectorBriefShotLayoutConfig {
  const shotCellWidth = args.widgetColGapX * 2 + args.widgetBaseWidth + 160
  const shotCellHeight = args.rowGapYBase
  const chooseShotGridCols = (count: number): number => {
    const n = Math.max(1, Math.floor(count))
    const targetAspect = 16 / 9
    const minCols = n >= 3 ? 3 : 1
    const maxCols = Math.min(6, n)
    let bestCols = minCols
    let bestErr = Number.POSITIVE_INFINITY
    for (let cols = minCols; cols <= maxCols; cols += 1) {
      const rows = Math.ceil(n / cols)
      const aspect = (cols * shotCellWidth) / Math.max(1, rows * shotCellHeight)
      const err = Math.abs(Math.log(aspect / targetAspect))
      if (err < bestErr) {
        bestErr = err
        bestCols = cols
      }
    }
    return bestCols
  }

  const shotGridCols = chooseShotGridCols(args.shotCount)
  const layout = computeBalancedSpreadLayout({
    count: Math.max(1, Math.floor(args.shotCount)),
    viewportW: Math.max(1, shotGridCols * shotCellWidth),
    viewportH: Math.max(1, Math.ceil(Math.max(1, args.shotCount) / Math.max(1, shotGridCols)) * shotCellHeight),
    cellW: shotCellWidth,
    cellH: shotCellHeight,
    gapPx: 0,
    zoomK: 1,
    marginLeftPx: 0,
    marginRightPx: 0,
    marginTopPx: 0,
    marginBottomPx: 0,
  })
  const cells = layout.cells.map(cell => ({ ...cell }))
  const applyHeroRows = (inputCells: typeof cells): typeof cells => {
    const heroRowCount = args.balancedHeroRowCount || 0
    if (heroRowCount < 2) return inputCells
    const gapScale = args.balancedHeroRowGapScale || 1
    return inputCells.map((cell, index) => {
      const gridCol = index >= heroRowCount ? index - heroRowCount : index
      const gridRow = index >= heroRowCount ? 1 + Math.floor((index - heroRowCount) / Math.max(1, heroRowCount)) : 0
      const rowCount = gridRow === 0
        ? Math.min(heroRowCount, Math.max(1, args.shotCount))
        : Math.min(heroRowCount, Math.max(1, args.shotCount - heroRowCount - (gridRow - 1) * heroRowCount))
      const rowOffsetX = ((Math.max(1, shotGridCols) - Math.max(1, rowCount)) * shotCellWidth) / 2
      return {
        ...cell,
        left: rowOffsetX + gridCol * shotCellWidth,
        top: gridRow === 0 ? 0 : gridRow * shotCellHeight * gapScale,
        row: gridRow,
        col: gridCol,
      }
    })
  }
  const shotCells = applyHeroRows(cells)
  const shotBounds = shotCells.reduce(
    (acc, cell) => ({
      minX: Math.min(acc.minX, cell.left),
      minY: Math.min(acc.minY, cell.top),
      maxX: Math.max(acc.maxX, cell.left + shotCellWidth),
      maxY: Math.max(acc.maxY, cell.top + shotCellHeight),
    }),
    { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY },
  )
  const shotBandWidth = Number.isFinite(shotBounds.maxX - shotBounds.minX) ? Math.max(1, shotBounds.maxX - shotBounds.minX) : shotGridCols * shotCellWidth
  const shotBandHeight = Number.isFinite(shotBounds.maxY - shotBounds.minY) ? Math.max(1, shotBounds.maxY - shotBounds.minY) : Math.ceil(Math.max(1, args.shotCount) / Math.max(1, shotGridCols)) * shotCellHeight
  const shotBandMinX = Number.isFinite(shotBounds.minX) ? shotBounds.minX : 0
  const shotBandMinY = Number.isFinite(shotBounds.minY) ? shotBounds.minY : 0
  const shotOrigins = shotCells.map(cell => ({
    x0: args.startX - shotBandWidth / 2 + (cell.left - shotBandMinX),
    y0: args.startY - shotBandHeight / 2 + (cell.top - shotBandMinY),
  }))

  return {
    shotGridCols,
    shotCellWidth,
    shotCellHeight,
    gridStartX: args.startX,
    gridStartY: args.startY,
    gridColGapX: args.widgetColGapX,
    panelOffsetY: args.panelOffsetYBase * (args.balancedPanelOffsetScale || 1),
    balancedHeroRowCount: args.balancedHeroRowCount || 0,
    balancedHeroRowGapScale: args.balancedHeroRowGapScale || 1,
    shotOrigins,
  }
}

function readDirectorBriefShotPlacement(args: {
  index: number
  layout: DirectorBriefShotLayoutConfig
}): { x0: number; y0: number } {
  const { index, layout } = args
  return layout.shotOrigins[index] || { x0: layout.gridStartX, y0: layout.gridStartY }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function isChatAgenticGraphDoc(meta: Record<string, unknown>): boolean {
  const topType = asString(meta.type).toLowerCase()
  if (topType === 'chatagentic-graph') return true
  const doc = meta.doc
  if (!isRecord(doc)) return false
  const docType = asString(doc.type).toLowerCase()
  return docType === 'chatagentic-graph'
}

function isChatAgenticGraphFrontmatterText(args: {
  lines: string[]
  frontmatterStartLine: number
  frontmatterEndLineExclusive: number
}): boolean {
  const lines = Array.isArray(args.lines) ? args.lines : []
  const start = Math.max(0, Math.floor(args.frontmatterStartLine))
  const endExclusive = Math.min(lines.length, Math.max(start, Math.floor(args.frontmatterEndLineExclusive)))
  if (endExclusive <= start) return false
  for (let i = start; i < endExclusive; i += 1) {
    const line = String(lines[i] || '').trim()
    if (!line || line.startsWith('#')) continue
    if (/^type\s*:\s*["']?chatagentic-graph["']?\s*$/i.test(line)) return true
  }
  return false
}

function cleanIdPart(v: unknown): string {
  return String(typeof v === 'string' ? v : '').trim().replace(/[^a-zA-Z0-9_-]/g, '_')
}

function readFrontmatterFlowDirection(metaRecord: Record<string, unknown>): 'LR' | 'RL' | 'TB' | 'BT' {
  const settings = isRecord(metaRecord.frontmatterFlowSettings)
    ? (metaRecord.frontmatterFlowSettings as Record<string, unknown>)
    : null
  const raw = settings ? asString(settings.direction).toUpperCase() : ''
  return raw === 'RL' || raw === 'TB' || raw === 'BT' ? raw : 'LR'
}

function shouldSeedBalancedNodeLayout(nodes: ReadonlyArray<GraphNode>): boolean {
  if (!Array.isArray(nodes) || nodes.length === 0) return false
  let autoSeeded = 0
  let explicitPositioned = 0
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]
    const props = isRecord(node?.properties) ? (node.properties as Record<string, unknown>) : null
    const isAutoSeeded = props?.['frontmatter:autoSeededPos'] === true
    if (isAutoSeeded) {
      autoSeeded += 1
      continue
    }
    const x = typeof node?.x === 'number' && Number.isFinite(node.x) ? node.x : null
    const y = typeof node?.y === 'number' && Number.isFinite(node.y) ? node.y : null
    if (x != null && y != null) explicitPositioned += 1
  }
  if (explicitPositioned >= 3) return false
  if (autoSeeded === 0) return false
  const minAutoSeeded = Math.max(3, Math.floor(nodes.length * 0.6))
  return autoSeeded >= minAutoSeeded
}

function assignBalancedViewportSpread(args: {
  nodes: GraphNode[]
  edges: GraphEdge[]
  direction: 'LR' | 'RL' | 'TB' | 'BT'
}): GraphNode[] {
  const nodes = Array.isArray(args.nodes) ? args.nodes : []
  if (nodes.length === 0) return nodes
  const nodeIds = new Set<string>()
  const indegree = new Map<string, number>()
  const outgoing = new Map<string, string[]>()
  const rank = new Map<string, number>()
  for (let i = 0; i < nodes.length; i += 1) {
    const id = asString(nodes[i]?.id)
    if (!id) continue
    nodeIds.add(id)
    indegree.set(id, 0)
    outgoing.set(id, [])
    rank.set(id, 0)
  }
  for (let i = 0; i < args.edges.length; i += 1) {
    const edge = args.edges[i]
    const source = asString(edge?.source)
    const target = asString(edge?.target)
    if (!source || !target || source === target || !nodeIds.has(source) || !nodeIds.has(target)) continue
    outgoing.get(source)?.push(target)
    indegree.set(target, (indegree.get(target) || 0) + 1)
  }
  const queue = Array.from(nodeIds).filter(id => (indegree.get(id) || 0) === 0).sort((a, b) => a.localeCompare(b))
  while (queue.length > 0) {
    const id = queue.shift()!
    const neighbors = outgoing.get(id) || []
    for (let i = 0; i < neighbors.length; i += 1) {
      const target = neighbors[i]!
      rank.set(target, Math.max(rank.get(target) || 0, (rank.get(id) || 0) + 1))
      const nextIn = (indegree.get(target) || 0) - 1
      indegree.set(target, nextIn)
      if (nextIn === 0) {
        queue.push(target)
        queue.sort((a, b) => a.localeCompare(b))
      }
    }
  }

  const buckets = new Map<number, GraphNode[]>()
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]!
    const bucket = rank.get(asString(node.id)) || 0
    const list = buckets.get(bucket) || []
    list.push(node)
    buckets.set(bucket, list)
  }
  const bucketIds = Array.from(buckets.keys()).sort((a, b) => a - b)
  const STEP_X = 380
  const STEP_Y = 240
  const out: GraphNode[] = []
  for (let bi = 0; bi < bucketIds.length; bi += 1) {
    const bucket = bucketIds[bi]!
    const group = (buckets.get(bucket) || []).slice().sort((a, b) => {
      const typeCompare = asString(a.type).localeCompare(asString(b.type))
      if (typeCompare !== 0) return typeCompare
      return asString(a.id).localeCompare(asString(b.id))
    })
    const centerOffset = (group.length - 1) / 2
    for (let gi = 0; gi < group.length; gi += 1) {
      const node = group[gi]!
      const props = isRecord(node.properties)
        ? ({ ...(node.properties as Record<string, JSONValue>) } as Record<string, JSONValue>)
        : ({} as Record<string, JSONValue>)
      const primary = bucket * STEP_X
      const secondary = Math.round((gi - centerOffset) * STEP_Y)
      let x = primary
      let y = secondary
      if (args.direction === 'RL') x = -primary
      if (args.direction === 'TB' || args.direction === 'BT') {
        x = secondary
        y = primary
      }
      if (args.direction === 'BT') y = -primary
      if (typeof props['visual:xIndex'] === 'undefined') props['visual:xIndex'] = Math.floor(x / 320) as unknown as JSONValue
      if (typeof props['visual:yIndex'] === 'undefined') props['visual:yIndex'] = Math.floor(y / 220) as unknown as JSONValue
      if (typeof props['visual:zIndex'] === 'undefined') props['visual:zIndex'] = bucket as unknown as JSONValue
      if (props['frontmatter:autoSeededPos'] === true) delete props['frontmatter:autoSeededPos']
      out.push({ ...node, x, y, properties: props })
    }
  }
  return out
}

function readFlowWarnings(metaRecord: Record<string, unknown>): string[] {
  const raw = metaRecord[FRONTMATTER_FLOW_WARNINGS_KEY]
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (let i = 0; i < raw.length; i += 1) {
    const warning = asString(raw[i])
    if (!warning) continue
    out.push(warning)
  }
  return out
}

function coerceFrontmatterScalar(raw: string): unknown {
  const value = String(raw || '').trim()
  if (!value) return ''
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  const lower = value.toLowerCase()
  if (lower === 'true') return true
  if (lower === 'false') return false
  if (lower === 'null') return null
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value)
  return value
}

function stripYamlInlineComment(raw: string): string {
  const src = String(raw || '')
  if (!src.includes('#')) return src
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
      continue
    }
    if (ch === '"' && !inSingle) {
      const prev = i > 0 ? src[i - 1] : ''
      if (prev !== '\\') inDouble = !inDouble
      continue
    }
    if (ch === '#' && !inSingle && !inDouble) {
      const prev = i > 0 ? src[i - 1] : ''
      if (!prev || /\s/.test(prev)) return src.slice(0, i).trimEnd()
    }
  }
  return src
}

function readFrontmatterScalarFallback(args: {
  lines: string[]
  frontmatterStartLine: number
  frontmatterEndLineExclusive: number
}): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const lines = Array.isArray(args.lines) ? args.lines : []
  const start = Math.max(0, Math.floor(args.frontmatterStartLine))
  const endExclusive = Math.min(lines.length, Math.max(start, Math.floor(args.frontmatterEndLineExclusive)))
  for (let i = start; i < endExclusive; i += 1) {
    const rawLine = String(lines[i] || '')
    const trimmed = rawLine.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    if (countIndent(rawLine) !== 0) continue
    const m = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(trimmed)
    if (!m) continue
    const key = asString(m[1])
    if (!key || Object.prototype.hasOwnProperty.call(out, key)) continue
    const rawValue = stripYamlInlineComment(String(m[2] || ''))
    const value = rawValue.trim()
    if (!value || value === '|' || value === '>') continue
    out[key] = coerceFrontmatterScalar(value)
  }
  return out
}

function buildSourceFrontmatterMeta(meta: Record<string, unknown>): Record<string, unknown> | null {
  if (!isRecord(meta)) return null
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(meta)) {
    const k = asString(key)
    if (!k) continue
    if (k === 'nodes' || k === 'connections' || k === 'socket_types') continue
    if (k === 'frontmatterFlowSettings' || k === 'frontmatterFlowWarnings') continue
    if (k === 'frontmatter:chatAgenticGraphRelaxed') continue
    out[k] = value
  }
  return Object.keys(out).length > 0 ? out : null
}

function readFrontmatterStableId(frontmatterMeta: Record<string, unknown> | null, fallbackName: string): string {
  const id = asString(frontmatterMeta?.id)
  if (id) return id
  const graphId = asString(frontmatterMeta?.graphId)
  if (graphId) return graphId
  return cleanIdPart(fallbackName) || 'frontmatter'
}

function readTopLevelFrontmatterSectionValue(args: {
  lines: string[]
  frontmatterStartLine: number
  frontmatterEndLineExclusive: number
  key: 'runtime' | 'pipeline' | 'mermaid' | 'flow' | 'widget_bundle' | 'graph_meta' | 'index'
}): unknown {
  const lines = Array.isArray(args.lines) ? args.lines : []
  const start = Math.max(0, Math.floor(args.frontmatterStartLine))
  const endExclusive = Math.min(lines.length, Math.max(start, Math.floor(args.frontmatterEndLineExclusive)))
  if (endExclusive <= start) return undefined
  let sectionStart = -1
  for (let i = start; i < endExclusive; i += 1) {
    const raw = String(lines[i] || '')
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    if (countIndent(raw) !== 0) continue
    if (trimmed.startsWith(`${args.key}:`)) {
      sectionStart = i
      break
    }
  }
  if (sectionStart < 0) return undefined
  let sectionEnd = endExclusive
  for (let i = sectionStart + 1; i < endExclusive; i += 1) {
    const raw = String(lines[i] || '')
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    if (countIndent(raw) !== 0) continue
    if (/^---\s*$/.test(trimmed)) {
      sectionEnd = i
      break
    }
    if (/^[A-Za-z0-9_.-]+\s*:/.test(trimmed)) {
      sectionEnd = i
      break
    }
  }
  const synthetic = ['---', ...lines.slice(sectionStart, sectionEnd), '---']
  try {
    const parsed = parseMarkdownFrontmatter(synthetic)
    const meta = parsed.meta
    if (!isRecord(meta)) return undefined
    return (meta as Record<string, unknown>)[args.key]
  } catch {
    return undefined
  }
}

function readTopLevelNestedBlockScalarValue(args: {
  lines: string[]
  frontmatterStartLine: number
  frontmatterEndLineExclusive: number
  topLevelKey: string
  nestedKey: string
}): string {
  const lines = Array.isArray(args.lines) ? args.lines : []
  const start = Math.max(0, Math.floor(args.frontmatterStartLine))
  const endExclusive = Math.min(lines.length, Math.max(start, Math.floor(args.frontmatterEndLineExclusive)))
  if (endExclusive <= start) return ''

  let sectionStart = -1
  for (let i = start; i < endExclusive; i += 1) {
    const raw = String(lines[i] || '')
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    if (countIndent(raw) !== 0) continue
    if (trimmed === `${args.topLevelKey}:`) {
      sectionStart = i
      break
    }
  }
  if (sectionStart < 0) return ''

  let sectionEnd = endExclusive
  for (let i = sectionStart + 1; i < endExclusive; i += 1) {
    const raw = String(lines[i] || '')
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    if (countIndent(raw) !== 0) continue
    if (/^---\s*$/.test(trimmed) || /^[A-Za-z0-9_.-]+\s*:/.test(trimmed)) {
      sectionEnd = i
      break
    }
  }

  const sectionIndent = countIndent(String(lines[sectionStart] || ''))
  let nestedStart = -1
  let nestedIndent = -1
  let inlineScalar = ''
  for (let i = sectionStart + 1; i < sectionEnd; i += 1) {
    const raw = String(lines[i] || '')
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const indent = countIndent(raw)
    if (indent <= sectionIndent) continue
    const blockMatch = new RegExp(`^${args.nestedKey}\\s*:\\s*[|>]\\s*$`).exec(trimmed)
    if (blockMatch) {
      nestedStart = i
      nestedIndent = indent
      break
    }
    const inlineMatch = new RegExp(`^${args.nestedKey}\\s*:\\s*(.+)$`).exec(trimmed)
    if (inlineMatch) {
      inlineScalar = asString(inlineMatch[1])
      break
    }
  }
  if (inlineScalar) return inlineScalar
  if (nestedStart < 0 || nestedIndent < 0) return ''

  const valueLines: string[] = []
  for (let i = nestedStart + 1; i < sectionEnd; i += 1) {
    const raw = String(lines[i] || '')
    const trimmed = raw.trim()
    const indent = countIndent(raw)
    if (trimmed && indent <= nestedIndent) break
    valueLines.push(indent > nestedIndent ? raw.slice(Math.min(raw.length, nestedIndent + 2)) : '')
  }
  return valueLines.join('\n').trim()
}

function readFrontmatterIndexMermaidValue(args: {
  meta: Record<string, unknown>
  lines: string[]
  frontmatterStartLine: number
  frontmatterEndLineExclusive: number
}): string {
  const indexRaw = args.meta.index
  if (isRecord(indexRaw)) {
    const inline = asString((indexRaw as Record<string, unknown>).mermaid)
    if (inline) return inline
  }
  const dotted = asString(args.meta['index.mermaid'])
  if (dotted) return dotted
  const rawNested = readTopLevelNestedBlockScalarValue({
    lines: args.lines,
    frontmatterStartLine: args.frontmatterStartLine,
    frontmatterEndLineExclusive: args.frontmatterEndLineExclusive,
    topLevelKey: 'index',
    nestedKey: 'mermaid',
  })
  if (rawNested) return rawNested
  const fromRaw = readTopLevelFrontmatterSectionValue({
    lines: args.lines,
    frontmatterStartLine: args.frontmatterStartLine,
    frontmatterEndLineExclusive: args.frontmatterEndLineExclusive,
    key: 'index',
  })
  if (!isRecord(fromRaw)) return ''
  return asString((fromRaw as Record<string, unknown>).mermaid)
}

function deriveFlowMetaFromIndexMermaid(args: {
  meta: Record<string, unknown>
  lines: string[]
  frontmatterStartLine: number
  frontmatterEndLineExclusive: number
}): Record<string, unknown> {
  const meta = args.meta
  if (Array.isArray(meta.nodes) && meta.nodes.length > 0) return meta
  if (isRecord(meta.flow) || (Array.isArray(meta.connections) && meta.connections.length > 0)) return meta
  const mermaid = readFrontmatterIndexMermaidValue(args)
  if (!mermaid) return meta
  return buildFlowMetaFromIndexMermaidSeed({ meta, mermaid }) || meta
}

function buildFlowMetaFromIndexMermaidSeed(args: {
  meta: Record<string, unknown>
  mermaid: string
}): Record<string, unknown> | null {
  const meta = args.meta
  const mermaid = String(args.mermaid || '').trim()
  if (!mermaid) return null
  const lines = mermaid.split('\n')
  const nodeKeyToLabel = new Map<string, string>()
  const nodeKeys = new Set<string>()
  let direction: 'LR' | 'RL' | 'TB' | 'BT' | null = null
  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i] || '').trim()
    if (!line || line.startsWith('%%')) continue
    const flowDecl = /^(?:flowchart|graph)\s+(TD|LR|RL|TB|BT)\b/i.exec(line)
    if (flowDecl) {
      const raw = String(flowDecl[1] || '').toUpperCase()
      direction = raw === 'RL' || raw === 'TB' || raw === 'BT' ? raw : 'LR'
    }
    const quotedDefs = line.matchAll(/([A-Za-z0-9_:-]+)\s*\[\s*"([^"]+)"\s*\]/g)
    for (const def of quotedDefs) {
      const nodeKey = asString(def[1])
      const label = asString(def[2])
      if (!nodeKey) continue
      nodeKeys.add(nodeKey)
      if (label) nodeKeyToLabel.set(nodeKey, label)
    }
    const plainDefs = line.matchAll(/([A-Za-z0-9_:-]+)\s*\[\s*([^\]]+)\s*\]/g)
    for (const def of plainDefs) {
      const nodeKey = asString(def[1])
      const label = asString(def[2])
      if (!nodeKey) continue
      nodeKeys.add(nodeKey)
      if (label && !nodeKeyToLabel.has(nodeKey)) nodeKeyToLabel.set(nodeKey, label)
    }
  }
  const connections: Array<Record<string, unknown>> = []
  const seen = new Set<string>()
  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i] || '').trim()
    if (!line || line.startsWith('%%')) continue
    const edge = /^([A-Za-z0-9_:-]+)(?:\s*\[[^\]]*\])?\s*-->\s*(?:\|([^|]+)\|)?\s*([A-Za-z0-9_:-]+)(?:\s*\[[^\]]*\])?/.exec(line)
    if (!edge) continue
    const source = asString(edge[1])
    const target = asString(edge[3])
    if (!source || !target || source === target) continue
    nodeKeys.add(source)
    nodeKeys.add(target)
    const label = asString(edge[2] || '')
    const labelArrow = label.includes('→') ? '→' : label.includes('->') ? '->' : ''
    const fromPort = labelArrow ? asString(label.split(labelArrow)[0]) || 'output' : 'output'
    const toPort = labelArrow ? asString(label.split(labelArrow)[1]) || 'input' : 'input'
    const uniq = `${source}|${fromPort}|${target}|${toPort}|${label}`
    if (seen.has(uniq)) continue
    seen.add(uniq)
    connections.push({
      id: `index-e${String(connections.length + 1).padStart(2, '0')}-${hashText(uniq)}`,
      from_node: source,
      from_port: fromPort,
      to_node: target,
      to_port: toPort,
      ...(label ? { label } : {}),
    })
  }
  const nodes = Array.from(nodeKeys)
    .sort((a, b) => a.localeCompare(b))
    .map((id): Record<string, unknown> => ({
      id,
      type: 'default',
      label: nodeKeyToLabel.get(id) || id,
    }))
  if (nodes.length === 0) return null
  const mergedFlowSettings = isRecord(meta.frontmatterFlowSettings)
    ? { ...(meta.frontmatterFlowSettings as Record<string, unknown>) }
    : {}
  if (direction) mergedFlowSettings.direction = direction
  return {
    ...meta,
    nodes,
    connections,
    ...(Object.keys(mergedFlowSettings).length > 0 ? { frontmatterFlowSettings: mergedFlowSettings } : {}),
  }
}

function tryBuildFrontmatterFlowGraphFromIndexMermaid(args: {
  name: string
  meta: Record<string, unknown>
  lines: string[]
  frontmatterStartLine: number
  frontmatterEndLineExclusive: number
}): { graphData: GraphData; warnings: string[] } | null {
  const mermaid = readFrontmatterIndexMermaidValue({
    meta: args.meta,
    lines: args.lines,
    frontmatterStartLine: args.frontmatterStartLine,
    frontmatterEndLineExclusive: args.frontmatterEndLineExclusive,
  })
  const seededMeta = buildFlowMetaFromIndexMermaidSeed({ meta: args.meta, mermaid })
  if (!seededMeta) return null

  const metaRecord = normalizeMetaWithFlowBlock(seededMeta)
  const normalized = normalizeNodes(metaRecord)
  if (!normalized) return null

  const connParsed = parseConnections(metaRecord)
  ensureAugmentedPortsFromDeclaredConnections({ nodes: normalized.nodes, registry: normalized.registry, declared: connParsed.declared })
  const edges = connParsed.edges
  const layoutedNodes = shouldSeedBalancedNodeLayout(normalized.nodes)
    ? assignBalancedViewportSpread({
        nodes: normalized.nodes,
        edges,
        direction: readFrontmatterFlowDirection(metaRecord),
      })
    : normalized.nodes
  const frontmatterMeta = enrichSourceFrontmatterMetaFromRawLines({
    sourceFrontmatterMeta: buildSourceFrontmatterMeta(seededMeta),
    lines: args.lines,
    frontmatterStartLine: args.frontmatterStartLine,
    frontmatterEndLineExclusive: args.frontmatterEndLineExclusive,
  })
  const stableId = readFrontmatterStableId(frontmatterMeta, args.name)
  const sourceLayerHash = buildFrontmatterFlowSourceLayerHash({
    stableId,
    nodes: layoutedNodes,
    edges,
    subgraphs: [],
  })
  const socketTypes = readSocketTypes(metaRecord)
  const warnings = [
    ...readFlowWarnings(metaRecord),
    ...buildConnectionWarnings({ meta: metaRecord, socketTypes, declared: connParsed.declared }),
  ]
  const flowSettings = isRecord(metaRecord.frontmatterFlowSettings) ? (metaRecord.frontmatterFlowSettings as Record<string, unknown>) : null
  const registry = mergeWidgetRegistryEntries(readAuthoredWidgetRegistryEntries(metaRecord), normalized.registry)
  const metadata = buildFrontmatterFlowMetadata({
    sourceLayerHash,
    frontmatterMeta,
    socketTypes,
    flowSettings,
    annotations: { refs: [], nodeIds: [], edgeIds: [], clusterIds: [] },
    registry,
    subgraphs: [],
  })
  warnings.sort((a, b) => a.localeCompare(b))
  return {
    graphData: {
      type: 'Graph',
      context: 'frontmatter-flow',
      nodes: layoutedNodes,
      edges,
      metadata,
    },
    warnings,
  }
}

function enrichSourceFrontmatterMetaFromRawLines(args: {
  sourceFrontmatterMeta: Record<string, unknown> | null
  lines: string[]
  frontmatterStartLine: number
  frontmatterEndLineExclusive: number
}): Record<string, unknown> | null {
  const base = isRecord(args.sourceFrontmatterMeta) ? { ...args.sourceFrontmatterMeta } : {}
  const keys: Array<'runtime' | 'pipeline' | 'mermaid' | 'flow' | 'widget_bundle' | 'graph_meta' | 'index'> = [
    'runtime',
    'pipeline',
    'mermaid',
    'flow',
    'widget_bundle',
    'graph_meta',
    'index',
  ]
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i]
    if (typeof base[key] !== 'undefined') continue
    const value = readTopLevelFrontmatterSectionValue({
      lines: args.lines,
      frontmatterStartLine: args.frontmatterStartLine,
      frontmatterEndLineExclusive: args.frontmatterEndLineExclusive,
      key,
    })
    if (typeof value === 'undefined') continue
    base[key] = value
  }
  return Object.keys(base).length > 0 ? base : null
}

function readWidgetBundleNodeTypeId(formIdRaw: unknown): string {
  const formId = asString(formIdRaw)
  if (formId === 'textGeneration' || formId === FLOW_VIDEO_SCRIPT_FORM_ID || formId === FLOW_OPENAI_VIDEO_SCRIPT_FORM_ID) return FLOW_TEXT_GENERATION_NODE_TYPE_ID
  if (formId === 'imageGeneration' || formId === 'videoGeneration') return formId === 'imageGeneration' ? FLOW_IMAGE_GENERATION_NODE_TYPE_ID : FLOW_VIDEO_GENERATION_NODE_TYPE_ID
  if (formId === 'richMediaPanel') return FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
  if (formId === 'videoTranscriber') return FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID
  return 'Node'
}

function asFlatStringArray(raw: unknown): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const add = (v: unknown) => {
    const s = asString(v)
    if (!s || seen.has(s)) return
    seen.add(s)
    out.push(s)
  }
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i += 1) {
      const row = raw[i]
      if (isRecord(row) && asString((row as Record<string, unknown>).port)) add((row as Record<string, unknown>).port)
      else add(row)
    }
    return out
  }
  if (isRecord(raw)) {
    const rec = raw as Record<string, unknown>
    if (asString(rec.port)) add(rec.port)
    return out
  }
  add(raw)
  return out
}

function inferWidgetPortDirection(args: { handleKey: string; portKey: string }): 'input' | 'output' {
  const handleKey = String(args.handleKey || '').trim().toLowerCase()
  const portKey = String(args.portKey || '').trim().toLowerCase()
  if (
    handleKey.includes('out')
    || portKey.endsWith('_out')
    || portKey === 'imageurl'
    || portKey === 'videourl'
    || portKey === 'text_out'
  ) {
    return 'output'
  }
  if (
    handleKey.includes('in')
    || portKey.endsWith('_in')
    || portKey === 'reference_image'
    || portKey === 'image_url_url'
    || portKey === 'input'
  ) {
    return 'input'
  }
  return 'input'
}

function readWidgetBundleFlowDirection(rawGraphMeta: unknown): 'LR' | 'RL' | 'TB' | 'BT' | null {
  if (!isRecord(rawGraphMeta)) return null
  const direction = asString((rawGraphMeta as Record<string, unknown>).direction).toUpperCase()
  if (direction === 'RIGHT') return 'LR'
  if (direction === 'LEFT') return 'RL'
  if (direction === 'TOP') return 'TB'
  if (direction === 'BOTTOM') return 'BT'
  return null
}

function parseWidgetBundleMermaidWiring(args: {
  mermaid: string
  widgetIdSet: Set<string>
}): Array<Record<string, unknown>> {
  const mermaid = String(args.mermaid || '')
  if (!mermaid.trim()) return []
  const nodeKeyToNodeId = new Map<string, string>()
  const lines = mermaid.split('\n')
  const readNodeIdFromLabel = (labelRaw: string): string => {
    const label = String(labelRaw || '')
    const m = /<br\s*\/?>\s*([A-Za-z0-9_-]+)/i.exec(label)
    if (m && args.widgetIdSet.has(String(m[1] || '').trim())) return String(m[1] || '').trim()
    const compact = label.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim()
    if (args.widgetIdSet.has(compact)) return compact
    return ''
  }
  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i] || '').trim()
    if (!line) continue
    const quotedDefs = line.matchAll(/([A-Za-z0-9_]+)\s*\[\s*"([^"]+)"\s*\]/g)
    for (const def of quotedDefs) {
      const nodeKey = asString(def[1])
      const nodeId = readNodeIdFromLabel(def[2] || '')
      if (nodeKey && nodeId) nodeKeyToNodeId.set(nodeKey, nodeId)
    }
    const plainDefs = line.matchAll(/([A-Za-z0-9_]+)\s*\[\s*([^\]]+)\s*\]/g)
    for (const def of plainDefs) {
      const nodeKey = asString(def[1])
      const nodeId = readNodeIdFromLabel(def[2] || '')
      if (nodeKey && nodeId) nodeKeyToNodeId.set(nodeKey, nodeId)
    }
  }
  const out: Array<Record<string, unknown>> = []
  const seen = new Set<string>()
  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i] || '').trim()
    if (!line) continue
    const edge = /^([A-Za-z0-9_]+)(?:\s*\[[^\]]*\])?\s*-->\s*(?:\|([^|]+)\|)?\s*([A-Za-z0-9_]+)(?:\s*\[[^\]]*\])?/.exec(line)
    if (!edge) continue
    const sourceNodeKey = asString(edge[1])
    const targetNodeKey = asString(edge[3])
    const source = nodeKeyToNodeId.get(sourceNodeKey) || (args.widgetIdSet.has(sourceNodeKey) ? sourceNodeKey : '')
    const target = nodeKeyToNodeId.get(targetNodeKey) || (args.widgetIdSet.has(targetNodeKey) ? targetNodeKey : '')
    if (!source || !target || source === target) continue
    const label = asString(edge[2] || '')
    const labelArrow = label.includes('→') ? '→' : label.includes('->') ? '->' : ''
    const fromPort = labelArrow ? asString(label.split(labelArrow)[0]) || 'output' : 'output'
    const toPort = labelArrow ? asString(label.split(labelArrow)[1]) || 'input' : 'input'
    if (!fromPort || !toPort) continue
    const uniq = `${source}|${fromPort}|${target}|${toPort}`
    if (seen.has(uniq)) continue
    seen.add(uniq)
    out.push({
      id: `wb-e${String(out.length + 1).padStart(2, '0')}-${hashText(uniq)}`,
      from_node: source,
      from_port: fromPort,
      to_node: target,
      to_port: toPort,
      ...(label ? { label } : {}),
    })
  }
  return out
}

function deriveFlowMetaFromWidgetBundle(args: {
  meta: Record<string, unknown>
  lines: string[]
  frontmatterStartLine: number
  frontmatterEndLineExclusive: number
}): Record<string, unknown> {
  const meta = args.meta
  if (Array.isArray(meta.nodes) && meta.nodes.length > 0) return meta
  if (isRecord(meta.flow) || (Array.isArray(meta.connections) && meta.connections.length > 0)) return meta
  const widgetBundleRaw = typeof meta.widget_bundle !== 'undefined'
    ? meta.widget_bundle
    : readTopLevelFrontmatterSectionValue({
        lines: args.lines,
        frontmatterStartLine: args.frontmatterStartLine,
        frontmatterEndLineExclusive: args.frontmatterEndLineExclusive,
        key: 'widget_bundle',
      })
  if (!isRecord(widgetBundleRaw)) return meta
  const widgetBundle = widgetBundleRaw as Record<string, unknown>
  const widgets = Array.isArray(widgetBundle.widgets) ? widgetBundle.widgets : []
  if (widgets.length === 0) return meta
  const nodes: Array<Record<string, unknown>> = []
  const widgetIdSet = new Set<string>()
  const declaredPortsByNode = new Map<string, { input: Set<string>; output: Set<string> }>()
  for (let i = 0; i < widgets.length; i += 1) {
    const row = widgets[i]
    if (!isRecord(row)) continue
    const id = asString((row as Record<string, unknown>).id)
    if (!id || widgetIdSet.has(id)) continue
    widgetIdSet.add(id)
    const formId = asString((row as Record<string, unknown>).formId)
    const type = readWidgetBundleNodeTypeId(formId)
    const properties: Record<string, unknown> = {
      ...(formId ? { [FLOW_WIDGET_FORM_ID_KEY]: formId } : {}),
    }
    const fields: Array<{ fieldKey: string; fieldType: string; schemaPath: string }> = []
    const rawProperties = Array.isArray((row as Record<string, unknown>).properties)
      ? ((row as Record<string, unknown>).properties as unknown[])
      : []
    for (let j = 0; j < rawProperties.length; j += 1) {
      const prop = rawProperties[j]
      if (!isRecord(prop)) continue
      const key = asString((prop as Record<string, unknown>).key)
      if (!key) continue
      const fieldType = asString((prop as Record<string, unknown>).type) || 'string'
      properties[key] = (prop as Record<string, unknown>).value
      fields.push({ fieldKey: key, fieldType, schemaPath: key })
    }
    if (fields.length > 0) properties[FRONTMATTER_FLOW_WIDGET_FIELDS_KEY] = fields
    const handles = isRecord((row as Record<string, unknown>).handles)
      ? ((row as Record<string, unknown>).handles as Record<string, unknown>)
      : null
    const declared = { input: new Set<string>(), output: new Set<string>() }
    if (handles) {
      for (const [handleKey, rawHandle] of Object.entries(handles)) {
        const ports = asFlatStringArray(rawHandle)
        for (let p = 0; p < ports.length; p += 1) {
          const portKey = ports[p]
          const direction = inferWidgetPortDirection({ handleKey, portKey })
          declared[direction].add(portKey)
        }
      }
      properties[FRONTMATTER_FLOW_HANDLES_VALUE_KEY] = {
        target: Array.from(declared.input),
        source: Array.from(declared.output),
      }
    }
    declaredPortsByNode.set(id, declared)
    nodes.push({
      id,
      type,
      label: id,
      properties,
    })
  }
  if (nodes.length === 0) return meta
  const mermaidRaw = typeof meta.mermaid === 'string'
    ? meta.mermaid
    : typeof widgetBundle.mermaid === 'string'
      ? widgetBundle.mermaid
    : String(
        readTopLevelFrontmatterSectionValue({
          lines: args.lines,
          frontmatterStartLine: args.frontmatterStartLine,
          frontmatterEndLineExclusive: args.frontmatterEndLineExclusive,
          key: 'mermaid',
        }) || '',
      )
  const connections = parseWidgetBundleMermaidWiring({
    mermaid: mermaidRaw,
    widgetIdSet,
  })
  const usedInputByNode = new Map<string, Set<string>>()
  const usedOutputByNode = new Map<string, Set<string>>()
  for (let i = 0; i < connections.length; i += 1) {
    const conn = connections[i] as Record<string, unknown>
    const source = asString(conn.from_node)
    const target = asString(conn.to_node)
    const fromPort = asString(conn.from_port)
    const toPort = asString(conn.to_port)
    if (source && fromPort) {
      const set = usedOutputByNode.get(source) || new Set<string>()
      set.add(fromPort)
      usedOutputByNode.set(source, set)
    }
    if (target && toPort) {
      const set = usedInputByNode.get(target) || new Set<string>()
      set.add(toPort)
      usedInputByNode.set(target, set)
    }
  }
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i] as Record<string, unknown>
    const nodeId = asString(node.id)
    const declared = declaredPortsByNode.get(nodeId) || { input: new Set<string>(), output: new Set<string>() }
    const sourceFromConnections = usedOutputByNode.get(nodeId) || new Set<string>()
    const targetFromConnections = usedInputByNode.get(nodeId) || new Set<string>()
    const inputs = new Set<string>([...declared.input, ...targetFromConnections])
    const outputs = new Set<string>([...declared.output, ...sourceFromConnections])
    node.inputs = Array.from(inputs).sort((a, b) => a.localeCompare(b)).map(port => ({ port }))
    node.outputs = Array.from(outputs).sort((a, b) => a.localeCompare(b)).map(port => ({ port }))
  }
  const graphMetaRaw = typeof meta.graph_meta !== 'undefined'
    ? meta.graph_meta
    : typeof widgetBundle.graph_meta !== 'undefined'
      ? widgetBundle.graph_meta
    : readTopLevelFrontmatterSectionValue({
        lines: args.lines,
        frontmatterStartLine: args.frontmatterStartLine,
        frontmatterEndLineExclusive: args.frontmatterEndLineExclusive,
        key: 'graph_meta',
      })
  const direction = readWidgetBundleFlowDirection(graphMetaRaw)
  return {
    ...meta,
    nodes,
    connections,
    ...(direction ? { frontmatterFlowSettings: { direction } } : {}),
  }
}

export function tryParseMarkdownFrontmatterFlowGraph(
  name: string,
  text: string,
): { graphData: GraphData; warnings: string[] } | null {
  let raw = repairWrappedQuotedFrontmatterKeys(repairFlowInlineEnvelopeBlockScalars(String(text || '').replace(/^\uFEFF/, '')))
  if (!raw.trimStart().startsWith('---')) {
    const rawLines = splitMarkdownLines(raw)
    const unfencedYamlEnd = findLeadingUnfencedYamlMetadataEnd(rawLines)
    if (unfencedYamlEnd > 0) raw = ['---', ...rawLines.slice(0, unfencedYamlEnd), '---', ...rawLines.slice(unfencedYamlEnd)].join('\n')
  }
  if (!raw.trimStart().startsWith('---')) {
    const lines = splitMarkdownLines(raw)
    const flowFromBody = tryParseFlowBlockFromMarkdownBodyLines({ lines })
    if (!flowFromBody) return null

    const metaRecord = normalizeMetaWithFlowBlock({ flow: flowFromBody } as Record<string, unknown>)
    const normalized = normalizeNodes(metaRecord)
    if (!normalized) return null

    const connParsed = parseConnections(metaRecord)
    ensureAugmentedPortsFromDeclaredConnections({ nodes: normalized.nodes, registry: normalized.registry, declared: connParsed.declared })

    const edges = connParsed.edges
    const layoutedNodes = shouldSeedBalancedNodeLayout(normalized.nodes)
      ? assignBalancedViewportSpread({
          nodes: normalized.nodes,
          edges,
          direction: readFrontmatterFlowDirection(metaRecord),
        })
      : normalized.nodes
    const frontmatterMeta = buildSourceFrontmatterMeta(metaRecord)
    const stableId = readFrontmatterStableId(frontmatterMeta, name)
    const sourceLayerHash = buildFrontmatterFlowSourceLayerHash({
      stableId,
      nodes: layoutedNodes,
      edges,
      subgraphs: [],
    })
    const socketTypes = readSocketTypes(metaRecord)
    const warnings = [
      ...readFlowWarnings(metaRecord),
      ...buildConnectionWarnings({ meta: metaRecord, socketTypes, declared: connParsed.declared }),
    ]
    const flowSettings = isRecord(metaRecord.frontmatterFlowSettings) ? (metaRecord.frontmatterFlowSettings as Record<string, unknown>) : null
    const registry = mergeWidgetRegistryEntries(readAuthoredWidgetRegistryEntries(metaRecord), normalized.registry)
    const metadata = buildFrontmatterFlowMetadata({
      sourceLayerHash,
      frontmatterMeta,
      socketTypes,
      flowSettings,
      annotations: { refs: [], nodeIds: [], edgeIds: [], clusterIds: [] },
      registry,
      subgraphs: [],
    })

    warnings.sort((a, b) => a.localeCompare(b))
    return {
      graphData: {
        type: 'Graph',
        context: 'frontmatter-flow',
        nodes: layoutedNodes,
        edges,
        metadata,
      },
      warnings,
    }
  }

  const lines = splitMarkdownLines(raw)
  let lead = 0
  while (lead < lines.length && !String(lines[lead] || '').trim()) lead += 1
  if (!/^---\s*$/.test(String(lines[lead] || ''))) return null
  let frontmatterClose = -1
  for (let i = lead + 1; i < lines.length; i += 1) {
    if (/^---\s*$/.test(String(lines[i] || ''))) {
      frontmatterClose = i
      break
    }
  }
  if (frontmatterClose < 0) return null

  const initialSegment = lines.slice(lead, frontmatterClose + 1)
  const initial = parseMarkdownFrontmatter(initialSegment)
  const initialMeta = initial.meta
  const frontmatterParseWarnings = Array.isArray(initial.warnings) ? initial.warnings.filter(Boolean) : []
  let meta: Record<string, unknown> = {}
  let startIndex = frontmatterClose + 1
  if (initialMeta && typeof initialMeta === 'object' && !Array.isArray(initialMeta)) {
    meta = initialMeta as Record<string, unknown>
  }
  const hasFlowBlock = isRecord((meta as Record<string, unknown>).flow)
  const initialNormalized = normalizeNodes(hasFlowBlock ? normalizeMetaWithFlowBlock(meta) : meta)
  if (!initialNormalized) {
    if (!hasFlowBlock) {
      const merged = tryParseMergedFrontmatterMetaWithNodes(lines)
      if (merged) {
        meta = merged.meta
        startIndex = merged.startIndex
      }
    }
  }
  if (!normalizeNodes(hasFlowBlock ? normalizeMetaWithFlowBlock(meta) : meta) && !hasFlowBlock) {
    const fallback = tryParseSigilFrontmatter(lines, lead)
    if (fallback) {
      meta = fallback.meta
      startIndex = fallback.startIndex
    }
  }

  const flowFallback = tryParseFlowBlockFromFrontmatterLines({
    lines,
    frontmatterStartLine: lead + 1,
    frontmatterEndLineExclusive: frontmatterClose + 1,
  })
  const metaWithFlowFallback =
    !isRecord((meta as Record<string, unknown>).flow) && flowFallback
      ? { ...meta, flow: flowFallback }
      : meta
  const scalarFallback = readFrontmatterScalarFallback({
    lines,
    frontmatterStartLine: lead + 1,
    frontmatterEndLineExclusive: frontmatterClose + 1,
  })
  const metaWithScalarFallback = { ...scalarFallback, ...metaWithFlowFallback }
  const metaWithWidgetBundleFallback = deriveFlowMetaFromWidgetBundle({
    meta: metaWithScalarFallback,
    lines,
    frontmatterStartLine: lead + 1,
    frontmatterEndLineExclusive: frontmatterClose + 1,
  })
  const metaWithIndexMermaidFallback = deriveFlowMetaFromIndexMermaid({
    meta: metaWithWidgetBundleFallback,
    lines,
    frontmatterStartLine: lead + 1,
    frontmatterEndLineExclusive: frontmatterClose + 1,
  })
  const directIndexMermaidGraph = tryBuildFrontmatterFlowGraphFromIndexMermaid({
    name,
    meta: metaWithWidgetBundleFallback,
    lines,
    frontmatterStartLine: lead + 1,
    frontmatterEndLineExclusive: frontmatterClose,
  })
  if (directIndexMermaidGraph) return directIndexMermaidGraph
  const chatAgenticGraphDoc =
    isChatAgenticGraphDoc(metaWithIndexMermaidFallback) ||
    isChatAgenticGraphFrontmatterText({
      lines,
      frontmatterStartLine: lead + 1,
      frontmatterEndLineExclusive: frontmatterClose + 1,
    })
  const metaForNormalization = chatAgenticGraphDoc
    ? ({ ...metaWithIndexMermaidFallback, 'frontmatter:chatAgenticGraphRelaxed': true } as Record<string, unknown>)
    : metaWithIndexMermaidFallback

  let metaRecord = normalizeMetaWithFlowBlock(metaForNormalization as Record<string, unknown>)
  deriveDirectorBriefShotWidgets(metaRecord)
  deriveFlowDiagramsWidgets(metaRecord)
  const sourceFrontmatterMeta = enrichSourceFrontmatterMetaFromRawLines({
    sourceFrontmatterMeta: buildSourceFrontmatterMeta(metaWithIndexMermaidFallback),
    lines,
    frontmatterStartLine: lead + 1,
    frontmatterEndLineExclusive: frontmatterClose,
  })
  const extracted = chatAgenticGraphDoc
    ? { connections: [], socketTypes: null as Record<string, unknown> | null }
    : extractConnectionsAndSocketTypesFromMarkdownTables({
        lines,
        startIndex,
        existingConnections: metaRecord.connections,
        existingSocketTypes: metaRecord.socket_types,
      })
  if ((!Array.isArray(metaRecord.connections) || metaRecord.connections.length === 0) && extracted.connections.length > 0) {
    metaRecord.connections = extracted.connections
  }
  if ((!isRecord(metaRecord.socket_types) || Object.keys(metaRecord.socket_types).length === 0) && extracted.socketTypes) {
    metaRecord.socket_types = extracted.socketTypes
  }
  registerFlowDiagramSocketType(metaRecord)

  let normalized = normalizeNodes(metaRecord) || (hasOnlyRoutedFlowDiagramSpecs(metaRecord)
    ? { nodes: [], registry: [] }
    : null)
  if (!normalized) {
    const mermaid = readFrontmatterIndexMermaidValue({
      meta: metaWithWidgetBundleFallback,
      lines,
      frontmatterStartLine: lead + 1,
      frontmatterEndLineExclusive: frontmatterClose,
    })
    const indexMermaidSeedMeta = buildFlowMetaFromIndexMermaidSeed({
      meta: metaWithWidgetBundleFallback,
      mermaid,
    })
    if (indexMermaidSeedMeta) {
      metaRecord = normalizeMetaWithFlowBlock(indexMermaidSeedMeta)
      normalized = normalizeNodes(metaRecord)
    }
  }
  if (!normalized) return null

  const hasFlowDerivedNodes = isRecord(metaRecord.flow)
  const annotations = chatAgenticGraphDoc || hasFlowDerivedNodes
    ? { refs: [], nodeIds: [], edgeIds: [], clusterIds: [] }
    : extractFrontmatterBodyAnnotations(lines, startIndex)
  const mermaidWiring = hasFlowDerivedNodes
    ? { edges: [], edgeNodeIds: [] as string[] }
    : extractEdgesFromFrontmatterMermaidWiring({
        lines,
        frontmatterStartLine: lead,
        frontmatterEndLineExclusive: startIndex - 1,
      })
  const knownNodeIds = appendAnnotationNodes({
    nodes: normalized.nodes,
    annotations,
    mermaidEdgeNodeIds: mermaidWiring.edgeNodeIds,
  })

  const clusters = hasFlowDerivedNodes
    ? { clusterNodes: [], subgraphs: [] as UserSubgraph[] }
    : normalizeClusters(metaRecord, normalized.nodes)
  if (!hasFlowDerivedNodes) {
    for (let i = 0; i < clusters.clusterNodes.length; i += 1) {
      const n = clusters.clusterNodes[i]
      const id = asString(n.id)
      if (!id || knownNodeIds.has(id)) continue
      knownNodeIds.add(id)
      normalized.nodes.push(n)
    }
  }

  const connParsed = parseConnections(metaRecord)
  ensureAugmentedPortsFromDeclaredConnections({ nodes: normalized.nodes, registry: normalized.registry, declared: connParsed.declared })
  const edgesFromConnections = connParsed.edges
  const sigilEdges = chatAgenticGraphDoc || hasFlowDerivedNodes
    ? []
    : normalizeEdgesFromSigilSpecs({
        meta: metaRecord,
        nodeIds: Array.from(knownNodeIds),
      })
  const rawNodes = Array.isArray(metaRecord.nodes) ? (metaRecord.nodes as unknown[]) : []
  const nodeInputEdges = normalizeEdgesFromNodeInputs(rawNodes as Record<string, unknown>[])
  const baseEdges = edgesFromConnections.length > 0 ? edgesFromConnections : nodeInputEdges
  const edges = mergeEdges({
    mermaidEdges: mermaidWiring.edges,
    baseEdges,
    sigilEdges,
  })
  const layoutedNodes = shouldSeedBalancedNodeLayout(normalized.nodes)
    ? assignBalancedViewportSpread({
        nodes: normalized.nodes,
        edges,
        direction: readFrontmatterFlowDirection(metaRecord),
      })
    : normalized.nodes
  const subgraphsBase = normalizeSubgraphsFromFrontmatter({ meta: metaRecord, rawNodes }) || []
  const mergedSubgraphs = mergeSubgraphs({
    baseSubgraphs: subgraphsBase,
    clusterSubgraphs: clusters.subgraphs,
  })
  const subgraphs = mergedSubgraphs

  const stableId = readFrontmatterStableId(sourceFrontmatterMeta, name)
  const sourceLayerHash = buildFrontmatterFlowSourceLayerHash({
    stableId,
    nodes: layoutedNodes,
    edges,
    subgraphs,
  })

  const socketTypes = readSocketTypes(metaRecord)
  const warnings = [
    ...frontmatterParseWarnings,
    ...readFlowWarnings(metaRecord),
    ...buildConnectionWarnings({ meta: metaRecord, socketTypes, declared: connParsed.declared }),
    ...collectNodePositionWarnings(rawNodes),
  ]
  const flowSettings = isRecord(metaRecord.frontmatterFlowSettings) ? (metaRecord.frontmatterFlowSettings as Record<string, unknown>) : null
  const registry = mergeWidgetRegistryEntries(readAuthoredWidgetRegistryEntries(metaRecord), normalized.registry)
  const metadata = buildFrontmatterFlowMetadata({
    sourceLayerHash,
    frontmatterMeta: sourceFrontmatterMeta,
    socketTypes,
    flowSettings,
    annotations,
    registry,
    subgraphs,
  })
  const graphData: GraphData = {
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: layoutedNodes,
    edges,
    metadata,
  }

  warnings.sort((a, b) => a.localeCompare(b))
  return { graphData, warnings }
}
