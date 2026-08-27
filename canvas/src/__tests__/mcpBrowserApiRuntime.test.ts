import path from 'node:path'
import { pathToFileURL } from 'node:url'

type BrowserApiRuntimeModule = {
  BROWSER_API_TOOL: { inputSchema: { properties: { operation: { enum: string[] } } } }
  callBrowserApiRuntime: (
    args: Record<string, unknown>,
    options?: { maxOutputChars?: number },
  ) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>
}

const importBrowserApiRuntime = async (): Promise<BrowserApiRuntimeModule> => {
  const runtimeUrl = pathToFileURL(path.resolve(process.cwd(), '..', 'mcp', 'browser-api-runtime.js')).href
  return await import(runtimeUrl) as BrowserApiRuntimeModule
}

const withMockedFetch = async <T,>(
  mockFetch: typeof fetch,
  run: () => Promise<T>,
): Promise<T> => {
  const globalWithFetch = globalThis as typeof globalThis & { fetch?: typeof fetch }
  const previousFetch = globalWithFetch.fetch
  globalWithFetch.fetch = mockFetch
  try {
    return await run()
  } finally {
    if (previousFetch) {
      globalWithFetch.fetch = previousFetch
    } else {
      delete globalWithFetch.fetch
    }
  }
}

export async function testAgenticGraphMcpBrowserBridgeBlocksRemoteRuntimeByDefault() {
  let fetchCalled = false
  await withMockedFetch((async () => {
    fetchCalled = true
    throw new Error('fetch should not run for rejected remote runtime URLs')
  }) as typeof fetch, async () => {
    const runtime = await importBrowserApiRuntime()
    let message = ''
    try {
      await runtime.callBrowserApiRuntime({
        operation: 'health',
        runtimeUrl: 'https://remote-runtime.invalid',
      })
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    if (!message.includes('loopback')) {
      throw new Error(`expected remote runtime URL rejection to mention loopback policy, got ${JSON.stringify(message)}`)
    }
  })
  if (fetchCalled) {
    throw new Error('expected remote runtime URL rejection before fetch')
  }
}

export async function testAgenticGraphMcpBrowserBridgeRejectsUnsafeBrowserTargetUrlsBeforeFetch() {
  let fetchCalled = false
  await withMockedFetch((async () => {
    fetchCalled = true
    throw new Error('fetch should not run for rejected browser target URLs')
  }) as typeof fetch, async () => {
    const runtime = await importBrowserApiRuntime()
    const cases: Array<{ args: Record<string, unknown>; expected: string }> = [
      {
        args: {
          operation: 'go',
          targetUrl: 'javascript:alert(1)',
          dryRun: false,
          confirmUnsafe: true,
        },
        expected: 'http or https',
      },
      {
        args: {
          operation: 'markdown',
          payload: { url: 'file:///etc/passwd' },
        },
        expected: 'http or https',
      },
      {
        args: {
          operation: 'resolve',
          targetUrl: 'https://user:pass@example.com/account',
        },
        expected: 'embedded credentials',
      },
    ]

    for (const testCase of cases) {
      let message = ''
      try {
        await runtime.callBrowserApiRuntime(testCase.args)
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }
      if (!message.includes(testCase.expected)) {
        throw new Error(`expected browser target URL policy message to include ${JSON.stringify(testCase.expected)}, got ${JSON.stringify(message)}`)
      }
    }
  })
  if (fetchCalled) {
    throw new Error('expected rejected browser target URLs to fail before fetch')
  }
}

export async function testAgenticGraphMcpBrowserBridgeRequiresCookieImportConfirmation() {
  const runtime = await importBrowserApiRuntime()
  if (!runtime.BROWSER_API_TOOL.inputSchema.properties.operation.enum.includes('cookieImport')) {
    throw new Error(`expected browser bridge operations to include cookieImport, got ${JSON.stringify(runtime.BROWSER_API_TOOL.inputSchema.properties.operation.enum)}`)
  }

  let fetchCalls = 0
  await withMockedFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls += 1
    const endpoint = String(input)
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
    if (!endpoint.endsWith('/v1/auth/steal')) {
      throw new Error(`expected cookieImport to target auth cookie import endpoint, got ${endpoint}`)
    }
    if (body.confirm_cookie_import !== true || body.confirm_unsafe !== true || body.confirm_third_party_terms !== true) {
      throw new Error(`expected cookieImport to send explicit confirmation flags, got ${JSON.stringify(body)}`)
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ ok: true }),
    } as Response
  }) as typeof fetch, async () => {
    let missingConfirmationMessage = ''
    try {
      await runtime.callBrowserApiRuntime({
        operation: 'cookieImport',
        dryRun: false,
        confirmUnsafe: true,
        confirmThirdPartyTerms: true,
      })
    } catch (error) {
      missingConfirmationMessage = error instanceof Error ? error.message : String(error)
    }
    if (!missingConfirmationMessage.includes('confirmCookieImport=true')) {
      throw new Error(`expected cookieImport to require explicit confirmation, got ${JSON.stringify(missingConfirmationMessage)}`)
    }
    if (fetchCalls !== 0) {
      throw new Error('expected unconfirmed cookieImport to fail before fetch')
    }

    const result = await runtime.callBrowserApiRuntime({
      operation: 'cookieImport',
      dryRun: false,
      confirmCookieImport: true,
      confirmUnsafe: true,
      confirmThirdPartyTerms: true,
      targetUrl: 'https://target.invalid/account',
    })
    const output = result.content.map(item => item.text).join('\n')
    if (!output.includes('Operation: cookieImport') || !output.includes('Confirm cookie import: true')) {
      throw new Error(`expected confirmed cookieImport output to include safety status, got ${JSON.stringify(output)}`)
    }
  })
  if (fetchCalls !== 1) {
    throw new Error(`expected exactly one confirmed cookieImport fetch, got ${fetchCalls}`)
  }
}

