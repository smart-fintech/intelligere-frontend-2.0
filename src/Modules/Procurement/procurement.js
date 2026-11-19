/**
 * Procurement Automation's plain logic - no React, no requests.
 *
 * THIS FILE IS THE ONE PLACE THE REPLIES' PROPERTIES ARE NAMED (payload_res:
 * procurement/auction_create/, pre_bid_create/; inventory/product/). The
 * screens read what these functions hand them, so a property the backend
 * renames is corrected here and nowhere else.
 *
 *   Dates          the API writes "22-10-2026" and "10:00" (India time); the
 *                  form's date boxes "2026-10-22"
 *   readEvents     a list reply -> { Ongoing: [event], Upcoming: [...], Completed: [...] }
 *   readProductOptions  the Product API's rows -> the products the form offers;
 *                  vendorChoicesFor their linked vendors, from the vendor master
 *   Form           emptyMaster / masterFromEvent / validateMaster / newProductRow / rowsFromEvent /
 *                  rowErrors / technical bid; the errors are one flat map (rowErrorKey ...)
 *   Payloads       buildCreateBody / buildUpdateBody
 *   Showing        overallRating, showAmount, bidGapLabel, sortVendorsByBid ...
 */

import { EVENT_KIND, EVENT_KINDS, EVENT_STAGE, EVENT_STAGES } from '@/Constants/procurementAutomation'
import { QUERY } from '@/Constants/queryKeys'
import { invalidateQueries } from '@/Library/queryCache'
import { formatTime, isOnStep, parseTime, showTime12 } from '@/Library/timeOfDay'
import { isHtmlEmpty, sanitizeHtml, toRichText } from '@/Utils/richText'

const asList = (value) => (Array.isArray(value) ? value : [])
const asText = (value) => (value === null || value === undefined ? '' : String(value).trim())

/* ------------------------------------------------------------------ */
/* Dates                                                              */
/* ------------------------------------------------------------------ */

/** "2026-10-22" -> "22-10-2026"; '' for anything else. */
export const toApiDate = (inputDate) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asText(inputDate))
  return match ? `${match[3]}-${match[2]}-${match[1]}` : ''
}

/** "22-10-2026" -> "2026-10-22"; '' for anything else. */
export const fromApiDate = (apiDate) => {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(asText(apiDate))
  return match ? `${match[3]}-${match[2]}-${match[1]}` : ''
}

/** An API date and time as a timestamp (the browser's local time), or null. */
export const momentOf = (apiDate, time) => {
  const day = /^(\d{2})-(\d{2})-(\d{4})$/.exec(asText(apiDate))
  const clock = /^(\d{1,2}):(\d{2})/.exec(asText(time))
  if (!day || !clock) return null
  return new Date(Number(day[3]), Number(day[2]) - 1, Number(day[1]), Number(clock[1]), Number(clock[2])).getTime()
}

const inputMoment = (inputDate, time) => momentOf(toApiDate(inputDate), time)

/** "22-10-2026 10:00", or '--'. */
export const showWhen = (apiDate, time) => (asText(apiDate) ? `${asText(apiDate)} ${asText(time)}`.trim() : '--')

/* ------------------------------------------------------------------ */
/* Reading the lists                                                  */
/* ------------------------------------------------------------------ */

/** One vendor wherever it is listed: by its id, by its email for a record without one. */
export const vendorKey = (vendor) => asText(vendor?.id ?? vendor?.email).toLowerCase()

/** The vendors of an event, once each, though most are on several of its products. */
export const collectVendors = (products) => {
  const found = new Map()
  asList(products).forEach((product) =>
    asList(product?.vendor).forEach((vendor) => {
      const key = vendorKey(vendor)
      if (key && !found.has(key)) found.set(key, vendor)
    }),
  )
  return [...found.values()]
}

/**
 * One record of a list, with what every screen needs worked out once:
 *
 *   id          auction_id or pre_bid_id
 *   kind/stage  which list it came from
 *   cancelled   auction_cancel / pre_bid_cancel
 *   opens_at / closes_at   the window the stage runs on, as timestamps (a pre
 *               bid's is its technical bid window) - for sorting and the countdown
 *   extra_time  also read under "extra_ time", as the auction list spells it
 */
export const readEvent = (raw, kind, stage) => {
  const { idKey, cancelKey } = EVENT_KINDS[kind]
  const preBid = kind === EVENT_KIND.PRE_BID
  const products = asList(raw?.product)
  const opens = preBid ? momentOf(raw?.pre_starting_date, raw?.pre_starting_time) : momentOf(raw?.starting_date, raw?.starting_time)
  const closes = preBid ? momentOf(raw?.pre_closing_date, raw?.pre_closing_time) : momentOf(raw?.closing_date, raw?.closing_time)

  return {
    ...raw,
    id: raw?.[idKey] ?? null,
    kind,
    stage,
    cancelled: raw?.[cancelKey] === true,
    extra_time: raw?.extra_time ?? raw?.['extra_ time'] ?? '',
    product: products,
    file: asList(raw?.file),
    opens_at: opens ?? 0,
    closes_at: closes ?? 0,
    product_count: products.length,
    vendor_count: collectVendors(products).length,
  }
}

/** A list reply, by stage - every stage present, empty when the reply has none. */
export const readEvents = (reply, kind) => {
  const { listSuffix } = EVENT_KINDS[kind]
  return Object.fromEntries(
    EVENT_STAGES.map((stage) => [stage, asList(reply?.[`${stage} ${listSuffix}`]).map((raw) => readEvent(raw, kind, stage))]),
  )
}

export const eventsKey = (companyId, kind) => [QUERY.PROCUREMENT_EVENTS, companyId, kind]

