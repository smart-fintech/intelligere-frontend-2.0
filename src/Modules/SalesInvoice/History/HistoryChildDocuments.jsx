import { CornerDownRight, Eye, Link2 } from 'lucide-react'

import { Button } from '@/Components/ui/button'
import { useSkuManagement } from '@/Hooks/useMasterDetails'
import { cn } from '@/Library/utils'
import { SkuCode } from '@/Modules/SalesInvoice/Components/RequestQuotation'
import { formatIndianCurrency } from '@/Utils/currency'

/**
 * One product line's columns - Product Name, SKU Code, HSN/SAC, GST (%), Rate,
 * Amount, CGST (%), CGST Amount, SGST (%), SGST Amount - the SAME template for
 * the headings, every line and the totals, so they always line up (as
 * HistoryProductRows does). Below its floors it scrolls sideways in its own box.
 */
const GRID =
  'grid min-w-[64rem] grid-cols-[minmax(10rem,2.2fr)_minmax(7rem,1fr)_minmax(6rem,1fr)_minmax(4.5rem,0.6fr)_minmax(6.5rem,1fr)_minmax(7rem,1.1fr)_minmax(4.5rem,0.6fr)_minmax(6.5rem,1fr)_minmax(4.5rem,0.6fr)_minmax(6.5rem,1fr)] gap-x-3'
// The same without SKU Code - a company that does not manage SKUs (useSkuManagement).
const GRID_NO_SKU =
  'grid min-w-[57rem] grid-cols-[minmax(10rem,2.2fr)_minmax(6rem,1fr)_minmax(4.5rem,0.6fr)_minmax(6.5rem,1fr)_minmax(7rem,1.1fr)_minmax(4.5rem,0.6fr)_minmax(6.5rem,1fr)_minmax(4.5rem,0.6fr)_minmax(6.5rem,1fr)] gap-x-3'
const CELL = 'min-w-0 [overflow-wrap:anywhere]'
const HEADINGS = [
  ['Product Name'],
  ['SKU Code'],
  ['HSN/SAC'],
  ['GST (%)', true],
  ['Rate', true],
  ['Amount', true],
  ['CGST (%)', true],
  ['CGST Amount', true],
  ['SGST (%)', true],
  ['SGST Amount', true],
]

// 0 is a value - only a missing one is "--".
const rupees = (paise) => (paise === null ? '--' : formatIndianCurrency(paise / 100))
const rate = (value) => (value === null ? '--' : String(Number(value.toFixed(2))))

/**
 * The documents made from an opened History row (readChildDocuments - its
 * child_documents, whatever types they are), under its own products: each in
 * a bordered card of its own, headed by its document number (its type and
 * date beside it), with its Product Details - its own lines only - and a
 * Total row adding up their Amount, CGST Amount and SGST Amount. A SKU code
 * shows its sku_details on hover - SKU Code only for a company that manages
 * SKUs. A Challan also shows its Challan Type and Vehicle No. ("--" for none)
 * and a View PDF (its own doc_pdf, in the history's PDF viewer). Nothing when
 * it has none.
 *
 *   documents    readChildDocuments(...)
 *   documentNo   the parent's number, for the region's name
 *   onViewPdf(row)   opens a linked document's PDF (its readHistoryRow)
 */
