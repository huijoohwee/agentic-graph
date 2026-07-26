import React from 'react'
import { loadFlowDetails } from '@/features/settings/registry'
import type { FlowDetails } from '@/features/settings/types'

export function useSettingsFlowDetails() {
  const [flow, setFlow] = React.useState<Record<string, FlowDetails>>({})
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [error, setError] = React.useState('')
  const requestRef = React.useRef(0)

  const retry = React.useCallback(() => {
    const request = requestRef.current + 1
    requestRef.current = request
    setStatus('loading')
    setError('')
    void loadFlowDetails().then(result => {
      if (requestRef.current !== request) return
      setFlow(result.details)
      setStatus(result.status)
      setError(result.error ?? '')
    })
  }, [])

  React.useEffect(() => {
    retry()
    return () => { requestRef.current += 1 }
  }, [retry])

  return { flow, status, error, retry }
}
