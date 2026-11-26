/**
 * THE ROWS ON SCREEN - one batch of a Sales Entries list API at a time, for
 * any of the three views:
 *
 *   const batch = useEntryBatches(companyId, getMultiLedgerEntries)
 *
 *   status     'idle' | 'loading' | 'ready' | 'failed' - 'idle' until something
 *              asks (NOTHING is read when the view opens: only after an upload,
 *              a fetch, or Refresh); 'loading' keeps the last batch on screen,
 *              so a reload does not empty the table
 *   hasData    an answer has brought entries - the view then hides its upload /
 *              fetch cards and shows them
 *   rows       the API's rows of this batch, as they came (readBatch)
 *   total, notInTally, error
 *   info       batchInfo: number, count, hasPrevious, hasNext, ...
 *   goTo(start)  another batch; reload() this one again; restart() batch 1
 *
 *   onLoaded(rows)   optional: runs with every batch that arrives (With
 *                    Inventory creates the missing party ledgers from it)
 *
 * Batches step by SALES_ENTRIES_BATCH_SIZE, never by the rows received - see
 * shared/entryBatch. Only the latest request is listened to: an answer for a
 * batch the user has already moved away from is dropped.
 */

import { useEffect, useRef, useState } from 'react'

import { batchInfo, readBatch } from '@/Modules/SalesEntries/shared/entryBatch'

const EMPTY = Object.freeze({ start: 0, rows: [], total: 0, notInTally: 0 })

export default function useEntryBatches(companyId, fetchBatch, { onLoaded } = {}) {
  const [batch, setBatch] = useState(EMPTY)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const requestRef = useRef(0)
  const onLoadedRef = useRef(onLoaded)

  useEffect(() => {
    onLoadedRef.current = onLoaded
  })

  /** Asks for the batch; only the answer sets state, so the first load can run in an effect. */
  const request = (start) => {
    const ticket = ++requestRef.current
    return fetchBatch(companyId, start).then(
      (reply) => {
        if (ticket !== requestRef.current) return
        const next = readBatch(reply, start)
        setBatch(next)
        setStatus('ready')
        onLoadedRef.current?.(next.rows)
      },
      (failure) => {
        if (ticket !== requestRef.current) return
        setError(failure.message)
        setStatus('failed')
      },
    )
  }

  const load = (start) => {
    setStatus('loading')
    setError(null)
    return request(start)
  }

  // Nothing is asked when the view opens: the first batch is read after an
  // upload or a fetch (restart), or when the user asks (reload).

  // An answer still on its way when the view goes is not wanted.
  useEffect(() => () => void (requestRef.current += 1), [])

  return {
    status,
    error,
    // Entries are in: an answer brought some (a batch emptied by sending still counts).
    hasData: batch.total > 0 || batch.rows.length > 0,
    rows: batch.rows,
    total: batch.total,
    notInTally: batch.notInTally,
    start: batch.start,
    info: batchInfo(batch.start, batch.total),
    goTo: load,
    reload: () => load(batch.start),
    restart: () => load(0),
  }
}
