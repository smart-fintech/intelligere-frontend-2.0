import { fieldLabelClass } from '@/Components/Common/FormFields'
import { cn } from '@/Library/utils'

/**
 * The three counts of an upload, under the Entries title:
 *
 *   Total Entries           everything the upload brought - fixed for the session
 *   Current Batch Entries   the entries received in the batch on screen
 *   Remaining Entries       the ones still to be fetched in later batches
 *
 * The numbers are the caller's to work out (B2B takes the API's own total_len
 * and Remaining); this only shows them. Never below 0.
 */
const COUNTS = [
  ['total', 'Total Entries'],
  ['batch', 'Current Batch Entries'],
  ['remaining', 'Remaining Entries'],
]

const shown = (value) => Math.max(0, Math.trunc(Number(value) || 0)).toLocaleString('en-IN')

export default function EntryCounts({ total, batch, remaining }) {
  const values = { total, batch, remaining }
  return (
    <dl aria-label="Entry counts" className="grid grid-cols-3 divide-x divide-border rounded-md border border-border">
      {COUNTS.map(([key, label]) => (
        <div key={key} className="flex min-w-0 flex-col justify-between px-3 py-2">
          <dt className={cn(fieldLabelClass, 'leading-tight')}>{label}</dt>
          <dd className="mt-1.5 text-base font-semibold text-foreground tabular-nums" data-count={key}>
            {shown(values[key])}
          </dd>
        </div>
      ))}
    </dl>
  )
}
