import { useMemo, useState } from 'react'
import { UserPlus } from 'lucide-react'

import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import { TablePager } from '@/Components/Common/TableTools'
import { SwitchField } from '@/Components/Common/FormFields'
import { Button } from '@/Components/ui/button'
import { SALES_ENTRIES_PAGE_SIZE } from '@/Constants/salesEntries'
import useProducts from '@/Hooks/useProducts'
import { useListView } from '@/Hooks/useListView'
import { readProducts } from '@/Modules/Dashboard/productList'
import CreateProductModal from '@/Modules/SalesEntries/Inventory/CreateProductModal'
import InvoiceProducts from '@/Modules/SalesEntries/Inventory/InvoiceProducts'
import { matchProduct } from '@/Modules/SalesEntries/Inventory/productMatch'
import { CHARGES, chargesOf, checkInventoryInvoice, readInventoryInvoice, toInventoryTallyRow } from '@/Modules/SalesEntries/Inventory/salesInventory'
import useAutoPartyLedgers from '@/Modules/SalesEntries/Inventory/useAutoPartyLedgers'
import CreatePartyLedgerModal from '@/Modules/SalesEntries/shared/CreatePartyLedgerModal'
import DefaultLedgerSelect from '@/Modules/SalesEntries/shared/DefaultLedgerSelect'
import EntriesPanel from '@/Modules/SalesEntries/shared/EntriesPanel'
import EntriesTable from '@/Modules/SalesEntries/shared/EntriesTable'
import { Amount, PartyCell } from '@/Modules/SalesEntries/shared/EntryCells'
import GetEntriesPanel from '@/Modules/SalesEntries/shared/GetEntriesPanel'
import KeywordMappingPanel from '@/Modules/SalesEntries/shared/KeywordMappingPanel'
import SendActions from '@/Modules/SalesEntries/shared/SendActions'
import { plural, text } from '@/Modules/SalesEntries/shared/ledgerLists'
import useEntryBatches from '@/Modules/SalesEntries/shared/useEntryBatches'
import useGetEntriesCard from '@/Modules/SalesEntries/shared/useGetEntriesCard'
import useGuardedSend from '@/Modules/SalesEntries/shared/useGuardedSend'
import useKeywordMapping from '@/Modules/SalesEntries/shared/useKeywordMapping'
import { useCompanyLedgers, useSalesLedgerChoice } from '@/Modules/SalesEntries/shared/useLedgerChoices'
import useTallySendAndMark from '@/Modules/SalesEntries/shared/useTallySendAndMark'
import { KEYWORD_SOURCE } from '@/Services/Accounting/keywordMappingService'
import {
  INVENTORY_CSV_FORMAT_CONTENT,
  INVENTORY_CSV_FORMAT_FILE,
  TALLY_SEND_INVENTORY_MODULE,
  buildSendInventoryMessage,
  getInventoryEntries,
  markInventoryEntriesSent,
  uploadInventoryEntries,
} from '@/Services/Accounting/salesInventoryService'
import { formatDate } from '@/Utils/date'

/**
 * WITH INVENTORY. One invoice is a party, its product lines (stock items in
 * Tally), its charges and its GST:
 *
 *   Get entries     Download Format, Upload File - CSV or Excel (replaces the company's invoices)
 *   Party ledgers   a party "Not in tally" is created in Tally on its own when
 *                   the batch arrives (useAutoPartyLedgers), once; Create / Retry
 *                   are there for one that is still missing after that
 *   Products        each line goes as a company stock item (productMatch) -
 *                   shown, changeable, and created when there is none
 *   Sales ledger    as the old screen: one chosen for the batch (nothing is
 *                   chosen for the user) - an invoice that names its own keeps
 *                   it; every product line is posted to it
 *   Charges         one ledger per charge for the batch; an invoice with that
 *                   charge cannot go without it
 *   Mapping         source with_inventory: a product's GST ledger that IS a
 *                   keyword becomes the mapped ledger
 *   Send to Tally   sales_with_inventory, marked sent only when Tally created them all
 *
 * Laid out as the old screen: the selection card (`picker`) beside the file
 * upload, a toolbar of the ledger picks and Send over the list, each invoice's
 * products open under it, and the mapping shown in the list's place.
 */

