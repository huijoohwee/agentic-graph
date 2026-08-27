import { Building2 } from 'lucide-react'
import type { AgenticOsRemoteGrammarHydrationStatus } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { XrCatalogThumb } from './XrMediaCatalogThumbs'

type XrMediaLibrarySummaryProps = Readonly<{
  metadataReady: boolean
  metadataStatus: AgenticOsRemoteGrammarHydrationStatus
}>

export function XrMediaLibrarySummary({
  metadataReady,
  metadataStatus,
}: XrMediaLibrarySummaryProps) {
  const metadataLoading = metadataStatus === 'idle' || metadataStatus === 'loading'
  return (
    <>
      <XrCatalogThumb Icon={Building2} color="#38bdf8" />
      <section className="min-w-0 flex-1">
        <h3 className="text-xs font-semibold">3D for XR</h3>
        <p className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>Native grey-box kits and procedural subjects. No external assets or runtime dependency.</p>
        <p className={cn('mt-0.5 truncate font-mono text-[9px]', UI_THEME_TOKENS.text.tertiary)} title="Browser WebMCP control tool">WebMCP · agenticgraph.control_local_xr_scene</p>
        {!metadataReady ? (
          <p className={cn('mt-1 text-[10px]', UI_THEME_TOKENS.text.tertiary)}>
            {metadataLoading
              ? 'ACOS XR invocation metadata is loading. Native 3D for XR controls remain ready.'
              : 'ACOS XR invocation metadata is unavailable. Native 3D for XR controls remain ready.'}
          </p>
        ) : null}
      </section>
    </>
  )
}
