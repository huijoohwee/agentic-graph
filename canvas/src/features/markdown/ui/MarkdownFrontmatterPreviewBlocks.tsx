import React from 'react'
import { MarkdownCodeBlock } from './MarkdownCodeBlock'
import type { RenderOpts } from './MarkdownRendererTypes'
import {
  buildMarkdownFrontmatterPreviewCodeToken,
  buildMarkdownFrontmatterPreviewTable,
} from './markdownFrontmatterPreview'
import { getMarkdownViewerWidthWrapperClassName } from './markdownSectionUtils'
import type { MarkdownVariableSsotEntry } from './markdownVariableReferences'

const MarkdownDataViewTableView = React.lazy(() => import('./MarkdownDataViewTableView').then(module => ({ default: module.MarkdownDataViewTableView })))

export const MarkdownFrontmatterPreviewBlocks = React.memo(function MarkdownFrontmatterPreviewBlocks(props: {
  yaml?: string | null
  mermaid?: string | null
  frontmatterMeta?: Record<string, unknown> | null
  variableSsotEntries: ReadonlyArray<MarkdownVariableSsotEntry>
  onShowInEditor?: (line: number) => void
  annotateDisplayMode?: 'inline' | 'beside' | 'render'
  opts: RenderOpts
  markdownWordWrap: boolean
  contentClassName?: string
  markdownViewerWidthMode?: 'standard' | 'wide'
}) {
  const yaml = String(props.yaml || '').trim()
  const mermaid = String(props.mermaid || '').trim()
  const frontmatterPreviewTable = React.useMemo(
    () =>
      buildMarkdownFrontmatterPreviewTable({
        frontmatterMeta: props.frontmatterMeta || {},
        variableSsotEntries: props.variableSsotEntries,
      }),
    [props.frontmatterMeta, props.variableSsotEntries],
  )

  if (!yaml && !mermaid) return null

  const wrapClass = props.markdownWordWrap ? 'whitespace-pre-wrap break-words' : ''
  const widthWrapperClassName =
    props.contentClassName || getMarkdownViewerWidthWrapperClassName(props.markdownViewerWidthMode || 'standard')

  return (
    <section className={`${widthWrapperClassName} mb-8`}>
      {yaml && frontmatterPreviewTable ? (
        <section data-kg-frontmatter-properties className="mb-4">
          <section
            onClickCapture={(event) => {
              const target = event.target as HTMLElement | null
              if (!target) return
              const row = target.closest('tr')
              const firstCell = row?.querySelector('td')
              const keyText = String(firstCell?.textContent || '').trim()
              if (!keyText || typeof props.onShowInEditor !== 'function') return
              const line = frontmatterPreviewTable.lineByKey.get(keyText.toLowerCase()) || 0
              if (line > 0) props.onShowInEditor(line)
            }}
          >
            <React.Suspense fallback={<p role="status">Loading table…</p>}>
            <MarkdownDataViewTableView
              view={frontmatterPreviewTable.view}
              columnTypesById={{ 'frontmatter-key': 'text', 'frontmatter-value': 'text' }}
              canMutate={false}
              canConfigure={false}
              tableFit="container"
              onUpdateCell={() => {}}
            />
            </React.Suspense>
          </section>
        </section>
      ) : null}
      {mermaid ? (
        <MarkdownCodeBlock
          token={buildMarkdownFrontmatterPreviewCodeToken({ lang: 'mermaid', text: mermaid, startLine: 1 })}
          annotateDisplayMode={props.annotateDisplayMode}
          highlightClass=""
          opts={props.opts}
          wrapClass={wrapClass}
        />
      ) : null}
    </section>
  )
})
