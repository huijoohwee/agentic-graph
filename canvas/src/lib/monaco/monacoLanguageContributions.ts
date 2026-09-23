export const loadMonacoLanguageContribution = async (language: string): Promise<void> => {
  const normalized = String(language || '').trim().toLowerCase()
  if (normalized === 'python') {
    await import('monaco-editor/esm/vs/basic-languages/python/python.contribution')
    return
  }
  if (normalized === 'markdown') {
    await import('monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution')
    return
  }
  if (normalized === 'json') {
    await import('monaco-editor/esm/vs/language/json/monaco.contribution')
    return
  }
  if (normalized === 'sql') {
    await import('monaco-editor/esm/vs/basic-languages/sql/sql.contribution')
    return
  }
  if (normalized === 'yaml') {
    await import('monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution')
  }
}
