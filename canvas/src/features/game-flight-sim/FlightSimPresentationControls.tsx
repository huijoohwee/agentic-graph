import React from 'react'
import { cn } from '@/lib/utils'
import {
  FLIGHT_SIM_SIMULATION_SPEEDS,
  readFlightSimPresentationSettings,
  subscribeFlightSimPresentationSettings,
  updateFlightSimPresentationSettings,
} from './flightSimPresentationSettings'

export function FlightSimPresentationControls({
  buttonClassName,
  surface,
}: {
  buttonClassName: string
  surface: 'hud' | 'panel'
}) {
  const settings = React.useSyncExternalStore(
    subscribeFlightSimPresentationSettings,
    readFlightSimPresentationSettings,
    readFlightSimPresentationSettings,
  )
  return (
    <section
      className="grid gap-1"
      aria-label="Flight presentation controls"
      data-kg-flight-sim-presentation-controls={surface}
    >
      <section className="grid grid-cols-2 gap-1" role="group" aria-label="Flight display">
        <button
          type="button"
          className={cn(buttonClassName, 'min-h-11', surface === 'hud' && 'px-1', settings.overlaysVisible && 'font-bold')}
          aria-pressed={settings.overlaysVisible}
          title="Show optional HUD instruments and course cue"
          data-kg-flight-sim-overlays-toggle="1"
          onClick={() => updateFlightSimPresentationSettings({
            overlaysVisible: !readFlightSimPresentationSettings().overlaysVisible,
          })}
        >
          HUD overlays
        </button>
        <button
          type="button"
          className={cn(buttonClassName, 'min-h-11', surface === 'hud' && 'px-1', settings.navigationVisible && 'font-bold')}
          aria-pressed={settings.navigationVisible}
          title="Show the north-up navigation inset"
          data-kg-flight-sim-navigation-toggle="1"
          onClick={() => updateFlightSimPresentationSettings({
            navigationVisible: !readFlightSimPresentationSettings().navigationVisible,
          })}
        >
          Navigation
        </button>
      </section>
      <section className="grid grid-cols-3 gap-1" role="group" aria-label="Simulation speed">
        {FLIGHT_SIM_SIMULATION_SPEEDS.map(speed => (
          <button
            key={speed}
            type="button"
            className={cn(buttonClassName, 'min-h-11', surface === 'hud' && 'px-1', settings.simulationSpeed === speed && 'font-bold')}
            aria-label={`Simulation speed ${speed}×`}
            aria-pressed={settings.simulationSpeed === speed}
            data-kg-flight-sim-speed-option={speed}
            onClick={() => updateFlightSimPresentationSettings({ simulationSpeed: speed })}
          >
            {speed}×
          </button>
        ))}
      </section>
    </section>
  )
}
