// Contract adapter over the immutable, checked central Design System intent palette.
// Generic intent values have one editable owner (agentic-design-system/site/ui-intent-palette.json);
// Graph derives them from the pinned projection and never re-authors local class literals.
import palette from './ui-intent-palette.json' with { type: 'json' }

export const UI_INTENT_TOKENS = palette.intents