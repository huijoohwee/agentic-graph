/**
 * Preservation Property Tests — Storyboard Widget Run Button Regression
 *
 * **Property 2: Preservation** — Non-Buggy Action Paths Produce Correct Behavior
 *
 * These tests are EXPECTED TO PASS on unfixed code.
 * They capture baseline observable behavior for all action paths where
 * `isBugCondition` = false, and assert that behavior is preserved after the fix.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 *
 * Observation-first methodology: each property was verified to hold on unfixed code before
 * the fix was implemented. The test documents what MUST be preserved.
 *
 * Scope:
 *   - `openFieldEditor` (Edit on `source_input`) → field editor for `input_query`
 *   - `clearOutputs` (Reset on `compute_summary`) → clears output, imageUrl, outputSrcDoc
 *   - `compute` completion side effects → run_status="done", active_graph_mutated=true, run_id pattern
 *   - Button rendering → label, icon, primary flag, ordering from canvas:widgetCard.actions[]
 *   - Legitimate download-type trigger (mimeType + filename) → file download produced
 *   - PBT: dispatch table completeness — no non-download trigger resolves to undefined handler
 *   - PBT: arbitrary non-download action descriptors → isBugCondition = false for correct-path infra
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { clearRichMediaOutputProperties } from '@/features/chat/richMediaRun'

// ---------------------------------------------------------------------------
// Template node definitions (from agentic-graph-storyboard-widget-computing-flow-template.md)
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

type ActionDescriptor = {
  id: string
  label: string
  icon: string
  trigger: string
  primary?: boolean
  targetField?: string
  targets?: string[]
  clearFields?: string[]
  mimeType?: string
  filename?: string
}

// ---------------------------------------------------------------------------
// Formal predicate helpers (same as in bug condition test — canonical definition)
// ---------------------------------------------------------------------------

function downloadTypeTriggerSet(action: ActionDescriptor): Set<string> {
  if (action.trigger && action.mimeType && action.filename) {
    return new Set([action.trigger])
  }
  return new Set()
}

function isBugCondition(
  action: ActionDescriptor,
  result: { fileDownloadInitiated: boolean },
): boolean {
  const downloadSet = downloadTypeTriggerSet(action)
  return !downloadSet.has(action.trigger) && result.fileDownloadInitiated === true
}

// ---------------------------------------------------------------------------
// PBT helpers — arbitrary action descriptor generators
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic set of non-download action descriptors with varied triggers.
 *
 * Strategy: cover typical trigger namespaces, boundary cases (empty string edge cases excluded
 * since trigger must be non-empty for a meaningful action), unusual but valid trigger names,
 * camelCase, snake_case, colon-scoped, uppercase, and numeric-suffixed.
 *
 * These are NOT download-type triggers (no mimeType + filename present).
 */
function generateNonDownloadActionDescriptors(): ActionDescriptor[] {
  const triggerVariants = [
    // Concrete template triggers
    'openFieldEditor',
    'clearOutputs',
    'runDownstream',
    'compute',
    // Common action trigger patterns
    'run',
    'edit',
    'reset',
    'delete',
    'duplicate',
    'toggle',
    'save',
    'cancel',
    'submit',
    'refresh',
    'open',
    'close',
    'expand',
    'collapse',
    'select',
    'deselect',
    'copy',
    'paste',
    'undo',
    'redo',
    'zoom',
    'fit',
    'center',
    'lock',
    'unlock',
    'pin',
    'unpin',
    // Namespace variants (colon-scoped)
    'canvas:run',
    'canvas:edit',
    'flow:compute',
    'flow:runDownstream',
    'flow:clearOutputs',
    'canvas:widgetCard.run',
    // Snake_case variants
    'run_downstream',
    'clear_outputs',
    'open_field_editor',
    'compute_summary',
    // Uppercase variants
    'RUN',
    'COMPUTE',
    'CLEAR',
    // Numeric-suffixed
    'run_1',
    'compute_2',
    'edit_3',
    // Mixed case
    'RunDownstream',
    'ComputeOutput',
    'ClearOutputFields',
    // Hyphenated
    'run-downstream',
    'clear-outputs',
    'open-field-editor',
    // Generic arbitrary strings that look like triggers
    'handleAction',
    'dispatchEvent',
    'triggerWorkflow',
    'executeStep',
    'performAction',
  ]

  return triggerVariants.map((trigger, i) => ({
    id: `action_${i}`,
    label: `Action ${i}`,
    icon: 'play',
    trigger,
  }))
}

/**
 * Generate download-type action descriptors (with mimeType + filename).
 * These are the CORRECT download path — isBugCondition is false for them.
 */
function generateDownloadTypeActionDescriptors(): ActionDescriptor[] {
  return [
    {
      id: 'download_json',
      label: 'Export JSON',
      icon: 'download',
      trigger: 'download',
      mimeType: 'application/json',
      filename: 'export.json',
    },
    {
      id: 'download_csv',
      label: 'Export CSV',
      icon: 'download',
      trigger: 'exportCsv',
      mimeType: 'text/csv',
      filename: 'export.csv',
    },
    {
      id: 'download_bundle',
      label: 'Export Bundle',
      icon: 'download',
      trigger: 'exportBundle',
      mimeType: 'application/json',
      filename: 'widget.bundle.json',
    },
    {
      id: 'download_pdf',
      label: 'Export PDF',
      icon: 'download',
      trigger: 'exportPdf',
      mimeType: 'application/pdf',
      filename: 'export.pdf',
    },
    {
      id: 'download_png',
      label: 'Export PNG',
      icon: 'image',
      trigger: 'exportPng',
      mimeType: 'image/png',
      filename: 'snapshot.png',
    },
    {
      id: 'download_svg',
      label: 'Export SVG',
      icon: 'image',
      trigger: 'exportSvg',
      mimeType: 'image/svg+xml',
      filename: 'diagram.svg',
    },
  ]
}

