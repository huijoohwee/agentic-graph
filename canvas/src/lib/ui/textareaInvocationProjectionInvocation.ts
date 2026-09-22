import type { InvocationTokenKind } from '@/lib/markdown/invocationTokens'
import { buildAgenticOsInvocationChipTitle } from '@/features/agentic-os/agenticOsInvocationChips'
import { resolveInlineInvocationChipClassName } from '@/features/markdown/ui/dataViewChipStyles'

type ComposerInvocationSourcePart = {
  tokenKind: InvocationTokenKind
  text: string
}

export function readComposerInvocationChipClassName(part: Pick<ComposerInvocationSourcePart, 'text'>): string {
  return resolveInlineInvocationChipClassName({
    value: part.text,
    extraClassName: 'pointer-events-none cursor-text no-underline',
  })
}

export function readComposerInvocationSourceTitle(part: ComposerInvocationSourcePart): string {
  return buildAgenticOsInvocationChipTitle(part.text)
}
