export type StoryboardFixedCardCollisionLayoutObstacle2d = {
  id: string
  centerWorldX: number
  centerWorldY: number
  baseWidth: number
  baseHeight: number
}

export type StoryboardFixedCardCollisionRect2d = {
  id: string
  left: number
  top: number
  width: number
  height: number
}

export type StoryboardFixedCardCollisionItem2d = StoryboardFixedCardCollisionRect2d & {
  movable: boolean
}

const quantizeLayoutScalar = (value: number): number => (
  Number.isFinite(value) ? Math.round(value) : 0
)

export function storyboardFixedCardCollisionRectsOverlap2d(
  left: Pick<StoryboardFixedCardCollisionRect2d, 'left' | 'top' | 'width' | 'height'>,
  right: Pick<StoryboardFixedCardCollisionRect2d, 'left' | 'top' | 'width' | 'height'>,
  gapPx: number,
): boolean {
  const gap = Number.isFinite(gapPx) ? Math.max(0, gapPx) : 0
  return left.left < right.left + right.width + gap
    && right.left < left.left + left.width + gap
    && left.top < right.top + right.height + gap
    && right.top < left.top + left.height + gap
}

export function settleStoryboardFixedCardCollisionItems2d(args: {
  items: ReadonlyArray<StoryboardFixedCardCollisionItem2d>
  obstacles: ReadonlyArray<StoryboardFixedCardCollisionRect2d>
  gapPx: number
}): StoryboardFixedCardCollisionItem2d[] {
  const settled = args.items.filter(item => !item.movable)
  const movableItems = args.items.filter(item => item.movable)
  for (let itemIndex = 0; itemIndex < movableItems.length; itemIndex += 1) {
    const item = movableItems[itemIndex]!
    const blockers = [...args.obstacles, ...settled]
    if (!blockers.some(blocker => storyboardFixedCardCollisionRectsOverlap2d(item, blocker, args.gapPx))) {
      settled.push(item)
      continue
    }
    // Sweep X boundaries while retaining only horizontally intersecting blockers.
    // Their sorted Y intervals give the nearest free Y without a Cartesian grid.
    const events = blockers.flatMap(blocker => [
      { x: blocker.left - item.width - args.gapPx, start: true, blocker },
      { x: blocker.left + blocker.width + args.gapPx, start: false, blocker },
    ]).sort((a, b) => a.x - b.x)
    const nearestTop = (active: typeof blockers): number => {
      let low = Infinity
      let high = -Infinity
      for (const blocker of active) {
        const start = blocker.top - item.height - args.gapPx
        const end = blocker.top + blocker.height + args.gapPx
        if (start >= high) {
          if (low < item.top && item.top < high) break
          if (start >= item.top) break
          low = start
          high = end
        } else high = Math.max(high, end)
      }
      return low < item.top && item.top < high
        ? (item.top - low <= high - item.top ? low : high)
        : item.top
    }
    const initialTop = nearestTop(blockers.filter(blocker => (
      item.left < blocker.left + blocker.width + args.gapPx
      && blocker.left < item.left + item.width + args.gapPx
    )).sort((a, b) => a.top - b.top))
    let best = { left: item.left, top: initialTop, score: Math.abs(initialTop - item.top) }
    const active: typeof blockers = []
    for (let i = 0; i < events.length;) {
      const left = events[i]!.x
      let end = i + 1
      while (end < events.length && events[end]!.x === left) end++
      // Boundaries may touch: ending intervals leave before the query and
      // starting intervals join afterwards, exactly matching strict overlap.
      for (let j = i; j < end; j++) {
        const event = events[j]!
        if (!event.start) active.splice(active.indexOf(event.blocker), 1)
      }
      const dx = Math.abs(left - item.left)
      if (dx <= best.score) {
        const top = nearestTop(active)
        const score = dx + Math.abs(top - item.top)
        if (score < best.score || (score === best.score
          && (top < best.top || (top === best.top && left < best.left)))) best = { left, top, score }
      }
      for (let j = i; j < end; j++) {
        const event = events[j]!
        if (!event.start) continue
        let lo = 0
        let hi = active.length
        while (lo < hi) {
          const mid = (lo + hi) >>> 1
          if (active[mid]!.top < event.blocker.top) lo = mid + 1
          else hi = mid
        }
        active.splice(lo, 0, event.blocker)
      }
      i = end
    }
    settled.push({ ...item, left: best.left, top: best.top })
  }
  return settled
}

export function buildStoryboardFixedCardCollisionLayoutKey2d(args: {
  viewport: { width: number; height: number }
  cards: ReadonlyArray<{ id: string; width: number; height: number }>
  obstacles: ReadonlyArray<StoryboardFixedCardCollisionLayoutObstacle2d>
}): string {
  const cardEntries = args.cards
    .map(card => ({
      id: String(card.id || '').trim(),
      width: quantizeLayoutScalar(card.width),
      height: quantizeLayoutScalar(card.height),
    }))
    .filter(card => card.id)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(card => `${card.id}:${card.width}x${card.height}`)
  const obstacleEntries = args.obstacles
    .map(obstacle => ({
      id: String(obstacle.id || '').trim(),
      centerWorldX: quantizeLayoutScalar(obstacle.centerWorldX),
      centerWorldY: quantizeLayoutScalar(obstacle.centerWorldY),
      baseWidth: quantizeLayoutScalar(obstacle.baseWidth),
      baseHeight: quantizeLayoutScalar(obstacle.baseHeight),
    }))
    .filter(obstacle => obstacle.id)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(obstacle => (
      `${obstacle.id}:${obstacle.centerWorldX},${obstacle.centerWorldY}:${obstacle.baseWidth}x${obstacle.baseHeight}`
    ))
  return [
    `${quantizeLayoutScalar(args.viewport.width)}x${quantizeLayoutScalar(args.viewport.height)}`,
    ...cardEntries,
    ...obstacleEntries,
  ].join('|')
}
