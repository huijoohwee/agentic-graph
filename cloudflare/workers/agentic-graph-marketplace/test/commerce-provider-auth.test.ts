import { describe, expect, it } from 'vitest'

import {
  authenticateCommerceProviderControlRequest,
  commerceProviderSignature,
  validCommerceProviderSecret,
  verifyCommerceProviderControlRequest,
  verifyCommerceProviderRequestAuthentication,
} from '../../commerce-provider-auth.ts'

const CONTRACT = 'commerce.marketplace-provider/v1'
const SECRET = '0123456789abcdefghijklmnopqrstuvwxyzABCD'
const AUTHENTICATION = Object.freeze({
  contract: CONTRACT,
  requestDigest: 'a'.repeat(64),
  bindingDigest: 'b'.repeat(64),
})

describe('Commerce provider authentication parity', () => {
  it('matches the Commerce-owned canonical HMAC vector', async () => {
    await expect(commerceProviderSignature(AUTHENTICATION, SECRET)).resolves.toBe(
      '4e49d6b6e0d3d35760e5d31b208371af2903bad655eaa97be924db6daec7e1e2',
    )
    const request = new Request('https://marketplace.internal/v1/vendors', {
      headers: {
        'x-commerce-provider-auth-schema': 'commerce-provider-auth/v1',
        'x-commerce-provider-auth-signature': '4e49d6b6e0d3d35760e5d31b208371af2903bad655eaa97be924db6daec7e1e2',
      },
    })
    await expect(verifyCommerceProviderRequestAuthentication(
      request,
      AUTHENTICATION,
      SECRET,
    )).resolves.toBe(true)
    await expect(verifyCommerceProviderRequestAuthentication(
      request,
      { ...AUTHENTICATION, bindingDigest: 'c'.repeat(64) },
      SECRET,
    )).resolves.toBe(false)
  })

  it('accepts only the exact printable 32..4096 byte secret boundary', () => {
    expect(validCommerceProviderSecret('x'.repeat(32))).toBe(true)
    expect(validCommerceProviderSecret('x'.repeat(4096))).toBe(true)
    expect(validCommerceProviderSecret('x'.repeat(31))).toBe(false)
    expect(validCommerceProviderSecret('x'.repeat(4097))).toBe(false)
    expect(validCommerceProviderSecret(`${'x'.repeat(31)}\n`)).toBe(false)
  })

  it('binds control authentication to the exact URL and semantic headers', async () => {
    const unsigned = new Request('https://marketplace.internal/v1/capabilities', {
      headers: { accept: 'application/json', 'x-commerce-contract': CONTRACT },
    })
    const signed = await authenticateCommerceProviderControlRequest(unsigned, CONTRACT, SECRET)
    expect(signed).not.toBeNull()
    await expect(verifyCommerceProviderControlRequest(signed!, CONTRACT, SECRET)).resolves.toBe(true)
    await expect(verifyCommerceProviderControlRequest(
      new Request('https://marketplace.internal/v1/runtime-evidence', { headers: signed!.headers }),
      CONTRACT,
      SECRET,
    )).resolves.toBe(false)
  })
})
