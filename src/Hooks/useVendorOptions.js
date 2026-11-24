/**
 * The active company's vendors as the choices of a dropdown - for a product
 * field that asks for a vendor (`vendor_select`):
 *
 *   const vendors = useVendorOptions(formHasAVendorField)
 *
 *   status    'idle' | 'loading' | 'ready' | 'failed'
 *   options   [{ value, label, id }] - `value` is the vendor's identifier as
 *             text, which is what a dropdown works in; `id` is that
 *             identifier exactly as the backend sent it, which is what gets
 *             sent; `label` is the name the company knows the vendor by
 *   error     the message when the request failed
 *   retry()   asks again - nothing retries on its own
 *
 * `enabled` is whether anything on screen needs them. While it is false
 * NOTHING is fetched and `status` is 'idle' - a company whose products have
 * no vendor field never asks for its vendors here.
 *
 * The same list the Vendor tab shows (getVendors), read with the same
 * `company_id` from the store. A vendor the company has deleted is not
 * offered, and one that has arrived without an identifier cannot be chosen,
 * so it is left out too.
 *
 * ONLY VERIFIED VENDORS ARE OFFERED - for every user, with or without
 * Inventory Management: `options` holds a vendor only when the active
 * company's entry says `is_verified: true` (company_details[<company id>],
 * the flag the Vendor tab shows as Verified / Unverified). An empty
 * `options` is said as NO_VERIFIED_VENDORS.
 *
 *   known     every vendor `options` would hold were verification not asked
 *             - verified or not. Not for offering: for a vendor a product is
 *             ALREADY saved with, which stays shown by its name and is sent
 *             back as it was, so an edit never quietly unlinks a vendor that
 *             has not been verified (yet).
 */

import { useEffect, useMemo, useRef, useState } from 'react'

import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { getVendorId, getVendors, vendorCompanyDetails } from '@/Services/Inventory/vendorService'

const NO_VENDORS = []

/** What a vendor dropdown says when no vendor is verified - see the note at the top. */
export const NO_VERIFIED_VENDORS = 'No verified vendors available'

export default function useVendorOptions(enabled) {
  const { activeCompanyId: companyId } = useActiveCompany()

  // Kept with the company it belongs to, as on the Vendor tab: an answer for
  // a company the header has since left is not this company's.
  const [state, setState] = useState({ status: 'loading', vendors: NO_VENDORS, error: null, forKey: null })
  const [attempt, setAttempt] = useState(0)
  const request = useRef(null)

  useEffect(() => {
    if (!enabled || !companyId) return

    const requestKey = `${companyId}#${attempt}`
    if (request.current === requestKey) return
    request.current = requestKey

    getVendors(companyId)
      .then((vendors) => {
        if (request.current === requestKey) setState({ status: 'ready', vendors, error: null, forKey: companyId })
      })
      .catch((failure) => {
        if (request.current !== requestKey) return
        setState({ status: 'failed', vendors: NO_VENDORS, error: failure.message, forKey: companyId })
      })
  }, [enabled, companyId, attempt])

  const mine = enabled && Boolean(companyId) && state.forKey === companyId
  const vendors = mine ? state.vendors : NO_VENDORS

  const known = useMemo(
    () =>
      vendors.reduce((list, vendor) => {
        const id = getVendorId(vendor)
        const details = vendorCompanyDetails(vendor, companyId)
        if (id === null || details?.is_deleted) return list

        list.push({
          value: String(id),
          id,
          label: details?.ledger_name || vendor.email || `Vendor ${id}`,
          verified: details?.is_verified === true,
        })
        return list
      }, []),
    [vendors, companyId],
  )

  // What is offered: the verified ones alone - see the note at the top.
  const options = useMemo(() => known.filter((option) => option.verified), [known])

  return {
    status: !enabled || !companyId ? 'idle' : mine ? state.status : 'loading',
    options,
    known,
    error: mine ? state.error : null,
    retry: () => {
      setState((previous) => ({ ...previous, forKey: null }))
      setAttempt((count) => count + 1)
    },
  }
}
