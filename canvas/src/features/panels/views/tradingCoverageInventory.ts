// Evidence-led moomoo OpenAPI feature-family coverage for MainPanel Integrations. Mirrors the Trading
// runtime inventory (src/provider-coverage.mjs): each family pins imported documentation sources
// (path + on-disk SHA-256), verified MCP tool names, proposed semantic reads, transport and an honest
// mapping status. Discovery metadata only — it grants no admission, dispatch or write authority, and
// connected qualification stays UNQUALIFIED until candidate-bound external receipts exist.
export type CoverageStatus = 'mapped' | 'candidate' | 'paper-candidate' | 'excluded'
export type CoverageTransport = 'MCP' | 'REST' | 'MCP+REST' | 'PUSH'
export type CoverageSource = { path: string; sha256: string; url: string }
export type CoverageFamily = {
  id: string; label: string; status: CoverageStatus; transport: CoverageTransport
  operations: readonly string[]; mcp: readonly string[]; sources: readonly CoverageSource[]; note: string
}

export const COVERAGE_INDEX = {
  url: 'https://open.moomoo.com/',
  index_sha256: 'dda1b306fc514df55ff9cc168e417dd26da716d91b2193ce27cb0b645d29b164',
  known_sources: 305, imported_sources: 196, incomplete_sources: 109,
  retrieved_utc: '2026-11-23T00:51:00Z',
} as const

const source = (path: string, sha256: string): CoverageSource =>
  ({ path, sha256, url: 'https://open.moomoo.com/' + path.replace(/\.md$/, '') })

