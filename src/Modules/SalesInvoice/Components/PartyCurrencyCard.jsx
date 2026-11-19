import { formatINR } from '@/Modules/Payment/pricing'
import VendorCurrencyFields from '@/Modules/Procurement/Components/VendorCurrencyFields'
import { fromBaseAmount, moneyIn, rateNumber, currencyErrorKey, currencyValue, findCurrency } from '@/Modules/Procurement/vendorCurrency'
import { InvoiceCard } from '@/Modules/SalesInvoice/Components/InvoiceGrid'
import { documentCurrencyErrorKey } from '@/Modules/SalesInvoice/documentCurrency'

/**
 * The Currency card under the ledger party's step - a Sales Invoice's buyer, a
 * Purchase Invoice's supplier - when that party is not domestic
 * (documentCurrency). Procurement's own fields (VendorCurrencyFields): the
 * currency, starting on the party's country's, and its conversion rate, with
 * "1 USD = 83.50 INR" under it; and the document's total in that currency.
 *
 *   entry        documentCurrencyParty - the party as Procurement lists a vendor
 *   partyKey     'buyer' | 'seller' - where its errors are (buyer.currency ...)
 *   currency     useCompanyCurrency's { status, error, currencies, base, reload }
 *   totalPaise   the document's total, in the company's currency
 */
export default function PartyCurrencyCard({ invoice, entry, partyKey, currency, totalPaise, disabled }) {
  const { form, errors, setField, setErrors } = invoice
  const fieldKeys = ['currency', 'conversion_rate'].map((field) => documentCurrencyErrorKey(partyKey, field))
  // The form's errors under the names the fields read them by.
  const shown = Object.fromEntries(
    ['currency', 'conversion_rate'].map((field) => [currencyErrorKey(entry.key, field), errors[documentCurrencyErrorKey(partyKey, field)]]),
  )

  const value = currencyValue(entry, form.currency, currency.currencies)
  const chosen = findCurrency(currency.currencies, value.currency)
  const rate = rateNumber(value.conversion_rate)
  const total = Math.round(totalPaise || 0) / 100
  const converted = chosen && rate && total > 0 ? fromBaseAmount(total, rate) : null

  return (
    <InvoiceCard title="Currency">
      <VendorCurrencyFields
        vendors={[entry]}
        values={form.currency}
        currencies={currency.currencies}
        base={currency.base}
        status={currency.status}
        loadError={currency.error}
        onReload={currency.reload}
        errors={shown}
        disabled={disabled}
        idPrefix={`${partyKey}-currency`}
        loadNote="A party from another country needs it for its currency, so this cannot be saved until it loads."
        onChange={(values) => {
          setField('currency', values)
          setErrors((previous) => {
            if (!fieldKeys.some((key) => key in previous)) return previous
            const next = { ...previous }
            fieldKeys.forEach((key) => delete next[key])
            return next
          })
        }}
      />
      {converted ? (
        <p className="text-sm text-muted-foreground tabular-nums" data-testid="party-currency-total">
          Total {formatINR(totalPaise)} = <span className="font-semibold text-foreground">{moneyIn(converted.value, chosen.code)}</span>
        </p>
      ) : null}
    </InvoiceCard>
  )
}
