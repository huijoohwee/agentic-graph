import type { GraphData } from '@/lib/graph/types'
export const buildGraphWithMediaNode = (): GraphData => ({
  type: 'Graph',
  nodes: [
    {
      id: 'n1',
      type: 'RichMediaPanel',
      label: 'Example media node',
      properties: {
        richMediaActiveTab: 'image',
        imageUrl: 'https://example.com/example.png',
      },
      metadata: {
        documentPath: 'doc.md',
        lineStart: 5,
        lineEnd: 7,
      },
    },
  ],
  edges: [],
})
export const buildGraphWithConflictingSeedanceAndRichMediaPanelNodes = (): GraphData => ({
  type: 'Graph',
  nodes: [
    {
      id: 'byteplus-video-widget',
      type: 'VideoGeneration',
      label: 'ByteDance-Seedance-1.0-pro-fast BytePlus Video Widget',
      properties: {
        media_url: 'https://example.com/flower.mp4',
        videoUrl: 'https://example.com/flower.mp4',
      },
    },
    {
      id: 'rich-media-panel',
      type: 'RichMediaPanel',
      label: 'Rich Media Panel',
      properties: {
        media_url: '/__fetch_remote?url=https%3A%2F%2Fexample.com%2Fflower.mp4',
        videoUrl: '/__fetch_remote?url=https%3A%2F%2Fexample.com%2Fflower.mp4',
      },
    },
  ],
  edges: [],
})
export const buildGraphWithRichMediaPanelTextPreview = (): GraphData => ({
  type: 'Graph',
  nodes: [
    {
      id: 'rich-media-text-panel',
      type: 'RichMediaPanel',
      label: 'Rich Media Panel',
      properties: {
        richMediaActiveTab: 'text',
        output: '# Inline preview\n\nBody copy.',
        outputSrcDoc: '<!doctype html><html><body><h1>Inline preview</h1><p>Body copy.</p></body></html>',
      },
    },
  ],
  edges: [],
})
export const buildMarkdown = (): string =>
  [
    '# Title',
    '',
    'Paragraph before image.',
    '',
    '![Inline image](https://example.com/example.png)',
    '',
  ].join('\n')
export const readCommandMenuMediaRowName = (row: Element): string => {
  const input = row.querySelector('[data-kg-command-menu-media-name-input]') as HTMLInputElement | null
  const label = row.querySelector('[data-kg-command-menu-media-name-text]') as HTMLElement | null
  return String(input?.value || label?.textContent || row.textContent || '')
}
type InputHarnessWindow = Window & typeof globalThis
export const setInputValue = (window: InputHarnessWindow, input: HTMLInputElement, value: string) => {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
  descriptor?.set?.call(input, value)
  const InputEventCtor = (window as unknown as { InputEvent?: typeof InputEvent }).InputEvent
  input.dispatchEvent(InputEventCtor
    ? new InputEventCtor('input', { bubbles: true, inputType: 'insertText', data: value })
    : new window.Event('input', { bubbles: true }))
  input.dispatchEvent(new window.Event('change', { bubbles: true }))
}
