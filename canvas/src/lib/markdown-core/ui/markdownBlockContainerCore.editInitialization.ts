import React from 'react'
import { getMarkdownItFastHtml } from '@/features/markdown/markdownIt'
import { normalizeEscapedInlineMediaMarkdown } from '@/features/markdown/ui/inlineMediaMarkdown'
import { normalizeInlineCommentRangeIndicatorsInPlace, rewriteInlineCodeSigilsToPlainTextHtml, rewriteInlineCodeSigilsToStyledSpansHtml } from '@/features/markdown/ui/markdownSigil'
import { rewriteInlineEditorCommentIndicatorsHtml } from './markdownBlockContainerCore.draftCommit'
import { rewriteRenderedInlineMediaForEditorHtml, prepareRenderedParagraphEditHtml } from './markdownBlockContainerCore.inlineMediaEditHtml'
import { useIsomorphicLayoutEffect } from '@/lib/react/useIsomorphicLayoutEffect'

const EDIT_HTML_CACHE_MAX_ENTRIES = 12

export const useMarkdownBlockContainerEditInitialization = (args: {
  editing: boolean
  renderedInlineHtml?: string
  initialText: string
  editStripLinePrefix?: (line: string) => { prefix: string; content: string }
  editKeepLinePrefixesInEditor: boolean
  editTrimEdgeNewlines: boolean
  editTrimEmptyBlockEdges: boolean
  editListMode?: 'ordered' | 'unordered'
  editSigilRenderMode: 'styled' | 'plain'
  editorPresentation: 'markdown' | 'html'
  htmlRenderMode: 'inline' | 'block'
  normalizeRenderedBlockHtmlForEditor: (renderedHtml: string) => string
  placeCaretFromClientPoint: () => void
  runSelectionSyncBurst: (fn: () => void) => void
  syncSelectionToolbarState: () => void
  trimEmptyEditableEdges: () => boolean
  scheduleEdgeTrimBurst: () => void
  editLinePrefixesRef: React.MutableRefObject<string[] | null>
  initialPresentTextRef: React.MutableRefObject<string>
  draftRef: React.MutableRefObject<string>
  editDirtyRef: React.MutableRefObject<boolean>
  editSessionIdRef: React.MutableRefObject<number>
  editorRef: React.RefObject<HTMLElement | null>
  initialEditorHtmlRef: React.MutableRefObject<string>
  lastSerializedEditorHtmlRef: React.MutableRefObject<string>
  lastPointerSelectionModeRef: React.MutableRefObject<'caret' | 'word'>
}) => {
  const syncSelectionToolbarStateRef = React.useRef(args.syncSelectionToolbarState)
  React.useEffect(() => {
    syncSelectionToolbarStateRef.current = args.syncSelectionToolbarState
  }, [args.syncSelectionToolbarState])
  const rewriteInlineSigilsForEditHtml = React.useCallback((html: string): string => {
    const sigilHtml = args.editSigilRenderMode === 'plain'
      ? rewriteInlineEditorCommentIndicatorsHtml(rewriteInlineCodeSigilsToPlainTextHtml(html))
      : rewriteInlineEditorCommentIndicatorsHtml(rewriteInlineCodeSigilsToStyledSpansHtml(html))
    return rewriteRenderedInlineMediaForEditorHtml(sigilHtml)
  }, [args.editSigilRenderMode])
  const normalizeLiveEditHtmlRoot = React.useCallback((el: HTMLElement) => {
    if (args.renderedInlineHtml != null) el.innerHTML = prepareRenderedParagraphEditHtml(args.renderedInlineHtml)
    normalizeInlineCommentRangeIndicatorsInPlace(el, el.ownerDocument)
  }, [args.renderedInlineHtml])
  const editHtmlCacheRef = React.useRef<Map<string, string>>(new Map())
  const initializedEditSessionIdRef = React.useRef<number>(-1)
  const readCachedOrComputeEditHtml = React.useCallback((cacheKey: string, compute: () => string): string => {
    const cache = editHtmlCacheRef.current
    const hit = cache.get(cacheKey)
    if (typeof hit === 'string') {
      cache.delete(cacheKey)
      cache.set(cacheKey, hit)
      return hit
    }
    const next = compute()
    cache.set(cacheKey, next)
    if (cache.size > EDIT_HTML_CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value
      if (typeof oldest === 'string') cache.delete(oldest)
    }
    return next
  }, [])

  useIsomorphicLayoutEffect(() => {
    if (!args.editing) {
      initializedEditSessionIdRef.current = -1
      return
    }
    const openSessionId = args.editSessionIdRef.current
    if (initializedEditSessionIdRef.current === openSessionId) return
    initializedEditSessionIdRef.current = openSessionId
    const rawLines = String(args.initialText || '').split(/\r?\n/)
    if (args.editStripLinePrefix) {
      const stripped = rawLines.map(line => args.editStripLinePrefix?.(line) || { prefix: '', content: line })
      args.editLinePrefixesRef.current = stripped.map(s => s.prefix)
      const presentTextRaw = args.editKeepLinePrefixesInEditor
        ? rawLines.join('\n')
        : stripped.map(s => s.content).join('\n')
      const preserveQuoteOnlyBlankLineStructure =
        stripped.length > 1 &&
        stripped.every(s => !String(s.content || '').trim()) &&
        stripped.some(s => /^\s*(?:>\s*)+$/.test(String(s.prefix || '')))
      const presentText = args.editTrimEdgeNewlines
        ? (preserveQuoteOnlyBlankLineStructure ? presentTextRaw : presentTextRaw.replace(/^\n+/, '').replace(/\n+$/, ''))
        : presentTextRaw
      args.initialPresentTextRef.current = presentText
      args.draftRef.current = presentText
      args.editDirtyRef.current = false
      const el = args.editorRef.current
      if (el) {
        if (args.editorPresentation === 'html') {
          if (args.htmlRenderMode === 'block') {
            const quotePrefixPattern = /^\s*(?:>\s*)+$/
            const quoteLineStructured = (() => {
              if (stripped.length === 0) return false
              let hasQuotePrefix = false
              for (const s of stripped) {
                const prefix = String(s.prefix || '')
                const content = String(s.content || '')
                if (quotePrefixPattern.test(prefix)) {
                  hasQuotePrefix = true
                  continue
                }
                if (!prefix && !content.trim()) continue
                return false
              }
              return hasQuotePrefix
            })()
            if (quoteLineStructured) {
              const lines = String(presentText || '').split(/\r?\n/)
              if (preserveQuoteOnlyBlankLineStructure) {
                el.innerHTML = Array.from({ length: Math.max(1, lines.length) }, () => '<section><br/></section>').join('')
              } else {
                el.innerHTML = readCachedOrComputeEditHtml(
                  `quote-block:${args.editSigilRenderMode}:${presentText}`,
                  () => {
                    const md = getMarkdownItFastHtml()
                    return rewriteInlineSigilsForEditHtml(lines.map(line => `<p>${line ? md.renderInline(line) : '<br/>'}</p>`).join('\n'))
                  },
                )
                normalizeLiveEditHtmlRoot(el)
                args.trimEmptyEditableEdges()
                args.scheduleEdgeTrimBurst()
              }
            } else {
              const rendered = getMarkdownItFastHtml().render(presentText)
              if (rendered.replace(/\s+/g, '').length === 0 && String(presentText || '').trim()) el.textContent = presentText
              else {
                el.innerHTML = readCachedOrComputeEditHtml(
                  `block:${args.editSigilRenderMode}:${presentText}`,
                  () => rewriteInlineSigilsForEditHtml(args.normalizeRenderedBlockHtmlForEditor(rendered)),
                )
                normalizeLiveEditHtmlRoot(el)
                args.trimEmptyEditableEdges()
                args.scheduleEdgeTrimBurst()
              }
            }
            args.initialEditorHtmlRef.current = el.innerHTML
            args.lastSerializedEditorHtmlRef.current = el.innerHTML
          } else {
            const inlinePresentText = normalizeEscapedInlineMediaMarkdown(String(presentText || ''))
            const lines = inlinePresentText.split(/\r?\n/)
            el.innerHTML = readCachedOrComputeEditHtml(
              `inline:${args.editSigilRenderMode}:${inlinePresentText}`,
              () => {
                const md = getMarkdownItFastHtml()
                return rewriteInlineSigilsForEditHtml(lines.map(line => (line ? md.renderInline(line) : '')).map((html, i) => (i === 0 ? html : `<br/>${html}`)).join(''))
              },
            )
            normalizeLiveEditHtmlRoot(el)
            args.initialEditorHtmlRef.current = el.innerHTML
            args.lastSerializedEditorHtmlRef.current = el.innerHTML
          }
        } else {
          if (preserveQuoteOnlyBlankLineStructure) el.innerHTML = Array.from({ length: Math.max(1, stripped.length) }, () => '<section><br/></section>').join('')
          else el.textContent = presentText
          args.initialEditorHtmlRef.current = el.innerHTML
        }
        queueMicrotask(() => {
          if (args.editSessionIdRef.current !== openSessionId) return
          const preferWordSelection = args.lastPointerSelectionModeRef.current === 'word'
          el.focus()
          if (preferWordSelection) {
            window.requestAnimationFrame(() => {
              if (args.editSessionIdRef.current !== openSessionId) return
              window.requestAnimationFrame(() => {
                if (args.editSessionIdRef.current !== openSessionId) return
                args.placeCaretFromClientPoint()
                args.runSelectionSyncBurst(() => syncSelectionToolbarStateRef.current())
              })
            })
          } else {
            args.placeCaretFromClientPoint()
            args.runSelectionSyncBurst(() => syncSelectionToolbarStateRef.current())
          }
          if (args.editTrimEmptyBlockEdges && !preferWordSelection) {
            queueMicrotask(() => {
              args.trimEmptyEditableEdges()
              args.scheduleEdgeTrimBurst()
              if (args.editListMode) {
                window.requestAnimationFrame(() => {
                  args.trimEmptyEditableEdges()
                  window.requestAnimationFrame(() => {
                    args.trimEmptyEditableEdges()
                  })
                })
              }
            })
          }
        })
      }
      return
    }
    args.editLinePrefixesRef.current = null
    const normalizedInitialText = args.editTrimEdgeNewlines ? args.initialText.replace(/^\n+/, '').replace(/\n+$/, '') : args.initialText
    args.initialPresentTextRef.current = normalizedInitialText
    args.draftRef.current = normalizedInitialText
    args.editDirtyRef.current = false
    const el = args.editorRef.current
    if (el) {
      if (args.editorPresentation === 'html') {
        if (args.htmlRenderMode === 'block') {
          const rendered = getMarkdownItFastHtml().render(normalizedInitialText)
          if (rendered.replace(/\s+/g, '').length === 0 && String(normalizedInitialText || '').trim()) el.textContent = normalizedInitialText
          else {
            el.innerHTML = readCachedOrComputeEditHtml(
              `block:${args.editSigilRenderMode}:${normalizedInitialText}`,
              () => rewriteInlineSigilsForEditHtml(args.normalizeRenderedBlockHtmlForEditor(rendered)),
            )
            normalizeLiveEditHtmlRoot(el)
            args.trimEmptyEditableEdges()
            args.scheduleEdgeTrimBurst()
          }
          args.initialEditorHtmlRef.current = el.innerHTML
          args.lastSerializedEditorHtmlRef.current = el.innerHTML
        } else {
          const inlineInitialText = normalizeEscapedInlineMediaMarkdown(String(normalizedInitialText || ''))
          const lines = inlineInitialText.split(/\r?\n/)
          el.innerHTML = readCachedOrComputeEditHtml(
            `inline:${args.editSigilRenderMode}:${inlineInitialText}`,
            () => {
              const md = getMarkdownItFastHtml()
              return rewriteInlineSigilsForEditHtml(lines.map(line => (line ? md.renderInline(line) : '')).map((html, i) => (i === 0 ? html : `<br/>${html}`)).join(''))
            },
          )
          normalizeLiveEditHtmlRoot(el)
          args.initialEditorHtmlRef.current = el.innerHTML
          args.lastSerializedEditorHtmlRef.current = el.innerHTML
        }
      } else {
        el.textContent = normalizedInitialText
        args.initialEditorHtmlRef.current = el.innerHTML
      }
      queueMicrotask(() => {
        if (args.editSessionIdRef.current !== openSessionId) return
        const preferWordSelection = args.lastPointerSelectionModeRef.current === 'word'
        el.focus()
        if (preferWordSelection) {
          window.requestAnimationFrame(() => {
            if (args.editSessionIdRef.current !== openSessionId) return
            window.requestAnimationFrame(() => {
              if (args.editSessionIdRef.current !== openSessionId) return
              args.placeCaretFromClientPoint()
              args.runSelectionSyncBurst(() => syncSelectionToolbarStateRef.current())
            })
          })
        } else {
          args.placeCaretFromClientPoint()
          args.runSelectionSyncBurst(() => syncSelectionToolbarStateRef.current())
        }
        if (args.editTrimEmptyBlockEdges && !preferWordSelection) {
          queueMicrotask(() => {
            args.trimEmptyEditableEdges()
            args.scheduleEdgeTrimBurst()
            if (args.editListMode) {
              window.requestAnimationFrame(() => {
                args.trimEmptyEditableEdges()
                window.requestAnimationFrame(() => {
                  args.trimEmptyEditableEdges()
                })
              })
            }
          })
        }
      })
    }
  }, [
    args.draftRef,
    args.editDirtyRef,
    args.editKeepLinePrefixesInEditor,
    args.editLinePrefixesRef,
    args.editListMode,
    args.editSessionIdRef,
    args.editSigilRenderMode,
    args.editStripLinePrefix,
    args.editTrimEdgeNewlines,
    args.editTrimEmptyBlockEdges,
    args.editing,
    args.editorPresentation,
    args.editorRef,
    args.htmlRenderMode,
    args.initialEditorHtmlRef,
    args.lastSerializedEditorHtmlRef,
    args.initialPresentTextRef,
    args.initialText,
    args.lastPointerSelectionModeRef,
    args.normalizeRenderedBlockHtmlForEditor,
    args.placeCaretFromClientPoint,
    normalizeLiveEditHtmlRoot,
    readCachedOrComputeEditHtml,
    args.runSelectionSyncBurst,
    args.scheduleEdgeTrimBurst,
    args.trimEmptyEditableEdges,
    rewriteInlineSigilsForEditHtml,
  ])
}
