import { UI_FONT_SANS } from 'grph-shared/ui/typography'
import { binarySearchFloor, clamp, getVisibleColumnsRange, getVisibleRange } from './fastGridMath'
import { parseGeodataValueToLatLng } from '@/features/geospatial/geodataValue'

type Rgb = { r: number; g: number; b: number }

function parseCssColorToRgb(input: string): Rgb | null {
  const raw = String(input || '').trim()
  if (!raw) return null
  if (raw.startsWith('#')) {
    const hex = raw.slice(1)
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16)
      const g = parseInt(hex[1] + hex[1], 16)
      const b = parseInt(hex[2] + hex[2], 16)
      if ([r, g, b].some(n => Number.isNaN(n))) return null
      return { r, g, b }
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      if ([r, g, b].some(n => Number.isNaN(n))) return null
      return { r, g, b }
    }
    return null
  }
  const m = raw.match(/^rgba?\(([^)]+)\)$/i)
  if (!m) return null
  const parts = m[1]
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  if (parts.length < 3) return null
  const r = Number(parts[0])
  const g = Number(parts[1])
  const b = Number(parts[2])
  if ([r, g, b].some(n => Number.isNaN(n))) return null
  return { r: clamp(Math.round(r), 0, 255), g: clamp(Math.round(g), 0, 255), b: clamp(Math.round(b), 0, 255) }
}

