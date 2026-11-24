import { Fragment, useEffect, useRef, useState } from 'react'
import { Ban, ChevronDown, Eye, EyeOff, FilePlus2, MessagesSquare, Pencil } from 'lucide-react'

import { SkuDetailsTooltip } from '@/Components/Common/SkuDetailsTooltip'
import { Button } from '@/Components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/Components/ui/table'
import { Tooltip } from '@/Components/ui/tooltip'
import { EVENT_KIND, EVENT_KINDS, EVENT_STAGE } from '@/Constants/procurementAutomation'
import { useSkuManagement } from '@/Hooks/useMasterDetails'
import { cn } from '@/Library/utils'
import { CancelledWatermark, EventStatusBadge } from '@/Modules/Procurement/Components/EventSummary'
import ProductVendors from '@/Modules/Procurement/Components/ProductVendors'
import { PreBidDetails } from '@/Modules/Procurement/Components/TechnicalBid'
import VendorProfileModal from '@/Modules/Procurement/Components/VendorProfileModal'
import {
  amountsHidden,
  canCreateBidFrom,
  financialStartOf,
  isEditable,
  showAmount,
  showWhen,
  skuDetailList,
  vendorBidsHidden,
} from '@/Modules/Procurement/procurement'
import useCompanyCurrency from '@/Modules/Procurement/useCompanyCurrency'
import { bidCurrencyOf, moneyIn } from '@/Modules/Procurement/vendorCurrency'
import { orDash } from '@/Utils/display'

/**
 * One Bid or Pre Bid as a card: its number at the top left, its window(s) at the
 * top right, its products in a short table. A product's arrow opens the vendors
 * invited for it (ProductVendors) under its row; "Show All Vendors" opens or
 * closes every product's at once. A Pre Bid's details (certifications, FAQs,
 * meeting, notes - PreBidDetails) follow its products.
 *
 * The buttons are only those that can work for it: Edit and Cancel until it has
 * closed or been cancelled; Chat on a Pre Bid once its vendors have been invited;
 * Create Bid on a Pre Bid whose technical bid has closed (disabled once its
 * Financial Bid Start has passed). A running event counts down to its close, an
 * upcoming one to its start; either reads the list again as it reaches zero.
 */

const DANGER_MS = 30 * 60 * 1000

const productKey = (product, index) => String(product.sr_no ?? index)

const pad = (number) => String(number).padStart(2, '0')

const showLeft = (ms) => {
  const seconds = Math.floor(ms / 1000)
  const days = Math.floor(seconds / 86400)
  const clock = `${pad(Math.floor((seconds % 86400) / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`
  return days > 0 ? `${days}d ${clock}` : clock
}

/** After the reload at 00:00:00, how long until the one follow-up - the backend moves the event on at that same minute. */
const FOLLOW_UP_MS = 5 * 1000

/**
 * Time left until `until`. When it reaches 00:00:00 `onExpire` is called once -
 * the list is read again, so the event moves on (Upcoming to Ongoing, Ongoing
 * to Completed). The backend moves it at that same minute, so the first read
 * may still find it where it was: if this timer is still on screen
 * FOLLOW_UP_MS later (the event has not moved, or the card would be gone) it is
 * read once more, and that is all. A new `until` (extra time moved the close)
 * arms it again.
 *
 *   label    the caption above the time ("Time Remaining", "Starts In")
 *   urgent   false: never turns red in its last 30 minutes (a countdown to a start)
 */
export function Countdown({ until, onExpire, label = 'Time Remaining', urgent = true }) {
  const [now, setNow] = useState(() => Date.now())
  // The `until` the list was last read for, so each close time is read for once (twice in Strict Mode otherwise).
  const firedFor = useRef(null)
  // The latest handler, so a new function from the parent neither fires it again nor drops the follow-up.
  const expire = useRef(onExpire)

  useEffect(() => {
    expire.current = onExpire
  })

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const left = Math.max(0, until - now)
  const over = until > 0 && left === 0

  useEffect(() => {
    if (!over) return undefined
    if (firedFor.current !== until) {
      firedFor.current = until
      expire.current?.()
    }
    const followUp = setTimeout(() => expire.current?.(), FOLLOW_UP_MS)
    return () => clearTimeout(followUp)
  }, [over, until])

  if (!until) return null
  return (
    <div className="flex flex-col items-center text-center">
      <span className="text-[11px] font-medium tracking-wide text-brand-muted uppercase">{label}</span>
      <span
        role="timer"
        className={cn(
          'mt-0.5 text-2xl leading-none font-bold tabular-nums sm:text-3xl',
          urgent && left <= DANGER_MS ? 'text-destructive' : 'text-brand',
        )}
      >
        {showLeft(left)}
      </span>
    </div>
  )
}

