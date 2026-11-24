/**
 * READING THE CUSTOM REPORT - with no screen attached.
 *
 * `POST inventory/ProductCustomizedReport/` (getProductCustomReport) answers
 * with one object per product, its fields under the company's own names and
 * its stock in `warehouse`:
 *
 *   { "id": 30029, "Product Name": "shirt", "Category": "Semi-Finished",
 *     "Quantity": "200", "Unit Rate": "900", "Fabric Type": "Garment", ...,
 *     "warehouse": [{ "id": "12", "name": "WAREHOUSING 1", "level": "LE-1",
 *                     "shelf": "SH-2", "rack_no": "Ra-3", "warehouse_quantity": "200" }] }
 *
 * NO COLUMN IS NAMED HERE. The columns are every plain field the rows carry
 * (text, numbers, yes/no), in the order they first appear, under their own
 * names - so a company with other fields gets other columns. `id` is the
 * row's identity, not a column; `warehouse` is the row's expansion; a list
 * or an object is not a column either.
 *
 * Two fields are recognised by NAME, because the screen does something with
 * them, and only when the rows really have them:
 *
 *   the product's name   ("Product Name" - PRODUCT_FIELD.NAME)
 *                        what the search box looks through
 *   an expiry date       ("Expiry Date", expiry_date - isExpiryDateField)
 *                        the only thing an expiry range filter can read;
 *                        without it there is no such filter
 *   the quantity         ("Quantity", any case - the backend's own test for
 *                        it) - the row's stock, worked out again from the
 *                        chosen warehouses when the Warehouse filter is set
 *
 * CREATED AT. A row is one stock entry, and the expansion has a Created At
 * column for that entry's `created_at`. The report does not send one yet, so
 * it reads a dash; when a row carries `created_at` it is shown there, as
 * sent, and is never made a column of its own.
 *
 *   readCustomReport(rows, warehouseNames)   columns, rows and those keys
 *   filterCustomReport(rows, filters)        the rows the filters leave
 *   narrowCustomReport(rows, labels, quantityKey)   them in some warehouses only
 */

import { displayValue, fieldLabel, isExpiryDateField, isWithinDates, otherFields, PRODUCT_FIELD } from './productList'

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isScalar = (value) => ['string', 'number', 'boolean'].includes(typeof value)
const textOf = (value) => (value === null || value === undefined ? '' : String(value).trim())

/** The keys that are the row's own, not columns - `created_at` is shown in the expansion. */
const NOT_COLUMNS = ['id', 'warehouse', 'created_at']

/** A warehouse entry's keys the expansion shows by name - everything else follows. */
const WAREHOUSE_KEYS = ['id', 'warehouse_id', 'name', 'warehouse_name', 'level', 'shelf', 'rack_no', 'warehouse_quantity']

/** One stock line of a row - named by the reply, or by the company's list, or by its id. */
const readWarehouse = (warehouse, names) => {
  const id = warehouse.id ?? warehouse.warehouse_id ?? null
  const name = textOf(warehouse.name ?? warehouse.warehouse_name) || textOf(names?.[String(id)])

  return {
    label: name || (textOf(id) ? `Warehouse ${id}` : ''),
    level: warehouse.level,
    shelf: warehouse.shelf,
    rackNo: warehouse.rack_no,
    quantity: warehouse.warehouse_quantity,
    others: otherFields(warehouse, WAREHOUSE_KEYS),
  }
}

/**
 * THE REPORT, ready to draw:
 *
 *   columns     [{ key, label }] - every plain field, first-seen order
 *   rows        [{ key, source, warehouses, createdAt, ...{ [column]: text } }] -
 *               each column's value as text, under the column's own key, so
 *               the list view can sort and search it as it is
 *   nameKey     the product-name column, or null
 *   expiryKey   the expiry-date column, or null
 *   quantityKey the quantity column, or null
 *
 * `warehouseNames` is optional: { "<warehouse id>": "name" }.
 */
export const readCustomReport = (rows, warehouseNames = null) => {
  const list = (Array.isArray(rows) ? rows : []).filter(isPlainObject)

  const keys = []
  list.forEach((row) =>
    Object.entries(row).forEach(([key, value]) => {
      if (NOT_COLUMNS.includes(key) || keys.includes(key)) return
      if (value === null || value === undefined || isScalar(value)) keys.push(key)
    }),
  )
  // A key that is a list or an object in any row is not a column after all.
  const columnKeys = keys.filter((key) => list.every((row) => row[key] === null || row[key] === undefined || isScalar(row[key])))

  const taken = new Set()

  return {
    columns: columnKeys.map((key) => ({ key, label: fieldLabel(key) })),
    rows: list.map((row, index) => {
      const own = row.id ?? `row-${index}`
      const key = taken.has(own) ? `${own}-${index}` : own
      taken.add(key)

      return {
        ...Object.fromEntries(columnKeys.map((column) => [column, displayValue(row[column]) === '--' ? '' : displayValue(row[column])])),
        key,
        source: row,
        // The entry's own, when the report sends it - see the note at the top.
        createdAt: textOf(row.created_at),
        warehouses: (Array.isArray(row.warehouse) ? row.warehouse : [])
          .filter(isPlainObject)
          .map((warehouse) => readWarehouse(warehouse, warehouseNames)),
      }
    }),
    nameKey: columnKeys.includes(PRODUCT_FIELD.NAME) ? PRODUCT_FIELD.NAME : null,
    expiryKey: columnKeys.find(isExpiryDateField) ?? null,
    quantityKey: columnKeys.find((key) => key.trim().toLowerCase() === 'quantity') ?? null,
  }
}

/** Every warehouse the rows have stock in, by label, sorted - what the Warehouse filter offers. */
export const reportWarehouses = (rows) =>
  [...new Set(rows.flatMap((row) => row.warehouses.map((warehouse) => warehouse.label)).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  )

/**
 * The rows the filters leave - a new list, in the same order:
 *
 *   warehouses  labels - a row with stock in any of them (none: no filter)
 *   from, to    a row whose `expiryKey` column falls in the range (YYYY-MM-DD,
 *               either end open) - only with an expiry column at all
 */
export const filterCustomReport = (rows, { warehouses = [], from = '', to = '', expiryKey = null } = {}) =>
  rows.filter((row) => {
    if (warehouses.length > 0 && !row.warehouses.some((entry) => warehouses.includes(entry.label))) return false
    if (expiryKey && (from || to) && !isWithinDates(row.source[expiryKey], from, to)) return false
    return true
  })

/** A number from a reply's text - 0 when it is not one, as in the backend's totals. */
const numberOr0 = (value) => {
  const number = Number(textOf(value))
  return textOf(value) && Number.isFinite(number) ? number : 0
}

/**
 * THE ROWS AS THEY STAND IN SOME WAREHOUSES - the Warehouse filter's: each
 * row's warehouse lines are only the chosen ones (`labels`), and its
 * quantity column (`quantityKey`, when there is one) is theirs added up -
 * as the backend's own warehouse_id filter answers for one warehouse. New
 * rows; the report is never changed. No labels: the rows as they are.
 */
export const narrowCustomReport = (rows, labels, quantityKey = null) => {
  if (!labels || labels.length === 0) return rows

  return rows.map((row) => {
    const warehouses = row.warehouses.filter((warehouse) => labels.includes(warehouse.label))
    const quantity = warehouses.reduce((total, warehouse) => total + numberOr0(warehouse.quantity), 0)

    return {
      ...row,
      warehouses,
      ...(quantityKey ? { [quantityKey]: String(Number(quantity.toFixed(4))) } : {}),
    }
  })
}
