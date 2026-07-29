import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { VoiceStudioPanel } from '@/features/voice-studio/VoiceStudioPanel'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'

type MockTrack = MediaStreamTrack & {
  stopCalls: number
}

class MockVoiceMediaRecorder {
  static instances: MockVoiceMediaRecorder[] = []

  readonly stream: MediaStream
  readonly mimeType = 'audio/webm'
  state: RecordingState = 'inactive'
  ondataavailable: ((event: BlobEvent) => void) | null = null
  onstop: (() => void) | null = null
  startCalls = 0
  stopCalls = 0

  constructor(stream: MediaStream) {
    this.stream = stream
    MockVoiceMediaRecorder.instances.push(this)
  }

  start() {
    assert.equal(this.state, 'inactive')
    this.startCalls += 1
    this.state = 'recording'
  }

  stop() {
    this.stopCalls += 1
    if (this.state === 'inactive') throw new DOMException('recorder already inactive', 'InvalidStateError')
    this.state = 'inactive'
  }
}

class MockVoiceSpeechRecognition {
  static instances: MockVoiceSpeechRecognition[] = []
  static constructorCalls = 0
  static startCalls = 0
  static stopCalls = 0

  continuous = false
  interimResults = false
  lang = ''
  onresult: ((event: unknown) => void) | null = null
  onerror: (() => void) | null = null
  onend: (() => void) | null = null

  constructor() {
    MockVoiceSpeechRecognition.constructorCalls += 1
    MockVoiceSpeechRecognition.instances.push(this)
  }

  start() {
    MockVoiceSpeechRecognition.startCalls += 1
  }

  stop() {
    MockVoiceSpeechRecognition.stopCalls += 1
  }
}

const restoreProperty = (target: object, key: PropertyKey, descriptor?: PropertyDescriptor) => {
  if (descriptor) Object.defineProperty(target, key, descriptor)
  else Reflect.deleteProperty(target, key)
}

const installVoiceBrowserMocks = (win: Window) => {
  MockVoiceMediaRecorder.instances = []
  MockVoiceSpeechRecognition.constructorCalls = 0
  MockVoiceSpeechRecognition.instances = []
  MockVoiceSpeechRecognition.startCalls = 0
  MockVoiceSpeechRecognition.stopCalls = 0

  const tracks: MockTrack[] = []
  let getUserMediaCalls = 0
  const mediaDevices = {
    getUserMedia: async () => {
      getUserMediaCalls += 1
      const track = {
        stopCalls: 0,
        stop() {
          this.stopCalls += 1
        },
      } as MockTrack
      tracks.push(track)
      return {
        getTracks: () => [track],
      } as unknown as MediaStream
    },
  }

  const globalMediaRecorder = Object.getOwnPropertyDescriptor(globalThis, 'MediaRecorder')
  const globalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const windowMediaRecorder = Object.getOwnPropertyDescriptor(win, 'MediaRecorder')
  const windowRecognition = Object.getOwnPropertyDescriptor(win, 'SpeechRecognition')
  const navigatorMediaDevices = Object.getOwnPropertyDescriptor(win.navigator, 'mediaDevices')
  const createObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
  const revokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
  const objectUrls: string[] = []
  const revokedObjectUrls: string[] = []

  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: MockVoiceMediaRecorder as unknown as typeof MediaRecorder,
  })
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: win.navigator,
  })
  Object.defineProperty(win, 'MediaRecorder', {
    configurable: true,
    value: MockVoiceMediaRecorder as unknown as typeof MediaRecorder,
  })
  Object.defineProperty(win, 'SpeechRecognition', {
    configurable: true,
    value: MockVoiceSpeechRecognition,
  })
  Object.defineProperty(win.navigator, 'mediaDevices', {
    configurable: true,
    value: mediaDevices,
  })
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: () => {
      const next = `blob:voice-studio-${objectUrls.length + 1}`
      objectUrls.push(next)
      return next
    },
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: (value: string) => revokedObjectUrls.push(value),
  })

  return {
    tracks,
    objectUrls,
    revokedObjectUrls,
    getUserMediaCalls: () => getUserMediaCalls,
    restore: () => {
      restoreProperty(win.navigator, 'mediaDevices', navigatorMediaDevices)
      restoreProperty(win, 'SpeechRecognition', windowRecognition)
      restoreProperty(win, 'MediaRecorder', windowMediaRecorder)
      restoreProperty(globalThis, 'navigator', globalNavigator)
      restoreProperty(globalThis, 'MediaRecorder', globalMediaRecorder)
      restoreProperty(URL, 'revokeObjectURL', revokeObjectUrl)
      restoreProperty(URL, 'createObjectURL', createObjectUrl)
    },
  }
}

