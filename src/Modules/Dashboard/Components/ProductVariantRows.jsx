/**
 * What a product's row opens out into: its SKUs, and where each one's stock
 * is. Each SKU is one block - what it is, then where it is kept:
 *
 *   SKU Code PRI-001   SKU Qty 300   SKU Amount 36000          <- the summary
 *   Unit Rate   Warehouse   Wh. Qty   Expiry Date   Created At              Actions
 *   120         Main        200       --            12-Oct-26 12:39:56 PM   (eye) (pencil)
 *               Godown 2    100
 *   135         Main        100       31-12-2026    14-Oct-26 09:05:12 AM   (eye) (pencil)
 *
 *   SKU Code PRI-002   ...
 *
 * THE SUMMARY is the SKU's own: its code, and its Qty and Amount as the
 * product row worked them out - the backend's totals, or, with warehouses
 * chosen in the filter, those warehouses' alone (narrowToWarehouses in
 * ../productList, which also leaves out the lines and entries of other
 * warehouses before they reach here). It is said once, above its table,
 * never again on each line.
 *
 * WHAT A SKU IS MADE OF is on its code: hovering it (or tabbing to it) shows
 * its `sku_details` in the shared SKU tooltip (SkuDetailsTooltip) - only
 * those, or "No SKU details available". There is no column for them.
 *
 * Under it, one line per warehouse of each of its entries. An entry's rate,
 * expiry date, Created At and buttons are written on its first line and left
 * blank under it, so two warehouses of one entry read as one record in two
 * places; a faint rule parts one entry from the next.
 *
 * CREATED AT is each entry's own `product_details[].created_at`, shown as
 * the backend sends it (date and time, e.g. "12-Oct-26 12:39:56 PM") - it
 * is never re-parsed, so it cannot come out as an invalid date. An entry
 * without one shows a dash.
 *
 * It draws whatever the product has. A product with several SKUs and
 * several warehouses fills every column; a simple product has one line, no
 * SKU code, and perhaps a warehouse quantity with no warehouse named - each
 * missing thing is a dash, never an error. A SKU with no allocation at all
 * says so in the Warehouse column.
 *
 * Made of plain boxes laid out as a grid, not a <table>: it sits inside a
 * cell of the product table, whose rules would reach every cell of a table
 * nested in it (see DataTable). It is as wide as the product table and no
 * wider - its columns share that width out - and on a screen too narrow
 * for them a block scrolls sideways inside itself, so neither the table nor
 * the page ever does.
 *
 * VIEW AND EDIT ARE AN ENTRY'S. A SKU can hold several `product_details`
 * entries, each its own record by its `sr_no`: each entry has its own View
 * and Edit, side by side in the Actions column of its first line, both
 * handed that SKU and THAT entry (RowActions) - Edit opens the form on that
 * record and saves to it alone, View shows that SKU with that record's
 * stock. A SKU with no entries has one of each, for the SKU (`detail`
 * null). A product with no SKU at all (none sent, or every one deleted) is
 * one line, saying so, with its View at its right end as every line has it -
 * handed no SKU, the dialog shows the product; there is nothing to Edit.
 *
 * Props:
 *   product   one product, as readProducts gives it
 *   onViewSku(variant, detail)   optional - each entry gets a View (both
 *             null for a product with no SKU)
 *   onEditSku(variant, detail)   optional - each entry gets an Edit (a SKU
 *             without a `product_id` cannot be saved, so has none)
 *   editDisabled   optional - the Edits are there but cannot be pressed
 */

import { Eye, Pencil } from 'lucide-react'

import { SkuDetailsTooltip } from '@/Components/Common/SkuDetailsTooltip'
import { Button } from '@/Components/ui/button'
import { useSkuManagement } from '@/Hooks/useMasterDetails'
import { cn } from '@/Library/utils'
import { formatDate } from '@/Utils/date'
import { orDash } from '@/Utils/display'
import { skuDetailPairs } from '../productList'

/** A block's warehouse lines: five columns, and the least width they are drawn at before the block scrolls. */
const GRID = 'grid min-w-[36rem] grid-cols-[6rem_minmax(9rem,2fr)_5.5rem_6.5rem_minmax(9.5rem,1.2fr)] gap-x-3 px-3'

/** The same, with a sixth for each entry's View and Edit. */
const GRID_WITH_ACTIONS = 'grid min-w-[41rem] grid-cols-[6rem_minmax(9rem,2fr)_5.5rem_6.5rem_minmax(9.5rem,1.2fr)_4.25rem] gap-x-3 px-3'

const HEADINGS = ['Unit Rate', 'Warehouse', 'Wh. Qty', 'Expiry Date', 'Created At']

/** The lettering of the headings, in a block's table and its summary alike. */
const HEADING_TEXT = 'text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'

/** One figure of a SKU's summary: its name, then its value. */
function SummaryItem({ label, children }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <span className={cn(HEADING_TEXT, 'shrink-0')}>{label}</span>
      <span className="min-w-0 font-semibold break-words text-foreground">{children}</span>
    </div>
  )
}

/**
 * A SKU as the lines it takes: one per warehouse of each of its entries. An
 * entry with no warehouse still gets a line (its rate and expiry are worth
 * seeing), and so does a SKU with no entries at all.
 */
