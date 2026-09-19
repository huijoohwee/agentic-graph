import React from 'react'

import type {
  WidgetPaletteLayoutKind,
  WidgetPaletteLayoutVariant,
} from '@/features/toolbar/widgetPaletteLayoutVariants'

const MINI_SURFACE_CLASS_NAME =
  'min-h-0 overflow-hidden rounded border border-[color:var(--kg-border)] bg-[color:var(--kg-panel-bg)]/70'

const FRAME_CLASS_NAME_BY_ASPECT = {
  '16:9': 'aspect-[16/9] w-full',
  '9:16': 'mx-auto aspect-[9/16] w-[56.25%]',
} as const

function LayoutSkeleton() {
  return (
    <span className="mt-2 grid gap-1.5" aria-hidden="true">
      <span className="h-1.5 w-[88%] rounded-full bg-[color:var(--kg-text-secondary)]/45" />
      <span className="h-1.5 w-[72%] rounded-full bg-[color:var(--kg-text-secondary)]/30" />
      <span className="h-1.5 w-[55%] rounded-full bg-[color:var(--kg-text-secondary)]/20" />
    </span>
  )
}

function CardLayout(props: { output: boolean }) {
  return (
    <section className="grid h-full grid-cols-[minmax(0,1fr)_minmax(4.25rem,36%)] gap-1.5 p-1.5">
      <section className={`${MINI_SURFACE_CLASS_NAME} p-1.5`}>
        <span className="flex flex-wrap items-center gap-1 text-[8px] leading-none text-[color:var(--kg-text-secondary)]">
          {props.output ? (
            <>
              <span>P1</span>
              <span className="rounded border border-[color:var(--kg-border)] px-1 py-0.5">PROBE</span>
            </>
          ) : (
            <>
              <span className="rounded border border-emerald-500/45 px-1 py-0.5 text-emerald-400">/</span>
              <span className="rounded border border-sky-500/45 px-1 py-0.5 text-sky-400">@</span>
              <span className="rounded border border-amber-500/45 px-1 py-0.5 text-amber-300">#</span>
            </>
          )}
        </span>
        <LayoutSkeleton />
      </section>
      <section
        className={`${MINI_SURFACE_CLASS_NAME} flex items-center justify-center text-[10px] italic text-[color:var(--kg-text-secondary)]`}
        data-kg-widget-palette-layout-slot={props.output ? 'output' : 'media'}
      >
        {props.output ? 'Add output' : <span className="text-lg not-italic">+</span>}
      </section>
    </section>
  )
}

function MultiSelectCardLayout() {
  return (
    <section className="grid h-full grid-cols-[minmax(0,1fr)_minmax(4.25rem,36%)] gap-1.5 p-1.5">
      <section className={`${MINI_SURFACE_CLASS_NAME} p-1.5`}>
        <span className="flex items-center gap-1 text-[8px] leading-none text-[color:var(--kg-text-secondary)]">
          <span>P1</span>
          <span className="rounded border border-[color:var(--kg-border)] px-1 py-0.5">PROBE</span>
          <span>TYPE 2</span>
        </span>
        <span className="mt-1.5 grid gap-1 text-[8px] text-[color:var(--kg-text-secondary)]" aria-hidden="true">
          <span>☑ 1. Option</span>
          <span>☐ 2. Option</span>
          <span>☐ Other</span>
        </span>
      </section>
      <section className={`${MINI_SURFACE_CLASS_NAME} flex items-center justify-center text-[10px] italic text-[color:var(--kg-text-secondary)]`}>
        Add output
      </section>
    </section>
  )
}

