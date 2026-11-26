import { useState } from 'react'
import { useSelector } from 'react-redux'

import { SALES_ENTRIES_SOURCE, SALES_ENTRIES_VIEW } from '@/Constants/salesEntries'
import useSectionAccess from '@/Hooks/useSectionAccess'
import { cn } from '@/Library/utils'
import WorkflowPicker from '@/Modules/SalesEntries/Components/WorkflowPicker'
import InventoryView from '@/Modules/SalesEntries/Inventory/InventoryView'
import MultiLedgerView from '@/Modules/SalesEntries/MultiLedger/MultiLedgerView'
import SingleLedgerView from '@/Modules/SalesEntries/SingleLedger/SingleLedgerView'
import { ACCESS_SECTIONS } from '@/Services/Auth/accessService'
import { selectIsTallyErp } from '@/Store/Slices/profileSlice'

/**
 * SALES ENTRIES - laid out as the old screen: one selection card at the top
 * (Using File / Fetch from GSTR-1, then the three kinds of entry beside the
 * ways to get entries), the chosen one's entries under it:
 *
 *   Multi Ledger     w/o inventory, each invoice with its own ledger lines (MultiLedger/)
 *   Single Ledger    w/o inventory, one sales ledger per invoice           (SingleLedger/)
 *   With Inventory   product lines as stock items, charges, GST            (Inventory/)
 *
 * GSTR-1 brings Multi Ledger entries.
 *
 * Each view keeps its own upload, batches, picks and Tally message; they share
 * only the frame (shared/). A view is mounted the first time it is opened and
 * then KEPT, hidden, while another is shown: a send still waiting for Tally
 * keeps listening - its entries are marked sent when the answer comes - and
 * the picks made are there on the way back. Each renders the selection card
 * itself (`picker`), so the card's right side is that view's own.
 */
export default function SalesEntriesScreen({ companyId, companyName }) {
  const isTally = useSelector(selectIsTallyErp)
  const canCreateLedger = useSectionAccess(ACCESS_SECTIONS.LEDGER).create
  const [source, setSource] = useState(SALES_ENTRIES_SOURCE.FILE)
  const [current, setCurrent] = useState(SALES_ENTRIES_VIEW.MULTI_LEDGER)
  const [opened, setOpened] = useState(() => new Set([SALES_ENTRIES_VIEW.MULTI_LEDGER]))

  const open = (next) => {
    setCurrent(next)
    setOpened((previous) => (previous.has(next) ? previous : new Set([...previous, next])))
  }

  const pick = (view) => view && open(view)

  const changeSource = (next) => {
    setSource(next)
    if (next === SALES_ENTRIES_SOURCE.GSTR_1) open(SALES_ENTRIES_VIEW.MULTI_LEDGER)
  }

  const picker = (
    <WorkflowPicker source={source} onSourceChange={changeSource} view={current} onPick={pick} />
  )

  const props = { companyId, companyName, isTally, canCreateLedger }
  const views = [
    [SALES_ENTRIES_VIEW.MULTI_LEDGER, MultiLedgerView, { source }],
    [SALES_ENTRIES_VIEW.SINGLE_LEDGER, SingleLedgerView, {}],
    [SALES_ENTRIES_VIEW.INVENTORY, InventoryView, {}],
  ]

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-brand sm:text-2xl">Sales Entries</h1>

      {views.map(([key, View, own]) =>
        opened.has(key) ? (
          <div key={key} className={cn(current !== key && 'hidden')}>
            {/* Only the view shown carries the card: its radios' ids stay unique on the page. */}
            <View {...props} {...own} picker={current === key ? picker : null} />
          </div>
        ) : null,
      )}
    </div>
  )
}
