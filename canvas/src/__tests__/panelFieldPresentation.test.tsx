import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { PanelCode } from '@/features/panels/ui/PanelText'
import { HelpKtvCode, HelpKtvMutedText } from '@/features/panels/views/HelpKtvLayout'
import { useSchemaEditorUiClasses } from '@/features/schema-editor/useSchemaEditorUiClasses'
import React, { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { CanvasEditableKeyTypeValueRow } from '@/features/panels/ui/CanvasEditableKeyTypeValueRow'
import { KeyTypeValueHeader } from '@/features/panels/ui/canvasKeyTypeValueHeader'
import { PanelLabeledRangeField } from '@/features/panels/ui/PanelLabeledRangeField'
import { PanelInlineLabeledRangeRow } from '@/features/panels/ui/PanelInlineLabeledRangeRow'
import { PanelLabeledRangeCard } from '@/features/panels/ui/PanelLabeledRangeCard'
import { PanelField, PanelReadOnlyField, PanelTextInput, PanelSelect } from '@/lib/ui/panelFormControls'
import { TimelineTransportControls } from '@/components/timeline/TimelineTransportControls'
import { KTV_FIELD_GRID_CLASS_NAME, panelFieldDecorationClassName } from 'grph-shared/ui/keyTypeValueRows'

export async function testPanelFieldsShareOnePresentationAndKeepInteractions() {
  const { restore } = initJsdomHarness()
  const host = document.createElement('section'); document.body.append(host)
  const root = createRoot(host), previous = useGraphStore.getState()
  function SchemaCaption() {
    const ui = useSchemaEditorUiClasses()
    return <small data-schema-caption className={ui.uiPanelMicroLabelTextSizeClass}>Schema hint</small>
  }
  function Fields() {
    const [value, setValue] = useState(2)
    return <>
      <KeyTypeValueHeader />
      <PanelCode className="text-lg" data-role-code>revision-id</PanelCode>
      <HelpKtvCode className="text-lg" data-role-help-code>WASD</HelpKtvCode>
      <HelpKtvMutedText className="text-lg">Supporting help</HelpKtvMutedText>
      <SchemaCaption />
      {(['keyTypeValue', 'keyValue', 'keyIconValue', 'keyIconSliderInput'] as const).map(layout =>
        <CanvasEditableKeyTypeValueRow key={layout} layout={layout} keyNode={layout}
          className="grid-cols-2 gap-8 text-[9px] font-mono py-9" typeNode={<span>Type</span>} valueNode={<input aria-label={layout} defaultValue="value" />} />)}
      <PanelField label="Name" layout="compact" variant="micro" className="text-xs gap-4">
        <PanelTextInput className="text-[10px] font-mono" defaultValue="Local" />
      </PanelField>
      <PanelField label="Mode" variant="section"><PanelSelect defaultValue="local"><option value="local">Local</option></PanelSelect></PanelField>
      <PanelReadOnlyField label="Status" value="Ready" layout="block" />
      {[PanelLabeledRangeField, PanelInlineLabeledRangeRow, PanelLabeledRangeCard].map((Range, index) =>
        <Range key={index} label={`Range ${index}`} valueLabel={value} value={value} min={1} max={8} step={1} onChange={setValue} />)}
      <TimelineTransportControls ariaLabel="Playhead" currentLabel="00:00" max={8} value={value} step={1} playbackRate={1}
        playing={false} onPlaybackRateChange={() => {}} onTogglePlayback={() => {}} onValueChange={setValue} />
    </>
  }
  try {
    useGraphStore.setState({ uiPanelTextFontClass: 'font-serif', uiPanelKeyValueTextSizeClass: 'text-[15px]', uiPanelRowDensityDefaultClass: 'py-2', uiPanelMicroLabelTextSizeClass: 'text-xs', uiPanelMonospaceTextClass: 'font-mono text-xs' })
    await act(async () => root.render(<Fields />))
    for (const code of host.querySelectorAll('[data-role-code], [data-role-help-code]')) {
      assert.equal(code.tagName, 'CODE')
      assert(code.classList.contains('font-mono') && code.classList.contains('text-xs'), 'code uses its 12 px role inside a larger field')
      assert(!code.classList.contains('text-lg'), 'caller typography cannot replace the shared code role')
    }
    assert.equal(host.querySelector('[data-role-help-code]')?.textContent, 'WASD', 'help forwards semantic attributes')
    for (const caption of host.querySelectorAll('small')) assert(caption.classList.contains('font-serif') && caption.classList.contains('text-xs'), 'supporting help and schema hints share the caption role')
    const rows = Array.from(host.querySelectorAll<HTMLElement>('[data-panel-field-row]'))
    assert.equal(rows.length, 10)
    for (const row of rows) {
      assert(KTV_FIELD_GRID_CLASS_NAME.split(' ').every(token => row.classList.contains(token)), row.className)
      assert(row.classList.contains('font-serif') && row.classList.contains('text-[15px]') && row.classList.contains('py-2'))
      assert.equal(row.children.length, 3, 'every field preserves key/type/value columns')
      assert(!row.classList.contains('grid-cols-2') && !row.classList.contains('gap-8') && !row.classList.contains('py-9'))
    }
    for (const control of host.querySelectorAll('label input:not([type=range]), button[data-kg-select]')) {
      assert(control.classList.contains('text-[15px]') && control.classList.contains('font-serif'))
      assert(!control.classList.contains('text-[10px]') && !control.classList.contains('font-mono'))
    }
    const range = host.querySelector<HTMLInputElement>('input[type=range]')!
    assert.equal(host.querySelector(`label[for="${range.id}"]`)?.textContent, 'Range 0')
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(range, '5')
      range.dispatchEvent(new window.Event('change', { bubbles: true }))
      range.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
    assert(Array.from(host.querySelectorAll('output')).every(output => output.textContent === '5'), 'shared range handlers update each control')
    await act(async () => useGraphStore.setState({ uiPanelTextFontClass: 'font-sans', uiPanelKeyValueTextSizeClass: 'text-xs', uiPanelMonospaceTextClass: 'font-mono text-sm', uiPanelMicroLabelTextSizeClass: 'text-sm' }))
    assert([...host.querySelectorAll('small, [data-role-code], [data-role-help-code]')].every(el => el.classList.contains('text-sm')), 'mounted supporting roles follow their shared preferences')
    assert(rows.every(row => row.classList.contains('text-xs') && row.classList.contains('font-sans')), 'preferences update mounted fields')
    assert(host.querySelector('[data-kg-timeline-transport]')?.classList.contains('text-xs'), 'BottomPanel transport uses the same font owner')
  } finally {
    await act(async () => root.unmount())
    useGraphStore.setState({ uiPanelTextFontClass: previous.uiPanelTextFontClass, uiPanelKeyValueTextSizeClass: previous.uiPanelKeyValueTextSizeClass, uiPanelRowDensityDefaultClass: previous.uiPanelRowDensityDefaultClass, uiPanelMonospaceTextClass: previous.uiPanelMonospaceTextClass, uiPanelMicroLabelTextSizeClass: previous.uiPanelMicroLabelTextSizeClass })
    host.remove(); restore()
  }
}

export function testPanelFieldsForbidPresentationVariants() {
  const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')
  for (const file of ['CrossDeviceIdentitySettingsRows.tsx', 'CanvasEmbedSettingsRows.tsx', 'HelpShortcutsSection.tsx']) assert(!/<code(?:\s|>)/.test(read(`src/features/panels/views/${file}`)), `${file} must resolve code typography through PanelCode`)
  assert(!/useGraphStore/.test(read('src/features/schema-editor/useSchemaEditorUiClasses.ts')), 'schema typography delegates to the shared resolver')
  const contract = read('../grph-shared/src/ui/keyTypeValueRows.ts')
  for (const legacy of ['KTV_KEY_VALUE_GRID_CLASS_NAME', 'KTV_KEY_ICON_VALUE_GRID_CLASS_NAME', 'KTV_KEY_ICON_SLIDER_INPUT_GRID_CLASS_NAME']) assert(!contract.includes(legacy))
  assert.equal(panelFieldDecorationClassName('grid-cols-2 sm:grid-cols-4 gap-8 text-xs font-mono py-8 rounded border text-red-500'), 'rounded border text-red-500')
  for (const alias of ['PanelInlineLabeledRangeRow.tsx', 'PanelLabeledRangeCard.tsx', 'CollapsibleSubsection.tsx']) {
    const source = read(`src/features/panels/ui/${alias}`)
    assert(!/grid-cols-|gap-|text-(?:xs|sm|\[)|mt-|pt-/.test(source), `${alias} must remain a contract-only adapter`)
  }
  for (const shell of ['src/features/panels/ui/MainPanelBody.tsx', 'src/lib/toolbar/ToolbarToolMenu.impl.tsx', 'src/features/strybldr/StrybldrTimelineBottomPanel.tsx']) assert(read(shell).includes('usePanelTypography'))
  assert(read('src/features/graph-inspector/ui/GraphRecordInspector.tsx').includes('<CanvasEditableKeyTypeValueRow'))
  const controls = read('src/lib/ui/panelFormControls.tsx')
  assert(!controls.includes("layout === 'compact'"), 'old form variants cannot select a different layout')
  assert(controls.includes('KTV_FIELD_GRID_CLASS_NAME'))
  for (const stylesheet of ['TimelineTransportControls.css', 'TimelineTransportPlayer.css', 'TimelineTransportControlsMermaidGantt.css']) {
    const css = read(`src/components/timeline/${stylesheet}`)
    for (const block of css.matchAll(/[^{}]*(?:\.time\b|\.timeline-rate-button(?:-value)?\b)[^{}]*\{([^}]*)\}/g)) {
      assert(!/font-size:\s*[\d.]+px/.test(block[1]), 'transport field values must inherit panel typography')
    }
  }
}
