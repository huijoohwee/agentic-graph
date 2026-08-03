import React from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import type { PdfWorkspaceAnchorMap, PdfWorkspaceDocNode } from '@/lib/pdf/pdfWorkspaceAnchors'
import { fetchPdfWorkspaceDoc, getDefaultWorkspaceOutputDirRel } from '@/lib/pdf/pdfWorkspaceClient'
import { resolveAnchorIdAfterSwitch } from '@/lib/pdf/pdfWorkspaceAnchors'
import MarkdownPreview from '@/features/markdown/ui/MarkdownPreview'
import { parseMarkdownBlocks, parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'
import { UI_RESPONSIVE_VIEWPORT_SCROLL_PANEL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import {
  PDF_DOCUMENT_VIEWER_DOCUMENT_PANE_CLASS_NAME,
  PDF_DOCUMENT_VIEWER_GRID_CLASS_NAME,
  PDF_DOCUMENT_VIEWER_HEADER_ROW_CLASS_NAME,
  PDF_DOCUMENT_VIEWER_PAGED_CONTAINER_CLASS_NAME,
  PDF_DOCUMENT_VIEWER_READING_CONTAINER_CLASS_NAME,
  PDF_DOCUMENT_VIEWER_TOC_CLASS_NAME,
} from '@/pages/pageResponsiveClasses'
import { uiSelectedRowStateClassName } from 'grph-shared/ui/selectedRowClasses'

type LayoutPreset = 'reading' | 'paged'

const isLayout = (raw: string): raw is LayoutPreset => raw === 'reading' || raw === 'paged'

const readHashAnchor = (): string | null => {
  if (typeof window === 'undefined') return null
  const raw = String(window.location.hash || '').replace(/^#/, '')
  if (!raw) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

const writeHashAnchor = (anchorId: string | null): void => {
  if (typeof window === 'undefined') return
  const next = anchorId ? `#${encodeURIComponent(anchorId)}` : ''
  try {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${next}`)
  } catch {
    window.location.hash = next
  }
}

const clampZoom = (raw: number): number => {
  if (!Number.isFinite(raw)) return 1
  return Math.max(0.5, Math.min(2.5, raw))
}

const injectHeadingDomAnchors = (args: { markdown: string; map: PdfWorkspaceAnchorMap | null }): string => {
  const src = String(args.markdown || '')
  const map = args.map
  if (!map) return src
  const lines = splitMarkdownLines(src)
  const { startIndex } = parseMarkdownFrontmatter(lines)
  const blocks = parseMarkdownBlocks(lines, startIndex)
  const headingBlocks = blocks.filter(b => b.kind === 'heading')
  const nodes = map.nodes.filter(n => n.kind === 'heading')
  const count = Math.min(headingBlocks.length, nodes.length)
  for (let i = count - 1; i >= 0; i -= 1) {
    const block = headingBlocks[i]
    const node = nodes[i]
    const domId = map.domIdByAnchorId[node.id] || ''
    if (!domId) continue
    const lineIndex = Math.max(0, Math.min(lines.length, block.startLine - 1))
    const prev = lineIndex - 1 >= 0 ? String(lines[lineIndex - 1] || '').trim() : ''
    const anchorLine = `<a id="${domId}"></a>`
    if (prev === anchorLine) continue
    lines.splice(lineIndex, 0, anchorLine)
  }
  return lines.join('\n')
}

const buildTocTree = (nodes: PdfWorkspaceDocNode[]): PdfWorkspaceDocNode[] => {
  return nodes.filter(n => n.kind === 'heading' && n.level >= 2 && n.level <= 4)
}

export default function PdfDocumentViewer() {
  const navigate = useNavigate()
  const params = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const docId = String(params.docId || '').trim()

  const outputDirRel = String(searchParams.get('outputDirRel') || '').trim() || getDefaultWorkspaceOutputDirRel()
  const layout: LayoutPreset = isLayout(String(searchParams.get('layout') || '').trim()) ? (String(searchParams.get('layout') || '').trim() as LayoutPreset) : 'reading'
  const zoom = clampZoom(Number(searchParams.get('zoom') || '1'))

  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [markdown, setMarkdown] = React.useState('')
  const [anchorMap, setAnchorMap] = React.useState<PdfWorkspaceAnchorMap | null>(null)
  const [title, setTitle] = React.useState<string>('Document')
  const [notice, setNotice] = React.useState<string | null>(null)
  const [activeAnchorId, setActiveAnchorId] = React.useState<string | null>(() => readHashAnchor())

  const load = React.useCallback(
    async (desiredAnchor: string | null) => {
      setBusy(true)
      setError(null)
      const res = await fetchPdfWorkspaceDoc({ docId, outputDirRel })
      if (res.ok !== true) {
        setBusy(false)
        setError(res.error)
        return
      }
      const nextMap = res.anchorMap
      const resolved = resolveAnchorIdAfterSwitch({ desired: desiredAnchor, nextMap })
      setMarkdown(res.markdown)
      setAnchorMap(nextMap)
      setTitle(res.meta?.title || res.docId)
      setActiveAnchorId(resolved)
      writeHashAnchor(resolved)
      if (desiredAnchor && resolved && desiredAnchor !== resolved) {
        setNotice('Section moved; resolved to nearest canonical anchor.')
      } else {
        setNotice(null)
      }
      setBusy(false)
    },
    [docId, outputDirRel],
  )

  React.useEffect(() => {
    if (!docId) return
    void load(readHashAnchor())
  }, [docId, load])

  const renderedMarkdown = React.useMemo(
    () => injectHeadingDomAnchors({ markdown, map: anchorMap }),
    [anchorMap, markdown],
  )

  const scrollToAnchor = React.useCallback(
    (anchorId: string | null) => {
      if (!anchorId || !anchorMap) return
      const domId = anchorMap.domIdByAnchorId[anchorId]
      if (!domId) return
      const el = document.getElementById(domId)
      if (!el) return
      el.scrollIntoView({ block: 'start', behavior: 'auto' })
    },
    [anchorMap],
  )

  React.useEffect(() => {
    const id = activeAnchorId
    if (!id) return
    const t = setTimeout(() => scrollToAnchor(id), 0)
    return () => clearTimeout(t)
  }, [activeAnchorId, layout, zoom, renderedMarkdown, scrollToAnchor])

  const onSetLayout = React.useCallback(
    (nextLayout: LayoutPreset) => {
      const next = new URLSearchParams(searchParams)
      next.set('layout', nextLayout)
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const onSetZoom = React.useCallback(
    (nextZoom: number) => {
      const z = clampZoom(nextZoom)
      const next = new URLSearchParams(searchParams)
      next.set('zoom', String(z))
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const toc = React.useMemo(() => (anchorMap ? buildTocTree(anchorMap.nodes) : []), [anchorMap])

  const copyLink = React.useCallback(() => {
    const anchorId = activeAnchorId
    const url = `${window.location.origin}/doc/${encodeURIComponent(docId)}?${searchParams.toString()}${anchorId ? `#${encodeURIComponent(anchorId)}` : ''}`
    void navigator.clipboard.writeText(url).catch(() => void 0)
    setNotice('Copied deep link to clipboard.')
  }, [activeAnchorId, docId, searchParams])

  return (
    <main className={`h-full w-full ${UI_THEME_TOKENS.text.primary}`} aria-label="PDF Document Viewer">
      <header className={`w-full border-b ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg}`} aria-label="Viewer header">
        <section className={PDF_DOCUMENT_VIEWER_HEADER_ROW_CLASS_NAME} aria-label="Header row">
          <section className="min-w-0" aria-label="Header title">
            <h1 className="text-sm font-semibold truncate" aria-label="Document title">
              {title}
            </h1>
            <output className={`block text-[11px] ${UI_THEME_TOKENS.text.tertiary}`} aria-label="Viewer state summary">
              {layout} · {Math.round(zoom * 100)}%
            </output>
          </section>
          <nav aria-label="Viewer navigation" className="flex items-center gap-2">
            <button
              type="button"
              className={`inline-flex items-center px-2.5 py-1.5 rounded border ${UI_THEME_TOKENS.input.border} hover:opacity-90 text-xs`}
              onClick={() => navigate('/?openEditorWorkspace=1')}
            >
              Back to Canvas
            </button>
            <button
              type="button"
              className={`inline-flex items-center px-2.5 py-1.5 rounded border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.panel.bg} hover:opacity-90 text-xs`}
              onClick={() => {
                const id = activeAnchorId
                writeHashAnchor(id)
                scrollToAnchor(id)
              }}
            >
              Re-resolve
            </button>
          </nav>
        </section>
      </header>

      <section className={PDF_DOCUMENT_VIEWER_GRID_CLASS_NAME} aria-label="Viewer Grid">
        <aside className={`${PDF_DOCUMENT_VIEWER_TOC_CLASS_NAME} rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} p-3`} aria-label="TOC">
          <header className="flex items-center justify-between" aria-label="TOC Header">
            <h2 className="text-xs font-semibold">Outline</h2>
            <span className={`text-[11px] ${UI_THEME_TOKENS.text.tertiary}`}>{toc.length}</span>
          </header>
          <nav className={`mt-2 ${UI_RESPONSIVE_VIEWPORT_SCROLL_PANEL_CLASSNAME}`} aria-label="TOC entries">
            {toc.length === 0 ? (
              <p className={`text-[11px] ${UI_THEME_TOKENS.text.tertiary}`}>No headings.</p>
            ) : (
              <ul className="space-y-1" aria-label="TOC list">
                {toc.map(n => (
                  <li key={n.id} aria-label={`TOC ${n.text}`}>
                    <button
                      type="button"
                      className={
                        activeAnchorId === n.id
                          ? `w-full text-left px-2 py-1 rounded ${uiSelectedRowStateClassName(true)} hover:opacity-90`
                          : 'w-full text-left px-2 py-1 rounded hover:opacity-90'
                      }
                      onClick={() => {
                        setActiveAnchorId(n.id)
                        writeHashAnchor(n.id)
                        scrollToAnchor(n.id)
                      }}
                    >
                      <span className="text-xs">{n.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </nav>
        </aside>

        <section className={PDF_DOCUMENT_VIEWER_DOCUMENT_PANE_CLASS_NAME} aria-label="Document Pane">
          <header className={`rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} p-3`} aria-label="Viewer Toolbar">
            <form className="flex flex-wrap items-center gap-2" aria-label="Viewer Controls">
              <label className={`text-xs ${UI_THEME_TOKENS.text.secondary}`} htmlFor="layoutSel">
                Layout
              </label>
              <select
                id="layoutSel"
                className={`text-xs px-2 py-1 rounded border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.bg}`}
                value={layout}
                onChange={e => onSetLayout(e.target.value as LayoutPreset)}
              >
                <option value="reading">Reading</option>
                <option value="paged">Paged</option>
              </select>

              <label className={`text-xs ${UI_THEME_TOKENS.text.secondary}`} htmlFor="zoomSel">
                Zoom
              </label>
              <input
                id="zoomSel"
                type="range"
                min={0.5}
                max={2.5}
                step={0.1}
                value={zoom}
                onChange={e => onSetZoom(Number(e.target.value))}
              />
              <output className={`text-[11px] ${UI_THEME_TOKENS.text.tertiary}`} aria-label="Zoom label">
                {Math.round(zoom * 100)}%
              </output>

              <button
                type="button"
                className={`ml-auto inline-flex items-center px-2.5 py-1.5 rounded border ${UI_THEME_TOKENS.input.border} hover:opacity-90 text-xs`}
                onClick={copyLink}
              >
                Copy link
              </button>
              <button
                type="button"
                className={`inline-flex items-center px-2.5 py-1.5 rounded border ${UI_THEME_TOKENS.input.border} hover:opacity-90 text-xs`}
                onClick={() => navigate('/?openEditorWorkspace=1')}
              >
                Re-convert
              </button>
            </form>
            {notice && (
              <output className={`mt-2 block text-[11px] ${UI_THEME_TOKENS.text.tertiary}`} aria-label="Viewer notice">
                {notice}
              </output>
            )}
            {error && (
              <output className="mt-2 block text-xs text-red-400" aria-label="Viewer error">
                {error}
              </output>
            )}
          </header>

          <article
            className={`rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} overflow-hidden`}
            aria-label="Rendered Markdown"
          >
            <section
              className={layout === 'reading' ? PDF_DOCUMENT_VIEWER_READING_CONTAINER_CLASS_NAME : PDF_DOCUMENT_VIEWER_PAGED_CONTAINER_CLASS_NAME}
              style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
              aria-label="Markdown Container"
            >
              <MarkdownPreview
                markdownText={renderedMarkdown}
                activeDocumentPath={`/pdf/${encodeURIComponent(docId)}.md`}
                highlightedLineRange={null}
                markdownWordWrap
                markdownPresentationMode={false}
                markdownTextHighlight={false}
                uiPanelTextFontClass="font-sans"
                uiPanelMonospaceTextClass="font-mono"
                previewOverlayScope="container"
                previewOverlayPortalTarget={null}
                previewScrollable={false}
                showSidebar={false}
              />
            </section>
          </article>
        </section>
      </section>
    </main>
  )
}
