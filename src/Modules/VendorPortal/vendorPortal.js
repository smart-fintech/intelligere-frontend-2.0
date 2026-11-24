/**
 * The vendor portal's plain logic - no React, no requests.
 *
 * The vendor lists (payload_res: vendor_auction_list/, vendor_pre_bid_list/)
 * are the company's lists cut down to one vendor: the same records, Ongoing and
 * Completed only, each product carrying this vendor alone in `vendor` and the
 * product's lowest bid in `last_bid`. So they are read with the Procurement
 * module's readEvents, and only what is the vendor's own is worked out here.
 *
 *   readVendorEvents   a list reply -> { Ongoing: [event], Completed: [event] }
 *   myEntry            this vendor's record on a product (its bid, rank, history)
 *   bidRules           the most this vendor may bid now, and why
 *   bidErrors          { field: message } for the bid form - empty when it can be sent
 *   buildBidBody       the vendor_bid payload (a foreign vendor's bid converted once, here)
 *
 * THE BID RULES. The backend saves any bid and only ranks them, so the rules a
 * reverse auction runs on are checked here, before anything is sent:
 *   - a bid is above 0, at most 2 decimals, and not more than the starting amount
 *   - it beats the vendor's own last bid by at least the bid gap (a % of that
 *     bid, or a ₹ amount) - as the old portal's DisplayAuctionData did, whether
 *     or not the company hides the bid amounts; a vendor's first bid has only
 *     the starting amount above it
 *   - delivery days are whole days above 0; a note is added to the vendor's notes
 * A bid, new delivery days or a note can each be sent on its own.
 *
 * A VENDOR FROM ANOTHER COUNTRY bids in the currency the company gave it on
 * THIS auction (its entry's `currency` / `conversion_rate`, bidCurrencyOf). The
 * box takes its own currency; every rule above is checked on the amount
 * converted to the company's currency (toBaseAmount, to 2 decimals), and that
 * converted amount is what `last_vender_bid` carries - once, as the payload is
 * built from what was typed, so nothing is ever converted twice. Every amount
 * the lists send back (last_bid, last_vender_bid, bid_history) is the
 * company's; the vendor's figure is fromBaseAmount of it.
 */

import { EVENT_KIND, EVENT_STAGE } from '@/Constants/procurementAutomation'
import { QUERY } from '@/Constants/queryKeys'
import { readEvents, showAmount } from '@/Modules/Procurement/procurement'
import { bidCurrencyOf, moneyIn, plainAmount, toBaseAmount } from '@/Modules/Procurement/vendorCurrency'

const asList = (value) => (Array.isArray(value) ? value : [])
const asText = (value) => (value === null || value === undefined ? '' : String(value).trim())
const sameEmail = (a, b) => asText(a).toLowerCase() === asText(b).toLowerCase()

export const VENDOR_STAGES = [EVENT_STAGE.ONGOING, EVENT_STAGE.COMPLETED]

export const readVendorEvents = (reply, kind) => {
  const events = readEvents(reply, kind)
  return Object.fromEntries(VENDOR_STAGES.map((stage) => [stage, events[stage]]))
}

export const vendorEventsKey = (email, kind) => [QUERY.VENDOR_EVENTS, asText(email).toLowerCase(), kind]

/** This vendor's record on a product - the list sends only it, matched by email to be sure. */
export const myEntry = (product, email) => {
  const vendors = asList(product?.vendor)
  return vendors.find((vendor) => sameEmail(vendor?.email, email)) ?? vendors[0] ?? null
}

/** This vendor's record anywhere in the lists - its id, name and `Profile` - or null before any bid invites it. */
export const findMyRecord = (lists, email) => {
  for (const list of lists) {
    for (const stage of VENDOR_STAGES) {
      for (const event of asList(list?.[stage])) {
        for (const product of event.product) {
          const mine = asList(product?.vendor).find((vendor) => sameEmail(vendor?.email, email))
          if (mine) return mine
        }
      }
    }
  }
  return null
}

/** Whether a vendor can bid on it now: a running, uncancelled Bid. */
export const canBid = (event) =>
  event.kind === EVENT_KIND.BID && event.stage === EVENT_STAGE.ONGOING && !event.cancelled && event.auction_end !== true

/** Whether its chat can be written in: a running, uncancelled Pre Bid. */
export const canChat = (event) =>
  event.kind === EVENT_KIND.PRE_BID && event.stage === EVENT_STAGE.ONGOING && !event.cancelled

const floor2 = (value) => Math.floor(value * 100 + 1e-6) / 100

/**
 *   lowest      the product's lowest bid (0: none yet)
 *   own         this vendor's last bid (0: none yet)
 *   hidden      the company hides the bid amounts - `lowest` is not shown
 *   reference   what a new bid must beat: `own` (0: no bid yet)
 *   gapAmount   the bid gap in ₹ against that reference
 *   max         the most that may be bid now (Infinity: no limit), 0 when no lower bid is possible
 *   starting    the starting amount (0: none)
 *   currency    this vendor's { code, rate } on this auction, or null (bids in the company's currency)
 *   maxOwn      `max` in that currency, rounded down to the cent (= max without one)
 *
 * Every amount but maxOwn is the company's.
 */
