import { Fragment } from 'react'
import { MapPin } from 'lucide-react'

import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import { CheckboxField, Field, FieldError, FieldLabel, FileField, SelectField } from '@/Components/Common/FormFields'
import { Input } from '@/Components/ui/input'
import { Tooltip } from '@/Components/ui/tooltip'
import {
  CHALLAN_TYPES,
  DEFAULT_SUPPLY_TYPE_OF,
  DELIVERY_MODES,
  INVOICE_NO_MAX_LENGTH,
  SUPPLY_OPTIONS,
  TRANSPORT_REASONS,
} from '@/Constants/salesInvoice'
import { FULL_FIELD, InvoiceCard, InvoiceGrid, WIDE_FIELD } from '@/Modules/SalesInvoice/Components/InvoiceGrid'
import {
  documentProfile,
  portalRequiredFields,
  portalSettingsOf,
  supplyTypesOf,
  toDecimalInput,
  visibleDocumentFields,
} from '@/Modules/SalesInvoice/salesInvoiceForm'
import { paymentQrOfBank } from '@/Services/Invoice/salesInvoiceService'

/**
 * Step 3 - Document Details.
 *
 * Auto Increment sits in the card's heading row, beside its title. With it
 * on, the number is typed as three parts joined by "/"; off, it is one box.
 * The document type is chosen on Step 1 (DocumentTypeCard), not here.
 *
 * Each document type shows its own set, in its own order and with its own
 * labels (documentProfile's `fields`: Sales Invoice all of them; a Challan
 * its Invoice No. / Date, Reference No. / PO No. (required), transport and
 * Challan Type; a Sales Order its references and payment terms; ...). A field
 * is the same field whichever type shows it - same state, same handler.
 *
 *   banks           { list, options, status, error, retry } - bank_statement/
 *                   bankDetails/, read from the store (bankSlice); choosing
 *                   one fills Payment QR with that bank's QR, or empties it
 *   numbering       useDocumentNumbering(...) - { status, retry } of the last
 *                   document number for the type chosen on Step 1 (asked by
 *                   Step 2's Next - the only way here, the step bar goes back only);
 *                   Auto Increment is its setAutoIncrement (the company's setting
 *                   saved first, then the number asked for again when ticked)
 *   numberLocked    the document is already saved under this number (only
 *                   its PDF is still to go) - it can no longer change
 */

/** The GST portal's PIN-to-PIN distance page - opened from the Distance field (Get Distance). */
const GET_DISTANCE_URL = 'https://einvoice1.gst.gov.in/Others/GetPinCodeDistance'

/** The invoice number as three parts with "/" between them. */
function InvoiceNumberParts({ parts, error, disabled, onChange, className, label = 'Invoice No.' }) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <FieldLabel htmlFor="invoice-no-part-1" required>
        {label}
      </FieldLabel>
      <div className="flex items-center gap-1.5">
        {parts.map((part, index) => (
          <Fragment key={index}>
            {index > 0 ? (
              <span aria-hidden="true" className="text-muted-foreground">
                /
              </span>
            ) : null}
            <Input
              id={`invoice-no-part-${index + 1}`}
              aria-label={`Invoice number part ${index + 1}`}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? 'invoice-no-parts-error' : undefined}
              value={part}
              disabled={disabled}
              onChange={(event) => onChange(parts.map((current, at) => (at === index ? event.target.value : current)))}
            />
          </Fragment>
        ))}
      </div>
      <FieldError id="invoice-no-parts-error">{error}</FieldError>
    </div>
  )
}

