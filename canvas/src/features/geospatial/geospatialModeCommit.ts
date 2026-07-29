import { flushSync } from 'react-dom'
import {
  setGeospatialModeEnabled,
} from '@/features/geospatial/gympgrphBridge'

/**
 * Commits the event-driven Canvas owner before a caller observes its DOM.
 * Geo surface handoffs otherwise race React's render with MapLibre lifecycle
 * checks even though the persisted and gympgrph states already changed.
 */
export function commitCanvasGeospatialModeEnabled(
  enabled: boolean,
): Promise<boolean> {
  let committed: Promise<boolean> | null = null
  flushSync(() => {
    committed = setGeospatialModeEnabled(enabled)
  })
  if (!committed) {
    return Promise.reject(
      new Error('The native geospatial Canvas owner did not begin its commit.'),
    )
  }
  return committed
}
