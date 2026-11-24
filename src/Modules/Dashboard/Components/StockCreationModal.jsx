/**
 * "Add Stock Creation", from the header's Add dropdown - the Simple
 * Inventory Product Form (BasicProductForm) in a dialog, for a company
 * without Inventory Management.
 *
 * Not a copy of the form: the same fields, validation and save - HTTP for
 * Intelligere, the WebSocket for Tally - as the Product page beside its
 * list, and as Sales Entries' "Create stock item" (CreateProductModal).
 *
 * Its dropdowns (groups, units, vendors) are asked for only while the
 * dialog is open: the form is drawn, and its hooks run, only then. The
 * vendors follow the Product page's rule (offersVendors) - none for an
 * Accounting Professional without Inventory Management.
 *
 * Props:
 *   open, onOpenChange  the usual controlled-modal pair
 *   onCreated()         after a successful save - the caller refreshes the
 *                       shared product list and closes the dialog
 */

import { useSelector } from 'react-redux'

import { Modal } from '@/Components/Common/Modal'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import useProductGroups from '@/Hooks/useProductGroups'
import useProductUnits from '@/Hooks/useProductUnits'
import useVendorOptions from '@/Hooks/useVendorOptions'
import { offersVendors } from '@/Services/Inventory/inventoryService'
import { BASIC_PRODUCT_ERP } from '@/Services/Product/productService'
import { selectIsAccountingProfessional, selectIsTallyErp } from '@/Store/Slices/profileSlice'
import BasicProductForm from './BasicProductForm'

/** The form and what its dropdowns are made of - mounted only while the dialog is open. */
function StockCreationForm({ onCreated, onCancel }) {
  const { activeCompany, activeCompanyName: companyName } = useActiveCompany()
  const professional = useSelector(selectIsAccountingProfessional)
  const isTally = useSelector(selectIsTallyErp)
  const erp = isTally ? BASIC_PRODUCT_ERP.TALLY : BASIC_PRODUCT_ERP.INTELLIGERE

  const groups = useProductGroups()
  const units = useProductUnits()
  const withVendors = offersVendors(professional, activeCompany)
  const vendors = useVendorOptions(!isTally && withVendors)

  return (
    <BasicProductForm
      // A fresh, empty form per company and ERP.
      key={`${erp}#${companyName}`}
      erp={erp}
      product={null}
      companyName={companyName}
      groups={groups}
      units={units}
      vendors={vendors}
      withVendors={withVendors}
      onSaved={onCreated}
      onCancel={onCancel}
    />
  )
}

export default function StockCreationModal({ open, onOpenChange, onCreated }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Add Stock Creation" size="lg">
      {open ? <StockCreationForm onCreated={onCreated} onCancel={() => onOpenChange(false)} /> : null}
    </Modal>
  )
}
