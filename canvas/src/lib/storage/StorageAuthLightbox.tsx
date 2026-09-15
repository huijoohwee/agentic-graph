import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Github, Globe, Network, X } from 'lucide-react'
import PreviewOverlay from '@/features/panels/views/preview-panel/ui/PreviewOverlay'
import { UI_THEME_TOKENS as theme } from '@/lib/ui/theme-tokens'
import { fetchWithTimeout, readResponseTextWithDeadline } from './agentic-graph-storage-client-transport'
import type { readAgenticGraphStorageBrowserSession, AgenticGraphStorageBrowserSessionState } from './agentic-graph-storage-browser-session'
import { AGENTIC_OS_STORAGE_ROUTE_PATHS as paths } from './agentic-graph-storage-route-paths'
import { clearOtherStorageAccountSelection, readAgenticGraphStorageWorkspaceOverride, selectAgenticGraphStorageWorkspace } from './agentic-graph-storage-workspace-selection'
import { writeWorkspaceCloudSyncEnabledSetting } from '@/lib/workspace/workspaceStoreSyncSettings'

type Provider = { id: 'github' | 'google'; label: string; href: string; method: 'GET' | 'POST'; linkHref?: string }
type Options = { mode: 'signin' | 'signup'; providers: Provider[]; privacyHref: string }
const actionClass = 'flex min-h-12 w-full items-center justify-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium '
  + theme.panel.border + ' ' + theme.button.hoverBg + ' ' + theme.focus.primaryRing
const linkClass = 'rounded underline underline-offset-4 ' + theme.focus.primaryRing

const loginHref = (raw: unknown, origin: string): string => {
  if (typeof raw !== 'string' || raw.length > 4096) throw new Error('Sign-in response is invalid.')
  const url = new URL(raw, origin)
  if (url.origin !== origin || url.pathname !== paths.browserLogin || url.username || url.password)
    throw new Error('Sign-in requires a same-origin endpoint.')
  return url.href
}
const parseOptions = (value: unknown, origin: string): Options => {
  if (!value || typeof value !== 'object') throw new Error('Sign-in response is invalid.')
  const data = value as Record<string, unknown>
  if (data.schema !== 'agentic-graph/storage-login-options/v1'
    || !['signin', 'signup'].includes(String(data.mode)) || data.privacyHref !== paths.browserPrivacy
    || !Array.isArray(data.providers) || !data.providers.length || data.providers.length > 2)
    throw new Error('Sign-in is unavailable on this server. Your local files remain available.')
  const providers = data.providers.map((value: unknown): Provider => {
    if (!value || typeof value !== 'object') throw new Error('Sign-in provider is invalid.')
    const provider = value as Record<string, unknown>
    if ((provider.id !== 'github' && provider.id !== 'google') || typeof provider.label !== 'string'
      || !provider.label || provider.label.length > 40 || (provider.method !== 'GET' && provider.method !== 'POST'))
      throw new Error('Sign-in provider is invalid.')
    const href = loginHref(provider.href, origin)
    if (new URL(href).searchParams.get('provider') !== provider.id) throw new Error('Sign-in provider is invalid.')
    return { id: provider.id, label: provider.label, method: provider.method, href,
      ...(provider.linkHref ? { linkHref: loginHref(provider.linkHref, origin) } : {}) }
  })
  if (new Set(providers.map(provider => provider.id)).size !== providers.length) throw new Error('Sign-in providers are duplicated.')
  return { mode: data.mode as Options['mode'], providers, privacyHref: paths.browserPrivacy }
}

