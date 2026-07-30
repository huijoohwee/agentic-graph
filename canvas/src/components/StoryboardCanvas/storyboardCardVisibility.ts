import type { StoryboardCardModel } from '@/components/StoryboardCanvas/storyboardModel'

export const selectRenderableStoryboardCards = (
  cards: StoryboardCardModel[],
): StoryboardCardModel[] => {
  // The shared graph display projection owns semantic visibility. Applying a
  // second content-score filter here would make one D3 node disappear when the
  // same graph is viewed as Storyboard cards.
  return cards
}
