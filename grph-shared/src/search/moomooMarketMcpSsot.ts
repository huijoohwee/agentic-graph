export const MOOMOO_MARKET_MCP_DOC_AREA = 'Moomoo Market Data MCP Configuration'

export const MOOMOO_MARKET_MCP_REMOTE_URL = 'https://mcp.moomoo.com/mcp'

export const MOOMOO_MARKET_MCP_OPENAPI_URL = 'https://openapi.moomoo.com/'

export const MOOMOO_MARKET_MCP_DEFAULT_SERVER_KEY = 'moomoo-market'

export const MOOMOO_MARKET_MCP_CONNECTION_MODES = [
  'oauth-bearer',
  'local-env',
] as const

export const MOOMOO_MARKET_MCP_DEFAULT_CONNECTION_MODE = 'oauth-bearer'

export const MOOMOO_MARKET_MCP_AUTH_HEADER = 'Authorization'

export const MOOMOO_MARKET_MCP_DEFAULT_AUTH_BOUNDARY =
  'Host-owned OAuth bearer token. MainPanel may name the Authorization header but must never store or render the token value; the MCP host or local environment attaches credentials.'

export const MOOMOO_MARKET_MCP_TOOL_PROFILES = [
  'market',
  'research',
  'derivatives',
  'account',
] as const

export const MOOMOO_MARKET_MCP_DEFAULT_TOOL_PROFILE = 'market'

export const MOOMOO_MARKET_MCP_MARKET_TOOL_NAMES = [
  'quote_stock_basicinfo',
  'quote_stock_quote',
  'quote_market_snapshot',
  'quote_cur_kline',
  'quote_history_kline',
  'quote_rt_data',
  'quote_rt_ticker',
  'quote_order_book',
  'quote_market_state',
  'quote_trading_days',
  'quote_plate_list',
  'quote_plate_stock',
  'quote_owner_plate',
  'quote_capital_flow',
  'quote_capital_distribution',
  'quote_capital_flow_history',
  'quote_stock_screen',
  'quote_user_security',
  'quote_user_security_group',
  'quote_valuation_index_stock_plate_list',
  'quote_valuation_index_component_stock_list',
  'quote_valuation_plate_stock_list',
  'quote_valuation_detail',
  'quote_daily_short_volume',
  'quote_short_interest',
  'quote_top_ten_brokers',
  'quote_top_ten_brokers_history',
  'quote_unusual_capital',
  'quote_unusual_derivatives',
  'quote_unusual_technical',
  'news_search',
  'quote_community_search',
  'quote_economic_calendar_hot',
  'quote_economic_calendar_search',
] as const

export const MOOMOO_MARKET_MCP_RESEARCH_TOOL_NAMES = [
  'quote_company_profile',
  'quote_company_executives',
  'quote_company_executive_background',
  'quote_company_operational_efficiency',
  'quote_corporate_actions_buybacks',
  'quote_corporate_actions_dividends',
  'quote_corporate_actions_rehab',
  'quote_corporate_actions_stock_splits',
  'quote_financials_earnings_price_history',
  'quote_financials_earnings_price_move',
  'quote_financials_revenue_breakdown',
  'quote_financials_statements',
  'quote_research_analyst_consensus',
  'quote_research_morningstar_report',
  'quote_research_rating_summary',
  'quote_shareholders_holder_detail',
  'quote_shareholders_holding_changes',
  'quote_shareholders_institutional',
  'quote_shareholders_overview',
  'quote_insider_holder_list',
  'quote_insider_trade_list',
  'quote_ipo_list_cn',
  'quote_ipo_list_hk',
  'quote_ipo_list_my',
  'quote_ipo_list_sg',
  'quote_ipo_list_us',
] as const

export const MOOMOO_MARKET_MCP_DERIVATIVES_TOOL_NAMES = [
  'quote_option_chain',
  'quote_option_expiration_date',
  'quote_option_exercise_probability',
  'quote_option_volatility',
  'quote_option_screen',
  'quote_option_strategy',
  'quote_option_strategy_spread',
  'quote_combo_option_quote',
  'quote_warrant_screen',
  'quote_future_info',
  'quote_referencefuture_list',
] as const

export const MOOMOO_MARKET_MCP_ACCOUNT_TOOL_NAMES = [
  'account_funds',
  'account_positions',
  'account_orders_active',
  'account_orders_history',
  'account_orders_detail',
  'account_order_fills_today',
  'account_fills_history',
  'account_trading_info',
  'account_authorized_trd_accs',
  'account_cash_logs',
  'account_combo_trading_info',
  'account_order_fees',
  'trading_margin_ratio',
  'sim_trade_account_list',
  'sim_trade_cash_info',
  'sim_trade_history_order_list',
  'sim_trade_max_buy_sell',
  'sim_trade_position_list',
  'crypto_account_active_orders',
  'crypto_account_fills',
  'crypto_account_fills_history',
  'crypto_account_order_detail',
  'crypto_account_order_history',
  'crypto_account_purchasing_power',
  'crypto_account_total_balance',
] as const

