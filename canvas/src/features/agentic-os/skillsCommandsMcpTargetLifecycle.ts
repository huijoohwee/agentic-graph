let clearTarget: (() => void) | null = null

export function registerSkillsCommandsMcpTargetLifecycleClear(
  clear: () => void,
): () => void {
  clearTarget = clear
  return () => {
    if (clearTarget === clear) clearTarget = null
  }
}

export function clearSkillsCommandsMcpTargetFromPanelLifecycle(): void {
  clearTarget?.()
}
