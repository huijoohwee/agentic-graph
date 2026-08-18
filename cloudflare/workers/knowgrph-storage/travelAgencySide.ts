import type { D1DatabaseLike } from '../shared/d1'
import { queryFirst } from '../shared/d1'
import type { KnowgrphStorageChatRole } from './contract'

export type TravelAgencyTransactionSide = 'shopper' | 'merchant'

export type TravelAgencyMembershipSide = Readonly<{
  userId: string
  membershipId: string
  workspaceId: string
  role: KnowgrphStorageChatRole
  transactionSide: TravelAgencyTransactionSide
}>

type MembershipSideRow = Readonly<{
  transaction_side: string
}>

const isTransactionSide = (value: string): value is TravelAgencyTransactionSide =>
  value === 'shopper' || value === 'merchant'

export const readTravelAgencyMembershipSide = async (args: {
  db: D1DatabaseLike
  workspaceId: string
  userId: string
  membershipId: string
  role: KnowgrphStorageChatRole
}): Promise<TravelAgencyMembershipSide | null> => {
  const row = await queryFirst<MembershipSideRow>(
    args.db,
    `select transaction_side
       from workspace_membership_transaction_sides
      where membership_id = ?
        and workspace_id = ?
        and user_id = ?
      limit 1`,
    [args.membershipId, args.workspaceId, args.userId],
  )
  const transactionSide = String(row?.transaction_side || '').trim()
  if (!isTransactionSide(transactionSide)) return null
  return Object.freeze({
    userId: args.userId,
    membershipId: args.membershipId,
    workspaceId: args.workspaceId,
    role: args.role,
    transactionSide,
  })
}
