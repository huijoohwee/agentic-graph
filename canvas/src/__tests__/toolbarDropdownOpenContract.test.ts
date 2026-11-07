import fs from 'node:fs'
import path from 'node:path'

import { JSDOM } from 'jsdom'

import {
  emitToolbarDropdownOpen,
  readToolbarDropdownOpenEventDetail,
  subscribeToolbarDropdownOpen,
  TOOLBAR_DROPDOWN_OPEN_EVENT,
} from '@/components/toolbar/dropdownOpenEvents'

const readUtf8 = (relativePath: string): string => {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')
}

export const testToolbarDropdownOpenHelpersCentralizeEventDispatchAndSubscription = async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
  const g = globalThis as unknown as { window?: unknown; document?: unknown }
  g.window = dom.window
  g.document = dom.window.document

  const events: Array<Record<string, unknown>> = []
  const unsubscribe = subscribeToolbarDropdownOpen(detail => {
    events.push(detail as Record<string, unknown>)
  })

  emitToolbarDropdownOpen(' dropdown-a ')
  await new Promise<void>(resolve => setTimeout(resolve, 0))

  const last = events[events.length - 1]
  if (!last) throw new Error('expected toolbar dropdown open helper to dispatch an event')
  if (String(last.sourceId || '') !== 'dropdown-a') {
    throw new Error(`expected toolbar dropdown open helper to normalize sourceId, got ${JSON.stringify(last)}`)
  }

  const rawEvent = new dom.window.CustomEvent(TOOLBAR_DROPDOWN_OPEN_EVENT, {
    detail: { sourceId: ' dropdown-b ' },
  })
  const parsed = readToolbarDropdownOpenEventDetail(rawEvent)
  if (!parsed) throw new Error('expected shared toolbar dropdown parser to read CustomEvent detail')
  if (parsed.sourceId !== 'dropdown-b') {
    throw new Error(`expected shared toolbar dropdown parser to normalize sourceId, got ${JSON.stringify(parsed)}`)
  }

  unsubscribe()
}

export const testToolbarDropdownCallsitesUseSharedContract = () => {
  const helperText = readUtf8('src/components/toolbar/dropdownOpenEvents.ts')
  const selectText = readUtf8('src/components/toolbar/ToolbarDropdownSelect.tsx')

  if (!helperText.includes("from '@agentic-base/views-react/controls'")) throw new Error('toolbar menu must use the Base owner')
  for (const name of ['TOOLBAR_DROPDOWN_OPEN_EVENT', 'emitToolbarDropdownOpen', 'subscribeToolbarDropdownOpen', 'readToolbarDropdownOpenEventDetail']) {
    if (!helperText.includes(name)) throw new Error('missing shared contract: ' + name)
  }
  if (/dispatchEvent|addEventListener/.test(helperText)) throw new Error('Graph must not retain a duplicate menu coordinator')
  if (!selectText.includes('emitToolbarDropdownOpen(dropdownIdRef.current)')) {
    throw new Error('expected ToolbarDropdownSelect to emit via the shared toolbar dropdown helper')
  }
  if (!selectText.includes('subscribeToolbarDropdownOpen')) {
    throw new Error('expected ToolbarDropdownSelect to subscribe via the shared toolbar dropdown helper')
  }
  if (selectText.includes("'kg:toolbar-dropdown-open'")) {
    throw new Error('expected ToolbarDropdownSelect to avoid inline toolbar dropdown event strings')
  }
}
