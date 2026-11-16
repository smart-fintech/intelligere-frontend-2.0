import { useMemo, useState } from 'react'
import { AlertCircle, Download, SearchX, SlidersHorizontal } from 'lucide-react'

import { ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Field, SelectField } from '@/Components/Common/FormFields'
import { MultiSelectField } from '@/Components/Common/MultiSelectField'
import { DataTable, PlainHead, TablePager } from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { TableCell, TableRow } from '@/Components/ui/table'
import { QUERY } from '@/Constants/queryKeys'
import { useListView } from '@/Hooks/useListView'
import { useQuery } from '@/Library/queryCache'
import { toast } from '@/Library/toast'
import {
  ENTRY_PAGER,
  LEDGER_PAGER,
  checkReportFilters,
  netText,
  readLedgerReport,
  showsPager,
  toLedgerDate,
} from '@/Modules/PayableReceivable/LedgerExport/ledgerExport'
import { formatAmount } from '@/Modules/SalesInvoice/Document/invoiceFormat'
import { getPartyWiseLedger } from '@/Services/Accounting/ledgerExportService'
import { createPdf, downloadPdf, safeFileName } from '@/Utils/pdf'

/**
 * THE PARTY-WISE LEDGER REPORT from what came from Tally - nothing is asked for
 * until OK: one or more ledgers, one Amount with its Dr or Cr.
 *
 *   groups         [{ name, ledgers }] - groupLedgers, only the party groups
 *
 * An answer is cached by what was asked; OK on the same choices asks again.
 *
 * Paged in the browser, as the API sends everything at once: the ledgers
 * (LEDGER_PAGER), and each ledger's rows on their own (ENTRY_PAGER) - neither
 * drawn while it all fits on one page. Each ledger's totals are of all its rows,
 * on every page. Each ledger has its own Download PDF, of all its rows, never
 * only a page.
 */

const NO_FILTERS = Object.freeze({ group: '', ledgers: [], from: '', to: '' })

const signedAmount = (row) => {
  if (!row.hasAmount) return ''
  return `${formatAmount(row.amount)} ${row.type === 'credit' ? 'Cr' : 'Dr'}`
}

function PartyRows({ ledger, rows }) {
  return (
    <>
      {rows.map((row) => (
        <TableRow key={row.key}>
          <TableCell>{row.date}</TableCell>
          <TableCell title={row.invoiceNo}>{row.invoiceNo}</TableCell>
          <TableCell title={row.particulars}>{row.particulars}</TableCell>
          <TableCell title={row.voucherType}>{row.voucherType}</TableCell>
          <TableCell className="text-right tabular-nums">{signedAmount(row)}</TableCell>
        </TableRow>
      ))}
      <TableRow className="font-semibold">
        <TableCell colSpan={4}>Closing Balance</TableCell>
        <TableCell className="text-right tabular-nums">{netText(ledger.debit, ledger.credit)}</TableCell>
      </TableRow>
    </>
  )
}

/** One ledger's table, with its own paging. */
function LedgerTable({ ledger }) {
  const view = useListView(ledger.rows)

  return (
    <>
      <DataTable
        head={
          <>
            <PlainHead width={110}>Date</PlainHead>
            <PlainHead width={150}>Invoice No.</PlainHead>
            <PlainHead width={260}>Particulars</PlainHead>
            <PlainHead width={130}>Voucher Type</PlainHead>
            <PlainHead width={160} className="text-right">
              Amount
            </PlainHead>
          </>
        }
      >
        <PartyRows ledger={ledger} rows={view.rows} />
      </DataTable>
      {showsPager(view) ? <TablePager view={view} {...ENTRY_PAGER} /> : null}
    </>
  )
}

/** One group's ledgers, each with its PDF, paged. */
function ReportGroup({ group, downloading, onDownloadLedger }) {
  const view = useListView(group.ledgers)

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-brand">
        {group.name} ({group.ledgers.length}) - Grand Total: {netText(group.debit, group.credit)}
      </h3>
      {view.rows.map((ledger) => (
        <div key={ledger.name} className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">{ledger.name}</h4>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={Download}
              aria-label={`Download PDF of ${ledger.name}`}
              loading={downloading === ledger.name}
              onClick={() => onDownloadLedger(group, ledger)}
            >
              Download PDF
            </Button>
          </div>
          <LedgerTable ledger={ledger} />
        </div>
      ))}
      {showsPager(view) ? <TablePager view={view} {...LEDGER_PAGER} /> : null}
    </section>
  )
}

