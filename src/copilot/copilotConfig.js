/**
 * Every backend address the Copilot uses, built in ONE place.
 *
 * The paths are the backend's own routes (Ai_Copilot/urls.py, mounted at
 * copilot/ in config/urls.py), unchanged. They are joined onto
 * ENV.API_BASE_URL - VITE_API_END_POINT in .env - so local, stage and
 * production differ only in .env, never in this folder.
 *
 * The keys are the names of the constants the original Copilot script
 * (legacy/main.js) reads. The Django template used to print them with
 * {% url %}; buildCopilotDocument now defines them from this table.
 *
 * Not here on purpose:
 *   COPILOT_ROUTES has no ai_companies: that endpoint returns one fixed
 *   user's companies. The Copilot gets the signed-in user's companies from
 *   the app instead (see CopilotLauncher).
 */

import { ENV } from '@/Config/env'

export const COPILOT_BASE_PATH = 'copilot/'

/**
 * The object the app puts on its own window while the Copilot frame is
 * mounted: { fetch, close }. The Copilot page reaches it as window.parent[...].
 */
export const COPILOT_HOST_GLOBAL = '__INTELLIGERE_COPILOT_HOST__'

export const COPILOT_ROUTES = Object.freeze({
  QUERY_URL: 'ai_query/',
  SEARCH_URL: 'ai_search_ledger/',
  DETAIL_URL: 'ai_ledger_detail/',
  AGING_URL: 'ai_ledger_aging/',
  TRANSACTIONS_URL: 'ai_ledger_transactions/',
  ORDER_QUERY_URL: 'ai_order_query/',
  BANK_QUERY_URL: 'ai_bank_query/',
  INVOICE_TAX_QUERY_URL: 'ai_invoice_tax_query/',
  INVENTORY_QUERY_URL: 'ai_inventory_query/',
  EXPORT_PDF_URL: 'ai_export_pdf/',
  INTERPRET_URL: 'ai_interpret/',
  REPORT_CC_URL: 'ai_report_customer_collection/',
  REPORT_SP_URL: 'ai_report_supplier_payment/',
  REPORT_SM_URL: 'ai_report_slow_moving/',
  REPORT_VD_URL: 'ai_report_vendor_delivery/',
  REPORT_IC_URL: 'ai_report_immediate_collection/',
  REPORT_HV_URL: 'ai_report_high_value_overdue/',
  REPORT_ST_URL: 'ai_report_stock_transfer/',
  REPORT_PT_URL: 'ai_report_purchase_timing/',
  REPORT_PO_URL: 'ai_report_open_po/',
  REPORT_SA_URL: 'ai_report_supplier_allocation/',
  FORECAST_URL: 'ai_forecast/',
  USAGE_RECORD_URL: 'ai_usage_record/',
  USAGE_LIST_URL: 'ai_usage_list/',
})

/** Where every Copilot API lives: <VITE_API_END_POINT>copilot/ */
export const getCopilotApiRoot = () => `${ENV.API_BASE_URL}${COPILOT_BASE_PATH}`

/** { QUERY_URL: 'http://.../copilot/ai_query/', ... } for the current environment. */
export const getCopilotUrls = () => {
  const root = getCopilotApiRoot()
  return Object.fromEntries(
    Object.entries(COPILOT_ROUTES).map(([name, route]) => [name, `${root}${route}`]),
  )
}

/**
 * The app's company records, in the shape the Copilot's dropdown reads:
 * { id, name }, `id` being the companydata id the Copilot APIs take as
 * company_id (tally/user-companies-list/ calls it company_id).
 */
export const toCopilotCompanies = (companies = []) =>
  companies
    .filter((company) => company && company.company_id != null)
    .map((company) => ({
      id: company.company_id,
      name: company.comp_name || `Company #${company.company_id}`,
    }))
