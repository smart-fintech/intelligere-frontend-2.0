import { useEffect, useState } from 'react'

/**
 * An image for the invoice sheet as a data URL - null until it is read, or
 * when there is none. It is either
 *
 *   a File          picked by the user - read from the disk
 *   { url }         a file already on the server (a bank's payment QR,
 *                   paymentQrOfBank) - fetched and read; if the server does
 *                   not allow that (CORS), the link itself is used, which
 *                   the sheet can still show
 *
 * With { linked: true } (the company's saved logo and signature -
 * sellerFromCompany) a file already on the server is given as its own link
 * (the full URL the backend sends), nothing fetched or converted: the sheet's
 * <img> loads it, and the PDF reads it once when one is made (invoicePdf).
 * A picked File is still read from the disk.
 *
 * A data URL rather than a blob: URL because the PDF engine's browser
 * renderer serialises each sheet into an SVG foreignObject, and an image
 * inside one cannot load anything from outside it - a data URL travels with
 * the markup.
 */
const readAsDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

/**
 * The same, once and without a component: a File, { url } or a plain URL as a
 * data URL - the link itself when the server allows no read (CORS), null for
 * nothing. `linked`: a server file as its link, unread (see above).
 */
export const readFileDataUrl = async (file, { linked = false } = {}) => {
  if (!file) return null
  if (file instanceof Blob) return readAsDataUrl(file).catch(() => null)
  const url = typeof file === 'string' ? file : file.url
  if (!url) return null
  if (linked) return url
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await readAsDataUrl(await response.blob())
  } catch {
    return url
  }
}

export default function useFileDataUrl(file, { linked = false } = {}) {
  const [read, setRead] = useState({ file: null, url: null })
  // A server file shown from its own link (see above) - nothing to read.
  const link = linked && file && !(file instanceof Blob) ? file.url || null : null

  useEffect(() => {
    if (!file || link) return undefined
    let alive = true
    const done = (url) => {
      if (alive) setRead({ file, url })
    }

    if (file instanceof Blob) {
      readAsDataUrl(file).then(done, () => done(null))
    } else if (file.url) {
      fetch(file.url)
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.blob()
        })
        .then(readAsDataUrl)
        .then(done, () => done(file.url))
    }
    return () => {
      alive = false
    }
  }, [file, link])

  if (link) return link
  // A result for an earlier file (or after the file was removed) is not this one's.
  return file && read.file === file ? read.url : null
}
