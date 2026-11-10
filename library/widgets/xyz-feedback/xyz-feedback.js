// <xyz-feedback>: a rating, with an optional comment, stored in a
// conduit. No dependencies or build step.
//
// An ES module. A browser loads modules only over http(s), not from a
// file:// page (the widgets' README says how to serve a folder).
//
//   <script type="module" src="./xyz-feedback.js"></script>
//   <xyz-feedback
//     conduit-url="https://run.conduits.xyz/<namespace>/<leaf>"
//     scale="5"
//     subject="checkout-flow"
//     caption="How did we do?"
//   ></xyz-feedback>
//
// `static configFields` below lists the attributes.
//
// `scale` is "5" (the default: stars, 1 to 5) or "10" (0 to 10, "how
// likely are you to recommend this?").
//
// `caption` is rendered by the widget and labels its <form>
// (aria-labelledby). It is a heading only when `heading-level` is set:
// only the host page knows its outline.
//
// Submits `POST {fields: {subject, rating, comment}}`
// (docs/gateway-api.md). `subject` and `comment` are optional. `rating`
// is the number chosen; the widget computes no score or aggregate.

// Per instance, so captions get unique ids on a page with several
// <xyz-feedback> elements.
let nextCaptionId = 0

// Escapes attribute-supplied text (caption, messages, button text)
// before it goes into innerHTML.
function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
}

// Errors are RFC 9457 Problem Details (docs/gateway-api.md#errors). A
// 429 and 503 ask the visitor to wait (too many requests here; the
// conduit's source is busy); another 4xx shows its detail (e.g. a
// missing sheet column); another 5xx or a network failure gets a generic
// message.
async function describeSubmitFailure(response) {
  if (response.status === 429) return 'Too many requests. Please wait a moment and try again.'
  if (response.status === 503) return 'The service is busy. Please try again in a minute.'
  if (response.status >= 400 && response.status < 500) {
    try {
      const problem = await response.json()
      const message = problem.detail || problem.title
      if (typeof message === 'string' && message) return message
    } catch {
      // Fall through to the generic message below.
    }
  }
  return 'Something went wrong. Please try again.'
}

class XyzFeedback extends HTMLElement {
  // The element's attributes, for a config UI (see xyz-waitlist.js).
  static configFields = [
    {
      attribute: 'conduit-url',
      label: 'Conduit',
      type: 'conduit-picker',
      default: null,
      requirement: 'required',
      description: 'Which conduit this widget submits ratings to.',
    },
    {
      attribute: 'scale',
      label: 'Rating scale',
      type: 'enum',
      default: '5',
      requirement: 'optional',
      options: [
        { value: '5', label: '5-star' },
        { value: '10', label: '10-point NPS' },
      ],
      description: 'Changes what the submitted rating means (1-5 vs 0-10) — behavioral, not just cosmetic.',
    },
    {
      attribute: 'subject',
      label: 'Subject',
      type: 'text',
      default: '',
      requirement: 'conditional',
      condition:
        'Needed when reusing one conduit across more than one embedding — without it, ratings from different embeddings are tallied together with no way to separate them after the fact.',
    },
    {
      attribute: 'caption',
      label: 'Caption',
      type: 'text',
      default: '',
      requirement: 'optional',
      description: "Optional label shown above the form; also becomes the form's accessible name.",
    },
    {
      attribute: 'heading-level',
      label: 'Caption heading level',
      type: 'number',
      default: null,
      requirement: 'conditional',
      condition: 'Only used when Caption is also set.',
    },
    {
      attribute: 'unconfigured-message',
      label: 'Not-connected message',
      type: 'text',
      default: 'Not connected to a conduit yet.',
      requirement: 'optional',
    },
    {
      attribute: 'success-message',
      label: 'Success message',
      type: 'text',
      default: 'Thanks for the feedback.',
      requirement: 'optional',
    },
    {
      attribute: 'button-text',
      label: 'Button label',
      type: 'text',
      default: 'Submit feedback',
      requirement: 'optional',
    },
  ]

  connectedCallback() {
    // Custom elements default to display: inline. Setting block here
    // keeps the layout from depending on style.css.
    this.style.display ||= 'block'
    this._status = 'idle' // 'idle' | 'pending' | 'success' | 'error'
    this._errorText = null
    this._captionId = `xyz-feedback-caption-${nextCaptionId++}`
    this._build()
  }

  get conduitUrl() {
    return this.getAttribute('conduit-url') || ''
  }

  get demo() {
    return this.hasAttribute('demo')
  }

  get subject() {
    return this.getAttribute('subject') || ''
  }

  // Any value but "10" gives the 5-point scale.
  get scale() {
    return this.getAttribute('scale') === '10' ? 10 : 5
  }

  get caption() {
    return this.getAttribute('caption') || ''
  }

  get headingLevel() {
    return this.getAttribute('heading-level') || ''
  }

  get unconfiguredMessage() {
    return this.getAttribute('unconfigured-message') || 'Not connected to a conduit yet.'
  }

  get successMessage() {
    return this.getAttribute('success-message') || 'Thanks for the feedback.'
  }

