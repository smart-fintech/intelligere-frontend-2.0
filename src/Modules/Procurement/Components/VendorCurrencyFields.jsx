import { Globe, HelpCircle, Loader2 } from 'lucide-react'

import { CurrencySelect } from '@/Components/Common/CurrencySelect'
import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import { Field } from '@/Components/Common/FormFields'
import {
  VENDOR_COUNTRY,
  cleanRate,
  currencyErrorKey,
  currencyValue,
  findCurrency,
  rateSentence,
} from '@/Modules/Procurement/vendorCurrency'

/**
 * The currency and conversion rate of this event's vendors that are not
 * domestic (listedVendors), one line per vendor however many products it is
 * on. Nothing is drawn while there is none.
 *
 *   foreign   both fields required, the currency starting on its country's
 *   unknown   its country (or the company's) cannot be told - optional, both or neither
 *   pending   the country list is needed to tell - fields wait, the form cannot be saved
 *
 * A saved pair is shown and can be changed. The rate box carries the chosen
 * currency's symbol, and under it what the number means - "1 USD = 83.50 INR",
 * the company's own currency (`base`) on the right.
 *
 * `values` is { [vendor key]: { currency, conversion_rate } }; onChange gets
 * the whole map back.
 */

function CountryLine({ vendor }) {
  if (vendor.status === VENDOR_COUNTRY.PENDING) {
    return (
      <span className="inline-flex items-center gap-1">
        <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" /> Checking country...
      </span>
    )
  }
  if (vendor.status === VENDOR_COUNTRY.UNKNOWN) {
    return (
      <span className="inline-flex items-center gap-1">
        <HelpCircle className="size-3.5 shrink-0" aria-hidden="true" /> Country unknown - fill only if it bids in
        another currency
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Globe className="size-3.5 shrink-0" aria-hidden="true" /> {vendor.country}
    </span>
  )
}

function RateField({ id, vendor, value, currency, base, error, disabled, onChange }) {
  const symbol = currency?.symbol || currency?.code || ''
  const hintId = `${id}-hint`
  const changedAfterBids =
    vendor.hasBids && vendor.saved && String(value.conversion_rate ?? '') !== String(vendor.saved.conversion_rate)
  return (
    <div className="space-y-1">
      <Field
        id={id}
        label="Conversion Rate"
        required={vendor.required}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="e.g. 83.50"
        value={value.conversion_rate ?? ''}
        error={error}
        disabled={disabled}
        onChange={(event) => onChange(cleanRate(event.target.value))}
        prefix={
          symbol ? (
            <bdi aria-hidden="true" className="font-semibold text-brand">
              {symbol}
            </bdi>
          ) : null
        }
        // Room for the symbol, however many characters it has (₩, Bds$, FCFA).
        style={symbol ? { paddingLeft: `calc(1.25rem + ${[...symbol].length}ch)` } : undefined}
        {...(error ? {} : { 'aria-describedby': hintId })}
      />
      {error ? null : (
        <p id={hintId} className="text-xs text-muted-foreground tabular-nums">
          {rateSentence(currency?.code, value.conversion_rate, base?.code)}
          {changedAfterBids ? (
            <span className="block text-amber-700 dark:text-amber-400">
              For new bids - bids already placed keep their converted amounts.
            </span>
          ) : null}
        </p>
      )}
    </div>
  )
}

export default function VendorCurrencyFields({
  vendors,
  values,
  currencies,
  base,
  status,
  loadError,
  onReload,
  errors,
  disabled,
  onChange,
  // Another screen's own (an invoice's party - SalesInvoice/Components/PartyCurrencyCard); Procurement's by default.
  idPrefix = 'procurement-currency',
  loadNote = 'Vendors from another country need it for their currency, so this cannot be saved until it loads.',
}) {
  // Only what was changed is kept, so a field left alone still follows its saved value or its default
  // (a currency that could not be offered while the list was down is picked up once it loads).
  const set = (vendor, change) => onChange({ ...values, [vendor.key]: { ...values[vendor.key], ...change } })

  return (
    <div className="space-y-2">
      {status === 'failed' ? (
        <InlineAlert action={<RetryButton onClick={onReload} />}>
          {loadError || 'The country list could not be loaded.'} {loadNote}
        </InlineAlert>
      ) : null}

      {vendors.length > 0 ? (
        <ul className="space-y-2">
          {vendors.map((vendor) => {
            const value = currencyValue(vendor, values, currencies)
            const currency = findCurrency(currencies, value.currency)
            const id = `${idPrefix}-${vendor.key.replace(/[^a-z0-9_-]/gi, '_')}`
            const waiting = vendor.status === VENDOR_COUNTRY.PENDING
            return (
              <li
                key={vendor.key}
                className="grid grid-cols-1 items-start gap-x-4 gap-y-2 rounded-md border border-border bg-card p-2.5 sm:grid-cols-[minmax(0,1fr)_8rem_minmax(0,14rem)]"
              >
                <div className="min-w-0 sm:pt-5">
                  <p className="truncate text-sm font-semibold text-foreground" title={vendor.name}>
                    {vendor.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <CountryLine vendor={vendor} />
                  </p>
                </div>
                <CurrencySelect
                  id={`${id}-code`}
                  label="Currency"
                  required={vendor.required}
                  currencies={currencies}
                  value={value.currency}
                  loading={status === 'idle' || status === 'loading'}
                  placeholder={status === 'failed' ? 'Not loaded' : 'Select'}
                  error={errors[currencyErrorKey(vendor.key, 'currency')]}
                  disabled={disabled || waiting}
                  onChange={(code) => set(vendor, { currency: code })}
                />
                <RateField
                  id={`${id}-rate`}
                  vendor={vendor}
                  value={value}
                  currency={currency}
                  base={base}
                  error={errors[currencyErrorKey(vendor.key, 'conversion_rate')]}
                  disabled={disabled || waiting}
                  onChange={(rate) => set(vendor, { conversion_rate: rate })}
                />
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
