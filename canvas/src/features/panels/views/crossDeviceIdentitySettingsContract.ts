const CROSS_DEVICE_IDENTITY_SEARCH_INDEX = [
  'cross device identity gate runtime revision sha branch catalog digest sha-256 hydration refresh automatic attestation peer parity diagnostic json agent provider proof bounded live usage cost ownership handoff delegation all turns worker progressive agents single tools specialists sdk contract unverified',
].join(' ')

export const CROSS_DEVICE_IDENTITY_SETTINGS_ROW_COUNT = 20

export function matchesCrossDeviceIdentityQuery(query: string): boolean {
  const terms = query.split(/\s+/).map(term => term.trim()).filter(Boolean)
  return terms.length === 0 || terms.every(term => CROSS_DEVICE_IDENTITY_SEARCH_INDEX.includes(term))
}
