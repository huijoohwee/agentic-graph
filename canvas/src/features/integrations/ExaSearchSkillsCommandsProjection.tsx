import React from 'react'
import type { CollectionLayout } from 'agentic-design-system/collection-layout'
import { Search } from 'lucide-react'
import { SkillsCommandReference } from '@/features/panels/views/SkillsCommandReference'
import { renderAgenticOsInvocationKeywordChip } from '@/features/agentic-os/agenticOsInvocationChips'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'
import { UI_INLINE_CHIP_GROUP_CLASSNAME } from '@/lib/ui/textLayout'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  EXA_SEARCH_API_DEFAULT_NUM_RESULTS,
  EXA_SEARCH_API_DEFAULT_SEARCH_TYPE,
  EXA_SEARCH_API_DOCS_URL,
  EXA_SEARCH_API_INVOCATION_TEXT,
} from 'grph-shared/search/exaSearchApiSsot'

export function ExaSearchSkillsCommandsProjection({ layout = 'list' }: { layout?: CollectionLayout } = {}) {
  return (
    <SkillsCommandReference
      layout={layout}
      icon={Search}
      label="Exa Search"
      description={`${EXA_SEARCH_API_DEFAULT_SEARCH_TYPE} · ${EXA_SEARCH_API_DEFAULT_NUM_RESULTS} results · highlights · host-owned auth`}
      aria-label="Exa Search API coding-agent integration"
      data-kg-exa-search-skills-projection="configuration-only"
    >
      <a className={cn('underline underline-offset-2', UI_THEME_TOKENS.text.secondary)} href={EXA_SEARCH_API_DOCS_URL} target="_blank" rel="noreferrer">
        Coding-agent guide
      </a>
      <code
        className={cn(UI_INLINE_CHIP_GROUP_CLASSNAME, 'min-w-0 overflow-hidden font-mono text-xs', UI_THEME_TOKENS.text.secondary)}
        data-kg-exa-search-invocation="canonical"
        data-kg-exa-search-invocation-chip-renderer="shared-markdown-sigil"
      >
        {renderMarkdownSigilInlineText(EXA_SEARCH_API_INVOCATION_TEXT, {
          renderKeywordChip: ({ value, className }) => renderAgenticOsInvocationKeywordChip({
            value,
            className,
            sourceLink: false,
          }),
        })}
      </code>
      <p className={UI_THEME_TOKENS.text.tertiary}>Reference contract only · no browser-side API key or direct search call</p>
    </SkillsCommandReference>
  )
}
