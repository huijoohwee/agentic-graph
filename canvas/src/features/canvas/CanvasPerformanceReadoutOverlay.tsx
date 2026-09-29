import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_CANVAS_DIAGNOSTIC_PANEL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

export function CanvasPerformanceReadoutOverlay(props: {
  lines: readonly string[]
}) {
  return (
    <section
      id="kg-performance-automation-readout"
      aria-label="Performance automation readout"
      aria-live="polite"
      data-kg-automation-readable="performance"
      className={`pointer-events-none z-[9999] rounded-md border px-2 py-1.5 text-xs shadow-sm ${UI_RESPONSIVE_CANVAS_DIAGNOSTIC_PANEL_CLASSNAME} ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.text.secondary}`}
    >
      <section className="font-semibold">Performance Readout</section>
      <pre className="mt-1 whitespace-pre-wrap break-words font-mono">{props.lines.join('\n')}</pre>
    </section>
  )
}