// The longest a browser timer can wait (about 24.8 days); a later moment is waited for in steps.
const MAX_TIMER_MS = 2 ** 31 - 1

/** Whether the moment `at` (a timestamp, or null for none) has come - it turns true at that moment, with no reload. */
function useMomentPassed(at) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (at === null || at <= now) return undefined
    const timer = setTimeout(() => setNow(Date.now()), Math.min(at - now + 50, MAX_TIMER_MS))
    return () => clearTimeout(timer)
  }, [at, now])
  return at !== null && at <= now
}

/**
 * Create Bid on a Pre Bid whose technical bid has closed. Once its Financial
 * Bid Start has passed it is disabled, and says why (a disabled button gets no
 * pointer events, so the hint is on a focusable wrapper).
 */
function CreateBidButton({ event, onCreateBid }) {
  const start = financialStartOf(event)
  const passed = useMomentPassed(start)
  const button = (
    <Button
      type="button"
      size="sm"
      icon={FilePlus2}
      disabled={passed}
      aria-describedby={passed ? `create-bid-${event.id}-why` : undefined}
      onClick={() => onCreateBid(event)}
    >
      Create Financial Bid
    </Button>
  )
  if (!passed) return button
  const why = `The Financial Bid Start (${showWhen(event.starting_date, event.starting_time)}) has passed.`
  return (
    <Tooltip text={why}>
      <span tabIndex={0} className="inline-flex rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        {button}
        <span id={`create-bid-${event.id}-why`} className="sr-only">
          {why}
        </span>
      </span>
    </Tooltip>
  )
}

/** "Starts  05-11-2026 | 09:45", the label muted, the moment in the brand colour. */
function When({ label, date, time }) {
  return (
    <div className="flex items-baseline gap-2 whitespace-nowrap sm:justify-end">
      <dt className="text-brand-muted">{label}</dt>
      <dd className="font-semibold text-brand tabular-nums">
        {date ? (
          <>
            {date}
            <span className="mx-1 text-brand-muted">|</span>
            {time || '--'}
          </>
        ) : (
          '--'
        )}
      </dd>
    </div>
  )
}

export function Windows({ event }) {
  if (event.kind === EVENT_KIND.PRE_BID) {
    return (
      <dl className="space-y-0.5 text-xs">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <div>

            <When label="Technical Starts" date={event.pre_starting_date} time={event.pre_starting_time} />
            <When label="Financial Starts" date={event.starting_date} time={event.starting_time} />
          </div>
          <div>
            <When label="Technical Closes" date={event.pre_closing_date} time={event.pre_closing_time} />
            <When label="Financial Closes" date={event.closing_date} time={event.closing_time} />
          </div>
        </div>
      </dl>
    )
  }
  return (
    <dl className="space-y-0.5 text-xs">
      <When label="Starts" date={event.starting_date} time={event.starting_time} />
      <When label="Closes" date={event.closing_date} time={event.closing_time} />
    </dl>
  )
}

/** Why a running Bid's vendors are not shown (Hide Vendor Details). */
function VendorsHidden() {
  return (
    <p className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      <EyeOff className="size-3.5" /> Vendor details are hidden while this Financial Bid runs (Hide Vendor Details).
    </p>
  )
}

/**
 * The products, one row each; the arrow in a row's Action column opens its
 * vendors in a row under it (`opened` holds the open rows' keys).
 */
