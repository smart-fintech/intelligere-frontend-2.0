/**
 * A Tally user's party ledger, changed IN TALLY from the invoice's party step:
 *
 *   const alterLedger = useTallyLedgerAlter()
 *   const ok = await alterLedger(companyName, ledgerValues)   true | false
 *
 * The same tally_ledger_alter the Ledger Form sends for a Tally company
 * (buildTallyLedgerMessage, Services/Ledger/ledgerService), over the shared
 * WebSocket (useTallyExchange). The EXE alters the ledger in Tally and reads
 * it back into the app, and its stop_loader answers here.
 *
 * Why not the API update: for a Tally user, PUT tally/create-ledger/ makes the
 * backend send Tally its own alter, with the country under a name the EXE
 * does not read, so Tally was given India. This message carries the country
 * under the name the EXE reads (buildTallyLedgerMessage - ledgerFields).
 *
 * Resolves false when it did not go through: Tally's error is shown here; a
 * send that failed, a lost connection or no answer in time has already been
 * shown by useTallyExchange.
 */

import { useEffect, useRef } from 'react'

import { toast } from '@/Library/toast'
import useTallyExchange from '@/Modules/GstCompare/useTallyExchange'
import { TALLY_LEDGER_ALTER_MODULE, buildTallyLedgerMessage } from '@/Services/Ledger/ledgerService'

export default function useTallyLedgerAlter() {
  // The waiting caller's resolve, until the exchange ends one way or another.
  const pendingRef = useRef(null)

  const settle = (ok) => {
    const resolve = pendingRef.current
    pendingRef.current = null
    resolve?.(ok)
  }

  const exchange = useTallyExchange({
    module: TALLY_LEDGER_ALTER_MODULE,
    onReply: (reply) => {
      if (reply.status === 'error') {
        toast.error(reply.msg || 'Tally could not update the ledger.')
        settle(false)
        return
      }
      settle(true)
    },
  })

  // An exchange that ended without a reply (see above) leaves nothing waiting.
  useEffect(() => {
    if (exchange.busy || !pendingRef.current) return
    const resolve = pendingRef.current
    pendingRef.current = null
    resolve(false)
  }, [exchange.busy])

  return (companyName, ledger) =>
    new Promise((resolve) => {
      if (pendingRef.current) {
        resolve(false)
        return
      }
      pendingRef.current = resolve
      exchange
        .start(buildTallyLedgerMessage(TALLY_LEDGER_ALTER_MODULE, companyName, ledger))
        .then((started) => {
          if (!started) settle(false)
        })
    })
}
