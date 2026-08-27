import fs from 'node:fs'
import path from 'node:path'

import { JSDOM } from 'jsdom'

import {
  MARKDOWN_EDIT_PARITY_PROBE_EVENT,
  MARKDOWN_EDIT_PARITY_PROBE_JSON_LOG_PREFIX,
  reportMarkdownEditParityProbe,
} from '@/lib/markdown-core/ui/markdownEditParityProbe'

const readUtf8 = (relativePath: string): string => {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')
}

export const testMarkdownEditParityProbeHelperCentralizesRuntimeProbeContract = async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
  const g = globalThis as unknown as { window?: unknown; document?: unknown }
  g.window = dom.window
  g.document = dom.window.document

  const events: Array<Record<string, unknown>> = []
  const listener = (event: Event) => {
    const custom = event as CustomEvent<Record<string, unknown>>
    events.push(custom.detail || {})
  }
  dom.window.addEventListener(MARKDOWN_EDIT_PARITY_PROBE_EVENT, listener as EventListener)

  const warnings: unknown[] = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args)
  }

  try {
    reportMarkdownEditParityProbe({
      startLine: 4,
      endLine: 6,
      mismatches: [{ key: 'fontSize', read: '14px', edit: '13px' }],
    })
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  } finally {
    console.warn = originalWarn
  }

  const w = dom.window as Window & {
    __AG_EDIT_PARITY_LAST_MISMATCH__?: unknown
    __AG_EDIT_PARITY_LAST_PAYLOAD__?: unknown
    __AG_EDIT_PARITY_MISMATCH_COUNT__?: number
  }
  if (!w.__AG_EDIT_PARITY_LAST_PAYLOAD__) {
    throw new Error('expected parity probe helper to persist the last payload on window')
  }
  if (!w.__AG_EDIT_PARITY_LAST_MISMATCH__) {
    throw new Error('expected parity probe helper to persist the last mismatch payload when mismatches exist')
  }
  if (Number(w.__AG_EDIT_PARITY_MISMATCH_COUNT__ || 0) !== 1) {
    throw new Error(`expected parity probe helper to increment mismatch count, got ${String(w.__AG_EDIT_PARITY_MISMATCH_COUNT__ || 0)}`)
  }
  if (events.length !== 1) {
    throw new Error(`expected parity probe helper to dispatch one probe event, got ${events.length}`)
  }
  const warnText = warnings.map(entry => JSON.stringify(entry)).join('\n')
  if (!warnText.includes(MARKDOWN_EDIT_PARITY_PROBE_EVENT) || !warnText.includes(MARKDOWN_EDIT_PARITY_PROBE_JSON_LOG_PREFIX)) {
    throw new Error('expected parity probe helper to emit both probe and json console warnings')
  }

  dom.window.removeEventListener(MARKDOWN_EDIT_PARITY_PROBE_EVENT, listener as EventListener)
}

export const testMarkdownEditParityProbeCallsitesUseSharedHelper = () => {
  const helperText = readUtf8('src/lib/markdown-core/ui/markdownEditParityProbe.ts')
  const blockText = readUtf8('src/lib/markdown-core/ui/markdownBlockContainerCore.editOpenCaretProbe.ts')

  if (!helperText.includes('export const MARKDOWN_EDIT_PARITY_PROBE_EVENT')) {
    throw new Error('expected markdown edit parity probe event constant to live in the shared helper module')
  }
  if (!helperText.includes('export function reportMarkdownEditParityProbe')) {
    throw new Error('expected markdown edit parity probe helper module to expose a shared reporter')
  }
  if (!helperText.includes('__AG_EDIT_PARITY_LAST_PAYLOAD__') || !helperText.includes(MARKDOWN_EDIT_PARITY_PROBE_JSON_LOG_PREFIX)) {
    throw new Error('expected markdown edit parity probe helper to own the visible payload and json console contract')
  }
  if (!blockText.includes('reportMarkdownEditParityProbe(payload)')) {
    throw new Error('expected markdown block edit probe to delegate runtime reporting to the shared parity helper')
  }
  if (blockText.includes("new CustomEvent('kg-edit-parity-probe'")) {
    throw new Error('expected markdown block edit probe to avoid inline parity probe event construction')
  }
}
