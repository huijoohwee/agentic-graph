import React from 'react'
import hljs from 'highlight.js/lib/common'
import {
  MARKDOWN_CODE_FENCE_LINE_ROW_HEIGHT_CLASS,
  MARKDOWN_CODE_FENCE_LINE_SPACING_CLASS,
} from '@/features/markdown/ui/markdownEditSurfaceLayout'
import { UI_RESPONSIVE_PASSIVE_FILL_SURFACE_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

export const HighlightedCode = React.memo(function HighlightedCode({
  code,
  lang,
  highlightLines,
}: {
  code: string
  lang: string
  highlightLines: Set<number> | null
}) {
  const highlighted = React.useMemo(() => {
    if (lang && !hljs.getLanguage(lang)) return null
    return lang ? hljs.highlight(code, { language: lang }).value : hljs.highlightAuto(code).value
  }, [code, lang])

  return (
    <span className="relative block">
      {highlightLines ? (
        <span className={UI_RESPONSIVE_PASSIVE_FILL_SURFACE_CLASSNAME} aria-hidden="true">
          {code.split('\n').map((_, i) => (
            <span
              key={i}
              className={
                `block w-full ${MARKDOWN_CODE_FENCE_LINE_ROW_HEIGHT_CLASS} ` +
                (highlightLines.has(i + 1)
                  ? 'bg-yellow-100/30 dark:bg-yellow-500/10 border-l-2 border-yellow-500'
                  : '')
              }
            />
          ))}
        </span>
      ) : null}
      <code
        className={`hljs language-${lang} !bg-transparent !p-0 block ${MARKDOWN_CODE_FENCE_LINE_SPACING_CLASS} relative z-10`}
        {...(highlighted === null ? { children: code } : { dangerouslySetInnerHTML: { __html: highlighted } })}
      />
    </span>
  )
})
