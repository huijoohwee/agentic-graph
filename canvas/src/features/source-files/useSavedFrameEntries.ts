import { useEffect, useMemo, useState } from 'react'
import { loadWorkspaceSourceIndex, type WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import { ancestorPathsForWorkspacePath } from '@/features/workspace-fs/path'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import { websiteSourceBundlePath } from '@/lib/websites/websitePathUtils'
import { REMOTE_VIDEO_FRAME_PUBLIC_PREFIX, SAVED_FRAME_PAGE_SIZE, savedFrameListUrl, savedFrameRelativeDirectory, VIDEO_FRAME_FILE_RE } from '@/lib/rich-media/videoFrameAssets'

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
  const files: WorkspaceEntry[] = []
  let after = ''
  do {
    const response = await fetchPage(savedFrameListUrl(bundle.source, after), { signal, cache: 'no-store' })
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('Saved frame files are unavailable from this workspace host.')
    }
    const { directory, files: names, next } = await response.json()
    const flat = REMOTE_VIDEO_FRAME_PUBLIC_PREFIX
    const nested = flat + '/' + savedFrameRelativeDirectory(bundle.source)
    if ((directory !== flat && directory !== nested) || !Array.isArray(names) || names.length > SAVED_FRAME_PAGE_SIZE ||
      !names.every((name, index) => typeof name === 'string' && VIDEO_FRAME_FILE_RE.test(name) && name > (index ? names[index - 1] : after)) ||
      (next !== null && (!names.length || next !== names[names.length - 1]))) throw new Error('Invalid saved frame listing.')
    for (const name of names) {
      files.push({ kind: 'file', path: bundle.path + '/' + name, parentPath: bundle.path, name, updatedAtMs: 0,
        savedAsset: { url: directory + '/' + name } })
    }
    after = next
  } while (after)
  return files
}

/** Project metadata into Explorer only. Never seed binary files as editable text. */
export function useSavedFrameEntries(entries: WorkspaceEntry[], expanded: Set<string>, active: boolean, search: string) {
  const bundles = useMemo(() => videoFrameBundles(entries, loadWorkspaceSourceIndex()), [entries])
  const requested = JSON.stringify(active ? bundles.filter(bundle => search.trim() || (
    expanded.has(bundle.path) && ancestorPathsForWorkspacePath(bundle.path).every(parent => expanded.has(parent))
  )) : [])
  const [inventory, setInventory] = useState<Record<string, Inventory>>({})
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
  }, [requested])

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
