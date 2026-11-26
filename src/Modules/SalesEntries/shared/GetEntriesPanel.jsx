import { useState } from 'react'
import { Download, FileSpreadsheet, X } from 'lucide-react'

import { ConfirmDialog } from '@/Components/Common/ConfirmDialog'
import { CsvUploadButton } from '@/Components/Common/CsvUploadButton'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'
import { SALES_ENTRIES_UPLOAD_ACCEPT, SALES_ENTRIES_UPLOAD_MAX_MB } from '@/Constants/salesEntries'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { plural } from '@/Modules/SalesEntries/shared/ledgerLists'
import { downloadTextFile } from '@/Utils/fileDownload'

/**
 * "Get Entries" - the same card in every view: one tile per place the
 * entries can come from. "From a file" (Download Format, Upload File - CSV or Excel, a line on
 * the format) is always there; a view adds its own tiles as `children`, each
 * an <EntrySource> - Multi Ledger's Tally and GST portal.
 *
 * Every upload REPLACES what was uploaded before, so when entries are already
 * there it asks first. `upload(file)` is the view's request; on success the
 * view's `onUploaded()` starts it on batch 1 again.
 *
 * Props: format { file, content }, upload, onUploaded, total, disabled, hint, replaces
 *
 * Sales Entries' selection card (optional, B2B / CNDN leave them out):
 *   picker      the workflow choices (WorkflowPicker): with it the card is laid
 *               out as the old screen - the choices on the left, the ways to
 *               get entries stacked on the right
 *   showFile    false leaves the "From a file" tile out (Fetch from GSTR-1 is
 *               the source); default true
 *   hidden      the whole card steps aside once entries are in (useGetEntriesCard) -
 *               kept mounted, so a GST portal sign-in under way goes on
 *   onClose     given while the card was brought back over entries already
 *               shown: "Back to the entries" in its header
 */

/** One place entries come from: a heading, a line on what it gives, its buttons. */
export function EntrySource({ icon: Icon, title, description, children }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-start gap-2">
        {Icon ? <Icon className="mt-0.5 size-4 shrink-0 text-brand" /> : null}
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2">{children}</div>
    </section>
  )
}

export default function GetEntriesPanel({
  format,
  upload,
  onUploaded,
  total,
  disabled,
  hint,
  replaces,
  picker,
  showFile = true,
  hidden = false,
  onClose,
  children,
}) {
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState(null)

  const run = async (file) => {
    setPendingFile(null)
    setUploading(true)
    try {
      await upload(file)
      toast.success('Sales entries uploaded.')
      onUploaded()
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      setUploading(false)
    }
  }

  const choose = (file) => (total > 0 ? setPendingFile(file) : run(file))

  const fileSource = showFile ? (
    <EntrySource icon={FileSpreadsheet} title={picker ? 'Intelligere Format' : 'From a file'} description={hint}>
      <Button type="button" variant="outline" size="sm" icon={Download} onClick={() => downloadTextFile(format.file, format.content)}>
        Download Format
      </Button>
      <CsvUploadButton
        size="sm"
        accept={SALES_ENTRIES_UPLOAD_ACCEPT}
        maxSizeMb={SALES_ENTRIES_UPLOAD_MAX_MB}
        loading={uploading}
        disabled={uploading || disabled}
        onInvalid={(why) => toast.error(why.startsWith('Please choose') ? 'Unsupported file format. Please upload a CSV, XLSX or XLS file.' : why)}
        onFileSelect={choose}
      >
        Upload File
      </CsvUploadButton>
    </EntrySource>
  ) : null

  return (
    <Panel
      title="Get Entries"
      className={cn(picker && 'mx-auto w-full max-w-5xl', hidden && 'hidden')}
      actions={
        onClose ? (
          <Button type="button" variant="ghost" size="sm" icon={X} onClick={onClose}>
            Back to the entries
          </Button>
        ) : null
      }
    >
      {picker ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          {picker}
          <div className="flex flex-col gap-3 lg:border-l lg:border-border lg:pl-4">
            {fileSource}
            {children}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]">
          {fileSource}
          {children}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingFile)}
        onOpenChange={() => setPendingFile(null)}
        title="Replace the entries?"
        description={`Uploading replaces ${replaces} (${plural(total, 'entry', 'entries')} now). Entries already sent stay in Tally.`}
        confirmLabel="Upload"
        variant="default"
        busy={uploading}
        onConfirm={() => run(pendingFile)}
      />
    </Panel>
  )
}
