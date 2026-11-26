import { Landmark } from 'lucide-react'

import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { Label } from '@/Components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/Components/ui/radio-group'
import { SALES_ENTRIES_SOURCE, SALES_ENTRIES_SOURCE_OPTIONS, SALES_ENTRY_WORKFLOWS } from '@/Constants/salesEntries'
import { cn } from '@/Library/utils'

/**
 * The left of the selection card:
 *
 *   Using File | Fetch from GSTR-1      where the entries come from
 *   o With Inventory                    one radio per view
 *   o Without Inventory  Single Ledger
 *   o Without Inventory  Multi Ledger
 *
 * GSTR-1 brings Multi Ledger entries only, so with it the radios give way to
 * a line saying so.
 *
 *   source, onSourceChange      SALES_ENTRIES_SOURCE
 *   view                        the view shown (SALES_ENTRIES_VIEW)
 *   onPick(view)                another view was chosen
 */
export default function WorkflowPicker({ source, onSourceChange, view, onPick, disabled }) {
  return (
    <div className="space-y-4">
      <ViewSwitch
        options={SALES_ENTRIES_SOURCE_OPTIONS}
        value={source}
        onValueChange={onSourceChange}
        label="Where the entries come from"
        idPrefix="sales-entries-source"
        className="mx-auto w-fit max-w-full"
      />

      {source === SALES_ENTRIES_SOURCE.GSTR_1 ? (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3">
          <Landmark className="mt-0.5 size-5 shrink-0 text-brand" />
          <div className="min-w-0 space-y-1">
            <h3 className="text-sm font-semibold text-brand">GSTR-1 · Without Inventory (Multi Ledger)</h3>
            <p className="text-xs text-muted-foreground">
              Choose the month and year, then Fetch. The month&apos;s invoices from the GST portal come in as Multi Ledger entries.
            </p>
          </div>
        </div>
      ) : (
        <RadioGroup
          value={view}
          onValueChange={onPick}
          aria-label="Kind of sales entry"
          disabled={disabled}
          className="gap-1 rounded-lg border border-border p-3"
        >
          {SALES_ENTRY_WORKFLOWS.map((option) => {
            const id = `sales-entries-workflow-${option.key}`
            const isChecked = view === option.view
            return (
              <Label
                key={option.key}
                htmlFor={id}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                  isChecked ? 'bg-brand-soft font-semibold text-brand' : 'text-foreground hover:bg-muted/60',
                )}
              >
                <RadioGroupItem id={id} value={option.view} />
                <span>{option.label}</span>
                {option.tag ? (
                  <span
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[11px] font-medium',
                      isChecked ? 'border-brand/30 text-brand' : 'border-border text-muted-foreground',
                    )}
                  >
                    {option.tag}
                  </span>
                ) : null}
              </Label>
            )
          })}
        </RadioGroup>
      )}
    </div>
  )
}
