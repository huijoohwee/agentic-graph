export const buildDnsAidConfig = (env = process.env) => {
  const baseUrl = new URL(env.AGENTIC_OS_AGENT_READY_BASE_URL || 'https://airvio.co/agentic-graph/')
  const hostname = baseUrl.hostname
  const zoneName = (env.CLOUDFLARE_ZONE_NAME || hostname.split('.').slice(-2).join('.')).replace(/\.$/, '')
  const ttl = Number(env.AGENTIC_OS_DNS_AID_TTL || 3600)
  const serviceTarget = `${hostname}.`
  const routeBasePath = baseUrl.pathname.replace(/\/+$/, '')
  const appBasePath = routeBasePath || '/'
  const scopedPath = path => `${routeBasePath}${path}`
  const agentCardPath = scopedPath('/.well-known/agent-card.json')
  const mcpPath = scopedPath('/mcp')
  const skillIndexPath = scopedPath('/.well-known/agent-skills/index.json')

  const buildSvcParams = ({ alpn, descriptorPath, endpointPath }) => [
    `alpn="${alpn}"`,
    'port=443',
    'mandatory=alpn,port',
    `key65400="${descriptorPath}"`,
    `key65401="${endpointPath}"`,
    `key65402="${skillIndexPath}"`,
  ].join(' ')

  const records = [
    {
      id: 'index',
      type: 'SVCB',
      name: `_index._agents.${zoneName}`,
      expectedAlpn: ['h2'],
      expectedEndpointPath: appBasePath,
      data: {
        priority: 1,
        target: serviceTarget,
        value: buildSvcParams({
          alpn: 'h2',
          descriptorPath: agentCardPath,
          endpointPath: appBasePath,
        }),
      },
      comment: 'agentic-graph DNS-AID organization index',
    },
    {
      id: 'mcp',
      type: 'SVCB',
      name: `_mcp._agents.${zoneName}`,
      expectedAlpn: ['mcp', 'h2'],
      expectedEndpointPath: mcpPath,
      data: {
        priority: 1,
        target: serviceTarget,
        value: buildSvcParams({
          alpn: 'mcp,h2',
          descriptorPath: agentCardPath,
          endpointPath: mcpPath,
        }),
      },
      comment: 'agentic-graph DNS-AID MCP endpoint',
    },
    {
      id: 'a2a',
      type: 'SVCB',
      name: `_a2a._agents.${zoneName}`,
      expectedAlpn: ['a2a', 'h2'],
      expectedEndpointPath: agentCardPath,
      data: {
        priority: 1,
        target: serviceTarget,
        value: buildSvcParams({
          alpn: 'a2a,h2',
          descriptorPath: agentCardPath,
          endpointPath: agentCardPath,
        }),
      },
      comment: 'agentic-graph DNS-AID A2A discovery',
    },
  ].map(record => ({
    ...record,
    ttl,
    proxied: false,
    expectedTarget: serviceTarget,
    expectedDescriptorPath: agentCardPath,
    expectedSkillIndexPath: skillIndexPath,
  }))

  return {
    baseUrl,
    hostname,
    zoneName,
    ttl,
    records,
  }
}

export const describeDnsAidRecord = record =>
  `${record.type} ${record.name} ${record.data.priority} ${record.data.target} ${record.data.value}`

export const toCloudflareDnsAidRecordPayload = record => ({
  type: record.type,
  name: record.name,
  data: record.data,
  ttl: record.ttl,
  proxied: record.proxied,
  comment: record.comment,
})

const dnsAidSvcParamKeyNames = new Map([
  [0, 'mandatory'],
  [1, 'alpn'],
  [3, 'port'],
  [65400, 'key65400'],
  [65401, 'key65401'],
  [65402, 'key65402'],
])

const dnsAidSvcParamName = key => dnsAidSvcParamKeyNames.get(key) || `key${key}`

const decodeDnsAidName = (bytes, state) => {
  const labels = []
  while (state.offset < bytes.length) {
    const length = bytes[state.offset]
    state.offset += 1
    if (length === 0) return labels.length > 0 ? `${labels.join('.')}.` : '.'
    const nextOffset = state.offset + length
    if (nextOffset > bytes.length) return ''
    labels.push(new TextDecoder().decode(bytes.slice(state.offset, nextOffset)))
    state.offset = nextOffset
  }
  return ''
}

