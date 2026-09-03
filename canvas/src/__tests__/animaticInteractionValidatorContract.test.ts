import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testAnimaticInteractionValidatorUsesMountedRuntimeCommand() {
  const text = readFileSync(resolve(process.cwd(), 'scripts', 'validate_animatic_timeline_interactions.py'), 'utf8')
  for (const snippet of [
    'window.agenticGraphWorkspaceCommand.applyMarkdownDocument',
    'Move CTA',
    'Resize CTA end',
    'Insert beat before Problem',
    'Delete Empty',
    'Delete is available only for empty beats',
    'Duplicate Proof',
    'Split Proof at the midpoint',
    'Merge Hook with next empty beat',
    'Merge Next is available only when the next beat is empty',
    'Remove Gap is available only when Hook has a positive leading gap',
    'read_runtime_command_state',
    'markdownDocumentText',
    'Hide Audio',
    'Mute Overlay',
    'Solo Clip',
    'assert_lane_controls_restore',
    'Move Audio up',
    'lane_order:',
    'assert_lane_order_restore',
    'assert_insert_before_compaction',
    'assert_delete_compaction',
    'assert_duplicate_compaction',
    'assert_split_midpoint',
    'assert_merge_next',
    'assert_remove_gap',
    'scrollLeft',
    'beatTexts',
    'page.mouse.down()',
    'page.mouse.up()',
    'timeline-editor',
  ]) {
    if (!text.includes(snippet)) {
      throw new Error(`expected animatic interaction validator to retain mounted runtime command snippet: ${snippet}`)
    }
  }
}
