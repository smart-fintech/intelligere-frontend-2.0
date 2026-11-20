/**
 * The company's Tally vouchers (POST invoice/tally-vouchers/ { company_id }):
 *
 *   const vouchers = useTallyVouchers(companyId, enabled, selection)
 *
 *   status    'idle' | 'loading' | 'ready' | 'failed'
 *   groups    the vouchers by document type (voucherGroupsOf) - {} until in
 *   error     the message when they could not be loaded
 *   reload()  asks again now - the Refresh button
 *
 * ONE ANSWER PER COMPANY, FOR EVERY SCREEN - kept in the shared cache
 * (Library/queryCache) under [TALLY_VOUCHERS, companyId], so Sales Invoice
 * and Purchase Invoice showing the same company read the same answer, and a
 * request already on its way is shared rather than sent twice. Nothing is
 * asked until a Voucher view is opened (`enabled`), nor again on a re-render.
 * `selection` counts the times the Voucher view was chosen (the screen's
 * view switch): each new count asks for the latest vouchers - sharing a
 * request already on its way (the first open's, Refresh's), never a second
 * one. Refresh asks again too. Another company is another key, so
 * its vouchers are never shown for this one - while they load the status is
 * 'loading' with no rows.
 */

import { useEffect, useMemo } from 'react'

import { QUERY } from '@/Constants/queryKeys'
import { fetchQuery, useQuery } from '@/Library/queryCache'
import { getTallyVouchers, voucherGroupsOf } from '@/Services/Invoice/tallyVoucherService'

const NONE = Object.freeze({})

export default function useTallyVouchers(companyId, enabled = true, selection = 0) {
  const active = Boolean(enabled && companyId)
  const query = useQuery({
    key: active ? [QUERY.TALLY_VOUCHERS, companyId] : null,
    fetch: () => getTallyVouchers(companyId),
    // Kept until Refresh or the next time Voucher is chosen: vouchers come from Tally, not from anything done here.
    staleTime: Infinity,
  })
  // Voucher chosen (again): the latest vouchers. Never fresh (no staleTime), so it
  // asks - unless a request is on its way already, which is shared (fetchQuery).
  useEffect(() => {
    if (!active || !selection) return
    fetchQuery([QUERY.TALLY_VOUCHERS, companyId], () => getTallyVouchers(companyId)).catch(() => {})
  }, [active, companyId, selection])
  const groups = useMemo(() => (query.data === undefined ? NONE : voucherGroupsOf(query.data)), [query.data])

  return {
    status: active ? query.status : 'idle',
    groups,
    error: query.status === 'failed' ? query.error : null,
    reload: query.reload,
  }
}
