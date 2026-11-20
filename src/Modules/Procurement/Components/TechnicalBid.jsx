import { useId, useLayoutEffect, useRef, useState } from 'react'
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  MessageCircleQuestion,
  NotebookText,
  ShieldCheck,
  Video,
} from 'lucide-react'

import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { showTime12 } from '@/Library/timeOfDay'
import { cn } from '@/Library/utils'
import { fileName, readTechnicalDetails } from '@/Modules/Procurement/procurement'
import { richTextClass } from '@/Utils/richText'
import { orDash } from '@/Utils/display'

/**
 * A Pre Bid's technical bid, in blocks both sides share - the company's card
 * (EventCard) and details (EventDetailsModal), and the vendor's card
 * (VendorEventCard). What each shows is readTechnicalDetails' (procurement.js):
 *
 *   TechnicalBlock       one titled box (icon, title, count, an action on the right)
 *   CertificationBlock   the required certifications - every one the API lists
 *                        is required, as the form saved them
 *   FaqBlock             the FAQs, each question opening its answer; Expand all;
 *                        a page at a time when there are many, or View All
 *   MeetingBlock         the pre bid meeting's date, time and link in one strip
 *                        (the link opened safely)
 *   NoteBlock            the buyer's note (sanitised rich text), scrolling in its
 *                        box, with View Full Notes when it does not fit
 *   DocumentBlock        the event's files
 *   PreBidDetails        all of them laid out together under a pre bid's products
 *
 * Each block lays itself out by its own width (a container query), not the
 * window's, so the same block fits a narrow column of the card and a wide
 * modal. Nothing is shown that the API did not send.
 */

export function TechnicalBlock({ icon: Icon, title, count, action, className, bodyClassName, children }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={cn('min-w-0 overflow-hidden rounded-lg border border-border bg-card', className)}>
      <header className="flex min-h-10 items-center gap-2 border-b border-border bg-brand-soft/50 px-3 py-1.5">
        {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0 text-brand" /> : null}
        <h4 id={headingId} className="text-sm font-semibold whitespace-nowrap text-brand">
          {title}
        </h4>
        {count !== undefined ? (
          <span className="rounded-full bg-brand px-1.5 py-px text-[11px] leading-4 font-semibold text-brand-foreground tabular-nums">
            {count}
          </span>
        ) : null}
        {action ? <div className="ml-auto flex items-center gap-2">{action}</div> : null}
      </header>
      <div className={cn('@container p-3', bodyClassName)}>{children}</div>
    </section>
  )
}

