const GENERATED_AGENT_HEADERS_START = '# BEGIN agentic-graph generated agent-ready headers'
const GENERATED_AGENT_HEADERS_END = '# END agentic-graph generated agent-ready headers'
const GENERATED_APP_SHELL_HEADERS_START = '# BEGIN agentic-graph generated app-shell cache headers'
const GENERATED_APP_SHELL_HEADERS_END = '# END agentic-graph generated app-shell cache headers'
const GENERATED_AGENT_HOMEPAGE_HEADERS_START = '# BEGIN agentic-graph generated homepage discovery headers'
const GENERATED_AGENT_HOMEPAGE_HEADERS_END = '# END agentic-graph generated homepage discovery headers'
const GENERATED_XR_RUNTIME_HEADERS_START = '# BEGIN agentic-graph generated XR runtime permissions headers'
const GENERATED_XR_RUNTIME_HEADERS_END = '# END agentic-graph generated XR runtime permissions headers'
const XR_RUNTIME_PERMISSIONS_POLICY = 'accelerometer=(self), autoplay=(self), camera=(self), clipboard-read=(), clipboard-write=(), display-capture=(self), geolocation=(), gyroscope=(self), magnetometer=(self), microphone=(self), payment=(), usb=(), xr-spatial-tracking=(self)'

const escapedBlock = marker => marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const replaceOrAppendBlock = (existing, start, end, block) => {
  const blockPattern = new RegExp(`${escapedBlock(start)}[\\s\\S]*?${escapedBlock(end)}`)
  if (blockPattern.test(existing)) return existing.replace(blockPattern, block)
  const trimmed = existing.endsWith('\n') ? existing.trimEnd() : existing
  return `${trimmed}\n\n${block}\n`
}

const stripLegacyProductNamespaceHeaderBlocks = existing => existing
  .replace(
    /# BEGIN (?:agenticGraph|agenticGraph) generated [^\n]+\n[\s\S]*?# END (?:agenticGraph|agenticGraph) generated [^\n]+\n?/g,
    '',
  )
  .split(/\n{2,}/)
  .filter(block => !/(^|\n)\/(?:content\/)?(?:agenticGraph|agenticGraph)(?:\/|\*|\s|$)/.test(block))
  .join('\n\n')
  .replace(/\n{3,}/g, '\n\n')
  .trimEnd()

export const buildAgentReadyHeaders = ({
  existing,
  artifacts,
  agentReadyHomepageLinkHeaderValue,
  productionRuntimeReadinessHeaderLines,
}) => {
  const staticArtifactBlock = [
    GENERATED_AGENT_HEADERS_START,
    ...Object.entries(artifacts).flatMap(([relativePath, artifact]) => [
      `/${relativePath}`,
      `  Content-Type: ${artifact.contentType}`,
      '  Cache-Control: public, max-age=3600',
    ]),
    GENERATED_AGENT_HEADERS_END,
  ].join('\n')
  const appShellHeaderBlock = [
    GENERATED_APP_SHELL_HEADERS_START,
    ...productionRuntimeReadinessHeaderLines,
    '/content/agentic-graph/index.html',
    '  Cache-Control: no-store, no-cache, no-transform, must-revalidate, max-age=0',
    '/content/agentic-graph/manifest.webmanifest',
    '  Cache-Control: no-store, no-cache, must-revalidate, max-age=0',
    '/content/agentic-graph/sw.js',
    '  Cache-Control: no-store, no-cache, must-revalidate, max-age=0',
    ...['/content/agentic-graph/agentic-graph-chat-stream-sw.js', '/agentic-graph/agentic-graph-chat-stream-sw.js', '/content/agentic-graph/agentic-graph-service-worker-revision.js', '/agentic-graph/agentic-graph-service-worker-revision.js'].flatMap(route => [route, '  Cache-Control: no-store, no-cache, must-revalidate, max-age=0']),
    '/agentic-graph',
    '  Cache-Control: no-store, no-cache, no-transform, must-revalidate, max-age=0',
    '/agentic-graph/',
    '  Cache-Control: no-store, no-cache, no-transform, must-revalidate, max-age=0',
    '/agentic-graph/index.html',
    '  Cache-Control: no-store, no-cache, no-transform, must-revalidate, max-age=0',
    '/agentic-graph/manifest.webmanifest',
    '  Cache-Control: no-store, no-cache, must-revalidate, max-age=0',
    '/agentic-graph/sw.js',
    '  Cache-Control: no-store, no-cache, must-revalidate, max-age=0',
    GENERATED_APP_SHELL_HEADERS_END,
  ].join('\n')
  const homepageHeaderBlock = [
    GENERATED_AGENT_HOMEPAGE_HEADERS_START,
    '/',
    `  Link: ${agentReadyHomepageLinkHeaderValue}`,
    GENERATED_AGENT_HOMEPAGE_HEADERS_END,
  ].join('\n')
  const xrRuntimeHeaderBlock = [
    GENERATED_XR_RUNTIME_HEADERS_START,
    ...['/agentic-graph/*', '/content/agentic-graph/*'].flatMap(route => [
      route,
      '  ! Permissions-Policy',
      `  Permissions-Policy: ${XR_RUNTIME_PERMISSIONS_POLICY}`,
    ]),
    GENERATED_XR_RUNTIME_HEADERS_END,
  ].join('\n')
  let next = stripLegacyProductNamespaceHeaderBlocks(existing).replace(
    /^\/content\/agentic-graph\/index\.html\n  Cache-Control: .*?\n(?:\n)?^\/agentic-graph\n  Cache-Control: .*?\n(?:\n)?^\/agentic-graph\/\n  Cache-Control: .*?\n(?:\n)?^\/agentic-graph\/index\.html\n  Cache-Control: .*?\n(?:\n)?/gm,
    '',
  ).replace(
    /^\/content\/agentic-graph\/manifest\.webmanifest\n  Cache-Control: .*?\n(?:\n)?^\/content\/agentic-graph\/sw\.js\n  Cache-Control: .*?\n(?:\n)?^\/agentic-graph\/manifest\.webmanifest\n  Cache-Control: .*?\n(?:\n)?^\/agentic-graph\/sw\.js\n  Cache-Control: .*?\n(?:\n)?/gm,
    '',
  )
  next = replaceOrAppendBlock(next, GENERATED_AGENT_HEADERS_START, GENERATED_AGENT_HEADERS_END, staticArtifactBlock)
  next = replaceOrAppendBlock(next, GENERATED_APP_SHELL_HEADERS_START, GENERATED_APP_SHELL_HEADERS_END, appShellHeaderBlock)
  next = replaceOrAppendBlock(next, GENERATED_XR_RUNTIME_HEADERS_START, GENERATED_XR_RUNTIME_HEADERS_END, xrRuntimeHeaderBlock)
  return replaceOrAppendBlock(next, GENERATED_AGENT_HOMEPAGE_HEADERS_START, GENERATED_AGENT_HOMEPAGE_HEADERS_END, homepageHeaderBlock)
}
