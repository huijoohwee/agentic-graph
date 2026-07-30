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
    const xCandidates = new Set<number>([item.left])
    const yCandidates = new Set<number>([item.top])
    for (let blockerIndex = 0; blockerIndex < blockers.length; blockerIndex += 1) {
      const blocker = blockers[blockerIndex]!
      xCandidates.add(blocker.left - item.width - args.gapPx)
      xCandidates.add(blocker.left + blocker.width + args.gapPx)
      yCandidates.add(blocker.top - item.height - args.gapPx)
      yCandidates.add(blocker.top + blocker.height + args.gapPx)
    }
    const candidates = Array.from(xCandidates)
      .flatMap(left => Array.from(yCandidates).map(top => ({ left, top })))
      .sort((left, right) => {
        const leftScore = Math.abs(left.left - item.left) + Math.abs(left.top - item.top)
        const rightScore = Math.abs(right.left - item.left) + Math.abs(right.top - item.top)
        if (leftScore !== rightScore) return leftScore - rightScore
        if (left.top !== right.top) return left.top - right.top
        return left.left - right.left
      })
    const open = candidates.find(candidate => !blockers.some(blocker => (
      storyboardFixedCardCollisionRectsOverlap2d({ ...item, ...candidate }, blocker, args.gapPx)
    )))
    settled.push(open ? { ...item, ...open } : item)
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
