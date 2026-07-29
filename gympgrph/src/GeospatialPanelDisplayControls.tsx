import React from 'react'
import type { GeospatialViewMode } from 'grph-shared/geospatial/events'
import type { PanelTypography } from 'grph-shared/ui/panelTypography'
import { UI_THEME_TOKENS } from 'grph-shared/ui/themeTokens'
import { isGrabMapsPresetActive } from './features/geospatial/basemapStyle.js'
import type { GeospatialPointStyleConfig } from './features/geospatial/pointStyleConfig.js'
import {
  buildGeoPanelButtonClassName,
  GeoPanelKtvRow,
  GeoPanelSection,
  GeoPanelValueCell,
} from './geospatialPanelUi.js'

type CurrentLocationState = 'idle' | 'locating' | 'error' | 'done'

export type GeospatialPanelDisplayControlsProps = {
  committedStyleUrl: string
  currentLocationMessage: string
  currentLocationState: CurrentLocationState
  disabled: boolean
  geospatialAutoFitEnabled: boolean
  geospatialViewMode: GeospatialViewMode
  panelTypography: PanelTypography
  pointStyleDraft: GeospatialPointStyleConfig
  setPointStyleDraft: React.Dispatch<React.SetStateAction<GeospatialPointStyleConfig>>
  styleStatusLabel: string
  styleUrlDraft: string
  onApplyGrabMapsPreset: () => void
  onApplyPointStyle: () => void
  onApplyStyleUrl: () => void
  onFitToData: () => void
  onFitToSelection: () => void
  onResetPointStyle: () => void
  onResetStyleUrl: () => void
  onSelectViewMode: (mode: GeospatialViewMode) => void
  onSetStyleUrlDraft: (value: string) => void
  onToggleAutoFit: () => void
  onUseCurrentLocation: () => void
}

