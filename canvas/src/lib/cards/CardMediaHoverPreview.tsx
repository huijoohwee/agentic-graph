import React from 'react'
import Tooltip from '@/features/panels/ui/Tooltip'
import { CardMediaPreview } from '@/lib/cards/CardMediaPreview'
import { UI_RESPONSIVE_ANCHOR_PREVIEW_OVERLAY_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

export type CardMediaHoverPreviewKind = 'image' | 'svg' | 'video' | 'audio'

type CardMediaHoverPreviewAnchorProps<T extends HTMLElement> = React.HTMLAttributes<T> & {
  'aria-describedby': string | undefined
  'data-kg-card-media-hover-anchor': '1'
}

const isRelatedTargetInside = (currentTarget: HTMLElement, relatedTarget: EventTarget | null): boolean =>
  relatedTarget instanceof Node && currentTarget.contains(relatedTarget)

export function useCardMediaHoverPreview<T extends HTMLElement>() {
  const anchorRef = React.useRef<T | null>(null)
  const [show, setShow] = React.useState(false)
  const tooltipId = React.useId()
  const open = React.useCallback(() => setShow(true), [])
  const close = React.useCallback(() => setShow(false), [])
  const anchorProps = React.useMemo<CardMediaHoverPreviewAnchorProps<T>>(() => ({
    'aria-describedby': show ? tooltipId : undefined,
    'data-kg-card-media-hover-anchor': '1',
    onBlur: event => {
      if (!isRelatedTargetInside(event.currentTarget, event.relatedTarget)) close()
    },
    onFocus: open,
    onKeyDown: event => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close()
    },
    onMouseEnter: open,
    onMouseLeave: event => {
      if (!isRelatedTargetInside(event.currentTarget, event.relatedTarget)) close()
    },
    onPointerEnter: open,
    onPointerLeave: event => {
      if (!isRelatedTargetInside(event.currentTarget, event.relatedTarget)) close()
    },
  }), [close, open, show, tooltipId])
  return { anchorProps, anchorRef, close, show, tooltipId }
}

export function CardMediaHoverPreview(props: {
  anchorRef: React.RefObject<HTMLElement | null>
  kind: CardMediaHoverPreviewKind
  open: boolean
  title: string
  tooltipId: string
  url: string
  onClose: () => void
}) {
  const url = String(props.url || '').trim()
  React.useEffect(() => {
    if (!props.open || !url) return
    const openedAt = performance.now()
    const handlePointerDown = (event: MouseEvent) => {
      if (performance.now() - openedAt < 120) return
      const target = event.target
      if (target instanceof Node && props.anchorRef.current?.contains(target)) return
      props.onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose()
    }
    window.addEventListener('mousedown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [props.anchorRef, props.onClose, props.open, url])
  if (!props.open || !url) return null
  const isAudio = props.kind === 'audio'
  return (
    <Tooltip
      anchorElement={props.anchorRef.current}
      open
      interactive={false}
      id={props.tooltipId}
      contentSize={{ width: 320, height: isAudio ? 96 : 180 }}
      contentClassName={[
        UI_RESPONSIVE_ANCHOR_PREVIEW_OVERLAY_CLASSNAME,
        'p-0 overflow-hidden rounded border shadow-xl',
        UI_THEME_TOKENS.panel.border,
      ].join(' ')}
      contentDataAttrs={{
        'aria-label': `${props.title} media preview`,
        'data-kg-card-media-hover-preview': '1',
        'data-kg-card-media-hover-preview-kind': props.kind,
        'data-kg-canvas-pointer-ignore': 'true',
        'data-kg-canvas-wheel-ignore': 'true',
      }}
      content={
        <CardMediaPreview
          kind={props.kind}
          url={url}
          title={`${props.title} media preview`}
          interactive={false}
          fit="contain"
          videoAutoPlay={props.kind === 'video'}
          videoLoop={props.kind === 'video'}
          videoMuted={props.kind === 'video'}
          videoControls={false}
          className="h-full w-full"
          mediaClassName="h-full w-full"
        />
      }
    >{null}</Tooltip>
  )
}
