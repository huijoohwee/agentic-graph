import React from 'react'
import {
  resolveInlineInvocationChipClassName,
} from '@/features/markdown/ui/dataViewChipStyles'
import { renderAgenticOsInvocationKeywordChip } from '@/features/agentic-os/agenticOsInvocationChips'
import { UI_INLINE_CHIP_LABEL_15CH_CLASSNAME, UI_TEXT_TRUNCATE_CHIP } from '@/lib/ui/textLayout'

const tokenChipClassName = (token: string): string => resolveInlineInvocationChipClassName({
  value: token,
  extraClassName: 'max-w-[7.5rem] text-xs',
})

export function StoryboardCardInvocationChips(props: { tokens: readonly string[] }) {
  const tokens = props.tokens.filter(token => token.startsWith('/') || token.startsWith('@') || token.startsWith('#'))
  if (tokens.length === 0) return null
  return (
    <ul className="m-0 flex shrink-0 list-none items-center gap-1 overflow-x-auto overflow-y-hidden overscroll-contain p-0 [scrollbar-gutter:stable]" aria-label="Storyboard card invocation chips" data-kg-canvas-pointer-ignore="true" data-kg-canvas-wheel-ignore="true" data-kg-media-scroll-surface="1" data-kg-storyboard-card-invocation-chips="1">
      {tokens.map(token => {
        const className = tokenChipClassName(token)
        const chip = renderAgenticOsInvocationKeywordChip({ value: token, className, sourceLink: false })
        return (
          <li key={token} className="shrink-0 list-none">
            {chip || (
              <span className={className} title={token} data-kg-card-inline-keyword-pill="1">
                <span className={`${UI_TEXT_TRUNCATE_CHIP} ${UI_INLINE_CHIP_LABEL_15CH_CLASSNAME}`}>{token}</span>
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
