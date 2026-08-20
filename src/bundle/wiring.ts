import { ReoptWorker } from './reopt-worker'

export function createTravelCommerceRuntime(env: TravelCommerceEnv, ctx: ExecutionContext): ReoptWorker {
  return new ReoptWorker(env, ctx)
}
