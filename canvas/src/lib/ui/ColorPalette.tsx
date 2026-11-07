import React from 'react'
import { MVP_COLOR_PALETTE } from '@/lib/graph/schema'
import { PanelTextInput } from '@/lib/ui/panelFormControls'
import { colorChannel, hexToHsv, hexToRgb, hsvToHex, normalizeHexColor, resolvePaletteColor, rgbToHex, type ColorHsv } from './colorValue'

const paletteValues = ['#000000', '#ffffff', '#808080', ...Object.values(MVP_COLOR_PALETTE.nodes), ...Object.values(MVP_COLOR_PALETTE.edges)]

export default function ColorPalette({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) {
  const swatches = React.useMemo(() => [...new Set(paletteValues.map(resolvePaletteColor).filter((color): color is string => Boolean(color)))], [])
  const [hsv, setHsv] = React.useState(() => hexToHsv(value))
  const [hex, setHex] = React.useState(value)
  const [invalid, setInvalid] = React.useState(false)
  React.useEffect(() => {
    setHex(value); setInvalid(false)
    setHsv(current => hsvToHex(current) === value ? current : hexToHsv(value))
  }, [value])
  const commit = (next: string) => { setHex(next); setInvalid(false); onValueChange(next) }
  const updateHsv = (next: ColorHsv) => { setHsv(next); commit(hsvToHex(next)) }
  const rgb = hexToRgb(value)
  const commitHex = () => {
    const next = normalizeHexColor(hex)
    if (next) commit(next); else setInvalid(true)
  }
  const fromPointer = (event: React.PointerEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    updateHsv({ ...hsv, s: colorChannel((event.clientX - bounds.left) / bounds.width * 100, 100), v: colorChannel((1 - (event.clientY - bounds.top) / bounds.height) * 100, 100) })
  }
  return <>
    <button type="button" className="kg-color-spectrum" aria-label="Saturation and brightness"
      aria-description="Arrow left or right adjusts saturation; arrow up or down adjusts brightness. Hold Shift for larger steps."
      style={{ backgroundColor: hsvToHex({ h: hsv.h, s: 100, v: 100 }) }}
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); fromPointer(event) }}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) fromPointer(event) }}
      onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
      onKeyDown={event => {
        const step = event.shiftKey ? 10 : 1
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
        event.preventDefault()
        updateHsv({ ...hsv, s: colorChannel(hsv.s + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), 100), v: colorChannel(hsv.v + (event.key === 'ArrowDown' ? -step : event.key === 'ArrowUp' ? step : 0), 100) })
      }}>
      <svg role="img" aria-label={`Saturation ${Math.round(hsv.s)}%, brightness ${Math.round(hsv.v)}%`} viewBox="0 0 100 100" preserveAspectRatio="none"><circle cx={hsv.s} cy={100 - hsv.v} r="2" fill={value} stroke="white" strokeWidth="1" /></svg>
    </button>
    <label className="kg-color-channel">Hue<input type="range" className="kg-color-hue" min="0" max="359" step="1" aria-label="Hue" value={Math.round(hsv.h)} onChange={event => updateHsv({ ...hsv, h: Number(event.target.value) })} /></label>
    <fieldset className="m-0 min-w-0 border-0 p-0"><legend className="mb-1">Palette</legend><menu className="kg-color-swatches">
      {swatches.map(color => <li key={color}><button type="button" className="kg-color-swatch" aria-label={`Choose ${color}`} aria-pressed={color === value} title={color} style={{ backgroundColor: color }} onClick={() => { setHsv(hexToHsv(color)); commit(color) }}><svg role="img" aria-label={color} viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" fill={color} /></svg></button></li>)}
    </menu></fieldset>
    <fieldset className="kg-color-rgb"><legend>RGB</legend>{['Red', 'Green', 'Blue'].map((name, index) => <label key={name}>{name}<PanelTextInput type="number" aria-label={name} min="0" max="255" step="1" value={rgb[index]} onChange={event => {
      if (!event.target.value.trim()) return
      const next = [...rgb]; next[index] = colorChannel(Number(event.target.value)); commit(rgbToHex(next))
    }} /></label>)}</fieldset>
    <label className="kg-color-channel">Hex<PanelTextInput aria-label="Hex colour" aria-invalid={invalid} value={hex} maxLength={7} spellCheck={false} onChange={event => { setHex(event.target.value); setInvalid(false); if (/^#[0-9a-f]{6}$/i.test(event.target.value)) commit(event.target.value.toLowerCase()) }} onBlur={commitHex} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commitHex() } }} /></label>
    {invalid && <p role="alert" className="m-0">Enter a hex colour, such as #336699.</p>}
    <output aria-live="polite" className="text-right">{value}</output>
  </>
}
