import { useMemo, useState } from 'react'

import { FieldError, FieldLabel } from '@/Components/Common/FormFields'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/Components/ui/select'
import { Tooltip } from '@/Components/ui/tooltip'

/**
 * Choosing ONE currency by its ISO 4217 code.
 *
 *   <CurrencySelect id="vendor-currency" label="Currency" currencies={currencies}
 *     value="USD" onChange={(code) => ...} />
 *
 * The box and the list show the codes only (USD, EUR, RUB); a currency's full
 * name is in the app's Tooltip on hover and on keyboard focus - on an option,
 * and on the box once one is chosen - and is read out with the code. The
 * search finds a code or a name ("dollar" lists USD, AUD ...).
 *
 * It fetches nothing: `currencies` is [{ code, name, symbol }], once each
 * (readCurrencies in Modules/Procurement/vendorCurrency).
 *
 *   id, label, required, error, placeholder, disabled, loading, className
 */
export function CurrencySelect({
  currencies = [],
  value = '',
  onChange,
  id,
  label,
  required = false,
  error,
  placeholder = 'Select',
  disabled = false,
  loading = false,
  className,
}) {
  const [search, setSearch] = useState('')
  // Closed, only the chosen option is mounted - all it takes for the box to show its code.
  const [open, setOpen] = useState(false)

  const list = useMemo(() => (Array.isArray(currencies) ? currencies : []), [currencies])
  const chosen = list.find((currency) => currency.code === value) ?? null
  const term = search.trim().toLowerCase()
  const visible = useMemo(
    () =>
      term
        ? list.filter((currency) => currency.code.toLowerCase().includes(term) || currency.name.toLowerCase().includes(term))
        : list,
    [list, term],
  )
  const mounted = open ? visible : chosen ? [chosen] : []

  const trigger = (
    <SelectTrigger
      id={id}
      className="w-full"
      aria-invalid={Boolean(error) || undefined}
      aria-required={required || undefined}
      aria-describedby={error && id ? `${id}-error` : undefined}
    >
      <SelectValue placeholder={loading ? 'Loading...' : placeholder} />
    </SelectTrigger>
  )

  return (
    <div className={className}>
      <div className="space-y-1.5">
        {label ? (
          <FieldLabel htmlFor={id} required={required}>
            {label}
          </FieldLabel>
        ) : null}

        <Select
          value={chosen ? chosen.code : ''}
          onValueChange={(next) => {
            if (next) onChange?.(next)
          }}
          disabled={disabled || loading || list.length === 0}
          onOpenChange={(next) => {
            setOpen(next)
            if (!next) setSearch('')
          }}
        >
          {chosen ? (
            <Tooltip text={chosen.name} side="top">
              {trigger}
            </Tooltip>
          ) : (
            trigger
          )}

          <SelectContent
            searchable
            searchPlaceholder="Search"
            searchValue={search}
            onSearchChange={setSearch}
          >
            {mounted.map((currency) => (
              <Tooltip key={currency.code} text={currency.name} side="right" align="start">
                <SelectItem value={currency.code} textValue={currency.code}>
                  {currency.code}
                  <span className="sr-only"> {currency.name}</span>
                </SelectItem>
              </Tooltip>
            ))}

            {open && visible.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                No matches for &ldquo;{search.trim()}&rdquo;
              </p>
            ) : null}
          </SelectContent>
        </Select>

        <FieldError id={id ? `${id}-error` : undefined}>{error}</FieldError>
      </div>
    </div>
  )
}

export default CurrencySelect