/**
 * A bid list (readEvents) with a live bid_update applied (ws/auction_bid/):
 * each product it carries replaces the product of the same sr_no - all its
 * vendors, their bids, ranks and history - the others are kept, and the
 * closing date and time are taken from it (an extension moves them). Null
 * when the list cannot take it as it is - the bid is not in it, or a product
 * is new to it - so the caller loads the list again instead.
 */
export const applyBidUpdate = (events, update) => {
  if (!events || update?.type !== 'bid_update') return null
  const changed = new Map(asList(update.products).map((product) => [asText(product?.sr_no), product]))
  let applied = false
  let unknown = false
  const next = Object.fromEntries(
    Object.entries(events).map(([stage, list]) => [
      stage,
      list.map((event) => {
        if (event.kind !== EVENT_KIND.BID || asText(event.id) !== asText(update.auction_id)) return event
        const own = new Set(event.product.map((product) => asText(product?.sr_no)))
        if ([...changed.keys()].some((srNo) => !own.has(srNo))) unknown = true
        applied = true
        const raw = {
          ...event,
          product: event.product.map((product) => changed.get(asText(product?.sr_no)) ?? product),
          closing_date: update.closing_date || event.closing_date,
          closing_time: update.closing_time || event.closing_time,
        }
        return readEvent(raw, event.kind, event.stage)
      }),
    ]),
  )
  return applied && !unknown ? next : null
}

/**
 * A pre bid list (readEvents) with one vendor's certificate marked verified -
 * after the verify call succeeds, so the screen shows it without reading the
 * list again. Every entry of that vendor (by email) in that pre bid gets it;
 * the certificate is matched by name as the profile spells it. Null when the
 * list has no such certificate, so the caller reads the list instead.
 */
export const markCertificateVerified = (events, { eventId, vendorEmail, certificateName }) => {
  if (!events) return null
  const email = asText(vendorEmail).toLowerCase()
  const name = asText(certificateName).toLowerCase()
  let marked = false
  const markProfile = (profile) => {
    if (!profile || typeof profile !== 'object' || !Array.isArray(profile.technical_certifications)) return profile
    return {
      ...profile,
      technical_certifications: profile.technical_certifications.map((certificate) => {
        if (asText(certificate?.certificate_name).toLowerCase() !== name) return certificate
        marked = true
        return { ...certificate, certificate_verified: true }
      }),
    }
  }
  const next = Object.fromEntries(
    Object.entries(events).map(([stage, list]) => [
      stage,
      list.map((event) => {
        if (event.kind !== EVENT_KIND.PRE_BID || asText(event.id) !== asText(eventId)) return event
        return {
          ...event,
          product: event.product.map((product) => ({
            ...product,
            vendor: asList(product.vendor).map((vendor) =>
              asText(vendor?.email).toLowerCase() === email ? { ...vendor, Profile: markProfile(vendor.Profile) } : vendor,
            ),
          })),
        }
      }),
    ]),
  )
  return marked ? next : null
}

/** After a create, an edit or a cancel - the list on screen is read again at once. */
export const refreshEvents = (companyId, kind) =>
  invalidateQueries(QUERY.PROCUREMENT_EVENTS, { whose: [companyId, kind], refetchActive: true })

/** Whether an event can still be edited or cancelled. */
export const isEditable = (event) => !event.cancelled && event.stage !== EVENT_STAGE.COMPLETED

/* ------------------------------------------------------------------ */
/* The products and vendors the form offers                           */
/* ------------------------------------------------------------------ */

/**
 * A vendor of the vendor master (inventory/vendor_create/). Its name is the
 * ledger name the company gave it, in `company_details` under the company's
 * id, as its rating is.
 */
const readVendorOption = (raw, companyId) => {
  const id = raw?.vendor_id ?? raw?.id ?? null
  const details = raw?.company_details?.[companyId] ?? null
  return {
    id,
    name: asText(details?.ledger_name) || asText(raw?.name) || asText(raw?.email) || `Vendor ${id}`,
    company: asText(raw?.vendor_company_name),
    email: asText(raw?.email),
    contact: asText(raw?.contact),
    whatsapp: asText(raw?.whatsapp),
    address: asText(raw?.address),
    gst_no: asText(raw?.gst_no),
    // Where it is - for its currency on a Bid (Modules/Procurement/vendorCurrency); never stored on the event.
    country: asText(raw?.country),
    state: asText(raw?.state),
    rating: raw?.rating?.[companyId] ?? null,
    deleted: details?.is_deleted === true,
  }
}

/** A list reply, bare or under `data` / `results` - anything else is no rows. */
const replyList = (reply) =>
  Array.isArray(reply) ? reply : Array.isArray(reply?.data) ? reply.data : asList(reply?.results)

/** Vendors that can be invited: with an id, and not deleted by this company. */
export const readVendorOptions = (rows, companyId) =>
  replyList(rows)
    .map((vendor) => readVendorOption(vendor, companyId))
    .filter((vendor) => vendor.id !== null && !vendor.deleted)

/** A SKU row's vendors - Product.vendor, [{ id, name }] - as ids. */
const vendorIdsOf = (variant) =>
  asList(variant?.vendor)
    .map((ref) => asText(ref && typeof ref === 'object' ? ref.id : ref))
    .filter(Boolean)

/**
 * The products the form offers, from the Product API (inventory/product/, the
 * rows useProducts holds - one per product name, its SKU rows in sku_variants):
 *
 *   [{ id, name, hsn, per, variants, vendorIds }]
 *   variants    the live SKU rows with a code - the SKUs to choose from
 *   vendorIds   the vendors linked to any of its SKU rows (Product.vendor)
 *
 * The Product API names a product's vendors by id only; their details come
 * from the vendor master (vendorChoicesFor). A product without a name cannot
 * be chosen.
 */
