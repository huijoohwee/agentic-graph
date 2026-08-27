import assert from 'node:assert/strict'
import test from 'node:test'
import type { KnowgrphStorageWorkerEnv } from '../contract'
import { StorageRelayOperation } from '../storage-relay/storageRelaySafety'
import { KnowledgeSourceError } from './knowledgeSourceContract'
import { createLarkAccessTokenSource } from './larkAccessToken'
import { LarkKnowledgeSourceProvider } from './larkKnowledgeSourceProvider'

const userEnv: KnowgrphStorageWorkerEnv = {
  DB: null,
  KNOWGRPH_STORAGE_LARK_IDENTITY_MODE: 'user-oauth',
  KNOWGRPH_STORAGE_LARK_USER_ACCESS_TOKEN: 'user-access-token',
  KNOWGRPH_STORAGE_LARK_USER_ACCESS_TOKEN_EXPIRES_AT_MS: '4102444800000',
}

const baseSource = {
  sourceId: 'base.primary', workspaceId: 'workspace-1', provider: 'lark' as const, kind: 'base' as const,
  title: null, appToken: 'app-1', tableId: 'table-1', viewId: 'view-1',
  fieldNames: ['Name'] as const, minimumRecordCount: 1,
  baseTitle: null, tableName: null, viewName: null,
}

const tableListResponse = (revision = 7) => Response.json({ code: 0, data: {
  items: [{ table_id: 'table-1', name: 'Primary', revision }],
  has_more: false,
  total: 1,
} })

test('Wiki reads require exact space, node, docx type, and allowlisted document id', async () => {
  let calls = 0
  const operation = new StorageRelayOperation({
    fetcher: async (input, init) => {
      calls += 1
      assert.equal(init?.method, 'GET')
      assert.match(String(input), /\/wiki\/v2\/spaces\/get_node\?token=wiki-node$/u)
      return Response.json({ code: 0, data: { node: {
        space_id: 'space-1',
        node_token: 'wiki-node',
        obj_type: 'docx',
        obj_token: 'different-document',
        title: 'Wiki page',
      } } })
    },
  })
  try {
    const provider = new LarkKnowledgeSourceProvider(
      await createLarkAccessTokenSource(userEnv, { cache: false }),
    )
    await assert.rejects(provider.read({
      source: {
        sourceId: 'wiki.primary', workspaceId: 'workspace-1', provider: 'lark', kind: 'wiki',
        title: null, spaceId: 'space-1', nodeToken: 'wiki-node', documentId: 'document-1',
      },
      operation,
    }), (error: unknown) => error instanceof KnowledgeSourceError
      && error.code === 'source_config_drift')
    assert.equal(calls, 1, 'mismatched discovered document id must never be fetched')
  } finally {
    operation.dispose()
  }
})

test('exact Wiki and Doc reads return bounded plain-text snapshots', async () => {
  const urls: string[] = []
  const operation = new StorageRelayOperation({
    fetcher: async (input, init) => {
      assert.equal(init?.method, 'GET')
      const url = String(input)
      urls.push(url)
      if (url.includes('/wiki/v2/spaces/get_node')) {
        return Response.json({ code: 0, data: { node: {
          space_id: 'space-1', node_token: 'wiki-node', obj_type: 'docx',
          obj_token: 'document-1', title: 'Wiki page',
        } } })
      }
      return Response.json({ code: 0, data: { content: '# Trusted content\n' } })
    },
  })
  try {
    const provider = new LarkKnowledgeSourceProvider(
      await createLarkAccessTokenSource(userEnv, { cache: false }),
    )
    const wiki = await provider.read({
      source: {
        sourceId: 'wiki.primary', workspaceId: 'workspace-1', provider: 'lark', kind: 'wiki',
        title: null, spaceId: 'space-1', nodeToken: 'wiki-node', documentId: 'document-1',
      },
      operation,
    })
    assert.equal(wiki.snapshot.type, 'document')
    assert.equal(wiki.snapshot.type === 'document' && wiki.snapshot.name, 'Wiki-page.md')
    assert.equal(wiki.counts.pages, 2)

    const doc = await provider.read({
      source: {
        sourceId: 'doc.primary', workspaceId: 'workspace-1', provider: 'lark', kind: 'doc',
        title: 'Direct doc', documentId: 'document-2',
      },
      operation,
    })
    assert.equal(doc.snapshot.type === 'document' && doc.snapshot.text, '# Trusted content\n')
    assert.match(urls.at(-1) || '', /\/docx\/v1\/documents\/document-2\/raw_content$/u)
  } finally {
    operation.dispose()
  }
})

