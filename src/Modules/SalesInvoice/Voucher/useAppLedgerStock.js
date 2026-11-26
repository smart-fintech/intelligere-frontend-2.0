/**
 * The ledgers and stock items to create before the vouchers
 * (POST invoice/app-ledger-product/ { company_name, document_type } - see appLedgerStockService):
 *
 *   const pending = useAppLedgerStock({ companyId, companyName, documentType, selection })
 *
 *   status    'idle' | 'loading' | 'ready' | 'failed'
 *   ledgers   the ledger rows to create - [] until in
 *   stock     the stock rows to create  - [] until in
 *   any       true when either list has a row (the voucher view waits for them)
 *   error     the message when the lists could not be read
 *   reload()  asks again now - after a create or a Show Map
 *
 * One answer per company and document type ('Sales Invoice' | 'Purchase Invoice')
 * in the shared cache. It is asked when the Voucher view opens and again each
 * time it is chosen (`selection`), as the old Purchase screen did on View
 * Voucher - sharing a request already on its way, never a second one.
 */

import { useEffect } from 'react'

import { QUERY } from '@/Constants/queryKeys'
import { fetchQuery, useQuery } from '@/Library/queryCache'
import { getAppLedgerStock } from '@/Services/Invoice/appLedgerStockService'

const NONE = Object.freeze([])

export default function useAppLedgerStock({ companyId, companyName, documentType, selection = 0 }) {
  const active = Boolean(companyId && companyName && documentType)
  const key = active ? [QUERY.APP_LEDGER_STOCK, companyId, documentType] : null
  const fetch = () => getAppLedgerStock({ companyName, documentType })
  const query = useQuery({
    key,
    fetch,
    // Read again on the next View Voucher, after a create, or on reload() - not on a re-render.
    staleTime: Infinity,
  })
  useEffect(() => {
    if (!active || !selection) return
    fetchQuery([QUERY.APP_LEDGER_STOCK, companyId, documentType], () => getAppLedgerStock({ companyName, documentType })).catch(() => {})
  }, [active, companyId, companyName, documentType, selection])

  const ledgers = query.data?.ledgers ?? NONE
  const stock = query.data?.stock ?? NONE
  return {
    status: active ? query.status : 'idle',
    ledgers,
    stock,
    any: ledgers.length > 0 || stock.length > 0,
    error: query.status === 'failed' ? query.error : null,
    reload: query.reload,
  }
}