export const readProductOptions = (rows) =>
  asList(rows)
    .map((raw) => {
      const name = asText(raw?.['Product Name'])
      const live = asList(raw?.sku_variants).filter((variant) => variant?.deleted !== true)
      return {
        id: name.toLowerCase(),
        name,
        hsn: asText(raw?.['HSN Code']),
        per: asText(raw?.['Per Unit']),
        variants: live.filter((variant) => asText(variant?.sku_code)),
        vendorIds: [...new Set(live.flatMap(vendorIdsOf))],
      }
    })
    .filter((product) => product.name)

/**
 * The vendors a product can be offered to: only those linked to it - to the
 * chosen SKU's row when `skuCode` is given, else to any of its rows - as the
 * vendor master has them (a linked vendor no longer in the master is left out,
 * there is no address to invite).
 */
export const vendorChoicesFor = (product, companyVendors, skuCode = '') => {
  if (!product) return []
  const sku = asText(skuCode).toLowerCase()
  const variant = sku ? product.variants.find((row) => asText(row?.sku_code).toLowerCase() === sku) : null
  const linked = new Set(variant ? vendorIdsOf(variant) : product.vendorIds)
  return companyVendors.filter((vendor) => linked.has(String(vendor.id)))
}

/**
 * Why a new Bid / Pre Bid cannot be made yet, or null when it can.
 *
 *   products      readProductOptions' list
 *   vendorCount   how many vendors the company's vendor master holds
 *   label         'Bid' or 'Pre Bid', for the sentence
 *
 * A product with no vendor linked does not block the form - it shows that
 * product has nobody to invite (vendorChoicesFor).
 *
 * -> { message, create: ['product'] | ['vendor'] | ['product', 'vendor'] } - what
 *    to create to get past it.
 */
export const creationBlocker = ({ products, vendorCount, label = 'Bid' }) => {
  const noun = label.toLowerCase()
  const hasProducts = products.length > 0
  const hasVendors = vendorCount > 0

  if (!hasProducts && !hasVendors) {
    return { message: `Please create a product and vendor before creating a ${noun}.`, create: ['product', 'vendor'] }
  }
  if (!hasProducts) return { message: `Please create or add a product before creating a ${noun}.`, create: ['product'] }
  if (!hasVendors) return { message: `Please create or add a vendor before creating a ${noun}.`, create: ['vendor'] }
  return null
}

/**
 * What an event stores of a vendor - the vendor as it was when it was invited.
 * Its country is not one of them: it is the vendor master's. A foreign
 * vendor's `currency` and `conversion_rate` are added on save
 * (withVendorCurrencies, Modules/Procurement/vendorCurrency).
 */
export const toEventVendor = (option) => {
  const vendor = { id: option.id, name: option.name, email: option.email }
  ;['company', 'contact', 'whatsapp', 'address', 'gst_no'].forEach((field) => {
    if (option[field]) vendor[field] = option[field]
  })
  if (option.rating) vendor.rating = option.rating
  return vendor
}

/* ------------------------------------------------------------------ */
/* The form: master details                                           */
/* ------------------------------------------------------------------ */

/** The master details as the form holds them - dates as the date boxes write them. */
export const emptyMaster = () => ({
  Auction_no: '',
  pre_starting_date: '',
  pre_starting_time: '',
  pre_closing_date: '',
  pre_closing_time: '',
  starting_date: '',
  starting_time: '',
  closing_date: '',
  closing_time: '',
  starting_bid_amount: '',
  // The gap starts in % (1%); the form's toggle switches the unit, never the number.
  bid_gap_percentage: true,
  gap: '1',
  hide_vendor: false,
  hide_lowest_bid_amount: false,
  add_extra_time: false,
  extra_time: '',
  // Pre Bid only: minutes before the Technical Bid Start that vendors are emailed a reminder ('' = none).
  vendor_email_reminder: '',
})

/**
 * A saved event's master details in the form's shape, for the edit form to show
 * (read only - an update never sends them).
 */
export const masterFromEvent = (event) => ({
  Auction_no: asText(event?.Auction_no),
  pre_starting_date: fromApiDate(event?.pre_starting_date),
  pre_starting_time: asText(event?.pre_starting_time),
  pre_closing_date: fromApiDate(event?.pre_closing_date),
  pre_closing_time: asText(event?.pre_closing_time),
  starting_date: fromApiDate(event?.starting_date),
  starting_time: asText(event?.starting_time),
  closing_date: fromApiDate(event?.closing_date),
  closing_time: asText(event?.closing_time),
  starting_bid_amount: Number(event?.starting_bid_amount) > 0 ? asText(event.starting_bid_amount) : '',
  bid_gap_percentage: event?.bid_gap_percentage === true,
  gap: asText(event?.gap),
  hide_vendor: event?.hide_vendor === true,
  hide_lowest_bid_amount: event?.hide_lowest_bid_amount === true,
  add_extra_time: event?.add_extra_time === true && Number(event?.extra_time) > 0,
  extra_time: Number(event?.extra_time) > 0 ? asText(event.extra_time) : '',
  vendor_email_reminder: isWholePositive(event?.vendor_email_reminder) ? asText(event.vendor_email_reminder) : '',
})

const isPositive = (value) => asText(value) !== '' && Number(value) > 0
const isWholePositive = (value) => isPositive(value) && Number.isInteger(Number(value))

/** A minute's grace, so a start picked for "now" is not already past by the time Save is pressed. */
const PAST_GRACE_MS = 60 * 1000

/** Start and close times go in whole steps of this many minutes - 4:00, 4:15, 4:30, 4:45 ... */
export const TIME_STEP_MINUTES = 15

/** True for a time off the step (an old saved 4:05); the picker only offers on-step times, so this is a backstop. */
const offTimeStep = (time) => parseTime(time) !== null && !isOnStep(time, TIME_STEP_MINUTES)

