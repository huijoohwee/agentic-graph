import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import {
  SCHEMA_STEP_COPY,
  getSchemaSidebarItems,
  type SchemaSectionCopy,
  type SchemaSidebarItem,
} from '@/features/panels/config'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

interface SchemaTabContentProps {
  schemaError: string
  step31Collapsed: boolean
  step32Collapsed: boolean
  step33Collapsed: boolean
  onToggleStep31: (next: boolean) => void
  onToggleStep32: (next: boolean) => void
  onToggleStep33: (next: boolean) => void
  step332Collapsed: boolean
  onToggleStep332: (next: boolean) => void
}

function SchemaTabContent({
  schemaError,
  step31Collapsed,
  step32Collapsed,
  step33Collapsed,
  onToggleStep31,
  onToggleStep32,
  onToggleStep33,
  step332Collapsed,
  onToggleStep332,
}: SchemaTabContentProps) {
  const uiPanelMicroLabelTextSizeClass = useGraphStore(
    s => s.uiPanelMicroLabelTextSizeClass || 'text-xs',
  )
  const schemaSidebarItems = getSchemaSidebarItems()
  const step321 = SCHEMA_STEP_COPY['3.2.1']
  const step331 = SCHEMA_STEP_COPY['3.3.1']
  const step311 = SCHEMA_STEP_COPY['3.1.1']
  const step332 = SCHEMA_STEP_COPY['3.3.2']
  const titleClassName = `text-xs font-semibold ${UI_THEME_TOKENS.text.primary}`
  const descriptionClassName = `${uiPanelMicroLabelTextSizeClass} ${UI_THEME_TOKENS.text.secondary}`
  const sectionHeadingClassName = `text-xs font-semibold ${UI_THEME_TOKENS.text.primary}`

  const getStepTitle = (step: SchemaSectionCopy, opts?: { showDescription?: boolean }) => (
    <section className="flex flex-col">
      <span className={titleClassName}>
        {step.title}
      </span>
      {(opts?.showDescription ?? true) && step.descriptionShort && (
        <span className={descriptionClassName}>
          {step.descriptionShort}
        </span>
      )}
    </section>
  )

  const collapsedBySectionId: Record<SchemaSidebarItem['sectionId'], boolean> = {
    schemaApplyPresets: step31Collapsed,
    schemaTuneRules: step32Collapsed,
    schemaCustomizeUi: step33Collapsed,
    schemaValidationRules: step332Collapsed,
  }

  const toggleBySectionId: Record<SchemaSidebarItem['sectionId'], (next: boolean) => void> = {
    schemaApplyPresets: onToggleStep31,
    schemaTuneRules: onToggleStep32,
    schemaCustomizeUi: onToggleStep33,
    schemaValidationRules: onToggleStep332,
  }

  const renderSectionBody = (item: SchemaSidebarItem) => {
    if (item.sectionId === 'schemaApplyPresets') {
      return (
        <section className="mt-1 space-y-1">
          <section className={sectionHeadingClassName}>
            {step311.title}
          </section>
          {step311.descriptionShort && (
            <section className={descriptionClassName}>
              {step311.descriptionShort}
            </section>
          )}
          {schemaError && (
            <section className={`${uiPanelMicroLabelTextSizeClass} text-red-600 shrink-0 mt-1`}>
              {schemaError}
            </section>
          )}
        </section>
      )
    }

    if (item.sectionId === 'schemaTuneRules') {
      return (
        <section className="mt-1 space-y-1">
          <section className={sectionHeadingClassName}>
            {step321.title}
          </section>
          {step321.descriptionShort && (
            <section className={descriptionClassName}>
              {step321.descriptionShort}
            </section>
          )}
        </section>
      )
    }

    if (item.sectionId === 'schemaCustomizeUi') {
      return (
        <section className="mt-1 space-y-1">
          <section className={sectionHeadingClassName}>
            {step331.title}
          </section>
          {step331.descriptionShort && (
            <section className={descriptionClassName}>
              {step331.descriptionShort}
            </section>
          )}
        </section>
      )
    }

    if (item.sectionId === 'schemaValidationRules') {
      return (
        <section className="mt-1 space-y-1">
          <section className={sectionHeadingClassName}>
            {step332.title}
          </section>
          {step332.descriptionShort && (
            <section className={descriptionClassName}>
              {step332.descriptionShort}
            </section>
          )}
        </section>
      )
    }

    return null
  }

  return (
    <section>
      {schemaSidebarItems.map(item => {
        const collapsed = collapsedBySectionId[item.sectionId]
        const onToggle = toggleBySectionId[item.sectionId]
        const showDescription = item.sectionId !== 'schemaTuneRules'
        const title = getStepTitle(item, { showDescription })
        const body = renderSectionBody(item)

        if (!body) return null

        return (
          <CollapsibleSection
            headingAs="h3"
            key={item.sectionId}
            title={title}
            collapsed={collapsed}
            onToggle={onToggle}
          >
            {body}
          </CollapsibleSection>
        )
      })}
    </section>
  )
}

export { SchemaTabContent, type SchemaTabContentProps }
