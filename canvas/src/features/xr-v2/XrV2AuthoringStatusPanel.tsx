import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { createXrV2ReadinessSnapshot } from './runtimeReadiness'

export function XrV2AuthoringStatusPanel({ sceneReady }: Readonly<{ sceneReady: boolean }>) {
  const readiness = React.useMemo(() => createXrV2ReadinessSnapshot({
    entryMode: 'inline-viewer',
  }), [])

  return (
    <section
      className={cn('grid gap-2 border-t pt-2', UI_THEME_TOKENS.panel.border)}
      aria-label="XR v2 authoring runtime"
      data-kg-xr-v2-authoring-runtime="1"
      data-kg-xr-v2-version={readiness.version}
      data-kg-xr-v2-readiness={readiness.overall}
      data-kg-xr-v2-scene-ready={sceneReady ? 'true' : 'false'}
    >
      <header className="flex items-start justify-between gap-2">
        <section className="min-w-0">
          <h4 className={cn('m-0 text-[10px] font-semibold uppercase', UI_THEME_TOKENS.text.secondary)}>
            XR v2 authoring adapters
          </h4>
          <p className={cn('m-0 text-[10px]', UI_THEME_TOKENS.text.tertiary)}>
            Existing ECS, Flow, Timeline, recorder, and viewer owners stay canonical.
          </p>
        </section>
        <output
          className={cn('shrink-0 text-right text-[9px] uppercase tracking-wide', UI_THEME_TOKENS.text.tertiary)}
          data-kg-xr-v2-readiness-output="1"
        >
          {readiness.overall}<br />v{readiness.version}
        </output>
      </header>
      <p className="m-0 rounded bg-amber-100 px-2 py-1 text-[10px] text-amber-900 dark:bg-amber-950/60 dark:text-amber-100">
        Deterministic adapters are source-backed. Depth-model, browser-playback, and physical-device proof remain explicit runtime gates.
      </p>
    </section>
  )
}
