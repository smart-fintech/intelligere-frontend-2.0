import { Fragment, useState } from 'react'
import {  ChevronDown, IdCard } from 'lucide-react'

import { StarRating } from '@/Components/Common/StarRating'
import { Button } from '@/Components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/Components/ui/table'
import { Tooltip } from '@/Components/ui/tooltip'
import BidAmount from '@/Modules/Procurement/Components/BidAmount'
import VendorDocumentsPanel from '@/Modules/Procurement/Components/VendorDocumentsPanel'
import { EVENT_KIND, EVENT_STAGE } from '@/Constants/procurementAutomation'
import { cn } from '@/Library/utils'
import { showSentAt } from '@/Modules/Procurement/preBidChat'
import { amountsHidden, overallRating, sortVendorsByBid, vendorKey } from '@/Modules/Procurement/procurement'
import useCompanyCurrency from '@/Modules/Procurement/useCompanyCurrency'
import { bidCurrencyOf, findCurrency, rateSentence, readSavedCurrency } from '@/Modules/Procurement/vendorCurrency'
import { orDash } from '@/Utils/display'

/** A foreign vendor's saved currency - "USD · 1 USD = 83.5 INR", the name on hover. */
function VendorCurrencyTag({ saved }) {
  const { currencies, base } = useCompanyCurrency()
  const currency = findCurrency(currencies, saved.currency)
  return (
    <Tooltip text={currency?.name}>
      <span tabIndex={0} className="mt-0.5 inline-block rounded bg-brand-soft px-1.5 py-0.5 text-[11px] text-brand tabular-nums">
        {rateSentence(saved.currency, saved.conversion_rate, base?.code)}
      </span>
    </Tooltip>
  )
}

/**
 * The vendors invited for one product.
 *
 * A Bid that has started also shows each vendor's latest bid, its delivery days
 * and its position, lowest bid first; a vendor row opens out into its bid
 * history, its changes of delivery days and its notes (vendor_bid). A Pre Bid
 * has no bids - its vendors are listed as invited.
 *
 * Every vendor's arrow opens its documents and certifications under its row
 * (VendorDocumentsPanel) - any number of vendors at once, each on its own;
 * `onCertificateVerified(vendor, certificateName)` is told when one is verified there.
 *
 * Every amount is the company's (a foreign vendor's bids are converted as it
 * places them); for such a vendor its own figure is shown under it (BidAmount).
 * The order and positions are the backend's (bid_rank), never worked out here.
 */

const asList = (value) => (Array.isArray(value) ? value : [])

/** An opened row's content: no wider than the table's visible box (100cqw), pinned to its left edge. */
const OPENED_ROW = 'sticky left-0 max-w-[100cqw]'

/** Bid History cells: tighter on a phone, so the three columns fit its width. */
const HISTORY_CELL = 'px-2 sm:px-3'

/**
 * A vendor's bid history, delivery day changes and notes. `currency` is its
 * { code, rate } on this auction (bidCurrencyOf) - each bid then shows its own
 * figure too, `lead` saying which comes first ('base' company side, 'own' in
 * the vendor portal); `baseCode` the company's currency where it is known.
 *
 * The bids are a table - Date & Time, Bid Amount, Bid Days - in the order they
 * were saved. A bid_history entry carries no note (the note is the vendor's
 * own field - plain text, or a list from before - not tied to a bid, and can
 * come without one), so it is listed under the table.
 */
