/**
 * TIME OF DAY - the one place the app reads, steps, rounds and shows a time.
 *
 * A time is kept as the "HH:MM" text a time box writes (24-hour, "16:45") -
 * the same text the API stores. Everything here is plain functions with no
 * React, so a picker (Components/Common/TimePicker), a validation rule or a
 * payload builder all agree on it.
 *
 *   parseTime("4:27")              { hours: 4, minutes: 27, seconds: 0 }   (null if not a time)
 *   formatTime(16, 5)              "16:05"
 *   to12Hour(0)                    { hour12: 12, period: 'AM' }
 *   from12Hour(12, 'PM')           12
 *   showTime12("16:45")            "04:45 PM"
 *   minuteSteps(15)                [0, 15, 30, 45]
 *   isOnStep("04:30", 15)          true
 *   roundUpToStep("04:27", 15)     { time: "04:30", dayShift: 0 }
 *   roundUpToStep("23:50", 15)     { time: "00:00", dayShift: 1 }   (past midnight)
 *   nowRoundedUp(15)               the time now, rounded up the same way
 *   shiftInputDate("2026-11-30", 1) "2026-12-01"
 *
 * A step is whole minutes that divide the hour (1, 5, 10, 15, 30 ...).
 * Rounding only ever goes UP: an on-step time is kept, one between two steps
 * moves to the next step, and the last steps of the day roll over to 00:00 of
 * the next day (dayShift 1), never back to the start of the same day.
 */

/** The hours of a 12-hour clock, in the order a picker lists them: 1 to 12, once. */
export const HOURS_12 = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])

export const PERIODS = Object.freeze(['AM', 'PM'])

const MINUTES_PER_DAY = 24 * 60

const two = (number) => String(number).padStart(2, '0')

/** { hours, minutes, seconds } of an "H:MM", "HH:MM" or "HH:MM:SS" time, or null. */
export const parseTime = (value) => {
  const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(value ?? '').trim())
  if (!clock) return null
  const hours = Number(clock[1])
  const minutes = Number(clock[2])
  const seconds = Number(clock[3] ?? 0)
  if (hours > 23 || minutes > 59 || seconds > 59) return null
  return { hours, minutes, seconds }
}

/** "HH:MM" from 0-23 hours and 0-59 minutes. */
export const formatTime = (hours, minutes) => `${two(hours)}:${two(minutes)}`

/** A 24-hour hour as the 12-hour clock shows it: 0 -> 12 AM, 13 -> 1 PM. */
export const to12Hour = (hours) => ({ hour12: hours % 12 === 0 ? 12 : hours % 12, period: hours < 12 ? 'AM' : 'PM' })

/** Back to 24-hour: 12 AM -> 0, 12 PM -> 12, 1 PM -> 13. */
export const from12Hour = (hour12, period) => (hour12 % 12) + (period === 'PM' ? 12 : 0)

/** "04:45 PM" - or '' when there is no time. */
export const showTime12 = (value) => {
  const time = parseTime(value)
  if (!time) return ''
  const { hour12, period } = to12Hour(time.hours)
  return `${two(hour12)}:${two(time.minutes)} ${period}`
}

/** The minutes a step offers in an hour: 15 -> [0, 15, 30, 45]. A step that does not divide the hour falls back to 1. */
export const minuteSteps = (step = 1) => {
  const size = Number.isInteger(step) && step > 0 && 60 % step === 0 ? step : 1
  return Array.from({ length: 60 / size }, (_, index) => index * size)
}

/** True for a time exactly on a step (no seconds past it). */
export const isOnStep = (value, step = 1) => {
  const time = parseTime(value)
  return time !== null && time.minutes % step === 0 && time.seconds === 0
}

/**
 * The time moved UP to the next step (an on-step time is kept):
 * 4:01 -> 4:15, 4:27 -> 4:30, 4:59 -> 5:00, 11:56 -> 12:00, 23:50 -> 00:00 next day.
 * -> { time: "HH:MM", dayShift: 0 | 1 }, or null when the value is not a time.
 */
export const roundUpToStep = (value, step = 1) => {
  const time = parseTime(value)
  if (!time) return null
  const seconds = (time.hours * 60 + time.minutes) * 60 + time.seconds
  const rounded = Math.ceil(seconds / (step * 60)) * step
  const kept = rounded % MINUTES_PER_DAY
  return { time: formatTime(Math.floor(kept / 60), kept % 60), dayShift: rounded >= MINUTES_PER_DAY ? 1 : 0 }
}

/** The time now, rounded up to the next step - what a picker offers first when nothing is chosen. */
export const nowRoundedUp = (step = 1, now = new Date()) =>
  roundUpToStep(`${formatTime(now.getHours(), now.getMinutes())}:${two(now.getSeconds())}`, step)

/** A date as a date box writes it ("yyyy-mm-dd") moved by whole days; '' stays ''. */
export const shiftInputDate = (inputDate, days) => {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(inputDate ?? ''))
  if (!day) return String(inputDate ?? '')
  const next = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]) + days)
  return `${next.getFullYear()}-${two(next.getMonth() + 1)}-${two(next.getDate())}`
}