function rgba(rgb: Rgb, a: number): string {
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${clamp(a, 0, 1)})`
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  const raw = String(text || '')
  if (!raw) return ''
  if (maxWidth <= 0) return ''
  if (ctx.measureText(raw).width <= maxWidth) return raw
  const ellipsis = '…'
  const ellipsisW = ctx.measureText(ellipsis).width
  if (ellipsisW >= maxWidth) return ''

  let lo = 0
  let hi = raw.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const slice = raw.slice(0, mid)
    if (ctx.measureText(slice).width + ellipsisW <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return `${raw.slice(0, Math.max(0, lo))}${ellipsis}`
}

export type GridColumnMeta = {
  kind: 'select' | 'order' | 'data'
  id: string
  title: string
  width: number
  pinned: boolean
  editable: boolean
  dataKind?: 'text' | 'number' | 'boolean' | 'date' | 'json' | 'geodata'
}

export type GridDisplayRow<RowT> =
  | { kind: 'group'; label: string; count: number }
  | { kind: 'row'; row: RowT; groupLabel?: string }

export type GridLayout = {
  pinned: GridColumnMeta[]
  scrollable: GridColumnMeta[]
  pinnedWidth: number
  scrollableOffsets: number[]
  totalWidth: number
  totalHeight: number
}

export type GridTheme = {
  fontSize: string
  fontFamily: string
  panelBgSolid: string
  divider: string
  border: string
  textPrimary: string
  textSecondary: string
  textTertiary: string
  accent: string
  tooltipText: string
}

export function readGridTheme(viewportEl: HTMLElement): GridTheme {
  const computedViewport = window.getComputedStyle(viewportEl)
  const computedRoot = window.getComputedStyle(document.documentElement)

  const fontSize = computedViewport.fontSize || '12px'
  const fontFamily = computedViewport.fontFamily || UI_FONT_SANS

  const divider = computedRoot.getPropertyValue('--kg-divider')?.trim() || 'rgba(0,0,0,0.12)'
  const border = computedRoot.getPropertyValue('--kg-border')?.trim() || 'rgba(0,0,0,0.18)'
  const textPrimary = computedViewport.color?.trim() || computedRoot.getPropertyValue('--kg-text-primary')?.trim() || '#111'
  const textSecondary = computedRoot.getPropertyValue('--kg-text-secondary')?.trim() || '#666'
  const textTertiary = computedRoot.getPropertyValue('--kg-text-tertiary')?.trim() || '#888'
  const accent = computedRoot.getPropertyValue('--kg-canvas-accent')?.trim() || '#3b82f6'
  const tooltipText = computedRoot.getPropertyValue('--kg-tooltip-text')?.trim() || '#fff'

  const panelBgRgb = computedRoot.getPropertyValue('--panel-bg-rgb')?.trim()
  const panelOpacity = computedRoot.getPropertyValue('--panel-opacity')?.trim()
  const panelBg = computedRoot.getPropertyValue('--kg-panel-bg')?.trim() || '#ffffff'

  const panelBgSolid =
    panelBgRgb && panelOpacity
      ? `rgba(${panelBgRgb},${panelOpacity})`
      : panelBgRgb
        ? `rgb(${panelBgRgb})`
        : panelBg

  return { fontSize, fontFamily, panelBgSolid, divider, border, textPrimary, textSecondary, textTertiary, accent, tooltipText }
}

export type GridHit<RowT> = {
  x: number
  y: number
  inHeader: boolean
  rowIndex: number
  rowItem: GridDisplayRow<RowT> | null
  col: GridColumnMeta | null
  scrollableColIndex: number
}

export function getCellText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatDateCellText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') {
    const raw = value.trim()
    if (!raw) return ''
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return `${m[1]}-${m[2]}-${m[3]}`
    const ms = Date.parse(raw)
    if (Number.isFinite(ms)) return new Date(ms).toISOString().slice(0, 10)
    return raw
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    try {
      return new Date(value).toISOString().slice(0, 10)
    } catch {
      return String(value)
    }
  }
  if (value instanceof Date) {
    const ms = value.getTime()
    if (Number.isFinite(ms)) return new Date(ms).toISOString().slice(0, 10)
  }
  return getCellText(value)
}

export function getCellTextByKind(value: unknown, kind?: GridColumnMeta['dataKind']): string {
  if (kind === 'date') return formatDateCellText(value)
  if (kind === 'geodata') {
    const geo = parseGeodataValueToLatLng(value)
    if (geo) return `${geo.lat}, ${geo.lng}`
  }
  return getCellText(value)
}

export function hitTest<RowT extends { id: string }>(args: {
  clientX: number
  clientY: number
  viewportEl: HTMLElement
  scrollLeft: number
  scrollTop: number
  rowHeight: number
  headerHeight: number
  layout: GridLayout
  displayRows: GridDisplayRow<RowT>[]
}): GridHit<RowT> | null {
  const { viewportEl, clientX, clientY, scrollLeft, scrollTop, rowHeight, headerHeight, layout, displayRows } = args
  const rect = viewportEl.getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top
  const viewportW = Math.max(1, viewportEl.clientWidth)
  const viewportH = Math.max(1, viewportEl.clientHeight)
  if (x < 0 || y < 0 || x > viewportW || y > viewportH) return null

  const inHeader = y <= headerHeight
  const rowIndex = inHeader ? -1 : Math.floor((y - headerHeight + scrollTop) / rowHeight)
  const rowItem = rowIndex >= 0 && rowIndex < displayRows.length ? displayRows[rowIndex] : null

  let col: GridColumnMeta | null = null
  let scrollableColIndex = -1

  if (x < layout.pinnedWidth) {
    let acc = 0
    for (const c of layout.pinned) {
      if (x >= acc && x < acc + c.width) {
        col = c
        break
      }
      acc += c.width
    }
  } else {
    const sx = x - layout.pinnedWidth + scrollLeft
    const idx = clamp(binarySearchFloor(layout.scrollableOffsets, sx), 0, Math.max(0, layout.scrollable.length - 1))
    const start = layout.scrollableOffsets[idx] || 0
    const end = layout.scrollableOffsets[idx + 1] || start
    if (sx >= start && sx < end) {
      col = layout.scrollable[idx] || null
      scrollableColIndex = idx
    }
  }

  return { x, y, inHeader, rowIndex, rowItem, col, scrollableColIndex }
}

export function drawGrid<RowT extends { id: string; __order?: number }>(args: {
  canvas: HTMLCanvasElement
  viewportEl: HTMLElement
  scrollLeft: number
  scrollTop: number
  rowHeight: number
  headerHeight: number
  layout: GridLayout
  displayRows: GridDisplayRow<RowT>[]
  selectedSet: Set<string>
  allSelected: boolean
  someSelected: boolean
  sortIndexByColumnId: Record<string, { dir: 'asc' | 'desc'; index: number }>
  isGroupCollapsed: (label: string) => boolean
  reorderHint?: { columnId: string; side: 'left' | 'right' } | null
  selectedColumnId?: string | null
  theme?: GridTheme | null
}): void {
  const {
    canvas,
    viewportEl,
    scrollLeft,
    scrollTop,
    rowHeight,
    headerHeight,
    layout,
    displayRows,
    selectedSet,
    allSelected,
    someSelected,
    sortIndexByColumnId,
    isGroupCollapsed,
    reorderHint,
    selectedColumnId,
    theme,
  } = args

  const scrollLeftPx = scrollLeft
  const scrollTopPx = scrollTop

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const w = Math.max(1, viewportEl.clientWidth)
  const h = Math.max(1, viewportEl.clientHeight)
  const nextW = Math.max(1, Math.round(w * dpr))
  const nextH = Math.max(1, Math.round(h * dpr))
  if (canvas.width !== nextW) canvas.width = nextW
  if (canvas.height !== nextH) canvas.height = nextH
  const cssW = `${w}px`
  const cssH = `${h}px`
  if (canvas.style.width !== cssW) canvas.style.width = cssW
  if (canvas.style.height !== cssH) canvas.style.height = cssH

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const resolvedTheme = theme || readGridTheme(viewportEl)
  const { fontSize, fontFamily, panelBgSolid, divider, border, textPrimary, textSecondary, textTertiary, accent, tooltipText } = resolvedTheme
  ctx.font = `400 ${fontSize} ${fontFamily}`
  ctx.textBaseline = 'middle'
  const accentRgb = parseCssColorToRgb(accent) || { r: 59, g: 130, b: 246 }
  const textPrimaryRgb = parseCssColorToRgb(textPrimary) || { r: 17, g: 24, b: 39 }
  const rowSelectedBg = rgba(accentRgb, 0.14)
  const colSelectedBg = rgba(accentRgb, 0.10)
  const groupRowBg = rgba(textPrimaryRgb, 0.035)

  ctx.fillStyle = panelBgSolid
  ctx.fillRect(0, 0, w, h)

  const drawCheckbox = (x: number, y: number, size: number, checked: boolean, indeterminate: boolean) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.lineWidth = 1
    ctx.strokeStyle = border
    ctx.beginPath()
    ctx.rect(0.5, 0.5, size - 1, size - 1)
    ctx.stroke()
    if (checked || indeterminate) {
      ctx.fillStyle = rgba(accentRgb, 0.95)
      ctx.beginPath()
      ctx.rect(1, 1, size - 2, size - 2)
      ctx.fill()
      ctx.strokeStyle = tooltipText
      ctx.lineWidth = 2
      ctx.beginPath()
      if (indeterminate) {
        ctx.moveTo(3, Math.round(size / 2))
        ctx.lineTo(size - 3, Math.round(size / 2))
      } else {
        ctx.moveTo(3, Math.round(size / 2))
        ctx.lineTo(Math.round(size / 2) - 1, size - 4)
        ctx.lineTo(size - 3, 4)
      }
      ctx.stroke()
    }
    ctx.restore()
  }

  const drawCellText = (
    text: string,
    x: number,
    y: number,
    cellW: number,
    color: string,
    bold: boolean,
    clipMinX?: number,
  ) => {
    ctx.save()
    ctx.fillStyle = color
    ctx.font = `${bold ? 600 : 400} ${fontSize} ${fontFamily}`
    const cellStart = x + 6
    const cellEnd = x + cellW - 6
    const clipStart = Math.max(cellStart, typeof clipMinX === 'number' ? clipMinX : cellStart)
    const clipW = cellEnd - clipStart
    if (clipW > 0) {
      ctx.beginPath()
      ctx.rect(clipStart, y + 1, clipW, rowHeight - 2)
      ctx.clip()
      const maxTextW = Math.max(0, clipW - 4)
      ctx.fillText(ellipsize(ctx, text, maxTextW), clipStart + 2, y + rowHeight / 2)
    }
    ctx.restore()
  }

  ctx.fillStyle = panelBgSolid
  ctx.fillRect(0, 0, w, headerHeight)

  if (selectedColumnId) {
    const pinned = layout.pinned.find(c => c.id === selectedColumnId)
    if (pinned) {
      let x = 0
      for (const c of layout.pinned) {
        if (c.id === selectedColumnId) break
        x += c.width
      }
      ctx.save()
      ctx.fillStyle = colSelectedBg
      ctx.fillRect(x, 0, pinned.width, headerHeight)
      ctx.restore()
    } else {
      const idx = layout.scrollable.findIndex(c => c.id === selectedColumnId)
      if (idx >= 0) {
        const col = layout.scrollable[idx]
        const colX = layout.scrollableOffsets[idx] || 0
        const x = layout.pinnedWidth + colX - scrollLeftPx
        ctx.save()
        ctx.beginPath()
        ctx.rect(layout.pinnedWidth, 0, Math.max(0, w - layout.pinnedWidth), headerHeight)
        ctx.clip()
        ctx.fillStyle = colSelectedBg
        ctx.fillRect(x, 0, col.width, headerHeight)
        ctx.restore()
      }
    }
  }
  ctx.strokeStyle = divider
  ctx.lineWidth = 1

  let pinnedX = 0
  for (const col of layout.pinned) {
    const x = pinnedX
    const cellW = col.width
    if (col.kind === 'select') {
      drawCheckbox(x + 14, 7, 14, allSelected, !allSelected && someSelected)
    } else {
      drawCellText(col.title, x, 0, cellW, textSecondary, true)
    }
    ctx.strokeStyle = divider
    ctx.beginPath()
    ctx.moveTo(x + cellW - 0.5, 0)
    ctx.lineTo(x + cellW - 0.5, h)
    ctx.stroke()
    pinnedX += cellW
  }

  const colRange = getVisibleColumnsRange({
    offsets: layout.scrollableOffsets,
    startPx: scrollLeftPx,
    viewportPx: Math.max(0, w - layout.pinnedWidth),
    overscan: 2,
  })

  ctx.save()
  ctx.beginPath()
  ctx.rect(layout.pinnedWidth, 0, Math.max(0, w - layout.pinnedWidth), h)
  ctx.clip()
  for (let i = colRange.start; i < colRange.end; i += 1) {
    const col = layout.scrollable[i]
    if (!col) continue
    const colX = layout.scrollableOffsets[i] || 0
    const x = layout.pinnedWidth + colX - scrollLeftPx
    const cellW = col.width
    const sortMeta = sortIndexByColumnId[col.id]
    drawCellText(col.title, x, 0, cellW, textSecondary, true, layout.pinnedWidth + 2)
    if (sortMeta) {
      ctx.save()
      ctx.fillStyle = textTertiary
      ctx.font = `600 12px ${fontFamily}`
      ctx.fillText(sortMeta.dir === 'desc' ? `↓${sortMeta.index}` : `↑${sortMeta.index}`, x + cellW - 24, headerHeight / 2)
      ctx.restore()
    }
    ctx.strokeStyle = divider
    ctx.beginPath()
    ctx.moveTo(x + cellW - 0.5, 0)
    ctx.lineTo(x + cellW - 0.5, h)
    ctx.stroke()
    ctx.strokeStyle = border
    ctx.beginPath()
    ctx.moveTo(x + cellW - 2 + 0.5, 6)
    ctx.lineTo(x + cellW - 2 + 0.5, headerHeight - 6)
    ctx.stroke()
  }

  if (reorderHint && reorderHint.columnId) {
    const idx = layout.scrollable.findIndex(c => c.id === reorderHint.columnId)
    if (idx >= 0) {
      const col = layout.scrollable[idx]
      const colX = layout.scrollableOffsets[idx] || 0
      const x =
        layout.pinnedWidth +
        colX -
        scrollLeftPx +
        (reorderHint.side === 'right' ? col.width : 0)
      ctx.save()
      ctx.strokeStyle = accent
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x - 0.5, 0)
      ctx.lineTo(x - 0.5, h)
      ctx.stroke()
      ctx.restore()
    }
  }
  ctx.restore()

  const rowRange = getVisibleRange({
    startPx: scrollTopPx,
    viewportPx: Math.max(0, h - headerHeight),
    itemSizePx: rowHeight,
    itemCount: displayRows.length,
    overscan: 6,
  })

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, headerHeight, w, Math.max(0, h - headerHeight))
  ctx.clip()
  for (let r = rowRange.start; r < rowRange.end; r += 1) {
    const item = displayRows[r]
    if (!item) continue
    const y = headerHeight + r * rowHeight - scrollTopPx
    if (y + rowHeight < headerHeight || y > h) continue

    if (item.kind === 'row') {
      const selected = selectedSet.has(item.row.id)
      if (selected) {
        ctx.fillStyle = rowSelectedBg
        ctx.fillRect(0, y, w, rowHeight)
      }
    } else {
      ctx.fillStyle = groupRowBg
      ctx.fillRect(0, y, w, rowHeight)
    }

    if (selectedColumnId) {
      const pinned = layout.pinned.find(c => c.id === selectedColumnId)
      if (pinned) {
        let x = 0
        for (const c of layout.pinned) {
          if (c.id === selectedColumnId) break
          x += c.width
        }
        ctx.save()
        ctx.fillStyle = colSelectedBg
        ctx.fillRect(x, y, pinned.width, rowHeight)
        ctx.restore()
      } else {
        const idx = layout.scrollable.findIndex(c => c.id === selectedColumnId)
        if (idx >= 0) {
          const col = layout.scrollable[idx]
          const colX = layout.scrollableOffsets[idx] || 0
          const x = layout.pinnedWidth + colX - scrollLeftPx
          ctx.save()
          ctx.beginPath()
          ctx.rect(layout.pinnedWidth, y, Math.max(0, w - layout.pinnedWidth), rowHeight)
          ctx.clip()
          ctx.fillStyle = colSelectedBg
          ctx.fillRect(x, y, col.width, rowHeight)
          ctx.restore()
        }
      }
    }

    ctx.strokeStyle = divider
    ctx.beginPath()
    ctx.moveTo(0, y + rowHeight + 0.5)
    ctx.lineTo(w, y + rowHeight + 0.5)
    ctx.stroke()

    let x = 0
    for (const col of layout.pinned) {
      const cellW = col.width
      if (item.kind === 'row') {
        if (col.kind === 'select') {
          drawCheckbox(x + 14, y + Math.round((rowHeight - 14) / 2), 14, selectedSet.has(item.row.id), false)
        } else if (col.kind === 'order') {
          drawCellText(String(item.row.__order ?? 0), x, y, cellW, textSecondary, false)
        }
      }
      x += cellW
    }

    if (item.kind === 'group') {
      const collapsed = isGroupCollapsed(item.label)
      const groupBaseX = layout.pinnedWidth - scrollLeftPx
      const groupSpanW = Math.max(80, layout.totalWidth - layout.pinnedWidth)
      ctx.save()
      ctx.beginPath()
      ctx.rect(layout.pinnedWidth, y, Math.max(0, w - layout.pinnedWidth), rowHeight)
      ctx.clip()
      ctx.fillStyle = textSecondary
      ctx.font = `600 ${fontSize} ${fontFamily}`
      ctx.fillText(collapsed ? '▶' : '▼', groupBaseX + 8, y + rowHeight / 2)
      ctx.restore()
      drawCellText(`${item.label} (${item.count})`, groupBaseX + 18, y, Math.max(80, groupSpanW - 18), textSecondary, true, layout.pinnedWidth + 2)
      continue
    }

    ctx.save()
    ctx.beginPath()
    ctx.rect(layout.pinnedWidth, y, Math.max(0, w - layout.pinnedWidth), rowHeight)
    ctx.clip()
    for (let i = colRange.start; i < colRange.end; i += 1) {
      const col = layout.scrollable[i]
      if (!col) continue
      const colX = layout.scrollableOffsets[i] || 0
      const cellX = layout.pinnedWidth + colX - scrollLeftPx
      const raw = (item.row as unknown as Record<string, unknown>)[col.id]
      drawCellText(getCellTextByKind(raw, col.dataKind), cellX, y, col.width, textPrimary, false, layout.pinnedWidth + 2)
    }
    ctx.restore()
  }
}