const findButton = (container: Element, label: string): HTMLButtonElement => {
  const button = [...container.querySelectorAll('button')]
    .find(candidate => candidate.textContent?.trim() === label)
  assert.ok(button, `expected ${label} button`)
  return button
}

const findControl = <T extends HTMLInputElement | HTMLTextAreaElement>(
  container: Element,
  labelText: string,
  selector: string,
): T => {
  const label = [...container.querySelectorAll('label')]
    .find(candidate => candidate.textContent?.includes(labelText))
  assert.ok(label, `expected ${labelText} label`)
  const control = label.querySelector<T>(selector)
  assert.ok(control, `expected ${labelText} control`)
  return control
}

const switchToDictate = async (container: Element) => {
  const tab = container.querySelector<HTMLButtonElement>('[data-kg-voice-operation="dictate"]')
  assert.ok(tab)
  await act(async () => Simulate.click(tab))
}

const fillRecordingEvidence = async (container: Element) => {
  const receipt = findControl<HTMLInputElement>(container, 'Recording-rights receipt ID', 'input')
  const notice = findControl<HTMLTextAreaElement>(container, 'Participant-notice evidence', 'textarea')
  const attestation = findControl<HTMLInputElement>(
    container,
    'I attest that recording rights and participant notice cover this capture.',
    'input[type="checkbox"]',
  )
  await act(async () => {
    receipt.value = 'rights-receipt-001'
    Simulate.change(receipt)
    notice.value = 'All participants received notice before recording.'
    Simulate.change(notice)
    attestation.checked = true
    Simulate.change(attestation)
  })
}

const clickAndFlush = async (button: HTMLButtonElement) => {
  await act(async () => {
    Simulate.click(button)
    await Promise.resolve()
    await Promise.resolve()
  })
}

export async function testVoiceStudioPanelRequiresRecordingEvidenceAndRecognitionOptIn() {
  const { dom, restore } = initJsdomHarness()
  const browser = installVoiceBrowserMocks(dom.window as unknown as Window)
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)

  try {
    await mountReactRoot(root, <VoiceStudioPanel />)
    await switchToDictate(container)

    const start = findButton(container, 'Start')
    const receipt = findControl<HTMLInputElement>(container, 'Recording-rights receipt ID', 'input')
    const notice = findControl<HTMLTextAreaElement>(container, 'Participant-notice evidence', 'textarea')
    const attestation = findControl<HTMLInputElement>(
      container,
      'I attest that recording rights and participant notice cover this capture.',
      'input[type="checkbox"]',
    )
    const recognitionApproval = findControl<HTMLInputElement>(
      container,
      'I approve optional browser-managed speech-recognition egress for this capture.',
      'input[type="checkbox"]',
    )

    await clickAndFlush(start)
    assert.equal(browser.getUserMediaCalls(), 0)

    await act(async () => {
      receipt.value = 'rights-receipt-001'
      Simulate.change(receipt)
    })
    await clickAndFlush(start)
    assert.equal(browser.getUserMediaCalls(), 0)

    await act(async () => {
      notice.value = 'All participants received notice before recording.'
      Simulate.change(notice)
    })
    await clickAndFlush(start)
    assert.equal(browser.getUserMediaCalls(), 0)

    await act(async () => {
      attestation.checked = true
      Simulate.change(attestation)
    })
    assert.equal(recognitionApproval.checked, false)
    await clickAndFlush(start)

    assert.equal(browser.getUserMediaCalls(), 1)
    assert.equal(MockVoiceMediaRecorder.instances.length, 1)
    assert.equal(MockVoiceMediaRecorder.instances[0]?.startCalls, 1)
    assert.equal(MockVoiceSpeechRecognition.constructorCalls, 0)
    assert.equal(MockVoiceSpeechRecognition.startCalls, 0)

    const firstRecorder = MockVoiceMediaRecorder.instances[0]
    const completeFirstCapture = firstRecorder?.onstop
    firstRecorder?.ondataavailable?.({ data: new Blob(['voice']) } as BlobEvent)
    await clickAndFlush(findButton(container, 'Stop'))
    await act(async () => completeFirstCapture?.())
    assert.equal(firstRecorder?.stopCalls, 1)
    assert.equal(browser.tracks[0]?.stopCalls, 1)
    assert.deepEqual(browser.objectUrls, ['blob:voice-studio-1'])

    await act(async () => {
      recognitionApproval.checked = true
      Simulate.change(recognitionApproval)
    })
    await clickAndFlush(findButton(container, 'Start'))
    assert.equal(browser.getUserMediaCalls(), 2)
    assert.equal(MockVoiceSpeechRecognition.constructorCalls, 1)
    assert.equal(MockVoiceSpeechRecognition.startCalls, 1)
    assert.deepEqual(browser.revokedObjectUrls, ['blob:voice-studio-1'])

    const recognition = MockVoiceSpeechRecognition.instances[0]
    const lateRecognitionResult = recognition?.onresult
    const transcript = findControl<HTMLTextAreaElement>(container, 'Transcript', 'textarea')
    await act(async () => {
      recognitionApproval.checked = false
      Simulate.change(recognitionApproval)
    })
    assert.equal(MockVoiceSpeechRecognition.stopCalls, 1)
    assert.equal(recognition?.onresult, null)
    await act(async () => lateRecognitionResult?.({
      resultIndex: 0,
      results: [{ 0: { transcript: 'late private transcript' }, isFinal: true }],
    }))
    assert.equal(transcript.value, '')
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    browser.restore()
    restore()
  }
}