export function GeospatialPanelDisplayControls(
  props: GeospatialPanelDisplayControlsProps,
): React.ReactElement {
  const {
    committedStyleUrl,
    currentLocationMessage,
    currentLocationState,
    disabled,
    geospatialAutoFitEnabled,
    geospatialViewMode,
    panelTypography,
    pointStyleDraft,
    setPointStyleDraft,
    styleStatusLabel,
    styleUrlDraft,
  } = props
  const inputClassName = `${panelTypography.keyValueInputClass} min-w-0`
  const textInputClassName = `${inputClassName} text-left`
  const compactInputClassName = `${inputClassName} max-w-[7rem]`
  const colorInputClassName = [
    'h-[var(--kg-control-height,28px)] w-16 rounded border p-0.5',
    UI_THEME_TOKENS.input.border,
    UI_THEME_TOKENS.input.bg,
  ].join(' ')
  const noteClassName = `${panelTypography.microLabelClass} ${UI_THEME_TOKENS.text.tertiary}`
  const locationMessageClassName = currentLocationState === 'error'
    ? `${panelTypography.microLabelClass} text-red-600 dark:text-red-300`
    : noteClassName
  const grabMapsActive = isGrabMapsPresetActive(committedStyleUrl, geospatialViewMode)

  return (
    <>
      <GeoPanelSection title="View" panelTypography={panelTypography}>
        <GeoPanelKtvRow
          keyNode="SVG fallback"
          typeNode="Static"
          panelTypography={panelTypography}
          isActive={geospatialViewMode === '2d-svg'}
          valueNode={(
            <GeoPanelValueCell>
              <button
                type="button"
                className={buildGeoPanelButtonClassName(geospatialViewMode === '2d-svg', disabled)}
                disabled={disabled}
                aria-pressed={geospatialViewMode === '2d-svg'}
                aria-label="2D (SVG, fallback) No runtime"
                onClick={() => props.onSelectViewMode('2d-svg')}
              >
                {geospatialViewMode === '2d-svg' ? 'Active' : 'Select'}
              </button>
            </GeoPanelValueCell>
          )}
        />
        <GeoPanelKtvRow
          keyNode="GrabMaps"
          typeNode="Preset"
          panelTypography={panelTypography}
          isActive={grabMapsActive}
          valueNode={(
            <GeoPanelValueCell>
              <button
                type="button"
                className={buildGeoPanelButtonClassName(grabMapsActive, disabled)}
                disabled={disabled}
                aria-pressed={grabMapsActive}
                aria-label="GrabMaps 2D modern preset"
                onClick={props.onApplyGrabMapsPreset}
              >
                {grabMapsActive ? 'Active' : 'Select'}
              </button>
            </GeoPanelValueCell>
          )}
        />
        <GeoPanelKtvRow
          keyNode="2D Classic"
          typeNode="Tiles"
          panelTypography={panelTypography}
          isActive={geospatialViewMode === '2d'}
          valueNode={(
            <GeoPanelValueCell>
              <button
                type="button"
                className={buildGeoPanelButtonClassName(geospatialViewMode === '2d', disabled)}
                disabled={disabled}
                aria-pressed={geospatialViewMode === '2d'}
                aria-label="2D (MapLibre, Classic) Demo tiles"
                onClick={() => props.onSelectViewMode('2d')}
              >
                {geospatialViewMode === '2d' ? 'Active' : 'Select'}
              </button>
            </GeoPanelValueCell>
          )}
        />
        <GeoPanelKtvRow
          keyNode="2D Modern"
          typeNode="Style"
          panelTypography={panelTypography}
          isActive={geospatialViewMode === '2d-modern' && !grabMapsActive}
          valueNode={(
            <GeoPanelValueCell>
              <button
                type="button"
                className={buildGeoPanelButtonClassName(
                  geospatialViewMode === '2d-modern' && !grabMapsActive,
                  disabled,
                )}
                disabled={disabled}
                aria-pressed={geospatialViewMode === '2d-modern' && !grabMapsActive}
                aria-label="2D (MapLibre, Modern) Liberty style"
                onClick={() => props.onSelectViewMode('2d-modern')}
              >
                {geospatialViewMode === '2d-modern' && !grabMapsActive ? 'Active' : 'Select'}
              </button>
            </GeoPanelValueCell>
          )}
        />
        <GeoPanelKtvRow
          keyNode="3D Classic"
          typeNode="Globe"
          panelTypography={panelTypography}
          isActive={geospatialViewMode === '3d'}
          valueNode={(
            <GeoPanelValueCell>
              <button
                type="button"
                className={buildGeoPanelButtonClassName(geospatialViewMode === '3d', disabled)}
                disabled={disabled}
                aria-pressed={geospatialViewMode === '3d'}
                aria-label="3D (MapLibre, Classic) Globe style"
                onClick={() => props.onSelectViewMode('3d')}
              >
                {geospatialViewMode === '3d' ? 'Active' : 'Select'}
              </button>
            </GeoPanelValueCell>
          )}
        />
        <GeoPanelKtvRow
          keyNode="3D Modern"
          typeNode="Style"
          panelTypography={panelTypography}
          isActive={geospatialViewMode === '3d-modern'}
          valueNode={(
            <GeoPanelValueCell>
              <button
                type="button"
                className={buildGeoPanelButtonClassName(geospatialViewMode === '3d-modern', disabled)}
                disabled={disabled}
                aria-pressed={geospatialViewMode === '3d-modern'}
                aria-label="3D (MapLibre, Modern) Liberty style"
                onClick={() => props.onSelectViewMode('3d-modern')}
              >
                {geospatialViewMode === '3d-modern' ? 'Active' : 'Select'}
              </button>
            </GeoPanelValueCell>
          )}
        />
      </GeoPanelSection>

      <GeoPanelSection title="Point Style" panelTypography={panelTypography}>
        <GeoPanelKtvRow
          keyNode="Airport"
          typeNode="Color"
          panelTypography={panelTypography}
          valueNode={(
            <GeoPanelValueCell>
              <input
                className={colorInputClassName}
                type="color"
                aria-label="Airport"
                value={pointStyleDraft.colors.airport}
                disabled={disabled}
                onChange={event => setPointStyleDraft(previous => ({
                  ...previous,
                  colors: { ...previous.colors, airport: event.target.value },
                }))}
              />
            </GeoPanelValueCell>
          )}
        />
        <GeoPanelKtvRow
          keyNode="Hotel"
          typeNode="Color"
          panelTypography={panelTypography}
          valueNode={(
            <GeoPanelValueCell>
              <input
                className={colorInputClassName}
                type="color"
                aria-label="Hotel"
                value={pointStyleDraft.colors.hotel}
                disabled={disabled}
                onChange={event => setPointStyleDraft(previous => ({
                  ...previous,
                  colors: { ...previous.colors, hotel: event.target.value },
                }))}
              />
            </GeoPanelValueCell>
          )}
        />
        <GeoPanelKtvRow
          keyNode="POI"
          typeNode="Color"
          panelTypography={panelTypography}
          valueNode={(
            <GeoPanelValueCell>
              <input
                className={colorInputClassName}
                type="color"
                aria-label="POI"
                value={pointStyleDraft.colors.poi}
                disabled={disabled}
                onChange={event => setPointStyleDraft(previous => ({
                  ...previous,
                  colors: { ...previous.colors, poi: event.target.value },
                }))}
              />
            </GeoPanelValueCell>
          )}
        />
        <GeoPanelKtvRow
          keyNode="Radius x"
          typeNode="Scale"
          panelTypography={panelTypography}
          valueNode={(
            <GeoPanelValueCell>
              <input
                className={compactInputClassName}
                type="number"
                step="0.05"
                min="0.6"
                max="2.4"
                aria-label="Radius x"
                value={String(pointStyleDraft.radiusMultiplier)}
                disabled={disabled}
                onChange={event => {
                  const value = Number(event.target.value)
                  if (!Number.isFinite(value)) return
                  setPointStyleDraft(previous => ({ ...previous, radiusMultiplier: value }))
                }}
              />
            </GeoPanelValueCell>
          )}
        />
        <GeoPanelKtvRow
          keyNode="Point Style"
          typeNode="Action"
          panelTypography={panelTypography}
          valueNode={(
            <GeoPanelValueCell>
              <button
                type="button"
                className={buildGeoPanelButtonClassName(false, disabled)}
                disabled={disabled}
                onClick={props.onApplyPointStyle}
              >
                Apply Point Style
              </button>
              <button
                type="button"
                className={buildGeoPanelButtonClassName(false, disabled)}
                disabled={disabled}
                onClick={props.onResetPointStyle}
              >
                Reset Point Style
              </button>
            </GeoPanelValueCell>
          )}
        />
      </GeoPanelSection>

      <GeoPanelSection title="Camera" panelTypography={panelTypography}>
        <GeoPanelKtvRow
          keyNode="Auto-fit"
          typeNode="Toggle"
          panelTypography={panelTypography}
          isActive={geospatialAutoFitEnabled}
          valueNode={(
            <GeoPanelValueCell>
              <button
                type="button"
                className={buildGeoPanelButtonClassName(geospatialAutoFitEnabled, disabled)}
                disabled={disabled}
                aria-pressed={geospatialAutoFitEnabled}
                onClick={props.onToggleAutoFit}
              >
                {geospatialAutoFitEnabled ? 'On' : 'Off'}
              </button>
            </GeoPanelValueCell>
          )}
        />
        <GeoPanelKtvRow
          keyNode="Fit"
          typeNode="Action"
          panelTypography={panelTypography}
          valueNode={(
            <GeoPanelValueCell>
              <button
                type="button"
                className={buildGeoPanelButtonClassName(false, disabled)}
                disabled={disabled}
                onClick={props.onFitToData}
              >
                Fit to data
              </button>
              <button
                type="button"
                className={buildGeoPanelButtonClassName(false, disabled)}
                disabled={disabled}
                onClick={props.onFitToSelection}
              >
                Fit to selection
              </button>
            </GeoPanelValueCell>
          )}
        />
        <GeoPanelKtvRow
          keyNode="Current Location"
          typeNode="Browser"
          panelTypography={panelTypography}
          align={currentLocationMessage ? 'start' : 'center'}
          valueNode={(
            <GeoPanelValueCell className="items-start">
              <button
                type="button"
                className={buildGeoPanelButtonClassName(
                  false,
                  disabled || currentLocationState === 'locating',
                )}
                disabled={disabled || currentLocationState === 'locating'}
                onClick={props.onUseCurrentLocation}
              >
                {currentLocationState === 'locating' ? 'Locating...' : 'Use current location'}
              </button>
              {currentLocationMessage ? (
                <span className={locationMessageClassName}>{currentLocationMessage}</span>
              ) : null}
            </GeoPanelValueCell>
          )}
        />
      </GeoPanelSection>

      <GeoPanelSection title="Basemap" panelTypography={panelTypography}>
        <GeoPanelKtvRow
          keyNode="Style URL"
          typeNode={styleStatusLabel}
          panelTypography={panelTypography}
          align="start"
          valueNode={(
            <GeoPanelValueCell className="items-start">
              <input
                className={`${textInputClassName} min-w-[14rem] flex-1`}
                value={styleUrlDraft}
                onChange={event => props.onSetStyleUrlDraft(event.target.value)}
                placeholder="Leave blank for MapLibre default style"
                spellCheck={false}
                disabled={disabled}
              />
              <button
                type="button"
                className={buildGeoPanelButtonClassName(false, disabled)}
                disabled={disabled}
                onClick={props.onApplyStyleUrl}
              >
                Apply
              </button>
              <button
                type="button"
                className={buildGeoPanelButtonClassName(false, disabled)}
                disabled={disabled}
                onClick={props.onResetStyleUrl}
              >
                Reset
              </button>
            </GeoPanelValueCell>
          )}
        />
      </GeoPanelSection>
    </>
  )
}