test('Base pagination rejects repeated cursors instead of importing a partial snapshot', async () => {
  let recordsPage = 0
  const operation = new StorageRelayOperation({
    fetcher: async (input, init) => {
      const url = String(input)
      if (new URL(url).pathname.endsWith('/tables')) return tableListResponse()
      if (url.includes('/fields')) {
        return Response.json({ code: 0, data: {
          items: [{ field_name: 'Name', type: 1, is_primary: true, is_hidden: false }],
          has_more: false,
          total: 1,
        } })
      }
      assert.equal(init?.method, 'POST')
      assert.deepEqual(JSON.parse(String(init?.body)), {
        view_id: 'view-1', field_names: ['Name'], automatic_fields: false,
      })
      recordsPage += 1
      return Response.json({ code: 0, data: {
        items: [{ fields: { Name: `Page ${recordsPage}` } }],
        has_more: true,
        page_token: 'repeated-cursor',
        total: 2,
      } })
    },
  })
  try {
    const provider = new LarkKnowledgeSourceProvider(
      await createLarkAccessTokenSource(userEnv, { cache: false }),
    )
    await assert.rejects(provider.read({
      source: baseSource,
      operation,
    }), (error: unknown) => error instanceof KnowledgeSourceError
      && error.code === 'invalid_response')
    assert.equal(recordsPage, 2)
  } finally {
    operation.dispose()
  }
})

test('Base completes independent field and record pagination with fixed view authority', async () => {
  const urls: URL[] = []
  let tableReads = 0
  const operation = new StorageRelayOperation({
    fetcher: async (input, init) => {
      const url = new URL(String(input))
      urls.push(url)
      if (url.pathname.endsWith('/tables')) {
        tableReads += 1
        assert.equal(init?.method, 'GET')
        return tableListResponse()
      }
      const pageToken = url.searchParams.get('page_token')
      if (url.pathname.endsWith('/fields')) {
        assert.equal(init?.method, 'GET')
        assert.equal(url.searchParams.get('view_id'), 'view-1')
        return Response.json({ code: 0, data: {
          items: pageToken
            ? [
                { field_id: 'hidden-attachment', field_name: 'Attachment', type: 17, is_hidden: false },
                { field_id: 'hidden-relation', field_name: 'Relation', type: 18, is_hidden: false },
                { field_id: 'hidden-details', field_name: 'Details', type: 1, is_hidden: false },
              ]
            : [
                { field_id: 'hidden-name', field_name: 'Name', type: 1, is_primary: true, is_hidden: false },
                { field_id: 'hidden-owner', field_name: 'Owner', type: 11, is_hidden: false },
              ],
          has_more: pageToken == null,
          total: 5,
          ...(pageToken == null ? { page_token: 'fields-2' } : {}),
        } })
      }
      assert.equal(init?.method, 'POST')
      assert.equal(url.pathname.endsWith('/records/search'), true)
      assert.deepEqual(JSON.parse(String(init?.body)), {
        view_id: 'view-1',
        field_names: ['Name', 'Owner', 'Attachment', 'Relation'],
        automatic_fields: false,
      })
      return Response.json({ code: 0, data: {
        items: [{
          record_id: `hidden-${pageToken || 'one'}`,
          record_url: 'https://tenant.larksuite.com/record/hidden',
          fields: pageToken ? { Name: 'Two', Details: 'not allowlisted' } : {
            Name: 'One',
            Owner: [{ id: 'ou_secret-user', email: 'secret@example.com', avatar_url: 'https://avatar.invalid', name: 'Ada' }],
            Attachment: [{ file_token: 'boxcnsecret-token', tmp_url: 'https://tmp.invalid', url: 'https://download.invalid', name: 'brief.pdf' }],
            Relation: [{ table_id: 'tblSecretTable', record_ids: ['recSecretRecord'], text: 'Linked row', type: 'text' }],
          },
        }],
        has_more: pageToken == null,
        total: 2,
        ...(pageToken == null ? { page_token: 'records-2' } : {}),
      } })
    },
  })
  try {
    const provider = new LarkKnowledgeSourceProvider(
      await createLarkAccessTokenSource(userEnv, { cache: false }),
    )
    const result = await provider.read({
      source: {
        ...baseSource,
        fieldNames: ['Name', 'Owner', 'Attachment', 'Relation'],
      },
      operation,
    })
    assert.deepEqual(result.counts, {
      pages: 6, fields: 4, records: 2, documents: 0, bytes: result.counts.bytes,
    })
    const serialized = JSON.stringify(result.snapshot)
    for (const forbidden of [
      'hidden-', 'ou_secret-user', 'secret@example.com', 'avatar.invalid', 'boxcnsecret-token',
      'tmp.invalid', 'download.invalid', 'tblSecretTable', 'recSecretRecord', 'not allowlisted',
    ]) assert.equal(serialized.includes(forbidden), false)
    for (const retained of ['Ada', 'brief.pdf', 'Linked row', 'One', 'Two']) {
      assert.equal(serialized.includes(retained), true)
    }
    assert.equal(result.providerRevision, '7')
    assert.equal(tableReads, 2)
    assert.equal(urls.find(url => url.pathname.endsWith('/fields'))?.searchParams.get('page_size'), '100')
    assert.equal(urls.find(url => url.pathname.endsWith('/records/search'))?.searchParams.get('page_size'), '200')
  } finally {
    operation.dispose()
  }
})

