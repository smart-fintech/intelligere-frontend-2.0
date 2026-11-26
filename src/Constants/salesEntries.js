/**
 * The Sales Entries module's fixed names.
 *
 *   SALES_ENTRIES_MODULE          its entry in `active_modules` - its key in
 *                                 Constants/dashboardModules (the backend's plans
 *                                 call it "Sales Inventory", see accessService)
 *   SALES_ENTRIES_VIEW            the three views behind the selection card
 *   SALES_ENTRIES_SOURCE(_OPTIONS)  Using File / Fetch from GSTR-1, the card's switch
 *   SALES_ENTRY_WORKFLOWS         the card's three choices, one per view
 *   SALES_ENTRIES_BATCH_SIZE      invoices per get_multi_party_data/ answer - the
 *                                 backend's own batch, which start_index steps by
 *   SALES_ENTRIES_PAGE_SIZE       rows per page inside one batch
 *   TALLY_FETCH_VOUCHER_GROUPS    the voucher groups Fetch from Tally offers types of
 *   SALES_ENTRIES_UPLOAD_MAX_MB   the largest file the upload takes
 *   SALES_ENTRIES_UPLOAD_ACCEPT   the files the upload takes: CSV and Excel, as the old screen
 *   SALES_BUYER_KIND              B2B / B2C, as Multi Ledger tells its entries apart
 *   GSTR_1_*                      what Fetch from GSTR-1 reads, and how it names a failed section
 */

export const SALES_ENTRIES_MODULE = 'Sales Entries'

/** The three kinds of sales entry, each its own view, upload, list and Tally message. */
export const SALES_ENTRIES_VIEW = Object.freeze({
  MULTI_LEDGER: 'multi-ledger',
  SINGLE_LEDGER: 'single-ledger',
  INVENTORY: 'inventory',
})

export const SALES_ENTRIES_BATCH_SIZE = 50

export const SALES_ENTRIES_PAGE_SIZE = 10

/** As the old screen: the types of the sales, credit note and debit note groups. */
export const TALLY_FETCH_VOUCHER_GROUPS = Object.freeze(['sales', 'credit', 'debit'])

export const SALES_ENTRIES_UPLOAD_MAX_MB = 10

/** As the old screen (csv, xlsx, xls): the file goes to the upload API as it is - the backend reads it. */
export const SALES_ENTRIES_UPLOAD_ACCEPT = '.csv,.xlsx,.xls'

/**
 * Who an invoice was sold to - how Multi Ledger tells its entries apart. It is
 * read from the entry, never chosen: a buyer GSTIN makes it B2B. A B2C entry
 * with no invoice number is a GSTR-1 B2C (small) summary - one line per state
 * and GST rate, not one invoice.
 */
export const SALES_BUYER_KIND = Object.freeze({ ALL: 'all', B2B: 'b2b', B2C: 'b2c' })

/**
 * WHERE THE ENTRIES COME FROM - the switch at the top of the screen, as the old
 * one: a file (Download Format / Upload, and Fetch from Tally for Multi Ledger),
 * or the GST portal. GSTR-1 invoices are Multi Ledger entries.
 */
export const SALES_ENTRIES_SOURCE = Object.freeze({ FILE: 'file', GSTR_1: 'gstr1' })

export const SALES_ENTRIES_SOURCE_OPTIONS = Object.freeze([
  { value: SALES_ENTRIES_SOURCE.FILE, label: 'Using File' },
  { value: SALES_ENTRIES_SOURCE.GSTR_1, label: 'Fetch from GSTR-1' },
])

/**
 * THE WORKFLOWS of the selection card - one per view, in the old screen's
 * order.
 */
export const SALES_ENTRY_WORKFLOWS = Object.freeze([
  { key: SALES_ENTRIES_VIEW.INVENTORY, view: SALES_ENTRIES_VIEW.INVENTORY, label: 'With Inventory' },
  { key: SALES_ENTRIES_VIEW.SINGLE_LEDGER, view: SALES_ENTRIES_VIEW.SINGLE_LEDGER, label: 'Without Inventory', tag: 'Single Ledger' },
  { key: SALES_ENTRIES_VIEW.MULTI_LEDGER, view: SALES_ENTRIES_VIEW.MULTI_LEDGER, label: 'Without Inventory', tag: 'Multi Ledger' },
])

/**
 * FETCH FROM GSTR-1 - the sections it reads (api_section, Services/Gst/gstReturnService):
 * B2B invoices only, as the old screen. Their invoices become the entries here.
 */
export const GSTR_1_FETCH_SECTIONS = Object.freeze(['b2b'])

/** The portal's own table names, as a failed section is reported - "B2BA : <message>". */
export const GSTR_1_PORTAL_TABLES = Object.freeze({
  B2B: 'B2B invoices',
  B2BA: 'B2B amendments',
  B2CL: 'B2C large invoices',
  B2CLA: 'B2C large amendments',
  B2CS: 'B2C small summaries',
  B2CSA: 'B2C small amendments',
  CDNR: 'Credit / debit notes (registered)',
  CDNRA: 'Credit / debit note amendments (registered)',
  CDNUR: 'Credit / debit notes (unregistered)',
  CDNURA: 'Credit / debit note amendments (unregistered)',
  EXP: 'Exports',
  EXPA: 'Export amendments',
  AT: 'Advances received',
  ATA: 'Advances received amendments',
  TXP: 'Advances adjusted',
  TXPA: 'Advances adjusted amendments',
  HSN: 'HSN-wise summary',
  NIL: 'Nil-rated / exempt',
  DOC: 'Documents issued',
  ECOM: 'E-commerce supplies',
  ECOMA: 'E-commerce amendments',
  RETSUM: 'Return summary',
})