/** One window's four boxes - each filled and on a TIME_STEP_MINUTES step, the start not past, the close after it. */
const checkWindow = (errors, master, start, close, now) => {
  ;[`${start}_date`, `${start}_time`, `${close}_date`, `${close}_time`].forEach((field) => {
    if (!master[field]) errors[field] = field.endsWith('_date') ? 'Choose a date.' : 'Choose a time.'
    else if (field.endsWith('_time') && offTimeStep(master[field])) {
      errors[field] = `Pick a time in ${TIME_STEP_MINUTES}-minute steps.`
    }
  })
  const opens = inputMoment(master[`${start}_date`], master[`${start}_time`])
  const closes = inputMoment(master[`${close}_date`], master[`${close}_time`])
  if (opens !== null && opens < now - PAST_GRACE_MS && !errors[`${start}_time`]) {
    errors[`${start}_time`] = 'This time is already past.'
  }
  if (opens !== null && closes !== null && closes <= opens && !errors[`${close}_time`]) {
    errors[`${close}_time`] = 'Must be after the start.'
  }
  return { opens, closes }
}

/**
 * The vendor email reminder's message (Pre Bid), or null when it is fine:
 * empty for none, or whole minutes above 0, and the moment it would be sent -
 *
 *   reminder = Technical Bid Start (date AND time) - the minutes
 *
 * - must still be ahead of now. The start is read as every window's is
 * (inputMoment: the browser's local time), and the minutes are taken off the
 * full timestamp, so a reminder that falls on the day before, or across noon,
 * comes out right (10:00 AM - 120 = 8:00 AM; 00:30 - 60 = 11:30 PM the day
 * before). Without a Technical Bid Start yet there is nothing to time it from,
 * and only the minutes are checked. The form runs this as either box changes,
 * and again on Save (validateMaster).
 */
export const vendorReminderError = (master, now = Date.now()) => {
  const text = asText(master?.vendor_email_reminder)
  if (text === '') return null
  if (!/^\d+$/.test(text) || Number(text) <= 0) return 'Enter whole minutes above 0, or leave it empty.'
  const start = inputMoment(master.pre_starting_date, master.pre_starting_time)
  if (start === null) return null
  const sendAt = new Date(start - Number(text) * 60000)
  if (sendAt.getTime() > now) return null
  const day = `${String(sendAt.getDate()).padStart(2, '0')}-${String(sendAt.getMonth() + 1).padStart(2, '0')}-${sendAt.getFullYear()}`
  const clock = showTime12(formatTime(sendAt.getHours(), sendAt.getMinutes()))
  return `The reminder would go out at ${clock} on ${day}, which is already past. Enter fewer minutes or a later Technical Bid Start.`
}

/** { field: message } - empty when the master details can be saved. Only a new event is checked: an edit cannot change them. */
export const validateMaster = (master, kind, now = Date.now()) => {
  const errors = {}
  if (!asText(master.Auction_no)) errors.Auction_no = 'Enter the bid number.'

  const bid = checkWindow(errors, master, 'starting', 'closing', now)
  if (kind === EVENT_KIND.PRE_BID) {
    const technical = checkWindow(errors, master, 'pre_starting', 'pre_closing', now)
    if (technical.closes !== null && bid.opens !== null && bid.opens < technical.closes && !errors.starting_time) {
      errors.starting_time = 'The bid must start after the technical bid closes.'
    }
    const reminder = vendorReminderError(master, now)
    if (reminder) errors.vendor_email_reminder = reminder
  }

  if (!isPositive(master.gap)) errors.gap = 'Enter a bid gap above 0.'
  else if (master.bid_gap_percentage && Number(master.gap) >= 100) errors.gap = 'A gap in % must be below 100.'

  if (asText(master.starting_bid_amount) !== '' && !isPositive(master.starting_bid_amount)) {
    errors.starting_bid_amount = 'Enter an amount above 0, or leave it empty.'
  }
  if (master.add_extra_time && !isWholePositive(master.extra_time)) errors.extra_time = 'Enter whole minutes above 0.'

  return errors
}

/** The master details as the API stores them. */
const buildMaster = (master, kind) => {
  const stored = {
    Auction_no: asText(master.Auction_no),
    starting_date: toApiDate(master.starting_date),
    starting_time: master.starting_time,
    closing_date: toApiDate(master.closing_date),
    closing_time: master.closing_time,
    starting_bid_amount: asText(master.starting_bid_amount),
    bid_gap_percentage: Boolean(master.bid_gap_percentage),
    gap: asText(master.gap),
    hide_vendor: Boolean(master.hide_vendor),
    hide_lowest_bid_amount: Boolean(master.hide_lowest_bid_amount),
    add_extra_time: Boolean(master.add_extra_time),
    extra_time: master.add_extra_time ? asText(master.extra_time) : '0',
  }
  if (kind !== EVENT_KIND.PRE_BID) return stored
  return {
    ...stored,
    pre_starting_date: toApiDate(master.pre_starting_date),
    pre_starting_time: master.pre_starting_time,
    pre_closing_date: toApiDate(master.pre_closing_date),
    pre_closing_time: master.pre_closing_time,
    vendor_email_reminder: asText(master.vendor_email_reminder),
  }
}

/* ------------------------------------------------------------------ */
/* The form: products                                                 */
/* ------------------------------------------------------------------ */

/**
 * A product row of the form: { key, locked, lockedVendorKeys, product }.
 * `product` is exactly what is saved. A row the event already had when the
 * edit opened is `locked` - only vendors can be added to it, and the vendors
 * it had (already invited) cannot be taken off.
 */
const ROW_KEY_PREFIX = 'product-row-'
let rowCount = 0
const nextRowKey = () => {
  rowCount += 1
  return `${ROW_KEY_PREFIX}${rowCount}`
}

