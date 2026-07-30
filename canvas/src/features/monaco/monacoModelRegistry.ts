import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api'

type ModelEntry = {
  uri: Monaco.Uri
  model: Monaco.editor.ITextModel
  refs: number
}

const modelsByUriString = new Map<string, ModelEntry>()

const normalizeUriString = (uri: Monaco.Uri) => uri.toString()

export type RegisteredTextModelSnapshot = {
  uri: string
  language: string
  value: string
}

export function readRegisteredTextModelSnapshots(): RegisteredTextModelSnapshot[] {
  return Array.from(modelsByUriString.entries()).map(([uri, entry]) => ({
    uri,
    language: entry.model.getLanguageId(),
    value: entry.model.getValue(),
  }))
}

export function replaceRegisteredTextModelValue(uri: string, value: string): boolean {
  const entry = modelsByUriString.get(String(uri || ''))
  if (!entry) return false
  entry.model.setValue(String(value || ''))
  return true
}

export function acquireTextModel(
  monaco: typeof import('monaco-editor/esm/vs/editor/editor.api'),
  args: {
    uri: Monaco.Uri
  language: string
  value: string
  },
): { model: Monaco.editor.ITextModel; release: () => void } {
  const key = normalizeUriString(args.uri)
  const existing = modelsByUriString.get(key)
  if (existing) {
    existing.refs += 1
    if (existing.model.getLanguageId() !== args.language) {
      monaco.editor.setModelLanguage(existing.model, args.language)
    }
    if (existing.model.getValue() !== args.value) {
      existing.model.setValue(args.value)
    }
    return {
      model: existing.model,
      release: () => releaseTextModel(monaco, existing.uri),
    }
  }

  const model = monaco.editor.createModel(args.value, args.language, args.uri)
  const entry: ModelEntry = { uri: args.uri, model, refs: 1 }
  modelsByUriString.set(key, entry)
  return {
    model,
    release: () => releaseTextModel(monaco, args.uri),
  }
}

export function releaseTextModel(
  _monaco: typeof import('monaco-editor/esm/vs/editor/editor.api'),
  uri: Monaco.Uri,
) {
  const key = normalizeUriString(uri)
  const existing = modelsByUriString.get(key)
  if (!existing) return
  existing.refs -= 1
  if (existing.refs > 0) return
  modelsByUriString.delete(key)
  existing.model.dispose()
}
