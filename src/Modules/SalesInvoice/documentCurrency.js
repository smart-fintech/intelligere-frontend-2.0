/**
 * A DOCUMENT'S CURRENCY - the ledger party of ANY document of the Sales Invoice
 * and Purchase Invoice modules (every type the workspace makes: Sales Invoice,
 * Challan, Sales Order, Purchase Order, Credit / Debit Note, Proforma,
 * Quotation; Purchase Invoice, Inbound Challan, Outbound Purchase Order - and
 * so Prefill From and Raise a PO) from another country: the currency it deals
 * in and the rate it converts at - Procurement's own rules, checks and fields
 * (Modules/Procurement/vendorCurrency, useCompanyCurrency,
 * VendorCurrencyFields), with no screen attached.
 *
 * PRINTED (invoiceModel's `currency`): under the amount in words, "Total in USD:
 * 1,000.00 (1 USD = 83.5 INR)" - on the preview, the PDF saved, and History's
 * PDFs made again (from the pair as saved). A challan prints no money, so none.
 *
 *   the party      the form's LEDGER side (`parties.ledger`: 'buyer' on a sale,
 *                  'seller' on a purchase) - its country and state as the form
 *                  holds them, so a country changed in the form counts
 *   the company    its own country (useCompanyCurrency's companyCountry)
 *
 *   foreign   currency and rate required
 *   domestic  nothing shown, nothing saved - as before
 *   unknown   shown, optional (both or neither)
 *   pending   the country list is still needed - the document cannot be saved yet
 *
 * IN THE FORM
 *   form.currency        { [party key]: { currency, conversion_rate } } - what was
 *                        typed, by party (its ledger id), so another party starts
 *                        on its own country's currency, and a party chosen again
 *                        finds what was typed for it
 *   form.savedCurrency   { key, currency, conversion_rate } - what the document
 *                        was saved with (readSavedCurrency), for that party only
 *
 * SAVED - in invoice_master_details, under Procurement's names (the backend
 * keeps that object as sent, on a save and on an update):
 *
 *   { ..., currency: "USD", conversion_rate: 83.5 }
 *
 * `conversion_rate` is what ONE unit of `currency` is worth in the company's
 * own currency. The document's amounts stay in the company's currency, as
 * before - GST, totals and the ERP read them unchanged; the party's figure is
 * the total converted at that rate (fromBaseAmount).
 */

import {
  VENDOR_COUNTRY,
  currencyErrorKey,
  currencyErrors,
  currencyParty,
  currencyValue,
  findCurrency,
  rateNumber,
  readSavedCurrency,
} from '@/Modules/Procurement/vendorCurrency'
import { textOf } from '@/Modules/SalesInvoice/salesInvoiceForm'

const objectOf = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {})

/** What a saved invoice_master_details holds for its ledger party - { key, currency, conversion_rate } or null. */
export const readDocumentCurrency = (master, ledgerId) => {
  const saved = readSavedCurrency(objectOf(master))
  return saved && textOf(ledgerId) ? { key: textOf(ledgerId), ...saved } : null
}

/**
 * The form's ledger party as Procurement lists a vendor (currencyParty) - null
 * while no ledger is chosen. `rules`: { countryList, companyCountry, loaded }.
 */
export const documentCurrencyParty = (form, partyKey, rules) => {
  const party = form?.[partyKey]
  const key = textOf(party?.ledgerId)
  if (!key) return null
  const saved = form.savedCurrency && form.savedCurrency.key === key ? readSavedCurrency(form.savedCurrency) : null
  return currencyParty({ key, name: textOf(party.name), country: party.country, state: party.state, saved, ...rules })
}

/** Whether the party's currency is shown at all - every status but domestic (listedVendors). */
export const showsDocumentCurrency = (entry) => Boolean(entry) && entry.status !== VENDOR_COUNTRY.DOMESTIC

/** The form's error keys for the two fields - on the party's own step (`buyer.currency`, `seller.conversion_rate`). */
export const documentCurrencyErrorKey = (partyKey, field) => `${partyKey}.${field}`

/**
 * Its problems, added to `found` under the party's keys - Procurement's checks
 * (currencyErrors); pending blocks the save until the country list tells.
 */
export const checkDocumentCurrency = (form, found, partyKey, { currencies, ...rules }) => {
  const entry = documentCurrencyParty(form, partyKey, rules)
  if (!showsDocumentCurrency(entry)) return
  if (entry.status === VENDOR_COUNTRY.PENDING) {
    found[documentCurrencyErrorKey(partyKey, 'currency')] = 'The country list is still loading - try again in a moment.'
    return
  }
  const errors = currencyErrors([entry], form.currency, currencies)
  ;['currency', 'conversion_rate'].forEach((field) => {
    const message = errors[currencyErrorKey(entry.key, field)]
    if (message) found[documentCurrencyErrorKey(partyKey, field)] = message
  })
}

/**
 * What is saved - { currency, conversion_rate } or null (domestic, or an
 * unknown one left blank): Procurement's withVendorCurrencies, for one party.
 */
export const documentCurrencyOf = (form, partyKey, { currencies, ...rules }) => {
  const entry = documentCurrencyParty(form, partyKey, rules)
  if (!showsDocumentCurrency(entry) || entry.status === VENDOR_COUNTRY.PENDING) return null
  const value = currencyValue(entry, form.currency, currencies)
  const code = findCurrency(currencies, value.currency)?.code
  const rate = rateNumber(value.conversion_rate)
  return code && rate ? { currency: code, conversion_rate: rate } : null
}