const linesOf = (variant) => {
  const lines = variant.details.flatMap((detail) =>
    (detail.warehouses.length > 0 ? detail.warehouses : [null]).map((warehouse, index) => ({
      detail,
      warehouse,
      firstOfDetail: index === 0,
    })),
  )

  return lines.length > 0 ? lines : [{ detail: null, warehouse: null, firstOfDetail: true }]
}

/**
 * The Actions cell of one line: View and Edit, for the SKU and entry that
 * line is the first of - the same two for both, so they always open the
 * same record. `variant` null is a product with no SKU: a View only.
 */
function RowActions({ product, variant, detail, name, onViewSku, onEditSku, editDisabled }) {
  const record = detail?.srNo !== null && detail?.srNo !== undefined ? ` ${detail.srNo}` : ''

  return (
    <div className="flex justify-end gap-1">
      {onViewSku ? (
        <Button
          type="button"
          variant="iconEdit"
          size="icon-sm"
          icon={Eye}
          tooltip="View SKU details"
          aria-label={
            !variant ? `View details of ${product.name || 'product'}` : detail ? `View record${record} of SKU ${name}` : `View details of SKU ${name}`
          }
          onClick={() => onViewSku(variant, detail)}
        />
      ) : null}
      {onEditSku && variant && variant.productId !== null ? (
        <Button
          type="button"
          variant="iconEdit"
          size="icon-sm"
          icon={Pencil}
          tooltip={detail ? 'Edit this record' : 'Edit this SKU'}
          aria-label={detail ? `Edit record${record} of SKU ${name}` : `Edit SKU ${name}`}
          disabled={editDisabled}
          onClick={() => onEditSku(variant, detail)}
        />
      ) : null}
    </div>
  )
}

export default function ProductVariantRows({ product, onViewSku, onEditSku, editDisabled = false }) {
  const withActions = Boolean(onViewSku || onEditSku)
  const showSku = useSkuManagement()
  const grid = withActions ? GRID_WITH_ACTIONS : GRID
  const actions = { product, onViewSku, onEditSku, editDisabled }

  if (product.variants.length === 0 && !onViewSku) {
    return <p className="px-3 py-4 text-center text-xs text-muted-foreground">No SKU or warehouse details for this product.</p>
  }

  // No SKU at all: one line saying so, its View where every line's is.
  if (product.variants.length === 0) {
    return (
      <div className="px-3 py-3">
        <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-card px-3 py-2 text-xs">
          <span className="text-muted-foreground">No SKU or warehouse details for this product.</span>
          <RowActions {...actions} variant={null} detail={null} name="" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2.5 px-3 py-3">
      {product.variants.map((variant, variantIndex) => {
        const name = variant.skuCode || `${variantIndex + 1}`

        return (
          <section
            key={variantIndex}
            aria-label={showSku ? `SKU ${name}` : `Stock ${variantIndex + 1}`}
            className="overflow-hidden rounded-md border border-border/70 bg-card"
          >
            {/* The SKU, said once - see THE SUMMARY at the top. */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-border/60 bg-muted/50 px-3 py-2 text-xs">
              {showSku ? (
                <SummaryItem label="SKU Code">
                  {/* Its sku_details on hover or focus - see the note at the top. */}
                  <SkuDetailsTooltip details={skuDetailPairs(variant)} side="right" align="start">
                    <span
                      tabIndex={0}
                      className="cursor-help rounded-sm underline decoration-muted-foreground/50 decoration-dotted underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      {orDash(variant.skuCode)}
                    </span>
                  </SkuDetailsTooltip>
                </SummaryItem>
              ) : null}
              <SummaryItem label="SKU Qty">{orDash(variant.totalQty)}</SummaryItem>
              <SummaryItem label="SKU Amount">{orDash(variant.totalAmount)}</SummaryItem>
            </div>

            {/* Where it is kept: its own table, sideways-scrolling only inside itself. */}
            <div className="overflow-x-auto">
              <div className={cn(grid, HEADING_TEXT, 'border-b border-border/60 py-1.5')}>
                {HEADINGS.map((heading) => (
                  <span key={heading}>{heading}</span>
                ))}
                {withActions ? <span className="text-right">Actions</span> : null}
              </div>

              {linesOf(variant).map(({ detail, warehouse, firstOfDetail }, lineIndex) => (
                <div
                  key={lineIndex}
                  className={cn(
                    grid,
                    'items-center py-1.5 text-xs text-foreground',
                    // A faint rule between two entries; the lines of one entry sit together.
                    firstOfDetail && lineIndex > 0 && 'border-t border-border/40',
                  )}
                >
                  <span>{firstOfDetail ? orDash(detail?.unitRate) : ''}</span>

                  {warehouse ? (
                    <>
                      <span className="break-words">{orDash(warehouse.label)}</span>
                      <span>{orDash(warehouse.quantity)}</span>
                    </>
                  ) : (
                    <span className="col-span-2 text-muted-foreground">No warehouse allocation</span>
                  )}

                  <span>{firstOfDetail ? formatDate(detail?.expiryDate) : ''}</span>

                  {/* As the backend sends it - see the note at the top. */}
                  <span className="break-words">{firstOfDetail ? orDash(detail?.createdAt) : ''}</span>

                  {withActions ? (
                    firstOfDetail ? <RowActions {...actions} variant={variant} detail={detail} name={name} /> : <span />
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
