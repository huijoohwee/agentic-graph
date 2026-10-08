import React from 'react'
import { UI_THEME_TOKENS } from 'grph-shared/ui/themeTokens'
import type SvgGeospatialFallback from './SvgGeospatialFallback.js'

type Props = React.ComponentProps<typeof SvgGeospatialFallback>
type Loader = () => Promise<{ default: React.ComponentType<Props> }>
type State = { failed: boolean }

// Browsers can cache failed module imports for the document's lifetime. Only an
// explicit reload retries that module graph; unrelated renders never fetch again.
export function createRecoverableSvgFallback(
  load: Loader,
  reload: () => void = () => window.location.reload(),
): React.ComponentType<Props> {
  const Map = React.lazy(load)
  return class RecoverableSvgFallback extends React.Component<Props, State> {
    state: State = { failed: false }

    static getDerivedStateFromError(): Partial<State> {
      return { failed: true }
    }

    render(): React.ReactNode {
      if (this.state.failed) {
        return (
          <section role="alert" aria-label="SVG map unavailable"
            className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 p-4 text-center ${UI_THEME_TOKENS.panel.overlayBg} ${UI_THEME_TOKENS.text.secondary}`}>
            <p>SVG map could not load. Reconnect and reload the workspace, or choose another view.</p>
            <button type="button" onClick={reload}
              className={`min-h-[44px] min-w-[44px] rounded-md border px-4 py-2 pointer-events-auto ${UI_THEME_TOKENS.panel.border}`}>
              Reload workspace
            </button>
          </section>
        )
      }
      return (
        <React.Suspense fallback={
          <output role="status" className={`absolute inset-0 z-[5] flex items-center justify-center pointer-events-none text-xs ${UI_THEME_TOKENS.text.secondary}`}>Loading SVG map…</output>
        }>
          <Map {...this.props} />
        </React.Suspense>
      )
    }
  }
}

export default /* @__PURE__ */ createRecoverableSvgFallback(() => import('./SvgGeospatialFallback.js'))
