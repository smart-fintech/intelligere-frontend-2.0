import { Fragment, useState } from 'react'
import { ChevronDown, Gavel, History, MessagesSquare, Package, Paperclip } from 'lucide-react'

import { SkuDetailsTooltip } from '@/Components/Common/SkuDetailsTooltip'
import { Button } from '@/Components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/Components/ui/table'
import { EVENT_KIND, EVENT_KINDS, EVENT_STAGE } from '@/Constants/procurementAutomation'
import { cn } from '@/Library/utils'
import BidAmount from '@/Modules/Procurement/Components/BidAmount'
import { Countdown, Windows } from '@/Modules/Procurement/Components/EventCard'
import { CancelledWatermark, EventStatusBadge } from '@/Modules/Procurement/Components/EventSummary'
import { PreBidDetails, TechnicalBlock } from '@/Modules/Procurement/Components/TechnicalBid'
import { bidGapLabel, fileName, showAmount, skuDetailList } from '@/Modules/Procurement/procurement'
import { bidCurrencyOf } from '@/Modules/Procurement/vendorCurrency'
import BidPanel from '@/Modules/VendorPortal/Components/BidPanel'
import { canBid, canChat, myEntry } from '@/Modules/VendorPortal/vendorPortal'
import { orDash } from '@/Utils/display'

/**
 * One Bid or Pre Bid as the invited vendor sees it: the company and number at
 * the top left, the time left in the middle while it runs, the window(s) on the
 * right; the terms; the products.
 *
 *   Bid       each product with its lowest bid (unless the company hides the
 *             amounts), the vendor's own bid, position and delivery days; its
 *             arrow opens the vendor's history and, while it runs, the bid form.
 *             A vendor with a currency on this auction sees each amount in its
 *             currency first, the company-currency amount under it (BidAmount);
 *             the position is the backend's bid_rank, as it is sent
 *   Pre Bid   the products, the technical bid under them (certifications, FAQ,
 *             meeting, note), the files, and the chat with the company
 */

const productKey = (product, index) => String(product.sr_no ?? index)

/** This vendor's currency on this auction - the same on all its entries (the company form writes it so). */
const eventCurrencyOf = (event, email) => {
  for (const product of event.product) {
    const currency = bidCurrencyOf(myEntry(product, email))
    if (currency) return currency
  }
  return null
}

