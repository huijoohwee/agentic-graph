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
