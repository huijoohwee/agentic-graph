import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'

type DebugTraceWindow = Window & {
  localStorage?: Storage
  __AG_MARKDOWN_EMPTY_TRACE__?: unknown
}

export function GraphStoreMarkdownEmptyTraceDebugRuntime() {
  React.useEffect(() => {
    const windowValue = typeof window !== 'undefined' ? (window as DebugTraceWindow) : null
    const enabled = !!(windowValue?.localStorage && windowValue.localStorage.getItem('kg:debug:markdownEmptyTrace') === '1')
    if (!windowValue || !enabled) return

    const buffer: Array<{
      ts: number
      prevName: string
      nextName: string
      prevLen: number
      nextLen: number
      stack: string
    }> = []
    windowValue.__AG_MARKDOWN_EMPTY_TRACE__ = buffer

    let previousName = String(useGraphStore.getState().markdownDocumentName || '')
    let previousText = String(useGraphStore.getState().markdownDocumentText || '')

    const unsubscribe = useGraphStore.subscribe(
      state => [state.markdownDocumentName, state.markdownDocumentText] as const,
      next => {
        const nextName = String(next[0] || '')
        const nextText = String(next[1] || '')
        const previousLength = previousText.trim().length
        const nextLength = nextText.trim().length
        if (previousLength > 0 && nextLength === 0) {
          const stack = String(new Error('markdownDocumentText emptied').stack || '')
          buffer.push({
            ts: Date.now(),
            prevName: previousName,
            nextName,
            prevLen: previousLength,
            nextLen: nextLength,
            stack,
          })
          if (buffer.length > 20) buffer.splice(0, buffer.length - 20)
        }
        previousName = nextName
        previousText = nextText
      },
    )

    return () => {
      unsubscribe()
    }
  }, [])

  return null
}
