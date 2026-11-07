import React from 'react'
import { readActiveMapLibreMap } from '@/lib/gympgrph/api'

const NIGHT_GRADE = 'brightness(0.52) saturate(1.16) contrast(1.12) hue-rotate(8deg)'

/** Applies an optional presentation grade after MapLibre mounts and restores the host canvas on exit. */
export function useGeoXrNightMapGrade(active: boolean): void {
  React.useEffect(() => {
    let frame: number | null = null
    let retries = 0
    let canvas: HTMLCanvasElement | null = null
    let previousFilter = ''
    const restore = () => {
      if (!canvas) return
      canvas.style.filter = previousFilter
      delete canvas.dataset.kgXrGeoNightGrade
      canvas = null
    }
    const apply = () => {
      if (!active) return
      const nextCanvas = readActiveMapLibreMap()?.getCanvas?.() || null
      if (!nextCanvas) {
        if (retries++ < 90) frame = requestAnimationFrame(apply)
        return
      }
      if (canvas !== nextCanvas) {
        restore()
        canvas = nextCanvas
        previousFilter = canvas.style.filter
      }
      canvas.style.filter = NIGHT_GRADE
      canvas.dataset.kgXrGeoNightGrade = 'night-waterfront'
    }
    apply()
    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      restore()
    }
  }, [active])
}
