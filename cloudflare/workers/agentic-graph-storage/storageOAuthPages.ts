import { AGENTIC_OS_STORAGE_ROUTE_PATHS } from './contract'
import type { OAuthConfiguration } from './storageOAuthProviders'
import { storageAuthPageStyles } from './storageAuthPageStyles'

export const oauthPageHeaders = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" }
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
export const oauthLoginPage = (config: OAuthConfiguration, origin: string, returnTo: string, canLink: boolean): Response => {
  const providers = Object.keys(config.clients).map(provider => {
    const query = new URLSearchParams({ provider, return_origin: origin, return_to: returnTo })
    const label = provider === 'github' ? 'GitHub' : 'Google'
    return { label, href: `${AGENTIC_OS_STORAGE_ROUTE_PATHS.browserLogin}?${escape(query.toString())}` }
  })
  const buttons = providers.map(({ label, href }) => `<a class="kg-auth-action" href="${href}">Continue with ${label}</a>`).join('')
  const linking = canLink ? `<section class="kg-auth-linking" aria-labelledby="link-heading">
<h2 id="link-heading">Connect another sign-in method</h2><p class="kg-auth-note">Add a provider to your current account.</p>
<div class="kg-auth-providers">${providers.map(({ label, href }) => `<form method="post" action="${href}&amp;intent=link"><button class="kg-auth-action" type="submit">Connect ${label} to this account</button></form>`).join('')}</div></section>` : ''
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in to Agentic Graph</title><style>${storageAuthPageStyles}</style></head><body>
<main class="kg-auth" aria-labelledby="signin-heading"><div class="kg-auth-brand">
<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="m8 9 16 7-16 7V9Z"/><circle cx="8" cy="9" r="3"/><circle cx="24" cy="16" r="3"/><circle cx="8" cy="23" r="3"/></svg><span>airvio</span></div>
<h1 id="signin-heading">Sign in to Agentic Graph</h1><p class="kg-auth-intro">Continue to your workspace and sync your files.</p>
<nav class="kg-auth-providers" aria-label="Sign-in providers">${buttons}</nav>
<p class="kg-auth-note">Use an account connected to your workspace. <a href="${AGENTIC_OS_STORAGE_ROUTE_PATHS.browserPrivacy}">Privacy and storage</a></p>
${linking}<footer class="kg-auth-footer"><p class="kg-auth-note">Your local files remain available offline.</p>
<a class="kg-auth-return" href="${escape(returnTo)}">Return to local workspace</a></footer></main></body></html>`,
    { headers: { ...oauthPageHeaders, 'content-type': 'text/html; charset=utf-8' } })
}
export const oauthPrivacyPage = (method: string): Response => new Response(method === 'HEAD' ? null : `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Airvio sign-in privacy and storage</title><style>body{font:1rem system-ui;max-width:42rem;margin:2rem auto;padding:1rem;line-height:1.6}</style>
<h1>Sign-in privacy and storage</h1>
<p>Airvio uses GitHub or Google to verify your identity. GitHub sign-in requests public identity only; Google sign-in requests only OpenID identity. Signing in does not grant repository, email, or Drive access.</p>
<p>The storage service keeps a stable provider ID linked to your workspace account. Provider tokens are not saved; access tokens are used only during sign-in. Your provider handles its own authentication under its privacy policy.</p>
<p>A secure browser cookie identifies your storage session. Sessions expire within one hour. A separate five-minute cookie protects the sign-in flow. Signing out revokes the current storage session; it does not delete workspace files or unlink identities.</p>
<p>Files remain in this browser for offline use. Enabling cloud sync sends selected file content and paths to the workspace service on Cloudflare. Workspace membership controls access. Local and cloud copies do not automatically replace canonical Git-backed Markdown.</p>
<p>Sign-in rate limits store counters in fixed buckets derived from a keyed address hash, rather than raw addresses. Cloudflare also processes network requests under its own service policies. Expired session records and linked IDs may remain until the workspace operator removes them.</p>
<p>Contact your workspace owner to request account disconnection or deletion of cloud records. Use the application’s file controls for local copies; clearing browser data can remove offline files that have not been exported or synchronized.</p>
<p><a href="${AGENTIC_OS_STORAGE_ROUTE_PATHS.browserLogin}">Return to sign-in</a></p></html>`,
{ headers: { ...oauthPageHeaders, 'content-type': 'text/html; charset=utf-8' } })
