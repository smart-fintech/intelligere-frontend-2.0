/**
 * Ledger field names: the app's, and the backend's.
 *
 * ------------------------------------------------------------------
 * ONE SPELLING IN THE APP
 * ------------------------------------------------------------------
 * Every ledger field in the app is `ledger_<field>` - ledger_name,
 * ledger_gstin, ledger_country, ledger_city, ledger_pincode, ledger_sac...
 *
 * The backend's ledger model spells twelve of them "ledeger_" (ledeger_name,
 * ledeger_state, ledeger_guid...), and that is what its API sends and reads
 * - and what the Tally EXE installed on each user's machine reads from the
 * ledger messages sent to it. That spelling is written down HERE and nowhere
 * else: the app translates at the edge, so no screen ever sees it.
 *
 *   in    fromApiLedger / fromApiLedgers   a record the API sent -> app keys
 *   out   toApiLedger                      a payload / Tally message -> API keys
 *         toApiLedgerKey                   one key, for a row that is not a
 *                                          ledger record (a voucher row's
 *                                          party address)
 *
 * When the backend and the EXE take `ledger_` for these fields, the list
 * below is emptied (or this file deleted) and nothing else changes.
 */

const API_PREFIX = 'ledeger_'
const APP_PREFIX = 'ledger_'

/** The fields the backend spells with API_PREFIX; every other `ledger_` key is the same on both sides. */
const API_SPELLED_FIELDS = Object.freeze([
  'name',
  'email',
  'phone',
  'address',
  'group',
  'group_name',
  'state',
  'city',
  'country',
  'gstin',
  'website',
  'guid',
])

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isBlank = (value) => value === undefined || value === null || value === ''

/**
 * A record as the API sent it, with each `ledeger_<field>` key as
 * `ledger_<field>`. Nothing else in it changes.
 *
 * Should a record carry both spellings of one field, the backend's own
 * column (`ledeger_`) wins unless it is empty - so a value is never lost.
 * Anything that is not a plain object is handed back untouched.
 */
export const fromApiLedger = (record) => {
  if (!isRecord(record)) return record

  const app = {}
  const spelled = []
  Object.entries(record).forEach(([key, value]) => {
    if (key.startsWith(API_PREFIX)) spelled.push([APP_PREFIX + key.slice(API_PREFIX.length), value])
    else app[key] = value
  })
  spelled.forEach(([key, value]) => {
    if (!isBlank(value) || !(key in app)) app[key] = value
  })
  return app
}

/** fromApiLedger over a list; anything that is not a list is an empty one. */
export const fromApiLedgers = (records) => (Array.isArray(records) ? records.map(fromApiLedger) : [])

/** The backend's name for one of the app's keys - the key itself when the two agree. */
export const toApiLedgerKey = (key) => {
  if (typeof key !== 'string' || !key.startsWith(APP_PREFIX)) return key
  const field = key.slice(APP_PREFIX.length)
  return API_SPELLED_FIELDS.includes(field) ? API_PREFIX + field : key
}

/**
 * A ledger payload with the app's keys renamed to the backend's. A record
 * already in the backend's spelling (the CSV import's parsed rows) passes
 * through as it is; a key whose backend spelling is already present is left
 * alone rather than overwrite it.
 */
export const toApiLedger = (record) => {
  if (!isRecord(record)) return record

  const api = {}
  Object.entries(record).forEach(([key, value]) => {
    const apiKey = toApiLedgerKey(key)
    if (apiKey !== key && apiKey in record) api[key] = value
    else api[apiKey] = value
  })
  return api
}
