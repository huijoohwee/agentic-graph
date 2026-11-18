import { usePanelTypography } from '@/lib/ui/panelTypography'
import React from 'react'
import { Eraser } from 'lucide-react'
import { UI_COPY, UI_LABELS } from '@/lib/config'
import { type TraversalSummary, type GraphRagTraversalSummary } from '@/features/panels/utils/orchestratorTraversal'
import { reorderList } from '@/lib/reorder'
import type {
  OrchestratorTraversalSectionViewModel,
  OrchestratorTraversalPathEditState,
} from '@/features/panels/views/OrchestratorTraversalSectionModel'
import { PlainTextInputEditor } from '@/components/ui/PlainTextInputEditor'
import { UI_RESPONSIVE_MICRO_INLINE_CONTROL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { uiToolbarButtonMutedClassName } from '@/features/toolbar/ui/toolbarStyles'

const inlineActionButtonClassName = `${UI_RESPONSIVE_MICRO_INLINE_CONTROL_CLASSNAME} border ${UI_THEME_TOKENS.input.border} rounded ${UI_THEME_TOKENS.text.primary} ${UI_THEME_TOKENS.button.hoverBg}`
const inlineValueButtonClassName = `${UI_RESPONSIVE_MICRO_INLINE_CONTROL_CLASSNAME} border ${UI_THEME_TOKENS.input.border} rounded ${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.text.primary} ${UI_THEME_TOKENS.button.hoverBg}`

interface TraverseNodesListEditorProps {
  lastTraversal: GraphRagTraversalSummary
  graphNodesById: OrchestratorTraversalSectionViewModel['graphNodesById']
  editPaths: OrchestratorTraversalPathEditState
  setLastTraversal: React.Dispatch<React.SetStateAction<TraversalSummary | null>>
  selectNode: (id: string | null) => void
}

export function TraverseNodesListEditor({
  lastTraversal,
  graphNodesById,
  editPaths,
  setLastTraversal,
  selectNode,
}: TraverseNodesListEditorProps) {
  const { panelTextClass } = usePanelTypography()
  const {
    editingTraverseIndex,
    setEditingTraverseIndex,
    editingTraverseText,
    setEditingTraverseText,
  } = editPaths
  return (
    <section className={panelTextClass}>
      <section className="flex items-center justify-between mb-[2px]">
        <span className="font-semibold">{UI_COPY.orchestratorTraversalTraverseNodesTitle}</span>
        <button
          type="button"
          className={`App-toolbar__btn ${uiToolbarButtonMutedClassName}`}
          onClick={() =>
            setLastTraversal(prev =>
              prev && prev.mode === 'graphRag'
                ? ({
                    ...prev,
                    traverseNodeIds: [],
                  } as TraversalSummary)
                : prev,
            )
          }
          aria-label={UI_COPY.orchestratorTraversalClearTraverseNodesAriaLabel}
        >
          <Eraser className="w-3.5 h-3.5" />
        </button>
      </section>
      <ol className="list-decimal ml-4 space-y-[2px]">
        {lastTraversal.traverseNodeIds.map((id, index) => {
          const isEditing = editingTraverseIndex === index
          const node = graphNodesById[String(id)]
          const label = node ? node.label : String(id)
          return (
            <li key={`${id}-${index}`} className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <PlainTextInputEditor
                    value={editingTraverseText}
                    onChange={setEditingTraverseText}
                    className={`flex-1 ${inlineActionButtonClassName}`}
                  />
                  <button
                    type="button"
                    className={inlineActionButtonClassName}
                    onClick={() => {
                      const trimmed = editingTraverseText.trim()
                      if (!trimmed) return
                      setLastTraversal(prev =>
                        prev && prev.mode === 'graphRag'
                          ? ({
                              ...prev,
                              traverseNodeIds: prev.traverseNodeIds.map((value, i) =>
                                i === index ? (trimmed as unknown as string) : value,
                              ),
                            } as TraversalSummary)
                          : prev,
                      )
                      setEditingTraverseIndex(null)
                      setEditingTraverseText('')
                    }}
                  >
                    {UI_LABELS.save}
                  </button>
                  <button
                    type="button"
                    className={inlineActionButtonClassName}
                    onClick={() => {
                      setEditingTraverseIndex(null)
                      setEditingTraverseText('')
                    }}
                  >
                    {UI_LABELS.cancel}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={inlineValueButtonClassName}
                    onClick={() => selectNode(String(id))}
                  >
                    {label}
                  </button>
                  <section className="flex items-center gap-1">
                    <button
                      type="button"
                      className={inlineActionButtonClassName}
                      onClick={() => {
                        setEditingTraverseIndex(index)
                        setEditingTraverseText(String(id))
                      }}
                    >
                      {UI_LABELS.edit}
                    </button>
                  {index > 0 && (
                    <button
                      type="button"
                      className={inlineActionButtonClassName}
                        onClick={() =>
                          setLastTraversal(prev =>
                            prev && prev.mode === 'graphRag'
                              ? ({
                                  ...prev,
                                  traverseNodeIds: reorderList(prev.traverseNodeIds, index, index - 1),
                                } as TraversalSummary)
                              : prev,
                          )
                        }
                      >
                        ↑
                      </button>
                    )}
                    {index < lastTraversal.traverseNodeIds.length - 1 && (
                      <button
                        type="button"
                        className={inlineActionButtonClassName}
                        onClick={() =>
                          setLastTraversal(prev =>
                            prev && prev.mode === 'graphRag'
                              ? ({
                                  ...prev,
                                  traverseNodeIds: reorderList(prev.traverseNodeIds, index, index + 1),
                                } as TraversalSummary)
                              : prev,
                          )
                        }
                      >
                        ↓
                      </button>
                    )}
                    <button
                      type="button"
                      className={inlineActionButtonClassName}
                      onClick={() =>
                        setLastTraversal(prev =>
                          prev && prev.mode === 'graphRag'
                            ? ({
                                ...prev,
                                traverseNodeIds: prev.traverseNodeIds.filter((_, i) => i !== index),
                              } as TraversalSummary)
                            : prev,
                        )
                      }
                      aria-label={UI_COPY.orchestratorTraversalRemoveTraverseNodeAriaLabel}
                    >
                      <Eraser className="w-3.5 h-3.5" />
                    </button>
                  </section>
                </>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

interface HopsListEditorProps {
  lastTraversal: GraphRagTraversalSummary
  editPaths: OrchestratorTraversalPathEditState
  setLastTraversal: React.Dispatch<React.SetStateAction<TraversalSummary | null>>
}

export function HopsListEditor({
  lastTraversal,
  editPaths,
  setLastTraversal,
}: HopsListEditorProps) {
  const { editingHopIndex, setEditingHopIndex, editingHopText, setEditingHopText } = editPaths
  const { panelTextClass, monospaceTextClass: uiPanelMonospaceTextClass } = usePanelTypography()
  return (
    <section className={panelTextClass}>
      <section className="flex items-center justify-between mb-[2px]">
        <span className="font-semibold">{UI_COPY.orchestratorTraversalHopsTitle}</span>
        <button
          type="button"
          className={`App-toolbar__btn ${uiToolbarButtonMutedClassName}`}
          onClick={() =>
            setLastTraversal(prev =>
              prev && prev.mode === 'graphRag'
                ? ({
                    ...prev,
                    hops: [],
                  } as TraversalSummary)
                : prev,
            )
          }
          aria-label={UI_COPY.orchestratorTraversalClearHopsAriaLabel}
        >
          <Eraser className="w-3.5 h-3.5" />
        </button>
      </section>
      <ol className="list-decimal ml-4 space-y-[2px]">
        {lastTraversal.hops.map((hop, index) => {
          const isEditing = editingHopIndex === index
          return (
            <li key={`${hop}-${index}`} className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <PlainTextInputEditor
                    value={editingHopText}
                    onChange={setEditingHopText}
                    className={`flex-1 ${inlineActionButtonClassName}`}
                  />
                  <button
                    type="button"
                    className={inlineActionButtonClassName}
                    onClick={() => {
                      const trimmed = editingHopText.trim()
                      if (!trimmed) return
                      setLastTraversal(prev =>
                        prev && prev.mode === 'graphRag'
                          ? ({
                              ...prev,
                              hops: prev.hops.map((value, i) => (i === index ? trimmed : value)),
                            } as TraversalSummary)
                          : prev,
                      )
                      setEditingHopIndex(null)
                      setEditingHopText('')
                    }}
                  >
                    {UI_LABELS.save}
                  </button>
                  <button
                    type="button"
                    className={inlineActionButtonClassName}
                    onClick={() => {
                      setEditingHopIndex(null)
                      setEditingHopText('')
                    }}
                  >
                    {UI_LABELS.cancel}
                  </button>
                </>
              ) : (
                <>
                  <span className={`${uiPanelMonospaceTextClass} break-words flex-1`}>{hop}</span>
                  <section className="flex items-center gap-1">
                    <button
                      type="button"
                      className={inlineActionButtonClassName}
                      onClick={() => {
                        setEditingHopIndex(index)
                        setEditingHopText(hop)
                      }}
                    >
                      {UI_LABELS.edit}
                    </button>
                    {index > 0 && (
                      <button
                        type="button"
                        className={inlineActionButtonClassName}
                        onClick={() =>
                          setLastTraversal(prev =>
                            prev && prev.mode === 'graphRag'
                              ? ({
                                  ...prev,
                                  hops: reorderList(prev.hops, index, index - 1),
                                } as TraversalSummary)
                              : prev,
                          )
                        }
                      >
                        ↑
                      </button>
                    )}
                    {index < lastTraversal.hops.length - 1 && (
                      <button
                        type="button"
                        className={inlineActionButtonClassName}
                        onClick={() =>
                          setLastTraversal(prev =>
                            prev && prev.mode === 'graphRag'
                              ? ({
                                  ...prev,
                                  hops: reorderList(prev.hops, index, index + 1),
                                } as TraversalSummary)
                              : prev,
                          )
                        }
                      >
                        ↓
                      </button>
                    )}
                    <button
                      type="button"
                      className={inlineActionButtonClassName}
                      onClick={() =>
                        setLastTraversal(prev =>
                          prev && prev.mode === 'graphRag'
                            ? ({
                                ...prev,
                                hops: prev.hops.filter((_, i) => i !== index),
                              } as TraversalSummary)
                            : prev,
                        )
                      }
                      aria-label={UI_COPY.orchestratorTraversalRemoveHopAriaLabel}
                    >
                      <Eraser className="w-3.5 h-3.5" />
                    </button>
                  </section>
                </>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

interface MultiHopListEditorProps {
  lastTraversal: GraphRagTraversalSummary
  editPaths: OrchestratorTraversalPathEditState
  setLastTraversal: React.Dispatch<React.SetStateAction<TraversalSummary | null>>
}

export function MultiHopListEditor({
  lastTraversal,
  editPaths,
  setLastTraversal,
}: MultiHopListEditorProps) {
  const {
    editingMultiHopIndex,
    setEditingMultiHopIndex,
    editingMultiHopText,
    setEditingMultiHopText,
  } = editPaths
  const { panelTextClass, monospaceTextClass: uiPanelMonospaceTextClass } = usePanelTypography()
  return (
    <section className={panelTextClass}>
      <section className="flex items-center justify-between mb-[2px]">
        <span className="font-semibold">{UI_COPY.orchestratorTraversalMultiHopTitle}</span>
        <button
          type="button"
          className={`App-toolbar__btn ${uiToolbarButtonMutedClassName}`}
          onClick={() =>
            setLastTraversal(prev =>
              prev && prev.mode === 'graphRag'
                ? ({
                    ...prev,
                    multiHop: [],
                  } as TraversalSummary)
                : prev,
            )
          }
          aria-label={UI_COPY.orchestratorTraversalClearMultiHopAriaLabel}
        >
          <Eraser className="w-3.5 h-3.5" />
        </button>
      </section>
      <ol className="list-decimal ml-4 space-y-[2px]">
        {lastTraversal.multiHop.map((hop, index) => {
          const isEditing = editingMultiHopIndex === index
          return (
            <li key={`${hop}-${index}`} className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <PlainTextInputEditor
                    value={editingMultiHopText}
                    onChange={setEditingMultiHopText}
                    className={`flex-1 ${inlineActionButtonClassName}`}
                  />
                  <button
                    type="button"
                    className={inlineActionButtonClassName}
                    onClick={() => {
                      const trimmed = editingMultiHopText.trim()
                      if (!trimmed) return
                      setLastTraversal(prev =>
                        prev && prev.mode === 'graphRag'
                          ? ({
                              ...prev,
                              multiHop: prev.multiHop.map((value, i) => (i === index ? trimmed : value)),
                            } as TraversalSummary)
                          : prev,
                      )
                      setEditingMultiHopIndex(null)
                      setEditingMultiHopText('')
                    }}
                  >
                    {UI_LABELS.save}
                  </button>
                  <button
                    type="button"
                    className={inlineActionButtonClassName}
                    onClick={() => {
                      setEditingMultiHopIndex(null)
                      setEditingMultiHopText('')
                    }}
                  >
                    {UI_LABELS.cancel}
                  </button>
                </>
              ) : (
                <>
                  <span className={`${uiPanelMonospaceTextClass} break-words flex-1`}>{hop}</span>
                  <section className="flex items-center gap-1">
                    <button
                      type="button"
                      className={inlineActionButtonClassName}
                      onClick={() => {
                        setEditingMultiHopIndex(index)
                        setEditingMultiHopText(hop)
                      }}
                    >
                      {UI_LABELS.edit}
                    </button>
                    {index > 0 && (
                      <button
                        type="button"
                        className={inlineActionButtonClassName}
                        onClick={() =>
                          setLastTraversal(prev =>
                            prev && prev.mode === 'graphRag'
                              ? ({
                                  ...prev,
                                  multiHop: reorderList(prev.multiHop, index, index - 1),
                                } as TraversalSummary)
                              : prev,
                          )
                        }
                      >
                        ↑
                      </button>
                    )}
                    {index < lastTraversal.multiHop.length - 1 && (
                      <button
                        type="button"
                        className={inlineActionButtonClassName}
                        onClick={() =>
                          setLastTraversal(prev =>
                            prev && prev.mode === 'graphRag'
                              ? ({
                                  ...prev,
                                  multiHop: reorderList(prev.multiHop, index, index + 1),
                                } as TraversalSummary)
                              : prev,
                          )
                        }
                      >
                        ↓
                      </button>
                    )}
                    <button
                      type="button"
                      className={inlineActionButtonClassName}
                      onClick={() =>
                        setLastTraversal(prev =>
                          prev && prev.mode === 'graphRag'
                            ? ({
                                ...prev,
                                multiHop: prev.multiHop.filter((_, i) => i !== index),
                              } as TraversalSummary)
                            : prev,
                        )
                      }
                      aria-label={UI_COPY.orchestratorTraversalRemoveMultiHopAriaLabel}
                    >
                      <Eraser className="w-3.5 h-3.5" />
                    </button>
                  </section>
                </>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
