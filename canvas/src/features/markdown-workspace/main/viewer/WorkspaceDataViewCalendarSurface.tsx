import React from 'react'
const Calendar = React.lazy(() => import('@/features/markdown/ui/MarkdownDataViewCalendarView'))
export function WorkspaceDataViewCalendarSurface(props: React.ComponentProps<typeof Calendar>) {
  return <React.Suspense fallback={<p role="status">Loading Calendar…</p>}><Calendar {...props} /></React.Suspense>
}