function Terms({ event, email }) {
  const currency = event.kind === EVENT_KIND.BID ? eventCurrencyOf(event, email) : null
  const own = (value) => (currency ? <BidAmount value={value} currency={currency} lead="own" /> : showAmount(value))
  const items = [
    ['Starting Amount', own(event.starting_bid_amount)],
    ['Bid Gap', currency && !event.bid_gap_percentage && Number(event.gap) > 0 ? own(event.gap) : bidGapLabel(event)],
    ['Extra Time', event.add_extra_time ? `${orDash(event.extra_time)} min` : 'No'],
  ]
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
      {items.map(([label, value]) => (
        <div key={label} className="flex items-baseline gap-1.5">
          <dt className="text-brand-muted">{label}</dt>
          <dd className="font-semibold text-foreground tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Files({ urls }) {
  if (urls.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Files">
      {urls.map((url) => (
        <li key={url}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={fileName(url)}
            className="inline-flex h-8 max-w-64 items-center gap-1.5 rounded-md border border-input px-2 text-xs text-brand hover:bg-brand-soft"
          >
            <Paperclip className="size-3.5 shrink-0" />
            <span className="truncate">{fileName(url)}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}

function ProductName({ product }) {
  return (
    <>
      <span className="font-medium">{orDash(product.product_name)}</span>
      {product.sku_code ? (
        <SkuDetailsTooltip details={skuDetailList(product.sku_details)}>
          <span
            tabIndex={0}
            className="ml-1.5 inline-block cursor-help rounded bg-brand-soft px-1.5 py-0.5 text-[11px] text-brand"
          >
            {product.sku_code}
          </span>
        </SkuDetailsTooltip>
      ) : null}
      {product.Description ? <span className="block text-xs text-muted-foreground">{product.Description}</span> : null}
      {product.Specification ? (
        <span className="block text-xs text-muted-foreground">Spec: {product.Specification}</span>
      ) : null}
    </>
  )
}

function BidProducts({ event, email, onPlaced }) {
  const [opened, setOpened] = useState(null)
  const running = canBid(event)
  const amountsShown = event.hide_lowest_bid_amount !== true

  return (
    <Table containerClassName="rounded-md border border-border">
      <TableHeader className="bg-muted">
        <TableRow className="hover:bg-transparent">
          <TableHead width={40}>#</TableHead>
          <TableHead>Product</TableHead>
          <TableHead width={90}>Qty</TableHead>
          <TableHead width={130}>Lowest Bid</TableHead>
          <TableHead width={130}>Your Bid</TableHead>
          <TableHead width={90}>Position</TableHead>
          <TableHead width={100}>Delivery Days</TableHead>
          <TableHead width={120} className="text-right">
            Action
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {event.product.map((product, index) => {
          const key = productKey(product, index)
          const mine = myEntry(product, email)
          const isOpen = opened === key
          const leading = mine?.bid_rank === 'L1'
          const currency = bidCurrencyOf(mine)
          return (
            <Fragment key={key}>
              <TableRow>
                <TableCell>{index + 1}</TableCell>
                <TableCell wrap>
                  <ProductName product={product} />
                </TableCell>
                <TableCell className="tabular-nums">
                  {orDash(product.qty)} {product.Per ?? ''}
                </TableCell>
                <TableCell className="tabular-nums">
                  {amountsShown ? <BidAmount value={product.last_bid} currency={currency} lead="own" /> : 'Hidden'}
                </TableCell>
                <TableCell className="font-semibold tabular-nums">
                  <BidAmount value={mine?.last_vender_bid} currency={currency} lead="own" />
                </TableCell>
                <TableCell>
                  {mine?.bid_rank ? (
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-semibold',
                        leading
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                          : 'bg-muted text-foreground',
                      )}
                    >
                      {mine.bid_rank}
                    </span>
                  ) : (
                    '--'
                  )}
                </TableCell>
                <TableCell className="tabular-nums">{orDash(mine?.delivery_days)}</TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant={running ? 'default' : 'outline'}
                      size="sm"
                      icon={running ? Gavel : History}
                      aria-expanded={isOpen}
                      disabled={!mine}
                      onClick={() => setOpened(isOpen ? null : key)}
                    >
                      {running ? 'Bid' : 'History'}
                      <ChevronDown className={cn('size-3.5 transition-transform', isOpen && 'rotate-180')} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              {isOpen && mine ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="p-0 whitespace-normal">
                    <BidPanel event={event} product={product} mine={mine} onPlaced={onPlaced} />
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

/**
 * A Pre Bid's products. On a phone the HSN and delivery days move under the
 * product's name, so the name keeps the width it needs.
 */
function PreBidProducts({ event }) {
  return (
    <Table>
      <TableHeader className="bg-muted/60">
        <TableRow className="hover:bg-transparent">
          <TableHead width={36}>#</TableHead>
          <TableHead>Product</TableHead>
          <TableHead width={90} className="hidden sm:table-cell">
            HSN
          </TableHead>
          <TableHead width={110}>Qty</TableHead>
          <TableHead width={100} className="hidden sm:table-cell">
            Delivery Days
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {event.product.map((product, index) => (
          <TableRow key={productKey(product, index)}>
            <TableCell className="align-top">{index + 1}</TableCell>
            <TableCell wrap className="align-top">
              <ProductName product={product} />
              <span className="mt-0.5 block text-xs text-muted-foreground sm:hidden">
                HSN {orDash(product.hsn)} · Delivery {product.delivery_days ? `${product.delivery_days} days` : '--'}
              </span>
            </TableCell>
            <TableCell className="hidden align-top sm:table-cell">{orDash(product.hsn)}</TableCell>
            <TableCell className="align-top whitespace-nowrap tabular-nums">
              {orDash(product.qty)} {product.Per ?? ''}
            </TableCell>
            <TableCell className="hidden align-top tabular-nums sm:table-cell">{orDash(product.delivery_days)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/**
 * A Pre Bid as the vendor works through it: the products, then under them the
 * pre bid's details in PreBidDetails' order - required certifications, FAQs,
 * meeting details, notes - and the buyer's documents last.
 */
function PreBidBody({ event }) {
  return (
    <div className="grid gap-3">
      <TechnicalBlock icon={Package} title="Products" count={event.product.length} bodyClassName="p-0" className="overflow-hidden">
        <PreBidProducts event={event} />
      </TechnicalBlock>

      <PreBidDetails
        event={event}
        documents
        empty={
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
            The buyer has not added certifications, FAQs, a meeting or a note to this Technical Bid.
          </p>
        }
      />
    </div>
  )
}

export default function VendorEventCard({ event, email, onPlaced, onChat, onExpire }) {
  const { label } = EVENT_KINDS[event.kind]
  const preBid = event.kind === EVENT_KIND.PRE_BID
  const running = event.stage === EVENT_STAGE.ONGOING && !event.cancelled

  return (
    <article className="relative overflow-hidden rounded-lg border border-brand/30 bg-card shadow-xs">
      <CancelledWatermark event={event} />
      <header className="grid grid-cols-1 items-center gap-x-6 gap-y-2 border-b border-border bg-muted/40 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:px-4">
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-xs text-brand-muted">{orDash(event.company_name)}</p>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-brand">
              {label} {orDash(event.Auction_no)}
            </h3>
            <EventStatusBadge event={event} />
          </div>
        </div>
        {running ? <Countdown until={event.closes_at} onExpire={onExpire} /> : <div className="hidden sm:block" />}
        <div className="sm:justify-self-end">
          <Windows event={event} />
        </div>
      </header>

      <div className="space-y-3 p-3 sm:p-4">
        <Terms event={event} email={email} />
        {preBid ? (
          <PreBidBody event={event} />
        ) : (
          <>
            <BidProducts event={event} email={email} onPlaced={onPlaced} />
            <Files urls={event.file} />
          </>
        )}
      </div>

      {preBid ? (
        <footer className="flex justify-end border-t border-border px-3 py-2 sm:px-4">
          <Button type="button" variant="outline" size="sm" icon={MessagesSquare} onClick={() => onChat(event)}>
            {canChat(event) ? 'Chat with Buyer' : 'View Chat'}
          </Button>
        </footer>
      ) : null}
    </article>
  )
}
