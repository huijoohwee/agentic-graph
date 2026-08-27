export type KnowgrphMotionPresetId =
  | 'flow-widget-enter'
  | 'flow-widget-emphasis'
  | 'overlay-toolbar-enter'

export type KnowgrphMotionOptions = {
  index?: number
  signal?: AbortSignal
}

const activeAnimations = new WeakMap<Element, Animation>()

const readRootStyle = (): CSSStyleDeclaration | null => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  return window.getComputedStyle(document.documentElement)
}

const readCssVar = (name: string, fallback: string): string => {
  const style = readRootStyle()
  const value = style?.getPropertyValue(name).trim()
  return value || fallback
}

const readDurationMs = (name: string, fallbackMs: number): number => {
  const value = readCssVar(name, `${fallbackMs}ms`)
  if (value.endsWith('ms')) {
    const n = Number(value.slice(0, -2))
    return Number.isFinite(n) ? Math.max(0, n) : fallbackMs
  }
  if (value.endsWith('s')) {
    const n = Number(value.slice(0, -1))
    return Number.isFinite(n) ? Math.max(0, n * 1000) : fallbackMs
  }
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, n) : fallbackMs
}

const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function resolveMotionTiming(preset: KnowgrphMotionPresetId, index: number): KeyframeAnimationOptions {
  const delayStepMs = readDurationMs('--kg-motion-stagger-step', 24)
  const clampedIndex = Math.max(0, Math.min(8, Math.floor(index)))
  if (preset === 'flow-widget-emphasis') {
    return {
      duration: readDurationMs('--kg-motion-duration-emphasis', 260),
      easing: readCssVar('--kg-motion-ease-spring', 'cubic-bezier(0.34, 1.56, 0.64, 1)'),
      delay: 0,
      fill: 'none',
    }
  }
  if (preset === 'overlay-toolbar-enter') {
    return {
      duration: readDurationMs('--kg-motion-duration-fast', 140),
      easing: readCssVar('--kg-motion-ease-standard', 'cubic-bezier(0.2, 0, 0, 1)'),
      delay: Math.min(80, clampedIndex * delayStepMs),
      fill: 'none',
    }
  }
  return {
    duration: readDurationMs('--kg-motion-duration-enter', 180),
    easing: readCssVar('--kg-motion-ease-standard', 'cubic-bezier(0.2, 0, 0, 1)'),
    delay: Math.min(120, clampedIndex * delayStepMs),
    fill: 'none',
  }
}

function resolveMotionKeyframes(preset: KnowgrphMotionPresetId): Keyframe[] {
  const distance = readCssVar('--kg-motion-distance-sm', '8px')
  if (preset === 'flow-widget-emphasis') {
    return [
      { opacity: 1 },
      { opacity: 0.96, offset: 0.58 },
      { opacity: 1 },
    ]
  }
  if (preset === 'overlay-toolbar-enter') {
    return [
      { transform: `translateY(calc(${distance} * -0.5)) scale(0.99)`, opacity: 0 },
      { transform: 'translateY(0) scale(1)', opacity: 1 },
    ]
  }
  return [
    { opacity: 0 },
    { opacity: 1 },
  ]
}

export function runKnowgrphMotion(
  element: Element | null | undefined,
  preset: KnowgrphMotionPresetId,
  options: KnowgrphMotionOptions = {},
): Animation | null {
  if (!element || typeof element.animate !== 'function') return null
  if (prefersReducedMotion()) return null
  const timing = resolveMotionTiming(preset, options.index || 0)
  if (!Number.isFinite(Number(timing.duration)) || Number(timing.duration) <= 0) return null

  const prev = activeAnimations.get(element)
  try {
    prev?.cancel()
  } catch {
    void 0
  }

  const animation = element.animate(resolveMotionKeyframes(preset), timing)
  activeAnimations.set(element, animation)
  const clear = () => {
    if (activeAnimations.get(element) === animation) activeAnimations.delete(element)
  }
  animation.addEventListener('finish', clear, { once: true })
  animation.addEventListener('cancel', clear, { once: true })

  if (options.signal) {
    const abort = () => {
      try {
        animation.cancel()
      } catch {
        void 0
      }
    }
    if (options.signal.aborted) abort()
    else options.signal.addEventListener('abort', abort, { once: true })
  }

  return animation
}
