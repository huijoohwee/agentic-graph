export type MediaCatalogMode = 'media' | 'xr-3d' | 'voice-studio'

type Listener = () => void

const listeners = new Set<Listener>()
let snapshot: MediaCatalogMode = 'media'

export function readMediaCatalogMode(): MediaCatalogMode {
  return snapshot
}

export function subscribeMediaCatalogMode(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setMediaCatalogMode(mode: MediaCatalogMode): void {
  if (snapshot === mode) return
  snapshot = mode
  for (const listener of listeners) listener()
}