function ProductTable({ event, opened, onToggle, onProfile, onCertificateVerified }) {
  const showSku = useSkuManagement()
  const showLowest = event.kind === EVENT_KIND.BID && event.stage !== EVENT_STAGE.UPCOMING
  const hidden = amountsHidden(event)
  const columns = 8 + (showLowest ? 1 : 0)
  // The lowest bid is in the company's currency (foreign bids are converted as they are placed);
  // its own sign is looked up only when a vendor of this bid bids in another currency.
  const hasForeign =
    showLowest && event.product.some((product) => Array.isArray(product.vendor) && product.vendor.some(bidCurrencyOf))
  const { base } = useCompanyCurrency({ load: hasForeign })
  const lowestOf = (value) => (hasForeign && base ? moneyIn(value, base.code) : showAmount(value))

  return (
    // A size container: a product's opened vendors are kept to the visible width
    // (100cqw) and stay in view while this table scrolls sideways on a narrow screen.
    <Table containerClassName="@container rounded-md border border-border">
      <TableHeader className="bg-muted">
        <TableRow className="hover:bg-transparent">
          <TableHead width={40}>#</TableHead>
          <TableHead>Product</TableHead>
          <TableHead width={100}>HSN</TableHead>
          <TableHead width={90}>Unit</TableHead>
          <TableHead width={80}>Qty</TableHead>
          <TableHead width={110}>Delivery Days</TableHead>
          {showLowest ? <TableHead width={130}>Lowest Bid</TableHead> : null}
          <TableHead width={80}>Vendors</TableHead>
          <TableHead width={70} className="text-center">
            Action
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {event.product.map((product, index) => {
          const key = productKey(product, index)
          const isOpen = opened.has(key)
          const name = product.product_name || `product ${index + 1}`
          return (
            <Fragment key={key}>
              <TableRow data-state={isOpen ? 'selected' : undefined}>
                <TableCell className="align-top">{orDash(product.sr_no ?? index + 1)}</TableCell>
                <TableCell wrap className="align-top">
                  <span className="font-medium">{orDash(product.product_name)}</span>
                  {showSku && product.sku_code ? (
                    <SkuDetailsTooltip details={skuDetailList(product.sku_details)}>
                      <span tabIndex={0} className="ml-2 cursor-help rounded bg-brand-soft px-1.5 py-0.5 text-[11px] text-brand">
                        {product.sku_code}
                      </span>
                    </SkuDetailsTooltip>
                  ) : null}
                  {product.Description ? (
                    <span className="block text-xs text-muted-foreground">
                      <span className="text-brand-muted">Desc:</span> {product.Description}
                    </span>
                  ) : null}
                  {product.Specification ? (
                    <span className="block text-xs text-muted-foreground">
                      <span className="text-brand-muted">Spec:</span> {product.Specification}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="align-top">{orDash(product.hsn)}</TableCell>
                <TableCell className="align-top">{orDash(product.Per)}</TableCell>
                <TableCell className="align-top tabular-nums">{orDash(product.qty)}</TableCell>
                <TableCell className="align-top tabular-nums">{orDash(product.delivery_days)}</TableCell>
                {showLowest ? (
                  <TableCell className="align-top font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
                    {hidden ? 'Hidden' : lowestOf(product.last_bid)}
                  </TableCell>
                ) : null}
                <TableCell className="align-top tabular-nums">{Array.isArray(product.vendor) ? product.vendor.length : 0}</TableCell>
                <TableCell className="text-center align-top">
                  <Button
                    type="button"
                    variant="iconEdit"
                    size="icon-sm"
                    icon={ChevronDown}
                    className={cn('[&_svg]:transition-transform', isOpen && 'text-brand [&_svg]:rotate-180')}
                    tooltip={isOpen ? 'Hide vendors' : 'Show vendors'}
                    aria-label={`${isOpen ? 'Hide' : 'Show'} vendors of ${name}`}
                    aria-expanded={isOpen}
                    onClick={() => onToggle(key)}
                  />
                </TableCell>
              </TableRow>
              {isOpen ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columns} className="bg-muted/30 p-0 whitespace-normal">
                    <div className="sticky left-0 max-w-[100cqw] p-2">
                      {vendorBidsHidden(event) ? (
                        <VendorsHidden />
                      ) : (
                        <ProductVendors
                          event={event}
                          product={product}
                          onProfile={onProfile}
                          onCertificateVerified={onCertificateVerified}
                        />
                      )}
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

export default function EventCard({
  event,
  onView,
  onEdit,
  onCancel,
  onChat,
  onExpire,
  onCertificateVerified,
  onCreateBid,
}) {
  const [opened, setOpened] = useState(() => new Set())
  const [profileOf, setProfileOf] = useState(null)

  const preBid = event.kind === EVENT_KIND.PRE_BID
  const { label } = EVENT_KINDS[event.kind]
  const running = event.stage === EVENT_STAGE.ONGOING && !event.cancelled
  const upcoming = event.stage === EVENT_STAGE.UPCOMING && !event.cancelled
  const canChat = preBid && event.stage !== EVENT_STAGE.UPCOMING
  const editable = isEditable(event)
  // For the "Show All Vendors" button below, commented out with it - uncomment both together.
  // const allOpen = event.product.length > 0 && event.product.every((product, index) => opened.has(productKey(product, index)))

  const toggle = (key) =>
    setOpened((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  // const toggleAll = () => setOpened(allOpen ? new Set() : new Set(event.product.map(productKey)))

  return (
    <article className="relative overflow-hidden rounded-lg border border-brand/30 bg-card shadow-xs">
      <CancelledWatermark event={event} />
      {/* Number left, time remaining in the middle (while it runs), dates right; stacked on a phone. */}
      <header className="grid grid-cols-1 items-center gap-x-6 gap-y-2 border-b border-border bg-muted/40 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:px-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs text-brand-muted">{label} No</p>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-brand" title={event.Auction_no}>
              {event.Auction_no || '--'}
            </h3>
            <EventStatusBadge event={event} />
          </div>
        </div>
        {running ? (
          <Countdown until={event.closes_at} onExpire={onExpire} />
        ) : upcoming && event.opens_at > 0 ? (
          // Counts down to the start, so the list is read again as it opens.
          <Countdown until={event.opens_at} onExpire={onExpire} label="Starts In" urgent={false} />
        ) : (
          <div aria-hidden="true" className="hidden sm:block" />
        )}
        <div className="sm:justify-self-end">
          <Windows event={event} />
        </div>
      </header>

      <div className="space-y-2.5 px-3 py-3 sm:px-4">
        {event.product.length === 0 ? (
          <p className="text-sm text-muted-foreground">No product.</p>
        ) : (
          <>
            <ProductTable
              event={event}
              opened={opened}
              onToggle={toggle}
              onProfile={setProfileOf}
              onCertificateVerified={(vendor, certificateName) => onCertificateVerified?.(event, vendor, certificateName)}
            />
            {/* <div>
               <Button type="button" variant="link" size="sm" className="h-7 px-0" aria-expanded={allOpen} onClick={toggleAll}>
                {allOpen ? 'Hide All Vendors' : `Show All Vendors (${event.vendor_count})`}
                <ChevronDown className={cn('size-3.5 transition-transform', allOpen && 'rotate-180')} />
              </Button>
            </div> */}
          </>
        )}
        {preBid ? <PreBidDetails event={event} className="pt-0.5" /> : null}
      </div>

      <footer className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted/40 px-3 py-2 sm:px-4">
        <Button type="button" variant="outline" size="sm" icon={Eye} onClick={() => onView(event)}>
          Details
        </Button>
        {canChat ? (
          <Button type="button" variant="outline" size="sm" icon={MessagesSquare} onClick={() => onChat(event)}>
            Chat
          </Button>
        ) : null}
        {onCreateBid && canCreateBidFrom(event) ? <CreateBidButton event={event} onCreateBid={onCreateBid} /> : null}
        {editable ? (
          <>
            <Button type="button" variant="outline" size="sm" icon={Pencil} onClick={() => onEdit(event)}>
              Edit
            </Button>
            <Button type="button" variant="destructive" size="sm" icon={Ban} onClick={() => onCancel(event)}>
              Cancel {label}
            </Button>
          </>
        ) : null}
      </footer>

      {profileOf ? <VendorProfileModal vendor={profileOf} event={event} onClose={() => setProfileOf(null)} /> : null}
    </article>
  )
}