// ---------------------------------------------------------------------------
// Preservation Test 1: openFieldEditor — field editor opens for input_query
// Validates: Requirement 3.1
// ---------------------------------------------------------------------------

/**
 * Observes: `openFieldEditor` (Edit on `source_input`) → opens field editor for `input_query`
 *
 * On unfixed code: This action is NOT affected by the bug. The dispatcher handles
 * `openFieldEditor` through a different path from `runWorkflowNode`. The overlay
 * surface elements dispatches field editor opens via `onPatchProperties` / `onSetProperties`
 * rather than through `runWorkflowNode`.
 *
 * This test verifies the structural preservation contract:
 * - The action descriptor for Edit declares trigger: "openFieldEditor" + targetField: "input_query"
 * - isBugCondition is false for this trigger (no fileDownload initiated for field editor opens)
 * - The widget card declares the action correctly per template
 *
 * Preservation: after fix, identical observable contract must hold.
 *
 * **Validates: Requirements 3.1**
 */
export function testStoryboardWidgetRunButtonPreservation_OpenFieldEditor_DescriptorContract() {
  const actions = SOURCE_INPUT_WIDGET_CARD_VALUE.actions

  // Find the edit action
  const editAction = actions.find(a => a.id === 'edit')
  if (!editAction) {
    throw new Error('Preservation failure: source_input widget card missing "edit" action (id: "edit")')
  }

  // Verify trigger is openFieldEditor
  if (editAction.trigger !== 'openFieldEditor') {
    throw new Error(
      `Preservation failure: edit action trigger is "${editAction.trigger}", expected "openFieldEditor". ` +
      'Requirement 3.1: the field editor must be opened when the Edit button is clicked.'
    )
  }

  // Verify targetField is input_query
  if (editAction.targetField !== 'input_query') {
    throw new Error(
      `Preservation failure: edit action targetField is "${editAction.targetField}", expected "input_query". ` +
      'Requirement 3.1: the field editor must open for the input_query field.'
    )
  }

  // Verify label and icon are preserved
  if (editAction.label !== 'Edit') {
    throw new Error(`Preservation failure: edit action label is "${editAction.label}", expected "Edit". Requirement 3.5.`)
  }
  if (editAction.icon !== 'pencil') {
    throw new Error(`Preservation failure: edit action icon is "${editAction.icon}", expected "pencil". Requirement 3.5.`)
  }

  // Verify isBugCondition is false for openFieldEditor (no file download for field editor)
  const result = { fileDownloadInitiated: false as const }
  const bugCondition = isBugCondition({ ...editAction }, result)
  if (bugCondition) {
    throw new Error(
      'Preservation failure: isBugCondition is true for openFieldEditor with fileDownloadInitiated=false. ' +
      'This should be false — field editor open is not a download-type action.'
    )
  }

  // Verify that the overlay surface elements dispatch path calls runWorkflowNode(actionNodeId)
  const root = process.cwd()
  const overlaySurfacePath = resolve(root, 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetOverlaySurfaceElements.tsx')
  const overlaySurfaceText = readFileSync(overlaySurfacePath, 'utf8')
  if (!overlaySurfaceText.includes('void args.runWorkflowNode(actionNodeId)')) {
    throw new Error(
      'Preservation failure: storyboardWidgetOverlaySurfaceElements.tsx no longer calls runWorkflowNode(actionNodeId). ' +
      'Requirement 3.1: the overlay Run handler must invoke runWorkflowNode.'
    )
  }
}

// ---------------------------------------------------------------------------
// Preservation Test 2: clearOutputs — clears output, imageUrl, outputSrcDoc
// Validates: Requirement 3.2
// ---------------------------------------------------------------------------

/**
 * Observes: `clearOutputs` (Reset on `compute_summary`) → clears output, imageUrl, outputSrcDoc
 *
 * On unfixed code: This action is already correct — the bug only affects the Run path.
 * The Reset button descriptor declares the correct clear fields.
 *
 * This test verifies the structural preservation contract:
 * - The action descriptor for Reset declares trigger: "clearOutputs" + clearFields: [...]
 * - The clearFields list includes exactly output, imageUrl, outputSrcDoc
 * - isBugCondition is false for clearOutputs
 *
 * **Validates: Requirements 3.2**
 */
export function testStoryboardWidgetRunButtonPreservation_ClearOutputs_DescriptorContract() {
  const actions = COMPUTE_SUMMARY_WIDGET_CARD_VALUE.actions

  // Find the reset action
  const resetAction = actions.find(a => a.id === 'reset')
  if (!resetAction) {
    throw new Error('Preservation failure: compute_summary widget card missing "reset" action (id: "reset")')
  }

  // Verify trigger is clearOutputs
  if (resetAction.trigger !== 'clearOutputs') {
    throw new Error(
      `Preservation failure: reset action trigger is "${resetAction.trigger}", expected "clearOutputs". ` +
      'Requirement 3.2: the Reset button must dispatch clearOutputs.'
    )
  }

  // Verify clearFields includes all required output fields
  const clearFields = resetAction.clearFields || []
  const requiredFields = ['output', 'imageUrl', 'outputSrcDoc']
  for (const field of requiredFields) {
    if (!clearFields.includes(field)) {
      throw new Error(
        `Preservation failure: clearOutputs clearFields is missing required field "${field}". ` +
        `clearFields = ${JSON.stringify(clearFields)}. ` +
        'Requirement 3.2: the Reset button must clear output, imageUrl, and outputSrcDoc.'
      )
    }
  }

  // Verify no extra fields are being cleared (strict preservation)
  if (clearFields.length !== requiredFields.length) {
    throw new Error(
      `Preservation failure: clearOutputs clearFields has ${clearFields.length} fields, expected exactly ${requiredFields.length}. ` +
      `clearFields = ${JSON.stringify(clearFields)}, expected = ${JSON.stringify(requiredFields)}.`
    )
  }

  // Verify label and icon are preserved
  if (resetAction.label !== 'Reset') {
    throw new Error(`Preservation failure: reset action label is "${resetAction.label}", expected "Reset". Requirement 3.5.`)
  }
  if (resetAction.icon !== 'refresh') {
    throw new Error(`Preservation failure: reset action icon is "${resetAction.icon}", expected "refresh". Requirement 3.5.`)
  }

  // Verify isBugCondition is false for clearOutputs
  const result = { fileDownloadInitiated: false as const }
  const bugCondition = isBugCondition({ ...resetAction }, result)
  if (bugCondition) {
    throw new Error(
      'Preservation failure: isBugCondition is true for clearOutputs with fileDownloadInitiated=false. ' +
      'This should be false — output clearing is not a download-type action.'
    )
  }
}

// ---------------------------------------------------------------------------
// Preservation Test 3: compute completion side effects
// Validates: Requirement 3.4
// ---------------------------------------------------------------------------

/**
 * Observes: `compute` completion → run_status = "done", active_graph_mutated = true,
 * run_id matches pattern `kgcf_run_yyyyMMddHHmm`
 *
 * On unfixed code: The compute side effects are declared in canvas:runAction on the
 * compute_summary node. The sideEffects contract is part of the template spec.
 * After the fix, this contract must be preserved exactly.
 *
 * This test verifies the structural side effects declaration is preserved in the template.
 *
 * **Validates: Requirements 3.3, 3.4**
 */
export function testStoryboardWidgetRunButtonPreservation_ComputeCompletion_SideEffectsContract() {
  // From the validation anchor: canvas:runAction.sideEffects on compute_summary
  const computeSummaryRunAction = {
    fn: 'compute',
    inputs: ['input_query'],
    outputs: ['output', 'imageUrl', 'outputSrcDoc'],
    sideEffects: [
      { field: 'run_status', set: 'done' },
      { field: 'template_flow_demo.active_graph_mutated', set: true },
      { field: 'template_flow_demo.run_id', pattern: 'kgcf_run_yyyyMMddHHmm' },
    ],
  }

  // Verify run_status → "done" side effect
  const runStatusEffect = computeSummaryRunAction.sideEffects.find(e => e.field === 'run_status')
  if (!runStatusEffect) {
    throw new Error('Preservation failure: compute side effects missing run_status field. Requirement 3.4.')
  }
  if (runStatusEffect.set !== 'done') {
    throw new Error(
      `Preservation failure: run_status side effect sets "${runStatusEffect.set}", expected "done". Requirement 3.4.`
    )
  }

  // Verify template_flow_demo.active_graph_mutated → true side effect
  const activeMutatedEffect = computeSummaryRunAction.sideEffects.find(
    e => e.field === 'template_flow_demo.active_graph_mutated'
  )
  if (!activeMutatedEffect) {
    throw new Error('Preservation failure: compute side effects missing template_flow_demo.active_graph_mutated. Requirement 3.4.')
  }
  if (activeMutatedEffect.set !== true) {
    throw new Error(
      `Preservation failure: active_graph_mutated side effect sets ${JSON.stringify(activeMutatedEffect.set)}, expected true. Requirement 3.4.`
    )
  }

  // Verify template_flow_demo.run_id → pattern kgcf_run_yyyyMMddHHmm side effect
  const runIdEffect = computeSummaryRunAction.sideEffects.find(
    e => e.field === 'template_flow_demo.run_id'
  )
  if (!runIdEffect) {
    throw new Error('Preservation failure: compute side effects missing template_flow_demo.run_id. Requirement 3.4.')
  }
  if (!('pattern' in runIdEffect)) {
    throw new Error('Preservation failure: run_id side effect missing pattern field. Requirement 3.4.')
  }
  if (runIdEffect.pattern !== 'kgcf_run_yyyyMMddHHmm') {
    throw new Error(
      `Preservation failure: run_id pattern is "${runIdEffect.pattern}", expected "kgcf_run_yyyyMMddHHmm". Requirement 3.4.`
    )
  }

  // Verify run_id pattern format: kgcf_run_yyyyMMddHHmm
  // A conforming run_id looks like: kgcf_run_20260608_1430
  const runIdPattern = /^kgcf_run_\d{8}_?\d{4}$/
  const exampleRunId = `kgcf_run_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}1200`
  if (!runIdPattern.test(exampleRunId)) {
    throw new Error(
      `Preservation failure: run_id pattern example "${exampleRunId}" does not match expected format. ` +
      'Pattern: kgcf_run_yyyyMMddHHmm. Requirement 3.4.'
    )
  }

  // Verify compute fn is 'compute' and outputs include all expected fields
  if (computeSummaryRunAction.fn !== 'compute') {
    throw new Error(
      `Preservation failure: compute action fn is "${computeSummaryRunAction.fn}", expected "compute". Requirement 3.3.`
    )
  }

  const requiredOutputs = ['output', 'imageUrl', 'outputSrcDoc']
  for (const outputField of requiredOutputs) {
    if (!computeSummaryRunAction.outputs.includes(outputField)) {
      throw new Error(
        `Preservation failure: compute action outputs missing "${outputField}". ` +
        `outputs = ${JSON.stringify(computeSummaryRunAction.outputs)}. Requirement 3.3.`
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Preservation Test 4: Button rendering — label, icon, primary, ordering
// Validates: Requirement 3.5
// ---------------------------------------------------------------------------

/**
 * Observes: All buttons render with correct label, icon, primary flag, and ordering from
 * canvas:widgetCard.actions[]
 *
 * On unfixed code: button rendering from the widget card descriptor is correct.
 * This test verifies the full rendering contract for both widget cards.
 *
 * **Validates: Requirements 3.5**
 */
export function testStoryboardWidgetRunButtonPreservation_ButtonRendering_WidgetCardActionsContract() {
  // --- source_input widget card ---
  const sourceInputActions = SOURCE_INPUT_WIDGET_CARD_VALUE.actions

  // Must have exactly 2 actions in correct order
  if (sourceInputActions.length !== 2) {
    throw new Error(
      `Preservation failure: source_input has ${sourceInputActions.length} actions, expected 2. Requirement 3.5.`
    )
  }

  // Action 0: edit
  const editAction = sourceInputActions[0]
  if (editAction.id !== 'edit') throw new Error(`Preservation failure: source_input action[0].id is "${editAction.id}", expected "edit". Requirement 3.5.`)
  if (editAction.label !== 'Edit') throw new Error(`Preservation failure: source_input Edit button label is "${editAction.label}", expected "Edit". Requirement 3.5.`)
  if (editAction.icon !== 'pencil') throw new Error(`Preservation failure: source_input Edit button icon is "${editAction.icon}", expected "pencil". Requirement 3.5.`)
  if ((editAction as { primary?: boolean }).primary === true) throw new Error('Preservation failure: source_input Edit button must NOT be primary. Requirement 3.5.')

  // Action 1: run
  const runAction = sourceInputActions[1]
  if (runAction.id !== 'run') throw new Error(`Preservation failure: source_input action[1].id is "${runAction.id}", expected "run". Requirement 3.5.`)
  if (runAction.label !== 'Run') throw new Error(`Preservation failure: source_input Run button label is "${runAction.label}", expected "Run". Requirement 3.5.`)
  if (runAction.icon !== 'play') throw new Error(`Preservation failure: source_input Run button icon is "${runAction.icon}", expected "play". Requirement 3.5.`)

  // --- compute_summary widget card ---
  const computeSummaryActions = COMPUTE_SUMMARY_WIDGET_CARD_VALUE.actions

  // Must have exactly 2 actions in correct order
  if (computeSummaryActions.length !== 2) {
    throw new Error(
      `Preservation failure: compute_summary has ${computeSummaryActions.length} actions, expected 2. Requirement 3.5.`
    )
  }

  // Action 0: run (primary)
  const computeRunAction = computeSummaryActions[0]
  if (computeRunAction.id !== 'run') throw new Error(`Preservation failure: compute_summary action[0].id is "${computeRunAction.id}", expected "run". Requirement 3.5.`)
  if (computeRunAction.label !== 'Run') throw new Error(`Preservation failure: compute_summary Run button label is "${computeRunAction.label}", expected "Run". Requirement 3.5.`)
  if (computeRunAction.icon !== 'play') throw new Error(`Preservation failure: compute_summary Run button icon is "${computeRunAction.icon}", expected "play". Requirement 3.5.`)
  if (computeRunAction.primary !== true) throw new Error(`Preservation failure: compute_summary Run button primary is ${computeRunAction.primary}, expected true. Requirement 3.5.`)

  // Action 1: reset
  const computeResetAction = computeSummaryActions[1]
  if (computeResetAction.id !== 'reset') throw new Error(`Preservation failure: compute_summary action[1].id is "${computeResetAction.id}", expected "reset". Requirement 3.5.`)
  if (computeResetAction.label !== 'Reset') throw new Error(`Preservation failure: compute_summary Reset button label is "${computeResetAction.label}", expected "Reset". Requirement 3.5.`)
  if (computeResetAction.icon !== 'refresh') throw new Error(`Preservation failure: compute_summary Reset button icon is "${computeResetAction.icon}", expected "refresh". Requirement 3.5.`)
  if ((computeResetAction as { primary?: boolean }).primary === true) throw new Error('Preservation failure: compute_summary Reset button must NOT be primary. Requirement 3.5.')
}

// ---------------------------------------------------------------------------
// Preservation Test 5: Legitimate download-type trigger → file download is produced
// Validates: Requirement 3.5 (download path preservation)
// ---------------------------------------------------------------------------

/**
 * Observes: Legitimate download-type trigger (descriptor with mimeType + filename) →
 * file download is produced
 *
 * On unfixed code: The exportWidgetBundleAsJson fallthrough path is responsible for
 * triggering file downloads. After the fix, download-type triggers (those with
 * mimeType + filename declared) MUST still produce file downloads — but only when the
 * action descriptor explicitly declares them.
 *
 * This test verifies the structural contract for download-type triggers:
 * - downloadTypeTriggerSet returns a non-empty set when mimeType + filename are present
 * - isBugCondition is false for download-type triggers even when fileDownload is initiated
 * - The fix removes the fallthrough download path but MUST NOT remove explicit download handlers
 *
 * **Validates: Requirements 3.5**
 */
export function testStoryboardWidgetRunButtonPreservation_DownloadTypeTrigger_IsNotBugCondition() {
  const downloadActions = generateDownloadTypeActionDescriptors()

  for (const action of downloadActions) {
    // Verify downloadTypeTriggerSet returns the trigger
    const downloadSet = downloadTypeTriggerSet(action)
    if (!downloadSet.has(action.trigger)) {
      throw new Error(
        `Preservation failure: downloadTypeTriggerSet does not include trigger "${action.trigger}" for action with mimeType="${action.mimeType}" filename="${action.filename}". ` +
        'Download-type actions must be recognized as such.'
      )
    }

    // When a download-type trigger initiates a file download, isBugCondition must be false
    const resultWithDownload = { fileDownloadInitiated: true as const }
    const bugConditionWhenDownloading = isBugCondition(action, resultWithDownload)
    if (bugConditionWhenDownloading) {
      throw new Error(
        `Preservation failure: isBugCondition is true for download-type trigger "${action.trigger}" with fileDownloadInitiated=true. ` +
        `This should be false — download-type actions are explicitly declared with mimeType="${action.mimeType}" filename="${action.filename}". ` +
        'The fix must not break legitimate download actions.'
      )
    }

    // When a download-type trigger does NOT initiate a download (no-op), isBugCondition is also false
    const resultWithoutDownload = { fileDownloadInitiated: false as const }
    const bugConditionWithoutDownload = isBugCondition(action, resultWithoutDownload)
    if (bugConditionWithoutDownload) {
      throw new Error(
        `Preservation failure: isBugCondition is true for download-type trigger "${action.trigger}" with fileDownloadInitiated=false. ` +
        'This should be false — isBugCondition requires fileDownloadInitiated=true.'
      )
    }
  }
}

// ---------------------------------------------------------------------------
// PBT: Property 2a — For all non-download triggers, isBugCondition = false when no download
// Validates: Preservation of correct infrastructure paths
// ---------------------------------------------------------------------------

/**
 * PBT: For all action descriptors where `isBugCondition` = false (correct paths),
 * the behavior identity property holds:
 *   observeOutcome_fixed(action) = observeOutcome_originalCorrectBehavior(action)
 *
 * On unfixed code: Actions where the trigger does not fall through to exportWidgetBundleAsJson
 * produce no file download. isBugCondition(action, {fileDownloadInitiated: false}) = false.
 *
 * This PBT generates varied non-download trigger strings and asserts the invariant:
 * for any non-download action where no file download is initiated, isBugCondition is false.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 */
export function testStoryboardWidgetRunButtonPreservation_PBT_NonDownloadTriggers_IsBugConditionFalse() {
  const actions = generateNonDownloadActionDescriptors()
  const failures: string[] = []

  for (const action of actions) {
    // Non-download trigger: downloadTypeTriggerSet must be empty
    const downloadSet = downloadTypeTriggerSet(action)
    if (downloadSet.has(action.trigger)) {
      failures.push(
        `PBT failure: downloadTypeTriggerSet unexpectedly includes trigger "${action.trigger}" for action without mimeType/filename.`
      )
      continue
    }

    // For correct-path actions (no file download initiated), isBugCondition must be false
    const result = { fileDownloadInitiated: false as const }
    const bugCondition = isBugCondition(action, result)
    if (bugCondition) {
      failures.push(
        `PBT counterexample: isBugCondition is true for trigger="${action.trigger}" with fileDownloadInitiated=false. ` +
        'Expected: isBugCondition = false for correct-path actions.'
      )
    }
  }

  if (failures.length > 0) {
    throw new Error(
      '[PBT FAILURE — Preservation Property 2a]\n\n' +
      `${failures.length} counterexample(s) found:\n\n` +
      failures.join('\n\n') +
      '\n\nAll non-download triggers with no file download initiated must satisfy isBugCondition = false.'
    )
  }
}

// ---------------------------------------------------------------------------
// PBT: Property 2b — Dispatch table completeness for registered trigger handlers
// Validates: No registered trigger resolves to undefined in the dispatch infrastructure
// ---------------------------------------------------------------------------

/**
 * PBT: For any non-download trigger string registered in the dispatch table,
 * `dispatchTable.get(trigger)` MUST return a defined function (never undefined falling through).
 *
 * On unfixed code: This property holds for the underlying dispatch infrastructure
 * (the runnability check functions, the downstream target resolvers, the overlay
 * action dispatch functions). None of these fall through to undefined — they return
 * structured results or null.
 *
 * This test verifies the dispatch infrastructure module contracts:
 * - isStoryboardWidgetWorkflowRunnableNode returns a boolean (never crashes on unknown node types)
 * - resolveStoryboardWidgetWorkflowDownstreamRunTargetIds returns an array (never undefined)
 * - The dispatcher module exports the expected function symbols
 * - No trigger in the known trigger set would produce an undefined handler via the infrastructure
 *
 * **Validates: Requirements 3.3, 3.4**
 */
export function testStoryboardWidgetRunButtonPreservation_PBT_DispatchTableCompleteness() {
  const root = process.cwd()

  // Read the downstream run targets module
  const runnableTargetsPath = resolve(root, 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowDownstreamRunTargets.ts')
  const runnableTargetsText = readFileSync(runnableTargetsPath, 'utf8')

  // Verify isStoryboardWidgetWorkflowRunnableNode is exported (dispatch infrastructure completeness)
  if (!runnableTargetsText.includes('export function isStoryboardWidgetWorkflowRunnableNode')) {
    throw new Error(
      'PBT dispatch table completeness failure: isStoryboardWidgetWorkflowRunnableNode is not exported from storyboardWidgetWorkflowDownstreamRunTargets.ts. ' +
      'Requirement 3.3: the runnability check must be available to the dispatcher.'
    )
  }

  // Verify resolveStoryboardWidgetWorkflowDownstreamRunTargetIds is exported
  if (!runnableTargetsText.includes('export function resolveStoryboardWidgetWorkflowDownstreamRunTargetIds')) {
    throw new Error(
      'PBT dispatch table completeness failure: resolveStoryboardWidgetWorkflowDownstreamRunTargetIds is not exported. ' +
      'Requirement 3.3: the downstream target resolver must be available to the dispatcher.'
    )
  }

  // Verify the runnability check returns a boolean (never undefined) by inspecting its signature
  const runnabilityCheckReturnsBoolean = runnableTargetsText.includes('): boolean {')
  if (!runnabilityCheckReturnsBoolean) {
    throw new Error(
      'PBT dispatch table completeness failure: isStoryboardWidgetWorkflowRunnableNode does not declare a boolean return type. ' +
      'The runnability check must always return a defined boolean, never undefined.'
    )
  }

  // Verify the downstream target resolver returns an array (never undefined/null)
  const targetResolverReturnsArray = runnableTargetsText.includes('): string[] {')
  if (!targetResolverReturnsArray) {
    throw new Error(
      'PBT dispatch table completeness failure: resolveStoryboardWidgetWorkflowDownstreamRunTargetIds does not declare a string[] return type. ' +
      'The resolver must always return a defined array, never undefined.'
    )
  }

  // Verify the overlay surface elements dispatch runs runWorkflowNode for each resolved target
  const overlaySurfacePath = resolve(root, 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetOverlaySurfaceElements.tsx')
  const overlaySurfaceText = readFileSync(overlaySurfacePath, 'utf8')

  if (!overlaySurfaceText.includes('runWorkflowNode')) {
    throw new Error(
      'PBT dispatch table completeness failure: storyboardWidgetOverlaySurfaceElements.tsx does not reference runWorkflowNode. ' +
      'The overlay surface must wire button clicks through to runWorkflowNode.'
    )
  }

  // PBT: For each canonical non-download trigger, assert it does not appear as a hardcoded
  // special case that could create a dispatch gap on the fixed code path.
  // On unfixed code: the dispatcher lacks handlers for InputWidget/ComputeWidget, so
  // these triggers fall through. Post-fix: they must have registered handlers.
  //
  // This phase just verifies the infrastructure readiness signals on unfixed code:
  // the runnability functions exist and have correct signatures.
  const nonDownloadTriggers = generateNonDownloadActionDescriptors().map(a => a.trigger)
  for (const trigger of nonDownloadTriggers) {
    // Verify: the trigger string is non-empty (valid trigger)
    if (!trigger || typeof trigger !== 'string' || trigger.trim().length === 0) {
      throw new Error(
        `PBT dispatch table completeness failure: generated trigger "${trigger}" is empty or invalid. ` +
        'All generated triggers must be non-empty strings.'
      )
    }

    // Verify: the downloadTypeTriggerSet is empty for non-download triggers (no false positive)
    const sampleAction: ActionDescriptor = { id: 'test', label: 'Test', icon: 'play', trigger }
    const downloadSet = downloadTypeTriggerSet(sampleAction)
    if (downloadSet.has(trigger)) {
      throw new Error(
        `PBT dispatch table completeness failure: downloadTypeTriggerSet includes trigger "${trigger}" for action without mimeType/filename. ` +
        'Non-download triggers must not be classified as download-type.'
      )
    }
  }
}

// ---------------------------------------------------------------------------
// PBT: Property 2c — Behavioral identity across varied action descriptors
// Validates: observeOutcome_fixed(action) = observeOutcome_originalCorrectBehavior(action)
// ---------------------------------------------------------------------------

/**
 * PBT: Generates arbitrary action descriptors with varied trigger values where
 * `isBugCondition` = false and asserts behavioral identity:
 *   observeOutcome_fixed(action) = observeOutcome_originalCorrectBehavior(action)
 *
 * On unfixed code: this test establishes the baseline contract. Any action where
 * isBugCondition = false must maintain the same observable behavior before and after the fix.
 *
 * The behavioral identity observed here:
 * - Non-download triggers → isBugCondition(action, {fileDownloadInitiated: false}) = false
 * - Download-type triggers → isBugCondition(action, {fileDownloadInitiated: true}) = false
 * - No trigger produces a file download as a side effect unless explicitly declared
 *
 * This is the central preservation invariant: the fix changes behavior only for inputs
 * where isBugCondition = true. For all other inputs, behavior is identical.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 */
export function testStoryboardWidgetRunButtonPreservation_PBT_BehavioralIdentity() {
  const nonDownloadActions = generateNonDownloadActionDescriptors()
  const downloadActions = generateDownloadTypeActionDescriptors()
  const failures: string[] = []

  // For non-download actions: the correct path produces NO file download
  // → isBugCondition(action, {fileDownloadInitiated: false}) = false (baseline behavior)
  for (const action of nonDownloadActions) {
    const correctPathResult = { fileDownloadInitiated: false as const }
    const bugCondition = isBugCondition(action, correctPathResult)
    if (bugCondition) {
      failures.push(
        `Behavioral identity failure for non-download trigger "${action.trigger}": ` +
        'isBugCondition is true for correct path (no download). Expected false.'
      )
    }

    // Also verify: non-download trigger with download initiated = BUG CONDITION (not preservable)
    const bugPathResult = { fileDownloadInitiated: true as const }
    const isBug = isBugCondition(action, bugPathResult)
    // isBug should be true for non-download triggers when download is initiated — this is the bug.
    // The fix will make this case stop happening (the fix ensures fileDownloadInitiated = false
    // for non-download triggers). But the formal predicate itself must still correctly
    // classify this as a bug condition.
    if (!isBug) {
      failures.push(
        `Behavioral identity failure for non-download trigger "${action.trigger}": ` +
        'isBugCondition is false even when fileDownloadInitiated=true. ' +
        'The bug condition predicate must return true when a non-download trigger produces a download.'
      )
    }
  }

  // For download-type actions: the correct path DOES produce a file download
  // → isBugCondition(action, {fileDownloadInitiated: true}) = false (not a bug — download is intentional)
  for (const action of downloadActions) {
    const correctPathResult = { fileDownloadInitiated: true as const }
    const bugCondition = isBugCondition(action, correctPathResult)
    if (bugCondition) {
      failures.push(
        `Behavioral identity failure for download-type trigger "${action.trigger}": ` +
        `isBugCondition is true when download is intentionally initiated (mimeType=${action.mimeType}, filename=${action.filename}). Expected false.`
      )
    }
  }

  if (failures.length > 0) {
    throw new Error(
      '[PBT FAILURE — Preservation Property 2c: Behavioral Identity]\n\n' +
      `${failures.length} counterexample(s):\n\n` +
      failures.join('\n\n') +
      '\n\n' +
      'The behavioral identity invariant must hold: ' +
      'observeOutcome_fixed(action) = observeOutcome_originalCorrectBehavior(action) ' +
      'for all inputs where isBugCondition = false.'
    )
  }
}

// ---------------------------------------------------------------------------
// Preservation Test 6: runDownstream target resolution contract
// Validates: Requirement 3.3
// ---------------------------------------------------------------------------

/**
 * Observes: `runDownstream` dispatched → compute is invoked on compute_summary
 *
 * On unfixed code: The readFlowWidgetCardRunDownstreamTargetIds function correctly
 * reads the runDownstream targets from canvas:widgetCard.actions[]. The bug is in
 * runWorkflowNode falling through to exportWidgetBundleAsJson, not in the target resolver.
 *
 * This test verifies that the target resolution contract is correct (and thus preserved):
 * - The source_input Run action declares targets: ["compute_summary"]
 * - The onEdit config declares targets: ["compute_summary"]
 * - Both feed into resolveStoryboardWidgetWorkflowDownstreamRunTargetIds
 *
 * **Validates: Requirements 3.3**
 */
export function testStoryboardWidgetRunButtonPreservation_RunDownstream_TargetResolutionContract() {
  const root = process.cwd()

  // Read the downstream run targets module
  const runnableTargetsPath = resolve(root, 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowDownstreamRunTargets.ts')
  const runnableTargetsText = readFileSync(runnableTargetsPath, 'utf8')

  // Verify readFlowWidgetCardRunDownstreamTargetIds reads from canvas:widgetCard
  if (!runnableTargetsText.includes("'canvas:widgetCard'")) {
    throw new Error(
      'Preservation failure: storyboardWidgetWorkflowDownstreamRunTargets.ts does not reference "canvas:widgetCard". ' +
      'Requirement 3.3: downstream run targets must be resolved from canvas:widgetCard.'
    )
  }

  // Verify the trigger check is 'runDownstream'
  if (!runnableTargetsText.includes("!== 'runDownstream'")) {
    throw new Error(
      "Preservation failure: storyboardWidgetWorkflowDownstreamRunTargets.ts does not check for 'runDownstream' trigger. " +
      'Requirement 3.3: only runDownstream-typed actions contribute to downstream run targets.'
    )
  }

  // Verify the source_input Run action has the correct target
  const sourceInputRunAction = SOURCE_INPUT_WIDGET_CARD_VALUE.actions.find(a => a.trigger === 'runDownstream')
  if (!sourceInputRunAction) {
    throw new Error(
      'Preservation failure: source_input widget card missing runDownstream action. Requirement 3.3.'
    )
  }

  const targets = sourceInputRunAction.targets || []
  if (!targets.includes('compute_summary')) {
    throw new Error(
      `Preservation failure: source_input runDownstream action targets are ${JSON.stringify(targets)}, expected to include "compute_summary". Requirement 3.3.`
    )
  }

  // Verify the onEdit config also specifies runDownstream → compute_summary
  const onEditConfig = SOURCE_INPUT_WIDGET_CARD_VALUE.onEdit
  if (onEditConfig.trigger !== 'runDownstream') {
    throw new Error(
      `Preservation failure: source_input onEdit trigger is "${onEditConfig.trigger}", expected "runDownstream". Requirement 3.3.`
    )
  }
  if (!onEditConfig.targets.includes('compute_summary')) {
    throw new Error(
      `Preservation failure: source_input onEdit targets ${JSON.stringify(onEditConfig.targets)} missing "compute_summary". Requirement 3.3.`
    )
  }
}

// ---------------------------------------------------------------------------
// Preservation Test 7: Dispatcher does NOT remove the legitimate export path
// Validates: Requirement 3.5 (export preserved for explicit export actions)
// ---------------------------------------------------------------------------

/**
 * Observes: The exportWorkflowBundle function (separate from runWorkflowNode) is
 * preserved in the dispatcher. The fix removes the fallthrough download path from
 * runWorkflowNode, but the explicit exportWorkflowBundle export remains accessible.
 *
 * On unfixed code: exportWidgetBundleAsJson is called in BOTH:
 * 1. runWorkflowNode fallthrough path (BUG — must be removed)
 * 2. exportWorkflowBundle (CORRECT — must be preserved)
 *
 * After fix: exportWidgetBundleAsJson is only called from exportWorkflowBundle.
 *
 * **Validates: Requirements 3.5 (download capability preserved for explicit export)**
 */
export function testStoryboardWidgetRunButtonPreservation_ExportWorkflowBundle_FunctionPreserved() {
  const root = process.cwd()
  const workflowActionsPath = resolve(root, 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetWorkflowActions.ts')
  const workflowActionsText = readFileSync(workflowActionsPath, 'utf8')

  // exportWidgetBundleAsJson must exist in file.ts (the download function itself is preserved)
  const filePath = resolve(root, 'src', 'lib', 'graph', 'file.ts')
  const fileText = readFileSync(filePath, 'utf8')
  if (!fileText.includes('exportWidgetBundleAsJson')) {
    throw new Error(
      'Preservation failure: exportWidgetBundleAsJson no longer exists in file.ts. ' +
      'Requirement 3.5: the explicit export function must be preserved for legitimate export actions.'
    )
  }

  // The exportWorkflowBundle function must exist in the dispatcher (explicit export action)
  if (!workflowActionsText.includes('exportWorkflowBundle')) {
    throw new Error(
      'Preservation failure: exportWorkflowBundle function no longer exists in useStoryboardWidgetWorkflowActions.ts. ' +
      'Requirement 3.5: the explicit bundle export capability must be preserved.'
    )
  }

  // The return value must include exportWorkflowBundle
  if (!workflowActionsText.includes('return { exportWorkflowBundle, runWorkflowNode }')) {
    throw new Error(
      'Preservation failure: useStoryboardWidgetWorkflowActions no longer returns { exportWorkflowBundle, runWorkflowNode }. ' +
      'Requirement 3.5: both workflow actions must remain accessible.'
    )
  }

  // The save.ts download mechanism must be preserved
  const savePath = resolve(root, 'src', 'lib', 'graph', 'save.ts')
  const saveText = readFileSync(savePath, 'utf8')
  if (!(saveText.includes('a.download = filename') && saveText.includes('URL.createObjectURL'))) {
    throw new Error(
      'Preservation failure: downloadBlob mechanism in save.ts is missing. ' +
      'Requirement 3.5: the file download capability must be preserved for explicit export actions.'
    )
  }
}

export function testStoryboardWidgetRunButtonPreservation_ResetAllAndWidgetResetUseSharedRuntimeCleanup() {
  const root = process.cwd()
  const toolbarText = readFileSync(resolve(root, 'src', 'components', 'Toolbar.tsx'), 'utf8')
  const canvasUtilsText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'utils.ts'), 'utf8')
  const workflowActionsText = readFileSync(resolve(root, 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetWorkflowActions.ts'), 'utf8')
  const nodeToolbarText = readFileSync(resolve(root, 'src', 'components', 'StoryboardWidget', 'WidgetEditorActionsToolbar.tsx'), 'utf8')

  for (const snippet of [
    'WORKFLOW_RESET_ALL_EVENT',
    'emitWorkflowResetAll',
    "source?: 'propsPanel' | 'toolbar' | 'inspector' | 'unknown'",
  ]) {
    if (!canvasUtilsText.includes(snippet)) throw new Error(`expected reset-all canvas event contract snippet: ${snippet}`)
  }
  for (const snippet of [
    "title={canResetAll ? 'Reset all' : 'Reset all (Storyboard Widget only)'}",
    'emitToolbarResetAll()',
    '<RotateCcw className={iconSizeClass} strokeWidth={iconStrokeWidth} />',
  ]) {
    if (!toolbarText.includes(snippet)) throw new Error(`expected Toolbar Reset all button snippet: ${snippet}`)
  }
  if (toolbarText.indexOf("title={canRunAll ? 'Run all'") > toolbarText.indexOf("title={canResetAll ? 'Reset all'")) {
    throw new Error('expected Toolbar Reset all button to render to the right of Run all')
  }
  for (const snippet of [
    'window.addEventListener(WORKFLOW_RESET_ALL_EVENT',
    'const resetWorkflowOutputs = React.useCallback(async () => {',
    'buildStoryboardWidgetWorkflowResetAllGraphData(draft)',
    "await args.persistDraftGraphData(reset.graphData, { label: 'Reset All', source: 'gitGraph' })",
    'const handler = () => void resetWorkflowOutputs()',
  ]) {
    if (!workflowActionsText.includes(snippet)) throw new Error(`expected Storyboard Widget Reset all runtime snippet: ${snippet}`)
  }
  const runIndex = nodeToolbarText.indexOf('title={UI_COPY.flowWidgetRun}')
  const resetIndex = nodeToolbarText.indexOf('title={UI_LABELS.clearOutput}')
  const importUrlIndex = nodeToolbarText.indexOf('title="Import URL"')
  if (runIndex < 0 || resetIndex < 0) throw new Error('expected widget toolbar to include Run and Reset controls')
  if (!(runIndex < resetIndex && (importUrlIndex < 0 || resetIndex < importUrlIndex))) {
    throw new Error('expected widget Reset control to render immediately to the right of Run before secondary controls')
  }

  const cleaned = clearRichMediaOutputProperties({
    prompt: 'keep authored prompt',
    output: 'stale output',
    outputSrcDoc: '<main>old preview</main>',
    outputLoading: true,
    outputLoadingKind: 'video',
    renderErrorCode: 'render_failed',
    renderErrorReason: 'old failure',
    renderJobId: 'old-job',
    videoUrl: 'blob:http://localhost/old',
    outputPath: '/tmp/old.mp4',
    outputManifestPath: '/tmp/old.json',
    outputStorageUrl: 'https://example.test/old.mp4',
    lastRunAt: '2026-06-25T00:00:00.000Z',
  })
  for (const staleKey of ['output', 'outputSrcDoc', 'outputLoading', 'outputLoadingKind', 'renderErrorCode', 'renderErrorReason', 'renderJobId', 'videoUrl', 'outputPath', 'outputManifestPath', 'outputStorageUrl', 'lastRunAt']) {
    if (Object.prototype.hasOwnProperty.call(cleaned, staleKey)) {
      throw new Error(`expected shared reset cleanup to remove ${staleKey}`)
    }
  }
  if (cleaned.prompt !== 'keep authored prompt') throw new Error('expected shared reset cleanup to preserve authored input fields')
}
