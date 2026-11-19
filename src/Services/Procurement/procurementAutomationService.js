/**
 * PROCUREMENT AUTOMATION - every URL of the module (company side).
 *
 * Not to be confused with Services/Procurement/procurementService, which is a Sales Order's
 * request for quotation.
 *
 * The products and vendors a bid is made of are the Product API's and the
 * vendor master's (Services/Inventory/inventoryService - getProducts, getVendors).
 *
 *   POST   procurement/auction_create/   { company_id }  -> the list
 *          -> { "Ongoing Auction": [...], "Upcoming Auction": [...], "Completed Auction": [...] }
 *   POST   procurement/auction_create/   multipart: company_id, master, product (JSON text), file*
 *   PUT    procurement/auction_create/   { id, auction_no, product (JSON text, the FULL list) }
 *   DELETE procurement/auction_create/   { auction_cancel: true, auction_no, id }
 *
 *   POST   procurement/pre_bid_create/   { company_id }  -> the list ("... Pre Bid" keys)
 *   POST   procurement/pre_bid_create/   multipart: as an auction, plus technical_bid
 *   PUT    procurement/pre_bid_create/   { id, auction_no, product: [...], technical_bid }
 *   DELETE procurement/pre_bid_create/   { pre_bid_cancel: true, auction_no, id }
 *
 *   POST   procurement/pre_bid_certificate_verify/   PLACEHOLDER - see CERTIFICATE_VERIFY_URL
 *          { pre_bid_id, pre_bid_no, vendor_email, "<certificate_name>": true }
 *
 *   POST   procurement/pre_bid_chat/     { pre_bid_id }  -> { "<vendor email>": [message] }
 *   POST   procurement/pre_bid_chat/     { pre_bid_id, vendor_email, send_by, send_to, message }
 *   WS     ws/pre_bid_chat/<pre_bid_id>/?token=<access token>   (see preBidChatSocketUrl)
 *   WS     ws/auction_bid/<auction_id>/?token=<access token>    a bid's live updates (auctionBidSocketUrl):
 *          { type: "connected", auction_id }, then { type: "bid_update", auction_id, auction_no,
 *          closing_date, closing_time, products: [the changed products, each with all its vendors] }
 *
 * A body holding only company_id is a list, anything more is a create - so a
 * list call never sends another key. Nothing here shows a message: a failure is
 * an Error carrying the backend's text (Services/Global/apiService).
 */

import { ENV } from '@/Config/env'
import { EVENT_KINDS } from '@/Constants/procurementAutomation'
import { api } from '@/Services/Global/apiService'
import { getAccessToken } from '@/Services/Auth/tokenService'
import { MULTIPART } from '@/Services/Global/apiHelpers'

const PRE_BID_CHAT_URL = 'procurement/pre_bid_chat/'

/*
 * PLACEHOLDER ENDPOINT - the backend has no certificate verify API yet
 * (checked 2026-11-18). Replace this URL (and the method below, if it differs)
 * with the real one when the backend finalises it; nothing else needs to change.
 */
const CERTIFICATE_VERIFY_URL = 'procurement/pre_bid_certificate_verify/'

// Named so axios sends the FormData as it is - see Services/Company/bankService.

const urlOf = (kind) => EVENT_KINDS[kind].url

export const getEvents = (kind, companyId) => api.post(urlOf(kind), { company_id: companyId })

/** `body` is the FormData built by buildCreateBody (Modules/Procurement/procurement). */
export const createEvent = (kind, body) => api.post(urlOf(kind), body, MULTIPART)

/** `body` is buildUpdateBody's. */
export const updateEvent = (kind, body) => api.put(urlOf(kind), body)

export const cancelEvent = (kind, { id, auctionNo, companyId }) =>
  api.delete(urlOf(kind), {
    data: { [EVENT_KINDS[kind].cancelKey]: true, auction_no: auctionNo, id, company_id: companyId },
  })

/**
 * Marks one of a vendor's certificates verified for one pre bid. The
 * certificate is named by its `certificate_name` exactly as the vendor's
 * profile spells it ("ISO-9365"), set to true:
 *   { pre_bid_id: 12, pre_bid_no: "PB-01", vendor_email: "a@v.in", "ISO-9365": true }
 */
const VERIFY_RESERVED = new Set(['pre_bid_id', 'pre_bid_no', 'vendor_email'])
export const verifyCertificate = ({ preBidId, preBidNo, vendorEmail, certificateName }) => {
  if (!certificateName || VERIFY_RESERVED.has(certificateName)) {
    return Promise.reject(new Error('This certificate has no name that can be verified.'))
  }
  return api.post(CERTIFICATE_VERIFY_URL, {
    pre_bid_id: preBidId,
    pre_bid_no: preBidNo,
    vendor_email: vendorEmail,
    [certificateName]: true,
  })
}

export const getPreBidChats = (preBidId) => api.post(PRE_BID_CHAT_URL, { pre_bid_id: preBidId })

/** The company side always writes as "user", to the vendor of the thread. */
export const sendPreBidChat = ({ preBidId, vendorEmail, message }) =>
  api.post(PRE_BID_CHAT_URL, {
    pre_bid_id: preBidId,
    vendor_email: vendorEmail,
    send_by: 'user',
    send_to: 'vendor',
    message,
  })

/** The live socket of one pre bid's chat, or null when there is no socket base URL or no session. */
export const preBidChatSocketUrl = (preBidId) => {
  const token = getAccessToken()
  if (!ENV.WS_BASE_URL || !token || preBidId === null || preBidId === undefined) return null
  return `${ENV.WS_BASE_URL}ws/pre_bid_chat/${encodeURIComponent(preBidId)}/?token=${encodeURIComponent(token)}`
}

/** The company's live socket of one bid's bids, or null without a socket base URL or a login. */
export const auctionBidSocketUrl = (auctionId) => {
  const token = getAccessToken()
  if (!ENV.WS_BASE_URL || !token || auctionId === null || auctionId === undefined) return null
  return `${ENV.WS_BASE_URL}ws/auction_bid/${encodeURIComponent(auctionId)}/?token=${encodeURIComponent(token)}`
}
