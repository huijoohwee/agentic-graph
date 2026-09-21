import React from 'react'
import { parseMarkdownFrontmatter } from '@/lib/markdown'
import { getObjectPath, setObjectPath } from '@/lib/data/objectPath'
import { upsertTopLevelFrontmatterSectionMarkdownText } from '@/hooks/store/graph-data-slice/graphDataFrontmatterSections'
import { parseMarkdownVariableTokens, type MarkdownVariableToken } from '@/features/markdown/ui/markdownVariableReferences'
import type { RenderOpts } from '@/features/markdown/ui/MarkdownRendererTypes'
import { MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_CLASS } from '@/features/markdown/ui/markdownEditSurfaceLayout'
import { useGraphStore } from '@/hooks/useGraphStore'
import { MarkdownBlockContainer } from './MarkdownBlockContainerCore.impl.engine.runtime'
import { renderMarkdownVariableReferenceChip } from './markdownInlineVariableMediaPreview'

const sourceCache = new WeakMap<string[], { source: string; meta: ReturnType<typeof parseMarkdownFrontmatter>['meta'] }>()
function readSource(lines: string[]) {
  let cached = sourceCache.get(lines)
  if (!cached) { cached = { source: lines.join('\n'), meta: parseMarkdownFrontmatter(lines).meta }; sourceCache.set(lines, cached) }
  return cached
}

const objectPath = (key: string) => key.replace(/\.(\d+)(?=\.|$)/g, '[$1]')

function ReferencedText({ token, opts, startLine }: { token: MarkdownVariableToken; opts: RenderOpts; startLine: number }) {
  const { source, meta } = readSource(opts.markdownSourceLines!)
  const value = String(getObjectPath(meta, objectPath(token.key)))
  const latest = React.useRef({ source, opts, value })
  latest.current = { source, opts, value }
  const session = React.useRef({ value, draft: value })
  const onState = React.useCallback((active: boolean) => {
    if (active) session.current = { value: latest.current.value, draft: latest.current.value }
    latest.current.opts.onInlineEditStateChange?.(active)
  }, [])
  const update = React.useCallback((next: string, commit: boolean) => {
    const current = latest.current
    const meta = parseMarkdownFrontmatter(current.source.split('\n')).meta
    const path = objectPath(token.key)
    const existing = getObjectPath(meta, path)
    if (existing !== session.current.value && existing !== session.current.draft) {
      if (commit) useGraphStore.getState().pushUiToast({ id: 'markdown:reference:conflict', kind: 'error', message: 'This referenced text changed while editing. Reopen it to use the latest value.' })
      return
    }
    const updated = setObjectPath(meta, path, next)
    const sectionKey = token.key.split('.')[0]
    const text = upsertTopLevelFrontmatterSectionMarkdownText({ rawText: current.source, sectionKey, sectionValue: updated[sectionKey] })
    session.current.draft = next
    if (commit) current.opts.onReplaceLineRange?.({ startLine: 1, endLine: current.source.split('\n').length, replacementLines: text.split('\n') })
    else current.opts.onInlineDraftTextChange?.(text, { reflectInViewer: false })
  }, [token.key])
  const sourceLines = React.useMemo(() => [...Array<string>(startLine - 1).fill(''), ...value.split('\n')], [startLine, value])
  return <MarkdownBlockContainer as="span" id={`reference-edit-${startLine}-${token.key}`} highlightClass=""
    startLine={startLine} endLine={sourceLines.length} sourceLines={sourceLines} inlineEditable
    editPresentation="html" editHtmlRender="inline" editInlineFlow editPreserveBlockHeight={false}
    editorClassName={MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_CLASS} onInlineEditStateChange={onState}
    onReplaceLineRange={({ replacementLines }) => update(replacementLines.join('\n'), true)}
    onInlineDraftTextChange={text => update(text.split('\n').slice(startLine - 1).join('\n'), false)}>
    <span data-kg-paragraph-content="1">{parseMarkdownVariableTokens(value).length ? renderMarkdownVariableReferenceChip({ baseKey: token.key, key: token.key, raw: token.raw, opts }) : value}</span>
  </MarkdownBlockContainer>
}

// Reference-only prose keeps each declared value as an independent source binding,
// including adjacent captions. It uses the ordinary block editor and section writer.
export function renderReferencedParagraph(args: {
  source: string; opts: RenderOpts; startLine: number; endLine: number; className: string; style?: React.CSSProperties
}): React.ReactElement | null {
  const { source, opts } = args
  if (!opts.onReplaceLineRange || !opts.markdownSourceLines) return null
  const tokens = parseMarkdownVariableTokens(source)
  if (!tokens.length || source.replace(/\{\{[^{}]+\}\}/g, '').trim()) return null
  const { meta } = readSource(opts.markdownSourceLines)
  if (tokens.some(token => token.declaredValue || token.fallback || typeof getObjectPath(meta, objectPath(token.key)) !== 'string'
    || opts.markdownVariablePreviewByKey?.[token.key.toLowerCase()]?.invocationTarget)) return null
  const children: React.ReactNode[] = []
  let cursor = 0
  for (const token of tokens) {
    children.push(source.slice(cursor, token.start))
    children.push(<ReferencedText key={`${token.start}:${token.key}`} token={token} opts={opts} startLine={args.startLine} />)
    cursor = token.end
  }
  children.push(source.slice(cursor))
  return <p className={args.className} style={args.style} data-start-line={args.startLine} data-end-line={args.endLine}>{children}</p>
}
