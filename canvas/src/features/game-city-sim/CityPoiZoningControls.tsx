import React from 'react'
import type { RegionalPoiIdentity } from 'grph-shared/geospatial/regionalPoiGeo'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  cityInputSourceFromPointerType,
  type CityInputSource,
} from './citySimInputRuntime'

export function CityPoiZoningControls(props: Readonly<{
  busy: boolean
  onSelect: (poiId: string, source: CityInputSource) => void
  pois: readonly RegionalPoiIdentity[]
  selectedPoiId: string | null
}>) {
  const inputSourceRef = React.useRef<CityInputSource>('pointer')
  const consumeInputSource = React.useCallback(() => {
    const source = inputSourceRef.current
    inputSourceRef.current = 'pointer'
    return source
  }, [])

  return (
    <fieldset
      className="grid gap-1"
      data-kg-city-sim-poi-select="identity"
    >
      <legend className={cn('text-[10px]', UI_THEME_TOKENS.text.secondary)}>
        POI zoning target
      </legend>
      <label className="grid min-w-0 gap-1 text-[10px]">
        <span className={UI_THEME_TOKENS.text.tertiary}>Regional POI</span>
        <select
          className={cn(
            'min-w-0 rounded border px-2 py-1',
            UI_THEME_TOKENS.panel.border,
            UI_THEME_TOKENS.input.bg,
            UI_THEME_TOKENS.text.primary,
          )}
          value={props.selectedPoiId ?? ''}
          disabled={props.busy}
          onPointerDown={event => {
            inputSourceRef.current = cityInputSourceFromPointerType(event.pointerType)
          }}
          onTouchStart={() => {
            inputSourceRef.current = 'touch'
          }}
          onKeyDown={() => {
            inputSourceRef.current = 'keyboard'
          }}
          onChange={event => {
            if (!event.currentTarget.value) return
            props.onSelect(event.currentTarget.value, consumeInputSource())
          }}
          data-kg-city-sim-poi-id="1"
        >
          <option value="">Select regional POI</option>
          {props.pois.map(poi => (
            <option key={poi.id} value={poi.id}>{poi.label}</option>
          ))}
        </select>
      </label>
    </fieldset>
  )
}

export default CityPoiZoningControls
