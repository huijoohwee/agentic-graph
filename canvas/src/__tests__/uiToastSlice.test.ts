import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { GraphState } from '@/hooks/store/types'
import { createUiToastSlice } from '@/hooks/store/uiToastSlice'

export function testUiToastUpsertDoesNotExtendExpiry() {
  const realNow = Date.now
  let state: Pick<GraphState, 'uiToasts'> = { uiToasts: [] }
  const set: (fn: (s: GraphState) => Partial<GraphState>) => void = fn => {
    state = { ...state, ...(fn(state as unknown as GraphState) as Pick<GraphState, 'uiToasts'>) }
  }
  const slice = createUiToastSlice(set)

  try {
    Date.now = () => 1_000
    slice.upsertUiToast({ id: 't', message: 'a', kind: 'neutral', ttlMs: 1_000 })
    if (state.uiToasts.length < 1) throw new Error('expected first upsert to create toast')
    if (state.uiToasts.length > 1) throw new Error('expected first upsert to create exactly one toast')
    const first = state.uiToasts[0]
    if (!first || first.createdAtMs !== 1_000) throw new Error('expected createdAtMs to be set to now')
    if (first.expiresAtMs !== 2_000) throw new Error('expected expiresAtMs to be createdAtMs + ttlMs')

    Date.now = () => 1_500
    slice.upsertUiToast({ id: 't', message: 'b', kind: 'neutral', ttlMs: 1_000 })
    if (state.uiToasts.length > 1) throw new Error('expected upsert to keep single toast by id')
    const updated = state.uiToasts[0]
    if (!updated) throw new Error('expected updated toast')
    if (updated.createdAtMs !== 1_000) throw new Error('expected createdAtMs preserved on upsert')
    if (updated.expiresAtMs !== 2_000) throw new Error('expected upsert not to extend expiry')

    Date.now = () => 2_500
    slice.pruneUiToasts(Date.now())
    if (state.uiToasts.length !== 0) throw new Error('expected prune to remove expired toast')
  } finally {
    Date.now = realNow
  }
}

export function testUiToastUpsertMovesToastToFront() {
  const realNow = Date.now
  let state: Pick<GraphState, 'uiToasts'> = { uiToasts: [] }
  const set: (fn: (s: GraphState) => Partial<GraphState>) => void = fn => {
    state = { ...state, ...(fn(state as unknown as GraphState) as Pick<GraphState, 'uiToasts'>) }
  }
  const slice = createUiToastSlice(set)

  try {
    Date.now = () => 1_000
    slice.pushUiToast({ id: 'a', message: 'a', kind: 'neutral', ttlMs: 1_000 })
    Date.now = () => 1_100
    slice.pushUiToast({ id: 'b', message: 'b', kind: 'neutral', ttlMs: 1_000 })
    const firstId = state.uiToasts[0]?.id
    if (firstId !== 'b') throw new Error('expected newest toast to be first')

    Date.now = () => 1_200
    slice.upsertUiToast({ id: 'a', message: 'a2', kind: 'neutral', ttlMs: 1_000 })
    const afterUpsertId = state.uiToasts[0]?.id
    if (afterUpsertId !== 'a') throw new Error('expected upserted toast to move to front')
  } finally {
    Date.now = realNow
  }
}

export function testUiToastBusyFlagResetsOnUpsert() {
  let state: Pick<GraphState, 'uiToasts'> = { uiToasts: [] }
  const set: (fn: (s: GraphState) => Partial<GraphState>) => void = fn => {
    state = { ...state, ...(fn(state as unknown as GraphState) as Pick<GraphState, 'uiToasts'>) }
  }
  const slice = createUiToastSlice(set)

  slice.upsertUiToast({ id: 't', message: 'Importing', kind: 'neutral', ttlMs: null, busy: true })
  if (state.uiToasts[0]?.busy !== true) throw new Error('expected busy toast flag to be stored')

  slice.upsertUiToast({ id: 't', message: 'Imported', kind: 'success', ttlMs: 1_000 })
  if (state.uiToasts[0]?.busy === true) throw new Error('expected busy toast flag to clear on non-busy upsert')
}