export async function testAgenticGraphMcpBrowserBridgeAllowsLoopbackBrowserTargetUrls() {
  const runtime = await importBrowserApiRuntime()
  let fetchCalls = 0
  await withMockedFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls += 1
    const endpoint = String(input)
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
    if (!endpoint.endsWith('/v1/browser/go')) {
      throw new Error(`expected go endpoint, got ${endpoint}`)
    }
    if (body.url !== 'http://127.0.0.1:5174/?openEditorWorkspace=1#flow') {
      throw new Error(`expected loopback browser target URL to pass through normalized, got ${JSON.stringify(body)}`)
    }
    if (body.dry_run !== false || body.confirm_unsafe !== true) {
      throw new Error(`expected live go body to carry safety flags, got ${JSON.stringify(body)}`)
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ ok: true }),
    } as Response
  }) as typeof fetch, async () => {
    const result = await runtime.callBrowserApiRuntime({
      operation: 'go',
      targetUrl: 'http://127.0.0.1:5174/?openEditorWorkspace=1#flow',
      dryRun: false,
      confirmUnsafe: true,
    })
    const output = result.content.map(item => item.text).join('\n')
    if (!output.includes('Operation: go') || !output.includes('/v1/browser/go')) {
      throw new Error(`expected loopback go output to include operation and endpoint, got ${JSON.stringify(output)}`)
    }
  })
  if (fetchCalls !== 1) {
    throw new Error(`expected exactly one loopback go fetch, got ${fetchCalls}`)
  }
}

