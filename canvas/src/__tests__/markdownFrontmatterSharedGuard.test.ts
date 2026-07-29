import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  getCanvas2dRendererLabel,
  getCanvas2dSurfaceId,
  resolveCanvas2dRendererId,
  supportsStoryboardFlowFrontmatterSyntax,
} from '@/lib/config.render'
import {
  parseCanvasWorkspaceFrontmatterPreset,
  readBottomSurfaceTabPreset,
  readFloatingPanelViewPreset,
} from '@/lib/markdown/frontmatter'

export const testMarkdownFrontmatterReusesSharedPlainObjectGuard = () => {
  const filePath = resolve(process.cwd(), 'src', 'lib', 'markdown', 'frontmatter.ts')
  const text = readFileSync(filePath, 'utf8')
  if (!text.includes("import { isPlainObject } from '@/lib/graph/value'")) {
    throw new Error('expected markdown frontmatter parsing to reuse the shared plain-object guard upstream')
  }
  if (!text.includes('if (isPlainObject(parsed.meta)) {')) {
    throw new Error('expected markdown frontmatter preset parsing to branch on the shared plain-object guard for parsed metadata')
  }
  if (!text.includes('const preset = coerceCanvasWorkspaceFrontmatterPreset(parsed.meta)')) {
    throw new Error('expected markdown frontmatter preset parsing to normalize parsed metadata exactly once before caching')
  }
  if (!text.includes("const cacheKey = hashStringToHexCached('markdown-frontmatter:preset', block.rawBlock)")) {
    throw new Error('expected markdown frontmatter preset parsing to reuse a shared text hash cache for identical frontmatter blocks')
  }
  if (text.includes('function isRecord(value: unknown): value is Record<string, unknown> {')) {
    throw new Error('expected markdown frontmatter parsing to stop defining a local record guard')
  }
}

export const testMarkdownFrontmatterParsesCanvasWorkspacePreset = () => {
  const preset = parseCanvasWorkspaceFrontmatterPreset(`---
kgCanvasSurfaceMode: "2d"
kgCanvas2dRenderer: storyboard
kgFrontmatterModeEnabled: true
kgDocumentSemanticMode: keyword
---`)
  if (!preset) throw new Error('expected canvas workspace frontmatter preset to parse')
  if (preset.canvasSurfaceMode !== '2d') {
    throw new Error(`expected 2d surface mode, got ${String(preset.canvasSurfaceMode)}`)
  }
  if (preset.canvas2dRenderer !== 'storyboard') {
    throw new Error(`expected Storyboard 2D renderer, got ${String(preset.canvas2dRenderer)}`)
  }
  if (preset.frontmatterModeEnabled !== true || preset.documentSemanticMode !== 'keyword') {
    throw new Error(`expected boolean frontmatter preset flags to persist, got ${JSON.stringify(preset)}`)
  }
}

export const testMarkdownFrontmatterNormalizesCanonicalCanvasRendererTokens = () => {
  const preset = parseCanvasWorkspaceFrontmatterPreset(`---
kgCanvasRenderMode: "Surface 2D"
kgCanvas2dRenderer: "Storyboard"
---`)
  if (!preset) throw new Error('expected canvas render mode token preset to parse')
  if (preset.canvasRenderMode !== '2d') {
    throw new Error(`expected Surface 2D token to normalize to 2d, got ${String(preset.canvasRenderMode)}`)
  }
  if (preset.canvas2dRenderer !== 'storyboard') {
    throw new Error(`expected Storyboard token to normalize to storyboard, got ${String(preset.canvas2dRenderer)}`)
  }
}

