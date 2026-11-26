import React from 'react'
import { PanelSelect } from '@/lib/ui/panelFormControls'
import {
  readCinematicControlMode,
  setCinematicControlMode,
  subscribeCinematicControlMode,
} from './cinematicControlModeRuntime'

export function CinematicControlModeSelect() {
  const mode = React.useSyncExternalStore(
    subscribeCinematicControlMode,
    readCinematicControlMode,
    readCinematicControlMode,
  )
  return (
    <label className="grid min-w-0 gap-1 text-xs" data-kg-cinematic-control-mode={mode}>
      <span>Control owner</span>
      <PanelSelect
        aria-label="Cinematic control owner"
        value={mode}
        onValueChange={value => setCinematicControlMode(value)}
      >
        <option value="agent">AI / LLM / MCP · default</option>
        <option value="human">Human</option>
      </PanelSelect>
    </label>
  )
}

export function CinematicHumanControlHint() {
  const mode = React.useSyncExternalStore(
    subscribeCinematicControlMode,
    readCinematicControlMode,
    readCinematicControlMode,
  )

  if (mode === 'human') return null

  return (
    <div className="grid gap-2 rounded border border-amber-500/40 bg-amber-50/70 p-2 text-xs text-amber-950 dark:bg-amber-950/20 dark:text-amber-100" data-kg-cinematic-human-control-hint="1">
      <p className="m-0">AI / LLM / MCP owns camera controls. Switch to Human to adjust framing and author XR camera moves.</p>
      <button
        type="button"
        className="App-toolbar__btn justify-self-start font-semibold"
        onClick={() => setCinematicControlMode('human')}
        data-kg-cinematic-human-control-action="1"
      >
        Switch to Human
      </button>
    </div>
  )
}
