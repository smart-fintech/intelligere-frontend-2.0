import { AlertCircle } from 'lucide-react'

import { Button } from '@/Components/ui/button'
import { Checkbox } from '@/Components/ui/checkbox'
import { cn } from '@/Library/utils'
import { chooseVendor, isVendorChosen } from '@/Modules/Procurement/procurement'

/**
 * Create Bid: the Pre Bid's vendors, each with a tick box, all ticked to begin
 * with. Unticking one takes it off every product of the Bid (so it is not in
 * what is saved); ticking it puts it back on its Pre Bid products
 * (chooseVendor). A box is ticked while the vendor is on any product, so a
 * vendor taken off its products in the cards below shows unticked here too.
 *
 *   choices   preBidVendorChoices of the form's first rows
 *   rows      the form's rows now; onChange gets them changed
 *   error     the "at least one vendor" message, when no vendor is left
 */

const ERROR_ID = 'procurement-bid-vendors-error'

export default function PreBidVendorChecklist({ choices, rows, error, disabled, onChange }) {
  const chosen = choices.filter((choice) => isVendorChosen(rows, choice))
  const chosenKeys = new Set(chosen.map((choice) => choice.key))
  const setAll = (on) => onChange(choices.reduce((next, choice) => chooseVendor(next, choice, on), rows))

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Untick a vendor to leave it out of this Financial Bid. Ticked vendors keep the details they had on the Technical Bid.
        </p>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-7 px-0"
            disabled={disabled || chosen.length === choices.length}
            onClick={() => setAll(true)}
          >
            Select all
          </Button>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-7 px-0"
            disabled={disabled || chosen.length === 0}
            onClick={() => setAll(false)}
          >
            Clear all
          </Button>
        </div>
      </div>

      <div role="group" aria-label="Vendors for this Financial Bid" aria-describedby={error ? ERROR_ID : undefined}>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {choices.map((choice) => {
            const on = chosenKeys.has(choice.key)
            const id = `procurement-bid-vendor-${choice.key.replace(/[^\w-]/g, '_')}`
            const name = choice.vendor.name || choice.vendor.email || 'Vendor'
            const products = choice.entries.size
            return (
              <li key={choice.key}>
                <label
                  htmlFor={id}
                  className={cn(
                    'flex h-full items-start gap-2.5 rounded-md border px-3 py-2 transition-colors',
                    disabled ? 'cursor-not-allowed' : 'cursor-pointer',
                    on ? 'border-brand/50 bg-brand-soft/40' : 'border-dashed border-border bg-muted/30',
                    error && 'border-destructive/60',
                  )}
                >
                  <Checkbox
                    id={id}
                    checked={on}
                    disabled={disabled}
                    onCheckedChange={(next) => onChange(chooseVendor(rows, choice, next === true))}
                    aria-invalid={error ? true : undefined}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-sm font-medium', on ? 'text-foreground' : 'text-muted-foreground')} title={name}>
                      {name}
                    </span>
                    {choice.vendor.email && choice.vendor.email !== name ? (
                      <span className="block truncate text-xs text-muted-foreground" title={choice.vendor.email}>
                        {choice.vendor.email}
                      </span>
                    ) : null}
                    {choice.vendor.company ? (
                      <span className="block truncate text-xs text-muted-foreground" title={choice.vendor.company}>
                        {choice.vendor.company}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded px-1.5 py-0.5 text-[11px]',
                      on ? 'bg-brand-soft text-brand' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {on ? (products === 1 ? '1 product' : `${products} products`) : 'Left out'}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </div>

      {error ? (
        <p id={ERROR_ID} role="alert" className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="size-3.5 shrink-0" /> {error}
        </p>
      ) : null}
    </div>
  )
}
