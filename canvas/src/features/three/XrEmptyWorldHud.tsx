import React from 'react'

const AXES = [
  { id: 'X', tone: 'border-rose-300 bg-rose-400/80 text-rose-950' },
  { id: 'Y', tone: 'border-teal-200 bg-teal-300/90 text-teal-950' },
  { id: 'Z', tone: 'border-indigo-200 bg-indigo-400/85 text-white' },
] as const

export function XrEmptyWorldHud() {
  return (
    <aside
      className="pointer-events-none absolute inset-0 z-[1] text-xs text-slate-100"
      aria-label="XR empty world center and axes"
      data-kg-xr-empty-world-hud="1"
    >
      <output className="absolute left-1/2 top-12 -translate-x-1/2 rounded bg-slate-950/45 px-2 py-1 backdrop-blur-sm">
        Centers Mode
      </output>
      <figure
        className="absolute bottom-3 left-3 h-20 w-20 rounded border border-sky-300/70 bg-slate-950/55 shadow-[var(--kg-shadow-overlay)] backdrop-blur-sm"
        aria-label="XR world axes X Y Z"
      >
        <span className="absolute left-1/2 top-1/2 h-px w-12 -translate-x-1/2 bg-sky-200/70" />
        <span className="absolute left-1/2 top-1/2 h-12 w-px -translate-y-1/2 bg-sky-200/70" />
        {AXES.map((axis, index) => {
          const positions = ['right-1 top-1/2 -translate-y-1/2', 'left-1/2 top-1 -translate-x-1/2', 'left-1/2 bottom-1 -translate-x-1/2']
          return (
            <span
              key={axis.id}
              className={`absolute grid h-5 w-5 place-items-center rounded-full border font-semibold ${positions[index]} ${axis.tone}`}
            >
              {axis.id}
            </span>
          )
        })}
        <figcaption className="sr-only">World orientation: X, Y, Z</figcaption>
      </figure>
    </aside>
  )
}
