import { useMemo, useState } from 'react'

import { TablePager } from '@/Components/Common/TableTools'
import { SALES_ENTRIES_PAGE_SIZE } from '@/Constants/salesEntries'
import { useListView } from '@/Hooks/useListView'
import { checkSingleEntry, readSingleEntry, toSingleLedgerRow } from '@/Modules/SalesEntries/SingleLedger/singleLedger'
import CreatePartyLedgerModal from '@/Modules/SalesEntries/shared/CreatePartyLedgerModal'
import DefaultLedgerSelect from '@/Modules/SalesEntries/shared/DefaultLedgerSelect'
import EntriesPanel from '@/Modules/SalesEntries/shared/EntriesPanel'
import EntriesTable from '@/Modules/SalesEntries/shared/EntriesTable'
import { Amount, Lines, PartyCell } from '@/Modules/SalesEntries/shared/EntryCells'
import GetEntriesPanel from '@/Modules/SalesEntries/shared/GetEntriesPanel'
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
  SINGLE_LEDGER_CSV_FORMAT_CONTENT,
  SINGLE_LEDGER_CSV_FORMAT_FILE,
  TALLY_SEND_SINGLE_LEDGER_MODULE,
  buildSendSingleLedgerMessage,
  getSingleLedgerEntries,
  markSingleLedgerEntriesSent,
  uploadSingleLedgerEntries,
} from '@/Services/Accounting/salesEntriesService'
import { formatDate } from '@/Utils/date'

/**
 * WITHOUT INVENTORY - SINGLE LEDGER. One invoice is posted to ONE sales
 * ledger: party Dr, sales ledger Cr for the taxable amount, plus its GST.
 *
 *   Party Ledger    as the old screen: one chosen for the whole batch (the
 *                   company's ledgers) - an invoice that names its own keeps it
 *   Sales Ledger    as the old screen: one chosen for the whole batch - an
 *                   invoice that names its own keeps it. Nothing is chosen for the user
 *   Mapping         source without_inventory: a GST ledger name that IS a
 *                   keyword becomes the mapped ledger
 *   Send to Tally   sales_without_inventory, marked sent only on success
 *
 * Laid out as the old screen: the selection card (`picker`) beside the file
 * upload, a toolbar of the ledger picks and Send over the list, and the
 * mapping shown in the list's place.
 */

const MAPPING_RULE = 'A GST ledger name that IS the keyword becomes the mapped ledger.'

