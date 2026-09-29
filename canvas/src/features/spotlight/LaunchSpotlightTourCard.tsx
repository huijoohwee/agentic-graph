import React from 'react'
import type { GraphData } from '@/lib/graph/types'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  SPOTLIGHT_STEPS,
  type SpotlightRequirementStatus,
} from '@/features/spotlight/config'
import { useSpotlightAnchor } from '@/features/spotlight/useSpotlightAnchor'
import { getSpotlightCardStyle } from '@/features/spotlight/positioning'
import { emitRendererPanelOpen } from '@/features/canvas/utils'
import { getGraphCapabilities } from '@/lib/graph/helpers'
import Tooltip from '@/features/panels/ui/Tooltip'
import { UI_INTENT_TOKENS } from 'grph-shared/ui/intentTokens'
import { LAUNCH_SPOTLIGHT_TOUR_TOOLTIP } from '@/lib/config'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_FLOATING_NOTICE_CARD_CLASSNAME,
  UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { emitGraphTraversalFloatingPanelOpen } from '@/features/panels/utils/graphTraversalFloatingPanel'
import { emitMainPanelOpen } from '@/features/panels/utils/useMainPanelRect'
import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy'

const spotlightCardClassName = `pointer-events-auto rounded-xl border bg-[color:var(--kg-panel-bg)]/95 shadow-lg px-4 py-3 ${UI_RESPONSIVE_FLOATING_NOTICE_CARD_CLASSNAME}`
const spotlightGhostButtonClassName = `${UI_THEME_TOKENS.text.tertiary} ${UI_THEME_TOKENS.button.hoverBg}`
const spotlightActionButtonBaseClassName = `${UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME} inline-flex items-center justify-center rounded border`
const spotlightGhostActionButtonClassName = `${spotlightActionButtonBaseClassName} border-transparent ${spotlightGhostButtonClassName}`
const spotlightSecondaryGhostActionButtonClassName = `${spotlightActionButtonBaseClassName} border-transparent ${UI_THEME_TOKENS.text.secondary} ${UI_THEME_TOKENS.button.hoverBg}`
const spotlightSecondaryActionButtonClassName = `${spotlightActionButtonBaseClassName} ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.text.secondary} ${UI_THEME_TOKENS.button.hoverBg}`
const spotlightPrimaryActionButtonClassName = `${spotlightActionButtonBaseClassName} border-blue-600 text-blue-600 ${UI_THEME_TOKENS.button.hoverBg}`
const spotlightDisabledActionButtonClassName = `${spotlightActionButtonBaseClassName} ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.text.tertiary} cursor-not-allowed`

type LaunchSpotlightTourCardProps = {
  dismissed: boolean
  setDismissed: (next: boolean) => void
  step: number
  setStep: (next: number) => void
  ready: boolean
  minimized: boolean
  setMinimized: (next: boolean) => void
}

