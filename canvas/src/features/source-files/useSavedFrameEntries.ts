import { useEffect, useMemo, useState } from 'react'
import { loadWorkspaceSourceIndex, type WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import { ancestorPathsForWorkspacePath } from '@/features/workspace-fs/path'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import { websiteSourceBundlePath } from '@/lib/websites/websitePathUtils'
import { readSavedFrameDirectory, SAVED_FRAMES_CHANGED_EVENT } from '@/lib/rich-media/videoFrameAssets'

type FrameBundle = { path: string; source: string }
type Inventory = { files: WorkspaceEntry[]; error?: string }

export function videoFrameBundles(entries: WorkspaceEntry[], sources: WorkspaceSourceIndex): FrameBundle[] {
  const bundles = new Map<string, string>()
  const manifests = new Map(entries.filter(entry => entry.kind === 'file' && entry.name === 'source.json' && entry.text).map(entry => [entry.parentPath, entry.text!]))
  for (const entry of entries) {
    const parent = entry.parentPath
    if (!parent || entry.kind !== 'file' || !/(?:\.video-agent\.md|video-sequence\.timeline\.md)$/i.test(entry.name)) continue
    const owner = sources[entry.path]
    try {
      const source: unknown = owner?.kind === 'url' ? owner.url : JSON.parse(manifests.get(parent) || 'null')?.sourceUrl
      if (typeof source !== 'string') continue
      // Older dated captures may reference the same source. Only the source-owned bundle mounts its assets.
      if (websiteSourceBundlePath(source, parent.slice(0, parent.lastIndexOf('/')) || '/') === parent) {
        bundles.set(parent + '/frames', source)
      }
    } catch { /* Ignore non-HTTP workspace sources. */ }
  }
  return Array.from(bundles, ([path, source]) => ({ path, source }))
}

export async function readSavedFrameEntries(bundle: FrameBundle, signal: AbortSignal, fetchPage: typeof fetch = fetch): Promise<WorkspaceEntry[]> {
  const { directory, files } = await readSavedFrameDirectory(bundle.source, signal, fetchPage)
  return files.map(name => ({ kind: 'file', path: bundle.path + '/' + name, parentPath: bundle.path, name, updatedAtMs: 0,
    savedAsset: { url: directory + '/' + name } }))
}

/** Project metadata into Explorer only. Never seed binary files as editable text. */
export function useSavedFrameEntries(entries: WorkspaceEntry[], expanded: Set<string>, active: boolean, search: string) {
  const bundles = useMemo(() => videoFrameBundles(entries, loadWorkspaceSourceIndex()), [entries])
  const requested = JSON.stringify(active ? bundles.filter(bundle => search.trim() || (
    expanded.has(bundle.path) && ancestorPathsForWorkspacePath(bundle.path).every(parent => expanded.has(parent))
  )) : [])
  const [inventory, setInventory] = useState<Record<string, Inventory>>({})
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const refresh = (event: Event) => {
      const source = (event as CustomEvent<string>).detail
      if (bundles.some(bundle => bundle.source === source)) setRevision(value => value + 1)
    }
    window.addEventListener(SAVED_FRAMES_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(SAVED_FRAMES_CHANGED_EVENT, refresh)
  }, [bundles])
  useEffect(() => {
    const requestedBundles: FrameBundle[] = JSON.parse(requested)
    if (!requestedBundles.length) return
    const controller = new AbortController()
    const load = async () => {
      for (const bundle of requestedBundles) {
        if (controller.signal.aborted) return
        let result: Inventory
        try { result = { files: await readSavedFrameEntries(bundle, controller.signal) } }
        catch (error) { result = { files: [], error: error instanceof Error ? error.message : 'Could not list saved frames.' } }
        if (!controller.signal.aborted) setInventory(previous => ({ ...previous, [bundle.path]: result }))
      }
    }
    void load()
    return () => controller.abort()
  }, [requested, revision])

  return useMemo(() => {
    if (!bundles.length) return entries
    const existing = new Map(entries.map(entry => [entry.path, entry]))
    const result = [...entries]
    for (const bundle of bundles) {
      const occupied = existing.get(bundle.path)
      if (occupied?.kind === 'file') continue
      const listing = inventory[bundle.path]
      if (!occupied) result.push({ path: bundle.path, name: 'frames', parentPath: bundle.path.slice(0, bundle.path.lastIndexOf('/')),
        kind: 'folder', updatedAtMs: 0, savedAsset: { status: listing?.error || (!listing ? 'Loading saved frames…' : listing.files.length ? undefined : 'No frames saved yet.') } })
      for (const file of listing?.files || []) if (!existing.has(file.path)) result.push(file)
    }
    return result
  }, [entries, bundles, inventory])
}
