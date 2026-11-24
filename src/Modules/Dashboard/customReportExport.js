/**
 * THE CUSTOM REPORT AS AN EXCEL FILE - Inventory_Custom_Report.xlsx.
 *
 *   PRODUCT NAME | CATEGORY | QUANTITY | ...        <- once, at the top (frozen)
 *   chair        | Finished | 202      | ...        <- a product
 *   Warehouse | Level | Shelf | Rack | Quantity     <- its warehouses
 *   WAREHOUSING 1 | LE-1 | SH-2 | Ra-3 | 10
 *   nirmal warehouse | ...
 *   table        | Finished | 40       | ...        <- the next product
 *   ...
 *
 * It is written from the rows exactly as the Custom Report has them on
 * screen - every page of them, in the order the table is sorted, after the
 * search and every filter (view.allRows). With warehouses chosen those rows
 * are already narrowed to them (narrowCustomReport): their Quantity and their
 * warehouse lines are the chosen warehouses' alone. Nothing is asked of the
 * backend, and nothing on screen is changed.
 *
 * The columns are the report's own (readCustomReport), under the table's
 * headings; an "Item Name" column, or else the product's name, comes first.
 * A product with no warehouse lines says so under its warehouse heading.
 *
 * The library (write-excel-file, which the other Excel downloads use) is
 * loaded on the first download: nothing else on the page needs it.
 */

export const CUSTOM_REPORT_FILE_NAME = 'Inventory_Custom_Report.xlsx'

const WAREHOUSE_HEADINGS = ['Warehouse', 'Level', 'Shelf', 'Rack', 'Quantity']

const BORDER = { borderStyle: 'thin', borderColor: '#CCCCCC' }

const STYLE = {
  productHeading: { ...BORDER, fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: '#4F81BD', align: 'center' },
  product: { ...BORDER, backgroundColor: '#D9E1F2', align: 'left' },
  warehouseHeading: { ...BORDER, fontWeight: 'bold', backgroundColor: '#F2F2F2', align: 'center' },
  warehouse: { ...BORDER, backgroundColor: '#FFFFFF', align: 'left' },
}

/** Column widths, in characters: enough for what the column holds, within reason. */
const MIN_WIDTH = 10
const MAX_WIDTH = 45

const textOf = (value) => (value === null || value === undefined ? '' : String(value).trim())

/** A plain number, without a leading zero that would be lost ("0401" stays text). */
const PLAIN_NUMBER = /^-?(0|[1-9]\d{0,14})(\.\d+)?$/

/** A quantity as a number Excel can add up; anything else as the text it is. */
const quantityCell = (value) => {
  const text = textOf(value)
  return PLAIN_NUMBER.test(text) ? Number(text) : text
}

const styled = (value, style) => ({ value, ...style })

/** The columns in the file's order: "Item Name" (or the product's name) first, then the table's. */
const orderColumns = (columns, nameKey) => {
  const first =
    columns.find(({ key, label }) => [key, label].some((text) => textOf(text).toLowerCase() === 'item name')) ??
    columns.find(({ key }) => key === nameKey)

  return first ? [first, ...columns.filter((column) => column !== first)] : columns
}

/**
 * The sheet's rows and column widths, from the report as on screen:
 *
 *   rows         the Custom Report's rows (view.allRows)
 *   columns      [{ key, label }] (readCustomReport)
 *   nameKey      the product-name column, or null
 *   quantityKey  the quantity column, or null - written as a number
 */
export const buildCustomReportSheet = ({ rows, columns, nameKey = null, quantityKey = null }) => {
  const ordered = orderColumns(columns, nameKey)

  const data = [ordered.map(({ label }) => styled(label, STYLE.productHeading))]

  rows.forEach((row) => {
    data.push(
      ordered.map(({ key }) => styled(key === quantityKey ? quantityCell(row[key]) : textOf(row[key]), STYLE.product)),
    )
    data.push(WAREHOUSE_HEADINGS.map((heading) => styled(heading, STYLE.warehouseHeading)))

    if (row.warehouses.length === 0) {
      data.push([styled('No warehouse allocation', STYLE.warehouse), ...WAREHOUSE_HEADINGS.slice(1).map(() => styled('', STYLE.warehouse))])
      return
    }

    row.warehouses.forEach((warehouse) => {
      data.push([
        styled(textOf(warehouse.label), STYLE.warehouse),
        styled(textOf(warehouse.level), STYLE.warehouse),
        styled(textOf(warehouse.shelf), STYLE.warehouse),
        styled(textOf(warehouse.rackNo), STYLE.warehouse),
        styled(quantityCell(warehouse.quantity), STYLE.warehouse),
      ])
    })
  })

  // Each column as wide as its longest value, product or warehouse alike.
  const count = Math.max(ordered.length, WAREHOUSE_HEADINGS.length)
  const widths = Array.from({ length: count }, (_, index) =>
    data.reduce((widest, line) => Math.max(widest, textOf(line[index]?.value).length + 2), MIN_WIDTH),
  ).map((width) => ({ width: Math.min(width, MAX_WIDTH) }))

  return { data, columns: widths }
}

/** Builds the file and hands it to the browser to save. */
export const downloadCustomReport = async (report) => {
  const { data, columns } = buildCustomReportSheet(report)
  const { default: writeExcelFile } = await import('write-excel-file/browser')

  await writeExcelFile(data, { columns, sheet: 'Custom Report', stickyRowsCount: 1 }).toFile(CUSTOM_REPORT_FILE_NAME)
}
