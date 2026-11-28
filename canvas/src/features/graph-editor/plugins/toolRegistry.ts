import type React from 'react'

export type GraphEditorToolContribution = {
  id: string
  activate?: () => void
  label: string
  hotkey?: string
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
}

const TOOLS: GraphEditorToolContribution[] = []

export function registerGraphEditorTool(tool: GraphEditorToolContribution) {
  const id = String(tool?.id || '').trim()
  if (!id) return () => {}
  const exists = TOOLS.some(t => t.id === id)
  if (exists) return () => {}
  TOOLS.push({ ...tool, id })
  return () => {
    const idx = TOOLS.findIndex(t => t.id === id)
    if (idx >= 0) TOOLS.splice(idx, 1)
  }
}

export function listGraphEditorPluginTools(): GraphEditorToolContribution[] {
  return TOOLS.slice().sort((a, b) => a.label.localeCompare(b.label))
}
