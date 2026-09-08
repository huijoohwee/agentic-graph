type Viewport = { width: number; height: number }

/** Observe painted widget frames rather than reconstructing them from a global store cache. */
export async function waitForStoryboardWidgetViewportLayout(args: {
  doc: Document
  expectedIds: string[]
  viewport: Viewport
  label: string
  sourceText: string
  readSourceText: () => unknown
  diagnostics?: () => unknown
}): Promise<void> {
  const expected = new Set(args.expectedIds)
  if (expected.size < 4) throw new Error('expected a multi-widget viewport fixture')
  const deadline = Date.now() + 2500
  let snapshot: unknown = null
  while (Date.now() < deadline) {
    if (args.readSourceText() !== args.sourceText) throw new Error(`viewport initialization changed authored source for ${args.label}`)
    const entries = Array.from(args.doc.querySelectorAll<HTMLElement>('[data-kg-widget][data-kg-storyboard-widget-mode="1"]'))
      .map(el => {
        const rect = el.getBoundingClientRect()
        return { id: String(el.dataset.kgWidget || ''), left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      })
    const ids = new Set(entries.map(entry => entry.id))
    const complete = entries.length === expected.size && ids.size === expected.size && [...expected].every(id => ids.has(id))
    const finite = entries.every(entry => [entry.left, entry.top, entry.width, entry.height].every(Number.isFinite) && entry.width > 0 && entry.height > 0)
    const inView = entries.every(entry => entry.left >= -1 && entry.top >= -1
      && entry.left + entry.width <= args.viewport.width + 1 && entry.top + entry.height <= args.viewport.height + 1)
    const centerX = entries.reduce((sum, entry) => sum + entry.left + entry.width / 2, 0) / entries.length
    const centerY = entries.reduce((sum, entry) => sum + entry.top + entry.height / 2, 0) / entries.length
    const centered = Math.abs(centerX - args.viewport.width / 2) <= 6 && Math.abs(centerY - args.viewport.height / 2) <= 6
    snapshot = { complete, finite, inView, centerX, centerY, expected: [...expected], entries }
    if (complete && finite && inView && centered) return
    await new Promise<void>(resolve => setTimeout(resolve, 16))
  }
  throw new Error(`expected rendered Storyboard widgets to fit and center for ${args.label}; snapshot=${JSON.stringify(snapshot)}; diagnostics=${args.diagnostics?.() || ''}`)
}
