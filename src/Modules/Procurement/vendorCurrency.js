/**
 * A Bid's vendors from another country: their currency, its conversion rate,
 * and the conversion of their bids - plain logic, no React, no requests.
 *
 * WHERE THE COUNTRIES COME FROM (nothing is stored twice):
 *
 *   the company   its record in the company list (companySlice):
 *                 `comp_country`, else `comp_state`
 *   a vendor      the vendor master (readVendorOptions): `country`, else `state`
 *   currencies    the country list (tally/country_list/, locationSlice): each
 *                 country's `currency` (ISO 4217 code), `currency_name`,
 *                 `currency_symbol`
 *
 * One rule for both sides (resolveCountry):
 *   1. a saved country, as the country list spells it (compared by name alone
 *      while the list is not in)
 *   2. else a state of India - the app's own GST state list (INDIAN_STATES), so
 *      "Punjab" is India and never Pakistan's province of the same name
 *   3. else the ONE country of the country list whose states hold it
 *   A country the list does not know, a state in no country or in several, or
 *   nothing saved: unknown. A step that needs the country list while it is not
 *   in: pending - not known YET, which blocks a save (it is never taken as
 *   domestic).
 *
 * A vendor is
 *   foreign    both countries known, and different -> currency and rate required
 *   domestic   both known and the same -> no currency; one saved on it is dropped
 *   unknown    either side unknown once the list is in -> shown, optional
 *   pending    the list is still needed -> shown, and the form cannot be saved
 *
 * WHAT IS SAVED - on the vendor's own entry in each product of THIS event
 * (product[].vendor[]), so it belongs to this auction only; another auction's
 * entry of the same vendor is never read:
 *
 *   { id, name, email, ..., currency: "USD", conversion_rate: 83.5 }
 *
 * `conversion_rate` is what ONE unit of `currency` is worth in the company's
 * own currency (its country's): 83.5 with a company in India is 1 USD = 83.50
 * INR. A vendor on several products is asked once and gets the same pair on
 * every entry. A saved pair is shown and can be changed.
 *
 * BIDS (the vendor portal). The vendor types its bid in its currency; it is
 * converted ONCE, when the vendor_bid payload is built - toBaseAmount, rounded
 * to whole paise/cents - and `last_vender_bid` carries the converted amount,
 * so every amount the backend holds, ranks and compares (last_bid, bid_rank,
 * bid_history) is in the company's currency. The vendor's own figure is
 * fromBaseAmount of a stored amount at the auction's rate.
 */

import { findStateByName } from '@/Constants/indianStates'
import { vendorKey } from '@/Modules/Procurement/procurement'
import { DEFAULT_COUNTRY } from '@/Services/Global/locationService'

const asList = (value) => (Array.isArray(value) ? value : [])
const asText = (value) => (value === null || value === undefined ? '' : String(value).trim())
const sameName = (a, b) => asText(a).toLowerCase() === asText(b).toLowerCase()

/* ------------------------------------------------------------------ */
/* Countries and currencies                                           */
/* ------------------------------------------------------------------ */

/** A country that can only be told with the country list, while it is not in. */
export const PENDING = 'pending'

const hasState = (entry, state) =>
  Boolean(entry?.state_city) &&
  typeof entry.state_city === 'object' &&
  Object.keys(entry.state_city).some((name) => sameName(name, state))

/** The list's entry for a country name - or, with no list, the name alone ({ country }). */
const byName = (list, loaded, name) =>
  loaded ? (list.find((entry) => sameName(entry?.country, name)) ?? null) : { country: asText(name) }

/**
 * A saved { country, state } as the country list's entry ({ country, currency, ... }),
 * null when it cannot be told, or PENDING while it needs the list (see the top).
 */
export const resolveCountry = (countryList, { country, state } = {}, loaded = asList(countryList).length > 0) => {
  const list = asList(countryList)
  if (asText(country)) return byName(list, loaded, country)
  if (!asText(state)) return null
  if (findStateByName(state)) return byName(list, loaded, DEFAULT_COUNTRY)
  if (!loaded) return PENDING
  const holding = list.filter((entry) => hasState(entry, state))
  return holding.length === 1 ? holding[0] : null
}

/** The company's country, from its company-list record (resolveCountry). */
export const companyCountryEntry = (countryList, company, loaded) =>
  resolveCountry(countryList, { country: company?.comp_country, state: company?.comp_state }, loaded)