const MAPPING_RULE = 'A product\'s GST ledger that IS the keyword ("IGST 18%") becomes the mapped ledger.'
const NO_CHARGES = Object.freeze(Object.fromEntries(CHARGES.map((charge) => [charge.key, ''])))

export default function InventoryView({ companyId, companyName, isTally, canCreateLedger, picker }) {
  const batch = useEntryBatches(companyId, getInventoryEntries, { onLoaded: (rows) => auto.createFor(rows) })
  const auto = useAutoPartyLedgers({ companyName, enabled: isTally, onDone: batch.reload })
  // Read only once there are invoices to post - nothing is asked when the view opens.
  const enabled = batch.hasData
  const sales = useSalesLedgerChoice(companyId, { enabled })
  const ledgers = useCompanyLedgers(companyId, { enabled })
  const mapping = useKeywordMapping(companyId, KEYWORD_SOURCE.WITH_INVENTORY, { enabled })
  const products = useProducts({ enabled })
  const [salesLedger, setSalesLedger] = useState('')
  const [chargeLedgers, setChargeLedgers] = useState(NO_CHARGES)
  const [stockPicks, setStockPicks] = useState({})
  const [mappingOpen, setMappingOpen] = useState(false)
  // The old screen's two switches - they show or hide, nothing else; both start off, as there.
  const [showParty, setShowParty] = useState(false)
  const [showCharges, setShowCharges] = useState(false)
  const [creatingParty, setCreatingParty] = useState(null)
  const [creatingProduct, setCreatingProduct] = useState(null)

  const invoices = useMemo(() => batch.rows.map((raw) => readInventoryInvoice(raw, { mapping: mapping.mapping })), [batch.rows, mapping.mapping])

  /* ---------------- Stock items ---------------- */
  // readProducts: the raw rows name them "Product Name" / "HSN Code".
  const stock = useMemo(
    () =>
      readProducts(products.rows)
        .map((product) => ({ name: text(product.name), hsn: text(product.hsn) }))
        .filter((item) => item.name),
    [products.rows],
  )
  const stockOptions = useMemo(() => [...new Set(stock.map((item) => item.name))].sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name, label: name })), [stock])
  const matches = useMemo(() => {
    const found = new Map()
    invoices.forEach((invoice) => invoice.products.forEach((product) => found.set(product.key, matchProduct(product, stock))))
    return found
  }, [invoices, stock])
  const matchOf = (product) => matches.get(product.key) ?? { name: null, how: null, candidates: [] }
  const stockNameOf = (product) => stockPicks[product.key] || matchOf(product).name || ''
  const chooseStock = (product, name) =>
    setStockPicks((previous) => {
      const next = { ...previous }
      if (name) next[product.key] = name
      else delete next[product.key]
      return next
    })
  const productsReady = products.status === 'ready' || products.rows.length > 0

  /* ---------------- What each invoice may do ---------------- */
  const chargeLedgerOf = (charge) => chargeLedgers[charge.key] || charge.own
  const salesLedgerOf = (invoice) => invoice.ownSalesLedger || salesLedger
  const picksOf = (invoice) => ({ salesLedger: salesLedgerOf(invoice), stockNameOf, chargeLedgerOf })
  const problemOf = (invoice) => (productsReady ? checkInventoryInvoice(invoice, picksOf(invoice)) : "Waiting for the company's stock items.")

  const tally = useTallySendAndMark({
    moduleName: TALLY_SEND_INVENTORY_MODULE,
    companyName,
    buildMessage: buildSendInventoryMessage,
    markSent: (numbers) => markInventoryEntriesSent(companyId, numbers),
    onSettled: batch.reload,
  })
  const busy = tally.busy || auto.busy

  const locked = useMemo(() => {
    const numbers = new Set([...tally.inFlight, ...tally.unmarked])
    return new Set(invoices.filter((invoice) => numbers.has(invoice.invoiceNo)).map((invoice) => invoice.key))
  }, [invoices, tally.inFlight, tally.unmarked])
  // As the old screen: Send sends every invoice of the batch (all but those already on their way).
  const chosen = invoices.filter((invoice) => !locked.has(invoice.key))
  const guard = useGuardedSend({
    chosen,
    problemOf,
    toItem: (invoice) => ({ invoiceNo: invoice.invoiceNo, row: toInventoryTallyRow(invoice, picksOf(invoice)) }),
    tally,
  })

  const view = useListView(invoices, { initialPageSize: SALES_ENTRIES_PAGE_SIZE })
  const offset = typeof view.pageSize === 'number' ? (view.page - 1) * view.pageSize : 0

  const chargesInBatch = CHARGES.filter((charge) => invoices.some((invoice) => chargesOf(invoice).some((item) => item.key === charge.key)))
  const missingParties = invoices.filter((invoice) => invoice.notInTally && !auto.creating.has(invoice.partyLedger.toLowerCase()))

  // As the old screen: Sr, Invoice No, Invoice Date, Total Amt, State, Sales Ledger, then Party Ledger
  // (its switch) and "<Charge> Ledger | Amount" for each charge of the batch (the Charges Ledger switch);
  // the products under each invoice. Narrow columns whose text wraps, so the table fits the screen.
  const columns = [
    { key: 'invoice', head: 'Invoice No', width: 110, cell: (invoice) => <span className="font-medium break-words">{invoice.invoiceNo || '--'}</span> },
    { key: 'date', head: 'Invoice Date', width: 96, wrapHead: true, cell: (invoice) => formatDate(invoice.invoiceDate) },
    { key: 'total', head: 'Total Amt', width: 104, align: 'right', cell: (invoice) => <Amount value={invoice.total} className="font-medium" /> },
    { key: 'state', head: 'State', width: 100, cell: (invoice) => <span className="break-words">{invoice.state || '--'}</span> },
    {
      key: 'sales',
      head: 'Sales Ledger',
      width: 150,
      cell: (invoice) => {
        const name = salesLedgerOf(invoice)
        return name ? <span className="break-words">{name}</span> : <span className="text-destructive">Select Sales Ledger</span>
      },
    },
    ...(showParty
      ? [
          {
            key: 'party',
            head: 'Party Ledger',
            width: 170,
            cell: (invoice) => (
              <PartyCell
                name={invoice.partyLedger}
                sub={invoice.gstin}
                notInTally={invoice.notInTally}
                creating={auto.creating.has(invoice.partyLedger.toLowerCase())}
                onCreate={canCreateLedger ? () => setCreatingParty(invoice) : undefined}
                locked={locked.has(invoice.key)}
                problem={problemOf(invoice)}
                disabled={busy}
              />
            ),
          },
        ]
      : []),
    ...(showCharges ? chargesInBatch : []).map((charge) => ({
      key: charge.key,
      head: `${charge.label} Ledger | Amount`,
      width: 140,
      wrapHead: true,
      cell: (invoice) => {
        const item = chargesOf(invoice).find((one) => one.key === charge.key)
        if (!item) return null
        const name = chargeLedgerOf(item)
        return (
          <span className="break-words">
            <span className={name ? undefined : 'text-destructive'}>{name || `Select ${charge.label} Ledger`}</span> | <Amount value={item.amount} />
          </span>
        )
      },
    })),
  ]

  const details = (invoice) => (
    <div className="bg-muted/40 px-3 py-3 text-xs">
      <InvoiceProducts
        invoice={invoice}
        matchOf={matchOf}
        stockNameOf={stockNameOf}
        stockOptions={stockOptions}
        overrideOf={(product) => stockPicks[product.key] ?? ''}
        onChoose={chooseStock}
        onCreate={setCreatingProduct}
        disabled={busy || locked.has(invoice.key)}
      />
    </div>
  )

  // Entries are in from an answer that did not fail: the Get Entries card steps aside.
  const card = useGetEntriesCard(batch)

  return (
    <div className="space-y-4">
      <GetEntriesPanel
        picker={picker}
        hidden={card.hidden}
        onClose={card.reopened ? card.close : undefined}
        format={{ file: INVENTORY_CSV_FORMAT_FILE, content: INVENTORY_CSV_FORMAT_CONTENT }}
        upload={(file) => uploadInventoryEntries(companyId, file)}
        onUploaded={() => {
          card.awaitFresh()
          setStockPicks({})
          batch.restart()
        }}
        total={batch.total}
        disabled={busy}
        replaces="every inventory invoice of the company"
        hint="One row per product line; the invoice's details repeat on each. Entries show for an hour after the upload."
      />

      <EntriesPanel
        onGetAgain={card.hidden ? card.reopen : undefined}
        batch={batch}
        tally={tally}
        isTally={isTally}
        busy={busy}
        entryCount={invoices.length}
        noDataMessage="No invoices came back from the upload. Check the file against Download Format - one row per product line - and upload it again."
        ledgers={
          <>
            <DefaultLedgerSelect
              id="inventory-sales-ledger"
              label="Sales Ledger"
              required
              choices={sales}
              value={salesLedger}
              onChange={setSalesLedger}
              disabled={busy || !isTally}
              className="w-full sm:w-60"
            />
            {(showCharges ? chargesInBatch : []).map((charge) => (
              <DefaultLedgerSelect
                key={charge.key}
                id={`inventory-${charge.key}-ledger`}
                label={`${charge.label} Ledger`}
                choices={ledgers}
                value={chargeLedgers[charge.key]}
                onChange={(name) => setChargeLedgers((previous) => ({ ...previous, [charge.key]: name }))}
                disabled={busy || !isTally}
                className="w-full sm:w-52"
              />
            ))}
          </>
        }
        actions={
          <>
            <div className="flex flex-col gap-1.5">
              <SwitchField id="inventory-show-party" label="Party Ledger" checked={showParty} onCheckedChange={setShowParty} />
              <SwitchField id="inventory-show-charges" label="Charges Ledger" checked={showCharges} onCheckedChange={setShowCharges} />
            </div>
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
          </>
        }
        mapping={mappingOpen ? <KeywordMappingPanel mapping={mapping} ledgers={ledgers} rule={MAPPING_RULE} idPrefix="inventory-keyword-mapping" /> : null}
      >
        {products.status === 'failed' ? <InlineAlert action={<RetryButton onClick={products.reload} />}>The company&apos;s stock items could not be loaded: {products.error}</InlineAlert> : null}
        {isTally && missingParties.length > 0 && !auto.busy ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-xs text-amber-800 dark:text-amber-300">
            <span className="flex-1">{plural(new Set(missingParties.map((invoice) => invoice.partyLedger.toLowerCase())).size, 'party ledger is', 'party ledgers are')} still not in Tally.</span>
            <Button type="button" variant="outline" size="sm" icon={UserPlus} disabled={busy} onClick={() => auto.retry(batch.rows)}>
              Create in Tally
            </Button>
          </div>
        ) : null}

        <EntriesTable
          rows={view.rows}
          offset={offset}
          locked={locked}
          disabled={busy || !isTally}
          columns={columns}
          details={details}
          detailsAlwaysOpen
          describe={(invoice) => `invoice ${invoice.invoiceNo}`}
        />
        <TablePager view={view} pageNumbers />
      </EntriesPanel>

      <CreatePartyLedgerModal
        entry={creatingParty}
        companyId={companyId}
        companyName={companyName}
        onClose={() => setCreatingParty(null)}
        onCreated={() => {
          setCreatingParty(null)
          batch.reload()
        }}
      />
      <CreateProductModal
        product={creatingProduct}
        companyName={companyName}
        onClose={() => setCreatingProduct(null)}
        onCreated={() => {
          setCreatingProduct(null)
          products.reload()
        }}
      />
    </div>
  )
}
