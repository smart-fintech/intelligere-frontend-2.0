import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { Loader2 } from 'lucide-react'

import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { toast } from '@/Library/toast'
import { selectCompanyStatus } from '@/Store/Slices/companySlice'

import { COPILOT_HOST_GLOBAL, toCopilotCompanies } from './copilotConfig'
import { copilotFetch } from './copilotFetch'
// A 128 px copy of legacy/logo.png (298 KB) - the button is on every screen.
import copilotIconUrl from './assets/copilot-icon.png'

/**
 * The floating Intelligere Copilot button and the full-screen window it opens.
 *
 * Mounted once, by AppLayout, so it is on every signed-in screen and gone on
 * login and the vendor portal. The window is drawn OVER the current page -
 * the route is not changed - so closing it leaves the user exactly where
 * they were, page state and all.
 *
 * The Copilot itself is the original page (see buildCopilotDocument), shown
 * in an iframe. It is built on the first open only, and then kept: closing
 * hides it, so its chat and the module the user was in are still there the
 * next time.
 *
 * Companies: the user's own list from the store (tally/user-companies-list/,
 * loaded by AppLayout) - no request of its own. The Copilot opens on the
 * company active in the app; a pick made inside the Copilot stays inside the
 * Copilot. With no company there is nothing the Copilot could safely ask for
 * (its APIs fall back to another company's data without a company_id), so
 * the button stays disabled until the user has one.
 */
