import { Link2, Plus, Trash2 } from 'lucide-react'

import { Field, TextareaField, fieldLabelClass } from '@/Components/Common/FormFields'
import { RichTextEditor } from '@/Components/Common/RichTextEditor'
import { TimePicker } from '@/Components/Common/TimePicker'
import { Button } from '@/Components/ui/button'
import { shiftInputDate } from '@/Library/timeOfDay'
import { TIME_STEP_MINUTES, emptyMeeting, technicalErrorKey } from '@/Modules/Procurement/procurement'

/**
 * A Pre Bid's technical bid, as the form edits it: the certifications vendors
 * must hold, the FAQs, the pre bid meeting (date, time, link) and a note (rich
 * text - HTML). Blank rows are dropped when it is saved (buildTechnicalBid), so
 * adding one and leaving it empty is harmless; so is a meeting left empty.
 *
 * `errors` is the form's flat error map; each box reads its own (technicalErrorKey).
 */

const NO_ERRORS = {}

/** Today as the date box writes it. */
const todayInput = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * The meeting's three boxes, each optional. The time goes in the same steps as
 * the bid's times; rounding it up past midnight moves the date on a day. A
 * date earlier than today is offered only when the meeting was saved with it.
 */
function MeetingFields({ meeting, saved, errors, disabled, onChange }) {
  const set = (field, next) => onChange({ ...meeting, [field]: next })
  const today = todayInput()
  const min = saved?.date && saved.date < today ? saved.date : today
  const filled = Boolean(meeting.date || meeting.time || meeting.link)

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className={fieldLabelClass}>Meeting Details</p>
        {filled ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-7 px-0"
            disabled={disabled}
            onClick={() => onChange(emptyMeeting())}
          >
            Clear meeting
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Optional</span>
        )}
      </div>
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-[10rem_9rem_minmax(0,1fr)]">
        <Field
          id="procurement-meeting-date"
          label="Meeting Date"
          type="date"
          min={min}
          value={meeting.date}
          error={errors[technicalErrorKey('meeting', 'date')]}
          disabled={disabled}
          onChange={(event) => set('date', event.target.value)}
        />
        <TimePicker
          id="procurement-meeting-time"
          label="Meeting Time"
          step={TIME_STEP_MINUTES}
          value={meeting.time}
          error={errors[technicalErrorKey('meeting', 'time')]}
          disabled={disabled}
          onChange={(time, { dayShift }) =>
            onChange({
              ...meeting,
              time,
              date: dayShift && meeting.date ? shiftInputDate(meeting.date, dayShift) : meeting.date,
            })
          }
        />
        <Field
          id="procurement-meeting-link"
          label="Meeting Link"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          icon={Link2}
          placeholder="https://meet.google.com/abc-defg-hij"
          value={meeting.link}
          error={errors[technicalErrorKey('meeting', 'link')]}
          disabled={disabled}
          onChange={(event) => set('link', event.target.value)}
          className="sm:col-span-2 lg:col-span-1"
        />
      </div>
    </div>
  )
}
export default function TechnicalBidFields({ value, errors = NO_ERRORS, onChange, disabled }) {
  const certifications = value.required_certifications
  const faqs = value.faqs

  const set = (field, next) => onChange({ ...value, [field]: next })

  return (
    <div className="space-y-3">
      {/* Certifications (short rows) in the narrower left column, FAQs beside them; stacked below lg. */}
      <div className="grid grid-cols-1 items-start gap-x-5 gap-y-3 lg:grid-cols-[2fr_3fr]">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className={fieldLabelClass}>Required Certifications</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={Plus}
              disabled={disabled}
              onClick={() => set('required_certifications', [...certifications, ''])}
            >
              Add Certification
            </Button>
          </div>
          {certifications.length === 0 ? (
            <p className="text-xs text-muted-foreground">No certification required.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {certifications.map((certification, index) => (
                <li key={index} className="flex items-start gap-2">
                  <Field
                    aria-label={`Certification ${index + 1}`}
                    placeholder="e.g. ISO 9001"
                    value={certification}
                    error={errors[technicalErrorKey('certification', index)]}
                    disabled={disabled}
                    onChange={(event) =>
                      set(
                        'required_certifications',
                        certifications.map((item, at) => (at === index ? event.target.value : item)),
                      )
                    }
                    className="min-w-0 flex-1"
                  />
                  <Button
                    type="button"
                    variant="iconDelete"
                    size="icon-sm"
                    icon={Trash2}
                    tooltip="Remove"
                    aria-label={`Remove certification ${index + 1}`}
                    disabled={disabled}
                    onClick={() =>
                      set(
                        'required_certifications',
                        certifications.filter((_, at) => at !== index),
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0 space-y-2 border-border lg:border-l lg:pl-5">
          <div className="flex items-center justify-between gap-2">
            <p className={fieldLabelClass}>FAQ</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={Plus}
              disabled={disabled}
              onClick={() => set('faqs', [...faqs, { question: '', answer: '' }])}
            >
              Add FAQ
            </Button>
          </div>
          {faqs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No FAQ added.</p>
          ) : (
            <ul className="space-y-2">
              {faqs.map((faq, index) => (
                <li key={index} className="rounded-md border border-border p-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-brand">FAQ {index + 1}</span>
                    <Button
                      type="button"
                      variant="iconDelete"
                      size="icon-sm"
                      icon={Trash2}
                      tooltip="Remove"
                      aria-label={`Remove FAQ ${index + 1}`}
                      disabled={disabled}
                      onClick={() =>
                        set(
                          'faqs',
                          faqs.filter((_, at) => at !== index),
                        )
                      }
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <Field
                      id={`procurement-faq-${index}-question`}
                      label="Question"
                      value={faq.question}
                      error={errors[technicalErrorKey('faq', index, 'question')]}
                      disabled={disabled}
                      onChange={(event) =>
                        set(
                          'faqs',
                          faqs.map((item, at) => (at === index ? { ...item, question: event.target.value } : item)),
                        )
                      }
                    />
                    <TextareaField
                      id={`procurement-faq-${index}-answer`}
                      label="Answer"
                      rows={2}
                      value={faq.answer}
                      error={errors[technicalErrorKey('faq', index, 'answer')]}
                      disabled={disabled}
                      onChange={(event) =>
                        set(
                          'faqs',
                          faqs.map((item, at) => (at === index ? { ...item, answer: event.target.value } : item)),
                        )
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <MeetingFields
        meeting={value.meeting ?? emptyMeeting()}
        saved={value.savedMeeting}
        errors={errors}
        disabled={disabled}
        onChange={(next) => set('meeting', next)}
      />

      <RichTextEditor
        id="procurement-note"
        label="Note"
        placeholder="Anything else vendors should know about this Technical Bid"
        value={value.note}
        disabled={disabled}
        onChange={(html) => set('note', html)}
      />
    </div>
  )
}