export const bidRules = (event, product, mine) => {
  const lowest = Number(product?.last_bid) > 0 ? Number(product.last_bid) : 0
  const own = Number(mine?.last_vender_bid) > 0 ? Number(mine.last_vender_bid) : 0
  const hidden = event?.hide_lowest_bid_amount === true
  const reference = own
  const gap = Number(event?.gap) > 0 ? Number(event.gap) : 0
  const gapAmount = reference > 0 ? (event?.bid_gap_percentage ? (reference * gap) / 100 : gap) : 0
  const starting = Number(event?.starting_bid_amount) > 0 ? Number(event.starting_bid_amount) : 0

  let max = reference > 0 ? floor2(reference - gapAmount) : Infinity
  if (starting > 0) max = Math.min(max, starting)
  max = Math.max(0, max)
  const currency = bidCurrencyOf(mine)
  // Rounded down, so the most the vendor may type never converts to more than `max`.
  const maxOwn = currency && Number.isFinite(max) ? floor2(max / currency.rate) : max
  return {
    lowest,
    own,
    hidden,
    reference,
    gapAmount,
    max,
    starting,
    currency,
    maxOwn,
  }
}

/** The bid typed, in the company's currency - converted when the vendor has a currency; null when it is not a number. */
export const convertedBid = (amount, rules) => {
  const text = asText(amount)
  if (text === '' || !Number.isFinite(Number(text))) return null
  return rules.currency ? toBaseAmount(text, rules.currency.rate) : Number(text)
}

/** "$ 100.00" for a vendor with a currency, "₹ 100.00" (as before) without. */
export const showOwnAmount = (value, rules) => (rules.currency ? moneyIn(value, rules.currency.code) : showAmount(value))

/** What the most allowed bid is, in words - for the hint under the box and the error. */
export const bidLimitText = (rules) => {
  if (rules.max === 0 || rules.maxOwn === 0) return 'No lower bid is possible with this bid gap.'
  if (!Number.isFinite(rules.max)) return 'Any amount above 0.'
  const most = rules.currency
    ? `${showOwnAmount(rules.maxOwn, rules)} (${plainAmount(rules.max)} converted)`
    : showAmount(rules.max)
  if (rules.reference === 0) return `At most ${most} (the starting amount).`
  return `At most ${most} - your last bid less the bid gap.`
}

export const emptyBidForm = () => ({ amount: '', delivery_days: '', note: '' })

export const BID_FORM_ERROR = 'form'

export const bidErrors = (form, rules, mine) => {
  const errors = {}
  const amount = asText(form.amount)
  const days = asText(form.delivery_days)
  const note = asText(form.note)

  if (amount !== '') {
    const value = Number(amount)
    // The rules are the company's, so they are checked on the converted amount.
    const converted = convertedBid(amount, rules)
    if (!Number.isFinite(value) || value <= 0) errors.amount = 'Enter an amount above 0.'
    else if (!/^\d+(\.\d{1,2})?$/.test(amount)) errors.amount = 'At most 2 decimals.'
    else if (!(converted > 0)) errors.amount = 'Too small - it converts to 0.'
    else if (rules.own > 0 && converted === rules.own) errors.amount = 'This is already your bid.'
    else if (converted > rules.max) errors.amount = bidLimitText(rules)
  }
  if (days !== '' && !(/^\d+$/.test(days) && Number(days) > 0)) errors.delivery_days = 'Whole days above 0.'

  const daysChanged = days !== '' && days !== asText(mine?.delivery_days)
  if (!errors.amount && !errors.delivery_days && amount === '' && !daysChanged && note === '') {
    errors[BID_FORM_ERROR] = 'Enter a bid, new delivery days or a note.'
  }
  return errors
}

/** The vendor_bid payload: only what changed is sent, so the backend keeps the rest as it is. */
export const buildBidBody = ({ event, product, mine, form }) => {
  const amount = asText(form.amount)
  // The ONE conversion: from what was typed (never from an amount already converted).
  const currency = bidCurrencyOf(mine)
  const days = asText(form.delivery_days)
  const note = asText(form.note)

  const entry = { id: mine.id }
  if (amount !== '') entry.last_vender_bid = String(currency ? toBaseAmount(amount, currency.rate) : Number(amount))
  if (days !== '' && days !== asText(mine.delivery_days)) entry.delivery_days = days
  // The note as plain text ("notes": "hello world"); the backend stores it in place of the earlier one.
  if (note !== '') entry.notes = note

  return {
    auction_id: event.id,
    product: [{ sr_no: product.sr_no, vendor: [entry] }],
  }
}
