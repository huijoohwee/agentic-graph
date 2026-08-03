const BUNDLER_NAME_HELPER_CALL = /(?:^|[^\w$.])([A-Za-z_$][\w$]*)\(\s*(?:async\s*)?\([^)]*\)\s*=>/g

export const createBrowserSafeFunctionSourceFromText = (functionSource) => {
  const source = String(functionSource || '').trim()
  const helperNames = new Set(['n', '__name'])
  for (const match of source.matchAll(BUNDLER_NAME_HELPER_CALL)) {
    const helperName = match[1]
    if (helperName === '__name' || helperName.length <= 2) helperNames.add(helperName)
  }
  const helperDeclarations = [...helperNames]
    .map((helperName) => `  const ${helperName} = (value) => value`)
    .join('\n')
  return `((...args) => {
${helperDeclarations}
  return (${source})(...args)
})`
}

export const createBrowserSafeFunctionSource = (fn) =>
  createBrowserSafeFunctionSourceFromText(Function.prototype.toString.call(fn))
