import { useState } from 'react'
import { BadgeCheck, CheckCircle2, Eye, File, FileImage, FileText, FileX, ShieldCheck, XCircle } from 'lucide-react'

import { Button } from '@/Components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/Components/ui/table'
import { EVENT_KIND } from '@/Constants/procurementAutomation'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { DocumentButton } from '@/Modules/Procurement/Components/DocumentPreview'
import { ExpiryDate } from '@/Modules/Procurement/Components/VendorProfileModal'
import {
  VENDOR_PROFILE_SECTIONS,
  certificateStatus,
  isBlank,
  otherCertifications,
  readVendorProfile,
  requiredCertificationRows,
} from '@/Modules/Procurement/vendorProfile'
import { verifyCertificate } from '@/Services/Procurement/procurementAutomationService'
import { formatDate } from '@/Utils/date'

/**
 * One vendor's documents and certificates for one event, opened under its row
 * in the vendor list (ProductVendors' arrow button). Everything comes from that
 * row's `Profile` (vendorProfile) - nothing is fetched to show it:
 *
 *   Vendor Documents          GST Certificate, PAN Card, MSME Certificate (company_documents)
 *   Required Certifications   a table: each certification the pre bid's technical bid
 *                             asks for, with the vendor's certificate of that name - or
 *                             one merged "Missing" cell when it has none
 *   Other / Vendor Certifications   the vendor's other certificates, in the same table
 *
 * A certificate is Verified only when the reply says so (`certificate_verified:
 * true`). On a Pre Bid an unverified one has a Verify button: it calls
 * verifyCertificate, and on success `onVerified(certificateName)` marks it in
 * the list on screen (the row also shows it at once). A failed call leaves it
 * unverified and says why. A Bid has nothing to verify against, so it only
 * shows the status.
 */

const DOCUMENTS = VENDOR_PROFILE_SECTIONS.find((section) => section.key === 'company_documents').fields

const IMAGE = /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i
const PDF = /\.pdf(\?|#|$)/i

/** How a stored file is drawn: its icon and colours by its extension. */
const fileKind = (url) => {
  if (!url) return { icon: FileX, tone: 'bg-muted text-muted-foreground', label: 'Not uploaded' }
  if (PDF.test(url)) return { icon: FileText, tone: 'bg-destructive/10 text-destructive', label: 'PDF' }
  if (IMAGE.test(url)) return { icon: FileImage, tone: 'bg-brand-soft text-brand', label: 'Image' }
  return { icon: File, tone: 'bg-muted text-foreground', label: 'File' }
}

const BADGE_TONES = {
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  danger: 'bg-destructive/10 text-destructive',
  muted: 'bg-muted text-muted-foreground',
}

function Badge({ tone = 'muted', icon: Icon, children }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
        BADGE_TONES[tone],
      )}
    >
      {Icon ? <Icon className="size-3" /> : null}
      {children}
    </span>
  )
}

const isVerified = (certificate) => certificate?.certificate_verified === true

function DocumentItem({ field, url, number }) {
  const kind = fileKind(url)
  const Icon = kind.icon
  return (
    <li className="flex min-w-0 items-center gap-2.5 rounded-md border border-border bg-card px-2.5 py-2">
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', kind.tone)}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={field.label}>
          {field.label}
        </p>
        <p className="truncate text-xs text-muted-foreground" title={isBlank(number) ? undefined : String(number)}>
          {isBlank(number) ? 'No number given' : number}
        </p>
      </div>
      {url ? <DocumentButton url={url} title={field.label} /> : <Badge>Not uploaded</Badge>}
    </li>
  )
}

const orDash = (value) => (isBlank(value) ? <span className="text-muted-foreground">--</span> : String(value))
const showDate = (value) => (isBlank(value) ? orDash('') : formatDate(value))

/** The status cell: Verified (the reply's flag, or verified here just now) or Not verified. */
function StatusCell({ certificate, verifiedNow }) {
  if (isVerified(certificate) || verifiedNow) {
    return (
      <Badge tone="success" icon={BadgeCheck}>
        Verified
      </Badge>
    )
  }
  return <Badge>Not verified</Badge>
}

// Fixed widths, so View and Verify line up from row to row.
const VIEW_WIDTH = 'w-[4.75rem]'
const VERIFY_WIDTH = 'w-[5.25rem]'