export function VendorHistory({ vendor, showAmounts, currency = null, baseCode = '', lead = 'base' }) {
  const bids = asList(vendor.bid_history)
  const deliveries = asList(vendor.delivery_days_history)
  // A note is sent as plain text now; vendors who added notes earlier still have a list.
  const notes = (Array.isArray(vendor.notes) ? vendor.notes : [vendor.notes]).filter((note) => String(note ?? '').trim())

  return (
    <div className="grid grid-cols-1 gap-4 bg-muted/30 p-3 text-xs md:grid-cols-3">
      <div className="min-w-0 space-y-4 md:col-span-2">
        <div>
          <p className="mb-1 font-semibold text-brand">Bid History</p>
          {bids.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-card px-3 py-2 text-muted-foreground">No bid yet.</p>
          ) : (
            <Table containerClassName="rounded-md border border-border bg-card" className="text-xs" aria-label="Bid History">
              <TableHeader className="bg-muted">
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(HISTORY_CELL, 'h-8')}>Date &amp; Time</TableHead>
                  <TableHead className={cn(HISTORY_CELL, 'h-8 text-right')}>Bid Amount</TableHead>
                  <TableHead className={cn(HISTORY_CELL, 'h-8 text-right')}>Bid Days</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bids.map((bid, index) => (
                  <TableRow key={index}>
                    <TableCell className={cn(HISTORY_CELL, 'py-2 text-muted-foreground tabular-nums sm:whitespace-nowrap')}>
                      {orDash(showSentAt(bid?.bid_time))}
                    </TableCell>
                    <TableCell className={cn(HISTORY_CELL, 'py-2 text-right tabular-nums')}>
                      {showAmounts ? (
                        <BidAmount value={bid?.bid_amount} currency={currency} baseCode={baseCode} lead={lead} />
                      ) : (
                        'Hidden'
                      )}
                    </TableCell>
                    <TableCell className={cn(HISTORY_CELL, 'py-2 text-right tabular-nums')}>{orDash(bid?.delivery_days)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <div>
          <p className="mb-1 font-semibold text-brand">Notes</p>
          {notes.length === 0 ? (
            <p className="text-muted-foreground">No notes.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-4">
              {notes.map((note, index) => (
                <li key={index} className="break-words whitespace-pre-line [overflow-wrap:anywhere]">
                  {note}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <p className="mb-1 font-semibold text-brand">Delivery Days Changes</p>
        {deliveries.length === 0 ? (
          <p className="text-muted-foreground">No change.</p>
        ) : (
          <ol className="space-y-1">
            {deliveries.map((change, index) => (
              <li key={index} className="flex flex-wrap justify-between gap-2 border-b border-border/60 pb-1">
                <span>
                  {orDash(change?.old_delivery_days)} &rarr; {orDash(change?.delivery_days)}
                </span>
                <span className="text-muted-foreground">{orDash(change?.updated_time)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

export default function ProductVendors({ event, product, onProfile, onCertificateVerified }) {
  const [opened, setOpened] = useState(null)
  // Vendors whose documents are open, by vendorKey - each opens and closes on its own.
  const [documentsOpen, setDocumentsOpen] = useState(() => new Set())
  const toggleDocuments = (key) =>
    setDocumentsOpen((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const withBids = event.kind === EVENT_KIND.BID && event.stage !== EVENT_STAGE.UPCOMING
  const showAmounts = !amountsHidden(event)
  const vendors = withBids ? sortVendorsByBid(product.vendor) : asList(product.vendor)
  const columns = 4 + (withBids ? 3 : 0) + 1
  // The company's currency is looked up only when a vendor here bids in another one.
  const hasForeign = vendors.some((vendor) => bidCurrencyOf(vendor))
  const { base } = useCompanyCurrency({ load: hasForeign })
  const baseCode = hasForeign ? (base?.code ?? '') : ''

  if (vendors.length === 0) {
    return <p className="px-3 py-4 text-sm text-muted-foreground">No vendor is invited for this product.</p>
  }

  return (
    // The scroll box is a size container: an opened row (documents, history) is
    // kept to its visible width and stays in view while the wide table scrolls sideways.
    <Table containerClassName="@container rounded-md border border-border">
      <TableHeader className="bg-muted">
        <TableRow className="hover:bg-transparent">
          <TableHead width={40}>#</TableHead>
          <TableHead>Vendor</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Email</TableHead>
          {withBids ? (
            <>
              <TableHead width={130}>Last Bid</TableHead>
              <TableHead width={110}>Delivery Days</TableHead>
              <TableHead width={80}>Position</TableHead>
            </>
          ) : null}
          <TableHead width={withBids ? 186 : 146} className="text-right">
            Actions
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vendors.map((vendor, index) => {
          const key = vendorKey(vendor) || String(index)
          const isOpen = opened === key
          const documentsShown = documentsOpen.has(key)
          const rating = overallRating(vendor.rating)
          const saved = readSavedCurrency(vendor)
          return (
            <Fragment key={key}>
              <TableRow>
                <TableCell>{index + 1}</TableCell>
                <TableCell wrap>
                  <span className="font-medium">{orDash(vendor.name)}</span>
                  {vendor.company ? <span className="block text-xs text-muted-foreground">{vendor.company}</span> : null}
                  {rating ? <StarRating value={rating} readOnly half size="sm" label={`${vendor.name} rating`} /> : null}
                  {saved ? <VendorCurrencyTag saved={saved} /> : null}
                </TableCell>
                <TableCell wrap>
                  {orDash(vendor.contact)}
                  {vendor.whatsapp && vendor.whatsapp !== vendor.contact ? (
                    <span className="block text-xs text-muted-foreground">WhatsApp {vendor.whatsapp}</span>
                  ) : null}
                </TableCell>
                <TableCell title={vendor.email}>{orDash(vendor.email)}</TableCell>
                {withBids ? (
                  <>
                    <TableCell className="tabular-nums">
                      {showAmounts ? (
                        <BidAmount value={vendor.last_vender_bid} currency={bidCurrencyOf(vendor)} baseCode={baseCode} />
                      ) : (
                        'Hidden'
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{orDash(vendor.delivery_days)}</TableCell>
                    <TableCell className="tabular-nums">{orDash(vendor.bid_rank)}</TableCell>
                  </>
                ) : null}
                <TableCell>
                  <div className="flex justify-end gap-1.5">
                    <Button
                      type="button"
                      variant="iconEdit"
                      size="icon-sm"
                      icon={IdCard}
                      tooltip="Vendor profile"
                      aria-label={`Profile of ${vendor.name}`}
                      onClick={() => onProfile(vendor)}
                    />
                    <Button
                      type="button"
                      variant="iconEdit"
                      size="icon-sm"
                      icon={ChevronDown}
                      className={cn('[&_svg]:transition-transform', documentsShown && 'bg-brand-soft text-brand [&_svg]:rotate-180')}
                      tooltip={documentsShown ? 'Hide Documents & Certifications' : 'View Documents & Certifications'}
                      aria-label={`Documents and certifications of ${vendor.name}`}
                      aria-expanded={documentsShown}
                      onClick={() => toggleDocuments(key)}
                    />
                    {withBids ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-expanded={isOpen}
                        onClick={() => setOpened(isOpen ? null : key)}
                      >
                        History
                        <ChevronDown className={cn('size-3.5 transition-transform', isOpen && 'rotate-180')} />
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
              {documentsShown ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columns} className="p-0 whitespace-normal">
                    <div className={OPENED_ROW}>
                      <VendorDocumentsPanel
                        vendor={vendor}
                        event={event}
                        onVerified={(certificateName) => onCertificateVerified?.(vendor, certificateName)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ) : null}
              {isOpen ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columns} className="p-0 whitespace-normal">
                    <div className={OPENED_ROW}>
                      <VendorHistory
                        vendor={vendor}
                        showAmounts={showAmounts}
                        currency={bidCurrencyOf(vendor)}
                        baseCode={baseCode}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ) : null}
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}
