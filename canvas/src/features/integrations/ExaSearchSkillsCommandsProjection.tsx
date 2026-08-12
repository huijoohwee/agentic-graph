import React from 'react'
import { Search } from 'lucide-react'
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

export function ExaSearchSkillsCommandsProjection() {
  return (
    <section
      className={cn('mx-1 mb-2 grid gap-1 rounded border p-2 text-[10px]', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}
      aria-label="Exa Search API coding-agent integration"
      data-kg-exa-search-skills-projection="configuration-only"
    >
      <header className="flex min-w-0 items-center justify-between gap-2">
        <span className="flex items-center gap-1 font-semibold">
          <Search className="h-3.5 w-3.5" aria-hidden="true" /> Exa Search
        </span>
        <a
          className={cn('underline underline-offset-2', UI_THEME_TOKENS.text.secondary)}
          href={EXA_SEARCH_API_DOCS_URL}
          target="_blank"
          rel="noreferrer"
        >
          Coding-agent guide
        </a>
      </header>
      <p className={UI_THEME_TOKENS.text.secondary}>
        {EXA_SEARCH_API_DEFAULT_SEARCH_TYPE} · {EXA_SEARCH_API_DEFAULT_NUM_RESULTS} results · highlights · host-owned auth
      </p>
      <code
        className={cn(UI_INLINE_CHIP_GROUP_CLASSNAME, 'min-w-0 overflow-hidden font-mono text-[9px]', UI_THEME_TOKENS.text.secondary)}
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
    </section>
  )
}
