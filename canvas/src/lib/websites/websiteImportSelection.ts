export type WebsiteDiscoveredPage = { url: string; path: string; title?: string }
export type WebsiteSelectionFolder = { name: string; path: string; folders: WebsiteSelectionFolder[]; pages: WebsiteDiscoveredPage[] }

export function buildWebsiteSelectionTree(pages: WebsiteDiscoveredPage[]): WebsiteSelectionFolder {
  const root: WebsiteSelectionFolder = { name: '/', path: '/', folders: [], pages: [] }
  for (const page of pages) {
    const segments = new URL(page.url).pathname.split('/').filter(Boolean)
    segments.pop()
    let folder = root
    for (const segment of segments) {
      const path = `${folder.path}${segment}/`
      let child = folder.folders.find(item => item.path === path)
      if (!child) {
        child = { name: segment, path, folders: [], pages: [] }
        folder.folders.push(child)
      }
      folder = child
    }
    folder.pages.push(page)
  }
  const sort = (folder: WebsiteSelectionFolder) => {
    folder.folders.sort((a, b) => a.name.localeCompare(b.name))
    folder.pages.sort((a, b) => a.path.localeCompare(b.path) || a.url.localeCompare(b.url))
    folder.folders.forEach(sort)
  }
  sort(root)
  return root
}

export function websiteFolderUrls(folder: WebsiteSelectionFolder): string[] {
  return [...folder.pages.map(page => page.url), ...folder.folders.flatMap(websiteFolderUrls)]
}

export async function discoverWebsitePages(rootUrl: string, url: string, signal: AbortSignal): Promise<{ pages: WebsiteDiscoveredPage[]; limited: boolean }> {
  const response = await fetch('/__website_import/discover', {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rootUrl, url }),
  })
  const result = await response.json()
  if (!response.ok || result.ok !== true || !Array.isArray(result.pages)) throw new Error(result.error || `Discovery failed (HTTP ${response.status})`)
  return { pages: result.pages, limited: result.limited === true }
}
