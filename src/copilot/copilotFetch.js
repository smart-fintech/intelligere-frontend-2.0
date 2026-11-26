/**
 * fetch() for the Copilot page, answered by the app's own axios instance.
 *
 * main.js was written against fetch(): it reads res.ok, res.status,
 * res.headers.get(), res.json() and res.blob() (the PDF export). The iframe's
 * fetch wrapper (see buildCopilotDocument) hands every Copilot API call here,
 * and this sends it with `apiSetup` from Services/Global/apiService - so the
 * Authorization header, the activecompanyid header for Gold Tally users and
 * the timeout are exactly the ones every other screen uses, written once in
 * the project. The reply is then given back as a real Response.
 *
 * Non-2xx replies are handed back too (validateStatus), as fetch does: the
 * Copilot reads its own 400/404 bodies. A request that never got an answer
 * rejects with a TypeError, again like fetch.
 */

import { apiSetup } from '@/Services/Global/apiService'

// Statuses a Response may not carry a body for.
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304])

const toPlainHeaders = (headers) => {
  const plain = {}
  if (!headers) return plain
  new Headers(headers).forEach((value, key) => {
    plain[key] = value
  })
  return plain
}

const responseHeaders = (axiosHeaders) => {
  const headers = new Headers()
  const raw = typeof axiosHeaders?.toJSON === 'function' ? axiosHeaders.toJSON() : axiosHeaders || {}
  Object.entries(raw).forEach(([key, value]) => {
    if (typeof value === 'string') headers.set(key, value)
  })
  return headers
}

export const copilotFetch = async (url, init = {}) => {
  let reply
  try {
    reply = await apiSetup.request({
      url,
      method: init.method || 'GET',
      data: init.body,
      headers: toPlainHeaders(init.headers),
      responseType: 'blob',
      validateStatus: () => true,
      // A Copilot reply is never a sign-in.
      skipSession: true,
    })
  } catch (error) {
    throw new TypeError(error?.message || 'Failed to fetch', { cause: error })
  }

  const { status } = reply
  return new Response(NULL_BODY_STATUSES.has(status) ? null : reply.data, {
    status,
    statusText: reply.statusText || '',
    headers: responseHeaders(reply.headers),
  })
}
