import { useEffect, useRef, useState } from 'react'
import { Boxes, BookUser, Plus, TriangleAlert } from 'lucide-react'

import { ConfirmDialog } from '@/Components/Common/ConfirmDialog'
import { Button } from '@/Components/ui/button'
import { Card, CardContent } from '@/Components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/Components/ui/select'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import useTallyExchange from '@/Modules/GstCompare/useTallyExchange'
import {
  LEDGER_GROUP_CHOICES,
  PRIMARY_GROUP,
  finalLedgerGroup,
  removeAppLedgerStock,
  toIntelligereProductForm,
  toLedgerCreatePayload,
  toTallyLedger,
  toTallyProduct,
} from '@/Services/Invoice/appLedgerStockService'
import { BULK_LEDGER_CREATE_MODULE, buildBulkLedgerMessage, createLedger } from '@/Services/Ledger/ledgerService'
import {
  TALLY_PRODUCT_CREATE_MODULE,
  buildIntelligereProductPayload,
  buildTallyProductImportMessage,
  createIntelligereProduct,
  isProductAlreadyExists,
} from '@/Services/Product/productService'

/**
 * LEDGERS AND STOCK ITEMS TO CREATE - the old Intelligere ERP's step before
 * the Sales and Purchase vouchers (InvoiceQRCode / ImportInvoiceQRCreate),
 * shown by TallyVouchers in place of the vouchers while
 * invoice/app-ledger-product/ lists anything (useAppLedgerStock):
 *
 *   Ledger       Ledger Name, Ledger Group, Email, Phone, Address, State
 *                A "Primary" ledger has its group chosen here first -
 *                Indirect / Direct Income (Sales), Indirect / Direct Expenses
 *                (Purchase) - Create Ledger refuses until each has one.
 *   Stock Item   Stock Name, HSN Code, Qty, Per, Rate
 *   Purchase     each row has Show Map: the row leaves the list
 *                (PUT app-ledger-product/ source "delete"), to be mapped instead.
 *
 * Each list has its own button, used independently of the other:
 *
 *   Intelligere  no question asked: each row is created in turn (the Ledger
 *                and Product forms' own calls); one that fails is said and the
 *                rest carry on.
 *   Tally        "Are you sure...in Tally?" first, then every row in ONE
 *                message over the app's WebSocket (bulk_ledger_create /
 *                tally_product_create), and the wait for Tally's stop_loader.
 *                The lists are read again TALLY_SETTLE_MS after it, as the old
 *                screens did - the backend is still reading Tally's new
 *                masters back when Tally answers.
 *
 * Done either way: the list is read again (`pending.reload`) and so is the
 * company's ledger or product list (`onLedgersCreated` / `onStockCreated`),
 * which is what the voucher cards are checked against. A press while one is
 * running is ignored, and every button waits while either list is busy.
 *
 *   side         'sales' | 'purchase'
 *   pending      useAppLedgerStock's answer
 *   companyId, companyName
 *   isTally, erpKnown   which way they are created - nothing is pressable until known
 */

const TALLY_SETTLE_MS = 5000

const cell = 'px-2 py-1.5 align-middle'
const orDash = (value) => (value ? value : '--')
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

function Section({ icon: Icon, title, count, action, children }) {
  return (
    <section className="space-y-1.5" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-brand uppercase">
          <Icon className="size-3.5" aria-hidden="true" />
          {title} <span className="font-normal text-muted-foreground normal-case">({count})</span>
        </p>
        {action}
      </div>
      <div className="max-h-[45vh] overflow-auto rounded-md border border-border">{children}</div>
    </section>
  )
}

function Head({ columns }) {
  return (
    <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
      <tr>
        {columns.map((column) => (
          <th key={column} className={cn(cell, 'font-medium')}>
            {column}
          </th>
        ))}
      </tr>
    </thead>
  )
}

