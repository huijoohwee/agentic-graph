import {
  buildDnsAidConfig,
  describeDnsAidRecord,
  readDnsAidSvcParam,
  splitDnsAidSvcParamCsv,
  toCloudflareDnsAidRecordPayload,
  validateDnsAidAnswerData,
} from './dns-aid-records.mjs'

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const validateConfig = (config) => {
  assert(config.baseUrl instanceof URL, 'baseUrl must be a URL')
  assert(config.hostname, 'hostname is required')
  assert(config.zoneName, 'zoneName is required')
  assert(Number.isFinite(config.ttl) && config.ttl > 0, 'ttl must be a positive finite number')
  assert(Array.isArray(config.records) && config.records.length === 3, 'expected exactly three DNS-AID records')

  const seenNames = new Set()
  for (const record of config.records) {
    assert(record.type === 'SVCB', `${record.id}: expected SVCB record type`)
    assert(record.name === `_${record.id}._agents.${config.zoneName}`, `${record.id}: record name does not match zone`)
    assert(!seenNames.has(record.name), `${record.id}: duplicate record name ${record.name}`)
    seenNames.add(record.name)
    assert(record.proxied === false, `${record.id}: DNS-AID records must not be proxied`)
    assert(record.ttl === config.ttl, `${record.id}: record ttl does not match config ttl`)
    assert(record.data?.priority === 1, `${record.id}: expected ServiceMode priority 1`)
    assert(record.data?.target === `${config.hostname}.`, `${record.id}: target must be the service hostname`)
    assert(record.expectedTarget === record.data.target, `${record.id}: expected target must match record data`)
    assert(record.expectedDescriptorPath.startsWith('/'), `${record.id}: descriptor path must be absolute`)
    assert(record.expectedEndpointPath.startsWith('/'), `${record.id}: endpoint path must be absolute`)
    assert(record.expectedSkillIndexPath.startsWith('/'), `${record.id}: skill index path must be absolute`)
    assert(
      Object.keys(toCloudflareDnsAidRecordPayload(record)).sort().join(',') === 'comment,data,name,proxied,ttl,type',
      `${record.id}: Cloudflare payload must not include local validation metadata`,
    )
    assert(readDnsAidSvcParam(record.data.value, 'port') === '443', `${record.id}: expected port=443`)
    assert(
      splitDnsAidSvcParamCsv(readDnsAidSvcParam(record.data.value, 'mandatory')).join(',') === 'alpn,port',
      `${record.id}: expected mandatory=alpn,port`,
    )
    assert(
      splitDnsAidSvcParamCsv(readDnsAidSvcParam(record.data.value, 'alpn')).join(',') === record.expectedAlpn.join(','),
      `${record.id}: expected ALPN list to match record expectation`,
    )
    const presentationData = `${record.data.priority} ${record.data.target} ${record.data.value}`
    const missing = validateDnsAidAnswerData(record, presentationData)
    assert(missing.length === 0, `${record.id}: contract does not validate its own presentation data: ${missing.join(', ')}`)
  }
}

try {
  const config = buildDnsAidConfig(process.env)
  validateConfig(config)

  const rootConfig = buildDnsAidConfig({ AGENTICGRAPH_AGENT_READY_BASE_URL: 'https://example.test/' })
  validateConfig(rootConfig)
  assert(rootConfig.records[0]?.expectedEndpointPath === '/', 'root index endpoint should stay at /')
  assert(rootConfig.records[1]?.expectedEndpointPath === '/mcp', 'root MCP endpoint should stay at /mcp')
  assert(
    rootConfig.records[2]?.expectedEndpointPath === '/.well-known/agent-card.json',
    'root A2A endpoint should stay at the well-known agent card path',
  )

  console.log(`[dns-aid] contract passed: ${config.records.length}/${config.records.length}`)
  for (const record of config.records) {
    console.log(`[dns-aid] ${describeDnsAidRecord(record)}`)
  }
} catch (error) {
  console.error(`[dns-aid] contract failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