/**
 * The actions cell: View opens the certificate's file (a greyed View when there
 * is none), and Verify - where it can be done - verifies it. Where Verify could
 * be done but is not needed (already verified), its place is kept empty so the
 * buttons stay aligned.
 */
function ActionsCell({ certificate, name, verifyColumn, verifiedNow, canVerify, pending, onVerify }) {
  const showVerify = canVerify && !isVerified(certificate) && !verifiedNow
  return (
    <div className="flex items-center justify-end gap-1.5">
      {certificate.certificate_image ? (
        <DocumentButton url={certificate.certificate_image} title={name} size="sm" className={VIEW_WIDTH} />
      ) : (
        <Button type="button" variant="outline" size="sm" icon={Eye} disabled aria-label={`View ${name} (no file)`} className={VIEW_WIDTH}>
          View
        </Button>
      )}
      {showVerify ? (
        <Button
          type="button"
          size="sm"
          icon={ShieldCheck}
          loading={pending}
          disabled={pending}
          aria-label={`Verify ${certificate.certificate_name}`}
          className={VERIFY_WIDTH}
          onClick={onVerify}
        >
          Verify
        </Button>
      ) : verifyColumn ? (
        <span aria-hidden="true" className={cn('shrink-0', VERIFY_WIDTH)} />
      ) : null}
    </div>
  )
}

const COLUMNS = 8

/**
 * Certificates in a table. `rows` are { name, certificate } - a null
 * certificate is a required one the vendor does not have (one merged cell).
 * `canVerify` says whether Verify can be done on this event at all (a
 * Technical Bid), so the Actions column keeps room for it.
 */
function CertificateTable({ label, rows, verify, canVerify }) {
  return (
    <Table containerClassName="rounded-md border border-border bg-card" aria-label={label}>
      <TableHeader className="bg-muted">
        <TableRow className="hover:bg-transparent">
          <TableHead>Certificate</TableHead>
          <TableHead>Number</TableHead>
          <TableHead>Issued By</TableHead>
          <TableHead>Scope</TableHead>
          <TableHead>Issued On</TableHead>
          <TableHead>Expires On</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ name, certificate }, index) =>
          certificate ? (
            <TableRow key={`${name}-${index}`}>
              <TableCell wrap className="font-medium">
                {name}
              </TableCell>
              <TableCell className="tabular-nums">{orDash(certificate.certificate_number)}</TableCell>
              <TableCell wrap>{orDash(certificate.issuing_organization)}</TableCell>
              <TableCell wrap>{orDash(certificate.scope)}</TableCell>
              <TableCell className="tabular-nums">{showDate(certificate.issuing_date)}</TableCell>
              <TableCell>
                <ExpiryDate value={certificate.expiry_date} />
              </TableCell>
              <TableCell>
                <StatusCell certificate={certificate} verifiedNow={verify(certificate).verifiedNow} />
              </TableCell>
              <TableCell className="text-right">
                <ActionsCell certificate={certificate} name={name} verifyColumn={canVerify} {...verify(certificate)} />
              </TableCell>
            </TableRow>
          ) : (
            <TableRow key={`${name}-${index}`} className="bg-destructive/[0.03]">
              <TableCell wrap className="font-medium">
                {name}
              </TableCell>
              <TableCell colSpan={COLUMNS - 1}>
                <span className="flex items-center gap-2">
                  <Badge tone="danger" icon={XCircle}>
                    Missing
                  </Badge>
                  <span className="text-xs text-muted-foreground">Not on the vendor&apos;s profile</span>
                </span>
              </TableCell>
            </TableRow>
          ),
        )}
      </TableBody>
    </Table>
  )
}

function Part({ title, meta, children }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <h5 className="text-xs font-semibold tracking-wide text-brand uppercase">{title}</h5>
        {meta ? <span className="text-xs text-muted-foreground">{meta}</span> : null}
      </div>
      {children}
    </div>
  )
}

function Empty({ children }) {
  return <p className="rounded-md border border-dashed border-border bg-card px-3 py-2 text-sm text-muted-foreground">{children}</p>
}

