import React from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import { UI_THEME_TOKENS } from './theme-tokens'
import { isMediaExpandedPreviewFullscreen, toggleMediaExpandedPreviewFullscreen } from './mediaExpandedPreviewFullscreen'
import { cn } from '../utils'

type MediaExpandedPreviewFullscreenButtonProps = {
  targetRef: React.RefObject<HTMLElement | null>
  dataAttributes?: Record<`data-${string}`, string>
}

export function MediaExpandedPreviewFullscreenButton(props: MediaExpandedPreviewFullscreenButtonProps) {
  const { targetRef, dataAttributes } = props
  const [fullscreen, setFullscreen] = React.useState(false)

  React.useEffect(() => {
    const syncFullscreenState = () => setFullscreen(isMediaExpandedPreviewFullscreen(targetRef.current))
    syncFullscreenState()
    document.addEventListener('fullscreenchange', syncFullscreenState)
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState)
  }, [targetRef])

  const label = fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'
  const Icon = fullscreen ? Minimize2 : Maximize2
  return (
    <button
      type="button"
      className={cn('inline-flex h-8 w-8 items-center justify-center rounded border bg-black/50 text-white backdrop-blur-sm', UI_THEME_TOKENS.panel.border)}
      title={label}
      aria-label={label}
      aria-pressed={fullscreen}
      {...dataAttributes}
      onClick={event => {
        event.stopPropagation()
        toggleMediaExpandedPreviewFullscreen(targetRef.current)
      }}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  )
}
