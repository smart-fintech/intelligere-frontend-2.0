/**
 * The Custom Report view of the Inventory tab: the company's products with
 * every field it keeps for them, one row each, and the stock of each behind
 * its arrow.
 *
 *   POST inventory/ProductCustomizedReport/ { company_name }  (getProductCustomReport)
 *
 * Read the first time the view is opened, kept while the user is elsewhere,
 * and read again on Refresh or when the company changes (useCompanyReport).
 * The columns are the reply's own (see ../customReport) - nothing here names
 * a field of the company's.
 *
 * READ-ONLY. The Actions column holds the arrow that opens a row onto its
 * warehouses, and nothing else.
 *
 * FILTERS - all on the rows already loaded, no request:
 *   the search box   the product's name (when the report has such a column)
 *   Warehouse        warehouses the product has stock in, as many as wanted -
 *                    not offered to a company whose plan allows one warehouse.
 *                    With some chosen, a row's Quantity and the lines it opens
 *                    onto are those warehouses' alone (narrowCustomReport);
 *                    with none, the report as it came
 *   Expiry           a date range - only when the report HAS an expiry date
 *                    column; none is assumed
 *
 * The opened row's Created At is the entry's `created_at` - a dash until the
 * report sends one (see ../customReport).
 *
 * EXCEL (beside the filters) saves Inventory_Custom_Report.xlsx: every row
 * the search and filters leave - all pages, in the table's sort, narrowed to
 * the chosen warehouses - with each product's warehouse lines under it
 * (../customReportExport). No request; one download at a time.
 */

import { Fragment, useMemo, useRef, useState } from 'react'
import { AlertCircle, ChevronDown, ChevronRight, Download, FileSpreadsheet, RefreshCw } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Panel } from '@/Components/Common/Panel'
import {
  DataTable,
  DateRangeFilter,
  PlainHead,
  SortableHead,
  TableFilters,
  TablePager,
} from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { TableCell, TableRow } from '@/Components/ui/table'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import useCompanyReport from '@/Hooks/useCompanyReport'
import { useListView } from '@/Hooks/useListView'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { getProductCustomReport } from '@/Services/Inventory/inventoryProductService'
import { hasSingleWarehouseLimit } from '@/Services/Inventory/inventoryService'
import { orDash } from '@/Utils/display'
import { filterCustomReport, narrowCustomReport, readCustomReport, reportWarehouses } from '../customReport'
import { downloadCustomReport } from '../customReportExport'
import { displayValue } from '../productList'

const WAREHOUSE_FILTER = 'warehouse'
const NO_RANGE = { from: '', to: '' }
/** No warehouses chosen - one array, so the memos built on it hold. */
const NO_WAREHOUSES = []

/** The opened row's warehouse lines: a heading, then one line per stock entry. */
const GRID = 'grid min-w-[48rem] grid-cols-[minmax(9rem,1.6fr)_6rem_6rem_6rem_6rem_minmax(9.5rem,1fr)_minmax(8rem,1.4fr)] gap-x-3'

/**
 * A row's warehouses. Created At is the ENTRY's (one row is one entry), so
 * it is written on its first line only, as on the Product view.
 */
