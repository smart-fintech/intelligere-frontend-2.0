import { useMemo, useState } from 'react'
import { CloudDownload, MonitorDown } from 'lucide-react'

import { TablePager } from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { SALES_ENTRIES_PAGE_SIZE, SALES_ENTRIES_SOURCE } from '@/Constants/salesEntries'
import { useListView } from '@/Hooks/useListView'
import { cn } from '@/Library/utils'
import Gstr1FetchPanel, { Gstr1FetchResult } from '@/Modules/SalesEntries/MultiLedger/Gstr1FetchPanel'
import SalesTallyFetchModal from '@/Modules/SalesEntries/MultiLedger/SalesTallyFetchModal'
import { checkMultiEntry, readMultiEntry, toMultiLedgerRow } from '@/Modules/SalesEntries/MultiLedger/multiLedger'
import useGstr1Fetch from '@/Modules/SalesEntries/MultiLedger/useGstr1Fetch'
import useSalesTallyFetch from '@/Modules/SalesEntries/MultiLedger/useSalesTallyFetch'
import CreatePartyLedgerModal from '@/Modules/SalesEntries/shared/CreatePartyLedgerModal'
import DefaultLedgerSelect from '@/Modules/SalesEntries/shared/DefaultLedgerSelect'
import EntriesPanel from '@/Modules/SalesEntries/shared/EntriesPanel'
import EntriesTable from '@/Modules/SalesEntries/shared/EntriesTable'
import { Amount, Lines, PartyCell } from '@/Modules/SalesEntries/shared/EntryCells'
import GetEntriesPanel, { EntrySource } from '@/Modules/SalesEntries/shared/GetEntriesPanel'
import KeywordMappingPanel from '@/Modules/SalesEntries/shared/KeywordMappingPanel'
import SendActions from '@/Modules/SalesEntries/shared/SendActions'
import useEntryBatches from '@/Modules/SalesEntries/shared/useEntryBatches'
import useGetEntriesCard from '@/Modules/SalesEntries/shared/useGetEntriesCard'
import useGuardedSend from '@/Modules/SalesEntries/shared/useGuardedSend'
import useKeywordMapping from '@/Modules/SalesEntries/shared/useKeywordMapping'
import { useCompanyLedgers, useSalesLedgerChoice } from '@/Modules/SalesEntries/shared/useLedgerChoices'
import useTallySendAndMark from '@/Modules/SalesEntries/shared/useTallySendAndMark'
import { KEYWORD_SOURCE } from '@/Services/Accounting/keywordMappingService'
import {
  MULTI_LEDGER_CSV_FORMAT_CONTENT,
  MULTI_LEDGER_CSV_FORMAT_FILE,
  TALLY_SEND_MULTI_LEDGER_MODULE,
  buildSendMultiLedgerMessage,
  getMultiLedgerEntries,
  markMultiLedgerEntriesSent,
  uploadMultiLedgerEntries,
} from '@/Services/Accounting/salesEntriesService'
import { formatDate } from '@/Utils/date'

/**
 * WITHOUT INVENTORY - MULTI LEDGER. One entry is one invoice with its own
 * ledger lines (sales, charges, round off) and GST:
 *
 *   Get entries     the selection card (`picker`, SalesEntriesScreen) beside
 *                   the ways in. Using File: Download Format, Upload File (CSV or Excel), Fetch
 *                   from Tally (a CSV in the upload's format, to look over and
 *                   upload). Fetch from GSTR-1 (`source`): month, year and
 *                   Fetch in the card - the month's invoices straight in as
 *                   entries (useGstr1Fetch)
 *   The entries     a batch of 50 invoices (useEntryBatches), paged in the
 *                   browser (useListView), read through the multi_party keyword
 *                   mapping (readMultiEntry). Show Mapping puts the mapping in
 *                   the list's place, as the old screen
 *   Sales ledger    none to choose, as the old screen - the ledger lines name
 *                   them. Only when the batch holds an entry WITHOUT ledger lines
 *                   is a Sales Ledger asked for (empty until the user picks one)
 *   Send to Tally   every entry of the batch, as the old "Send N to tally"
 *                   (useTallySendAndMark), marked sent only when Tally created them all
 */

const MAPPING_RULE = 'A party ledger CONTAINING the keyword, or a ledger line or GST ledger that IS the keyword, becomes the mapped ledger.'

