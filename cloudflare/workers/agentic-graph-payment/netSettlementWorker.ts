import {
  handleNetSettlementRoute,
  NetSettlementStore,
  type NetSettlementWorkerEnv,
} from './travelAgency/netSettlement'

const INTERNAL_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
})

const notFound = (): Response => new Response(JSON.stringify({
  ok: false,
  code: 'net-settlement-route-not-found',
}), { status: 404, headers: INTERNAL_HEADERS })

export const createNetSettlementWorker = () => ({
  async fetch(request: Request, env: NetSettlementWorkerEnv): Promise<Response> {
    return await handleNetSettlementRoute(request, env, INTERNAL_HEADERS) ?? notFound()
  },
})

export { NetSettlementStore }

export default createNetSettlementWorker()