export default function DocumentStep({ invoice, banks, numbering, numberLocked, disabled }) {
  const { form, errors, setField, setFields } = invoice
  const document = form.document
  // E-way bill makes Distance and Delivery Mode required (portalRequiredFields) - never on a Challan.
  const portalRequired = portalRequiredFields(portalSettingsOf(form), 'document')
  const profile = documentProfile(form)
  // The last document of this type (invoice/last-document-number/'s document_no), beside the label - while it is a new one.
  const lastDocumentNo = !numberLocked ? (numbering.lastDocumentNo ?? '') : ''
  const numberLabel = lastDocumentNo ? (
    <>
      {profile.number}
      <span className="ml-1.5 text-xs font-normal text-muted-foreground" data-testid="last-document-no">
        (Last: {lastDocumentNo})
      </span>
    </>
  ) : (
    profile.number
  )
  const set = (field) => (value) => setField(`document.${field}`, value)
  const onText = (field, transform = (value) => value) => (event) => set(field)(transform(event.target.value))

  /** Text and date boxes - one line each instead of a dozen near-identical blocks. */
  const textField = (field, label, { transform, ...props } = {}) => (
    <Field
      id={`document-${field}`}
      label={label}
      value={document[field]}
      error={errors[`document.${field}`]}
      disabled={disabled}
      onChange={onText(field, transform)}
      {...props}
    />
  )
  const dateField = (field, label, props = {}) => textField(field, label, { type: 'date', ...props })

  /**
   * A bank brings its own payment QR (bankDetails' `payment_qr`), or none -
   * whatever was in Payment QR before is replaced, so another bank's QR is
   * never left behind. It can still be removed or replaced by an upload.
   */
  const chooseBank = (bankId) => {
    if (!bankId || bankId === document.bankId) return
    const bank = banks.list.find((entry) => String(entry.id) === String(bankId)) ?? null
    setFields('document', { bankId, paymentQr: paymentQrOfBank(bank) })
  }

  /**
   * Another Supply chosen: its Supply Type starts on that Supply's default
   * (DEFAULT_SUPPLY_TYPE_OF - Outward: Supply Regular, Inward: Import), which
   * can then be changed. Only on the user's own change - a saved document
   * loads with the values it was saved with.
   */
  const changeSupply = (supply) => {
    if (!supply || supply === document.supply) return
    const fallback = supplyTypesOf(supply).some((option) => option.value === document.supplyType) ? document.supplyType : ''
    setFields('document', { supply, supplyType: DEFAULT_SUPPLY_TYPE_OF[supply] ?? fallback })
  }

  const bankPlaceholder =
    banks.status === 'loading' || banks.status === 'idle'
      ? 'Loading banks...'
      : banks.options.length === 0
        ? 'No banks yet - add one in Bank Details'
        : 'Select Bank'

  /* ---- every field, written once; each type shows its own (profile.fields) ---- */
  const numberField = document.autoIncrement ? (
    <InvoiceNumberParts
      className={WIDE_FIELD}
      label={numberLabel}
      parts={document.invoiceNoParts}
      error={errors['document.invoiceNoParts']}
      disabled={disabled || numberLocked}
      onChange={set('invoiceNoParts')}
    />
  ) : (
    textField('invoiceNo', numberLabel, {
      required: true,
      maxLength: INVOICE_NO_MAX_LENGTH,
      disabled: disabled || numberLocked,
    })
  )
  const DATE_FIELDS = new Set(['referenceDate', 'poDate', 'deliveryNoteDate', 'lrDate', 'challanInvoiceDate'])
  const upper = { inputClassName: 'uppercase', transform: (value) => value.toUpperCase() }

  /** One Document Details field by its form key, under the type's label. */
  const fieldFor = (key, label, extra = {}) => {
    switch (key) {
      case 'transportReason':
        return (
          <SelectField
            key={key}
            id="document-transportReason"
            label={label}
            placeholder="Select Reason"
            options={TRANSPORT_REASONS}
            value={document.transportReason}
            disabled={disabled}
            onValueChange={set('transportReason')}
          />
        )
      case 'transporterId':
        return <Fragment key={key}>{textField(key, label, upper)}</Fragment>
      case 'vehicleNo':
        return <Fragment key={key}>{textField(key, label, { ...upper, placeholder: 'GJ01AB1234' })}</Fragment>
      case 'distance':
        // The pin, inside the box on its right, opens the GST portal's distance
        // page in a new tab (Get Distance) - the value is still typed here.
        return (
          <Fragment key={key}>
            {textField(key, label, {
              required: portalRequired.has('distance'),
              inputMode: 'decimal',
              placeholder: '0',
              transform: toDecimalInput,
              children: (
                <Tooltip text="Get Distance">
                  <a
                    href={GET_DISTANCE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Get Distance"
                    data-testid="get-distance"
                    className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md text-brand-light transition-colors outline-none hover:text-brand focus-visible:text-brand"
                  >
                    <MapPin className="size-4" aria-hidden="true" />
                  </a>
                </Tooltip>
              ),
            })}
          </Fragment>
        )
      case 'deliveryMode':
        return (
          <SelectField
            key={key}
            id="document-deliveryMode"
            label={label}
            required={portalRequired.has('deliveryMode')}
            placeholder="Select Delivery Mode"
            options={DELIVERY_MODES}
            value={document.deliveryMode}
            error={errors['document.deliveryMode']}
            disabled={disabled}
            onValueChange={set('deliveryMode')}
          />
        )
      case 'challanType':
        return (
          <SelectField
            key={key}
            id="document-challanType"
            label={label}
            placeholder={`Select ${label}`}
            options={CHALLAN_TYPES}
            value={document.challanType}
            disabled={disabled}
            onValueChange={(value) => value && set('challanType')(value)}
          />
        )
      case 'supply':
        return (
          <SelectField
            key={key}
            id="document-supply"
            label={label}
            options={SUPPLY_OPTIONS}
            value={document.supply}
            disabled={disabled}
            onValueChange={changeSupply}
          />
        )
      case 'supplyType':
        return (
          <SelectField
            key={key}
            id="document-supplyType"
            label={label}
            required
            placeholder="Select Supply Type"
            options={supplyTypesOf(document.supply)}
            value={document.supplyType}
            error={errors['document.supplyType']}
            disabled={disabled}
            onValueChange={set('supplyType')}
          />
        )
      case 'bankId':
        return (
          <Fragment key={key}>
            <SelectField
              id="document-bankId"
              label={label}
              placeholder={bankPlaceholder}
              options={banks.options}
              value={document.bankId}
              disabled={disabled || banks.options.length === 0}
              onValueChange={chooseBank}
            />
            {banks.status === 'failed' ? (
              <div className={FULL_FIELD}>
                <InlineAlert action={<RetryButton onClick={banks.retry} />}>
                  {banks.error || 'The bank accounts could not be loaded.'}
                </InlineAlert>
              </div>
            ) : null}
          </Fragment>
        )
      case 'paymentQr':
        return (
          <FileField
            key={key}
            id="document-paymentQr"
            label={label}
            accept="image/*"
            value={document.paymentQr}
            disabled={disabled}
            onChange={set('paymentQr')}
          />
        )
      default:
        return <Fragment key={key}>{(DATE_FIELDS.has(key) ? dateField : textField)(key, label, extra)}</Fragment>
    }
  }

  return (
    <InvoiceCard
      title="Document Details"
      actions={
        <CheckboxField
          id="document-auto-increment"
          label="Auto Increment"
          checked={document.autoIncrement}
          disabled={disabled || numberLocked || numbering.switching}
          onCheckedChange={(on) => numbering.setAutoIncrement(on === true)}
        />
      }
    >
      {/* The number is only ever filled in, never forced: while it is on its
          way, or if it could not be had, it can still be typed. */}
      {numbering.switching ? (
        <p role="status" className="mb-2 text-xs text-muted-foreground">
          Saving Auto Increment...
        </p>
      ) : null}
      {!numberLocked && numbering.status === 'loading' ? (
        <p role="status" className="mb-2 text-xs text-muted-foreground">
          Reading the last document number...
        </p>
      ) : null}
      {!numberLocked && numbering.status === 'failed' ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          The last document number could not be read - type the number, or try again.
          <RetryButton onClick={numbering.retry} />
        </div>
      ) : null}

      {/* The number and date, then this type's own fields, in its order. */}
      <InvoiceGrid>
        {numberField}
        {dateField('invoiceDate', profile.date, { required: true })}
        {/* Sales Invoice / Credit Note / Debit Note without E-Way Bill: only some (visibleDocumentFields) - the rest keep their values. */}
        {visibleDocumentFields(form).map(([key, label, extra]) => fieldFor(key, label, extra))}
      </InvoiceGrid>
    </InvoiceCard>
  )
}

