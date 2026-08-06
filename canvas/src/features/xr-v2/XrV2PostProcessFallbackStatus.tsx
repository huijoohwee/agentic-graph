import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  readXrV2PostProcessFallback,
  subscribeXrV2PostProcessFallback,
} from './xrV2PostProcessFallbackLifecycle'

export function XrV2PostProcessFallbackStatus() {
  const snapshot = React.useSyncExternalStore(
    subscribeXrV2PostProcessFallback,
    readXrV2PostProcessFallback,
    readXrV2PostProcessFallback,
  )
  const active = snapshot.phase !== 'idle'
  return (
    <section
      className={cn('grid gap-1 rounded border p-2 text-[8px]', UI_THEME_TOKENS.panel.border)}
      aria-label="XR post-process fallback"
      data-kg-xr-v2-post-process={snapshot.phase}
      data-kg-xr-v2-post-process-reason={snapshot.reason || 'none'}
      data-kg-xr-v2-post-process-progress={snapshot.progressPercent}
    >
      <div className="flex items-center justify-between gap-2">
        <strong>Post-process fallback</strong>
        <span>{active ? `${snapshot.progressPercent}%` : snapshot.phase}</span>
      </div>
      {active && snapshot.totalFrames > 0 ? (
        <progress className="w-full" max={snapshot.totalFrames} value={snapshot.processedFrames} aria-label="Post-process frame progress" />
      ) : null}
      <p className={cn('m-0', snapshot.phase === 'failed'
        ? 'text-red-700 dark:text-red-300'
        : UI_THEME_TOKENS.text.tertiary)} role="status" aria-live="polite">
        {snapshot.message}
      </p>
      {snapshot.jobId ? <code className="break-all">{snapshot.jobId} · {snapshot.achievedTier || 'pending'}</code> : null}
    </section>
  )
}