export default function MultiLedgerView({
  companyId,
  companyName,
  isTally,
  canCreateLedger,
  picker,
  source = SALES_ENTRIES_SOURCE.FILE,
}) {
  const batch = useEntryBatches(companyId, getMultiLedgerEntries)
  // Read only once there are entries to post - nothing is asked when the view opens.
  const enabled = batch.hasData
  const sales = useSalesLedgerChoice(companyId, { enabled })
  const ledgers = useCompanyLedgers(companyId, { enabled })
  const mapping = useKeywordMapping(companyId, KEYWORD_SOURCE.MULTI_PARTY, { enabled })
  const [mappingOpen, setMappingOpen] = useState(false)
  const [creatingFor, setCreatingFor] = useState(null)
  const [salesLedger, setSalesLedger] = useState('')

  const entries = useMemo(
    () => batch.rows.map((raw) => readMultiEntry(raw, { mapping: mapping.mapping, ledgerNames: ledgers.names })),
    [batch.rows, mapping.mapping, ledgers.names],
  )
  // The old screen chose no sales ledger here: each entry's ledger lines name theirs. One is
  // asked for only when the batch holds entries without ledger lines - nothing is chosen for the user.
  const needsSalesLedger = entries.some((entry) => entry.needsSalesLedger)

  const [fetchOpen, setFetchOpen] = useState(false)
  const tallyFetch = useSalesTallyFetch({ companyName, onFetched: () => setFetchOpen(false) })
  const gstr1 = useGstr1Fetch({
    companyId,
    // The fetched invoices have replaced the entries: start on batch 1 again.
    onSaved: () => {
      card.awaitFresh()
      batch.restart()
    },
  })
  const tally = useTallySendAndMark({
    moduleName: TALLY_SEND_MULTI_LEDGER_MODULE,
    companyName,
    buildMessage: buildSendMultiLedgerMessage,
    markSent: (numbers) => markMultiLedgerEntriesSent(companyId, [...new Set(numbers)]),
    onSettled: batch.reload,
  })
  const busy = tally.busy || tallyFetch.busy || gstr1.fetching

  const salesLedgerOf = (entry) => (entry.needsSalesLedger ? salesLedger : '')
  const problemOf = (entry) => checkMultiEntry(entry, salesLedgerOf(entry))
  const locked = useMemo(() => {
    const numbers = new Set([...tally.inFlight, ...tally.unmarked])
    return new Set(entries.filter((entry) => numbers.has(entry.invoiceNo)).map((entry) => entry.key))
  }, [entries, tally.inFlight, tally.unmarked])
  // As the old screen: Send sends every entry of the batch (all but those already on their way).
  const chosen = entries.filter((entry) => !locked.has(entry.key))
  const guard = useGuardedSend({
    chosen,
    problemOf,
    toItem: (entry) => ({ invoiceNo: entry.invoiceNo, row: toMultiLedgerRow(entry, salesLedgerOf(entry)) }),
    tally,
  })

  const view = useListView(entries, { initialPageSize: SALES_ENTRIES_PAGE_SIZE })
  const offset = typeof view.pageSize === 'number' ? (view.page - 1) * view.pageSize : 0

  // As the old screen: the invoice, its amounts, its ledger lines and GST, then who it is to.
  // As the old screen: a ledger line whose name the company's ledgers do not hold (trimmed, any case)
  // shows red - for the charges, and the same check on the GST ledgers. Only once the list is in, and
  // it clears by itself when the keyword mapping or a new ledger makes the name one of the company's.
  const missingLedger = (line) => ledgers.names.size > 0 && !ledgers.names.has(line.name.trim().toLowerCase())
  const taxColumn = (tax, head) => ({
    key: tax,
    head,
    width: 160,
    cell: (entry) => <Lines lines={entry.taxes.filter((line) => line.tax === tax)} empty="" missing={missingLedger} />,
  })
  const columns = [
    { key: 'invoice', head: 'Invoice No', width: 140, cell: (entry) => <span className="font-medium">{entry.invoiceNo || '--'}</span> },
    { key: 'date', head: 'Invoice Date', width: 110, cell: (entry) => (entry.invoiceDate ? formatDate(entry.invoiceDate) : '--') },
    { key: 'taxable', head: 'Taxable Amt.', width: 115, align: 'right', cell: (entry) => <Amount value={entry.taxable} /> },
    { key: 'total', head: 'Total', width: 115, align: 'right', cell: (entry) => <Amount value={entry.total} className="font-medium" /> },
    { key: 'state', head: 'State', width: 120, cell: (entry) => entry.state || '--' },
    { key: 'lines', head: 'Charges | Amt.', width: 210, cell: (entry) => <Lines lines={entry.lines} empty="" missing={missingLedger} /> },
    taxColumn('CGST', 'Cgst | Amt.'),
    taxColumn('SGST', 'Sgst | Amt.'),
    taxColumn('IGST', 'Igst | Amt.'),
    {
      key: 'party',
      head: 'Party Ledger',
      width: 230,
      cell: (entry) => (
        <PartyCell
          name={entry.partyLedger}
          sub={entry.gstin}
          notInTally={entry.notInTally && Boolean(entry.partyLedger)}
          onCreate={canCreateLedger && entry.partyLedger ? () => setCreatingFor(entry) : undefined}
          locked={locked.has(entry.key)}
          problem={problemOf(entry)}
          disabled={busy}
        />
      ),
    },
  ]

  const fromFile = source === SALES_ENTRIES_SOURCE.FILE
  // Entries are in from an answer that did not fail: the Get Entries card steps aside.
  const card = useGetEntriesCard(batch)

  return (
    <div className="space-y-4">
      <GetEntriesPanel
        picker={picker}
        showFile={fromFile}
        hidden={card.hidden}
        onClose={card.reopened ? card.close : undefined}
        format={{ file: MULTI_LEDGER_CSV_FORMAT_FILE, content: MULTI_LEDGER_CSV_FORMAT_CONTENT }}
        upload={(file) => uploadMultiLedgerEntries(companyId, file)}
        onUploaded={() => {
          card.awaitFresh()
          batch.restart()
        }}
        total={batch.total}
        disabled={busy}
        replaces="the multi ledger entries you uploaded or fetched from GSTR-1 before"
        hint="One row per ledger line: the invoice on its first row, then its sales, charges and GST ledgers. Dates as DD/MM/YYYY. B2B and B2C entries go in one file."
      >
        {fromFile && isTally ? (
          <EntrySource icon={MonitorDown} title="From Tally" description="Tally's sales vouchers of a period, as a CSV in the upload format - check it, then upload it.">
            <Button type="button" variant="outline" size="sm" icon={CloudDownload} disabled={busy} onClick={() => setFetchOpen(true)}>
              Fetch from Tally
            </Button>
          </EntrySource>
        ) : null}
        {/* Kept mounted while the source is a file: a portal sign-in under way goes on. */}
        <Gstr1FetchPanel gstr1={gstr1} total={batch.total} companyName={companyName} disabled={busy} className={cn(fromFile && 'hidden')} />
      </GetEntriesPanel>

      <EntriesPanel
        onGetAgain={card.hidden ? card.reopen : undefined}
        // What a GSTR-1 fetch left out, while its card is hidden - nothing after a full success.
        notice={card.hidden ? <Gstr1FetchResult result={gstr1.result} /> : null}
        batch={batch}
        tally={tally}
        isTally={isTally}
        busy={busy}
        entryCount={entries.length}
        noDataMessage="No entries came back. Check the file against Download Format and upload it again, or fetch another month from GSTR-1."
        ledgers={
          needsSalesLedger ? (
            <DefaultLedgerSelect
              id="multi-sales-ledger"
              label="Sales Ledger"
              choices={sales}
              value={salesLedger}
              onChange={setSalesLedger}
              disabled={busy || !isTally}
              className="w-full sm:w-60"
            />
          ) : null
        }
        actions={
          <SendActions
            isTally={isTally}
            count={chosen.length}
            showCount={false}
            tally={tally}
            guard={guard}
            busy={busy}
            mappingLabel={mappingOpen ? 'Hide Mapping' : 'Show Mapping'}
            mappingActive={mappingOpen}
            onMapping={() => setMappingOpen((previous) => !previous)}
          />
        }
        mapping={mappingOpen ? <KeywordMappingPanel mapping={mapping} ledgers={ledgers} rule={MAPPING_RULE} idPrefix="multi-keyword-mapping" /> : null}
      >
        <EntriesTable
          rows={view.rows}
          offset={offset}
          locked={locked}
          disabled={busy || !isTally}
          columns={columns}
          describe={(entry) => `invoice ${entry.invoiceNo}`}
        />
        <TablePager view={view} pageNumbers />
      </EntriesPanel>

      <SalesTallyFetchModal open={fetchOpen} onOpenChange={setFetchOpen} companyName={companyName} tallyFetch={tallyFetch} />
      <CreatePartyLedgerModal
        entry={creatingFor}
        companyId={companyId}
        companyName={companyName}
        onClose={() => setCreatingFor(null)}
        onCreated={() => {
          setCreatingFor(null)
          batch.reload()
        }}
      />
    </div>
  )
}
