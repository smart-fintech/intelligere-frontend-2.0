import { useState } from 'react'
import { ArrowDownUp, Check, Trash2 } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton } from '@/Components/Common/DataList'
import { Field, SelectField } from '@/Components/Common/FormFields'
import { Button } from '@/Components/ui/button'
import { mappingEntries } from '@/Modules/SalesEntries/shared/keywordMapping'

/**
 * KEYWORD MAPPING of one source - shown in place of the entries when the
 * toolbar's Show Mapping is on, as the old screen did:
 *
 *   Assign Ledger   a keyword, the company ledger it stands for, Submit. Saving
 *                   a keyword that is already there changes its ledger (PUT merges).
 *   the list        every keyword -> ledger of THIS source, each with Remove
 *
 * The mapping applies at once to what the view shows and sends.
 *
 *   mapping    useKeywordMapping(companyId, source)
 *   ledgers    useCompanyLedgers - the ledgers a keyword can map to
 *   rule       one line on what a keyword matches in this view
 *   idPrefix   the three views each keep a panel mounted - ids stay unique
 */
export default function KeywordMappingPanel({ mapping, ledgers, rule, idPrefix }) {
  const [keyword, setKeyword] = useState('')
  const [ledger, setLedger] = useState('')
  const [errors, setErrors] = useState({})
  const entries = mappingEntries(mapping.mapping)

  const add = async () => {
    const found = {}
    if (!keyword.trim()) found.keyword = 'Please enter a keyword'
    if (!ledger) found.ledger = 'Please select a ledger'
    setErrors(found)
    if (Object.keys(found).length > 0) return
    if (await mapping.add(keyword.trim(), ledger)) {
      setKeyword('')
      setLedger('')
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3 py-2">
      <section className="rounded-lg border border-border bg-card p-4 shadow-xs">
        <h3 className="text-center text-base font-semibold text-brand">Assign Ledger</h3>
        {rule ? <p className="mt-1 text-center text-xs text-muted-foreground">{rule}</p> : null}
        <form
          className="mt-4 space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            add()
          }}
        >
          <Field
            id={`${idPrefix}-keyword`}
            label="Keyword"
            required
            placeholder="As it is written in the file"
            value={keyword}
            error={errors.keyword}
            disabled={mapping.saving}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <div className="flex justify-center text-brand" aria-hidden="true">
            <ArrowDownUp className="size-4" />
          </div>
          <SelectField
            id={`${idPrefix}-ledger`}
            label="Ledger"
            required
            searchable
            searchPlaceholder="Search ledger"
            placeholder={ledgers.options.length === 0 ? 'Loading ledgers...' : 'Select ledger'}
            options={ledgers.options}
            value={ledger}
            error={errors.ledger}
            disabled={mapping.saving}
            onValueChange={setLedger}
          />
          <div className="flex justify-center pt-2">
            <Button type="submit" icon={Check} loading={mapping.saving}>
              Submit
            </Button>
          </div>
        </form>
      </section>

      {mapping.status === 'failed' ? <InlineAlert action={<RetryButton onClick={mapping.reload} />}>{mapping.error}</InlineAlert> : null}

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.5rem] gap-2 border-b border-border bg-muted px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <span>Keyword</span>
          <span>Ledger</span>
          <span className="sr-only">Remove</span>
        </div>
        {mapping.status === 'loading' && entries.length === 0 ? (
          <div className="px-3">
            <ListSkeleton rows={3} />
          </div>
        ) : entries.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No old keywords found.</p>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {entries.map(([word, target]) => (
              <li key={word} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.5rem] items-center gap-2 px-3 py-2 text-sm">
                <span className="truncate" title={word}>
                  {word}
                </span>
                <span className="truncate font-medium text-brand" title={target}>
                  {target}
                </span>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon-sm"
                  icon={Trash2}
                  aria-label={`Remove keyword ${word}`}
                  tooltip="Remove"
                  disabled={mapping.saving}
                  onClick={() => mapping.remove(word)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