export default function VendorDocumentsPanel({ vendor, event, onVerified }) {
  // Certificates verified in this view, by name - shown at once, whatever the list does next.
  const [verifiedNow, setVerifiedNow] = useState(() => new Set())
  const [pending, setPending] = useState(() => new Set())

  const profile = readVendorProfile(vendor)
  const company = profile.company_information ?? {}
  const documents = profile.company_documents ?? {}
  const preBid = event?.kind === EVENT_KIND.PRE_BID
  const asksForCertifications = Array.isArray(event?.technical_bid?.required_certifications)
  const required = requiredCertificationRows(event, profile)
  const others = otherCertifications(event, profile).map((certificate, index) => ({
    name: certificate.certificate_name || `Certificate ${index + 1}`,
    certificate,
  }))

  const uploaded = DOCUMENTS.filter((field) => documents[field.key]).length
  const held = required.filter((row) => row.certificate).length
  const certificates = [...required.map((row) => row.certificate).filter(Boolean), ...others.map((row) => row.certificate)]
  const verifiedCount = certificates.filter((certificate) => isVerified(certificate) || verifiedNow.has(certificate.certificate_name)).length
  const lapsing = certificates.filter((certificate) => certificateStatus(certificate.expiry_date)).length
  const canVerify = preBid && !event?.cancelled

  const verify = async (certificate) => {
    const name = certificate.certificate_name
    if (pending.has(name)) return
    setPending((previous) => new Set(previous).add(name))
    try {
      const reply = await verifyCertificate({
        preBidId: event.id,
        preBidNo: event.Auction_no,
        vendorEmail: vendor.email,
        certificateName: name,
      })
      setVerifiedNow((previous) => new Set(previous).add(name))
      onVerified?.(name)
      toast.success(reply?.msg || `${name} verified.`)
    } catch (failure) {
      toast.error(failure?.message || `${name} could not be verified.`)
    } finally {
      setPending((previous) => {
        const next = new Set(previous)
        next.delete(name)
        return next
      })
    }
  }

  const verifyProps = (certificate) => ({
    verifiedNow: verifiedNow.has(certificate.certificate_name),
    canVerify: canVerify && !isBlank(certificate.certificate_name),
    pending: pending.has(certificate.certificate_name),
    onVerify: () => verify(certificate),
  })

  return (
    <section aria-label={`Documents and certifications of ${vendor?.name || vendor?.email || 'vendor'}`} className="space-y-3 border-l-2 border-brand/40 bg-brand-soft/20 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h4 className="text-sm font-semibold text-brand">Documents &amp; Certifications</h4>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={uploaded === DOCUMENTS.length ? 'success' : 'muted'}>
            Documents {uploaded}/{DOCUMENTS.length}
          </Badge>
          {required.length ? (
            <Badge tone={held === required.length ? 'success' : 'danger'} icon={held === required.length ? CheckCircle2 : XCircle}>
              Required {held}/{required.length} held
            </Badge>
          ) : null}
          {certificates.length ? (
            <Badge tone={verifiedCount === certificates.length ? 'success' : 'muted'} icon={BadgeCheck}>
              Verified {verifiedCount}/{certificates.length}
            </Badge>
          ) : null}
          {lapsing ? <Badge tone="danger">{lapsing} expired or expiring</Badge> : null}
        </div>
      </div>

      <Part title="Vendor Documents" meta={`${uploaded} of ${DOCUMENTS.length} uploaded`}>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {DOCUMENTS.map((field) => (
            <DocumentItem
              key={field.key}
              field={field}
              url={documents[field.key]}
              number={company[field.numberKey] ?? vendor?.[field.numberKey]}
            />
          ))}
        </ul>
      </Part>

      {preBid ? (
        <Part title="Required Certifications" meta={required.length ? `${held} of ${required.length} held` : null}>
          {required.length ? (
            <CertificateTable label="Required Certifications" rows={required} verify={verifyProps} canVerify={canVerify} />
          ) : (
            <Empty>
              {asksForCertifications
                ? 'This Technical Bid does not ask for any certification.'
                : 'This Technical Bid has no technical details, so it does not ask for specific certifications.'}
            </Empty>
          )}
        </Part>
      ) : null}

      {others.length || !required.length ? (
        <Part title={required.length ? 'Other Certifications' : 'Vendor Certifications'} meta={others.length ? `${others.length}` : null}>
          {others.length ? (
            <CertificateTable
              label={required.length ? 'Other Certifications' : 'Vendor Certifications'}
              rows={others}
              verify={verifyProps}
              canVerify={canVerify}
            />
          ) : (
            <Empty>No certifications on the profile.</Empty>
          )}
        </Part>
      ) : null}
    </section>
  )
}