function WarehouseLines({ warehouses, createdAt }) {
  if (warehouses.length === 0) {
    return <p className="px-3 py-4 text-center text-xs text-muted-foreground">No warehouse allocation for this product.</p>
  }

  return (
    <div className="overflow-x-auto px-3 py-2">
      <div className={cn(GRID, 'border-b border-border pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase')}>
        <span>Warehouse</span>
        <span>Level</span>
        <span>Shelf</span>
        <span>Rack No.</span>
        <span>Quantity</span>
        <span>Created At</span>
        <span>Other</span>
      </div>
      {warehouses.map((warehouse, index) => (
        <div key={index} className={cn(GRID, 'items-start py-1.5 text-xs text-foreground')}>
          <span className="font-medium break-words">{orDash(warehouse.label)}</span>
          <span>{orDash(warehouse.level)}</span>
          <span>{orDash(warehouse.shelf)}</span>
          <span>{orDash(warehouse.rackNo)}</span>
          <span>{orDash(warehouse.quantity)}</span>
          {/* As the backend sends it, never re-parsed - the Product view's way. */}
          <span className="break-words">{index === 0 ? orDash(createdAt) : ''}</span>
          <span className="break-words text-muted-foreground">
            {warehouse.others.length > 0
              ? warehouse.others.map(({ label, value }) => `${label}: ${displayValue(value)}`).join('  ·  ')
              : '--'}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function CustomReport({ enabled = true }) {
  const { activeCompany, activeCompanyName: companyName } = useActiveCompany()
  const singleWarehouse = hasSingleWarehouseLimit(activeCompany)

  const report = useCompanyReport(getProductCustomReport, enabled)
  const loading = report.status === 'loading'

  const read = useMemo(() => readCustomReport(report.rows), [report.rows])
  const warehouses = useMemo(() => (singleWarehouse ? [] : reportWarehouses(read.rows)), [read.rows, singleWarehouse])

  /* ---------------- Filters ---------------- */
  const [chosenWarehouses, setChosenWarehouses] = useState(NO_WAREHOUSES)
  const [expiry, setExpiry] = useState(NO_RANGE)

  // A warehouse no longer in the report is not applied.
  const activeWarehouses = useMemo(() => {
    const still = chosenWarehouses.filter((label) => warehouses.includes(label))
    return still.length > 0 ? still : NO_WAREHOUSES
  }, [chosenWarehouses, warehouses])
  const expirySet = Boolean(read.expiryKey && (expiry.from || expiry.to))

  // The rows the filters leave, in the chosen warehouses only - see FILTERS at the top.
  const filtered = useMemo(
    () =>
      narrowCustomReport(
        filterCustomReport(read.rows, { warehouses: activeWarehouses, ...expiry, expiryKey: read.expiryKey }),
        activeWarehouses,
        read.quantityKey,
      ),
    [read.rows, activeWarehouses, expiry, read.expiryKey, read.quantityKey],
  )

  const view = useListView(filtered, { searchFields: read.nameKey ? [read.nameKey] : [] })

  const filterView = {
    ...view,
    filterFields: warehouses.length > 0 ? { [WAREHOUSE_FILTER]: 'Warehouse' } : {},
    filterOptions: { [WAREHOUSE_FILTER]: warehouses },
    // Several at once - a multi-select on the row (TableFilters).
    multiFilterFields: [WAREHOUSE_FILTER],
    filters: { [WAREHOUSE_FILTER]: activeWarehouses },
    setFilter: (_field, values) => {
      setChosenWarehouses(values.length > 0 ? values : NO_WAREHOUSES)
      view.setPage(1)
    },
    isFiltered: view.isFiltered || activeWarehouses.length > 0 || expirySet,
    clear: () => {
      setChosenWarehouses(NO_WAREHOUSES)
      setExpiry(NO_RANGE)
      view.clear()
    },
  }

  /* ---------------- Excel ----------------
     The rows as the table has them - every page, sorted, filtered and
     narrowed (view.allRows). `busy` stops a second click starting a second
     file before the state that disables the button has been drawn. */
  const [downloading, setDownloading] = useState(false)
  const busy = useRef(false)

  const downloadExcel = async () => {
    if (busy.current || view.total === 0) return
    busy.current = true
    setDownloading(true)

    try {
      await downloadCustomReport({
        rows: view.allRows,
        columns: read.columns,
        nameKey: read.nameKey,
        quantityKey: read.quantityKey,
      })
    } catch (failure) {
      toast.error(failure?.message || 'The Excel file could not be made.')
    } finally {
      busy.current = false
      setDownloading(false)
    }
  }

  const excelButton = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      icon={Download}
      loading={downloading}
      disabled={downloading || view.total === 0}
      tooltip={view.total === 0 ? 'Nothing to download' : 'Download the products shown, with their warehouses, in Excel'}
      onClick={downloadExcel}
    >
      {downloading ? 'Downloading...' : 'Excel'}
    </Button>
  )

  /* ---------------- Opened rows ---------------- */
  const [expanded, setExpanded] = useState([])
  const toggle = (key) =>
    setExpanded((previous) => (previous.includes(key) ? previous.filter((entry) => entry !== key) : [...previous, key]))

  const columnCount = read.columns.length + 1

  const renderBody = () => {
    if (!companyName) {
      return (
        <StateMessage icon={FileSpreadsheet} title="No company selected">
          Choose a company in the header to see its report.
        </StateMessage>
      )
    }

    if (read.rows.length === 0) {
      if (loading || report.status === 'idle') return <ListSkeleton />

      if (report.status === 'failed') {
        return (
          <StateMessage
            icon={AlertCircle}
            tone="error"
            title="Could not load the custom report"
            action={<RetryButton onClick={report.reload} />}
          >
            {report.error}
          </StateMessage>
        )
      }

      return (
        <StateMessage icon={FileSpreadsheet} title="No products found">
          The custom report has nothing to show for this company yet.
        </StateMessage>
      )
    }

    return (
      <>
        <TableFilters
          view={filterView}
          searchPlaceholder={read.nameKey ? `Search ${read.nameKey.toLowerCase()}` : 'Search'}
          extra={
            read.expiryKey ? (
              <DateRangeFilter
                label="Expiry"
                from={expiry.from}
                to={expiry.to}
                onChange={(range) => {
                  setExpiry(range)
                  view.setPage(1)
                }}
              />
            ) : null
          }
          actions={excelButton}
        />

        {view.total === 0 ? (
          <StateMessage icon={FileSpreadsheet} title="No matching products">
            Nothing matches the current filters.
          </StateMessage>
        ) : (
          <DataTable
            defaultColumnWidth={140}
            head={
              <>
                {read.columns.map(({ key, label }) => (
                  <SortableHead key={key} view={view} field={key} width={key === read.nameKey ? 200 : undefined}>
                    {label}
                  </SortableHead>
                ))}
                <PlainHead width={72} className="text-right">
                  Actions
                </PlainHead>
              </>
            }
          >
            {view.rows.map((row) => {
              const open = expanded.includes(row.key)
              const name = (read.nameKey && row[read.nameKey]) || 'product'

              return (
                <Fragment key={row.key}>
                  <TableRow className="text-brand">
                    {read.columns.map(({ key }) => (
                      <TableCell
                        key={key}
                        className={cn(key === read.nameKey && 'font-medium')}
                        title={row[key] || undefined}
                      >
                        {orDash(row[key])}
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="iconEdit"
                          size="icon-sm"
                          icon={open ? ChevronDown : ChevronRight}
                          tooltip={open ? 'Hide warehouse details' : 'Show warehouse details'}
                          aria-label={`${open ? 'Hide' : 'Show'} warehouse details of ${name}`}
                          aria-expanded={open}
                          onClick={() => toggle(row.key)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>

                  {open ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={columnCount} wrap className="bg-muted/40 p-0">
                        {/* Eased in, rather than snapping open. */}
                        <div className="animate-in duration-200 fade-in-0 slide-in-from-top-1 motion-reduce:animate-none">
                          <WarehouseLines warehouses={row.warehouses} createdAt={row.createdAt} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              )
            })}
          </DataTable>
        )}

        <TablePager view={view} />
      </>
    )
  }

  return (
    <Panel
      title="Custom Report"
      meta={read.rows.length > 0 ? `(Total Count: ${read.rows.length})` : undefined}
      actions={
        <Button
          type="button"
          size="sm"
          onClick={report.reload}
          disabled={!companyName || loading}
          aria-label="Refresh custom report"
        >
          <RefreshCw className={cn(loading && companyName && 'animate-spin')} />
          Refresh
        </Button>
      }
    >
      {report.status === 'failed' && read.rows.length > 0 ? (
        <InlineAlert action={<RetryButton onClick={report.reload} />}>{report.error}</InlineAlert>
      ) : null}

      {renderBody()}
    </Panel>
  )
}
