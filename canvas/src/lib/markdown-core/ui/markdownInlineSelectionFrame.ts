type Selection = { start: number; end: number }
type EditorRef = { readonly current: HTMLElement | null }
type PendingFrame = {
  ref: EditorRef
  root: HTMLElement
  selection: Selection | undefined
  effect: (() => void) | null
  cancel: (() => void) | null
}

export const pendingViewerSelections = new WeakMap<HTMLElement, Selection>()
const frames = new WeakMap<EditorRef, PendingFrame>()
const editors = new WeakMap<HTMLElement, PendingFrame>()

const retire = (entry: PendingFrame): void => {
  if (frames.get(entry.ref) === entry) frames.delete(entry.ref)
  if (editors.get(entry.root) === entry) editors.delete(entry.root)
  entry.effect = null
  const cancel = entry.cancel
  entry.cancel = null
  if (pendingViewerSelections.get(entry.root) === entry.selection) pendingViewerSelections.delete(entry.root)
  try { cancel?.() } catch { void 0 }
}

/** One pending request per ref and element; retired editors cannot move a replacement's caret. */
export function scheduleMarkdownInlineSelectionFrame(ref: EditorRef, callback: () => void): void {
  const previous = frames.get(ref)
  if (previous) retire(previous)
  const root = ref.current
  if (!root) return
  const previousEditor = editors.get(root)
  if (previousEditor) retire(previousEditor)
  const entry: PendingFrame = { ref, root, selection: pendingViewerSelections.get(root), effect: callback, cancel: null }
  frames.set(ref, entry)
  editors.set(root, entry)
  const run = () => {
    if (frames.get(ref) !== entry || editors.get(root) !== entry) return
    const effect = entry.effect
    entry.cancel = null
    retire(entry)
    if (ref.current === root && root.isConnected) effect?.()
  }
  const owner = root.ownerDocument.defaultView
  if (owner && typeof owner.requestAnimationFrame === 'function') {
    const cancel = owner.cancelAnimationFrame?.bind(owner)
    const id = owner.requestAnimationFrame(run)
    entry.cancel = () => cancel?.(id)
  } else if (typeof globalThis.requestAnimationFrame === 'function') {
    const cancel = globalThis.cancelAnimationFrame?.bind(globalThis)
    const id = globalThis.requestAnimationFrame(run)
    entry.cancel = () => cancel?.(id)
  } else {
    const id = setTimeout(run, 0)
    entry.cancel = () => clearTimeout(id)
  }
}