export async function testVoiceStudioPanelSwitchStopsOnceAndTabsAreAccessible() {
  const { dom, restore } = initJsdomHarness()
  const browser = installVoiceBrowserMocks(dom.window as unknown as Window)
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  let unmounted = false

  try {
    await mountReactRoot(root, <VoiceStudioPanel />)
    await switchToDictate(container)
    await fillRecordingEvidence(container)

    const tablist = container.querySelector('[role="tablist"]')
    const dictateTab = container.querySelector<HTMLButtonElement>('[data-kg-voice-operation="dictate"]')
    const createTab = container.querySelector<HTMLButtonElement>('[data-kg-voice-operation="create"]')
    const dictatePanel = container.querySelector('#kg-voice-panel-dictate')
    assert.ok(tablist)
    assert.ok(dictateTab)
    assert.ok(createTab)
    assert.ok(dictatePanel)
    assert.equal(container.querySelectorAll('[role="tab"]').length, 3)
    assert.equal(dictateTab.id, 'kg-voice-tab-dictate')
    assert.equal(dictateTab.getAttribute('aria-controls'), 'kg-voice-panel-dictate')
    assert.equal(dictateTab.getAttribute('aria-selected'), 'true')
    assert.equal(dictateTab.tabIndex, 0)
    assert.equal(createTab.tabIndex, -1)
    assert.equal(dictatePanel.getAttribute('role'), 'tabpanel')
    assert.equal(dictatePanel.getAttribute('aria-labelledby'), dictateTab.id)

    await clickAndFlush(findButton(container, 'Start'))
    const recorder = MockVoiceMediaRecorder.instances[0]
    const track = browser.tracks[0]
    assert.ok(recorder)
    assert.ok(track)
    assert.equal(recorder.state, 'recording')
    const lateOnStop = recorder.onstop

    let createFocusCalls = 0
    createTab.focus = () => {
      createFocusCalls += 1
    }
    await act(async () => {
      Simulate.keyDown(dictateTab, { key: 'ArrowRight' })
    })

    assert.equal(recorder.stopCalls, 1)
    assert.equal(recorder.state, 'inactive')
    assert.equal(track.stopCalls, 1)
    assert.equal(recorder.onstop, null)
    await act(async () => lateOnStop?.())
    assert.equal(browser.objectUrls.length, 0, 'a detached recorder callback must not create a capture URL')
    assert.equal(createFocusCalls, 1)
    assert.equal(createTab.getAttribute('aria-selected'), 'true')
    assert.equal(createTab.tabIndex, 0)
    const createPanel = container.querySelector('#kg-voice-panel-create')
    assert.ok(createPanel)
    assert.equal(createPanel.getAttribute('role'), 'tabpanel')
    assert.equal(createPanel.getAttribute('aria-labelledby'), createTab.id)

    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    unmounted = true
    assert.equal(recorder.stopCalls, 1, 'inactive unmount cleanup must not stop the recorder twice')
    assert.equal(track.stopCalls, 1, 'operation switching must release each microphone track once')
  } finally {
    if (!unmounted) await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    browser.restore()
    restore()
  }
}
