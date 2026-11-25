import type { SourceFile } from '@/hooks/store/types'

export const buildParsedSourceFile = (
  path: string,
  text: string,
  overrides: Partial<SourceFile> = {},
): SourceFile => ({
  id: `source:${path}`,
  name: path,
  text,
  enabled: true,
  status: 'parsed',
  parsedGraphRevision: 1,
  source: { kind: 'local', path },
  ...overrides,
})