export const TRADING_PROVIDER_COVERAGE: readonly CoverageFamily[] = [
  { id: 'market-reads', label: 'Realtime quotes, history, book and tape', status: 'mapped', transport: 'MCP',
    operations: ['read.catalog', 'read.candles', 'read.ticker', 'read.depth', 'read.tape'],
    mcp: ['quote_stock_quote', 'quote_rt_ticker', 'quote_cur_kline', 'quote_order_book'],
    sources: [source('api/quote/kline/list.md', '2d0a1de5628c5165adbbfad1ca0ac649874408f106723e7ca16f0baad08271a7')],
    note: 'Operation-shaped MCP reads share one durable $0 counter; decimal strings are preserved verbatim.' },
  { id: 'calendar', label: 'Earnings calendar', status: 'mapped', transport: 'REST',
    operations: ['read.calendar'], mcp: [],
    sources: [source('api/quote/calendar/earnings-calendar.md', '36da3343d16f677f29c49f8194f6c645b5ce273bda0ccc2a1c442c8f29bf4bc2')],
    note: 'REST-only (no MCP tool). Market-local dates, Unix-microsecond publication time, session and null estimates preserved; ≤7-day inclusive window.' },
  { id: 'capital-flow', label: 'Capital flow and unusual activity', status: 'candidate', transport: 'MCP+REST',
    operations: ['read.capital-flow'], mcp: ['quote_capital_flow'],
    sources: [source('api/quote/unusual/capital.md', '6822c10b8faf8c50ddac9440f2efdbf1446c7c76130c3268e349ec15a633e6f9')],
    note: 'MCP capital-flow tool observed; REST unusual-activity docs imported. Semantic read not yet mapped.' },
  { id: 'rank', label: 'Rankings and hot lists', status: 'candidate', transport: 'MCP+REST',
    operations: ['read.rank'], mcp: [],
    sources: [source('api/quote/rank/rank-hot-list.md', 'c863d51e04fdd576a24be433ddaff86e931a7ebadcfaa734473c16784561baa7'),
      source('api/quote/rank/rank-earnings-beat.md', '4689cb06a31b34f6a020aaa32b977b8a9ed8f0ba6d2a2d4521703f1680f7f934')],
    note: 'Screening/ranking docs imported; no verified MCP ranking tool in the observed catalog subset.' },
  { id: 'plate-industry', label: 'Sectors, plates and industrial chain', status: 'candidate', transport: 'MCP+REST',
    operations: ['read.plate'], mcp: ['quote_plate_list', 'quote_plate_stock', 'quote_owner_plate'],
    sources: [source('api/quote/industry/heatmap.md', 'a636ade5e00f7018f4cb7461b1bd82e607119f3714483eff68476bb8665a0297'),
      source('api/quote/industry/industrial-chain-list.md', 'b446c6175a9198f884c20864327a1f300307ea460c516767dc68449befea20c5')],
    note: 'Plate MCP tools observed; heatmap and industrial-chain REST docs imported.' },
  { id: 'news-research', label: 'News and analyst research', status: 'candidate', transport: 'MCP+REST',
    operations: ['read.news', 'read.research'], mcp: ['news_search'],
    sources: [source('api/quote/research/research-analyst-ratings.md', '31cf7fb1d42fa1da41dcda3c8bb3b036ac4ec648fd79c7b7a3baf4b31a22ea28')],
    note: 'news_search MCP tool observed; analyst-ratings REST docs imported. Requires own data admission.' },
  { id: 'ipo', label: 'IPO listings', status: 'candidate', transport: 'MCP',
    operations: ['read.ipo'], mcp: ['quote_ipo_list_us', 'quote_ipo_list_hk', 'quote_ipo_list_cn', 'quote_ipo_list_sg', 'quote_ipo_list_my'],
    sources: [], note: 'Per-market IPO MCP tools observed; no separate imported IPO doc pinned in this inventory.' },
  { id: 'financials', label: 'Company financials and profile', status: 'candidate', transport: 'REST',
    operations: ['read.financials'], mcp: [],
    sources: [source('api/quote/company/profile.md', 'de67cc6e2ac7fd84acb650086fc38830e50d41fb2ae6a09569edfcc8b7c370d4')],
    note: 'Company profile REST doc imported; per-symbol financials referenced by the earnings calendar.' },
  { id: 'corporate-actions', label: 'Dividends, splits and buybacks', status: 'candidate', transport: 'REST',
    operations: ['read.corporate-actions'], mcp: [],
    sources: [source('api/quote/corporate-actions/dividends.md', '8d1688ba5a6003fe96da5c6a002fbd1c32f403b84a8076d7f7bc2db95b1b54ed')],
    note: 'Dividend/split/buyback REST docs imported; semantic read not yet mapped.' },
  { id: 'holders', label: 'Shareholders, institutions and ARK', status: 'candidate', transport: 'REST',
    operations: ['read.holders'], mcp: [],
    sources: [source('api/quote/shareholders/overview.md', '522a012101fe093cf4faca3bf79de297c8a6e3e54e0e8195ce078a343e978ed4'),
      source('api/quote/institution/institution-holding-list.md', '00983e8f58dcbfae1262c6ce85d9b40ae881f4bd4308eddf191e760a67cd411c'),
      source('api/quote/ark/ark-fund-holding.md', '589fd7c7ff9f5c0bcbbb9fa1c1b56fa0a0080eb28f0d4fff489c41955df7d7db')],
    note: 'Holder/institution/ARK REST docs imported; influencer holdings also available.' },
  { id: 'influencer', label: 'Influencer holdings', status: 'candidate', transport: 'REST',
    operations: ['read.influencer'], mcp: [],
    sources: [source('api/quote/influencer/holdings.md', 'c1c9a069b296fb0e96bf1c594184936f6f355532f68115d91d09549dac1abc4e'),
      source('api/quote/influencer/holding-change.md', '506c3dad2f36a508e1e5a79a52d93beefdcb5c103d242d41ad519f70d73b572e')],
    note: 'Influencer holdings and changes REST docs imported.' },
  { id: 'macro', label: 'Macro indicators and Fed watch', status: 'candidate', transport: 'REST',
    operations: ['read.macro'], mcp: [],
    sources: [source('api/quote/macro/macro-indicators.md', '05793610fec13ef1dc4daebfc70ccba885945cd7bf225bd8b5f75d110ee17299')],
    note: 'Macro indicator and Fed-watch REST docs imported.' },
  { id: 'derivatives', label: 'Options and futures derivatives', status: 'candidate', transport: 'MCP+REST',
    operations: ['read.derivatives'], mcp: ['quote_future_info'],
    sources: [source('api/quote/unusual/derivatives.md', 'ca21b50ff8bef45e3b33cf5f86698c3a69d46fec85cc40343d8b0c575ac4425e')],
    note: 'Futures MCP tool observed; options quotes/Greeks gate research rows 15/17/20 and remain unmapped.' },
  { id: 'etf', label: 'ETF holdings and screens', status: 'candidate', transport: 'REST',
    operations: ['read.etf'], mcp: [],
    sources: [source('api/quote/etf/quote-etf-top-holdings.md', 'f64d56a974cb6c7d8ea6993f68e883f27a4740b2f8a98098807ccd764681b9c4')],
    note: 'ETF holdings, style-box and screen REST docs imported.' },
  { id: 'event-contract', label: 'Event contracts', status: 'candidate', transport: 'REST',
    operations: ['read.event-contract'], mcp: [],
    sources: [source('api/quote/event-contract/event-contract-event-list.md', 'da1fca568e3da2a63191b1df2917e769031a4b954ba9687eb96b8e9080c86c70')],
    note: 'Event-contract event/series/milestone REST docs imported.' },
  { id: 'crypto-market', label: 'Crypto market data', status: 'candidate', transport: 'REST',
    operations: ['read.crypto-market'], mcp: [],
    sources: [source('api/quote/crypto-market/crypto-market-overview.md', 'f4b0eb0e96c62513cca891e6a880367335e410dfb6f47b6207338c9119bddb1b')],
    note: 'Crypto overview, fear/greed and institution-holding REST docs imported (market data, not trading).' },
  { id: 'valuation', label: 'Valuation analysis', status: 'candidate', transport: 'REST',
    operations: ['read.valuation'], mcp: [],
    sources: [source('api/quote/valuation/detail.md', 'f51a510e4a27bfc15c8711bd33bebd54a8f94711be0e1f6d605e029a2e6d2f30')],
    note: 'Valuation detail and index/plate constituent REST docs imported.' },
  { id: 'short', label: 'Short selling and interest', status: 'candidate', transport: 'REST',
    operations: ['read.short'], mcp: [],
    sources: [source('api/quote/short/interest.md', '5fb77899253871812da937ddf4f0b26a2d4e4eb1c506114eb7f06062999e5469')],
    note: 'Short interest, daily volume and JP credit/deposit REST docs imported.' },
  { id: 'stock-connect', label: 'Stock connect flows', status: 'candidate', transport: 'REST',
    operations: ['read.stock-connect'], mcp: [],
    sources: [source('api/quote/stock-connect/quote-stock-connect-flow.md', '12d1b508fe619fc3f7de81c3e02552b5c77f7da1bc3b60b1d4aee6ef6221059d')],
    note: 'Stock-connect flow, hold-ratio and history REST docs imported.' },
  { id: 'top-brokers', label: 'Top broker holdings', status: 'candidate', transport: 'REST',
    operations: ['read.top-brokers'], mcp: [],
    sources: [source('api/quote/top-brokers/top-brokers.md', '4829004be19ed773465303f76f7342ac79e4badb46bbc1d53d955f1090471dc8')],
    note: 'Top-broker buy/sell and hold-ratio REST docs imported.' },
  { id: 'chip-cbbc', label: 'Chip distribution and CBBC', status: 'candidate', transport: 'REST',
    operations: ['read.chip', 'read.cbbc'], mcp: [],
    sources: [source('api/quote/chip/quote-chip-distribution.md', 'e135c006a96cedabb95df63efb0b1e2b9018a8b17ee667248e6c41012fb045f7'),
      source('api/quote/cbbc/quote-cbbc-basic-info.md', '07ecfcb503fed3311277495af5910c4c449c7c4bd25714238bdb156609aa4b68')],
    note: 'Chip distribution and CBBC basic-info/distribution REST docs imported.' },
  { id: 'push', label: 'Realtime push subscription', status: 'candidate', transport: 'PUSH',
    operations: ['subscribe.push'], mcp: [],
    sources: [source('api/quote/push/overview.md', '485db83bdf0dd46e4e63f042ce21c9bd473bd68745eb64c1328ebfe59c789670')],
    note: 'Push auth/subscribe/heartbeat docs imported; streaming admission is a separate transport review.' },
  { id: 'sim-trade', label: 'Simulated paper trading', status: 'paper-candidate', transport: 'REST',
    operations: ['practice.sim'], mcp: [],
    sources: [source('api/sim-trade/cash-info.md', '68a9a178c1b0c1d06b4dd6ecf066c907d808a03e1ecce5a1f565cd83bca62960')],
    note: 'Simulated account/order REST docs imported; paper rehearsal needs the domain guard, never live dispatch.' },
  { id: 'trading', label: 'Live order dispatch', status: 'excluded', transport: 'REST',
    operations: [], mcp: [],
    sources: [source('api/trading/overview.md', '5cc47dc21f38edb6e01c5d7cf1425d5248ba2d94583f9326e645581557e6bd2c'),
      source('api/trading/trade/place-order.md', '91b0a90a9294b138906d02628f19f1e6704e5d91a0fb0a7306ac890d15c1c0e6')],
    note: 'Live place/cancel/modify order endpoints are out of the read-only $0 scope and never mapped.' },
  { id: 'crypto-trading', label: 'Live crypto order dispatch', status: 'excluded', transport: 'REST',
    operations: [], mcp: [],
    sources: [source('api/crypto_trading/overview.md', '5456c16b51a443854d46b46703b9521ac92a80d1d8e0858efffb0e2c6a51a0dc')],
    note: 'Live crypto account/order/trade endpoints are out of the read-only $0 scope and never mapped.' },
]

export function coverageSummary(entries: readonly CoverageFamily[] = TRADING_PROVIDER_COVERAGE) {
  const byStatus: Record<string, number> = {}
  for (const entry of entries) byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1
  return {
    families: entries.length,
    mappedOperations: entries.flatMap(entry => entry.status === 'mapped' ? [...entry.operations] : []),
    byStatus,
    restOnlyMapped: entries.filter(entry => entry.status === 'mapped' && entry.transport === 'REST').map(entry => entry.id),
    excluded: entries.filter(entry => entry.status === 'excluded').map(entry => entry.id),
  }
}