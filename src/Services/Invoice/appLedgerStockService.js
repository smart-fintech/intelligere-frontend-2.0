/**
 * LEDGERS AND STOCK ITEMS TO CREATE BEFORE THE VOUCHERS - the old Intelligere
 * ERP's "Create Ledger / Create Stock Item" step of the Sales and Purchase
 * voucher views (InvoiceQRCode / ImportInvoiceQRCreate: GetCreateProductLedger):
 *
 *   POST invoice/app-ledger-product/   { company_name, document_type }   ('Sales Invoice' | 'Purchase Invoice')
 *        -> { ledger: [ ...ledger rows ], stock: [ ...stock rows ] }   (GET is not allowed)
 *   PUT  invoice/app-ledger-product/   { ledger: ["<id>"], stock: ["<id>"], source: "delete" }
 *        the Purchase view's per-row "Show Map": the row leaves the list (it is
 *        to be mapped to an existing ledger / product instead of created)
 *
 * The rows are the old backend's, read as they come:
 *   ledger   { id, ledeger_name, ledger_group_name, ledeger_email, ledeger_phone,
 *              ledeger_address, ledeger_state, ledeger_gstin, ledger_pincode, ... }
 *   stock    { id, Description, Hsn_code, Qty, Per, Rate, group_name,
 *              CGst_rate, SGst_rate, IGst_rate }
 *
 * CREATING THEM goes through the 2.0 app's own ledger and product services -
 * the same calls the Ledger and Product forms make - so the backend and the
 * Tally agent receive exactly what they already read:
 *
 *   Intelligere ledger   createLedger                 POST tally/create-ledger/  (one per ledger)
 *   Tally ledgers        buildBulkLedgerMessage       bulk_ledger_create         (all in one message)
 *   Intelligere product  createIntelligereProduct     POST inventory/intelligere_product_create/
 *   Tally products       buildTallyProductImportMessage  tally_product_create    (all in one message)
 *
 * The row -> payload mapping below is the old screens' (CreateLedger /
 * CreateProduct): a "Primary" ledger goes up under the group the user chose.
 */

import { getEmail } from '@/Library/secureStorage'
import { api } from '@/Services/Global/apiService'
import { text } from '@/Services/Global/apiHelpers'
import { fromApiLedger } from '@/Services/Ledger/ledgerFields'

const APP_LEDGER_STOCK_URL = 'invoice/app-ledger-product/'

/** The group a ledger sits under that the user has to replace before it is created (the old check). */
export const PRIMARY_GROUP = 'Primary'

/** What a "Primary" ledger may go under instead - per voucher side, as the old screens offered. */
export const LEDGER_GROUP_CHOICES = Object.freeze({
  sales: Object.freeze(['Indirect Income', 'Direct Income']),
  purchase: Object.freeze(['Indirect Expenses', 'Direct Expenses']),
})

const rows = (list) => (Array.isArray(list) ? list.filter((row) => row && typeof row === 'object') : [])
const hasId = (value) => text(value) !== ''
const first = (row, names) => {
  for (const name of names) {
    if (text(row?.[name]) !== '') return text(row[name])
  }
  return ''
}
const number = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** A ledger row, with the app's field names (ledger_*), its own id and the old screen's columns. */
const readLedger = (raw) => {
  const record = fromApiLedger(raw)
  return {
    id: text(record.id ?? record.ledger_obj_id),
    name: text(record.ledger_name),
    group: text(record.ledger_group_name),
    email: text(record.ledger_email),
    phone: text(record.ledger_phone),
    address: text(record.ledger_address),
    state: text(record.ledger_state),
    record,
  }
}

/**
 * A stock row with the old screen's columns. The GST rate is the IGST rate, or
 * CGST + SGST when there is no IGST (what the old Tally message sent apart).
 */
const readStock = (raw) => {
  const igst = number(raw.IGst_rate)
  const split = number(raw.CGst_rate) + number(raw.SGst_rate)
  return {
    id: text(raw.id ?? raw.product_id),
    name: first(raw, ['Description', 'product_name', 'stock_item', 'Products']),
    hsn: first(raw, ['Hsn_code', 'hsn_code', 'hsn']),
    quantity: first(raw, ['Qty', 'quantity']),
    unit: first(raw, ['Per', 'per_unit', 'unit']),
    rate: first(raw, ['Rate', 'rate', 'selling_rate']),
    group: first(raw, ['group_name', 'group']),
    gstRate: igst > 0 ? String(igst) : split > 0 ? String(split) : first(raw, ['gst_rate']),
    record: raw,
  }
}

