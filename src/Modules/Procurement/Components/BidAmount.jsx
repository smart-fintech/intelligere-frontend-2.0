import { showAmount } from '@/Modules/Procurement/procurement'
import { fromBaseAmount, moneyIn, plainAmount } from '@/Modules/Procurement/vendorCurrency'

/**
 * One bid amount as the backend holds it - in the company's currency - and,
 * for a vendor bidding in another currency on this auction, its own figure
 * worked back at the auction's rate (fromBaseAmount; "≈" when that is not
 * provably the figure typed).
 *
 *   value      the stored amount (last_vender_bid, bid_amount, last_bid ...)
 *   currency   the vendor's { code, rate } on this auction (bidCurrencyOf), or null
 *   baseCode   the company's currency code where it is known (the company side);
 *              without it the stored amount is shown as before (₹), or - next to
 *              a foreign figure - as "8,350.00 converted"
 *   lead       'base' (company side: its own currency first) | 'own' (the vendor's)
 *
 * Without a currency it is exactly the single amount it always was.
 */
export function BidAmount({ value, currency = null, baseCode = '', lead = 'base' }) {
  const base = baseCode ? moneyIn(value, baseCode) : showAmount(value)
  if (!currency || !(Number(value) > 0)) return base

  const own = fromBaseAmount(value, currency.rate)
  const ownText = `${own.exact ? '' : '≈ '}${moneyIn(own.value, currency.code)}`
  const baseText = baseCode ? base : `${plainAmount(value)} converted`
  const [first, second] = lead === 'own' ? [ownText] : [baseText, ownText]

  return (
    <span className="inline-block tabular-nums">
      {first}
      <span className="block text-[11px] font-normal text-muted-foreground">{second}</span>
    </span>
  )
}

export default BidAmount
