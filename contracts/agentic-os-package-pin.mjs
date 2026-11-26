const AGENTIC_OS_TARBALL = /^https:\/\/codeload\.github\.com\/huijoohwee\/agentic-os\/tar\.gz\/([0-9a-f]{40})$/u

export const readAgenticOsSourcePin = manifest => {
  const locations = ['dependencies', 'devDependencies']
  const pins = locations.flatMap(location => {
    const value = manifest?.[location]?.['agentic-os']
    return value === undefined ? [] : [{ location, value }]
  })
  if (pins.length !== 1) {
    throw new Error('Agentic OS must have exactly one package pin across dependencies and devDependencies')
  }
  const [{ location, value }] = pins
  const match = typeof value === 'string' ? AGENTIC_OS_TARBALL.exec(value) : null
  if (!match) throw new Error('Agentic OS package pin must be one immutable canonical codeload revision')
  return { location, value, revision: match[1] }
}