const readDnsAidUint16 = (bytes, state) => {
  if (state.offset + 2 > bytes.length) return null
  const value = (bytes[state.offset] << 8) | bytes[state.offset + 1]
  state.offset += 2
  return value
}

export const normalizeDnsAidAnswerData = data => {
  const text = String(data || '')
  const match = /^\\#\s+\d+\s+([0-9a-fA-F\s]+)$/.exec(text)
  if (!match) return text
  const hex = match[1].replace(/\s+/g, '')
  if (!hex || hex.length % 2 !== 0) return text
  const bytes = Uint8Array.from(hex.match(/../g).map(part => Number.parseInt(part, 16)))
  const state = { offset: 0 }
  const priority = readDnsAidUint16(bytes, state)
  const target = decodeDnsAidName(bytes, state)
  if (priority == null || !target) return text
  const params = []
  while (state.offset < bytes.length) {
    const key = readDnsAidUint16(bytes, state)
    const length = readDnsAidUint16(bytes, state)
    if (key == null || length == null || state.offset + length > bytes.length) return text
    const value = bytes.slice(state.offset, state.offset + length)
    state.offset += length
    if (key === 0) {
      const mandatory = []
      const mandatoryState = { offset: 0 }
      while (mandatoryState.offset < value.length) {
        const mandatoryKey = readDnsAidUint16(value, mandatoryState)
        if (mandatoryKey == null) return text
        mandatory.push(dnsAidSvcParamName(mandatoryKey))
      }
      params.push(`mandatory=${mandatory.join(',')}`)
    } else if (key === 1) {
      const alpn = []
      let offset = 0
      while (offset < value.length) {
        const length = value[offset]
        offset += 1
        const nextOffset = offset + length
        if (nextOffset > value.length) return text
        alpn.push(new TextDecoder().decode(value.slice(offset, nextOffset)))
        offset = nextOffset
      }
      params.push(`alpn=${alpn.join(',')}`)
    } else if (key === 3) {
      if (value.length !== 2) return text
      params.push(`port=${(value[0] << 8) | value[1]}`)
    } else {
      params.push(`${dnsAidSvcParamName(key)}=${new TextDecoder().decode(value)}`)
    }
  }
  return `${priority} ${target} ${params.join(' ')}`
}

export const stripDnsAidSvcParamQuotes = value => String(value || '').replace(/^"|"$/g, '')

export const readDnsAidSvcParam = (data, key) => {
  const match = new RegExp(`(?:^|\\s)${key}=("[^"]*"|\\S+)`).exec(String(data || ''))
  return match ? stripDnsAidSvcParamQuotes(match[1]) : ''
}

export const splitDnsAidSvcParamCsv = value =>
  stripDnsAidSvcParamQuotes(value).split(',').map(part => part.trim()).filter(Boolean)

export const validateDnsAidAnswerData = (record, data) => {
  const text = normalizeDnsAidAnswerData(data)
  const alpnValues = splitDnsAidSvcParamCsv(readDnsAidSvcParam(text, 'alpn'))
  const mandatoryValues = splitDnsAidSvcParamCsv(readDnsAidSvcParam(text, 'mandatory'))
  const missing = []
  if (!text.startsWith(`${record.data.priority} ${record.expectedTarget}`)) {
    missing.push(`priority/target=${record.data.priority} ${record.expectedTarget}`)
  }
  for (const alpn of record.expectedAlpn) {
    if (!alpnValues.includes(alpn)) missing.push(`alpn=${alpn}`)
  }
  if (readDnsAidSvcParam(text, 'port') !== '443') missing.push('port=443')
  for (const mandatory of ['alpn', 'port']) {
    if (!mandatoryValues.includes(mandatory)) missing.push(`mandatory=${mandatory}`)
  }
  if (readDnsAidSvcParam(text, 'key65400') !== record.expectedDescriptorPath) {
    missing.push(`key65400=${record.expectedDescriptorPath}`)
  }
  if (readDnsAidSvcParam(text, 'key65401') !== record.expectedEndpointPath) {
    missing.push(`key65401=${record.expectedEndpointPath}`)
  }
  if (readDnsAidSvcParam(text, 'key65402') !== record.expectedSkillIndexPath) {
    missing.push(`key65402=${record.expectedSkillIndexPath}`)
  }
  return missing
}