export default function CopilotLauncher() {
  const { allCompanies, activeCompanyId } = useActiveCompany()
  const companyStatus = useSelector(selectCompanyStatus)
  const companies = useMemo(() => toCopilotCompanies(allCompanies), [allCompanies])
  const hasCompanies = companies.length > 0

  const [open, setOpen] = useState(false)
  // The Copilot page's HTML; null until the first open.
  const [srcDoc, setSrcDoc] = useState(null)
  const [building, setBuilding] = useState(false)

  const iframeRef = useRef(null)
  const launcherRef = useRef(null)

  const closeCopilot = useCallback(() => setOpen(false), [])

  // After a close, focus goes back to the button that opened it. Done once the
  // button is on screen again, not in closeCopilot: the Copilot's own Close
  // button is clicked inside the frame, outside React's events, so the
  // re-render lands later than an event handler's would.
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (wasOpenRef.current && !open) launcherRef.current?.focus()
    wasOpenRef.current = open
  }, [open])

  // What the Copilot page calls on its parent: its API requests (sent with the
  // app's axios instance) and its Close button.
  useEffect(() => {
    window[COPILOT_HOST_GLOBAL] = { fetch: copilotFetch, close: closeCopilot }
    return () => {
      delete window[COPILOT_HOST_GLOBAL]
    }
  }, [closeCopilot])

  // Hands the current company list / active company to the Copilot page.
  // Safe to call at any time: before the page's scripts have run there is no
  // __copilotApplyHost yet, and the page then reads the values it was built
  // with (onLoad calls this again anyway).
  const syncCompanies = useCallback(() => {
    const frameWindow = iframeRef.current?.contentWindow
    if (typeof frameWindow?.__copilotApplyHost !== 'function') return
    frameWindow.__copilotApplyHost({ companies, defaultCompanyId: activeCompanyId })
  }, [companies, activeCompanyId])

  useEffect(() => {
    syncCompanies()
  }, [syncCompanies])

  // Escape closes it while the focus is on the app's side. Inside the frame,
  // Escape stays the Copilot's own (it closes its sidebar drawer).
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeCopilot()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, closeCopilot])

  const openCopilot = async () => {
    if (!hasCompanies) return
    setOpen(true)
    if (srcDoc || building) return

    setBuilding(true)
    try {
      // Loaded on demand: the Copilot's markup, CSS and script are a separate chunk.
      const { buildCopilotDocument } = await import('./buildCopilotDocument')
      setSrcDoc(buildCopilotDocument({ companies, defaultCompanyId: activeCompanyId }))
    } catch (error) {
      console.error('[Copilot] Could not be loaded:', error)
      toast.error('Could not load the Copilot. Please try again.')
      setOpen(false)
    } finally {
      setBuilding(false)
    }
  }

  const isOpen = open && hasCompanies
  const companiesLoading = companyStatus === 'idle' || companyStatus === 'loading'
  // Starts with "Ask" so the spoken name matches the visible "ASK".
  const launcherTitle = hasCompanies
    ? 'Ask Intelligere Copilot'
    : companiesLoading
      ? 'Ask Intelligere Copilot - loading your companies…'
      : 'Ask Intelligere Copilot - add a company to use it'

  return (
    <>
      {!isOpen && (
        // Neumorphic (soft UI): a soft gray gradient lit from the top-left - a
        // light shadow up-left, a darker one down-right, a thin inner rim
        // highlight. Hover lifts it a touch; pressing sinks it (the shadows
        // move inside). Hover/press only while enabled.
        <button
          ref={launcherRef}
          type="button"
          onClick={openCopilot}
          disabled={!hasCompanies}
          title={launcherTitle}
          aria-label={launcherTitle}
          className={[
            'group fixed right-4 bottom-24 z-40 flex size-14 flex-col items-center justify-center gap-1 rounded-full sm:right-6 sm:bottom-16 sm:size-16',
            'transition-[transform,box-shadow] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50',
            // light
            'border border-white/80 bg-[linear-gradient(145deg,#f8fafc,#dbe1e9)]',
            'shadow-[6px_6px_14px_rgba(148,163,184,0.45),-6px_-6px_14px_rgba(255,255,255,0.95),inset_1px_1px_1px_rgba(255,255,255,0.9),inset_-1px_-1px_2px_rgba(148,163,184,0.25)]',
            'enabled:hover:-translate-y-px enabled:hover:shadow-[8px_8px_18px_rgba(148,163,184,0.5),-7px_-7px_16px_rgba(255,255,255,1),inset_1px_1px_1px_rgba(255,255,255,0.9),inset_-1px_-1px_2px_rgba(148,163,184,0.25)]',
            'enabled:active:translate-y-0 enabled:active:scale-[0.97] enabled:active:shadow-[inset_4px_4px_8px_rgba(148,163,184,0.45),inset_-4px_-4px_8px_rgba(255,255,255,0.9)]',
            // dark
            'dark:border-white/[0.06] dark:bg-[linear-gradient(145deg,#1f2b3e,#111a29)]',
            'dark:shadow-[6px_6px_14px_rgba(0,0,0,0.55),-5px_-5px_12px_rgba(255,255,255,0.04),inset_1px_1px_1px_rgba(255,255,255,0.08),inset_-1px_-1px_2px_rgba(0,0,0,0.4)]',
            'dark:enabled:hover:shadow-[8px_8px_18px_rgba(0,0,0,0.6),-6px_-6px_14px_rgba(255,255,255,0.05),inset_1px_1px_1px_rgba(255,255,255,0.08),inset_-1px_-1px_2px_rgba(0,0,0,0.4)]',
            'dark:enabled:active:shadow-[inset_4px_4px_8px_rgba(0,0,0,0.55),inset_-3px_-3px_8px_rgba(255,255,255,0.05)]',
          ].join(' ')}
        >
          {/* Embossed label; pl- offsets the trailing letter-spacing so ASK sits centred. */}
          <span className="pl-[0.2em] text-[9px] leading-none font-bold tracking-[0.2em] text-slate-600 [text-shadow:0_1px_0_rgba(255,255,255,0.9)] sm:text-[10px] dark:text-slate-300 dark:[text-shadow:0_1px_0_rgba(0,0,0,0.6)]">
            ASK
          </span>
          {/* The logo's dark-blue end needs a faint halo on the dark surface. */}
          <img
            src={copilotIconUrl}
            alt=""
            draggable={false}
            className="h-[18px] w-7 object-contain sm:h-5 sm:w-8 dark:drop-shadow-[0_0_4px_rgba(255,255,255,0.35)]"
          />
        </button>
      )}

      {/* The window. Kept in the page once built (hidden when closed) so the
          Copilot keeps its state; `invisible` also takes it out of the tab
          order and the click path. z-[60]: above the app's dialogs (z-50). */}
      {hasCompanies && (srcDoc || building) && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Intelligere Copilot"
          aria-hidden={!isOpen}
          className={`fixed inset-0 z-[60] bg-white ${isOpen ? 'visible' : 'pointer-events-none invisible'}`}
        >
          {srcDoc ? (
            <iframe
              ref={iframeRef}
              title="Intelligere Copilot"
              srcDoc={srcDoc}
              onLoad={syncCompanies}
              className="block size-full border-0"
            />
          ) : (
            <div className="flex size-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              Loading Copilot…
            </div>
          )}
        </div>
      )}
    </>
  )
}