export default function LedgerReport({ groups, companyId, companyName, companyAddress }) {
  const [filters, setFilters] = useState(NO_FILTERS)
  const [errors, setErrors] = useState({})
  const [asked, setAsked] = useState(null) // what OK last asked for
  const [downloading, setDownloading] = useState(null) // the ledger whose PDF is being made

  const ledgerOptions = useMemo(
    () => (groups.find((group) => group.name === filters.group)?.ledgers ?? []).map((name) => ({ value: name, label: name })),
    [groups, filters.group],
  )

  const report = useQuery({
    key: asked ? [QUERY.LEDGER_REPORT, companyId, 'party', asked] : null,
    fetch: () => getPartyWiseLedger(asked).then(readLedgerReport),
  })
  const shown = report.data
  const loading = Boolean(asked) && report.status === 'loading'

  const change = (changes) => setFilters((previous) => ({ ...previous, ...changes }))

  const showReport = () => {
    const found = checkReportFilters(filters)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    const next = {
      company_id: companyId,
      ledger_name: filters.ledgers,
      from_date: toLedgerDate(filters.from),
      to_date: toLedgerDate(filters.to),
    }
    if (JSON.stringify(next) === JSON.stringify(asked)) report.reload()
    else setAsked(next)
  }

  const clear = () => {
    setFilters(NO_FILTERS)
    setErrors({})
    setAsked(null)
  }

  const downloadLedger = async (group, ledger) => {
    setDownloading(ledger.name)
    try {
      const bytes = await createPdf(() => import('@/Modules/PayableReceivable/LedgerExport/LedgerReportPdfDocument'), {
        companyName,
        companyAddress,
        groups: [{ ...group, ledgers: [ledger], debit: ledger.debit, credit: ledger.credit }],
        from: asked.from_date,
        to: asked.to_date,
      })
      downloadPdf(bytes, `PartyWiseLedger_${safeFileName(ledger.name)}.pdf`)
    } catch (failure) {
      toast.error(failure.message || 'The PDF could not be made.')
    } finally {
      setDownloading(null)
    }
  }

  const renderResult = () => {
    if (!asked) {
      return (
        <StateMessage icon={SlidersHorizontal} title="Use the filters to show the data">
          Choose a group, one or more ledgers and the dates, then OK.
        </StateMessage>
      )
    }
    if (loading && !shown) return <ListSkeleton rows={4} />
    if (report.status === 'failed') {
      return (
        <StateMessage icon={AlertCircle} tone="error" title="Could not load the ledger" action={<RetryButton onClick={report.reload} />}>
          {report.error}
        </StateMessage>
      )
    }
    if (!shown || shown.length === 0) {
      return (
        <StateMessage icon={SearchX} title="No data found">
          Nothing was recorded for this choice in these dates.
        </StateMessage>
      )
    }

    // A new answer starts again from the first page.
    return shown.map((group) => (
      <ReportGroup
        key={`${group.name}|${JSON.stringify(asked)}`}
        group={group}
        downloading={downloading}
        onDownloadLedger={downloadLedger}
      />
    ))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3 min-[1200px]:flex-nowrap">
        <SelectField
          id="le-group"
          label="Group"
          required
          className="w-full sm:w-56 min-[1200px]:shrink-0"
          placeholder="Select group"
          options={groups.map(({ name }) => ({ value: name, label: name }))}
          value={filters.group}
          error={errors.group}
          onValueChange={(group) => change({ group, ledgers: [] })}
        />
        <MultiSelectField
          id="le-ledgers"
          label="Ledger"
          required
          placeholder={filters.group ? 'Select ledgers' : 'Select a group first'}
          searchPlaceholder="Search ledger"
          options={ledgerOptions}
          value={filters.ledgers}
          error={errors.ledgers}
          disabled={!filters.group}
          className="w-full min-w-0 sm:w-72 min-[1200px]:w-auto min-[1200px]:max-w-96 min-[1200px]:flex-1 [&>span:first-child]:block"
          onChange={(ledgers) => change({ ledgers })}
        />
        <Field
          id="le-from"
          label="From Date"
          required
          className="w-full sm:w-40 min-[1200px]:shrink-0"
          type="date"
          value={filters.from}
          error={errors.from}
          onChange={(event) => change({ from: event.target.value })}
        />
        <Field
          id="le-to"
          label="To Date"
          required
          className="w-full sm:w-40 min-[1200px]:shrink-0"
          type="date"
          value={filters.to}
          error={errors.to}
          onChange={(event) => change({ to: event.target.value })}
        />
        <div className="flex w-full items-center gap-2 min-[1200px]:mt-5.5 min-[1200px]:w-auto min-[1200px]:shrink-0">
          <Button type="button" variant="secondary" size="sm" loading={loading} onClick={showReport}>
            OK
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={clear}>
            Clear
          </Button>
        </div>
      </div>

      {renderResult()}
    </div>
  )
}
