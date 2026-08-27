import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'

import type { StoryboardCardModel } from '@/components/StoryboardCanvas/storyboardModel'
import { StoryboardCardOutputEditSurface, StoryboardCardTextEditSurface } from '@/components/StoryboardWidgetCanvas/StoryboardCardTextEditSurface'
import { buildStoryboardCardTextModel } from '@/components/StoryboardWidgetCanvas/storyboardCardTextModel'
import type { GraphNodeCardTextFieldSpec } from '@/lib/cards/graphNodeCardFields'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { waitForFrames } from '@/tests/lib/reactRootHarness'

const buildProbeTreeCard = (): StoryboardCardModel => ({
  id: 'probe-option',
  title: 'Which evidence confirms the current facts?',
  summary: 'Which evidence confirms the current facts?',
  output: '',
  lane: 'Probe',
  lanePropertyKey: 'lane',
  typeLabel: 'Probe-Tree Card',
  indexLabel: 'P1',
  slugline: '',
  action: 'Verify a source-backed answer.',
  dialogue: '',
  prompt: '/agenticgraph.probe-tree',
  style: '',
  tags: ['probe-tree'],
  meta: [],
  invocationTokens: [],
  sourceModelLabel: '',
  sourcePromptLabel: '',
  href: '',
  media: null,
  references: [],
  order: 1,
  inputIndex: 0,
  candidateScore: 1,
  structural: false,
})

const buildProbeTreeTypeTwoCard = (): StoryboardCardModel => ({
  ...buildProbeTreeCard(),
  id: 'probe-option-type-2',
  probeTreeMultiSelect: {
    options: [
      { id: 'current-policy', label: 'Current policy source' },
      { id: 'system-record', label: 'Verified system-of-record fact' },
    ],
    allowOther: true,
  },
})

