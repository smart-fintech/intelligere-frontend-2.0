import { Download, Upload } from 'lucide-react'

import bankStatementFormatUrl from '@/Assets/format/BankStatementFormat.csv?url'

import { CsvUploadButton } from '@/Components/Common/CsvUploadButton'
import { CheckboxField, PasswordField, SelectField } from '@/Components/Common/FormFields'
import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { Button } from '@/Components/ui/button'
import { FILE_TYPE, FILE_TYPE_OPTIONS } from '@/Modules/BankStatement/bankStatementModel'

/**
 * The controls in the header of the statement card. Before the statement is
 * submitted: the file type (with AI PDF's Use Advance Modal tick beside it),
 * the file, the CSV format, the AI PDF password and Submit File. After it: View Statement / Mapping Ledger. These are toolbar
 * controls, so they use the compact `sm` size.
 */
export default function StatementFileBar({ statement, view, views, onViewChange }) {
  const { fileType, started } = statement

  if (started) {
    return <ViewSwitch options={views} value={view} onValueChange={onViewChange} label="Bank Statement view" idPrefix="bank-statement-view" />
  }

  if (!statement.bank) return null

  const busy = statement.uploading

  return (
    // From sm up the controls take the room beside the card's title and wrap
    // inside it, rather than all dropping below it; on a phone they get a line of their own.
    <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:min-w-0 sm:flex-1">
      {/* The file type, with AI PDF's own option beside it - kept together when the bar wraps. */}
      <div className="flex items-center gap-1.5">
        <SelectField
          id="bank-statement-file-type"
          ariaLabel="File Type"
          size="sm"
          className="w-36"
          value={fileType}
          onValueChange={statement.setFileType}
          disabled={busy}
          options={FILE_TYPE_OPTIONS}
        />

        {fileType === FILE_TYPE.AI_PDF ? (
          <CheckboxField
            id="bank-statement-advance-model"
            label="Use Advance Modal"
            className="h-8 shrink-0 rounded-md border border-brand/30 bg-brand/5 px-2.5"
            checked={statement.useAdvanceModel}
            onCheckedChange={statement.setUseAdvanceModel}
            disabled={busy}
          />
        ) : null}
      </div>

      {fileType === FILE_TYPE.CSV ? (
        <Button asChild variant="outline" size="sm">
          <a href={bankStatementFormatUrl} download="BankStatementCSVFormat.csv">
            <Download />
            Download Format
          </a>
        </Button>
      ) : null}

      {fileType !== FILE_TYPE.PDF ? (
        <CsvUploadButton
          size="sm"
          variant="outline"
          accept={fileType === FILE_TYPE.CSV ? '.csv' : '.pdf'}
          disabled={busy}
          onFileSelect={statement.setFile}
        >
          {statement.file ? 'Change File' : 'Select File'}
        </CsvUploadButton>
      ) : null}

      {fileType === FILE_TYPE.AI_PDF ? (
        <PasswordField
          id="bank-statement-pdf-password"
          aria-label="PDF Password"
          icon={null}
          className="w-40"
          inputClassName="h-8"
          placeholder="PDF Password"
          autoComplete="off"
          value={statement.password}
          onChange={(event) => statement.setPassword(event.target.value)}
          disabled={busy}
        />
      ) : null}

      {statement.file ? (
        <Button size="sm" icon={Upload} loading={busy} onClick={statement.submit}>
          Submit File
        </Button>
      ) : null}
    </div>
  )
}