export function testToastHostRendersBusySpinnerIcon() {
  const p = resolve(process.cwd(), 'src', 'components', 'ui', 'ToastHost.tsx')
  const text = readFileSync(p, 'utf8')
  const stylesText = readFileSync(resolve(process.cwd(), 'src', 'styles', 'toast-responsive.css'), 'utf8')
  const indexCssText = readFileSync(resolve(process.cwd(), 'src', 'index.css'), 'utf8')
  if (!text.includes('LoaderCircle')) throw new Error('expected busy toasts to use a spinner icon')
  if (!text.includes('toast.busy ? LoaderCircle')) throw new Error('expected toast busy flag to select the spinner')
  if (!text.includes('animate-spin')) throw new Error('expected busy toast spinner to animate')
  if (!text.includes("export const TOAST_ROW_GRID_CLASS_NAME = 'kg-toast-row-grid'")) {
    throw new Error('expected ToastHost to expose the toast row responsive owner')
  }
  if (!text.includes('className={TOAST_ROW_GRID_CLASS_NAME}')) {
    throw new Error('expected toast rows to reuse the responsive row owner')
  }
  if (!text.includes('kg-toast-card pointer-events-auto flex-none')) {
    throw new Error('expected toast cards to be hit-testable for text selection and controls')
  }
  if (!text.includes('className="list-none"')) {
    throw new Error('expected toast list items to retain their semantic list contract')
  }
  if (!text.includes('<article') || !text.includes('data-kg-selection-surface="toast"')) {
    throw new Error('expected each toast to expose a semantic, selection-visible article surface')
  }
  if (!text.includes('data-kg-toast-message={toast.id}') || !text.includes('select-text')) {
    throw new Error('expected toast messages to remain selectable through an explicit semantic message surface')
  }
  if (!text.includes('data-kg-toast-copy={toastId}') || !text.includes('Copy notification text')) {
    throw new Error('expected toast messages to expose a visible native Copy affordance')
  }
  if (text.includes('aria-hidden="true"')) {
    throw new Error('expected toast visual affordances to avoid hidden decorative icon contracts')
  }
  if (!text.includes('aria-hidden={false}')) {
    throw new Error('expected toast visual affordances to remain visible to selection tooling')
  }
  if (text.includes('grid grid-cols-[16px_minmax(0,1fr)_auto]')) {
    throw new Error('expected ToastHost to avoid inline arbitrary row grid sizing')
  }
  if (!indexCssText.includes("@import './styles/toast-responsive.css';")) {
    throw new Error('expected app CSS to import the toast responsive owner stylesheet')
  }
  if (!stylesText.includes('.kg-toast-row-grid') || !stylesText.includes('--kg-toast-status-column-width')) {
    throw new Error('expected toast row responsive CSS to own the bounded status column')
  }
}

export function testToastHostSchedulesPruneFromNextExpiryInsteadOfPolling() {
  const p = resolve(process.cwd(), 'src', 'components', 'ui', 'ToastHost.tsx')
  const text = readFileSync(p, 'utf8')
  if (!text.includes('const nextExpiryAtMs = React.useMemo(() => {')) {
    throw new Error('expected toast host to derive the next semantic expiry instead of polling blindly')
  }
  if (!text.includes("if (nextExpiryAtMs == null) return")) {
    throw new Error('expected toast host to avoid scheduling prune work when no toast can expire')
  }
  if (!text.includes('window.setTimeout(() => {')) {
    throw new Error('expected toast host to schedule a single prune timeout per next expiry')
  }
  if (text.includes('window.setInterval(() => {')) {
    throw new Error('expected toast host to remove the always-on prune interval hot path')
  }
}

export function testErrorBoundaryUsesSharedToastInsteadOfInlineRedDetails() {
  const boundaryText = readFileSync(resolve(process.cwd(), 'src', 'components', 'ErrorBoundary.tsx'), 'utf8')
  const appText = readFileSync(resolve(process.cwd(), 'src', 'App.tsx'), 'utf8')
  const canvasText = readFileSync(resolve(process.cwd(), 'src', 'pages', 'Canvas.tsx'), 'utf8')
  const toastIndex = appText.indexOf('<ToastHostLazy />')
  const boundaryIndex = appText.indexOf('<ErrorBoundary>')

  if (!boundaryText.includes('useGraphStore') || !boundaryText.includes('upsertUiToast')) {
    throw new Error('expected ErrorBoundary failures to flow through the shared toast store')
  }
  if (!boundaryText.includes("id: ERROR_BOUNDARY_TOAST_ID") || !boundaryText.includes("'react:error-boundary'")) {
    throw new Error('expected ErrorBoundary toast to use a stable upsert id')
  }
  if (boundaryText.includes('text-red-600') || boundaryText.includes('text-red-700')) {
    throw new Error('expected ErrorBoundary to remove inline red error details')
  }
  if (boundaryText.includes('console.error(error)')) {
    throw new Error('expected ErrorBoundary to avoid duplicate console-only error reporting')
  }
  if (!appText.includes("const ToastHostLazy = lazy(() => import('@/components/ui/ToastHost'))")) {
    throw new Error('expected App shell to own the shared toast host')
  }
  if (toastIndex < 0 || boundaryIndex < 0 || toastIndex > boundaryIndex) {
    throw new Error('expected App shell toast host to mount outside the route ErrorBoundary')
  }
  if (canvasText.includes('ToastHostLazy')) {
    throw new Error('expected Canvas page to avoid a duplicate toast host')
  }
}

export function testMermaidDiagramErrorsUseSharedToastInsteadOfInlineRedDetails() {
  const interactiveText = readFileSync(resolve(process.cwd(), 'src', 'lib', 'diagram', 'InteractiveMermaidDiagram.tsx'), 'utf8')
  const plainText = readFileSync(resolve(process.cwd(), 'src', 'features', 'markdown', 'ui', 'PlainMermaidDiagram.tsx'), 'utf8')
  for (const [label, text] of [['interactive', interactiveText], ['plain', plainText]] as const) {
    if (!text.includes('useGraphStore') || !text.includes('upsertUiToast')) {
      throw new Error(`expected ${label} Mermaid renderer to route render failures through shared toasts`)
    }
    if (!text.includes('mermaid-diagram-render-error:')) {
      throw new Error(`expected ${label} Mermaid renderer to use a stable toast id`)
    }
    if (text.includes('text-red-600') || text.includes('text-red-400')) {
      throw new Error(`expected ${label} Mermaid renderer to remove inline red render errors`)
    }
    if (!text.includes('Mermaid diagram error surfaced in notifications.')) {
      throw new Error(`expected ${label} Mermaid renderer to keep a semantic non-visual status fallback`)
    }
  }
}
