import { ChevronDown, ChevronUp, FileVideo, Images } from 'lucide-react'
import { TimelinePreviewSurface } from './TimelinePreviewSurface'
import { type TimelinePreviewMediaCanvasRenderModel } from './useTimelinePreviewMediaCanvasRenderModel'

export type TimelinePreviewMediaCanvasRenderProps = {
  model: TimelinePreviewMediaCanvasRenderModel
}

export function TimelinePreviewMediaCanvasRender(args: TimelinePreviewMediaCanvasRenderProps) {
  return (
    <>
      <header className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h1 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <Images className="h-4 w-4" aria-hidden="true" />
          {args.model.header.titleLabel}
        </h1>
        <p className="text-xs text-[var(--kg-text-secondary)]">{args.model.header.summaryLabel}</p>
      </header>

      {args.model.contentMode === 'sections' ? (
        <section className="flex min-w-0 flex-col gap-4" aria-label={args.model.listLabel}>
          {args.model.sections.map(section => (
            <section
              key={section.familyId}
              className="flex min-w-0 flex-col gap-3"
              aria-label={section.sectionLabel}
              data-kg-media-canvas-family={section.familyId}
              data-kg-media-canvas-family-active-id={section.sectionAttributes.activeFamilyId}
              data-kg-media-canvas-family-auto-open={section.sectionAttributes.autoOpen}
              data-kg-media-canvas-family-disclosure-state={section.sectionAttributes.disclosureState}
              data-kg-media-canvas-family-expandable={section.sectionAttributes.expandable}
              data-kg-media-canvas-family-expanded={section.sectionAttributes.expanded}
              data-kg-media-canvas-family-surface-tone={section.sectionAttributes.surfaceTone}
            >
              {section.header.visible ? (
                <header className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <section className="flex min-w-0 flex-col gap-1">
                    <h2 className="min-w-0 truncate text-xs font-medium text-[var(--kg-text-secondary)]">{section.header.label}</h2>
                    {section.summary.visible ? (
                      <p
                        className="text-xs text-[var(--kg-text-secondary)]"
                        data-kg-media-canvas-family-summary={section.summary.dataValue}
                      >
                        {section.summary.label}
                      </p>
                    ) : null}
                  </section>
                  {section.toggle.visible ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] px-2 py-1 text-xs text-[var(--kg-text-secondary)] transition-colors hover:text-[var(--kg-text-primary)]"
                      aria-expanded={section.toggle.ariaExpanded}
                      title={section.toggle.title}
                      onClick={section.toggle.handleToggle}
                      data-kg-media-canvas-family-toggle="1"
                      data-kg-media-canvas-family-toggle-mode={section.toggle.mode}
                      data-kg-media-canvas-family-toggle-state={section.toggle.state}
                    >
                      {section.toggle.icon === 'collapse'
                        ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                        : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
                      {section.toggle.label}
                    </button>
                  ) : null}
                </header>
              ) : null}
              <section className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2" aria-label={section.cardsLabel}>
                {section.surfaces.map(surface => (
                  <TimelinePreviewSurface
                    key={surface.renderKey}
                    {...surface.props}
                  />
                ))}
              </section>
            </section>
          ))}
        </section>
      ) : (
        <section
          className="flex min-h-[18rem] flex-col items-center justify-center rounded border border-dashed border-[var(--kg-border)] bg-[var(--kg-panel-bg)] p-6 text-center text-sm text-[var(--kg-text-secondary)]"
          aria-label={args.model.emptyState.label}
          data-kg-media-canvas-empty="1"
        >
          <FileVideo className="mb-3 h-6 w-6" aria-hidden="true" />
          {args.model.emptyState.message}
        </section>
      )}
    </>
  )
}
