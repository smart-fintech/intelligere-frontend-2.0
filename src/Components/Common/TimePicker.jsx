import { useLayoutEffect, useRef, useState } from 'react'
import { Clock } from 'lucide-react'

import { FieldError, FieldLabel } from '@/Components/Common/FormFields'
import { Popover, PopoverContent, PopoverTrigger } from '@/Components/ui/popover'
import {
  HOURS_12,
  PERIODS,
  formatTime,
  from12Hour,
  isOnStep,
  minuteSteps,
  nowRoundedUp,
  parseTime,
  roundUpToStep,
  showTime12,
  to12Hour,
} from '@/Library/timeOfDay'
import { cn } from '@/Library/utils'

/**
 * Choosing a time of day - the app's own picker, used instead of the browser's
 * time box so every screen gets the same list on every browser.
 *
 *   <TimePicker id="bid-start-time" label="Start Time" step={15} required
 *     value="16:45" error={errors.time} onChange={(time, { dayShift }) => ...} />
 *
 * The box shows the time on a 12-hour clock ("04:45 PM"); a click opens three
 * columns - Hour 1 to 12, Minute in `step`s (15 -> 00 15 30 45), AM / PM.
 * Each column is a plain list: it starts at its first option and ends at its
 * last, and neither scrolling nor the arrow keys wrap round to the other end.
 * Picking any of them sets the time at once; the box stays open for the next
 * column until Escape, Tab out or a click elsewhere.
 *
 *   value      "HH:MM" (24-hour), or '' - the text the API stores
 *   onChange   (time, { dayShift }) - always an on-step "HH:MM". dayShift is 1
 *              when a value was rounded up past midnight (23:50 -> 00:00), so
 *              a date beside it can move to the next day; otherwise 0.
 *   step       minutes between choices (a divisor of 60; default 1)
 *
 * Nothing chosen yet: the lists open at the time now rounded UP to the next
 * step (4:27 -> 4:30), and a pick fills the other parts from there. A value
 * between two steps (an old saved 4:27) is shown as it is; on opening, the
 * lists sit at its next step, and closing the box sets that step (timeOfDay's
 * roundUpToStep - it never rounds down).
 *
 *   id, label, required, error, disabled, placeholder, className, aria-label
 *
 * With no `label` there is no <label>; pass an aria-label (or label it from
 * outside with htmlFor={id}). The error message is `${id}-error`, as in
 * FormFields.
 */
export function TimePicker({
  id,
  label,
  value = '',
  onChange,
  step = 1,
  required = false,
  error,
  disabled = false,
  placeholder = '--:-- --',
  className,
  'aria-label': ariaLabel,
}) {
  const [open, setOpen] = useState(false)
  const time = parseTime(value)
  const shown = showTime12(value)

  // Where the lists stand: the value's own step, or the next step from now when there is none.
  const start = time ? roundUpToStep(value, step) : nowRoundedUp(step)
  const at = parseTime(start.time)
  const draft = { ...to12Hour(at.hours), minute: at.minutes }
  const chosen = time !== null

  const pick = (change) => {
    const next = { ...draft, ...change }
    onChange?.(formatTime(from12Hour(next.hour12, next.period), next.minute), { dayShift: 0 })
  }

  const handleOpenChange = (next) => {
    setOpen(next)
    // Closing on an off-step value (an old 4:27) sets its next step.
    if (!next && time && !isOnStep(value, step)) {
      const rounded = roundUpToStep(value, step)
      onChange?.(rounded.time, { dayShift: rounded.dayShift })
    }
  }

  const errorId = error && id ? `${id}-error` : undefined

  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <FieldLabel htmlFor={id} required={required}>
          {label}
        </FieldLabel>
      ) : null}

      {/* Modal: inside a dialog (whose scroll lock would swallow the wheel) the lists still scroll. */}
      <Popover modal open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            aria-label={ariaLabel ? `${ariaLabel}, ${shown || 'not set'}` : undefined}
            aria-invalid={Boolean(error) || undefined}
            aria-required={required || undefined}
            aria-describedby={errorId}
            data-value={value}
            className={cn(
              'flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-1 text-left text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30',
              'focus-visible:border-ring focus-visible:ring-ring/50',
              'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
            )}
          >
            <span className={cn('tabular-nums', !shown && 'text-muted-foreground')}>{shown || placeholder}</span>
            <Clock aria-hidden="true" className="size-4 shrink-0 text-brand" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-1.5" aria-label={ariaLabel || label || 'Time'}>
          <div className="flex gap-1">
            <TimeColumn
              label="Hour"
              options={HOURS_12}
              current={draft.hour12}
              chosen={chosen}
              show={(hour) => String(hour).padStart(2, '0')}
              onPick={(hour12) => pick({ hour12 })}
            />
            <TimeColumn
              label="Minute"
              options={minuteSteps(step)}
              current={draft.minute}
              chosen={chosen}
              show={(minute) => String(minute).padStart(2, '0')}
              onPick={(minute) => pick({ minute })}
            />
            <TimeColumn
              label="AM/PM"
              options={PERIODS}
              current={draft.period}
              chosen={chosen}
              show={(period) => period}
              onPick={(period) => pick({ period })}
            />
          </div>
        </PopoverContent>
      </Popover>

      <FieldError id={errorId}>{error}</FieldError>
    </div>
  )
}

/**
 * One column: a listbox of option buttons, the current one reachable by Tab.
 * Up / Down move one option and stop at either end (never wrapping); Home /
 * End jump to the ends; Left / Right move to the next column; Enter or Space
 * picks. `chosen` false marks the current option as only a suggestion.
 */
function TimeColumn({ label, options, current, chosen, show, onPick }) {
  const listRef = useRef(null)

  // Open with the current option in the middle of its list.
  useLayoutEffect(() => {
    const list = listRef.current
    const option = list?.querySelector('[data-current="true"]')
    if (list && option) list.scrollTop = option.offsetTop - (list.clientHeight - option.offsetHeight) / 2
  }, [])

  const focusOption = (index) => {
    const buttons = listRef.current?.querySelectorAll('[role="option"]')
    if (!buttons?.length) return
    buttons[Math.min(Math.max(index, 0), buttons.length - 1)].focus()
  }

  const handleKeyDown = (event) => {
    const buttons = [...(listRef.current?.querySelectorAll('[role="option"]') ?? [])]
    const index = buttons.indexOf(document.activeElement)
    const moves = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: buttons.length - 1 }
    if (event.key in moves) {
      event.preventDefault()
      focusOption(moves[event.key])
      return
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const columns = [...(listRef.current?.parentElement?.querySelectorAll('[role="listbox"]') ?? [])]
      const next = columns[columns.indexOf(listRef.current) + (event.key === 'ArrowRight' ? 1 : -1)]
      if (next) {
        event.preventDefault()
        next.querySelector('[tabindex="0"]')?.focus()
      }
    }
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className="max-h-56 w-14 space-y-0.5 overflow-y-auto overscroll-contain"
    >
      {options.map((option) => {
        const isCurrent = option === current
        return (
          <button
            key={option}
            type="button"
            role="option"
            aria-selected={chosen && isCurrent}
            data-current={isCurrent}
            tabIndex={isCurrent ? 0 : -1}
            onClick={() => onPick(option)}
            className={cn(
              'flex h-8 w-full items-center justify-center rounded-sm text-sm tabular-nums outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50',
              isCurrent && chosen && 'bg-primary font-medium text-primary-foreground hover:bg-primary/90',
              isCurrent && !chosen && 'ring-1 ring-border',
            )}
          >
            {show(option)}
          </button>
        )
      })}
    </div>
  )
}