export const rowsFromEvent = (event) =>
  asList(event?.product).map((product, index) => {
    const vendors = asList(product?.vendor)
    return {
      key: nextRowKey(),
      locked: true,
      lockedVendorKeys: vendors.map(vendorKey),
      product: { ...product, sr_no: product?.sr_no ?? index + 1, vendor: vendors },
    }
  })

/* ------------------------------------------------------------------ */
/* A Bid created from a Pre Bid (Create Bid)                          */
/* ------------------------------------------------------------------ */

/*
 * Once a Pre Bid's technical bid has closed (Completed, not cancelled), its
 * Financial Bid is created as an ordinary Bid - the Add Bid form and its save
 * (procurement/auction_create/), prefilled from the Pre Bid. Nothing links the
 * two on the backend; the Bid simply starts with the Pre Bid's number,
 * financial window, master options, products and vendors. It can be created
 * until the Pre Bid's Financial Bid Start has passed.
 */

/** True for a Pre Bid whose technical bid has closed - Create Bid is offered on it. */
export const canCreateBidFrom = (event) =>
  event?.kind === EVENT_KIND.PRE_BID && event.stage === EVENT_STAGE.COMPLETED && !event.cancelled

/** The Pre Bid's Financial Bid Start as a timestamp, or null. */
export const financialStartOf = (event) => momentOf(event?.starting_date, event?.starting_time)

/** The Bid's master details from the Pre Bid: its number, financial window and options (no technical window, no reminder). */
export const masterFromPreBid = (event) => ({
  ...masterFromEvent(event),
  pre_starting_date: '',
  pre_starting_time: '',
  pre_closing_date: '',
  pre_closing_time: '',
  vendor_email_reminder: '',
})

/** The Pre Bid's products as new rows of the Bid - each can be changed or taken out, as a row added in Add Bid. */
export const rowsFromPreBid = (event) =>
  rowsFromEvent(event).map((row) => ({ ...row, locked: false, lockedVendorKeys: [] }))

/**
 * The Pre Bid's vendors for the Create Bid checklist, once each:
 * [{ key, vendor, entries }] - `entries` is each row (by its key) the vendor was
 * on, with the entry as the Pre Bid saved it, so ticking it again puts it back
 * where it was.
 */
export const preBidVendorChoices = (rows) => {
  const found = new Map()
  rows.forEach((row) =>
    asList(row.product.vendor).forEach((vendor) => {
      const key = vendorKey(vendor)
      if (!key) return
      if (!found.has(key)) found.set(key, { key, vendor, entries: new Map() })
      found.get(key).entries.set(row.key, vendor)
    }),
  )
  return [...found.values()]
}

/** Whether a checklist vendor is in the Bid - on at least one of its products. */
export const isVendorChosen = (rows, choice) =>
  rows.some((row) => asList(row.product.vendor).some((vendor) => vendorKey(vendor) === choice.key))

/**
 * The rows with a checklist vendor ticked or unticked: unticked, it is taken
 * off every product; ticked, it is put back on each of its Pre Bid products
 * still in the form (one taken out stays out).
 */
export const chooseVendor = (rows, choice, on) =>
  rows.map((row) => {
    const vendors = asList(row.product.vendor)
    const has = vendors.some((vendor) => vendorKey(vendor) === choice.key)
    if (!on) {
      return has ? { ...row, product: { ...row.product, vendor: vendors.filter((vendor) => vendorKey(vendor) !== choice.key) } } : row
    }
    const entry = choice.entries.get(row.key)
    return entry && !has ? { ...row, product: { ...row.product, vendor: [...vendors, entry] } } : row
  })

/** The Create Bid form's vendor check - its own key in the flat error map. */
export const SELECTED_VENDORS_ERROR = 'selectedVendors'

/** The message when no product of the Bid has a vendor left, or null. */
export const selectedVendorsError = (rows) =>
  collectVendors(rows.map((row) => row.product)).length === 0
    ? 'Please select at least one vendor to create the Financial Bid.'
    : null

/** The next free sr_no - after the highest any row has. */
export const nextSrNo = (rows) => rows.reduce((highest, row) => Math.max(highest, Number(row.product.sr_no) || 0), 0) + 1

/** `sku` is { code, details } for a SKU of an Inventory Management product, else null. */
export const newProductRow = ({ product, sku, vendors, srNo }) => ({
  key: nextRowKey(),
  locked: false,
  lockedVendorKeys: [],
  product: {
    sr_no: srNo,
    product_name: product.name,
    hsn: product.hsn,
    Per: product.per,
    ...(sku ? { sku_code: sku.code, sku_details: sku.details } : {}),
    Description: '',
    Specification: '',
    qty: '',
    delivery_days: '',
    vendor: vendors.map(toEventVendor),
  },
})

/** A product and SKU are one line of the event however they are spelt. */
export const productIdentity = (name, skuCode) => `${asText(name).toLowerCase()}#${asText(skuCode).toLowerCase()}`

export const hasProduct = (rows, name, skuCode) =>
  rows.some((row) => productIdentity(row.product.product_name, row.product.sku_code) === productIdentity(name, skuCode))

/**
 * The form's errors are one flat { key: message } map, so each message sits on
 * the field it is about:
 *
 *   master       the master field's own name ("Auction_no", "closing_time")
 *   products     PRODUCTS_ERROR - no product at all
 *   a row        rowErrorKey(row.key, 'qty' | 'delivery_days' | 'vendor' | 'product')
 *   technical    technicalErrorKey('certification', index) / ('faq', index, 'question' | 'answer')
 *                / ('meeting', 'date' | 'time' | 'link')
 */
