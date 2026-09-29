import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import { shouldFlushKeyTypeValueSectionTop } from 'grph-shared/ui/keyTypeValueRows'
import Tooltip from '@/features/panels/ui/Tooltip'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import { getUiSectionActionClassName, getUiSectionChipClassName } from '@/lib/ui/sectionChipChrome'
import { buildSettingsAreaTooltip } from '@/lib/config'
import { uiToolbarToggleActiveClassName } from '@/features/toolbar/ui/toolbarStyles'
import { loadMainPanelSectionDescriptions, type MainPanelSectionDescription } from '@/features/panels/mainPanelSectionDescriptions'
import { SettingsEntryRow } from './SettingsEntryRow'
import type { SectionMeta } from './settingsView.constants'
import type { SettingsEntry } from './useSettingsView.helpers'
import type { SettingsRowActions, SettingsRowRefs, SettingsRowStatusState, SettingsRowToggleActions, SettingsRowUi } from './settingsRowTypes'

export type SettingsSectionDescriptor = {
  area: string
  collapsed: boolean
  entries: SettingsEntry[]
  sectionMeta?: SectionMeta
  showDensityPresets: boolean
}

type SettingsSectionsProps = {
  applyUiPanelDensityPreset: (preset: 'comfortable' | 'compact') => void
  descriptors: SettingsSectionDescriptor[]
  expanded: string | null
  normalizedQuery: string
  rowActions: SettingsRowActions
  rowRefs: SettingsRowRefs
  rowStatus: SettingsRowStatusState
  rowUi: SettingsRowUi
  getAreaIntroItemCount?: (area: string) => number
  renderAreaIntro?: (area: string) => React.ReactNode
  setExpanded: React.Dispatch<React.SetStateAction<string | null>>
  flushFirstSectionTop?: boolean
  stickyOffsetClassName: string
  toggleArea: (area: string, nextCollapsed?: boolean) => void
  values: Record<string, string | number | boolean>
}

function SettingsSectionIntro({
  description,
  sectionMeta,
}: {
  description?: MainPanelSectionDescription
  sectionMeta?: SectionMeta
}) {
  if (!sectionMeta && !description) return null
  const highlights = description?.highlights || []
  return (
    <section className={`mb-2 min-w-0 max-w-full space-y-1 text-xs ${UI_THEME_TOKENS.text.secondary}`}>
      {sectionMeta ? (
        <section className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
          <button
            type="button"
            className={`App-toolbar__btn text-xs ${uiToolbarToggleActiveClassName}`}
            onClick={e => {
              e.stopPropagation()
              sectionMeta.openPanel()
            }}
          >
            {sectionMeta.panelLabel}
          </button>
          {sectionMeta.docsUrl && sectionMeta.docsLabel ? (
            <a
              className={getUiSectionActionClassName('primary')}
              href={sectionMeta.docsUrl}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
            >
              {sectionMeta.docsLabel}
            </a>
          ) : null}
        </section>
      ) : null}
      {description?.value ? (
        <p className="m-0 min-w-0 max-w-full overflow-hidden text-ellipsis">
          {description.value}
        </p>
      ) : null}
      {highlights.length > 0 ? (
        <section className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
          {highlights.map(highlight => (
            <span
              key={highlight}
              className={getUiSectionChipClassName('secondary')}
            >
              <span className={UI_TEXT_TRUNCATE}>{highlight}</span>
            </span>
          ))}
        </section>
      ) : null}
    </section>
  )
}

export function SettingsSections({
  applyUiPanelDensityPreset,
  descriptors,
  expanded,
  normalizedQuery,
  rowActions,
  rowRefs,
  rowStatus,
  rowUi,
  getAreaIntroItemCount,
  renderAreaIntro,
  setExpanded,
  flushFirstSectionTop = false,
  stickyOffsetClassName,
  toggleArea,
  values,
}: SettingsSectionsProps) {
  const [sectionDescriptions, setSectionDescriptions] = React.useState<Record<string, MainPanelSectionDescription>>({})

  React.useEffect(() => {
    let alive = true
    loadMainPanelSectionDescriptions().then(next => {
      if (!alive) return
      setSectionDescriptions(next)
    })
    return () => {
      alive = false
    }
  }, [])

  return descriptors.map(({ area, collapsed, entries, sectionMeta, showDensityPresets }, index) => {
    const areaIntro = renderAreaIntro?.(area)
    const itemCount = entries.length + Math.max(0, getAreaIntroItemCount?.(area) || 0)
    const sectionDescription = sectionDescriptions[area]

    return (
      <CollapsibleSection
        key={area}
        title={
          <Tooltip
            content={buildSettingsAreaTooltip(area, String(itemCount))}
            maxWidthPx={250}
            className="w-full min-w-0 max-w-full overflow-hidden"
            contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
          >
            <span className="inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden">
              <span className={UI_TEXT_TRUNCATE}>{area}</span>
              <span className={`shrink-0 text-xs uppercase tracking-normal ${UI_THEME_TOKENS.text.tertiary} ml-1`}>
                {itemCount} items
              </span>
            </span>
          </Tooltip>
        }
        collapsed={collapsed}
        flushTop={flushFirstSectionTop && shouldFlushKeyTypeValueSectionTop(index)}
        stickyOffsetClassName={stickyOffsetClassName}
        onToggle={next => {
          if (normalizedQuery) return
          toggleArea(area, next)
        }}
      >
        <SettingsSectionIntro
          description={sectionDescription}
          sectionMeta={sectionMeta}
        />
        <ul>
          {areaIntro}
          {showDensityPresets ? (
            <li className={`mb-1 flex flex-wrap items-center gap-1 text-xs ${UI_THEME_TOKENS.text.secondary}`}>
              <span className={`font-semibold ${UI_THEME_TOKENS.text.primary}`}>Presets</span>
              <button
                type="button"
                className={getUiSectionActionClassName('primary')}
                onClick={() => {
                  applyUiPanelDensityPreset('comfortable')
                }}
              >
                Comfortable
              </button>
              <button
                type="button"
                className={`App-toolbar__btn text-xs ${uiToolbarToggleActiveClassName}`}
                onClick={() => {
                  applyUiPanelDensityPreset('compact')
                }}
              >
                Compact
              </button>
            </li>
          ) : null}
          {entries.map(entry => {
            const isExpanded = expanded === entry.meta.key
            const toggleActions: SettingsRowToggleActions = {
              onToggleExpanded: () => setExpanded(isExpanded ? null : entry.meta.key),
            }
            return (
              <SettingsEntryRow
                key={entry.meta.key}
                area={area}
                actions={rowActions}
                entry={entry}
                isExpanded={isExpanded}
                refs={rowRefs}
                status={rowStatus}
                toggleActions={toggleActions}
                ui={rowUi}
                values={values}
              />
            )
          })}
        </ul>
      </CollapsibleSection>
    )
  })
}
