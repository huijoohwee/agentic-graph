const serviceWorkerPath = '/knowgrph/sw.js'

export const canonicalWorkerScriptUrl = (profileOrigin, sourceRevision) =>
  `${profileOrigin}${serviceWorkerPath}?revision=${sourceRevision}`

export const isAcceptedWorkerScriptUrl = ({
  scriptUrl,
  profileOrigin,
  expectedRevision,
  requireRevisionBoundRegistration,
}) => {
  if (scriptUrl === canonicalWorkerScriptUrl(profileOrigin, expectedRevision)) return true
  return !requireRevisionBoundRegistration && scriptUrl === `${profileOrigin}${serviceWorkerPath}`
}