export const PRODUCTS_ERROR = 'products'
export const rowErrorKey = (rowKey, field) => `${rowKey}.${field}`
export const technicalErrorKey = (...parts) => `technical.${parts.join('.')}`
export const isRowErrorKey = (key) => key === PRODUCTS_ERROR || key.startsWith(ROW_KEY_PREFIX)
export const isTechnicalErrorKey = (key) => key.startsWith('technical.')

/** { key: message } for the product rows - empty when they can be saved. */
export const rowErrors = (rows) => {
  if (rows.length === 0) return { [PRODUCTS_ERROR]: 'Add at least one product.' }
  const errors = {}
  const seen = new Set()
  rows.forEach(({ key, product }) => {
    const identity = productIdentity(product.product_name, product.sku_code)
    if (seen.has(identity)) errors[rowErrorKey(key, 'product')] = 'This product is added more than once.'
    seen.add(identity)
    if (!isPositive(product.qty)) errors[rowErrorKey(key, 'qty')] = 'Enter above 0.'
    if (asText(product.delivery_days) !== '' && !isWholePositive(product.delivery_days)) {
      errors[rowErrorKey(key, 'delivery_days')] = 'Whole days above 0.'
    }
    if (asList(product.vendor).length === 0) errors[rowErrorKey(key, 'vendor')] = 'Choose at least one vendor.'
  })
  return errors
}

/** `Profile` is what the list reply adds to each vendor, read live - it is not part of what was saved. */
const storedVendor = (vendor) => {
  const copy = { ...vendor }
  delete copy.Profile
  return copy
}

/** The products as they are saved - everything a row already had is sent back as it came. */
const toSavedProducts = (rows) =>
  rows.map(({ product }) => ({
    ...product,
    qty: asText(product.qty),
    delivery_days: asText(product.delivery_days),
    vendor: asList(product.vendor).map(storedVendor),
  }))

/* ------------------------------------------------------------------ */
/* The form: technical bid (pre bid only)                             */
/* ------------------------------------------------------------------ */

/*
 * The pre bid meeting lives in the technical bid, as `meeting_details` - the
 * object this module has always kept on an update. The backend stores the
 * technical bid as it is sent, so nothing else is needed for it:
 *
 *   technical_bid.meeting_details = {
 *     meeting_date: "23-11-2026",   the API's date format, as master's dates
 *     meeting_time: "16:30",        24-hour, as master's times
 *     meeting_link: "https://meet.google.com/abc-defg-hij",
 *   }
 *
 * Any one of the three may be left empty; with all three empty no
 * meeting_details is sent. Read back, `date` / `time` / `link` / `url` are
 * accepted too, and any other key of a saved meeting_details is kept.
 */
const MEETING_KEYS = {
  date: ['meeting_date', 'date'],
  time: ['meeting_time', 'time'],
  link: ['meeting_link', 'link', 'url'],
}
const MEETING_KEY_NAMES = Object.values(MEETING_KEYS).flat()

const firstOf = (source, keys) => {
  const key = keys.find((name) => asText(source[name]) !== '')
  return key ? asText(source[key]) : ''
}

/** The meeting as the form edits it - { date: "2026-11-23" (the date box's format), time: "16:30", link }. */
export const emptyMeeting = () => ({ date: '', time: '', link: '' })

const readMeeting = (details) => {
  if (!details || typeof details !== 'object') return emptyMeeting()
  const date = firstOf(details, MEETING_KEYS.date)
  const time = parseTime(firstOf(details, MEETING_KEYS.time))
  return {
    date: fromApiDate(date) || (/^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ''),
    time: time ? formatTime(time.hours, time.minutes) : '',
    link: firstOf(details, MEETING_KEYS.link),
  }
}

/**
 * A meeting link that is safe to open: an http(s) address with a real host, as
 * { href, host, label } - a bare "meet.google.com/abc" is read as https. Null
 * for anything else (a "javascript:" link, plain words), which is never linked.
 */
