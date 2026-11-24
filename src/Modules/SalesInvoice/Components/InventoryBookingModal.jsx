import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'

import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { useSkuManagement } from '@/Hooks/useMasterDetails'
import useWarehouses from '@/Hooks/useWarehouses'
import { cn } from '@/Library/utils'
import { automaticBooking, bookedOf, bookingItemsOf, checkBooking, hasBookingProblems, totalAvailable, totalBooked } from '@/Modules/SalesInvoice/inventoryBooking'
import { toDecimalInput } from '@/Modules/SalesInvoice/salesInvoiceForm'

const cell = 'px-2 py-1.5'
const quantity = (value) => String(Number(Number(value).toFixed(3)))

/**
 * BOOK THE SALES ORDER'S STOCK - the first thing a new Sales Order's Save
 * does, BEFORE the order is created (the workspace's save). Each product on
 * its own: its name, Required (order) Quantity, Available (all its warehouses'
 * stock), Remaining to Book (required - available, when the stock falls short)
 * and Booked, then its warehouses in one table - Warehouse Name, Contact No.,
 * Available Quantity, Book Quantity (typed) and Remaining Quantity (available -
 * booked, as it is typed). A product none of whose warehouses holds any of it
 * gets the same table: its own warehouses, each at 0. OK
 * works only once it all checks out (inventoryBooking's checkBooking - each
 * product booked for its whole order quantity) and hands the quantities back
 * - onConfirm(items, booked); nothing is sent from here. The workspace then
 * creates the order and books it (inventory/inventory_booking/ needs the
 * document_id the create returns). Closing it (onClose) saves nothing.
 *
 * When no product has more than one warehouse to book from, it opens with
 * each product booked whole from its warehouse (automaticBooking) - one OK.
 *
 *   open
 *   lines           the order's lines
 *   productsByKey   the product list's products - where each SKU's stock is
 *   companyId
 *   documentNo      the order's number
 *   initialBooked   the quantities it opens with - the ones chosen last, when
 *                   the order is saved and its booking was refused
 */