export async function testStoryboardProbeTreeOutputReplacesMediaSlotWithEditableViewer() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const card = buildProbeTreeCard()
  const textModel = buildStoryboardCardTextModel(card)
  const blankTextModel = buildStoryboardCardTextModel({ ...card, summary: '', output: '' })
  if (blankTextModel.primaryField.id !== 'summary' || blankTextModel.secondaryField?.id !== 'output' || !blankTextModel.secondaryEditable) {
    throw new Error(`expected a newly dropped Probe-Tree Type 1 layout to expose Summary and Output before text is authored, got ${JSON.stringify(blankTextModel)}`)
  }
  const commits: Array<{ field: GraphNodeCardTextFieldSpec; value: string }> = []
  try {
    await act(async () => {
      root.render(
        <section className="grid grid-cols-2">
          <StoryboardCardTextEditSurface
            card={card}
            textModel={textModel}
            projectedMediaAttachments={null}
            storyboardCommandContextText=""
            onActivate={() => void 0}
            onCommitLane={() => void 0}
            onCommitText={(_card, field, value) => commits.push({ field, value })}
            onCommitType={() => void 0}
            onMediaCommandSelect={() => void 0}
          />
          <StoryboardCardOutputEditSurface
            card={card}
            textModel={textModel}
            onActivate={() => void 0}
            onCommitText={(_card, field, value) => commits.push({ field, value })}
          />
        </section>,
      )
      await waitForFrames(dom.window, 4)
    })
    const summaryFrame = container.querySelector('[data-kg-storyboard-card-summary-scroll="1"]')
    const outputPane = container.querySelector('[data-kg-storyboard-card-output-pane="1"]')
    const outputDisplay = container.querySelector('[aria-label="Output for probe-option"][data-kg-card-inline-edit="1"]')
    if (summaryFrame?.getAttribute('data-kg-storyboard-card-active-text-field') !== 'summary' || !(outputPane instanceof dom.window.HTMLElement) || !(outputDisplay instanceof dom.window.HTMLElement)) {
      throw new Error(`expected Summary plus a dedicated right-hand Add output pane, html=${container.innerHTML}`)
    }
    await act(async () => {
      Simulate.pointerDown(outputDisplay)
      await waitForFrames(dom.window, 8)
    })
    const outputEditor = container.querySelector('[aria-label="Output for probe-option"][data-kg-card-inline-viewer-edit-surface="1"][contenteditable="true"]')
    const activeFrame = container.querySelector('[data-kg-storyboard-card-summary-scroll="1"]')
    const editors = container.querySelectorAll('[data-kg-card-inline-viewer-edit-surface="1"][contenteditable="true"]')
    if (!(outputEditor instanceof dom.window.HTMLElement) || editors.length !== 1) {
      throw new Error(`expected the right-hand Add output pane to reuse one Viewer editor, html=${container.innerHTML}`)
    }
    if (activeFrame?.getAttribute('data-kg-storyboard-card-active-text-field') !== 'summary' || outputPane.querySelector('[data-kg-storyboard-card-active-text-field="output"]') == null) {
      throw new Error(`expected Summary to remain visible while the replacement media pane owns Output editing, html=${container.innerHTML}`)
    }
    if (!container.querySelector('[aria-label="Summary for probe-option"]') || container.querySelector('[data-kg-storyboard-card-secondary-edit-trigger="1"]')) {
      throw new Error(`expected Summary to stay mounted with no compact duplicate Output trigger, html=${container.innerHTML}`)
    }
    await act(async () => {
      outputEditor.textContent = 'Source-backed answer.'
      Simulate.input(outputEditor)
      Simulate.keyDown(outputEditor, { key: 'Enter', metaKey: true })
      await waitForFrames(dom.window, 6)
    })
    const lastCommit = commits.at(-1)
    if (lastCommit?.field.id !== 'output' || lastCommit.value !== 'Source-backed answer.') {
      throw new Error(`expected the shared Viewer to mutate canonical Output, got ${JSON.stringify(lastCommit)}`)
    }
    if (!container.querySelector('[aria-label="Summary for probe-option"]') || !container.querySelector('[data-kg-storyboard-card-output-pane="1"]')) {
      throw new Error(`expected committed Output to retain the two-column Summary and Output layout, html=${container.innerHTML}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}

export async function testStoryboardProbeTreeTypeTwoCommitsNumberedMultiSelectAndOther() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const card = buildProbeTreeTypeTwoCard()
  const commits: Array<{ field: GraphNodeCardTextFieldSpec; value: string }> = []
  try {
    await act(async () => {
      root.render(
        <StoryboardCardTextEditSurface
          card={card}
          textModel={buildStoryboardCardTextModel(card)}
          projectedMediaAttachments={null}
          storyboardCommandContextText=""
          onActivate={() => void 0}
          onCommitLane={() => void 0}
          onCommitText={(_card, field, value) => commits.push({ field, value })}
          onCommitType={() => void 0}
          onMediaCommandSelect={() => void 0}
        />,
      )
      await waitForFrames(dom.window, 4)
    })
    const summary = container.querySelector('[data-kg-probe-tree-type="2"][aria-label="Summary for probe-option-type-2"]')
    const optionOne = container.querySelector('[aria-label="Select option 1 for probe-option-type-2"]')
    const optionTwo = container.querySelector('[aria-label="Select option 2 for probe-option-type-2"]')
    const otherInput = container.querySelector('[aria-label="Other response for probe-option-type-2"]')
    if (!(summary instanceof dom.window.HTMLElement)
      || !(optionOne instanceof dom.window.HTMLInputElement)
      || !(optionTwo instanceof dom.window.HTMLInputElement)
      || !(otherInput instanceof dom.window.HTMLInputElement)
      || !summary.textContent?.includes('1. Current policy source')
      || !summary.textContent?.includes('2. Verified system-of-record fact')
      || !summary.textContent?.includes('Other')) {
      throw new Error(`expected Probe-Tree Type 2 Summary to render numbered choices plus Other, html=${container.innerHTML}`)
    }
    await act(async () => {
      Simulate.change(optionOne)
      await waitForFrames(dom.window, 2)
      Simulate.change(optionTwo)
      await waitForFrames(dom.window, 2)
    })
    await act(async () => {
      otherInput.value = 'Regional regulator notice'
      Simulate.change(otherInput)
      await waitForFrames(dom.window, 2)
    })
    await act(async () => {
      Simulate.blur(otherInput)
      await waitForFrames(dom.window, 2)
    })
    const outputCommit = commits.filter(commit => commit.field.id === 'output').at(-1)
    if (outputCommit?.value !== [
      '1. Current policy source',
      '2. Verified system-of-record fact',
      'Other: Regional regulator notice',
    ].join('\n')) {
      throw new Error(`expected Type 2 controls to commit one canonical numbered Output, got ${JSON.stringify(commits)}`)
    }
  } finally {
    await act(async () => root.unmount())
    restore()
  }
}