const PROVIDERS = [
  [/(^|\.)meet\.google\.com$/, 'Google Meet'],
  [/(^|\.)zoom\.(us|com)$/, 'Zoom'],
  [/(^|\.)teams\.(microsoft|live)\.com$/, 'Microsoft Teams'],
  [/(^|\.)webex\.com$/, 'Webex'],
  [/(^|\.)skype\.com$/, 'Skype'],
]
export const meetingLink = (text) => {
  const raw = asText(text)
  if (!raw || /\s/.test(raw)) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : /^[\w-]+(\.[\w-]+)+([/?#:]|$)/.test(raw) ? `https://${raw}` : ''
  if (!withScheme) return null
  let url
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) {
    return null
  }
  const host = url.hostname.replace(/^www\./, '')
  const provider = PROVIDERS.find(([pattern]) => pattern.test(host))
  return { href: url.href, host, label: provider ? provider[1] : host }
}

/** Same day and time - a new link on a meeting that is already past does not make it "past" again. */
const sameMoment = (a, b) => a.date === b.date && a.time === b.time

/** What is saved for the form's meeting: the stored meeting_details, or null when there is no meeting. */
const buildMeeting = (form) => {
  const saved = form.meeting_details && typeof form.meeting_details === 'object' ? form.meeting_details : null
  if (!form.meeting) return saved // not edited by this form - kept as it came
  const meeting = form.meeting
  const time = parseTime(meeting.time)
  const link = asText(meeting.link)
  const value = {
    meeting_date: toApiDate(meeting.date),
    meeting_time: time ? formatTime(time.hours, time.minutes) : '',
    meeting_link: link ? (meetingLink(link)?.href ?? link) : '',
  }
  const others = saved ? Object.fromEntries(Object.entries(saved).filter(([key]) => !MEETING_KEY_NAMES.includes(key))) : {}
  const empty = !value.meeting_date && !value.meeting_time && !value.meeting_link
  if (empty) return Object.keys(others).length > 0 ? others : null
  return { ...others, ...value }
}

export const emptyTechnicalBid = () => ({
  required_certifications: [],
  faqs: [],
  meeting: emptyMeeting(),
  savedMeeting: emptyMeeting(),
  note: '',
})

/**
 * The note is rich text, HTML as the old module stored it ("<p>Send <b>samples</b></p>");
 * a plain-text note keeps its line breaks. `meeting` is what the form edits,
 * `savedMeeting` what it opened with (a saved meeting already past is not
 * flagged), `meeting_details` the stored object, whose other keys are kept.
 */
export const readTechnicalBid = (event) => {
  const source = event?.technical_bid ?? {}
  const meeting = readMeeting(source.meeting_details)
  const technical = {
    required_certifications: asList(source.required_certifications).map((entry) =>
      typeof entry === 'string' ? entry : asText(entry?.name),
    ),
    faqs: asList(source.faqs).map((faq) => ({ question: asText(faq?.question), answer: asText(faq?.answer) })),
    meeting,
    savedMeeting: { ...meeting },
    note: toRichText(source.note),
  }
  if (source.meeting_details && typeof source.meeting_details === 'object') technical.meeting_details = source.meeting_details
  return technical
}

/**
 * The meeting as it is shown - { date: "23-11-2026", time: "16:30", link
 * (meetingLink, or null), linkText (what was saved, shown unlinked when it is
 * not a safe link), at (a timestamp when date and time are both known) } -
 * or null when there is no meeting.
 */
const showMeeting = (meeting) => {
  const date = toApiDate(meeting.date)
  const linkText = asText(meeting.link)
  if (!date && !meeting.time && !linkText) return null
  return {
    date,
    time: meeting.time,
    link: meetingLink(linkText),
    linkText,
    at: momentOf(date, meeting.time),
  }
}

/**
 * What a technical bid has to show (readTechnicalBid, blanks left out):
 * { certifications, faqs, meeting, note, hasNote, isEmpty } - every
 * certification the API lists is a required one; `meeting` is null when none
 * was set (showMeeting).
 */
export const readTechnicalDetails = (event) => {
  const technical = readTechnicalBid(event)
  const certifications = technical.required_certifications.map(asText).filter(Boolean)
  const faqs = technical.faqs.filter((faq) => faq.question || faq.answer)
  const meeting = showMeeting(technical.meeting)
  const hasNote = !isHtmlEmpty(technical.note)
  return {
    certifications,
    faqs,
    meeting,
    note: technical.note,
    hasNote,
    isEmpty: certifications.length === 0 && faqs.length === 0 && !meeting && !hasNote,
  }
}

/**
 * { value, error } - the technical bid as it is saved (blank rows dropped, the
 * note sanitised, or '' when only empty markup is left), or why it cannot be:
 * a half-filled FAQ, a certification listed twice.
 */
export const buildTechnicalBid = (form) => {
  const certifications = asList(form.required_certifications).map(asText).filter(Boolean)
  const faqs = asList(form.faqs)
    .map((faq) => ({ question: asText(faq.question), answer: asText(faq.answer) }))
    .filter((faq) => faq.question || faq.answer)

  if (faqs.some((faq) => !faq.question || !faq.answer)) {
    return { value: null, error: 'Fill both the question and the answer of every FAQ.' }
  }
  const lower = certifications.map((name) => name.toLowerCase())
  const repeated = certifications.find((_, index) => lower.indexOf(lower[index]) !== index)
  if (repeated) return { value: null, error: `Certification "${repeated}" is listed more than once.` }

  if (form.meeting && asText(form.meeting.link) && !meetingLink(form.meeting.link)) {
    return { value: null, error: 'Enter the meeting link as a web address, such as https://meet.google.com/abc-defg-hij.' }
  }

  const note = isHtmlEmpty(form.note) ? '' : sanitizeHtml(form.note).trim()
  const value = { required_certifications: certifications, faqs, note }
  const meeting = buildMeeting(form)
  if (meeting) value.meeting_details = meeting
  return { value, error: null }
}

/**
 * The meeting's boxes: a time needs its date, a link must be a web address,
 * and a date or time set or changed here cannot be already past (a saved one
 * is left alone, so an old pre bid can still be updated).
 */
const meetingErrors = (errors, form, now) => {
  const meeting = form.meeting
  if (!meeting) return
  if (asText(meeting.link) && !meetingLink(meeting.link)) {
    errors[technicalErrorKey('meeting', 'link')] = 'Enter a web address, such as https://meet.google.com/abc-defg-hij.'
  }
  if (meeting.time && !meeting.date) errors[technicalErrorKey('meeting', 'date')] = 'Choose the date of the meeting.'
  if (!meeting.date || (form.savedMeeting && sameMoment(meeting, form.savedMeeting))) return
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const day = inputMoment(meeting.date, '00:00')
  if (day !== null && day < today.getTime()) {
    errors[technicalErrorKey('meeting', 'date')] = 'This date is already past.'
    return
  }
  const at = inputMoment(meeting.date, meeting.time)
  if (at !== null && at < now - PAST_GRACE_MS) errors[technicalErrorKey('meeting', 'time')] = 'This time is already past.'
}

/** { key: message } for the technical bid's boxes, by their place in the form - empty when buildTechnicalBid accepts it. */
export const technicalBidErrors = (form, now = Date.now()) => {
  const errors = {}
  meetingErrors(errors, form, now)
  asList(form.faqs).forEach((faq, index) => {
    const question = asText(faq.question)
    const answer = asText(faq.answer)
    if (question && !answer) errors[technicalErrorKey('faq', index, 'answer')] = 'Enter the answer.'
    if (answer && !question) errors[technicalErrorKey('faq', index, 'question')] = 'Enter the question.'
  })
  const seen = new Set()
  asList(form.required_certifications).forEach((name, index) => {
    const lower = asText(name).toLowerCase()
    if (!lower) return
    if (seen.has(lower)) errors[technicalErrorKey('certification', index)] = 'Listed more than once.'
    seen.add(lower)
  })
  return errors
}

/**
 * A refusal from the backend on the field it is about, where its message names
 * one (procurement/views.py) - null for anything else (a plan limit, a failed
 * upload), which the form shows as a whole.
 */
export const serverFieldErrors = (message, rows) => {
  const text = asText(message)
  if (/^Pre Bid Starting Date Required/i.test(text)) return { pre_starting_date: text }
  if (/^Starting Date Required/i.test(text)) return { starting_date: text }
  if (/Auction (Number|No)\b.*(Required|already exists)/i.test(text)) return { Auction_no: text }
  const duplicate = /^Duplicate product not added:\s*(.+)$/i.exec(text)
  if (duplicate) {
    const names = new Set(duplicate[1].split(',').map((name) => name.trim().toLowerCase()))
    const found = rows.filter((row) => names.has(asText(row.product.product_name).toLowerCase()))
    if (found.length > 0) {
      return Object.fromEntries(found.map((row) => [rowErrorKey(row.key, 'product'), 'Already in this bid - added again.']))
    }
  }
  return null
}

/**
 * After a change, the errors of one part of the form (`ownKey` says which keys
 * are its) checked again: a corrected field loses its message, one still wrong
 * keeps it, and a field never flagged is not flagged now - only Save does that.
 */
export const recheckErrors = (previous, fresh, ownKey) => {
  const next = {}
  let changed = false
  Object.entries(previous).forEach(([key, message]) => {
    if (!ownKey(key)) next[key] = message
    else if (fresh[key]) next[key] = fresh[key]
    else changed = true
    if (ownKey(key) && fresh[key] && fresh[key] !== message) changed = true
  })
  return changed ? next : previous
}

/* ------------------------------------------------------------------ */
/* Payloads                                                           */
/* ------------------------------------------------------------------ */

/** POST - multipart, master / product / technical_bid as JSON text, each file as "file". */
export const buildCreateBody = ({ kind, companyId, master, rows, technicalBid, files }) => {
  const body = new FormData()
  body.append('company_id', companyId)
  body.append('master', JSON.stringify(buildMaster(master, kind)))
  body.append('product', JSON.stringify(toSavedProducts(rows)))
  if (kind === EVENT_KIND.PRE_BID) body.append('technical_bid', JSON.stringify(technicalBid))
  files.forEach((file) => body.append('file', file))
  return body
}

/**
 * PUT - the FULL product list (old and new). An auction's is JSON text, a pre
 * bid's a list with its technical bid, as payload_res writes each. The master
 * details are not part of an update.
 */
export const buildUpdateBody = ({ kind, companyId, event, rows, technicalBid }) => {
  const products = toSavedProducts(rows)
  const body = { company_id: companyId, id: event.id, auction_no: event.Auction_no }
  if (kind === EVENT_KIND.PRE_BID) return { ...body, product: products, technical_bid: technicalBid }
  return { ...body, product: JSON.stringify(products) }
}

/* ------------------------------------------------------------------ */
/* Showing                                                            */
/* ------------------------------------------------------------------ */

/** A vendor's overall rating (out of 5), or null when it has none. */
export const overallRating = (rating) => {
  const value = Number(rating?.['Overall Rating'])
  return Number.isFinite(value) && value > 0 ? value : null
}

/** A vendor as a dropdown names it - with its rating, when it has one. */
export const vendorLabel = (vendor) => {
  const name = asText(vendor?.name) || asText(vendor?.email) || `Vendor ${vendor?.id ?? ''}`.trim()
  const rating = overallRating(vendor?.rating)
  return rating ? `${name} (★ ${rating})` : name
}

const AMOUNT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "₹ 1,000.00", or '--' for no amount (0 is "no bid yet"). */
export const showAmount = (value) => (Number(value) > 0 ? `₹ ${AMOUNT.format(Number(value))}` : '--')

export const bidGapLabel = (event) => {
  if (!asText(event?.gap)) return '--'
  return event.bid_gap_percentage ? `${event.gap}%` : `₹ ${event.gap}`
}

/** Lowest bid first; a vendor who has not bid goes last. A copy - the event is never re-ordered. */
export const sortVendorsByBid = (vendors) =>
  [...asList(vendors)].sort((a, b) => {
    const bidA = Number(a?.last_vender_bid) || 0
    const bidB = Number(b?.last_vender_bid) || 0
    if (!bidA !== !bidB) return bidA ? -1 : 1
    return bidA - bidB
  })

/**
 * The company's own view of a running Bid follows its master switches: while it
 * runs, "Hide Bid Amount" keeps the amounts back and "Hide Vendor Details" the
 * vendors' bids - both are shown in full once it has closed.
 */
export const amountsHidden = (event) =>
  event.kind === EVENT_KIND.BID && event.stage === EVENT_STAGE.ONGOING && event.hide_lowest_bid_amount === true

export const vendorBidsHidden = (event) =>
  event.kind === EVENT_KIND.BID && event.stage === EVENT_STAGE.ONGOING && event.hide_vendor === true

/** A saved product's `sku_details` as SkuDetailsTooltip reads them - [{ name, value }], blanks left out. */
export const skuDetailList = (details) =>
  details && typeof details === 'object' && !Array.isArray(details)
    ? Object.entries(details)
        .filter(([name, value]) => name !== 'Quantity' && asText(value) !== '')
        .map(([name, value]) => ({ name, value: asText(value) }))
    : []

/** A stored file's name, from its URL. */
export const fileName = (url) => {
  const last = asText(url).split(/[?#]/)[0].split('/').pop()
  try {
    return decodeURIComponent(last) || 'File'
  } catch {
    return last || 'File'
  }
}