export default function PendingMasters({ side, pending, companyId, companyName, isTally, erpKnown, onLedgersCreated, onStockCreated }) {
  const purchase = side === 'purchase'
  const groupChoices = LEDGER_GROUP_CHOICES[purchase ? 'purchase' : 'sales']

  // The group chosen for each "Primary" ledger, by its id.
  const [groups, setGroups] = useState({})
  // 'ledger' | 'stock' - the Tally confirmation open.
  const [confirming, setConfirming] = useState(null)
  // What is running: 'ledger' | 'stock' | null - a ref as well, so a double press is refused at once.
  const [running, setRunning] = useState(null)
  const runningRef = useRef(null)
  // The row Show Map is taking off the list.
  const [removing, setRemoving] = useState(null)
  const settleTimer = useRef(null)

  useEffect(() => () => clearTimeout(settleTimer.current), [])

  const begin = (what) => {
    if (runningRef.current) return false
    runningRef.current = what
    setRunning(what)
    return true
  }
  const end = () => {
    runningRef.current = null
    setRunning(null)
  }

  const afterLedgers = () => {
    pending.reload()
    onLedgersCreated?.()
  }
  const afterStock = () => {
    pending.reload()
    onStockCreated?.()
  }

  /** Tally answered: say how it went, then read the lists again once the backend has caught up. */
  const tallyReply = (reply, after, fallback) => {
    if (reply.status === 'error') toast.error(reply.msg || fallback.error)
    else toast.success(reply.msg || fallback.success)
    clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null
      end()
      after()
    }, TALLY_SETTLE_MS)
  }

  const ledgerExchange = useTallyExchange({
    module: BULK_LEDGER_CREATE_MODULE,
    onReply: (reply) => tallyReply(reply, afterLedgers, { success: 'Ledgers created in Tally.', error: 'Tally could not create the ledgers.' }),
  })
  const stockExchange = useTallyExchange({
    module: TALLY_PRODUCT_CREATE_MODULE,
    onReply: (reply) => tallyReply(reply, afterStock, { success: 'Stock items created in Tally.', error: 'Tally could not create the stock items.' }),
  })

  // A Tally wait that ended without an answer (connection lost, timed out - the exchange has said so) frees the buttons.
  useEffect(() => {
    if (runningRef.current === 'ledger' && !ledgerExchange.busy && !settleTimer.current) end()
  }, [ledgerExchange.busy])
  useEffect(() => {
    if (runningRef.current === 'stock' && !stockExchange.busy && !settleTimer.current) end()
  }, [stockExchange.busy])

  /** The old check: every "Primary" ledger needs its group chosen. */
  const missingGroup = () => pending.ledgers.find((ledger) => ledger.group === PRIMARY_GROUP && !finalLedgerGroup(ledger, groups[ledger.id]))

  const askCreate = (what) => {
    if (running || !erpKnown) return
    if (what === 'ledger') {
      const missing = missingGroup()
      if (missing) {
        toast.error(`Ledger Group is required for "${missing.name || 'this ledger'}"`)
        return
      }
    }
    if (isTally) setConfirming(what)
    else if (what === 'ledger') createLedgersInIntelligere()
    else createStockInIntelligere()
  }

  /* ---- Intelligere: one at a time, the rest carry on past a failure ---- */

  const createEach = async (list, createOne, nameOf) => {
    let created = 0
    for (const row of list) {
      try {
        await createOne(row)
        created += 1
      } catch (failure) {
        toast.error(`${nameOf(row) || 'An item'}: ${failure.message || 'could not be created.'}`)
      }
    }
    return created
  }

  const createLedgersInIntelligere = async () => {
    if (!begin('ledger')) return
    const list = pending.ledgers
    try {
      const created = await createEach(
        list,
        (ledger) => createLedger(toLedgerCreatePayload(ledger, finalLedgerGroup(ledger, groups[ledger.id]), companyId)),
        (ledger) => ledger.name,
      )
      if (created > 0) toast.success(`${plural(created, 'ledger')} of ${list.length} created.`)
    } finally {
      end()
      afterLedgers()
    }
  }

  const createStockInIntelligere = async () => {
    if (!begin('stock')) return
    const list = pending.stock
    try {
      const created = await createEach(
        list,
        async (item) => {
          const reply = await createIntelligereProduct(buildIntelligereProductPayload(companyName, toIntelligereProductForm(item)))
          // Declined, not failed: the reply reads like a success but for its words.
          if (isProductAlreadyExists(reply)) throw new Error(reply.msg)
        },
        (item) => item.name,
      )
      if (created > 0) toast.success(`${plural(created, 'stock item')} of ${list.length} created.`)
    } finally {
      end()
      afterStock()
    }
  }

  /* ---- Tally: all in one message, then Tally's answer ---- */

  const createInTally = async (what) => {
    setConfirming(null)
    if (!begin(what)) return
    if (!companyName) {
      end()
      toast.error('Select a company first.')
      return
    }
    const started =
      what === 'ledger'
        ? await ledgerExchange.start(
            buildBulkLedgerMessage(
              companyName,
              pending.ledgers.map((ledger) => toTallyLedger(ledger, finalLedgerGroup(ledger, groups[ledger.id]))),
            ),
          )
        : await stockExchange.start(buildTallyProductImportMessage(companyName, pending.stock.map(toTallyProduct)))
    // Not sent (the exchange has said why) - nothing is waited for.
    if (!started) end()
  }

  /* ---- Purchase: Show Map - the row off the list ---- */

  const showMap = async (kind, row) => {
    if (running || removing) return
    setRemoving(`${kind}:${row.id}`)
    try {
      await removeAppLedgerStock(kind === 'ledger' ? { ledgerIds: [row.id] } : { stockIds: [row.id] })
      pending.reload()
    } catch (failure) {
      toast.error(failure.message || 'The row could not be removed from the list.')
    } finally {
      setRemoving(null)
    }
  }

  const locked = Boolean(running) || !erpKnown
  const busyLabel = (what) => (isTally ? `Creating in Tally...` : what === 'ledger' ? 'Creating ledgers...' : 'Creating stock items...')
  const mapButton = (kind, row) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      loading={removing === `${kind}:${row.id}`}
      disabled={locked || Boolean(removing)}
      title="Take it off this list, to map it to an existing one instead"
      onClick={() => showMap(kind, row)}
    >
      Show Map
    </Button>
  )

  return (
    <Card className="border-border/70 py-3 shadow-sm" data-testid="pending-masters">
      <CardContent className="space-y-4 px-3">
        <p className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300" role="status">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          These ledgers and stock items are used by the vouchers but do not exist yet{isTally ? ' in Tally' : ''}. Create them to continue to the vouchers.
        </p>

        {pending.ledgers.length > 0 ? (
          <Section
            icon={BookUser}
            title="Ledger"
            count={pending.ledgers.length}
            action={
              <Button type="button" size="sm" icon={Plus} loading={running === 'ledger'} disabled={locked} onClick={() => askCreate('ledger')}>
                {running === 'ledger' ? busyLabel('ledger') : 'Create Ledger'}
              </Button>
            }
          >
            <table className="w-full min-w-[720px] table-fixed text-sm">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[16%]" />
                <col className="w-[14%]" />
                <col className="w-[11%]" />
                <col className="w-[18%]" />
                <col className="w-[13%]" />
                {purchase ? <col className="w-[110px]" /> : null}
              </colgroup>
              <Head columns={['Ledger Name', 'Ledger Group', 'Email', 'Phone', 'Address', 'State', ...(purchase ? ['Action'] : [])]} />
              <tbody>
                {pending.ledgers.map((ledger) => (
                  <tr key={ledger.id} className="border-t border-border" data-testid="pending-ledger-row">
                    <td className={cn(cell, 'font-medium break-words')}>{orDash(ledger.name)}</td>
                    <td className={cell}>
                      {ledger.group === PRIMARY_GROUP ? (
                        <Select value={groups[ledger.id] ?? ''} disabled={locked} onValueChange={(value) => value && setGroups((all) => ({ ...all, [ledger.id]: value }))}>
                          <SelectTrigger size="sm" className="w-full" aria-label={`Ledger group for ${ledger.name || 'this ledger'}`} aria-invalid={!groups[ledger.id] || undefined}>
                            <SelectValue placeholder="Select Group" />
                          </SelectTrigger>
                          <SelectContent>
                            {groupChoices.map((choice) => (
                              <SelectItem key={choice} value={choice}>
                                {choice}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="break-words">{orDash(ledger.group)}</span>
                      )}
                    </td>
                    <td className={cn(cell, 'break-words')}>{orDash(ledger.email)}</td>
                    <td className={cn(cell, 'break-words')}>{orDash(ledger.phone)}</td>
                    <td className={cn(cell, 'break-words')}>{orDash(ledger.address)}</td>
                    <td className={cn(cell, 'break-words')}>{orDash(ledger.state)}</td>
                    {purchase ? <td className={cell}>{mapButton('ledger', ledger)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        ) : null}

        {pending.stock.length > 0 ? (
          <Section
            icon={Boxes}
            title="Stock Item"
            count={pending.stock.length}
            action={
              <Button type="button" size="sm" icon={Plus} loading={running === 'stock'} disabled={locked} onClick={() => askCreate('stock')}>
                {running === 'stock' ? busyLabel('stock') : 'Create Stock Item'}
              </Button>
            }
          >
            <table className="w-full min-w-[560px] text-sm">
              <Head columns={['Stock Name', 'HSN Code', 'Qty', 'Per', 'Rate', ...(purchase ? ['Action'] : [])]} />
              <tbody>
                {pending.stock.map((item) => (
                  <tr key={item.id} className="border-t border-border" data-testid="pending-stock-row">
                    <td className={cn(cell, 'font-medium break-words')}>{orDash(item.name)}</td>
                    <td className={cell}>{orDash(item.hsn)}</td>
                    <td className={cn(cell, 'tabular-nums')}>{orDash(item.quantity)}</td>
                    <td className={cell}>{orDash(item.unit)}</td>
                    <td className={cn(cell, 'tabular-nums')}>{orDash(item.rate)}</td>
                    {purchase ? <td className={cn(cell, 'w-[110px]')}>{mapButton('stock', item)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        ) : null}
      </CardContent>

      <ConfirmDialog
        open={Boolean(confirming)}
        onOpenChange={() => setConfirming(null)}
        title={confirming === 'stock' ? 'Create stock items in Tally' : 'Create ledgers in Tally'}
        description={confirming === 'stock' ? 'Are you sure you want to create all Stock Items in Tally?' : 'Are you sure you want to create all Ledgers in Tally?'}
        confirmLabel="Yes"
        variant="default"
        onConfirm={() => createInTally(confirming)}
      />
    </Card>
  )
}
