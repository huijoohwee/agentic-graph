import type { StoryboardCardModel } from '@/components/StoryboardCanvas/storyboardModel'

const hasRenderablePayload = (card: StoryboardCardModel): boolean => Boolean(
  card.summary
  || card.output
  || card.slugline
  || card.action
  || card.dialogue
  || card.prompt
  || card.style
  || card.media
  || card.references.length > 0
  || card.href
)

const isAuthoredStructuralCard = (card: StoryboardCardModel): boolean =>
  card.structural && hasRenderablePayload(card)

export const selectRenderableStoryboardCards = (
  cards: StoryboardCardModel[],
): StoryboardCardModel[] => {
  if (cards.length <= 1) return cards
  const richCards = cards.filter(card => !card.structural && card.candidateScore >= 2)
  if (richCards.length >= 2) {
    return cards.filter(
      card => isAuthoredStructuralCard(card)
        || (!card.structural && card.candidateScore >= 2),
    )
  }
  const nonStructuralCards = cards.filter(card => !card.structural)
  if (nonStructuralCards.length >= 2) {
    return cards.filter(card => isAuthoredStructuralCard(card) || !card.structural)
  }
  return cards
}