export const MOOMOO_MARKET_MCP_PROFILE_TOOL_NAMES = {
  market: MOOMOO_MARKET_MCP_MARKET_TOOL_NAMES,
  research: MOOMOO_MARKET_MCP_RESEARCH_TOOL_NAMES,
  derivatives: MOOMOO_MARKET_MCP_DERIVATIVES_TOOL_NAMES,
  account: MOOMOO_MARKET_MCP_ACCOUNT_TOOL_NAMES,
} as const

export const MOOMOO_MARKET_MCP_WRITE_TOOL_NAMES = [
  'trading_order_place',
  'trading_order_replace',
  'trading_order_cancel',
  'trading_order_confirm',
  'quote_modify_user_security',
  'sim_trade_input_order',
  'sim_trade_cancel_order',
  'sim_trade_modify_order',
  'crypto_account_cancel_order',
  'crypto_account_create_order',
  'crypto_account_modify_order',
] as const

export const MOOMOO_MARKET_MCP_ACTIVE_TOOL_NAMES = [
  ...MOOMOO_MARKET_MCP_MARKET_TOOL_NAMES,
  ...MOOMOO_MARKET_MCP_RESEARCH_TOOL_NAMES,
  ...MOOMOO_MARKET_MCP_DERIVATIVES_TOOL_NAMES,
  ...MOOMOO_MARKET_MCP_ACCOUNT_TOOL_NAMES,
] as const

export const MOOMOO_MARKET_MCP_DEFAULT_STARTUP_TIMEOUT_MS = 60000

export const MOOMOO_MARKET_MCP_DEFAULT_MAX_ROWS = 50

export const MOOMOO_MARKET_MCP_DEFAULT_REQUIRE_TOOL_REVIEW = true

export const MOOMOO_MARKET_MCP_READ_ONLY_BOUNDARY =
  'Read-only market, research, derivatives and account observations only. Order placement, replacement, cancellation and watchlist mutation tools are excluded. Connected reads require host-owned rights, zero-cost and account-identity receipts; paper accounts are for practice and live orders require separate explicit authorization.'

export const MOOMOO_MARKET_MCP_DEFAULT_PHASE = 'read-only-config'

export const MOOMOO_MARKET_MCP_CONNECTED_STATUS =
  'UNQUALIFIED — local configuration guidance only; no OAuth/Vault, rights, zero-cost or account-alias receipt is claimed by MainPanel.'

const ALLOWED_MOOMOO_MARKET_MCP_TOOLS = new Set<string>(MOOMOO_MARKET_MCP_ACTIVE_TOOL_NAMES)

const WRITE_MOOMOO_MARKET_MCP_TOOLS = new Set<string>(MOOMOO_MARKET_MCP_WRITE_TOOL_NAMES)

export const normalizeMoomooMarketMcpToolNames = (tools: readonly string[]): string[] => {
  const unique: string[] = []
  for (const tool of tools) {
    const normalized = String(tool || '').trim()
    if (WRITE_MOOMOO_MARKET_MCP_TOOLS.has(normalized)) continue
    if (!ALLOWED_MOOMOO_MARKET_MCP_TOOLS.has(normalized)) continue
    if (!unique.includes(normalized)) unique.push(normalized)
  }
  return unique.length > 0 ? unique : [...MOOMOO_MARKET_MCP_MARKET_TOOL_NAMES]
}

export const resolveMoomooMarketMcpProfileTools = (profile: string): string[] => {
  const matched = MOOMOO_MARKET_MCP_TOOL_PROFILES.find(entry => entry === profile)
  return [...MOOMOO_MARKET_MCP_PROFILE_TOOL_NAMES[matched ?? MOOMOO_MARKET_MCP_DEFAULT_TOOL_PROFILE]]
}

// The hosted endpoint is documented as a fixed origin; tool profiles are host-side
// admission allowlists, not a verified URL query parameter, so no tools query is appended.
export const buildMoomooMarketMcpRemoteUrl = (): string => MOOMOO_MARKET_MCP_REMOTE_URL

export const MOOMOO_MARKET_MCP_DEFAULT_ENABLED_TOOLS_JSON = JSON.stringify(MOOMOO_MARKET_MCP_MARKET_TOOL_NAMES, null, 2)

export const MOOMOO_MARKET_MCP_ACTIVE_TOOLS_JSON = JSON.stringify(MOOMOO_MARKET_MCP_ACTIVE_TOOL_NAMES, null, 2)

export const MOOMOO_MARKET_MCP_WRITE_TOOLS_JSON = JSON.stringify(MOOMOO_MARKET_MCP_WRITE_TOOL_NAMES, null, 2)