import { useState } from 'react'
import { ExternalLink, Eye, FileText } from 'lucide-react'

import { ImagePreviewModal } from '@/Components/Common/ImagePreview'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { fileName } from '@/Modules/Procurement/procurement'
import { PdfFrame } from '@/Modules/SalesInvoice/History/HistoryPdfModal'

/**
 * A stored document (a URL), opened over the page rather than in a new tab:
 * an image in the image preview, a PDF in the browser's PDF viewer. Any other
 * file cannot be shown inside the page, so it is a link that opens it.
 *
 *   <DocumentButton url={url} title="GST Certificate" />
 *
 * With no `url` it says `emptyText` instead. `size` and `className` go to the
 * button (a table's Actions column uses `size="sm"`).
 */

const kindOf = (url) => {
  const extension = fileName(url).split('.').pop().toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(extension)) return 'image'
  if (extension === 'pdf') return 'pdf'
  return 'other'
}

export function DocumentButton({ url, title, emptyText = 'Not uploaded', size = 'xs', className }) {
  const [open, setOpen] = useState(false)

  if (!url) return <span className="text-xs text-muted-foreground italic">{emptyText}</span>

  const kind = kindOf(url)
  const name = fileName(url)

  if (kind === 'other') {
    return (
      <Button asChild variant="outline" size={size} title={name} className={className}>
        <a href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink />
          Open
        </a>
      </Button>
    )
  }

  return (
    <>
      <Button type="button" variant="outline" size={size} icon={Eye} title={name} className={className} onClick={() => setOpen(true)}>
        View
      </Button>
      {kind === 'image' ? (
        <ImagePreviewModal open={open} onOpenChange={setOpen} src={url} title={title || name} />
      ) : (
        <Modal
          open={open}
          onOpenChange={setOpen}
          size="xl"
          title={title || name}
          description={
            <span className="inline-flex items-center gap-1">
              <FileText className="size-3.5" />
              {name}
            </span>
          }
          autoFocus={false}
          footer={
            <Button asChild variant="outline">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                Open in New Tab
              </a>
            </Button>
          }
        >
          {open ? <PdfFrame key={url} url={url} title={title || name} /> : null}
        </Modal>
      )}
    </>
  )
}