export default function InventoryBookingModal({ open, lines, productsByKey, companyId, documentNo, initialBooked = null, onConfirm, onClose }) {
  const showSku = useSkuManagement()
  // The company's warehouses - their names and contact numbers. The shared list
  // (useWarehouses): no request when another screen has it. Without it the stock
  // still shows - only names and contact numbers are missing.
  const { warehouses } = useWarehouses(open, companyId)

  const items = useMemo(() => bookingItemsOf({ lines, productsByKey, warehouses }), [lines, productsByKey, warehouses])
  // Taken once, as it opens - the warehouse list only names the warehouses, it never adds one.
  const [booked, setBooked] = useState(() => initialBooked ?? automaticBooking(items) ?? {})
  const problems = checkBooking(items, booked)
  // OK works only with every quantity valid.
  const valid = !hasBookingProblems(problems)
  // A wrong number shows as it is typed; a product not fully booked once something is typed for it.
  const typedFor = (key) => Object.values(booked[key] ?? {}).some((value) => String(value ?? '').trim() !== '')
  const shown = { cells: problems.cells, items: Object.fromEntries(Object.entries(problems.items).filter(([key]) => typedFor(key))) }

  const type = (itemKey, warehouseId, text) =>
    setBooked((current) => ({ ...current, [itemKey]: { ...current[itemKey], [warehouseId]: toDecimalInput(text) } }))

  const confirm = () => {
    if (valid) onConfirm(items, booked)
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={`Book inventory - ${documentNo || 'Sales Order'}`}
      description="Book each product's order quantity from the warehouses that hold it."
      size="xl"
      autoFocus={false}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {valid ? null : <p className="mr-auto text-xs text-muted-foreground">Book each product&apos;s whole order quantity to continue.</p>}
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button type="button" icon={Check} disabled={!valid} onClick={confirm}>
            OK
          </Button>
        </div>
      }
    >
      <div className="space-y-4" data-testid="inventory-booking">
        {items.map((item) => {
          const total = totalBooked(item, booked)
          // The stock all its warehouses hold, and what the order needs beyond it (the backend books only what is there).
          const available = totalAvailable(item)
          const shortfall = Math.max(0, item.orderQty - available)
          const error = shown.items[item.key]
          return (
            <section key={item.key} className="space-y-1.5 rounded-md border border-border p-3" aria-label={`Booking of ${item.productName}`} data-testid="booking-item">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="min-w-0 text-sm font-semibold break-words text-brand">
                  {item.productName || 'Product'}
                  {showSku && item.skuCode ? <span className="ml-2 text-xs font-normal text-muted-foreground">{item.skuCode}</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  Required Quantity <span className="font-semibold text-foreground tabular-nums" data-testid="booking-order-qty">{quantity(item.orderQty)}</span>
                  {' '}
                  - Available <span className="font-semibold text-foreground tabular-nums" data-testid="booking-available">{quantity(available)}</span>
                  {shortfall > 0 ? (
                    <>
                      {' '}
                      - Remaining to Book <span className="font-semibold text-destructive tabular-nums" data-testid="booking-shortfall">{quantity(shortfall)}</span>
                    </>
                  ) : null}
                  {' '}
                  - Booked <span className={cn('font-semibold tabular-nums', error ? 'text-destructive' : 'text-foreground')} data-testid="booking-total">{quantity(total)}</span>
                </p>
              </div>
              {/* The same table for every product - one no warehouse holds lists the company's warehouses at 0. */}
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className={cn(cell, 'font-medium')}>Warehouse Name</th>
                      <th className={cn(cell, 'font-medium')}>Contact No.</th>
                      <th className={cn(cell, 'text-right font-medium')}>Available Quantity</th>
                      <th className={cn(cell, 'w-36 font-medium')}>Book Quantity</th>
                      <th className={cn(cell, 'text-right font-medium')}>Remaining Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.warehouses.map((warehouse) => {
                      const value = bookedOf(booked, item.key, warehouse.id) ?? 0
                      const remaining = warehouse.available - Math.max(0, value)
                      const cellError = shown.cells[`${item.key}:${warehouse.id}`]
                      return (
                        <tr key={warehouse.id} className="border-t border-border align-top" data-testid="booking-warehouse">
                          <td className={cn(cell, 'break-words')}>{warehouse.name}</td>
                          <td className={cell}>{warehouse.contact || '--'}</td>
                          <td className={cn(cell, 'text-right tabular-nums')}>{quantity(warehouse.available)}</td>
                          <td className={cell}>
                            <input
                              type="text"
                              inputMode="decimal"
                              aria-label={`Book quantity of ${item.productName} from ${warehouse.name}`}
                              aria-invalid={Boolean(cellError)}
                              className="h-8 w-full rounded-md border border-input bg-card px-2 text-right text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
                              value={booked[item.key]?.[warehouse.id] ?? ''}
                              onChange={(event) => type(item.key, warehouse.id, event.target.value)}
                            />
                            {cellError ? <p className="mt-0.5 text-[11px] text-destructive">{cellError}</p> : null}
                          </td>
                          <td className={cn(cell, 'text-right font-semibold tabular-nums', remaining < 0 && 'text-destructive')} data-testid="booking-remaining">
                            {quantity(remaining)}
                          </td>
                        </tr>
                      )
                    })}
                    {/* A product with no warehouse at all: the same columns, at 0. */}
                    {item.warehouses.length === 0 ? (
                      <tr className="border-t border-border align-top text-muted-foreground" data-testid="booking-warehouse-empty">
                        <td className={cell}>--</td>
                        <td className={cell}>--</td>
                        <td className={cn(cell, 'text-right tabular-nums')}>0</td>
                        <td className={cell}>--</td>
                        <td className={cn(cell, 'text-right font-semibold tabular-nums')}>0</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              {error ? (
                <p className="text-xs text-destructive" role="alert" data-testid="booking-item-error">
                  {error}
                </p>
              ) : null}
            </section>
          )
        })}
      </div>
    </Modal>
  )
}
