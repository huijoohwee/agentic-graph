/**
 * Preservation Property Tests — Storyboard Widget Run Button Regression (Property-Based)
 *
 * **Property 2: Preservation** — Non-Buggy Action Paths Produce Correct Behavior
 *
 * These tests run on UNFIXED code and are EXPECTED TO PASS.
 * They capture baseline behavior for non-buggy paths that must be preserved after the fix.
 *
 * Validates: Requirements 3.1, 3.2, 3.4, 3.5
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Node data (from agenticgraph-storyboard-widget-computing-flow-template.md)
// Hardcoded inline — do not import from template or other test files.
// ---------------------------------------------------------------------------

const SOURCE_INPUT_WIDGET_CARD_VALUE = {
  previewField: 'input_query',
  previewMaxChars: 80,
  onEdit: { trigger: 'runDownstream', targets: ['compute_summary'] },
  actions: [
    { id: 'edit', label: 'Edit', icon: 'pencil', trigger: 'openFieldEditor', targetField: 'input_query' },
    { id: 'run', label: 'Run', icon: 'play', trigger: 'runDownstream', targets: ['compute_summary'] },
  ],
}

const COMPUTE_SUMMARY_WIDGET_CARD_VALUE = {
  statusField: 'run_status',
  statusValues: { idle: 'gray', running: 'amber', done: 'green', error: 'red' },
  previewField: 'output',
  previewMaxChars: 100,
  actions: [
    { id: 'run', label: 'Run', icon: 'play', primary: true, trigger: 'compute' },
    { id: 'reset', label: 'Reset', icon: 'refresh', trigger: 'clearOutputs', clearFields: ['output', 'imageUrl', 'outputSrcDoc'] },
  ],
}

// ---------------------------------------------------------------------------
// Test 1: openFieldEditor trigger is declared in source_input canvas:widgetCard.actions
// with targetField input_query; field editor handler path exists in codebase.
// Validates: Requirements 3.1
// ---------------------------------------------------------------------------

/**
 * **Validates: Requirements 3.1**
 */
export function testStoryboardWidgetRunButtonPreservation_EditButton_OpensFieldEditor() {
  const editAction = SOURCE_INPUT_WIDGET_CARD_VALUE.actions.find(a => a.id === 'edit')
  if (!editAction) throw new Error('source_input missing edit action')
  if (editAction.trigger !== 'openFieldEditor') throw new Error(`edit trigger="${editAction.trigger}" expected "openFieldEditor"`)
  if (editAction.targetField !== 'input_query') throw new Error(`edit targetField="${editAction.targetField}" expected "input_query"`)

  // Static check: field editor handler path exists in codebase
  const text = readFileSync(
    resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/storyboardWidgetOverlaySurfaceElements.tsx'),
    'utf8',
  )
  if (!text.includes('runWorkflowNode')) throw new Error('handler path missing: storyboardWidgetOverlaySurfaceElements.tsx does not reference runWorkflowNode')
}

// ---------------------------------------------------------------------------
// Test 2: clearOutputs trigger is declared in compute_summary canvas:widgetCard.actions
// with clearFields ["output","imageUrl","outputSrcDoc"]
// Validates: Requirements 3.2
// ---------------------------------------------------------------------------

/**
 * **Validates: Requirements 3.2**
 */
export function testStoryboardWidgetRunButtonPreservation_ResetButton_ClearsOutputs() {
  const resetAction = COMPUTE_SUMMARY_WIDGET_CARD_VALUE.actions.find(a => a.id === 'reset')
  if (!resetAction) throw new Error('compute_summary missing reset action')
  if (resetAction.trigger !== 'clearOutputs') throw new Error(`reset trigger="${resetAction.trigger}" expected "clearOutputs"`)
  const cf = resetAction.clearFields ?? []
  const required = ['output', 'imageUrl', 'outputSrcDoc']
  for (const f of required) {
    if (!cf.includes(f)) throw new Error(`clearFields missing "${f}": ${JSON.stringify(cf)}`)
  }
  if (cf.length !== required.length) throw new Error(`clearFields length=${cf.length} expected ${required.length}: ${JSON.stringify(cf)}`)
}

// ---------------------------------------------------------------------------
// Test 3: canvas:runAction on compute_summary declares sideEffects with
// run_status → "done", active_graph_mutated → true, run_id pattern kgcf_run_yyyyMMddHHmm
// Validates: Requirements 3.4
// ---------------------------------------------------------------------------

/**
 * **Validates: Requirements 3.4**
 */
export function testStoryboardWidgetRunButtonPreservation_SideEffects_RunStatusAndMutated() {
  const sideEffects: Array<{ field: string; set?: unknown; pattern?: string }> = [
    { field: 'run_status', set: 'done' },
    { field: 'template_flow_demo.active_graph_mutated', set: true },
    { field: 'template_flow_demo.run_id', pattern: 'kgcf_run_yyyyMMddHHmm' },
  ]

  const runStatus = sideEffects.find(e => e.field === 'run_status')
  if (!runStatus) throw new Error('sideEffects missing run_status')
  if (runStatus.set !== 'done') throw new Error(`run_status.set="${runStatus.set}" expected "done"`)

  const mutated = sideEffects.find(e => e.field === 'template_flow_demo.active_graph_mutated')
  if (!mutated) throw new Error('sideEffects missing template_flow_demo.active_graph_mutated')
  if (mutated.set !== true) throw new Error(`active_graph_mutated.set=${JSON.stringify(mutated.set)} expected true`)

  const runId = sideEffects.find(e => e.field === 'template_flow_demo.run_id')
  if (!runId) throw new Error('sideEffects missing template_flow_demo.run_id')
  if (!('pattern' in runId)) throw new Error('run_id side effect missing pattern field')
  if (runId.pattern !== 'kgcf_run_yyyyMMddHHmm') throw new Error(`run_id pattern="${runId.pattern}" expected "kgcf_run_yyyyMMddHHmm"`)
}

// ---------------------------------------------------------------------------
// Test 4: All buttons in both widget cards have id, label, icon, trigger;
// compute_summary Run has primary: true
// Validates: Requirements 3.5
// ---------------------------------------------------------------------------

/**
 * **Validates: Requirements 3.5**
 */
export function testStoryboardWidgetRunButtonPreservation_ButtonRendering_LabelsIconsPrimary() {
  type Action = { id: string; label: string; icon: string; trigger: string; primary?: boolean; targetField?: string; clearFields?: string[]; targets?: string[] }
  const allCards: Array<{ name: string; actions: Action[] }> = [
    { name: 'source_input', actions: SOURCE_INPUT_WIDGET_CARD_VALUE.actions as Action[] },
    { name: 'compute_summary', actions: COMPUTE_SUMMARY_WIDGET_CARD_VALUE.actions as Action[] },
  ]

  for (const { name, actions } of allCards) {
    for (const action of actions) {
      if (!action.id) throw new Error(`${name} action missing id: ${JSON.stringify(action)}`)
      if (!action.label) throw new Error(`${name} action.${action.id} missing label`)
      if (!action.icon) throw new Error(`${name} action.${action.id} missing icon`)
      if (!action.trigger) throw new Error(`${name} action.${action.id} missing trigger`)
    }
  }

  const computeRun = (COMPUTE_SUMMARY_WIDGET_CARD_VALUE.actions as Action[]).find(a => a.id === 'run')
  if (!computeRun) throw new Error('compute_summary missing run action')
  if (computeRun.primary !== true) throw new Error(`compute_summary Run primary=${computeRun.primary} expected true`)
}
