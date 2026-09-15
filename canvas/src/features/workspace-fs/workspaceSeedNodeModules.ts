const importNodeModule = async <T>(specifier: string): Promise<T> => (await import(/* @vite-ignore */ specifier)) as T

export const importNodeFsPromises = (): Promise<typeof import('node:fs/promises')> => importNodeModule('node:fs/promises')
export const importNodePath = (): Promise<typeof import('node:path')> => importNodeModule('node:path')

export const importNativeDocsReader = () => importNodeModule<{
  readRuntimeDocsSources(args: { docsRoot: string }): Promise<Array<{ fileName: string; filePath: string; bytes: Uint8Array }>>
}>('../../../../scripts/runtime-docs-sources.mjs')
