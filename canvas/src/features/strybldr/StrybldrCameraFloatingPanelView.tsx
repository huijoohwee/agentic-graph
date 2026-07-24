import { Camera } from 'lucide-react'
import { renderAgenticOsInvocationKeywordChip } from '@/features/agentic-os/agenticOsInvocationChips'
import { useAgenticOsRemoteGrammarCatalog } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { useGraphStore } from '@/hooks/useGraphStore'
import { FlightSimTrainingSurfaceProjection } from '@/features/game-flight-sim/FlightSimTrainingSurfaceProjection'
import { FloatingPanelCatalogHeader } from '@/lib/ui/floatingPanelCatalogLayout'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'
import { UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_INLINE_CHIP_GROUP_CLASSNAME } from '@/lib/ui/textLayout'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import ExpandCollapseAllButton from '@/features/panels/ui/ExpandCollapseAllButton'
import { useCollapsibleSectionGroup } from '@/features/panels/ui/useCollapsibleSectionGroup'
import { CameraMcpInvocationSection } from './CameraMcpInvocationSection'
import { StrybldrCameraFramingSection } from './StrybldrCameraFramingSection'
import { XrShootCameraSection } from './XrShootCameraSection'

const CAMERA_SECTION_KEYS = ['framing', 'mcp-invocations'] as const
const XR_CAMERA_SECTION_KEYS = ['framing', 'shoot', 'mcp-invocations'] as const
const CAMERA_GRAMMAR_SIGILS = ['/', '#', '@'] as const

function CameraSectionTitle({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex min-w-0 items-center justify-between gap-2">
      <span className="truncate text-[11px] font-semibold uppercase">{label}</span>
      <output className={cn('shrink-0 text-[10px]', UI_THEME_TOKENS.text.tertiary)}>{value}</output>
    </span>
  )
}

export function StrybldrCameraFloatingPanelView() {
  const grammarCatalog = useAgenticOsRemoteGrammarCatalog({ sigils: CAMERA_GRAMMAR_SIGILS })
  const xrActive = useGraphStore(state => state.canvasRenderMode === '3d' && state.canvas3dMode === 'xr')
  const visibleSectionKeys = xrActive ? XR_CAMERA_SECTION_KEYS : CAMERA_SECTION_KEYS
  const {
    allCollapsed,
    collapseAll,
    collapsedKeys,
    expandAll,
    setCollapsed,
  } = useCollapsibleSectionGroup(visibleSectionKeys)

  return (
    <section
      className="flex h-full flex-col"
      aria-label="Camera panel"
      data-kg-camera-panel-surface="floatingPanel"
      data-kg-camera-panel-metadata-status={grammarCatalog.hydration.status}
      data-kg-camera-panel-metadata-version={String(grammarCatalog.version)}
    >
      <FloatingPanelCatalogHeader
        title="Camera"
        subtitle="Shared framing, subject-bound XR moves, WebMCP, and invocation tokens"
        actionsLabel="Camera actions"
      />
      <section className={`${UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME} px-1 pb-2`} data-kg-camera-catalog-layout="3d-for-xr-shared">
        <header className={cn('mb-1 grid gap-2 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)} data-kg-camera-catalog-summary="1">
          <section className="flex items-start gap-2">
            <span className={cn('grid size-10 shrink-0 place-items-center rounded border', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)}>
              <Camera className="size-5" strokeWidth={1.7} aria-hidden />
            </span>
            <section className="min-w-0 flex-1">
              <h3 className="text-xs font-semibold">Camera Runtime</h3>
              <p className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>One shared Camera owner across 2D, 3D, and XR.</p>
              <section
                className={cn(UI_INLINE_CHIP_GROUP_CLASSNAME, 'mt-0.5 font-mono text-[9px]', UI_THEME_TOKENS.text.tertiary)}
                aria-label="Camera Runtime invocation tokens"
                data-kg-camera-runtime-invocation-chip-renderer="shared-markdown-sigil"
              >
                <span>WebMCP · inspect + control</span>
                {renderMarkdownSigilInlineText('/camera.frame #camera-shot @camera', {
                  renderKeywordChip: ({ value, className }) => renderAgenticOsInvocationKeywordChip({ value, className, sourceLink: false }),
                })}
              </section>
            </section>
            <section className="flex shrink-0 items-center gap-1">
              <output className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>{visibleSectionKeys.length} sections</output>
              <ExpandCollapseAllButton
                allCollapsed={allCollapsed}
                onExpandAll={expandAll}
                onCollapseAll={collapseAll}
                titleExpand="Expand All Camera sections"
                titleCollapse="Collapse All Camera sections"
              />
            </section>
          </section>
        </header>

        <CollapsibleSection
          title={<CameraSectionTitle label="Framing" value="shared" />}
          collapsed={collapsedKeys.has('framing')}
          onToggle={collapsed => setCollapsed('framing', collapsed)}
          defaultCollapsed={false}
          flushTop
          headerClassName="px-0"
          className="mt-1 border-t pt-1"
          id="camera-framing-section"
        >
          <StrybldrCameraFramingSection />
        </CollapsibleSection>

        {xrActive ? (
          <CollapsibleSection
            title={<CameraSectionTitle label="Shoot" value="XR" />}
            collapsed={collapsedKeys.has('shoot')}
            onToggle={collapsed => setCollapsed('shoot', collapsed)}
            defaultCollapsed={false}
            headerClassName="px-0"
            className="mt-1 border-t pt-1"
            id="camera-shoot-section"
          >
            <XrShootCameraSection />
          </CollapsibleSection>
        ) : null}

        <CollapsibleSection
          title={<CameraSectionTitle label="WebMCP & Invocations" value="/ # @" />}
          collapsed={collapsedKeys.has('mcp-invocations')}
          onToggle={collapsed => setCollapsed('mcp-invocations', collapsed)}
          defaultCollapsed={false}
          headerClassName="px-0"
          className="mt-1 border-t pt-1"
          id="camera-mcp-invocations-section"
        >
          <CameraMcpInvocationSection />
        </CollapsibleSection>
        <FlightSimTrainingSurfaceProjection surface="camera" />
      </section>
    </section>
  )
}