function CertificationList({ names }) {
  return (
    // Badges side by side as far as they fit; a long name wraps inside its own badge.
    <ul className="flex flex-wrap gap-1.5">
      {names.map((name, index) => (
        <li
          key={`${index}-${name}`}
          className="flex max-w-full min-w-0 items-start gap-1.5 rounded-md border border-emerald-200 bg-emerald-50/60 px-2 py-1 text-sm dark:border-emerald-500/25 dark:bg-emerald-500/10"
        >
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="min-w-0 font-medium break-words text-foreground">{name}</span>
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------------ */
/* FAQs                                                               */
/* ------------------------------------------------------------------ */

/** FAQs shown a page at a time - more than this many get pages and View All. */
const FAQ_PAGE_SIZE = 3

/**
 * Which questions are open (all closed to begin with), the page shown, and
 * whether every question is listed (View All). With more than one question,
 * the block's action opens or closes them all.
 */
function useFaqs(faqs) {
  const [opened, setOpened] = useState(() => new Set())
  const [page, setPage] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const allOpen = faqs.length > 0 && faqs.every((_, index) => opened.has(index))
  const pages = Math.ceil(faqs.length / FAQ_PAGE_SIZE)
  const paged = pages > 1 && !showAll
  const current = Math.min(page, Math.max(0, pages - 1))
  const first = paged ? current * FAQ_PAGE_SIZE : 0
  const visible = paged ? faqs.slice(first, first + FAQ_PAGE_SIZE) : faqs
  return {
    opened,
    allOpen,
    pages,
    paged,
    page: current,
    first,
    visible,
    showAll,
    setPage,
    toggleShowAll: () => setShowAll((previous) => !previous),
    toggle: (index) =>
      setOpened((previous) => {
        const next = new Set(previous)
        if (next.has(index)) next.delete(index)
        else next.add(index)
        return next
      }),
    toggleAll: () => setOpened(allOpen ? new Set() : new Set(faqs.map((_, index) => index))),
  }
}

function FaqToggleAll({ state, count }) {
  if (count < 2) return null
  return (
    <Button type="button" variant="link" size="sm" className="h-7 px-0" onClick={state.toggleAll}>
      {state.allOpen ? 'Collapse all' : 'Expand all'}
    </Button>
  )
}

function FaqList({ state }) {
  const baseId = useId()
  return (
    <ol className="space-y-1.5">
      {state.visible.map((faq, offset) => {
        const index = state.first + offset
        const open = state.opened.has(index)
        const questionId = `${baseId}-q${index}`
        const answerId = `${baseId}-a${index}`
        return (
          <li key={index} className={cn('rounded-md border border-border bg-card', open && 'border-brand/30 bg-brand-soft/20')}>
            <h5>
              <button
                type="button"
                id={questionId}
                aria-expanded={open}
                aria-controls={answerId}
                onClick={() => state.toggle(index)}
                className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-foreground outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span className="mt-px shrink-0 rounded bg-brand-soft px-1.5 text-[11px] leading-5 font-semibold text-brand tabular-nums">
                  Q{index + 1}
                </span>
                <span className="min-w-0 flex-1 break-words">{orDash(faq.question)}</span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn('mt-0.5 size-4 shrink-0 text-brand-muted transition-transform', open && 'rotate-180 text-brand')}
                />
              </button>
            </h5>
            <div
              id={answerId}
              role="region"
              aria-labelledby={questionId}
              hidden={!open}
              className="border-t border-border/70 px-3 py-2 pl-11 text-sm leading-relaxed break-words whitespace-pre-line text-foreground/85"
            >
              {orDash(faq.answer)}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** The page numbers (‹ 1 2 ›) and View All - only when the FAQs do not fit one page. */
function FaqPager({ state }) {
  if (state.pages < 2) return null
  return (
    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
      {state.paged ? (
        <nav aria-label="FAQ pages" className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            icon={ChevronLeft}
            aria-label="Previous FAQs"
            disabled={state.page === 0}
            onClick={() => state.setPage(state.page - 1)}
          />
          {Array.from({ length: state.pages }, (_, page) => (
            <button
              key={page}
              type="button"
              aria-label={`FAQ page ${page + 1}`}
              aria-current={page === state.page ? 'page' : undefined}
              onClick={() => state.setPage(page)}
              className={cn(
                'size-7 rounded-md text-xs font-medium tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                page === state.page ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {page + 1}
            </button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            icon={ChevronRight}
            aria-label="Next FAQs"
            disabled={state.page === state.pages - 1}
            onClick={() => state.setPage(state.page + 1)}
          />
        </nav>
      ) : (
        <span />
      )}
      <Button type="button" variant="link" size="sm" className="h-7 px-0" aria-expanded={state.showAll} onClick={state.toggleShowAll}>
        {state.showAll ? 'Show Fewer FAQs' : 'View All FAQs'}
      </Button>
    </div>
  )
}

/** The FAQ block with its Expand all action and pages - one piece for every layout. */
export function FaqBlock({ faqs, className }) {
  const state = useFaqs(faqs)
  return (
    <TechnicalBlock
      icon={MessageCircleQuestion}
      title="FAQs"
      count={faqs.length}
      action={<FaqToggleAll state={state} count={faqs.length} />}
      className={className}
    >
      <FaqList state={state} />
      <FaqPager state={state} />
    </TechnicalBlock>
  )
}

export function CertificationBlock({ names, className }) {
  return (
    <TechnicalBlock icon={ShieldCheck} title="Required Certifications" count={names.length} className={className}>
      <CertificationList names={names} />
    </TechnicalBlock>
  )
}

/* ------------------------------------------------------------------ */
/* Notes                                                              */
/* ------------------------------------------------------------------ */

const noteClass = cn(richTextClass, 'leading-relaxed [&_li]:my-0.5 [&_p+p]:mt-2')

/**
 * The note scrolls inside its box. While there is more below, the bottom fades
 * and View Full Notes opens the whole note in a dialog.
 *
 * `fillClass` (PreBidDetails, the notes column beside the other details): the
 * text fills the height the column is given instead of capping itself at
 * 15rem. An invisible copy, capped at 15rem, keeps the column at least as tall
 * as a short note needs.
 */
function NoteView({ html, fillClass }) {
  const ref = useRef(null)
  const [overflowing, setOverflowing] = useState(false)
  const [atEnd, setAtEnd] = useState(false)
  const [full, setFull] = useState(false)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return undefined
    const measure = () => {
      setOverflowing(node.scrollHeight > node.clientHeight + 2)
      setAtEnd(node.scrollTop + node.clientHeight >= node.scrollHeight - 2)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    if (node.firstElementChild) observer.observe(node.firstElementChild)
    return () => observer.disconnect()
  }, [html])

  return (
    <>
      <div
        ref={ref}
        tabIndex={overflowing ? 0 : undefined}
        aria-label={overflowing ? 'Notes (scrollable)' : undefined}
        onScroll={(event) => {
          const node = event.currentTarget
          setAtEnd(node.scrollTop + node.clientHeight >= node.scrollHeight - 2)
        }}
        className={cn('max-h-60 overflow-y-auto p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/50', fillClass?.scroll)}
      >
        {/* readTechnicalBid has sanitised it (Utils/richText) - only the editor's formatting tags remain. */}
        <div className={noteClass} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      {fillClass ? (
        <div aria-hidden="true" className={cn('invisible max-h-60 overflow-hidden p-3', fillClass.sizer)}>
          <div className={noteClass} dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      ) : null}
      {overflowing ? (
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pt-8 pb-2.5 transition-opacity',
            atEnd ? 'bg-transparent' : 'bg-gradient-to-t from-card via-card/85 to-transparent',
          )}
        >
          <Button type="button" variant="outline" size="sm" className="pointer-events-auto h-7 shadow-xs" onClick={() => setFull(true)}>
            View Full Notes
          </Button>
        </div>
      ) : null}
      {full ? (
        <Modal
          open
          onOpenChange={() => setFull(false)}
          size="lg"
          title="Notes"
          footer={
            <Button type="button" variant="outline" onClick={() => setFull(false)}>
              Close
            </Button>
          }
        >
          <div className={cn(noteClass, 'pr-1 break-words')} dangerouslySetInnerHTML={{ __html: html }} />
        </Modal>
      ) : null}
    </>
  )
}

export function NoteBlock({ html, className, fillClass }) {
  return (
    <TechnicalBlock
      icon={NotebookText}
      title="Notes"
      className={cn(fillClass?.block, className)}
      bodyClassName={cn('relative p-0', fillClass?.body)}
    >
      <NoteView html={html} fillClass={fillClass} />
    </TechnicalBlock>
  )
}

/* ------------------------------------------------------------------ */
/* Documents                                                          */
/* ------------------------------------------------------------------ */

/** A file's kind from its name ("PDF"), or nothing. */
const extensionOf = (name) => {
  const match = /\.([a-z0-9]{1,5})$/i.exec(name)
  return match ? match[1].toUpperCase() : ''
}

function DocumentList({ urls }) {
  return (
    <ul className="grid gap-1.5 @md:grid-cols-2">
      {urls.map((url) => {
        const name = fileName(url)
        const kind = extensionOf(name)
        return (
          <li key={url} className="min-w-0">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              title={name}
              className="group flex min-w-0 items-center gap-2 rounded-md border border-input px-2.5 py-1.5 text-sm text-brand outline-none hover:border-brand/40 hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <FileText aria-hidden="true" className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{name}</span>
              {kind ? (
                <span className="shrink-0 rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground">{kind}</span>
              ) : null}
              <ExternalLink aria-hidden="true" className="size-3.5 shrink-0 opacity-60 group-hover:opacity-100" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}

export function DocumentBlock({ urls, className }) {
  return (
    <TechnicalBlock icon={FileText} title="Documents" count={urls.length} className={className}>
      <DocumentList urls={urls} />
    </TechnicalBlock>
  )
}

/* ------------------------------------------------------------------ */
/* Meeting                                                            */
/* ------------------------------------------------------------------ */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Mon, 23 Nov 2026" from the API's "23-11-2026" - or the text as it came when it is not a date. */
const longDay = (apiDate) => {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(apiDate)
  if (!match) return apiDate
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]))
  return `${WEEKDAYS[date.getDay()]}, ${match[1]} ${MONTHS[date.getMonth()]} ${match[3]}`
}

/** "Today", "Tomorrow", "In 5 days" or "Past" for the meeting's day - by calendar day, not by the hour. */
function meetingWhen(apiDate, at) {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(apiDate)
  if (!match) return null
  const day = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])).getTime()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((day - today.getTime()) / 86400000)
  if (days < 0 || (at !== null && at < Date.now())) return { label: 'Past', tone: 'muted' }
  if (days === 0) return { label: 'Today', tone: 'brand' }
  if (days === 1) return { label: 'Tomorrow', tone: 'brand' }
  return { label: `In ${days} days`, tone: 'brand' }
}

/** One part of the meeting strip: an icon, a small label and the value. */
function MeetingItem({ icon: Icon, label, className, children }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5 px-3 py-2', className)}>
      <Icon aria-hidden="true" className="size-4 shrink-0 text-brand" />
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] leading-4 font-medium text-brand-muted">{label}</dt>
        <dd className="min-w-0 text-sm font-medium text-foreground">{children}</dd>
      </div>
    </div>
  )
}

/** Copies the link; says "Copied" for a moment. Hidden where the browser has no clipboard. */
function CopyLinkButton({ href }) {
  const [copied, setCopied] = useState(false)
  if (typeof navigator === 'undefined' || !navigator.clipboard) return null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      icon={copied ? Check : Copy}
      tooltip={copied ? 'Copied' : 'Copy link'}
      aria-label={copied ? 'Link copied' : 'Copy meeting link'}
      className="size-7"
      onClick={copy}
    />
  )
}

/**
 * The meeting's date, time and link in one strip, divided like a row of
 * cells - each only when it was set; on a narrow box they stack. A link opens
 * in a new tab only when it is an http(s) address (meetingLink); anything else
 * saved there is shown as plain text, never as a link.
 */
function MeetingDetails({ meeting }) {
  const label = meeting.link && meeting.link.label !== meeting.link.host ? `Meeting Link · ${meeting.link.label}` : 'Meeting Link'
  return (
    <dl
      className={cn(
        'flex flex-col divide-y divide-border rounded-md border border-border bg-muted/20 @md:flex-row @md:divide-x @md:divide-y-0',
        meeting.linkText ? 'w-full' : '@md:w-fit',
      )}
    >
      {meeting.date ? (
        <MeetingItem icon={CalendarDays} label="Date" className="@md:shrink-0">
          <span className="whitespace-nowrap tabular-nums">{longDay(meeting.date)}</span>
        </MeetingItem>
      ) : null}
      {meeting.time ? (
        <MeetingItem icon={Clock} label="Time" className="@md:shrink-0">
          <span className="whitespace-nowrap tabular-nums">{showTime12(meeting.time) || meeting.time}</span>
        </MeetingItem>
      ) : null}
      {meeting.linkText ? (
        <MeetingItem icon={meeting.link ? Video : Link2} label={label} className="@md:flex-1">
          {meeting.link ? (
            <div className="flex min-w-0 items-center gap-1">
              <a
                href={meeting.link.href}
                target="_blank"
                rel="noopener noreferrer"
                title={meeting.link.href}
                className="min-w-0 flex-1 truncate font-normal text-brand underline-offset-2 hover:underline"
              >
                {meeting.link.href.replace(/^https?:\/\//, '')}
              </a>
              <CopyLinkButton href={meeting.link.href} />
              <Button asChild variant="outline" size="sm" className="h-7 shrink-0 px-2.5">
                <a href={meeting.link.href} target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                  Join
                  <span className="sr-only">the meeting (opens in a new tab)</span>
                </a>
              </Button>
            </div>
          ) : (
            <span className="block font-normal break-all text-muted-foreground">{meeting.linkText}</span>
          )}
        </MeetingItem>
      ) : null}
    </dl>
  )
}

export function MeetingBlock({ meeting, className }) {
  const when = meetingWhen(meeting.date, meeting.at)
  return (
    <TechnicalBlock
      icon={Video}
      title="Meeting Details"
      action={
        when ? (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-semibold',
              when.tone === 'brand' ? 'bg-brand-soft text-brand' : 'bg-muted text-muted-foreground',
            )}
          >
            {when.label}
          </span>
        ) : null
      }
      className={className}
    >
      <MeetingDetails meeting={meeting} />
    </TechnicalBlock>
  )
}

/* ------------------------------------------------------------------ */
/* The whole layout                                                   */
/* ------------------------------------------------------------------ */

/*
 * How the parts are laid out (PreBidDetails), by the width the details have
 * (the `details` container), not the window's:
 *
 *   wide (48rem and up), with notes and anything else:
 *     ┌ Certifications ┐┌ FAQs ───────────────┐┌ Notes ──────┐
 *     └────────────────┘│                     ││  scrolls in │
 *     ┌ Meeting: Date │ Time │ Link ───────────┐│  its column │
 *     └──────────────────────────────────────┘└─────────────┘
 *   The notes column is as tall as the left side - or as its own text, up
 *   to 15rem, when the left side is shorter - and a longer note scrolls
 *   inside it, so it never stretches the others.
 *
 *   Certifications are as wide as their badges (at most 45% of the row); with
 *   no FAQs the meeting moves up beside them; any part alone takes the whole
 *   row; without notes the left side takes the whole width.
 *
 *   narrow: everything stacks in the same order - Certifications, FAQs,
 *   Meeting, Notes (capped at 15rem, scrolling).
 */
const NOTES_BESIDE = {
  grid: '@3xl/details:grid-cols-[minmax(0,1fr)_minmax(17rem,32%)]',
  fill: {
    block: '@3xl/details:flex @3xl/details:flex-col',
    body: '@3xl/details:min-h-0 @3xl/details:flex-1',
    scroll: '@3xl/details:absolute @3xl/details:inset-0 @3xl/details:max-h-none',
    sizer: 'hidden @3xl/details:block',
  },
}

/**
 * A Pre Bid's details, under its products. A part with nothing in it is left
 * out and the others take its place; with nothing at all, `empty` is shown
 * (or nothing). `documents` adds the event's files below (the vendor's card).
 */
export function PreBidDetails({ event, documents = false, empty = null, className }) {
  const details = readTechnicalDetails(event)
  const files = documents && Array.isArray(event.file) ? event.file : []
  if (details.isEmpty && files.length === 0) return empty

  const hasCertifications = details.certifications.length > 0
  const hasFaqs = details.faqs.length > 0
  const hasMain = hasCertifications || hasFaqs || Boolean(details.meeting)
  const beside = hasMain && details.hasNote

  const certifications = hasCertifications ? (
    // As wide as its badges beside the FAQs or the meeting (from 36rem); alone in its row, or narrower, the whole row.
    <CertificationBlock
      names={details.certifications}
      className="min-w-[15rem] flex-[1_1_100%] @xl/details:max-w-[45%] @xl/details:flex-[0_1_auto] @xl/details:only:max-w-none @xl/details:only:flex-1"
    />
  ) : null
  // Beside the certifications (no FAQs) it shares their row; under the FAQs it is a plain full-width strip.
  const meeting = details.meeting ? (
    <MeetingBlock meeting={details.meeting} className={hasFaqs ? undefined : 'min-w-0 flex-[1_1_22rem]'} />
  ) : null

  return (
    <div className={cn('@container/details min-w-0 space-y-3', className)}>
      {hasMain || details.hasNote ? (
        <div className={cn('grid gap-3', beside && NOTES_BESIDE.grid)}>
          {hasMain ? (
            <div className="flex min-w-0 flex-col gap-3">
              {hasCertifications || hasFaqs || meeting ? (
                <div className="flex flex-wrap items-start gap-3">
                  {certifications}
                  {hasFaqs ? <FaqBlock faqs={details.faqs} className="flex-[1_1_18rem]" /> : meeting}
                </div>
              ) : null}
              {hasFaqs ? meeting : null}
            </div>
          ) : null}
          {details.hasNote ? <NoteBlock html={details.note} fillClass={beside ? NOTES_BESIDE.fill : undefined} /> : null}
        </div>
      ) : null}
      {files.length > 0 ? <DocumentBlock urls={files} /> : null}
      {details.isEmpty ? empty : null}
    </div>
  )
}

/** The whole technical bid - the company's details view, laid out as PreBidDetails. */
export function TechnicalBidView({ event }) {
  return (
    <PreBidDetails
      event={event}
      empty={<p className="text-sm text-muted-foreground">No technical details were added.</p>}
    />
  )
}