export async function testAgenticGraphMcpBrowserBridgeRequiresUnsafeConfirmationForLiveExecute() {
  let fetchCalled = false
  await withMockedFetch((async () => {
    fetchCalled = true
    throw new Error('fetch should not run for unconfirmed live execute')
  }) as typeof fetch, async () => {
    const runtime = await importBrowserApiRuntime()
    let message = ''
    try {
      await runtime.callBrowserApiRuntime({
        operation: 'execute',
        skillId: 'resolved-skill-id',
        dryRun: false,
        confirmUnsafe: false,
      })
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    if (!message.includes('confirmUnsafe=true')) {
      throw new Error(`expected live execute to require unsafe confirmation, got ${JSON.stringify(message)}`)
    }
  })
  if (fetchCalled) {
    throw new Error('expected unconfirmed live execute to fail before fetch')
  }
}

export async function testAgenticGraphMcpBrowserBridgeAvoidsDefaultRouteTargetUrl() {
  const runtime = await importBrowserApiRuntime()
  let fetchCalls = 0
  await withMockedFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls += 1
    const endpoint = String(input)
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
    if (!endpoint.endsWith('/v1/intent/resolve')) {
      throw new Error(`expected resolve endpoint, got ${endpoint}`)
    }
    if (Object.prototype.hasOwnProperty.call(body, 'url')) {
      throw new Error(`expected resolve to avoid default target URL injection, got ${JSON.stringify(body)}`)
    }
    if (body.intent !== 'find available authenticated routes') {
      throw new Error(`expected resolve to forward caller intent, got ${JSON.stringify(body)}`)
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ ok: true }),
    } as Response
  }) as typeof fetch, async () => {
    await runtime.callBrowserApiRuntime({
      operation: 'resolve',
      intent: 'find available authenticated routes',
    })
  })
  if (fetchCalls !== 1) {
    throw new Error(`expected exactly one resolve fetch, got ${fetchCalls}`)
  }
}

export async function testAgenticGraphMcpBrowserBridgeExposesNativeBrowserActions() {
  const runtime = await importBrowserApiRuntime()
  ;['go', 'snap', 'click', 'fill', 'type', 'press', 'select', 'scroll', 'submit', 'screenshot', 'text', 'markdown', 'cookies', 'eval', 'sync', 'close', 'skill', 'sessions'].forEach(operation => {
    if (!runtime.BROWSER_API_TOOL.inputSchema.properties.operation.enum.includes(operation)) {
      throw new Error(`expected browser bridge operation enum to include ${operation}`)
    }
  })

  let fetchCalls = 0
  await withMockedFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls += 1
    const endpoint = String(input)
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
    if (!endpoint.endsWith('/v1/browser/click')) {
      throw new Error(`expected native browser action endpoint, got ${endpoint}`)
    }
    if (body.url) {
      throw new Error(`expected native browser click to avoid default target URL injection, got ${JSON.stringify(body)}`)
    }
    if (body.session_id !== 'session-1' || body.selector !== '#buy' || body.dry_run !== false || body.confirm_unsafe !== true) {
      throw new Error(`expected native browser action body to carry session, selector, and safety flags, got ${JSON.stringify(body)}`)
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ ok: true }),
    } as Response
  }) as typeof fetch, async () => {
    const result = await runtime.callBrowserApiRuntime({
      operation: 'click',
      sessionId: 'session-1',
      selector: '#buy',
      dryRun: false,
      confirmUnsafe: true,
    })
    const output = result.content.map(item => item.text).join('\n')
    if (!output.includes('Operation: click') || !output.includes('/v1/browser/click')) {
      throw new Error(`expected native browser action output to include operation and endpoint, got ${JSON.stringify(output)}`)
    }
  })
  if (fetchCalls !== 1) {
    throw new Error(`expected exactly one native browser action fetch, got ${fetchCalls}`)
  }
}

export async function testAgenticGraphMcpBrowserBridgeRequiresCookieConfirmationForCookies() {
  let fetchCalled = false
  await withMockedFetch((async () => {
    fetchCalled = true
    throw new Error('fetch should not run for unconfirmed cookie reads')
  }) as typeof fetch, async () => {
    const runtime = await importBrowserApiRuntime()
    let message = ''
    try {
      await runtime.callBrowserApiRuntime({
        operation: 'cookies',
        sessionId: 'session-1',
      })
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    if (!message.includes('confirmCookieImport=true')) {
      throw new Error(`expected cookies to require cookie confirmation, got ${JSON.stringify(message)}`)
    }
  })
  if (fetchCalled) {
    throw new Error('expected unconfirmed cookies operation to fail before fetch')
  }
}