export const testMarkdownFrontmatterNormalizesXrSurfaceAlias = () => {
  if (readFloatingPanelViewPreset('camera') !== 'camera' || readFloatingPanelViewPreset('animation') !== 'animation' || readFloatingPanelViewPreset('media') !== 'media' || readFloatingPanelViewPreset('gameMode') !== 'gameMode' || readFloatingPanelViewPreset('xr') !== undefined) {
    throw new Error('expected the canonical FloatingPanel reader to preserve Game Mode, Media, Animation, and Camera while rejecting the removed XR panel')
  }
  if (readBottomSurfaceTabPreset('xr') !== undefined) {
    throw new Error('expected the canonical BottomPanel reader to reject the removed XR route')
  }
  const preset = parseCanvasWorkspaceFrontmatterPreset(`---
kgCanvasSurfaceMode: "XR Mode"
kgBottomPanelTab: xr
kgFloatingPanelOpen: true
kgFloatingPanelView: xr
---`)
  if (!preset) throw new Error('expected XR surface alias preset to parse')
  if (preset.canvasSurfaceMode !== 'xr') {
    throw new Error(`expected XR surface alias to normalize to xr, got ${String(preset.canvasSurfaceMode)}`)
  }
  if (preset.floatingPanelOpen !== true || preset.floatingPanelView !== undefined) {
    throw new Error(`expected stale FloatingPanel XR frontmatter to be rejected without an alias, got ${JSON.stringify(preset)}`)
  }
  if (preset.bottomPanelTab !== undefined) {
    throw new Error(`expected stale BottomPanel XR frontmatter to be rejected without an alias, got ${String(preset.bottomPanelTab)}`)
  }
  const renderPreset = parseCanvasWorkspaceFrontmatterPreset(`---
kgCanvasRenderMode: "XR Mode"
---`)
  if (!renderPreset || renderPreset.canvasRenderMode !== '3d' || renderPreset.canvas3dMode !== 'xr') {
    throw new Error(`expected XR render alias to resolve to 3d render surface plus xr mode, got ${JSON.stringify(renderPreset)}`)
  }
  const geoXrPreset = parseCanvasWorkspaceFrontmatterPreset(`---
kgCanvasSurfaceMode: "Geo+XR Mode"
---`)
  if (!geoXrPreset || geoXrPreset.canvasSurfaceMode !== 'geo-xr' || geoXrPreset.canvas3dMode !== 'xr') {
    throw new Error(`expected Geo+XR alias to resolve to the composed Geo and XR surface, got ${JSON.stringify(geoXrPreset)}`)
  }
}

export const testCanvas2dRendererNormalizationUsesStoryboardFlowSyntaxOwner = () => {
  const legacyTimelineRendererAlias = ['Timeline', 'Animation'].join(' ')
  if (resolveCanvas2dRendererId('Animatic') !== 'animatic') {
    throw new Error('expected shared renderer normalizer to resolve Animatic upstream')
  }
  if (resolveCanvas2dRendererId('Multi-dimensional Table') !== 'multiDimTable') {
    throw new Error('expected shared renderer normalizer to resolve Multi-dimensional Table upstream')
  }
  if (getCanvas2dRendererLabel('multiDimTable') !== 'Multi-dimensional Table' || getCanvas2dSurfaceId('multiDimTable') !== 'multiDimTable') {
    throw new Error('expected Multi-dimensional Table renderer id to resolve to the shared table surface')
  }
  if (getCanvas2dRendererLabel('animatic') !== 'Animatic' || getCanvas2dSurfaceId('animatic') !== 'animatic') {
    throw new Error('expected Animatic renderer id to resolve to the dedicated animatic surface')
  }
  if (!supportsStoryboardFlowFrontmatterSyntax('storyboard')) {
    throw new Error('expected Storyboard to own the shared flow-frontmatter syntax')
  }
  if (resolveCanvas2dRendererId(legacyTimelineRendererAlias) !== undefined) {
    throw new Error('expected legacy timeline renderer alias to be removed instead of remapped')
  }
  if (supportsStoryboardFlowFrontmatterSyntax('animatic')) {
    throw new Error('expected Animatic to stay outside Storyboard flow-frontmatter syntax after adapting to Gantt-timeline')
  }
  if (supportsStoryboardFlowFrontmatterSyntax('d3')) {
    throw new Error('expected non-flow renderers to stay outside the shared Storyboard flow-frontmatter syntax owner')
  }
}

export const testMarkdownFrontmatterCachesPresetByFrontmatterBlock = () => {
  const presetA = parseCanvasWorkspaceFrontmatterPreset(`---
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: storyboard
---

# A`)
  const presetB = parseCanvasWorkspaceFrontmatterPreset(`---
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: storyboard
---

# B`)
  if (!presetA || !presetB) throw new Error('expected cached canvas workspace presets to parse')
  if (presetA !== presetB) {
    throw new Error('expected identical frontmatter blocks to reuse the cached preset instance')
  }
}
