import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import type { FlightSimSnapshot } from './flightSimModel'
import { projectFlightSimNavigation } from './flightSimNavigationProjection'
import { formatFlightSimCourseDirector } from './flightSimRouteGuidance'
import { readFlightSimXrSpatialProfile } from './flightSimSpatialProfile'

function markerColor(state: 'active' | 'pending' | 'visited'): string {
  if (state === 'active') return '#22d3ee'
  if (state === 'visited') return '#34d399'
  return '#94a3b8'
}

export function FlightSimNavigationInset({
  className,
  flight,
}: {
  className?: string
  flight: FlightSimSnapshot
}) {
  const result = React.useMemo(() => {
    try {
      return { projection: projectFlightSimNavigation(flight, readFlightSimXrSpatialProfile()), error: null }
    } catch (error) {
      return {
        projection: null,
        error: error instanceof Error ? error.message : 'Flight navigation is unavailable.',
      }
    }
  }, [flight])

  if (!result.projection) {
    return (
      <section
        className={cn('rounded border p-2 text-[10px]', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg, className)}
        data-kg-flight-sim-navigation="unavailable"
        role="status"
      >
        Navigation unavailable · {result.error}
      </section>
    )
  }

  const { projection } = result
  const courseDirector = formatFlightSimCourseDirector(projection.objective)
  const routePolyline = projection.route.map(point => `${point.x * 100},${point.y * 100}`).join(' ')
  return (
    <section
      className={cn('grid gap-1 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg, className)}
      aria-label="Flight navigation inset"
      data-kg-flight-sim-navigation="ready"
      data-kg-flight-sim-objective-distance={projection.objective?.distanceMeters.toFixed(3)}
      data-kg-flight-sim-objective-bearing={projection.objective?.bearingDegrees.toFixed(3)}
      data-kg-flight-sim-objective-heading-error={projection.objective?.headingErrorDegrees.toFixed(3)}
    >
      <header className="flex items-center justify-between gap-2 text-[10px] font-semibold">
        <span>LOCAL ROUTE · N↑</span>
        <span>
          {projection.objective
            ? `${projection.objective.label} · ${projection.objective.distanceMeters.toFixed(0)} m`
            : 'Complete'}
        </span>
      </header>
      <p
        className="text-[9px] font-semibold text-amber-200"
        data-kg-flight-sim-course-director="inset"
      >
        {courseDirector}
      </p>
      <svg
        className="aspect-square w-full rounded bg-slate-950/80"
        viewBox="0 0 100 100"
        role="img"
        aria-label="North-up local mission route"
      >
        <circle cx="50" cy="50" r="46" fill="none" stroke="#334155" strokeWidth="0.8" />
        <path d="M50 4 L47 10 L53 10 Z" fill="#f8fafc" />
        <polyline points={routePolyline} fill="none" stroke="#64748b" strokeDasharray="2 2" strokeWidth="1.4" />
        {projection.objective ? (
          <line
            x1={projection.aircraft.x * 100}
            y1={projection.aircraft.y * 100}
            x2={projection.objective.x * 100}
            y2={projection.objective.y * 100}
            stroke="#fde047"
            strokeDasharray="1.2 1.4"
            strokeLinecap="round"
            strokeWidth="1.8"
            data-kg-flight-sim-navigation-objective-guide={projection.objective.id}
          />
        ) : null}
        {projection.route.map(point => (
          <circle
            key={point.id}
            cx={point.x * 100}
            cy={point.y * 100}
            r={point.kind === 'landing' ? 3 : 2.2}
            fill={markerColor(point.state)}
            stroke="#e2e8f0"
            strokeWidth="0.6"
            data-kg-flight-sim-route-point={point.id}
            data-kg-flight-sim-route-state={point.state}
          />
        ))}
        <g
          transform={`translate(${projection.aircraft.x * 100} ${projection.aircraft.y * 100}) rotate(${projection.aircraft.headingDegrees})`}
          data-kg-flight-sim-navigation-heading="1"
        >
          <circle r="2.6" fill="#0e7490" stroke="#f8fafc" strokeWidth="0.8" />
          <line x1="0" y1="0" x2="0" y2="-5" stroke="#f8fafc" strokeLinecap="round" strokeWidth="1.2" />
        </g>
      </svg>
    </section>
  )
}
