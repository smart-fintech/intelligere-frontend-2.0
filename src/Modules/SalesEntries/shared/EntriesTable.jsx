import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { DataTable, PlainHead } from '@/Components/Common/TableTools'
import { Checkbox } from '@/Components/ui/checkbox'
import { TableCell, TableRow } from '@/Components/ui/table'
import { cn } from '@/Library/utils'

/**
 * One page of a batch, the same frame in every view:
 *
 *   tick box     picks the entry for Send to Tally; the header's box picks
 *                every READY entry of the batch (useEntrySelection)
 *   Sr, chevron  the entry's number; the chevron opens `details(entry)` under it -
 *                the voucher it becomes, its products
 *   columns      the view's own: [{ key, head, width, align, wrapHead, cell(entry) }] -
 *                wrapHead lets a long header run onto a second line
 *
 * The last column is pinned to the right (DataTable), so a view puts the
 * entry's own pick (a sales ledger) last.
 *
 *   rows, offset   the page's entries, and the number of the first
 *   pick           useEntrySelection
 *   locked         Set of keys that cannot be ticked now
 *   disabled       everything read-only (a send is running, or not a Tally account)
 *   describe(entry)  how a tick box names its entry: "invoice KPC-2/26-27"
 *   rowClassName(entry)  optional - a class for the entry's row (B2B / CNDN tint one
 *                  being put right)
 *
 * Sales Entries, as the old screen (B2B / CNDN pass all of the above):
 *   pick left out     no tick boxes - Send sends the whole batch
 *   details left out  no chevron - the row is all there is
 *   detailsAlwaysOpen details shown under every row, with no chevron (With
 *                     Inventory's products)
 */
export default function EntriesTable({ rows, offset, pick, locked, disabled, columns, details, describe, rowClassName, detailsAlwaysOpen = false }) {
  // The keys toggled away from the default: opened ones, or closed ones when all start open.
  const [toggled, setToggled] = useState(() => new Set())

  const toggleOpen = (key) =>
    setToggled((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const head = (
    <>
      {pick ? (
        <PlainHead width={44}>
          <Checkbox aria-label="Select every ready entry of this batch" checked={pick.allState} disabled={disabled} onCheckedChange={pick.toggleAll} />
        </PlainHead>
      ) : null}
      <PlainHead width={60}>Sr</PlainHead>
      {columns.map((column) => (
        <PlainHead key={column.key} width={column.width} className={cn(column.align === 'right' && 'text-right', column.wrapHead && 'whitespace-normal')}>
          {column.head}
        </PlainHead>
      ))}
    </>
  )

  return (
    <DataTable head={head}>
      {rows.map((entry, index) => {
        const canToggle = Boolean(details) && !detailsAlwaysOpen
        const isOpen = Boolean(details) && (detailsAlwaysOpen || toggled.has(entry.key))
        const name = describe(entry)
        return (
          <Fragment key={entry.key}>
            <TableRow data-state={pick?.selected.has(entry.key) ? 'selected' : undefined} className={cn('align-top', rowClassName?.(entry))}>
              {pick ? (
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${name}`}
                    checked={pick.selected.has(entry.key)}
                    disabled={disabled || locked.has(entry.key)}
                    onCheckedChange={() => pick.toggle(entry.key)}
                  />
                </TableCell>
              ) : null}
              <TableCell>
                {canToggle ? (
                  <button
                    type="button"
                    className="flex cursor-pointer items-center gap-1 text-muted-foreground hover:text-brand"
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? 'Hide' : 'Show'} the details of ${name}`}
                    onClick={() => toggleOpen(entry.key)}
                  >
                    {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                    {offset + index + 1}
                  </button>
                ) : (
                  offset + index + 1
                )}
              </TableCell>
              {columns.map((column) => (
                <TableCell key={column.key} wrap className={column.align === 'right' ? 'text-right' : undefined}>
                  {column.cell(entry)}
                </TableCell>
              ))}
            </TableRow>
            {isOpen ? (
              <TableRow>
                <TableCell colSpan={columns.length + (pick ? 2 : 1)} className="p-0" wrap>
                  {details(entry)}
                </TableCell>
              </TableRow>
            ) : null}
          </Fragment>
        )
      })}
    </DataTable>
  )
}
