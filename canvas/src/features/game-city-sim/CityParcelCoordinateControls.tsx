import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  cityInputSourceFromPointerType,
  type CityInputSource,
} from './citySimInputRuntime'

export function CityParcelCoordinateControls(props: Readonly<{
  busy: boolean
  columns: number
  onSelect: (row: number, column: number, source: CityInputSource) => void
  rows: number
  selectedColumn: number | null
  selectedRow: number | null
}>) {
  const inputSourceRef = React.useRef<CityInputSource>('pointer')
  const rowCoordinates = React.useMemo(
    () => Array.from({ length: props.rows }, (_, row) => row),
    [props.rows],
  )
  const columnCoordinates = React.useMemo(
    () => Array.from({ length: props.columns }, (_, column) => column),
    [props.columns],
  )
  const consumeInputSource = React.useCallback(() => {
    const source = inputSourceRef.current
    inputSourceRef.current = 'pointer'
    return source
  }, [])
  const selectClassName = cn(
    'min-w-0 rounded border px-2 py-1',
    UI_THEME_TOKENS.panel.border,
    UI_THEME_TOKENS.input.bg,
    UI_THEME_TOKENS.text.primary,
  )

  return (
    <fieldset
      className="grid grid-cols-2 gap-1"
      data-kg-city-sim-parcel-select="coordinates"
    >
      <legend className={cn('col-span-2 text-[10px]', UI_THEME_TOKENS.text.secondary)}>
        Parcel coordinates
      </legend>
      <label className="grid min-w-0 gap-1 text-[10px]">
        <span className={UI_THEME_TOKENS.text.tertiary}>Row</span>
        <select
          className={selectClassName}
          value={props.selectedRow === null ? '' : String(props.selectedRow)}
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
            props.onSelect(
              Number(event.currentTarget.value),
              props.selectedColumn ?? 0,
              consumeInputSource(),
            )
          }}
          data-kg-city-sim-parcel-row="1"
        >
          <option value="">Row</option>
          {rowCoordinates.map(row => (
            <option key={row} value={row}>Row {row + 1}</option>
          ))}
        </select>
      </label>
      <label className="grid min-w-0 gap-1 text-[10px]">
        <span className={UI_THEME_TOKENS.text.tertiary}>Column</span>
        <select
          className={selectClassName}
          value={props.selectedColumn === null ? '' : String(props.selectedColumn)}
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
            props.onSelect(
              props.selectedRow ?? 0,
              Number(event.currentTarget.value),
              consumeInputSource(),
            )
          }}
          data-kg-city-sim-parcel-column="1"
        >
          <option value="">Column</option>
          {columnCoordinates.map(column => (
            <option key={column} value={column}>Column {column + 1}</option>
          ))}
        </select>
      </label>
    </fieldset>
  )
}

export default CityParcelCoordinateControls
