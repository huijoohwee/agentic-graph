import React from 'react'
import {
  readGeospatialPresentationCameraOwner,
  type GeospatialPresentationCameraOwner,
} from './geospatialPresentationCameraOwner.js'

export type GeospatialPresentationCameraAuthority = Readonly<{
  hasClaim: () => boolean
  readOwner: () => GeospatialPresentationCameraOwner
}>

export function useGeospatialPresentationCameraOwner(
  active: boolean,
  pendingOwner: GeospatialPresentationCameraOwner,
): GeospatialPresentationCameraAuthority {
  const readOwner = React.useCallback(
    (): GeospatialPresentationCameraOwner => active
      ? readGeospatialPresentationCameraOwner(pendingOwner)
      : null,
    [active, pendingOwner],
  )
  const hasClaim = React.useCallback(
    (): boolean => readOwner() !== null,
    [readOwner],
  )
  return React.useMemo(
    () => ({ hasClaim, readOwner }),
    [hasClaim, readOwner],
  )
}
