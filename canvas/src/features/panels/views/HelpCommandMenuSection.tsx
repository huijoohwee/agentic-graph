import React from 'react'
import { CommandMenuReferenceCatalog } from '@/features/command-menu/CommandMenuCatalogPanel'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import { KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME } from 'grph-shared/ui/keyTypeValueRows'
import { HELP_STEP_COPY } from '@/features/panels/config'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

interface HelpCommandMenuSectionProps {
  collapsed: boolean
  onToggle: (next: boolean) => void
}

export function HelpCommandMenuSection({ collapsed, onToggle }: HelpCommandMenuSectionProps) {
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME,
  )
  const uiPanelTextFontClass = useGraphStore(
    s => s.uiPanelTextFontClass || 'font-sans',
  )

  return (
    <CollapsibleSection
      headingAs="h3"
      title={HELP_STEP_COPY.commandMenu.title}
      collapsed={collapsed}
      onToggle={onToggle}
    >
      {HELP_STEP_COPY.commandMenu.descriptionShort && (
        <section className={`${uiPanelKeyValueTextSizeClass} ${uiPanelTextFontClass} ${UI_THEME_TOKENS.text.secondary} mb-2`}>
          {HELP_STEP_COPY.commandMenu.descriptionShort}
        </section>
      )}
      <CommandMenuReferenceCatalog
        className="max-h-[min(58vh,34rem)]"
        title="Command Menu"
        subtitle="/, @, and # actions"
        compactHeader
      />
    </CollapsibleSection>
  )
}
