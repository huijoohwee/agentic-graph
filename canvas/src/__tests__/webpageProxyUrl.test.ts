import { buildWebpageProxyUrl } from '@/lib/url'
import { buildWebpageProxyRuntimePlan } from '@/lib/websites/webpageProxyRuntimePolicy'
import {
  buildWebpageSandboxCsp,
  stripWebpageInlineEventHandlers,
  stripWebpageRefreshMeta,
  stripWebpageScriptTags,
} from '@/lib/websites/webpageSandboxDoc'

export async function testBuildWebpageProxyUrlPreservesRequestedScriptPolicy() {
  const url = 'https://claude.ai/chat/6706219f-f8d2-418a-90a9-aae18de752a7'
  const proxied = buildWebpageProxyUrl(url, 'strip')
  if (!proxied.startsWith('/__webpage_proxy?')) {
    throw new Error(`expected webpage proxy path, got ${proxied}`)
  }
  if (!proxied.includes(`url=${encodeURIComponent(url)}`)) {
    throw new Error(`expected encoded url in proxied path, got ${proxied}`)
  }
  if (!proxied.includes('agentic_os_script_policy=strip')) {
    throw new Error(`expected strip policy in proxied path, got ${proxied}`)
  }
}

export async function testWebpageStripSanitizersRemoveActiveContent() {
  const raw = [
    '<!doctype html>',
    '<html><head>',
    '<meta http-equiv="refresh" content="0;url=https://claude.ai/login">',
    '<script type="module">window.__agentic_os_boot = true</script>',
    '<script src="https://s-cdn.anthropic.com/app.js" />',
    '</head>',
    '<body onload="boot()">',
    '<button onclick="launch()">Import</button>',
    '</body></html>',
  ].join('')

  const withoutRefresh = stripWebpageRefreshMeta(raw)
  if (/http-equiv\s*=\s*["']?refresh/i.test(withoutRefresh)) {
    throw new Error(`expected refresh meta stripped, got ${withoutRefresh}`)
  }

  const withoutScripts = stripWebpageScriptTags(withoutRefresh)
  if (/<script\b/i.test(withoutScripts)) {
    throw new Error(`expected script tags stripped, got ${withoutScripts}`)
  }

  const sanitized = stripWebpageInlineEventHandlers(withoutScripts)
  if (/\son[a-z]+\s*=/.test(sanitized)) {
    throw new Error(`expected inline event handlers stripped, got ${sanitized}`)
  }
  if (!sanitized.includes('<button>Import</button>')) {
    throw new Error(`expected safe markup retained, got ${sanitized}`)
  }
}

export async function testWebpageProxyStripRuntimePlanStaysPassive() {
  const stripPlan = buildWebpageProxyRuntimePlan('strip')
  if (stripPlan.effectiveScriptPolicy !== 'strip') {
    throw new Error(`expected strip runtime plan, got ${JSON.stringify(stripPlan)}`)
  }
  if (stripPlan.enableNetworkInterception || stripPlan.enableDynamicResourceRewrite) {
    throw new Error(`expected strip runtime plan to disable active hooks, got ${JSON.stringify(stripPlan)}`)
  }
  if (!stripPlan.injectStripCsp) {
    throw new Error(`expected strip runtime plan to inject CSP, got ${JSON.stringify(stripPlan)}`)
  }

  const allowPlan = buildWebpageProxyRuntimePlan('allow')
  if (allowPlan.enableNetworkInterception) {
    throw new Error(`expected allow runtime plan to avoid fetch/xhr interception, got ${JSON.stringify(allowPlan)}`)
  }
  if (!allowPlan.enableDynamicResourceRewrite) {
    throw new Error(`expected allow runtime plan to keep asset rewriting, got ${JSON.stringify(allowPlan)}`)
  }
}

export async function testWebpageSandboxStripCspBlocksRemoteScripts() {
  const csp = buildWebpageSandboxCsp('strip')
  if (!/default-src 'none'/.test(csp)) {
    throw new Error(`expected strip CSP to deny by default, got ${csp}`)
  }
  if (!/script-src 'unsafe-inline'/.test(csp)) {
    throw new Error(`expected strip CSP to keep inline helper script, got ${csp}`)
  }
  const scriptDirective = csp
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith('script-src '))
  if (!scriptDirective) {
    throw new Error(`expected strip CSP script-src directive, got ${csp}`)
  }
  if (/https?:|blob:|data:|'unsafe-eval'/.test(scriptDirective)) {
    throw new Error(`expected strip CSP to block remote script execution, got ${scriptDirective}`)
  }
}