function StorageAuthLightbox({ loginUrl, onClose, readSession }: { loginUrl: string; onClose: () => void; readSession: typeof readAgenticGraphStorageBrowserSession }) {
  const workspaceFieldId = React.useId()
  const [signup, setSignup] = React.useState(false)
  const [revision, setRevision] = React.useState(0)
  const [options, setOptions] = React.useState<Options | null>(null)
  const [session, setSession] = React.useState<AgenticGraphStorageBrowserSessionState | null>(null)
  const [workspaceId, setWorkspaceId] = React.useState('')
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    const controller = new AbortController()
    const deadline = setTimeout(() => controller.abort(new Error('Sign-in timed out. Try again.')), 10_000)
    let current = true
    setOptions(null); setSession(null); setError('')
    const load = async () => {
      const url = new URL(loginUrl)
      url.searchParams.set('format', 'json')
      if (signup) url.searchParams.set('intent', 'signup'); else url.searchParams.delete('intent')
      const [response, account] = await Promise.all([
        fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' }, signal: controller.signal }),
        readSession({ signal: controller.signal }),
      ])
      if (!response.ok) throw new Error('Sign-in is unavailable (' + response.status + '). Your local files remain available.')
      const text = await readResponseTextWithDeadline(response, { maxBytes: 16_384, timeoutMs: 5000, fatalUtf8: true })
      const providers = parseOptions(JSON.parse(text), url.origin)
      if (!current) return
      if (account.userId) clearOtherStorageAccountSelection(account.userId)
      const currentWorkspace = readAgenticGraphStorageWorkspaceOverride()
      setWorkspaceId(account.workspaces?.find(workspace => workspace.id === currentWorkspace)?.id || account.workspaces?.[0]?.id || '')
      setOptions(providers); setSession(account)
    }
    void load().catch(error => { if (current) setError(error instanceof Error ? error.message : 'Sign-in is unavailable.') })
      .finally(() => clearTimeout(deadline))
    return () => { current = false; clearTimeout(deadline); controller.abort() }
  }, [loginUrl, signup, revision, readSession])

  const authenticated = session?.status === 'authenticated' && !!session.userId
  const title = authenticated ? 'Your cloud workspace' : signup ? 'Create your Airvio account' : 'Sign in to Airvio'
  const continueToWorkspace = () => {
    try {
      if (!session?.userId || !session.workspaces?.some(workspace => workspace.id === workspaceId))
        throw new Error('Choose an available workspace.')
      selectAgenticGraphStorageWorkspace({ userId: session.userId, workspaceId })
      writeWorkspaceCloudSyncEnabledSetting(true)
      const returnTo = new URL(new URL(loginUrl).searchParams.get('return_to') || '/', window.location.origin)
      if (returnTo.origin !== window.location.origin) throw new Error('Workspace return path is invalid.')
      returnTo.searchParams.delete('kgAuth')
      window.location.assign(returnTo.pathname + returnTo.search + returnTo.hash)
    } catch (error) { setError(error instanceof Error ? error.message : 'Workspace selection could not be saved.') }
  }
  const signOut = async () => {
    setBusy(true); setError('')
    try {
      const response = await fetchWithTimeout({ fetchImpl: fetch, input: paths.browserLogout,
        init: { method: 'POST', credentials: 'same-origin' }, timeoutMs: 10_000 })
      if (!response.ok) throw new Error('Sign-out could not be verified. Try again.')
      clearOtherStorageAccountSelection('')
      writeWorkspaceCloudSyncEnabledSetting(false)
      setRevision(value => value + 1)
    } catch (error) { setError(error instanceof Error ? error.message : 'Sign-out is unavailable.') }
    finally { setBusy(false) }
  }
  return (
    <PreviewOverlay open onClose={onClose} modalLabel="Airvio account"
      panelClassName="!h-auto !max-h-[calc(100dvh-2rem)] !w-full !max-w-md overflow-y-auto !rounded-xl">
      <section className={'relative p-6 sm:p-8 ' + theme.text.primary} data-kg-storage-auth-lightbox="1">
        <button type="button" aria-label="Close sign-in" onClick={onClose}
          className={'absolute right-2 top-2 inline-flex h-12 w-12 items-center justify-center rounded-lg ' + theme.button.hoverBg + ' ' + theme.focus.primaryRing}>
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <header className="mb-7 pr-7">
          <p className="mb-4 flex items-center gap-2 text-sm font-semibold"><Network className="h-6 w-6" aria-hidden="true" />airvio</p>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className={'mt-2 text-sm leading-relaxed ' + theme.text.secondary}>
            {authenticated ? 'Choose where to sync your files. Your local copies stay available.'
              : signup ? 'Create a private workspace with your existing provider account.'
                : 'Continue to your workspace and sync your files.'}
          </p>
        </header>
        {error ? <section className="mb-5 space-y-3"><p role="alert" className="text-sm">{error}</p>
          <button type="button" className={actionClass} onClick={() => setRevision(value => value + 1)}>Try again</button>
          <a className={linkClass + ' text-sm'} href={loginUrl}>Open sign-in page</a>
        </section> : null}
        {!options && !error ? <p role="status" className={'py-5 text-sm ' + theme.text.secondary}>Loading sign-in options…</p> : null}
        {options && authenticated ? (
          <section className="space-y-4">
            {session.workspaces?.length ? <>
              <section className="space-y-2 text-sm"><label className="block" htmlFor={workspaceFieldId}>Cloud workspace</label>
                <select id={workspaceFieldId} className={'min-h-12 w-full rounded-lg border px-3 ' + theme.panel.bg + ' ' + theme.panel.border + ' ' + theme.focus.primaryRing}
                  value={workspaceId} onChange={event => setWorkspaceId(event.currentTarget.value)}>
                  {session.workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.title || workspace.id}</option>)}
                </select>
              </section>
              <button type="button" className={actionClass + ' ' + theme.button.primarySolid} onClick={continueToWorkspace}>Continue to workspace</button>
            </> : <p role="status" className="text-sm">This account has no workspace available for sync. Ask the workspace owner for access.</p>}
            <details className="text-sm">
              <summary className={'cursor-pointer rounded py-2 ' + theme.focus.primaryRing}>Connect another sign-in method</summary>
              <section className="mt-3 space-y-3" aria-label="Connect sign-in provider">
                {options.providers.filter(provider => provider.linkHref).map(provider =>
                  <form key={provider.id} method="post" action={provider.linkHref}>
                    <button type="submit" className={actionClass}>Connect {provider.label} to this account</button>
                  </form>)}
              </section>
            </details>
            <button type="button" className={linkClass + ' text-sm'} disabled={busy} onClick={() => void signOut()}>
              {busy ? 'Signing out…' : 'Sign out'}
            </button>
          </section>
        ) : options ? (
          <section className="space-y-5">
            <nav className="space-y-3" aria-label={signup ? 'Create account with a provider' : 'Sign-in providers'}>
              {options.providers.map(provider => {
                const content = <>{provider.id === 'github' ? <Github className="h-5 w-5" aria-hidden="true" /> : <Globe className="h-5 w-5" aria-hidden="true" />}Continue with {provider.label}</>
                return provider.method === 'POST'
                  ? <form key={provider.id} method="post" action={provider.href}><button type="submit" className={actionClass}>{content}</button></form>
                  : <a key={provider.id} className={actionClass} href={provider.href}>{content}</a>
              })}
            </nav>
            <p className={'text-xs leading-relaxed ' + theme.text.secondary}>
              {signup ? 'Shared workspaces still require an invitation. ' : 'Use an account connected to your workspace. '}
              <a className={linkClass} href={options.privacyHref}>Privacy and storage</a>
            </p>
            <button type="button" className={linkClass + ' text-sm'} onClick={() => setSignup(value => !value)}>
              {signup ? 'Already have an account? Sign in' : 'New to Airvio? Create an account'}
            </button>
          </section>
        ) : null}
        <footer className={'mt-7 border-t pt-5 text-center ' + theme.panel.border}>
          <p className={'mb-3 text-xs ' + theme.text.secondary}>Your files stay available offline.</p>
          <button type="button" className={linkClass + ' text-sm'} onClick={() => { writeWorkspaceCloudSyncEnabledSetting(false); onClose() }}>Continue locally</button>
        </footer>
      </section>
    </PreviewOverlay>
  )
}

let active: { root: Root; host: HTMLElement } | null = null
export const openStorageAuthLightbox = (loginUrl: string, readSession: typeof readAgenticGraphStorageBrowserSession): void => {
  const url = new URL(loginHref(loginUrl, window.location.origin))
  if (typeof HTMLDialogElement === 'undefined' || typeof HTMLDialogElement.prototype.showModal !== 'function') {
    window.location.assign(url.href)
    return
  }
  if (active) { active.host.querySelector<HTMLDialogElement>('dialog')?.focus(); return }
  const host = document.createElement('section')
  document.body.appendChild(host)
  const root = createRoot(host)
  active = { root, host }
  const close = () => {
    if (active?.root !== root) return
    active = null; root.unmount(); host.remove()
  }
  root.render(<StorageAuthLightbox loginUrl={url.href} onClose={close} readSession={readSession} />)
}