  get buttonText() {
    return this.getAttribute('button-text') || 'Submit feedback'
  }

  _renderCaption() {
    if (!this.caption) return ''
    const headingAttrs = this.headingLevel
      ? ` role="heading" aria-level="${escapeHtml(this.headingLevel)}"`
      : ''
    return `<p class="xyz-feedback-caption" id="${this._captionId}"${headingAttrs}>${escapeHtml(this.caption)}</p>`
  }

  // The Idempotency-Key for a submit of `body`: the same key while the
  // same body is sent again after a failure, so a retry creates one
  // record (docs/gateway-api.md, "Idempotency keys"); a new one for
  // another body or after a success.
  _idempotencyKey(body) {
    if (this._lastSubmit?.body !== body) this._lastSubmit = { body, key: crypto.randomUUID() }
    return this._lastSubmit.key
  }

  async _submit(event) {
    event.preventDefault()
    if (this.demo || this._status === 'pending') return

    const form = event.currentTarget
    const checked = form.querySelector('input[name="rating"]:checked')
    if (!checked) return
    const rating = Number(checked.value)
    const comment = form.elements.comment.value
    this._status = 'pending'
    this._errorText = null
    this._update()

    try {
      const body = JSON.stringify({ fields: { subject: this.subject, rating, comment } })
      const response = await fetch(this.conduitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': this._idempotencyKey(body) },
        body,
      })
      if (response.ok) {
        this._lastSubmit = null
        this._status = 'success'
        form.reset()
      } else {
        this._errorText = await describeSubmitFailure(response)
        this._status = 'error'
      }
    } catch {
      this._errorText = 'Something went wrong. Please try again.'
      this._status = 'error'
    }
    this._update()
  }

  _renderChoices() {
    const scale = this.scale
    const values = Array.from({ length: scale === 10 ? 11 : 5 }, (_, i) => (scale === 10 ? i : i + 1))

    const inputs = values
      .map(
        (value) => `
        <label class="xyz-feedback-choice">
          <input
            type="radio"
            name="rating"
            value="${value}"
            required
          />
          <span class="xyz-feedback-choice-label">${scale === 10 ? value : '★'.repeat(value)}</span>
        </label>`,
      )
      .join('')

    if (scale === 10) {
      return `
        <fieldset class="xyz-feedback-scale xyz-feedback-scale--nps">
          <legend class="xyz-feedback-scale-legend">How likely are you to recommend this, from 0 to 10?</legend>
          ${inputs}
        </fieldset>
        <div class="xyz-feedback-scale-endpoints">
          <span>Not likely</span>
          <span>Very likely</span>
        </div>
      `
    }

    return `
      <fieldset class="xyz-feedback-scale xyz-feedback-scale--stars">
        <legend class="xyz-feedback-scale-legend">Rate from 1 to 5 stars</legend>
        ${inputs}
      </fieldset>
    `
  }

  // Builds the markup once, when the element connects. A change of
  // status updates it in place (_update), so a keyboard user keeps
  // their place, and what they typed, after an error.
  _build() {
    // No conduit-url yet, or, on the demo page, not yet checked.
    if (!this.conduitUrl && !this.demo) {
      this.innerHTML = `
        <article class="xyz-feedback-widget">
          ${this._renderCaption()}
          <p class="xyz-feedback-status" data-state="idle">${escapeHtml(this.unconfiguredMessage)}</p>
        </article>
      `
      return
    }

    this.innerHTML = `
      <article class="xyz-feedback-widget">
        ${this._renderCaption()}
        <form class="xyz-feedback-form"${this.caption ? ` aria-labelledby="${this._captionId}"` : ''}>
          ${this._renderChoices()}
          <textarea
            name="comment"
            placeholder="Anything else? (optional)"
            rows="2"
            class="xyz-feedback-comment"
          ></textarea>
          <button type="submit" class="xyz-feedback-btn"></button>
          <p class="xyz-feedback-status" role="status" aria-live="polite"></p>
        </form>
      </article>
    `
    this.querySelector('form').addEventListener('submit', (event) => this._submit(event))
    this._update()
  }

  // The form's state: in demo mode the comment and the button are
  // disabled; while a rating is sent they only look it (read-only,
  // aria-disabled), since disabling the focused control would move the
  // focus off it. Then the button's label and the status line.
  _update() {
    const form = this.querySelector('form')
    if (!form) return
    const pending = this._status === 'pending'
    const comment = form.elements.comment
    const button = form.querySelector('button')
    comment.disabled = this.demo
    comment.readOnly = pending
    button.disabled = this.demo
    button.setAttribute('aria-disabled', String(pending))
    button.textContent = this.demo || pending ? 'Sending…' : this.buttonText
    const status = form.querySelector('.xyz-feedback-status')
    status.dataset.state = this.demo ? 'demo' : this._status
    status.textContent = this.demo ? 'Demo mode — submission disabled.' : this._status === 'success' ? this.successMessage : (this._errorText ?? '')
  }
}

customElements.define('xyz-feedback', XyzFeedback)
