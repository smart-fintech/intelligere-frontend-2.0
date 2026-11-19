/**
 * The country list a Bid's vendor currencies are read from, and the company's
 * own country and currency - see vendorCurrency for the rules.
 *
 *   const { status, loaded, error, countryList, currencies, companyCountry, base, reload } =
 *     useCompanyCurrency({ load })
 *
 *   status          the country list's: 'idle' | 'loading' | 'succeeded' | 'failed'
 *   loaded          the list is in
 *   companyCountry  the active company's country entry; null when it cannot be
 *                   told, PENDING while that needs the list
 *   base            the company's currency, { code, name, symbol }, or null
 *                   (unknown, or the list is not in)
 *
 * `load: false` asks for nothing - for a view that only needs the list when an
 * event has a foreign vendor. The list is the shared one (locationSlice),
 * fetched once per session whoever asks first.
 */

import { useEffect, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { PENDING, companyCountryEntry, findCurrency, readCurrencies } from '@/Modules/Procurement/vendorCurrency'
import {
  fetchCountries,
  selectCountryData,
  selectCountryError,
  selectCountryStatus,
} from '@/Store/Slices/locationSlice'

export default function useCompanyCurrency({ load = true } = {}) {
  const dispatch = useDispatch()
  const countryList = useSelector(selectCountryData)
  const status = useSelector(selectCountryStatus)
  const error = useSelector(selectCountryError)
  const { activeCompany } = useActiveCompany()
  const loaded = status === 'succeeded'

  useEffect(() => {
    if (load) dispatch(fetchCountries())
  }, [dispatch, load])

  const currencies = useMemo(() => readCurrencies(countryList), [countryList])
  const companyCountry = useMemo(
    () => companyCountryEntry(countryList, activeCompany, loaded),
    [countryList, activeCompany, loaded],
  )
  const base = useMemo(
    () => (companyCountry && companyCountry !== PENDING ? findCurrency(currencies, companyCountry.currency) : null),
    [currencies, companyCountry],
  )

  return {
    status,
    loaded,
    error,
    countryList,
    currencies,
    companyCountry,
    base,
    reload: () => dispatch(fetchCountries({ force: true })),
  }
}