export default function SingleLedgerView({ companyId, companyName, isTally, canCreateLedger, picker }) {
  const batch = useEntryBatches(companyId, getSingleLedgerEntries)
  // Read only once there are entries to post - nothing is asked when the view opens.
  const enabled = batch.hasData
  const sales = useSalesLedgerChoice(companyId, { enabled })
  const ledgers = useCompanyLedgers(companyId, { enabled })
  const mapping = useKeywordMapping(companyId, KEYWORD_SOURCE.WITHOUT_INVENTORY, { enabled })
  const [party, setParty] = useState('')
  const [salesLedger, setSalesLedger] = useState('')
  const [mappingOpen, setMappingOpen] = useState(false)
  const [creatingFor, setCreatingFor] = useState(null)

  const entries = useMemo(
    () => batch.rows.map((raw) => readSingleEntry(raw, { mapping: mapping.mapping, ledgerNames: ledgers.names })),
    [batch.rows, mapping.mapping, ledgers.names],
  )

  const tally = useTallySendAndMark({
    moduleName: TALLY_SEND_SINGLE_LEDGER_MODULE,
    companyName,
    buildMessage: buildSendSingleLedgerMessage,
    markSent: (numbers) => markSingleLedgerEntriesSent(companyId, numbers),
    onSettled: batch.reload,
  })
  const busy = tally.busy

  const partyOf = (entry) => entry.ownParty || party
  const salesLedgerOf = (entry) => entry.ownSalesLedger || salesLedger
  const problemOf = (entry) => checkSingleEntry(entry, partyOf(entry), salesLedgerOf(entry))
  const locked = useMemo(() => {
    const numbers = new Set([...tally.inFlight, ...tally.unmarked])
    return new Set(entries.filter((entry) => numbers.has(entry.invoiceNo)).map((entry) => entry.key))
  }, [entries, tally.inFlight, tally.unmarked])
  // As the old screen: Send sends every entry of the batch (all but those already on their way).
  const chosen = entries.filter((entry) => !locked.has(entry.key))
  const guard = useGuardedSend({
    chosen,
    problemOf,
    toItem: (entry) => ({ invoiceNo: entry.invoiceNo, row: toSingleLedgerRow(entry, partyOf(entry), salesLedgerOf(entry)) }),
    tally,
  })

  const view = useListView(entries, { initialPageSize: SALES_ENTRIES_PAGE_SIZE })
  const offset = typeof view.pageSize === 'number' ? (view.page - 1) * view.pageSize : 0

  // As the old screen: Sr No, Invoice No, Invoice Date, Total, State, Cgst / Sgst / Igst, Party Ledger, Sales Ledger.
  const taxColumn = (tax, head) => ({
    key: tax,
    head,
    width: 160,
    cell: (entry) => <Lines lines={entry.taxes.filter((line) => line.tax === tax)} empty="" />,
  })
  const columns = [
    { key: 'invoice', head: 'Invoice No', width: 140, cell: (entry) => <span className="font-medium">{entry.invoiceNo || '--'}</span> },
    { key: 'date', head: 'Invoice Date', width: 110, cell: (entry) => formatDate(entry.invoiceDate) },
    { key: 'total', head: 'Total', width: 120, align: 'right', cell: (entry) => <Amount value={entry.total} className="font-medium" /> },
    { key: 'state', head: 'State', width: 120, cell: (entry) => entry.state || '--' },
    taxColumn('CGST', 'Cgst | Amt.'),
    taxColumn('SGST', 'Sgst | Amt.'),
    taxColumn('IGST', 'Igst | Amt.'),
    {
      key: 'party',
      head: 'Party Ledger',
      width: 220,
      cell: (entry) =>
        partyOf(entry) ? (
          <PartyCell
            name={partyOf(entry)}
            sub={entry.gstin}
            notInTally={entry.notInTally}
            onCreate={canCreateLedger && entry.ownParty ? () => setCreatingFor({ ...entry, partyLedger: entry.ownParty }) : undefined}
            locked={locked.has(entry.key)}
            disabled={busy}
          />
        ) : (
          <span className="text-destructive">Select Party Ledger</span>
        ),
    },
    {
      key: 'sales',
      head: 'Sales Ledger',
      width: 200,
      cell: (entry) =>
        salesLedgerOf(entry) ? <span>{salesLedgerOf(entry)}</span> : <span className="text-destructive">No Sales Ledger Selected</span>,
    },
  ]

  // Entries are in from an answer that did not fail: the Get Entries card steps aside.
  const card = useGetEntriesCard(batch)

  return (
    <div className="space-y-4">
      <GetEntriesPanel
        picker={picker}
        hidden={card.hidden}
        onClose={card.reopened ? card.close : undefined}
        format={{ file: SINGLE_LEDGER_CSV_FORMAT_FILE, content: SINGLE_LEDGER_CSV_FORMAT_CONTENT }}
        upload={(file) => uploadSingleLedgerEntries(companyId, file)}
        onUploaded={() => {
          card.awaitFresh()
          batch.restart()
        }}
        total={batch.total}
        disabled={busy}
        replaces="every single ledger invoice of the company"
        hint="One row per invoice and GST rate - rows of one invoice are put together. Entries show for an hour after the upload."
      />

      <EntriesPanel
        onGetAgain={card.hidden ? card.reopen : undefined}
        batch={batch}
        tally={tally}
        isTally={isTally}
        busy={busy}
        entryCount={entries.length}
        noDataMessage="No entries came back from the upload. Check the file against Download Format - one row per invoice and GST rate - and upload it again."
        ledgers={
          <>
            <DefaultLedgerSelect
              id="single-party-ledger"
              label="Party Ledger"
              choices={ledgers}
              value={party}
              onChange={setParty}
              disabled={busy || !isTally}
              className="w-full sm:w-60"
            />
            <DefaultLedgerSelect
              id="single-sales-ledger"
              label="Sales Ledger"
              choices={sales}
              value={salesLedger}
              onChange={setSalesLedger}
              disabled={busy || !isTally}
              className="w-full sm:w-60"
            />
          </>
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
        mapping={mappingOpen ? <KeywordMappingPanel mapping={mapping} ledgers={ledgers} rule={MAPPING_RULE} idPrefix="single-keyword-mapping" /> : null}
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