const CURRENCY_CODE = /^[A-Z]{3}$/

/**
 * The ISO 4217 codes the browser knows, or null where it cannot say. The
 * country list also carries a code that is not ISO (Antarctica's "AAD").
 */
const isoCodes = (() => {
  try {
    return typeof Intl.supportedValuesOf === 'function' ? new Set(Intl.supportedValuesOf('currency')) : null
  } catch {
    return null
  }
})()

const isCurrencyCode = (code) => CURRENCY_CODE.test(code) && (!isoCodes || isoCodes.has(code))

/**
 * Every ISO 4217 currency of the country list, once each (many countries
 * share USD or EUR), by code: [{ code, name, symbol }]. `symbol` falls back
 * to the code.
 */
export const readCurrencies = (countryList) => {
  const byCode = new Map()
  asList(countryList).forEach((entry) => {
    const code = asText(entry?.currency).toUpperCase()
    if (!isCurrencyCode(code)) return
    const known = byCode.get(code)
    const name = asText(entry?.currency_name)
    const symbol = asText(entry?.currency_symbol)
    if (!known) byCode.set(code, { code, name, symbol })
    else {
      if (!known.name && name) known.name = name
      if (!known.symbol && symbol) known.symbol = symbol
    }
  })
  return [...byCode.values()]
    .map((currency) => ({ ...currency, name: currency.name || currency.code, symbol: currency.symbol || currency.code }))
    .sort((a, b) => a.code.localeCompare(b.code))
}

/** One currency of `currencies` by code, or null. */
export const findCurrency = (currencies, code) => {
  const wanted = asText(code).toUpperCase()
  return wanted ? (asList(currencies).find((currency) => currency.code === wanted) ?? null) : null
}

/* ------------------------------------------------------------------ */
/* Money: one rounding rule, one way to show it                      */
/* ------------------------------------------------------------------ */

/** Half up to 2 decimals, on the decimal digits (1.005 -> 1.01, not 1.00). */
export const round2 = (value) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return NaN
  const shifted = Number(`${number}e2`)
  return Number.isFinite(shifted) ? Number(`${Math.round(shifted)}e-2`) : Math.round(number * 100) / 100
}

/** An entry's currency pair - { code, rate } - or null when it has none that can be used. */
export const bidCurrencyOf = (entry) => {
  const code = asText(entry?.currency).toUpperCase()
  const rate = Number(entry?.conversion_rate)
  return CURRENCY_CODE.test(code) && Number.isFinite(rate) && rate > 0 ? { code, rate } : null
}

/** A bid in the vendor's currency, in the company's: amount x rate, to 2 decimals. */
export const toBaseAmount = (amount, rate) => round2(Number(amount) * Number(rate))

/**
 * A stored (company-currency) amount in the vendor's currency at `rate`:
 * { value, exact }. `exact` is whether converting `value` back gives the
 * stored amount to the cent with a rate of at least 1 - then `value` is the
 * very figure a 2-decimal bid was typed as; else it is shown as approximate.
 */
export const fromBaseAmount = (base, rate) => {
  const stored = Number(base)
  const by = Number(rate)
  if (!(stored > 0) || !(by > 0)) return { value: 0, exact: false }
  const value = round2(stored / by)
  return { value, exact: by >= 1 && toBaseAmount(value, by) === round2(stored) }
}

const symbols = new Map()

/** A currency's own sign as the browser writes it ($, €, ₹, ₽), or the code. */
export const currencySymbol = (code) => {
  const wanted = asText(code).toUpperCase()
  if (!wanted) return ''
  if (!symbols.has(wanted)) {
    let symbol
    try {
      symbol =
        new Intl.NumberFormat('en-IN', { style: 'currency', currency: wanted, currencyDisplay: 'narrowSymbol' })
          .formatToParts(0)
          .find((part) => part.type === 'currency')?.value || wanted
    } catch {
      symbol = wanted
    }
    symbols.set(wanted, symbol)
  }
  return symbols.get(wanted)
}

const AMOUNT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** An amount without a sign - "8,350.00" - or '--' for none. */
export const plainAmount = (value) => (Number(value) > 0 ? AMOUNT.format(Number(value)) : '--')

/** "$ 100.00" in the given currency (the module's style: sign, space, amount), or '--' for none. */
export const moneyIn = (value, code) => (Number(value) > 0 ? `${currencySymbol(code)} ${AMOUNT.format(Number(value))}` : '--')