export default function HistoryChildDocuments({ documents, documentNo, onViewPdf }) {
  const showSku = useSkuManagement()
  if (documents.length === 0) return null
  const grid = showSku ? GRID : GRID_NO_SKU
  const headings = showSku ? HEADINGS : HEADINGS.filter(([heading]) => heading !== 'SKU Code')
  return (
    <div className="space-y-2 border-t border-border px-3 py-3" role="region" aria-label={`Documents linked to ${documentNo || 'the document'}`} data-testid="history-children">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        <Link2 className="size-3.5" aria-hidden="true" />
        Linked documents ({documents.length})
      </p>
      {documents.map((document) => (
        <section
          key={document.key}
          className="overflow-hidden rounded-md border border-l-4 border-border border-l-brand/60 bg-card shadow-xs"
          aria-label={`${document.documentType || 'Document'} ${document.documentNo}`}
          data-testid="history-child"
        >
          <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-brand-soft/60 px-3 py-2">
            <CornerDownRight className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
            <h4 className="text-sm font-semibold break-all text-brand" data-testid="history-child-no">
              {document.documentNo || 'Document'}
            </h4>
            {document.documentType ? (
              <span className="rounded-full border border-brand/30 bg-card px-2 py-0.5 text-[11px] font-medium text-brand">{document.documentType}</span>
            ) : null}
            {document.documentDate ? <span className="text-xs text-muted-foreground">{document.documentDate}</span> : null}
            {document.documentType === 'Challan' && onViewPdf ? (
              <Button
                type="button"
                variant="iconEdit"
                size="icon-sm"
                icon={Eye}
                className="ml-auto"
                tooltip="View PDF"
                aria-label={`View PDF of ${document.documentNo || 'the Challan'}`}
                onClick={() => onViewPdf(document.row)}
              />
            ) : null}
          </header>
          {document.documentType === 'Challan' ? (
            <dl className="flex flex-wrap gap-x-6 gap-y-1 border-b border-border px-3 py-1.5 text-xs" data-testid="history-child-challan">
              <div className="flex gap-1">
                <dt className="text-muted-foreground">Challan Type:</dt>
                <dd className="font-medium text-foreground">{document.challanType || '--'}</dd>
              </div>
              <div className="flex gap-1">
                <dt className="text-muted-foreground">Vehicle No.:</dt>
                <dd className="font-medium text-foreground">{document.vehicleNo || '--'}</dd>
              </div>
            </dl>
          ) : null}
          <div className="px-3 py-2">
            <p className="pb-1 text-xs font-semibold text-foreground">Product Details</p>
            {document.products.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">No product details are saved for this document.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className={cn(grid, 'border-b border-border pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase')}>
                  {headings.map(([heading, right]) => (
                    <span key={heading} className={cn(CELL, right && 'text-right')}>
                      {heading}
                    </span>
                  ))}
                </div>
                {document.products.map((line, index) => (
                  <div key={line.key} className={cn(grid, 'items-start py-1.5 text-xs text-foreground', index > 0 && 'border-t border-border/60')} data-testid="history-child-line">
                    <span className={cn(CELL, 'font-medium')}>{line.name || '--'}</span>
                    {showSku ? (
                      <span className={CELL}>
                        <SkuCode code={line.skuCode} details={line.skuDetails} />
                      </span>
                    ) : null}
                    <span className={CELL}>{line.hsn || '--'}</span>
                    <span className={cn(CELL, 'text-right tabular-nums')}>{rate(line.gstRate)}</span>
                    <span className={cn(CELL, 'text-right tabular-nums')}>{rupees(line.ratePaise)}</span>
                    <span className={cn(CELL, 'text-right tabular-nums')}>{rupees(line.amountPaise)}</span>
                    <span className={cn(CELL, 'text-right tabular-nums')}>{rate(line.cgstRate)}</span>
                    <span className={cn(CELL, 'text-right tabular-nums')}>{rupees(line.cgstPaise)}</span>
                    <span className={cn(CELL, 'text-right tabular-nums')}>{rate(line.sgstRate)}</span>
                    <span className={cn(CELL, 'text-right tabular-nums')}>{rupees(line.sgstPaise)}</span>
                  </div>
                ))}
                <div className={cn(grid, 'items-start border-t-2 border-border bg-muted/50 py-1.5 text-xs font-semibold text-foreground')} data-testid="history-child-total">
                  <span className={CELL}>Total</span>
                  {showSku ? <span /> : null}
                  <span />
                  <span />
                  <span />
                  <span className={cn(CELL, 'text-right tabular-nums')}>{rupees(document.totals.amountPaise)}</span>
                  <span />
                  <span className={cn(CELL, 'text-right tabular-nums')}>{rupees(document.totals.cgstPaise)}</span>
                  <span />
                  <span className={cn(CELL, 'text-right tabular-nums')}>{rupees(document.totals.sgstPaise)}</span>
                </div>
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  )
}
