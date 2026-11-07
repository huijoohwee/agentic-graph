import type { WorkspacePath } from '@/features/workspace-fs/types'
import {
  loadSupplyChainOverviewWorkspaceSeed,
  SUPPLY_CHAIN_OVERVIEW_SOURCE_BASENAME,
  SUPPLY_CHAIN_OVERVIEW_WORKSPACE_PATH,
} from './supplyChainOverviewSource'

export { SUPPLY_CHAIN_OVERVIEW_WORKSPACE_PATH }

export const SUPPLY_CHAIN_OVERVIEW_SEED_SPEC = {
  path: SUPPLY_CHAIN_OVERVIEW_WORKSPACE_PATH as WorkspacePath,
  basename: SUPPLY_CHAIN_OVERVIEW_SOURCE_BASENAME,
  sourceRelPaths: [`docs/workspace-seeds/${SUPPLY_CHAIN_OVERVIEW_SOURCE_BASENAME}`],
  fallbackText: '',
  sourceLoader: loadSupplyChainOverviewWorkspaceSeed,
}