/* ------------------------------------------------------------------ */
/* The form: the vendors that need one                                */
/* ------------------------------------------------------------------ */

export const VENDOR_COUNTRY = { FOREIGN: 'foreign', DOMESTIC: 'domestic', UNKNOWN: 'unknown', PENDING: 'pending' }

/** What a saved vendor entry holds - { currency, conversion_rate } as the form keeps them - or null. */
export const readSavedCurrency = (entry) => {
  const currency = asText(entry?.currency).toUpperCase()
  if (!currency) return null
  const rate = Number(entry?.conversion_rate)
  return { currency, conversion_rate: Number.isFinite(rate) && rate > 0 ? String(rate) : '' }
}

const classify = (company, vendor) => {
  if (company === PENDING || vendor === PENDING) return VENDOR_COUNTRY.PENDING
  if (!company || !vendor) return VENDOR_COUNTRY.UNKNOWN
  return sameName(company.country, vendor.country) ? VENDOR_COUNTRY.DOMESTIC : VENDOR_COUNTRY.FOREIGN
}

/**
 * Every vendor of the form's rows, once each, in the order they first appear:
 *
 *   { key, name, status, country, defaultCurrency, saved, hasBids, required }
 *
 *   status           VENDOR_COUNTRY (see the top)
 *   country          the vendor's country as the list spells it ('' unknown)
 *   defaultCurrency  that country's currency code - what a new vendor starts on
 *   saved            the pair this event's entries of it hold, or null
 *   hasBids          it has bid in this event (a changed rate is for new bids)
 *   required         foreign: currency and rate must be given
 *
 * `loaded` is whether the country list is in.
 */
export const currencyVendors = ({ rows, companyVendors, countryList, companyCountry, loaded }) => {
  const master = new Map(asList(companyVendors).map((vendor) => [vendorKey(vendor), vendor]))
  const found = new Map()

  asList(rows).forEach((row) => {
    asList(row.product?.vendor).forEach((entry) => {
      const key = vendorKey(entry)
      if (!key) return
      let vendor = found.get(key)
      if (!vendor) {
        vendor = { key, name: asText(entry.name) || asText(entry.email) || key, saved: null, hasBids: false }
        found.set(key, vendor)
      }
      vendor.saved ??= readSavedCurrency(entry)
      if (Number(entry?.last_vender_bid) > 0) vendor.hasBids = true
    })
  })

  return [...found.values()].map(({ key, name, saved, hasBids }) => {
    const option = master.get(key)
    const country = resolveCountry(countryList, { country: option?.country, state: option?.state }, loaded)
    const status = classify(companyCountry, country)
    const known = country && country !== PENDING ? country : null
    return {
      key,
      name,
      status,
      country: asText(known?.country),
      defaultCurrency: asText(known?.currency).toUpperCase(),
      saved,
      hasBids,
      required: status === VENDOR_COUNTRY.FOREIGN,
    }
  })
}

/**
 * ONE party by the same rules, from its own { country, state } - a Sales or
 * Purchase Invoice's ledger party (Modules/SalesInvoice/documentCurrency):
 * the same { key, name, status, country, defaultCurrency, saved, hasBids,
 * required } as each of currencyVendors, so the fields, checks and saving
 * below take it as they take a vendor.
 */
export const currencyParty = ({ key, name, country, state, saved = null, countryList, companyCountry, loaded }) => {
  const found = resolveCountry(countryList, { country, state }, loaded)
  const status = classify(companyCountry, found)
  const known = found && found !== PENDING ? found : null
  return {
    key,
    name,
    status,
    country: asText(known?.country),
    defaultCurrency: asText(known?.currency).toUpperCase(),
    saved,
    hasBids: false,
    required: status === VENDOR_COUNTRY.FOREIGN,
  }
}

/** The vendors the Vendor Currency section lists - all but the domestic ones. */
export const listedVendors = (vendors) => asList(vendors).filter((vendor) => vendor.status !== VENDOR_COUNTRY.DOMESTIC)

/**
 * The pair a vendor shows: what was typed, else what this event saved, else -
 * for a foreign vendor - its country's currency and no rate.
 * `values` is the form's { [vendor key]: { currency, conversion_rate } }.
 */
