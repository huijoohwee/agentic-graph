import React from 'react'
import {
  readXrAuthoringEcsRuntime,
  subscribeXrAuthoringEcsRuntime,
} from '@/features/agentic-ecs/xrAuthoringEcsRuntime'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { createXrV2ReadinessSnapshot } from './runtimeReadiness'

export function XrV2AuthoringStatusPanel({ sceneReady }: Readonly<{ sceneReady: boolean }>) {
  const readiness = React.useMemo(() => createXrV2ReadinessSnapshot({
    entryMode: 'inline-viewer',
  }), [])
  const runtime = React.useSyncExternalStore(
    subscribeXrAuthoringEcsRuntime,
    readXrAuthoringEcsRuntime,
    readXrAuthoringEcsRuntime,
  )
  const counts = runtime.counts

  return (
    <section
      className={cn('grid gap-2 border-t pt-2', UI_THEME_TOKENS.panel.border)}
      aria-label="XR v2 authoring runtime"
      data-kg-xr-v2-authoring-runtime="1"
      data-kg-xr-v2-version={readiness.version}
      data-kg-xr-v2-readiness={readiness.overall}
      data-kg-xr-v2-scene-ready={sceneReady ? 'true' : 'false'}
      data-kg-xr-v2-ecs-status={runtime.status}
      data-kg-xr-v2-ecs-revision={String(runtime.revision)}
      data-kg-xr-v2-ecs-source-digest={runtime.sourceDigest}
      data-kg-xr-v2-ecs-entity-count={String(counts.entities)}
      data-kg-xr-v2-material-count={String(counts.materials)}
      data-kg-xr-v2-behavior-count={String(counts.behaviors)}
      data-kg-xr-v2-particle-count={String(counts.particles)}
      data-kg-xr-v2-timeline-count={String(counts.timelines)}
    >
      <header className="flex items-start justify-between gap-2">
        <section className="min-w-0">
          <h4 className={cn('m-0 text-[10px] font-semibold uppercase', UI_THEME_TOKENS.text.secondary)}>
            XR v2 authoring adapters
          </h4>
          <p className={cn('m-0 text-[10px]', UI_THEME_TOKENS.text.tertiary)}>
            Canonical ECS projection: {runtime.status}; {counts.entities} entities, {counts.materials} materials,
            {' '}{counts.behaviors} behaviors, {counts.particles} emitters, {counts.timelines} timelines.
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
        Mounted authoring is measured from the canonical runtime. Depth-model and named physical-device proof remain explicit gates.
      </p>
      {runtime.error ? (
        <p className="m-0 rounded bg-red-100 px-2 py-1 text-[10px] text-red-900 dark:bg-red-950/60 dark:text-red-100">
          {runtime.error.errorCode}: {runtime.error.message}
        </p>
      ) : null}
    </section>
  )
}
