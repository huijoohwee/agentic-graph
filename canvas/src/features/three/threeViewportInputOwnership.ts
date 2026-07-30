import React from 'react'

export type ThreeViewportInputOwnership = Readonly<{
  active: boolean
  ownerId: string | null
  blocksProgrammaticCamera: boolean
  revision: number
}>

const listeners = new Set<() => void>()
let ownership: ThreeViewportInputOwnership = Object.freeze({
  active: false,
  ownerId: null,
  blocksProgrammaticCamera: false,
  revision: 0,
})

export function readThreeViewportInputOwnership(): ThreeViewportInputOwnership {
  return ownership
}

export function subscribeThreeViewportInputOwnership(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useThreeViewportInputOwnership(): ThreeViewportInputOwnership {
  return React.useSyncExternalStore(
    subscribeThreeViewportInputOwnership,
    readThreeViewportInputOwnership,
    readThreeViewportInputOwnership,
  )
}

export function claimThreeViewportInputOwnership(
  ownerId: string,
  options: Readonly<{ blocksProgrammaticCamera?: boolean }> = {},
): boolean {
  const normalizedOwnerId = String(ownerId || '').trim()
  if (!normalizedOwnerId) return false
  if (ownership.active) return ownership.ownerId === normalizedOwnerId
  ownership = Object.freeze({
    active: true,
    ownerId: normalizedOwnerId,
    blocksProgrammaticCamera: options.blocksProgrammaticCamera !== false,
    revision: ownership.revision + 1,
  })
  publishOwnershipChange()
  return true
}

export function releaseThreeViewportInputOwnership(ownerId: string): void {
  if (!ownership.active || ownership.ownerId !== String(ownerId || '').trim()) return
  ownership = Object.freeze({
    active: false,
    ownerId: null,
    blocksProgrammaticCamera: false,
    revision: ownership.revision + 1,
  })
  publishOwnershipChange()
}

export function shouldDeferThreeCameraProgrammaticInput(args: {
  objectInputActive: boolean
  viewportInputBlocksProgrammaticCamera: boolean
}): boolean {
  return args.objectInputActive || args.viewportInputBlocksProgrammaticCamera
}

function publishOwnershipChange(): void {
  for (const listener of [...listeners]) listener()
}