export const currencyValue = (vendor, values, currencies) => {
  const typed = values?.[vendor.key] ?? {}
  const start =
    vendor.saved?.currency ??
    (vendor.status === VENDOR_COUNTRY.FOREIGN ? (findCurrency(currencies, vendor.defaultCurrency)?.code ?? '') : '')
  return {
    currency: typed.currency || start,
    conversion_rate: typed.conversion_rate ?? vendor.saved?.conversion_rate ?? '',
  }
}

/* ------------------------------------------------------------------ */
/* Checks                                                             */
/* ------------------------------------------------------------------ */

export const currencyErrorKey = (key, field) => `currency.${key}.${field}`
export const isCurrencyErrorKey = (key) => key.startsWith('currency.')

const RATE = /^(\d+(\.\d*)?|\.\d+)$/

/** A rate as it is typed: digits and one point only - a sign or an exponent cannot be entered. */
export const cleanRate = (text) => {
  const kept = String(text ?? '').replace(/[^\d.]/g, '')
  const point = kept.indexOf('.')
  return point === -1 ? kept : `${kept.slice(0, point + 1)}${kept.slice(point + 1).replace(/\./g, '')}`
}

/** The typed rate as a number, or null when it is not a number above 0. */
export const rateNumber = (text) => {
  const value = asText(text)
  if (!RATE.test(value)) return null
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

/** Whether an optional vendor was given anything to save - a rate is what makes it count. */
const isTouched = (value) => asText(value?.conversion_rate) !== ''

/**
 * { key: message } for the currency fields - empty when they can be saved.
 * A foreign vendor needs both; an unknown one both or neither.
 */
export const currencyErrors = (vendors, values, currencies) => {
  const errors = {}
  listedVendors(vendors).forEach((vendor) => {
    if (vendor.status === VENDOR_COUNTRY.PENDING) return
    const value = currencyValue(vendor, values, currencies)
    if (!vendor.required && !isTouched(value)) return
    if (!findCurrency(currencies, value.currency)) errors[currencyErrorKey(vendor.key, 'currency')] = 'Select the currency.'
    if (!asText(value.conversion_rate)) errors[currencyErrorKey(vendor.key, 'conversion_rate')] = 'Enter the rate.'
    else if (rateNumber(value.conversion_rate) === null) {
      errors[currencyErrorKey(vendor.key, 'conversion_rate')] = 'Enter a rate above 0.'
    }
  })
  return errors
}

/** The vendors whose country is still to be told - the form cannot be saved while there are any. */
export const pendingVendors = (vendors) => asList(vendors).filter((vendor) => vendor.status === VENDOR_COUNTRY.PENDING)

/* ------------------------------------------------------------------ */
/* Saving                                                             */
/* ------------------------------------------------------------------ */

const CURRENCY_KEYS = ['currency', 'conversion_rate']

const withoutCurrency = (entry) => {
  if (!CURRENCY_KEYS.some((key) => key in entry)) return entry
  const copy = { ...entry }
  CURRENCY_KEYS.forEach((key) => delete copy[key])
  return copy
}

/**
 * The rows as they are saved (currencyErrors has passed, nothing is pending):
 * a vendor with a pair gets it on every one of its entries in this event; a
 * domestic vendor, or an unknown one left blank, loses any pair it had. Every
 * other key of an entry - its bids, ranks and history - is kept as it is.
 */
export const withVendorCurrencies = (rows, vendors, values, currencies) => {
  const plan = new Map()
  asList(vendors).forEach((vendor) => {
    if (vendor.status === VENDOR_COUNTRY.PENDING) return
    if (vendor.status === VENDOR_COUNTRY.DOMESTIC) {
      plan.set(vendor.key, null)
      return
    }
    const value = currencyValue(vendor, values, currencies)
    const rate = rateNumber(value.conversion_rate)
    const code = findCurrency(currencies, value.currency)?.code
    plan.set(vendor.key, code && rate ? { currency: code, conversion_rate: rate } : null)
  })

  return asList(rows).map((row) => ({
    ...row,
    product: {
      ...row.product,
      vendor: asList(row.product?.vendor).map((entry) => {
        const key = vendorKey(entry)
        if (!plan.has(key)) return entry
        const pair = plan.get(key)
        return pair ? { ...entry, ...pair } : withoutCurrency(entry)
      }),
    },
  }))
}

/** "1 USD = 83.50 INR"; the rate as typed, '…' while there is none. */
export const rateSentence = (code, rate, baseCode) =>
  `1 ${code || '…'} = ${asText(rate) || '…'} ${baseCode || ''}`.trim()