test('Base has_more without a cursor fails closed', async () => {
  const operation = new StorageRelayOperation({
    fetcher: async input => new URL(String(input)).pathname.endsWith('/tables')
      ? tableListResponse()
      : Response.json({ code: 0, data: {
          items: [],
          has_more: String(input).includes('/fields'),
          total: 0,
        } }),
  })
  try {
    const provider = new LarkKnowledgeSourceProvider(
      await createLarkAccessTokenSource(userEnv, { cache: false }),
    )
    await assert.rejects(provider.read({
      source: baseSource,
      operation,
    }), (error: unknown) => error instanceof KnowledgeSourceError
      && error.code === 'invalid_response')
  } finally {
    operation.dispose()
  }
})

test('Base rejects incomplete totals, changing totals, and table revision drift', async t => {
  const runRejectedRead = async (
    fetcher: ConstructorParameters<typeof StorageRelayOperation>[0]['fetcher'],
    code: 'invalid_response' | 'source_config_drift',
  ) => {
    const operation = new StorageRelayOperation({ fetcher })
    try {
      const provider = new LarkKnowledgeSourceProvider(
        await createLarkAccessTokenSource(userEnv, { cache: false }),
      )
      await assert.rejects(provider.read({ source: baseSource, operation }),
        (error: unknown) => error instanceof KnowledgeSourceError && error.code === code)
    } finally {
      operation.dispose()
    }
  }

  await t.test('has_more false with a larger total is incomplete', async () => {
    await runRejectedRead(async input => {
      const path = new URL(String(input)).pathname
      if (path.endsWith('/tables')) return tableListResponse()
      return Response.json({ code: 0, data: {
        items: [{ field_name: 'Name', type: 1, is_primary: true, is_hidden: false }],
        has_more: false,
        total: 2,
      } })
    }, 'invalid_response')
  })

  await t.test('total changes across pages', async () => {
    await runRejectedRead(async input => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/tables')) return tableListResponse()
      const secondPage = url.searchParams.has('page_token')
      return Response.json({ code: 0, data: {
        items: [{
          field_name: secondPage ? 'Other' : 'Name', type: 1, is_primary: !secondPage, is_hidden: false,
        }],
        has_more: !secondPage,
        total: secondPage ? 3 : 2,
        ...(!secondPage ? { page_token: 'fields-2' } : {}),
      } })
    }, 'source_config_drift')
  })

  await t.test('table revision changes around acquisition', async () => {
    let tableReads = 0
    await runRejectedRead(async input => {
      const path = new URL(String(input)).pathname
      if (path.endsWith('/tables')) return tableListResponse(++tableReads === 1 ? 7 : 8)
      if (path.endsWith('/fields')) return Response.json({ code: 0, data: {
        items: [{ field_name: 'Name', type: 1, is_primary: true, is_hidden: false }],
        has_more: false,
        total: 1,
      } })
      return Response.json({ code: 0, data: {
        items: [{ fields: { Name: 'One' } }], has_more: false, total: 1,
      } })
    }, 'source_config_drift')
  })
})

test('declared upstream overflow cancels the response before buffering', async () => {
  let cancelled = false
  const operation = new StorageRelayOperation({
    maxBytes: 32,
    fetcher: async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{'))
      },
      cancel() {
        cancelled = true
      },
    }), { headers: { 'content-length': '33' } }),
  })
  try {
    const provider = new LarkKnowledgeSourceProvider(
      await createLarkAccessTokenSource(userEnv, { cache: false }),
    )
    await assert.rejects(provider.read({ source: baseSource, operation }),
      (error: unknown) => error instanceof KnowledgeSourceError && error.code === 'limit_exceeded')
    assert.equal(cancelled, true)
  } finally {
    operation.dispose()
  }
})

test('externally managed user token auth failure is terminal without a same-token retry', async () => {
  let calls = 0
  const operation = new StorageRelayOperation({
    fetcher: async () => {
      calls += 1
      return Response.json({ code: 1254302, msg: 'permission denied' })
    },
  })
  try {
    const provider = new LarkKnowledgeSourceProvider(
      await createLarkAccessTokenSource(userEnv, { cache: false }),
    )
    await assert.rejects(provider.read({
      source: {
        sourceId: 'doc.primary', workspaceId: 'workspace-1', provider: 'lark', kind: 'doc',
        title: null, documentId: 'document-1',
      },
      operation,
    }), (error: unknown) => error instanceof KnowledgeSourceError
      && error.code === 'provider_auth_failed')
    assert.equal(calls, 1)
  } finally {
    operation.dispose()
  }
})
