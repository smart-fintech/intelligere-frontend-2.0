import { AlertCircle, ChevronLeft, ChevronRight, Info, RefreshCw, Send, Upload } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'
import { plural } from '@/Modules/SalesEntries/shared/ledgerLists'

/**
 * The "Entries" card every view shows its batch in, laid out as the old
 * screen: a toolbar on top that stays in sight while the list scrolls (from
 * tablet width up), then the list - or the keyword mapping in its place.
 *
 *   toolbar        the view's ledger picks (`ledgers`), Total Entries / this
 *                  batch, then `actions` (Show Mapping, Send to Tally) and the
 *                  batch arrows
 *   notes          a line under the toolbar, on what the picks do
 *   mapping        when given, shown instead of the list (Show Mapping is on)
 *   Refresh        reads this batch again
 *   not a Tally account   a note: entries can be uploaded and looked over,
 *                  Send is for a Tally ERP account
 *   sent but not marked   the alert with "Mark as sent" (useTallySendAndMark)
 *   the batch's states    NOTHING while nothing has been asked (the view has
 *                  just opened); then loading (first time), failed, an answer
 *                  with no entries (`noDataMessage`),
 *                  every entry of this batch sent - else `children`, with
 *                  Previous / Next batch again under the list
 *
 * Props: batch (useEntryBatches), tally (useTallySendAndMark), isTally, busy,
 * entryCount (entries of the batch, after the view's reading), meta,
 * noDataMessage (what to say when an upload / fetch brought no entries),
 * onGetAgain ("Upload or fetch again" in the header, while the Get Entries card
 * is hidden), notice (a line over the entries - what a fetch left out),
 * ledgers, actions, notes, mapping.
 */

export function BatchNav({ batch, busy, compact = false }) {
  const { info } = batch
  if (info.count <= 1) return null
  const waiting = busy || batch.status === 'loading'

  if (compact) {
    return (
      <div className="flex items-center gap-1" role="navigation" aria-label="Batches">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          icon={ChevronLeft}
          aria-label="Previous batch"
          tooltip="Previous batch"
          disabled={!info.hasPrevious || waiting}
          onClick={() => batch.goTo(info.previousStart)}
        />
        <span className="px-1 text-xs whitespace-nowrap text-muted-foreground">
          Batch {info.number} / {info.count}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          icon={ChevronRight}
          aria-label="Next batch"
          tooltip="Click for next batch"
          disabled={!info.hasNext || waiting}
          onClick={() => batch.goTo(info.nextStart)}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
      <span>
        Batch {info.number} of {info.count} · invoices {info.first}-{info.last} of {batch.total}
      </span>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" icon={ChevronLeft} disabled={!info.hasPrevious || waiting} onClick={() => batch.goTo(info.previousStart)}>
          Previous batch
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!info.hasNext || waiting} onClick={() => batch.goTo(info.nextStart)}>
          Next batch
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

function Counts({ batch, entryCount }) {
  const { info } = batch
  return (
    <dl className="grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 self-center text-xs">
      <dt className="text-muted-foreground">Total Entries :</dt>
      <dd className="font-semibold text-brand tabular-nums">{batch.total}</dd>
      <dt className="text-muted-foreground">This Batch :</dt>
      <dd className="font-semibold text-brand tabular-nums">
        {entryCount}
        {info.count > 1 ? (
          <span className="font-normal text-muted-foreground">
            {' '}
            (invoices {info.first}-{info.last})
          </span>
        ) : null}
      </dd>
    </dl>
  )
}

export default function EntriesPanel({ batch, tally, isTally, busy, entryCount, meta, noDataMessage, ledgers, actions, notes, mapping, onGetAgain, notice, children }) {
  const firstLoad = batch.status === 'loading' && batch.rows.length === 0 && batch.total === 0
  const failedEmpty = batch.status === 'failed' && batch.rows.length === 0
  const hasEntries = !firstLoad && !failedEmpty && batch.total > 0

  // Nothing asked yet - the view has just opened: no card at all until an upload or a fetch.
  if (batch.status === 'idle') return null

  const body = () => {
    if (firstLoad) return <ListSkeleton rows={6} />
    if (failedEmpty) {
      return (
        <StateMessage icon={AlertCircle} tone="error" title="Could not load the sales entries" action={<RetryButton onClick={batch.reload} />}>
          {batch.error}
        </StateMessage>
      )
    }
    if (batch.total === 0) {
      // The answer to the user's upload / fetch held no entries - say so, as that answer.
      return (
        <p role="status" className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-brand" />
          {noDataMessage}
        </p>
      )
    }
    if (mapping) return mapping
    if (entryCount === 0) {
      return (
        <>
          <StateMessage icon={Send} title="Nothing left in this batch">
            Every entry of batch {batch.info.number} has been sent to Tally.
          </StateMessage>
          <BatchNav batch={batch} busy={busy} />
        </>
      )
    }
    return (
      <div className="space-y-3">
        {children}
        <BatchNav batch={batch} busy={busy} />
      </div>
    )
  }

  return (
    <Panel
      title="Entries"
      meta={meta}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {onGetAgain ? (
            <Button type="button" variant="outline" size="sm" icon={Upload} disabled={busy} onClick={onGetAgain}>
              Upload or fetch again
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" icon={RefreshCw} loading={batch.status === 'loading' && !firstLoad} disabled={busy} onClick={batch.reload}>
            Refresh
          </Button>
        </div>
      }
    >
      {notice ? <div className="mb-3">{notice}</div> : null}
      {!isTally ? (
        <p className="mb-3 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">
          Sending to Tally is for a Tally ERP account. You can upload and review the entries here.
        </p>
      ) : null}
      {tally.unmarked.length > 0 ? (
        <InlineAlert
          action={
            <Button type="button" variant="outline" size="sm" loading={tally.marking} onClick={tally.retryMark}>
              Mark as sent
            </Button>
          }
        >
          {plural(tally.unmarked.length, 'entry is', 'entries are')} in Tally but not marked as sent here. Mark them now - do not send them again.
        </InlineAlert>
      ) : null}

      {hasEntries ? (
        <div className="-mx-4 mb-3 border-b border-border bg-card px-4 pt-1 pb-3 md:sticky md:top-0 md:z-20">
          <div className="flex flex-wrap items-end gap-3">
            {ledgers}
            <Counts batch={batch} entryCount={entryCount} />
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2 self-center">
              {actions}
              <BatchNav batch={batch} busy={busy} compact />
            </div>
          </div>
          {notes ? <div className="mt-2 text-xs text-muted-foreground">{notes}</div> : null}
        </div>
      ) : null}

      {batch.status === 'failed' && !failedEmpty ? (
        <div className="mb-3">
          <InlineAlert action={<RetryButton onClick={batch.reload} />}>{batch.error}</InlineAlert>
        </div>
      ) : null}

      {body()}
    </Panel>
  )
}
