/**
 * WHEN THE "GET ENTRIES" CARD SHOWS - one view's answer, read from its batch:
 *
 *   const card = useGetEntriesCard(batch)
 *
 *   card.hidden      entries are in from an answer that did not fail: the whole
 *                    card steps aside and only the entries show
 *   card.reopen()    "Upload or fetch again" - the card is back over the entries
 *   card.close()     back to the entries without a new upload
 *   card.awaitFresh()  an upload / a fetch has saved entries and the batch is
 *                    being read again: the card steps aside once that answer
 *                    brings entries - never before, and not when it fails
 *
 * Nothing here asks the API; it only follows what useEntryBatches received.
 */

import { useState } from 'react'

export default function useGetEntriesCard(batch) {
  const [reopened, setReopened] = useState(false)
  const [awaiting, setAwaiting] = useState(false)
  const [seenRows, setSeenRows] = useState(batch.rows)

  // A new answer came in (useEntryBatches gives a new array each time).
  if (batch.rows !== seenRows) {
    setSeenRows(batch.rows)
    if (awaiting) {
      setAwaiting(false)
      if (batch.rows.length > 0 || batch.total > 0) setReopened(false)
    }
  }

  return {
    hidden: batch.hasData && batch.status !== 'failed' && !reopened,
    reopened: batch.hasData && reopened,
    reopen: () => setReopened(true),
    close: () => setReopened(false),
    awaitFresh: () => setAwaiting(true),
  }
}