/**
 * The reply as two lists - { ledgers, stock } - each row kept only when it has
 * an id (the Show Map call names rows by it). A reply that is only a `msg` is
 * that message, thrown.
 */
export const readAppLedgerStock = (reply) => {
  const data = reply && typeof reply === 'object' && !Array.isArray(reply) ? reply : {}
  // The stock list may come as `stock` (the old endpoint) or `product` (this endpoint's mapping reply).
  const stock = Array.isArray(data.stock) ? data.stock : data.product
  if (!Array.isArray(data.ledger) && !Array.isArray(stock) && text(data.msg)) throw new Error(text(data.msg))
  return {
    ledgers: rows(data.ledger).map(readLedger).filter((row) => hasId(row.id)),
    stock: rows(stock).map(readStock).filter((row) => hasId(row.id)),
  }
}

/** The two document types the lists are asked for. */
export const LEDGER_STOCK_DOCUMENT_TYPES = Object.freeze({ SALES: 'Sales Invoice', PURCHASE: 'Purchase Invoice' })

/** POST { company_name, document_type } - GET is not allowed on this endpoint. */
export const getAppLedgerStock = ({ companyName, documentType }) =>
  api.post(APP_LEDGER_STOCK_URL, { company_name: text(companyName), document_type: documentType }).then(readAppLedgerStock)

/** Purchase's "Show Map": takes one ledger or stock row off the list. */
export const removeAppLedgerStock = ({ ledgerIds = [], stockIds = [] }) =>
  api.put(APP_LEDGER_STOCK_URL, {
    ledger: ledgerIds.map(String),
    stock: stockIds.map(String),
    source: 'delete',
  })

/* ------------------------------------------------------------------ */
/* Rows -> what the create calls take                                  */
/* ------------------------------------------------------------------ */

/** The group a ledger is created under: the one chosen for a "Primary" ledger, its own otherwise. */
export const finalLedgerGroup = (ledger, chosen) => (ledger.group === PRIMARY_GROUP ? text(chosen) : ledger.group)

/** The ledger fields the old screens sent, with the app's names (createLedger / the bulk message rename them). */
const LEDGER_FIELDS = [
  'ledger_name',
  'ledger_pincode',
  'ledger_bank',
  'ledger_accno',
  'ledger_sac',
  'ledger_gst_reg_type',
  'ledger_ifsc',
  'ledger_email',
  'ledger_phone',
  'ledger_address',
  'ledger_state',
  'ledger_website',
  'ledger_gstin',
  'gst_rate',
]

const ledgerFields = (ledger, group) => ({
  ...Object.fromEntries(LEDGER_FIELDS.map((field) => [field, text(ledger.record[field])])),
  ledger_group_name: group,
  group_name: group,
})

/** POST tally/create-ledger/ body (createLedger adds created_by, erp and platform). */
export const toLedgerCreatePayload = (ledger, group, companyId) => ({ ...ledgerFields(ledger, group), company_id: companyId })

/** One row of the Tally bulk_ledger_create message (buildBulkLedgerMessage). */
export const toTallyLedger = (ledger, group) => ({ ...ledgerFields(ledger, group), ledger_group: group })

/** The form buildIntelligereProductPayload takes, from a stock row. */
export const toIntelligereProductForm = (item) => ({
  product_name: item.name,
  group: item.group,
  hsn_code: item.hsn,
  per_unit: item.unit,
  gst_rate: item.gstRate,
  category: '',
  quantity: item.quantity,
  selling_rate: item.rate,
  'Unit Rate': item.rate,
})

/** One row of the Tally tally_product_create message (buildTallyProductImportMessage). */
export const toTallyProduct = (item) => ({
  product_name: item.name,
  group_name: item.group,
  hsn: item.hsn,
  quantity: item.quantity,
  unit: item.unit,
  rate: item.rate,
  gst_rate: item.gstRate,
  created_by: getEmail() || '',
})
