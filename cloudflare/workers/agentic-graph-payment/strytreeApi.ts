import type { StrytreeWorkerEnv, HeadersRecord } from './strytreeTypes'
import type { D1DatabaseLike } from '../shared/d1'
import { inspectStrytreeReadiness } from './strytreeReadiness'
import { handleStoryTree, handleUnlockNode } from './strytreeStory'
import { readPathId } from './strytreeSupport'
import { handleCreateCheckoutSession, handleCheckoutWebhook, handleGetWallet, handleCompleteCheckoutSession } from './strytreeCheckout'
import { handleCreateGenerationJob, handleGetGenerationJob } from './strytreeGeneration'
import { handleCreateCandidateRun, handleGetCandidateRun, handlePublishCandidate } from './strytreeCandidates'
export type { StrytreeWorkerEnv } from './strytreeTypes'
export { processStrytreeQueueMessage } from './strytreeGeneration'

export const isStrytreeRoute = (pathname: string): boolean =>
  pathname === '/api/strytree' || pathname.startsWith('/api/strytree/')

export const handleStrytreeRoute = async (
  request: Request,
  env: StrytreeWorkerEnv,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
): Promise<Response | null> => {
  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/api/strytree/readyz') {
    return inspectStrytreeReadiness(env, db, corsHeaders)
  }
  const storyTreeMatch = /^\/api\/strytree\/stories\/([^/]+)\/tree$/.exec(url.pathname)
  if (request.method === 'GET' && storyTreeMatch?.[1]) {
    return handleStoryTree(request, db, corsHeaders, readPathId(storyTreeMatch[1]))
  }
  const unlockMatch = /^\/api\/strytree\/nodes\/([^/]+)\/unlock$/.exec(url.pathname)
  if (request.method === 'POST' && unlockMatch?.[1]) {
    return handleUnlockNode(request, env, db, corsHeaders, readPathId(unlockMatch[1]))
  }
  if (request.method === 'POST' && url.pathname === '/api/strytree/checkout/sessions') {
    return handleCreateCheckoutSession(request, env, db, corsHeaders)
  }
  if (request.method === 'POST' && url.pathname === '/api/strytree/checkout/webhook') {
    return handleCheckoutWebhook(request, env, db, corsHeaders)
  }
  if (request.method === 'GET' && url.pathname === '/api/strytree/wallet') {
    return handleGetWallet(request, db, corsHeaders)
  }
  const checkoutCompleteMatch = /^\/api\/strytree\/checkout\/sessions\/([^/]+)\/complete$/.exec(url.pathname)
  if (request.method === 'POST' && checkoutCompleteMatch?.[1]) {
    return handleCompleteCheckoutSession(request, env, db, corsHeaders, readPathId(checkoutCompleteMatch[1]))
  }
  if (request.method === 'POST' && url.pathname === '/api/strytree/generation-jobs') {
    return handleCreateGenerationJob(request, env, db, corsHeaders)
  }
  const generationJobMatch = /^\/api\/strytree\/generation-jobs\/([^/]+)$/.exec(url.pathname)
  if (request.method === 'GET' && generationJobMatch?.[1]) {
    return handleGetGenerationJob(request, db, corsHeaders, readPathId(generationJobMatch[1]))
  }
  if (request.method === 'POST' && url.pathname === '/api/strytree/candidate-runs') {
    return handleCreateCandidateRun(request, env, db, corsHeaders)
  }
  const candidateRunMatch = /^\/api\/strytree\/candidate-runs\/([^/]+)$/.exec(url.pathname)
  if (request.method === 'GET' && candidateRunMatch?.[1]) {
    return handleGetCandidateRun(request, db, corsHeaders, readPathId(candidateRunMatch[1]))
  }
  const publishMatch = /^\/api\/strytree\/candidates\/([^/]+)\/publish$/.exec(url.pathname)
  if (request.method === 'POST' && publishMatch?.[1]) {
    return handlePublishCandidate(request, db, corsHeaders, readPathId(publishMatch[1]))
  }
  return null
}