function RichMediaLayout() {
  return (
    <section className="grid h-full grid-rows-[auto_minmax(0,1fr)] p-1.5">
      <span className="flex items-center gap-1 rounded-t border border-b-0 border-[color:var(--kg-border)] px-1.5 py-1" aria-hidden="true">
        <span className="size-1.5 rounded-full bg-rose-400/65" />
        <span className="size-1.5 rounded-full bg-amber-300/65" />
        <span className="size-1.5 rounded-full bg-emerald-400/65" />
      </span>
      <span className={`${MINI_SURFACE_CLASS_NAME} flex items-center justify-center rounded-t-none`} aria-hidden="true">
        <span className="grid size-8 place-items-center rounded-full border border-[color:var(--kg-border)] text-lg text-[color:var(--kg-text-secondary)]">+</span>
      </span>
    </section>
  )
}

function VideoLayout() {
  return (
    <section className="grid h-full grid-rows-[minmax(0,1fr)_auto] gap-1.5 p-1.5" aria-hidden="true">
      <span className={`${MINI_SURFACE_CLASS_NAME} grid place-items-center`}>
        <span className="ml-0.5 h-0 w-0 border-y-[8px] border-l-[13px] border-y-transparent border-l-sky-300/65" />
      </span>
      <span className="grid grid-cols-[1fr_1.6fr_0.65fr] gap-1">
        <span className="h-2 rounded-sm bg-sky-400/35" />
        <span className="h-2 rounded-sm bg-violet-400/30" />
        <span className="h-2 rounded-sm bg-amber-300/30" />
      </span>
    </section>
  )
}

function FlowEditorLayout() {
  return (
    <section className="grid h-full grid-cols-[1fr_auto_1fr] items-center gap-1.5 p-2" aria-hidden="true">
      <span className={`${MINI_SURFACE_CLASS_NAME} grid gap-1 p-1.5`}>
        <span className="h-1.5 w-3/4 rounded bg-sky-400/40" />
        <span className="h-1.5 w-full rounded bg-[color:var(--kg-text-secondary)]/25" />
        <span className="h-1.5 w-2/3 rounded bg-[color:var(--kg-text-secondary)]/20" />
      </span>
      <span className="w-5 border-t border-dashed border-sky-400/60" />
      <span className={`${MINI_SURFACE_CLASS_NAME} grid place-items-center p-1.5`}>
        <span className="size-3 rounded-full border border-sky-300/55" />
      </span>
    </section>
  )
}

function LayoutByKind(props: { layoutKind: WidgetPaletteLayoutKind }) {
  if (props.layoutKind === 'card-media') return <CardLayout output={false} />
  if (props.layoutKind === 'card-output') return <CardLayout output={true} />
  if (props.layoutKind === 'card-multi-select') return <MultiSelectCardLayout />
  if (props.layoutKind === 'rich-media') return <RichMediaLayout />
  if (props.layoutKind === 'video') return <VideoLayout />
  return <FlowEditorLayout />
}

export function WidgetPaletteCardLayoutPreview(props: { variant: Pick<WidgetPaletteLayoutVariant, 'id' | 'label' | 'aspectRatio' | 'layoutKind'> }) {
  const { variant } = props
  return (
    <article
      className="overflow-hidden rounded-md border border-[color:var(--kg-border)] bg-[color:var(--kg-panel-bg)]/55"
      data-kg-widget-palette-layout={variant.id}
    >
      <header className="truncate border-b border-[color:var(--kg-border)] px-2 py-1.5 text-[11px] font-semibold leading-4 text-[color:var(--kg-text-primary)]">
        {variant.label}
      </header>
      <section className="p-1.5">
        <section
          className={`${FRAME_CLASS_NAME_BY_ASPECT[variant.aspectRatio]} overflow-hidden rounded border border-[color:var(--kg-border)] bg-[color:var(--kg-panel-bg)]/35`}
          aria-label={`${variant.label} ${variant.aspectRatio} layout`}
          data-kg-widget-palette-aspect-ratio={variant.aspectRatio}
        >
          <LayoutByKind layoutKind={variant.layoutKind} />
        </section>
      </section>
    </article>
  )
}
