const serviceWorkerPath = scopeSegment => `/${scopeSegment}/sw.js`

export const canonicalWorkerScriptUrl = (profileOrigin, sourceRevision, scopeSegment = 'agenticgraph') =>
  `${profileOrigin}${serviceWorkerPath(scopeSegment)}?revision=${sourceRevision}`

export const isAcceptedWorkerScriptUrl = ({
  scriptUrl,
  profileOrigin,
  expectedRevision,
  requireRevisionBoundRegistration,
  scopeSegment = 'agenticgraph',
}) => {
  if (scriptUrl === canonicalWorkerScriptUrl(profileOrigin, expectedRevision, scopeSegment)) return true
  return !requireRevisionBoundRegistration && scriptUrl === `${profileOrigin}${serviceWorkerPath(scopeSegment)}`
}