export function LaunchSpotlightTourCard({
  dismissed,
  setDismissed,
  step,
  setStep,
  ready,
  minimized,
  setMinimized,
}: LaunchSpotlightTourCardProps) {
  const enableSpotlight = useGraphStore(s => s.enableLaunchSpotlight)
  const mode = useGraphStore(s => s.launchSpotlightMode)
  const traversalHasRun = useGraphStore(s => s.aiKgTraversalRan)
  const graphData = useGraphStore(s => s.graphData)
  const setEnableLaunchSpotlight = useGraphStore(s => s.setEnableLaunchSpotlight)
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || 'text-xs',
  )

  const graphCapabilities = React.useMemo(() => {
    return getGraphCapabilities(graphData as GraphData | null | undefined)
  }, [graphData])

  const steps = React.useMemo(() => SPOTLIGHT_STEPS, [])

  React.useEffect(() => {
    if (mode === 'stats') return
    if (!enableSpotlight || dismissed || !ready) return
    const total = steps.length
    const idx = Math.min(Math.max(step, 0), total - 1)
    const currentStep = steps[idx]
    if (currentStep.id === 1) {
      try {
        emitMainPanelOpen({ tab: 'workflowManager' })
      } catch {
        void 0
      }
    } else if (currentStep.id === 2) {
      try {
        useGraphStore.getState().setWorkspaceViewMode('canvas')
      } catch {
        void 0
      }
    } else if (currentStep.id === 3) {
      try {
        emitMainPanelOpen({ tab: 'workflowManager' })
      } catch {
        void 0
      }
    } else if (currentStep.id === 4) {
      emitGraphTraversalFloatingPanelOpen()
    } else if (currentStep.id === 5) {
      emitRendererPanelOpen()
    }
  }, [enableSpotlight, dismissed, ready, step, steps, mode])

  const total = steps.length
  const clampedIndex = Math.min(Math.max(step, 0), total - 1)
  const current = steps[clampedIndex]

  const requirementStatus: SpotlightRequirementStatus = React.useMemo(
    () => ({
      renderOpen: true,
      traversalRan: !graphCapabilities.supportsTraversalTour || traversalHasRun,
      datasetLoaded: !!graphData,
    }),
    [
      traversalHasRun,
      graphCapabilities.supportsTraversalTour,
      graphData,
    ],
  )

  const selector = mode === 'stats' ? null : current.targetSelector
  const { anchor, dragPos, cardRef, handleCardPointerDown } = useSpotlightAnchor({
    enabled: enableSpotlight,
    dismissed,
    ready,
    selector,
  })

  if (!enableSpotlight || dismissed || !ready || mode === 'stats') return null

  const requirements = current.requires || []
  const allSatisfied = requirements.every(key => requirementStatus[key])
  const canAdvance = clampedIndex === 0 || allSatisfied

  const handleDismiss = () => {
    setDismissed(true)
    setEnableLaunchSpotlight(false)
  }

  const handleMinimize = () => {
    setMinimized(true)
  }

  const handleReopen = () => {
    setMinimized(false)
  }

  const handleNext = () => {
    if (!canAdvance) return
    if (clampedIndex >= total - 1) {
      setDismissed(true)
    } else {
      setStep(clampedIndex + 1)
    }
  }

  const handleBack = () => {
    if (clampedIndex <= 0) return
    setStep(clampedIndex - 1)
  }

  const cardStyle = getSpotlightCardStyle(anchor, dragPos, minimized)

  return (
    <section className="fixed inset-0 z-[2000] pointer-events-none">
      <section
        ref={cardRef}
        className={`${spotlightCardClassName} ${
          minimized ? 'cursor-default' : 'cursor-move'
        } ${
          current.variant === 'primary' ? 'border-blue-200 shadow-blue-100/70' : ''
        }`}
        onPointerDown={minimized ? undefined : handleCardPointerDown}
        style={cardStyle}
      >
        {minimized ? (
          <section className="flex items-center justify-between">
            <span className={`${uiPanelKeyValueTextSizeClass} ${UI_THEME_TOKENS.text.secondary}`}>
              {current.title} ({clampedIndex + 1}/{total})
            </span>
            <section className="flex items-center gap-2">
              <button
                type="button"
                className={`${uiPanelKeyValueTextSizeClass} ${spotlightGhostActionButtonClassName}`}
                onClick={handleDismiss}
              >
                Dismiss
              </button>
              <button
                type="button"
                className={`${uiPanelKeyValueTextSizeClass} ${spotlightPrimaryActionButtonClassName}`}
                onClick={handleReopen}
              >
                Reopen
              </button>
            </section>
          </section>
        ) : (
          <>
            <section className="flex items-start justify-between mb-1">
              <section className="flex flex-col gap-0.5">
                <span
                  className={`${uiPanelKeyValueTextSizeClass} font-medium uppercase tracking-normal ${
                    current.variant === 'primary' ? 'text-blue-600' : UI_THEME_TOKENS.text.tertiary
                  }`}
                >
                  Launch tour
                </span>
                <Tooltip
                  content={LAUNCH_SPOTLIGHT_TOUR_TOOLTIP}
                  maxWidthPx={260}

                >
                  <section className="flex items-center gap-1">
                    <section className={`text-sm font-semibold ${UI_THEME_TOKENS.text.primary}`}>{current.title}</section>
                  </section>
                </Tooltip>
              </section>
              <button
                type="button"
                className={`${uiPanelKeyValueTextSizeClass} ${spotlightGhostActionButtonClassName}`}
                onClick={handleMinimize}
              >
                Minimize
              </button>
            </section>
            <section className={`text-xs ${UI_THEME_TOKENS.text.primary} mb-2`}>{current.body}</section>
            {current.id === 2 && (
              <section className="mb-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={`${uiPanelKeyValueTextSizeClass} ${spotlightSecondaryActionButtonClassName}`}
                  onClick={() => {
                    try {
                      useGraphStore.getState().setWorkspaceViewMode('canvas')
                    } catch {
                      void 0
                    }
                  }}
                >
                  Open {MARKDOWN_DATA_VIEW_COPY.titleDefault}
                </button>
              </section>
            )}
            {!canAdvance && (
              <section className={`mb-2 flex items-center ${uiPanelKeyValueTextSizeClass} ${UI_THEME_TOKENS.text.secondary}`}>
                <span>
                  {clampedIndex === 1
                    ? 'User loads a dataset via Load Data before continuing.'
                    : clampedIndex === 2
                    ? 'User opens Workflow Manager in the main panel to apply schema presets.'
                    : clampedIndex === 3
                    ? 'User runs a traversal preset in the Renderer panel to complete this tour.'
                    : ''}
                </span>
              </section>
            )}
            <section className="flex items-center justify-between">
              <section className="flex items-center gap-1">
                {steps.map((stepConfig, stepIndex) => (
                  <span
                    key={stepConfig.id}
                    className={`h-1.5 w-1.5 rounded-full ${
                      stepIndex === clampedIndex ? 'bg-blue-600' : UI_INTENT_TOKENS.neutral.accentBg
                    }`}
                  />
                ))}
              </section>
              <section className="flex items-center gap-2">
                <button
                  type="button"
                  className={`${uiPanelKeyValueTextSizeClass} ${spotlightGhostActionButtonClassName}`}
                  onClick={handleBack}
                  disabled={clampedIndex === 0}
                >
                  Back
                </button>
                <button
                  type="button"
                  className={`${uiPanelKeyValueTextSizeClass} ${spotlightSecondaryGhostActionButtonClassName}`}
                  onClick={handleDismiss}
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  className={`${uiPanelKeyValueTextSizeClass} ${
                    canAdvance ? spotlightPrimaryActionButtonClassName : spotlightDisabledActionButtonClassName
                  }`}
                  onClick={handleNext}
                  disabled={!canAdvance}
                >
                  {clampedIndex >= total - 1 ? 'Done' : 'Next'}
                </button>
              </section>
            </section>
          </>
        )}
      </section>
    </section>
  )
}
